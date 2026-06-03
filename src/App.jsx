import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import DrawingCanvas from './components/DrawingCanvas'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import Toolbar from './components/Toolbar'
import OnboardingWizard, { buildProjectFromConfig } from './components/OnboardingWizard'
import { DEFAULT_MATERIALS } from './data/materials'
import { DEFAULT_INSULATIONS } from './data/insulations'
import { computeFlowDirections } from './utils/flowDirection'
import { buildFlowRows } from './utils/tableOrder'
import { computeNetworkFlows } from './utils/flowCalc'
import { computeThermal } from './utils/thermalCalc'
import ResultsTable from './components/ResultsTable'
import './App.css'

let _uid = 0
const uid = (p = 'x') => `${p}-${Date.now()}-${++_uid}`

const COL_LOCAL_OFFSET = 333
const LOCAL_W = 50, LOCAL_GAP = 10
const COL_PIPE_W = 320
const COL_SEP_DEFAULT = 160
const snapG = v => Math.round(v / 10) * 10

// ── Zone manipulation helpers ──────────────────────────

// Removes the x-range [xLeft, xRight] from xs/points/segments:
// vertices inside are clamped to xLeft, everything right shifts left by (xRight-xLeft).
// Does NOT touch the columns array.
function processZoneRemoval(columnXs, points, segments, xLeft, xRight) {
  const w = xRight - xLeft
  const s10 = v => Math.round(v / 10) * 10

  const newXs = columnXs.map(x => {
    if (x <= xLeft)  return x
    if (x >= xRight) return x - w
    return xLeft
  })

  const deletedIds = new Set(points.filter(p => p.x > xLeft && p.x < xRight).map(p => p.id))
  const basePoints = points
    .filter(p => !deletedIds.has(p.id))
    .map(p => p.x >= xRight ? { ...p, x: s10(p.x - w) } : p)

  const txV = v => {
    if (v.x <= xLeft)  return v
    if (v.x >= xRight) return { x: s10(v.x - w), y: v.y }
    return { x: xLeft, y: v.y }
  }

  let zc = 0
  const mkId = () => `zp-${Date.now()}-${zc++}`
  const extraPoints = [], processedSegs = []

  for (const seg of segments) {
    const sg = deletedIds.has(seg.startPointId)
    const eg = deletedIds.has(seg.endPointId)
    const raw   = seg.vertices.map(txV)
    const verts = raw.filter((v, i) => i === 0 || v.x !== raw[i-1].x || v.y !== raw[i-1].y)
    if (verts.length < 2) continue
    let sId = seg.startPointId, eId = seg.endPointId
    if (sg) { const np = { id: mkId(), x: verts[0].x, y: verts[0].y };                     extraPoints.push(np); sId = np.id }
    if (eg) { const np = { id: mkId(), x: verts[verts.length-1].x, y: verts[verts.length-1].y }; extraPoints.push(np); eId = np.id }
    if (sId === eId) continue
    processedSegs.push({ ...seg, vertices: verts, startPointId: sId, endPointId: eId })
  }

  const posMap = new Map(), mergeM = new Map()
  for (const pt of extraPoints) {
    const k = `${pt.x},${pt.y}`
    if (posMap.has(k)) mergeM.set(pt.id, posMap.get(k))
    else { posMap.set(k, pt.id); mergeM.set(pt.id, pt.id) }
  }
  const dedupExtra = extraPoints.filter(pt => mergeM.get(pt.id) === pt.id)
  const finalSegs  = processedSegs
    .map(s => ({ ...s,
      startPointId: mergeM.get(s.startPointId) ?? s.startPointId,
      endPointId:   mergeM.get(s.endPointId)   ?? s.endPointId,
    }))
    .filter(s => s.startPointId !== s.endPointId)

  return { newXs, newPoints: [...basePoints, ...dedupExtra], newSegments: finalSegs }
}

// Shifts everything at x >= xBoundary right by delta (used when a sep-zone expands).
function expandZone(project, xBoundary, delta) {
  const s10 = v => Math.round(v / 10) * 10
  return {
    ...project,
    columnXs: project.columnXs.map(x => x >= xBoundary ? x + delta : x),
    points:   project.points.map(pt => pt.x >= xBoundary ? { ...pt, x: s10(pt.x + delta) } : pt),
    segments: project.segments.map(seg => ({
      ...seg,
      vertices: seg.vertices.map(v => v.x >= xBoundary ? { x: s10(v.x + delta), y: v.y } : v),
    })),
  }
}

function removeGapColumn(project, gapIdx) {
  const xLeft  = project.columnXs[gapIdx]
  const xRight = project.columnXs[gapIdx + 1]
  if (xLeft === undefined || xRight === undefined || xRight <= xLeft) return project
  const { newXs, newPoints, newSegments } = processZoneRemoval(
    project.columnXs, project.points, project.segments, xLeft, xRight
  )
  // After zone removal xs[gapIdx] and xs[gapIdx+1] are both xLeft — remove the duplicate at gapIdx+1
  return {
    ...project,
    columns:   project.columns.filter((_, i) => i !== gapIdx),
    columnXs:  newXs.filter((_, i) => i !== gapIdx + 1),
    points:    newPoints,
    segments:  newSegments,
  }
}

function removeRegularColumn(project, idx) {
  const xLeft  = project.columnXs[idx]
  const xRight = project.columnXs[idx + 1]
  if (xLeft === undefined || xRight === undefined) return project
  const { newXs, newPoints, newSegments } = processZoneRemoval(
    project.columnXs, project.points, project.segments, xLeft, xRight
  )
  return {
    ...project,
    columns:  project.columns.filter((_, i) => i !== idx),
    columnXs: newXs.filter((_, i) => i !== idx + 1),
    points:   newPoints,
    segments: newSegments,
  }
}

// Moves an entire gap column from its current position to a new left boundary (finalLeft).
// 1. Removes old gaine zone (processZoneRemoval) — crossing segments shorten.
// 2. Inserts gaine at new position (expandZone) — crossing segments elongate.
function moveGaine(project, gapIdx, finalLeft) {
  const origLeft   = project.columnXs[gapIdx]
  const origRight  = project.columnXs[gapIdx + 1]
  const gaineWidth = origRight - origLeft
  const gapCol     = project.columns[gapIdx]

  if (Math.abs(finalLeft - origLeft) < 1) return project

  // Step 1 — remove old gaine zone
  const { newXs: xs1raw, newPoints: pts1, newSegments: segs1 } = processZoneRemoval(
    project.columnXs, project.points, project.segments, origLeft, origRight
  )
  const cols1 = project.columns.filter((_, i) => i !== gapIdx)
  const xs1   = xs1raw.filter((_, i) => i !== gapIdx + 1)   // drop duplicate entry

  // Step 2 — insertion point in post-removal coords
  const insertLeft = finalLeft <= origLeft ? finalLeft : finalLeft - gaineWidth

  // Step 3 — expand at insertLeft to create room for the gaine
  const state1 = { ...project, columns: cols1, columnXs: xs1, points: pts1, segments: segs1 }
  const state2  = expandZone(state1, insertLeft, gaineWidth)

  // Step 4 — re-insert gaine xs entry and column at the correct slot
  const fi = (() => {
    const idx = state2.columnXs.findIndex(x => x > insertLeft)
    return idx < 0 ? state2.columnXs.length : idx
  })()
  return {
    ...state2,
    columnXs: [...state2.columnXs.slice(0, fi), insertLeft, ...state2.columnXs.slice(fi)],
    columns:  [...state2.columns.slice(0, fi),  gapCol,     ...state2.columns.slice(fi)],
  }
}

// Removes a groupe point and all segments directly connected to it.
// Nodes at the other end of those segments are always kept.
function removeGroupeBranch(points, segments, groupePtId) {
  const branchSegIds = new Set(
    segments.filter(s => s.startPointId === groupePtId || s.endPointId === groupePtId).map(s => s.id)
  )
  return {
    points:   points.filter(p => p.id !== groupePtId),
    segments: segments.filter(s => !branchSegIds.has(s.id)),
  }
}

const DEFAULT_GLOBAL_PARAMS = {
  T_depart: 60, rho: 985, cp: 4180,
  T_amb_ss: 10, T_amb_other: 20, he: 10,
}

// 5 niveaux SS-1…R+3, du bas vers le haut
const DEFAULT_LEVELS = [
  { id: 'ss1', name: 'SS-1', isSousSol: true  },
  { id: 'rdc', name: 'RDC',  isSousSol: false },
  { id: 'r1',  name: 'R+1',  isSousSol: false },
  { id: 'r2',  name: 'R+2',  isSousSol: false },
  { id: 'r3',  name: 'R+3',  isSousSol: false },
]
// 6 valeurs (n+1) : lineYs[0]=fond SS-1, lineYs[5]=Toiture — espacement 210 px
const DEFAULT_LINE_YS = [1110, 900, 690, 480, 270, 80]

// 5 colonnes par défaut, 6 lignes verticales — espacement 320 px (largeur colonne)
const DEFAULT_COLUMNS = [
  { id: 'col1', name: 'Colonne 1', levelIds: 'all' },
  { id: 'col2', name: 'Colonne 2', levelIds: 'all' },
  { id: 'col3', name: 'Colonne 3', levelIds: 'all' },
  { id: 'col4', name: 'Colonne 4', levelIds: 'all' },
  { id: 'col5', name: 'Colonne 5', levelIds: 'all' },
]
const DEFAULT_COLUMN_XS = [200, 520, 840, 1160, 1480, 1800]

const DEFAULT_CHAUFFERIE = {
  placed: false,
  enabled: false,
  levelId: 'ss1',
  x1: 1190,
  x2: 1460,
  height: 150,
}

const DEFAULT_POINTS = []

function initProject() {
  return {
    globalParams: DEFAULT_GLOBAL_PARAMS,
    materials: DEFAULT_MATERIALS,
    insulations: DEFAULT_INSULATIONS,
    levels: DEFAULT_LEVELS,
    lineYs: DEFAULT_LINE_YS,
    columns: DEFAULT_COLUMNS,
    columnXs: DEFAULT_COLUMN_XS,
    chaufferie: DEFAULT_CHAUFFERIE,
    segments: [],
    points: DEFAULT_POINTS,
  }
}

// ── Undo/redo store ────────────────────────────────────
function useHistory(init) {
  const histRef  = useRef([init])
  const idxRef   = useRef(0)
  const [, bump] = useState(0)

  const project = histRef.current[idxRef.current]

  const setProject = useCallback((updater) => {
    const cur  = histRef.current[idxRef.current]
    const next = typeof updater === 'function' ? updater(cur) : updater
    const newHist = [...histRef.current.slice(0, idxRef.current + 1), next]
    histRef.current = newHist.length > 60 ? newHist.slice(-60) : newHist
    idxRef.current  = histRef.current.length - 1
    bump(n => n + 1)
  }, [])

  const undo = useCallback(() => {
    if (idxRef.current > 0) { idxRef.current--; bump(n => n + 1) }
  }, [])
  const redo = useCallback(() => {
    if (idxRef.current < histRef.current.length - 1) { idxRef.current++; bump(n => n + 1) }
  }, [])
  const canUndo = idxRef.current > 0
  const canRedo = idxRef.current < histRef.current.length - 1

  return { project, setProject, undo, redo, canUndo, canRedo }
}

export default function App() {
  const { project, setProject, undo, redo, canUndo, canRedo } = useHistory(initProject())
  const [onboardingDone, setOnboardingDone] = useState(false)
  const [fitViewRequest, setFitViewRequest] = useState(1)

  const handleWizardComplete = useCallback((config) => {
    setProject(buildProjectFromConfig(config))
    setOnboardingDone(true)
    setFitViewRequest(r => r + 1)
  }, [setProject])

  const handleWizardDismiss = useCallback(() => {
    setProject(p => ({
      ...p,
      materials:   p.materials.map(m => ({ ...m, enabled: false })),
      insulations: p.insulations.map(i => ({ ...i, enabled: false })),
    }))
    setOnboardingDone(true)
    setFitViewRequest(r => r + 1)
  }, [setProject])

  // Sens d'écoulement par tronçon — recalculé à chaque modification du réseau
  const flowDirections = useMemo(
    () => computeFlowDirections(project.segments, project.points),
    [project.segments, project.points]
  )

  // Débits/vitesses résolus par loi des nœuds
  const networkFlows = useMemo(
    () => computeNetworkFlows(project.segments, project.points, project.materials, flowDirections),
    [project.segments, project.points, project.materials, flowDirections]
  )

  // Températures et pertes thermiques propagées depuis la Production ECS
  const thermalResults = useMemo(
    () => computeThermal(
      project.segments, project.points, project.materials, project.insulations,
      flowDirections, networkFlows,
      project.levels, project.lineYs, project.globalParams
    ),
    [project.segments, project.points, project.materials, project.insulations,
     flowDirections, networkFlows, project.levels, project.lineYs, project.globalParams]
  )

  const { rows: flowRows, roleMap } = useMemo(
    () => buildFlowRows(project.segments, project.points, flowDirections,
      project.columns, project.columnXs, project.levels, project.lineYs),
    [project.segments, project.points, flowDirections,
     project.columns, project.columnXs, project.levels, project.lineYs]
  )

  const errorCount = useMemo(() => {
    const ptCount = new Map()
    for (const s of project.segments) {
      if (s.startPointId) ptCount.set(s.startPointId, (ptCount.get(s.startPointId) ?? 0) + 1)
      if (s.endPointId)   ptCount.set(s.endPointId,   (ptCount.get(s.endPointId)   ?? 0) + 1)
    }
    const conn = project.segments.filter(s => {
      const sc = (ptCount.get(s.startPointId) ?? 0) >= 2
      const ec = (ptCount.get(s.endPointId)   ?? 0) >= 2
      if ((sc ? 1 : 0) + (ec ? 1 : 0) > 1) return false
      // Les tronçons connectés à un groupe de puisage sont des bouts fermés — pas une erreur
      const startPt = project.points.find(p => p.id === s.startPointId)
      const endPt   = project.points.find(p => p.id === s.endPointId)
      return startPt?.type !== 'groupe' && endPt?.type !== 'groupe'
    }).length
    let flow = 0
    for (const [, v] of networkFlows) { if (v.hasError) flow++ }
    const hasAllerRetour = project.segments.some(s => s.type === 'aller' || s.type === 'retour')
    const hasProdECS     = project.points.some(p => p.type === 'productionECS')
    const missingProd    = hasAllerRetour && !hasProdECS ? 1 : 0
    return conn + flow + missingProd
  }, [project.segments, project.points, networkFlows])

  const [drawMode,           setDrawMode]           = useState('select')
  const [connHighlightIds,   setConnHighlightIds]   = useState([])
  const [groupesEditMode,    setGroupesEditMode]    = useState(false)
  const [showGroupeNames,    setShowGroupeNames]    = useState(false)
  const [canvasDisplay, setCanvasDisplay] = useState({ material: false, length: false, flowVelocity: false, insulation: false })
  const [showResultsTable, setShowResultsTable] = useState(false)
  const [tableHeight, setTableHeight] = useState(300)
  const tableHeightRef = useRef(0)
  tableHeightRef.current = tableHeight
  const [pipeType,           setPipeType]           = useState('aller')
  const [selectedIds,        setSelectedIds]        = useState([])
  const [panelOpen,          setPanelOpen]          = useState(true)
  const [editLevelsEnabled,    setEditLevelsEnabled]    = useState(false)
  const [editColumnsEnabled,   setEditColumnsEnabled]   = useState(false)
  const [editChaufferie,       setEditChaufferie]       = useState(false)
  const [placingEquipment,     setPlacingEquipment]     = useState(null)  // null | { type, name, rotation?, size }

  const [placingChaufferie,    setPlacingChaufferie]    = useState(false)
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

  const onAssignParam = useCallback((segId) => {
    update('segments', segs => segs.map(s => {
      if (s.id !== segId) return s
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

  // Updates columnXs (preview only during drag — no content changes for gaine boundaries).
  const handleColumnXsChange = useCallback((updater) => {
    setProject(p => {
      const oldXs = p.columnXs
      const newXs = typeof updater === 'function' ? updater(oldXs) : updater
      if (newXs === oldXs) return p

      // Identify the single changed index
      let changedIdx = -1
      for (let i = 0; i < Math.max(oldXs.length, newXs.length); i++) {
        if ((newXs[i] ?? 0) !== (oldXs[i] ?? 0)) {
          if (changedIdx >= 0) { changedIdx = -2; break }
          changedIdx = i
        }
      }

      // Column boundary drag: groupes in the adjacent column follow their left boundary.
      const groupeMoves = new Map()
      const newPoints = p.points.map(pt => {
        if (pt.type !== 'groupe') return pt
        const colIdx = p.columns.findIndex(c => c.id === pt.colId)
        if (colIdx < 0 || oldXs[colIdx] === undefined || newXs[colIdx] === undefined) return pt
        const leftDelta = newXs[colIdx] - oldXs[colIdx]
        if (leftDelta === 0) return pt
        const prevCol = colIdx > 0 ? p.columns[colIdx - 1] : null
        if (prevCol?.isGap) return pt
        const newPt = { ...pt, x: snapG(pt.x + leftDelta) }
        groupeMoves.set(pt.id, newPt.x - pt.x)
        return newPt
      })
      const newSegments = groupeMoves.size > 0
        ? p.segments.map(seg => {
            const sd = groupeMoves.get(seg.startPointId)
            const ed = groupeMoves.get(seg.endPointId)
            if (sd === undefined && ed === undefined) return seg
            const verts = [...seg.vertices]
            if (sd !== undefined) verts[0] = { x: verts[0].x + sd, y: verts[0].y }
            if (ed !== undefined) verts[verts.length - 1] = { x: verts[verts.length - 1].x + ed, y: verts[verts.length - 1].y }
            return { ...seg, vertices: verts }
          })
        : p.segments
      return { ...p, columnXs: newXs, points: newPoints, segments: newSegments }
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
      const at       = insertBeforeRightZone(cols)
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
      const at       = insertBeforeRightZone(cols)
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
      const k = existing.length
      const minSep = 23 + (k + 1) * (LOCAL_W + LOCAL_GAP)
      const currentSep = (p.columnXs[colIdx + 1] ?? p.columnXs[colIdx] + COL_PIPE_W) - p.columnXs[colIdx] - COL_PIPE_W
      let base = p
      if (currentSep < minSep) {
        const delta = minSep - currentSep
        base = expandZone(p, p.columnXs[colIdx + 1], delta)
      }
      const x1 = base.columnXs[colIdx]
      const newX = snapG(x1 + COL_LOCAL_OFFSET + k * (LOCAL_W + LOCAL_GAP) + LOCAL_W / 2)
      const yBot = p.lineYs[levelIdx]
      const yTop = p.lineYs[levelIdx + 1] ?? (p.lineYs[levelIdx] - 210)
      const newY = snapG((yBot + yTop) / 2)
      const newPt = { id: uid('grp'), type: 'groupe', name: '', showName: false, colId, levelId, x: newX, y: newY, isLocked: false }
      return { ...base, points: [...base.points, newPt] }
    })
  }, [setProject])

  const handleRemoveGroupe = useCallback((colId, levelId) => {
    setProject(p => {
      const existing = p.points.filter(pt => pt.type === 'groupe' && pt.colId === colId && pt.levelId === levelId)
      if (existing.length === 0) return p
      const toRemove = [...existing].sort((a, b) => a.x - b.x).at(-1)
      const colIdx = p.columns.findIndex(c => c.id === colId)

      // Remove the groupe point, its branch segment, and the first node if no type change
      const { points: newPoints, segments: newSegments } = removeGroupeBranch(
        p.points, p.segments, toRemove.id
      )

      if (colIdx < 0) return { ...p, points: newPoints, segments: newSegments }

      // Shrink the column sep zone if fewer groupes remain
      const maxCount = p.levels.reduce((mx, lvl) => {
        const cnt = newPoints.filter(pt => pt.type === 'groupe' && pt.colId === colId && pt.levelId === lvl.id).length
        return Math.max(mx, cnt)
      }, 0)
      const newRequiredSep = maxCount === 0 ? 0 : 23 + maxCount * (LOCAL_W + LOCAL_GAP)
      const currentSep = (p.columnXs[colIdx + 1] ?? p.columnXs[colIdx] + COL_PIPE_W) - p.columnXs[colIdx] - COL_PIPE_W
      if (currentSep <= newRequiredSep) return { ...p, points: newPoints, segments: newSegments }
      const xLeft  = p.columnXs[colIdx] + COL_PIPE_W + newRequiredSep
      const xRight = p.columnXs[colIdx + 1]
      const { newXs, newPoints: shrunkPts, newSegments: shrunkSegs } = processZoneRemoval(
        p.columnXs, newPoints, newSegments, xLeft, xRight
      )
      return { ...p, columnXs: newXs, points: shrunkPts, segments: shrunkSegs }
    })
  }, [setProject])


  // Combined atomic update (single undo entry)
  // After every network change, points with 0 segment connections are auto-removed
  // (except productionECS, groupe and locked points which are always kept).
  const updateNetwork = useCallback((segsFnOrVal, ptsFnOrVal) => {
    setProject(p => {
      const newSegs = typeof segsFnOrVal === 'function' ? segsFnOrVal(p.segments) : (segsFnOrVal ?? p.segments)
      const newPts  = typeof ptsFnOrVal  === 'function' ? ptsFnOrVal(p.points)   : (ptsFnOrVal  ?? p.points)
      const connected = new Set()
      for (const seg of newSegs) {
        if (seg.startPointId) connected.add(seg.startPointId)
        if (seg.endPointId)   connected.add(seg.endPointId)
      }
      const prunedPts = newPts.filter(pt =>
        connected.has(pt.id) || pt.type === 'productionECS' || pt.type === 'groupe' || pt.isLocked
      )
      return { ...p, segments: newSegs, points: prunedPts }
    })
  }, [setProject])

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
        setPlacingEquipment(null)
        setPlacingChaufferie(false)
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && editChaufferie) {
        update('chaufferie', DEFAULT_CHAUFFERIE)
        setEditChaufferie(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo, editChaufferie])

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

  const handleAddChaufferie = () => {
    setPlacingChaufferie(true)
  }

  const handleSave = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'projet-ecs.json' })
    a.click()
  }

  const handleLoad = () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' })
    input.onchange = e => {
      const reader = new FileReader()
      reader.onload = ev => {
        try { setProject(JSON.parse(ev.target.result)); setSelectedIds([]); setOnboardingDone(true) }
        catch { alert('Fichier invalide.') }
      }
      reader.readAsText(e.target.files[0])
    }
    input.click()
  }

  return (
    <div className="app">
      {!onboardingDone && <OnboardingWizard onComplete={handleWizardComplete} onDismiss={handleWizardDismiss} />}
      <header className="app-header">
        <div className="app-title">
          <span className="app-title-main">Bouclage ECS</span>
          <span className="app-title-sub">Note de calcul thermique</span>
        </div>
        <div className="header-actions">
          <button onClick={handleSave} className="btn btn-secondary">💾 Sauvegarder</button>
          <button onClick={handleLoad} className="btn btn-secondary">📂 Charger</button>
<button className="btn btn-success" disabled>📊 Export Excel</button>
        </div>
      </header>

      <Toolbar
        drawMode={drawMode} setDrawMode={setDrawMode}
        pipeType={pipeType} setPipeType={setPipeType}
        panelOpen={panelOpen || drawMode === 'editParams'}
        onTogglePanel={() => { if (drawMode !== 'editParams') setPanelOpen(o => !o) }}
        errorCount={errorCount}
        onShowErrors={() => { setDrawMode('errors'); setPanelOpen(true) }}
        chaufferie={project.chaufferie}
        editChaufferie={editChaufferie} onEditChaufferieChange={setEditChaufferie}
        onAddChaufferie={handleAddChaufferie}
        placingChaufferie={placingChaufferie}
        placingEquipment={placingEquipment}
        onAddProductionECS={handleAddProductionECS}
        onAddPump={handleAddPump}
      />

      <div className="app-body">
        <aside className={`sidebar-left ${(panelOpen || drawMode === 'editParams') ? '' : 'sidebar-closed'}`}>
          {(panelOpen || drawMode === 'editParams') && (
            <LeftPanel
              globalParams={project.globalParams}
              onGlobalParamsChange={v => update('globalParams', v)}
              levels={project.levels}
              lineYs={project.lineYs}
              onLevelsChange={v => update('levels', v)}
              onLineYsChange={v => update('lineYs', v)}
              editLevelsEnabled={editLevelsEnabled}
              onEditLevelsChange={setEditLevelsEnabled}
              materials={project.materials}
              onMaterialsChange={v => update('materials', typeof v === 'function' ? v(project.materials) : v)}
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
              editColumnsEnabled={editColumnsEnabled}
              onEditColumnsChange={setEditColumnsEnabled}
              chaufferie={project.chaufferie}
              onChaufferieChange={v => update('chaufferie', v)}
              segments={project.segments}
              points={project.points}
              networkFlows={networkFlows}
              drawMode={drawMode}
              editParam={editParam}
              onEditParamChange={setEditParam}
              canvasDisplay={canvasDisplay}
              onCanvasDisplayToggle={key => setCanvasDisplay(d => ({ ...d, [key]: !d[key] }))}
              onSelectIds={setSelectedIds}
              onConnHighlight={setConnHighlightIds}
              groupesEditMode={groupesEditMode} onGroupesEditModeChange={setGroupesEditMode}
              showGroupeNames={showGroupeNames} onShowGroupeNamesChange={setShowGroupeNames}
              onAddGroupe={handleAddGroupe} onRemoveGroupe={handleRemoveGroupe}
            />
          )}
        </aside>

        <div className="canvas-col">
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
            drawMode={drawMode}
            pipeType={pipeType}
            selectedIds={selectedIds}
            onSelectIds={setSelectedIds}
            editLevelsEnabled={editLevelsEnabled}
            editColumnsEnabled={editColumnsEnabled}
            columns={project.columns}
            columnXs={project.columnXs}
            onColumnXsChange={handleColumnXsChange}
            chaufferie={project.chaufferie}
            onChaufferieChange={v => update('chaufferie', v)}
            editChaufferie={editChaufferie}
            placingEquipment={placingEquipment}
            onPlacingDone={() => setPlacingEquipment(null)}
            placingChaufferie={placingChaufferie}
            onPlacingChaufferieDone={() => setPlacingChaufferie(false)}
            editParam={drawMode === 'editParams' ? editParam : null}
            onAssignParam={onAssignParam}
            connHighlightIds={connHighlightIds}
            onConnHighlight={setConnHighlightIds}
            networkFlows={networkFlows}
            groupesEditMode={groupesEditMode}
            showGroupeNames={showGroupeNames}
            canvasDisplay={canvasDisplay}
            materials={project.materials}
            insulations={project.insulations}
            fitViewRequest={fitViewRequest}
          />
        </main>

        {showResultsTable && (
          <div className="rt-resizer" onMouseDown={startTableResize} />
        )}
        {showResultsTable && (
          <ResultsTable
            height={tableHeight}
            rows={flowRows}
            roleMap={roleMap}
            segments={project.segments}
            points={project.points}
            materials={project.materials}
            insulations={project.insulations}
            levels={project.levels}
            lineYs={project.lineYs}
            columns={project.columns}
            columnXs={project.columnXs}
            chaufferie={project.chaufferie}
            flowDirections={flowDirections}
            networkFlows={networkFlows}
            thermalResults={thermalResults}
            globalParams={project.globalParams}
            selectedIds={selectedIds}
            onSelectIds={setSelectedIds}
            onSegmentUpdate={handleSegmentFieldUpdate}
          />
        )}

        <div className="rt-toggle-bar">
          <button className="rt-toggle-btn" onClick={() => setShowResultsTable(v => !v)}>
            {showResultsTable ? '▼ Masquer les résultats' : '▲ Afficher les résultats'}
          </button>
        </div>

        </div>{/* canvas-col */}

        <aside className={`sidebar-right${selectedIds.length === 0 && !editChaufferie ? ' sidebar-right-closed' : ''}`}>
          <RightPanel
            selectedIds={selectedIds}
            segments={project.segments}
            points={project.points}
            onUpdate={updateElement}
            materials={project.materials}
            insulations={project.insulations}
            levels={project.levels}
            lineYs={project.lineYs}
            columns={project.columns}
            columnXs={project.columnXs}
            chaufferie={project.chaufferie}
            onChaufferieChange={v => update('chaufferie', v)}
            editChaufferie={editChaufferie}
            flowDirections={flowDirections}
            networkFlows={networkFlows}
            globalParams={project.globalParams}
            thermalResults={thermalResults}
            roleMap={roleMap}
          />
        </aside>
      </div>
    </div>
  )
}
