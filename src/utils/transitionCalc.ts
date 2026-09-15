import { interp1, interp2, interp3 } from './interp'

// ── Transitions de section (ventilation) ─────────────────────────────────────
// Attribuées sur un nœud, entre le tronçon amont et le tronçon aval.
// Le sens d'écoulement étant déduit automatiquement, le type applicable découle
// de la comparaison des sections : il n'est jamais choisi à l'aveugle.

export type TransitionType =
  | 'trans-4-1-div'   // ASHRAE 4-1 — circulaire, la section augmente (divergent)
  | 'trans-4-1-conv'  // ASHRAE 4-1 — circulaire, la section diminue (convergent)
  | 'trans-4-2-div'   // ASHRAE 4-2 — rectangulaire symétrique, section croissante
  | 'trans-4-2-conv'  // ASHRAE 4-2 — rectangulaire symétrique, section décroissante
  | 'trans-4-3-div'   // ASHRAE 4-3 — rectangulaire, 3 côtés droits, section croissante
  | 'trans-4-3-conv'  // ASHRAE 4-3 — rectangulaire, 3 côtés droits, section décroissante
  | 'trans-3-10-div'  // ASHRAE 3-10 — coude rectangulaire 90°, section croissante
  | 'trans-3-10-conv' // ASHRAE 3-10 — coude rectangulaire 90°, section décroissante
  | 'trans-4-4-div'   // ASHRAE 4-4 — rectangulaire pyramidale, section croissante
  | 'trans-4-4-conv'  // ASHRAE 4-4 — rectangulaire pyramidale, section décroissante
  | 'trans-ed42-div'  // ASHRAE ED4-2 — circulaire → rectangulaire, section croissante
  | 'trans-ed42-conv' // ASHRAE ED4-2 — circulaire → rectangulaire, section décroissante
  | 'trans-er43-div'  // ASHRAE ER4-3 — rectangulaire → circulaire, section croissante
  | 'trans-er43-conv' // ASHRAE ER4-3 — rectangulaire → circulaire, section décroissante
  | 'trans-4-7'       // ASHRAE 4-7 — rectangulaire → circulaire, conique à décrochement

export interface VentNodeTransition {
  id:    string
  type:  TransitionType
  theta: number        // angle de la transition (°), parmi les angles tabulés
  l_mm?: number        // 4-7 : longueur axiale de la partie conique
}

/** Géométrie d'une des deux sections raccordées. Les transitions se lisent sur
 *  des aires, jamais sur le diamètre hydraulique : le rectangulaire porte donc
 *  ses vraies dimensions. */
export type TransitionShape =
  | { shape: 'circular';    d_mm: number }
  | { shape: 'rectangular'; l_mm: number; h_mm: number }

export const TRANSITION_LABELS: Record<TransitionType, string> = {
  'trans-4-1-div':  'Transition circulaire — augmentation de section',
  'trans-4-1-conv': 'Transition circulaire — diminution de section',
  'trans-4-2-div':  'Transition rectangulaire symétrique — augmentation de section',
  'trans-4-2-conv': 'Transition rectangulaire symétrique — diminution de section',
  'trans-4-3-div':  'Transition rectangulaire 3 côtés droits — augmentation de section',
  'trans-4-3-conv': 'Transition rectangulaire 3 côtés droits — diminution de section',
  'trans-3-10-div':  'Transition coudée rectangulaire à 90° — augmentation de section',
  'trans-3-10-conv': 'Transition coudée rectangulaire à 90° — diminution de section',
  'trans-4-4-div':   'Transition rectangulaire pyramidale — augmentation de section',
  'trans-4-4-conv':  'Transition rectangulaire pyramidale — diminution de section',
  'trans-ed42-div':  'Transition circulaire → rectangulaire — augmentation de section',
  'trans-ed42-conv': 'Transition circulaire → rectangulaire — diminution de section',
  'trans-er43-div':  'Transition rectangulaire → circulaire — augmentation de section',
  'trans-er43-conv': 'Transition rectangulaire → circulaire — diminution de section',
  'trans-4-7':       'Transition rectangulaire → circulaire, conique à décrochement',
}

/** Le 4-7 se distingue deux fois des autres : sa table se lit sur le rapport
 *  **aval/amont**, et son coefficient se rapporte à la vitesse de la section
 *  circulaire **aval**, non à la vitesse amont. */
export function isStepped(type: TransitionType): boolean {
  return type === 'trans-4-7'
}

/** Vrai lorsque le coefficient se rapporte à la pression dynamique aval. */
export function refIsDownstream(type: TransitionType): boolean {
  return isStepped(type)
}

/** Domaine tabulé du rapport l/H, d'où se déduit la plage admise pour l. */
export const LH47_MIN = 0.025, LH47_MAX = 0.60

/** Raccord entre deux formes différentes : ED4-2 dans un sens, ER4-3 dans
 *  l'autre. Les deux partagent la même table et le même angle renseigné. */
export function isRoundRect(type: TransitionType): boolean {
  return type === 'trans-ed42-div'  || type === 'trans-ed42-conv'
      || type === 'trans-er43-div'  || type === 'trans-er43-conv'
}

/** Le 4-4 est la seule pièce où les deux dimensions varient : les quatre faces
 *  sont inclinées. Dès qu'un côté est conservé la pyramide dégénère, et c'est le
 *  4-2 qui décrit la pièce. */
export function isPyramidal(type: TransitionType): boolean {
  return type === 'trans-4-4-div' || type === 'trans-4-4-conv'
}

/** Le 4-3 n'est tabulé que jusqu'à 90° : au-delà, un seul côté incliné ne peut
 *  plus se refermer sur la section aval. */
export function isThreeSided(type: TransitionType): boolean {
  return type === 'trans-4-3-div' || type === 'trans-4-3-conv'
}

/** Le 3-10 combine le changement de section à un coude : l'angle vaut 90° par
 *  construction, la table ne comporte aucun axe d'angle. */
export function isElbow310(type: TransitionType): boolean {
  return type === 'trans-3-10-div' || type === 'trans-3-10-conv'
}

/** Angles tabulés. Le coefficient n'est pas défini ailleurs. */
export const TRANSITION_ANGLES = [10, 15, 20, 30, 45, 60, 90, 120, 150, 180]
/** Le 4-7 descend jusqu'à 0° — la partie conique disparaît, il ne reste que le
 *  décrochement. */
const A47_THETA = [0, 10, 20, 30, 45, 60, 90, 120, 150, 180]

export function transitionAngles(type: TransitionType): number[] {
  if (isElbow310(type))   return [90]
  if (isStepped(type))    return A47_THETA
  if (isThreeSided(type)) return TRANSITION_ANGLES.filter(a => a <= 90)
  return TRANSITION_ANGLES
}

/** Tolérance de comparaison des dimensions, en mm : deux côtés saisis au
 *  millimètre sont parallèles dès qu'ils sont égaux à cette précision. */
const DIM_TOL = 0.5

export function sectionArea(s: TransitionShape): number {
  return s.shape === 'circular'
    ? Math.PI * s.d_mm * s.d_mm / 4
    : s.l_mm * s.h_mm
}

// ── Tables C₀ = f(A₀/A₁, θ) ──────────────────────────────────────────────────
// A₀ = section amont (celle qui porte V₀), A₁ = section aval.
// A₀/A₁ < 1 → la section augmente (divergent) ; > 1 → elle diminue (convergent).
const RATIO_AXIS = [0.06, 0.10, 0.25, 0.50, 1.00, 2.00, 4.00, 6.00, 10.00]
const THETA_AXIS = [10, 15, 20, 30, 45, 60, 90, 120, 150, 180]

// ASHRAE 4-1 — Transition circulaire concentrique.
// Idelchik et al. 1986, Diagrams 5-2 et 5-22.
const A41_CO: number[][] = [
  [0.21, 0.29, 0.38, 0.60, 0.84, 0.88, 0.88, 0.88, 0.88, 0.88], // A₀/A₁ = 0,06
  [0.21, 0.28, 0.38, 0.59, 0.76, 0.80, 0.83, 0.84, 0.83, 0.83], // 0,10
  [0.16, 0.22, 0.30, 0.46, 0.61, 0.68, 0.64, 0.63, 0.62, 0.62], // 0,25
  [0.11, 0.13, 0.19, 0.32, 0.33, 0.33, 0.32, 0.31, 0.30, 0.30], // 0,50
  [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00], // 1,00 — pas de variation
  [0.20, 0.20, 0.20, 0.20, 0.22, 0.24, 0.48, 0.72, 0.96, 1.00], // 2,00
  [0.80, 0.64, 0.64, 0.64, 0.88, 1.10, 2.70, 4.30, 5.60, 6.60], // 4,00
  [1.80, 1.40, 1.40, 1.40, 2.00, 2.50, 6.50, 10.0, 13.0, 15.0], // 6,00
  [5.00, 5.00, 5.00, 5.00, 6.50, 8.00, 19.0, 29.0, 37.0, 43.0], // 10,00
]

// ASHRAE 4-2 — Transition rectangulaire symétrique, deux côtés parallèles.
// Idelchik et al. 1986, Diagram 5-5. Les lignes A₀/A₁ > 1 sont données comme
// provisoires par ASHRAE, adaptées des données du 4-1.
//
// Sert aussi au 4-3 (trois côtés droits) : ASHRAE l'annonce entièrement
// provisoire et « assumed same as Fitting 4-2 data ». Les 63 valeurs publiées du
// 4-3 sont bien celles-ci tronquées à 90°, d'où une table unique — deux copies
// finiraient par diverger sans raison.
const A42_CO: number[][] = [
  [0.26, 0.27, 0.40, 0.56, 0.71, 0.86, 1.00, 0.99, 0.98, 0.98], // A₀/A₁ = 0,06
  [0.24, 0.26, 0.36, 0.53, 0.69, 0.82, 0.93, 0.93, 0.92, 0.91], // 0,10
  [0.17, 0.19, 0.22, 0.42, 0.60, 0.68, 0.70, 0.69, 0.67, 0.66], // 0,25
  [0.14, 0.13, 0.15, 0.24, 0.35, 0.37, 0.38, 0.37, 0.36, 0.35], // 0,50
  [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00], // 1,00 — pas de variation
  [0.23, 0.20, 0.20, 0.20, 0.24, 0.28, 0.54, 0.78, 1.00, 1.10], // 2,00  ┐
  [0.81, 0.64, 0.64, 0.64, 0.88, 1.10, 2.80, 4.40, 5.70, 6.60], // 4,00  │ provisoires
  [1.80, 1.40, 1.40, 1.40, 2.00, 2.50, 6.60, 10.0, 13.0, 15.0], // 6,00  │ (cf. 4-1)
  [5.00, 5.00, 5.00, 5.00, 6.50, 8.00, 19.0, 29.0, 37.0, 43.0], // 10,00 ┘
]

// ASHRAE 4-4 — Transition rectangulaire pyramidale, les deux dimensions varient.
// Idelchik et al. 1986, Diagram 5-4. Comme pour le 4-2, ASHRAE donne les lignes
// A₀/A₁ > 1 pour provisoires, adaptées du 4-1. Les valeurs diffèrent assez du
// 4-2 pour qu'une table distincte soit nécessaire.
const A44_CO: number[][] = [
  [0.26, 0.30, 0.44, 0.54, 0.53, 0.65, 0.77, 0.88, 0.95, 0.98], // A₀/A₁ = 0,06
  [0.24, 0.30, 0.43, 0.50, 0.53, 0.64, 0.75, 0.84, 0.89, 0.91], // 0,10
  [0.20, 0.25, 0.34, 0.36, 0.45, 0.52, 0.58, 0.62, 0.64, 0.64], // 0,25
  [0.14, 0.15, 0.20, 0.21, 0.25, 0.30, 0.33, 0.33, 0.33, 0.32], // 0,50
  [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00], // 1,00 — pas de variation
  [0.23, 0.22, 0.21, 0.20, 0.22, 0.20, 0.49, 0.74, 0.99, 1.10], // 2,00  ┐
  [0.84, 0.68, 0.68, 0.64, 0.88, 1.10, 2.70, 4.30, 5.60, 6.60], // 4,00  │ provisoires
  [1.80, 1.50, 1.50, 1.40, 2.00, 2.50, 6.50, 10.0, 13.0, 15.0], // 6,00  │ (cf. 4-1)
  [5.00, 5.00, 5.10, 5.00, 6.50, 8.00, 19.0, 29.0, 37.0, 43.0], // 10,00 ┘
]

// ASHRAE ED4-2 / ER4-3 — Transition circulaire ↔ rectangulaire, réseaux de
// reprise et d'extraction. Les deux raccords partagent la même table : ED4-2 va
// du rond au rectangulaire, ER4-3 l'inverse. Elle couvre les deux sens, et ses
// axes sont ceux des 4-1 à 4-4 — A₀/A₁ et θ renseigné.
const ARR_CO: number[][] = [
  [0.30, 0.54, 0.53, 0.65, 0.77, 0.88, 0.95, 0.98, 0.98, 0.93], // A₀/A₁ = 0,06
  [0.30, 0.50, 0.53, 0.64, 0.75, 0.84, 0.89, 0.91, 0.91, 0.88], // 0,10
  [0.25, 0.36, 0.45, 0.52, 0.58, 0.62, 0.64, 0.64, 0.64, 0.64], // 0,25
  [0.15, 0.21, 0.25, 0.30, 0.33, 0.33, 0.33, 0.32, 0.31, 0.30], // 0,50
  [0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00, 0.00], // 1,00 — pas de variation
  [0.24, 0.28, 0.26, 0.20, 0.22, 0.24, 0.49, 0.73, 0.97, 1.04], // 2,00
  [0.89, 0.78, 0.79, 0.70, 0.88, 1.12, 2.72, 4.33, 5.62, 6.58], // 4,00
  [1.89, 1.67, 1.59, 1.49, 1.98, 2.52, 6.51, 10.14, 13.05, 15.14], // 6,00
  [5.09, 5.32, 5.15, 5.05, 6.50, 8.05, 19.06, 29.07, 37.08, 43.05], // 10,00
]

// ASHRAE 4-7 — Transition rectangulaire → circulaire, conique à décrochement.
// Idelchik et al. 1986, Diagram 4-9. Table à trois entrées : le rapport de
// sections, l'élancement l/H de la partie conique, et son angle. Le rapport est
// ici **aval sur amont** — le circulaire, plus petit, sur le rectangulaire — donc
// toutes les lignes sont inférieures à 1 : la pièce ne couvre que la réduction.
const A47_R  = [0.10, 0.25, 0.50, 0.80]
const A47_LH = [0.025, 0.05, 0.075, 0.10, 0.15, 0.30, 0.60]
const A47_CO: number[][][] = [
  [ // A_aval/A_amont = 0,10
    [0.46, 0.43, 0.42, 0.40, 0.38, 0.37, 0.38, 0.40, 0.43, 0.46], // l/H = 0,025
    [0.46, 0.42, 0.38, 0.33, 0.30, 0.28, 0.31, 0.36, 0.41, 0.46], // 0,05
    [0.46, 0.39, 0.32, 0.28, 0.23, 0.21, 0.26, 0.32, 0.39, 0.46], // 0,075
    [0.46, 0.36, 0.30, 0.23, 0.19, 0.17, 0.23, 0.30, 0.38, 0.46], // 0,10
    [0.46, 0.34, 0.25, 0.18, 0.15, 0.14, 0.21, 0.29, 0.37, 0.46], // 0,15
    [0.46, 0.31, 0.22, 0.16, 0.13, 0.13, 0.20, 0.28, 0.37, 0.46], // 0,30
    [0.46, 0.25, 0.17, 0.12, 0.10, 0.11, 0.19, 0.27, 0.36, 0.46], // 0,60
  ],
  [ // 0,25
    [0.40, 0.38, 0.36, 0.35, 0.33, 0.32, 0.33, 0.35, 0.37, 0.40],
    [0.40, 0.36, 0.33, 0.29, 0.26, 0.24, 0.27, 0.31, 0.35, 0.40],
    [0.40, 0.34, 0.28, 0.24, 0.20, 0.19, 0.23, 0.28, 0.34, 0.40],
    [0.40, 0.31, 0.26, 0.20, 0.17, 0.14, 0.20, 0.26, 0.33, 0.40],
    [0.40, 0.30, 0.22, 0.16, 0.13, 0.12, 0.18, 0.25, 0.32, 0.40],
    [0.40, 0.27, 0.19, 0.14, 0.11, 0.11, 0.18, 0.25, 0.32, 0.40],
    [0.40, 0.22, 0.14, 0.10, 0.09, 0.10, 0.16, 0.24, 0.32, 0.40],
  ],
  [ // 0,50
    [0.30, 0.28, 0.27, 0.25, 0.24, 0.24, 0.25, 0.26, 0.27, 0.30],
    [0.30, 0.27, 0.24, 0.21, 0.19, 0.18, 0.20, 0.23, 0.26, 0.30],
    [0.30, 0.25, 0.21, 0.18, 0.15, 0.14, 0.17, 0.21, 0.25, 0.30],
    [0.30, 0.23, 0.19, 0.15, 0.12, 0.11, 0.15, 0.19, 0.24, 0.30],
    [0.30, 0.22, 0.16, 0.12, 0.09, 0.09, 0.13, 0.18, 0.24, 0.30],
    [0.30, 0.20, 0.14, 0.10, 0.08, 0.08, 0.13, 0.18, 0.24, 0.30],
    [0.30, 0.16, 0.11, 0.08, 0.07, 0.07, 0.12, 0.17, 0.23, 0.30],
  ],
  [ // 0,80
    [0.15, 0.14, 0.13, 0.13, 0.12, 0.12, 0.12, 0.13, 0.14, 0.15],
    [0.15, 0.13, 0.12, 0.11, 0.10, 0.09, 0.10, 0.12, 0.13, 0.15],
    [0.15, 0.13, 0.10, 0.09, 0.08, 0.07, 0.08, 0.10, 0.13, 0.15],
    [0.15, 0.12, 0.10, 0.07, 0.06, 0.05, 0.07, 0.10, 0.12, 0.15],
    [0.15, 0.11, 0.08, 0.06, 0.05, 0.04, 0.07, 0.09, 0.12, 0.15],
    [0.15, 0.10, 0.07, 0.05, 0.04, 0.04, 0.07, 0.09, 0.12, 0.15],
    [0.15, 0.08, 0.05, 0.04, 0.03, 0.04, 0.06, 0.09, 0.12, 0.15],
  ],
]

// ASHRAE 3-10 — Coude rectangulaire à 90° avec changement de section.
// Idelchik et al. 1986, Diagram 6-4. C′₀ = f(H₀/W₀, W₁/W₀), puis C₀ = K_Re · C′₀.
// W est la dimension dans le plan du coude, celle qui varie ; H est la dimension
// conservée, perpendiculaire à ce plan.
//
// L'axe H₀/W₀ monte jusqu'à l'infini : on l'indexe par son inverse W₀/H₀, où
// cette borne devient 0. Interpoler entre 4 et « ∞ » n'aurait aucun sens autrement,
// et une troncature à 4 rendrait la dernière ligne inatteignable.
const A310_WH = [0, 0.25, 1.00, 4.00]            // W₀/H₀, soit H₀/W₀ = ∞, 4, 1, 0,25
const A310_W1 = [0.6, 0.8, 1.2, 1.4, 1.6, 2.0]   // W₁/W₀
const A310_CO: number[][] = [
  [1.50, 1.00, 0.69, 0.63, 0.60, 0.55],          // H₀/W₀ = ∞
  [1.50, 1.40, 0.81, 0.76, 0.72, 0.66],          // 4,0
  [1.70, 1.40, 1.00, 0.95, 0.90, 0.84],          // 1,0
  [1.80, 1.40, 1.10, 1.10, 1.10, 1.10],          // 0,25
]
// Le document ne publie pas de colonne W₁/W₀ = 1 : le 3-10 vise les raccords
// avec changement de section, un coude à section constante relevant des fittings
// de coude. L'interpolation traverse donc ce vide, de 0,8 à 1,2.
const A310_RE = [10000, 20000, 30000, 40000, 60000, 80000, 100000, 140000]
const A310_KRE = [1.40, 1.26, 1.19, 1.14, 1.09, 1.06, 1.04, 1.00]

const co = (table: number[][], ratio: number, theta: number) =>
  interp2(RATIO_AXIS, THETA_AXIS, table, ratio, theta)


/** Résultat de l'examen d'un nœud : les pièces applicables, ou le motif du
 *  refus. Le motif est affiché à l'utilisateur — un nœud sans transition
 *  proposée doit dire pourquoi, sinon on cherche la panne à l'aveugle. */
export interface TransitionMatch {
  types:  TransitionType[]
  reason: string | null      // renseigné si et seulement si types est vide
}

/** Pièces applicables au nœud d'après les deux sections.
 *  En rectangulaire, la géométrie partage les pièces en deux familles exclusives :
 *   — un seul côté varie : 4-2, 4-3 et 3-10 s'appliquent tous les trois. Ils ne
 *     diffèrent que par la fabrication — deux côtés inclinés symétriques, un
 *     seul, ou un coude à 90° — que rien dans les sections ne permet de deviner.
 *   — les deux côtés varient : seul le 4-4 pyramidal convient, les trois autres
 *     supposant un côté conservé.
 *  Les cas écartés : sections identiques, rien à raccorder ; et changement de
 *  forme circulaire ↔ rectangulaire, qu'aucun diagramme ne couvre. */
export function matchTransition(s0: TransitionShape, s1: TransitionShape): TransitionMatch {
  const no = (reason: string): TransitionMatch => ({ types: [], reason })
  const A0 = sectionArea(s0), A1 = sectionArea(s1)
  if (!(A0 > 0) || !(A1 > 0)) return no('Section amont ou aval indéterminée.')

  if (s0.shape === 'circular' && s1.shape === 'circular') {
    if (s0.d_mm === s1.d_mm) return no('Sections amont et aval identiques — rien à raccorder.')
    return { types: [s1.d_mm > s0.d_mm ? 'trans-4-1-div' : 'trans-4-1-conv'], reason: null }
  }

  if (s0.shape === 'rectangular' && s1.shape === 'rectangular') {
    const sameL = Math.abs(s0.l_mm - s1.l_mm) < DIM_TOL
    const sameH = Math.abs(s0.h_mm - s1.h_mm) < DIM_TOL
    if (sameL && sameH) return no('Sections amont et aval identiques — rien à raccorder.')
    const div = A1 > A0
    if (!sameL && !sameH) {
      // Les deux côtés varient en sens contraires jusqu'à conserver l'aire : la
      // corrélation, indexée sur le seul rapport A₀/A₁, renverrait C₀ = 0 alors
      // que la pièce existe et perd de la charge. Mieux vaut le dire.
      if (Math.abs(A0 - A1) / A0 < 1e-6) return no(
        'Sections de même aire : la corrélation n\'est indexée que sur A₀/A₁ et donnerait '
        + 'C₀ = 0, alors que le raccord perd bien de la charge. Ce cas n\'est pas couvert.')
      return { reason: null, types: [div ? 'trans-4-4-div' : 'trans-4-4-conv'] }
    }
    return { reason: null, types: div
      ? ['trans-4-2-div',  'trans-4-3-div',  'trans-3-10-div']
      : ['trans-4-2-conv', 'trans-4-3-conv', 'trans-3-10-conv'] }
  }

  // Changement de forme : ED4-2 du rond vers le rectangulaire, ER4-3 l'inverse.
  // Seule l'égalité stricte des aires reste écartée : la table y donne C₀ = 0 pour
  // tous les angles, et le raccord serait de surcroît étiqueté à tort augmentation
  // ou diminution.
  if (Math.abs(A0 - A1) / A0 < 1e-6) return no(
    'Sections de même aire : la table donne C₀ = 0 à tous les angles pour A₀/A₁ = 1. '
    + 'Le raccord existe, mais cette corrélation ne lui attribue aucune perte.')
  const versRect = s0.shape === 'circular'
  const div = A1 > A0
  const types: TransitionType[] = [versRect
    ? (div ? 'trans-ed42-div' : 'trans-ed42-conv')
    : (div ? 'trans-er43-div' : 'trans-er43-conv')]
  // Le 4-7 décrit une fabrication particulière du même raccord : rectangulaire
  // vers circulaire, en réduction. Rien dans les sections ne permet de la
  // deviner, elle s'ajoute donc au choix.
  if (!versRect && !div) types.push('trans-4-7')
  return { reason: null, types }
}

/** Dimensions du 3-10 : W est le côté qui varie — celui qui est dans le plan du
 *  coude — et H le côté conservé, perpendiculaire à ce plan. */
function wh310(s0: TransitionShape, s1: TransitionShape) {
  if (s0.shape !== 'rectangular' || s1.shape !== 'rectangular') return null
  const varL = Math.abs(s0.l_mm - s1.l_mm) >= DIM_TOL
  const W0 = varL ? s0.l_mm : s0.h_mm
  const W1 = varL ? s1.l_mm : s1.h_mm
  const H0 = varL ? s0.h_mm : s0.l_mm
  return W0 > 0 && W1 > 0 && H0 > 0 ? { W0, W1, H0 } : null
}

/** ξ rapporté à la pression dynamique **amont** (V₀).
 *  — 4-1 / 4-2 / 4-3 : ξ = C₀(A₀/A₁, θ), lecture directe. Pour le 4-3, θ est
 *    l'angle du seul côté incliné et la table s'arrête à 90°, d'où le bornage.
 *  — 3-10 : ξ = K_Re · C′₀(H₀/W₀, W₁/W₀). C'est le seul à porter une correction
 *    de Reynolds ; sans Re connu on retient K_Re = 1, la valeur au-delà de
 *    140 000, plutôt que d'annuler le coefficient. */
export function computeXiTransition(
  t: VentNodeTransition, s0: TransitionShape, s1: TransitionShape, Re?: number,
): number {
  const A0 = sectionArea(s0), A1 = sectionArea(s1)
  if (!(A0 > 0) || !(A1 > 0)) return 0

  // Raccord de forme : table propre, mais mêmes axes que les autres.
  if (isRoundRect(t.type)) return co(ARR_CO, A0 / A1, t.theta)

  // 4-7 : rapport aval/amont, et troisième axe l/H — H étant la hauteur du
  // rectangulaire amont. Le coefficient se rapporte à la vitesse aval.
  if (isStepped(t.type)) {
    if (s0.shape !== 'rectangular' || !(s0.h_mm > 0)) return 0
    const lh = t.l_mm != null && t.l_mm > 0 ? t.l_mm / s0.h_mm : A47_LH[0]
    return interp3(A47_R, A47_LH, A47_THETA, A47_CO, A1 / A0, lh, t.theta)
  }

  if (isElbow310(t.type)) {
    const g = wh310(s0, s1)
    if (!g) return 0
    const cPrime = interp2(A310_WH, A310_W1, A310_CO, g.W0 / g.H0, g.W1 / g.W0)
    const kRe    = Re != null && Re > 0 ? interp1(A310_RE, A310_KRE, Re) : 1
    return kRe * cPrime
  }

  const circ  = t.type === 'trans-4-1-div' || t.type === 'trans-4-1-conv'
  const table = circ ? A41_CO : isPyramidal(t.type) ? A44_CO : A42_CO
  const theta = isThreeSided(t.type) ? Math.min(t.theta, 90) : t.theta
  return co(table, A0 / A1, theta)
}

export function newTransitionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}
