import type { Material, Segment, Point, FlowDirections } from '../types'
import { FITTING_TYPES, EQUIPMENT_TYPES } from './pdcCalc'

// ── Directions d'écoulement ventilation ─────────────────────────────────────

function dijkstra(startId: string, segs: Segment[]): Map<string, number> {
  const dist = new Map<string, number>([[startId, 0]])
  const queue: [number, string][] = [[0, startId]]
  while (queue.length) {
    queue.sort((a, b) => a[0] - b[0])
    const [d, id] = queue.shift()!
    if (d > (dist.get(id) ?? Infinity)) continue
    for (const seg of segs) {
      if (seg.startPointId !== id && seg.endPointId !== id) continue
      const nb  = seg.startPointId === id ? seg.endPointId : seg.startPointId
      const nd  = d + (seg.length_override ?? 1)
      if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); queue.push([nd, nb]) }
    }
  }
  return dist
}

/**
 * Directions d'écoulement ventilation basées sur pipeSubType :
 * - 'soufflage' + 'air-rejete' : CTA → extrémités (aller)
 * - 'reprise'   + 'air-neuf'   : extrémités → CTA  (retour)
 */
export function computeFlowDirectionsVentilation(segments: Segment[], points: Point[]): FlowDirections {
  const cta = points.find(p => p.type === 'cta')
  if (!cta) return new Map()

  const getSubType = (s: Segment): string =>
    (s as any).pipeSubType ?? (s.type === 'retour' ? 'reprise' : 'soufflage')
  const isAllerSeg = (s: Segment): boolean => {
    const st = getSubType(s)
    return st === 'soufflage' || st === 'air-rejete'
  }

  const allerSegs  = segments.filter(isAllerSeg)
  const retourSegs = segments.filter(s => !isAllerSeg(s))

  const distAller  = dijkstra(cta.id, allerSegs)
  const distRetour = dijkstra(cta.id, retourSegs)

  const result: FlowDirections = new Map()
  for (const seg of segments) {
    const aller   = isAllerSeg(seg)
    const distMap = aller ? distAller : distRetour
    const dStart  = distMap.get(seg.startPointId) ?? Infinity
    const dEnd    = distMap.get(seg.endPointId)   ?? Infinity

    if (!isFinite(dStart) && !isFinite(dEnd)) {
      result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      continue
    }

    if (aller) {
      // CTA → extrémités : le nœud le plus proche de la CTA est l'entrée
      if (dStart <= dEnd) result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      else                result.set(seg.id, { fromId: seg.endPointId,   toId: seg.startPointId })
    } else {
      // Extrémités → CTA : le nœud le plus loin de la CTA est l'entrée
      if (dStart >= dEnd) result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
      else                result.set(seg.id, { fromId: seg.endPointId,   toId: seg.startPointId })
    }
  }
  return result
}

// ── Propriétés physiques de l'air ────────────────────────────────────────────

const EPS_DEFAULT = 0.15  // mm — rugosité acier galvanisé spiralé

/** Masse volumique et viscosité cinématique de l'air en fonction de la température. */
function airProps(T_C: number): { rho: number; nu: number } {
  const T_K = T_C + 273.15
  const rho = 101325 / (287.058 * T_K)                  // kg/m³ — loi des gaz parfaits
  const mu  = 1.458e-6 * T_K ** 1.5 / (T_K + 110.4)   // Pa·s  — loi de Sutherland
  return { rho, nu: mu / rho }
}

// ── Températures par réseau (issues de la CTA) ───────────────────────────────

export interface CtaTemps {
  T_soufflage: number  // air soufflé  (°C)
  T_reprise:   number  // air extrait  (°C)
  T_airNeuf:   number  // air neuf     (°C)
  T_airRejete: number  // air rejeté   (°C)
}

export const DEFAULT_CTA_TEMPS: CtaTemps = {
  T_soufflage:  18,
  T_reprise:    20,
  T_airNeuf:    -8,
  T_airRejete:  20,
}

function getTempForSubType(pipeSubType: string, temps: CtaTemps): number {
  if (pipeSubType === 'soufflage')   return temps.T_soufflage
  if (pipeSubType === 'reprise')     return temps.T_reprise
  if (pipeSubType === 'air-neuf')    return temps.T_airNeuf
  if (pipeSubType === 'air-rejete')  return temps.T_airRejete
  return 20
}

// ── Calcul débits ventilation (loi des nœuds) ───────────────────────────────

export interface VentFlow {
  flowRate: number | null
  v_ms:     number | null
  source:   'manual' | 'bouche' | 'computed' | null
  hasError: boolean
}

/**
 * Calcule les débits de chaque tronçon ventilation par loi des nœuds.
 *
 * Sources initiales (par priorité) :
 *   1. seg.flowRate — valeur manuelle (ancrage)
 *   2. pt.debit_nominal sur une bouche reliée à un seul tronçon terminal
 *
 * Propagation : ΣQ_entrant = ΣQ_sortant en chaque nœud intermédiaire.
 */
export function computeVentilationFlows(
  segments:             Segment[],
  points:               Point[],
  flowDirections:       FlowDirections,
  materialsVentilation: Material[],
): Map<string, VentFlow> {
  const TOLE = 1e-9

  // ── 1. Initialiser depuis les valeurs manuelles ──────────────────────────
  const flowMap = new Map<string, { value: number | null; source: string | null }>()
  for (const seg of segments) {
    const q = (seg as any).flowRate ?? null
    flowMap.set(seg.id, q != null ? { value: q, source: 'manual' } : { value: null, source: null })
  }

  // ── 2. Initialiser depuis les débits nominaux des bouches ────────────────
  for (const pt of points) {
    if (pt.type !== 'boucheVentilation') continue
    const debit = (pt as any).debit_nominal
    if (debit == null || debit <= 0) continue
    const connSegs = segments.filter(s => s.startPointId === pt.id || s.endPointId === pt.id)
    if (connSegs.length === 1 && flowMap.get(connSegs[0].id)?.source == null) {
      flowMap.set(connSegs[0].id, { value: debit, source: 'bouche' })
    }
  }

  // ── 3. Propagation itérative (Kirchhoff) ────────────────────────────────
  let changed = true
  const maxIter = segments.length + 4
  for (let iter = 0; changed && iter < maxIter; iter++) {
    changed = false
    for (const pt of points) {
      const incident = segments.filter(s => {
        const d = flowDirections.get(s.id)
        return d && (s.startPointId === pt.id || s.endPointId === pt.id)
      })
      if (incident.length < 2) continue

      const inSegs   = incident.filter(s => flowDirections.get(s.id)!.toId   === pt.id)
      const outSegs  = incident.filter(s => flowDirections.get(s.id)!.fromId === pt.id)

      const knownIn    = inSegs.filter(s  => flowMap.get(s.id)!.value != null)
      const unknownIn  = inSegs.filter(s  => flowMap.get(s.id)!.value == null)
      const knownOut   = outSegs.filter(s => flowMap.get(s.id)!.value != null)
      const unknownOut = outSegs.filter(s => flowMap.get(s.id)!.value == null)

      const sumIn  = knownIn.reduce((a, s)  => a + flowMap.get(s.id)!.value!, 0)
      const sumOut = knownOut.reduce((a, s) => a + flowMap.get(s.id)!.value!, 0)

      if (unknownIn.length === 0 && unknownOut.length === 1) {
        flowMap.set(unknownOut[0].id, { value: Math.max(0, sumIn - sumOut), source: 'computed' })
        changed = true
      } else if (unknownIn.length === 1 && unknownOut.length === 0) {
        flowMap.set(unknownIn[0].id, { value: Math.max(0, sumOut - sumIn), source: 'computed' })
        changed = true
      }
    }
  }

  // ── 4. Détection d'incohérences ──────────────────────────────────────────
  const errorSegs = new Set<string>()
  for (const pt of points) {
    const incident = segments.filter(s => {
      const d = flowDirections.get(s.id)
      return d && (s.startPointId === pt.id || s.endPointId === pt.id)
    })
    if (incident.length < 2) continue
    if (!incident.every(s => flowMap.get(s.id)?.value != null)) continue

    const inSegs  = incident.filter(s => flowDirections.get(s.id)!.toId   === pt.id)
    const outSegs = incident.filter(s => flowDirections.get(s.id)!.fromId === pt.id)
    const sumIn   = inSegs.reduce((a, s)  => a + flowMap.get(s.id)!.value!, 0)
    const sumOut  = outSegs.reduce((a, s) => a + flowMap.get(s.id)!.value!, 0)
    if (Math.abs(sumIn - sumOut) > TOLE) {
      for (const seg of incident) {
        if (flowMap.get(seg.id)?.source === 'manual') errorSegs.add(seg.id)
      }
    }
  }

  // ── 5. Calcul des vitesses et résultat ──────────────────────────────────
  const result = new Map<string, VentFlow>()
  for (const seg of segments) {
    const { value: flowRate, source } = flowMap.get(seg.id) ?? { value: null, source: null }
    let v_ms: number | null = null
    if (flowRate != null && flowRate > 0) {
      const ventDi = getVentDi(seg, materialsVentilation)
      if (ventDi) {
        const Dh = ventDi.di_mm / 1000
        const A = (ventDi.shape === 'rectangular' && ventDi.a_mm && ventDi.b_mm)
          ? (ventDi.a_mm * ventDi.b_mm) / 1e6
          : Math.PI * (Dh / 2) ** 2
        v_ms = (flowRate / 3600) / A
      }
    }
    result.set(seg.id, {
      flowRate,
      v_ms,
      source: source as VentFlow['source'],
      hasError: errorSegs.has(seg.id),
    })
  }
  return result
}

// ── Calcul PDC ventilation ────────────────────────────────────────────────────

function frictionFactor(Re: number, eps_mm: number, D_mm: number): number {
  if (Re <= 0) return 0
  if (Re < 2300) return 64 / Re
  const e_D  = eps_mm / D_mm
  const arg  = e_D / 3.7 + 5.74 / Math.pow(Re, 0.9)
  return 0.25 / Math.pow(Math.log10(arg), 2)
}

export interface VentSegResult {
  Q_m3h:       number
  v_ms:        number
  dp_Pa_m:     number
  dp_Pa:       number          // ΔP linéaire
  dp_sing_Pa:  number          // ΔP singulières (accessoires ξ)
  dp_equip_Pa: number          // ΔP équipements (valeurs nominales en Pa)
  dp_total_Pa: number          // ΔP totale = linéaire + singulières + équipements
  Re:          number
  di_mm:       number          // Ø intérieur (circulaire) ou Dh (rectangulaire)
  shape:       'circular' | 'rectangular'
  a_mm?:       number          // rectangulaire : largeur
  b_mm?:       number          // rectangulaire : hauteur
  T_air:       number          // température de l'air utilisée (°C)
  rho:         number          // masse volumique utilisée (kg/m³)
}

export function computeVentSegResult(
  Q_m3h:  number,
  di_mm:  number,
  L_m:    number,
  eps_mm  = EPS_DEFAULT,
  shape:  'circular' | 'rectangular' = 'circular',
  a_mm?:  number,
  b_mm?:  number,
  T_air   = 20,
): VentSegResult | null {
  if (Q_m3h <= 0 || di_mm <= 0 || L_m <= 0) return null
  const { rho, nu } = airProps(T_air)
  const Dh = di_mm / 1000   // m — Dh (=D pour circulaire, diamètre hydraulique pour rectangulaire)
  const A  = (shape === 'rectangular' && a_mm && b_mm)
    ? (a_mm * b_mm) / 1e6   // m² — section réelle rectangulaire
    : Math.PI * (Dh / 2) ** 2
  const v       = (Q_m3h / 3600) / A
  const Re      = v * Dh / nu
  const f       = frictionFactor(Re, eps_mm, di_mm)
  const dp_Pa_m = f * rho * v * v / (2 * Dh)
  const dp_Pa   = dp_Pa_m * L_m
  return {
    Q_m3h, v_ms: v, dp_Pa_m, dp_Pa, dp_sing_Pa: 0, dp_equip_Pa: 0, dp_total_Pa: dp_Pa,
    Re, di_mm, shape, T_air, rho,
    ...(shape === 'rectangular' ? { a_mm, b_mm } : {}),
  }
}

export interface VentDiResult {
  di_mm:  number
  eps_mm: number
  shape:  'circular' | 'rectangular'
  a_mm?:  number
  b_mm?:  number
}

export function getVentDi(seg: Segment, materials: Material[]): VentDiResult | null {
  const mat = materials.find(m => m.id === seg.materialId && m.enabled)
  if (!mat) return null

  if (mat.shapeType === 'rectangular') {
    const dnDef = mat.dns.find(d => d.dn === (seg as any).dn) as any
    if (!dnDef) return null
    const dh = (seg as any).di_override ?? dnDef.dh ?? dnDef.di
    if (dh == null) return null
    return { di_mm: dh, eps_mm: mat.epsilon ?? EPS_DEFAULT, shape: 'rectangular', a_mm: dnDef.a, b_mm: dnDef.b }
  }

  const di_mm = (seg as any).di_override ?? mat.dns.find(d => d.dn === (seg as any).dn)?.di ?? null
  if (di_mm == null) return null
  return { di_mm, eps_mm: mat.epsilon ?? EPS_DEFAULT, shape: 'circular' }
}

/** ΔP équipements ventilation : somme des ΔP nominaux (Pa) stockés dans la bibliothèque. */
function computeVentEquipDP(seg: Segment, pdcParams: any): number {
  if (!pdcParams?.equipementsActifs) return 0
  const equipList: any[] = (seg as any).equipment ?? []
  if (equipList.length === 0) return 0
  const libOverrides = pdcParams?.equipmentOverrides ?? {}
  const customE: any[] = pdcParams?.customEquipments ?? []
  return equipList.reduce((sum: number, e: any) => {
    const dp = e.dpOverride
      ?? libOverrides[e.type]
      ?? (EQUIPMENT_TYPES as any[]).find(t => t.id === e.type)?.dpDefault
      ?? customE.find((t: any) => t.id === e.type)?.dpDefault
      ?? 0
    return sum + dp
  }, 0)
}

/** ΔP singulières via accessoires ξ (pression dynamique ρv²/2). */
function computeVentSingDP(seg: Segment, dynPressure: number, pdcParams: any): number {
  const fittings: any[] = (seg as any).fittings ?? []
  if (fittings.length === 0) return 0
  const libOverrides = pdcParams?.fittingOverrides ?? {}
  const customF: any[] = pdcParams?.customFittings ?? []
  return fittings.reduce((sum: number, f: any) => {
    const xi = f.xiOverride
      ?? libOverrides[f.type]
      ?? FITTING_TYPES.find((t: any) => t.id === f.type)?.xi
      ?? customF.find((t: any) => t.id === f.type)?.xi
      ?? 0
    return sum + xi * (f.count ?? 1) * dynPressure
  }, 0)
}

export function computeVentilationResults(
  segments:             Segment[],
  materialsVentilation: Material[],
  ctaTemps:             CtaTemps = DEFAULT_CTA_TEMPS,
  pdcParams?:           any,
  ventFlows?:           Map<string, VentFlow>,
): Map<string, VentSegResult> {
  const result = new Map<string, VentSegResult>()
  for (const seg of segments) {
    const ventDi = getVentDi(seg, materialsVentilation)
    if (!ventDi) continue
    const Q = ventFlows?.get(seg.id)?.flowRate ?? (seg as any).flowRate
    if (Q == null || Q <= 0) continue   // débit requis ; longueur facultative (J calculé sans L)
    const L: number | null = (seg as any).length_override ?? null
    const pipeSubType = (seg as any).pipeSubType ?? 'soufflage'
    const T_air = getTempForSubType(pipeSubType, ctaTemps)

    const { rho, nu } = airProps(T_air)
    const Dh      = ventDi.di_mm / 1000
    const A       = (ventDi.shape === 'rectangular' && ventDi.a_mm && ventDi.b_mm)
      ? (ventDi.a_mm * ventDi.b_mm) / 1e6
      : Math.PI * (Dh / 2) ** 2
    const v       = (Q / 3600) / A
    const Re      = v * Dh / nu
    const f       = frictionFactor(Re, ventDi.eps_mm, ventDi.di_mm)
    const dp_Pa_m = f * rho * v * v / (2 * Dh)
    const dp_Pa   = (L != null && L > 0) ? dp_Pa_m * L : 0

    const dynPressure  = 0.5 * rho * v ** 2
    const dp_sing_Pa   = computeVentSingDP(seg, dynPressure, pdcParams)
    const dp_equip_Pa  = computeVentEquipDP(seg, pdcParams)

    result.set(seg.id, {
      Q_m3h: Q, v_ms: v, dp_Pa_m, dp_Pa, dp_sing_Pa, dp_equip_Pa,
      dp_total_Pa: dp_Pa + dp_sing_Pa + dp_equip_Pa,
      Re, di_mm: ventDi.di_mm, shape: ventDi.shape, T_air, rho,
      ...(ventDi.shape === 'rectangular' ? { a_mm: ventDi.a_mm, b_mm: ventDi.b_mm } : {}),
    })
  }
  return result
}
