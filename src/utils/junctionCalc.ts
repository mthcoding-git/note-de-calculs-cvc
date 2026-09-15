// ── Jonctions convergentes circulaires (ventilation) ─────────────────────────
// Deux écoulements se rejoignent dans un conduit commun : le trajet droit et la
// branche. Chaque trajet a son propre coefficient et sa propre perte de charge —
// une jonction n'en a jamais un seul.
//
// ASHRAE publie trois fittings distincts, issus de trois diagrammes Idelchik
// différents : 5-1 à 30°, 5-2 à 45°, 5-3 à 90°. Ils ne forment pas une famille
// continue : **on n'interpole jamais entre ces angles**. Un raccord à 60° n'est
// pas la moyenne d'un 45° et d'un 90°.

import { interp1, interp2 } from './interp'
import { computeConical, domaineRb } from './junctionConical'
import { computeTee56 } from './junctionTee56'

export type JunctionType =
  | 'jonc-5-1' | 'jonc-5-2' | 'jonc-5-3'      // rond, collecteur cylindrique, As = Ac
  | 'jonc-5-4' | 'jonc-5-5'                   // rond, collecteur conique, As libre
  | 'jonc-5-6'                                // rectangulaire, té à 90°
  | 'jonc-5-7'                                // principal rectangulaire, branche ronde
  | 'jonc-5-8'                                // rectangulaire, piquage droit
  | 'jonc-5-9'                                // rectangulaire, entrée de branche à 45°
  | 'jonc-5-1r'                               // 30°, sections quelconques
  | 'jonc-idel30'                             // 30°, repli analytique Idelchik 1966
  | 'jonc-idel45'                             // 45°, repli analytique Idelchik 1966
  | 'jonc-idel60'                             // 60°, repli analytique Idelchik 1966
  | 'jonc-idel90'                             // 90°, repli Idelchik 1966 (té)
  | 'jonc-idel15'                             // 15°, repli Idelchik 1966, As + Ab = Ac
  | 'jonc-idel30c'                            // 30°, repli Idelchik 1966, As + Ab = Ac

export const JUNCTION_ANGLE: Record<JunctionType, number> = {
  'jonc-5-1': 30, 'jonc-5-2': 45, 'jonc-5-3': 90,
  'jonc-5-4': 30, 'jonc-5-5': 45,
  'jonc-5-6': 90, 'jonc-5-7': 90, 'jonc-5-8': 90, 'jonc-5-9': 45,
  'jonc-5-1r': 30, 'jonc-idel30': 30, 'jonc-idel45': 45, 'jonc-idel60': 60,
  'jonc-idel90': 90, 'jonc-idel15': 15, 'jonc-idel30c': 30,
}

export const JUNCTION_LABELS: Record<JunctionType, string> = {
  // Nommés par ce qu'ils sont, pas par leur source : la pièce, la forme des
  // conduits, l'angle, puis ce qui les distingue. Deux modèles qui décrivent le
  // même raccord portent le même nom — ils ne sont jamais proposés ensemble, et
  // la corrélation employée relève du calcul, pas de la désignation.
  'jonc-5-1':  'Culotte convergente circulaire à 30°',
  'jonc-5-2':  'Culotte convergente circulaire à 45°',
  'jonc-5-3':  'Té convergent circulaire à 90°',
  'jonc-5-4':  'Culotte convergente circulaire à 30°, collecteur conique',
  'jonc-5-5':  'Culotte convergente circulaire à 45°, collecteur conique',
  'jonc-5-6':  'Té convergent rectangulaire à 90°, branche coudée',
  'jonc-5-7':  'Té convergent à 90°, piquage circulaire sur principal rectangulaire',
  'jonc-5-8':  'Té convergent rectangulaire à 90°, piquage droit',
  'jonc-5-9':  'Té convergent rectangulaire, entrée de branche à 45°',
  'jonc-5-1r': 'Culotte convergente à 30°, sections quelconques',
  'jonc-idel30': 'Culotte convergente à 30°, sections quelconques',
  'jonc-idel45': 'Culotte convergente à 45°, sections quelconques',
  'jonc-idel60': 'Culotte convergente à 60°',
  'jonc-idel90': 'Té convergent à 90°, sections quelconques',
  'jonc-idel15': 'Culotte convergente à 15°, sections compensées',
  'jonc-idel30c': 'Culotte convergente à 30°, sections compensées',
}


/** Modèle de repli : n'est proposé que si aucun autre raccord ne couvre la
 *  configuration. Il ne remplace jamais un modèle applicable. */
export function isFallback(t: JunctionType): boolean {
  return t === 'jonc-idel30' || t === 'jonc-idel45'
    || t === 'jonc-idel60' || t === 'jonc-idel90' || sectionsCompensees(t)
}

/** Raccord à sections compensées : les deux arrivées se partagent exactement la
 *  section du commun, As + Ab = Ac. C'est l'inverse de la condition des autres
 *  raccords, où le trajet droit garde à lui seul la section du commun — les deux
 *  ne peuvent pas être vraies en même temps. */
export function sectionsCompensees(t: JunctionType): boolean {
  return t === 'jonc-idel15' || t === 'jonc-idel30c'
}

/** Le modèle du 30° ne lit que des aires : il n'impose aucune forme de section.
 *  Ce raccord accepte donc rond, rectangulaire et les deux mélangés — là où le
 *  5-1 reste réservé aux nœuds entièrement circulaires. */
export function shapeLibre(t: JunctionType): boolean {
  return t === 'jonc-5-1r' || isFallback(t)
}

/** Écart relatif toléré sur l'aire, équivalent aux 2 % admis sur le diamètre. */
export const AIRE_TOL = 0.04

/** Domaine de Ab/Ac documenté par les diagrammes 7-1 à 7-4. */
export const R_IDEL_MIN = 0.1
export const R_IDEL_MAX = 1.0

/** Domaine de Ab/Ac des raccords à sections compensées, plus étroit que celui
 *  des autres replis : la source tabule cinq rapports, de 0,06 à 0,50. Au-delà
 *  de 0,50 la branche serait plus large que le trajet droit, ce que la géométrie
 *  compensée ne prévoit pas. Aux deux plus petits rapports la source laisse de
 *  côté quelques forts débits de branche ; comme on calcule par les équations et
 *  non par la table, ces trous ne restreignent rien — ils privent seulement de
 *  points de contrôle. */
export const R_COMP_MIN = 0.06
export const R_COMP_MAX = 0.50

/** Les deux angles compensés partagent la même forme d'équation et ne diffèrent
 *  que par deux nombres : le facteur du terme de mélange et le palier central de
 *  Ks. Le 15° vient du diagramme 7-8 (table 7-5), le 30° du 7-9 (table 7-6). */
const K_COMP: Partial<Record<JunctionType, number>> = {
  'jonc-idel15': 1.94,
  'jonc-idel30c': 1.74,
}

/** Terme Ks, qui ne pèse que sur le trajet droit : nul jusqu'à Ab/Ac = 0,20,
 *  puis son palier central à 0,33 et 0,40 à 0,50. Les valeurs intermédiaires sont
 *  interpolées linéairement — règle d'implémentation du site, la source ne le
 *  demande pas. */
const KS_COMP_R = [0, 0.20, 0.33, 0.50]
const KS_COMP_V: Partial<Record<JunctionType, number[]>> = {
  'jonc-idel15': [0, 0, 0.14, 0.40],
  'jonc-idel30c': [0, 0, 0.17, 0.40],
}
export function ksCompensee(t: JunctionType, r: number): number {
  const v = KS_COMP_V[t]
  return v ? interp1(KS_COMP_R, v, r) : 0
}

/** Coefficient de l'équation Idelchik, propre à chaque angle : 1,74 pour le Y à
 *  30° (diagrammes 7-1 / 7-2), 1,41 pour celui à 45° (7-3 / 7-4), 1 pour celui à
 *  60° (7-5 / 7-6), dont l'équation ne porte pas de facteur. */
const K_IDEL: Partial<Record<JunctionType, number>> = {
  'jonc-idel30': 1.74,
  'jonc-idel45': 1.41,
  'jonc-idel60': 1,
}

// ── 7-7 — té convergent à 90°, Idelchik 1966 ────────────────────────────────
// Il ne suit pas le moule des 7-1 à 7-6. Sa branche passe par un coefficient
// intermédiaire ξ'c,b que corrige un facteur A fonction de Ab/Ac, et son trajet
// droit se lit sur une courbe, la source ne donnant qu'une approximation.

/** Facteur correctif du diagramme 7-7, qu'Idelchik note « A ». Nommé factorA
 *  ici pour ne pas le confondre avec une aire. La source fixe cinq paliers ; les
 *  valeurs intermédiaires sont interpolées linéairement, ce qui est une règle
 *  d'implémentation et non une consigne d'Idelchik. */
const FACTOR_A_R = [0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0]
const FACTOR_A_V = [1.00, 1.00, 0.75, 0.75, 0.70, 0.65, 0.60]
export function factorA(r: number): number {
  return interp1(FACTOR_A_R, FACTOR_A_V, r)
}

/** Courbe du trajet droit du 7-7, lue sur **Qb/Qc**. Ses onze valeurs sont
 *  celles du 5-3, mais celui-ci les lit sur Qs/Qc : même suite de nombres, axe
 *  opposé. Les deux sources ne sont pas conciliées ici, chacune est appliquée
 *  telle qu'elle est écrite. L'équation 1,55 q − q², que la source donne avec un
 *  signe « ≈ », ne sert que de contrôle. */
const C77_S = [0, 0.16, 0.27, 0.38, 0.46, 0.53, 0.57, 0.59, 0.60, 0.59, 0.55]

/** Approximation analytique du trajet droit, conservée pour contrôle. */
export function cs77Approx(q: number): number {
  return 1.55 * q - q * q
}

export type Forme = 'circular' | 'rectangular'

/** Forme que le raccord suppose de chaque conduit. Le 5-7 est le seul à les
 *  mélanger : principal rectangulaire, piquage rond. */
export function junctionShapes(t: JunctionType): { main: Forme; branch: Forme } {
  if (t === 'jonc-5-6' || t === 'jonc-5-8' || t === 'jonc-5-9') {
    return { main: 'rectangular', branch: 'rectangular' }
  }
  // Le 30° à sections quelconques n'a pas de forme imposée ; la valeur rendue
  // ici ne sert qu'aux appelants qui ne testent pas shapeLibre.
  if (t === 'jonc-5-1r' || isFallback(t)) {
    return { main: 'rectangular', branch: 'rectangular' }
  }
  if (t === 'jonc-5-7') return { main: 'rectangular', branch: 'circular' }
  return { main: 'circular', branch: 'circular' }
}

/** Le collecteur est-il conique ? Les deux familles ne se lisent ni sur les
 *  mêmes axes, ni sous les mêmes conditions d'emploi. */
export function isConical(t: JunctionType): boolean {
  return t === 'jonc-5-4' || t === 'jonc-5-5'
}

/** Pièce enregistrée sur le nœud. Le rôle des deux arrivées n'est pas devinable :
 *  laquelle est la branche et laquelle le trajet droit change le résultat, et
 *  rien dans la géométrie du synoptique ne le dit. Tant que l'utilisateur ne l'a
 *  pas désigné, la jonction reste incomplète. */
export interface VentNodeJunction {
  id:           string
  type:         JunctionType
  branchSegId:  string | null   // tronçon amont tenant lieu de branche
  // Plan dans lequel la branche du té rectangulaire se coude : 'vertical' si
  // elle pique sur la hauteur, 'horizontal' si elle pique sur la largeur. Sans
  // effet sur les coefficients, qui ne connaissent que des sections, mais il
  // désigne le wb de la condition r/wb = 1 et fixe la coupe du schéma.
  orientation?: 'horizontal' | 'vertical'
}

// ── Axes communs ─────────────────────────────────────────────────────────────
const Q_AXIS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
const A_AXIS = [0.1, 0.2, 0.3, 0.4, 0.6, 0.8, 1.0]

// ── 5-1 — Wye 30°, converging. Idelchik Diagram 7-1 ──────────────────────────
// Lignes : Qb/Qc. Colonnes : Ab/Ac.
const C51_B: number[][] = [
  [-1.0, -1.0, -1.0, -0.90, -0.90, -0.90, -0.90],
  [0.21, -0.46, -0.57, -0.51, 0.53, -0.54, -0.54],
  [3.1, 0.37, -0.06, -0.16, 0.23, -0.24, -0.28],
  [7.6, 1.5, 0.50, 0.15, 0.04, -0.06, -0.08],
  [14, 3.0, 1.2, 0.42, 0.19, 0.13, 0.12],
  [21, 4.6, 1.8, 0.53, 0.24, 0.19, 0.15],
  [30, 6.4, 2.6, 0.77, 0.35, 0.25, 0.17],
  [41, 8.5, 3.4, 0.99, 0.42, 0.28, 0.22],
  [54, 12, 4.2, 1.2, 0.47, 0.29, 0.25],
  [58, 14, 5.3, 1.4, 0.49, 0.29, 0.22],
  [84, 17, 6.3, 1.6, 0.49, 0.21, 0.15],
]
const C51_S: number[][] = [
  [0, 0, 0, 0, 0, 0, 0],
  [0.02, 0.11, 0.13, 0.15, 0.16, 0.17, 0.17],
  [-0.33, 0.01, 0.13, 0.19, 0.24, 0.27, 0.29],
  [-1.1, -0.25, -0.01, 0.10, 0.22, 0.30, 0.35],
  [-2.2, -0.75, -0.30, -0.05, 0.17, 0.26, 0.36],
  [-3.6, -1.4, -0.70, -0.35, 0, 0.21, 0.32],
  [-5.4, -2.4, -1.3, -0.70, -0.20, 0.06, 0.25],
  [-7.6, -3.4, -2.0, -1.2, -0.50, -0.15, 0.10],
  [-10, -4.6, -2.7, -1.8, -0.90, -0.43, -0.15],
  [-13, -6.2, -3.7, -2.6, -1.4, -0.80, -0.45],
  [-16, -7.7, -4.8, -3.4, -1.9, -1.2, -0.75],
]

// ── 5-2 — Wye 45°, converging, round. Idelchik Diagram 7-2 ───────────────────
const C52_B: number[][] = [
  [-1.0, -1.0, -1.0, -0.90, -0.90, -0.80, -0.90],
  [0.24, -0.45, -0.56, -0.50, -0.52, -0.53, -0.53],
  [3.2, 0.54, -0.02, -0.14, -0.21, -0.23, -0.23],
  [8.0, 1.6, 0.60, 0.23, 0.06, 0, -0.02],
  [14, 3.2, 1.3, 0.52, 0.25, 0.18, 0.15],
  [22, 5.0, 2.1, 0.65, 0.33, 0.25, 0.22],
  [32, 7.0, 3.0, 0.91, 0.81, 0.61, 0.51],
  [43, 9.2, 3.9, 1.2, 0.56, 0.39, 0.33],
  [56, 12, 4.9, 1.5, 0.66, 0.39, 0.36],
  [71, 15, 6.2, 1.8, 0.72, 0.44, 0.35],
  [87, 19, 7.4, 2.0, 0.78, 0.44, 0.32],
]
// Les valeurs +3,6 et +4,8 de la colonne Ab/Ac = 0,2 sont imprimées positives
// dans la source alors que leurs voisines sont négatives. Conservées telles quelles.
const C52_S: number[][] = [
  [0, 0, 0, 0, 0, 0, 0],
  [0.05, 0.12, 0.14, 0.16, 0.17, 0.17, 0.17],
  [-0.20, 0.17, 0.22, 0.27, 0.27, 0.29, 0.31],
  [-0.76, -0.13, 0.08, 0.20, 0.28, 0.32, 0.40],
  [-1.7, -0.50, -0.12, 0.08, 0.26, 0.36, 0.41],
  [-2.8, -1.0, -0.49, -0.13, 0.16, 0.30, 0.40],
  [-4.3, -1.7, -0.87, -0.45, -0.04, 0.20, 0.33],
  [-6.1, -2.6, -1.4, -0.85, -0.25, 0.08, 0.25],
  [-8.1, 3.6, -2.1, -1.3, -0.55, -0.17, 0.06],
  [-10, 4.8, -2.8, -1.9, -0.88, -0.40, -0.18],
  [-13, -6.1, -3.7, -2.6, -1.4, -0.77, -0.42],
]

// ── 5-3 — Tee 90°, converging, round. Idelchik Diagram 7-4 ───────────────────
// Attention : cette table ne se lit pas sur le même axe que les deux autres.
// Ses lignes sont Qs/Qc, le débit du trajet **droit**, et non Qb/Qc.
const C53_B: number[][] = [
  [-1.0, -1.0, -1.0, -0.90, -0.90, -0.90, -0.90],
  [0.40, -0.37, -0.51, -0.46, -0.50, -0.51, -0.52],
  [3.8, 0.72, 0.17, -0.02, -0.14, -0.18, -0.24],
  [9.2, 2.3, 1.0, 0.44, 0.21, 0.11, -0.08],
  [16, 4.3, 2.1, 0.94, 0.54, 0.40, 0.32],
  [26, 6.8, 3.2, 1.1, 0.66, 0.49, 0.42],
  [37, 9.7, 4.7, 1.6, 0.92, 0.69, 0.57],
  [43, 13, 6.3, 2.1, 1.2, 0.88, 0.72],
  [65, 17, 7.9, 2.7, 1.5, 1.1, 0.86],
  [82, 21, 9.7, 3.4, 1.8, 1.2, 0.99],
  [101, 26, 12, 4.0, 2.1, 1.4, 1.1],
]
/** Le trajet droit du 5-3 ne dépend que de Qs/Qc, pas de la section de branche. */
const C53_S = [0, 0.16, 0.27, 0.38, 0.46, 0.53, 0.57, 0.59, 0.60, 0.59, 0.55]

// ── 5-7 — Tee 90°, branche ronde sur principal rectangulaire. SMACNA 1981 ───
// Deux régimes seulement, selon la vitesse du conduit commun, et non deux axes à
// interpoler : la source publie une ligne sous 1200 fpm et une au-dessus.
const Q57_AXIS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0]
const C57_LENT = [-0.63, -0.55, 0.13, 0.23, 0.78, 1.30, 1.93, 3.10, 4.88, 5.60]
const C57_VITE = [-0.49, -0.21, 0.23, 0.60, 1.27, 2.06, 2.75, 3.70, 4.93, 5.95]
// ── 5-8 — même pièce, piquage rectangulaire. SMACNA 1981, table 6-9D ────────
const C58_LENT = [-0.75, -0.53, -0.03, 0.33, 1.03, 1.10, 2.15, 2.93, 4.18, 4.78]
const C58_VITE = [-0.69, -0.21, 0.23, 0.67, 1.17, 1.66, 2.67, 3.36, 3.93, 5.13]
// ── 5-9 — même pièce, entrée de branche à 45°. SMACNA 1981, table 6-9F ──────
const C59_LENT = [-0.83, -0.68, -0.30, 0.28, 0.55, 1.03, 1.50, 1.93, 2.50, 3.03]
const C59_VITE = [-0.72, -0.52, -0.23, 0.34, 0.76, 1.14, 1.83, 2.01, 2.90, 3.63]

/** Longueur de l'entrée à 45° du 5-9 : L = 0,25 W, jamais moins de 3 pouces.
 *  W est la dimension de la branche **dans le plan du raccord** — celle que le
 *  schéma montre en coupe, pas forcément la largeur au sens de l'utilisateur. */
export const L59_MIN_MM = 3 * 25.4          // 76,2 mm
export function longueurEntree59(W_mm: number): number {
  return Math.max(0.25 * W_mm, L59_MIN_MM)
}
/** 1200 fpm, la frontière entre les deux régimes du 5-7. */
export const V57_SEUIL_MS = 1200 * 0.3048 / 60      // 6,096 m/s
/** Rapports imposés par la fiche 5-7 : ce ne sont pas des axes de table mais
 *  des conditions d'emploi. La tolérance, elle, est une règle d'implémentation. */
export const TOL_57 = 0.05

export interface JunctionInput {
  Qb: number; Qs: number; Qc: number   // débits, unité libre — seuls les rapports comptent
  Ab: number; As: number; Ac: number   // sections, idem
  Vc_ms?: number                       // vitesse du conduit commun — le 5-7 en dépend
  // Dimensions des deux conduits rectangulaires, en mm. Le 5-7 les veut égales
  // une à une, et pas seulement d'aires égales.
  Ws?: number; Hs?: number
  Wc?: number; Hc?: number
}

export interface JunctionResult {
  // Trajets branche et droit vers le commun, rapportés tous deux à la vitesse
  // commune. null quand le point sort du domaine tabulé : le 5-6 lisant ses deux
  // coefficients sur des rapports de débit différents, l'un peut manquer sans
  // l'autre. Le motif dit alors pourquoi.
  Ccb:    number | null
  Ccs:    number | null
  motifB: string | null
  motifS: string | null
  qb:    number      // Qb/Qc
  qs:    number      // Qs/Qc
  a:     number      // Ab/Ac
  rs:    number      // As/Ac
  qbs:   number      // Qb/Qs
  ab_as: number      // Ab/As — axe du té rectangulaire
}

/** Coefficients des deux trajets. Tous deux sont rapportés à la **section
 *  commune** : la perte de charge de chaque trajet se calcule donc sur la
 *  pression dynamique de l'aval, pas sur celle du tronçon concerné.
 *  Les valeurs négatives sont réelles — les deux écoulements échangent de la
 *  quantité de mouvement en se mélangeant — et ne doivent être ni annulées ni
 *  prises en valeur absolue. */
export function computeXiJunction(type: JunctionType, i: JunctionInput): JunctionResult {
  const Qc = i.Qc > 0 ? i.Qc : 1
  const qb = Math.max(0, Math.min(1, i.Qb / Qc))
  const qs = Math.max(0, Math.min(1, i.Qs / Qc))
  const a  = i.Ac > 0 ? i.Ab / i.Ac : 0
  const rs = i.Ac > 0 ? i.As / i.Ac : 0
  const qbs = i.Qs > 0 ? i.Qb / i.Qs : 0
  const ab_as = i.As > 0 ? i.Ab / i.As : 0
  const base = { qb, qs, a, rs, qbs, ab_as, motifB: null, motifS: null }

  if (type === 'jonc-5-7' || type === 'jonc-5-8' || type === 'jonc-5-9') {
    // Géométrie imposée, non interpolable : Ab/As = 0,50, As/Ac = 1,00 et donc
    // Ab/Ac = 0,50. Hors de ces rapports le fitting n'est pas documenté.
    const n = (v: number) => v.toFixed(2).replace('.', ',')
    const ecart = (v: number, cible: number) => Math.abs(v - cible) / cible
    if (ecart(ab_as, 0.5) > TOL_57 || ecart(rs, 1) > TOL_57 || ecart(a, 0.5) > TOL_57) {
      const m = `Ce raccord impose Ab/As = 0,50 et As/Ac = 1,00 ; ici `
        + `${n(ab_as)} et ${n(rs)}.`
      return { ...base, Ccb: null, Ccs: null, motifB: m, motifS: m }
    }
    // Le principal traverse sans changer de section : mêmes largeur et hauteur
    // en amont et en aval. La fiche ne demande que l'égalité des aires — cette
    // condition-ci est plus stricte, et posée pour l'usage qui en est fait ici.
    const dim = (v?: number) => Math.round(v ?? 0)
    if (i.Ws != null && i.Wc != null
      && (Math.abs(dim(i.Ws) - dim(i.Wc)) > 1 || Math.abs(dim(i.Hs) - dim(i.Hc)) > 1)) {
      const m = `Le principal doit garder la même section de part et d'autre du `
        + `piquage : ici ${dim(i.Ws)} × ${dim(i.Hs)} puis ${dim(i.Wc)} × ${dim(i.Hc)} mm.`
      return { ...base, Ccb: null, Ccs: null, motifB: m, motifS: m }
    }
    // Deux régimes de vitesse, pas une interpolation. La source écrit « < 1200 »
    // et « > 1200 fpm » sans trancher l'égalité : on range 1200 fpm dans le
    // régime rapide, et c'est une convention de code, pas une règle ASHRAE.
    const rapide = (i.Vc_ms ?? 0) >= V57_SEUIL_MS
    const ligne = type === 'jonc-5-7' ? (rapide ? C57_VITE : C57_LENT)
      : type === 'jonc-5-8' ? (rapide ? C58_VITE : C58_LENT)
      : (rapide ? C59_VITE : C59_LENT)
    const hors = qb < Q57_AXIS[0] - 1e-9 || qb > 1 + 1e-9
    return {
      ...base,
      Ccb: hors ? null : interp1(Q57_AXIS, ligne, qb),
      // La fiche renvoie explicitement au 5-3 pour le trajet droit.
      Ccs: interp1(Q_AXIS, C53_S, qs),
      motifB: hors ? `Qb/Qc = ${qb.toFixed(2).replace('.', ',')}, hors de la plage `
        + 'tabulée 0,1 – 1,0.' : null,
    }
  }

  if (isFallback(type)) {
    // Repli Idelchik 1966 : des équations, pas des tables. Les valeurs imprimées
    // servent de contrôle — elles s'écartent parfois de la formule de la même
    // page, et c'est la formule qui fait foi : le 58,0 du diagramme 7-1 à
    // q = 0,9 / r = 0,1, que l'équation porte à 67,9 ; le 97,9 du 7-5 au même
    // point, qui vaut 73,9 ; le +0,38 du 7-6 à q = 0,9 / r = 0,6, qui vaut −0,36
    // et change même de signe. Les deux coefficients se rapportent à la vitesse
    // du conduit commun.
    const m3 = (v: number) => (v / 1e6).toFixed(3).replace('.', ',')
    if (sectionsCompensees(type)) {
      // 7-8 — sections compensées. La condition As + Ab = Ac fait partie de la
      // pièce elle-même : hors d'elle, les équations ne décrivent plus rien.
      const somme = i.As + i.Ab
      if (!(i.Ac > 0) || Math.abs(somme - i.Ac) / i.Ac > AIRE_TOL) {
        const m = `Ce raccord partage la section du commun entre ses deux `
          + `arrivées : As + Ab = Ac. Ici ${m3(somme)} m² pour ${m3(i.Ac)} m².`
        return { ...base, Ccb: null, Ccs: null, motifB: m, motifS: m }
      }
      if (a < R_COMP_MIN - 1e-9 || a > R_COMP_MAX + 1e-9) {
        const m = `Ab/Ac = ${a.toFixed(2).replace('.', ',')}, hors du domaine `
          + `documenté 0,06 – 0,50.`
        return { ...base, Ccb: null, Ccs: null, motifB: m, motifS: m }
      }
      const q = qb, r = a
      // Les deux coefficients partagent les mêmes termes de mélange ; seuls le
      // terme de reprise de vitesse et le Ks les séparent.
      const melange = 2 / (1 - r) * (1 - q) ** 2 + K_COMP[type]! * q * q / r
      return {
        ...base,
        Ccb: 1 + (q / r) ** 2 - melange,
        Ccs: 1 + ((1 - q) / (1 - r)) ** 2 - melange + ksCompensee(type, r),
      }
    }
    if (a < R_IDEL_MIN - 1e-9 || a > R_IDEL_MAX + 1e-9) {
      const m = `Ab/Ac = ${a.toFixed(2).replace('.', ',')}, hors du domaine `
        + `documenté 0,10 – 1,00.`
      return { ...base, Ccb: null, Ccs: null, motifB: m, motifS: m }
    }
    const q = qb, r = a
    if (type === 'jonc-idel90') {
      // Branche : le coefficient intermédiaire, puis le facteur A.
      const prime = 1 + (q / r) ** 2 - 2 * (1 - q) ** 2
      return {
        ...base,
        Ccb: factorA(r) * prime,
        // Trajet droit : la courbe publiée, pas l'approximation — la source
        // écrit son équation avec un « ≈ », c'est donc la courbe qui fait foi.
        Ccs: interp1(Q_AXIS, C77_S, q),
      }
    }
    const k = K_IDEL[type]!
    return {
      ...base,
      Ccb: 1 + (q / r) ** 2 - 2 * (1 - q) ** 2 - k * q * q / r,
      Ccs: 1 - (1 - q) ** 2 - k * q * q / r,
    }
  }

  if (type === 'jonc-5-6') {
    // Té rectangulaire : géométrie prise sur un nuage de sept couples, et deux
    // rapports de débit distincts — Qb/Qc pour la branche, Qb/Qs pour le droit.
    const t = computeTee56(ab_as, a, qb, qbs)
    return { ...base, Ccb: t.Ccb, Ccs: t.Ccs, motifB: t.motifB, motifS: t.motifS }
  }

  if (isConical(type)) {
    // Collecteur conique : la lecture se fait sur (As/Ac, Ab/Ac, Qb/Qs) et le
    // point peut tomber hors du domaine tabulé — les lignes Ab/Ac disponibles
    // changent d'un groupe As/Ac à l'autre, et on ne les extrapole pas.
    const c = computeConical(type === 'jonc-5-4' ? 30 : 45, rs, a, qbs)
    if (c) return { ...base, Ccb: c.Ccb, Ccs: c.Ccs }
    const d = domaineRb(type === 'jonc-5-4' ? 30 : 45, rs)
    const n = (v: number) => v.toFixed(2).replace('.', ',')
    const m = `Hors domaine tabulé : à As/Ac = ${n(rs)}, Ab/Ac va de ${n(d.min)} `
      + `à ${n(d.max)} ; ici ${n(a)}.`
    return { ...base, Ccb: null, Ccs: null, motifB: m, motifS: m }
  }

  if (type === 'jonc-5-3') {
    // Le 5-3 s'indexe sur le débit du trajet droit : employer Qb/Qc ici
    // donnerait un coefficient lu à l'autre bout de la table.
    return { ...base, Ccb: interp2(Q_AXIS, A_AXIS, C53_B, qs, a),
      Ccs: interp1(Q_AXIS, C53_S, qs) }
  }
  // Le 30° à sections quelconques lit exactement les tables du 5-1 : le modèle
  // ne connaît que Qb/Qc et Ab/Ac, jamais une forme de conduit.
  const [tb, ts] = type === 'jonc-5-1' || type === 'jonc-5-1r'
    ? [C51_B, C51_S] : [C52_B, C52_S]
  return { ...base, Ccb: interp2(Q_AXIS, A_AXIS, tb, qb, a),
    Ccs: interp2(Q_AXIS, A_AXIS, ts, qb, a) }
}

// ── Rôle des deux arrivées ───────────────────────────────────────────────────
// Les trois fittings supposent As = Ac : le trajet droit garde le diamètre du
// conduit commun. Ce n'est donc pas une préférence de tracé mais une condition
// d'emploi, et elle désigne le plus souvent les rôles à elle seule.

export const DI_TOL = 0.02      // écart relatif toléré sur le diamètre

export interface ArmDi {
  segId: string
  di_mm: number
  shape?: Forme
  a_mm?: number       // rectangulaire : largeur
  b_mm?: number       // rectangulaire : hauteur
  A_mm2?: number      // section réelle — le 30° à sections quelconques s'y réfère
}

export interface ArmRoles {
  ok:         boolean
  ambigu:     boolean          // les deux arrivées conviennent : le choix revient à l'utilisateur
  branchId:   string | null
  straightId: string | null
  reason:     string | null    // renseigné si et seulement si ok est faux
}

/** Répartit les deux arrivées entre branche et trajet droit.
 *   — aucune n'a le diamètre du commun : le fitting ne s'applique pas ;
 *   — une seule l'a : elle est le trajet droit, il n'y a rien à choisir ;
 *   — les deux l'ont : les rôles sont interchangeables et c'est à l'utilisateur
 *     de trancher, le résultat n'étant pas le même dans un sens ou dans l'autre. */
export function resolveArms(
  arms: ArmDi[], dc_mm: number, branchSegId: string | null,
): ArmRoles {
  const ko = (ambigu: boolean, reason: string): ArmRoles =>
    ({ ok: false, ambigu, branchId: null, straightId: null, reason })
  if (arms.length !== 2 || !(dc_mm > 0)) return ko(false, 'Deux arrivées et un départ sont attendus.')
  const colle = arms.filter(a => Math.abs(a.di_mm - dc_mm) / dc_mm <= DI_TOL)
  if (colle.length === 0) return ko(false,
    `Ces raccords supposent un trajet droit de même diamètre que le conduit commun `
    + `(Ø${Math.round(dc_mm)} mm). Aucune des deux arrivées ne l'a — `
    + arms.map(a => `Ø${Math.round(a.di_mm)}`).join(' et ') + '.')

  if (colle.length === 1) {
    const straightId = colle[0].segId
    return { ok: true, ambigu: false, straightId, reason: null,
      branchId: arms.find(a => a.segId !== straightId)!.segId }
  }
  if (!branchSegId || !arms.some(a => a.segId === branchSegId)) return ko(true,
    'Les deux arrivées ont le diamètre du conduit commun : désignez celle qui '
    + 'tient lieu de branche.')
  return { ok: true, ambigu: true, branchId: branchSegId, reason: null,
    straightId: arms.find(a => a.segId !== branchSegId)!.segId }
}

/** Le collecteur cylindrique impose As = Ac ; le conique n'impose rien, c'est
 *  justement sa raison d'être. La première famille peut donc ne pas s'appliquer
 *  là où la seconde s'applique toujours. */
export function familyApplies(conical: boolean, arms: ArmDi[], dc_mm: number): boolean {
  if (arms.length !== 2 || !(dc_mm > 0)) return false
  return conical || arms.some(a => Math.abs(a.di_mm - dc_mm) / dc_mm <= DI_TOL)
}

/** Rôles des deux arrivées pour un raccord donné. Sur collecteur conique aucun
 *  diamètre ne trahit la branche — les deux arrivées peuvent différer du commun
 *  — donc la désignation revient toujours à l'utilisateur. */
export function resolveArmsFor(
  type: JunctionType, arms: ArmDi[], commun: ArmDi, branchSegId: string | null,
): ArmRoles {
  const dc_mm = commun.di_mm
  if (type === 'jonc-5-7') {
    // Le piquage est rond et le trajet droit rectangulaire : la forme des
    // arrivées suffit à les distinguer, il n'y a rien à demander.
    const ronds = arms.filter(a => a.shape === 'circular')
    if (arms.length !== 2 || ronds.length !== 1) {
      return { ok: false, ambigu: false, branchId: null, straightId: null,
        reason: 'Ce raccord demande une arrivée ronde en piquage et une arrivée '
          + 'rectangulaire en trajet droit.' }
    }
    const branchId = ronds[0].segId
    return { ok: true, ambigu: false, branchId, reason: null,
      straightId: arms.find(a => a.segId !== branchId)!.segId }
  }
  if (sectionsCompensees(type)) {
    // Les deux arrivées se partagent la section du commun : aucune ne la porte à
    // elle seule, le critère des autres raccords ne dit donc rien ici. C'est le
    // domaine qui tranche — il s'arrête à Ab/Ac = 0,50, donc la branche est la
    // plus petite des deux. À sections égales rien ne les départage.
    const ac = commun.A_mm2 ?? 0
    const m2 = (v?: number) => ((v ?? 0) / 1e6).toFixed(3)
    if (arms.length !== 2 || !(ac > 0)) {
      return { ok: false, ambigu: false, branchId: null, straightId: null,
        reason: 'Deux arrivées et un départ sont attendus.' }
    }
    const somme = arms.reduce((t, a) => t + (a.A_mm2 ?? 0), 0)
    if (Math.abs(somme - ac) / ac > AIRE_TOL) {
      return { ok: false, ambigu: false, branchId: null, straightId: null,
        reason: `Ce raccord partage la section du conduit commun entre ses deux `
          + `arrivées : As + Ab = Ac. Ici `
          + arms.map(a => m2(a.A_mm2)).join(' + ') + ` = ${m2(somme)} m² `
          + `pour ${m2(ac)} m².` }
    }
    const tri = [...arms].sort((x, y) => (x.A_mm2 ?? 0) - (y.A_mm2 ?? 0))
    const petite = tri[0], grande = tri[1]
    if ((grande.A_mm2 ?? 0) - (petite.A_mm2 ?? 0) > AIRE_TOL * ac) {
      return { ok: true, ambigu: false, branchId: petite.segId, reason: null,
        straightId: grande.segId }
    }
    if (!branchSegId || !arms.some(a => a.segId === branchSegId)) {
      return { ok: false, ambigu: true, branchId: null, straightId: null,
        reason: 'Les deux arrivées ont la même section : désignez celle qui '
          + 'tient lieu de branche.' }
    }
    return { ok: true, ambigu: true, branchId: branchSegId, reason: null,
      straightId: arms.find(a => a.segId !== branchSegId)!.segId }
  }
  if (type === 'jonc-5-1r' || isFallback(type)) {
    // Même condition d'emploi que le 5-1 — le trajet droit garde la section du
    // commun — mais lue sur l'aire, seule grandeur qui ait un sens quand les
    // formes diffèrent. Le 5-1r lit des mesures ASHRAE faites sur un principal
    // d'un seul tenant : il exige en plus que le trajet droit ait la forme du
    // commun. Les replis Idelchik, eux, ne connaissent que des aires.
    const ac = commun.A_mm2 ?? 0
    const continu = (a: ArmDi) => isFallback(type) || a.shape === commun.shape
    const meme = (a: ArmDi) => ac > 0 && continu(a)
      && Math.abs((a.A_mm2 ?? 0) - ac) / ac <= AIRE_TOL
    const droits = arms.filter(meme)
    if (arms.length !== 2 || droits.length === 0) {
      const m2 = (v?: number) => ((v ?? 0) / 1e6).toFixed(3)
      return { ok: false, ambigu: false, branchId: null, straightId: null,
        reason: `Le trajet droit doit garder la section du conduit commun `
          + `(${m2(ac)} m²)${isFallback(type) ? '' : ', et sa forme'}. `
          + `Aucune des deux arrivées ne convient — `
          + arms.map(a => m2(a.A_mm2) + ' m²').join(' et ') + '.' }
    }
    if (droits.length === 1) {
      const straightId = droits[0].segId
      return { ok: true, ambigu: false, straightId, reason: null,
        branchId: arms.find(a => a.segId !== straightId)!.segId }
    }
    if (!branchSegId || !arms.some(a => a.segId === branchSegId)) {
      return { ok: false, ambigu: true, branchId: null, straightId: null,
        reason: 'Les deux arrivées ont la section du conduit commun : désignez '
          + 'celle qui tient lieu de branche.' }
    }
    return { ok: true, ambigu: true, branchId: branchSegId, reason: null,
      straightId: arms.find(a => a.segId !== branchSegId)!.segId }
  }
  if (type === 'jonc-5-6' || type === 'jonc-5-8' || type === 'jonc-5-9') {
    // Le principal traverse sans changer de section : le trajet droit est celui
    // qui garde les deux dimensions du conduit commun. C'est lui qui désigne les
    // rôles, exactement comme le diamètre le fait sur les raccords ronds.
    const mm = (v?: number) => Math.round(v ?? 0)
    const meme = (a: ArmDi) => Math.abs(mm(a.a_mm) - mm(commun.a_mm)) <= 1
      && Math.abs(mm(a.b_mm) - mm(commun.b_mm)) <= 1
    const droits = arms.filter(meme)
    if (arms.length !== 2 || droits.length === 0) {
      return { ok: false, ambigu: false, branchId: null, straightId: null,
        reason: `Le trajet droit doit garder la section du conduit commun `
          + `(${mm(commun.a_mm)} × ${mm(commun.b_mm)} mm). Aucune des deux `
          + `arrivées ne l'a — ` + arms.map(a => `${mm(a.a_mm)} × ${mm(a.b_mm)}`)
            .join(' et ') + '.' }
    }
    if (droits.length === 1) {
      const straightId = droits[0].segId
      return { ok: true, ambigu: false, straightId, reason: null,
        branchId: arms.find(a => a.segId !== straightId)!.segId }
    }
    if (!branchSegId || !arms.some(a => a.segId === branchSegId)) {
      return { ok: false, ambigu: true, branchId: null, straightId: null,
        reason: 'Les deux arrivées ont la section du conduit commun : désignez '
          + 'celle qui tient lieu de branche.' }
    }
    return { ok: true, ambigu: true, branchId: branchSegId, reason: null,
      straightId: arms.find(a => a.segId !== branchSegId)!.segId }
  }
  // Faute de forme ou de section distinctives, la branche se désigne à la main.
  if (!isConical(type)) return resolveArms(arms, dc_mm, branchSegId)
  if (arms.length !== 2 || !(dc_mm > 0)) {
    return { ok: false, ambigu: false, branchId: null, straightId: null,
      reason: 'Deux arrivées et un départ sont attendus.' }
  }
  if (!branchSegId || !arms.some(a => a.segId === branchSegId)) {
    return { ok: false, ambigu: true, branchId: null, straightId: null,
      reason: 'Rien dans les sections ne désigne la branche : indiquez laquelle '
        + 'des deux arrivées en tient lieu.' }
  }
  return { ok: true, ambigu: true, branchId: branchSegId, reason: null,
    straightId: arms.find(a => a.segId !== branchSegId)!.segId }
}

/** Un conduit du nœud, avec tout ce qu'il faut pour juger d'un raccord. */
export interface ArmGeom {
  segId:  string
  shape:  Forme
  di_mm:  number
  a_mm?:  number
  b_mm?:  number
  A_mm2:  number
  Q_m3h:  number
}

/** Tous les types de raccords, dans l'ordre de présentation. */
export const JUNCTION_TYPES: JunctionType[] = ['jonc-5-1', 'jonc-5-2', 'jonc-5-3',
  'jonc-5-4', 'jonc-5-5', 'jonc-5-1r', 'jonc-5-6', 'jonc-5-7', 'jonc-5-8', 'jonc-5-9',
  'jonc-idel30', 'jonc-idel45', 'jonc-idel60', 'jonc-idel90', 'jonc-idel15', 'jonc-idel30c']

/** Raccords réellement applicables à ce nœud.
 *
 *  La forme des conduits élimine déjà l'essentiel. Au-delà, quand les rôles se
 *  déduisent seuls — sans rien demander à l'utilisateur — on va jusqu'au bout du
 *  calcul : un raccord dont la géométrie sort du domaine tabulé n'est pas
 *  proposé du tout. Si les rôles restent à désigner, on ne peut pas juger et le
 *  raccord est conservé, sinon il disparaîtrait au moment même où l'utilisateur
 *  tranche. */
export function junctionTypesApplicables(
  arms: ArmGeom[], common: ArmGeom,
): JunctionType[] {
  if (arms.length !== 2 || !(common.A_mm2 > 0)) return []
  const dis = arms.map(a => ({ segId: a.segId, di_mm: a.di_mm, shape: a.shape,
    a_mm: a.a_mm, b_mm: a.b_mm, A_mm2: a.A_mm2 }))
  const commun: ArmDi = { segId: common.segId, di_mm: common.di_mm,
    shape: common.shape, a_mm: common.a_mm, b_mm: common.b_mm, A_mm2: common.A_mm2 }
  const Vc = (common.Q_m3h / 3600) / (common.A_mm2 / 1e6)
  const utilisable = (t: JunctionType) => {
    if (shapeLibre(t)) {
      // Aucune forme imposée. Le 5-1r réclame seulement qu'un conduit soit
      // rectangulaire : sur un nœud entièrement rond, c'est le 5-1 qui répond.
      // Les replis Idelchik n'ont besoin de rien — la priorité par angle suffit
      // à les tenir à l'écart tant qu'un modèle propre couvre l'angle.
      if (!isFallback(t) && common.shape !== 'rectangular'
        && !arms.some(a => a.shape === 'rectangular')) return false
    } else {
      const fo = junctionShapes(t)
      if (common.shape !== fo.main) return false
      const nb = arms.filter(a => a.shape === fo.branch).length
      const ns = arms.filter(a => a.shape === fo.main).length
      if (fo.main === fo.branch) { if (ns !== 2) return false }
      else if (nb !== 1 || ns !== 1) return false
    }
    // Le collecteur cylindrique exige en plus une arrivée au diamètre du commun.
    if (!isConical(t) && !shapeLibre(t) && junctionShapes(t).main === 'circular'
      && !familyApplies(false, dis, common.di_mm)) return false
    // Rôles déduits : un seul cas à juger. Rôles à désigner : le raccord est
    // retenu dès qu'une des deux désignations donne un coefficient — la carte
    // ne peut donc pas s'évanouir au moment où l'utilisateur tranche.
    const dedans = resolveArmsFor(t, dis, commun, null)
    const cas = dedans.ok ? [dedans]
      : arms.map(a => resolveArmsFor(t, dis, commun, a.segId))
    return cas.some(r => {
      if (!r.ok) return false
      const b = arms.find(x => x.segId === r.branchId)!
      const d = arms.find(x => x.segId === r.straightId)!
      const x = computeXiJunction(t, {
        Qb: b.Q_m3h, Qs: d.Q_m3h, Qc: common.Q_m3h,
        Ab: b.A_mm2, As: d.A_mm2, Ac: common.A_mm2, Vc_ms: Vc,
        Ws: d.a_mm, Hs: d.b_mm, Wc: common.a_mm, Hc: common.b_mm,
      })
      return x.Ccb != null || x.Ccs != null
    })
  }
  // Les modèles du site d'abord. Un repli n'est offert que si aucun modèle
  // propre ne couvre **le même angle** : un raccord à 45° ne se rabat pas sur
  // un modèle à 30° sous prétexte que celui-ci sait calculer le nœud.
  const propres = JUNCTION_TYPES.filter(t => !isFallback(t) && utilisable(t))
  const replis  = JUNCTION_TYPES.filter(t => isFallback(t) && utilisable(t)
    && !propres.some(x => JUNCTION_ANGLE[x] === JUNCTION_ANGLE[t]))
  return [...propres, ...replis]
}

/** Pourquoi aucun raccord ne s'applique. On retient l'explication de la famille
 *  la plus proche — celle dont les formes de conduits correspondent —, faute de
 *  quoi on parle des formes elles-mêmes. */
export function junctionMotif(arms: ArmGeom[], common: ArmGeom): string {
  if (arms.length !== 2) return 'Deux arrivées et un départ sont attendus.'
  const dis = arms.map(a => ({ segId: a.segId, di_mm: a.di_mm, shape: a.shape,
    a_mm: a.a_mm, b_mm: a.b_mm, A_mm2: a.A_mm2 }))
  const commun: ArmDi = { segId: common.segId, di_mm: common.di_mm,
    shape: common.shape, a_mm: common.a_mm, b_mm: common.b_mm, A_mm2: common.A_mm2 }
  const Vc = (common.Q_m3h / 3600) / (common.A_mm2 / 1e6)
  // On explique d'abord le raccord dont le nœud s'approche le plus. Presque tous
  // demandent un trajet droit à la section du commun ; celui à sections
  // compensées demande l'inverse — que les deux arrivées la fassent à elles
  // deux. Quand c'est de cette condition-là que le nœud est le plus près, c'est
  // elle qu'il faut nommer, sans quoi l'utilisateur ne voit jamais de combien il
  // manque.
  const ac = common.A_mm2
  const ecartSomme = Math.abs(arms.reduce((t, a) => t + a.A_mm2, 0) - ac) / ac
  const ecartSeule = Math.min(...arms.map(a => Math.abs(a.A_mm2 - ac) / ac))
  const ordre = ecartSomme < ecartSeule
    ? [...JUNCTION_TYPES.filter(sectionsCompensees),
       ...JUNCTION_TYPES.filter(t => !sectionsCompensees(t))]
    : JUNCTION_TYPES
  for (const t of ordre) {
    // Même tamis que pour les raccords applicables : ceux qui ne lisent que des
    // aires n'imposent aucune forme, et les écarter ici reviendrait à parler de
    // formes de conduit là où le vrai obstacle est une section.
    if (shapeLibre(t)) {
      if (!isFallback(t) && common.shape !== 'rectangular'
        && !arms.some(a => a.shape === 'rectangular')) continue
    } else {
      const fo = junctionShapes(t)
      if (common.shape !== fo.main) continue
      const nb = arms.filter(a => a.shape === fo.branch).length
      const ns = arms.filter(a => a.shape === fo.main).length
      if (fo.main === fo.branch ? ns !== 2 : (nb !== 1 || ns !== 1)) continue
    }
    const r = resolveArmsFor(t, dis, commun, null)
    if (!r.ok && !r.ambigu && r.reason) return r.reason
    const cas = r.ok ? [r] : arms.map(a => resolveArmsFor(t, dis, commun, a.segId))
    for (const c of cas) {
      if (!c.ok) continue
      const b = arms.find(x => x.segId === c.branchId)!
      const d = arms.find(x => x.segId === c.straightId)!
      const x = computeXiJunction(t, {
        Qb: b.Q_m3h, Qs: d.Q_m3h, Qc: common.Q_m3h,
        Ab: b.A_mm2, As: d.A_mm2, Ac: common.A_mm2, Vc_ms: Vc,
        Ws: d.a_mm, Hs: d.b_mm, Wc: common.a_mm, Hc: common.b_mm,
      })
      if (x.motifB) return x.motifB
      if (x.motifS) return x.motifS
    }
  }
  return 'Aucun raccord répertorié ne couvre ces formes de conduit.'
}

export function newJunctionId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}
