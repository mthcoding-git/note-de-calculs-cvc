import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import DrawingCanvas from './components/DrawingCanvas'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import Toolbar from './components/Toolbar'
import VariantBar from './components/VariantBar'
import { CalcFluidTabs, getAutoCalcId, getCalcLabel, getFluidLabel, getNetworkLabel } from './components/CalcSelector'
import NetworkSetupCard from './components/NetworkSetupCard'
import { DEFAULT_MATERIALS } from './data/materials'
import { DEFAULT_INSULATIONS } from './data/insulations'
import { computeFlowDirections, computeFlowDirectionsEF } from './utils/flowDirection'
import { buildFlowRows, buildFlowRowsEF } from './utils/tableOrder'
import { computeNetworkFlows } from './utils/flowCalc'
import { computeThermal } from './utils/thermalCalc'
import { computeAlimentationResults } from './utils/alimentationCalc'
import ResultsTable from './components/ResultsTable'
import './App.css'

let _uid = 0
const uid = (p = 'x') => `${p}-${Date.now()}-${++_uid}`

const COL_LOCAL_OFFSET = 333
const LOCAL_W = 60, LOCAL_GAP = 10
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

// Adjusts (or removes) the PP zone for a column after group deletion.
// Uses max(internalId) across remaining groups to determine the required width.
function adjustPPZone(p, colId, newPoints, newSegments) {
  const remainingGroups = newPoints.filter(pt => pt.type === 'groupe' && pt.colId === colId)
  const ppIdx = p.columns.findIndex(c => c.isPPZone && c.colId === colId)
  if (remainingGroups.length === 0) {
    if (ppIdx >= 0) {
      const xLeft  = p.columnXs[ppIdx]
      const xRight = p.columnXs[ppIdx + 1]
      const { newXs, newPoints: pts2, newSegments: segs2 } = processZoneRemoval(
        p.columnXs, newPoints, newSegments, xLeft, xRight
      )
      const newColumns = p.columns.filter(c => c.id !== p.columns[ppIdx].id)
      const dedupXs = newXs.filter((x, i) => i === 0 || x !== newXs[i - 1])
      return { ...p, columns: newColumns, columnXs: dedupXs, points: pts2, segments: segs2 }
    }
    return { ...p, points: newPoints, segments: newSegments }
  }
  if (ppIdx >= 0) {
    const maxId = Math.max(...remainingGroups.map(g => g.internalId ?? 1))
    const newPPWidth = 23 + maxId * (LOCAL_W + LOCAL_GAP)
    const ppRight = p.columnXs[ppIdx + 1]
    const currentPPWidth = ppRight - p.columnXs[ppIdx]
    const shrinkAmount = currentPPWidth - newPPWidth
    if (shrinkAmount > 0) {
      const { newXs, newPoints: pts2, newSegments: segs2 } = processZoneRemoval(
        p.columnXs, newPoints, newSegments, ppRight - shrinkAmount, ppRight
      )
      return { ...p, columnXs: newXs, points: pts2, segments: segs2 }
    }
  }
  return { ...p, points: newPoints, segments: newSegments }
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

const DEFAULT_ALIMENTATION_PARAMS = {
  buildingType: 'habitation',
  appareils: [
    { id: 'evier',         name: 'Évier',                          qBase: 0.20, k: 2.5,  enabled: false },
    { id: 'lavabo',        name: 'Lavabo',                         qBase: 0.20, k: 1.5,  enabled: false },
    { id: 'bidet',         name: 'Bidet',                          qBase: 0.20, k: 1.0,  enabled: false },
    { id: 'baignoire',     name: 'Baignoire ≤ 150 L',            qBase: 0.33, k: 3.0,  enabled: false },
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

// Migration : remplit k et qBase manquants si les données stockées sont dans l'ancien format
const _defMap = Object.fromEntries(DEFAULT_ALIMENTATION_PARAMS.appareils.map(a => [a.id, a]))
function resolveAlimentationParams(raw) {
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

const CANVAS_DISPLAY_RESET = { nomTroncon: false, length: false, material: false, dn: false, insulation: false, debit: false, vitesse: false, temperatureNoeud: false, deltaT: false, equipment: false }

function buildFluidSetupProject(nSousSol, nFloors, nCols) {
  const levels = []
  for (let i = nSousSol; i >= 1; i--)
    levels.push({ id: `ss${i}`, name: `SS-${i}`, isSousSol: true })
  for (let i = 0; i < nFloors; i++)
    levels.push({ id: i === 0 ? 'rdc' : `r${i}`, name: i === 0 ? 'RDC' : `R+${i}`, isSousSol: false })
  const nLevels = levels.length
  const lineYs  = Array.from({ length: nLevels + 1 }, (_, i) => 80 + (nLevels - i) * 210)
  const columns = Array.from({ length: nCols }, (_, i) => ({
    id: `col${i + 1}`, name: `Colonne ${i + 1}`, levelIds: 'all',
  }))
  const columnXs = Array.from({ length: nCols + 1 }, (_, i) => 200 + i * 320)
  return { ...initProject(), levels, lineYs, columns, columnXs }
}

function initProject() {
  return {
    globalParams: DEFAULT_GLOBAL_PARAMS,
    alimentationParams: DEFAULT_ALIMENTATION_PARAMS,
    materials: DEFAULT_MATERIALS,
    insulations: DEFAULT_INSULATIONS,
    levels: DEFAULT_LEVELS,
    lineYs: DEFAULT_LINE_YS,
    columns: DEFAULT_COLUMNS,
    columnXs: DEFAULT_COLUMN_XS,
    chaufferie: DEFAULT_CHAUFFERIE,
    segments: [],
    points: DEFAULT_POINTS,
    valves: [],
  }
}

// ── Undo/redo + variants store ─────────────────────────
function useVariantHistory() {
  const INIT_ID = 'v0'
  // Per-variant undo stacks — never serialized, reset on load
  const histRef = useRef<Record<string, { stack: any[], idx: number }>>({ [INIT_ID]: { stack: [buildFluidSetupProject(1, 3, 3)], idx: 0 } })

  const [meta,        setMeta]        = useState([{ id: INIT_ID, name: '', isBase: true }])
  const [activeId,    setActiveId]    = useState(INIT_ID)
  const [projectName, setProjectName] = useState('')
  const [, bump] = useState(0)

  // Refs so save callbacks never capture stale state
  const metaRef        = useRef(meta)
  const activeIdRef    = useRef(activeId)
  const projectNameRef = useRef(projectName)
  useEffect(() => { metaRef.current = meta },        [meta])
  useEffect(() => { activeIdRef.current = activeId },    [activeId])
  useEffect(() => { projectNameRef.current = projectName }, [projectName])

  // Sync new DEFAULT_MATERIALS entries into all in-memory variants on mount
  useEffect(() => {
    let changed = false
    Object.values(histRef.current).forEach(hist => {
      const data = hist.stack[hist.idx]
      if (!Array.isArray(data?.materials)) return
      const existingIds = new Set(data.materials.map(m => m.id))
      const missing = DEFAULT_MATERIALS.filter(m => !existingIds.has(m.id))
      if (missing.length === 0) return
      hist.stack[hist.idx] = { ...data, materials: [...data.materials, ...missing] }
      changed = true
    })
    if (changed) bump(b => b + 1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeHist = () => histRef.current[activeId]
  const project = activeHist()?.stack[activeHist().idx] ?? initProject()

  const setProject = useCallback((updater) => {
    const h = histRef.current[activeId]
    if (!h) return
    const next = typeof updater === 'function' ? updater(h.stack[h.idx]) : updater
    const stack = [...h.stack.slice(0, h.idx + 1), next]
    h.stack = stack.length > 60 ? stack.slice(-60) : stack
    h.idx   = h.stack.length - 1
    bump(n => n + 1)
  }, [activeId])

  // Patches current history entry in-place — does NOT push a new undo step.
  // Used by auto-corrections (frontier splits, productionECS snap) so they
  // don't pollute the undo stack and don't fight with Ctrl+Z.
  const patchProject = useCallback((updater) => {
    const h = histRef.current[activeId]
    if (!h) return
    const next = typeof updater === 'function' ? updater(h.stack[h.idx]) : updater
    h.stack[h.idx] = next
    bump(n => n + 1)
  }, [activeId])

  // Replaces active variant data entirely and clears its undo stack
  const resetProject = useCallback((data) => {
    const h = histRef.current[activeId]
    if (!h) return
    h.stack = [data]; h.idx = 0
    bump(n => n + 1)
  }, [activeId])

  const undo = useCallback(() => {
    const h = histRef.current[activeId]
    if (h && h.idx > 0) { h.idx--; bump(n => n + 1) }
  }, [activeId])

  const redo = useCallback(() => {
    const h = histRef.current[activeId]
    if (h && h.idx < h.stack.length - 1) { h.idx++; bump(n => n + 1) }
  }, [activeId])

  const canUndo = (activeHist()?.idx ?? 0) > 0
  const canRedo = (activeHist()?.idx ?? 0) < (activeHist()?.stack.length ?? 1) - 1

  const switchVariant = useCallback((id) => { setActiveId(id) }, [])

  const duplicateVariant = useCallback((sourceId) => {
    const sourceH = histRef.current[sourceId]
    if (!sourceH) return
    const copy  = JSON.parse(JSON.stringify(sourceH.stack[sourceH.idx]))
    const newId = uid('v')
    histRef.current[newId] = { stack: [copy], idx: 0 }
    setMeta(prev => {
      const n = prev.filter(v => !v.isBase).length
      setActiveId(newId)
      bump(b => b + 1)
      return [...prev, { id: newId, name: '', isBase: false }]
    })
  }, [])

  const deleteVariant = useCallback((id) => {
    setMeta(prev => {
      if (prev.length <= 1) return prev
      const v = prev.find(m => m.id === id)
      if (!v || v.isBase) return prev
      delete histRef.current[id]
      const remaining = prev.filter(m => m.id !== id)
      setActiveId(cur => {
        if (cur !== id) return cur
        return remaining.find(m => m.isBase)?.id ?? remaining[0]?.id ?? cur
      })
      bump(b => b + 1)
      return remaining
    })
  }, [])

  // Suppression de l'état de référence.
  // Retourne 'promoted' si la variante 1 a été promue, 'last' si c'était le seul état.
  const deleteBaseVariant = useCallback((): 'promoted' | 'last' => {
    const currentMeta = metaRef.current
    const base = currentMeta.find(m => m.isBase)
    if (!base) return 'last'
    if (currentMeta.length <= 1) return 'last'
    // Promouvoir la première variante non-base
    delete histRef.current[base.id]
    const remaining = currentMeta.filter(m => !m.isBase)
    const [newBase, ...rest] = remaining
    const next = [{ ...newBase, isBase: true }, ...rest]
    setMeta(next)
    setActiveId(newBase.id)
    bump(b => b + 1)
    return 'promoted'
  }, [])

  const renameVariant  = useCallback((id, name) => setMeta(prev => prev.map(m => m.id === id ? { ...m, name } : m)), [])
  const setBaseVariant = useCallback((id) => {
    setMeta(prev => {
      const v = prev.find(m => m.id === id)
      if (!v) return prev
      const others = prev.filter(m => m.id !== id).map(m => ({ ...m, isBase: false }))
      return [{ ...v, isBase: true }, ...others]
    })
  }, [])
  const reorderVariant = useCallback((fromIdx, toIdx) => {
    if (fromIdx === toIdx || fromIdx === 0 || toIdx === 0) return
    setMeta(prev => {
      const next = [...prev]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      return next
    })
  }, [])

  const getFullState = useCallback(() => ({
    version: 2,
    projectName:     projectNameRef.current,
    activeVariantId: activeIdRef.current,
    variants: metaRef.current.map(m => ({
      id: m.id, name: m.name, isBase: m.isBase,
      data: histRef.current[m.id]?.stack[histRef.current[m.id].idx] ?? initProject()
    }))
  }), [])

  const loadState = useCallback((state) => {
    let variants = state.version === 2 && Array.isArray(state.variants)
      ? state.variants
      : [{ id: 'v0', name: '', isBase: true, data: state }]
    if (!variants.some(v => v.isBase)) variants[0] = { ...variants[0], isBase: true }
    // Migrate old projects: convert ppZoneWidth columns to the PP zone gap column architecture
    variants = variants.map(v => {
      const data = v.data
      if (!data?.columns) return v
      const hasPPZone = data.columns.some(c => c.isPPZone)
      if (hasPPZone) return v  // already migrated
      let newColumns = []
      let newColumnXs = [...(data.columnXs ?? [])]
      let insertOffset = 0
      ;(data.columns ?? []).forEach((col, origIdx) => {
        const adjIdx = origIdx + insertOffset
        const ppW = col.ppZoneWidth ?? 0
        newColumns.push({ ...col, ppZoneWidth: undefined })
        if (!col.isGap && ppW > 0) {
          const hasGroupe = (data.points ?? []).some(p => p.type === 'groupe' && p.colId === col.id)
          if (hasGroupe) {
            const x2 = newColumnXs[adjIdx + 1]
            const ppLeft = x2 - ppW
            newColumnXs.splice(adjIdx + 1, 0, ppLeft)
            newColumns.push({ id: uid('ppz'), isGap: true, isPPZone: true, colId: col.id, levelIds: 'all' })
            insertOffset++
          }
        }
      })
      return { ...v, data: { ...data, columns: newColumns, columnXs: newColumnXs } }
    })
    // Migrate materials: add any new DEFAULT_MATERIALS entries missing from saved state
    variants = variants.map(v => {
      const data = v.data
      if (!Array.isArray(data?.materials)) return v
      const existingIds = new Set(data.materials.map(m => m.id))
      const missing = DEFAULT_MATERIALS.filter(m => !existingIds.has(m.id))
      if (missing.length === 0) return v
      return { ...v, data: { ...data, materials: [...data.materials, ...missing] } }
    })
    histRef.current = Object.fromEntries(variants.map(v => [v.id, { stack: [v.data], idx: 0 }])) as Record<string, { stack: any[], idx: number }>
    setMeta(variants.map(({ id, name, isBase }) => ({ id, name, isBase: !!isBase })))
    setActiveId(state.activeVariantId ?? variants[0].id)
    setProjectName(state.projectName ?? 'Projet ECS')
    bump(b => b + 1)
  }, [])

  return {
    project, setProject, patchProject, resetProject, undo, redo, canUndo, canRedo,
    meta, activeId, projectName, setProjectName,
    switchVariant, duplicateVariant, deleteVariant, deleteBaseVariant, renameVariant, setBaseVariant, reorderVariant,
    getFullState, loadState,
  }
}

export default function App() {
  const {
    project, setProject, patchProject, resetProject, undo, redo, canUndo, canRedo,
    meta, activeId, projectName, setProjectName,
    switchVariant, duplicateVariant, deleteVariant, deleteBaseVariant, renameVariant, setBaseVariant, reorderVariant,
    getFullState, loadState,
  } = useVariantHistory()

  const [editingProjName,   setEditingProjName]   = useState(false)
  const [activeFluidId,     setActiveFluidId]     = useState(null)
  const [activeCalcId,      setActiveCalcId]      = useState(null)
  const [fitViewRequest, setFitViewRequest] = useState(1)

  // Sauvegarde d'état par type de réseau : fluidId → { state, calcId }
  const fluidStashRef = useRef(new Map())

  const [pendingSetup, setPendingSetup] = useState(true)

  // Sens d'écoulement par tronçon — recalculé à chaque modification du réseau
  const flowDirections = useMemo(
    () => activeCalcId === 'alimentation-ef'
      ? computeFlowDirectionsEF(project.segments, project.points)
      : computeFlowDirections(project.segments, project.points),
    [project.segments, project.points, activeCalcId]
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

  const alimentationResults = useMemo(
    () => computeAlimentationResults(
      project.segments, project.points,
      resolveAlimentationParams(project.alimentationParams),
      flowDirections
    ),
    [project.segments, project.points, project.alimentationParams, flowDirections]
  )

  const { rows: flowRows, roleMap } = useMemo(
    () => buildFlowRows(project.segments, project.points, flowDirections,
      project.columns, project.columnXs, project.levels, project.lineYs, activeCalcId),
    [project.segments, project.points, flowDirections,
     project.columns, project.columnXs, project.levels, project.lineYs, activeCalcId]
  ) as { rows: any[], roleMap: Map<any, any> }

  const efFlowRowsArr = useMemo(
    () => activeCalcId !== 'alimentation-ef' ? null : buildFlowRowsEF(
      project.segments, project.points, flowDirections,
      project.columns, project.columnXs, project.levels, project.lineYs
    ),
    [activeCalcId, project.segments, project.points, flowDirections,
     project.columns, project.columnXs, project.levels, project.lineYs]
  )

  // RoleMap fusionné pour EF (plusieurs sources)
  const effectiveRoleMap = useMemo(() => {
    if (activeCalcId !== 'alimentation-ef' || !efFlowRowsArr) return roleMap
    const merged = new Map()
    for (const { roleMap: rm } of efFlowRowsArr) {
      for (const [id, role] of rm) merged.set(id, role)
    }
    return merged
  }, [activeCalcId, efFlowRowsArr, roleMap])

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
      const startPt = project.points.find(p => p.id === s.startPointId)
      const endPt   = project.points.find(p => p.id === s.endPointId)
      // Groupes de puisage et arrivées EF sont des bouts fermés — pas une erreur
      const isSpecial = t => t === 'groupe' || t === 'arriveeEF'
      return !isSpecial(startPt?.type) && !isSpecial(endPt?.type)
    }).length
    let flow = 0
    for (const [, v] of networkFlows) { if (v.hasError) flow++ }
    const hasAllerSegs   = project.segments.some(s => s.type === 'aller')
    const hasAllerRetour = project.segments.some(s => s.type === 'aller' || s.type === 'retour')
    const hasProdECS     = project.points.some(p => p.type === 'productionECS')
    const hasArriveeEF   = project.points.some(p => p.type === 'arriveeEF')
    const missingProd    = activeCalcId === 'alimentation-ef'
      ? (hasAllerSegs && !hasArriveeEF ? 1 : 0)
      : (hasAllerRetour && !hasProdECS ? 1 : 0)
    return conn + flow + missingProd
  }, [project.segments, project.points, networkFlows, activeCalcId])

  const [drawMode,           setDrawMode]           = useState('select')
  const [connHighlightIds,   setConnHighlightIds]   = useState([])
  const [groupesEditMode,    setGroupesEditMode]    = useState(false)
  const [showGroupeNames,    setShowGroupeNames]    = useState(false)
  const [canvasDisplay, setCanvasDisplay] = useState(CANVAS_DISPLAY_RESET)
  const [showResultsTable, setShowResultsTable] = useState(false)
  const [tableHeight, setTableHeight] = useState(300)
  const tableHeightRef = useRef(0)
  tableHeightRef.current = tableHeight
  const [pipeType,           setPipeType]           = useState('aller')
  const [selectedIds,        setSelectedIds]        = useState([])
  const [selectedValveId,    setSelectedValveId]    = useState(null)
  const [panelOpen,          setPanelOpen]          = useState(false)
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

  const handleSelectIds = useCallback((ids) => {
    setSelectedIds(ids)
    setSelectedValveId(null)
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

    if (stashed) {
      // Fluide déjà visité → restaurer son état
      loadState({ ...stashed.state, projectName })
      setActiveCalcId(resolvedCalcId ?? stashed.calcId)
      setPendingSetup(false)
    } else if (currentFullState) {
      // Nouveau fluide, mais une grille existe déjà → hériter de la structure, réseau vide, pas de setup
      const baseData = currentFullState.variants?.find(v => v.isBase)?.data ?? initProject()

      // Première fois qu'on bascule entre deux modes alimentation (ECS ↔ EF) :
      // copier les groupes de puisage et les paramètres d'appareils.
      const isAlimSwitch =
        (activeFluidId === 'ecs' && fluidId === 'ef' && activeCalcId === 'alimentation-ecs') ||
        (activeFluidId === 'ef' && fluidId === 'ecs' && activeCalcId === 'alimentation-ef')

      const inheritedData = {
        ...initProject(),
        levels:   baseData.levels,
        lineYs:   baseData.lineYs,
        columns:  baseData.columns,
        columnXs: baseData.columnXs,
        ...(isAlimSwitch ? {
          alimentationParams: baseData.alimentationParams,
          points: (baseData.points ?? []).filter(p => p.type === 'groupe'),
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
      setPanelOpen(true)
    } else {
      // Tout premier fluide — la grille est déjà prévisualisée dans le canvas, on garde l'état courant
      setActiveCalcId(resolvedCalcId)
      setPendingSetup(true)
      setPanelOpen(false)
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
    setPanelOpen(true)
    setFitViewRequest(r => r + 1)
  }, [])

  const FLUID_FALLBACKS: Record<string, string[]> = {
    'ecs':      ['ef', 'chauffage'],
    'ef':       ['ecs', 'chauffage'],
    'chauffage': ['ecs', 'ef'],
  }

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
        setPanelOpen(true)
      } else {
        // Aucun autre réseau — retour à l'écran de lancement
        setActiveFluidId(null)
        setActiveCalcId(null)
        setPendingSetup(true)
        setPanelOpen(false)
      }

      setSelectedIds([])
      setDrawMode('select')
    }
  }, [deleteBaseVariant, activeFluidId, loadState, projectName])

  const handleCalcChange = useCallback((id) => {
    if (!activeCalcId && !pendingSetup) setPanelOpen(true)
    setActiveCalcId(id)
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
      const { points: newPoints, segments: newSegments } = removeGroupeBranch(p.points, p.segments, toRemove.id)
      return adjustPPZone(p, colId, newPoints, newSegments)
    })
  }, [setProject])

  const handleRemoveGroupeById = useCallback((ptId) => {
    setProject(p => {
      const toRemove = p.points.find(pt => pt.id === ptId && pt.type === 'groupe')
      if (!toRemove) return p
      const { points: newPoints, segments: newSegments } = removeGroupeBranch(p.points, p.segments, ptId)
      return adjustPPZone(p, toRemove.colId, newPoints, newSegments)
    })
  }, [setProject])


  const isSpecialPt = (pt) =>
    pt.type === 'productionECS' || pt.type === 'arriveeEF' || pt.type === 'groupe' || pt.isLocked

  // Combined atomic update (single undo entry)
  // After every network change, points with 0 segment connections are auto-removed
  // (except productionECS, arriveeEF, groupe and locked points which are always kept).
  const updateNetwork = useCallback((segsFnOrVal, ptsFnOrVal) => {
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
      const prunedValves = (p.valves ?? []).filter(v => segIds.has(v.segmentId))
      return { ...p, segments: newSegs, points: prunedPts, valves: prunedValves }
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
      return { ...p, segments: newSegs, points: prunedPts, valves: prunedValves }
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

  const handleAddArriveeEF = () => {
    const existing = project.points.filter(p => p.type === 'arriveeEF')
    const name = existing.length === 0 ? 'Arrivée EF' : `Arrivée EF n°${existing.length + 1}`
    setPlacingEquipment({ type: 'arriveeEF', name, size: { w: 44, h: 28 } })
  }

  const handleAddChaufferie = () => {
    setPlacingChaufferie(true)
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
                title="Cliquer pour renommer"
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
                onRename={renameVariant}
                onSetBase={setBaseVariant}
                onReorder={reorderVariant}
              />
              <div className="app-hd-sep" />
              <div className="calc-sub-pills">
                <button className="calc-sub-pill active">Dimensionnement</button>
                <button className="calc-sub-pill soon" title="À venir">Pertes de charge</button>
              </div>
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
        panelOpen={!pendingSetup && (panelOpen || drawMode === 'editParams')}
        onTogglePanel={() => {
          if (drawMode === 'editParams') { setDrawMode('select'); setPanelOpen(true) }
          else setPanelOpen(o => !o)
        }}
        errorCount={errorCount}
        onShowErrors={() => { setDrawMode('errors'); setPanelOpen(true) }}
        chaufferie={project.chaufferie}
        editChaufferie={editChaufferie} onEditChaufferieChange={setEditChaufferie}
        onAddChaufferie={handleAddChaufferie}
        placingChaufferie={placingChaufferie}
        placingEquipment={placingEquipment}
        onAddProductionECS={handleAddProductionECS}
        hasProductionECS={project.points.some(p => p.type === 'productionECS')}
        onAddArriveeEF={handleAddArriveeEF}
        onAddPump={handleAddPump}
        canvasDisplay={canvasDisplay}
        onCanvasDisplayToggle={key => setCanvasDisplay(d => ({ ...d, [key]: !d[key] }))}
        activeFluidId={activeFluidId}
        activeCalcId={pendingSetup ? null : activeCalcId}
      />

      <div className="app-body">
        <aside className={`sidebar-left${pendingSetup || (!pendingSetup && (panelOpen || drawMode === 'editParams')) ? '' : ' sidebar-closed'}${pendingSetup ? ' sidebar-no-transition' : ''}`}>
          {pendingSetup ? (
            <NetworkSetupCard
              fluidLabel={activeFluidId ? getFluidLabel(activeFluidId) : null}
              calcLabel={activeCalcId ? getCalcLabel(activeCalcId) : null}
              onPreview={handlePreviewUpdate}
              onComplete={handleSetupComplete}
            />
          ) : (!pendingSetup && (panelOpen || drawMode === 'editParams')) && (
            <LeftPanel
              activeCalcId={activeCalcId}
              globalParams={project.globalParams}
              onGlobalParamsChange={v => update('globalParams', v)}
              alimentationParams={resolveAlimentationParams(project.alimentationParams)}
              onAlimentationParamsChange={v => update('alimentationParams', v)}
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
              segments={project.segments}
              points={project.points}
              networkFlows={networkFlows}
              drawMode={drawMode}
              editParam={editParam}
              onEditParamChange={setEditParam}
              onSelectIds={setSelectedIds}
              onConnHighlight={setConnHighlightIds}
              groupesEditMode={groupesEditMode} onGroupesEditModeChange={setGroupesEditMode}
              showGroupeNames={showGroupeNames} onShowGroupeNamesChange={setShowGroupeNames}
              onAddGroupe={handleAddGroupe} onRemoveGroupe={handleRemoveGroupe}
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
            editLevelsEnabled={editLevelsEnabled}
            editColumnsEnabled={editColumnsEnabled}
            columns={project.columns}
            columnXs={project.columnXs}
            onColumnXsChange={handleColumnXsChange}
            onPPZoneDrag={handlePPZoneDrag}
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
            flowDirections={flowDirections}
            groupesEditMode={groupesEditMode}
            onRemoveGroupeById={handleRemoveGroupeById}
            showGroupeNames={showGroupeNames}
            canvasDisplay={canvasDisplay}
            roleMap={effectiveRoleMap}
            materials={project.materials}
            insulations={project.insulations}
            alimentationParams={resolveAlimentationParams(project.alimentationParams)}
            activeCalcId={activeCalcId}
            thermalResults={thermalResults}
            alimentationResults={alimentationResults}
            fitViewRequest={fitViewRequest}
            valves={project.valves ?? []}
            onValvesChange={v => update('valves', typeof v === 'function' ? v(project.valves ?? []) : v)}
            selectedValveId={selectedValveId}
            onSelectedValveChange={id => { setSelectedValveId(id); if (id) setSelectedIds([]) }}
          />
        </main>

        {!pendingSetup && showResultsTable && (
          <div className="rt-resizer" onMouseDown={startTableResize} />
        )}
        {!pendingSetup && showResultsTable && (
          <ResultsTable
            height={tableHeight}
            rows={flowRows}
            roleMap={roleMap}
            efFlowRowsArr={efFlowRowsArr}
            activeCalcId={activeCalcId}
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
            alimentationResults={alimentationResults}
            globalParams={project.globalParams}
            selectedIds={selectedIds}
            onSelectIds={setSelectedIds}
          />
        )}

        {!pendingSetup && activeCalcId && (
          <div className="rt-toggle-bar">
            <button className="rt-toggle-btn" onClick={() => setShowResultsTable(v => !v)}>
              {showResultsTable ? '▼ Masquer les résultats' : '▲ Afficher les résultats'}
            </button>
          </div>
        )}

        </div>{/* canvas-col */}

        <aside className={`sidebar-right${(pendingSetup || (selectedIds.length === 0 && !editChaufferie && !selectedValveId)) ? ' sidebar-right-closed' : ''}`}>
          <RightPanel
            selectedIds={selectedIds}
            segments={project.segments}
            points={project.points}
            onUpdate={updateElement}
            materials={project.materials}
            insulations={project.insulations}
            activeCalcId={activeCalcId}
            alimentationParams={resolveAlimentationParams(project.alimentationParams)}
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
            alimentationResults={alimentationResults}
            roleMap={roleMap}
            drawMode={drawMode}
            onExitEditParams={() => setDrawMode('select')}
            selectedValveId={selectedValveId}
            valves={project.valves ?? []}
            onValveUpdate={handleValveUpdate}
          />
        </aside>
      </div>
    </div>
  )
}
