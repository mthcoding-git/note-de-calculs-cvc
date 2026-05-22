import { useState, useRef, useCallback, useEffect } from 'react'

const PT_R   = 7
const HIT    = 10
const SNAP   = 10

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

let _c = 0
const uid = p => `${p}-${Date.now()}-${++_c}`

export default function DrawingCanvas({
  levels, lineYs, onLineYsChange,
  segments, onSegmentsChange,
  points,   onPointsChange,
  drawMode, pipeType,
  selectedIds, onSelectIds,
}) {
  const svgRef   = useRef(null)
  const spaceRef = useRef(false)

  const [tf,       setTf]       = useState({ x: 80, y: 40, k: 1 })
  const [panSt,    setPanSt]    = useState(null)   // {ox,oy} screen origin minus tf
  const [dragLine, setDragLine] = useState(null)   // {idx, screenY, origY}
  const [drawing,  setDrawing]  = useState(null)   // {vertices, startPtId, type}
  const [mouse,    setMouse]    = useState({ x: 0, y: 0 })
  const [rectSt,   setRectSt]   = useState(null)   // Ctrl+drag start {x,y}
  const [selRect,  setSelRect]  = useState(null)   // {x1,y1,x2,y2}

  // ── keyboard ─────────────────────────────────────────
  useEffect(() => {
    const kd = e => {
      if (e.target.matches('input,select,textarea')) return
      if (e.code === 'Space') { e.preventDefault(); spaceRef.current = true }
      if (e.key === 'Escape') {
        if (drawing) setDrawing(null)
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
  }, [drawing, selectedIds, onSegmentsChange, onPointsChange, onSelectIds])

  // Clear drawing when switching away from draw mode
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
  const nearPt  = useCallback(pos => points.find(p => dist(p, pos) < HIT * 2), [points])
  const nearSeg = useCallback(pos => {
    for (const seg of segments) {
      const vs = seg.vertices
      for (let i = 0; i < vs.length - 1; i++) {
        const a = vs[i], b = vs[i + 1]
        const l2 = (b.x-a.x)**2+(b.y-a.y)**2
        if (!l2) continue
        const t = Math.max(0, Math.min(1, ((pos.x-a.x)*(b.x-a.x)+(pos.y-a.y)*(b.y-a.y))/l2))
        if (dist(pos, {x:a.x+t*(b.x-a.x), y:a.y+t*(b.y-a.y)}) < HIT) return seg
      }
    }
    return null
  }, [segments])

  // ── finalize segment ──────────────────────────────────
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
        // lineYs[0] = bottom (largest y), lineYs[n] = top (smallest y)
        // idx-1 is the line below (larger y), idx+1 is the line above (smaller y)
        const maxY = dragLine.idx > 0             ? ys[dragLine.idx - 1] - MIN_GAP : Infinity
        const minY = dragLine.idx < ys.length - 1 ? ys[dragLine.idx + 1] + MIN_GAP : -Infinity
        next[dragLine.idx] = Math.max(minY, Math.min(maxY, newY))
        return next
      })
      return
    }
    if (rectSt) setSelRect({ x1: rectSt.x, y1: rectSt.y, x2: pos.x, y2: pos.y })
  }, [tf, panSt, dragLine, rectSt, onLineYsChange])

  // ── mouse down ───────────────────────────────────────
  const onMouseDown = useCallback(e => {
    if (!svgRef.current) return
    const pos = toCanvas(e, svgRef.current, tf)

    // Middle mouse or Space+left → pan
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
      const np = nearPt(snapped)
      if (!drawing) {
        setDrawing({ vertices: [snapped], startPtId: np?.id ?? null, type: pipeType })
      } else {
        if (np) finalize(np, np.id)
        else setDrawing(d => ({ ...d, vertices: [...d.vertices, snapped] }))
      }
      return
    }

    // ── Select mode ──
    const np = nearPt(pos)
    if (np) {
      onSelectIds(ids => e.shiftKey
        ? ids.includes(np.id) ? ids.filter(i => i !== np.id) : [...ids, np.id]
        : [np.id])
      return
    }
    const ns = nearSeg(pos)
    if (ns) {
      onSelectIds(ids => e.shiftKey
        ? ids.includes(ns.id) ? ids.filter(i => i !== ns.id) : [...ids, ns.id]
        : [ns.id])
      return
    }

    // Empty space: Ctrl+drag → rect select, else → pan
    if (e.ctrlKey || e.metaKey) {
      setRectSt(pos)
      setSelRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
    } else {
      if (!e.shiftKey) onSelectIds([])
      setPanSt({ ox: e.clientX - tf.x, oy: e.clientY - tf.y })
    }
  }, [tf, lineYs, drawMode, drawing, pipeType, nearPt, nearSeg, finalize, onSelectIds])

  // ── mouse up ──────────────────────────────────────────
  const onMouseUp = useCallback(e => {
    setPanSt(null)
    setDragLine(null)
    if (rectSt && selRect) {
      const ids = []
      segments.forEach(s => { if (segInRect(s, selRect)) ids.push(s.id) })
      points.forEach(p   => { if (ptInRect(p, selRect))  ids.push(p.id) })
      onSelectIds(prev => e.shiftKey ? [...new Set([...prev, ...ids])] : ids)
      setRectSt(null); setSelRect(null)
    }
  }, [rectSt, selRect, segments, points, onSelectIds])

  // ── double-click → end segment ────────────────────────
  const onDblClick = useCallback(e => {
    if (drawMode !== 'draw' || !drawing) return
    e.preventDefault()
    const pos = toCanvas(e, svgRef.current, tf)
    const snapped = drawing.vertices.length
      ? ortho(drawing.vertices[drawing.vertices.length - 1], pos)
      : { x: snap(pos.x), y: snap(pos.y) }
    finalize(snapped, nearPt(snapped)?.id ?? null)
  }, [drawMode, drawing, tf, finalize, nearPt])

  // ── preview ───────────────────────────────────────────
  const previewTgt  = drawing ? ortho(drawing.vertices[drawing.vertices.length - 1], mouse) : null
  const previewPath = drawing
    ? [...drawing.vertices, previewTgt].map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ')
    : null

  const cursor = panSt ? 'grabbing' : spaceRef.current ? 'grab' : drawMode === 'draw' ? 'crosshair' : 'default'

  // ── zone colours (alternating) ────────────────────────
  const zones = levels.map((lvl, i) => ({ ...lvl, yBot: lineYs[i], yTop: lineYs[i + 1] }))
  const toitureY = lineYs[lineYs.length - 1]

  return (
    <svg
      ref={svgRef}
      style={{ width: '100%', height: '100%', display: 'block', background: '#f8fafc', cursor }}
      onMouseMove={onMouseMove}
      onMouseDown={onMouseDown}
      onMouseUp={onMouseUp}
      onDoubleClick={onDblClick}
    >
      <g transform={`translate(${tf.x},${tf.y}) scale(${tf.k})`}>

        {/* ── Zone backgrounds ── */}
        {zones.map((z, i) => (
          <g key={z.id}>
            <rect x={0} y={z.yTop} width={3000} height={z.yBot - z.yTop}
              fill={i % 2 === 0 ? '#ffffff' : '#f8fafc'} />
            <text x={14} y={(z.yTop + z.yBot) / 2 + 5}
              fontSize={13} fill="#d1d8e0" fontWeight="700"
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
                <text x={14} y={y - 7} fontSize={11} fill="#94a3b8" fontWeight="700"
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
        {segments.map(seg => {
          const sel  = selectedIds.includes(seg.id)
          const col  = seg.type === 'retour' ? '#f97316' : '#dc2626'
          const dash = seg.type === 'retour' ? '10,6' : 'none'
          const path = seg.vertices.map((v, i) => `${i ? 'L' : 'M'}${v.x},${v.y}`).join(' ')
          return (
            <g key={seg.id}>
              <path d={path} stroke="transparent" strokeWidth={16} fill="none"
                style={{ cursor: 'pointer' }}
                onClick={ev => {
                  ev.stopPropagation()
                  onSelectIds(ids => ev.shiftKey
                    ? ids.includes(seg.id) ? ids.filter(i => i !== seg.id) : [...ids, seg.id]
                    : [seg.id])
                }} />
              <path d={path}
                stroke={sel ? '#2563eb' : col} strokeWidth={sel ? 3 : 2}
                strokeDasharray={sel ? 'none' : dash} fill="none"
                style={{ pointerEvents: 'none' }} />
              {seg.name && (() => {
                const v = seg.vertices[Math.floor(seg.vertices.length / 2)] || seg.vertices[0]
                return <text x={v.x + 5} y={v.y - 7} fontSize={10} fill={col} fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>{seg.name}</text>
              })()}
            </g>
          )
        })}

        {/* ── Points ── */}
        {points.map(pt => {
          const sel = selectedIds.includes(pt.id)
          return (
            <g key={pt.id} style={{ cursor: 'pointer' }}
              onClick={ev => {
                ev.stopPropagation()
                onSelectIds(ids => ev.shiftKey
                  ? ids.includes(pt.id) ? ids.filter(i => i !== pt.id) : [...ids, pt.id]
                  : [pt.id])
              }}>
              <circle cx={pt.x} cy={pt.y} r={PT_R + 5} fill="transparent" />
              <circle cx={pt.x} cy={pt.y} r={PT_R}
                fill={sel ? '#dbeafe' : '#fff'}
                stroke={sel ? '#2563eb' : '#374151'} strokeWidth={2} />
              {pt.name && (
                <text x={pt.x + PT_R + 4} y={pt.y + 4} fontSize={11} fill="#374151" fontWeight="600"
                  style={{ pointerEvents: 'none', userSelect: 'none' }}>{pt.name}</text>
              )}
            </g>
          )
        })}

        {/* ── Drawing preview ── */}
        {previewPath && (
          <>
            <path d={previewPath}
              stroke={pipeType === 'retour' ? '#f97316' : '#dc2626'} strokeWidth={2}
              strokeDasharray={pipeType === 'retour' ? '10,6' : '5,3'}
              fill="none" opacity={0.55} style={{ pointerEvents: 'none' }} />
            {drawing.vertices.map((v, i) =>
              <circle key={i} cx={v.x} cy={v.y} r={3}
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

      {/* HUD hints */}
      {drawing && (
        <text x={8} y={18} fontSize={11} fill="#94a3b8">
          Clic : ajouter un point · Double-clic : terminer · Échap : annuler
        </text>
      )}
      {!drawing && drawMode === 'select' && (
        <text x={8} y={18} fontSize={11} fill="#cbd5e1">
          Clic : sélectionner · Shift+Clic : multi-sélection · Ctrl+Drag : sélection rectangle · Drag : déplacer la vue
        </text>
      )}
    </svg>
  )
}
