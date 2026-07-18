import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import type { CalcMode, DisplayPrefs } from '../types'
import { DEFAULT_DISPLAY_PREFS } from '../utils/projectBuilder'
import { getDisplayName } from '../utils/naming'
import { getModeFlags } from '../utils/calcModeFlags'
import { EMETTEUR_TYPES } from '../data/emetteurs'
import { TERMINAL_FROID_TYPES } from '../data/terminauxFroids'
import { sf } from '../utils/fmt'
import { AccessorySymbol } from './AccessorySymbol'
import { uid } from '../utils/idGen'
import { findLevelIndexAt } from '../utils/levelUtils'
import {
  SNAP, HIT,
  snap, dist, ortho, toCanvas, ptInRect, segInRect,
  closestTOnPolyline, positionFromT, polylineLen,
  nameValve, nearestOnSegments, getDragConstraint, deleteNodeFromNetwork,
  getSegmentDir, collapseCollinear, collapseSegs, elbowVertices,
  computeSegDeltaLimits, mergeCoincidentNodes, computeSegMove, computeNodeMove,
  getFrontierYs, applyFrontierSplits, applySpecialPtSnap,
} from '../utils/canvasGeometry'

const PT_R       = 4
const PT_HIT     = 10    // point click/snap radius
const DRAW_SNAP  = 14    // snap-to-point radius during drawing
const ZOOM_F     = 1.12

const EQUIP_ABBR = {
  evier: 'EV', lavabo: 'LB', bidet: 'BD', baignoire: 'BG', douche: 'DU',
  poste_12: 'R½', poste_34: 'R¾', wc_reservoir: 'WC', wc_robinet: 'WCR',
  urinoir_ind: 'UR', urinoir_siph: 'US', lave_mains: 'LM', bac_laver: 'BL',
  machine_linge: 'LL', machine_vaiss: 'LV',
}






// Accessories that connect to the pipe via a perpendicular stem (not in-line)
const ACC_WITH_STEM = new Set(['thermometre', 'manometre', 'purgeur_air', 'vase_expansion', 'ballon_anti_belier'])
// Directional inline accessories: arrows and perpendicular elements follow flow direction
const ACC_FLIP_Y = new Set(['clapet_anti_retour', 'disconnecteur', 'filtre_y', 'robinet_vidange'])
// Gravity-aware inline accessories: perpendicular element always goes upper/right,
// independent of flow direction (spring up on horizontal, right on vertical)
const ACC_GRAVITY_FLIP = new Set(['reducteur_pression'])
const ACC_STEM_V      = 4   // vertical stem length (gap between pipe and symbol bottom)
const ACC_STEM_H      = 8   // horizontal stem length (vertical pipes only)
// Distance from symbol center to its bottom visual edge (varies per symbol)
const ACC_SYM_BOTTOM: Record<string, number> = {
  thermometre:      8,    // bulbe cy=4.5 + r=3.5
  purgeur_air:      4.5,  // rect body bottom at y=4.5
  manometre:        6.5,  // circle r=6.5
  vase_expansion:   6.5,  // circle r=6.5
  ballon_anti_belier: 6.5, // circle cy=1 + r=5.5
}


interface DrawingCanvasProps {
  levels: any[]; lineYs: number[]; onLineYsChange: any
  segments: any[]; onSegmentsChange: any
  points: any[]; onPointsChange: any
  onNetworkChange: any; onNetworkPatch: any
  drawMode: string; pipeType: string
  selectedIds: string[]; onSelectIds: any
  editLevelsEnabled: boolean; editColumnsEnabled: boolean
  columns: any[]; columnXs: number[]; onColumnXsChange: any; onPPZoneDrag: any
  chaufferie: any; onChaufferieChange: any; onChaufferiePatch?: any; onChaufferieStartDrag?: any
  editChaufferie: boolean; onEditChaufferieChange: any
  placingChaufferie: boolean; onPlacingChaufferieDone: any
  placingEquipment: any; onPlacingDone: any
  editParam: any; onAssignParam: any
  connHighlightIds: string[]; onConnHighlight: any
  criticalPathIds?: string[]
  networkFlows: any; flowDirections: any
  groupesEditMode: boolean; onRemoveGroupeById: any
  showGroupeNames: boolean; groupDisplayNames: any
  canvasDisplay: any; roleMap: any
  materials: any[]; insulations: any[]
  alimentationParams: any; alimentationResults: any
  activeCalcId: CalcMode | null
  thermalResults: any; fitViewRequest: any
  valves: any[]; onValvesChange: any
  selectedValveId: string | null; onSelectedValveChange: any
  accessories: any[]; onAccessoriesChange: any
  placingAccessoryType: string | null; onPlacingAccessoryDone: any
  selectedAccessoryId: string | null; onSelectedAccessoryChange: any
  pdcParams: any; pdcResults: any; pdcCumResults: any; pdcCumAlimResults: any
  segToCol: any; onExitSpecialMode: any
  pressionSourceAlimEF?: number | null; pressionSourceAlimEFStatic?: number | null
  locauxEF?: any[]; onLocauxEFChange: any
  placingLocalEF?: boolean; onPlacingLocalEFDone: any
  editLocauxEF?: boolean; onEditLocauxEFChange: any
  selectedLocalEFId?: string | null; onSelectedLocalEFChange: any
  locauxECS?: any[]; onLocauxECSChange: any
  placingLocalECS?: boolean; onPlacingLocalECSDone: any
  editLocauxECS?: boolean; onEditLocauxECSChange: any
  selectedLocalECSId?: string | null; onSelectedLocalECSChange: any
  locauxChauffage?: any[]; onLocauxChauffageChange: any
  placingLocalChauffage?: boolean; onPlacingLocalChauffageDone: any
  editLocauxChauffage?: boolean; onEditLocauxChauffageChange: any
  selectedLocalChauffageId?: string | null; onSelectedLocalChauffageChange: any
  locauxGroupeFroid?: any[]; onLocauxGroupeFroidChange: any
  placingLocalGroupeFroid?: boolean; onPlacingLocalGroupeFroidDone: any
  editLocauxGroupeFroid?: boolean; onEditLocauxGroupeFroidChange: any
  selectedLocalGroupeFroidId?: string | null; onSelectedLocalGroupeFroidChange: any
  chauffageFlows?: any
  chauffageParams?: any
  eauGlaceeFlows?: any
  mixingNodes?: Set<string>
  displayPrefs?: DisplayPrefs
}

export default function DrawingCanvas({
  levels, lineYs, onLineYsChange,
  segments, onSegmentsChange,
  points, onPointsChange,
  onNetworkChange,
  onNetworkPatch,
  drawMode, pipeType,
  selectedIds, onSelectIds,
  editLevelsEnabled, editColumnsEnabled,
  columns, columnXs, onColumnXsChange, onPPZoneDrag,
  chaufferie, onChaufferieChange, onChaufferiePatch, onChaufferieStartDrag,
  editChaufferie, onEditChaufferieChange,
  placingChaufferie, onPlacingChaufferieDone,
  placingEquipment, onPlacingDone,
  editParam, onAssignParam,
  connHighlightIds, onConnHighlight,
  criticalPathIds,
  networkFlows,
  flowDirections,
  groupesEditMode,
  onRemoveGroupeById,
  showGroupeNames,
  groupDisplayNames,
  canvasDisplay,
  roleMap,
  materials,
  insulations,
  alimentationParams,
  alimentationResults,
  activeCalcId,
  thermalResults,
  fitViewRequest,
  valves,
  onValvesChange,
  selectedValveId,
  onSelectedValveChange,
  accessories,
  onAccessoriesChange,
  placingAccessoryType,
  onPlacingAccessoryDone,
  selectedAccessoryId,
  onSelectedAccessoryChange,
  pdcParams,
  pdcResults,
  pdcCumResults,
  pdcCumAlimResults,
  segToCol,
  onExitSpecialMode,
  pressionSourceAlimEF = null,
  pressionSourceAlimEFStatic = null,
  locauxEF = [],
  onLocauxEFChange,
  placingLocalEF = false,
  onPlacingLocalEFDone,
  editLocauxEF = false,
  onEditLocauxEFChange,
  selectedLocalEFId = null,
  onSelectedLocalEFChange,
  locauxECS = [],
  onLocauxECSChange,
  placingLocalECS = false,
  onPlacingLocalECSDone,
  editLocauxECS = false,
  onEditLocauxECSChange,
  selectedLocalECSId = null,
  onSelectedLocalECSChange,
  locauxChauffage = [],
  onLocauxChauffageChange,
  placingLocalChauffage = false,
  onPlacingLocalChauffageDone,
  editLocauxChauffage = false,
  onEditLocauxChauffageChange,
  selectedLocalChauffageId = null,
  onSelectedLocalChauffageChange,
  locauxGroupeFroid = [],
  onLocauxGroupeFroidChange,
  placingLocalGroupeFroid = false,
  onPlacingLocalGroupeFroidDone,
  editLocauxGroupeFroid = false,
  onEditLocauxGroupeFroidChange,
  selectedLocalGroupeFroidId = null,
  onSelectedLocalGroupeFroidChange,
  chauffageFlows,
  chauffageParams,
  eauGlaceeFlows,
  mixingNodes,
  displayPrefs,
}: DrawingCanvasProps) {
  const { isBouclage, isAlimECS, isAlimEF, isAlimMode, isChauffage, isEauGlacee } = getModeFlags(activeCalcId)
  const activeTerminalFlows = isChauffage ? chauffageFlows : isEauGlacee ? eauGlaceeFlows : null

  const svgRef    = useRef(null)
  const spaceRef  = useRef(false)
  const ptDragRef    = useRef(null)   // {ptId, startX, startY, origX, origY, moved, constraint}
  const segDragRef   = useRef(null)   // {segId, dir, startScreenX, startScreenY, origPerp, moved}
  const blockDragRef = useRef(null)   // {startScreenX, startScreenY, moved}
  const valveDragRef = useRef(null)   // {valveId, segmentId, origT}
  const accessoryDragRef = useRef(null)   // {accessoryId, segmentId, origT, moved}

  const [tf,        setTf]        = useState({ x: 80, y: 40, k: 1 })

  useEffect(() => {
    if (!fitViewRequest) return
    const raf = requestAnimationFrame(() => {
      if (!svgRef.current) return
      const rect = svgRef.current.getBoundingClientRect()
      const W = rect.width, H = rect.height
      if (!W || !H || !lineYs.length || !columnXs.length) return
      const pad = 50
      const x1 = columnXs[0], x2 = columnXs[columnXs.length - 1]
      const y1 = lineYs[lineYs.length - 1], y2 = lineYs[0]
      const cW = x2 - x1, cH = y2 - y1
      if (cW <= 0 || cH <= 0) return
      const k = Math.min((W - pad * 2) / cW, (H - pad * 2) / cH)
      setTf({ k, x: (W - cW * k) / 2 - x1 * k, y: (H - cH * k) / 2 - y1 * k })
    })
    return () => cancelAnimationFrame(raf)
  }, [fitViewRequest]) // eslint-disable-line react-hooks/exhaustive-deps

  const [panSt,     setPanSt]     = useState(null)
  const [dragLine,  setDragLine]  = useState(null)
  const [dragCol,   setDragCol]   = useState(null)   // {idx, screenX, origX}
  const [dragCh,    setDragCh]    = useState(null)   // {type, screenX, screenY, origX1, origX2, origHeight}
  const chaufferieSnapRef = useRef(false)             // true once the drag snapshot has been pushed to history
  const [dragLEF,   setDragLEF]   = useState(null)   // {type, localEFId, screenX, screenY, origX1, origX2, origHeight}
  const [dragLECS,  setDragLECS]  = useState(null)   // {type, id, screenX, screenY, origX1, origX2, origHeight}
  const [dragLCh,   setDragLCh]   = useState(null)   // {type, id, screenX, screenY, origX1, origX2, origHeight}
  const [dragLGF,   setDragLGF]   = useState(null)   // {type, id, screenX, screenY, origX1, origX2, origHeight}
  const [drawing,   setDrawing]   = useState(null)
  const [mouse,     setMouse]     = useState({ x: 0, y: 0 })
  const [rectSt,    setRectSt]    = useState(null)
  const [selRect,   setSelRect]   = useState(null)
  const [ptDragPos,    setPtDragPos]    = useState(null)  // live drag {ptId,x,y}
  const [segDragState, setSegDragState] = useState(null)  // live drag {segId, delta}
  const [blockDragState, setBlockDragState] = useState(null)  // live drag {dx, dy}
  const [previewVanne,  setPreviewVanne]  = useState(null)  // { x, y, angle, t, segId }
  const [valveDragT, setValveDragT] = useState(null)  // { valveId, t } live drag
  const [previewAccessory, setPreviewAccessory] = useState(null)  // { x, y, angle, t, segId }
  const [accessoryDragT, setAccessoryDragT] = useState(null)  // { accessoryId, t, segmentId } live drag
  const justMovedGroupeIdsRef = useRef(new Set())

  // ── Clear drawing on mode/type change ────────────────
  useEffect(() => { if (drawMode !== 'draw') setDrawing(null) }, [drawMode])
  useEffect(() => { if (pipeType === 'point') setDrawing(null) }, [pipeType])

  // ── Auto-split segments at frontier Ys ───────────────
  // Uses onNetworkPatch (not onNetworkChange) to avoid polluting the undo stack.
  // Only for ECS modes: the frontier node separates thermal zones (T° ambiante différente
  // sous-sol vs hors-sol). EF and Chauffage are purely hydraulic — not needed.
  useEffect(() => {
    if (isAlimEF || isChauffage || isEauGlacee) return
    const result = applyFrontierSplits(segments, points, levels, lineYs)
    if (result) onNetworkPatch(result.segs, result.pts)
  }, [segments, points, levels, lineYs, isAlimEF, isChauffage, isEauGlacee]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-connect Production ECS to network ───────────
  useEffect(() => {
    const skipIds = justMovedGroupeIdsRef.current
    justMovedGroupeIdsRef.current = new Set()
    const result = applySpecialPtSnap(segments, points, skipIds.size > 0 ? skipIds : null)
    if (result) onNetworkPatch(result.segs, result.pts)
  }, [segments, points]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Split segment at position (atomic) ───────────────
  const splitSegment = useCallback((hitInfo, splitPos) => {
    const { seg, subIdx } = hitInfo
    const sp = { x: snap(splitPos.x), y: snap(splitPos.y) }
    const existing = points.find(p => dist(p, sp) < SNAP)
    const junctionPt = existing ?? { id: uid('P'), name: '', x: sp.x, y: sp.y }
    const vs = seg.vertices
    const seg1 = { ...seg, id: uid('T'), vertices: [...vs.slice(0, subIdx + 1), sp], endPointId: junctionPt.id }
    const seg2 = { ...seg, id: uid('T'), vertices: [sp, ...vs.slice(subIdx + 1)], startPointId: junctionPt.id }
    const seg1Len = polylineLen(seg1.vertices)
    const seg2Len = polylineLen(seg2.vertices)
    onNetworkChange(
      s => s.filter(x => x.id !== seg.id).concat([seg1, seg2]),
      p => existing ? p : [...p, junctionPt],
      { [seg.id]: { seg1Id: seg1.id, seg1Len, seg2Id: seg2.id, seg2Len } }
    )
    return junctionPt
  }, [onNetworkChange, points])

  // ── Commit in-progress drawing (Escape) ──────────────
  const commitDrawing = useCallback((d?: any) => {
    const cur = d ?? drawing
    if (!cur || cur.vertices.length < 2) { setDrawing(null); return }
    const verts = collapseCollinear(cur.vertices)
    let startId = cur.startPtId
    const newPts = []
    if (!startId) {
      const p = { id: uid('P'), name: '', x: verts[0].x, y: verts[0].y }
      newPts.push(p); startId = p.id
    }
    const endPos = verts[verts.length - 1]
    const existing = points.find(p => dist(p, endPos) < SNAP)
    let endId = existing?.id ?? null
    if (!endId) {
      const p = { id: uid('P'), name: '', x: endPos.x, y: endPos.y }
      newPts.push(p); endId = p.id
    }
    const seg = {
      id: uid('T'), name: null, showName: null, type: cur.type, vertices: verts,
      startPointId: startId, endPointId: endId,
      materialId: null, dn: null, di_override: null, de_override: null, lambda_tube_override: null,
      insulationId: null, thickness: null, lambda_insul_override: null,
      length_override: null, flowRate: null, velocity: null,
    }
    onNetworkChange(s => [...s, seg], p => [...p, ...newPts])
    setDrawing(null)
  }, [drawing, points, onNetworkChange])

  // ── Finalize drawing to explicit endpoint ─────────────
  const finalize = useCallback((endPos, endPtId) => {
    if (!drawing || drawing.vertices.length < 1) return
    const lastV = drawing.vertices[drawing.vertices.length - 1]
    const ddx = endPos.x - lastV.x, ddy = endPos.y - lastV.y
    // Si l'endpoint n'est pas aligné avec le dernier vertex, insérer un coude orthogonal
    const elbowVerts = (Math.abs(ddx) > 0 && Math.abs(ddy) > 0)
      ? [Math.abs(ddx) >= Math.abs(ddy) ? { x: endPos.x, y: lastV.y } : { x: lastV.x, y: endPos.y }]
      : []
    const verts = collapseCollinear([...drawing.vertices, ...elbowVerts, endPos])
    if (verts.length < 2) return
    let startId = drawing.startPtId
    const newPts = []
    if (!startId) {
      const p = { id: uid('P'), name: '', x: verts[0].x, y: verts[0].y }
      newPts.push(p); startId = p.id
    }
    let endId = endPtId
    // Un groupe ne peut être raccordé qu'à un seul tronçon
    if (endId) {
      const endPt = points.find(p => p.id === endId)
      if (endPt?.type === 'groupe' && segments.some(s => s.startPointId === endId || s.endPointId === endId)) {
        endId = null // refuser la connexion → nouveau nœud
      }
    }
    if (!endId) {
      const existing = points.find(p => dist(p, endPos) < SNAP)
      if (existing) {
        endId = existing.id
      } else {
        const p = { id: uid('P'), name: '', x: endPos.x, y: endPos.y }
        newPts.push(p); endId = p.id
      }
    }
    const seg = {
      id: uid('T'), name: null, showName: null, type: drawing.type, vertices: verts,
      startPointId: startId, endPointId: endId,
      materialId: null, dn: null, di_override: null, de_override: null, lambda_tube_override: null,
      insulationId: null, thickness: null, lambda_insul_override: null,
      length_override: null, flowRate: null, velocity: null,
    }
    onNetworkChange(s => [...s, seg], p => [...p, ...newPts])
    setDrawing(null)
  }, [drawing, onNetworkChange, points])

  // ── Delete a point with smart segment merging ─────────
  const deletePoint = useCallback((ptId) => {
    const result = deleteNodeFromNetwork(ptId, segments, points)
    if (!result) return
    onNetworkChange(result.newSegs, result.newPts, undefined, result.segMerges)
    onSelectIds([])
  }, [segments, points, onNetworkChange, onSelectIds])


  // ── Resolve snap target for drawing ──────────────────
  const resolveSnap = useCallback((snapped) => {
    let nearestPt = null, nearestDist = DRAW_SNAP
    for (const p of points) {
      const d = dist(p, snapped)
      if (d < nearestDist) { nearestDist = d; nearestPt = p }
    }
    if (nearestPt) return { pos: { x: nearestPt.x, y: nearestPt.y }, ptId: nearestPt.id }
    const onSeg = nearestOnSegments(snapped, segments)
    if (onSeg) return { pos: onSeg.pt, ptId: null, onSeg }
    return { pos: snapped, ptId: null }
  }, [points, segments])

  // ── keyboard ─────────────────────────────────────────
  useEffect(() => {
    const kd = e => {
      if (e.target.matches('input,select,textarea')) return
      if (e.code === 'Space') { e.preventDefault(); spaceRef.current = true }
      if (e.key === 'Escape') {
        if (placingEquipment !== null) { onPlacingDone(); return }
        if (placingChaufferie) { onPlacingChaufferieDone(); return }
        if (placingLocalEF) { onPlacingLocalEFDone?.(); return }
        if (placingLocalECS) { onPlacingLocalECSDone?.(); return }
        if (placingLocalChauffage) { onPlacingLocalChauffageDone?.(); return }
        if (placingLocalGroupeFroid) { onPlacingLocalGroupeFroidDone?.(); return }
        if (placingAccessoryType) { onPlacingAccessoryDone?.(); return }
if (drawing) commitDrawing()
        else { onSelectIds([]); onSelectedValveChange?.(null); onSelectedAccessoryChange?.(null) }
        return
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        if (drawing) {
          e.preventDefault()
          e.stopImmediatePropagation()
          setDrawing(d => {
            if (!d || d.vertices.length <= 1) return null
            return { ...d, vertices: d.vertices.slice(0, -1) }
          })
          return
        }
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedLocalEFId) {
          onLocauxEFChange?.((locauxEF ?? []).filter(l => l.id !== selectedLocalEFId))
          onSelectedLocalEFChange?.(null)
          return
        }
        if (selectedLocalECSId) {
          onLocauxECSChange?.((locauxECS ?? []).filter(l => l.id !== selectedLocalECSId))
          onSelectedLocalECSChange?.(null)
          return
        }
        if (selectedLocalChauffageId) {
          onLocauxChauffageChange?.((locauxChauffage ?? []).filter(l => l.id !== selectedLocalChauffageId))
          onSelectedLocalChauffageChange?.(null)
          return
        }
        if (selectedLocalGroupeFroidId) {
          onLocauxGroupeFroidChange?.((locauxGroupeFroid ?? []).filter(l => l.id !== selectedLocalGroupeFroidId))
          onSelectedLocalGroupeFroidChange?.(null)
          return
        }
        if (selectedAccessoryId) {
          onAccessoriesChange(acc => acc.filter(a => a.id !== selectedAccessoryId))
          onSelectedAccessoryChange?.(null)
          return
        }
        if (selectedValveId) {
          onValvesChange(vs => vs.filter(v => v.id !== selectedValveId))
          onSelectedValveChange?.(null)
          return
        }
        const delGroupIds = selectedIds.filter(id => points.some(p => p.id === id && p.type === 'groupe'))
        const delPtIds    = selectedIds.filter(id => points.some(p => p.id === id && !p.isLocked && p.type !== 'groupe'))
        const delSegIds   = new Set(selectedIds.filter(id => segments.some(s => s.id === id)))

        // Groups: delegate to App (handles PP zone adjustment)
        for (const gId of delGroupIds) onRemoveGroupeById?.(gId)

        let newSegs = segments.filter(s => !delSegIds.has(s.id))
        let newPts  = [...points]
        const segMerges = {}
        for (const ptId of delPtIds) {
          const pt = newPts.find(p => p.id === ptId)
          if (pt?.type === 'productionECS' || pt?.type === 'arriveeEF' || pt?.type === 'productionChauffage' || pt?.type === 'productionEauGlacee') {
            newPts = newPts.map(p => p.id === ptId ? { id: p.id, name: p.name ?? '', x: p.x, y: p.y } : p)
            continue
          }
          if (pt?.type === 'pump') {
            const result = deleteNodeFromNetwork(ptId, newSegs, newPts)
            if (result) {
              newSegs = result.newSegs
              newPts  = result.newPts
              Object.assign(segMerges, result.segMerges)
            } else {
              newPts = newPts.filter(p => p.id !== ptId)
            }
            continue
          }
          if (pt?.type === 'emetteur' || pt?.type === 'terminalFroid') {
            newPts = newPts.map(p => p.id !== ptId ? p : { id: p.id, name: p.name ?? '', x: p.x, y: p.y })
            continue
          }
          const result = deleteNodeFromNetwork(ptId, newSegs, newPts)
          if (result) {
            newSegs = result.newSegs
            newPts  = result.newPts
            Object.assign(segMerges, result.segMerges)
          }
        }
        if (delPtIds.length > 0 || delSegIds.size > 0) onNetworkChange(newSegs, newPts, undefined, segMerges)
        onSelectIds([])
      }
    }
    const ku = e => { if (e.code === 'Space') spaceRef.current = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup',   ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [drawing, commitDrawing, selectedIds, segments, points, onNetworkChange, onSelectIds, placingEquipment, onPlacingDone, placingChaufferie, onPlacingChaufferieDone, placingLocalEF, onPlacingLocalEFDone, placingLocalECS, onPlacingLocalECSDone, placingLocalChauffage, onPlacingLocalChauffageDone, onRemoveGroupeById, selectedValveId, onSelectedValveChange, onValvesChange, drawMode, onExitSpecialMode, placingAccessoryType, onPlacingAccessoryDone, selectedAccessoryId, onAccessoriesChange, onSelectedAccessoryChange, selectedLocalEFId, onLocauxEFChange, onSelectedLocalEFChange, locauxEF, selectedLocalECSId, onLocauxECSChange, onSelectedLocalECSChange, locauxECS, selectedLocalChauffageId, onLocauxChauffageChange, onSelectedLocalChauffageChange, locauxChauffage])

  // ── zoom ─────────────────────────────────────────────
  const onWheel = useCallback(e => {
    e.preventDefault()
    const f = e.deltaY < 0 ? ZOOM_F : 1 / ZOOM_F
    const r = svgRef.current.getBoundingClientRect()
    const mx = e.clientX - r.left, my = e.clientY - r.top
    setTf(t => {
      const k = Math.max(0.1, Math.min(8, t.k * f))
      return { x: mx - (mx - t.x) * (k / t.k), y: my - (my - t.y) * (k / t.k), k }
    })
  }, [])
  useEffect(() => {
    const el = svgRef.current
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // ── hit-test helpers ──────────────────────────────────
  const nearPt = useCallback(pos => {
    let best = null, bestD = Infinity
    for (const p of points) {
      const d = dist(p, pos)
      const r = p.type === 'pump'
        ? Math.max(PT_HIT, p.size ?? 15)
        : p.type === 'productionECS' || p.type === 'arriveeEF' || p.type === 'productionChauffage' || p.type === 'productionEauGlacee'
        ? Math.max(PT_HIT, Math.max((p.size?.w ?? 44) / 2, (p.size?.h ?? 28) / 2))
        : p.type === 'groupe'
        ? Math.max(PT_HIT, 30)
        : PT_HIT
      if (d < r && d < bestD) { bestD = d; best = p }
    }
    return best
  }, [points])


  // ── mouse move ────────────────────────────────────────
  const onMouseMove = useCallback(e => {
    const pos = toCanvas(e, svgRef.current, tf)
    setMouse(pos)

    if (panSt) {
      setTf(t => ({ ...t, x: e.clientX - panSt.ox, y: e.clientY - panSt.oy }))
      return
    }
    if (dragLine !== null) {
      const newY = dragLine.origY + (e.clientY - dragLine.screenY) / tf.k
      onLineYsChange(ys => {
        const next = [...ys]
        const MIN_GAP = 60
        const maxY = dragLine.idx > 0             ? ys[dragLine.idx - 1] - MIN_GAP : Infinity
        const minY = dragLine.idx < ys.length - 1 ? ys[dragLine.idx + 1] + MIN_GAP : -Infinity
        next[dragLine.idx] = Math.max(minY, Math.min(maxY, newY))
        return next
      })
      return
    }
    if (dragCol !== null) {
      const delta = (e.clientX - dragCol.screenX) / tf.k
      if (dragCol.isPPZone) {
        onPPZoneDrag?.(dragCol.ppZoneId, dragCol.ppWidth, dragCol.origX + delta)
      } else {
        const newX = dragCol.origX + delta
        onColumnXsChange(xs => {
          const next = [...xs]
          const MIN_GAP = 80
          const maxX = dragCol.idx < xs.length - 1 ? xs[dragCol.idx + 1] - MIN_GAP : Infinity
          const minX = dragCol.idx > 0             ? xs[dragCol.idx - 1] + MIN_GAP : -Infinity
          next[dragCol.idx] = Math.max(minX, Math.min(maxX, newX))
          return next
        })
      }
      return
    }
    if (dragCh !== null && chaufferie) {
      const MIN_H = 40, MIN_W = 80, MIN_GAP = 40
      let newCh: any = null
      if (dragCh.type === 'top') {
        const rawH = dragCh.origHeight - (e.clientY - dragCh.screenY) / tf.k
        const levelIdx = levels.findIndex(l => l.id === chaufferie.levelId)
        const yBottom  = levelIdx >= 0 ? lineYs[levelIdx] : 0
        const levelAboveY = (levelIdx >= 0 && levelIdx + 1 < lineYs.length) ? lineYs[levelIdx + 1] : yBottom - 2000
        const maxH = yBottom - levelAboveY - MIN_GAP
        newCh = { ...chaufferie, height: Math.round(Math.max(MIN_H, Math.min(Math.max(maxH, MIN_H), rawH))) }
      } else if (dragCh.type === 'left') {
        const rawX1 = dragCh.origX1 + (e.clientX - dragCh.screenX) / tf.k
        newCh = { ...chaufferie, x1: snap(Math.min(dragCh.origX2 - MIN_W, rawX1)) }
      } else if (dragCh.type === 'right') {
        const rawX2 = dragCh.origX2 + (e.clientX - dragCh.screenX) / tf.k
        newCh = { ...chaufferie, x2: snap(Math.max(dragCh.origX1 + MIN_W, rawX2)) }
      } else if (dragCh.type === 'move') {
        const rawDx = (e.clientX - dragCh.screenX) / tf.k
        const mouseY = dragCh.origCenterY + (e.clientY - dragCh.screenY) / tf.k
        const liCh = findLevelIndexAt(mouseY, lineYs)
        const newLevelId = liCh >= 0 ? levels[liCh].id : chaufferie.levelId
        newCh = { ...chaufferie, x1: snap(dragCh.origX1 + rawDx), x2: snap(dragCh.origX2 + rawDx), levelId: newLevelId }
      }
      if (newCh) {
        if (!chaufferieSnapRef.current) {
          chaufferieSnapRef.current = true
          onChaufferieStartDrag?.()
        }
        ;(onChaufferiePatch ?? onChaufferieChange)(newCh)
      }
      return
    }
    if (dragLEF !== null) {
      const lef = (locauxEF ?? []).find(l => l.id === dragLEF.localEFId)
      if (!lef) return
      const MIN_H = 40, MIN_W = 80, MIN_GAP = 40
      let updated = lef
      if (dragLEF.type === 'top') {
        const rawH = dragLEF.origHeight - (e.clientY - dragLEF.screenY) / tf.k
        const levelIdx = levels.findIndex(l => l.id === lef.levelId)
        const yBottom = levelIdx >= 0 ? lineYs[levelIdx] : 0
        const levelAboveY = (levelIdx >= 0 && levelIdx + 1 < lineYs.length) ? lineYs[levelIdx + 1] : yBottom - 2000
        const maxH = yBottom - levelAboveY - MIN_GAP
        updated = { ...lef, height: Math.round(Math.max(MIN_H, Math.min(Math.max(maxH, MIN_H), rawH))) }
      } else if (dragLEF.type === 'left') {
        const rawX1 = dragLEF.origX1 + (e.clientX - dragLEF.screenX) / tf.k
        updated = { ...lef, x1: snap(Math.min(dragLEF.origX2 - MIN_W, rawX1)) }
      } else if (dragLEF.type === 'right') {
        const rawX2 = dragLEF.origX2 + (e.clientX - dragLEF.screenX) / tf.k
        updated = { ...lef, x2: snap(Math.max(dragLEF.origX1 + MIN_W, rawX2)) }
      } else if (dragLEF.type === 'move') {
        const rawDx = (e.clientX - dragLEF.screenX) / tf.k
        const mouseY = dragLEF.origCenterY + (e.clientY - dragLEF.screenY) / tf.k
        const liLEF = findLevelIndexAt(mouseY, lineYs)
        const newLevelId = liLEF >= 0 ? levels[liLEF].id : lef.levelId
        updated = { ...lef, x1: snap(dragLEF.origX1 + rawDx), x2: snap(dragLEF.origX2 + rawDx), levelId: newLevelId }
      }
      onLocauxEFChange?.((locauxEF ?? []).map(l => l.id === dragLEF.localEFId ? updated : l))
      return
    }

    // helper factorisant la logique de drag local zone
    const applyLocalZoneDrag = (drag: any, zone: any) => {
      const MIN_H = 40, MIN_W = 80, MIN_GAP = 40
      if (drag.type === 'top') {
        const rawH = drag.origHeight - (e.clientY - drag.screenY) / tf.k
        const levelIdx = levels.findIndex(l => l.id === zone.levelId)
        const yBottom = levelIdx >= 0 ? lineYs[levelIdx] : 0
        const levelAboveY = (levelIdx >= 0 && levelIdx + 1 < lineYs.length) ? lineYs[levelIdx + 1] : yBottom - 2000
        const maxH = yBottom - levelAboveY - MIN_GAP
        return { ...zone, height: Math.round(Math.max(MIN_H, Math.min(Math.max(maxH, MIN_H), rawH))) }
      } else if (drag.type === 'left') {
        const rawX1 = drag.origX1 + (e.clientX - drag.screenX) / tf.k
        return { ...zone, x1: snap(Math.min(drag.origX2 - MIN_W, rawX1)) }
      } else if (drag.type === 'right') {
        const rawX2 = drag.origX2 + (e.clientX - drag.screenX) / tf.k
        return { ...zone, x2: snap(Math.max(drag.origX1 + MIN_W, rawX2)) }
      } else if (drag.type === 'move') {
        const rawDx = (e.clientX - drag.screenX) / tf.k
        const mouseY = drag.origCenterY + (e.clientY - drag.screenY) / tf.k
        const li = findLevelIndexAt(mouseY, lineYs)
        const newLevelId = li >= 0 ? levels[li].id : zone.levelId
        return { ...zone, x1: snap(drag.origX1 + rawDx), x2: snap(drag.origX2 + rawDx), levelId: newLevelId }
      }
      return zone
    }

    if (dragLECS !== null) {
      const zone = (locauxECS ?? []).find(l => l.id === dragLECS.id)
      if (zone) onLocauxECSChange?.((locauxECS ?? []).map(l => l.id === dragLECS.id ? applyLocalZoneDrag(dragLECS, zone) : l))
      return
    }
    if (dragLCh !== null) {
      const zone = (locauxChauffage ?? []).find(l => l.id === dragLCh.id)
      if (zone) onLocauxChauffageChange?.((locauxChauffage ?? []).map(l => l.id === dragLCh.id ? applyLocalZoneDrag(dragLCh, zone) : l))
      return
    }
    if (dragLGF !== null) {
      const zone = (locauxGroupeFroid ?? []).find(l => l.id === dragLGF.id)
      if (zone) onLocauxGroupeFroidChange?.((locauxGroupeFroid ?? []).map(l => l.id === dragLGF.id ? applyLocalZoneDrag(dragLGF, zone) : l))
      return
    }

    if (ptDragRef.current) {
      const dx = e.clientX - ptDragRef.current.startX
      const dy = e.clientY - ptDragRef.current.startY
      if (!ptDragRef.current.moved && Math.sqrt(dx * dx + dy * dy) > 4) {
        ptDragRef.current.moved = true
        // Lock axis on first movement for free-constraint nodes (L/+ junctions and locals)
        if (ptDragRef.current.constraint === 'free') {
          ptDragRef.current.lockedAxis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
        }
      }
      if (ptDragRef.current.moved) {
        const { constraint, lockedAxis, origX, origY, ptId: dragPtId, connectedCount } = ptDragRef.current
        const effectiveConstraint = lockedAxis ?? constraint
        let x = effectiveConstraint === 'v' ? origX : snap(pos.x)
        let y = effectiveConstraint === 'h' ? origY : snap(pos.y)

        // Clamp to adjacent inner vertices so node cannot cross segment angles
        let minX = -Infinity, maxX = Infinity, minY = -Infinity, maxY = Infinity
        for (const seg of segments.filter(s => s.startPointId === dragPtId || s.endPointId === dragPtId)) {
          const vs = seg.vertices
          if (vs.length < 2) continue
          const isEnd = seg.endPointId === dragPtId
          const nodeV  = isEnd ? vs[vs.length - 1] : vs[0]
          const innerV = isEnd ? vs[vs.length - 2] : vs[1]
          const edgeH  = Math.abs(innerV.x - nodeV.x) >= Math.abs(innerV.y - nodeV.y)
          if (edgeH && effectiveConstraint !== 'v') {
            if (innerV.x <= origX) minX = Math.max(minX, innerV.x)
            else                   maxX = Math.min(maxX, innerV.x)
          } else if (!edgeH && effectiveConstraint !== 'h') {
            if (innerV.y <= origY) minY = Math.max(minY, innerV.y)
            else                   maxY = Math.min(maxY, innerV.y)
          }
        }
        // Back-wall for corner nodes: 'free' drag with exactly 2 perpendicular segments.
        // Prevents the node from sliding "into the void" past its current position along
        // the locked axis, which would take it off both segments simultaneously.
        if (constraint === 'free' && connectedCount === 2 && lockedAxis != null) {
          for (const seg of segments.filter(s => s.startPointId === dragPtId || s.endPointId === dragPtId)) {
            const vs = seg.vertices
            if (vs.length < 2) continue
            const isEnd = seg.endPointId === dragPtId
            const nodeV  = isEnd ? vs[vs.length - 1] : vs[0]
            const innerV = isEnd ? vs[vs.length - 2] : vs[1]
            const edgeH  = Math.abs(innerV.x - nodeV.x) >= Math.abs(innerV.y - nodeV.y)
            if (edgeH && lockedAxis === 'h') {
              // H-segment parallel to locked axis: clamp x to stay within the segment's extent
              if (innerV.x > origX) minX = Math.max(minX, origX)
              else                  maxX = Math.min(maxX, origX)
            } else if (!edgeH && lockedAxis === 'v') {
              // V-segment parallel to locked axis: clamp y to stay within the segment's extent
              if (innerV.y < origY) maxY = Math.min(maxY, origY)
              else                  minY = Math.max(minY, origY)
            }
          }
        }

        x = Math.max(minX, Math.min(maxX, x))
        y = Math.max(minY, Math.min(maxY, y))

        setPtDragPos({ ptId: dragPtId, x, y, effectiveConstraint })
      }
      return
    }
    if (segDragRef.current) {
      const { dir, startScreenX, startScreenY, origPerp } = segDragRef.current
      const rawDelta = dir === 'h'
        ? (e.clientY - startScreenY) / tf.k
        : (e.clientX - startScreenX) / tf.k
      if (!segDragRef.current.moved && Math.abs(rawDelta) > 4 / tf.k) segDragRef.current.moved = true
      if (segDragRef.current.moved) {
        const { minDelta = -Infinity, maxDelta = Infinity } = segDragRef.current
        const delta = Math.max(minDelta, Math.min(maxDelta, snap(origPerp + rawDelta) - origPerp))
        setSegDragState({ segId: segDragRef.current.segId, subIdx: segDragRef.current.subIdx, delta })
      }
      return
    }
    if (blockDragRef.current) {
      const dx = (e.clientX - blockDragRef.current.startScreenX) / tf.k
      const dy = (e.clientY - blockDragRef.current.startScreenY) / tf.k
      if (!blockDragRef.current.moved && Math.sqrt(dx * dx + dy * dy) > 4 / tf.k)
        blockDragRef.current.moved = true
      if (blockDragRef.current.moved) setBlockDragState({ dx, dy })
      return
    }
    if (valveDragRef.current) {
      let best = null, bestDist = Infinity
      for (const seg of segments) {
        const r = closestTOnPolyline(pos, seg.vertices)
        if (r && r.dist < bestDist) { bestDist = r.dist; best = { ...r, segId: seg.id } }
      }
      if (best) {
        valveDragRef.current.moved = true
        setValveDragT({ valveId: valveDragRef.current.valveId, t: best.t, segmentId: best.segId })
      }
      return
    }
    if (accessoryDragRef.current) {
      let best = null, bestDist = Infinity
      for (const seg of segments) {
        const r = closestTOnPolyline(pos, seg.vertices)
        if (r && r.dist < bestDist) { bestDist = r.dist; best = { ...r, segId: seg.id } }
      }
      if (best) {
        accessoryDragRef.current.moved = true
        setAccessoryDragT({ accessoryId: accessoryDragRef.current.accessoryId, t: best.t, segmentId: best.segId })
      }
      return
    }
    if (rectSt) setSelRect({ x1: rectSt.x, y1: rectSt.y, x2: pos.x, y2: pos.y })

    // Valve placement preview
    if (drawMode === 'draw' && pipeType === 'vanne') {
      let best = null, bestDist = Infinity
      for (const seg of segments) {
        const r = closestTOnPolyline(pos, seg.vertices)
        if (r && r.dist < bestDist) { bestDist = r.dist; best = { ...r, segId: seg.id } }
      }
      setPreviewVanne(bestDist < 40 ? best : null)
    } else if (previewVanne) {
      setPreviewVanne(null)
    }

    // Accessory placement preview
    if (placingAccessoryType) {
      let best = null, bestDist = Infinity
      for (const seg of segments) {
        const r = closestTOnPolyline(pos, seg.vertices)
        if (r && r.dist < bestDist) { bestDist = r.dist; best = { ...r, segId: seg.id } }
      }
      setPreviewAccessory(bestDist < 40 ? best : null)
    } else if (previewAccessory) {
      setPreviewAccessory(null)
    }
  }, [tf, panSt, dragLine, dragCol, dragCh, dragLEF, dragLECS, dragLCh, dragLGF, rectSt, onLineYsChange, onColumnXsChange, onPPZoneDrag, chaufferie, onChaufferieChange, onChaufferiePatch, onChaufferieStartDrag, levels, lineYs, drawMode, pipeType, segments, previewVanne, placingAccessoryType, previewAccessory, locauxEF, onLocauxEFChange, locauxECS, onLocauxECSChange, locauxChauffage, onLocauxChauffageChange, locauxGroupeFroid, onLocauxGroupeFroidChange])

  // ── mouse down ───────────────────────────────────────
  const onMouseDown = useCallback(e => {
    if (!svgRef.current) return
    const pos = toCanvas(e, svgRef.current, tf)
    const hitSegs = segments

    // Ctrl+left, Space+left or middle → pan (all modes)
    if (e.button === 1 || (e.button === 0 && (spaceRef.current || e.ctrlKey || e.metaKey))) {
      e.preventDefault()
      setPanSt({ ox: e.clientX - tf.x, oy: e.clientY - tf.y })
      return
    }
    if (e.button !== 0) return

    if (connHighlightIds?.length > 0) onConnHighlight?.([])

    // ── Equipment placement mode ──
    if (placingEquipment !== null) {
      const snapped = { x: snap(pos.x), y: snap(pos.y) }

      // productionECS / productionChauffage / émetteur : si un nœud existant est à portée, le convertir en priorité (avant onSeg)
      if (placingEquipment.type === 'productionECS' || placingEquipment.type === 'productionChauffage' || placingEquipment.type === 'productionEauGlacee') {
        const existingPt = points.find(p => dist(p, snapped) < PT_HIT)
        if (existingPt) {
          onNetworkChange(
            s => s,
            p => p.map(x => x.id === existingPt.id
              ? { ...x, type: placingEquipment.type, name: placingEquipment.name ?? x.name, size: placingEquipment.size ?? x.size }
              : x)
          )
          onPlacingDone()
          return
        }
      }

      if (placingEquipment.type === 'emetteur' || placingEquipment.type === 'terminalFroid') {
        const isTF = placingEquipment.type === 'terminalFroid'
        const existingPt = points.find(p => dist(p, snapped) < PT_HIT)
        if (existingPt) {
          const nodeSegs = segments.filter(s => s.startPointId === existingPt.id || s.endPointId === existingPt.id).length
          if (nodeSegs > 2) return
          onNetworkChange(s => s, p => p.map(x => x.id === existingPt.id
            ? isTF
              ? { ...x, type: 'terminalFroid', terminalFroidType: placingEquipment.terminalFroidType,
                  T_entree_emetteur: placingEquipment.T_entree ?? null,
                  T_sortie_emetteur: placingEquipment.T_sortie ?? null,
                  ...(placingEquipment.puissance != null ? { puissance: placingEquipment.puissance } : {}),
                  size: placingEquipment.size ?? { w: 28, h: 18 } }
              : { ...x, type: 'emetteur', emetteurType: placingEquipment.emetteurType,
                  T_entree_emetteur: placingEquipment.T_entree ?? null,
                  T_sortie_emetteur: placingEquipment.T_sortie ?? null,
                  ...(placingEquipment.puissance != null ? { puissance: placingEquipment.puissance } : {}),
                  size: placingEquipment.size ?? { w: 28, h: 18 } }
            : x))
          return
        }
      }

      const onSeg = nearestOnSegments(snapped, hitSegs)
      const sp = (onSeg && onSeg.d < HIT) ? onSeg.pt : snapped
      const isTF = placingEquipment.type === 'terminalFroid'
      const newPt = {
        id: uid('eq'), name: placingEquipment.type === 'arriveeEF' ? null : placingEquipment.name, x: sp.x, y: sp.y,
        type: placingEquipment.type,
        ...(placingEquipment.type === 'pump'
          ? { rotation: placingEquipment.rotation ?? 0, size: placingEquipment.size ?? 12 }
          : placingEquipment.type === 'emetteur'
            ? { size: placingEquipment.size ?? { w: 28, h: 18 }, emetteurType: placingEquipment.emetteurType, T_entree_emetteur: placingEquipment.T_entree ?? null, T_sortie_emetteur: placingEquipment.T_sortie ?? null, ...(placingEquipment.puissance != null ? { puissance: placingEquipment.puissance } : {}) }
          : isTF
            ? { size: placingEquipment.size ?? { w: 28, h: 18 }, terminalFroidType: placingEquipment.terminalFroidType, T_entree_emetteur: placingEquipment.T_entree ?? null, T_sortie_emetteur: placingEquipment.T_sortie ?? null, ...(placingEquipment.puissance != null ? { puissance: placingEquipment.puissance } : {}) }
            : { size: placingEquipment.size ?? { w: 44, h: 28 } }),
      }
      const renameId   = placingEquipment.renameFirstPump ?? null
      const renameName = placingEquipment.renameFirstPumpName ?? null
      const ptsUpdate = p => [
        ...(renameId && renameName
          ? p.map(x => x.id === renameId ? { ...x, name: renameName } : x)
          : p),
        newPt,
      ]
      if (onSeg && onSeg.d < HIT) {
        const { seg, subIdx } = onSeg
        const vs = seg.vertices
        const seg1 = { ...seg, id: uid('T'), vertices: [...vs.slice(0, subIdx + 1), sp], endPointId: newPt.id }
        const seg2 = { ...seg, id: uid('T'), vertices: [sp, ...vs.slice(subIdx + 1)], startPointId: newPt.id }
        const seg1Len = polylineLen(seg1.vertices)
        const seg2Len = polylineLen(seg2.vertices)
        onNetworkChange(
          s => s.filter(x => x.id !== seg.id).concat([seg1, seg2]),
          ptsUpdate,
          { [seg.id]: { seg1Id: seg1.id, seg1Len, seg2Id: seg2.id, seg2Len } }
        )
      } else {
        onNetworkChange(s => s, ptsUpdate)
      }
      if (placingEquipment.type !== 'emetteur' && placingEquipment.type !== 'terminalFroid') onPlacingDone()
      return
    }

    // ── Chaufferie placement mode ──
    // ── Chaufferie placement mode ──
    if (placingChaufferie) {
      let li = findLevelIndexAt(pos.y, lineYs)
      if (li < 0) li = (levels.length > 0 && lineYs.length > levels.length && pos.y <= lineYs[levels.length]) ? levels.length - 1 : 0
      const w = chaufferie.x2 - chaufferie.x1
      const newX1 = snap(pos.x - w / 2)
      onChaufferieChange({ ...chaufferie, placed: true, enabled: true, levelId: levels[li]?.id ?? chaufferie.levelId, x1: newX1, x2: newX1 + w })
      onPlacingChaufferieDone()
      return
    }

    // ── Local EF placement mode ──
    if (placingLocalEF) {
      let li = findLevelIndexAt(pos.y, lineYs)
      if (li < 0) li = (levels.length > 0 && lineYs.length > levels.length && pos.y <= lineYs[levels.length]) ? levels.length - 1 : 0
      const LEF_W = 270, LEF_H = 150
      const newX1 = snap(pos.x - LEF_W / 2)
      const newLEF = { id: uid('lef'), enabled: true, levelId: levels[li]?.id ?? levels[0]?.id, x1: newX1, x2: newX1 + LEF_W, height: LEF_H }
      onLocauxEFChange?.([...(locauxEF ?? []), newLEF])
      onPlacingLocalEFDone?.()
      return
    }

    // ── Local ECS placement mode ──
    if (placingLocalECS) {
      let li = findLevelIndexAt(pos.y, lineYs)
      if (li < 0) li = (levels.length > 0 && lineYs.length > levels.length && pos.y <= lineYs[levels.length]) ? levels.length - 1 : 0
      const W = 270, H = 150
      const newX1 = snap(pos.x - W / 2)
      const newZ = { id: uid('lecs'), enabled: true, levelId: levels[li]?.id ?? levels[0]?.id, x1: newX1, x2: newX1 + W, height: H }
      onLocauxECSChange?.([...(locauxECS ?? []), newZ])
      onPlacingLocalECSDone?.()
      return
    }

    // ── Local Chauffage placement mode ──
    if (placingLocalChauffage) {
      let li = findLevelIndexAt(pos.y, lineYs)
      if (li < 0) li = (levels.length > 0 && lineYs.length > levels.length && pos.y <= lineYs[levels.length]) ? levels.length - 1 : 0
      const W = 270, H = 150
      const newX1 = snap(pos.x - W / 2)
      const newZ = { id: uid('lch'), enabled: true, levelId: levels[li]?.id ?? levels[0]?.id, x1: newX1, x2: newX1 + W, height: H }
      onLocauxChauffageChange?.([...(locauxChauffage ?? []), newZ])
      onPlacingLocalChauffageDone?.()
      return
    }

    // ── Local Groupe Froid placement mode ──
    if (placingLocalGroupeFroid) {
      let li = findLevelIndexAt(pos.y, lineYs)
      if (li < 0) li = (levels.length > 0 && lineYs.length > levels.length && pos.y <= lineYs[levels.length]) ? levels.length - 1 : 0
      const W = 270, H = 150
      const newX1 = snap(pos.x - W / 2)
      const newZ = { id: uid('lgf'), enabled: true, levelId: levels[li]?.id ?? levels[0]?.id, x1: newX1, x2: newX1 + W, height: H }
      onLocauxGroupeFroidChange?.([...(locauxGroupeFroid ?? []), newZ])
      onPlacingLocalGroupeFroidDone?.()
      return
    }

    // ── Valve placement mode ──
    if (drawMode === 'draw' && pipeType === 'vanne') {
      let best = null, bestDist = Infinity
      for (const seg of segments) {
        const r = closestTOnPolyline(pos, seg.vertices)
        if (r && r.dist < bestDist) { bestDist = r.dist; best = { ...r, segId: seg.id } }
      }
      if (best && bestDist < 18) {
        const name = nameValve(best.segId, segToCol, valves ?? [], segments, points, levels, lineYs, columns, columnXs, chaufferie)
        onValvesChange(vs => [...vs, { id: uid('vv'), segmentId: best.segId, t: best.t, name }])
      }
      return
    }

    // ── Accessory placement mode ──
    if (placingAccessoryType) {
      let best = null, bestDist = Infinity
      for (const seg of segments) {
        const r = closestTOnPolyline(pos, seg.vertices)
        if (r && r.dist < bestDist) { bestDist = r.dist; best = { ...r, segId: seg.id } }
      }
      if (best && bestDist < 18) {
        onAccessoriesChange(acc => [...acc, { id: uid('ac'), segmentId: best.segId, t: best.t, type: placingAccessoryType }])
      }
      // persiste (pas de onPlacingAccessoryDone ici) — l'utilisateur place autant qu'il veut
      return
    }

    // ── Draw mode ──
    if (drawMode === 'draw') {

      // Point sub-mode: single click creates/splits
      if (pipeType === 'point') {
        const snapped = { x: snap(pos.x), y: snap(pos.y) }
        const { pos: sp, ptId, onSeg } = resolveSnap(snapped)
        if (!ptId) {
          if (onSeg) splitSegment(onSeg, sp)
          else onNetworkChange(s => s, p => [...p, { id: uid('P'), name: '', x: sp.x, y: sp.y }])
        }
        return
      }

      // Aller / Retour drawing
      const snapped = drawing
        ? ortho(drawing.vertices[drawing.vertices.length - 1], pos)
        : { x: snap(pos.x), y: snap(pos.y) }

      if (!drawing) {
        const { pos: sp, ptId, onSeg } = resolveSnap(snapped)
        // Bloquer le démarrage depuis un émetteur déjà saturé (2 tronçons)
        if (ptId) {
          const startPt = points.find(p => p.id === ptId)
          if ((startPt?.type === 'emetteur' || startPt?.type === 'terminalFroid') &&
              segments.filter(s => s.startPointId === ptId || s.endPointId === ptId).length >= 2) return
        }
        if (onSeg && !ptId) {
          const newPt = splitSegment(onSeg, sp)
          setDrawing({ vertices: [{ x: newPt.x, y: newPt.y }], startPtId: newPt.id, type: pipeType })
        } else {
          setDrawing({ vertices: [sp], startPtId: ptId, type: pipeType })
        }
      } else {
        // Priorité : si le clic brut est proche d'un nœud existant, finaliser vers ce nœud
        let rawNearPt = null, rawNearD = DRAW_SNAP
        for (const p of points) {
          const d = dist(p, pos)
          if (d < rawNearD) { rawNearD = d; rawNearPt = p }
        }
        if (rawNearPt) {
          const rawSegs = segments.filter(s => s.startPointId === rawNearPt.id || s.endPointId === rawNearPt.id).length
          if ((rawNearPt.type === 'emetteur' || rawNearPt.type === 'terminalFroid') && rawSegs >= 2) return
          finalize({ x: rawNearPt.x, y: rawNearPt.y }, rawNearPt.id)
        } else {
          const { pos: sp, ptId, onSeg } = resolveSnap(snapped)
          if (ptId) {
            const snapPt = points.find(p => p.id === ptId)
            const snapSegs = segments.filter(s => s.startPointId === ptId || s.endPointId === ptId).length
            if ((snapPt?.type === 'emetteur' || snapPt?.type === 'terminalFroid') && snapSegs >= 2) return
            finalize(sp, ptId)
          } else if (onSeg) {
            const newPt = splitSegment(onSeg, sp)
            finalize({ x: newPt.x, y: newPt.y }, newPt.id)
          } else {
            setDrawing(d => {
              const verts = collapseCollinear([...d.vertices, sp])
              return { ...d, vertices: verts }
            })
          }
        }
      }
      return
    }

    // ── Valve click/drag (select mode) ──
    if (!editParam && drawMode === 'select') {
      for (const valve of (valves ?? [])) {
        const seg = segments.find(s => s.id === valve.segmentId)
        if (!seg) continue
        const vpos = positionFromT(seg.vertices, valve.t)
        if (Math.hypot(pos.x - vpos.x, pos.y - vpos.y) < 12) {
          onSelectedValveChange(valve.id)
          onSelectedAccessoryChange?.(null)
          valveDragRef.current = { valveId: valve.id, segmentId: valve.segmentId, origT: valve.t, moved: false }
          return
        }
      }
    }

    // ── Accessory click/drag (select mode) ──
    if (!editParam && drawMode === 'select') {
      for (const acc of (accessories ?? [])) {
        const seg = segments.find(s => s.id === acc.segmentId)
        if (!seg) continue
        const apos = positionFromT(seg.vertices, acc.t)
        if (Math.hypot(pos.x - apos.x, pos.y - apos.y) < 14) {
          onSelectedAccessoryChange?.(acc.id)
          onSelectedValveChange?.(null)
          accessoryDragRef.current = { accessoryId: acc.id, segmentId: acc.segmentId, origT: acc.t, moved: false }
          return
        }
      }
    }

    // ── Attribution mode: segment assignment handled by onClick, block all other interactions ──
    if (editParam) return

    // ── Select mode ──

    // Bloc drag : tous les éléments sélectionnés → déplacement libre du bloc entier
    const allSelected = !e.shiftKey && selectedIds.length > 0
      && segments.length + points.length > 0
      && segments.every(s => selectedIds.includes(s.id))
      && points.every(p => selectedIds.includes(p.id))
    const hasLockedGroupe = !groupesEditMode && points.some(p => p.type === 'groupe' && selectedIds.includes(p.id))
    if (allSelected && !hasLockedGroupe) {
      const hitPt  = nearPt(pos)
      const hitSeg = nearestOnSegments(pos, hitSegs)
      if (hitPt || hitSeg) {
        blockDragRef.current = { startScreenX: e.clientX, startScreenY: e.clientY, moved: false }
        return
      }
    }

    const np = nearPt(pos)
    if (np) {
      onSelectedValveChange(null)
      onSelectedAccessoryChange?.(null)
      onSelectIds(ids => e.shiftKey
        ? ids.includes(np.id) ? ids.filter(i => i !== np.id) : [...ids, np.id]
        : [np.id])
      const connectedSegs = segments.filter(s => s.startPointId === np.id || s.endPointId === np.id)
      const canDrag = !np.isLocked && connectedSegs.length <= 2
        && (np.type !== 'groupe' || groupesEditMode)
      if (canDrag) {
        ptDragRef.current = {
          ptId: np.id, startX: e.clientX, startY: e.clientY,
          origX: np.x, origY: np.y, moved: false,
          constraint: np.type === 'groupe'
            ? (connectedSegs.length >= 1 ? getDragConstraint(np.id, segments) : null)
            : getDragConstraint(np.id, segments),
          lockedAxis: null,
          connectedCount: connectedSegs.length,
        }
      }
      return
    }
    const nsInfo = nearestOnSegments(pos, hitSegs)
    if (nsInfo) {
      onSelectedValveChange?.(null)
      onSelectedAccessoryChange?.(null)
      const ns = nsInfo.seg
      const { subIdx } = nsInfo
      onSelectIds(ids => e.shiftKey
        ? ids.includes(ns.id) ? ids.filter(i => i !== ns.id) : [...ids, ns.id]
        : [ns.id])
      const a = ns.vertices[subIdx], b = ns.vertices[subIdx + 1]
      const edgeDir = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
      const origPerp = edgeDir === 'h' ? a.y : a.x
      const { minDelta, maxDelta } = computeSegDeltaLimits(ns.id, subIdx, segments, points)
      segDragRef.current = { segId: ns.id, subIdx, dir: edgeDir, startScreenX: e.clientX, startScreenY: e.clientY, origPerp, moved: false, minDelta, maxDelta }
      return
    }

    // Empty space → rectangle de sélection (glisser) ou désélection (clic)
    onSelectedValveChange?.(null)
    onSelectedAccessoryChange?.(null)
    onSelectedLocalEFChange?.(null)
    onEditLocauxEFChange?.(false)
    onEditChaufferieChange?.(false)
    setRectSt(pos)
    setSelRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
  }, [tf, lineYs, drawMode, drawing, pipeType, nearPt,
      finalize, splitSegment, resolveSnap, deletePoint,
      segments, points, selectedIds, onNetworkChange, onSelectIds,
      placingEquipment, onPlacingDone,
      placingChaufferie, onPlacingChaufferieDone, levels, lineYs, chaufferie, onChaufferieChange,
      placingLocalEF, onPlacingLocalEFDone, locauxEF, onLocauxEFChange, onSelectedLocalEFChange,
      columns, columnXs, valves, onValvesChange, selectedValveId, onSelectedValveChange,
      accessories, onAccessoriesChange, placingAccessoryType, onSelectedAccessoryChange,
      connHighlightIds, onConnHighlight])

  // ── mouse up ──────────────────────────────────────────
  const onMouseUp = useCallback(e => {
    chaufferieSnapRef.current = false
    setPanSt(null)
    setDragLine(null)
    setDragCol(null)
    setDragCh(null)
    setDragLEF(null)
    setDragLECS(null)
    setDragLCh(null)
    setDragLGF(null)

    // Commit valve drag
    if (valveDragRef.current) {
      const { valveId, moved } = valveDragRef.current
      if (moved && valveDragT?.valveId === valveId) {
        onValvesChange(vs => vs.map(v => v.id === valveId
          ? { ...v, t: valveDragT.t, segmentId: valveDragT.segmentId ?? v.segmentId }
          : v))
      }
      valveDragRef.current = null
      setValveDragT(null)
      return
    }

    // Commit accessory drag
    if (accessoryDragRef.current) {
      const { accessoryId, moved } = accessoryDragRef.current
      if (moved && accessoryDragT?.accessoryId === accessoryId) {
        onAccessoriesChange(acc => acc.map(a => a.id === accessoryId
          ? { ...a, t: accessoryDragT.t, segmentId: accessoryDragT.segmentId ?? a.segmentId }
          : a))
      }
      accessoryDragRef.current = null
      setAccessoryDragT(null)
      return
    }

    // Commit point drag
    if (ptDragRef.current && ptDragRef.current.moved && ptDragPos) {
      const { ptId } = ptDragRef.current
      const np = { x: ptDragPos.x, y: ptDragPos.y }

      // Priority 1: overlapping another point → merge (productionECS > pump > regular)
      const dragged = points.find(p => p.id === ptId)
      if (dragged?.type === 'groupe') justMovedGroupeIdsRef.current.add(ptId)

      // Détection de proximité : PT_HIT classique OU nœud dans le rectangle de l'émetteur (28×18)
      const EM_W2 = 14, EM_H2 = 9  // demi-dimensions émetteur
      const inEmetteurRect = (emCenter, testPt) =>
        Math.abs(testPt.x - emCenter.x) <= EM_W2 && Math.abs(testPt.y - emCenter.y) <= EM_H2
      // Est-ce que p et np sont "proches" (en tenant compte du rect émetteur) ?
      const isTerminalType = (p) => p?.type === 'emetteur' || p?.type === 'terminalFroid'
      const isNear = (p) => {
        if (isTerminalType(p)) return inEmetteurRect(p, np)
        if (isTerminalType(dragged)) return inEmetteurRect(np, p)
        return dist(p, np) < PT_HIT
      }

      // Terminal (émetteur/terminalFroid) : retour à l'origine si nœud cible >2 tronçons
      if (isTerminalType(dragged)) {
        const blockingNode = points.find(p => {
          if (p.id === ptId || !isNear(p)) return false
          if (p.type === 'groupe' && segments.filter(s => s.startPointId === p.id || s.endPointId === p.id).length >= 1) return false
          return segments.filter(s => s.startPointId === p.id || s.endPointId === p.id).length > 2
        })
        if (blockingNode) {
          setPtDragPos(null)
          ptDragRef.current = null
          return
        }
      }

      // Nœud quelconque → terminal : retour à l'origine si le merge donnerait >2 tronçons au terminal
      if (!isTerminalType(dragged)) {
        const segsOfDragged = segments.filter(s => s.startPointId === ptId || s.endPointId === ptId).length
        const blockEmetteur = points.find(p => {
          if (p.id === ptId || !isNear(p)) return false
          if (!isTerminalType(p)) return false
          return segsOfDragged > 2
        })
        if (blockEmetteur) {
          setPtDragPos(null)
          ptDragRef.current = null
          return
        }
      }

      const overlap = points.find(p => {
        if (p.id === ptId || !isNear(p)) return false
        if (p.type === 'groupe' && segments.filter(s => s.startPointId === p.id || s.endPointId === p.id).length >= 1) return false
        // Émetteur déplacé → nœud cible >2 tronçons : bloquer
        if (isTerminalType(dragged)) {
          const segsOfP = segments.filter(s => s.startPointId === p.id || s.endPointId === p.id).length
          if (segsOfP > 2) return false
        }
        if (isTerminalType(p)) {
          const segsOfDragged = segments.filter(s => s.startPointId === ptId || s.endPointId === ptId).length
          if (segsOfDragged > 2) return false
        }
        return true
      })
      if (overlap && dragged) {
        const rank = p => (p?.type === 'productionECS' || p?.type === 'productionChauffage' || p?.type === 'productionEauGlacee') ? 3 : p?.type === 'groupe' ? 2 : (p?.type === 'pump' || p?.type === 'emetteur' || p?.type === 'terminalFroid') ? 1 : 0
        const draggedWins = rank(dragged) > rank(overlap)
        const winner = draggedWins ? dragged : overlap
        const loser  = draggedWins ? overlap : dragged
        const winPos = draggedWins ? np : { x: overlap.x, y: overlap.y }
        onNetworkChange(
          s => s.map(seg => {
            let vs = seg.vertices, sid = seg.startPointId, eid = seg.endPointId
            let sFixed = false, eFixed = false
            if (sid === loser.id) { vs = elbowVertices(vs, false, winPos); sid = winner.id; sFixed = true }
            if (eid === loser.id) { vs = elbowVertices(vs, true,  winPos); eid = winner.id; eFixed = true }
            if (draggedWins) {
              if (!sFixed && sid === winner.id) vs = elbowVertices(vs, false, winPos)
              if (!eFixed && eid === winner.id) vs = elbowVertices(vs, true,  winPos)
            }
            return { ...seg, vertices: vs, startPointId: sid, endPointId: eid }
          }).filter(s => s.startPointId !== s.endPointId),
          p => p
            .filter(x => x.id !== loser.id)
            .map(x => x.id === winner.id ? { ...x, x: winPos.x, y: winPos.y } : x)
        )
      } else {
        // Priority 2: dropping on a segment → split and become junction
        // (excluded for groupe de puisage: connection to segment extremities only)
        const exclude = new Set(
          segments.filter(s => s.startPointId === ptId || s.endPointId === ptId).map(s => s.id)
        )
        const hitSeg = nearestOnSegments(np, segments.filter(s => !exclude.has(s.id)))

        const segsOfDraggedForP2 = segments.filter(s => s.startPointId === ptId || s.endPointId === ptId).length
        if (hitSeg && hitSeg.d < SNAP && dragged?.type !== 'groupe' && !(dragged?.type === 'emetteur' && segsOfDraggedForP2 >= 1)) {
          const { seg, subIdx } = hitSeg
          const seg1 = { ...seg, id: uid('T'), vertices: [...seg.vertices.slice(0, subIdx + 1), np], endPointId: ptId }
          const seg2 = { ...seg, id: uid('T'), vertices: [np, ...seg.vertices.slice(subIdx + 1)], startPointId: ptId }
          const seg1Len = polylineLen(seg1.vertices)
          const seg2Len = polylineLen(seg2.vertices)
          onNetworkChange(
            s => {
              let r = s.filter(x => x.id !== seg.id)
              r = r.map(x => {
                if (x.startPointId === ptId) return { ...x, vertices: elbowVertices(x.vertices, false, np) }
                if (x.endPointId   === ptId) return { ...x, vertices: elbowVertices(x.vertices, true,  np) }
                return x
              })
              return r.concat([seg1, seg2])
            },
            p => p.map(x => x.id === ptId ? { ...x, ...np } : x),
            { [seg.id]: { seg1Id: seg1.id, seg1Len, seg2Id: seg2.id, seg2Len } }
          )
        } else {
          // Priority 3: move with cascade (maintains orthogonality for T/L junctions)
          const { newSegs, newPts } = computeNodeMove(ptId, np, segments, points, ptDragPos.effectiveConstraint)
          onNetworkChange(newSegs, newPts)
        }
      }
      setPtDragPos(null)
    }
    if (ptDragRef.current) ptDragRef.current = null

    // Commit segment drag
    if (segDragRef.current) {
      if (segDragState && segDragState.delta !== 0) {
        const moved = computeSegMove(segDragState.segId, segDragState.subIdx, segDragState.delta, segments, points)
        const { newSegs, newPts } = mergeCoincidentNodes(moved.newSegs, moved.newPts)
        // Annuler si un émetteur se retrouverait avec >2 tronçons, ou s'il a été absorbé par un nœud classique
        const emetteurIds = new Set(points.filter(p => p.type === 'emetteur' || p.type === 'terminalFroid').map(p => p.id))
        const hasInvalidEmetteur =
          newPts.some(p => (p.type === 'emetteur' || p.type === 'terminalFroid') &&
            newSegs.filter(s => s.startPointId === p.id || s.endPointId === p.id).length > 2) ||
          [...emetteurIds].some(id => !newPts.find(p => p.id === id))
        if (!hasInvalidEmetteur) onNetworkChange(newSegs, newPts)
      }
      setSegDragState(null)
      segDragRef.current = null
    }

    // Commit bloc drag
    if (blockDragRef.current) {
      if (blockDragState && blockDragRef.current.moved) {
        for (const id of selectedIds) {
          if (points.find(p => p.id === id && p.type === 'groupe'))
            justMovedGroupeIdsRef.current.add(id)
        }
        const { dx, dy } = blockDragState
        const newPts = points.map(p =>
          selectedIds.includes(p.id) ? { ...p, x: snap(p.x + dx), y: snap(p.y + dy) } : p)
        const newSegs = segments.map(s =>
          selectedIds.includes(s.id)
            ? { ...s, vertices: s.vertices.map(v => ({ x: snap(v.x + dx), y: snap(v.y + dy) })) }
            : s)
        onNetworkChange(newSegs, newPts)
      }
      setBlockDragState(null)
      blockDragRef.current = null
    }

    // Rect select (ou désélection si clic sans mouvement)
    if (rectSt && selRect) {
      const w = Math.abs(selRect.x2 - selRect.x1)
      const h = Math.abs(selRect.y2 - selRect.y1)
      if (w < 5 && h < 5) {
        if (!e.shiftKey) onSelectIds([])
      } else {
        const ids = []
        segments.forEach(s => { if (segInRect(s, selRect)) ids.push(s.id) })
        points.forEach(p => { if (ptInRect(p, selRect)) ids.push(p.id) })
        onSelectIds(prev => e.shiftKey ? [...new Set([...prev, ...ids])] : ids)
      }
      setRectSt(null); setSelRect(null)
    }
  }, [rectSt, selRect, segments, points, selectedIds, onSelectIds, ptDragPos, segDragState, blockDragState, onNetworkChange, lineYs, onValvesChange, valveDragT, onAccessoriesChange, accessoryDragT])

  // ── double-click → end segment ────────────────────────
  const onDblClick = useCallback(e => {
    if (drawMode !== 'draw' || !drawing || pipeType === 'point') return
    e.preventDefault()
    const pos = toCanvas(e, svgRef.current, tf)
    // Priorité : nœud proche du clic brut
    let rawNearPt = null, rawNearD = DRAW_SNAP
    for (const p of points) {
      const d = dist(p, pos)
      if (d < rawNearD) { rawNearD = d; rawNearPt = p }
    }
    if (rawNearPt) { finalize({ x: rawNearPt.x, y: rawNearPt.y }, rawNearPt.id); return }
    const snapped = drawing.vertices.length
      ? ortho(drawing.vertices[drawing.vertices.length - 1], pos)
      : { x: snap(pos.x), y: snap(pos.y) }
    const { pos: sp, ptId, onSeg } = resolveSnap(snapped)
    if (ptId) {
      finalize(sp, ptId)
    } else if (onSeg) {
      const newPt = splitSegment(onSeg, sp)
      finalize({ x: newPt.x, y: newPt.y }, newPt.id)
    } else {
      finalize(sp, null)
    }
  }, [drawMode, drawing, pipeType, tf, finalize, splitSegment, resolveSnap, points])

  // ── preview ───────────────────────────────────────────
  const previewTgt  = drawing && pipeType !== 'point'
    ? ortho(drawing.vertices[drawing.vertices.length - 1], mouse) : null

  // Détecter un snap vers un nœud existant — utilise la position brute de la souris
  const previewSnap = (() => {
    if (!drawing || pipeType === 'point') return null
    const lastV = drawing.vertices[drawing.vertices.length - 1]
    let best = null, bestD = DRAW_SNAP
    for (const p of points) {
      const d = dist(p, mouse)
      if (d < bestD) { bestD = d; best = p }
    }
    if (!best) return null
    const pdx = best.x - lastV.x, pdy = best.y - lastV.y
    const elbow = (Math.abs(pdx) > 0 && Math.abs(pdy) > 0)
      ? (Math.abs(pdx) >= Math.abs(pdy) ? { x: best.x, y: lastV.y } : { x: lastV.x, y: best.y })
      : null
    return { snapPt: best, elbow }
  })()

  const previewPath = previewTgt
    ? (() => {
        const tgt   = previewSnap ? previewSnap.snapPt : previewTgt
        const extra = previewSnap?.elbow ? [previewSnap.elbow] : []
        return [...drawing.vertices, ...extra, tgt].map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ')
      })()
    : null

  const cursor = dragLine !== null ? 'ns-resize'
    : dragCol !== null ? 'ew-resize'
    : dragCh?.type === 'top' ? 'ns-resize'
    : dragCh?.type === 'left' || dragCh?.type === 'right' ? 'ew-resize'
    : dragCh?.type === 'move' ? 'move'
    : dragLEF?.type === 'top' ? 'ns-resize'
    : dragLEF?.type === 'left' || dragLEF?.type === 'right' ? 'ew-resize'
    : dragLEF?.type === 'move' ? 'move'
    : placingEquipment !== null || placingChaufferie || placingLocalEF ? 'crosshair'
    : panSt ? 'grabbing'
    : blockDragRef.current?.moved ? 'move'
    : segDragState ? 'move'
    : ptDragRef.current?.moved ? 'move'
    : spaceRef.current ? 'grab'
    : drawMode === 'draw' ? 'crosshair'
    : 'default'

  const zones      = levels.map((lvl, i) => ({ ...lvl, yBot: lineYs[i], yTop: lineYs[i + 1] }))
  const leftMargin = (columnXs ?? [])[0] ?? 0
  const contentW   = ((columnXs ?? []).at(-1) ?? 0) + leftMargin
  const frontierYs = getFrontierYs(levels, lineYs)

  // Live drag overrides for rendering
  const { renderSegs, renderPts } = (() => {
    if (blockDragState) {
      const { dx, dy } = blockDragState
      return {
        renderSegs: segments.map(s => selectedIds.includes(s.id)
          ? { ...s, vertices: s.vertices.map(v => ({ x: v.x + dx, y: v.y + dy })) } : s),
        renderPts: points.map(p => selectedIds.includes(p.id)
          ? { ...p, x: p.x + dx, y: p.y + dy } : p),
      }
    }
    if (segDragState) {
      const { newSegs, newPts } = computeSegMove(segDragState.segId, segDragState.subIdx, segDragState.delta, segments, points)
      return { renderSegs: newSegs, renderPts: newPts }
    }
    if (ptDragPos) {
      const { newSegs, newPts } = computeNodeMove(ptDragPos.ptId, { x: ptDragPos.x, y: ptDragPos.y }, segments, points, ptDragPos.effectiveConstraint)
      return { renderSegs: newSegs, renderPts: newPts }
    }
    return { renderSegs: segments, renderPts: points }
  })()

  const visRenderSegs = renderSegs
  const visRenderPts  = renderPts

  // ── SVG sub-layer render functions ───────────────────────────────────────
  // Each captures component state via closure; same output as inline JSX.

  const renderBackground = () => (
    <>
      {zones.map((z, i) => (
        <g key={z.id}>
          <rect x={0} y={z.yTop} width={contentW} height={z.yBot - z.yTop}
            fill={i % 2 === 0 ? '#ffffff' : '#f8fafc'} />
          <text x={14} y={(z.yTop + z.yBot) / 2 + 5}
            fontSize={12} fill="#d1d8e0" fontWeight="700"
            style={{ userSelect: 'none', pointerEvents: 'none' }}>
            {z.name}
          </text>
        </g>
      ))}
      {(columns ?? []).map((col, i) => {
        const x1 = (columnXs ?? [])[i], x2 = (columnXs ?? [])[i + 1]
        if (x1 === undefined || x2 === undefined) return null
        let yBot, yTop
        if (col.levelIds === 'all') {
          yBot = lineYs[0]; yTop = lineYs[lineYs.length - 1]
        } else {
          const idxs = (Array.isArray(col.levelIds) ? col.levelIds : [])
            .map(id => levels.findIndex(l => l.id === id)).filter(x => x >= 0)
          if (!idxs.length) return null
          yBot = lineYs[Math.min(...idxs)]
          yTop = lineYs[Math.max(...idxs) + 1]
        }
        // PP zone gap column: render its left separator border
        if (col.isPPZone) {
          const hasGroupe = (points ?? []).some(p => p.type === 'groupe' && p.colId === col.colId)
          if (!hasGroupe) return <g key={col.id} />
          const prevCol = (columns ?? [])[i - 1]
          const showLeftBorder = !prevCol || !(prevCol.isGap && !prevCol.isPPZone)
          return (
            <g key={col.id} style={{ pointerEvents: 'none' }}>
              {showLeftBorder && <line x1={x1} y1={yTop} x2={x1} y2={yBot} stroke="#d1d9e6" strokeWidth={1} />}
            </g>
          )
        }
        if (col.isGap) return <g key={col.id} />
        // Regular pipe column: left border + name; also draw right border if next col won't
        const nextCol = (columns ?? [])[i + 1]
        // Draw right border only if next entity won't draw its own left border (i.e. regular gap or no next col)
        const drawRightBorder = !nextCol || (nextCol.isGap && !nextCol.isPPZone)
        return (
          <g key={col.id} style={{ pointerEvents: 'none' }}>
            <line x1={x1} y1={yTop} x2={x1} y2={yBot} stroke="#d1d9e6" strokeWidth={1} />
            {drawRightBorder && <line x1={x2} y1={yTop} x2={x2} y2={yBot} stroke="#d1d9e6" strokeWidth={1} />}
            <text x={(x1 + x2) / 2} y={yTop + 16} fontSize={12} fill="#b8c0cc" fontWeight="600"
              textAnchor="middle" style={{ userSelect: 'none' }}>
              {col.name}
            </text>
          </g>
        )
      })}
    </>
  )

  const renderLevelLines = () => (
    <>
      {lineYs.map((y, i) => {
        const isToiture  = i === lineYs.length - 1
        const isFrontier = frontierYs.includes(y)
        return (
          <g key={`ln${i}`}>
            <line x1={0} y1={y} x2={contentW} y2={y}
              stroke={isToiture ? '#94a3b8' : isFrontier ? '#8899b0' : '#cbd5e1'}
              strokeWidth={isToiture || isFrontier ? 1.5 : 1}
              strokeDasharray={isToiture ? '8,5' : 'none'} />
            {isToiture && (
              <text x={14} y={y - 5} fontSize={10} fill="#94a3b8" fontWeight="600"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>Toiture</text>
            )}
            {isFrontier && (
              <text x={14} y={y - 5} fontSize={10} fill="#8899b0" fontWeight="600"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>Séparation sous-sol</text>
            )}
            {editLevelsEnabled && (
              <rect x={0} y={y - 6} width={contentW} height={12}
                fill="transparent" style={{ cursor: 'ns-resize' }}
                onMouseDown={ev => { ev.stopPropagation(); setDragLine({ idx: i, screenY: ev.clientY, origY: y }) }} />
            )}
          </g>
        )
      })}
    </>
  )

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%', display: 'block', background: '#f8fafc', cursor }}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onDoubleClick={onDblClick}
      onContextMenu={e => e.preventDefault()}
    >
      <g transform={`translate(${tf.x},${tf.y}) scale(${tf.k})`}>

        {renderBackground()}

        {/* Regular column boundary drag handles — skip PP zone boundaries */}
        {editColumnsEnabled && (columnXs ?? []).map((x, i) => {
          const colAtIdx  = (columns ?? [])[i]
          const colBefore = (columns ?? [])[i - 1]
          if (colAtIdx?.isPPZone || colBefore?.isPPZone) return null
          return (
            <rect key={`cdrag${i}`}
              x={x - 5} y={lineYs[lineYs.length - 1]}
              width={10} height={Math.max(0, lineYs[0] - lineYs[lineYs.length - 1])}
              fill="transparent" style={{ cursor: 'ew-resize' }}
              onMouseDown={ev => {
                ev.stopPropagation()
                setDragCol({ idx: i, screenX: ev.clientX, origX: x, isPPZone: false })
              }} />
          )
        })}

        {/* PP zone slide handles — both left and right borders slide the whole PP zone */}
        {editColumnsEnabled && (columns ?? []).map((col, i) => {
          if (!col.isPPZone) return null
          const x1 = (columnXs ?? [])[i], x2 = (columnXs ?? [])[i + 1]
          if (x1 === undefined || x2 === undefined) return null
          const ppWidth = x2 - x1
          const h = Math.max(0, lineYs[0] - lineYs[lineYs.length - 1])
          const yBase = lineYs[lineYs.length - 1]
          const startDrag = ev => {
            ev.stopPropagation()
            setDragCol({ idx: i, screenX: ev.clientX, origX: x1, isPPZone: true, ppZoneId: col.id, ppWidth })
          }
          return (
            <g key={`ppdrag${col.id}`}>
              <rect x={x1 - 5} y={yBase} width={10} height={h} fill="transparent" style={{ cursor: 'ew-resize' }} onMouseDown={startDrag} />
              <rect x={x2 - 5} y={yBase} width={10} height={h} fill="transparent" style={{ cursor: 'ew-resize' }} onMouseDown={startDrag} />
            </g>
          )
        })}

        {/* Locaux EF */}
        {(locauxEF ?? []).filter(lef => lef.enabled).map(lef => {
          const levelIdx = levels.findIndex(l => l.id === lef.levelId)
          if (levelIdx < 0 || levelIdx >= lineYs.length) return null
          const yBot = lineYs[levelIdx]
          const yTop = yBot - lef.height
          const { x1, x2 } = lef
          const H = 6
          const isSel = selectedLocalEFId === lef.id
          return (
            <g key={lef.id}>
              <rect x={x1} y={yTop} width={x2 - x1} height={lef.height}
                fill="rgba(0,0,0,0.02)" stroke="#6b7280" strokeWidth={1.5}
                style={{ pointerEvents: 'none' }} />
              <text x={(x1 + x2) / 2} y={yTop + 13}
                fontSize={10} fill="#6b7280" fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>Local EF</text>
              {editLocauxEF && (isSel ? (
                <>
                  <rect x={x1 + H} y={yTop + H} width={x2 - x1 - H * 2} height={lef.height - H * 2}
                    fill="transparent" style={{ cursor: 'move' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLEF({ type: 'move', localEFId: lef.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: lef.height, origCenterY: yBot - lef.height / 2 }) }} />
                  <rect x={x1} y={yTop - H} width={x2 - x1} height={H * 2}
                    fill="transparent" style={{ cursor: 'ns-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLEF({ type: 'top', localEFId: lef.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: lef.height }) }} />
                  <rect x={x1 - H} y={yTop} width={H * 2} height={lef.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLEF({ type: 'left', localEFId: lef.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: lef.height }) }} />
                  <rect x={x2 - H} y={yTop} width={H * 2} height={lef.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLEF({ type: 'right', localEFId: lef.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: lef.height }) }} />
                </>
              ) : (
                <rect x={x1} y={yTop} width={x2 - x1} height={lef.height}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onMouseDown={ev => {
                    ev.stopPropagation()
                    onSelectedLocalEFChange?.(lef.id)
                    onSelectIds([])
                    onSelectedValveChange?.(null)
                    onSelectedAccessoryChange?.(null)
                  }} />
              ))}
            </g>
          )
        })}

        {/* Locaux ECS */}
        {(locauxECS ?? []).filter(z => z.enabled).map(z => {
          const levelIdx = levels.findIndex(l => l.id === z.levelId)
          if (levelIdx < 0 || levelIdx >= lineYs.length) return null
          const yBot = lineYs[levelIdx]
          const yTop = yBot - z.height
          const { x1, x2 } = z
          const H = 6
          const isSel = selectedLocalECSId === z.id
          const stroke = '#6b7280', fillHover = 'rgba(0,0,0,0.02)'
          return (
            <g key={z.id}>
              <rect x={x1} y={yTop} width={x2 - x1} height={z.height}
                fill={fillHover} stroke={stroke} strokeWidth={1.5}
                style={{ pointerEvents: 'none' }} />
              <text x={(x1 + x2) / 2} y={yTop + 13}
                fontSize={10} fill={stroke} fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>Local ECS</text>
              {editLocauxECS && (isSel ? (
                <>
                  <rect x={x1 + H} y={yTop + H} width={x2 - x1 - H * 2} height={z.height - H * 2}
                    fill="transparent" style={{ cursor: 'move' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLECS({ type: 'move', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height, origCenterY: yBot - z.height / 2 }) }} />
                  <rect x={x1} y={yTop - H} width={x2 - x1} height={H * 2}
                    fill="transparent" style={{ cursor: 'ns-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLECS({ type: 'top', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height }) }} />
                  <rect x={x1 - H} y={yTop} width={H * 2} height={z.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLECS({ type: 'left', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height }) }} />
                  <rect x={x2 - H} y={yTop} width={H * 2} height={z.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLECS({ type: 'right', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height }) }} />
                </>
              ) : (
                <rect x={x1} y={yTop} width={x2 - x1} height={z.height}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onMouseDown={ev => {
                    ev.stopPropagation()
                    onSelectedLocalECSChange?.(z.id)
                    onSelectIds([])
                    onSelectedValveChange?.(null)
                    onSelectedAccessoryChange?.(null)
                  }} />
              ))}
            </g>
          )
        })}

        {/* Locaux Chauffage */}
        {(locauxChauffage ?? []).filter(z => z.enabled).map(z => {
          const levelIdx = levels.findIndex(l => l.id === z.levelId)
          if (levelIdx < 0 || levelIdx >= lineYs.length) return null
          const yBot = lineYs[levelIdx]
          const yTop = yBot - z.height
          const { x1, x2 } = z
          const H = 6
          const isSel = selectedLocalChauffageId === z.id
          const stroke = '#6b7280', fillHover = 'rgba(0,0,0,0.02)'
          return (
            <g key={z.id}>
              <rect x={x1} y={yTop} width={x2 - x1} height={z.height}
                fill={fillHover} stroke={stroke} strokeWidth={1.5}
                style={{ pointerEvents: 'none' }} />
              <text x={(x1 + x2) / 2} y={yTop + 13}
                fontSize={10} fill={stroke} fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>Local chauffage</text>
              {editLocauxChauffage && (isSel ? (
                <>
                  <rect x={x1 + H} y={yTop + H} width={x2 - x1 - H * 2} height={z.height - H * 2}
                    fill="transparent" style={{ cursor: 'move' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLCh({ type: 'move', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height, origCenterY: yBot - z.height / 2 }) }} />
                  <rect x={x1} y={yTop - H} width={x2 - x1} height={H * 2}
                    fill="transparent" style={{ cursor: 'ns-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLCh({ type: 'top', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height }) }} />
                  <rect x={x1 - H} y={yTop} width={H * 2} height={z.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLCh({ type: 'left', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height }) }} />
                  <rect x={x2 - H} y={yTop} width={H * 2} height={z.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLCh({ type: 'right', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height }) }} />
                </>
              ) : (
                <rect x={x1} y={yTop} width={x2 - x1} height={z.height}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onMouseDown={ev => {
                    ev.stopPropagation()
                    onSelectedLocalChauffageChange?.(z.id)
                    onSelectIds([])
                    onSelectedValveChange?.(null)
                    onSelectedAccessoryChange?.(null)
                  }} />
              ))}
            </g>
          )
        })}

        {/* Locaux Groupe Froid */}
        {(locauxGroupeFroid ?? []).filter(z => z.enabled).map(z => {
          const levelIdx = levels.findIndex(l => l.id === z.levelId)
          if (levelIdx < 0 || levelIdx >= lineYs.length) return null
          const yBot = lineYs[levelIdx]
          const yTop = yBot - z.height
          const { x1, x2 } = z
          const H = 6
          const isSel = selectedLocalGroupeFroidId === z.id
          const stroke = '#6b7280', fillHover = 'rgba(0,0,0,0.02)'
          return (
            <g key={z.id}>
              <rect x={x1} y={yTop} width={x2 - x1} height={z.height}
                fill={fillHover} stroke={stroke} strokeWidth={1.5}
                style={{ pointerEvents: 'none' }} />
              <text x={(x1 + x2) / 2} y={yTop + 13}
                fontSize={10} fill={stroke} fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>Local groupe froid</text>
              {editLocauxGroupeFroid && (isSel ? (
                <>
                  <rect x={x1 + H} y={yTop + H} width={x2 - x1 - H * 2} height={z.height - H * 2}
                    fill="transparent" style={{ cursor: 'move' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLGF({ type: 'move', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height, origCenterY: yBot - z.height / 2 }) }} />
                  <rect x={x1} y={yTop - H} width={x2 - x1} height={H * 2}
                    fill="transparent" style={{ cursor: 'ns-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLGF({ type: 'top', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height }) }} />
                  <rect x={x1 - H} y={yTop} width={H * 2} height={z.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLGF({ type: 'left', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height }) }} />
                  <rect x={x2 - H} y={yTop} width={H * 2} height={z.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragLGF({ type: 'right', id: z.id, screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: z.height }) }} />
                </>
              ) : (
                <rect x={x1} y={yTop} width={x2 - x1} height={z.height}
                  fill="transparent" style={{ cursor: 'pointer' }}
                  onMouseDown={ev => {
                    ev.stopPropagation()
                    onSelectedLocalGroupeFroidChange?.(z.id)
                    onSelectIds([])
                    onSelectedValveChange?.(null)
                    onSelectedAccessoryChange?.(null)
                  }} />
              ))}
            </g>
          )
        })}

        {/* Chaufferie / Production ECS / Chaufferie */}
        {chaufferie?.enabled && (() => {
          const levelIdx = levels.findIndex(l => l.id === chaufferie.levelId)
          if (levelIdx < 0 || levelIdx >= lineYs.length) return null
          const yBot = lineYs[levelIdx]
          const yTop = yBot - chaufferie.height
          const { x1, x2 } = chaufferie
          const H = 6
          const localStroke = '#6b7280'
          const localFill   = 'rgba(0,0,0,0.02)'
          const localLabel  = isAlimEF ? 'Local EF' : isChauffage ? 'Chaufferie' : isEauGlacee ? 'Groupe froid' : 'Production ECS'
          return (
            <g key="chaufferie">
              <rect x={x1} y={yTop} width={x2 - x1} height={chaufferie.height}
                fill={localFill} stroke={localStroke} strokeWidth={1.5}
                style={{ pointerEvents: 'none' }} />
              <text x={(x1 + x2) / 2} y={yTop + 13}
                fontSize={10} fill={localStroke} fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>{localLabel}</text>
              {editChaufferie && (
                <>
                  <rect x={x1 + H} y={yTop + H} width={x2 - x1 - H * 2} height={chaufferie.height - H * 2}
                    fill="transparent" style={{ cursor: 'move' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragCh({ type: 'move', screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: chaufferie.height, origCenterY: yBot - chaufferie.height / 2 }) }} />
                  <rect x={x1} y={yTop - H} width={x2 - x1} height={H * 2}
                    fill="transparent" style={{ cursor: 'ns-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragCh({ type: 'top', screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: chaufferie.height }) }} />
                  <rect x={x1 - H} y={yTop} width={H * 2} height={chaufferie.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragCh({ type: 'left', screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: chaufferie.height }) }} />
                  <rect x={x2 - H} y={yTop} width={H * 2} height={chaufferie.height}
                    fill="transparent" style={{ cursor: 'ew-resize' }}
                    onMouseDown={ev => { ev.stopPropagation(); setDragCh({ type: 'right', screenX: ev.clientX, screenY: ev.clientY, origX1: x1, origX2: x2, origHeight: chaufferie.height }) }} />
                </>
              )}
            </g>
          )
        })()}

        {renderLevelLines()}

        {/* Segments */}
        {visRenderSegs.map(seg => {
          const sel  = selectedIds.includes(seg.id)
          const _dp  = isAlimEF   ? (displayPrefs?.ef        ?? DEFAULT_DISPLAY_PREFS.ef)
            : isChauffage ? (displayPrefs?.chauffage  ?? DEFAULT_DISPLAY_PREFS.chauffage)
            : isEauGlacee ? (displayPrefs?.eauglacee  ?? DEFAULT_DISPLAY_PREFS.eauglacee)
            : (displayPrefs?.ecs ?? DEFAULT_DISPLAY_PREFS.ecs)
          const col  = seg.type === 'retour' ? _dp.colorRetour : _dp.colorAller
          const _sw  = _dp.strokeWidth
          const dash = (seg.type === 'retour' && !isAlimEF) ? '10,6' : 'none'
          const path = seg.vertices.map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ')

          // Edit-params coloring
          let editStyle = null
          if (editParam) {
            const { paramType, segType, materialId, dn, insulationId, thickness,
                    length, flowVelocityMode, flowVelocityValue } = editParam
            if (paramType === 'type' && segType) {
              editStyle = seg.type === segType ? 'match' : 'other'
            } else if (paramType === 'material' && materialId && dn) {
              if (seg.materialId === materialId && seg.dn === dn) editStyle = 'match'
              else if (!seg.materialId || !seg.dn) editStyle = 'missing'
              else editStyle = 'other'
            } else if (paramType === 'insulation' && insulationId) {
              const thickOk = thickness == null || String(seg.thickness) === String(thickness)
              if (seg.insulationId === insulationId && thickOk) editStyle = 'match'
              else if (!seg.insulationId) editStyle = 'missing'
              else editStyle = 'other'
            } else if (paramType === 'length') {
              if (length != null) {
                if (seg.length_override === length) editStyle = 'match'
                else if (seg.length_override == null) editStyle = 'missing'
                else editStyle = 'other'
              } else {
                editStyle = seg.length_override != null ? 'match' : 'missing'
              }
            } else if (paramType === 'flowVelocity') {
              // Antennes bouclage-ecs : toujours grisées, non assignables
              if (isBouclage && roleMap?.get(seg.id) === 'antenne') {
                editStyle = 'other'
              } else {
                const hasAny = seg.flowRate != null || seg.velocity != null
                if (flowVelocityValue != null) {
                  const storedMatch = flowVelocityMode === 'flowRate'
                    ? seg.flowRate === flowVelocityValue
                    : seg.velocity === flowVelocityValue
                  editStyle = storedMatch ? 'match'
                    : hasAny ? 'other' : 'missing'
                } else {
                  editStyle = hasAny ? 'match' : 'missing'
                }
              }
            }
          }

          // connHighlight: highlighted segment → normal color, others → light gray
          const isHighlighted = connHighlightIds?.length > 0 && connHighlightIds.includes(seg.id)
          const isGrayed      = connHighlightIds?.length > 0 && !connHighlightIds.includes(seg.id)

          // criticalPath: chemin défavorisé → bleu sélection, autres → atténués
          const hasCritPath    = criticalPathIds != null && criticalPathIds.length > 0
          const isCriticalPath = hasCritPath && criticalPathIds!.includes(seg.id)
          const isCritDimmed   = hasCritPath && !isCriticalPath

          // match=green · missing=red(ECS)/blue(EF|EG) · other=gray · dash always follows segment type
          const missingColor = (isAlimEF || isEauGlacee) ? '#93c5fd' : '#ef4444'
          const strokeColor = isGrayed || isCritDimmed ? '#d1d5db'
            : editStyle === 'match'   ? '#16a34a'
            : editStyle === 'missing' ? missingColor
            : editStyle === 'other'   ? '#9ca3af'
            : isCriticalPath ? '#2563eb'
            : sel ? (isAlimEF || isEauGlacee ? '#f97316' : '#2563eb') : col
          const strokeW = isGrayed || isCritDimmed ? 1
            : editStyle === 'match' ? 3 : editStyle === 'missing' ? 2 : editStyle === 'other' ? 1
            : isCriticalPath ? _sw + 2
            : sel ? _sw + 1 : _sw
          const segDash = (sel || isCriticalPath) ? 'none' : dash
          const opacity = 1

          return (
            <g key={seg.id}>
              <path d={path} stroke="transparent" strokeWidth={14} fill="none"
                style={{ cursor: editParam ? 'pointer' : drawMode === 'delete' ? 'crosshair' : 'pointer' }}
                onClick={ev => {
                  if (drawMode === 'delete') return
                  ev.stopPropagation()
                  if (editParam) {
                    const isLockedAntenne = isBouclage
                      && editParam.paramType === 'flowVelocity'
                      && roleMap?.get(seg.id) === 'antenne'
                    if (!isLockedAntenne) onAssignParam(seg.id)
                    return
                  }
                  onSelectIds(ids => ev.shiftKey
                    ? ids.includes(seg.id) ? ids.filter(i => i !== seg.id) : [...ids, seg.id]
                    : [seg.id])
                }} />
              <path d={path}
                stroke={strokeColor} strokeWidth={strokeW}
                strokeDasharray={segDash} fill="none"
                style={{ pointerEvents: 'none' }} />

              {seg.showDN && seg.dn && (() => {
                const vs = seg.vertices
                if (vs.length < 2) return null
                let totalLen = 0
                for (let i = 0; i < vs.length - 1; i++) totalLen += Math.hypot(vs[i+1].x - vs[i].x, vs[i+1].y - vs[i].y)
                let cumLen = 0, mid = vs[0], edgeDir = 'h'
                const half = totalLen / 2
                for (let i = 0; i < vs.length - 1; i++) {
                  const sl = Math.hypot(vs[i+1].x - vs[i].x, vs[i+1].y - vs[i].y)
                  if (cumLen + sl >= half) {
                    const t = (half - cumLen) / sl
                    mid = { x: vs[i].x + t * (vs[i+1].x - vs[i].x), y: vs[i].y + t * (vs[i+1].y - vs[i].y) }
                    edgeDir = Math.abs(vs[i+1].x - vs[i].x) >= Math.abs(vs[i+1].y - vs[i].y) ? 'h' : 'v'
                    break
                  }
                  cumLen += sl
                }
                const lbl = seg.dn
                const tw = lbl.length * 5 + 6
                const BH = 11, OFF = 7
                if (edgeDir === 'h') {
                  return (
                    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      <rect x={mid.x - tw/2} y={mid.y + OFF - 1} width={tw} height={BH}
                        fill="rgba(255,255,255,0.88)" stroke={col} strokeWidth={0.3} rx={2} />
                      <text x={mid.x} y={mid.y + OFF + BH/2 - 1}
                        fontSize={8} fill={col} fontWeight="600"
                        textAnchor="middle" dominantBaseline="central">{lbl}</text>
                    </g>
                  )
                }
                return (
                  <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    <rect x={mid.x + OFF - 1} y={mid.y - BH/2} width={tw} height={BH}
                      fill="rgba(255,255,255,0.88)" stroke={col} strokeWidth={0.3} rx={2} />
                    <text x={mid.x + OFF + 1} y={mid.y}
                      fontSize={8} fill={col} fontWeight="600"
                      textAnchor="start" dominantBaseline="central">{lbl}</text>
                  </g>
                )
              })()}
              {seg.showFlowRate && (() => {
                const resolved = networkFlows?.get(seg.id)
                const displayQ = seg.flowRate ?? resolved?.flowRate
                const displayV = seg.velocity ?? resolved?.velocity
                if (displayQ == null && displayV == null) return null
                const vs = seg.vertices
                if (vs.length < 2) return null
                let totalLen = 0
                for (let i = 0; i < vs.length - 1; i++) totalLen += Math.hypot(vs[i+1].x - vs[i].x, vs[i+1].y - vs[i].y)
                let cumLen = 0, mid = vs[0], edgeDir = 'h'
                const half = totalLen / 2
                for (let i = 0; i < vs.length - 1; i++) {
                  const sl = Math.hypot(vs[i+1].x - vs[i].x, vs[i+1].y - vs[i].y)
                  if (cumLen + sl >= half) {
                    const t = (half - cumLen) / sl
                    mid = { x: vs[i].x + t * (vs[i+1].x - vs[i].x), y: vs[i].y + t * (vs[i+1].y - vs[i].y) }
                    edgeDir = Math.abs(vs[i+1].x - vs[i].x) >= Math.abs(vs[i+1].y - vs[i].y) ? 'h' : 'v'
                    break
                  }
                  cumLen += sl
                }
                const lbl = displayQ != null ? `${sf(displayQ, 3)} m³/h` : `${sf(displayV, 3)} m/s`
                const tw = lbl.length * 5 + 6
                const BH = 11, OFF = 7
                if (edgeDir === 'h') {
                  return (
                    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      <rect x={mid.x - tw/2} y={mid.y - OFF - BH + 1} width={tw} height={BH}
                        fill="rgba(255,255,255,0.88)" stroke={col} strokeWidth={0.3} rx={2} />
                      <text x={mid.x} y={mid.y - OFF - BH/2 + 1}
                        fontSize={8} fill={col} fontWeight="600"
                        textAnchor="middle" dominantBaseline="central">{lbl}</text>
                    </g>
                  )
                }
                return (
                  <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    <rect x={mid.x - OFF - tw + 1} y={mid.y - BH/2} width={tw} height={BH}
                      fill="rgba(255,255,255,0.88)" stroke={col} strokeWidth={0.3} rx={2} />
                    <text x={mid.x - OFF - 1} y={mid.y}
                      fontSize={8} fill={col} fontWeight="600"
                      textAnchor="end" dominantBaseline="central">{lbl}</text>
                  </g>
                )
              })()}
              {(() => {
                // lines: [{text, red?}]
                const lines = []
                if (canvasDisplay?.nomTroncon) {
                  const name = getDisplayName(seg, renderSegs, levels, lineYs, columns, columnXs, chaufferie, renderPts, roleMap?.get(seg.id), activeCalcId, roleMap, flowDirections)
                  if (name) lines.push({ text: name })
                }
                if (canvasDisplay?.length && seg.length_override != null) {
                  lines.push({ text: `${seg.length_override} m` })
                }
                if (canvasDisplay?.material || canvasDisplay?.dn) {
                  const mat = materials?.find(m => m.id === seg.materialId)
                  if (canvasDisplay?.material && canvasDisplay?.dn && seg.dn) {
                    lines.push({ text: mat ? `${mat.name} ${seg.dn}` : seg.dn })
                  } else if (canvasDisplay?.material && mat) {
                    lines.push({ text: mat.name })
                  } else if (canvasDisplay?.dn && seg.dn) {
                    lines.push({ text: seg.dn })
                  }
                }
                if (canvasDisplay?.insulation && seg.insulationId) {
                  const ins = insulations?.find(i => i.id === seg.insulationId)
                  if (ins) lines.push({ text: seg.thickness != null ? `${ins.name} ${seg.thickness}mm` : ins.name })
                }
                if (canvasDisplay?.debit) {
                  if (isAlimMode) {
                    const ar = alimentationResults?.get(seg.id)
                    if (ar?.flowRateForPdc != null && ar.flowRateForPdc > 0)
                      lines.push({ text: `${ar.flowRateForPdc.toFixed(2)} l/s` })
                  } else if (isChauffage || isEauGlacee) {
                    const flow = activeTerminalFlows?.get(seg.id)
                    if (flow?.flowRate != null && flow.flowRate > 0)
                      lines.push({ text: `${flow.flowRate.toFixed(3)} m³/h` })
                  } else if (roleMap?.get(seg.id) !== 'antenne') {
                    const flow = networkFlows?.get(seg.id)
                    if (flow?.flowRate != null) lines.push({ text: `${flow.flowRate.toFixed(3)} m³/h` })
                  }
                }
                if (canvasDisplay?.vitesse) {
                  if (isAlimMode) {
                    const ar = alimentationResults?.get(seg.id)
                    const flowLs = ar?.flowRateForPdc ?? null
                    const dnDef = (() => {
                      const mat = seg.materialId ? materials?.find(m => m.id === seg.materialId) : null
                      return mat && seg.dn ? mat.dns?.find(d => d.dn === seg.dn) : null
                    })()
                    const di_mm = seg.di_override ?? dnDef?.di ?? null
                    const area = di_mm ? Math.PI * (di_mm / 1000) ** 2 / 4 : null
                    const v = area && flowLs != null && flowLs > 0 ? (flowLs * 1e-3) / area : null
                    if (v != null) lines.push({ text: `${sf(v, 2)} m/s`, orange: v > 1.5 && v <= 2.0, red: v > 2.0 })
                  } else if (isChauffage || isEauGlacee) {
                    const flow = activeTerminalFlows?.get(seg.id)
                    if (flow?.velocity != null) {
                      const v = flow.velocity
                      lines.push({ text: `${sf(v, 2)} m/s`, orange: v < 0.2 || v > 1.5 })
                    }
                  } else if (roleMap?.get(seg.id) !== 'antenne') {
                    const flow = networkFlows?.get(seg.id)
                    if (flow?.velocity != null) {
                      const v = flow.velocity
                      const segRole = roleMap?.get(seg.id)
                      const vMax = segRole === 'collecteur-retour' ? 1.0 : 0.5
                      const isRedMin    = seg.type === 'retour' && v < 0.2
                      const isOrangeMax = v > vMax
                      lines.push({ text: `${sf(v, 2)} m/s`, red: isRedMin, orange: isOrangeMax && !isRedMin })
                    }
                  }
                }
                if (canvasDisplay?.deltaT && !isAlimMode) {
                  const sr = thermalResults?.segResults?.get(seg.id)
                  if (sr?.deltaT != null) lines.push({ text: `ΔT ${sf(sr.deltaT, 2)} °C` })
                }
                if (canvasDisplay?.dpTroncon && (isBouclage || isChauffage || isEauGlacee)) {
                  const dp = pdcResults?.get(seg.id)?.dpTotal
                  if (dp != null) {
                    const u = pdcParams?.uniteAffichage ?? 'Pa'
                    const txt = u === 'mmCE' ? `ΔP ${(dp / 9.81).toFixed(0)} mmCE`
                      : `ΔP ${Math.round(dp)} Pa`
                    lines.push({ text: txt })
                  }
                }
                if (canvasDisplay?.rLinear && (isChauffage || isEauGlacee)) {
                  const J = pdcResults?.get(seg.id)?.J
                  if (J != null)
                    lines.push({ text: `R ${J.toFixed(1)} Pa/m`, orange: J > 150 })
                }
                if (canvasDisplay?.puissanceTroncon && (isChauffage || isEauGlacee)) {
                  const P = activeTerminalFlows?.get(seg.id)?.puissanceAmont
                  if (P != null && P > 0) {
                    const txt = P >= 1000 ? `${(P / 1000).toFixed(1)} kW` : `${Math.round(P)} W`
                    lines.push({ text: txt })
                  }
                }
                if (!lines.length) return null
                const vs = seg.vertices
                if (vs.length < 2) return null
                let totalLen = 0
                for (let i = 0; i < vs.length - 1; i++) totalLen += Math.hypot(vs[i+1].x - vs[i].x, vs[i+1].y - vs[i].y)
                let cumLen = 0, mid = vs[0], edgeDir = 'h'
                const half = totalLen / 2
                for (let i = 0; i < vs.length - 1; i++) {
                  const sl = Math.hypot(vs[i+1].x - vs[i].x, vs[i+1].y - vs[i].y)
                  if (cumLen + sl >= half) {
                    const t = (half - cumLen) / sl
                    mid = { x: vs[i].x + t * (vs[i+1].x - vs[i].x), y: vs[i].y + t * (vs[i+1].y - vs[i].y) }
                    edgeDir = Math.abs(vs[i+1].x - vs[i].x) >= Math.abs(vs[i+1].y - vs[i].y) ? 'h' : 'v'
                    break
                  }
                  cumLen += sl
                }
                const CW = 5.1, LH = 10, PAD = 3
                const bgW = Math.max(...lines.map(l => l.text.length)) * CW + PAD * 2
                const bgH = lines.length * LH + PAD * 2
                const OFF = 8
                const bx = edgeDir === 'h' ? mid.x - bgW / 2 : mid.x + OFF - 1
                const by = edgeDir === 'h' ? mid.y - bgH - OFF + 1 : mid.y - bgH / 2
                return (
                  <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    <rect x={bx} y={by} width={bgW} height={bgH}
                      fill="rgba(255,255,255,0.9)" stroke="#d1d5db" strokeWidth={0.4} rx={2} />
                    {lines.map((line, i) => (
                      <text key={i} x={bx + PAD} y={by + PAD + (i + 1) * LH - 1}
                        fontSize={8.5}
                        fill={line.red ? '#dc2626' : line.orange ? '#f97316' : '#0f172a'}
                        fontWeight="600">{line.text}</text>
                    ))}
                  </g>
                )
              })()}
              {seg.showName && (() => {
                const label = getDisplayName(seg, renderSegs, levels, lineYs, columns, columnXs, chaufferie, renderPts, null, activeCalcId, null, flowDirections)
                if (!label) return null
                const raw = label.split(' → ')
                const lines = raw.length >= 2
                  ? [raw[0], '→ ' + raw.slice(1).join(' → ')]
                  : [label]
                const v = seg.vertices[Math.floor(seg.vertices.length / 2)] || seg.vertices[0]
                const LH = 11, PAD = 3, CW = 5.1
                const bgW = Math.max(...lines.map(l => l.length)) * CW + PAD * 2
                const bgH = lines.length * LH + PAD * 2
                const bx = v.x + 4, by = v.y - bgH - 5
                return (
                  <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                    <rect x={bx - PAD} y={by} width={bgW} height={bgH}
                      fill="rgba(255,255,255,0.88)" stroke={col} strokeWidth={0.4} rx={2} />
                    {lines.map((line, i) => (
                      <text key={i} x={bx} y={by + PAD + (i + 1) * LH - 1}
                        fontSize={9} fill={col} fontWeight="600">{line}</text>
                    ))}
                  </g>
                )
              })()}
            </g>
          )
        })}

        {/* Vannes d'équilibrage */}
        {(valves ?? []).map(valve => {
          const liveDrag = valveDragT?.valveId === valve.id
          const liveSeg = liveDrag && valveDragT.segmentId
            ? visRenderSegs.find(s => s.id === valveDragT.segmentId)
            : visRenderSegs.find(s => s.id === valve.segmentId)
          if (!liveSeg) return null
          const liveT = liveDrag ? valveDragT.t : valve.t
          const { x, y, angle } = positionFromT(liveSeg.vertices, liveT)
          const sel = selectedValveId === valve.id
          const S = 6
          const TH = S + 2
          const color = sel ? '#2563eb' : '#000'
          return (
            <g key={valve.id}
              transform={`translate(${x},${y})`}
              style={{ cursor: liveDrag ? 'grabbing' : 'grab', pointerEvents: editParam ? 'none' : undefined }}>
              <circle r={14} fill="transparent" />
              {/* T perpendiculaire : haut sur horizontale, droite sur verticale.
                  Normalise l'angle pour rester dans le demi-plan upper-right. */}
              {(() => {
                const norm = ((angle % 360) + 360) % 360
                const da = (norm > 90 && norm <= 270) ? angle + 180 : angle
                return (
                  <g transform={`rotate(${da})`} style={{ pointerEvents: 'none' }}>
                    <polygon points={`${-S},${-S*0.85} ${-S},${S*0.85} 0,0`} fill={color} />
                    <polygon points={`${S},${-S*0.85} ${S},${S*0.85} 0,0`} fill={color} />
                    <line x1="0" y1="0" x2="0" y2={-TH}
                      stroke={color} strokeWidth="1.5" strokeLinecap="round" />
                    <line x1={-(S * 0.65)} y1={-TH} x2={S * 0.65} y2={-TH}
                      stroke={color} strokeWidth="1.5" strokeLinecap="round" />
                  </g>
                )
              })()}
              {sel && (
                <circle r={9} fill="none" stroke="#2563eb" strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }} />
              )}
            </g>
          )
        })}

        {/* Prévisualisation vanne */}
        {previewVanne && (
          <g transform={`translate(${previewVanne.x},${previewVanne.y})`}
            style={{ pointerEvents: 'none', opacity: 0.5 }}>
            {(() => {
              const S = 6.5, TH = S + 2
              return (
                <>
                  {(() => {
                    const pNorm = ((previewVanne.angle % 360) + 360) % 360
                    const pDa = (pNorm > 90 && pNorm <= 270) ? previewVanne.angle + 180 : previewVanne.angle
                    return (
                      <g transform={`rotate(${pDa})`}>
                        <polygon points={`${-S},${-S*0.85} ${-S},${S*0.85} 0,0`} fill="rgba(0,0,0,0.4)" />
                        <polygon points={`${S},${-S*0.85} ${S},${S*0.85} 0,0`} fill="rgba(0,0,0,0.4)" />
                        <line x1="0" y1="0" x2="0" y2={-TH} stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" strokeLinecap="round" />
                        <line x1={-(S * 0.65)} y1={-TH} x2={S * 0.65} y2={-TH} stroke="rgba(0,0,0,0.4)" strokeWidth="1.5" strokeLinecap="round" />
                      </g>
                    )
                  })()}
                </>
              )
            })()}
          </g>
        )}

        {/* Accessoires visuels */}
        {(accessories ?? []).map(acc => {
          const liveDrag = accessoryDragT?.accessoryId === acc.id
          const liveSeg = liveDrag && accessoryDragT.segmentId
            ? visRenderSegs.find(s => s.id === accessoryDragT.segmentId)
            : visRenderSegs.find(s => s.id === acc.segmentId)
          if (!liveSeg) return null
          const liveT = liveDrag ? accessoryDragT.t : acc.t
          const { x, y, angle } = positionFromT(liveSeg.vertices, liveT)
          const sel = selectedAccessoryId === acc.id

          if (ACC_WITH_STEM.has(acc.type)) {
            // Symbol always upright. Stem ends at the bottom edge of the symbol.
            // symY = center of symbol; bottom edge of symbol is at symY + symBottom = -ACC_STEM_V.
            const isHoriz = Math.abs(Math.sin(angle * Math.PI / 180)) < 0.5
            const symBottom = ACC_SYM_BOTTOM[acc.type] ?? 8
            const symX = isHoriz ? 0 : ACC_STEM_H
            const symY = -(ACC_STEM_V + symBottom)
            const stemEndY = -ACC_STEM_V
            return (
              <g key={acc.id}
                transform={`translate(${x},${y})`}
                style={{ cursor: liveDrag ? 'grabbing' : 'grab', pointerEvents: editParam ? 'none' : undefined }}>
                <circle cx={symX} cy={symY} r={14} fill="transparent" />
                {/* Horizontal part (vertical pipes only) */}
                {!isHoriz && (
                  <line x1="0" y1="0" x2={ACC_STEM_H} y2="0"
                    stroke="#000" strokeWidth="1.2" strokeLinecap="round"
                    style={{ pointerEvents: 'none' }} />
                )}
                {/* Vertical part — ends at bottom edge of symbol */}
                <line x1={symX} y1="0" x2={symX} y2={stemEndY}
                  stroke="#000" strokeWidth="1.2" strokeLinecap="round"
                  style={{ pointerEvents: 'none' }} />
                <g transform={`translate(${symX},${symY})`} style={{ pointerEvents: 'none' }}>
                  <AccessorySymbol type={acc.type} />
                </g>
                {sel && (
                  <circle cx={symX} cy={symY} r={13}
                    fill="none" stroke="#2563eb" strokeWidth={1.5}
                    style={{ pointerEvents: 'none' }} />
                )}
              </g>
            )
          }

          // Angle effectif = angle du fluide (uniquement pour les 4 accessoires directionnels)
          const flowDir = flowDirections?.get(liveSeg.id)
          const flowReversed = ACC_FLIP_Y.has(acc.type) && flowDir != null && flowDir.fromId === liveSeg.endPointId
          const effectiveAngle = flowReversed ? angle + 180 : angle
          const cosEff = Math.cos(effectiveAngle * Math.PI / 180)
          const sinEff = Math.sin(effectiveAngle * Math.PI / 180)
          const needsFlip = cosEff < -0.001 || (Math.abs(cosEff) < 0.001 && sinEff < -0.001)
          const flipY = (ACC_FLIP_Y.has(acc.type) || ACC_GRAVITY_FLIP.has(acc.type)) && needsFlip ? -1 : 1
          return (
            <g key={acc.id}
              transform={`translate(${x},${y}) rotate(${effectiveAngle}) scale(1,${flipY})`}
              style={{ cursor: liveDrag ? 'grabbing' : 'grab', pointerEvents: editParam ? 'none' : undefined }}>
              <circle r={16} fill="transparent" />
              <g style={{ pointerEvents: 'none' }}>
                <AccessorySymbol type={acc.type} counterAngle={-effectiveAngle} />
              </g>
              {sel && (
                <circle r={13} fill="none" stroke="#2563eb" strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }} />
              )}
            </g>
          )
        })}

        {/* Prévisualisation accessoire */}
        {previewAccessory && placingAccessoryType && (() => {
          if (ACC_WITH_STEM.has(placingAccessoryType)) {
            const isHoriz = Math.abs(Math.sin(previewAccessory.angle * Math.PI / 180)) < 0.5
            const symBottom = ACC_SYM_BOTTOM[placingAccessoryType] ?? 8
            const symX = isHoriz ? 0 : ACC_STEM_H
            const symY = -(ACC_STEM_V + symBottom)
            const stemEndY = -ACC_STEM_V
            return (
              <g transform={`translate(${previewAccessory.x},${previewAccessory.y})`}
                style={{ pointerEvents: 'none', opacity: 0.5 }}>
                {!isHoriz && (
                  <line x1="0" y1="0" x2={ACC_STEM_H} y2="0"
                    stroke="#000" strokeWidth="1.2" strokeLinecap="round" />
                )}
                <line x1={symX} y1="0" x2={symX} y2={stemEndY}
                  stroke="#000" strokeWidth="1.2" strokeLinecap="round" />
                <g transform={`translate(${symX},${symY})`}>
                  <AccessorySymbol type={placingAccessoryType} />
                </g>
              </g>
            )
          }
          const prevSeg = visRenderSegs.find(s => s.id === previewAccessory.segId)
          const prevFlowDir = prevSeg ? flowDirections?.get(prevSeg.id) : null
          const prevFlowReversed = ACC_FLIP_Y.has(placingAccessoryType) && prevFlowDir != null && prevSeg && prevFlowDir.fromId === prevSeg.endPointId
          const prevEffAngle = prevFlowReversed ? previewAccessory.angle + 180 : previewAccessory.angle
          const prevCosEff = Math.cos(prevEffAngle * Math.PI / 180)
          const prevSinEff = Math.sin(prevEffAngle * Math.PI / 180)
          const prevNeedsFlip = prevCosEff < -0.001 || (Math.abs(prevCosEff) < 0.001 && prevSinEff < -0.001)
          const prevFlipY = (ACC_FLIP_Y.has(placingAccessoryType) || ACC_GRAVITY_FLIP.has(placingAccessoryType)) && prevNeedsFlip ? -1 : 1
          return (
            <g transform={`translate(${previewAccessory.x},${previewAccessory.y}) rotate(${prevEffAngle}) scale(1,${prevFlipY})`}
              style={{ pointerEvents: 'none', opacity: 0.5 }}>
              <AccessorySymbol type={placingAccessoryType} counterAngle={-prevEffAngle} />
            </g>
          )
        })()}

        {/* Nœuds */}
        {visRenderPts.map(pt => {
          const sel     = selectedIds.includes(pt.id)
          const dragged = ptDragPos?.ptId === pt.id

          // Temperature helpers
          const resolveNodeTemp = (ptId) => {
            if (!canvasDisplay?.temperatureNoeud) return null
            if (isAlimMode) return null
            const mix = thermalResults?.nodeTemps?.get(ptId)
            if (mix != null) return mix
            if (!flowDirections) return null
            for (const [sid, dir] of flowDirections) {
              if (dir.toId === ptId) {
                const T = thermalResults?.segResults?.get(sid)?.T_to
                if (T != null) return T
              }
            }
            for (const [sid, dir] of flowDirections) {
              if (dir.fromId === ptId) {
                const T = thermalResults?.segResults?.get(sid)?.T_from
                if (T != null) return T
              }
            }
            return null
          }

          const TempBadge = ({ x, y, T }) => {
            if (T == null) return null
            const red = T < 50
            const lbl = `${sf(T, 1)}°C`
            const W = lbl.length * 5 + 4
            return (
              <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                <rect x={x} y={y - 6} width={W} height={11}
                  fill={red ? '#fef2f2' : 'rgba(255,255,255,0.92)'}
                  stroke={red ? '#dc2626' : '#6b7280'} strokeWidth={0.4} rx={2} />
                <text x={x + 2} y={y + 3.5}
                  fontSize={7.5} fill={red ? '#dc2626' : '#374151'} fontWeight="600">{lbl}</text>
              </g>
            )
          }

          const resolveNodePression = (ptId: string) => {
            if (!isAlimMode || !flowDirections) return { pDispo: null, pStat: null }
            const inSegId = Array.from(flowDirections.entries()).find(([, d]) => d != null && d.toId === ptId)?.[0] ?? null
            if (inSegId) {
              const pDispo = canvasDisplay?.pressionDispo ? (pdcCumAlimResults?.segPressionAval?.get(inSegId) ?? null) : null
              const pStat  = canvasDisplay?.pressionStat  ? (pdcCumAlimResults?.segPStatAval?.get(inSegId)   ?? null) : null
              return { pDispo, pStat }
            }
            // Fallback : nœud source (productionECS) — utilise les pressions au nœud
            const pDispo = canvasDisplay?.pressionDispo ? (pdcCumAlimResults?.nodePression?.get(ptId) ?? null) : null
            const pStat  = canvasDisplay?.pressionStat  ? (pdcCumAlimResults?.nodePStat?.get(ptId)    ?? null) : null
            return { pDispo, pStat }
          }

          const PressBadge = ({ x, y, p, isErr, prefix }: { x: number; y: number; p: number | null; isErr: boolean; prefix?: string }) => {
            if (p == null) return null
            const lbl = prefix ? `${prefix} ${(p / 100000).toFixed(2)} bar` : `${(p / 100000).toFixed(2)} bar`
            const W = lbl.length * 5 + 4
            return (
              <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                <rect x={x} y={y - 6} width={W} height={11}
                  fill={isErr ? '#fef2f2' : 'rgba(255,255,255,0.92)'}
                  stroke={isErr ? '#dc2626' : '#6b7280'} strokeWidth={0.4} rx={2} />
                <text x={x + 2} y={y + 3.5} fontSize={7.5}
                  fill={isErr ? '#dc2626' : '#374151'} fontWeight="600">{lbl}</text>
              </g>
            )
          }

          const resolveDpNoeud = (ptId: string): number | null => {
            if (!canvasDisplay?.dpNoeud || (!isBouclage && !isChauffage && !isEauGlacee)) return null
            return pdcCumResults?.nodeCumDp?.get(ptId) ?? null
          }

          const DpBadge = ({ x, y, dp }: { x: number; y: number; dp: number | null }) => {
            if (dp == null) return null
            const u = pdcParams?.uniteAffichage ?? 'Pa'
            const lbl = u === 'mmCE' ? `${(dp / 9.81).toFixed(0)} mc` : `${Math.round(dp)} Pa`
            const W = lbl.length * 5 + 4
            return (
              <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                <rect x={x} y={y - 6} width={W} height={11}
                  fill="rgba(255,255,255,0.92)" stroke="#6b7280" strokeWidth={0.4} rx={2} />
                <text x={x + 2} y={y + 3.5} fontSize={7.5} fill="#374151" fontWeight="600">{lbl}</text>
              </g>
            )
          }

          if (pt.isLocked) {
            const lockedClick = ev => {
              if (drawMode === 'editParams') return
              ev.stopPropagation()
              onSelectIds(ids => ev.shiftKey
                ? ids.includes(pt.id) ? ids.filter(i => i !== pt.id) : [...ids, pt.id]
                : [pt.id])
            }
            const lockedTemp = resolveNodeTemp(pt.id)
            const { pDispo: lkPDispo, pStat: lkPStat } = resolveNodePression(pt.id)
            const lkBothP = lkPDispo != null && lkPStat != null
            const lkBx = pt.x + 8
            return (
              <g key={pt.id} onClick={lockedClick} style={{ cursor: 'pointer' }}>
                <circle cx={pt.x} cy={pt.y} r={10} fill="transparent" />
                <polygon
                  points={`${pt.x},${pt.y - 6} ${pt.x + 6},${pt.y} ${pt.x},${pt.y + 6} ${pt.x - 6},${pt.y}`}
                  fill={sel ? '#fef3c7' : '#fff7ed'}
                  stroke={sel ? '#f59e0b' : '#94a3b8'}
                  strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }} />
                <TempBadge x={lkBx} y={pt.y} T={lockedTemp} />
                <DpBadge x={lkBx} y={pt.y + (lockedTemp != null ? 13 : 0)} dp={resolveDpNoeud(pt.id)} />
                <PressBadge x={lkBx} y={pt.y + (lkBothP ? -7 : 0)} p={lkPDispo} isErr={lkPDispo != null && lkPDispo < 30000} prefix="disp." />
                <PressBadge x={lkBx} y={pt.y + (lkBothP ? 7 : 0)}  p={lkPStat}  isErr={lkPStat  != null && lkPStat  > 400000} prefix="stat." />
              </g>
            )
          }
          const selClick = ev => {
            if (drawMode === 'editParams') return
            ev.stopPropagation()
            onSelectIds(ids => ev.shiftKey
              ? ids.includes(pt.id) ? ids.filter(i => i !== pt.id) : [...ids, pt.id]
              : [pt.id])
          }
          if (pt.type === 'pump') {
            const r = pt.size ?? 15, ts = r / 15
            const pumpTemp = resolveNodeTemp(pt.id)
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <circle cx={pt.x} cy={pt.y} r={r + 4} fill="transparent" />
                <g transform={`translate(${pt.x},${pt.y}) rotate(${pt.rotation ?? 180})`} style={{ pointerEvents: 'none' }}>
                  <circle r={r} fill={sel || dragged ? '#dbeafe' : '#fff'} stroke={sel || dragged ? '#2563eb' : '#000'} strokeWidth={1.5} />
                  <polygon points={`${-6*ts},${-7*ts} ${-6*ts},${7*ts} ${8*ts},0`} fill={sel || dragged ? '#2563eb' : '#000'} />
                </g>
                <TempBadge x={pt.x + r + 2} y={pt.y} T={pumpTemp} />
                <DpBadge x={pt.x + r + 2} y={pt.y + (pumpTemp != null ? 13 : 0)} dp={resolveDpNoeud(pt.id)} />
              </g>
            )
          }
          if (pt.type === 'groupe') {
            const w = 60
            const col = sel || dragged ? '#2563eb' : '#0369a1'
            const bg  = sel || dragged ? '#dbeafe' : '#f0f9ff'
            const autoName = showGroupeNames ? (groupDisplayNames?.get(pt.id) ?? null) : null
            const showName = pt.name || autoName
            const label = pt.name ?? autoName ?? 'PP'
            const labelCol = sel || dragged ? '#2563eb' : showName ? '#0c4a6e' : '#7dd3fc'
            const equipLines = []
            if (canvasDisplay?.equipment) {
              const equips = pt.equipements ?? {}
              const items = (alimentationParams?.appareils ?? [])
                .filter(a => (equips[a.id] ?? 0) > 0)
                .map(a => `${EQUIP_ABBR[a.id] ?? a.id}×${equips[a.id]}`)
              if (items.length > 0) {
                const CHAR_W = 3.9, SEP = ' · ', SEP_W = SEP.length * CHAR_W
                const maxW = w - 8
                let cur = [], curW = 0
                for (const item of items) {
                  const iw = item.length * CHAR_W
                  const addW = cur.length > 0 ? SEP_W + iw : iw
                  if (cur.length > 0 && curW + addW > maxW) {
                    equipLines.push(cur.join(SEP))
                    cur = [item]; curW = iw
                  } else {
                    cur.push(item); curW += addW
                  }
                }
                if (cur.length > 0) equipLines.push(cur.join(SEP))
              }
            }
            const hasEquip = equipLines.length > 0
            const h = hasEquip ? Math.max(30, 20 + equipLines.length * 9) : 30
            const nameFontSize = hasEquip ? 7 : 9
            // Center equip lines at pt.y, name floats just above
            const equipBlockH = hasEquip ? (equipLines.length - 1) * 9 + 6.5 : 0
            const equipStartY = pt.y - equipBlockH / 2
            const nameY = hasEquip ? equipStartY - 9 : pt.y
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={ev => { ev.stopPropagation(); selClick(ev) }}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h}
                    fill={bg} stroke={col} strokeWidth={1.2} rx={3} />
                  <text x={pt.x} y={nameY}
                    fontSize={nameFontSize} fill={labelCol}
                    fontWeight={showName ? '600' : '700'}
                    textAnchor="middle"
                    dominantBaseline={hasEquip ? 'hanging' : 'central'}
                    style={{ userSelect: 'none' }}>
                    {label}
                  </text>
                  {equipLines.map((line, i) => (
                    <text key={i} x={pt.x} y={equipStartY + i * 9}
                      fontSize={6.5} fill={sel || dragged ? '#1d4ed8' : '#0369a1'}
                      fontWeight="600" textAnchor="middle" dominantBaseline="hanging"
                      style={{ userSelect: 'none' }}>
                      {line}
                    </text>
                  ))}
                </g>
                {(() => {
                  const { pDispo, pStat } = resolveNodePression(pt.id)
                  if (pDispo == null && pStat == null) return null
                  const bothP = pDispo != null && pStat != null
                  const bx = pt.x + w / 2 + 4
                  return (
                    <>
                      <PressBadge x={bx} y={pt.y + (bothP ? -7 : 0)} p={pDispo} isErr={pDispo != null && pDispo < 30000} prefix="disp." />
                      <PressBadge x={bx} y={pt.y + (bothP ? 7 : 0)}  p={pStat}  isErr={pStat  != null && pStat  > 400000} prefix="stat." />
                    </>
                  )
                })()}
              </g>
            )
          }
          if (pt.type === 'arriveeEF') {
            const w = pt.size?.w ?? 44, h = pt.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            const col = sel || dragged ? '#2563eb' : '#000'
            const bg  = sel || dragged ? '#dbeafe' : '#fff'
            const efPDispo = (canvasDisplay?.pressionDispo && isAlimEF)
              ? pressionSourceAlimEF
              : null
            const efPStat = (canvasDisplay?.pressionStat && isAlimEF)
              ? pressionSourceAlimEFStatic
              : null
            const bothEFP = efPDispo != null && efPStat != null
            const bxEF = pt.x + w / 2 + 4
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h} fill={bg} stroke={col} strokeWidth={1.5} rx={3} />
                  <text x={pt.x} y={pt.y - h * 0.15} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>Arrivée</text>
                  <text x={pt.x} y={pt.y + h * 0.28} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>EF</text>
                </g>
                <PressBadge x={bxEF} y={pt.y + (bothEFP ? -7 : 0)} p={efPDispo} isErr={efPDispo != null && efPDispo < 30000} prefix="disp." />
                <PressBadge x={bxEF} y={pt.y + (bothEFP ? 7 : 0)}  p={efPStat}  isErr={efPStat  != null && efPStat  > 400000} prefix="stat." />
              </g>
            )
          }

          if (mixingNodes?.has(pt.id)) {
            const cx = pt.x, cy = pt.y
            const sqFill  = sel || dragged ? '#dbeafe' : '#fff'
            const sqStroke = sel || dragged ? '#2563eb' : '#374151'
            const triStroke = sel || dragged ? '#2563eb' : (isChauffage || isEauGlacee) ? '#000' : '#92400e'
            const halfA = 22 * Math.PI / 180  // demi-angle étroit (22°)
            const triR  = 13                   // distance center → base du triangle

            const angles: number[] = segments
              .filter((s: any) => s.startPointId === pt.id || s.endPointId === pt.id)
              .map((s: any) => {
                const vs = s.vertices || []
                if (s.startPointId === pt.id && vs.length >= 2)
                  return Math.atan2(vs[1].y - vs[0].y, vs[1].x - vs[0].x)
                if (s.endPointId === pt.id && vs.length >= 2) {
                  const last = vs.length - 1
                  return Math.atan2(vs[last - 1].y - vs[last].y, vs[last - 1].x - vs[last].x)
                }
                const otherId = s.startPointId === pt.id ? s.endPointId : s.startPointId
                const other = points.find((p: any) => p.id === otherId)
                return other ? Math.atan2(other.y - cy, other.x - cx) : null
              })
              .filter((a: any): a is number => a !== null)

            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <rect x={cx - PT_R - 6} y={cy - PT_R - 6} width={(PT_R + 6) * 2} height={(PT_R + 6) * 2} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  {/* Triangles blancs dans la direction de chaque tronçon */}
                  {angles.map((θ: number, i: number) => {
                    const p1x = cx + triR * Math.cos(θ - halfA)
                    const p1y = cy + triR * Math.sin(θ - halfA)
                    const p2x = cx + triR * Math.cos(θ + halfA)
                    const p2y = cy + triR * Math.sin(θ + halfA)
                    return (
                      <polygon
                        key={i}
                        points={`${cx},${cy} ${p1x.toFixed(2)},${p1y.toFixed(2)} ${p2x.toFixed(2)},${p2y.toFixed(2)}`}
                        fill="white"
                        stroke={triStroke}
                        strokeWidth={0.9}
                      />
                    )
                  })}
                  {/* Carré nœud standard par-dessus */}
                  <rect x={cx - PT_R} y={cy - PT_R} width={PT_R * 2} height={PT_R * 2}
                    fill={sqFill} stroke={sqStroke} strokeWidth={1.5} />
                </g>
              </g>
            )
          }

          if (pt.type === 'productionChauffage') {
            const w = pt.size?.w ?? 44, h = pt.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            const col = sel || dragged ? '#2563eb' : '#000'
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h}
                    fill={sel || dragged ? '#dbeafe' : '#fff'}
                    stroke={col} strokeWidth={1.5} rx={3} />
                  <text x={pt.x} y={pt.y - h * 0.15} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>Production</text>
                  <text x={pt.x} y={pt.y + h * 0.28} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>Chauffage</text>
                </g>
                {canvasDisplay?.dpNoeud && (() => {
                  const retDps = Array.from(flowDirections?.entries() ?? [])
                    .filter(([, dir]) => dir.toId === pt.id)
                    .map(([sid]) => pdcCumResults?.segCumDp?.get(sid))
                    .filter((v): v is number => v != null)
                  if (retDps.length === 0) return null
                  const maxDp = Math.max(...retDps)
                  return <DpBadge x={pt.x + w / 2 + 4} y={pt.y} dp={maxDp} />
                })()}
              </g>
            )
          }

          if (pt.type === 'productionEauGlacee') {
            const w = pt.size?.w ?? 44, h = pt.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            const col = sel || dragged ? '#2563eb' : '#000'
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h}
                    fill={sel || dragged ? '#dbeafe' : '#fff'}
                    stroke={col} strokeWidth={1.5} rx={3} />
                  <text x={pt.x} y={pt.y - h * 0.15} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>Groupe</text>
                  <text x={pt.x} y={pt.y + h * 0.28} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>froid</text>
                </g>
                {canvasDisplay?.dpNoeud && (() => {
                  const retDps = Array.from(flowDirections?.entries() ?? [])
                    .filter(([, dir]) => dir.toId === pt.id)
                    .map(([sid]) => pdcCumResults?.segCumDp?.get(sid))
                    .filter((v): v is number => v != null)
                  if (retDps.length === 0) return null
                  const maxDp = Math.max(...retDps)
                  return <DpBadge x={pt.x + w / 2 + 4} y={pt.y} dp={maxDp} />
                })()}
              </g>
            )
          }

          if (pt.type === 'emetteur') {
            const w = 28, h = 18
            const col = sel || dragged ? '#2563eb' : '#000'
            const bg  = sel || dragged ? '#dbeafe' : '#fff'
            const emDef = EMETTEUR_TYPES.find(e => e.id === pt.emetteurType)
            const bx = pt.x + w / 2 + 4
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h}
                    fill={bg} stroke={col} strokeWidth={1.2} rx={2} />
                  {[-w/4, 0, w/4].map((ox, i) => (
                    <line key={i}
                      x1={pt.x + ox} y1={pt.y - h/2 + 3}
                      x2={pt.x + ox} y2={pt.y + h/2 - 3}
                      stroke={col} strokeWidth={0.9} />
                  ))}
                </g>
                {emDef && (
                  <text x={pt.x} y={pt.y - h/2 - 3}
                    fontSize={6} fill={col} textAnchor="middle"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {emDef.label}
                  </text>
                )}
                {isChauffage && (() => {
                  const badges: { txt: string }[] = []
                  if (canvasDisplay?.puissanceEmetteur && pt.puissance != null) {
                    const P = pt.puissance
                    badges.push({ txt: P >= 1000 ? `${(P / 1000).toFixed(1)} kW` : `${Math.round(P)} W` })
                  }
                  if (canvasDisplay?.dpEmetteur) {
                    const dpEm = (pt.dp_emetteur ?? 0) + (pt.dp_vanne_th ?? 0)
                    if (dpEm > 0) {
                      const u = pdcParams?.uniteAffichage ?? 'Pa'
                      badges.push({ txt: u === 'mmCE' ? `ΔP ém. ${(dpEm / 9.81).toFixed(0)} mc` : `ΔP ém. ${Math.round(dpEm)} Pa` })
                    }
                  }
                  if (canvasDisplay?.dpNoeud) {
                    const dp = resolveDpNoeud(pt.id)
                    if (dp != null) {
                      const dpTotal = dp + (pt.dp_emetteur ?? 0) + (pt.dp_vanne_th ?? 0)
                      const u = pdcParams?.uniteAffichage ?? 'Pa'
                      badges.push({ txt: u === 'mmCE' ? `ΔP cum. ${(dpTotal / 9.81).toFixed(0)} mc` : `ΔP cum. ${Math.round(dpTotal)} Pa` })
                    }
                  }
                  if (!badges.length) return null
                  const LH = 11, PAD = 2
                  const bgW = Math.max(...badges.map(b => b.txt.length)) * 5 + PAD * 2 + 2
                  const bgH = badges.length * LH + PAD * 2
                  const by = pt.y - bgH / 2
                  return (
                    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      <rect x={bx} y={by} width={bgW} height={bgH}
                        fill="rgba(255,255,255,0.92)" stroke="#6b7280" strokeWidth={0.4} rx={2} />
                      {badges.map((b, i) => (
                        <text key={i} x={bx + PAD + 1} y={by + PAD + (i + 1) * LH - 2}
                          fontSize={7.5} fill="#374151" fontWeight="600">{b.txt}</text>
                      ))}
                    </g>
                  )
                })()}
              </g>
            )
          }

          if (pt.type === 'terminalFroid') {
            const w = 28, h = 18
            const col = sel || dragged ? '#2563eb' : '#000'
            const bg  = sel || dragged ? '#dbeafe' : '#fff'
            const tfDef = TERMINAL_FROID_TYPES.find(t => t.id === pt.terminalFroidType)
            const bx = pt.x + w / 2 + 4
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h}
                    fill={bg} stroke={col} strokeWidth={1.2} rx={2} />
                  {[-w/4, 0, w/4].map((ox, i) => (
                    <line key={i}
                      x1={pt.x + ox} y1={pt.y - h/2 + 3}
                      x2={pt.x + ox} y2={pt.y + h/2 - 3}
                      stroke={col} strokeWidth={1} strokeDasharray="2,1.5" />
                  ))}
                </g>
                {tfDef && (
                  <text x={pt.x} y={pt.y - h/2 - 3}
                    fontSize={6} fill={col} textAnchor="middle"
                    style={{ userSelect: 'none', pointerEvents: 'none' }}>
                    {tfDef.label}
                  </text>
                )}
                {isEauGlacee && (() => {
                  const badges: { txt: string }[] = []
                  if (canvasDisplay?.puissanceEmetteur && pt.puissance != null) {
                    const P = pt.puissance
                    badges.push({ txt: P >= 1000 ? `${(P / 1000).toFixed(1)} kW` : `${Math.round(P)} W` })
                  }
                  if (canvasDisplay?.dpEmetteur) {
                    const dpEm = (pt.dp_emetteur ?? 0) + (pt.dp_vanne_th ?? 0)
                    if (dpEm > 0) {
                      const u = pdcParams?.uniteAffichage ?? 'Pa'
                      badges.push({ txt: u === 'mmCE' ? `ΔP ém. ${(dpEm / 9.81).toFixed(0)} mc` : `ΔP ém. ${Math.round(dpEm)} Pa` })
                    }
                  }
                  if (canvasDisplay?.dpNoeud) {
                    const dp = resolveDpNoeud(pt.id)
                    if (dp != null) {
                      const dpTotal = dp + (pt.dp_emetteur ?? 0) + (pt.dp_vanne_th ?? 0)
                      const u = pdcParams?.uniteAffichage ?? 'Pa'
                      badges.push({ txt: u === 'mmCE' ? `ΔP cum. ${(dpTotal / 9.81).toFixed(0)} mc` : `ΔP cum. ${Math.round(dpTotal)} Pa` })
                    }
                  }
                  if (!badges.length) return null
                  const LH = 11, PAD = 2
                  const bgW = Math.max(...badges.map(b => b.txt.length)) * 5 + PAD * 2 + 2
                  const bgH = badges.length * LH + PAD * 2
                  const by = pt.y - bgH / 2
                  return (
                    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      <rect x={bx} y={by} width={bgW} height={bgH}
                        fill="rgba(255,255,255,0.92)" stroke="#6b7280" strokeWidth={0.4} rx={2} />
                      {badges.map((b, i) => (
                        <text key={i} x={bx + PAD + 1} y={by + PAD + (i + 1) * LH - 2}
                          fontSize={7.5} fill="#374151" fontWeight="600">{b.txt}</text>
                      ))}
                    </g>
                  )
                })()}
              </g>
            )
          }

          if (pt.type === 'productionECS') {
            const w = pt.size?.w ?? 44, h = pt.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            const col = sel || dragged ? '#2563eb' : '#000'

            // Départ = T_from du tronçon aller sortant, Retour = T_to du tronçon retour entrant
            let T_dep = null, T_ret = null
            if (canvasDisplay?.temperatureNoeud && flowDirections) {
              for (const [sid, dir] of flowDirections) {
                const seg = renderSegs.find(s => s.id === sid)
                if (!seg) continue
                if (dir.fromId === pt.id && seg.type === 'aller' && T_dep == null)
                  T_dep = thermalResults?.segResults?.get(sid)?.T_from ?? null
                if (dir.toId === pt.id && seg.type === 'retour' && T_ret == null)
                  T_ret = thermalResults?.segResults?.get(sid)?.T_to ?? null
              }
            }

            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h} fill={sel || dragged ? '#dbeafe' : '#fff'} stroke={col} strokeWidth={1.5} rx={3} />
                  <text x={pt.x} y={pt.y - h * 0.15} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>Production</text>
                  <text x={pt.x} y={pt.y + h * 0.28} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>ECS</text>
                </g>
                {(T_dep != null || T_ret != null) && (() => {
                  const items = [
                    T_dep != null && { label: 'Dép.', T: T_dep },
                    T_ret != null && { label: 'Ret.', T: T_ret },
                  ].filter(Boolean)
                  const LH = 12, PAD = 3
                  const maxW = Math.max(...items.map(it => (`${it.label} ${sf(it.T, 1)}°C`).length)) * 5 + PAD * 2
                  const totalH = items.length * LH + PAD * 2
                  const bx = pt.x + w / 2 + 4
                  const by = pt.y - totalH / 2
                  return (
                    <g style={{ pointerEvents: 'none', userSelect: 'none' }}>
                      <rect x={bx} y={by} width={maxW} height={totalH}
                        fill="rgba(255,255,255,0.92)" stroke="#6b7280" strokeWidth={0.4} rx={2} />
                      {items.map(({ label, T }, i) => (
                        <text key={i} x={bx + PAD} y={by + PAD + (i + 1) * LH - 2}
                          fontSize={7.5} fill={T < 50 ? '#dc2626' : '#374151'} fontWeight="600">
                          {label} {sf(T, 1)}°C
                        </text>
                      ))}
                    </g>
                  )
                })()}
                {canvasDisplay?.dpNoeud && isBouclage && (() => {
                  const retDps = Array.from(flowDirections?.entries() ?? [])
                    .filter(([, dir]) => dir.toId === pt.id)
                    .map(([sid]) => pdcCumResults?.segCumDp?.get(sid))
                    .filter((v): v is number => v != null)
                  if (retDps.length === 0) return null
                  const maxDp = Math.max(...retDps)
                  return <DpBadge x={pt.x + w / 2 + 4} y={pt.y + h / 2 + 8} dp={maxDp} />
                })()}
                {(() => {
                  const { pDispo, pStat } = resolveNodePression(pt.id)
                  if (pDispo == null && pStat == null) return null
                  const bothP = pDispo != null && pStat != null
                  const bx = pt.x + w / 2 + 4
                  return (
                    <>
                      <PressBadge x={bx} y={pt.y + (bothP ? -7 : 0)} p={pDispo} isErr={pDispo != null && pDispo < 30000} prefix="disp." />
                      <PressBadge x={bx} y={pt.y + (bothP ? 7 : 0)}  p={pStat}  isErr={pStat  != null && pStat  > 400000} prefix="stat." />
                    </>
                  )
                })()}
              </g>
            )
          }

          // Regular node — handle junction incoming temps
          const incomingTemps = (() => {
            if (!canvasDisplay?.temperatureNoeud || !flowDirections) return []
            const res = []
            for (const [sid, dir] of flowDirections) {
              if (dir.toId !== pt.id) continue
              const T = thermalResults?.segResults?.get(sid)?.T_to
              if (T == null) continue
              const seg = renderSegs.find(s => s.id === sid)
              if (!seg) continue
              const vs = seg.vertices
              if (vs.length < 2) continue
              // direction away from junction along segment
              let dx, dy
              if (seg.endPointId === pt.id) {
                dx = vs[vs.length - 2].x - vs[vs.length - 1].x
                dy = vs[vs.length - 2].y - vs[vs.length - 1].y
              } else {
                dx = vs[1].x - vs[0].x
                dy = vs[1].y - vs[0].y
              }
              const len = Math.hypot(dx, dy) || 1
              res.push({ T, dx: dx / len, dy: dy / len })
            }
            return res
          })()

          const isJunction = incomingTemps.length > 1
          const singleTemp = incomingTemps.length === 1
            ? incomingTemps[0].T
            : resolveNodeTemp(pt.id)

          const incomingDps = (() => {
            if (!canvasDisplay?.dpNoeud || (!isBouclage && !isChauffage && !isEauGlacee) || !flowDirections) return []
            const res: { dp: number; dx: number; dy: number }[] = []
            for (const [sid, dir] of flowDirections) {
              if (dir.toId !== pt.id) continue
              const dp = pdcCumResults?.segCumDp?.get(sid) ?? null
              if (dp == null) continue
              const seg = renderSegs.find(s => s.id === sid)
              if (!seg) continue
              const vs = seg.vertices
              if (vs.length < 2) continue
              let dx, dy
              if (seg.endPointId === pt.id) {
                dx = vs[vs.length - 2].x - vs[vs.length - 1].x
                dy = vs[vs.length - 2].y - vs[vs.length - 1].y
              } else {
                dx = vs[1].x - vs[0].x
                dy = vs[1].y - vs[0].y
              }
              const len = Math.hypot(dx, dy) || 1
              res.push({ dp, dx: dx / len, dy: dy / len })
            }
            return res
          })()
          const isDpJunction = incomingDps.length > 1
          const bothBadges = !!canvasDisplay?.temperatureNoeud && !!canvasDisplay?.dpNoeud

          return (
            <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
              <rect x={pt.x - PT_R - 6} y={pt.y - PT_R - 6} width={(PT_R + 6) * 2} height={(PT_R + 6) * 2} fill="transparent" />
              <rect x={pt.x - PT_R} y={pt.y - PT_R} width={PT_R * 2} height={PT_R * 2}
                fill={sel || dragged ? '#dbeafe' : '#fff'}
                stroke={sel || dragged ? '#2563eb' : '#374151'} strokeWidth={1.5} />
              {!isJunction && <TempBadge x={pt.x + PT_R + 2} y={pt.y} T={singleTemp} />}
              {isJunction && incomingTemps.map(({ T, dx, dy }, i) => (
                <TempBadge key={i} x={pt.x + dx * 16} y={pt.y + dy * 16} T={T} />
              ))}
              {!isDpJunction && incomingDps.length === 1 && (
                <DpBadge x={pt.x + PT_R + 2} y={pt.y + (bothBadges && singleTemp != null && !isJunction ? 13 : 0)} dp={incomingDps[0].dp} />
              )}
              {isDpJunction && incomingDps.map(({ dp, dx, dy }, i) => (
                <DpBadge key={i} x={pt.x + dx * 16} y={pt.y + dy * 16 + (bothBadges ? 13 : 0)} dp={dp} />
              ))}
              {(() => {
                const { pDispo, pStat } = resolveNodePression(pt.id)
                if (pDispo == null && pStat == null) return null
                const bothP = pDispo != null && pStat != null
                const bx = pt.x + PT_R + 2
                return (
                  <>
                    <PressBadge x={bx} y={pt.y + (bothP ? -7 : 0)} p={pDispo} isErr={pDispo != null && pDispo < 30000} prefix="disp." />
                    <PressBadge x={bx} y={pt.y + (bothP ? 7 : 0)}  p={pStat}  isErr={pStat  != null && pStat  > 400000} prefix="stat." />
                  </>
                )
              })()}
            </g>
          )
        })}

        {/* Drawing preview */}
        {previewPath && (
          <>
            {(() => {
              const _pp = isAlimEF ? (displayPrefs?.ef ?? DEFAULT_DISPLAY_PREFS.ef)
                : isChauffage ? (displayPrefs?.chauffage ?? DEFAULT_DISPLAY_PREFS.chauffage)
                : isEauGlacee ? (displayPrefs?.eauglacee ?? DEFAULT_DISPLAY_PREFS.eauglacee)
                : (displayPrefs?.ecs ?? DEFAULT_DISPLAY_PREFS.ecs)
              const previewCol = pipeType === 'retour' ? _pp.colorRetour : _pp.colorAller
              return (
                <>
                  <path d={previewPath}
                    stroke={previewCol} strokeWidth={_pp.strokeWidth}
                    strokeDasharray={!isAlimEF && pipeType === 'retour' ? '10,6' : '5,3'}
                    fill="none" opacity={0.6} style={{ pointerEvents: 'none' }} />
                  {drawing.vertices.map((v, i) =>
                    <rect key={i} x={v.x - 2.5} y={v.y - 2.5} width={5} height={5}
                      fill={previewCol}
                      style={{ pointerEvents: 'none' }} />
                  )}
                </>
              )
            })()}
          </>
        )}

        {/* Ghost de placement d'équipement */}
        {placingEquipment !== null && (() => {
          const gx = snap(mouse.x), gy = snap(mouse.y)
          if (placingEquipment.type === 'pump') {
            const r = placingEquipment.size ?? 15, ts = r / 15
            return (
              <g style={{ pointerEvents: 'none' }}>
                <g transform={`translate(${gx},${gy}) rotate(${placingEquipment.rotation ?? 0})`}>
                  <circle r={r} fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.4)" strokeWidth={1.5} strokeDasharray="4,3" />
                  <polygon points={`${-6*ts},${-7*ts} ${-6*ts},${7*ts} ${8*ts},0`} fill="rgba(0,0,0,0.4)" />
                </g>
              </g>
            )
          }
          if (placingEquipment.type === 'arriveeEF') {
            const w = placingEquipment.size?.w ?? 44, h = placingEquipment.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={gx - w/2} y={gy - h/2} width={w} height={h}
                  fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.4)" strokeWidth={1.5} strokeDasharray="4,3" rx={3} />
                <text x={gx} y={gy - h * 0.15} fontSize={fs} fill="rgba(0,0,0,0.45)" fontWeight="700" textAnchor="middle">Arrivée</text>
                <text x={gx} y={gy + h * 0.28} fontSize={fs} fill="rgba(0,0,0,0.45)" fontWeight="700" textAnchor="middle">EF</text>
              </g>
            )
          }
          if (placingEquipment.type === 'productionECS') {
            const w = placingEquipment.size?.w ?? 44, h = placingEquipment.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={gx - w/2} y={gy - h/2} width={w} height={h}
                  fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.4)" strokeWidth={1.5} strokeDasharray="4,3" rx={3} />
                <text x={gx} y={gy - h * 0.15} fontSize={fs} fill="rgba(0,0,0,0.45)" fontWeight="700" textAnchor="middle">Production</text>
                <text x={gx} y={gy + h * 0.28} fontSize={fs} fill="rgba(0,0,0,0.45)" fontWeight="700" textAnchor="middle">ECS</text>
              </g>
            )
          }
          if (placingEquipment.type === 'productionChauffage') {
            const w = placingEquipment.size?.w ?? 44, h = placingEquipment.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={gx - w/2} y={gy - h/2} width={w} height={h}
                  fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.4)" strokeWidth={1.5} strokeDasharray="4,3" rx={3} />
                <text x={gx} y={gy - h * 0.15} fontSize={fs} fill="rgba(0,0,0,0.45)" fontWeight="700" textAnchor="middle">Production</text>
                <text x={gx} y={gy + h * 0.28} fontSize={fs} fill="rgba(0,0,0,0.45)" fontWeight="700" textAnchor="middle">Chauffage</text>
              </g>
            )
          }
          if (placingEquipment.type === 'productionEauGlacee') {
            const w = placingEquipment.size?.w ?? 44, h = placingEquipment.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={gx - w/2} y={gy - h/2} width={w} height={h}
                  fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.4)" strokeWidth={1.5} strokeDasharray="4,3" rx={3} />
                <text x={gx} y={gy - h * 0.15} fontSize={fs} fill="rgba(0,0,0,0.45)" fontWeight="700" textAnchor="middle">Groupe</text>
                <text x={gx} y={gy + h * 0.28} fontSize={fs} fill="rgba(0,0,0,0.45)" fontWeight="700" textAnchor="middle">froid</text>
              </g>
            )
          }
          if (placingEquipment.type === 'emetteur') {
            const w = placingEquipment.size?.w ?? 28, h = placingEquipment.size?.h ?? 18
            const emDef = EMETTEUR_TYPES.find(e => e.id === placingEquipment.emetteurType)
            return (
              <g style={{ pointerEvents: 'none' }}>
                {emDef && (
                  <text x={gx} y={gy - h/2 - 3} fontSize={6} fill="rgba(0,0,0,0.5)" textAnchor="middle"
                    style={{ userSelect: 'none' }}>{emDef.label}</text>
                )}
                <rect x={gx - w/2} y={gy - h/2} width={w} height={h}
                  fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.4)" strokeWidth={1.5} strokeDasharray="4,3" rx={2} />
                {[-w/4, 0, w/4].map((ox, i) => (
                  <line key={i}
                    x1={gx + ox} y1={gy - h/2 + 3}
                    x2={gx + ox} y2={gy + h/2 - 3}
                    stroke="rgba(0,0,0,0.35)" strokeWidth={1.2} />
                ))}
              </g>
            )
          }
          if (placingEquipment.type === 'terminalFroid') {
            const w = placingEquipment.size?.w ?? 28, h = placingEquipment.size?.h ?? 18
            const tfDef = TERMINAL_FROID_TYPES.find(t => t.id === placingEquipment.terminalFroidType)
            return (
              <g style={{ pointerEvents: 'none' }}>
                {tfDef && (
                  <text x={gx} y={gy - h/2 - 3} fontSize={6} fill="rgba(0,0,0,0.45)" textAnchor="middle"
                    style={{ userSelect: 'none' }}>{tfDef.label}</text>
                )}
                <rect x={gx - w/2} y={gy - h/2} width={w} height={h}
                  fill="rgba(255,255,255,0.6)" stroke="rgba(0,0,0,0.4)" strokeWidth={1.2} strokeDasharray="4,3" rx={2} />
                {[-w/4, 0, w/4].map((ox, i) => (
                  <line key={i}
                    x1={gx + ox} y1={gy - h/2 + 3}
                    x2={gx + ox} y2={gy + h/2 - 3}
                    stroke="rgba(0,0,0,0.35)" strokeWidth={1} strokeDasharray="2,1.5" />
                ))}
              </g>
            )
          }
          return null
        })()}

        {/* Ghost de placement chaufferie */}
        {placingChaufferie && levels.length > 0 && (() => {
          let li = findLevelIndexAt(mouse.y, lineYs)
          if (li < 0) li = (lineYs.length > levels.length && mouse.y <= lineYs[levels.length]) ? levels.length - 1 : 0
          const yBot = lineYs[li]
          const w = chaufferie.x2 - chaufferie.x1
          const gx1 = snap(mouse.x - w / 2)
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={gx1} y={yBot - chaufferie.height} width={w} height={chaufferie.height}
                fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} strokeDasharray="6,4" />
              <text x={gx1 + w / 2} y={yBot - chaufferie.height + 13}
                fontSize={10} fill="rgba(0,0,0,0.45)" fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none' }}>Local ECS</text>
            </g>
          )
        })()}

        {/* Ghost de placement local EF */}
        {placingLocalEF && levels.length > 0 && (() => {
          let li = findLevelIndexAt(mouse.y, lineYs)
          if (li < 0) li = (lineYs.length > levels.length && mouse.y <= lineYs[levels.length]) ? levels.length - 1 : 0
          const yBot = lineYs[li]
          const W = 270, H = 150
          const gx1 = snap(mouse.x - W / 2)
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={gx1} y={yBot - H} width={W} height={H}
                fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} strokeDasharray="6,4" />
              <text x={gx1 + W / 2} y={yBot - H + 13}
                fontSize={10} fill="rgba(0,0,0,0.45)" fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none' }}>Local EF</text>
            </g>
          )
        })()}

        {/* Ghost de placement local ECS */}
        {placingLocalECS && levels.length > 0 && (() => {
          let li = findLevelIndexAt(mouse.y, lineYs)
          if (li < 0) li = (lineYs.length > levels.length && mouse.y <= lineYs[levels.length]) ? levels.length - 1 : 0
          const yBot = lineYs[li]
          const W = 270, H = 150
          const gx1 = snap(mouse.x - W / 2)
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={gx1} y={yBot - H} width={W} height={H}
                fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} strokeDasharray="6,4" />
              <text x={gx1 + W / 2} y={yBot - H + 13}
                fontSize={10} fill="rgba(0,0,0,0.45)" fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none' }}>Local ECS</text>
            </g>
          )
        })()}

        {/* Ghost de placement local Chauffage */}
        {placingLocalChauffage && levels.length > 0 && (() => {
          let li = findLevelIndexAt(mouse.y, lineYs)
          if (li < 0) li = (lineYs.length > levels.length && mouse.y <= lineYs[levels.length]) ? levels.length - 1 : 0
          const yBot = lineYs[li]
          const W = 270, H = 150
          const gx1 = snap(mouse.x - W / 2)
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={gx1} y={yBot - H} width={W} height={H}
                fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} strokeDasharray="6,4" />
              <text x={gx1 + W / 2} y={yBot - H + 13}
                fontSize={10} fill="rgba(0,0,0,0.45)" fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none' }}>Local chauffage</text>
            </g>
          )
        })()}

        {/* Ghost de placement local Groupe Froid */}
        {placingLocalGroupeFroid && levels.length > 0 && (() => {
          let li = findLevelIndexAt(mouse.y, lineYs)
          if (li < 0) li = (lineYs.length > levels.length && mouse.y <= lineYs[levels.length]) ? levels.length - 1 : 0
          const yBot = lineYs[li]
          const W = 270, H = 150
          const gx1 = snap(mouse.x - W / 2)
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={gx1} y={yBot - H} width={W} height={H}
                fill="rgba(0,0,0,0.04)" stroke="rgba(0,0,0,0.35)" strokeWidth={1.5} strokeDasharray="6,4" />
              <text x={gx1 + W / 2} y={yBot - H + 13}
                fontSize={10} fill="rgba(0,0,0,0.45)" fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none' }}>Local groupe froid</text>
            </g>
          )
        })()}

        {/* Selection rectangle */}
        {selRect && (
          <rect
            x={Math.min(selRect.x1, selRect.x2)} y={Math.min(selRect.y1, selRect.y2)}
            width={Math.abs(selRect.x2 - selRect.x1)} height={Math.abs(selRect.y2 - selRect.y1)}
            fill="rgba(37,99,235,0.07)" stroke="#2563eb" strokeWidth={1}
            strokeDasharray="5,3" style={{ pointerEvents: 'none' }} />
        )}
      </g>

      {/* HUD */}
      {drawing && pipeType !== 'point' && (
        <text x={8} y={18} fontSize={10} fill="#94a3b8">
          Clic : point · Double-clic : fin · Échap : valider · Ctrl+Z : annuler sommet · Espace+Glisser : naviguer
        </text>
      )}
      {placingChaufferie && (
        <text x={8} y={18} fontSize={10} fill="#818cf8">
          Cliquez pour placer {isChauffage ? 'la chaufferie' : isEauGlacee ? 'le groupe froid' : 'la production ECS'} · Échap pour annuler
        </text>
      )}
      {placingLocalEF && (
        <text x={8} y={18} fontSize={10} fill="#4338ca">
          Cliquez pour placer un local EF · Échap pour annuler
        </text>
      )}
      {placingLocalECS && (
        <text x={8} y={18} fontSize={10} fill="#4338ca">
          Cliquez pour placer un local ECS · Échap pour annuler
        </text>
      )}
      {placingLocalChauffage && (
        <text x={8} y={18} fontSize={10} fill="#4338ca">
          Cliquez pour placer un local chauffage · Échap pour annuler
        </text>
      )}
      {placingLocalGroupeFroid && (
        <text x={8} y={18} fontSize={10} fill="#4338ca">
          Cliquez pour placer un local groupe froid · Échap pour annuler
        </text>
      )}
    </svg>
  )
}
