// ── Jonctions convergentes rondes à collecteur principal conique ─────────────
// ASHRAE 5-4 (30°) et 5-5 (45°), d'après Sepsy and Pies 1973. Deux fittings
// distincts : **on n'interpole jamais entre 30° et 45°**.
//
// Contrairement aux 5-1/5-2/5-3, le collecteur est conique : la section amont
// du trajet droit n'a aucune raison d'égaler la section commune. Les tables
// s'indexent donc sur trois paramètres :
//
//   rs = As/Ac      rb = Ab/Ac      q = Qb/Qs
//
// et non sur Qb/Qc. Noter que q peut dépasser 1 : la branche peut apporter plus
// que le trajet droit.
//
// La grille est **irrégulière** : les lignes Ab/Ac présentes ne sont pas les
// mêmes d'un groupe As/Ac à l'autre. On n'interpole qu'entre des lignes
// réellement imprimées, et jamais au-delà du domaine d'un groupe.

import { interp1 } from './interp'

/** Axe des débits, commun aux quatre tables. */
export const Q54_AXIS = [0.2, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0]

/** Une ligne du diagramme. `rb` à null signale une ligne dont l'étiquette est
 *  inexploitable dans la source : elle est conservée telle quelle mais reste
 *  hors interpolation, faute de savoir où la placer. */
interface Row { rb: number | null; v: number[] }

/** Un groupe As/Ac, avec ses lignes Ab/Ac propres. */
interface Group { rs: number; rows: Row[] }

// ── 5-4 — Wye 30°, converging, round, conical main ───────────────────────────
const C54_B: Group[] = [
  { rs: 0.3, rows: [
    { rb: 0.2, v: [-2.4, -0.11, 1.8, 3.4, 4.8, 6.0, 7.1, 8.0, 8.9, 9.7] },
    { rb: 0.3, v: [-2.8, -1.3, 0.14, 0.72, 1.4, 2.0, 2.4, 2.8, 3.2, 3.5] },
  ] },
  { rs: 0.4, rows: [
    { rb: 0.2, v: [-1.4, 0.61, 2.3, 3.8, 5.2, 6.3, 7.3, 8.3, 9.1, 9.8] },
    { rb: 0.3, v: [-1.8, -0.54, 0.42, 1.2, 1.8, 2.3, 2.7, 3.1, 3.4, 3.7] },
    { rb: 0.4, v: [-1.9, -0.89, -0.17, 0.36, 0.76, 1.1, 1.3, 1.5, 1.7, 1.9] },
  ] },
  { rs: 0.5, rows: [
    { rb: 0.2, v: [-0.82, 0.97, 2.6, 4.0, 5.3, 6.4, 7.4, 8.3, 9.1, 9.9] },
    { rb: 0.3, v: [-1.2, -0.15, 0.71, 1.4, 2.0, 2.5, 2.9, 3.3, 3.6, 3.9] },
    { rb: 0.4, v: [-1.4, -0.54, 0.06, 0.50, 0.85, 1.1, 1.3, 1.5, 1.7, 1.8] },
    { rb: 0.5, v: [-1.4, -0.66, -0.15, 0.21, 0.48, 0.68, 0.84, 0.97, 1.1, 1.2] },
  ] },
  { rs: 0.6, rows: [
    { rb: 0.2, v: [-0.52, 1.2, 2.7, 4.1, 5.3, 6.4, 7.4, 8.3, 9.1, 9.9] },
    { rb: 0.3, v: [-0.93, 0.06, 0.85, 1.5, 2.1, 2.6, 3.0, 3.4, 3.7, 4.0] },
    { rb: 0.4, v: [-1.1, -0.37, 0.16, 0.55, 0.86, 1.1, 1.3, 1.4, 1.6, 1.8] },
    { rb: 0.5, v: [-1.1, -0.49, -0.06, 0.25, 0.48, 0.66, 0.79, 0.90, 1.0, 1.1] },
    { rb: 0.6, v: [-1.2, -0.55, -0.15, 0.12, 0.31, 0.45, 0.56, 0.65, 0.71, 0.77] },
  ] },
  { rs: 0.8, rows: [
    { rb: 0.2, v: [-0.27, 1.3, 2.7, 4.0, 5.2, 6.3, 7.3, 8.2, 9.0, 9.7] },
    { rb: 0.3, v: [-0.67, 0.18, 0.90, 1.5, 2.0, 2.5, 2.9, 3.3, 3.6, 4.0] },
    { rb: 0.4, v: [-0.85, -0.27, 0.16, 0.49, 0.75, 0.97, 1.2, 1.3, 1.4, 1.6] },
    { rb: 0.5, v: [-0.90, -0.40, -0.07, 0.18, 0.36, 0.50, 0.61, 0.70, 0.78, 0.84] },
    { rb: 0.6, v: [-0.92, -0.46, -0.16, 0.04, 0.18, 0.29, 0.37, 0.44, 0.49, 0.53] },
    { rb: 0.7, v: [-0.93, -0.49, -0.21, -0.03, 0.10, 0.19, 0.25, 0.30, 0.34, 0.37] },
    { rb: 0.8, v: [-0.93, -0.50, -0.24, -0.07, 0.05, 0.13, 0.19, 0.23, 0.27, 0.29] },
  ] },
  { rs: 1.0, rows: [
    { rb: 0.2, v: [-0.26, 1.2, 2.6, 3.9, 5.1, 6.1, 7.1, 8.0, 8.8, 9.5] },
    { rb: 0.3, v: [-0.65, 0.12, 0.79, 1.4, 1.9, 2.4, 2.8, 3.1, 3.5, 3.8] },
    { rb: 0.4, v: [-0.83, -0.34, 0.04, 0.33, 0.58, 0.78, 0.95, 1.1, 1.2, 1.3] },
    { rb: 0.5, v: [-0.89, -0.48, -0.20, 0, 0.15, 0.27, 0.37, 0.45, 0.51, 0.57] },
    { rb: 0.6, v: [-0.91, -0.54, -0.31, -0.14, -0.03, 0.06, 0.12, 0.18, 0.22, 0.25] },
    { rb: 0.8, v: [-0.91, -0.59, -0.38, -0.25, -0.16, -0.10, -0.06, -0.03, -0.01, 0.01] },
    { rb: 1.0, v: [-0.93, -0.60, -0.40, -0.28, -0.20, -0.14, -0.11, -0.08, -0.07, -0.06] },
  ] },
]

const C54_S: Group[] = [
  { rs: 0.3, rows: [
    { rb: 0.2, v: [4.5, 2.8, 1.5, 0.56, -0.17, -0.74, -1.2, -1.6, -1.9, -2.1] },
    { rb: 0.3, v: [4.6, 3.1, 2.0, 1.2, 0.57, 0.08, -0.30, -0.62, -0.89, -1.1] },
  ] },
  { rs: 0.4, rows: [
    { rb: 0.2, v: [1.6, 0.85, 0.16, -0.43, -0.92, -1.3, -1.7, -1.9, -2.2, -2.4] },
    { rb: 0.3, v: [1.7, 1.1, 0.58, 0.13, -0.24, -0.56, -0.82, -1.1, -1.3, -1.4] },
    { rb: 0.4, v: [1.8, 1.3, 0.80, 0.42, 0.11, -0.15, -0.37, -0.55, -0.72, -0.86] },
  ] },
  { rs: 0.5, rows: [
    { rb: 0.2, v: [0.67, 0.18, -0.33, -0.79, -1.2, -1.5, -1.8, -2.1, -2.3, -2.5] },
    { rb: 0.3, v: [0.75, 0.42, 0.07, -0.25, -0.54, -0.80, -1.0, -1.2, -1.4, -1.5] },
    { rb: 0.4, v: [0.80, 0.55, 0.28, 0.03, -0.20, -0.40, -0.57, -0.73, -0.86, -0.98] },
    { rb: 0.5, v: [0.82, 0.62, 0.41, 0.20, 0.02, -0.15, -0.29, -0.42, -0.53, -0.63] },
  ] },
  { rs: 0.6, rows: [
    // Dernière valeur imprimée −0,25 alors que la progression de la ligne
    // appelle −2,5 ; conservée telle quelle. Voir ANOMALIES_54.
    { rb: 0.2, v: [0.26, -0.11, -0.54, -0.95, -1.3, -1.6, -1.9, -2.1, -2.4, -0.25] },
    // Les quatre dernières valeurs rompent la progression de la ligne ;
    // conservées telles quelles. Voir ANOMALIES_54.
    { rb: 0.3, v: [0.34, 0.13, -0.14, -0.42, -0.67, -0.90, -0.11, -0.13, -0.14, -0.16] },
    { rb: 0.4, v: [0.39, 0.25, 0.06, -0.14, -0.33, -0.51, -0.66, -0.80, -0.93, -1.0] },
    // Valeur −1,2 à Qb/Qs = 1,0, hors progression ; conservée. Voir ANOMALIES_54.
    { rb: 0.5, v: [0.41, 0.32, 0.18, 0.03, -1.2, -0.26, -0.38, -0.50, -0.60, -0.69] },
    { rb: 0.6, v: [0.43, 0.37, 0.26, 0.14, 0.02, -0.09, -0.19, -0.29, -0.37, -0.45] },
  ] },
  { rs: 0.8, rows: [
    { rb: 0.2, v: [-0.01, -0.30, -0.67, -1.1, -1.4, -1.7, -2.0, -2.2, -2.4, -2.6] },
    { rb: 0.3, v: [0.07, -0.07, -0.29, -0.58, -0.76, -0.97, -1.2, -1.3, -1.5, -1.6] },
    { rb: 0.4, v: [0.11, 0.05, -0.09, -0.26, -0.42, -0.58, -0.72, -0.85, -0.97, -1.1] },
    { rb: 0.5, v: [0.14, 0.12, 0.03, -0.09, -0.21, -0.34, -0.45, -0.55, -0.64, -0.73] },
    { rb: 0.6, v: [0.15, 0.17, 0.11, 0.02, -0.07, -0.17, -0.26, -0.34, -0.42, -0.49] },
    { rb: 0.7, v: [0.17, 0.21, 0.17, 0.11, 0.03, -0.05, -0.12, -0.19, -0.26, -0.32] },
    // Ligne imprimée « Ab/Ac = 0,5 » alors qu'une ligne 0,5 existe déjà dans ce
    // groupe. La suite logique voudrait 0,8 — la table de branche s'arrête là —
    // mais la source ne permet pas de le confirmer : on ne la renomme pas et on
    // la laisse hors interpolation. Voir ANOMALIES_54.
    { rb: null, v: [0.17, 0.23, 0.22, 0.17, 0.11, 0.05, -0.02, -0.07, -0.13, -0.18] },
  ] },
  { rs: 1.0, rows: [
    { rb: 0.2, v: [-0.05, -0.33, -0.70, -1.1, -1.4, -1.7, -2.0, -2.2, -2.4, -2.6] },
    { rb: 0.3, v: [0.03, -0.10, -0.31, -0.55, -0.78, -0.98, -1.2, -1.3, -1.5, -1.6] },
    { rb: 0.4, v: [0.07, 0.02, -0.12, -0.28, -0.44, -0.59, -0.73, -0.86, -0.98, -1.1] },
    { rb: 0.5, v: [0.09, 0.09, 0.01, -0.11, -0.23, -0.35, -0.46, -0.56, -0.65, -0.74] },
    { rb: 0.6, v: [0.11, 0.14, 0.09, 0, -0.09, -0.18, -0.27, -0.35, -0.43, -0.50] },
    { rb: 0.8, v: [0.13, 0.20, 0.19, 0.15, 0.09, 0.03, -0.03, -0.08, -0.14, -0.19] },
    { rb: 1.0, v: [0.14, 0.24, 0.25, 0.24, 0.20, 0.16, 0.12, 0.08, 0.04, 0] },
  ] },
]

// ── 5-5 — Wye 45°, converging, round, conical main ───────────────────────────
const C55_B: Group[] = [
  { rs: 0.3, rows: [
    { rb: 0.2, v: [-2.4, -0.01, 2.0, 3.8, 5.3, 6.6, 7.8, 8.9, 9.8, 11] },
    { rb: 0.3, v: [-2.8, -1.2, 0.12, 1.1, 1.9, 2.6, 3.2, 3.7, 4.2, 4.6] },
  ] },
  { rs: 0.4, rows: [
    { rb: 0.2, v: [-1.2, 0.93, 2.8, 4.5, 5.9, 7.2, 8.4, 9.5, 10, 11] },
    { rb: 0.3, v: [-1.6, -0.27, 0.81, 1.7, 2.4, 3.0, 3.6, 4.1, 4.5, 4.9] },
    { rb: 0.4, v: [-1.8, -0.72, 0.07, 0.66, 1.1, 1.5, 1.8, 2.1, 2.3, 2.5] },
  ] },
  { rs: 0.5, rows: [
    { rb: 0.2, v: [-0.46, 1.5, 3.3, 4.9, 6.4, 7.7, 8.8, 9.9, 11, 12] },
    { rb: 0.3, v: [-0.94, 0.25, 1.2, 2.0, 2.7, 3.3, 3.8, 4.2, 4.7, 5.0] },
    { rb: 0.4, v: [-1.1, -0.24, 0.42, 0.92, 1.3, 1.6, 1.9, 2.1, 2.3, 2.5] },
    { rb: 0.5, v: [-1.2, -0.38, 0.18, 0.58, 0.88, 1.1, 1.3, 1.5, 1.6, 1.7] },
  ] },
  { rs: 0.6, rows: [
    { rb: 0.2, v: [-0.55, 1.3, 3.1, 4.7, 6.1, 7.4, 8.6, 9.6, 11, 12] },
    { rb: 0.3, v: [-1.1, 0, 0.88, 1.6, 2.3, 2.8, 3.3, 3.7, 4.1, 4.5] },
    { rb: 0.4, v: [-1.2, -0.48, 0.10, 0.54, 0.89, 1.2, 1.4, 1.6, 1.8, 2.0] },
    { rb: 0.5, v: [-1.3, -0.62, -0.14, 0.21, 0.47, 0.68, 0.85, 0.99, 1.1, 1.2] },
    { rb: 0.6, v: [-1.3, -0.69, -0.26, 0.04, 0.26, 0.42, 0.57, 0.66, 0.75, 0.82] },
  ] },
  // Ce groupe n'a pas de ligne Ab/Ac = 0,5 : la source passe de 0,4 à 0,6.
  // L'interpolation enjambe donc l'intervalle, comme le veut la règle.
  { rs: 0.8, rows: [
    { rb: 0.2, v: [0.06, 1.8, 3.5, 5.1, 6.5, 7.8, 8.9, 10, 11, 12] },
    { rb: 0.3, v: [-0.52, 0.35, 1.1, 1.7, 2.3, 2.8, 3.2, 3.6, 3.9, 4.2] },
    { rb: 0.4, v: [-0.67, -0.05, 0.43, 0.80, 1.1, 1.4, 1.6, 1.8, 1.9, 2.1] },
    { rb: 0.6, v: [-0.75, -0.27, 0.05, 0.28, 0.45, 0.58, 0.68, 0.76, 0.83, 0.88] },
    { rb: 0.7, v: [-0.77, -0.31, -0.02, 0.18, 0.32, 0.43, 0.50, 0.56, 0.61, 0.65] },
    { rb: 0.8, v: [-0.78, -0.34, -0.07, 0.12, 0.24, 0.33, 0.39, 0.44, 0.47, 0.50] },
  ] },
  { rs: 1.0, rows: [
    { rb: 0.2, v: [0.40, 2.1, 3.7, 5.2, 6.6, 7.8, 9.0, 11, 11, 12] },
    { rb: 0.3, v: [-0.21, 0.54, 1.2, 1.8, 2.3, 2.7, 3.1, 3.7, 3.7, 4.0] },
    { rb: 0.4, v: [-0.33, 0.21, 0.62, 0.96, 1.2, 1.5, 1.7, 2.0, 2.0, 2.1] },
    { rb: 0.5, v: [-0.38, 0.05, 0.37, 0.60, 0.79, 0.93, 1.1, 1.2, 1.2, 1.3] },
    { rb: 0.6, v: [-0.41, -0.02, 0.23, 0.42, 0.55, 0.66, 0.73, 0.80, 0.85, 0.89] },
    { rb: 0.8, v: [-0.44, -0.10, 0.11, 0.24, 0.33, 0.39, 0.43, 0.46, 0.47, 0.48] },
    { rb: 1.0, v: [-0.46, -0.14, 0.05, 0.16, 0.23, 0.27, 0.29, 0.30, 0.30, 0.29] },
  ] },
]

const C55_S: Group[] = [
  { rs: 0.3, rows: [
    // Les deuxième et troisième valeurs rompent la progression de la ligne et
    // reprennent celles de la table de branche ; conservées. Voir ANOMALIES_55.
    { rb: 0.2, v: [5.3, -0.01, 2.0, 1.1, 0.34, -0.20, -0.61, -0.93, -1.2, -1.4] },
    { rb: 0.3, v: [5.4, 3.7, 2.5, 1.6, 1.0, 0.53, 0.16, -0.14, -0.38, -0.58] },
  ] },
  { rs: 0.4, rows: [
    { rb: 0.2, v: [1.9, 1.1, 0.46, -0.07, -0.49, -0.83, -1.1, -1.3, -1.5, -1.7] },
    { rb: 0.3, v: [2.0, 1.4, 0.81, 0.42, 0.08, -0.20, -0.43, -0.62, -0.78, -0.92] },
    { rb: 0.4, v: [2.0, 1.5, 1.0, 0.68, 0.39, 0.16, -0.04, -0.21, -0.35, -0.47] },
  ] },
  { rs: 0.5, rows: [
    { rb: 0.2, v: [0.77, 0.34, -0.09, -0.48, -0.81, -1.1, -1.3, -1.5, -1.7, -1.8] },
    { rb: 0.3, v: [0.85, 0.56, 0.25, -0.03, -0.27, -0.48, -0.67, -0.82, -0.96, -1.1] },
    { rb: 0.4, v: [0.88, 0.66, 0.43, 0.21, 0.02, -0.15, -0.30, -0.42, -0.54, -0.64] },
    { rb: 0.5, v: [0.91, 0.73, 0.54, 0.36, 0.21, 0.06, -0.06, -0.17, -0.26, -0.35] },
  ] },
  { rs: 0.6, rows: [
    { rb: 0.2, v: [0.30, 0, -0.34, -0.67, -0.96, -1.2, -1.4, -1.6, -1.8, -1.9] },
    { rb: 0.3, v: [0.37, 0.21, -0.02, -0.24, -0.44, -0.63, -0.79, -0.93, -1.1, -1.2] },
    // Valeur −0,10 à Qb/Qs = 0,8, hors progression ; conservée. Voir ANOMALIES_55.
    { rb: 0.4, v: [0.40, 0.31, 0.16, -0.10, -0.16, -0.30, -0.43, -0.54, -0.64, -0.73] },
    { rb: 0.5, v: [0.43, 0.37, 0.26, 0.14, 0.02, -0.09, -0.20, -0.29, -0.37, -0.45] },
    { rb: 0.6, v: [0.44, 0.41, 0.33, 0.24, 0.14, 0.05, -0.03, -0.11, -0.18, -0.25] },
  ] },
  { rs: 0.8, rows: [
    { rb: 0.2, v: [-0.06, -0.27, -0.57, -0.86, -1.1, -1.4, -1.6, -1.7, -1.9, -2.0] },
    { rb: 0.3, v: [0, -0.08, -0.25, -0.43, -0.62, -0.78, -0.93, -1.1, -1.2, -1.3] },
    { rb: 0.4, v: [0.04, 0.02, -0.08, -0.21, -0.34, -0.46, -0.57, -0.67, -0.77, -0.85] },
    { rb: 0.5, v: [0.06, 0.08, 0.02, -0.06, -0.16, -0.25, -0.34, -0.42, -0.50, -0.57] },
    { rb: 0.6, v: [0.07, 0.12, 0.09, 0.03, -0.04, -0.11, -0.18, -0.25, -0.31, -0.37] },
    { rb: 0.7, v: [0.08, 0.15, 0.14, 0.10, 0.05, -0.01, -0.07, -0.12, -0.17, -0.22] },
    { rb: 0.8, v: [0.09, 0.17, 0.18, 0.16, 0.11, 0.07, 0.02, -0.02, -0.07, -0.11] },
  ] },
  { rs: 1.0, rows: [
    { rb: 0.2, v: [-0.19, -0.39, -0.67, -0.96, -1.2, -1.5, -1.6, -1.8, -2.0, -2.1] },
    { rb: 0.3, v: [-0.12, -0.19, -0.35, -0.54, -0.71, -0.87, -1.0, -1.2, -1.3, -1.4] },
    { rb: 0.4, v: [-0.09, -0.10, -0.19, -0.31, -0.43, -0.55, -0.66, -0.77, -0.86, -0.94] },
    { rb: 0.5, v: [-0.07, -0.04, -0.09, -0.17, -0.26, -0.35, -0.44, -0.52, -0.59, -0.66] },
    { rb: 0.6, v: [-0.06, 0, -0.02, -0.07, -0.14, -0.21, -0.28, -0.34, -0.40, -0.46] },
    { rb: 0.8, v: [-0.04, 0.06, 0.07, 0.05, 0.02, -0.03, -0.07, -0.12, -0.16, -0.20] },
    // Première valeur −0,3 là où la ligne appelle −0,03 ; conservée. Voir ANOMALIES_55.
    { rb: 1.0, v: [-0.3, 0.09, 0.13, 0.13, 0.11, 0.08, 0.06, 0.03, -0.01, -0.03] },
  ] },
]

/** Valeurs de la source qui rompent la progression de leur ligne. Transcrites
 *  telles quelles : les corriger demanderait une autre source. */
export const ANOMALIES_54 = [
  'Cc,s · As/Ac 0,6 · Ab/Ac 0,2 · Qb/Qs 2,0 : −0,25 (la ligne appellerait −2,5)',
  'Cc,s · As/Ac 0,6 · Ab/Ac 0,3 · Qb/Qs 1,4 à 2,0 : −0,11 / −0,13 / −0,14 / −0,16',
  'Cc,s · As/Ac 0,6 · Ab/Ac 0,5 · Qb/Qs 1,0 : −1,2',
  'Cc,s · As/Ac 0,8 : dernière ligne étiquetée Ab/Ac 0,5, doublon — laissée hors interpolation',
]
export const ANOMALIES_55 = [
  'Cc,s · As/Ac 0,3 · Ab/Ac 0,2 · Qb/Qs 0,4 et 0,6 : −0,01 et 2,0, valeurs de la table de branche',
  'Cc,s · As/Ac 0,6 · Ab/Ac 0,4 · Qb/Qs 0,8 : −0,10',
  'Cc,s · As/Ac 1,0 · Ab/Ac 1,0 · Qb/Qs 0,2 : −0,3',
  'Cc,b · As/Ac 0,8 : pas de ligne Ab/Ac 0,5 dans la source',
]

/** Valeur d'un groupe au rb demandé, ou null si ce groupe ne le couvre pas.
 *  On n'interpole qu'entre deux lignes réellement imprimées, et on n'extrapole
 *  jamais au-delà de la première ou de la dernière. */
function atRb(g: Group, rb: number, q: number): number | null {
  const rows = g.rows.filter(r => r.rb != null)
  const first = rows[0], last = rows[rows.length - 1]
  if (rb < first.rb! - 1e-9 || rb > last.rb! + 1e-9) return null
  for (let k = 0; k < rows.length - 1; k++) {
    const a = rows[k], b = rows[k + 1]
    if (rb <= b.rb! + 1e-9) {
      const t = (rb - a.rb!) / (b.rb! - a.rb!)
      const va = interp1(Q54_AXIS, a.v, q), vb = interp1(Q54_AXIS, b.v, q)
      return va * (1 - t) + vb * t
    }
  }
  return interp1(Q54_AXIS, last.v, q)
}

/** Lecture d'une table : les deux groupes As/Ac encadrants doivent couvrir le
 *  rb demandé, sinon le point est hors du domaine tabulé. rs est borné au
 *  domaine publié (0,3 à 1,0) plutôt qu'extrapolé. */
function lire(gs: Group[], rs: number, rb: number, q: number): number | null {
  const { i, t } = bracket(gs, rs)
  // Sur un As/Ac tabulé, seul ce groupe est lu : exiger que le voisin couvre
  // aussi le rb refuserait des points pourtant imprimés.
  if (t <= 1e-12) return atRb(gs[i], rb, q)
  if (t >= 1 - 1e-12) return atRb(gs[i + 1], rb, q)
  const a = atRb(gs[i], rb, q), b = atRb(gs[i + 1], rb, q)
  if (a == null || b == null) return null
  return a * (1 - t) + b * t
}

/** Intervalle As/Ac encadrant, rs borné au domaine publié. */
function bracket(gs: Group[], rs: number): { i: number; t: number } {
  const x = Math.max(gs[0].rs, Math.min(gs[gs.length - 1].rs, rs))
  let i = gs.length - 2
  for (let k = 0; k < gs.length - 1; k++) { if (gs[k + 1].rs >= x) { i = k; break } }
  return { i, t: (x - gs[i].rs) / (gs[i + 1].rs - gs[i].rs) }
}

export interface ConicalResult { Ccb: number; Ccs: number }

/** Coefficients des deux trajets, tous deux rapportés à la **section commune**.
 *  null si (rs, rb) sort du domaine tabulé — les lignes Ab/Ac disponibles
 *  changent d'un groupe As/Ac à l'autre, et on ne les extrapole pas. */
export function computeConical(
  angle: 30 | 45, rs: number, rb: number, q: number,
): ConicalResult | null {
  const [gb, gspt] = angle === 30 ? [C54_B, C54_S] : [C55_B, C55_S]
  const Ccb = lire(gb, rs, rb, q), Ccs = lire(gspt, rs, rb, q)
  if (Ccb == null || Ccs == null) return null
  return { Ccb, Ccs }
}

/** Domaine Ab/Ac réellement couvert pour un rs donné — sert à expliquer un
 *  refus à l'utilisateur plutôt que de le laisser sans réponse. */
export function domaineRb(angle: 30 | 45, rs: number): { min: number; max: number } {
  const gs = angle === 30 ? C54_B : C55_B
  const gt = angle === 30 ? C54_S : C55_S
  const { i, t } = bracket(gs, rs)
  // Le point doit être couvert par tous les groupes effectivement lus — les deux
  // encadrants dès qu'on interpole, et les deux tables dans tous les cas.
  const lus = t <= 1e-12 ? [gs[i], gt[i]]
    : t >= 1 - 1e-12 ? [gs[i + 1], gt[i + 1]]
    : [gs[i], gs[i + 1], gt[i], gt[i + 1]]
  const bornes = lus.map(g => {
    const r = g.rows.filter(x2 => x2.rb != null)
    return { min: r[0].rb!, max: r[r.length - 1].rb! }
  })
  return {
    min: Math.max(...bornes.map(b => b.min)),
    max: Math.min(...bornes.map(b => b.max)),
  }
}
