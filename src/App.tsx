import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { CalcMode, FluidId } from './types'
import { getModeFlags } from './utils/calcModeFlags'
import DrawingCanvas from './components/DrawingCanvas'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import Toolbar from './components/Toolbar'
import VariantBar from './components/VariantBar'
import { CalcFluidTabs, getAutoCalcId, getCalcLabel, getFluidLabel, getNetworkLabel } from './components/CalcSelector'
import NetworkSetupCard from './components/NetworkSetupCard'
import { DEFAULT_MATERIALS } from './data/materials'
import { computeFlowDirections, computeFlowDirectionsEF } from './utils/flowDirection'
import { computeFlowDirectionsChauffage, computeChauffageFlows, computeChauffageThermalSimple } from './utils/chauffageCalc'
import { DEFAULT_CHAUFFAGE_PARAMS } from './utils/projectBuilder'
import { buildECSFlowRows, buildFlowRowsEF, buildChauffageFlowRows } from './utils/tableOrder'
import { buildECSDistances } from './utils/pointLocation'
import { getDisplayGroupNames } from './utils/naming'
import { computeNetworkFlows } from './utils/flowCalc'
import { computeThermal } from './utils/thermalCalc'
import { computeAlimentationResults } from './utils/alimentationCalc'
import { computeSegPdc, computePresSourceECS, computePresSourceECSStatic, computeAmontResults, DEFAULT_PDC_PARAMS, DEFAULT_PDC_PARAMS_ALIM_ECS, DEFAULT_PDC_PARAMS_ALIM_EF, waterDensity } from './utils/pdcCalc'
import { DEFAULT_GLOBAL_PARAMS, DEFAULT_ALIMENTATION_PARAMS, DEFAULT_LEVELS, DEFAULT_LINE_YS, DEFAULT_COLUMNS, DEFAULT_COLUMN_XS, DEFAULT_CHAUFFERIE, resolveAlimentationParams, initProject, buildFluidSetupProject } from './utils/projectBuilder'
import { getNodeCote } from './utils/coteCalc'
import { computeCumDp, computeCumDpAlim } from './utils/pdcCumul'
import { computeValveKvs, computeValveKvsAlim } from './utils/valveKv'
import ResultsTable from './components/ResultsTable'
import { PipeIcon, InsulatedPipeIcon, FaucetIcon, FaucetsGroupIcon, GaugeIcon, BuildingFloorsIcon } from './components/icons'
import { uid } from './utils/idGen'
import { findMidpointLevelIndexAt } from './utils/levelUtils'
import { LOCAL_W, LOCAL_GAP, expandZone, removeGapColumn, removeRegularColumn, moveGaine, adjustPPZone, removeGroupeBranch } from './utils/projectActions'
import { useVariantHistory } from './hooks/useProjectHistory'
import './App.css'

const COL_LOCAL_OFFSET = 333
const COL_PIPE_W = 320
const COL_SEP_DEFAULT = 160
const snapG = v => Math.round(v / 10) * 10

const CANVAS_DISPLAY_RESET = { nomTroncon: false, length: false, material: false, dn: false, insulation: false, debit: false, vitesse: false, temperatureNoeud: false, deltaT: false, equipment: false, dpTroncon: false, dpNoeud: false, pressionDispo: false, pressionStat: false }

// ── Undo/redo + variants store ─────────────────────────

const FLUID_FALLBACKS: Record<FluidId, FluidId[]> = {
  'ecs':       ['ef', 'chauffage'],
  'ef':        ['ecs', 'chauffage'],
  'chauffage': ['ecs', 'ef'],
}

export default function App() {
  const {
    project, setProject, patchProject, resetProject, undo, redo, canUndo, canRedo,
    meta, activeId, projectName, setProjectName,
    switchVariant, duplicateVariant, deleteVariant, deleteBaseVariant, renameVariant, setBaseVariant, reorderVariant,
    getFullState, loadState,
  } = useVariantHistory()

  const [editingProjName,   setEditingProjName]   = useState(false)
  const [activeFluidId,     setActiveFluidId]     = useState<FluidId | null>(null)
  const [activeCalcId,      setActiveCalcId]      = useState<CalcMode | null>(null)
  const [fitViewRequest, setFitViewRequest] = useState(1)

  // Sauvegarde d'état par type de réseau : fluidId → { state, calcId }
  const fluidStashRef = useRef(new Map<FluidId, { state: any; calcId: CalcMode | null }>())
  // Vrai dès que les paramètres EF ont été copiés vers ECS (première fois EF→ECS seulement)
  const hasECSInheritedFromEFRef = useRef(false)

  const [pendingSetup, setPendingSetup] = useState(true)

  const { isBouclage, isAlimECS, isAlimEF, isAlimMode, isChauffage, hasPdc } = getModeFlags(activeCalcId)

  // Sens d'écoulement par tronçon — recalculé à chaque modification du réseau
  const flowDirections = useMemo(
    () => isChauffage
      ? computeFlowDirectionsChauffage(project.segments, project.points)
      : isAlimEF
        ? computeFlowDirectionsEF(project.segments, project.points)
        : computeFlowDirections(project.segments, project.points),
    [project.segments, project.points, activeCalcId]
  )

  const chauffageFlows = useMemo(
    () => isChauffage
      ? computeChauffageFlows(
          project.segments, project.points, project.materialsECS,
          project.chauffageParams ?? DEFAULT_CHAUFFAGE_PARAMS,
          flowDirections
        )
      : new Map(),
    [project.segments, project.points, project.materialsECS, project.chauffageParams, flowDirections, isChauffage]
  )

  const chauffageThermal = useMemo(() => {
    if (!isChauffage) return null
    return computeChauffageThermalSimple(
      project.segments, project.points,
      project.chauffageParams ?? DEFAULT_CHAUFFAGE_PARAMS,
      flowDirections, chauffageFlows
    )
  }, [isChauffage, project.segments, project.points, project.chauffageParams,
      flowDirections, chauffageFlows])

  // Débits/vitesses résolus par loi des nœuds
  const networkFlows = useMemo(
    () => computeNetworkFlows(project.segments, project.points, project.materialsECS, flowDirections),
    [project.segments, project.points, project.materialsECS, flowDirections]
  )

  // Températures et pertes thermiques propagées depuis la Production ECS
  const thermalResults = useMemo(
    () => computeThermal(
      project.segments, project.points, project.materialsECS, project.insulations,
      flowDirections, networkFlows,
      project.levels, project.lineYs, project.globalParams
    ),
    [project.segments, project.points, project.materialsECS, project.insulations,
     flowDirections, networkFlows, project.levels, project.lineYs, project.globalParams]
  )

  const segIsSousSolMap = useMemo(() => {
    const map = new Map<string, boolean>()
    for (const seg of project.segments) {
      if (!seg.vertices?.length) { map.set(seg.id, false); continue }
      const midY = seg.vertices.reduce((s: number, v: any) => s + v.y, 0) / seg.vertices.length
      const li = findMidpointLevelIndexAt(midY, project.lineYs)
      map.set(seg.id, li >= 0 ? (project.levels[li].isSousSol ?? false) : false)
    }
    return map
  }, [project.segments, project.levels, project.lineYs])

  const alimentationResultsECS = useMemo(
    () => computeAlimentationResults(
      project.segments, project.points,
      resolveAlimentationParams(project.alimentationParamsECS),
      flowDirections,
      segIsSousSolMap
    ),
    [project.segments, project.points, project.alimentationParamsECS, flowDirections, segIsSousSolMap]
  )

  const alimentationResultsEF = useMemo(
    () => project.alimentationParamsEF == null ? new Map() : computeAlimentationResults(
      project.segments, project.points,
      resolveAlimentationParams(project.alimentationParamsEF),
      flowDirections,
      segIsSousSolMap,
      true
    ),
    [project.segments, project.points, project.alimentationParamsEF, flowDirections, segIsSousSolMap]
  )

  // First-open initialisation for alimentation-ef
  useEffect(() => {
    if (!isAlimEF) return
    setProject((p: any) => {
      let next: any = { ...p }
      let changed = false
      if (p.alimentationParamsEF == null) {
        next.alimentationParamsEF = resolveAlimentationParams(p.alimentationParamsECS)
        changed = true
      }
      if (p.pdcParamsAlimEF == null) {
        const src = p.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS
        next.pdcParamsAlimEF = {
          ...DEFAULT_PDC_PARAMS_ALIM_EF,
          equipementsActifs:  src.equipementsActifs,
          fittingOverrides:   { ...src.fittingOverrides },
          equipmentOverrides: { ...(src.equipmentOverrides ?? {}) },
          customFittings:     [...(src.customFittings ?? [])],
          customEquipments:   [...(src.customEquipments ?? [])],
        }
        changed = true
      }
      if (p.materialsEF == null) {
        next.materialsEF = DEFAULT_MATERIALS.map((m: any) => ({ ...m }))
        changed = true
      }
      return changed ? next : p
    })
  }, [activeCalcId])

  const pdcResults = useMemo(() => {
    const results = new Map()
    if (!isBouclage && !isAlimECS && !isAlimEF && !isChauffage) return results

    if (isChauffage) {
      const pdcParams   = project.pdcParamsChauffage ?? DEFAULT_PDC_PARAMS
      const chParams    = project.chauffageParams ?? DEFAULT_CHAUFFAGE_PARAMS
      const prodCH      = project.points.find((p: any) => p.type === 'productionChauffage')
      const T_aller     = prodCH?.T_depart_override ?? chParams.T_depart ?? 70
      const T_retour    = T_aller - (chParams.deltaT_reseau ?? 20)
      for (const seg of project.segments) {
        const flowEntry = chauffageFlows.get(seg.id)
        const flowRate  = flowEntry?.flowRate ?? null
        const isRetour  = seg.type === 'retour' || seg.type === 'retour-ch'
        const T         = isRetour ? T_retour : T_aller
        const mat       = project.materialsECS.find((m: any) => m.id === seg.materialId)
        const dnDef     = mat?.dns.find((d: any) => d.dn === seg.dn)
        const di_mm     = seg.di_override ?? dnDef?.di ?? null
        const result    = computeSegPdc(seg, pdcParams, flowRate, di_mm, T, mat)
        if (result) results.set(seg.id, result)
      }
      return results
    }

    const pdcParams = isBouclage
      ? (project.pdcParamsBouclageECS ?? DEFAULT_PDC_PARAMS)
      : isAlimEF
        ? (project.pdcParamsAlimEF ?? DEFAULT_PDC_PARAMS_ALIM_EF)
        : (project.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS)
    const activeMats = isAlimEF ? (project.materialsEF ?? DEFAULT_MATERIALS) : project.materialsECS
    const prodECS = project.points.find((p: any) => p.type === 'productionECS')
    const _rawT = prodECS?.T_depart_override ?? project.globalParams.T_depart ?? 60
    const T_depart_eff = typeof _rawT === 'number' && !isNaN(_rawT) ? _rawT : (parseFloat(String(_rawT)) || 60)
    const T_ef_eff = isAlimEF ? ((project.pdcParamsAlimEF ?? DEFAULT_PDC_PARAMS_ALIM_EF).T_ef ?? 10) : 10
    // Pour alimentation ECS : map nœud → tronçon qui l'alimente (remontée upstream)
    const parentSegOfNode = new Map<string, string>()
    if (isAlimECS) {
      for (const s of project.segments) {
        const dir = flowDirections.get(s.id)
        if (dir) parentSegOfNode.set(dir.toId, s.id)
      }
    }

    // Trouve la température au nœud amont d'un tronçon alimentation ECS.
    // Remonte l'arbre jusqu'au premier nœud avec une température bouclage connue.
    const getTAlimECS = (segId: string): number => {
      const dir = flowDirections.get(segId)
      if (!dir) return T_depart_eff
      let nodeId: string | undefined = dir.fromId
      const visited = new Set<string>()
      while (nodeId && !visited.has(nodeId)) {
        visited.add(nodeId)
        const T = thermalResults.nodeTemps.get(nodeId)
        if (T != null) return T
        const parentId = parentSegOfNode.get(nodeId)
        if (!parentId) break
        const parentDir = flowDirections.get(parentId)
        nodeId = parentDir?.fromId
      }
      return T_depart_eff
    }

    for (const seg of project.segments) {
      if ((isAlimECS || isAlimEF) && seg.type !== 'aller') continue
      let flowRate: number | null
      if (isAlimECS) {
        const ar = alimentationResultsECS.get(seg.id)
        flowRate = (ar?.flowRateForPdc ?? 0) > 0 ? ar!.flowRateForPdc * 3.6 : null
      } else if (isAlimEF) {
        const ar = alimentationResultsEF.get(seg.id)
        flowRate = (ar?.flowRateForPdc ?? 0) > 0 ? ar!.flowRateForPdc * 3.6 : null
      } else {
        flowRate = networkFlows.get(seg.id)?.flowRate ?? null
      }
      const T = isAlimECS
        ? getTAlimECS(seg.id)
        : isAlimEF
          ? T_ef_eff
          : (() => { const td = thermalResults.segResults.get(seg.id); return td ? (td.T_from + td.T_to) / 2 : T_depart_eff })()
      const mat   = activeMats.find((m: any) => m.id === seg.materialId)
      const dnDef = mat?.dns.find((d: any) => d.dn === seg.dn)
      const di_mm_nominal = seg.di_override ?? dnDef?.di ?? null
      const e_encr = mat?.encrassement ? (seg.encrassementEpaisseur ?? mat?.encrassementEpaisseur ?? 0) : 0
      const di_mm = (di_mm_nominal != null && e_encr > 0)
        ? Math.max(1, di_mm_nominal - 2 * e_encr)
        : di_mm_nominal
      const result = computeSegPdc(seg, pdcParams, flowRate, di_mm, T, mat)
      if (result) results.set(seg.id, result)
    }
    return results
  }, [activeCalcId, project.segments, project.pdcParamsBouclageECS, project.pdcParamsChauffage,
      project.pdcParamsAlimECS, project.pdcParamsAlimEF,
      project.materialsECS, project.materialsEF,
      project.globalParams, project.points, project.chauffageParams,
      networkFlows, chauffageFlows, thermalResults, alimentationResultsECS, alimentationResultsEF])

  const { rows: flowRows, roleMap } = useMemo(
    () => isChauffage
      ? buildChauffageFlowRows(project.segments, project.points, flowDirections,
          project.columns, project.columnXs, project.levels, project.lineYs)
      : buildECSFlowRows(project.segments, project.points, flowDirections,
          project.columns, project.columnXs, project.levels, project.lineYs, activeCalcId),
    [project.segments, project.points, flowDirections,
     project.columns, project.columnXs, project.levels, project.lineYs, activeCalcId, isChauffage]
  ) as { rows: any[], roleMap: Map<any, any> }

  const efFlowRowsArr = useMemo(
    () => !isAlimEF ? null : buildFlowRowsEF(
      project.segments, project.points, flowDirections,
      project.columns, project.columnXs, project.levels, project.lineYs
    ),
    [activeCalcId, project.segments, project.points, flowDirections,
     project.columns, project.columnXs, project.levels, project.lineYs]
  )

  // RoleMap fusionné pour EF (plusieurs sources)
  const effectiveRoleMap = useMemo(() => {
    if (!isAlimEF || !efFlowRowsArr) return roleMap
    const merged = new Map()
    for (const { roleMap: rm } of efFlowRowsArr) {
      for (const [id, role] of rm) merged.set(id, role)
    }
    return merged
  }, [activeCalcId, efFlowRowsArr, roleMap])

  const groupDisplayNames = useMemo(() => {
    if (isAlimEF) return new Map<string, string>()
    const allerDist = buildECSDistances(project.segments, project.points)
    return getDisplayGroupNames(
      project.points, project.segments, flowDirections, allerDist, effectiveRoleMap,
      project.levels, project.lineYs, project.columns ?? [], project.columnXs ?? []
    )
  }, [activeCalcId, project.points, project.segments, flowDirections, effectiveRoleMap,
      project.levels, project.lineYs, project.columns, project.columnXs])

  const errorCount = useMemo(() => {
    // Emetteurs et groupes sont des bouts fermés valides (pas une erreur de connectivité)
    const isSpecialEndpoint = (t?: string) => t === 'groupe' || t === 'arriveeEF' || t === 'emetteur'
    const ptCount = new Map()
    for (const s of project.segments) {
      if (s.startPointId) ptCount.set(s.startPointId, (ptCount.get(s.startPointId) ?? 0) + 1)
      if (s.endPointId)   ptCount.set(s.endPointId,   (ptCount.get(s.endPointId)   ?? 0) + 1)
    }
    const conn = project.segments.filter(s => {
      const sc = (ptCount.get(s.startPointId) ?? 0) >= 2
      const ec = (ptCount.get(s.endPointId)   ?? 0) >= 2
      if ((sc ? 1 : 0) + (ec ? 1 : 0) > 1) return false
      const startPt = project.points.find(p => p.id === s.startPointId)
      const endPt   = project.points.find(p => p.id === s.endPointId)
      return !isSpecialEndpoint(startPt?.type) && !isSpecialEndpoint(endPt?.type)
    }).length
    let flow = 0
    for (const [, v] of networkFlows) { if (v.hasError) flow++ }
    const hasAllerSegs      = project.segments.some(s => s.type === 'aller')
    const hasAllerRetour    = project.segments.some(s => s.type === 'aller' || s.type === 'retour')
    const hasProdECS        = project.points.some(p => p.type === 'productionECS')
    const hasArriveeEF      = project.points.some(p => p.type === 'arriveeEF')
    const hasProdChauffage  = project.points.some(p => p.type === 'productionChauffage')
    const missingProd = isChauffage
      ? (hasAllerRetour && !hasProdChauffage ? 1 : 0)
      : isAlimEF
        ? (hasAllerSegs && !hasArriveeEF ? 1 : 0)
        : (hasAllerRetour && !hasProdECS ? 1 : 0)
    return conn + flow + missingProd
  }, [project.segments, project.points, networkFlows, activeCalcId])

  const [selectedAmontId, setSelectedAmontId] = useState<string | null>(null)

  const pdcCumResults = useMemo(
    () => isBouclage
      ? computeCumDp(project.segments, project.points, flowDirections, pdcResults)
      : isChauffage
        ? computeCumDp(project.segments, project.points, flowDirections, pdcResults, 'productionChauffage')
        : null,
    [activeCalcId, project.segments, project.points, flowDirections, pdcResults]
  )

  const totalQpAlimM3h = useMemo(() => {
    if (!isAlimECS) return 0
    const prodECS = project.points.find(p => p.type === 'productionECS')
    if (!prodECS) return 0
    let total = 0
    for (const seg of project.segments) {
      const dir = flowDirections.get(seg.id)
      if (dir?.fromId === prodECS.id) {
        const ar = alimentationResultsECS.get(seg.id)
        if (ar?.flowRateForPdc) total += ar.flowRateForPdc
      }
    }
    return total * 3.6  // L/s → m³/h
  }, [activeCalcId, project.points, project.segments, flowDirections, alimentationResultsECS])

  const pressionSourceAlimECS = useMemo(
    () => computePresSourceECS(project.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS, totalQpAlimM3h, project.materialsECS),
    [project.pdcParamsAlimECS, totalQpAlimM3h, project.materialsECS]
  )

  const pressionSourceAlimECSStatic = useMemo(
    () => computePresSourceECSStatic(project.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS, project.materialsECS),
    [project.pdcParamsAlimECS, project.materialsECS]
  )

  const amontTronconResults = useMemo(
    () => computeAmontResults(project.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS, totalQpAlimM3h, project.materialsECS),
    [project.pdcParamsAlimECS, totalQpAlimM3h, project.materialsECS]
  )

  const pdcCumAlimResults = useMemo(() => {
    if (!isAlimECS) return null
    const T   = project.globalParams?.T_depart ?? 60
    const rho = waterDensity(T)
    const nodeCotes = new Map<string, number>()
    for (const pt of project.points) {
      nodeCotes.set(pt.id, getNodeCote(pt, project.levels, project.lineYs).value)
    }
    return computeCumDpAlim(
      project.segments, project.points, flowDirections, pdcResults,
      pressionSourceAlimECS,
      nodeCotes, rho
    )
  }, [activeCalcId, project.segments, project.points, flowDirections, pdcResults,
      pressionSourceAlimECS, project.globalParams, project.levels, project.lineYs])

  const totalQpAlimEFM3h = useMemo(() => {
    if (!isAlimEF) return 0
    let total = 0
    for (const seg of project.segments) {
      if (seg.type !== 'aller') continue
      const ar = alimentationResultsEF.get(seg.id)
      if (ar?.flowRateForPdc) total += ar.flowRateForPdc
    }
    return total * 3.6
  }, [activeCalcId, project.segments, alimentationResultsEF])

  const pressionSourceAlimEF = useMemo(
    () => (project.pdcParamsAlimEF ?? DEFAULT_PDC_PARAMS_ALIM_EF).pressionEF ?? 300000,
    [project.pdcParamsAlimEF]
  )

  const pdcCumAlimEFResults = useMemo(() => {
    if (!isAlimEF) return null
    const T_ef = (project.pdcParamsAlimEF ?? DEFAULT_PDC_PARAMS_ALIM_EF).T_ef ?? 10
    const rho = waterDensity(T_ef)
    const nodeCotes = new Map<string, number>()
    for (const pt of project.points) {
      nodeCotes.set(pt.id, getNodeCote(pt, project.levels, project.lineYs).value)
    }
    return computeCumDpAlim(
      project.segments, project.points, flowDirections, pdcResults,
      pressionSourceAlimEF,
      nodeCotes, rho,
      'arriveeEF'
    )
  }, [activeCalcId, project.segments, project.points, flowDirections, pdcResults,
      pressionSourceAlimEF, project.pdcParamsAlimEF, project.levels, project.lineYs])

  const activePdcCumAlimResults = isAlimEF ? pdcCumAlimEFResults : pdcCumAlimResults

  const activePdcParams = isAlimECS
    ? (project.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS)
    : isAlimEF
      ? (project.pdcParamsAlimEF ?? DEFAULT_PDC_PARAMS_ALIM_EF)
      : isChauffage
        ? (project.pdcParamsChauffage ?? DEFAULT_PDC_PARAMS)
        : (project.pdcParamsBouclageECS ?? DEFAULT_PDC_PARAMS)

  const valveKvBouclageResults = useMemo(
    () => computeValveKvs(
      project.valves ?? [], project.segments, project.points,
      flowDirections, pdcCumResults, networkFlows,
    ),
    [project.valves, project.segments, project.points, flowDirections, pdcCumResults, networkFlows]
  )

  const valveKvAlimECSResults = useMemo(
    () => computeValveKvsAlim(
      project.valves ?? [], project.segments, project.points,
      flowDirections, pdcCumAlimResults, alimentationResultsECS,
    ),
    [project.valves, project.segments, project.points, flowDirections, pdcCumAlimResults, alimentationResultsECS]
  )

  const activeValveKvResults = isAlimECS ? valveKvAlimECSResults : valveKvBouclageResults

  // Map segId → nom de colonne (depuis les col-headers de flowRows)
  const segToCol = useMemo(() => {
    const map = new Map<string, string | null>()
    let currentCol: string | null = null
    for (const row of (flowRows ?? [])) {
      if (row.kind === 'col-header') currentCol = row.name
      if (row.kind === 'segment') map.set(row.seg.id, currentCol)
    }
    return map
  }, [flowRows])

  const [drawMode,           setDrawMode]           = useState('select')
  const [connHighlightIds,   setConnHighlightIds]   = useState([])
  const [groupesEditMode,    setGroupesEditMode]    = useState(false)
  const [showGroupeNames,    setShowGroupeNames]    = useState(false)
  const [canvasDisplay, setCanvasDisplay] = useState(CANVAS_DISPLAY_RESET)
  const [activeTable, setActiveTable] = useState<'dimensionnement' | 'pdc' | null>(null)
  const [tableHeight, setTableHeight] = useState(300)
  const tableHeightRef = useRef(0)
  tableHeightRef.current = tableHeight
  const [pipeType,           setPipeType]           = useState('aller')
  const [selectedIds,        setSelectedIds]        = useState([])
  const [selectedValveId,    setSelectedValveId]    = useState(null)
  const [selectedAccessoryId, setSelectedAccessoryId] = useState(null)
  const [activeSection,      setActiveSection]      = useState<string | null>(null)
  const [editLinesEnabled,     setEditLinesEnabled]     = useState(false)
  const [editChaufferie,       setEditChaufferie]       = useState(false)
  const [placingChaufferie,    setPlacingChaufferie]    = useState(false)
  const [editLocauxEF,         setEditLocauxEF]         = useState(false)
  const [placingLocalEF,       setPlacingLocalEF]       = useState(false)
  const [selectedLocalEFId,    setSelectedLocalEFId]    = useState<string | null>(null)
  const [placingEquipment,     setPlacingEquipment]     = useState(null)  // null | { type, name, rotation?, size }
  const [placingAccessoryType, setPlacingAccessoryType] = useState<string | null>(null)  // accessoire visuel en cours de pose (ACCESSORY_TYPES id)
  const [editParam, setEditParam] = useState({
    paramType: 'type', segType: 'aller',
    materialId: null, dn: null,
    insulationId: null, thickness: null,
    length: null,
    flowVelocityMode: 'flowRate', flowVelocityValue: null,
  })

  // Generic updater for any project key
  const update = useCallback((key, valOrFn) => {
    setProject(p => ({ ...p, [key]: typeof valOrFn === 'function' ? valOrFn(p[key]) : valOrFn }))
  }, [setProject])

  const onAssignParam = useCallback((id) => {
    update('segments', segs => segs.map(s => {
      if (s.id !== id) return s
      if (editParam.paramType === 'type')
        return { ...s, type: editParam.segType }
      if (editParam.paramType === 'material') {
        if (s.materialId === editParam.materialId && s.dn === editParam.dn)
          return { ...s, materialId: null, dn: null, di_override: null, de_override: null, lambda_tube_override: null }
        return { ...s, materialId: editParam.materialId, dn: editParam.dn, di_override: null, de_override: null, lambda_tube_override: null }
      }
      if (editParam.paramType === 'insulation') {
        if (s.insulationId === editParam.insulationId && s.thickness === editParam.thickness)
          return { ...s, insulationId: null, thickness: null, lambda_insul_override: null }
        return { ...s, insulationId: editParam.insulationId, thickness: editParam.thickness, lambda_insul_override: null }
      }
      if (editParam.paramType === 'length' && editParam.length != null) {
        if (s.length_override === editParam.length)
          return { ...s, length_override: null }
        return { ...s, length_override: editParam.length }
      }
      if (editParam.paramType === 'flowVelocity' && editParam.flowVelocityValue != null) {
        const alreadySet = editParam.flowVelocityMode === 'flowRate'
          ? s.flowRate === editParam.flowVelocityValue && s.velocity == null
          : s.velocity === editParam.flowVelocityValue && s.flowRate == null
        if (alreadySet)
          return { ...s, flowRate: null, velocity: null }
        return editParam.flowVelocityMode === 'flowRate'
          ? { ...s, flowRate: editParam.flowVelocityValue, velocity: null }
          : { ...s, velocity: editParam.flowVelocityValue, flowRate: null }
      }
      return s
    }))
  }, [editParam, update])

  const handleSegmentFieldUpdate = useCallback((segId, fields) => {
    update('segments', segs => segs.map(s => s.id === segId ? { ...s, ...fields } : s))
  }, [update])

  const handleValveUpdate = useCallback((valveId, fields) => {
    update('valves', vs => (vs ?? []).map(v => v.id === valveId ? { ...v, ...fields } : v))
  }, [update])

  const [isCircuitSelection, setIsCircuitSelection] = useState(false)

  const handleSelectIds = useCallback((ids) => {
    setSelectedIds(ids)
    setSelectedValveId(null)
    setSelectedAmontId(null)
    setIsCircuitSelection(false)
  }, [])

  const handleCircuitSelect = useCallback((ids: string[]) => {
    setSelectedIds(ids)
    setIsCircuitSelection(ids.length > 0)
  }, [])

  const handleFluidChange = useCallback((fluidId, calcId) => {
    if (fluidId === activeFluidId) return

    // Capturer l'état courant avant tout changement
    const currentFullState = (activeFluidId && !pendingSetup) ? getFullState() : null

    // Sauvegarder l'état du fluide actuel s'il a été configuré
    if (currentFullState) {
      fluidStashRef.current.set(activeFluidId, {
        state:  currentFullState,
        calcId: activeCalcId,
      })
    }

    const stashed = fluidStashRef.current.get(fluidId)
    const resolvedCalcId = calcId ?? getAutoCalcId(fluidId)

    // Première fois qu'on passe EF→ECS : copier paramètres appareils + équipements PDC
    const isFirstEFtoECS = activeFluidId === 'ef' && fluidId === 'ecs'
      && !hasECSInheritedFromEFRef.current && currentFullState != null
    if (isFirstEFtoECS) {
      hasECSInheritedFromEFRef.current = true
    }

    const applyEFtoECSPatch = (variants: any[]) => {
      if (!isFirstEFtoECS || !currentFullState) return variants
      const efBase = currentFullState.variants?.find((v: any) => v.isBase)?.data ?? initProject()
      const efAlimParams = efBase.alimentationParamsEF ?? efBase.alimentationParamsECS
      const efPdc = efBase.pdcParamsAlimEF
      return variants.map((v: any) => ({
        ...v,
        data: {
          ...v.data,
          alimentationParamsECS: efAlimParams,
          ...(efPdc ? {
            pdcParamsAlimECS: {
              ...(v.data.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS),
              equipementsActifs:  efPdc.equipementsActifs,
              fittingOverrides:   { ...efPdc.fittingOverrides },
              equipmentOverrides: { ...(efPdc.equipmentOverrides ?? {}) },
              customFittings:     [...(efPdc.customFittings ?? [])],
              customEquipments:   [...(efPdc.customEquipments ?? [])],
            }
          } : {})
        }
      }))
    }

    if (stashed) {
      // Fluide déjà visité → restaurer son état (en y injectant les paramètres EF si premier EF→ECS)
      const stateToLoad = isFirstEFtoECS && stashed.state.variants
        ? { ...stashed.state, variants: applyEFtoECSPatch(stashed.state.variants) }
        : stashed.state
      loadState({ ...stateToLoad, projectName })
      setActiveCalcId(resolvedCalcId ?? stashed.calcId)
      setPendingSetup(false)
    } else if (currentFullState) {
      // Nouveau fluide, mais une grille existe déjà → hériter de la structure, réseau vide, pas de setup
      const baseData = currentFullState.variants?.find(v => v.isBase)?.data ?? initProject()

      // Première fois qu'on bascule entre ECS et EF (peu importe le calcId ECS actif — bouclage ou
      // alimentation — car les deux partagent le même état de projet et donc les mêmes groupes) :
      // copier les groupes de puisage et les paramètres d'appareils.
      const isAlimSwitch =
        (activeFluidId === 'ecs' && fluidId === 'ef') ||
        (activeFluidId === 'ef' && fluidId === 'ecs')

      const inheritedData = {
        ...initProject(),
        levels:   baseData.levels,
        lineYs:   baseData.lineYs,
        columns:  baseData.columns,
        columnXs: baseData.columnXs,
        ...(isAlimSwitch ? {
          alimentationParamsECS: isFirstEFtoECS
            ? (baseData.alimentationParamsEF ?? baseData.alimentationParamsECS)
            : baseData.alimentationParamsECS,
          points: (baseData.points ?? []).filter(p => p.type === 'groupe'),
          ...(isFirstEFtoECS && baseData.pdcParamsAlimEF ? {
            pdcParamsAlimECS: {
              ...DEFAULT_PDC_PARAMS_ALIM_ECS,
              equipementsActifs:  baseData.pdcParamsAlimEF.equipementsActifs,
              fittingOverrides:   { ...baseData.pdcParamsAlimEF.fittingOverrides },
              equipmentOverrides: { ...(baseData.pdcParamsAlimEF.equipmentOverrides ?? {}) },
              customFittings:     [...(baseData.pdcParamsAlimEF.customFittings ?? [])],
              customEquipments:   [...(baseData.pdcParamsAlimEF.customEquipments ?? [])],
            }
          } : {})
        } : {}),
      }
      loadState({
        version: 2,
        projectName,
        activeVariantId: 'v0',
        variants: [{ id: 'v0', name: '', isBase: true, data: inheritedData }],
      })
      setActiveCalcId(resolvedCalcId)
      setPendingSetup(false)
      setActiveSection(s => s ?? 'niveaux')
    } else {
      // Tout premier fluide — la grille est déjà prévisualisée dans le canvas, on garde l'état courant
      setActiveCalcId(resolvedCalcId)
      setPendingSetup(true)
    }

    setActiveFluidId(fluidId)
    setSelectedIds([])
    setDrawMode('select')
  }, [activeFluidId, activeCalcId, pendingSetup, getFullState, loadState, projectName])

  // Déclenche le fit uniquement quand le canvas devient visible pendant le setup
  const setupCanvasVisible = !!(pendingSetup && activeCalcId)
  const prevSetupCanvasVisibleRef = useRef(false)
  useEffect(() => {
    if (setupCanvasVisible && !prevSetupCanvasVisibleRef.current) {
      setTimeout(() => setFitViewRequest(r => r + 1), 0)
    }
    prevSetupCanvasVisibleRef.current = setupCanvasVisible
  }, [setupCanvasVisible])

  const handlePreviewUpdate = useCallback((nSousSol, nFloors, nCols) => {
    patchProject(buildFluidSetupProject(nSousSol, nFloors, nCols))
    setFitViewRequest(r => r + 1)
  }, [patchProject])

  const handleSetupComplete = useCallback(() => {
    setPendingSetup(false)
    setActiveSection(null)
    setFitViewRequest(r => r + 1)
  }, [])

  const handleDeleteBase = useCallback(() => {
    const result = deleteBaseVariant()
    if (result === 'last') {
      // Retirer le fluide courant du stash
      fluidStashRef.current.delete(activeFluidId)

      // Chercher un fluide de repli dans l'ordre de priorité
      const fallbacks = FLUID_FALLBACKS[activeFluidId] ?? []
      const fallbackId = fallbacks.find(fid => fluidStashRef.current.has(fid)) ?? null

      if (fallbackId) {
        const stashed = fluidStashRef.current.get(fallbackId)
        loadState({ ...stashed.state, projectName })
        setActiveFluidId(fallbackId)
        setActiveCalcId(stashed.calcId)
        setPendingSetup(false)
        setActiveSection(s => s ?? 'niveaux')
      } else {
        // Aucun autre réseau — retour à l'écran de lancement
        setActiveFluidId(null)
        setActiveCalcId(null)
        setPendingSetup(true)
      }

      setSelectedIds([])
      setDrawMode('select')
    }
  }, [deleteBaseVariant, activeFluidId, loadState, projectName])

  const handleCalcChange = useCallback((id) => {
    if (!activeCalcId && !pendingSetup) setActiveSection(s => s ?? 'niveaux')
    setActiveCalcId(id)
    setActiveTable(null)
    setCanvasDisplay(CANVAS_DISPLAY_RESET)
  }, [activeCalcId, pendingSetup])

  const startTableResize = useCallback((e) => {
    e.preventDefault()
    const startY = e.clientY
    const startH = tableHeightRef.current
    const onMove = ev => setTableHeight(Math.max(120, Math.min(620, startH + (startY - ev.clientY))))
    const onUp   = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [])

  const handleRemoveColumn = useCallback((idx) => {
    setProject(p => {
      if (p.columns.length <= 1) return p
      return p.columns[idx]?.isGap
        ? removeGapColumn(p, idx)
        : removeRegularColumn(p, idx)
    })
  }, [setProject])

  // Updates columnXs during column boundary drag (no content changes — PP zones have their own handler).
  const handleColumnXsChange = useCallback((updater) => {
    setProject(p => {
      const newXs = typeof updater === 'function' ? updater(p.columnXs) : updater
      if (newXs === p.columnXs) return p
      return { ...p, columnXs: newXs }
    })
  }, [setProject])

  // Slides the PP zone gap column left/right, keeping its width fixed, and moves its groups.
  const handlePPZoneDrag = useCallback((ppZoneId, ppWidth, newXLeft) => {
    setProject(p => {
      const ppIdx = p.columns.findIndex(c => c.id === ppZoneId)
      if (ppIdx < 0) return p
      const minXLeft = p.columnXs[ppIdx - 1] !== undefined ? p.columnXs[ppIdx - 1] + 80 : -Infinity
      const maxXLeft = p.columnXs[ppIdx + 2] !== undefined ? p.columnXs[ppIdx + 2] - ppWidth - 80 : Infinity
      const clampedXLeft = Math.max(minXLeft, Math.min(maxXLeft, newXLeft))
      const delta = clampedXLeft - p.columnXs[ppIdx]
      if (Math.abs(delta) < 0.5) return p
      const newColumnXs = p.columnXs.map((x, i) =>
        (i === ppIdx || i === ppIdx + 1) ? x + delta : x
      )
      const ppColId = p.columns[ppIdx].colId
      const groupMoves = new Map()
      const newPoints = p.points.map(pt => {
        if (pt.type !== 'groupe' || pt.colId !== ppColId) return pt
        const newPt = { ...pt, x: pt.x + delta }
        groupMoves.set(pt.id, delta)
        return newPt
      })
      const newSegments = groupMoves.size > 0
        ? p.segments.map(seg => {
            const sd = groupMoves.has(seg.startPointId) ? delta : 0
            const ed = groupMoves.has(seg.endPointId) ? delta : 0
            if (!sd && !ed) return seg
            const verts = [...seg.vertices]
            if (sd) verts[0] = { x: verts[0].x + sd, y: verts[0].y }
            if (ed) verts[verts.length - 1] = { x: verts[verts.length - 1].x + ed, y: verts[verts.length - 1].y }
            return { ...seg, vertices: verts }
          })
        : p.segments
      return { ...p, columnXs: newColumnXs, points: newPoints, segments: newSegments }
    })
  }, [setProject])

  // Moves a gaine column to a new left boundary position (called from LeftPanel ◀ ▶ buttons).
  const handleMoveGaine = useCallback((gapIdx, finalLeft) => {
    setProject(p => moveGaine(p, gapIdx, finalLeft))
  }, [setProject])


  // Returns the insertion index: before the last column if it's a gap, otherwise at the end.
  function insertBeforeRightZone(cols) {
    return (cols.length > 0 && cols[cols.length - 1].isGap) ? cols.length - 1 : cols.length
  }

  const handleAddColumn = useCallback(() => {
    setProject(p => {
      const cols     = p.columns
      const xs       = p.columnXs
      const colW     = COL_PIPE_W
      const newId    = uid('col')
      const newCol   = { id: newId, name: `Colonne ${cols.filter(c => !c.isGap).length + 1}`, levelIds: 'all' }
      const at       = cols.length
      const xInsert  = xs[at]
      const expanded = expandZone(p, xInsert, colW)
      return {
        ...expanded,
        columns:  [...expanded.columns.slice(0, at),  newCol, ...expanded.columns.slice(at)],
        columnXs: [...expanded.columnXs.slice(0, at), xInsert, ...expanded.columnXs.slice(at)],
      }
    })
  }, [setProject])

  const handleAddGap = useCallback(() => {
    setProject(p => {
      const cols     = p.columns
      const xs       = p.columnXs
      const gapW     = 120
      const newId    = uid('gap')
      const newGap   = { id: newId, name: '', levelIds: 'all', isGap: true }
      // Insert after the last group gaine (isPPZone), or at end — never before a group gaine
      let at = cols.length
      if (at > 0 && cols[at - 1].isGap && !cols[at - 1].isPPZone) at = at - 1
      const xInsert  = xs[at]
      const expanded = expandZone(p, xInsert, gapW)
      return {
        ...expanded,
        columns:  [...expanded.columns.slice(0, at),  newGap, ...expanded.columns.slice(at)],
        columnXs: [...expanded.columnXs.slice(0, at), xInsert, ...expanded.columnXs.slice(at)],
      }
    })
  }, [setProject])

  const handleAddGroupe = useCallback((colId, levelId) => {
    setProject(p => {
      const colIdx = p.columns.findIndex(c => c.id === colId)
      if (colIdx < 0) return p
      const levelIdx = p.levels.findIndex(l => l.id === levelId)
      if (levelIdx < 0) return p
      const existing = p.points.filter(pt => pt.type === 'groupe' && pt.colId === colId && pt.levelId === levelId)

      // Smallest missing internalId for this col/level
      const usedIds = new Set(existing.map(pt => pt.internalId).filter(n => n != null))
      let internalId = 1
      while (usedIds.has(internalId)) internalId++

      // PP zone width based on max internalId across ALL levels for this column
      const allForCol = p.points.filter(pt => pt.type === 'groupe' && pt.colId === colId)
      const currentMaxId = allForCol.length > 0 ? Math.max(...allForCol.map(g => g.internalId ?? 1)) : 0
      const newMaxId = Math.max(currentMaxId, internalId)
      const minSep = 23 + newMaxId * (LOCAL_W + LOCAL_GAP)

      const ppIdx = p.columns.findIndex(c => c.isPPZone && c.colId === colId)
      let base = p

      if (ppIdx < 0) {
        const xInsert = p.columnXs[colIdx + 1]
        base = expandZone(p, xInsert, minSep)
        const newPPZone = { id: uid('ppz'), isGap: true, isPPZone: true, colId, levelIds: 'all' }
        const insertAt = colIdx + 1
        base = {
          ...base,
          columns:   [...base.columns.slice(0, insertAt),  newPPZone, ...base.columns.slice(insertAt)],
          columnXs:  [...base.columnXs.slice(0, insertAt), xInsert,   ...base.columnXs.slice(insertAt)],
        }
      } else {
        const ppLeft  = p.columnXs[ppIdx]
        const ppRight = p.columnXs[ppIdx + 1]
        const currentPP = ppRight - ppLeft
        if (currentPP < minSep) {
          base = expandZone(p, ppRight, minSep - currentPP)
        }
      }

      // Place new group at the slot corresponding to its internalId
      const finalPPIdx = base.columns.findIndex(c => c.isPPZone && c.colId === colId)
      const ppLeft = base.columnXs[finalPPIdx]
      const newX = snapG(ppLeft + 13 + (internalId - 1) * (LOCAL_W + LOCAL_GAP) + LOCAL_W / 2)
      const yBot = p.lineYs[levelIdx]
      const yTop = p.lineYs[levelIdx + 1] ?? (p.lineYs[levelIdx] - 210)
      const newY = snapG((yBot + yTop) / 2)
      const newPt = { id: uid('grp'), type: 'groupe', name: '', showName: false, colId, levelId, x: newX, y: newY, isLocked: false, internalId }
      return { ...base, points: [...base.points, newPt] }
    })
  }, [setProject])

  const handleRemoveGroupe = useCallback((colId, levelId) => {
    setProject(p => {
      const existing = p.points.filter(pt => pt.type === 'groupe' && pt.colId === colId && pt.levelId === levelId)
      if (existing.length === 0) return p
      // Remove the group with the highest internalId (fallback: highest X for legacy data)
      const toRemove = [...existing].sort((a, b) => (a.internalId ?? a.x) - (b.internalId ?? b.x)).at(-1)
      const { points: newPoints, segments: newSegments } = removeGroupeBranch(p.points, p.segments, toRemove.id, p.lineYs)
      return adjustPPZone(p, colId, newPoints, newSegments)
    })
  }, [setProject])

  const handleRemoveGroupeById = useCallback((ptId) => {
    setProject(p => {
      const toRemove = p.points.find(pt => pt.id === ptId && pt.type === 'groupe')
      if (!toRemove) return p
      const { points: newPoints, segments: newSegments } = removeGroupeBranch(p.points, p.segments, ptId, p.lineYs)
      return adjustPPZone(p, toRemove.colId, newPoints, newSegments)
    })
  }, [setProject])


  const isSpecialPt = (pt) =>
    pt.type === 'productionECS' || pt.type === 'arriveeEF' || pt.type === 'groupe'
    || pt.type === 'productionChauffage' || pt.isLocked

  // Combined atomic update (single undo entry)
  // After every network change, points with 0 segment connections are auto-removed
  // (except productionECS, arriveeEF, groupe and locked points which are always kept).
  // segSplits: { [oldSegId]: { seg1Id, seg1Len, seg2Id, seg2Len } } — segment division
  // segMerges: { [oldSegId]: { newSegId, totalLen, offset, ownLen, reversed } } — node deletion
  const updateNetwork = useCallback((segsFnOrVal, ptsFnOrVal, segSplits?, segMerges?) => {
    setProject(p => {
      const newSegs = typeof segsFnOrVal === 'function' ? segsFnOrVal(p.segments) : (segsFnOrVal ?? p.segments)
      const newPts  = typeof ptsFnOrVal  === 'function' ? ptsFnOrVal(p.points)   : (ptsFnOrVal  ?? p.points)
      const connected = new Set()
      for (const seg of newSegs) {
        if (seg.startPointId) connected.add(seg.startPointId)
        if (seg.endPointId)   connected.add(seg.endPointId)
      }
      const prunedPts = newPts.filter(pt => connected.has(pt.id) || isSpecialPt(pt))
      const segIds = new Set(newSegs.map(s => s.id))
      const remapItem = (item) => {
        if (segIds.has(item.segmentId)) return item
        const split = segSplits?.[item.segmentId]
        if (split) {
          const { seg1Id, seg1Len, seg2Id, seg2Len } = split
          const totalLen = seg1Len + seg2Len
          if (totalLen === 0) return { ...item, segmentId: seg1Id, t: 0 }
          const absPos = item.t * totalLen
          if (absPos <= seg1Len) {
            return { ...item, segmentId: seg1Id, t: seg1Len > 0 ? absPos / seg1Len : 0 }
          } else {
            return { ...item, segmentId: seg2Id, t: seg2Len > 0 ? (absPos - seg1Len) / seg2Len : 1 }
          }
        }
        // Follow merge chain — transitive for multi-node deletions
        let current = { ...item }
        const visited = new Set()
        while (!segIds.has(current.segmentId)) {
          if (visited.has(current.segmentId)) return null
          const merge = segMerges?.[current.segmentId]
          if (!merge) return null
          visited.add(current.segmentId)
          const { newSegId, totalLen, offset, ownLen, reversed } = merge
          const absPos = reversed ? (1 - current.t) * ownLen : current.t * ownLen
          current = { ...current, segmentId: newSegId, t: totalLen === 0 ? 0 : (offset + absPos) / totalLen }
        }
        return current
      }
      const prunedValves = (p.valves ?? []).map(remapItem).filter(Boolean)
      const prunedAccessories = (p.accessories ?? []).map(remapItem).filter(Boolean)
      return { ...p, segments: newSegs, points: prunedPts, valves: prunedValves, accessories: prunedAccessories }
    })
  }, [setProject])

  // Patches the current undo entry for auto-corrections — does NOT create a new undo step
  const patchNetwork = useCallback((segsFnOrVal, ptsFnOrVal) => {
    patchProject(p => {
      const newSegs = typeof segsFnOrVal === 'function' ? segsFnOrVal(p.segments) : (segsFnOrVal ?? p.segments)
      const newPts  = typeof ptsFnOrVal  === 'function' ? ptsFnOrVal(p.points)   : (ptsFnOrVal  ?? p.points)
      const connected = new Set()
      for (const seg of newSegs) {
        if (seg.startPointId) connected.add(seg.startPointId)
        if (seg.endPointId)   connected.add(seg.endPointId)
      }
      const prunedPts = newPts.filter(pt => connected.has(pt.id) || isSpecialPt(pt))
      const segIds = new Set(newSegs.map(s => s.id))
      const prunedValves = (p.valves ?? []).filter(v => segIds.has(v.segmentId))
      const prunedAccessories = (p.accessories ?? []).filter(a => segIds.has(a.segmentId))
      return { ...p, segments: newSegs, points: prunedPts, valves: prunedValves, accessories: prunedAccessories }
    })
  }, [patchProject])

  // Update a single segment or point by id
  const updateElement = useCallback((id, type, newData) => {
    if (type === 'segment') {
      setProject(p => ({ ...p, segments: p.segments.map(s => s.id !== id ? s : { ...s, ...newData }) }))
    } else {
      setProject(p => ({ ...p, points: p.points.map(pt => pt.id !== id ? pt : { ...pt, ...newData }) }))
    }
  }, [setProject])

  // Auto-exit errors mode when all errors are resolved
  useEffect(() => {
    if (drawMode === 'errors' && errorCount === 0) {
      setDrawMode('select')
      setConnHighlightIds([])
    }
  }, [drawMode, errorCount])

  // Ctrl+Z / Ctrl+Y / Escape / Delete
  useEffect(() => {
    const handler = e => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
      if (e.key === 'Escape') {
        setDrawMode('select')
        setEditChaufferie(false)
        setPlacingChaufferie(false)
        setPlacingEquipment(null)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const handleAddPump = () => {
    const pumps = project.points.filter(p => p.type === 'pump')
    const count = pumps.length
    const name = count === 0
      ? 'Pompe bouclage ECS'
      : `Pompe bouclage ECS n°${count + 1}`
    setPlacingEquipment({
      type: 'pump', name, rotation: 180, size: 12,
      ...(count === 1 ? { renameFirstPump: pumps[0].id } : {}),
    })
  }

  const handleAddProductionECS = () => {
    setPlacingEquipment({ type: 'productionECS', name: 'Production ECS', size: { w: 44, h: 28 } })
  }

  const handleAddArriveeEF = () => {
    setPlacingEquipment({ type: 'arriveeEF', name: 'Arrivée EF', size: { w: 44, h: 28 } })
  }

  const handleAddProductionChauffage = () => {
    setPlacingEquipment({ type: 'productionChauffage', name: 'Production Chauffage', size: { w: 52, h: 28 } })
  }

  const handleAddEmetteur = (emetteurType: string, deltaT: number, puissance: number | null) => {
    setPlacingEquipment({ type: 'emetteur', emetteurType, deltaT, puissance, name: '', size: { w: 28, h: 18 } })
  }

  const handleAddChaufferie = () => setPlacingChaufferie(true)
  const handleAddLocalEF    = () => setPlacingLocalEF(true)
  const handleLocauxEFChange = (v: any[]) => {
    update('locauxEF', v)
    if (v.length === 0) { setEditLocauxEF(false); setSelectedLocalEFId(null) }
  }

  const handleSave = () => {
    const state = getFullState()
    const slug  = (state.projectName || 'projet-ecs').replace(/[^a-z0-9]/gi, '_').toLowerCase()
    const blob  = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `${slug}.json` })
    a.click()
  }

  const handleLoad = () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' })
    input.onchange = e => {
      const reader = new FileReader()
      reader.onload = ev => {
        try { loadState(JSON.parse((ev.target as FileReader).result as string)); setSelectedIds([]) }
        catch { alert('Fichier invalide.') }
      }
      reader.readAsText((e.target as HTMLInputElement).files![0])
    }
    input.click()
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-hd-left">
          <div className="app-title">
            {editingProjName ? (
              <input
                className="app-title-edit"
                value={projectName}
                placeholder="Nouveau projet"
                onChange={e => setProjectName(e.target.value)}
                onBlur={() => setEditingProjName(false)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingProjName(false) }}
                autoFocus
              />
            ) : (
              <span
                className={`app-title-main${!projectName ? ' app-title-placeholder' : ''}`}
                title="Cliquer pour renommer le projet"
                onClick={() => setEditingProjName(true)}>
                {projectName || 'Nouveau projet'}
              </span>
            )}
          </div>
        </div>
        <div className="app-hd-center" style={activeCalcId && !pendingSetup ? { justifyContent: 'flex-start' } : {}}>
          {pendingSetup && (
            <span className="hd-hint">Choisissez un type de réseau :</span>
          )}
          <CalcFluidTabs
            activeFluidId={activeFluidId}
            activeCalcId={activeCalcId}
            onFluidChange={handleFluidChange}
            onCalcChange={handleCalcChange}
            isFluidKnown={fid => fid === activeFluidId || fluidStashRef.current.has(fid)}
          />
          {activeFluidId && activeCalcId && !pendingSetup && (
            <>
              <div className="app-hd-sep" />
              <VariantBar
                variants={meta}
                activeVariantId={activeId}
                calcLabel={getNetworkLabel(activeCalcId)}
                onActivate={id => { switchVariant(id); setSelectedIds([]) }}
                onDuplicate={duplicateVariant}
                onDelete={deleteVariant}
                onDeleteBase={handleDeleteBase}
                canDeleteBase={
                  meta.length > 1 ||
                  (FLUID_FALLBACKS[activeFluidId] ?? []).some(fid => fluidStashRef.current.has(fid))
                }
                onRename={renameVariant}
                onSetBase={setBaseVariant}
                onReorder={reorderVariant}
              />
            </>
          )}
        </div>
        <div className="app-hd-right">
          <button onClick={handleSave} className="btn btn-secondary">💾 Sauvegarder</button>
          <button onClick={handleLoad} className="btn btn-secondary">📂 Charger</button>
          <button className="btn btn-success" disabled>📊 Export Excel</button>
        </div>
      </header>

      <Toolbar
        drawMode={drawMode} setDrawMode={setDrawMode}
        pipeType={pipeType} setPipeType={setPipeType}
        panelOpen={!pendingSetup && (activeSection !== null || drawMode === 'editParams')}
        onTogglePanel={() => {
          if (drawMode === 'editParams') { setDrawMode('select'); setActiveSection(s => s ?? 'niveaux') }
          else setActiveSection(s => s ? null : 'niveaux')
        }}
        errorCount={errorCount}
        onShowErrors={() => { setDrawMode('errors') }}
        placingEquipment={placingEquipment}
        onCancelPlacingEquipment={() => setPlacingEquipment(null)}
        onAddProductionECS={handleAddProductionECS}
        hasProductionECS={project.points.some(p => p.type === 'productionECS')}
        onAddArriveeEF={handleAddArriveeEF}
        onAddPump={handleAddPump}
        onAddProductionChauffage={handleAddProductionChauffage}
        hasProductionChauffage={project.points.some(p => p.type === 'productionChauffage')}
        onAddEmetteur={handleAddEmetteur}
        canvasDisplay={canvasDisplay}
        onCanvasDisplayToggle={key => setCanvasDisplay(d => ({ ...d, [key]: !d[key] }))}
        activeFluidId={activeFluidId}
        activeCalcId={pendingSetup ? null : activeCalcId}
        pdcParams={activePdcParams}
        placingAccessoryType={placingAccessoryType}
        onPlacingAccessoryTypeChange={type => { setPlacingAccessoryType(type); if (type) setSelectedIds([]) }}
      />

      <div className="app-body">
        {!pendingSetup && (
          <nav className="icon-sidebar">
            {([
              ['niveaux',     'Niveaux & Colonnes',  <BuildingFloorsIcon size={36} />],
              ['groupes',     'Groupes de points de puisage', <FaucetsGroupIcon size={36} />],
              ['materiaux',   'Matériaux des canalisations', <PipeIcon size={36} />],
              ['isolation',   'Isolants (calorifugeage)',    <InsulatedPipeIcon size={36} />],
              ['equipements', 'Équipements',        <FaucetIcon size={36} />],
              ['pdc',         'Pertes de charge',   <GaugeIcon size={36} />],
            ] as [string, string, React.ReactNode][]).filter(([key]) => {
              if (isAlimEF && key === 'isolation') return false
              if (isChauffage && (key === 'isolation' || key === 'groupes' || key === 'equipements')) return false
              return true
            }).map(([key, label, icon]) => (
              <button
                key={key}
                className={`icon-sidebar-btn${activeSection === key ? ' active' : ''}`}
                onClick={() => {
                  if (drawMode === 'editParams') setDrawMode('select')
                  setActiveSection(s => s === key ? null : key)
                }}
                data-tooltip={label}
              >
                {icon}
              </button>
            ))}
          </nav>
        )}

        <div className="content-area">
        <aside className={`sidebar-left${(pendingSetup || (!pendingSetup && (activeSection !== null || drawMode === 'editParams' || drawMode === 'errors'))) ? '' : ' sidebar-closed'}${pendingSetup ? ' sidebar-no-transition' : ''}`}>
          {pendingSetup ? (
            <NetworkSetupCard
              fluidLabel={activeFluidId ? getFluidLabel(activeFluidId) : null}
              calcLabel={activeCalcId ? getCalcLabel(activeCalcId) : null}
              onPreview={handlePreviewUpdate}
              onComplete={handleSetupComplete}
            />
          ) : (!pendingSetup && (activeSection !== null || drawMode === 'editParams' || drawMode === 'errors')) && (
            <LeftPanel
              activeSection={activeSection}
              activeCalcId={activeCalcId}
              alimentationParams={resolveAlimentationParams(project.alimentationParamsECS)}
              onAlimentationParamsChange={v => update('alimentationParamsECS', v)}
              alimentationParamsEF={project.alimentationParamsEF != null ? resolveAlimentationParams(project.alimentationParamsEF) : null}
              onAlimentationParamsEFChange={v => update('alimentationParamsEF', v)}
              pdcParams={project.pdcParamsBouclageECS ?? DEFAULT_PDC_PARAMS}
              onPdcParamsChange={v => update('pdcParamsBouclageECS', v)}
              pdcParamsChauffage={project.pdcParamsChauffage ?? DEFAULT_PDC_PARAMS}
              onPdcParamsChauffageChange={(v: any) => update('pdcParamsChauffage', v)}
              pdcParamsAlimECS={project.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS}
              onPdcParamsAlimECSChange={v => update('pdcParamsAlimECS', v)}
              totalQpAlimM3h={totalQpAlimM3h}
              pdcParamsAlimEF={project.pdcParamsAlimEF}
              onPdcParamsAlimEFChange={v => update('pdcParamsAlimEF', v)}
              totalQpAlimEFM3h={totalQpAlimEFM3h}
              selectedAmontId={selectedAmontId}
              onSelectAmontId={(id: string | null) => { setSelectedAmontId(id); setSelectedIds([]) }}
              amontTronconResults={amontTronconResults}
              pressionSourceAlimECSStatic={pressionSourceAlimECSStatic}
              levels={project.levels}
              lineYs={project.lineYs}
              onLevelsChange={v => update('levels', v)}
              onLineYsChange={v => update('lineYs', v)}
              editLinesEnabled={editLinesEnabled}
              onEditLinesChange={setEditLinesEnabled}
              materials={project.materialsECS}
              onMaterialsChange={v => update('materialsECS', typeof v === 'function' ? v(project.materialsECS) : v)}
              materialsEF={project.materialsEF ?? DEFAULT_MATERIALS}
              onMaterialsEFChange={v => update('materialsEF', typeof v === 'function' ? v(project.materialsEF ?? DEFAULT_MATERIALS) : v)}
              insulations={project.insulations}
              onInsulationsChange={v => update('insulations', typeof v === 'function' ? v(project.insulations) : v)}
              columns={project.columns}
              columnXs={project.columnXs}
              onColumnsChange={v => update('columns', v)}
              onColumnXsChange={handleColumnXsChange}
              onRemoveColumn={handleRemoveColumn}
              onAddColumn={handleAddColumn}
              onAddGap={handleAddGap}
              onMoveGaine={handleMoveGaine}
              chaufferie={project.chaufferie}
              onChaufferieChange={v => update('chaufferie', v)}
              onAddChaufferie={handleAddChaufferie}
              chauffageParams={project.chauffageParams ?? DEFAULT_CHAUFFAGE_PARAMS}
              onChauffageParamsChange={v => update('chauffageParams', v)}
              editChaufferie={editChaufferie}
              onEditChaufferieChange={setEditChaufferie}
              placingChaufferie={placingChaufferie}
              locauxEF={project.locauxEF ?? []}
              onAddLocalEF={handleAddLocalEF}
              placingLocalEF={placingLocalEF}
              editLocauxEF={editLocauxEF}
              onEditLocauxEFChange={v => { setEditLocauxEF(v); if (!v) setSelectedLocalEFId(null) }}
              segments={project.segments}
              points={project.points}
              networkFlows={networkFlows}
              flowDirections={flowDirections}
              roleMap={effectiveRoleMap}
              drawMode={drawMode}
              editParam={editParam}
              onEditParamChange={setEditParam}
              onSelectIds={setSelectedIds}
              onConnHighlight={setConnHighlightIds}
              groupesEditMode={groupesEditMode} onGroupesEditModeChange={setGroupesEditMode}
              showGroupeNames={showGroupeNames} onShowGroupeNamesChange={setShowGroupeNames}
              onAddGroupe={handleAddGroupe} onRemoveGroupe={handleRemoveGroupe}
              selectedIds={selectedIds}
              onUpdateSegment={(seg: any) => update('segments', (segs: any[]) => segs.map(s => s.id === seg.id ? seg : s))}
            />
          )}
        </aside>

        <div className="canvas-col" style={{ position: 'relative' }}>
        <main className="canvas-area">
          <DrawingCanvas
            levels={project.levels}
            lineYs={project.lineYs}
            onLineYsChange={v => update('lineYs', typeof v === 'function' ? v(project.lineYs) : v)}
            segments={project.segments}
            onSegmentsChange={v => update('segments', typeof v === 'function' ? v(project.segments) : v)}
            points={project.points}
            onPointsChange={v => update('points', typeof v === 'function' ? v(project.points) : v)}
            onNetworkChange={updateNetwork}
            onNetworkPatch={patchNetwork}
            drawMode={drawMode}
            pipeType={pipeType}
            selectedIds={selectedIds}
            onSelectIds={handleSelectIds}
            editLevelsEnabled={editLinesEnabled}
            editColumnsEnabled={editLinesEnabled}
            columns={project.columns}
            columnXs={project.columnXs}
            onColumnXsChange={handleColumnXsChange}
            onPPZoneDrag={handlePPZoneDrag}
            chaufferie={project.chaufferie}
            onChaufferieChange={v => update('chaufferie', v)}
            editChaufferie={editChaufferie || editLinesEnabled}
            onEditChaufferieChange={setEditChaufferie}
            placingChaufferie={placingChaufferie}
            onPlacingChaufferieDone={() => setPlacingChaufferie(false)}
            placingEquipment={placingEquipment}
            onPlacingDone={() => setPlacingEquipment(null)}
            editParam={drawMode === 'editParams' ? editParam : null}
            onAssignParam={onAssignParam}
            connHighlightIds={connHighlightIds}
            onConnHighlight={setConnHighlightIds}
            networkFlows={isChauffage ? chauffageFlows : networkFlows}
            flowDirections={flowDirections}
            chauffageFlows={chauffageFlows}
            chauffageParams={project.chauffageParams ?? DEFAULT_CHAUFFAGE_PARAMS}
            groupesEditMode={groupesEditMode}
            onRemoveGroupeById={handleRemoveGroupeById}
            showGroupeNames={showGroupeNames}
            groupDisplayNames={groupDisplayNames}
            canvasDisplay={canvasDisplay}
            roleMap={effectiveRoleMap}
            materials={isAlimEF ? (project.materialsEF ?? DEFAULT_MATERIALS) : project.materialsECS}
            insulations={project.insulations}
            alimentationParams={resolveAlimentationParams(project.alimentationParamsECS)}
            activeCalcId={activeCalcId}
            thermalResults={thermalResults}
            alimentationResults={isAlimEF ? alimentationResultsEF : alimentationResultsECS}
            fitViewRequest={fitViewRequest}
            valves={project.valves ?? []}
            onValvesChange={v => update('valves', typeof v === 'function' ? v(project.valves ?? []) : v)}
            selectedValveId={selectedValveId}
            onSelectedValveChange={id => { setSelectedValveId(id); if (id) setSelectedIds([]) }}
            accessories={project.accessories ?? []}
            onAccessoriesChange={v => update('accessories', typeof v === 'function' ? v(project.accessories ?? []) : v)}
            placingAccessoryType={placingAccessoryType}
            onPlacingAccessoryDone={() => setPlacingAccessoryType(null)}
            selectedAccessoryId={selectedAccessoryId}
            onSelectedAccessoryChange={id => { setSelectedAccessoryId(id); if (id) setSelectedIds([]) }}
            pdcParams={activePdcParams}
            pdcResults={pdcResults}
            pdcCumResults={pdcCumResults}
            pdcCumAlimResults={activePdcCumAlimResults}
            segToCol={segToCol}
            onExitSpecialMode={() => setDrawMode('select')}
            pressionSourceAlimEF={pressionSourceAlimEF}
            pressionSourceAlimEFStatic={pressionSourceAlimEF}
            locauxEF={project.locauxEF ?? []}
            onLocauxEFChange={handleLocauxEFChange}
            placingLocalEF={placingLocalEF}
            onPlacingLocalEFDone={() => setPlacingLocalEF(false)}
            editLocauxEF={editLocauxEF}
            onEditLocauxEFChange={v => { setEditLocauxEF(v); if (!v) setSelectedLocalEFId(null) }}
            selectedLocalEFId={selectedLocalEFId}
            onSelectedLocalEFChange={id => { setSelectedLocalEFId(id); if (id) setSelectedIds([]) }}
          />
        </main>

        {!pendingSetup && activeCalcId && (() => {
          const leftOpen = activeSection !== null || drawMode === 'editParams' || drawMode === 'errors'
          const rightOpen = (selectedIds.length > 0 && !isCircuitSelection) || editChaufferie || !!selectedValveId || !!selectedAmontId || !!selectedLocalEFId || editLocauxEF
          return (
            <div style={{
              marginLeft: leftOpen ? 280 : 0,
              marginRight: rightOpen ? 250 : 0,
              transition: 'margin-left 0.2s ease, margin-right 0.15s ease',
              flexShrink: 0,
            }}>
              {activeTable !== null && (
                <div className="rt-resizer" onMouseDown={startTableResize} />
              )}
              {activeTable !== null && (
                <ResultsTable
                  height={tableHeight}
                  rows={flowRows}
                  roleMap={roleMap}
                  efFlowRowsArr={efFlowRowsArr}
                  activeCalcId={activeCalcId}
                  activeTable={activeTable}
                  segments={project.segments}
                  points={project.points}
                  materials={isAlimEF ? (project.materialsEF ?? DEFAULT_MATERIALS) : project.materialsECS}
                  insulations={project.insulations}
                  levels={project.levels}
                  lineYs={project.lineYs}
                  columns={project.columns}
                  columnXs={project.columnXs}
                  chaufferie={project.chaufferie}
                  flowDirections={flowDirections}
                  networkFlows={networkFlows}
                  chauffageFlows={chauffageFlows}
                  chauffageParams={project.chauffageParams ?? DEFAULT_CHAUFFAGE_PARAMS}
                  thermalResults={thermalResults}
                  alimentationResults={alimentationResultsECS}
                  alimentationResultsEF={alimentationResultsEF}
                  pdcResults={pdcResults}
                  pdcParams={activePdcParams}
                  pdcCumResults={pdcCumResults}
                  pdcCumAlimResults={activePdcCumAlimResults}
                  segToCol={segToCol}
                  globalParams={project.globalParams}
                  selectedIds={selectedIds}
                  onSelectIds={setSelectedIds}
                  onCircuitSelect={handleCircuitSelect}
                />
              )}
              <div className="rt-toggle-bar">
                <span className="rt-bar-label">Tableau des résultats</span>
                <button
                  className={`rt-toggle-btn${activeTable === 'dimensionnement' ? ' active' : ''}`}
                  onClick={() => setActiveTable(t => t === 'dimensionnement' ? null : 'dimensionnement')}
                >
                  Dimensionnement
                  <span style={{ fontSize: 8, opacity: 0.6 }}>{activeTable === 'dimensionnement' ? '▼' : '▲'}</span>
                </button>
                {hasPdc && (
                  <button
                    className={`rt-toggle-btn${activeTable === 'pdc' ? ' active' : ''}`}
                    onClick={() => setActiveTable(t => t === 'pdc' ? null : 'pdc')}
                  >
                    Pertes de charge
                    <span style={{ fontSize: 8, opacity: 0.6 }}>{activeTable === 'pdc' ? '▼' : '▲'}</span>
                  </button>
                )}
              </div>
            </div>
          )
        })()}

        </div>{/* canvas-col */}

        <aside className={`sidebar-right${(pendingSetup || ((selectedIds.length === 0 || isCircuitSelection) && !editChaufferie && !selectedValveId && !selectedAmontId && !selectedLocalEFId && !editLocauxEF)) ? ' sidebar-right-closed' : ''}`}>
          <RightPanel
            selectedIds={selectedIds}
            segments={project.segments}
            points={project.points}
            onUpdate={updateElement}
            materials={isAlimEF ? (project.materialsEF ?? DEFAULT_MATERIALS) : project.materialsECS}
            insulations={project.insulations}
            activeCalcId={activeCalcId}
            alimentationParams={isAlimEF && project.alimentationParamsEF != null
              ? resolveAlimentationParams(project.alimentationParamsEF)
              : resolveAlimentationParams(project.alimentationParamsECS)}
            pdcParams={activePdcParams}
            pdcResults={pdcResults}
            pdcCumResults={pdcCumResults}
            pdcCumAlimResults={activePdcCumAlimResults}
            segToCol={segToCol}
            valveKvResults={activeValveKvResults}
            levels={project.levels}
            lineYs={project.lineYs}
            columns={project.columns}
            columnXs={project.columnXs}
            chaufferie={project.chaufferie}
            onChaufferieChange={v => update('chaufferie', v)}
            editChaufferie={editChaufferie}
            locauxEF={project.locauxEF ?? []}
            onLocauxEFChange={handleLocauxEFChange}
            selectedLocalEFId={selectedLocalEFId}
            onSelectedLocalEFChange={setSelectedLocalEFId}
            flowDirections={flowDirections}
            networkFlows={networkFlows}
            chauffageFlows={chauffageFlows}
            chauffageParams={project.chauffageParams ?? DEFAULT_CHAUFFAGE_PARAMS}
            onChauffageParamsChange={v => update('chauffageParams', v)}
            chauffageThermal={chauffageThermal}
            globalParams={project.globalParams}
            thermalResults={thermalResults}
            alimentationResults={isAlimEF ? alimentationResultsEF : alimentationResultsECS}
            roleMap={roleMap}
            drawMode={drawMode}
            onExitEditParams={() => setDrawMode('select')}
            selectedValveId={selectedValveId}
            valves={project.valves ?? []}
            onValveUpdate={handleValveUpdate}
            selectedAmontId={selectedAmontId}
            tronçonsAmont={project.pdcParamsAlimECS?.tronçonsAmont ?? []}
            onUpdateAmontTroncon={(tr: any) => {
              const p = project.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS
              update('pdcParamsAlimECS', { ...p, tronçonsAmont: (p.tronçonsAmont ?? []).map((t: any) => t.id === tr.id ? tr : t) })
            }}
            onRemoveAmontTroncon={(id: string) => {
              const p = project.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS
              update('pdcParamsAlimECS', { ...p, tronçonsAmont: (p.tronçonsAmont ?? []).filter((t: any) => t.id !== id) })
              setSelectedAmontId(null)
            }}
            amontTronconResults={amontTronconResults}
            totalQpAlimM3h={totalQpAlimM3h}
            pressionSourceAlimECS={pressionSourceAlimECS}
            pressionSourceAlimECSStatic={pressionSourceAlimECSStatic}
            pdcParamsAlimECS={project.pdcParamsAlimECS ?? DEFAULT_PDC_PARAMS_ALIM_ECS}
            pressionSourceAlimEF={pressionSourceAlimEF}
            pressionSourceAlimEFStatic={pressionSourceAlimEF}
            groupDisplayNames={groupDisplayNames}
          />
        </aside>
        </div>{/* content-area */}
      </div>
    </div>
  )
}
