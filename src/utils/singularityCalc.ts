// ── Types circulaires ─────────────────────────────────────────────────────────
export type CircSingularityType =
  | 'coude-lisse'
  | 'coude-segmente'
  | 'coude-onglet'
  | 'coude-z'

// ── Types rectangulaires ──────────────────────────────────────────────────────
export type RectSingularityType =
  | 'rect-rayon-lisse'
  | 'rect-onglet'
  | 'rect-aubes'
  | 'rect-onglet-aubes'

export type SingularityType = CircSingularityType | RectSingularityType

export interface VentSingularity {
  id:           string
  type:         SingularityType
  angle:        number                    // δ (degrés, 1–180)
  count?:       number                    // quantité (défaut 1)
  // Circulaire
  rOverD?:      number                    // r/D — coude-lisse (0,50–2,50, ASHRAE 3-1)
  nPieces?:     3 | 4 | 5                  // nb éléments — coude-segmenté (ASHRAE 3-2)
  lOverD?:      number                    // L/D — coude-z (0–3, ASHRAE 3-4)
  typeAubes?:   'simple' | 'double'       // (réservé schéma)
  nVanes?:      1 | 2 | 3                 // nb aubes séparatrices — rect-aubes (ASHRAE 3-7)
  // Rectangulaire
  orientation?: 'horizontal' | 'vertical' // plan du coude
  l_mm?:        number                    // largeur gaine (mm)
  h_mm?:        number                    // hauteur gaine (mm)
  rOverA?:      number                    // r/W — rect-rayon-lisse (0,50–2,00, ASHRAE 3-5)
  rOverB?:      number                    // r/W — rect-aubes axe central (0,55–1,00, ASHRAE 3-7)
  // rect-onglet-aubes (ASHRAE 3-8 / 3-9)
  vaneThickness?: 'simple' | 'double'    // 3-8 = simple, 3-9 = double
  design38?:    1 | 2 | 3               // design ASHRAE 3-8
  design39?:    1 | 2 | 3 | 4           // design ASHRAE 3-9
}

// ── Interpolation linéaire ────────────────────────────────────────────────────
function interp1(table: [number, number][], x: number): number {
  const xc = Math.max(table[0][0], Math.min(table[table.length - 1][0], x))
  for (let i = 1; i < table.length; i++) {
    if (xc <= table[i][0]) {
      const [x0, y0] = table[i - 1]
      const [x1, y1] = table[i]
      return y0 + (y1 - y0) * (xc - x0) / (x1 - x0)
    }
  }
  return table[table.length - 1][1]
}

// ── A₁ — correction angulaire (D6-2, Table 6-5 / graph a) ────────────────────
// Valeurs lues sur le graphique Idelchik ; interpolation linéaire entre points.
// Remplace la formule par morceaux qui créait une discontinuité à 70°.
const A1_TABLE: [number, number][] = [
  [0, 0], [20, 0.31], [30, 0.45], [45, 0.60],
  [60, 0.78], [75, 0.90], [90, 1.00], [110, 1.13],
  [130, 1.20], [150, 1.28], [180, 1.40],
]
function A1(delta_deg: number): number {
  if (delta_deg <= 0) return 0
  return interp1(A1_TABLE, Math.min(delta_deg, 180))
}

// ── C₁ coudes lisses — D6-2, graph c ─────────────────────────────────────────
// a₀ = dimension dans le plan du coude, b₀ = dimension perpendiculaire.
// Section circulaire (a₀/b₀ = 1) : C₁ = 1.0.
// NB : la table D6-2 est très sensible au rapport de forme (0.45 à a₀/b₀ = 2).
const C1_D62: [number, number][] = [
  [0.25, 1.80], [0.50, 1.45], [0.75, 1.20], [1.00, 1.00],
  [1.50, 0.68], [2.00, 0.45], [3.00, 0.40], [4.00, 0.43],
  [5.00, 0.48], [6.00, 0.55], [7.00, 0.58], [8.00, 0.60],
]
function C1_smooth(a0_over_b0: number): number {
  return interp1(C1_D62, a0_over_b0)
}

// ── C₁ coudes vifs — D6-7, table ─────────────────────────────────────────────
// Section circulaire ou carrée (a₀/b₀ = 1) : C₁ = 1.0.
const C1_D67: [number, number][] = [
  [0.25, 1.10], [0.50, 1.07], [0.75, 1.04], [1.00, 1.00],
  [1.50, 0.95], [2.00, 0.90], [3.00, 0.83], [4.00, 0.78],
  [5.00, 0.75], [6.00, 0.72], [7.00, 0.71], [8.00, 0.70],
]
function C1_sharp(a0_over_b0: number): number {
  return interp1(C1_D67, a0_over_b0)
}

// ── Dimensions a₀/b₀ selon le plan du coude rectangulaire ────────────────────
function a0b0(s: VentSingularity): { a0: number; b0: number } {
  const L = s.l_mm ?? 300
  const H = s.h_mm ?? 200
  // a₀ = dimension dans le plan du coude, b₀ = dimension perpendiculaire
  return s.orientation === 'vertical'
    ? { a0: H, b0: L }
    : { a0: L, b0: H }
}

// ── Formules circulaires ──────────────────────────────────────────────────────

// ── Co' ASHRAE 3-1 — f(r/D), coude lisse à rayon circulaire, θ=90° ──────────
const ASHRAE_3_1_CO90: [number, number][] = [
  [0.50, 0.71], [0.75, 0.33], [1.00, 0.22],
  [1.50, 0.15], [2.00, 0.13], [2.50, 0.12],
]

/** ASHRAE 3-1 — Coude lisse à rayon, section circulaire
 *  ξ = Kθ(θ) × Co'(r/D),  0,50 ≤ r/D ≤ 2,50. Aucune correction Reynolds. */
export function xiCoudeLisse(angle: number, rOverD: number): number {
  const r = Math.max(0.50, Math.min(2.50, rOverD))
  return A1(angle) * interp1(ASHRAE_3_1_CO90, r)
}

// ── Tables ASHRAE 3-3 — coude à onglet, section circulaire ───────────────────
const ASHRAE_3_3_CO: [number, number][] = [
  [20, 0.08], [30, 0.16], [45, 0.34], [60, 0.55], [75, 0.81], [90, 1.20],
]
const ASHRAE_3_3_KRE: [number, number][] = [
  [10000, 1.40], [20000, 1.26], [30000, 1.19], [40000, 1.14],
  [60000, 1.09], [80000, 1.06], [100000, 1.04], [140000, 1.00],
]

/** ASHRAE 3-3 — Coude à onglet, section circulaire
 *  ξ = KRe(Re) × Co'(θ),  20° ≤ θ ≤ 90°.
 *  Re < 10 000 : KRe = 1,40 (valeur conservatrice). Re ≥ 140 000 : KRe = 1,00. */
export function xiCoudeOnglet(angle: number, Re: number): number {
  const θ   = Math.max(20, Math.min(90, angle))
  const co  = interp1(ASHRAE_3_3_CO, θ)
  const kRe = interp1(ASHRAE_3_3_KRE, Math.max(10000, Math.min(140000, Re)))
  return kRe * co
}

// ── Co' ASHRAE 3-2 — f(nPieces, r/D), coude segmenté, θ=90° ─────────────────
const ASHRAE_3_2_CO90: Record<3 | 4 | 5, [number, number][]> = {
  5: [[0.75, 0.46], [1.0, 0.33], [1.5, 0.24], [2.0, 0.19]],
  4: [[0.75, 0.50], [1.0, 0.37], [1.5, 0.27], [2.0, 0.24]],
  3: [[0.75, 0.54], [1.0, 0.42], [1.5, 0.34], [2.0, 0.33]],
}

/** ASHRAE 3-2 — Coude segmenté, section circulaire
 *  ξ = Kθ(θ) × Co'(r/D),  0,75 ≤ r/D ≤ 2,0. nPieces ∈ {3,4,5} discret. */
export function xiCoudeSegmente(angle: number, nPieces: 3 | 4 | 5, rOverD: number): number {
  const r = Math.max(0.75, Math.min(2.0, rOverD))
  return A1(angle) * interp1(ASHRAE_3_2_CO90[nPieces], r)
}

// ── Co' ASHRAE 3-4 — f(L/D), dévoiement Z (2×30°) ─────────────────────────
const ASHRAE_3_4_CO: [number, number][] = [
  [0, 0.00], [0.5, 0.15], [1.0, 0.15],
  [1.5, 0.16], [2.0, 0.16], [2.5, 0.16], [3.0, 0.16],
]

/** ASHRAE 3-4 — Dévoiement Z (2×30°), section circulaire
 *  ξ = KRe(Re) × Co'(L/D),  0 ≤ L/D ≤ 3. Même KRe qu'ASHRAE 3-3. */
export function xiCoudeZ(lOverD: number, Re: number): number {
  const ld  = Math.max(0, Math.min(3.0, lOverD))
  const co  = interp1(ASHRAE_3_4_CO, ld)
  const kRe = interp1(ASHRAE_3_3_KRE, Math.max(10000, Math.min(140000, Re)))
  return kRe * co
}

// ── Formules rectangulaires ───────────────────────────────────────────────────

// ── ASHRAE 3-5 — Co'(r/W, H/W), coude rect. sans aubes ──────────────────────
// W = dimension dans le plan du coude (= a₀), H = dimension perpendiculaire (= b₀)
// Interpolation bilinéaire ; limites : 0,50 ≤ r/W ≤ 2,00 ; 0,25 ≤ H/W ≤ 8,00
const A35_RW = [0.50, 0.75, 1.00, 1.50, 2.00]
const A35_HW = [0.25, 0.50, 0.75, 1.00, 1.50, 2.00, 3.00, 4.00, 5.00, 6.00, 8.00]
const A35_CO: number[][] = [
  [1.30,1.30,1.20,1.20,1.10,1.00,1.00,1.10,1.10,1.20,1.20], // r/W=0.50
  [0.57,0.52,0.48,0.44,0.40,0.39,0.39,0.40,0.42,0.43,0.44], // r/W=0.75
  [0.27,0.25,0.23,0.21,0.19,0.18,0.18,0.19,0.20,0.21,0.21], // r/W=1.00
  [0.22,0.20,0.19,0.17,0.15,0.14,0.14,0.15,0.16,0.17,0.17], // r/W=1.50
  [0.20,0.18,0.16,0.15,0.14,0.13,0.13,0.14,0.14,0.15,0.15], // r/W=2.00
]
// KRe(Re) selon r/W
const A35_KRE_LOW: [number,number][] = [  // r/W = 0,5
  [10000,1.40],[20000,1.26],[30000,1.19],[40000,1.14],
  [60000,1.09],[80000,1.06],[100000,1.04],[140000,1.00],[200000,1.00],
]
const A35_KRE_HIGH: [number,number][] = [ // r/W ≥ 0,75
  [10000,2.00],[20000,1.77],[30000,1.64],[40000,1.56],
  [60000,1.46],[80000,1.38],[100000,1.30],[140000,1.15],[200000,1.00],
]

function co35(rOverW: number, hOverW: number): number {
  const rw = Math.max(A35_RW[0], Math.min(A35_RW[A35_RW.length-1], rOverW))
  const hw = Math.max(A35_HW[0], Math.min(A35_HW[A35_HW.length-1], hOverW))
  let ri = A35_RW.length - 2
  for (let i = 0; i < A35_RW.length - 1; i++) { if (A35_RW[i+1] >= rw) { ri = i; break } }
  let hi = A35_HW.length - 2
  for (let i = 0; i < A35_HW.length - 1; i++) { if (A35_HW[i+1] >= hw) { hi = i; break } }
  const tr = (rw - A35_RW[ri]) / (A35_RW[ri+1] - A35_RW[ri])
  const th = (hw - A35_HW[hi]) / (A35_HW[hi+1] - A35_HW[hi])
  const c00 = A35_CO[ri][hi], c10 = A35_CO[ri+1][hi]
  const c01 = A35_CO[ri][hi+1], c11 = A35_CO[ri+1][hi+1]
  return (c00*(1-tr)+c10*tr)*(1-th) + (c01*(1-tr)+c11*tr)*th
}

function kre35(Re: number, rOverW: number): number {
  if (rOverW <= 0.50) return interp1(A35_KRE_LOW, Re)
  if (rOverW >= 0.75) return interp1(A35_KRE_HIGH, Re)
  const t = (rOverW - 0.50) / 0.25
  return interp1(A35_KRE_LOW, Re) * (1-t) + interp1(A35_KRE_HIGH, Re) * t
}

/** ASHRAE 3-5 — Coude rect. rayon lisse, sans aubes
 *  ξ = Kθ(δ) × KRe(Re, r/W) × Co'(r/W, H/W)
 *  W = a₀ (dans le plan du coude), H = b₀ (perpendiculaire) */
export function xiRectRayonLisse(s: VentSingularity, Re = 140000): number {
  const { a0, b0 } = a0b0(s)
  const rW = Math.max(0.50, Math.min(2.00, s.rOverA ?? 1.00))
  const hW = b0 / a0
  return A1(s.angle) * kre35(Re, rW) * co35(rW, hW)
}

// ── ASHRAE 3-6 — Co'(θ, H/W), coude rect. à onglet ──────────────────────────
// Interpolation bilinéaire sur θ (20–90°) et H/W (0,25–8) ; pas d'extrapolation.
const A36_THETA = [20, 30, 45, 60, 75, 90]
const A36_HW    = [0.25, 0.50, 0.75, 1.00, 1.50, 2.00, 3.00, 4.00, 5.00, 6.00, 8.00]
const A36_CO: number[][] = [
  [0.08,0.08,0.08,0.07,0.07,0.07,0.06,0.06,0.05,0.05,0.05], // 20°
  [0.18,0.17,0.17,0.16,0.15,0.15,0.13,0.13,0.12,0.12,0.11], // 30°
  [0.38,0.37,0.36,0.34,0.33,0.31,0.28,0.27,0.26,0.25,0.24], // 45°
  [0.60,0.59,0.57,0.55,0.52,0.49,0.46,0.43,0.41,0.39,0.38], // 60°
  [0.89,0.87,0.84,0.81,0.77,0.73,0.67,0.63,0.61,0.58,0.57], // 75°
  [1.30,1.30,1.20,1.20,1.10,1.10,0.98,0.92,0.89,0.85,0.83], // 90°
]
// KRe(Re) — plafonnée à Re = 140 000 (≥ 140 000 → 1,00)
const A36_KRE: [number, number][] = [
  [10000,1.40],[20000,1.26],[30000,1.19],[40000,1.14],
  [60000,1.09],[80000,1.06],[100000,1.04],[140000,1.00],
]

function co36(theta_deg: number, hOverW: number): number {
  const th = Math.max(A36_THETA[0], Math.min(A36_THETA[A36_THETA.length-1], theta_deg))
  const hw = Math.max(A36_HW[0], Math.min(A36_HW[A36_HW.length-1], hOverW))
  let ti = A36_THETA.length - 2
  for (let i = 0; i < A36_THETA.length - 1; i++) { if (A36_THETA[i+1] >= th) { ti = i; break } }
  let hi = A36_HW.length - 2
  for (let i = 0; i < A36_HW.length - 1; i++) { if (A36_HW[i+1] >= hw) { hi = i; break } }
  const tt = (th - A36_THETA[ti]) / (A36_THETA[ti+1] - A36_THETA[ti])
  const ht = (hw - A36_HW[hi]) / (A36_HW[hi+1] - A36_HW[hi])
  const c00 = A36_CO[ti][hi],   c10 = A36_CO[ti+1][hi]
  const c01 = A36_CO[ti][hi+1], c11 = A36_CO[ti+1][hi+1]
  return (c00*(1-tt)+c10*tt)*(1-ht) + (c01*(1-tt)+c11*tt)*ht
}

/** ASHRAE 3-6 — Coude rect. à onglet, sans aubes
 *  ξ = KRe(Re) × Co'(θ, H/W)
 *  Domaine : 20° ≤ θ ≤ 90°, 0,25 ≤ H/W ≤ 8, Re ≥ 10 000. */
export function xiRectOnglet(s: VentSingularity, Re = 140000): number {
  const { a0, b0 } = a0b0(s)
  const hW  = b0 / a0
  const kRe = interp1(A36_KRE, Math.max(10000, Math.min(140000, Re)))
  return kRe * co36(s.angle, hW)
}

// ── ASHRAE 3-7 — Co'(R/W, H/W), coude rect. à rayon lisse avec aubes sépar. ──
// R = rayon de gorge, W = dimension dans le plan du coude (r/W = R/W + 0,5).
// Interpolation bilinéaire sur R/W et H/W ; pas d'extrapolation.
const A37_HW  = [0.25, 0.50, 1.00, 1.50, 2.00, 3.00, 4.00, 5.00, 6.00, 7.00, 8.00]

const A37_RW1 = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
const A37_CO1: number[][] = [
  [0.52,0.40,0.43,0.49,0.55,0.66,0.75,0.84,0.93,1.00,1.10], // R/W=0.05
  [0.36,0.27,0.25,0.24,0.30,0.35,0.39,0.42,0.46,0.49,0.52], // R/W=0.10
  [0.28,0.21,0.18,0.19,0.20,0.22,0.25,0.26,0.28,0.30,0.32], // R/W=0.15
  [0.22,0.16,0.14,0.14,0.15,0.16,0.17,0.18,0.19,0.20,0.21], // R/W=0.20
  [0.18,0.13,0.11,0.11,0.11,0.12,0.13,0.14,0.14,0.15,0.15], // R/W=0.25
  [0.15,0.11,0.09,0.09,0.09,0.09,0.10,0.10,0.11,0.11,0.12], // R/W=0.30
  [0.13,0.09,0.08,0.07,0.07,0.08,0.08,0.08,0.08,0.09,0.09], // R/W=0.35
  [0.11,0.08,0.07,0.06,0.06,0.06,0.06,0.07,0.07,0.07,0.07], // R/W=0.40
  [0.10,0.07,0.06,0.05,0.05,0.05,0.05,0.05,0.06,0.06,0.06], // R/W=0.45
  [0.09,0.06,0.05,0.05,0.04,0.04,0.04,0.05,0.05,0.05,0.05], // R/W=0.50
]

const A37_RW2 = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]
const A37_CO2: number[][] = [
  [0.26,0.20,0.22,0.25,0.28,0.33,0.37,0.41,0.45,0.48,0.51], // R/W=0.05
  [0.17,0.13,0.11,0.12,0.13,0.15,0.16,0.17,0.19,0.20,0.21], // R/W=0.10
  [0.12,0.09,0.08,0.08,0.08,0.09,0.10,0.10,0.11,0.11,0.11], // R/W=0.15
  [0.09,0.07,0.06,0.05,0.06,0.06,0.06,0.06,0.07,0.07,0.07], // R/W=0.20
  [0.08,0.05,0.04,0.04,0.04,0.04,0.05,0.05,0.05,0.05,0.05], // R/W=0.25
  [0.06,0.04,0.03,0.03,0.03,0.03,0.03,0.03,0.04,0.04,0.04], // R/W=0.30
]

const A37_RW3 = [0.05, 0.10]
const A37_CO3: number[][] = [
  [0.11,0.10,0.12,0.13,0.14,0.16,0.18,0.19,0.21,0.22,0.23], // R/W=0.05
  [0.07,0.05,0.06,0.06,0.06,0.07,0.07,0.08,0.08,0.08,0.09], // R/W=0.10
]

function co37(nVanes: number, rW: number, hW: number): number {
  const [RW, CO] = nVanes >= 3 ? [A37_RW3, A37_CO3] : nVanes >= 2 ? [A37_RW2, A37_CO2] : [A37_RW1, A37_CO1]
  const rw = Math.max(RW[0], Math.min(RW[RW.length-1], rW))
  const hw = Math.max(A37_HW[0], Math.min(A37_HW[A37_HW.length-1], hW))
  let ri = RW.length - 2
  for (let i = 0; i < RW.length - 1; i++) { if (RW[i+1] >= rw) { ri = i; break } }
  let hi = A37_HW.length - 2
  for (let i = 0; i < A37_HW.length - 1; i++) { if (A37_HW[i+1] >= hw) { hi = i; break } }
  const tr = (rw - RW[ri]) / (RW[ri+1] - RW[ri])
  const th = (hw - A37_HW[hi]) / (A37_HW[hi+1] - A37_HW[hi])
  const c00 = CO[ri][hi],   c10 = CO[ri+1][hi]
  const c01 = CO[ri][hi+1], c11 = CO[ri+1][hi+1]
  return (c00*(1-tr)+c10*tr)*(1-th) + (c01*(1-tr)+c11*tr)*th
}

/** ASHRAE 3-7 — Coude rect. à rayon lisse avec aubes séparatrices
 *  ξ = Kθ(δ) × Co'(R/W, H/W, nAubes)
 *  1 aube : 0,05 ≤ R/W ≤ 0,50 ; 2 aubes : R/W ≤ 0,30 ; 3 aubes : R/W ∈ {0,05 ; 0,10} */
export function xiRectAubes(s: VentSingularity): number {
  const { a0, b0 } = a0b0(s)
  const hW = b0 / a0
  const rW = Math.max(0.05, (s.rOverB ?? 0.70) - 0.5)
  return A1(s.angle) * co37(s.nVanes ?? 1, rW, hW)
}

// ── ASHRAE 3-8 — Coude rect. onglet, aubes simple épaisseur ──────────────────
// θ = 90° fixe ; ξ = C₀ constant par design (pas de Kθ, KRe, ni dépendance H/W)
const ASHRAE_3_8_XI: Record<1 | 2 | 3, number> = { 1: 0.12, 2: 0.15, 3: 0.18 }

// ── ASHRAE 3-9 — Coude rect. onglet, aubes double épaisseur ──────────────────
// θ = 90° fixe ; ξ = f(design, V₀). V₀ en fpm, interpolation linéaire 1000–4000 fpm.
const ASHRAE_3_9_CO: Record<1 | 2 | 3 | 4, [number, number][]> = {
  1: [[1000, 0.27], [2000, 0.22], [3000, 0.19], [4000, 0.17]],
  2: [[1000, 0.33], [2000, 0.29], [3000, 0.26], [4000, 0.23]],
  3: [[1000, 0.38], [2000, 0.31], [3000, 0.27], [4000, 0.24]],
  4: [[1000, 0.26], [2000, 0.21], [3000, 0.18], [4000, 0.16]],
}

/** ASHRAE 3-8/3-9 — Coude rect. onglet avec aubes directrices
 *  Simple épaisseur (3-8) : ξ = C₀ fixe par design (1–3).
 *  Double épaisseur (3-9) : ξ = f(design 1–4, V₀) interpolé entre 1000 et 4000 fpm.
 *  v_ms : vitesse en m/s (calculée depuis la pression dynamique du tronçon). */
export function xiRectOngletAubes(s: VentSingularity, v_ms?: number | null): number {
  if ((s.vaneThickness ?? 'simple') === 'double') {
    const design  = (s.design39 ?? 1) as 1 | 2 | 3 | 4
    const v_fpm   = Math.max(1000, Math.min(4000, (v_ms ?? 5.08) * 196.8504))
    return interp1(ASHRAE_3_9_CO[design], v_fpm)
  }
  return ASHRAE_3_8_XI[(s.design38 ?? 1) as 1 | 2 | 3]
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export function computeXiSingularity(s: VentSingularity, Re?: number, Dh_mm?: number, v_ms?: number | null): number {
  switch (s.type) {
    case 'coude-lisse':      return xiCoudeLisse(s.angle, s.rOverD ?? 1.50)
    case 'coude-segmente':   return xiCoudeSegmente(s.angle, s.nPieces ?? 4, s.rOverD ?? 1.0)
    case 'coude-onglet':     return xiCoudeOnglet(s.angle, Re ?? 140000)
    case 'coude-z':          return xiCoudeZ(s.lOverD ?? 0, Re ?? 140000)
    case 'rect-rayon-lisse': return xiRectRayonLisse(s, Re)
    case 'rect-onglet':      return xiRectOnglet(s, Re)
    case 'rect-aubes':       return xiRectAubes(s)
    case 'rect-onglet-aubes': return xiRectOngletAubes(s, v_ms)
  }
}

// ── Labels ────────────────────────────────────────────────────────────────────

// ── Coefficient de frottement de Darcy-Weisbach ───────────────────────────────
// Blasius (Re < 1e5) + Filonenko (Re ≥ 1e5), conduite lisse.
export function lambdaDarcy(Re: number): number {
  if (Re <= 0)   return 0.02
  if (Re < 4000) return 64 / Re
  if (Re < 1e5)  return 0.316 / Re ** 0.25
  return               0.184 / Re ** 0.20
}

// ── Résultat décomposé ξ_local + ξ_frottement_interne (D6-2) ─────────────────
export interface XiParts {
  ksi_local: number  // perte de forme (A₁×B₁×C₁)
  ksi_fr:    number  // frottement sur longueur développée du coude (λ×L/Dh)
  ksi_total: number  // = ksi_local + ksi_fr  ← valeur à utiliser pour ΔP
}

/** Retourne ξ décomposé local + frottement.
 *  rect-rayon-lisse (ASHRAE 3-5), rect-onglet (ASHRAE 3-6), rect-aubes (ASHRAE 3-7) : ksi_fr = 0. */
export function computeXiSingularityFull(
  s: VentSingularity,
  lambda?: number,
  Re?: number,
  Dh_mm?: number,
  v_ms?: number | null,
): XiParts {
  const δ_rad = s.angle * Math.PI / 180

  if (s.type === 'coude-lisse') {
    const r         = Math.max(0.50, Math.min(2.50, s.rOverD ?? 1.50))
    const ksi_local = A1(s.angle) * interp1(ASHRAE_3_1_CO90, r)
    return { ksi_local, ksi_fr: 0, ksi_total: ksi_local }
  }

  if (s.type === 'coude-onglet') {
    const ksi_local = xiCoudeOnglet(s.angle, Re ?? 140000)
    return { ksi_local, ksi_fr: 0, ksi_total: ksi_local }
  }

  if (s.type === 'rect-rayon-lisse') {
    const ksi_local = xiRectRayonLisse(s, Re ?? 140000)
    return { ksi_local, ksi_fr: 0, ksi_total: ksi_local }
  }

  if (s.type === 'coude-segmente') {
    const r         = Math.max(0.75, Math.min(2.0, s.rOverD ?? 1.0))
    const n         = (s.nPieces ?? 4) as 3 | 4 | 5
    const ksi_local = A1(s.angle) * interp1(ASHRAE_3_2_CO90[n], r)
    return { ksi_local, ksi_fr: 0, ksi_total: ksi_local }
  }

  if (s.type === 'coude-z') {
    const lOverD    = s.lOverD ?? 0
    const ksi_local = xiCoudeZ(lOverD, Re ?? 140000)
    return { ksi_local, ksi_fr: 0, ksi_total: ksi_local }
  }

  if (s.type === 'rect-aubes') {
    const ksi_local = xiRectAubes(s)
    return { ksi_local, ksi_fr: 0, ksi_total: ksi_local }
  }

  if (s.type === 'rect-onglet-aubes') {
    const ksi_local = xiRectOngletAubes(s, v_ms)
    return { ksi_local, ksi_fr: 0, ksi_total: ksi_local }
  }

  const ksi_total = computeXiSingularity(s, Re, Dh_mm, v_ms)
  return { ksi_local: ksi_total, ksi_fr: 0, ksi_total }
}

export const SING_LABELS: Record<SingularityType, string> = {
  'coude-lisse':       'Coude lisse à rayon',
  'coude-segmente':   'Coude segmenté',
  'coude-onglet':     'Coude à onglet',
  'coude-z':          'Dévoiement Z (2×30°)',
  'rect-rayon-lisse': 'Coude rayon lisse',
  'rect-onglet':       'Coude à onglet rect.',
  'rect-aubes':        'Coude aubes séparatrices',
  'rect-onglet-aubes': 'Coude onglet avec aubes directrices',
}

export function newSingId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}
