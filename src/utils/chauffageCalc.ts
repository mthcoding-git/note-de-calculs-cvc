import type { Segment, Point, FlowDirections, ChauffageParams } from '../types'
import { getDi_mm } from './flowCalc'
import { EMETTEUR_TYPES } from '../data/emetteurs'
import { TERMINAL_FROID_TYPES } from '../data/terminauxFroids'
import { computeCumDp } from './pdcCumul'

const RHO_CP = 1163 // Wh/(m³·K) ≈ ρ·cp eau à 50°C

/** Vrai si le nœud est un terminal thermique (émetteur chauffage ou terminal froid EG). */
const isTerminal = (pt: Point | undefined): boolean =>
  pt?.type === 'emetteur' || pt?.type === 'terminalFroid'

/** Vrai si le nœud est une production (chauffage ou eau glacée). */
const isProduction = (pt: Point | undefined): boolean =>
  pt?.type === 'productionChauffage' || pt?.type === 'productionEauGlacee'

export function emetteurFlowRate(puissanceW: number, dTPrimaire: number): number {
  if (dTPrimaire <= 0 || puissanceW <= 0) return 0
  return puissanceW / (RHO_CP * dTPrimaire)
}

function getSegLen(seg: Segment): number {
  if (seg.length_override != null) return seg.length_override
  const vs = seg.vertices
  let len = 0
  for (let i = 0; i < vs.length - 1; i++)
    len += Math.hypot(vs[i + 1].x - vs[i].x, vs[i + 1].y - vs[i].y)
  return len
}

function dijkstra(startId: string, segments: Segment[], type: string): Map<string, number> {
  const filtered = segments.filter(s => s.type === type)
  const dist = new Map<string, number>([[startId, 0]])
  const queue: [number, string][] = [[0, startId]]
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0])
    const [d, id] = queue.shift()!
    if (d > (dist.get(id) ?? Infinity)) continue
    for (const seg of filtered) {
      if (seg.startPointId !== id && seg.endPointId !== id) continue
      const nb = seg.startPointId === id ? seg.endPointId : seg.startPointId
      const nd = d + getSegLen(seg)
      if (nd < (dist.get(nb) ?? Infinity)) {
        dist.set(nb, nd)
        queue.push([nd, nb])
      }
    }
  }
  return dist
}

/** Directions d'écoulement depuis productionChauffage — même logique que computeFlowDirections ECS. */
export function computeFlowDirectionsChauffage(segments: Segment[], points: Point[]): FlowDirections {
  const root = points.find(p => isProduction(p))
  if (!root) return new Map()

  const distAller  = dijkstra(root.id, segments, 'aller')
  const distRetour = dijkstra(root.id, segments, 'retour')

  const result: FlowDirections = new Map()
  for (const seg of segments) {
    const distMap = seg.type === 'aller' ? distAller : distRetour
    const dStart  = distMap.get(seg.startPointId) ?? Infinity
    const dEnd    = distMap.get(seg.endPointId)   ?? Infinity

    // Tronçon retour avec au moins un endpoint non connecté au retour primaire :
    // les distances retour sont peu fiables → utiliser les distances aller à la place
    // (nœud plus loin de la production en aller = fromId du retour)
    if (seg.type === 'retour' && (!isFinite(dStart) || !isFinite(dEnd))) {
      const dStartA = distAller.get(seg.startPointId) ?? Infinity
      const dEndA   = distAller.get(seg.endPointId)   ?? Infinity
      if (dStartA >= dEndA) result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      else                  result.set(seg.id, { fromId: seg.endPointId,   toId: seg.startPointId })
      continue
    }

    if (!isFinite(dStart) && !isFinite(dEnd)) {
      result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      continue
    }

    if (seg.type === 'aller') {
      if (dStart <= dEnd) result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      else                result.set(seg.id, { fromId: seg.endPointId,   toId: seg.startPointId })
    } else {
      if (dStart >= dEnd) result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      else                result.set(seg.id, { fromId: seg.endPointId,   toId: seg.startPointId })
    }
  }

  // ── Post-traitement 1 : bypass direct (voisin immédiat de mélange avec ≥3 retours) ──
  //
  // Problème Dijkstra : le bypass retour (nœud_séparation → nœud_mélange) est mal
  // orienté car le nœud mélange est plus loin de la production que le nœud séparation
  // dans le graphe retour non-dirigé.
  for (const pt of points) {
    if (isTerminal(pt) || isProduction(pt) || pt.type === 'pump') continue

    const allerOut = segments.filter(s => s.type === 'aller' && result.get(s.id)?.fromId === pt.id).length
    const allerIn  = segments.filter(s => s.type === 'aller' && result.get(s.id)?.toId   === pt.id).length
    if (allerOut !== 1 || allerIn < 1) continue

    const retourAtNode = segments.filter(s =>
      s.type === 'retour' && (s.startPointId === pt.id || s.endPointId === pt.id)
    )
    for (const seg of retourAtNode) {
      const dir = result.get(seg.id)
      if (!dir || dir.fromId !== pt.id) continue
      const nRetourAtDest = segments.filter(s =>
        s.type === 'retour' && (s.startPointId === dir.toId || s.endPointId === dir.toId)
      ).length
      if (nRetourAtDest >= 3) result.set(seg.id, { fromId: dir.toId, toId: pt.id })
    }
  }

  // ── Post-traitement 2 : bypass multi-tronçons (chaîne séparation → … → mélange) ──
  //
  // Pour un bypass en plusieurs tronçons, les nœuds intermédiaires ont < 3 retours,
  // donc le post-traitement 1 ne les corrige pas. On utilise la même détection
  // géométrique que naming.ts (isBypassToMixing) : si un endpoint d'un tronçon retour
  // mène à mélange et l'autre à séparation, fd.fromId doit être du côté séparation.
  {
    const nRetourGeom = (ptId: string) => segments.filter(s =>
      s.type === 'retour' && (s.startPointId === ptId || s.endPointId === ptId)
    ).length
    const nAllerGeom  = (ptId: string) => segments.filter(s =>
      s.type === 'aller' && (s.startPointId === ptId || s.endPointId === ptId)
    ).length
    const isMixNode = (ptId: string) => nAllerGeom(ptId) >= 2 && nRetourGeom(ptId) >= 1
    const isSepNode = (ptId: string) => nRetourGeom(ptId) >= 3

    const traverseRetour = (startPtId: string, fromSegId: string): 'mixing' | 'separation' | 'none' => {
      const visitedSegs = new Set<string>([fromSegId])
      const visitedPts  = new Set<string>()
      const queue = [startPtId]
      while (queue.length > 0) {
        const ptId = queue.shift()!
        if (visitedPts.has(ptId)) continue
        visitedPts.add(ptId)
        if (isMixNode(ptId)) return 'mixing'
        if (isSepNode(ptId)) return 'separation'
        for (const s of segments) {
          if (s.type !== 'retour' || visitedSegs.has(s.id)) continue
          if (s.startPointId === ptId) { visitedSegs.add(s.id); queue.push(s.endPointId) }
          else if (s.endPointId === ptId) { visitedSegs.add(s.id); queue.push(s.startPointId) }
        }
      }
      return 'none'
    }

    for (const seg of segments) {
      if (seg.type !== 'retour') continue
      const fromStart = traverseRetour(seg.startPointId, seg.id)
      const fromEnd   = traverseRetour(seg.endPointId,   seg.id)
      // Le bon sens est : fromId = côté séparation, toId = côté mélange
      if (fromStart === 'mixing' && fromEnd === 'separation') {
        result.set(seg.id, { fromId: seg.endPointId, toId: seg.startPointId })
      } else if (fromEnd === 'mixing' && fromStart === 'separation') {
        result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      }
    }
  }

  return result
}

/** T_sortie effective d'un terminal (émetteur CH ou terminal froid EG). */
function terminalTSortie(pt: Point, T_prod: number): number {
  if (pt.T_sortie_emetteur != null) return pt.T_sortie_emetteur
  if (pt.type === 'terminalFroid') {
    const def = TERMINAL_FROID_TYPES.find(t => t.id === pt.terminalFroidType)
    return def?.T_sortieDefault ?? (T_prod + 5)
  }
  const emDef = EMETTEUR_TYPES.find(e => e.id === pt.emetteurType)
  return emDef?.T_sortieDefault ?? (T_prod - 20)
}

/** T_entrée effective d'un terminal (émetteur CH ou terminal froid EG). */
function terminalTEntree(pt: Point, T_prod: number): number {
  if (pt.T_entree_emetteur != null) return pt.T_entree_emetteur
  if (pt.type === 'terminalFroid') {
    const def = TERMINAL_FROID_TYPES.find(t => t.id === pt.terminalFroidType)
    return def?.T_entreeDefault ?? T_prod
  }
  const emDef = EMETTEUR_TYPES.find(e => e.id === pt.emetteurType)
  return emDef?.T_entreeDefault ?? T_prod
}

/**
 * Map nodeId → Q (m³/h).
 * Q = P / (RHO_CP × |T_entrée − T_sortie|) — débit propre à chaque terminal.
 * |dT| est utilisé pour fonctionner en chauffage (dT > 0) et en EG (dT < 0).
 */
function buildTerminalQMap(points: Point[], params: ChauffageParams): Map<string, number> {
  const T_prod = params.T_depart
  const map = new Map<string, number>()
  for (const pt of points) {
    if (!isTerminal(pt)) continue
    const T_entree = terminalTEntree(pt, T_prod)
    const T_sortie = terminalTSortie(pt, T_prod)
    const dT = Math.abs(T_entree - T_sortie)
    map.set(pt.id, emetteurFlowRate(pt.puissance ?? 0, dT))
  }
  return map
}

// ── Détection des nœuds mélange ─────────────────────────────────────────────

/**
 * Un nœud mélange possède ≥2 tronçons aller CH et ≥1 tronçon retour CH connectés,
 * quel que soit le sens d'écoulement.
 */
export function detectMixingNodes(
  points: Point[], segments: Segment[], flowDirections?: FlowDirections
): Set<string> {
  const mixing = new Set<string>()
  for (const pt of points) {
    if (isTerminal(pt) || isProduction(pt) || pt.type === 'pump') continue
    if (flowDirections) {
      // Nœud mélange : exactement 1 tronçon aller sortant (vers émetteur) + ≥1 entrant (primaire)
      // Un nœud de jonction a ≥2 sortants → non détecté
      const allerOut = segments.filter(s => s.type === 'aller' && flowDirections.get(s.id)?.fromId === pt.id).length
      const allerIn  = segments.filter(s => s.type === 'aller' && flowDirections.get(s.id)?.toId   === pt.id).length
      const retour   = segments.filter(s => s.type === 'retour' && (s.startPointId === pt.id || s.endPointId === pt.id)).length
      if (allerOut >= 1 && allerIn >= 1 && retour >= 1) mixing.add(pt.id)
    } else {
      const allerCount  = segments.filter(s => s.type === 'aller'  && (s.startPointId === pt.id || s.endPointId === pt.id)).length
      const retourCount = segments.filter(s => s.type === 'retour' && (s.startPointId === pt.id || s.endPointId === pt.id)).length
      if (allerCount >= 2 && retourCount >= 1) mixing.add(pt.id)
    }
  }
  return mixing
}

// ── Q : réseau (somme des émetteurs, sans distinction primaire/secondaire) ─────

/** Q aller au niveau d'un nœud = somme des Q des émetteurs en aval. */
function allerNodeQ(
  nodeId: string, segments: Segment[], emetteurQs: Map<string, number>,
  flowDirections: FlowDirections, memo: Map<string, number>
): number {
  if (memo.has(nodeId)) return memo.get(nodeId)!
  memo.set(nodeId, 0)
  let total = emetteurQs.get(nodeId) ?? 0
  for (const seg of segments) {
    if (seg.type !== 'aller') continue
    const dir = flowDirections.get(seg.id)
    if (!dir || dir.fromId !== nodeId) continue
    total += allerNodeQ(dir.toId, segments, emetteurQs, flowDirections, memo)
  }
  memo.set(nodeId, total)
  return total
}

/** Q retour collecté = somme des Q des émetteurs en amont (via retour). */
function retourNodeQ(
  nodeId: string, segments: Segment[], emetteurQs: Map<string, number>,
  flowDirections: FlowDirections, memo: Map<string, number>
): number {
  if (memo.has(nodeId)) return memo.get(nodeId)!
  memo.set(nodeId, 0)
  let total = emetteurQs.get(nodeId) ?? 0
  for (const seg of segments) {
    if (seg.type !== 'retour') continue
    const dir = flowDirections.get(seg.id)
    if (!dir || dir.toId !== nodeId) continue
    total += retourNodeQ(dir.fromId, segments, emetteurQs, flowDirections, memo)
  }
  memo.set(nodeId, total)
  return total
}

// ── Puissances ───────────────────────────────────────────────────────────────

function allerNodePuissance(
  nodeId: string, segments: Segment[], points: Point[],
  flowDirections: FlowDirections, memo: Map<string, number>
): number {
  if (memo.has(nodeId)) return memo.get(nodeId)!
  memo.set(nodeId, 0)
  const pt = points.find(p => p.id === nodeId)
  let total = isTerminal(pt) ? (pt.puissance ?? 0) : 0
  for (const seg of segments) {
    if (seg.type !== 'aller') continue
    const dir = flowDirections.get(seg.id)
    if (!dir || dir.fromId !== nodeId) continue
    total += allerNodePuissance(dir.toId, segments, points, flowDirections, memo)
  }
  memo.set(nodeId, total)
  return total
}


// ── Température max aval (aller) ─────────────────────────────────────────────

/**
 * Température max des T_entrée des émetteurs en aval d'un nœud (via aller).
 * Si un nœud mélange est atteint en aval → contribue T_prod (eau primaire).
 * Fallback = T_prod si aucun émetteur trouvé.
 */
function allerNodeTMax(
  nodeId: string, segments: Segment[], points: Point[],
  flowDirections: FlowDirections, T_prod: number,
  mixingNodes: Set<string>,
  memo: Map<string, number>
): number {
  if (memo.has(nodeId)) return memo.get(nodeId)!
  memo.set(nodeId, T_prod) // anti-cycle
  const pt = points.find(p => p.id === nodeId)
  if (isTerminal(pt)) {
    const T = terminalTEntree(pt, T_prod)
    memo.set(nodeId, T)
    return T
  }
  let maxT = -Infinity
  for (const seg of segments) {
    if (seg.type !== 'aller') continue
    const dir = flowDirections.get(seg.id)
    if (!dir || dir.fromId !== nodeId) continue
    const childId = dir.toId
    if (mixingNodes.has(childId)) {
      // Nœud mélange en aval → tronçon primaire, doit transporter T_prod
      maxT = Math.max(maxT, T_prod)
    } else {
      maxT = Math.max(maxT, allerNodeTMax(childId, segments, points, flowDirections, T_prod, mixingNodes, memo))
    }
  }
  const result = maxT === -Infinity ? T_prod : maxT
  memo.set(nodeId, result)
  return result
}

// ── Température retour : traversée arrière ────────────────────────────────────

/**
 * Température au nœud nodeId en remontant le réseau retour (traversée arrière).
 * - Émetteur → T_sortie
 * - 1 tronçon arrivant → continue en amont
 * - 2+ tronçons arrivants (jonction) :
 *     si hasMixingNodes → mélange pondéré Q
 *     sinon → max T_sortie (réseau homogène sans circuit secondaire)
 */
function retourNodeTBack(
  nodeId: string,
  segments: Segment[],
  points: Point[],
  flowDirections: FlowDirections,
  flows: Map<string, ChauffageFlowEntry>,
  T_prod: number,
  hasMixingNodes: boolean,
  segMemo: Map<string, number | null>,
  nodeMemo: Map<string, number | null>
): number | null {
  if (nodeMemo.has(nodeId)) return nodeMemo.get(nodeId)!
  nodeMemo.set(nodeId, null) // anti-cycle

  const pt = points.find(p => p.id === nodeId)
  if (isTerminal(pt)) {
    const T = terminalTSortie(pt, T_prod)
    nodeMemo.set(nodeId, T)
    return T
  }

  const incoming = segments.filter(s =>
    s.type === 'retour' && flowDirections.get(s.id)?.toId === nodeId
  )

  if (incoming.length === 0) { nodeMemo.set(nodeId, null); return null }

  if (incoming.length === 1) {
    const T = retourSegTBack(incoming[0].id, segments, points, flowDirections, flows, T_prod, hasMixingNodes, segMemo, nodeMemo)
    nodeMemo.set(nodeId, T)
    return T
  }

  if (!hasMixingNodes) {
    // Max T_sortie — réseau sans nœud mélange, tous les retours à température homogène
    let maxT = -Infinity
    for (const seg of incoming) {
      const T = retourSegTBack(seg.id, segments, points, flowDirections, flows, T_prod, hasMixingNodes, segMemo, nodeMemo)
      if (T != null) maxT = Math.max(maxT, T)
    }
    const result = maxT === -Infinity ? null : maxT
    nodeMemo.set(nodeId, result)
    return result
  }

  // Mélange pondéré Q — réseau avec nœud mélange, températures hétérogènes
  let totalQ = 0, totalQT = 0
  for (const seg of incoming) {
    const T = retourSegTBack(seg.id, segments, points, flowDirections, flows, T_prod, hasMixingNodes, segMemo, nodeMemo)
    const Q = flows.get(seg.id)?.flowRate ?? 0
    if (T != null && Q > 0) { totalQ += Q; totalQT += Q * T }
  }
  const result = totalQ > 0 ? totalQT / totalQ : null
  nodeMemo.set(nodeId, result)
  return result
}

function retourSegTBack(
  segId: string,
  segments: Segment[],
  points: Point[],
  flowDirections: FlowDirections,
  flows: Map<string, ChauffageFlowEntry>,
  T_prod: number,
  hasMixingNodes: boolean,
  segMemo: Map<string, number | null>,
  nodeMemo: Map<string, number | null>
): number | null {
  if (segMemo.has(segId)) return segMemo.get(segId)!
  segMemo.set(segId, null) // anti-cycle

  const seg = segments.find(s => s.id === segId)
  if (!seg) return null

  const T_override = seg.T_ch_override ?? seg.T_eg_override ?? null
  if (T_override != null) {
    segMemo.set(segId, T_override)
    return T_override
  }

  const dir = flowDirections.get(segId)
  if (!dir) return null

  const fromPt = points.find(p => p.id === dir.fromId)
  if (isTerminal(fromPt)) {
    const T = terminalTSortie(fromPt, T_prod)
    segMemo.set(segId, T)
    return T
  }

  const T = retourNodeTBack(dir.fromId, segments, points, flowDirections, flows, T_prod, hasMixingNodes, segMemo, nodeMemo)
  segMemo.set(segId, T)
  return T
}

// ── Interfaces de résultats ───────────────────────────────────────────────────

export interface ChauffageFlowEntry {
  flowRate: number | null
  velocity: number | null
  puissanceAmont: number | null  // W — puissance totale transportée
}

export interface ChauffageThermalEntry {
  T_from: number | null
  T_to:   number | null
}

export interface ChauffageThermalResults {
  segResults:   Map<string, ChauffageThermalEntry>
  nodeRetourT:  Map<string, number | null>
}

// ── Calcul des débits ─────────────────────────────────────────────────────────

/**
 * Température de retour secondaire calculée sans flux, depuis les T_sortie
 * émetteurs pondérées par leurs Q.
 */
function retourLeafT(
  nodeId: string,
  segments: Segment[],
  points: Point[],
  flowDirections: FlowDirections,
  emetteurQs: Map<string, number>,
  T_prod: number,
  memo: Map<string, number | null>
): number | null {
  if (memo.has(nodeId)) return memo.get(nodeId) ?? null
  memo.set(nodeId, null)

  const pt = points.find(p => p.id === nodeId)
  if (isTerminal(pt)) {
    const T = terminalTSortie(pt, T_prod)
    memo.set(nodeId, T)
    return T
  }

  const incoming = segments.filter(s =>
    s.type === 'retour' && flowDirections.get(s.id)?.toId === nodeId
  )
  if (incoming.length === 0) return null

  let totalQ = 0, totalQT = 0
  for (const seg of incoming) {
    const dir = flowDirections.get(seg.id)
    if (!dir) continue
    const T = retourLeafT(dir.fromId, segments, points, flowDirections, emetteurQs, T_prod, memo)
    const Q = retourNodeQ(dir.fromId, segments, emetteurQs, flowDirections, new Map())
    if (T != null && Q > 0) { totalQ += Q; totalQT += Q * T }
  }
  const result = totalQ > 0 ? totalQT / totalQ : null
  memo.set(nodeId, result)
  return result
}

/**
 * Calcule les débits et vitesses — algorithme en 3 étapes :
 *   1. Feuilles émetteurs : Q = P/(ρCp×ΔT)
 *   2. Nœuds mélange : bypass détecté par connectivité physique → Q_ret, Q_prim, chaîne bypass + retourSec2
 *   3. Loi des nœuds pour tous les autres tronçons (aller puis retour avec patchedRetourIds)
 */
export function computeChauffageFlows(
  segments: Segment[], points: Point[], materials: any[],
  chauffageParams: ChauffageParams, flowDirections: FlowDirections,
  mixingNodes: Set<string> = new Set()
): Map<string, ChauffageFlowEntry> {
  const { T_depart } = chauffageParams
  const emetteurQs = buildTerminalQMap(points, chauffageParams)

  const velFn = (seg: Segment, Q: number): number | null => {
    const di_mm = getDi_mm(seg, materials)
    if (di_mm == null || Q <= 0) return null
    const area = Math.PI * (di_mm / 1000) ** 2 / 4
    return Q / (area * 3600)
  }

  const flows = new Map<string, ChauffageFlowEntry>()
  for (const seg of segments) {
    flows.set(seg.id, { flowRate: null, velocity: null, puissanceAmont: null })
  }

  // ── Étape 1 : Feuilles émetteurs ─────────────────────────────────────────────
  for (const seg of segments) {
    const dir = flowDirections.get(seg.id)
    if (!dir) continue
    if (seg.type === 'aller') {
      const pt = points.find(p => p.id === dir.toId)
      if (isTerminal(pt)) {
        const Q = emetteurQs.get(pt.id) ?? 0
        flows.set(seg.id, { flowRate: Q, velocity: velFn(seg, Q), puissanceAmont: pt.puissance ?? 0 })
      }
    } else {
      const pt = points.find(p => p.id === dir.fromId)
      if (isTerminal(pt)) {
        const Q = emetteurQs.get(pt.id) ?? 0
        flows.set(seg.id, { flowRate: Q, velocity: velFn(seg, Q), puissanceAmont: null })
      }
    }
  }

  // ── Étape 2 : Nœuds mélange — bypass par connectivité physique ───────────────
  const prod = points.find(p => isProduction(p))
  const distRetour = prod ? dijkstra(prod.id, segments, 'retour') : new Map<string, number>()

  const patchedRetourIds = new Set<string>()
  const setRetour = (seg: Segment, Q: number) => {
    flows.set(seg.id, { flowRate: Q, velocity: velFn(seg, Q), puissanceAmont: null })
    patchedRetourIds.add(seg.id)
  }

  // T_ret : traversée physique depuis l'autre extrémité du bypass jusqu'au nœud séparation
  const bypassTRet = (startId: string, excludeId: string): number | null => {
    let nodeId = startId, excId = excludeId
    for (let hop = 0; hop < 20; hop++) {
      const pt = points.find(p => p.id === nodeId)
      if (isTerminal(pt)) return terminalTSortie(pt, T_depart)
      const dNode = distRetour.get(nodeId) ?? 0
      const near = segments.filter(s =>
        s.type === 'retour' &&
        (s.startPointId === nodeId || s.endPointId === nodeId) &&
        s.id !== excId
      )
      if (near.length === 0) break
      if (near.length === 1) {
        const next = near[0]
        const nextId = next.startPointId === nodeId ? next.endPointId : next.startPointId
        excId = next.id; nodeId = nextId
      } else {
        const arr = near.filter(s => {
          const oid = s.startPointId === nodeId ? s.endPointId : s.startPointId
          return (distRetour.get(oid) ?? 0) > dNode
        })
        if (arr.length === 0) break
        let tQ = 0, tQT = 0
        for (const s of arr) {
          const oid = s.startPointId === nodeId ? s.endPointId : s.startPointId
          const T = retourLeafT(oid, segments, points, flowDirections, emetteurQs, T_depart, new Map())
          const Q = retourNodeQ(oid, segments, emetteurQs, flowDirections, new Map())
          if (T != null && Q > 0) { tQ += Q; tQT += Q * T }
        }
        return tQ > 0 ? tQT / tQ : null
      }
    }
    return null
  }

  for (const mixId of mixingNodes) {
    const allerSec = segments.find(s =>
      s.type === 'aller' && flowDirections.get(s.id)?.fromId === mixId
    )
    if (!allerSec) continue
    const secToId = flowDirections.get(allerSec.id)!.toId

    const Q_sec = allerNodeQ(secToId, segments, emetteurQs, flowDirections, new Map())
    if (Q_sec <= 0) continue

    const T_mix = allerNodeTMax(secToId, segments, points, flowDirections, T_depart, mixingNodes, new Map())

    // Bypass par connectivité physique (max distRetour depuis MixNode)
    const retourAtMix = segments.filter(s =>
      s.type === 'retour' && (s.startPointId === mixId || s.endPointId === mixId)
    )
    if (retourAtMix.length === 0) continue

    let bypassSeg: Segment | undefined, retourPrimSeg: Segment | undefined
    let maxD = -Infinity, minD = Infinity
    for (const s of retourAtMix) {
      const oid = s.startPointId === mixId ? s.endPointId : s.startPointId
      const d = distRetour.get(oid) ?? 0
      if (d > maxD) { maxD = d; bypassSeg = s }
      if (d < minD) { minD = d; retourPrimSeg = s }
    }
    if (!bypassSeg) continue
    if (bypassSeg.id === retourPrimSeg?.id) retourPrimSeg = undefined

    const bypassOtherId = bypassSeg.startPointId === mixId ? bypassSeg.endPointId : bypassSeg.startPointId
    const T_ret = bypassTRet(bypassOtherId, bypassSeg.id)
    if (T_ret == null) continue

    const dT = T_depart - T_ret
    if (Math.abs(dT) < 0.001) continue

    const Q_ret  = Math.max(0, Q_sec * (T_depart - T_mix) / dT)
    const Q_prim = Math.max(0, Q_sec - Q_ret)
    const puisAmont = allerNodePuissance(secToId, segments, points, flowDirections, new Map())

    // Bypass immédiat + retourPrim au nœud mélange
    setRetour(bypassSeg, Q_ret)
    if (retourPrimSeg) setRetour(retourPrimSeg, Q_prim)

    // allerPrim — la loi des nœuds aller propagera Q_prim en série en amont
    const allerPrim = segments.find(s =>
      s.type === 'aller' && flowDirections.get(s.id)?.toId === mixId
        && !mixingNodes.has(flowDirections.get(s.id)!.fromId)
    )
    if (allerPrim) {
      flows.set(allerPrim.id, { flowRate: Q_prim, velocity: velFn(allerPrim, Q_prim), puissanceAmont: puisAmont })
    }

    // Traversée chaîne bypass → nœud séparation retour ch (tronçon vers production = Q_prim)
    let curNodeId = bypassOtherId, lastId = bypassSeg.id
    for (let hop = 0; hop < 20; hop++) {
      const dCur = distRetour.get(curNodeId) ?? 0
      const near = segments.filter(s =>
        s.type === 'retour' &&
        (s.startPointId === curNodeId || s.endPointId === curNodeId) &&
        s.id !== lastId
      )
      if (near.length === 0) break
      if (near.length === 1) {
        const next = near[0]
        const nextId = next.startPointId === curNodeId ? next.endPointId : next.startPointId
        if ((distRetour.get(nextId) ?? 0) < dCur) {
          setRetour(next, Q_ret); lastId = next.id; curNodeId = nextId
        } else break
      } else {
        for (const s of near) {
          const oid = s.startPointId === curNodeId ? s.endPointId : s.startPointId
          if ((distRetour.get(oid) ?? 0) < dCur) setRetour(s, Q_prim)
        }
        break
      }
    }
  }

  // ── Étape 3a : Loi des nœuds — aller ────────────────────────────────────────
  const allerQMemo = new Map<string, number>()
  const allerPMemo = new Map<string, number>()

  function allerQByLaw(segId: string): number {
    if (allerQMemo.has(segId)) return allerQMemo.get(segId)!
    allerQMemo.set(segId, 0)
    const dir = flowDirections.get(segId)
    if (!dir) { const q = flows.get(segId)?.flowRate ?? 0; allerQMemo.set(segId, q); return q }
    const pt = points.find(p => p.id === dir.toId)
    if (isTerminal(pt) || mixingNodes.has(dir.toId)) {
      const q = flows.get(segId)?.flowRate ?? 0; allerQMemo.set(segId, q); return q
    }
    const out = segments.filter(s => s.type === 'aller' && flowDirections.get(s.id)?.fromId === dir.toId)
    const q = out.reduce((s, seg) => s + allerQByLaw(seg.id), 0)
    allerQMemo.set(segId, q); return q
  }

  function allerPByLaw(segId: string): number {
    if (allerPMemo.has(segId)) return allerPMemo.get(segId)!
    allerPMemo.set(segId, 0)
    const dir = flowDirections.get(segId)
    if (!dir) { const p = flows.get(segId)?.puissanceAmont ?? 0; allerPMemo.set(segId, p); return p }
    const pt = points.find(p => p.id === dir.toId)
    if (isTerminal(pt) || mixingNodes.has(dir.toId)) {
      const p = flows.get(segId)?.puissanceAmont ?? 0; allerPMemo.set(segId, p); return p
    }
    const out = segments.filter(s => s.type === 'aller' && flowDirections.get(s.id)?.fromId === dir.toId)
    const p = out.reduce((s, seg) => s + allerPByLaw(seg.id), 0)
    allerPMemo.set(segId, p); return p
  }

  for (const seg of segments) {
    if (seg.type !== 'aller') continue
    const dir = flowDirections.get(seg.id)
    if (!dir) continue
    const pt = points.find(p => p.id === dir.toId)
    if (isTerminal(pt) || mixingNodes.has(dir.toId)) continue
    const out = segments.filter(s => s.type === 'aller' && flowDirections.get(s.id)?.fromId === dir.toId)
    if (out.length === 0) continue
    const Q = allerQByLaw(seg.id)
    flows.set(seg.id, { flowRate: Q, velocity: velFn(seg, Q), puissanceAmont: allerPByLaw(seg.id) })
  }

  // ── Étape 3b : Loi des nœuds — retour ───────────────────────────────────────
  // patchedRetourIds (bypass chain + retourSec2) est pré-résolu → pas de soustraction bypass nécessaire
  const retourSegs = segments.filter(s => s.type === 'retour')

  const isRetourLeaf = (seg: Segment): boolean => {
    if (patchedRetourIds.has(seg.id)) return true
    const dir = flowDirections.get(seg.id)
    if (!dir) return true
    const fromPt = points.find(p => p.id === dir.fromId)
    return (
      isTerminal(fromPt) ||
      mixingNodes.has(dir.fromId) ||
      mixingNodes.has(dir.toId)
    )
  }

  const retourQ = new Map<string, number>()
  for (const seg of retourSegs) retourQ.set(seg.id, flows.get(seg.id)?.flowRate ?? 0)

  const resolved = new Set<string>()
  for (const seg of retourSegs) { if (isRetourLeaf(seg)) resolved.add(seg.id) }

  let progress = true
  while (progress) {
    progress = false
    for (const seg of retourSegs) {
      if (resolved.has(seg.id)) continue
      const dir = flowDirections.get(seg.id)
      if (!dir) { resolved.add(seg.id); continue }
      const incoming = retourSegs.filter(s => flowDirections.get(s.id)?.toId === dir.fromId)
      if (!incoming.every(s => resolved.has(s.id))) continue
      const Q = incoming.reduce((sum, s) => sum + (retourQ.get(s.id) ?? 0), 0)
      retourQ.set(seg.id, Math.max(0, Q))
      resolved.add(seg.id)
      progress = true
    }
  }

  for (const seg of retourSegs) {
    if (isRetourLeaf(seg)) continue
    const Q = retourQ.get(seg.id) ?? 0
    flows.set(seg.id, { flowRate: Q, velocity: velFn(seg, Q), puissanceAmont: null })
  }

  return flows
}

// ── Calcul thermique ──────────────────────────────────────────────────────────

/**
 * Températures des tronçons chauffage :
 *
 * Aller :
 *   - Tronçon primaire arrivant à un nœud mélange → T = T_depart (eau chaude primaire)
 *   - Tronçon secondaire partant d'un nœud mélange → T = max T_entrée émetteurs aval (T_départ_secondaire)
 *   - Autres → T = max T_entrée émetteurs en aval
 *
 * Retour :
 *   - Tronçon en sortie directe d'émetteur → T_sortie_émetteur
 *   - Tronçon en série / après jonction → mélange pondéré par Q des tronçons amont
 *   - T_ch_override sur un tronçon alimente le mélange des tronçons aval
 */
export function computeChauffageThermalSimple(
  segments: Segment[], points: Point[],
  chauffageParams: ChauffageParams,
  flowDirections: FlowDirections,
  chauffageFlows: Map<string, ChauffageFlowEntry>,
  mixingNodes: Set<string> = new Set()
): ChauffageThermalResults {
  const { T_depart } = chauffageParams
  const segResults    = new Map<string, ChauffageThermalEntry>()
  const retourSegMemo = new Map<string, number | null>()
  const allerTMemo    = new Map<string, number>()

  function retourSegT(segId: string): number | null {
    if (retourSegMemo.has(segId)) return retourSegMemo.get(segId)!
    retourSegMemo.set(segId, null) // anti-cycle

    const seg = segments.find(s => s.id === segId)
    if (!seg) return null

    const T_override = seg.T_ch_override ?? seg.T_eg_override ?? null
    if (T_override != null) {
      retourSegMemo.set(segId, T_override)
      return T_override
    }

    const dir = flowDirections.get(segId)
    if (!dir) return null

    const fromPt = points.find(p => p.id === dir.fromId)
    if (isTerminal(fromPt)) {
      const T = terminalTSortie(fromPt, T_depart)
      retourSegMemo.set(segId, T)
      return T
    }

    const incoming = segments.filter(s =>
      s.type === 'retour' && flowDirections.get(s.id)?.toId === dir.fromId
    )
    if (incoming.length === 0) { retourSegMemo.set(segId, null); return null }

    let totalQ = 0, totalQT = 0
    for (const inSeg of incoming) {
      const T = retourSegT(inSeg.id)
      const Q = chauffageFlows.get(inSeg.id)?.flowRate ?? 0
      if (T != null && Q > 0) { totalQ += Q; totalQT += Q * T }
    }
    const T = totalQ > 0 ? totalQT / totalQ : null
    retourSegMemo.set(segId, T)
    return T
  }

  for (const seg of segments) {
    const dir = flowDirections.get(seg.id)
    if (!dir) { segResults.set(seg.id, { T_from: null, T_to: null }); continue }

    if (seg.type === 'aller') {
      const T = mixingNodes.has(dir.toId)
        ? T_depart
        : allerNodeTMax(dir.toId, segments, points, flowDirections, T_depart, mixingNodes, allerTMemo)
      segResults.set(seg.id, { T_from: T, T_to: T })
    } else {
      const T = retourSegT(seg.id)
      segResults.set(seg.id, { T_from: T, T_to: T })
    }
  }

  // nodeRetourT : mélange pondéré des tronçons retour arrivant à chaque nœud sink
  const nodeRetourT = new Map<string, number | null>()
  for (const seg of segments) {
    if (seg.type !== 'retour') continue
    const dir = flowDirections.get(seg.id)
    if (!dir) continue
    if (!nodeRetourT.has(dir.toId)) {
      const incomingRetour = segments.filter(s =>
        s.type === 'retour' && flowDirections.get(s.id)?.toId === dir.toId
      )
      if (incomingRetour.length === 1) {
        // Un seul retour : T directe, pas besoin du débit
        nodeRetourT.set(dir.toId, segResults.get(incomingRetour[0].id)?.T_from ?? null)
      } else {
        let totalQ = 0, totalQT = 0
        for (const s of incomingRetour) {
          const T = segResults.get(s.id)?.T_from ?? null
          const Q = chauffageFlows.get(s.id)?.flowRate ?? 0
          if (T != null && Q > 0) { totalQ += Q; totalQT += Q * T }
        }
        nodeRetourT.set(dir.toId, totalQ > 0 ? totalQT / totalQ : null)
      }
    }
  }

  return { segResults, nodeRetourT }
}


// ── Recalcul des températures retour après correction des débits ──────────────

/**
 * Corrige les températures retour nulles pour les tronçons liés aux nœuds mélange.
 *
 * Problème : le bypass (nœud_séparation → nœud_mélange) a une direction Dijkstra
 * inversée (fromId=MixNode), donc retourNodeTBack(MixNode) retourne null car aucun
 * retour n'arrive à MixNode selon Dijkstra.
 *
 * Algorithme :
 *   1. Pour chaque nœud mélange MN, identifier le bypass (tronçon retour dont l'autre
 *      extrémité a le plus grand dist_retour = côté émetteur).
 *   2. Remonter depuis l'autre extrémité du bypass jusqu'au nœud séparation retour ch
 *      (1 tronçon arrivant du côté émetteur + ≥1 tronçon partant vers la production).
 *   3. T_sep = T du tronçon arrivant au nœud séparation (déjà calculé correctement).
 *   4. Appliquer T_sep à toute la chaîne bypass et à retourPrim si null.
 */
function correctMixingNodeRetourT(
  thermal: ChauffageThermalResults,
  segments: Segment[],
  points: Point[],
  flowDirections: FlowDirections,
  T_prod: number,
  mixingNodes: Set<string>
): void {
  if (mixingNodes.size === 0) return
  const prod = points.find(p => isProduction(p))
  if (!prod) return
  const distRetour = dijkstra(prod.id, segments, 'retour')

  for (const mixId of mixingNodes) {
    const retourAtMix = segments.filter(s =>
      s.type === 'retour' && (s.startPointId === mixId || s.endPointId === mixId)
    )
    if (retourAtMix.length === 0) continue

    // bypass = tronçon retour dont l'autre extrémité a le plus grand dist_retour (côté émetteur)
    // retourPrim = tronçon retour dont l'autre extrémité a le plus petit dist_retour (côté production)
    let bypassSeg: Segment | undefined
    let retourPrimSeg: Segment | undefined
    let maxOtherDist = -Infinity
    let minOtherDist = Infinity
    for (const seg of retourAtMix) {
      const otherId = seg.startPointId === mixId ? seg.endPointId : seg.startPointId
      const d = distRetour.get(otherId) ?? 0
      if (d > maxOtherDist) { maxOtherDist = d; bypassSeg = seg }
      if (d < minOtherDist) { minOtherDist = d; retourPrimSeg = seg }
    }
    if (!bypassSeg) continue
    if (bypassSeg.id === retourPrimSeg?.id) retourPrimSeg = undefined // 1 seul tronçon retour

    // Traversée amont depuis l'autre extrémité du bypass (vers les émetteurs)
    const chainSegs: Segment[] = [bypassSeg]
    let currentNodeId = bypassSeg.startPointId === mixId ? bypassSeg.endPointId : bypassSeg.startPointId

    let T_sep: number | null = null

    for (let hop = 0; hop < 20; hop++) {
      const dCurrent = distRetour.get(currentNodeId) ?? 0
      const lastSeg = chainSegs[chainSegs.length - 1]

      // Nœud émetteur direct
      const pt = points.find(p => p.id === currentNodeId)
      if (isTerminal(pt)) {
        T_sep = terminalTSortie(pt, T_prod)
        break
      }

      // Tronçons retour au nœud courant, sauf celui par lequel on vient
      const retourAtCurrent = segments.filter(s =>
        s.type === 'retour' &&
        (s.startPointId === currentNodeId || s.endPointId === currentNodeId) &&
        s.id !== lastSeg.id
      )
      if (retourAtCurrent.length === 0) break

      if (retourAtCurrent.length === 1) {
        // Nœud de passage avec un seul chemin : continuer sans vérifier la direction.
        // Le classement par dist_retour échoue pour les nœuds intermédiaires de la
        // chaîne bypass (dist décroissante vers SepNode ≠ sens physique d'écoulement).
        const nextSeg = retourAtCurrent[0]
        const nextNodeId = nextSeg.startPointId === currentNodeId
          ? nextSeg.endPointId : nextSeg.startPointId
        const nextPt = points.find(p => p.id === nextNodeId)
        if (isTerminal(nextPt)) {
          chainSegs.push(nextSeg)
          T_sep = terminalTSortie(nextPt, T_prod)
          break
        }
        chainSegs.push(nextSeg)
        currentNodeId = nextNodeId
        continue
      }

      // 2+ tronçons : classifier par dist_retour pour trouver le nœud séparation
      const arriving = retourAtCurrent.filter(s => {
        const otherId = s.startPointId === currentNodeId ? s.endPointId : s.startPointId
        return (distRetour.get(otherId) ?? 0) > dCurrent
      })
      const departing = retourAtCurrent.filter(s => {
        const otherId = s.startPointId === currentNodeId ? s.endPointId : s.startPointId
        return (distRetour.get(otherId) ?? 0) < dCurrent
      })

      if (arriving.length >= 1 && departing.length >= 1) {
        // Nœud séparation retour ch trouvé
        T_sep = thermal.segResults.get(arriving[0].id)?.T_from ?? null

        // Fallback : T depuis l'extrémité émetteur du tronçon arrivant
        if (T_sep == null) {
          const arrOtherId = arriving[0].startPointId === currentNodeId
            ? arriving[0].endPointId : arriving[0].startPointId
          const arrPt = points.find(p => p.id === arrOtherId)
          if (isTerminal(arrPt)) T_sep = terminalTSortie(arrPt, T_prod)
        }

        // Corriger les tronçons partants vers la production si température nulle
        if (T_sep != null) {
          for (const seg of departing) {
            if ((thermal.segResults.get(seg.id)?.T_from ?? null) == null)
              thermal.segResults.set(seg.id, { T_from: T_sep, T_to: T_sep })
          }
        }
        break
      } else if (arriving.length >= 1) {
        // Jonction sans tronçon partant : continuer vers l'amont (tronçon le plus éloigné)
        let nextSeg = arriving[0]
        let farthest = -Infinity
        for (const s of arriving) {
          const otherId = s.startPointId === currentNodeId ? s.endPointId : s.startPointId
          const d = distRetour.get(otherId) ?? 0
          if (d > farthest) { farthest = d; nextSeg = s }
        }
        chainSegs.push(nextSeg)
        currentNodeId = nextSeg.startPointId === currentNodeId
          ? nextSeg.endPointId : nextSeg.startPointId
      } else {
        T_sep = thermal.segResults.get(retourAtCurrent[0].id)?.T_from ?? null
        break
      }
    }

    if (T_sep == null) continue

    // Appliquer T_sep à toute la chaîne bypass (MixNode → SepNode)
    for (const seg of chainSegs)
      thermal.segResults.set(seg.id, { T_from: T_sep, T_to: T_sep })

    // Corriger retourPrim si température nulle
    if (retourPrimSeg && (thermal.segResults.get(retourPrimSeg.id)?.T_from ?? null) == null)
      thermal.segResults.set(retourPrimSeg.id, { T_from: T_sep, T_to: T_sep })

    // Mettre à jour nodeRetourT pour le nœud mélange
    thermal.nodeRetourT.set(mixId, T_sep)
  }
}

/**
 * Corrige les débits des tronçons liés aux nœuds mélange, en utilisant les
 * températures recalculées par recomputeRetourTemperatures.
 *
 * Formule : Q_ret = Q_sec × (T_prim − T_mix) / (T_prim − T_ret)
 *           Q_prim = Q_sec − Q_ret
 *
 * Corrige aussi les tronçons intermédiaires de la chaîne bypass (Q = Q_ret)
 * et le tronçon retour au nœud séparation vers la production (Q = Q_prim).
 */
export function correctMixingNodeFlows(
  flows: Map<string, ChauffageFlowEntry>,
  thermal: ChauffageThermalResults,
  segments: Segment[],
  points: Point[],
  flowDirections: FlowDirections,
  chauffageParams: ChauffageParams,
  mixingNodes: Set<string>,
  materials: any[]
): Set<string> {
  const patchedIds = new Set<string>()
  if (mixingNodes.size === 0) return patchedIds
  const T_prim = chauffageParams.T_depart
  const prod = points.find(p => isProduction(p))
  if (!prod) return patchedIds
  const distRetour = dijkstra(prod.id, segments, 'retour')

  const velFn = (seg: Segment, Q: number): number | null => {
    const di_mm = getDi_mm(seg, materials)
    if (di_mm == null || Q <= 0) return null
    const area = Math.PI * (di_mm / 1000) ** 2 / 4
    return Q / (area * 3600)
  }
  const setR = (seg: Segment, Q: number) => {
    flows.set(seg.id, { flowRate: Q, velocity: velFn(seg, Q), puissanceAmont: null })
    patchedIds.add(seg.id)
  }

  for (const mixId of mixingNodes) {
    const allerSec = segments.find(s =>
      s.type === 'aller' && flowDirections.get(s.id)?.fromId === mixId
    )
    if (!allerSec) continue
    const Q_sec = flows.get(allerSec.id)?.flowRate
    if (Q_sec == null || Q_sec <= 0) continue
    const T_mix = thermal.segResults.get(allerSec.id)?.T_from
    if (T_mix == null) continue

    const retourAtMix = segments.filter(s =>
      s.type === 'retour' && (s.startPointId === mixId || s.endPointId === mixId)
    )
    if (retourAtMix.length === 0) continue

    let bypassSeg: Segment | undefined
    let retourPrimSeg: Segment | undefined
    let maxOtherDist = -Infinity
    let minOtherDist = Infinity
    for (const seg of retourAtMix) {
      const otherId = seg.startPointId === mixId ? seg.endPointId : seg.startPointId
      const d = distRetour.get(otherId) ?? 0
      if (d > maxOtherDist) { maxOtherDist = d; bypassSeg = seg }
      if (d < minOtherDist) { minOtherDist = d; retourPrimSeg = seg }
    }
    if (!bypassSeg) continue
    if (bypassSeg.id === retourPrimSeg?.id) retourPrimSeg = undefined

    const T_ret = thermal.segResults.get(bypassSeg.id)?.T_from
    if (T_ret == null) continue
    const dT = T_prim - T_ret
    if (Math.abs(dT) < 0.001) continue

    const Q_ret  = Math.max(0, Q_sec * (T_prim - T_mix) / dT)
    const Q_prim = Math.max(0, Q_sec - Q_ret)

    setR(bypassSeg, Q_ret)
    if (retourPrimSeg) setR(retourPrimSeg, Q_prim)

    // allerPrim (tronçon aller — non retour, pas ajouté à patchedIds)
    const allerPrim = segments.find(s =>
      s.type === 'aller' && flowDirections.get(s.id)?.toId === mixId
    )
    if (allerPrim) {
      flows.set(allerPrim.id, {
        flowRate: Q_prim, velocity: velFn(allerPrim, Q_prim),
        puissanceAmont: flows.get(allerPrim.id)?.puissanceAmont ?? null
      })
      // Propager Q_prim aux tronçons aller en série en amont de allerPrim,
      // jusqu'au premier nœud de jonction (séparation ou convergence).
      let upNodeId: string | undefined = flowDirections.get(allerPrim.id)?.fromId
      for (let i = 0; i < 20 && upNodeId; i++) {
        const departing = segments.filter(s =>
          s.type === 'aller' && flowDirections.get(s.id)?.fromId === upNodeId
        )
        if (departing.length !== 1) break  // nœud séparation → stop
        const arrivals = segments.filter(s =>
          s.type === 'aller' && flowDirections.get(s.id)?.toId === upNodeId
        )
        if (arrivals.length !== 1) break  // source ou jonction convergence → stop
        const upSeg = arrivals[0]
        flows.set(upSeg.id, {
          flowRate: Q_prim, velocity: velFn(upSeg, Q_prim),
          puissanceAmont: flows.get(upSeg.id)?.puissanceAmont ?? null
        })
        upNodeId = flowDirections.get(upSeg.id)?.fromId
      }
    }

    // Traversée de la chaîne bypass : tronçons intermédiaires (Q_ret)
    // et tronçon retour vers la production au nœud séparation (Q_prim)
    let currentNodeId = bypassSeg.startPointId === mixId ? bypassSeg.endPointId : bypassSeg.startPointId
    let lastSegId = bypassSeg.id

    for (let hop = 0; hop < 20; hop++) {
      const dCurrent = distRetour.get(currentNodeId) ?? 0
      const retourAtCurrent = segments.filter(s =>
        s.type === 'retour' &&
        (s.startPointId === currentNodeId || s.endPointId === currentNodeId) &&
        s.id !== lastSegId
      )
      if (retourAtCurrent.length === 0) break

      if (retourAtCurrent.length === 1) {
        const nextSeg = retourAtCurrent[0]
        const otherId = nextSeg.startPointId === currentNodeId ? nextSeg.endPointId : nextSeg.startPointId
        if ((distRetour.get(otherId) ?? 0) < dCurrent) {
          setR(nextSeg, Q_ret)
          lastSegId = nextSeg.id
          currentNodeId = otherId
        } else {
          break
        }
      } else {
        const departing = retourAtCurrent.filter(s => {
          const otherId = s.startPointId === currentNodeId ? s.endPointId : s.startPointId
          return (distRetour.get(otherId) ?? 0) < dCurrent
        })
        for (const seg of departing) setR(seg, Q_prim)
        break
      }
    }
  }

  return patchedIds
}

/**
 * Relance la loi des nœuds retour avec les débits pré-calculés comme valeurs initiales.
 *
 * Les tronçons "pré-résolus" (feuilles émetteurs + patchedIds issus de
 * correctMixingNodeFlows) sont conservés tels quels. Tous les autres sont
 * recalculés depuis ces valeurs connues, ce qui garantit la cohérence en série
 * et la loi des nœuds sur l'ensemble du réseau.
 */
export function rerunRetourNodeLaw(
  flows: Map<string, ChauffageFlowEntry>,
  segments: Segment[],
  points: Point[],
  flowDirections: FlowDirections,
  mixingNodes: Set<string>,
  materials: any[],
  patchedIds: Set<string>
): void {
  const retourSegs = segments.filter(s => s.type === 'retour')

  const velFn = (seg: Segment, Q: number): number | null => {
    const di_mm = getDi_mm(seg, materials)
    if (di_mm == null || Q <= 0) return null
    const area = Math.PI * (di_mm / 1000) ** 2 / 4
    return Q / (area * 3600)
  }

  const isLeaf = (seg: Segment): boolean => {
    if (patchedIds.has(seg.id)) return true
    const dir = flowDirections.get(seg.id)
    if (!dir) return true
    const fromPt = points.find(p => p.id === dir.fromId)
    return isTerminal(fromPt) || mixingNodes.has(dir.fromId) || mixingNodes.has(dir.toId)
  }

  const retourQ = new Map<string, number>()
  const resolved = new Set<string>()
  for (const seg of retourSegs) {
    retourQ.set(seg.id, flows.get(seg.id)?.flowRate ?? 0)
    if (isLeaf(seg)) resolved.add(seg.id)
  }

  // Loi des nœuds itérative depuis les valeurs pré-résolues.
  // Les tronçons de chaîne bypass sont tous dans patchedIds : pas besoin
  // de détecter ni soustraire les bypasses ici.
  let progress = true
  while (progress) {
    progress = false
    for (const seg of retourSegs) {
      if (resolved.has(seg.id)) continue
      const dir = flowDirections.get(seg.id)
      if (!dir) { resolved.add(seg.id); continue }
      const incoming = retourSegs.filter(s => flowDirections.get(s.id)?.toId === dir.fromId)
      if (!incoming.every(s => resolved.has(s.id))) continue
      const Q = incoming.reduce((sum, s) => sum + (retourQ.get(s.id) ?? 0), 0)
      retourQ.set(seg.id, Math.max(0, Q))
      resolved.add(seg.id)
      progress = true
    }
  }

  for (const seg of retourSegs) {
    if (isLeaf(seg)) continue
    const Q = retourQ.get(seg.id) ?? 0
    flows.set(seg.id, { flowRate: Q, velocity: velFn(seg, Q), puissanceAmont: null })
  }
}

/**
 * Recalcule les températures retour en utilisant la traversée arrière,
 * puis corrige les températures nulles dues aux nœuds mélange.
 * Mute thermal en place.
 */
export function recomputeRetourTemperatures(
  thermal: ChauffageThermalResults,
  flows: Map<string, ChauffageFlowEntry>,
  segments: Segment[],
  points: Point[],
  flowDirections: FlowDirections,
  chauffageParams: ChauffageParams,
  mixingNodes: Set<string> = new Set()
): void {
  const T_prod       = chauffageParams.T_depart
  const hasMixingNodes = mixingNodes.size > 0
  const segMemo  = new Map<string, number | null>()
  const nodeMemo = new Map<string, number | null>()

  // Étape 1 : traversée arrière pour tous les tronçons retour
  for (const seg of segments) {
    if (seg.type !== 'retour') continue
    const dir = flowDirections.get(seg.id)
    if (!dir) { thermal.segResults.set(seg.id, { T_from: null, T_to: null }); continue }
    const T = retourSegTBack(seg.id, segments, points, flowDirections, flows, T_prod, hasMixingNodes, segMemo, nodeMemo)
    thermal.segResults.set(seg.id, { T_from: T, T_to: T })
  }

  // Étape 2 : correction des températures nulles aux nœuds mélange
  correctMixingNodeRetourT(thermal, segments, points, flowDirections, T_prod, mixingNodes)

  // Étape 3 : mise à jour de nodeRetourT avec les températures corrigées
  thermal.nodeRetourT.clear()
  for (const seg of segments) {
    if (seg.type !== 'retour') continue
    const dir = flowDirections.get(seg.id)
    if (!dir || thermal.nodeRetourT.has(dir.toId)) continue
    const incomingRetour = segments.filter(s =>
      s.type === 'retour' && flowDirections.get(s.id)?.toId === dir.toId
    )
    if (incomingRetour.length === 1) {
      thermal.nodeRetourT.set(dir.toId, thermal.segResults.get(incomingRetour[0].id)?.T_from ?? null)
    } else {
      let totalQ = 0, totalQT = 0
      for (const s of incomingRetour) {
        const T = thermal.segResults.get(s.id)?.T_from ?? null
        const Q = flows.get(s.id)?.flowRate ?? 0
        if (T != null && Q > 0) { totalQ += Q; totalQT += Q * T }
      }
      thermal.nodeRetourT.set(dir.toId, totalQ > 0 ? totalQT / totalQ : null)
    }
  }
}

export interface ChauffageSplitCumDpResult {
  segCumDp:                Map<string, number>  // valeur correcte par segment (primaire depuis prod, secondaire depuis mélange)
  secondarySegIds:         Set<string>          // tronçons appartenant au circuit mélangé
  segPostJunction:         Map<string, boolean> // true si le tronçon est après une jonction dans le circuit primaire
  criticalSegIds:          Set<string>          // tronçons du chemin retour primaire le plus défavorisé
  segJunctionWinner:       Map<string, string>  // tronçon "tronc" → tronçon entrant critique à sa jonction source
  secondaryCriticalSegIds: Set<string>          // tronçons du circuit secondaire (pour affichage sans pompe)
  secondaryCriticalDp:     number | null        // ΔP max du circuit secondaire
  criticalDp:              number | null        // ΔP max du circuit primaire (inclut dp_emetteur)
}

/**
 * Calcule les ΔP cumulés chauffage avec deux origines distinctes :
 * - Circuit primaire : ΔP depuis production CH (aller primaire + retour primaire skippant le circuit mélangé)
 * - Circuit mélangé  : ΔP depuis nœud mélange (aller secondaire + retour secondaire + bypass)
 *
 * Retourne null si aucun nœud mélange (utiliser pdcCumResults standard).
 */
export function computeChauffageSplitCumDp(
  segments: Segment[],
  points: Point[],
  flowDirections: FlowDirections,
  pdcResults: Map<string, { dpTotal: number; dpPompe?: number }> | null,
  mixingNodes: Set<string>,
): ChauffageSplitCumDpResult | null {
  if (mixingNodes.size === 0) return null

  const prodNode = points.find(p => isProduction(p))

  // ── Pré-calcul : canReachMix ──────────────────────────────────────────────
  // Nœuds depuis lesquels on peut atteindre un nœud mélange en suivant des
  // tronçons retour dans le sens du flux. BFS arrière depuis chaque mélange.
  // Exclut naturellement la production et les nœuds du retour primaire.
  const canReachMix = new Set<string>()
  for (const mixId of mixingNodes) {
    canReachMix.add(mixId)
    const backQ = [mixId]
    while (backQ.length > 0) {
      const cur = backQ.shift()!
      for (const seg of segments) {
        const fd = flowDirections.get(seg.id)
        if (!fd || seg.type !== 'retour' || fd.toId !== cur) continue
        if (!canReachMix.has(fd.fromId)) { canReachMix.add(fd.fromId); backQ.push(fd.fromId) }
      }
    }
  }

  // ── 1+2. Détection des tronçons du circuit mélangé ──────────────────────
  // Aller secondaires  : BFS en avant depuis le nœud mélange via aller uniquement.
  //   → L'aller primaire arrive AU mélange (toId=mix), il ne part jamais de lui.
  // Retour secondaires : tronçons retour dont les deux extrémités sont dans canReachMix.
  //   → Inclut le bypass (séparation→mélange) et tous les retours secondaires.
  //   → Exclut les retours primaires dont le toId n'est pas dans canReachMix.
  const secondaryByMix  = new Map<string, Set<string>>()
  const allSecondaryIds = new Set<string>()

  for (const mixId of mixingNodes) {
    const secIds = new Set<string>()

    // 1. Aller secondaires : BFS depuis mélange via aller
    const allerQ    = [mixId]
    const allerSeen = new Set<string>([mixId])
    while (allerQ.length > 0) {
      const cur = allerQ.shift()!
      for (const seg of segments) {
        if (seg.type !== 'aller') continue
        const fd = flowDirections.get(seg.id)
        if (!fd || fd.fromId !== cur) continue
        secIds.add(seg.id)
        if (!allerSeen.has(fd.toId)) { allerSeen.add(fd.toId); allerQ.push(fd.toId) }
      }
    }

    // 2. Retour secondaires : fromId ET toId dans canReachMix
    for (const seg of segments) {
      if (seg.type !== 'retour') continue
      const fd = flowDirections.get(seg.id)
      if (!fd) continue
      if (canReachMix.has(fd.fromId) && canReachMix.has(fd.toId)) secIds.add(seg.id)
    }

    secondaryByMix.set(mixId, secIds)
    for (const id of secIds) allSecondaryIds.add(id)
  }

  const segCumDp         = new Map<string, number>()
  const segPostJunction  = new Map<string, boolean>()
  const criticalSegIds   = new Set<string>()
  const segJunctionWinner = new Map<string, string>()
  const primNodeIncoming = new Map<string, Array<{segId: string; cumDp: number}>>()

  const dp = (segId: string) => {
    const r = pdcResults?.get(segId)
    return r?.dpPompe ?? r?.dpTotal ?? 0
  }

  // ── 3. Circuit primaire — depuis production CH ───────────────────────────
  if (prodNode) {
    const primAllerSegs  = segments.filter(s => s.type === 'aller'  && !allSecondaryIds.has(s.id))
    const primRetourSegs = segments.filter(s => s.type === 'retour' && !allSecondaryIds.has(s.id))

    // BFS aller : production → mélange(s)
    const allerNode = new Map<string, number>([[prodNode.id, 0]])
    const allerQ    = [prodNode.id]
    const allerSeen = new Set<string>([prodNode.id])
    while (allerQ.length > 0) {
      const cur = allerQ.shift()!; const curDp = allerNode.get(cur) ?? 0
      for (const seg of primAllerSegs) {
        const fd = flowDirections.get(seg.id)
        if (!fd || fd.fromId !== cur) continue
        const ndp = curDp + dp(seg.id)
        segCumDp.set(seg.id, ndp)
        const prv = allerNode.get(fd.toId)
        if (prv == null || ndp > prv) allerNode.set(fd.toId, ndp)
        if (!allerSeen.has(fd.toId)) { allerSeen.add(fd.toId); allerQ.push(fd.toId) }
      }
    }
    for (const seg of primAllerSegs) segPostJunction.set(seg.id, false)

    // BFS retour — tri topologique : on attend que tous les tronçons entrants soient
    // résolus avant de traiter un nœud → MAX propagé aux jonctions (chemin défavorisé).
    const primRetourTotalIn = new Map<string, number>()
    for (const seg of primRetourSegs) {
      const fd = flowDirections.get(seg.id)
      if (!fd) continue
      primRetourTotalIn.set(fd.toId, (primRetourTotalIn.get(fd.toId) ?? 0) + 1)
    }

    const retourNode     = new Map<string, number>()
    const retourQ        = [] as string[]
    const retourQueued   = new Set<string>()
    const retourResolved = new Map<string, number>()

    const primNodePostJunction = new Map<string, boolean>([[prodNode.id, false]])
    // Lien séparation → mélange : enregistré lors du seeding pour la trace arrière aller.
    const sepToMix = new Map<string, string>()

    for (const mixId of mixingNodes) {
      const mixDp = allerNode.get(mixId) ?? 0
      const starts = new Set<string>([mixId])
      for (const segId of (secondaryByMix.get(mixId) ?? [])) {
        const fd = flowDirections.get(segId)
        if (fd && fd.toId === mixId) starts.add(fd.fromId)
      }
      // Nœuds séparation retour ch (canReachMix + retour primaire sortant)
      for (const seg of primRetourSegs) {
        const fd = flowDirections.get(seg.id)
        if (fd && canReachMix.has(fd.fromId)) {
          starts.add(fd.fromId)
          sepToMix.set(fd.fromId, mixId)
        }
      }
      for (const n of starts) {
        const prev = retourNode.get(n)
        retourNode.set(n, prev == null ? mixDp : Math.max(prev, mixDp))
        // Nœuds source : pré-résolus (pas d'entrants dans le circuit retour primaire)
        const inCount = primRetourTotalIn.get(n) ?? 0
        retourResolved.set(n, Math.max(retourResolved.get(n) ?? 0, inCount))
        if (!primNodePostJunction.has(n)) primNodePostJunction.set(n, false)
        if (!retourQueued.has(n)) { retourQueued.add(n); retourQ.push(n) }
      }
    }

    // Nœuds feuilles du retour primaire non encore seeded (ex : colonnes sans vanne mélange).
    // Leurs branches n'ont ni mélange ni séparation → jamais ajoutées dans la boucle ci-dessus.
    // Seed : allerNode.get(nodeId) = ΔP primaire aller jusqu'à ce nœud + ΔP émetteur si applicable.
    {
      const primRetourSources = new Set<string>()
      for (const seg of primRetourSegs) {
        const fd = flowDirections.get(seg.id)
        if (fd) primRetourSources.add(fd.fromId)
      }
      for (const nodeId of primRetourSources) {
        if ((primRetourTotalIn.get(nodeId) ?? 0) > 0) continue  // nœud intermédiaire, pas une feuille
        if (retourQueued.has(nodeId)) continue                   // déjà seeded (mélange, séparation…)
        const leafPt = points.find(p => p.id === nodeId)
        const leafEmDp = isTerminal(leafPt) ? ((leafPt.dp_emetteur ?? 0) + (leafPt.dp_vanne_th ?? 0)) : 0
        const seedDp = (allerNode.get(nodeId) ?? 0) + leafEmDp
        retourNode.set(nodeId, seedDp)
        retourResolved.set(nodeId, 0)
        if (!primNodePostJunction.has(nodeId)) primNodePostJunction.set(nodeId, false)
        retourQueued.add(nodeId); retourQ.push(nodeId)
      }
    }

    while (retourQ.length > 0) {
      const cur    = retourQ.shift()!
      const curDp  = retourNode.get(cur) ?? 0
      const curPost = primNodePostJunction.get(cur) ?? false
      for (const seg of primRetourSegs) {
        const fd = flowDirections.get(seg.id)
        if (!fd || fd.fromId !== cur) continue
        const ndp = curDp + dp(seg.id)
        segCumDp.set(seg.id, ndp)

        const toId = fd.toId
        if (!primNodeIncoming.has(toId)) primNodeIncoming.set(toId, [])
        primNodeIncoming.get(toId)!.push({ segId: seg.id, cumDp: ndp })

        const prv = retourNode.get(toId)
        retourNode.set(toId, prv == null ? ndp : Math.max(prv, ndp))

        if (toId === prodNode!.id) continue  // ne pas repousser la production

        const inCount  = primRetourTotalIn.get(toId) ?? 1
        const resolved = (retourResolved.get(toId) ?? 0) + 1
        retourResolved.set(toId, resolved)

        const isJunct = inCount > 1
        const toPost  = curPost || isJunct
        if (!primNodePostJunction.has(toId) || toPost) primNodePostJunction.set(toId, toPost)

        if (resolved >= inCount && !retourQueued.has(toId)) {
          retourQueued.add(toId); retourQ.push(toId)
        }
      }
    }

    // segPostJunction : hérite du nœud source
    for (const seg of primRetourSegs) {
      const fromId = flowDirections.get(seg.id)?.fromId ?? ''
      segPostJunction.set(seg.id, primNodePostJunction.get(fromId) ?? false)
    }

    // Chemin critique : trace à rebours depuis production en suivant le max cumDp.
    // segJunctionWinner : pour chaque tronçon "tronc" sortant d'une jonction,
    // enregistre l'id du tronçon entrant le plus défavorisé à cette jonction.
    // Permet d'afficher "Colonne X" (la branche critique) plutôt que la colonne
    // du tronçon tronc lui-même, qui peut être différente.
    let critCur = prodNode.id
    let prevWinnerSegId: string | null = null
    while (true) {
      const inc = primNodeIncoming.get(critCur) ?? []
      if (inc.length === 0) break
      const winner = inc.reduce((b, s) => s.cumDp >= b.cumDp ? s : b, inc[0])
      criticalSegIds.add(winner.segId)
      if (inc.length > 1 && prevWinnerSegId != null) {
        segJunctionWinner.set(prevWinnerSegId, winner.segId)
      }
      prevWinnerSegId = winner.segId
      const fromId = flowDirections.get(winner.segId)?.fromId
      if (!fromId || fromId === prodNode.id) break
      critCur = fromId
    }
    // critCur = nœud feuille du chemin retour critique (émetteur, mélange, séparation…).
    // Remonter via les tronçons aller primaires jusqu'à la production pour compléter
    // le circuit complet (utilisé par "Voir le circuit" sur la pompe primaire).
    // Cas V3V : si le nœud feuille est une séparation, aucun aller primaire n'y arrive.
    // On utilise sepToMix pour sauter au mélange correspondant et ajouter les tronçons
    // secondaires (boucle mélange → émetteurs → séparation), puis on continue.
    {
      let allerCur = critCur
      while (allerCur !== prodNode.id) {
        // Cas séparation : utiliser le lien sepToMix pour rejoindre le nœud mélange.
        // On ne traverse pas le circuit secondaire — la pompe primaire ne couvre que le circuit primaire.
        const linkedMixId = sepToMix.get(allerCur)
        if (linkedMixId != null) {
          allerCur = linkedMixId
          continue
        }

        let bestSeg: typeof primAllerSegs[0] | null = null
        let bestDp = -Infinity
        for (const seg of primAllerSegs) {
          const fd = flowDirections.get(seg.id)
          if (fd?.toId !== allerCur) continue
          const fromDp = allerNode.get(fd.fromId) ?? -Infinity
          if (fromDp > bestDp) { bestDp = fromDp; bestSeg = seg }
        }
        if (!bestSeg) break
        criticalSegIds.add(bestSeg.id)
        allerCur = flowDirections.get(bestSeg.id)?.fromId ?? ''
        if (!allerCur) break
      }
    }
  }

  // ── 4. Circuit mélangé — depuis nœud mélange (ΔP = 0) ──────────────────
  for (const [mixId, secIds] of secondaryByMix) {
    const circSegs = segments.filter(s => secIds.has(s.id))
    const secNode  = new Map<string, number>([[mixId, 0]])
    const secQ     = [mixId]
    const secSeen  = new Set<string>([mixId])
    while (secQ.length > 0) {
      const cur = secQ.shift()!; const curDp = secNode.get(cur) ?? 0
      const curPt = points.find(p => p.id === cur)
      // ΔP émetteur ajouté aux tronçons partant de l'émetteur (retour), pas à l'aller arrivant
      const curEmDp = isTerminal(curPt) ? ((curPt.dp_emetteur ?? 0) + (curPt.dp_vanne_th ?? 0)) : 0
      for (const seg of circSegs) {
        const fd = flowDirections.get(seg.id)
        if (!fd || fd.fromId !== cur) continue
        const ndp = curDp + curEmDp + dp(seg.id)
        segCumDp.set(seg.id, ndp)
        const prv = secNode.get(fd.toId)
        if (prv == null || ndp > prv) secNode.set(fd.toId, ndp)
        if (!secSeen.has(fd.toId)) { secSeen.add(fd.toId); secQ.push(fd.toId) }
      }
    }
  }

  let secondaryCriticalDp: number | null = null
  for (const id of allSecondaryIds) {
    const dp = segCumDp.get(id)
    if (dp != null && (secondaryCriticalDp == null || dp > secondaryCriticalDp)) secondaryCriticalDp = dp
  }

  let criticalDp: number | null = null
  for (const id of criticalSegIds) {
    const dp = segCumDp.get(id)
    if (dp != null && (criticalDp == null || dp > criticalDp)) criticalDp = dp
  }

  return { segCumDp, secondarySegIds: allSecondaryIds, segPostJunction, criticalSegIds, segJunctionWinner,
           secondaryCriticalSegIds: allSecondaryIds, secondaryCriticalDp, criticalDp }
}

export interface PumpHMTResult {
  hmt:            number | null
  criticalSegIds: Set<string>
  isSecondary:    boolean
}

/**
 * Calcule la HMT de chaque pompe chauffage en tenant compte du découplage hydraulique V3V.
 *
 * - Pompe primaire : criticalDp sur le circuit primaire uniquement (excluant le circuit secondaire)
 * - Pompe secondaire : ΔP de la boucle secondaire complète (mélange → émetteurs → séparation → bypass → mélange)
 *
 * Retourne une Map vide si aucun nœud mélange (→ utiliser criticalDp standard).
 */
export function computeChauffagePumpHMT(
  segments: Segment[],
  points: Point[],
  flowDirections: FlowDirections,
  pdcResults: Map<string, { dpTotal: number; dpPompe?: number }> | null,
  mixingNodes: Set<string>,
): Map<string, PumpHMTResult> {
  const pumpHMT = new Map<string, PumpHMTResult>()
  if (mixingNodes.size === 0) return pumpHMT

  const pumps = points.filter(p => p.type === 'pump')
  if (pumps.length === 0) return pumpHMT

  const retourSegs = segments.filter(s => s.type === 'retour')

  // ── 1. Détection des chaînes bypass (traversée physique : mélange → séparation) ──
  const bypassSegIds = new Set<string>()
  type MixSepPair = { mixId: string; sepId: string; bypassIds: string[] }
  const mixSepPairs: MixSepPair[] = []

  for (const mixId of mixingNodes) {
    const bypassIds: string[] = []
    const visitedSegs = new Set<string>()
    const visitedPts  = new Set<string>([mixId])
    let cur = mixId
    let sepId: string | null = null

    while (true) {
      const next = retourSegs.find(s =>
        !visitedSegs.has(s.id) &&
        (s.startPointId === cur || s.endPointId === cur)
      )
      if (!next) break
      visitedSegs.add(next.id)
      const nextNode = next.startPointId === cur ? next.endPointId : next.startPointId
      if (visitedPts.has(nextNode)) break
      visitedPts.add(nextNode)
      bypassIds.push(next.id)
      const retourCount = retourSegs.filter(s =>
        s.startPointId === nextNode || s.endPointId === nextNode
      ).length
      if (retourCount >= 3) { sepId = nextNode; break }
      cur = nextNode
    }

    if (!sepId) continue
    for (const id of bypassIds) bypassSegIds.add(id)
    mixSepPairs.push({ mixId, sepId, bypassIds })
  }

  if (mixSepPairs.length === 0) return pumpHMT

  // ── 2. Identification des tronçons secondaires de chaque circuit ──────────
  const secondaryByCircuit = new Map<string, Set<string>>()
  const allSecondaryIds    = new Set<string>()

  for (const { mixId, sepId, bypassIds } of mixSepPairs) {
    const secIds  = new Set<string>(bypassIds)
    const reached = new Set<string>([mixId])
    const queue   = [mixId]

    while (queue.length > 0) {
      const cur = queue.shift()!
      if (cur === sepId) continue

      for (const seg of segments) {
        if (bypassSegIds.has(seg.id)) continue
        const fd = flowDirections.get(seg.id)
        if (!fd || fd.fromId !== cur) continue
        secIds.add(seg.id)
        if (!reached.has(fd.toId)) {
          reached.add(fd.toId)
          queue.push(fd.toId)
        }
      }
    }

    secondaryByCircuit.set(mixId, secIds)
    for (const id of secIds) allSecondaryIds.add(id)
  }

  // ── 3. Classification et calcul HMT + chemin critique de chaque pompe ────
  for (const pump of pumps) {
    const adjSegIds = segments
      .filter(s => s.startPointId === pump.id || s.endPointId === pump.id)
      .map(s => s.id)

    const isSecondary = adjSegIds.some(id => allSecondaryIds.has(id))

    if (!isSecondary) {
      // Pompe primaire : le circuit primaire n'est pas une boucle complète via emitters,
      // donc computeCumDp échoue. On fait deux BFS séparés :
      //   1. production → nœud mélange (via aller primaires)
      //   2. nœud séparation → production (via retour primaires)
      // HMT = ΔP_aller_max + ΔP_retour
      const prodNode = points.find(p => isProduction(p))
      if (!prodNode) { pumpHMT.set(pump.id, { hmt: null, criticalSegIds: new Set(), isSecondary: false }); continue }

      const primAllerSegs  = segments.filter(s => s.type === 'aller'  && !allSecondaryIds.has(s.id))
      const primRetourSegs = segments.filter(s => s.type === 'retour' && !allSecondaryIds.has(s.id))

      // BFS 1 : production → mélange via aller primaires
      const allerDp   = new Map<string, number>([[prodNode.id, 0]])
      const allerPrev = new Map<string, string>()
      const allerQ    = [prodNode.id]
      const allerSeen = new Set<string>([prodNode.id])
      while (allerQ.length > 0) {
        const cur   = allerQ.shift()!
        const curDp = allerDp.get(cur) ?? 0
        for (const seg of primAllerSegs) {
          const fd = flowDirections.get(seg.id)
          if (!fd || fd.fromId !== cur) continue
          const r   = pdcResults?.get(seg.id)
          const dp  = r?.dpPompe ?? r?.dpTotal ?? 0
          const ndp = curDp + dp
          const prv = allerDp.get(fd.toId)
          if (prv == null || ndp > prv) { allerDp.set(fd.toId, ndp); allerPrev.set(fd.toId, seg.id) }
          if (!allerSeen.has(fd.toId)) { allerSeen.add(fd.toId); allerQ.push(fd.toId) }
        }
      }

      // Trouver le nœud mélange avec le ΔP aller le plus élevé (chemin le plus défavorisé)
      let maxAllerDp  = 0
      let critMixId: string | null = null
      for (const { mixId } of mixSepPairs) {
        const dp = allerDp.get(mixId) ?? 0
        if (dp > maxAllerDp) { maxAllerDp = dp; critMixId = mixId }
      }

      // BFS 2 : séparation → production via retour primaires
      const retourDp   = new Map<string, number>()
      const retourPrev = new Map<string, string>()
      const retourQ: string[] = []
      const retourSeen = new Set<string>()
      for (const { sepId } of mixSepPairs) {
        retourDp.set(sepId, 0); retourQ.push(sepId); retourSeen.add(sepId)
      }
      while (retourQ.length > 0) {
        const cur   = retourQ.shift()!
        const curDp = retourDp.get(cur) ?? 0
        for (const seg of primRetourSegs) {
          const fd = flowDirections.get(seg.id)
          if (!fd || fd.fromId !== cur) continue
          const r   = pdcResults?.get(seg.id)
          const dp  = r?.dpPompe ?? r?.dpTotal ?? 0
          const ndp = curDp + dp
          const prv = retourDp.get(fd.toId)
          if (prv == null || ndp > prv) { retourDp.set(fd.toId, ndp); retourPrev.set(fd.toId, seg.id) }
          if (!retourSeen.has(fd.toId)) { retourSeen.add(fd.toId); retourQ.push(fd.toId) }
        }
      }

      const primRetourDp = retourDp.get(prodNode.id) ?? 0
      const primaryHMT   = maxAllerDp + primRetourDp

      // Tracer le chemin critique : aller (production → mélange) + retour (séparation → production)
      const critPrim = new Set<string>()
      // Aller : remonter de critMixId → production via allerPrev
      if (critMixId) {
        let node: string = critMixId
        while (node !== prodNode.id) {
          const ps = allerPrev.get(node); if (!ps) break
          critPrim.add(ps)
          node = flowDirections.get(ps)?.fromId ?? ''; if (!node) break
        }
      }
      // Retour : remonter de prodNode → séparation via retourPrev
      {
        let node: string = prodNode.id
        while (true) {
          const ps = retourPrev.get(node); if (!ps) break
          critPrim.add(ps)
          node = flowDirections.get(ps)?.fromId ?? ''; if (!node) break
          if (mixSepPairs.some(p => p.sepId === node)) break
        }
      }

      pumpHMT.set(pump.id, { hmt: primaryHMT, criticalSegIds: critPrim, isSecondary: false })
    } else {
      // Pompe secondaire : ΔP de la boucle secondaire complète
      let hmtSec: number | null = null
      let critSec = new Set<string>()

      for (const [mixId, secIds] of secondaryByCircuit) {
        if (!adjSegIds.some(id => secIds.has(id))) continue

        const pair     = mixSepPairs.find(p => p.mixId === mixId)!
        const circSegs = segments.filter(s => secIds.has(s.id) && !bypassSegIds.has(s.id))

        const inCount  = new Map<string, number>()
        const resolved = new Map<string, number>()
        for (const s of circSegs) {
          const fd = flowDirections.get(s.id)
          if (!fd) continue
          inCount.set(fd.toId, (inCount.get(fd.toId) ?? 0) + 1)
        }

        // BFS depuis mélange, accumule max ΔP et trace le prédécesseur
        const nodeDp   = new Map<string, number>([[mixId, 0]])
        const prevSeg  = new Map<string, string>()   // nodeId → segId qui a donné le max ΔP
        resolved.set(mixId, inCount.get(mixId) ?? 0)
        const bfsQ   = [mixId]
        const queued = new Set<string>([mixId])

        while (bfsQ.length > 0) {
          const cur   = bfsQ.shift()!
          const curDp = nodeDp.get(cur) ?? 0
          const curPt = points.find(p => p.id === cur)
          const curEmDp = isTerminal(curPt) ? ((curPt.dp_emetteur ?? 0) + (curPt.dp_vanne_th ?? 0)) : 0

          for (const seg of circSegs) {
            const fd = flowDirections.get(seg.id)
            if (!fd || fd.fromId !== cur) continue

            const r     = pdcResults?.get(seg.id)
            const dp    = r?.dpPompe ?? r?.dpTotal ?? 0
            const newDp = curDp + curEmDp + dp
            const prev  = nodeDp.get(fd.toId)
            if (prev == null || newDp > prev) {
              nodeDp.set(fd.toId, newDp)
              prevSeg.set(fd.toId, seg.id)
            }

            const total = inCount.get(fd.toId) ?? 1
            const res   = (resolved.get(fd.toId) ?? 0) + 1
            resolved.set(fd.toId, res)
            if (res >= total && !queued.has(fd.toId)) {
              queued.add(fd.toId)
              bfsQ.push(fd.toId)
            }
          }
        }

        // Tracer le chemin critique : remonter de séparation à mélange via prevSeg
        const critIds = new Set<string>()
        let traceNode = pair.sepId
        while (traceNode !== mixId) {
          const ps = prevSeg.get(traceNode)
          if (!ps) break
          critIds.add(ps)
          const fd = flowDirections.get(ps)
          if (!fd) break
          traceNode = fd.fromId
        }
        // Ajouter le bypass (séparation → mélange)
        for (const id of pair.bypassIds) critIds.add(id)

        const dpAtSep  = nodeDp.get(pair.sepId) ?? 0
        const bypassDp = pair.bypassIds.reduce((sum, id) => {
          const r = pdcResults?.get(id)
          return sum + (r?.dpPompe ?? r?.dpTotal ?? 0)
        }, 0)
        hmtSec = dpAtSep + bypassDp
        critSec = critIds
        break
      }

      pumpHMT.set(pump.id, { hmt: hmtSec, criticalSegIds: critSec, isSecondary: true })
    }
  }

  return pumpHMT
}
