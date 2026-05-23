import { useState, useRef, useCallback, useEffect } from 'react'

const PT_R       = 4
const HIT        = 8     // segment click radius
const PT_HIT     = 10    // point click/snap radius
const DRAW_SNAP  = 14    // snap-to-point radius during drawing
const SNAP       = 10
const ZOOM_F     = 1.08

const snap = v => Math.round(v / SNAP) * SNAP
const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

function ortho(last, mouse) {
  return Math.abs(mouse.x - last.x) >= Math.abs(mouse.y - last.y)
    ? { x: snap(mouse.x), y: last.y }
    : { x: last.x, y: snap(mouse.y) }
}

function toCanvas(e, el, tf) {
  const r = el.getBoundingClientRect()
  return { x: (e.clientX - r.left - tf.x) / tf.k, y: (e.clientY - r.top - tf.y) / tf.k }
}

function ptInRect(pt, r) {
  return pt.x >= Math.min(r.x1, r.x2) && pt.x <= Math.max(r.x1, r.x2)
      && pt.y >= Math.min(r.y1, r.y2) && pt.y <= Math.max(r.y1, r.y2)
}

function segInRect(seg, r) {
  return seg.vertices.some(v => ptInRect(v, r))
}

// Nearest point on any polyline segment, within HIT
function nearestOnSegments(pos, segs) {
  let bestSeg = null, bestPt = null, bestDist = HIT
  for (const seg of segs) {
    const vs = seg.vertices
    for (let i = 0; i < vs.length - 1; i++) {
      const a = vs[i], b = vs[i + 1]
      const dx = b.x - a.x, dy = b.y - a.y
      const l2 = dx * dx + dy * dy
      if (!l2) continue
      const t = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / l2))
      const proj = { x: a.x + t * dx, y: a.y + t * dy }
      const d = dist(pos, proj)
      if (d < bestDist) { bestDist = d; bestPt = { x: snap(proj.x), y: snap(proj.y) }; bestSeg = { seg, subIdx: i } }
    }
  }
  return bestSeg ? { pt: bestPt, ...bestSeg, d: bestDist } : null
}

// Returns 'h', 'v', or 'free' based on connected segment directions at ptId
function getDragConstraint(ptId, segs) {
  const connected = segs.filter(s => s.startPointId === ptId || s.endPointId === ptId)
  if (!connected.length) return 'free'
  const dirs = connected.map(seg => {
    const vs = seg.vertices
    if (vs.length < 2) return 'free'
    const [a, b] = seg.startPointId === ptId ? [vs[0], vs[1]] : [vs[vs.length - 2], vs[vs.length - 1]]
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
  })
  if (dirs.every(d => d === 'h')) return 'h'
  if (dirs.every(d => d === 'v')) return 'v'
  return 'free'
}

// Attempts to merge two segments through ptId; returns {merged, remove} or null
function mergeAroundPt(ptId, segs) {
  const toEnd   = segs.filter(s => s.endPointId   === ptId)
  const toStart = segs.filter(s => s.startPointId === ptId)
  if (toEnd.length !== 1 || toStart.length !== 1) return null
  const s1 = toEnd[0], s2 = toStart[0]
  if (s1.type !== s2.type) return null
  return {
    merged: { ...s1, id: uid('T'), vertices: [...s1.vertices, ...s2.vertices.slice(1)], endPointId: s2.endPointId },
    remove: [s1.id, s2.id],
  }
}

// Remove points that are no longer referenced by any segment
function pruneOrphan(segs, pts) {
  const used = new Set(segs.flatMap(s => [s.startPointId, s.endPointId]))
  return pts.filter(p => used.has(p.id))
}

let _c = 0
const uid = p => `${p}-${Date.now()}-${++_c}`

export default function DrawingCanvas({
  levels, lineYs, onLineYsChange,
  segments, onSegmentsChange,
  points, onPointsChange,
  onNetworkChange,
  drawMode, pipeType,
  selectedIds, onSelectIds,
  editLevelsEnabled, editColumnsEnabled,
  columns, columnXs, onColumnXsChange,
}) {
  const svgRef     = useRef(null)
  const spaceRef   = useRef(false)
  const panDownRef = useRef(null)
  const ptDragRef  = useRef(null)  // {ptId, startX, startY, origX, origY, moved, constraint}

  const [tf,        setTf]        = useState({ x: 80, y: 40, k: 1 })
  const [panSt,     setPanSt]     = useState(null)
  const [dragLine,  setDragLine]  = useState(null)
  const [dragCol,   setDragCol]   = useState(null)   // {idx, screenX, origX}
  const [drawing,   setDrawing]   = useState(null)
  const [mouse,     setMouse]     = useState({ x: 0, y: 0 })
  const [rectSt,    setRectSt]    = useState(null)
  const [selRect,   setSelRect]   = useState(null)
  const [ptDragPos, setPtDragPos] = useState(null)  // live drag {ptId,x,y}

  // ── Clear drawing on mode/type change ────────────────
  useEffect(() => { if (drawMode !== 'draw') setDrawing(null) }, [drawMode])
  useEffect(() => { if (pipeType === 'point') setDrawing(null) }, [pipeType])

  // ── Split segment at position (atomic) ───────────────
  const splitSegment = useCallback((hitInfo, splitPos) => {
    const { seg, subIdx } = hitInfo
    const sp = { x: snap(splitPos.x), y: snap(splitPos.y) }
    const newPt = { id: uid('P'), name: '', x: sp.x, y: sp.y }
    const vs = seg.vertices
    const seg1 = { ...seg, id: uid('T'), vertices: [...vs.slice(0, subIdx + 1), sp], endPointId: newPt.id }
    const seg2 = { ...seg, id: uid('T'), vertices: [sp, ...vs.slice(subIdx + 1)], startPointId: newPt.id }
    onNetworkChange(
      s => s.filter(x => x.id !== seg.id).concat([seg1, seg2]),
      p => [...p, newPt]
    )
    return newPt
  }, [onNetworkChange])

  // ── Commit in-progress drawing (Escape) ──────────────
  const commitDrawing = useCallback((d) => {
    const cur = d ?? drawing
    if (!cur || cur.vertices.length < 2) { setDrawing(null); return }
    const verts = cur.vertices
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
      id: uid('T'), name: '', type: cur.type, vertices: verts,
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
    const verts = [...drawing.vertices, endPos]
    if (verts.length < 2) return
    let startId = drawing.startPtId
    const newPts = []
    if (!startId) {
      const p = { id: uid('P'), name: '', x: verts[0].x, y: verts[0].y }
      newPts.push(p); startId = p.id
    }
    let endId = endPtId
    if (!endId) {
      const p = { id: uid('P'), name: '', x: endPos.x, y: endPos.y }
      newPts.push(p); endId = p.id
    }
    const seg = {
      id: uid('T'), name: '', type: drawing.type, vertices: verts,
      startPointId: startId, endPointId: endId,
      materialId: null, dn: null, di_override: null, de_override: null, lambda_tube_override: null,
      insulationId: null, thickness: null, lambda_insul_override: null,
      length_override: null, flowRate: null, velocity: null,
    }
    onNetworkChange(s => [...s, seg], p => [...p, ...newPts])
    setDrawing(null)
  }, [drawing, onNetworkChange])

  // ── Delete a point with segment merging ───────────────
  const deletePoint = useCallback((ptId) => {
    const op = mergeAroundPt(ptId, segments)
    if (op) {
      onNetworkChange(
        s => s.filter(x => !op.remove.includes(x.id)).concat([op.merged]),
        p => p.filter(x => x.id !== ptId)
      )
    } else {
      onNetworkChange(
        s => s.filter(x => x.startPointId !== ptId && x.endPointId !== ptId),
        p => p.filter(x => x.id !== ptId)
      )
    }
    onSelectIds([])
  }, [segments, onNetworkChange, onSelectIds])

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
        if (drawing) commitDrawing()
        else onSelectIds([])
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
        const delPtIds = selectedIds.filter(id => points.some(p => p.id === id))
        const delSegIds = new Set(selectedIds.filter(id => segments.some(s => s.id === id)))

        let newSegs = segments.filter(s => !delSegIds.has(s.id))
        let newPts  = [...points]
        for (const ptId of delPtIds) {
          const op = mergeAroundPt(ptId, newSegs)
          if (op) {
            newSegs = newSegs.filter(s => !op.remove.includes(s.id)).concat([op.merged])
          } else {
            newSegs = newSegs.filter(s => s.startPointId !== ptId && s.endPointId !== ptId)
          }
          newPts = newPts.filter(p => p.id !== ptId)
        }
        onNetworkChange(newSegs, newPts)
        onSelectIds([])
      }
    }
    const ku = e => { if (e.code === 'Space') spaceRef.current = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup',   ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [drawing, commitDrawing, selectedIds, segments, points, onNetworkChange, onSelectIds])

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
  const nearPt  = useCallback(pos => {
    let best = null, bestD = PT_HIT
    for (const p of points) { const d = dist(p, pos); if (d < bestD) { bestD = d; best = p } }
    return best
  }, [points])

  const nearSeg = useCallback(pos => {
    for (const seg of segments) {
      const vs = seg.vertices
      for (let i = 0; i < vs.length - 1; i++) {
        const a = vs[i], b = vs[i + 1]
        const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2
        if (!l2) continue
        const t = Math.max(0, Math.min(1, ((pos.x - a.x) * (b.x - a.x) + (pos.y - a.y) * (b.y - a.y)) / l2))
        if (dist(pos, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) }) < HIT) return seg
      }
    }
    return null
  }, [segments])

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
      const newX = dragCol.origX + (e.clientX - dragCol.screenX) / tf.k
      onColumnXsChange(xs => {
        const next = [...xs]
        const MIN_GAP = 80
        const maxX = dragCol.idx < xs.length - 1 ? xs[dragCol.idx + 1] - MIN_GAP : Infinity
        const minX = dragCol.idx > 0             ? xs[dragCol.idx - 1] + MIN_GAP : -Infinity
        next[dragCol.idx] = Math.max(minX, Math.min(maxX, newX))
        return next
      })
      return
    }
    if (ptDragRef.current) {
      const dx = e.clientX - ptDragRef.current.startX
      const dy = e.clientY - ptDragRef.current.startY
      if (!ptDragRef.current.moved && Math.sqrt(dx * dx + dy * dy) > 4) ptDragRef.current.moved = true
      if (ptDragRef.current.moved) {
        const { constraint, origX, origY } = ptDragRef.current
        const x = constraint === 'v' ? origX : snap(pos.x)
        const y = constraint === 'h' ? origY : snap(pos.y)
        setPtDragPos({ ptId: ptDragRef.current.ptId, x, y })
      }
      return
    }
    if (rectSt) setSelRect({ x1: rectSt.x, y1: rectSt.y, x2: pos.x, y2: pos.y })
  }, [tf, panSt, dragLine, dragCol, rectSt, onLineYsChange, onColumnXsChange])

  // ── mouse down ───────────────────────────────────────
  const onMouseDown = useCallback(e => {
    if (!svgRef.current) return
    const pos = toCanvas(e, svgRef.current, tf)

    // Space+left or middle → pan (all modes)
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault()
      setPanSt({ ox: e.clientX - tf.x, oy: e.clientY - tf.y })
      return
    }
    if (e.button !== 0) return

    // ── Delete mode ──
    if (drawMode === 'delete') {
      const np = nearPt(pos)
      if (np) { deletePoint(np.id); return }
      const ns = nearSeg(pos)
      if (ns) {
        onNetworkChange(
          s => {
            const newSegs = s.filter(x => x.id !== ns.id)
            return pruneOrphan(newSegs, null) !== null ? newSegs : newSegs
          },
          p => pruneOrphan(segments.filter(s => s.id !== ns.id), p)
        )
        return
      }
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
        if (onSeg && !ptId) {
          const newPt = splitSegment(onSeg, sp)
          setDrawing({ vertices: [{ x: newPt.x, y: newPt.y }], startPtId: newPt.id, type: pipeType })
        } else {
          setDrawing({ vertices: [sp], startPtId: ptId, type: pipeType })
        }
      } else {
        const { pos: sp, ptId, onSeg } = resolveSnap(snapped)
        if (ptId) {
          finalize(sp, ptId)
        } else if (onSeg) {
          const newPt = splitSegment(onSeg, sp)
          finalize({ x: newPt.x, y: newPt.y }, newPt.id)
        } else {
          setDrawing(d => ({ ...d, vertices: [...d.vertices, sp] }))
        }
      }
      return
    }

    // ── Select mode ──
    const np = nearPt(pos)
    if (np) {
      onSelectIds(ids => e.shiftKey
        ? ids.includes(np.id) ? ids.filter(i => i !== np.id) : [...ids, np.id]
        : [np.id])
      ptDragRef.current = {
        ptId: np.id, startX: e.clientX, startY: e.clientY,
        origX: np.x, origY: np.y, moved: false,
        constraint: getDragConstraint(np.id, segments),
      }
      return
    }
    const ns = nearSeg(pos)
    if (ns) {
      onSelectIds(ids => e.shiftKey
        ? ids.includes(ns.id) ? ids.filter(i => i !== ns.id) : [...ids, ns.id]
        : [ns.id])
      return
    }

    // Empty space
    if (e.ctrlKey || e.metaKey) {
      setRectSt(pos)
      setSelRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
    } else {
      panDownRef.current = { screenX: e.clientX, screenY: e.clientY }
      setPanSt({ ox: e.clientX - tf.x, oy: e.clientY - tf.y })
    }
  }, [tf, lineYs, drawMode, drawing, pipeType, nearPt, nearSeg,
      finalize, splitSegment, resolveSnap, deletePoint,
      segments, onNetworkChange, onSelectIds])

  // ── mouse up ──────────────────────────────────────────
  const onMouseUp = useCallback(e => {
    setPanSt(null)
    setDragLine(null)
    setDragCol(null)

    // Click vs pan: deselect only on click
    if (panDownRef.current) {
      const dx = e.clientX - panDownRef.current.screenX
      const dy = e.clientY - panDownRef.current.screenY
      if (Math.sqrt(dx * dx + dy * dy) < 4 && !e.shiftKey) onSelectIds([])
      panDownRef.current = null
    }

    // Commit point drag
    if (ptDragRef.current && ptDragRef.current.moved && ptDragPos) {
      const { ptId } = ptDragRef.current
      const np = { x: ptDragPos.x, y: ptDragPos.y }

      // Priority 1: overlapping another point → merge
      const overlap = points.find(p => p.id !== ptId && dist(p, np) < SNAP)
      if (overlap) {
        const op = { x: overlap.x, y: overlap.y, id: overlap.id }
        onNetworkChange(
          s => s.map(seg => {
            if (seg.startPointId === ptId) {
              const v = [...seg.vertices]; v[0] = op; return { ...seg, vertices: v, startPointId: op.id }
            }
            if (seg.endPointId === ptId) {
              const v = [...seg.vertices]; v[v.length - 1] = op; return { ...seg, vertices: v, endPointId: op.id }
            }
            return seg
          }),
          p => p.filter(x => x.id !== ptId)
        )
      } else {
        // Priority 2: dropping on a segment → split and become junction
        const exclude = new Set([
          ...segments.filter(s => s.startPointId === ptId || s.endPointId === ptId).map(s => s.id)
        ])
        const hitSeg = nearestOnSegments(np, segments.filter(s => !exclude.has(s.id)))

        if (hitSeg && hitSeg.d < SNAP) {
          const { seg, subIdx } = hitSeg
          const seg1 = { ...seg, id: uid('T'), vertices: [...seg.vertices.slice(0, subIdx + 1), np], endPointId: ptId }
          const seg2 = { ...seg, id: uid('T'), vertices: [np, ...seg.vertices.slice(subIdx + 1)], startPointId: ptId }
          onNetworkChange(
            s => {
              let r = s.filter(x => x.id !== seg.id)
              r = r.map(x => {
                if (x.startPointId === ptId) { const v = [...x.vertices]; v[0] = np; return { ...x, vertices: v } }
                if (x.endPointId   === ptId) { const v = [...x.vertices]; v[v.length - 1] = np; return { ...x, vertices: v } }
                return x
              })
              return r.concat([seg1, seg2])
            },
            p => p.map(x => x.id === ptId ? { ...x, ...np } : x)
          )
        } else {
          // Priority 3: plain move
          onNetworkChange(
            s => s.map(seg => {
              if (seg.startPointId === ptId) { const v = [...seg.vertices]; v[0] = np; return { ...seg, vertices: v } }
              if (seg.endPointId   === ptId) { const v = [...seg.vertices]; v[v.length - 1] = np; return { ...seg, vertices: v } }
              return seg
            }),
            p => p.map(x => x.id === ptId ? { ...x, ...np } : x)
          )
        }
      }
      setPtDragPos(null)
    }
    if (ptDragRef.current) ptDragRef.current = null

    // Rect select
    if (rectSt && selRect) {
      const ids = []
      segments.forEach(s => { if (segInRect(s, selRect)) ids.push(s.id) })
      points.forEach(p   => { if (ptInRect(p, selRect))  ids.push(p.id) })
      onSelectIds(prev => e.shiftKey ? [...new Set([...prev, ...ids])] : ids)
      setRectSt(null); setSelRect(null)
    }
  }, [rectSt, selRect, segments, points, onSelectIds, ptDragPos, onNetworkChange])

  // ── double-click → end segment ────────────────────────
  const onDblClick = useCallback(e => {
    if (drawMode !== 'draw' || !drawing || pipeType === 'point') return
    e.preventDefault()
    const pos = toCanvas(e, svgRef.current, tf)
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
  }, [drawMode, drawing, pipeType, tf, finalize, splitSegment, resolveSnap])

  // ── preview ───────────────────────────────────────────
  const previewTgt  = drawing && pipeType !== 'point'
    ? ortho(drawing.vertices[drawing.vertices.length - 1], mouse) : null
  const previewPath = previewTgt
    ? [...drawing.vertices, previewTgt].map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ')
    : null

  const cursor = dragLine !== null ? 'ns-resize'
    : dragCol !== null ? 'ew-resize'
    : panSt ? 'grabbing'
    : ptDragRef.current?.moved ? 'move'
    : drawMode === 'delete' ? 'crosshair'
    : spaceRef.current ? 'grab'
    : drawMode === 'draw' ? 'crosshair'
    : 'default'

  const zones = levels.map((lvl, i) => ({ ...lvl, yBot: lineYs[i], yTop: lineYs[i + 1] }))

  // Live drag overrides for rendering
  const renderPts = ptDragPos
    ? points.map(p => p.id === ptDragPos.ptId ? { ...p, x: ptDragPos.x, y: ptDragPos.y } : p)
    : points
  const renderSegs = ptDragPos
    ? segments.map(seg => {
        if (seg.startPointId === ptDragPos.ptId) {
          const v = [...seg.vertices]; v[0] = { x: ptDragPos.x, y: ptDragPos.y }; return { ...seg, vertices: v }
        }
        if (seg.endPointId === ptDragPos.ptId) {
          const v = [...seg.vertices]; v[v.length - 1] = { x: ptDragPos.x, y: ptDragPos.y }; return { ...seg, vertices: v }
        }
        return seg
      })
    : segments

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

        {/* Zone backgrounds */}
        {zones.map((z, i) => (
          <g key={z.id}>
            <rect x={0} y={z.yTop} width={3000} height={z.yBot - z.yTop}
              fill={i % 2 === 0 ? '#ffffff' : '#f8fafc'} />
            <text x={14} y={(z.yTop + z.yBot) / 2 + 5}
              fontSize={12} fill="#d1d8e0" fontWeight="700"
              style={{ userSelect: 'none', pointerEvents: 'none' }}>
              {z.name}
            </text>
          </g>
        ))}

        {/* Column lines */}
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
          return (
            <g key={col.id} style={{ pointerEvents: 'none' }}>
              <line x1={x1} y1={yTop} x2={x1} y2={yBot} stroke="#d1d9e6" strokeWidth={1} />
              <line x1={x2} y1={yTop} x2={x2} y2={yBot} stroke="#d1d9e6" strokeWidth={1} />
              <text x={(x1 + x2) / 2} y={yTop + 14} fontSize={10} fill="#b8c0cc" fontWeight="600"
                textAnchor="middle" style={{ userSelect: 'none' }}>
                {col.name}
              </text>
            </g>
          )
        })}
        {editColumnsEnabled && (columnXs ?? []).map((x, i) => (
          <rect key={`cdrag${i}`}
            x={x - 5} y={lineYs[lineYs.length - 1]}
            width={10} height={Math.max(0, lineYs[0] - lineYs[lineYs.length - 1])}
            fill="transparent" style={{ cursor: 'ew-resize' }}
            onMouseDown={ev => { ev.stopPropagation(); setDragCol({ idx: i, screenX: ev.clientX, origX: x }) }} />
        ))}

        {/* Level lines */}
        {lineYs.map((y, i) => {
          const isToiture = i === lineYs.length - 1
          return (
            <g key={`ln${i}`}>
              <line x1={0} y1={y} x2={3000} y2={y}
                stroke={isToiture ? '#94a3b8' : '#cbd5e1'}
                strokeWidth={isToiture ? 1.5 : 1}
                strokeDasharray={isToiture ? '8,5' : 'none'} />
              {isToiture && (
                <text x={14} y={y - 5} fontSize={10} fill="#94a3b8" fontWeight="600"
                  style={{ userSelect: 'none', pointerEvents: 'none' }}>Toiture</text>
              )}
              {editLevelsEnabled && (
                <rect x={0} y={y - 6} width={3000} height={12}
                  fill="transparent" style={{ cursor: 'ns-resize' }}
                  onMouseDown={ev => { ev.stopPropagation(); setDragLine({ idx: i, screenY: ev.clientY, origY: y }) }} />
              )}
            </g>
          )
        })}

        {/* Segments */}
        {renderSegs.map(seg => {
          const sel  = selectedIds.includes(seg.id)
          const col  = seg.type === 'retour' ? '#f97316' : '#dc2626'
          const dash = seg.type === 'retour' ? '10,6' : 'none'
          const path = seg.vertices.map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ')
          return (
            <g key={seg.id}>
              <path d={path} stroke="transparent" strokeWidth={14} fill="none"
                style={{ cursor: drawMode === 'delete' ? 'crosshair' : 'pointer' }}
                onClick={ev => {
                  if (drawMode === 'delete') return
                  ev.stopPropagation()
                  onSelectIds(ids => ev.shiftKey
                    ? ids.includes(seg.id) ? ids.filter(i => i !== seg.id) : [...ids, seg.id]
                    : [seg.id])
                }} />
              <path d={path}
                stroke={sel ? '#2563eb' : col} strokeWidth={sel ? 2.5 : 1.5}
                strokeDasharray={sel ? 'none' : dash} fill="none"
                style={{ pointerEvents: 'none' }} />
              {seg.name && (() => {
                const v = seg.vertices[Math.floor(seg.vertices.length / 2)] || seg.vertices[0]
                return <text x={v.x + 4} y={v.y - 5} fontSize={9} fill={col} fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>{seg.name}</text>
              })()}
            </g>
          )
        })}

        {/* Points */}
        {renderPts.map(pt => {
          const sel     = selectedIds.includes(pt.id)
          const dragged = ptDragPos?.ptId === pt.id
          return (
            <g key={pt.id}
              style={{ cursor: drawMode === 'delete' ? 'crosshair' : 'pointer' }}
              onClick={ev => {
                if (drawMode === 'delete') return
                ev.stopPropagation()
                onSelectIds(ids => ev.shiftKey
                  ? ids.includes(pt.id) ? ids.filter(i => i !== pt.id) : [...ids, pt.id]
                  : [pt.id])
              }}>
              <circle cx={pt.x} cy={pt.y} r={PT_R + 6} fill="transparent" />
              <circle cx={pt.x} cy={pt.y} r={PT_R}
                fill={sel || dragged ? '#dbeafe' : '#fff'}
                stroke={sel || dragged ? '#2563eb' : '#374151'} strokeWidth={1.5} />
              {pt.name && (
                <text x={pt.x + PT_R + 3} y={pt.y + 3} fontSize={10} fill="#374151" fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>{pt.name}</text>
              )}
            </g>
          )
        })}

        {/* Drawing preview */}
        {previewPath && (
          <>
            <path d={previewPath}
              stroke={pipeType === 'retour' ? '#f97316' : '#dc2626'} strokeWidth={1.5}
              strokeDasharray={pipeType === 'retour' ? '10,6' : '5,3'}
              fill="none" opacity={0.6} style={{ pointerEvents: 'none' }} />
            {drawing.vertices.map((v, i) =>
              <circle key={i} cx={v.x} cy={v.y} r={2.5}
                fill={pipeType === 'retour' ? '#f97316' : '#dc2626'}
                style={{ pointerEvents: 'none' }} />
            )}
          </>
        )}

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
      {!drawing && drawMode === 'select' && (
        <text x={8} y={18} fontSize={10} fill="#cbd5e1">
          Sélectionner · Glisser (point) : déplacer sur son axe · Ctrl+Drag : rect · Espace+Glisser : naviguer
        </text>
      )}
      {drawMode === 'delete' && (
        <text x={8} y={18} fontSize={10} fill="#dc262699">
          Mode suppression — cliquer sur un élément pour le supprimer
        </text>
      )}
    </svg>
  )
}
