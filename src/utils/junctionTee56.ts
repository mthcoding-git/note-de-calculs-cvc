// ── Té convergent rectangulaire — ASHRAE 5-6 ─────────────────────────────────
// Idelchik 1986, diagramme 7-11. Angle fixe à 90°, il n'y a rien à choisir.
//
// Deux particularités gouvernent cette implémentation :
//
//  1. Les sept géométries publiées ne forment **pas** une grille. Ce sont sept
//     couples (Ab/As, Ab/Ac) dispersés dans le plan. Une interpolation bilinéaire
//     supposerait des combinaisons qui n'ont jamais été mesurées : on triangule
//     le nuage et on interpole dans le triangle qui contient le point, sans
//     jamais sortir de l'enveloppe des points publiés.
//
//  2. Les deux coefficients ne se lisent pas sur le même rapport de débit :
//     Cc,b sur Qb/Qc, Cc,s sur **Qb/Qs**. Comme Qb/Qs = (Qb/Qc)/(1 − Qb/Qc), un
//     même fonctionnement peut tomber dans le domaine de l'un et hors de celui
//     de l'autre — à Qb/Qs = 1,2 par exemple, Qb/Qc vaut 0,545, tabulé, alors que
//     1,2 ne l'est pas. Chaque coefficient est donc rendu indépendamment.
//
// Condition d'emploi du fitting, portée par sa géométrie : r/wb = 1, le rayon
// d'arrondi de la branche égale sa largeur de référence. Rien dans un tronçon ne
// permet de le vérifier ici : c'est à l'utilisateur de s'en assurer.

/** Axe des débits, commun aux deux tables — mais lu sur Qb/Qc d'un côté et sur
 *  Qb/Qs de l'autre. */
const Q56 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]

/** Les sept géométries publiées : x = Ab/As, y = Ab/Ac. */
const PTS = [
  { x: 0.33, y: 0.25 },
  { x: 0.50, y: 0.50 },
  { x: 0.67, y: 0.50 },
  { x: 1.00, y: 0.50 },
  { x: 1.00, y: 1.00 },
  { x: 1.33, y: 1.00 },
  { x: 2.00, y: 1.00 },
]

// Cc,b — trajet branche → commun, lu sur Qb/Qc.
const T56_B: number[][] = [
  [-1.2, -0.40, 0.40, 1.6, 3.0, 4.8, 6.8, 8.9, 11],
  [-0.50, -0.20, 0, 0.25, 0.45, 0.70, 1.0, 1.5, 2.0],
  [-1.0, -0.60, -0.20, 0.10, 0.30, 0.60, 1.0, 1.5, 2.0],
  [-2.2, -1.5, -0.95, -0.50, 0, 0.40, 0.80, 1.3, 1.9],
  [-0.60, -0.30, -0.10, -0.04, 0.13, 0.21, 0.29, 0.36, 0.42],
  [-1.2, -0.80, -0.40, -0.20, 0, 0.16, 0.24, 0.32, 0.38],
  [-2.1, -1.4, -0.90, -0.50, -0.20, 0, 0.20, 0.25, 0.30],
]

// Cc,s — trajet droit → commun, lu sur Qb/Qs.
const T56_S: number[][] = [
  [0.30, 0.30, 0.20, -0.10, -0.45, -0.92, -1.5, -2.0, -2.6],
  [0.17, 0.16, 0.10, 0, -0.08, -0.18, -0.27, -0.37, -0.46],
  [0.27, 0.35, 0.32, 0.25, 0.12, -0.03, -0.23, -0.42, -0.58],
  [1.2, 1.1, 0.90, 0.65, 0.35, 0, -0.40, -0.80, -1.3],
  [0.18, 0.24, 0.27, 0.26, 0.23, 0.18, 0.10, 0, -0.12],
  // Première valeur 0,75 là où la ligne, comme ses voisines, monterait avant de
  // redescendre ; transcrite telle quelle. Voir ANOMALIES_56.
  [0.75, 0.36, 0.38, 0.35, 0.27, 0.18, 0.05, -0.08, -0.22],
  [0.80, 0.87, 0.80, 0.68, 0.55, 0.40, 0.25, 0.08, -0.10],
]

export const ANOMALIES_56 = [
  'Cc,s · Ab/As 1,33 · Ab/Ac 1,00 · Qb/Qs 0,1 : 0,75, hors de la progression de la ligne',
]

/** Triangulation du nuage. Deux bandes : la première relie le point isolé
 *  (0,33 ; 0,25) au palier Ab/Ac = 0,50, la seconde relie ce palier à celui de
 *  Ab/Ac = 1,00. Leur réunion est exactement l'enveloppe convexe des sept
 *  points — donc le domaine réellement couvert. */
const TRIS: [number, number, number][] = [
  [0, 1, 2], [0, 2, 3],
  [1, 2, 4], [2, 3, 4],
  [3, 4, 5], [3, 5, 6],
]

/** Coordonnées barycentriques de (px, py) dans un triangle, ou null s'il est
 *  dégénéré. Le point est dedans quand les trois sont positives. */
function bary(px: number, py: number, t: [number, number, number]): number[] | null {
  const a = PTS[t[0]], b = PTS[t[1]], c = PTS[t[2]]
  const den = (b.y - c.y) * (a.x - c.x) + (c.x - b.x) * (a.y - c.y)
  if (Math.abs(den) < 1e-12) return null
  const l0 = ((b.y - c.y) * (px - c.x) + (c.x - b.x) * (py - c.y)) / den
  const l1 = ((c.y - a.y) * (px - c.x) + (a.x - c.x) * (py - c.y)) / den
  return [l0, l1, 1 - l0 - l1]
}

/** Poids des sept lignes pour une géométrie donnée, ou null hors domaine.
 *  Interpolation linéaire triangulée : c'est une règle d'implémentation, la
 *  fiche ASHRAE ne prescrivant pas de méthode entre géométries. */
function poids(x: number, y: number): number[] | null {
  for (const t of TRIS) {
    const l = bary(x, y, t)
    if (!l || l.some(v => v < -1e-9)) continue
    const w = new Array(PTS.length).fill(0)
    t.forEach((p, i) => { w[p] += l[i] })
    return w
  }
  return null
}

/** Lecture d'une table à la géométrie et au débit demandés. null hors domaine :
 *  ni la géométrie ni le rapport de débit ne s'extrapolent. */
function lire(tab: number[][], w: number[], q: number): number | null {
  if (q < Q56[0] - 1e-9 || q > Q56[Q56.length - 1] + 1e-9) return null
  let i = Q56.length - 2
  for (let k = 0; k < Q56.length - 1; k++) { if (Q56[k + 1] >= q) { i = k; break } }
  const t = (q - Q56[i]) / (Q56[i + 1] - Q56[i])
  let v = 0
  for (let p = 0; p < w.length; p++) {
    if (w[p] === 0) continue
    v += w[p] * (tab[p][i] * (1 - t) + tab[p][i + 1] * t)
  }
  return v
}

export interface Tee56Result {
  Ccb:    number | null
  Ccs:    number | null
  motifB: string | null
  motifS: string | null
}

const fr = (v: number) => v.toFixed(2).replace('.', ',')

/** Coefficients du té convergent rectangulaire, rapportés à la section commune.
 *  Chacun peut manquer indépendamment de l'autre : les deux tables ne se lisent
 *  pas sur le même rapport de débit. */
export function computeTee56(
  rAs: number, rAc: number, qbqc: number, qbqs: number,
): Tee56Result {
  const w = poids(rAs, rAc)
  if (!w) {
    const m = `Géométrie hors du domaine publié : le couple (Ab/As = ${fr(rAs)} ; `
      + `Ab/Ac = ${fr(rAc)}) sort de l'enveloppe des sept géométries du 5-6.`
    return { Ccb: null, Ccs: null, motifB: m, motifS: m }
  }
  const Ccb = lire(T56_B, w, qbqc)
  const Ccs = lire(T56_S, w, qbqs)
  return {
    Ccb, Ccs,
    motifB: Ccb == null ? `Qb/Qc = ${fr(qbqc)}, hors de la plage tabulée 0,1 – 0,9.` : null,
    motifS: Ccs == null ? `Qb/Qs = ${fr(qbqs)}, hors de la plage tabulée 0,1 – 0,9.` : null,
  }
}
