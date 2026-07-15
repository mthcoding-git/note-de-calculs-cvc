import type { CalcMode } from '../types'

export interface CalcModeFlags {
  isBouclage:   boolean   // 'bouclage-ecs'
  isAlimECS:    boolean   // 'alimentation-ecs'
  isAlimEF:     boolean   // 'alimentation-ef'
  isAlimMode:   boolean   // 'alimentation-ecs' || 'alimentation-ef'
  isChauffage:  boolean   // 'distribution-chauffage'
  isEauGlacee:  boolean   // 'distribution-eauglacee'
  hasPdc:       boolean   // modes avec calcul PDC actif
  hasKv:        boolean   // modes avec affichage Kv vannes
}

export function getModeFlags(calcId: CalcMode | null): CalcModeFlags {
  return {
    isBouclage:  calcId === 'bouclage-ecs',
    isAlimECS:   calcId === 'alimentation-ecs',
    isAlimEF:    calcId === 'alimentation-ef',
    isAlimMode:  calcId === 'alimentation-ecs' || calcId === 'alimentation-ef',
    isChauffage: calcId === 'distribution-chauffage',
    isEauGlacee: calcId === 'distribution-eauglacee',
    hasPdc:      calcId === 'bouclage-ecs' || calcId === 'alimentation-ecs' || calcId === 'alimentation-ef'
                 || calcId === 'distribution-chauffage' || calcId === 'distribution-eauglacee',
    hasKv:       calcId === 'bouclage-ecs' || calcId === 'alimentation-ecs'
                 || calcId === 'distribution-chauffage' || calcId === 'distribution-eauglacee',
  }
}
