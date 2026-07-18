import { DEFAULT_MATERIALS } from '../data/materials'
import { DEFAULT_MATERIALS_CHAUFFAGE } from '../data/materialsChauffage'
export { DEFAULT_MATERIALS_CHAUFFAGE }
import { DEFAULT_MATERIALS_EAU_GLACEE } from '../data/materialsEauGlacee'
export { DEFAULT_MATERIALS_EAU_GLACEE }
import { DEFAULT_INSULATIONS } from '../data/insulations'
import { DEFAULT_INSULATIONS_EAU_GLACEE } from '../data/insulationsEauGlacee'
export { DEFAULT_INSULATIONS_EAU_GLACEE }
import { DEFAULT_PDC_PARAMS, DEFAULT_PDC_PARAMS_ALIM_ECS, DEFAULT_PDC_PARAMS_ALIM_EF } from './pdcCalc'
import { uid } from './idGen'
import type { DisplayPrefs } from '../types'
import { LOCAL_GAP, COL_PIPE_W, COL_LOCAL_OFFSET } from './projectActions'
const LOCAL_W = 50

export const DEFAULT_DISPLAY_PREFS: DisplayPrefs = {
  ecs: {
    unitDebit: 'm3/h', unitDp: 'Pa',
    colorAller: '#dc2626', colorRetour: '#f97316', strokeWidth: 1.5,
  },
  ef: {
    unitDebit: 'm3/h', unitDp: 'Pa',
    colorAller: '#2563eb', colorRetour: '#2563eb', strokeWidth: 1.5,
  },
  chauffage: {
    unitDebit: 'm3/h', unitDp: 'Pa', unitPuissance: 'W',
    colorAller: '#dc2626', colorRetour: '#f97316', strokeWidth: 1.5,
  },
  eauglacee: {
    unitDebit: 'm3/h', unitDp: 'Pa', unitPuissance: 'W',
    colorAller: '#60a5fa', colorRetour: '#1d4ed8', strokeWidth: 1.5,
  },
}

// ── Paramètres globaux ───────────────────────────────────────────────────────

export const DEFAULT_GLOBAL_PARAMS = {
  T_depart: 60,
}

export const DEFAULT_CHAUFFAGE_PARAMS = {
  T_depart: 70,
  deltaT_reseau: 20,
}

export const DEFAULT_EAU_GLACEE_PARAMS = {
  T_depart: 7,
  deltaT_reseau: 5,
}

export const DEFAULT_ALIMENTATION_PARAMS = {
  buildingType: 'habitation',
  appareils: [
    { id: 'evier',         name: 'Évier',                          qBase: 0.20, k: 2.5,  enabled: false },
    { id: 'lavabo',        name: 'Lavabo',                         qBase: 0.20, k: 1.5,  enabled: false },
    { id: 'bidet',         name: 'Bidet',                          qBase: 0.20, k: 1.0,  enabled: false },
    { id: 'baignoire',     name: 'Baignoire',                      qBase: 0.33, k: 3.0,  enabled: false },
    { id: 'douche',        name: 'Douche',                         qBase: 0.20, k: 2.0,  enabled: false },
    { id: 'poste_12',      name: "Poste d'eau robinet ½",          qBase: 0.33, k: 2.0,  enabled: false },
    { id: 'poste_34',      name: "Poste d'eau robinet ¾",          qBase: 0.42, k: 2.0,  enabled: false },
    { id: 'wc_reservoir',  name: 'WC réservoir de chasse',         qBase: 0.12, k: 0.5,  enabled: false },
    { id: 'wc_robinet',    name: 'WC robinet de chasse',           qBase: 1.50, k: null, enabled: false },
    { id: 'urinoir_ind',   name: 'Urinoir robinet individuel',     qBase: 0.15, k: 0.5,  enabled: false },
    { id: 'urinoir_siph',  name: 'Urinoir action siphonique',      qBase: 0.50, k: 0.5,  enabled: false },
    { id: 'lave_mains',    name: 'Lave-mains',                     qBase: 0.10, k: 0.5,  enabled: false },
    { id: 'bac_laver',     name: 'Bac à laver',                    qBase: 0.33, k: null, enabled: false },
    { id: 'machine_linge', name: 'Machine à laver le linge',       qBase: 0.20, k: 1.0,  enabled: false },
    { id: 'machine_vaiss', name: 'Machine à laver la vaisselle',   qBase: 0.10, k: 1.0,  enabled: false },
  ],
}

const _defMap = Object.fromEntries(DEFAULT_ALIMENTATION_PARAMS.appareils.map(a => [a.id, a]))

// Remplit k et qBase manquants si les données stockées sont dans l'ancien format.
export function resolveAlimentationParams(raw) {
  if (!raw?.appareils) return DEFAULT_ALIMENTATION_PARAMS
  const needsMigration = raw.appareils.some(a => a.k === undefined || a.qBase === undefined)
  if (!needsMigration) return raw
  return {
    ...raw,
    appareils: raw.appareils.map(a => {
      const def = _defMap[a.id]
      return {
        ...a,
        k:     a.k     !== undefined ? a.k     : (def?.k     ?? null),
        qBase: a.qBase !== undefined ? a.qBase : (def?.qBase ?? 0),
      }
    }),
  }
}

// ── Structure par défaut (5 niveaux, 5 colonnes) ────────────────────────────

export const DEFAULT_LEVELS = [
  { id: 'ss1', name: 'SS-1', isSousSol: true  },
  { id: 'rdc', name: 'RDC',  isSousSol: false },
  { id: 'r1',  name: 'R+1',  isSousSol: false },
  { id: 'r2',  name: 'R+2',  isSousSol: false },
  { id: 'r3',  name: 'R+3',  isSousSol: false },
]
// lineYs[0] = bas du SS-1, lineYs[5] = Toiture — espacement 210 px
export const DEFAULT_LINE_YS = [1110, 900, 690, 480, 270, 80]

export const DEFAULT_COLUMNS = [
  { id: 'col1', name: 'Colonne 1', levelIds: 'all' },
  { id: 'col2', name: 'Colonne 2', levelIds: 'all' },
  { id: 'col3', name: 'Colonne 3', levelIds: 'all' },
  { id: 'col4', name: 'Colonne 4', levelIds: 'all' },
  { id: 'col5', name: 'Colonne 5', levelIds: 'all' },
]
export const DEFAULT_COLUMN_XS = [200, 520, 840, 1160, 1480, 1800]

export const DEFAULT_CHAUFFERIE = {
  placed: false,
  enabled: false,
  levelId: 'ss1',
  x1: 1190,
  x2: 1460,
  height: 150,
}

// ── Constructeurs de structure (niveaux, colonnes, lignes Y) ─────────────────

export function buildLevels(nSousSol: number, nFloors: number) {
  const levels: any[] = []
  for (let i = nSousSol; i >= 1; i--)
    levels.push({ id: `ss${i}`, name: `SS-${i}`, isSousSol: true })
  for (let i = 0; i < nFloors; i++)
    levels.push({ id: i === 0 ? 'rdc' : `r${i}`, name: i === 0 ? 'RDC' : `R+${i}`, isSousSol: false })
  return levels
}

export function buildLineYs(nLevels: number) {
  const SPACING = 210, TOP_Y = 80
  return Array.from({ length: nLevels + 1 }, (_, i) => TOP_Y + (nLevels - i) * SPACING)
}

export function buildColumns(nCols: number, columnLevelIds?: any[]) {
  return Array.from({ length: nCols }, (_, i) => ({
    id: `col${i + 1}`, name: `Colonne ${i + 1}`,
    levelIds: columnLevelIds?.[i] ?? 'all',
  }))
}


function _maxGroupesParCol(nCols: number, nLevels: number, grid: Record<string, number>) {
  return Array.from({ length: nCols }, (_, c) => {
    let max = 0
    for (let l = 0; l < nLevels; l++) max = Math.max(max, grid[`${l}-${c}`] ?? 0)
    return max
  })
}

export function buildColumnXs(nCols: number, maxCols: number[]) {
  const xs = [200]
  for (let i = 0; i < nCols; i++) {
    const n = maxCols[i] ?? 0
    const space = n > 0
      ? COL_PIPE_W + 23 + n * (LOCAL_W + LOCAL_GAP)
      : COL_PIPE_W
    xs.push(xs[i] + space)
  }
  return xs
}

const snapGrid = (v: number) => Math.round(v / 10) * 10

export function buildGroupesPoints(levels: any[], lineYs: number[], columns: any[], columnXs: number[], grid: Record<string, number>) {
  const points: any[] = []
  columns.forEach((col, c) => {
    levels.forEach((level, l) => {
      const count = grid[`${l}-${c}`] ?? 0
      const midY  = (lineYs[l] + lineYs[l + 1]) / 2
      for (let k = 0; k < count; k++) {
        points.push({
          id: uid('loc'), type: 'groupe', name: '', showName: false,
          colId: col.id, levelId: level.id,
          x: snapGrid(columnXs[c] + COL_LOCAL_OFFSET + k * (LOCAL_W + LOCAL_GAP) + LOCAL_W / 2),
          y: snapGrid(midY),
          isLocked: false,
        })
      }
    })
  })
  return points
}

// ── Factories de projet ──────────────────────────────────────────────────────

// Projet vide avec tous les paramètres par défaut.
export function initProject() {
  return {
    globalParams:          DEFAULT_GLOBAL_PARAMS,
    alimentationParamsECS: DEFAULT_ALIMENTATION_PARAMS,
    alimentationParamsEF:  null,
    pdcParamsBouclageECS:  DEFAULT_PDC_PARAMS,
    pdcParamsChauffage:    DEFAULT_PDC_PARAMS,
    pdcParamsEauGlacee:    DEFAULT_PDC_PARAMS,
    pdcParamsAlimECS:      DEFAULT_PDC_PARAMS_ALIM_ECS,
    pdcParamsAlimEF:       null,
    materialsECS:          DEFAULT_MATERIALS,
    materialsEF:           DEFAULT_MATERIALS,
    materialsChauffage:    DEFAULT_MATERIALS_CHAUFFAGE,
    materialsEauGlacee:    DEFAULT_MATERIALS_EAU_GLACEE,
    insulations:           DEFAULT_INSULATIONS,
    insulationsEauGlacee:  DEFAULT_INSULATIONS_EAU_GLACEE,
    levels:                DEFAULT_LEVELS,
    lineYs:                DEFAULT_LINE_YS,
    columns:               DEFAULT_COLUMNS,
    columnXs:              DEFAULT_COLUMN_XS,
    chaufferie:            DEFAULT_CHAUFFERIE,
    chauffageParams:       DEFAULT_CHAUFFAGE_PARAMS,
    eauGlaceeParams:       DEFAULT_EAU_GLACEE_PARAMS,
    displayPrefs:          DEFAULT_DISPLAY_PREFS,
    segments:              [],
    points:                [],
    valves:                [],
    accessories:           [],
    locauxEF:              [],
    locauxECS:             [],
    locauxChauffage:       [],
    locauxEauGlacee:       [],
  }
}

// Projet avec une structure niveaux/colonnes personnalisée mais sans groupes ni tronçons.
export function buildFluidSetupProject(nSousSol: number, nFloors: number, nCols: number) {
  const levels   = buildLevels(nSousSol, nFloors)
  const nLevels  = levels.length
  const lineYs   = buildLineYs(nLevels)
  const columns  = Array.from({ length: nCols }, (_, i) => ({
    id: `col${i + 1}`, name: `Colonne ${i + 1}`, levelIds: 'all',
  }))
  const columnXs = Array.from({ length: nCols + 1 }, (_, i) => 200 + i * 320)
  return { ...initProject(), levels, lineYs, columns, columnXs }
}

// Projet complet construit depuis la configuration du wizard.
export function buildProjectFromConfig({
  globalParams, materials, insulations,
  nSousSol, nFloors, nCols, groupesGrid, columnLevelIds,
}: {
  globalParams: any; materials: any[]; insulations: any[];
  nSousSol: number; nFloors: number; nCols: number;
  groupesGrid: Record<string, number>; columnLevelIds?: any[];
}) {
  const levels   = buildLevels(nSousSol, nFloors)
  const nLevels  = levels.length
  const lineYs   = buildLineYs(nLevels)
  const columns  = buildColumns(nCols, columnLevelIds)
  const maxCols  = _maxGroupesParCol(nCols, nLevels, groupesGrid)
  const columnXs = buildColumnXs(nCols, maxCols)
  const points   = buildGroupesPoints(levels, lineYs, columns, columnXs, groupesGrid)
  return {
    globalParams, materials, insulations,
    levels, lineYs, columns, columnXs,
    chaufferie: { placed: false, enabled: false, levelId: levels[0]?.id ?? 'ss1', x1: 1190, x2: 1460, height: 150 },
    segments: [], points,
  }
}
