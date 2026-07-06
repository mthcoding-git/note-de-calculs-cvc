import type { PdcParams, PdcParamsAlimECS, PdcParamsAlimEF } from './utils/pdcCalc'
export type { PdcParams, PdcParamsAlimECS, PdcParamsAlimEF }
import type { EmetteurType } from './data/emetteurs'
export type { EmetteurType }

// ── Types centraux ──────────────────────────────────────────────────────────

export interface Vertex {
  x: number
  y: number
}

export interface DnEntry {
  dn: string
  di: number
  de: number
}

export interface Material {
  id: string
  name: string
  enabled: boolean
  lambda: number
  epsilon?: number
  minDi?: number
  dns: DnEntry[]
  encrassement?: boolean
  encrassementEpaisseur?: number
}

export interface Insulation {
  id: string
  name: string
  enabled: boolean
  lambda: number
  thicknesses: number[]
}

export type SegmentType = 'aller' | 'retour'
export type PointType = 'productionECS' | 'arriveeEF' | 'groupe' | 'pump' | 'node' | 'productionChauffage' | 'emetteur'

export type FluidId = 'ecs' | 'ef' | 'chauffage'

export type CalcMode =
  | 'bouclage-ecs'
  | 'alimentation-ecs'
  | 'alimentation-ef'
  | 'distribution-chauffage'
  | 'pdc-chauffage'

export interface Segment {
  id: string
  type: SegmentType
  startPointId: string
  endPointId: string
  vertices: Vertex[]
  materialId?: string | null
  dn?: string | null
  di_override?: number | null
  de_override?: number | null
  lambda_tube_override?: number | null
  insulationId?: string | null
  thickness?: number | null
  lambda_insul_override?: number | null
  length_override?: number | null
  flowRate?: number | null
  velocity?: number | null
  t_amb_override?: number | null
  isLocked?: boolean
  encrassementEpaisseur?: number | null
}

export interface NodeSize {
  w: number
  h: number
}

export interface Point {
  id: string
  x: number
  y: number
  type?: PointType | string
  name?: string
  size?: NodeSize
  isLocked?: boolean
  cote_override?: number | null
  // Champs émetteur chauffage
  emetteurType?: EmetteurType
  puissance?: number       // W
  deltaT_emetteur?: number // ΔT eau aller/retour (°C), override du deltaT_reseau global
}

export interface Level {
  id: string
  name: string
  isSousSol?: boolean
  y?: number
  hauteur?: number
}

export interface Column {
  id: string
  name: string
  isGap?: boolean
  isPPZone?: boolean
  colId?: string
  x?: number
}

export interface GlobalParams {
  T_depart?: number
  T_amb_other?: number
  T_amb_ss?: number
  he?: number
  rho?: number
  cp?: number
}

export interface SegThermalResult {
  Q: number
  deltaT: number
  T_from: number
  T_to: number
  T_amb: number
}

export interface ThermalResults {
  segResults: Map<string, SegThermalResult>
  nodeTemps: Map<string, number>
}

export interface FlowEntry {
  flowRate: number
  velocity?: number
}

export type NetworkFlows = Map<string, FlowEntry>

export interface FlowDirection {
  fromId: string
  toId: string
}

export type FlowDirections = Map<string, FlowDirection>

export type RoleMap = Map<string, string>

// ── Types projet ─────────────────────────────────────────────────────────────

export interface Chaufferie {
  placed: boolean
  enabled: boolean
  levelId: string
  x1: number
  x2: number
  height: number
}

export interface Appareil {
  id: string
  name: string
  qBase: number
  k: number | null
  enabled: boolean
}

export interface AlimentationParams {
  buildingType: string
  appareils: Appareil[]
}

export interface Valve {
  id: string
  segmentId: string
  t: number
  name?: string | null
}

export interface Accessory {
  id: string
  type: string
  segmentId: string
  t: number
}

export interface LocalEF {
  id: string
  enabled: boolean
  levelId: string
  x1: number
  x2: number
  height: number
}

export interface ChauffageParams {
  T_depart: number      // Température de départ (°C)
  deltaT_reseau: number // ΔT par défaut des émetteurs (K) — peut être overridé par émetteur
}

// ── Types variantes ─────────────────────────────────────────────────────────

export interface ProjectData {
  segments:              Segment[]
  points:                Point[]
  materialsECS:          Material[]
  materialsEF:           Material[]
  insulations:           Insulation[]
  levels:                Level[]
  lineYs:                number[]
  columns:               Column[]
  columnXs:              number[]
  globalParams:          GlobalParams
  chaufferie:            Chaufferie
  alimentationParamsECS: AlimentationParams
  alimentationParamsEF:  AlimentationParams | null
  pdcParamsBouclageECS:  PdcParams
  pdcParamsAlimECS:      PdcParamsAlimECS
  pdcParamsAlimEF:       PdcParamsAlimEF | null
  valves:                Valve[]
  accessories:           Accessory[]
  locauxEF:              LocalEF[]
  chauffageParams:       ChauffageParams
}

export interface Variant {
  id: string
  name: string
  data: ProjectData
}

// ── Types tableau résultats ──────────────────────────────────────────────────

export type RowKind = 'segment' | 'junction' | 'flow-start' | 'flow-end' | 'col-header' | 'separation' | 'collecteur-header'

export interface SegmentRow {
  kind: 'segment'
  seg: Segment
  depth: number
  segType: SegmentType
}

export interface JunctionRow {
  kind: 'junction'
  ptId: string
  incomingCount?: number
}

export interface BannerRow {
  kind: 'flow-start' | 'flow-end' | 'separation'
}

export interface ColHeaderRow {
  kind: 'col-header'
  name: string
}

export interface CollecteurHeaderRow {
  kind: 'collecteur-header'
  role: string
}

export type TableRow = SegmentRow | JunctionRow | BannerRow | ColHeaderRow | CollecteurHeaderRow
