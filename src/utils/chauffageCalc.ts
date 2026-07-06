import type { Segment, Point, FlowDirections, ChauffageParams } from '../types'
import { getDi_mm } from './flowCalc'

const RHO_CP = 1163 // Wh/(m³·K) ≈ ρ·cp eau à 50°C

// Q (m³/h) pour un émetteur de puissance P (W) avec ΔT (°C)
export function emetteurFlowRate(puissanceW: number, deltaT: number): number {
  if (deltaT <= 0 || puissanceW <= 0) return 0
  return puissanceW / (RHO_CP * deltaT)
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
  const root = points.find(p => p.type === 'productionChauffage')
  if (!root) return new Map()

  const distAller  = dijkstra(root.id, segments, 'aller')
  const distRetour = dijkstra(root.id, segments, 'retour')

  const result: FlowDirections = new Map()
  for (const seg of segments) {
    const distMap = seg.type === 'aller' ? distAller : distRetour
    const dStart  = distMap.get(seg.startPointId) ?? Infinity
    const dEnd    = distMap.get(seg.endPointId)   ?? Infinity

    if (!isFinite(dStart) && !isFinite(dEnd)) {
      result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      continue
    }

    if (seg.type === 'aller') {
      // s'éloigne de la production
      if (dStart <= dEnd) result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      else                result.set(seg.id, { fromId: seg.endPointId,   toId: seg.startPointId })
    } else {
      // revient vers la production
      if (dStart >= dEnd) result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      else                result.set(seg.id, { fromId: seg.endPointId,   toId: seg.startPointId })
    }
  }
  return result
}

/** Map nodeId → Q émetteur (m³/h). 0 pour les nœuds non émetteurs. */
function buildEmetteurQMap(points: Point[], chauffageParams: ChauffageParams): Map<string, number> {
  const map = new Map<string, number>()
  for (const pt of points) {
    if (pt.type !== 'emetteur') continue
    const dT = pt.deltaT_emetteur ?? chauffageParams.deltaT_reseau
    map.set(pt.id, emetteurFlowRate(pt.puissance ?? 0, dT))
  }
  return map
}

/**
 * Q aller au niveau d'un nœud = somme des Q émetteurs dans le sous-arbre aller
 * (nœud inclus + tous les nœuds en aval via tronçons aller).
 */
function allerNodeQ(
  nodeId: string, segments: Segment[], emetteurQs: Map<string, number>,
  flowDirections: FlowDirections, memo: Map<string, number>
): number {
  if (memo.has(nodeId)) return memo.get(nodeId)!
  memo.set(nodeId, 0) // placeholder — brise les cycles avant la récursion
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

/**
 * Q retour collecté au niveau d'un nœud = Q émetteur local + somme des Q collectés
 * par tous les tronçons retour dont ce nœud est le destination (aval côté émetteur).
 */
function retourNodeQ(
  nodeId: string, segments: Segment[], emetteurQs: Map<string, number>,
  flowDirections: FlowDirections, memo: Map<string, number>
): number {
  if (memo.has(nodeId)) return memo.get(nodeId)!
  memo.set(nodeId, 0) // placeholder — brise les cycles avant la récursion
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

export interface ChauffageFlowEntry {
  flowRate: number | null
  velocity: number | null
  puissanceAmont: number | null  // W — puissance totale en amont (pour info)
}

export interface ChauffageThermalEntry {
  T_from: number | null
  T_to:   number | null
}

export interface ChauffageThermalResults {
  segResults:   Map<string, ChauffageThermalEntry>
  nodeRetourT:  Map<string, number | null>  // T retour à chaque nœud côté retour
}

/**
 * Mode simplifié : T_aller = T_depart partout.
 * T_retour de chaque émetteur = T_depart − ΔT_émetteur.
 * Propagation côté retour par moyenne pondérée aux nœuds de confluence.
 */
export function computeChauffageThermalSimple(
  segments: Segment[], points: Point[],
  chauffageParams: ChauffageParams,
  flowDirections: FlowDirections,
  chauffageFlows: Map<string, ChauffageFlowEntry>
): ChauffageThermalResults {
  const { T_depart, deltaT_reseau } = chauffageParams
  const segResults  = new Map<string, ChauffageThermalEntry>()
  const nodeRetourT = new Map<string, number | null>()

  // T retour au nœud (côté retour) — DFS avec mémo
  function retourT(nodeId: string): number | null {
    if (nodeRetourT.has(nodeId)) return nodeRetourT.get(nodeId)!
    nodeRetourT.set(nodeId, null) // garde anti-cycle

    const pt = points.find(p => p.id === nodeId)
    if (pt?.type === 'emetteur') {
      const dT = pt.deltaT_emetteur ?? deltaT_reseau
      const T  = T_depart - dT
      nodeRetourT.set(nodeId, T)
      return T
    }

    // Tronçons retour dont ce nœud est la destination (dir.toId === nodeId)
    const incoming = segments.filter(s => {
      if (s.type !== 'retour') return false
      const dir = flowDirections.get(s.id)
      return dir?.toId === nodeId
    })
    if (incoming.length === 0) { nodeRetourT.set(nodeId, null); return null }

    let totalQ = 0, totalQT = 0
    for (const seg of incoming) {
      const dir = flowDirections.get(seg.id)!
      const T   = retourT(dir.fromId)
      const Q   = chauffageFlows.get(seg.id)?.flowRate ?? 0
      if (T != null && Q > 0) { totalQ += Q; totalQT += Q * T }
    }
    const T = totalQ > 0
      ? totalQT / totalQ
      : (incoming.length > 0 ? (T_depart - deltaT_reseau) : null)
    nodeRetourT.set(nodeId, T)
    return T
  }

  for (const seg of segments) {
    const dir = flowDirections.get(seg.id)
    if (!dir) { segResults.set(seg.id, { T_from: null, T_to: null }); continue }

    if (seg.type === 'aller') {
      segResults.set(seg.id, { T_from: T_depart, T_to: T_depart })
    } else {
      // Mode simplifié : T constante le long du tronçon retour
      const T = retourT(dir.fromId)
      segResults.set(seg.id, { T_from: T, T_to: T })
    }
  }

  return { segResults, nodeRetourT }
}

/**
 * Calcule les débits et vitesses pour chaque tronçon du réseau chauffage.
 *
 * Aller  : Q = somme des Q émetteurs en aval dans l'arbre aller.
 * Retour : Q = somme des Q émetteurs collectés en amont dans l'arbre retour.
 */
export function computeChauffageFlows(
  segments: Segment[], points: Point[], materials: any[],
  chauffageParams: ChauffageParams, flowDirections: FlowDirections
): Map<string, ChauffageFlowEntry> {
  const emetteurQs = buildEmetteurQMap(points, chauffageParams)
  const allerMemo  = new Map<string, number>()
  const retourMemo = new Map<string, number>()
  const result     = new Map<string, ChauffageFlowEntry>()

  for (const seg of segments) {
    const dir = flowDirections.get(seg.id)
    if (!dir) {
      result.set(seg.id, { flowRate: null, velocity: null, puissanceAmont: null })
      continue
    }

    const flowRate = seg.type === 'aller'
      ? allerNodeQ(dir.toId, segments, emetteurQs, flowDirections, allerMemo)
      : retourNodeQ(dir.fromId, segments, emetteurQs, flowDirections, retourMemo)

    const di_mm  = getDi_mm(seg, materials)
    let velocity: number | null = null
    if (di_mm != null && flowRate > 0) {
      const area = Math.PI * (di_mm / 1000) ** 2 / 4
      velocity = flowRate / (area * 3600)
    }

    // Puissance amont en W (pour tableau de résultats)
    const puissanceAmont = flowRate > 0 ? flowRate * RHO_CP * chauffageParams.deltaT_reseau : 0

    result.set(seg.id, { flowRate, velocity, puissanceAmont })
  }

  return result
}
