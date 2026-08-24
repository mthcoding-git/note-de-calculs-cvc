// ── Types ─────────────────────────────────────────────────────────────────────

export type CircTransitionType =
  | 'agrandissement-brusque'   // expansion soudaine — Borda-Carnot (Idelchik)
  | 'diffuseur-conique'        // expansion progressive — table Idelchik Chap. 5
  | 'retrecissement-brusque'   // contraction soudaine — Weisbach (Idelchik)
  | 'convergent-conique'       // contraction progressive — Crane / Idelchik

export interface VentNodeTransition {
  id:        string
  type:      CircTransitionType
  alpha_deg?: number   // demi-angle α (°) — diffuseur-conique uniquement
  L_mm?:     number   // longueur de la transition (mm) — convergent-conique
}

export type RectTransitionType =
  | 'agrandissement-brusque-rect'  // expansion soudaine — Borda-Carnot
  | 'diffuseur-pyramidal'          // expansion progressive — table Idelchik (angle équivalent)
  | 'retrecissement-brusque-rect'  // contraction soudaine — Weisbach
  | 'convergent-pyramidal'         // contraction progressive — Crane / Idelchik

export interface VentNodeTransitionRect {
  id:        string
  type:      RectTransitionType
  alpha_deg?: number   // non utilisé (conservé pour rétrocompatibilité)
  L_mm?:     number   // longueur de la transition (mm)
}

// ── Interpolation bilinéaire ──────────────────────────────────────────────────

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

function interp2d(
  rows: number[],   // ex. angles
  cols: number[],   // ex. rapports de section
  table: number[][], // table[iRow][iCol]
  r: number,
  c: number,
): number {
  const rc = clamp(r, rows[0], rows[rows.length - 1])
  const cc = clamp(c, cols[0], cols[cols.length - 1])

  // encadrement de la ligne
  let ri = rows.length - 2
  for (let i = 0; i < rows.length - 1; i++) {
    if (rc <= rows[i + 1]) { ri = i; break }
  }
  // encadrement de la colonne
  let ci = cols.length - 2
  for (let i = 0; i < cols.length - 1; i++) {
    if (cc <= cols[i + 1]) { ci = i; break }
  }

  const t = (rc - rows[ri]) / (rows[ri + 1] - rows[ri])
  const u = (cc - cols[ci]) / (cols[ci + 1] - cols[ci])
  return (
    table[ri][ci]         * (1 - t) * (1 - u) +
    table[ri + 1][ci]     *       t  * (1 - u) +
    table[ri][ci + 1]     * (1 - t) *       u  +
    table[ri + 1][ci + 1] *       t  *       u
  )
}

// ── Table Idelchik Chap. 5 — Diffuseur conique circulaire ────────────────────
// Lignes : demi-angle α (°)   Colonnes : rapport A₂/A₁
// Valeurs : ξ direct (rapporté à la vitesse amont V₁)
// Source : Idelchik Handbook of Hydraulic Resistance, implémenté dans CalebBell/fluids

const DIFF_ANGLES = [4, 5, 6, 7, 8, 10, 12, 15, 20, 30, 45, 60]
const DIFF_NRATIOS = [1.1, 1.2, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0, 7.5, 10.0]

// diffuser_conical_Ks_Idelchik  — ξ = f(α, n)
const DIFF_KS: number[][] = [
  // n= 1.1    1.2    1.5    2.0    2.5    3.0    4.0    5.0    7.5    10.0
  [0.010, 0.015, 0.030, 0.040, 0.050, 0.060, 0.065, 0.070, 0.075, 0.080], // α=4°
  [0.014, 0.020, 0.040, 0.055, 0.070, 0.085, 0.090, 0.100, 0.100, 0.110], // α=5°
  [0.016, 0.025, 0.050, 0.070, 0.090, 0.100, 0.110, 0.120, 0.130, 0.140], // α=6°
  [0.018, 0.030, 0.060, 0.085, 0.110, 0.130, 0.140, 0.150, 0.160, 0.170], // α=7°
  [0.020, 0.035, 0.070, 0.100, 0.130, 0.150, 0.170, 0.180, 0.190, 0.200], // α=8°
  [0.025, 0.045, 0.090, 0.130, 0.170, 0.190, 0.210, 0.230, 0.240, 0.250], // α=10°
  [0.030, 0.055, 0.110, 0.160, 0.200, 0.230, 0.260, 0.280, 0.290, 0.310], // α=12°
  [0.040, 0.070, 0.140, 0.200, 0.250, 0.290, 0.330, 0.350, 0.370, 0.390], // α=15°
  [0.050, 0.090, 0.180, 0.260, 0.330, 0.380, 0.430, 0.460, 0.490, 0.510], // α=20°
  [0.065, 0.115, 0.230, 0.350, 0.440, 0.500, 0.570, 0.610, 0.660, 0.690], // α=30°
  [0.075, 0.135, 0.270, 0.400, 0.510, 0.580, 0.670, 0.710, 0.760, 0.800], // α=45°
  [0.080, 0.140, 0.280, 0.410, 0.520, 0.600, 0.690, 0.740, 0.800, 0.830], // α=60°
]

// ── Tables Idelchik Diag. 3-6/3-7 — Convergent (conique ou pyramidal) ─────────
// Source : CalebBell/fluids, même base que Idelchik Handbook (anglais)
//
// K₀ : coefficient principal — lignes = L/D₂, colonnes = θ (demi-angle, °)
const CONV_K0_LRATIO = [0.025, 0.05, 0.075, 0.10, 0.15, 0.60]
const CONV_K0_THETA  = [0, 10, 20, 30, 40, 60, 100, 140, 180]
const CONV_K0: number[][] = [
  // θ= 0°    10°    20°    30°    40°    60°   100°   140°   180°
  [0.50, 0.47, 0.45, 0.43, 0.41, 0.40, 0.42, 0.45, 0.50], // L/D₂=0.025
  [0.50, 0.45, 0.41, 0.36, 0.33, 0.30, 0.35, 0.42, 0.50], // L/D₂=0.050
  [0.50, 0.42, 0.35, 0.30, 0.26, 0.23, 0.30, 0.40, 0.50], // L/D₂=0.075
  [0.50, 0.39, 0.32, 0.25, 0.22, 0.18, 0.27, 0.38, 0.50], // L/D₂=0.100
  [0.50, 0.37, 0.27, 0.20, 0.16, 0.15, 0.25, 0.37, 0.50], // L/D₂=0.150
  [0.50, 0.27, 0.18, 0.13, 0.11, 0.12, 0.23, 0.36, 0.50], // L/D₂=0.600
]

// K_fr : frottement — lignes = A₂/A₁, colonnes = θ (valide jusqu'à 20°, clampé)
const CONV_KFR_AREA  = [0.05, 0.075, 0.10, 0.15, 0.20, 0.25, 0.30, 0.40, 0.50, 0.60]
const CONV_KFR_THETA = [2, 3, 6, 8, 10, 12, 14, 16, 20]
const CONV_KFR: number[][] = [
  // θ= 2°    3°     6°     8°     10°    12°    14°    16°    20°
  [0.14, 0.10, 0.05, 0.04, 0.03, 0.03, 0.02, 0.02, 0.01], // A₂/A₁=0.05
  [0.14, 0.10, 0.05, 0.04, 0.03, 0.02, 0.02, 0.02, 0.01], // A₂/A₁=0.075
  [0.14, 0.10, 0.05, 0.04, 0.03, 0.02, 0.02, 0.02, 0.01], // A₂/A₁=0.10
  [0.14, 0.10, 0.05, 0.04, 0.03, 0.02, 0.02, 0.02, 0.01], // A₂/A₁=0.15
  [0.14, 0.10, 0.05, 0.03, 0.03, 0.02, 0.02, 0.02, 0.01], // A₂/A₁=0.20
  [0.14, 0.10, 0.05, 0.03, 0.03, 0.02, 0.02, 0.02, 0.01], // A₂/A₁=0.25
  [0.13, 0.09, 0.04, 0.03, 0.03, 0.02, 0.02, 0.02, 0.01], // A₂/A₁=0.30
  [0.12, 0.08, 0.04, 0.03, 0.02, 0.02, 0.02, 0.02, 0.01], // A₂/A₁=0.40
  [0.11, 0.07, 0.04, 0.03, 0.02, 0.02, 0.02, 0.02, 0.01], // A₂/A₁=0.50
  [0.09, 0.06, 0.03, 0.02, 0.02, 0.02, 0.02, 0.02, 0.01], // A₂/A₁=0.60
]

// ξ_v2 convergent Idelchik = K₀ × (1−A₂/A₁) + K_fr, converti en V₁
function xiConvergentIdelchik(A2_over_A1: number, lratio: number, theta_deg: number): number {
  const K0  = interp2d(CONV_K0_LRATIO, CONV_K0_THETA,  CONV_K0,  lratio, theta_deg)
  const Kfr = interp2d(CONV_KFR_AREA,  CONV_KFR_THETA, CONV_KFR, A2_over_A1, Math.min(theta_deg, 20))
  const xi_v2 = K0 * (1 - A2_over_A1) + Kfr
  return xi_v2 / A2_over_A1
}

// ── Formules ──────────────────────────────────────────────────────────────────

/**
 * Agrandissement brusque — Borda-Carnot (Idelchik)
 * ξ = (1 − A₁/A₂)²  rapporté à V₁
 */
export function xiAgrandissementBrusque(D1_mm: number, D2_mm: number): number {
  if (D2_mm <= D1_mm) return 0
  const ratio = (D1_mm / D2_mm) ** 2   // A₁/A₂
  return (1 - ratio) ** 2
}

/**
 * Diffuseur conique — interpolation bilinéaire table Idelchik Chap. 5
 * ξ = f(α, A₂/A₁)  rapporté à V₁
 * α : demi-angle en degrés (4°–60°, clampé)
 */
export function xiDiffuseurConique(D1_mm: number, D2_mm: number, alpha_deg: number): number {
  if (D2_mm <= D1_mm) return 0
  const n = (D2_mm / D1_mm) ** 2   // A₂/A₁
  return interp2d(DIFF_ANGLES, DIFF_NRATIOS, DIFF_KS, alpha_deg, n)
}

/**
 * Rétrécissement brusque — Weisbach (Idelchik)
 * ξ = 0.5 × (1 − A₂/A₁)  rapporté à V₂ (aval)
 * On le ramène à V₁ (amont) en multipliant par (A₁/A₂)²
 */
export function xiRetrecissementBrusque(D1_mm: number, D2_mm: number): number {
  if (D2_mm >= D1_mm) return 0
  const A2_over_A1 = (D2_mm / D1_mm) ** 2
  const xi_v2 = 0.5 * (1 - A2_over_A1)
  // conversion V₂ → V₁ : ξ_v1 = ξ_v2 × (A₁/A₂)²
  return xi_v2 * (1 / A2_over_A1)
}

/**
 * Convergent conique — Idelchik Diag. 3-6/3-7
 * θ (demi-angle) calculé depuis D1, D2 et L.
 * ξ = [K₀(L/D₂, θ) × (1−A₂/A₁) + K_fr(A₂/A₁, θ)] × (A₁/A₂)²
 */
export function xiConvergentConique(D1_mm: number, D2_mm: number, L_mm: number): number {
  if (D2_mm >= D1_mm || L_mm <= 0) return 0
  const A2_over_A1 = (D2_mm / D1_mm) ** 2
  const theta      = Math.atan((D1_mm - D2_mm) / (2 * L_mm)) * 180 / Math.PI
  const lratio     = L_mm / D2_mm
  return xiConvergentIdelchik(A2_over_A1, lratio, theta)
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export function computeXiTransition(
  t: VentNodeTransition,
  D1_mm: number,   // diamètre amont
  D2_mm: number,   // diamètre aval
): number {
  const alpha = t.alpha_deg ?? 15
  const L     = t.L_mm     ?? 200
  switch (t.type) {
    case 'agrandissement-brusque':  return xiAgrandissementBrusque(D1_mm, D2_mm)
    case 'diffuseur-conique':       return xiDiffuseurConique(D1_mm, D2_mm, alpha)
    case 'retrecissement-brusque':  return xiRetrecissementBrusque(D1_mm, D2_mm)
    case 'convergent-conique':      return xiConvergentConique(D1_mm, D2_mm, L)
  }
}

// ── Labels ────────────────────────────────────────────────────────────────────

export const TRANSITION_LABELS: Record<CircTransitionType, string> = {
  'agrandissement-brusque': 'Agrandissement brusque',
  'diffuseur-conique':      'Diffuseur conique (progressif)',
  'retrecissement-brusque': 'Rétrécissement brusque',
  'convergent-conique':     'Convergent conique (progressif)',
}

// ── Détection automatique ─────────────────────────────────────────────────────

export type TransitionKind = 'expansion' | 'contraction' | 'none'

export function detectTransitionKind(D1_mm: number, D2_mm: number): TransitionKind {
  const ratio = D2_mm / D1_mm
  if (ratio > 1.02) return 'expansion'
  if (ratio < 0.98) return 'contraction'
  return 'none'
}

/** Types disponibles selon le sens de la transition */
export const TRANSITION_TYPES_FOR_KIND: Record<TransitionKind, CircTransitionType[]> = {
  expansion:   ['diffuseur-conique', 'agrandissement-brusque'],
  contraction: ['convergent-conique', 'retrecissement-brusque'],
  none:        [],
}

// ── Contraintes d'angle ───────────────────────────────────────────────────────

export const ALPHA_RANGE: Record<CircTransitionType, [number, number]> = {
  'agrandissement-brusque':  [0,  0],    // pas d'angle
  'diffuseur-conique':       [4, 60],
  'retrecissement-brusque':  [0,  0],    // pas d'angle
  'convergent-conique':      [4, 45],
}

export const TRANSITION_NEEDS_ANGLE: Record<CircTransitionType, boolean> = {
  'agrandissement-brusque': false,
  'diffuseur-conique':      true,
  'retrecissement-brusque': false,
  'convergent-conique':     false,
}

export const TRANSITION_NEEDS_LENGTH: Record<CircTransitionType, boolean> = {
  'agrandissement-brusque': false,
  'diffuseur-conique':      false,
  'retrecissement-brusque': false,
  'convergent-conique':     true,
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

export function newTransitionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUPE 2 — Rectangulaire → Rectangulaire
// ═══════════════════════════════════════════════════════════════════════════════

// ── Formules Groupe 2 ─────────────────────────────────────────────────────────

/**
 * Agrandissement brusque rect — Borda-Carnot (Idelchik)
 * ξ = (1 − A₁/A₂)²  rapporté à V₁
 */
export function xiAgrandissementBrusqueRect(A1_mm2: number, A2_mm2: number): number {
  if (A2_mm2 <= A1_mm2) return 0
  return (1 - A1_mm2 / A2_mm2) ** 2
}

/**
 * Diffuseur pyramidal — table Idelchik Chap. 5, θ = max(θ_y, θ_z)
 * θ calculé depuis les cotes de gaine et la longueur L (Idelchik Diag. 5-23)
 */
export function xiDiffuseurPyramidal(
  a1_mm: number, b1_mm: number,
  a2_mm: number, b2_mm: number,
  L_mm:  number,
): number {
  const A1 = a1_mm * b1_mm
  const A2 = a2_mm * b2_mm
  if (A2 <= A1 || L_mm <= 0) return 0
  const theta_y = Math.atan(Math.max(0, a2_mm - a1_mm) / (2 * L_mm)) * 180 / Math.PI
  const theta_z = Math.atan(Math.max(0, b2_mm - b1_mm) / (2 * L_mm)) * 180 / Math.PI
  const theta   = Math.max(theta_y, theta_z)
  return interp2d(DIFF_ANGLES, DIFF_NRATIOS, DIFF_KS, theta, A2 / A1)
}

/**
 * Rétrécissement brusque rect — Weisbach (Idelchik)
 * ξ = 0.5 × (1 − A₂/A₁)  rapporté à V₂ (aval)
 * Converti en V₁
 */
export function xiRetrecissementBrusqueRect(A1_mm2: number, A2_mm2: number): number {
  if (A2_mm2 >= A1_mm2) return 0
  const A2_over_A1 = A2_mm2 / A1_mm2
  const xi_v2 = 0.5 * (1 - A2_over_A1)
  return xi_v2 / A2_over_A1
}

/**
 * Convergent pyramidal — Idelchik Diag. 3-6/3-7
 * θ = max(θ_y, θ_z), Dh₂ = 2a₂b₂/(a₂+b₂) pour le rapport L/D₂
 */
export function xiConvergentPyramidal(
  a1_mm: number, b1_mm: number,
  a2_mm: number, b2_mm: number,
  L_mm:  number,
): number {
  const A1 = a1_mm * b1_mm
  const A2 = a2_mm * b2_mm
  if (A2 >= A1 || L_mm <= 0) return 0
  const Dh2        = 2 * a2_mm * b2_mm / (a2_mm + b2_mm)
  const A2_over_A1 = A2 / A1
  const theta_y    = Math.atan(Math.max(0, a1_mm - a2_mm) / (2 * L_mm)) * 180 / Math.PI
  const theta_z    = Math.atan(Math.max(0, b1_mm - b2_mm) / (2 * L_mm)) * 180 / Math.PI
  const theta      = Math.max(theta_y, theta_z)
  return xiConvergentIdelchik(A2_over_A1, L_mm / Dh2, theta)
}

// ── Dispatch Groupe 2 ─────────────────────────────────────────────────────────

export function computeXiTransitionRect(
  t:      VentNodeTransitionRect,
  A1_mm2: number,     // section amont (mm²) — pour les types brusques
  A2_mm2: number,     // section aval (mm²)
  a1_mm?: number,     // cotes amont — requis pour types progressifs
  b1_mm?: number,
  a2_mm?: number,
  b2_mm?: number,
): number {
  const L = t.L_mm ?? 200
  switch (t.type) {
    case 'agrandissement-brusque-rect': return xiAgrandissementBrusqueRect(A1_mm2, A2_mm2)
    case 'retrecissement-brusque-rect': return xiRetrecissementBrusqueRect(A1_mm2, A2_mm2)
    case 'diffuseur-pyramidal':
      if (a1_mm && b1_mm && a2_mm && b2_mm)
        return xiDiffuseurPyramidal(a1_mm, b1_mm, a2_mm, b2_mm, L)
      return 0
    case 'convergent-pyramidal':
      if (a1_mm && b1_mm && a2_mm && b2_mm)
        return xiConvergentPyramidal(a1_mm, b1_mm, a2_mm, b2_mm, L)
      return 0
  }
}

// ── Labels Groupe 2 ───────────────────────────────────────────────────────────

export const RECT_TRANSITION_LABELS: Record<RectTransitionType, string> = {
  'agrandissement-brusque-rect': 'Agrandissement brusque',
  'diffuseur-pyramidal':         'Diffuseur pyramidal (progressif)',
  'retrecissement-brusque-rect': 'Rétrécissement brusque',
  'convergent-pyramidal':        'Convergent pyramidal (progressif)',
}

// ── Détection Groupe 2 (par aire) ─────────────────────────────────────────────
// Seuil ±2% sur le diamètre équivalent ↔ ±4% sur l'aire

export function detectTransitionKindByArea(A1_mm2: number, A2_mm2: number): TransitionKind {
  const ratio = A2_mm2 / A1_mm2
  if (ratio > 1.04) return 'expansion'
  if (ratio < 0.96) return 'contraction'
  return 'none'
}

export const RECT_TRANSITION_TYPES_FOR_KIND: Record<TransitionKind, RectTransitionType[]> = {
  expansion:   ['diffuseur-pyramidal', 'agrandissement-brusque-rect'],
  contraction: ['convergent-pyramidal', 'retrecissement-brusque-rect'],
  none:        [],
}

// ── Contraintes d'angle Groupe 2 ─────────────────────────────────────────────

export const RECT_ALPHA_RANGE: Record<RectTransitionType, [number, number]> = {
  'agrandissement-brusque-rect': [0,  0],
  'diffuseur-pyramidal':         [4, 60],
  'retrecissement-brusque-rect': [0,  0],
  'convergent-pyramidal':        [4, 45],
}

export const RECT_TRANSITION_NEEDS_ANGLE: Record<RectTransitionType, boolean> = {
  'agrandissement-brusque-rect': false,
  'diffuseur-pyramidal':         false,
  'retrecissement-brusque-rect': false,
  'convergent-pyramidal':        false,
}

export const RECT_TRANSITION_NEEDS_LENGTH: Record<RectTransitionType, boolean> = {
  'agrandissement-brusque-rect': false,
  'diffuseur-pyramidal':         true,
  'retrecissement-brusque-rect': false,
  'convergent-pyramidal':        true,
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROUPE 3 — Circulaire ↔ Rectangulaire
// ═══════════════════════════════════════════════════════════════════════════════

export type MixedTransitionType =
  | 'agrandissement-brusque-mixed'  // Borda-Carnot — même formule G1/G2
  | 'diffuseur-mixed'               // table Idelchik conique × τ(a/b) (Diag. 5-28)
  | 'retrecissement-brusque-mixed'  // Weisbach — même formule G1/G2
  | 'convergent-mixed'              // Crane / Idelchik — même formule G1/G2

export interface VentNodeTransitionMixed {
  id:        string
  type:      MixedTransitionType
  alpha_deg?: number   // non utilisé (conservé pour rétrocompatibilité)
  L_mm?:     number   // longueur de la transition (mm)
}

// ── Correcteur τ(a/b) — Idelchik Diag. 5-28 ─────────────────────────────────
// Rapport a/b (max/min) de la section rectangulaire → facteur multiplicatif sur ξ_conique

const TAU_AB     = [1,    1.5,  2,    3,    4   ]
const TAU_VALUES = [1.00, 1.04, 1.08, 1.13, 1.18]

function tauAspectRatio(ab: number): number {
  return interp1d(TAU_AB, TAU_VALUES, ab)
}

// ── Formules Groupe 3 ─────────────────────────────────────────────────────────

/**
 * Agrandissement brusque circ↔rect — Borda-Carnot (Idelchik)
 * ξ = (1 − A₁/A₂)²  rapporté à V₁
 */
export function xiAgrandissementBrusqueMixed(A1_mm2: number, A2_mm2: number): number {
  if (A2_mm2 <= A1_mm2) return 0
  return (1 - A1_mm2 / A2_mm2) ** 2
}

/**
 * Diffuseur circ↔rect — table Idelchik conique (Chap. 5) × τ(a/b) (Diag. 5-28)
 * θ calculé depuis les diamètres hydrauliques effectifs (Dh) et la longueur L.
 * ab_ratio : rapport max(a,b)/min(a,b) de la section rectangulaire.
 */
export function xiDiffuseurMixed(
  A1_mm2:    number,
  A2_mm2:    number,
  ab_ratio:  number,
  L_mm:      number,
  Dh1_mm:    number,   // Dh amont (D pour circulaire, 2ab/(a+b) pour rect)
  Dh2_mm:    number,   // Dh aval
): number {
  if (A2_mm2 <= A1_mm2 || L_mm <= 0) return 0
  const theta = Math.atan(Math.max(0, Dh2_mm - Dh1_mm) / (2 * L_mm)) * 180 / Math.PI
  const n     = A2_mm2 / A1_mm2
  return interp2d(DIFF_ANGLES, DIFF_NRATIOS, DIFF_KS, theta, n) * tauAspectRatio(ab_ratio)
}

/**
 * Rétrécissement brusque circ↔rect — Weisbach (Idelchik)
 * ξ = 0.5 × (1 − A₂/A₁)  rapporté à V₂, converti en V₁
 */
export function xiRetrecissementBrusqueMixed(A1_mm2: number, A2_mm2: number): number {
  if (A2_mm2 >= A1_mm2) return 0
  const A2_over_A1 = A2_mm2 / A1_mm2
  return 0.5 * (1 - A2_over_A1) / A2_over_A1
}

/**
 * Convergent circ↔rect — Idelchik Diag. 3-6/3-7
 * θ calculé depuis les Dh et L ; Dh₂ utilisé pour le rapport L/D₂.
 */
export function xiConvergentMixed(
  A1_mm2: number,
  A2_mm2: number,
  L_mm:   number,
  Dh1_mm: number,
  Dh2_mm: number,
): number {
  if (A2_mm2 >= A1_mm2 || L_mm <= 0) return 0
  const A2_over_A1 = A2_mm2 / A1_mm2
  const theta      = Math.atan(Math.max(0, Dh1_mm - Dh2_mm) / (2 * L_mm)) * 180 / Math.PI
  return xiConvergentIdelchik(A2_over_A1, L_mm / Dh2_mm, theta)
}

// ── Dispatch Groupe 3 ─────────────────────────────────────────────────────────

export function computeXiTransitionMixed(
  t:        VentNodeTransitionMixed,
  A1_mm2:   number,     // section amont (mm²)
  A2_mm2:   number,     // section aval (mm²)
  ab_ratio: number,     // rapport max/min côté rectangulaire
  Dh1_mm?:  number,     // Dh amont — requis pour types progressifs
  Dh2_mm?:  number,     // Dh aval
): number {
  const L = t.L_mm ?? 200
  switch (t.type) {
    case 'agrandissement-brusque-mixed': return xiAgrandissementBrusqueMixed(A1_mm2, A2_mm2)
    case 'retrecissement-brusque-mixed': return xiRetrecissementBrusqueMixed(A1_mm2, A2_mm2)
    case 'diffuseur-mixed':
      if (Dh1_mm && Dh2_mm)
        return xiDiffuseurMixed(A1_mm2, A2_mm2, ab_ratio, L, Dh1_mm, Dh2_mm)
      return 0
    case 'convergent-mixed':
      if (Dh1_mm && Dh2_mm)
        return xiConvergentMixed(A1_mm2, A2_mm2, L, Dh1_mm, Dh2_mm)
      return 0
  }
}

// ── Labels Groupe 3 ───────────────────────────────────────────────────────────

export const MIXED_TRANSITION_LABELS: Record<MixedTransitionType, string> = {
  'agrandissement-brusque-mixed': 'Agrandissement brusque',
  'diffuseur-mixed':              'Diffuseur (transition progressive)',
  'retrecissement-brusque-mixed': 'Rétrécissement brusque',
  'convergent-mixed':             'Convergent (transition progressive)',
}

// ── Détection Groupe 3 (par aire) ────────────────────────────────────────────

export const MIXED_TRANSITION_TYPES_FOR_KIND: Record<TransitionKind, MixedTransitionType[]> = {
  expansion:   ['diffuseur-mixed', 'agrandissement-brusque-mixed'],
  contraction: ['convergent-mixed', 'retrecissement-brusque-mixed'],
  none:        [],
}

// ── Contraintes d'angle Groupe 3 ─────────────────────────────────────────────

export const MIXED_ALPHA_RANGE: Record<MixedTransitionType, [number, number]> = {
  'agrandissement-brusque-mixed': [0,  0],
  'diffuseur-mixed':              [4, 60],
  'retrecissement-brusque-mixed': [0,  0],
  'convergent-mixed':             [4, 45],
}

export const MIXED_TRANSITION_NEEDS_ANGLE: Record<MixedTransitionType, boolean> = {
  'agrandissement-brusque-mixed': false,
  'diffuseur-mixed':              false,
  'retrecissement-brusque-mixed': false,
  'convergent-mixed':             false,
}

export const MIXED_TRANSITION_NEEDS_LENGTH: Record<MixedTransitionType, boolean> = {
  'agrandissement-brusque-mixed': false,
  'diffuseur-mixed':              true,
  'retrecissement-brusque-mixed': false,
  'convergent-mixed':             true,
}
