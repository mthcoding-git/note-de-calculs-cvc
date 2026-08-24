// ── Types ─────────────────────────────────────────────────────────────────────

export type CircJunctionType =
  | 'tee-oblique'      // piquage en T (branche latérale à angle α, 30°–90°)
  | 'wye-symetrique'   // culotte symétrique (Y), deux branches à α/2
  | 'wye-asymetrique'  // culotte asymétrique, branche 1 à α1, branche 2 à α2

export interface VentNodeJunction {
  id: string
  type: CircJunctionType
  straightSegId?: string  // segId de la branche "droite" (tee-oblique)
  alpha_deg?: number      // angle branche latérale (tee-oblique) / total (wye-symetrique)
  alpha1_deg?: number     // angle branche 1 (wye-asymetrique)
  alpha2_deg?: number     // angle branche 2 (wye-asymetrique)
  branch1SegId?: string   // segId de la branche 1 (wye-asymetrique)
}

// ── Labels ────────────────────────────────────────────────────────────────────

export const JUNCTION_LABELS: Record<CircJunctionType, string> = {
  'tee-oblique':     'Piquage en T',
  'wye-symetrique':  'Culotte symétrique (Y)',
  'wye-asymetrique': 'Culotte asymétrique',
}

export const JUNCTION_NEEDS_ANGLE: Record<CircJunctionType, boolean> = {
  'tee-oblique':    true,
  'wye-symetrique': true,
  'wye-asymetrique': false,
}

export const JUNCTION_ANGLE_RANGE: Record<CircJunctionType, [number, number]> = {
  'tee-oblique':    [30, 90],
  'wye-symetrique': [60, 180],
  'wye-asymetrique': [15, 90],
}

// ── Interpolation ─────────────────────────────────────────────────────────────

function lerp(x0: number, x1: number, y0: number, y1: number, x: number): number {
  return y0 + (y1 - y0) * (x - x0) / (x1 - x0)
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v))
}

function interp1d(xs: number[], ys: number[], x: number): number {
  const xc = clamp(x, xs[0], xs[xs.length - 1])
  for (let i = 1; i < xs.length; i++) {
    if (xc <= xs[i]) return lerp(xs[i - 1], xs[i], ys[i - 1], ys[i], xc)
  }
  return ys[ys.length - 1]
}

// ── Facteurs Idelchik Chap. 7 ─────────────────────────────────────────────────

// C_α : table Idelchik — angle branche latérale → facteur de correction
const CA_ANGLES = [30,   45,   60,   90  ]
const CA_VALUES = [1.74, 1.41, 1.00, 0.00]

function facteurCa(alpha_deg: number): number {
  return interp1d(CA_ANGLES, CA_VALUES, alpha_deg)
}

// A : facteur réducteur (atténue les pertes si F_b ≥ 35% F_c)
function facteurA(Fb_over_Fc: number, Qb_over_Qc: number): number {
  if (Fb_over_Fc <= 0.35) return 1.0
  if (Qb_over_Qc <= 0.4)  return 0.9 * (1 - Qb_over_Qc)
  return 0.55
}

// ── Formules exportées ────────────────────────────────────────────────────────

/**
 * ξ branche droite — T-90° et T-oblique (Idelchik 7-22 / 7-23)
 * ξ rapporté à ρv_c²/2 (pression dynamique du collecteur aval).
 *
 * @param Qb_over_Qc  débit de la branche LATÉRALE / débit collecteur
 */
export function xiJunctionStraight(Qb_over_Qc: number): number {
  const k = clamp(Qb_over_Qc, 0, 1)
  return 1.55 * k - k * k
}

/**
 * ξ branche latérale — T-90° ou T-oblique (Idelchik 7-22 / 7-23)
 * Pour T-90° : passer alpha_deg = 90 → C_α = 0.
 *
 * @param Qb_over_Qc  débit cette branche / débit collecteur
 * @param Fb_over_Fc  section cette branche / section collecteur
 * @param alpha_deg   angle de la branche par rapport à l'axe commun
 */
export function xiJunctionBranch(
  Qb_over_Qc: number,
  Fb_over_Fc: number,
  alpha_deg: number,
): number {
  const k  = clamp(Qb_over_Qc, 0, 1)
  const r  = Fb_over_Fc > 0 ? 1 / Fb_over_Fc : 1  // F_c / F_b
  const A  = facteurA(Fb_over_Fc, k)
  const Ca = facteurCa(alpha_deg)
  return A * (1 + (k * r) ** 2 - 2 * (1 - k) ** 2 - Ca * r * k * k)
}

/**
 * ξ chaque branche — culotte symétrique Y (Idelchik 7-29)
 *
 * @param Qb_over_Qc  débit cette branche / débit collecteur
 * @param Fb_over_Fc  section cette branche / section collecteur
 * @param alpha_deg   angle de la branche par rapport à l'axe commun
 */
export function xiJunctionWye(
  Qb_over_Qc: number,
  Fb_over_Fc: number,
  alpha_deg: number,
): number {
  const k  = clamp(Qb_over_Qc, 0, 1)
  const r  = Fb_over_Fc > 0 ? 1 / Fb_over_Fc : 1  // F_c / F_b
  const Ca = facteurCa(alpha_deg)
  return 1 - (1 - k) ** 2 - Ca * r * k * k
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export interface JunctionBranchInput {
  segId: string
  Q_m3h: number
  di_mm: number
  isStraight: boolean  // true = branche droite (T uniquement)
}

/**
 * Calcule ξ pour chaque branche entrante d'une réunion circulaire.
 * Retourne Map<segId, ξ>.
 * ξ est rapporté à ρv_c²/2 (pression dynamique du collecteur aval).
 */
export function computeXiJunction(
  junction: VentNodeJunction,
  branches: JunctionBranchInput[],
  Qc_m3h: number,
  Dc_mm: number,
): Map<string, number> {
  const result = new Map<string, number>()
  const Fc = Math.PI * (Dc_mm / 2) ** 2
  if (Qc_m3h <= 0 || Fc <= 0) return result

  for (const br of branches) {
    const Fb   = Math.PI * (br.di_mm / 2) ** 2
    const k    = br.Q_m3h / Qc_m3h  // Q_b / Q_c
    const fbfc = Fb / Fc             // F_b / F_c
    let xi: number

    if (junction.type === 'wye-symetrique') {
      xi = xiJunctionWye(k, fbfc, (junction.alpha_deg ?? 90) / 2)
    } else if (junction.type === 'wye-asymetrique') {
      const isBranch1 = br.segId === junction.branch1SegId
      const angle = isBranch1 ? (junction.alpha1_deg ?? 45) : (junction.alpha2_deg ?? 45)
      xi = xiJunctionWye(k, fbfc, angle)
    } else if (br.isStraight) {
      // ξ droite utilise le débit de la latérale : Q_latérale = Q_c - Q_s
      const kLateral = clamp((Qc_m3h - br.Q_m3h) / Qc_m3h, 0, 1)
      xi = xiJunctionStraight(kLateral)
    } else {
      xi = xiJunctionBranch(k, fbfc, junction.alpha_deg ?? 90)
    }
    result.set(br.segId, xi)
  }
  return result
}

// ── Types réunion rectangulaire ──────────────────────────────────────────────

export type RectJunctionType = 'rect-tee-oblique' | 'rect-wye-symetrique' | 'rect-wye-asymetrique'

export interface RectNodeJunction {
  id:             string
  type:           RectJunctionType
  straightSegId?: string
  alpha_deg?:     number
  alpha1_deg?:    number
  alpha2_deg?:    number
  branch1SegId?:  string
}

export const RECT_JUNCTION_LABELS: Record<RectJunctionType, string> = {
  'rect-tee-oblique':    'Piquage en T',
  'rect-wye-symetrique': 'Culotte symétrique (Y)',
  'rect-wye-asymetrique': 'Culotte asymétrique',
}

export const RECT_JUNCTION_NEEDS_ANGLE: Record<RectJunctionType, boolean> = {
  'rect-tee-oblique':    true,
  'rect-wye-symetrique': true,
  'rect-wye-asymetrique': false,
}

export const RECT_JUNCTION_ANGLE_RANGE: Record<RectJunctionType, [number, number]> = {
  'rect-tee-oblique':    [30, 90],
  'rect-wye-symetrique': [60, 180],
  'rect-wye-asymetrique': [15, 90],
}

export interface JunctionBranchRectInput {
  segId:      string
  Q_m3h:     number
  a_mm:      number
  b_mm:      number
  isStraight: boolean
}

/**
 * Calcule ξ pour chaque branche entrante d'une réunion rectangulaire.
 * Mêmes formules Idelchik Chap. 7 que le circulaire ; sections F = a × b (mm²).
 * ξ rapporté à ρv_c²/2 (pression dynamique du collecteur aval).
 */
export function computeXiJunctionRect(
  junction: RectNodeJunction,
  branches: JunctionBranchRectInput[],
  Qc_m3h:  number,
  ac_mm:   number,
  bc_mm:   number,
): Map<string, number> {
  const result = new Map<string, number>()
  const Fc = ac_mm * bc_mm
  if (Qc_m3h <= 0 || Fc <= 0) return result

  for (const br of branches) {
    const Fb   = br.a_mm * br.b_mm
    const k    = br.Q_m3h / Qc_m3h
    const fbfc = Fb / Fc
    let xi: number

    if (junction.type === 'rect-wye-symetrique') {
      xi = xiJunctionWye(k, fbfc, (junction.alpha_deg ?? 90) / 2)
    } else if (junction.type === 'rect-wye-asymetrique') {
      const isBranch1 = br.segId === junction.branch1SegId
      const angle = isBranch1 ? (junction.alpha1_deg ?? 45) : (junction.alpha2_deg ?? 45)
      xi = xiJunctionWye(k, fbfc, angle)
    } else if (br.isStraight) {
      const kLateral = clamp((Qc_m3h - br.Q_m3h) / Qc_m3h, 0, 1)
      xi = xiJunctionStraight(kLateral)
    } else {
      xi = xiJunctionBranch(k, fbfc, junction.alpha_deg ?? 90)
    }
    result.set(br.segId, xi)
  }
  return result
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

export function newJunctionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}
