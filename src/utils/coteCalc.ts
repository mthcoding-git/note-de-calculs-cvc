import { findLevelIndexAt } from './levelUtils'

const DEFAULT_HAUTEUR = 2.70

/**
 * Cote par défaut d'un nœud (m), déduite de sa position verticale dans les niveaux.
 * - Niveau 0 (le plus bas) → cote = 0
 * - Niveau i → cote = somme des hauteurs des niveaux 0 à i-1
 * - Au-dessus de la toiture → cote = somme de toutes les hauteurs
 */
export function getNodeDefaultCote(pt: any, levels: any[], lineYs: number[]): number {
  const li = findLevelIndexAt(pt.y, lineYs)
  if (li >= 0) {
    let cote = 0
    for (let j = 0; j < li; j++) cote += levels[j].hauteur ?? DEFAULT_HAUTEUR
    return Math.round(cote * 100) / 100
  }
  // Au-dessus de la toiture
  let cote = 0
  for (let j = 0; j < levels.length; j++) cote += levels[j].hauteur ?? DEFAULT_HAUTEUR
  return Math.round(cote * 100) / 100
}

/** Cote effective d'un nœud : override manuel ou valeur par défaut. */
export function getNodeCote(pt: any, levels: any[], lineYs: number[]): { value: number; isDefault: boolean } {
  if (!pt) return { value: 0, isDefault: true }
  if (pt.cote_override != null) return { value: pt.cote_override, isDefault: false }
  return { value: getNodeDefaultCote(pt, levels, lineYs), isDefault: true }
}
