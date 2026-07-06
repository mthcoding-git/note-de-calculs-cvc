/**
 * Retourne l'index du niveau contenant la coordonnée Y canvas donnée.
 * Convention : Y croissant vers le bas, lineYs[i] = bas du niveau i, lineYs[i+1] = haut.
 * Condition : y > yTop && y <= yBot (borne haute stricte).
 * Utilisé pour : nœuds, positions de placement, positions de drag.
 * Retourne -1 si hors de tous les niveaux.
 */
export function findLevelIndexAt(y: number, lineYs: number[]): number {
  for (let i = 0; i < lineYs.length - 1; i++) {
    if (y > lineYs[i + 1] && y <= lineYs[i]) return i
  }
  return -1
}

/**
 * Variante pour les milieux de tronçons : borne haute inclusive (midY >= yTop).
 * Utilisé pour : thermalCalc, ResultsTable, App.tsx (midpoints de segments).
 * Retourne -1 si hors de tous les niveaux.
 */
export function findMidpointLevelIndexAt(midY: number, lineYs: number[]): number {
  for (let i = 0; i < lineYs.length - 1; i++) {
    if (midY >= lineYs[i + 1] && midY <= lineYs[i]) return i
  }
  return -1
}
