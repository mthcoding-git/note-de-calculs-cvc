import type { CalcMode } from '../types'

export interface CalcModeFlags {
  isBouclage:   boolean   // 'bouclage-ecs'
  isAlimECS:    boolean   // 'alimentation-ecs'
  isAlimEF:     boolean   // 'alimentation-ef'
  isAlimMode:   boolean   // 'alimentation-ecs' || 'alimentation-ef'
  isChauffage:  boolean   // 'distribution-chauffage'
  hasPdc:       boolean   // 'bouclage-ecs' || 'alimentation-ecs' || 'alimentation-ef'
  hasKv:        boolean   // 'bouclage-ecs' || 'alimentation-ecs' (affichage Kv vannes)
}

export function getModeFlags(calcId: CalcMode | null): CalcModeFlags {
  return {
    isBouclage:  calcId === 'bouclage-ecs',
    isAlimECS:   calcId === 'alimentation-ecs',
    isAlimEF:    calcId === 'alimentation-ef',
    isAlimMode:  calcId === 'alimentation-ecs' || calcId === 'alimentation-ef',
    isChauffage: calcId === 'distribution-chauffage',
    hasPdc:      calcId === 'bouclage-ecs' || calcId === 'alimentation-ecs' || calcId === 'alimentation-ef',
    hasKv:       calcId === 'bouclage-ecs' || calcId === 'alimentation-ecs',
  }
}
