import { useState, useRef, useCallback, useEffect } from 'react'

const PT_R  = 4
const HIT   = 10
const SNAP  = 10

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

// Find nearest point on any segment's polyline within HIT distance
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
  return bestSeg ? { pt: bestPt, ...bestSeg } : null
}

let _c = 0
const uid = p => `${p}-${Date.now()}-${++_c}`

export default function DrawingCanvas({
  levels, lineYs, onLineYsChange,
  segments, onSegmentsChange,
  points,   onPointsChange,
  drawMode, pipeType,
  selectedIds, onSelectIds,
}) {
  const svgRef     = useRef(null)
  const spaceRef   = useRef(false)
  const panDownRef = useRef(null)   // {screenX,screenY} — detect click vs drag for deselect
  const ptDragRef  = useRef(null)   // {ptId, startX, startY, moved}

  const [tf,        setTf]        = useState({ x: 80, y: 40, k: 1 })
  const [panSt,     setPanSt]     = useState(null)
  const [dragLine,  setDragLine]  = useState(null)
  const [drawing,   setDrawing]   = useState(null)
  const [mouse,     setMouse]     = useState({ x: 0, y: 0 })
  const [rectSt,    setRectSt]    = useState(null)
  const [selRect,   setSelRect]   = useState(null)
  const [ptDragPos, setPtDragPos] = useState(null)  // live drag override {ptId,x,y}

  // ── Split segment at snapped position ────────────────
  const splitSegment = useCallback((hitInfo, splitPos) => {
    const { seg, subIdx } = hitInfo
    const sp = { x: snap(splitPos.x), y: snap(splitPos.y) }
    const newPt = { id: uid('P'), name: '', x: sp.x, y: sp.y }
    const vs = seg.vertices
    const seg1 = { ...seg, id: uid('T'), vertices: [...vs.slice(0, subIdx + 1), sp], endPointId: newPt.id }
    const seg2 = { ...seg, id: uid('T'), vertices: [sp, ...vs.slice(subIdx + 1)], startPointId: newPt.id }
    onPointsChange(p => [...p, newPt])
    onSegmentsChange(s => s.filter(x => x.id !== seg.id).concat([seg1, seg2]))
    return newPt
  }, [onPointsChange, onSegmentsChange])

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
    const existing = points.find(p => dist(p, endPos) < 2)
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
    onPointsChange(p => [...p, ...newPts])
    onSegmentsChange(s => [...s, seg])
    setDrawing(null)
  }, [drawing, points, onPointsChange, onSegmentsChange])

  // ── Finalize to explicit endpoint ────────────────────
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
    onPointsChange(p => [...p, ...newPts])
    onSegmentsChange(s => [...s, seg])
    setDrawing(null)
  }, [drawing, onPointsChange, onSegmentsChange])

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
        onSegmentsChange(s => s.filter(x => !selectedIds.includes(x.id)))
        onPointsChange(p => p.filter(x => !selectedIds.includes(x.id)))
        onSelectIds([])
      }
    }
    const ku = e => { if (e.code === 'Space') spaceRef.current = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup',   ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [drawing, commitDrawing, selectedIds, onSegmentsChange, onPointsChange, onSelectIds])

  useEffect(() => {
    if (drawMode !== 'draw') setDrawing(null)
  }, [drawMode])

  // ── zoom ─────────────────────────────────────────────
  const onWheel = useCallback(e => {
    e.preventDefault()
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12
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
  const nearPt = useCallback(pos => points.find(p => dist(p, pos) < HIT * 2), [points])
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

  // ── Resolve snap target for drawing ──────────────────
  // Returns {pos, ptId} — snaps to axis-aligned points first, then to segments
  const resolveSnap = useCallback((snapped) => {
    // Only snap to an existing point if it lies on the orthogonal axis (very close)
    const npRaw = nearPt(snapped)
    if (npRaw && dist(npRaw, snapped) < 5) return { pos: { x: npRaw.x, y: npRaw.y }, ptId: npRaw.id }
    // Otherwise check if the orthogonal endpoint is on a segment
    const onSeg = nearestOnSegments(snapped, segments)
    if (onSeg) return { pos: onSeg.pt, ptId: null, onSeg }
    return { pos: snapped, ptId: null }
  }, [nearPt, segments])

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
    if (ptDragRef.current) {
      const dx = e.clientX - ptDragRef.current.startX
      const dy = e.clientY - ptDragRef.current.startY
      if (!ptDragRef.current.moved && Math.sqrt(dx * dx + dy * dy) > 4) ptDragRef.current.moved = true
      if (ptDragRef.current.moved) {
        setPtDragPos({ ptId: ptDragRef.current.ptId, x: snap(pos.x), y: snap(pos.y) })
      }
      return
    }
    if (rectSt) setSelRect({ x1: rectSt.x, y1: rectSt.y, x2: pos.x, y2: pos.y })
  }, [tf, panSt, dragLine, rectSt, onLineYsChange])

  // ── mouse down ───────────────────────────────────────
  const onMouseDown = useCallback(e => {
    if (!svgRef.current) return
    const pos = toCanvas(e, svgRef.current, tf)

    // Middle mouse or Space+left → pan (works in all modes)
    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault()
      setPanSt({ ox: e.clientX - tf.x, oy: e.clientY - tf.y })
      return
    }
    if (e.button !== 0) return

    // Level line drag
    for (let i = 0; i < lineYs.length; i++) {
      if (Math.abs(pos.y - lineYs[i]) < 8) {
        setDragLine({ idx: i, screenY: e.clientY, origY: lineYs[i] })
        return
      }
    }

    // ── Draw mode ──
    if (drawMode === 'draw') {
      const snapped = drawing
        ? ortho(drawing.vertices[drawing.vertices.length - 1], pos)
        : { x: snap(pos.x), y: snap(pos.y) }

      if (!drawing) {
        // Start: snap to point or segment, else free
        const { pos: sp, ptId, onSeg } = resolveSnap(snapped)
        if (onSeg) {
          const newPt = splitSegment(onSeg, sp)
          setDrawing({ vertices: [{ x: newPt.x, y: newPt.y }], startPtId: newPt.id, type: pipeType })
        } else {
          setDrawing({ vertices: [sp], startPtId: ptId, type: pipeType })
        }
      } else {
        // Continue: resolve snap at orthogonal endpoint
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
      ptDragRef.current = { ptId: np.id, startX: e.clientX, startY: e.clientY, moved: false }
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
  }, [tf, lineYs, drawMode, drawing, pipeType, nearPt, nearSeg, finalize, splitSegment, resolveSnap, onSelectIds])

  // ── mouse up ──────────────────────────────────────────
  const onMouseUp = useCallback(e => {
    setPanSt(null)
    setDragLine(null)

    // Deselect only on a clean click (not after a drag/pan)
    if (panDownRef.current) {
      const dx = e.clientX - panDownRef.current.screenX
      const dy = e.clientY - panDownRef.current.screenY
      if (Math.sqrt(dx * dx + dy * dy) < 4 && !e.shiftKey) onSelectIds([])
      panDownRef.current = null
    }

    // Commit point drag on mouseup
    if (ptDragRef.current) {
      if (ptDragRef.current.moved && ptDragPos) {
        const { ptId } = ptDragRef.current
        const np = { x: ptDragPos.x, y: ptDragPos.y }
        onPointsChange(pts => pts.map(p => p.id === ptId ? { ...p, ...np } : p))
        onSegmentsChange(segs => segs.map(seg => {
          if (seg.startPointId === ptId) {
            const v = [...seg.vertices]; v[0] = np; return { ...seg, vertices: v }
          }
          if (seg.endPointId === ptId) {
            const v = [...seg.vertices]; v[v.length - 1] = np; return { ...seg, vertices: v }
          }
          return seg
        }))
        setPtDragPos(null)
      }
      ptDragRef.current = null
    }

    if (rectSt && selRect) {
      const ids = []
      segments.forEach(s => { if (segInRect(s, selRect)) ids.push(s.id) })
      points.forEach(p   => { if (ptInRect(p, selRect))  ids.push(p.id) })
      onSelectIds(prev => e.shiftKey ? [...new Set([...prev, ...ids])] : ids)
      setRectSt(null); setSelRect(null)
    }
  }, [rectSt, selRect, segments, points, onSelectIds, ptDragPos, onPointsChange, onSegmentsChange])

  // ── double-click → end segment ────────────────────────
  const onDblClick = useCallback(e => {
    if (drawMode !== 'draw' || !drawing) return
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
  }, [drawMode, drawing, tf, finalize, splitSegment, resolveSnap])

  // ── preview ───────────────────────────────────────────
  const previewTgt  = drawing ? ortho(drawing.vertices[drawing.vertices.length - 1], mouse) : null
  const previewPath = drawing
    ? [...drawing.vertices, previewTgt].map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ')
    : null

  const isDraggingPt = ptDragRef.current?.moved
  const cursor = panSt ? 'grabbing'
    : isDraggingPt ? 'move'
    : spaceRef.current ? 'grab'
    : drawMode === 'draw' ? 'crosshair'
    : 'default'

  const zones = levels.map((lvl, i) => ({ ...lvl, yBot: lineYs[i], yTop: lineYs[i + 1] }))

  // Apply live point-drag overrides for rendering
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

        {/* ── Zone backgrounds ── */}
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

        {/* ── Level lines ── */}
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
              <rect x={0} y={y - 6} width={3000} height={12}
                fill="transparent" style={{ cursor: 'ns-resize' }}
                onMouseDown={ev => {
                  ev.stopPropagation()
                  setDragLine({ idx: i, screenY: ev.clientY, origY: y })
                }} />
            </g>
          )
        })}

        {/* ── Segments ── */}
        {renderSegs.map(seg => {
          const sel  = selectedIds.includes(seg.id)
          const col  = seg.type === 'retour' ? '#f97316' : '#dc2626'
          const dash = seg.type === 'retour' ? '10,6' : 'none'
          const path = seg.vertices.map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ')
          return (
            <g key={seg.id}>
              <path d={path} stroke="transparent" strokeWidth={14} fill="none"
                style={{ cursor: 'pointer' }}
                onClick={ev => {
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

        {/* ── Points ── */}
        {renderPts.map(pt => {
          const sel = selectedIds.includes(pt.id)
          const dragged = ptDragPos?.ptId === pt.id
          return (
            <g key={pt.id} style={{ cursor: 'pointer' }}
              onClick={ev => {
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

        {/* ── Drawing preview ── */}
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

        {/* ── Selection rectangle ── */}
        {selRect && (
          <rect
            x={Math.min(selRect.x1, selRect.x2)} y={Math.min(selRect.y1, selRect.y2)}
            width={Math.abs(selRect.x2 - selRect.x1)} height={Math.abs(selRect.y2 - selRect.y1)}
            fill="rgba(37,99,235,0.07)" stroke="#2563eb" strokeWidth={1}
            strokeDasharray="5,3" style={{ pointerEvents: 'none' }} />
        )}
      </g>

      {/* HUD */}
      {drawing && (
        <text x={8} y={18} fontSize={10} fill="#94a3b8">
          Clic : point · Double-clic : fin · Échap : valider · Ctrl+Z : annuler dernier · Espace+Glisser : naviguer
        </text>
      )}
      {!drawing && drawMode === 'select' && (
        <text x={8} y={18} fontSize={10} fill="#cbd5e1">
          Clic : sélectionner · Maintenir+Glisser (point) : déplacer · Ctrl+Drag : sélection rect · Espace+Glisser : naviguer
        </text>
      )}
    </svg>
  )
}
