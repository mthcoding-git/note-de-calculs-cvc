import { uid } from './idGen'
import { getNodeLocation } from './pointLocation'

export const SNAP = 10
export const HIT  = 8  // segment click radius

export const snap = v => Math.round(v / SNAP) * SNAP
export const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

export function ortho(last, mouse) {
  return Math.abs(mouse.x - last.x) >= Math.abs(mouse.y - last.y)
    ? { x: snap(mouse.x), y: last.y }
    : { x: last.x, y: snap(mouse.y) }
}

export function toCanvas(e, el, tf) {
  const r = el.getBoundingClientRect()
  return { x: (e.clientX - r.left - tf.x) / tf.k, y: (e.clientY - r.top - tf.y) / tf.k }
}

export function ptInRect(pt, r) {
  return pt.x >= Math.min(r.x1, r.x2) && pt.x <= Math.max(r.x1, r.x2)
      && pt.y >= Math.min(r.y1, r.y2) && pt.y <= Math.max(r.y1, r.y2)
}

export function segInRect(seg, r) {
  return seg.vertices.some(v => ptInRect(v, r))
}

export function closestTOnPolyline(pos, vertices) {
  if (!vertices || vertices.length < 2) return null
  let subLens = [], totalLen = 0
  for (let i = 0; i < vertices.length - 1; i++) {
    const l = Math.hypot(vertices[i+1].x - vertices[i].x, vertices[i+1].y - vertices[i].y)
    subLens.push(l); totalLen += l
  }
  if (totalLen === 0) return null
  let bestT = 0, bestX = vertices[0].x, bestY = vertices[0].y, bestAngle = 0, bestDist = Infinity
  let acc = 0
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i], b = vertices[i+1]
    const dx = b.x - a.x, dy = b.y - a.y
    const l2 = dx*dx + dy*dy
    if (!l2) { acc += subLens[i]; continue }
    const t_sub = Math.max(0, Math.min(1, ((pos.x-a.x)*dx + (pos.y-a.y)*dy) / l2))
    const px = a.x + t_sub*dx, py = a.y + t_sub*dy
    const d = Math.hypot(pos.x - px, pos.y - py)
    if (d < bestDist) {
      bestDist = d; bestX = px; bestY = py
      bestT = (acc + t_sub * subLens[i]) / totalLen
      bestAngle = Math.atan2(dy, dx) * 180 / Math.PI
    }
    acc += subLens[i]
  }
  return { t: bestT, x: bestX, y: bestY, angle: bestAngle, dist: bestDist }
}

export function positionFromT(vertices, t) {
  if (!vertices || vertices.length < 2) return { x: 0, y: 0, angle: 0 }
  let subLens = [], totalLen = 0
  for (let i = 0; i < vertices.length - 1; i++) {
    const l = Math.hypot(vertices[i+1].x - vertices[i].x, vertices[i+1].y - vertices[i].y)
    subLens.push(l); totalLen += l
  }
  if (totalLen === 0) return { x: vertices[0].x, y: vertices[0].y, angle: 0 }
  const target = Math.max(0, Math.min(1, t)) * totalLen
  let acc = 0
  for (let i = 0; i < vertices.length - 1; i++) {
    const a = vertices[i], b = vertices[i+1]
    const dx = b.x - a.x, dy = b.y - a.y
    if (acc + subLens[i] >= target || i === vertices.length - 2) {
      const localT = subLens[i] > 0 ? Math.min(1, (target - acc) / subLens[i]) : 0
      return { x: a.x + dx*localT, y: a.y + dy*localT, angle: Math.atan2(dy, dx) * 180 / Math.PI }
    }
    acc += subLens[i]
  }
  return { x: vertices[vertices.length-1].x, y: vertices[vertices.length-1].y, angle: 0 }
}

export function polylineLen(vertices) {
  let len = 0
  for (let i = 0; i < vertices.length - 1; i++)
    len += Math.hypot(vertices[i+1].x - vertices[i].x, vertices[i+1].y - vertices[i].y)
  return len
}

export function nameValve(segId, segToCol, existingValves, segments?, points?, levels?, lineYs?, columns?, columnXs?, chaufferie?) {
  const col = segToCol?.get(segId)
  let colName: string
  if (col != null) {
    colName = col
  } else {
    const seg = segments?.find(s => s.id === segId)
    const ptId = seg?.startPointId
    const pt   = ptId ? points?.find(p => p.id === ptId) : null
    colName = pt
      ? getNodeLocation(pt, levels ?? [], lineYs ?? [], columns ?? [], columnXs ?? [], chaufferie, null, points ?? [])
      : 'ECS'
  }
  const base    = `Vanne d'équilibrage ${colName}`
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re      = new RegExp(`^${escaped} n°(\\d+)$`)
  const used    = new Set(
    (existingValves ?? []).flatMap(v => {
      const m = v.name?.match(re)
      return m ? [parseInt(m[1], 10)] : []
    })
  )
  let n = 1
  while (used.has(n)) n++
  return `${base} n°${n}`
}

export function nearestOnSegments(pos, segs) {
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

export function getDragConstraint(ptId, segs) {
  const connected = segs.filter(s => s.startPointId === ptId || s.endPointId === ptId)
  if (!connected.length) return 'free'
  if (connected.length === 1) return 'free'
  const dirs = connected.map(seg => {
    const vs = seg.vertices
    if (vs.length < 2) return 'free'
    const [a, b] = seg.startPointId === ptId ? [vs[0], vs[1]] : [vs[vs.length - 2], vs[vs.length - 1]]
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
  })
  const hCount = dirs.filter(d => d === 'h').length
  const vCount = dirs.filter(d => d === 'v').length
  if (vCount === 0) return 'h'
  if (hCount === 0) return 'v'
  if (hCount >= 2 && vCount === 1) return 'h'
  if (vCount >= 2 && hCount === 1) return 'v'
  return 'free'
}

export function deleteNodeFromNetwork(ptId, segs, pts) {
  const ending   = segs.filter(s => s.endPointId   === ptId)
  const starting = segs.filter(s => s.startPointId === ptId)
  const total    = ending.length + starting.length

  if (total !== 2) return null

  let sA, sB, vsA, vsB, startId, endId

  if (ending.length === 1 && starting.length === 1) {
    sA = ending[0];   sB = starting[0]
    if (sA.type !== sB.type) return null
    vsA = sA.vertices; vsB = sB.vertices
    if (vsA.length < 2 || vsB.length < 2) return null
    startId = sA.startPointId; endId = sB.endPointId
    const verts = [...vsA, ...vsB.slice(1)]
    const lenA = polylineLen(vsA), lenB = polylineLen(vsB), totalLen = lenA + lenB
    const mergedId = uid('T')
    return {
      newSegs: segs.filter(s => s.id !== sA.id && s.id !== sB.id)
                   .concat([{ ...sA, id: mergedId, vertices: verts, startPointId: startId, endPointId: endId }]),
      newPts: pts.filter(p => p.id !== ptId),
      segMerges: {
        [sA.id]: { newSegId: mergedId, totalLen, offset: 0,    ownLen: lenA, reversed: false },
        [sB.id]: { newSegId: mergedId, totalLen, offset: lenA, ownLen: lenB, reversed: false },
      },
    }
  }

  if (ending.length === 2) {
    sA = ending[0]; sB = ending[1]
    if (sA.type !== sB.type) return null
    vsA = sA.vertices; vsB = [...sB.vertices].reverse()
    if (vsA.length < 2 || vsB.length < 2) return null
    startId = sA.startPointId; endId = sB.startPointId
    const verts = [...vsA, ...vsB.slice(1)]
    const lenA = polylineLen(vsA), lenB = polylineLen(sB.vertices), totalLen = lenA + lenB
    const mergedId = uid('T')
    return {
      newSegs: segs.filter(s => s.id !== sA.id && s.id !== sB.id)
                   .concat([{ ...sA, id: mergedId, vertices: verts, startPointId: startId, endPointId: endId }]),
      newPts: pts.filter(p => p.id !== ptId),
      segMerges: {
        [sA.id]: { newSegId: mergedId, totalLen, offset: 0,    ownLen: lenA, reversed: false },
        [sB.id]: { newSegId: mergedId, totalLen, offset: lenA, ownLen: lenB, reversed: true  },
      },
    }
  }

  sA = starting[0]; sB = starting[1]
  if (sA.type !== sB.type) return null
  vsA = [...sA.vertices].reverse(); vsB = sB.vertices
  if (vsA.length < 2 || vsB.length < 2) return null
  startId = sA.endPointId; endId = sB.endPointId
  const verts = [...vsA, ...vsB.slice(1)]
  const lenA = polylineLen(sA.vertices), lenB = polylineLen(vsB), totalLen = lenA + lenB
  const mergedId = uid('T')
  return {
    newSegs: segs.filter(s => s.id !== sA.id && s.id !== sB.id)
                 .concat([{ ...sA, id: mergedId, vertices: verts, startPointId: startId, endPointId: endId }]),
    newPts: pts.filter(p => p.id !== ptId),
    segMerges: {
      [sA.id]: { newSegId: mergedId, totalLen, offset: 0,    ownLen: lenA, reversed: true  },
      [sB.id]: { newSegId: mergedId, totalLen, offset: lenA, ownLen: lenB, reversed: false },
    },
  }
}

export function getSegmentDir(seg) {
  const vs = seg.vertices
  if (vs.length < 2) return null
  const dx = Math.abs(vs[vs.length - 1].x - vs[0].x)
  const dy = Math.abs(vs[vs.length - 1].y - vs[0].y)
  if (dx === 0 && dy === 0) return null
  return dx >= dy ? 'h' : 'v'
}

export function collapseCollinear(vertices) {
  if (vertices.length < 2) return vertices
  const result = [vertices[0]]
  for (let i = 1; i < vertices.length; i++) {
    const curr = vertices[i]
    const prev = result[result.length - 1]
    if (curr.x === prev.x && curr.y === prev.y) continue
    if (result.length >= 2) {
      const pp   = result[result.length - 2]
      const abH  = Math.abs(prev.x - pp.x)   >= Math.abs(prev.y - pp.y)
      const bcH  = Math.abs(curr.x - prev.x) >= Math.abs(curr.y - prev.y)
      if (abH === bcH) { result[result.length - 1] = curr; continue }
    }
    result.push(curr)
  }
  return result
}

export function collapseSegs(segs) {
  return segs.map(s => {
    const vs = collapseCollinear(s.vertices)
    return vs.length < s.vertices.length ? { ...s, vertices: vs } : s
  })
}

export function elbowVertices(vertices, isEnd, newPos) {
  if (vertices.length < 2) {
    return isEnd ? [...vertices.slice(0, -1), newPos] : [newPos, ...vertices.slice(1)]
  }
  if (isEnd) {
    const prev = vertices[vertices.length - 2]
    const curr = vertices[vertices.length - 1]
    const horiz = Math.abs(curr.x - prev.x) >= Math.abs(curr.y - prev.y)
    const elbow = horiz ? { x: newPos.x, y: curr.y } : { x: curr.x, y: newPos.y }
    return collapseCollinear([...vertices.slice(0, -1), elbow, newPos])
  } else {
    const next = vertices[1]
    const curr = vertices[0]
    const horiz = Math.abs(next.x - curr.x) >= Math.abs(next.y - curr.y)
    const elbow = horiz ? { x: newPos.x, y: curr.y } : { x: curr.x, y: newPos.y }
    return collapseCollinear([newPos, elbow, ...vertices.slice(1)])
  }
}

export function computeSegDeltaLimits(segId, subIdx, segs, pts) {
  const seg = segs.find(s => s.id === segId)
  if (!seg) return { minDelta: -Infinity, maxDelta: Infinity }
  const vs = seg.vertices
  if (vs.length < 2 || subIdx >= vs.length - 1) return { minDelta: -Infinity, maxDelta: Infinity }
  const a = vs[subIdx], b = vs[subIdx + 1]
  const edgeDir = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
  const isVert  = edgeDir === 'v'
  const barCoord = isVert ? a.x : a.y
  const onBar   = v => (isVert ? v.x : v.y) === barCoord

  const movingNodeIds = new Set()
  const visitedSids   = new Set()
  const queue = [segId]
  while (queue.length > 0) {
    const sid = queue.shift()
    if (visitedSids.has(sid)) continue
    visitedSids.add(sid)
    const s = segs.find(x => x.id === sid)
    if (!s) continue
    const hasBarEdge = s.vertices.some((v, i) => {
      if (i >= s.vertices.length - 1) return false
      const w = s.vertices[i + 1]
      const parallel = isVert
        ? Math.abs(w.y - v.y) > Math.abs(w.x - v.x)
        : Math.abs(w.x - v.x) >= Math.abs(w.y - v.y)
      return parallel && onBar(v)
    })
    if (!hasBarEdge && sid !== segId) continue
    const sFirst = s.vertices[0], sLast = s.vertices[s.vertices.length - 1]
    if (onBar(sFirst)) {
      movingNodeIds.add(s.startPointId)
      segs.forEach(x => { if (x.id !== sid && (x.startPointId === s.startPointId || x.endPointId === s.startPointId)) queue.push(x.id) })
    }
    if (onBar(sLast)) {
      movingNodeIds.add(s.endPointId)
      segs.forEach(x => { if (x.id !== sid && (x.startPointId === s.endPointId || x.endPointId === s.endPointId)) queue.push(x.id) })
    }
  }

  let minDelta = -Infinity, maxDelta = Infinity
  for (const nodeId of movingNodeIds) {
    const pt = pts.find(p => p.id === nodeId)
    if (!pt) continue
    for (const s of segs) {
      const isStart = s.startPointId === nodeId, isEnd = s.endPointId === nodeId
      if (!isStart && !isEnd) continue
      if (s.vertices.length < 2) continue
      const nodeV  = isStart ? s.vertices[0]              : s.vertices[s.vertices.length - 1]
      const innerV = isStart ? s.vertices[1]              : s.vertices[s.vertices.length - 2]
      const edH    = Math.abs(innerV.x - nodeV.x) >= Math.abs(innerV.y - nodeV.y)
      if (isVert ? !edH : edH) continue
      const neighborId = isStart ? s.endPointId : s.startPointId
      if (movingNodeIds.has(neighborId)) continue
      const neighbor = pts.find(p => p.id === neighborId)
      if (!neighbor) continue
      const nodeCoord     = isVert ? pt.x      : pt.y
      const neighborCoord = isVert ? neighbor.x : neighbor.y
      if (neighborCoord > nodeCoord) maxDelta = Math.min(maxDelta, neighborCoord - nodeCoord)
      else                           minDelta = Math.max(minDelta, neighborCoord - nodeCoord)
    }
  }
  return { minDelta, maxDelta }
}

export function mergeCoincidentNodes(segs, pts) {
  let workSegs = [...segs], workPts = [...pts]
  let changed = true
  while (changed) {
    changed = false
    const zeroSeg = workSegs.find(s => s.vertices.length < 2)
    if (!zeroSeg) break
    const { startPointId: winner, endPointId: loser } = zeroSeg
    if (winner === loser) {
      workSegs = workSegs.filter(s => s.id !== zeroSeg.id)
    } else {
      workSegs = workSegs
        .filter(s => s.id !== zeroSeg.id)
        .map(s => ({
          ...s,
          startPointId: s.startPointId === loser ? winner : s.startPointId,
          endPointId:   s.endPointId   === loser ? winner : s.endPointId,
        }))
        .filter(s => s.startPointId !== s.endPointId)
      workPts = workPts.filter(p => p.id !== loser)
    }
    changed = true
  }
  return { newSegs: workSegs, newPts: workPts }
}

export function computeSegMove(segId, subIdx, delta, segs, pts) {
  const seg = segs.find(s => s.id === segId)
  if (!seg) return { newSegs: segs, newPts: pts }
  const vs = seg.vertices
  if (vs.length < 2 || subIdx < 0 || subIdx >= vs.length - 1) return { newSegs: segs, newPts: pts }
  const a = vs[subIdx], b = vs[subIdx + 1]
  const edgeDir = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'

  if (edgeDir === 'h') {
    const barY = a.y
    const onBarY = v => v.y === barY

    const barSegIds  = new Set()
    const visitedSids = new Set()
    const queue = [segId]
    while (queue.length > 0) {
      const sid = queue.shift()
      if (visitedSids.has(sid)) continue
      visitedSids.add(sid)
      const s = segs.find(x => x.id === sid)
      if (!s) continue
      const hasBarEdge = s.vertices.some((v, i) => {
        if (i >= s.vertices.length - 1) return false
        const w = s.vertices[i + 1]
        return Math.abs(w.x - v.x) >= Math.abs(w.y - v.y) && v.y === barY
      })
      if (!hasBarEdge && sid !== segId) continue
      barSegIds.add(sid)
      if (onBarY(s.vertices[0]))
        segs.forEach(x => { if (x.id !== sid && (x.startPointId === s.startPointId || x.endPointId === s.startPointId)) queue.push(x.id) })
      if (onBarY(s.vertices[s.vertices.length - 1]))
        segs.forEach(x => { if (x.id !== sid && (x.startPointId === s.endPointId || x.endPointId === s.endPointId)) queue.push(x.id) })
    }

    const barNodeIds = new Set()
    for (const sid of barSegIds) {
      const s = segs.find(x => x.id === sid)
      if (!s) continue
      if (onBarY(s.vertices[0]))                        barNodeIds.add(s.startPointId)
      if (onBarY(s.vertices[s.vertices.length - 1]))    barNodeIds.add(s.endPointId)
    }

    const applyDelta = v => ({ ...v, y: snap(v.y + delta) })
    const newPts = pts.map(p => barNodeIds.has(p.id) ? applyDelta(p) : p)
    const newSegs = segs.map(s => {
      if (barSegIds.has(s.id))
        return { ...s, vertices: s.vertices.map(v => onBarY(v) ? applyDelta(v) : v) }
      const v = [...s.vertices]; let changed = false
      if (barNodeIds.has(s.startPointId)) { v[0]            = applyDelta(v[0]);            changed = true }
      if (barNodeIds.has(s.endPointId))   { v[v.length - 1] = applyDelta(v[v.length - 1]); changed = true }
      return changed ? { ...s, vertices: v } : s
    })
    return { newSegs: collapseSegs(newSegs), newPts }
  }

  const barX    = a.x
  const onBarX  = v => v.x === barX
  const applyDelta = v => ({ ...v, x: snap(v.x + delta) })

  const colSegIds   = new Set()
  const visitedSids = new Set()
  const queue = [segId]
  while (queue.length > 0) {
    const sid = queue.shift()
    if (visitedSids.has(sid)) continue
    visitedSids.add(sid)
    const s = segs.find(x => x.id === sid)
    if (!s) continue
    const hasColEdge = s.vertices.some((v, i) => {
      if (i >= s.vertices.length - 1) return false
      const w = s.vertices[i + 1]
      return Math.abs(w.y - v.y) > Math.abs(w.x - v.x) && v.x === barX
    })
    if (!hasColEdge && sid !== segId) continue
    colSegIds.add(sid)
    if (onBarX(s.vertices[0]))
      segs.forEach(x => { if (x.id !== sid && (x.startPointId === s.startPointId || x.endPointId === s.startPointId)) queue.push(x.id) })
    if (onBarX(s.vertices[s.vertices.length - 1]))
      segs.forEach(x => { if (x.id !== sid && (x.startPointId === s.endPointId || x.endPointId === s.endPointId)) queue.push(x.id) })
  }

  const colNodeIds = new Set()
  for (const sid of colSegIds) {
    const s = segs.find(x => x.id === sid)
    if (!s) continue
    if (onBarX(s.vertices[0]))                      colNodeIds.add(s.startPointId)
    if (onBarX(s.vertices[s.vertices.length - 1]))  colNodeIds.add(s.endPointId)
  }

  const newPts = pts.map(p => colNodeIds.has(p.id) ? applyDelta(p) : p)
  const newSegs = segs.map(s => {
    if (colSegIds.has(s.id))
      return { ...s, vertices: s.vertices.map(v => onBarX(v) ? applyDelta(v) : v) }
    const v = [...s.vertices]; let changed = false
    if (colNodeIds.has(s.startPointId)) { v[0]            = applyDelta(v[0]);            changed = true }
    if (colNodeIds.has(s.endPointId))   { v[v.length - 1] = applyDelta(v[v.length - 1]); changed = true }
    return changed ? { ...s, vertices: v } : s
  })
  return { newSegs: collapseSegs(newSegs), newPts }
}

export function computeNodeMove(ptId, np, segs, pts, constraintOverride = null) {
  const origPt = pts.find(p => p.id === ptId)
  if (!origPt) return { newSegs: segs, newPts: pts }
  const dx = np.x - origPt.x, dy = np.y - origPt.y
  if (dx === 0 && dy === 0) return { newSegs: segs, newPts: pts }
  const constraint = constraintOverride ?? getDragConstraint(ptId, segs)
  const movAxis = dx !== 0 ? 'h' : 'v'
  const connected = segs.filter(s => s.startPointId === ptId || s.endPointId === ptId)

  const axisAt = (seg, fromPtId) => {
    const vs = seg.vertices; if (vs.length < 2) return null
    const isEnd = seg.endPointId === fromPtId
    const [a, b] = isEnd ? [vs[vs.length - 2], vs[vs.length - 1]] : [vs[0], vs[1]]
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
  }
  const edgeAxisAt = seg => axisAt(seg, ptId)

  const segsAlongAxis = connected.filter(s => edgeAxisAt(s) === movAxis).length
  const isLCorner = (connected.length === 2 && segsAlongAxis === 1) ||
                    (connected.length === 1 && segsAlongAxis === 0)

  const isFullyPerp = seg => {
    const vs = seg.vertices
    for (let i = 1; i < vs.length; i++) {
      const ax = Math.abs(vs[i].x - vs[i-1].x) >= Math.abs(vs[i].y - vs[i-1].y) ? 'h' : 'v'
      if (ax === movAxis) return false
    }
    return true
  }

  const rigidPtIds = new Set()
  if (!isLCorner) {
    const queue = []
    for (const seg of connected) {
      if (edgeAxisAt(seg) !== movAxis && isFullyPerp(seg)) {
        const farPtId = seg.endPointId === ptId ? seg.startPointId : seg.endPointId
        if (!rigidPtIds.has(farPtId)) { rigidPtIds.add(farPtId); queue.push(farPtId) }
      }
    }
    while (queue.length > 0) {
      const curPtId = queue.shift()
      if (pts.find(p => p.id === curPtId)?.isLocked) continue
      for (const seg of segs.filter(s => s.startPointId === curPtId || s.endPointId === curPtId)) {
        if (axisAt(seg, curPtId) !== movAxis && isFullyPerp(seg)) {
          const farPtId = seg.endPointId === curPtId ? seg.startPointId : seg.endPointId
          if (farPtId !== ptId && !rigidPtIds.has(farPtId)) {
            rigidPtIds.add(farPtId); queue.push(farPtId)
          }
        }
      }
    }
  }

  const newPts = pts.map(p => {
    if (p.id === ptId) return { ...p, x: snap(origPt.x + dx), y: snap(origPt.y + dy) }
    if (rigidPtIds.has(p.id)) return { ...p, x: snap(p.x + dx), y: snap(p.y + dy) }
    return p
  })

  const newSegs = segs.map(seg => {
    const isMainStart = seg.startPointId === ptId, isMainEnd = seg.endPointId === ptId
    const isRigidStart = !isMainStart && rigidPtIds.has(seg.startPointId)
    const isRigidEnd   = !isMainEnd   && rigidPtIds.has(seg.endPointId)

    if (isMainStart || isMainEnd) {
      const vs = seg.vertices; if (vs.length < 2) return seg
      const segAxis = edgeAxisAt(seg)

      if (segAxis !== movAxis) {
        if (isLCorner) {
          const oldEndV = { x: origPt.x, y: origPt.y }
          const newEndV = { x: snap(origPt.x + dx), y: snap(origPt.y + dy) }
          return isMainEnd
            ? { ...seg, vertices: collapseCollinear([...vs.slice(0, -1), oldEndV, newEndV]) }
            : { ...seg, vertices: collapseCollinear([newEndV, oldEndV, ...vs.slice(1)]) }
        }
        const newVs = vs.map(v => ({ ...v }))
        if (!isMainEnd) {
          newVs[0] = { x: snap(vs[0].x + dx), y: snap(vs[0].y + dy) }
          for (let i = 0; i < vs.length - 1; i++) {
            const ax = Math.abs(vs[i+1].x - vs[i].x) >= Math.abs(vs[i+1].y - vs[i].y) ? 'h' : 'v'
            if (ax !== movAxis) newVs[i+1] = { x: snap(vs[i+1].x + dx), y: snap(vs[i+1].y + dy) }
            else break
          }
        } else {
          const last = vs.length - 1
          newVs[last] = { x: snap(vs[last].x + dx), y: snap(vs[last].y + dy) }
          for (let i = last - 1; i >= 0; i--) {
            const ax = Math.abs(vs[i+1].x - vs[i].x) >= Math.abs(vs[i+1].y - vs[i].y) ? 'h' : 'v'
            if (ax !== movAxis) newVs[i] = { x: snap(vs[i].x + dx), y: snap(vs[i].y + dy) }
            else break
          }
        }
        return { ...seg, vertices: newVs }
      }
      const v = [...vs], idx = isMainEnd ? v.length - 1 : 0
      v[idx] = { x: snap(v[idx].x + dx), y: snap(v[idx].y + dy) }
      return { ...seg, vertices: v }
    }

    if (isRigidStart || isRigidEnd) {
      if (isRigidStart && isRigidEnd) {
        return { ...seg, vertices: seg.vertices.map(v => ({ x: snap(v.x + dx), y: snap(v.y + dy) })) }
      }
      const v = [...seg.vertices]
      if (isRigidStart) {
        const newStart = { x: snap(v[0].x + dx), y: snap(v[0].y + dy) }
        return { ...seg, vertices: elbowVertices(v, false, newStart) }
      }
      const newEnd = { x: snap(v[v.length - 1].x + dx), y: snap(v[v.length - 1].y + dy) }
      return { ...seg, vertices: elbowVertices(v, true, newEnd) }
    }
    return seg
  })
  return { newSegs: collapseSegs(newSegs), newPts }
}

export function getFrontierYs(levels, lineYs) {
  const ys = []
  for (let i = 1; i < levels.length; i++) {
    if (!!levels[i - 1].isSousSol !== !!levels[i].isSousSol) ys.push(lineYs[i])
  }
  return ys
}

export function applyFrontierSplits(segs, pts, levels, lineYs) {
  const frontierYs = getFrontierYs(levels, lineYs)
  let workSegs = segs, workPts = pts, anyChanged = false

  let cleanupChanged = true
  while (cleanupChanged) {
    cleanupChanged = false
    for (const pt of workPts) {
      if (!pt.isLocked) continue
      const segIn    = workSegs.find(s => s.endPointId   === pt.id)
      const segOut   = workSegs.find(s => s.startPointId === pt.id)
      const atFrontier = frontierYs.includes(pt.y)

      if (!segIn && !segOut) {
        workPts = workPts.filter(p => p.id !== pt.id)
        anyChanged = true; cleanupChanged = true; break
      }

      if (!atFrontier) {
        if (segIn && segOut) {
          const mergedVerts = collapseCollinear([...segIn.vertices, ...segOut.vertices.slice(1)])
          const merged = { ...segIn, id: uid('T'), vertices: mergedVerts, endPointId: segOut.endPointId }
          workSegs = workSegs.filter(s => s.id !== segIn.id && s.id !== segOut.id).concat([merged])
          workPts  = workPts.filter(p => p.id !== pt.id)
        } else {
          workPts = workPts.map(p => p.id === pt.id ? { ...p, isLocked: false } : p)
        }
        anyChanged = true; cleanupChanged = true; break
      }
    }
  }

  if (frontierYs.length) {
    let loopChanged = true
    while (loopChanged) {
      loopChanged = false
      outer:
      for (let si = 0; si < workSegs.length; si++) {
        const seg = workSegs[si]
        const vs  = seg.vertices
        for (let vi = 0; vi < vs.length - 1; vi++) {
          const a = vs[vi], b = vs[vi + 1]
          if (Math.abs(b.y - a.y) <= Math.abs(b.x - a.x)) continue
          const x = a.x
          const yMin = Math.min(a.y, b.y), yMax = Math.max(a.y, b.y)
          for (const fy of frontierYs) {
            if (fy <= yMin || fy >= yMax) continue
            anyChanged = true; loopChanged = true
            const splitPos = { x, y: fy }
            let splitPt = workPts.find(p => p.x === x && p.y === fy && p.isLocked)
            if (!splitPt) {
              splitPt = { id: uid('F'), name: '', x, y: fy, isLocked: true }
              workPts = [...workPts, splitPt]
            }
            const seg1 = { ...seg, id: uid('T'), vertices: [...vs.slice(0, vi + 1), splitPos], endPointId: splitPt.id }
            const seg2 = { ...seg, id: uid('T'), vertices: [splitPos, ...vs.slice(vi + 1)], startPointId: splitPt.id }
            workSegs = workSegs.filter(s => s.id !== seg.id).concat([seg1, seg2])
            break outer
          }
        }
      }
    }
  }

  return anyChanged ? { segs: workSegs, pts: workPts } : null
}

export function applySpecialPtSnap(segs, pts, skipGroupeIds = null) {
  let workSegs = segs, workPts = pts, anyChanged = false

  for (const ecsOrig of pts.filter(p => p.type === 'productionECS' || p.type === 'arriveeEF' || p.type === 'groupe')) {
    const ecs = workPts.find(p => p.id === ecsOrig.id)
    if (!ecs) continue
    if (ecs.type === 'groupe' && skipGroupeIds?.has(ecs.id)) continue
    const w = ecs.type === 'groupe' ? 60 : (ecs.size?.w ?? 44)
    const h = ecs.type === 'groupe' ? 30 : (ecs.size?.h ?? 28)
    const hw = w / 2, hh = h / 2

    let changed = true
    while (changed) {
      changed = false
      const inside = workPts.find(p => {
        if (p.id === ecs.id || p.isLocked || p.type === 'pump' || p.type === 'productionECS' || p.type === 'arriveeEF' || p.type === 'groupe') return false
        if (Math.abs(p.x - ecs.x) > hw || Math.abs(p.y - ecs.y) > hh) return false
        if (ecs.type === 'groupe') {
          const groupeConn = workSegs.filter(s => s.startPointId === ecs.id || s.endPointId === ecs.id).length
          if (groupeConn >= 1) return false
          const connCount = workSegs.filter(s => s.startPointId === p.id || s.endPointId === p.id).length
          if (connCount !== 1) return false
        }
        return true
      })
      if (inside) {
        const ecsPt = { x: ecs.x, y: ecs.y }
        workSegs = workSegs.map(seg => {
          let s = seg
          if (s.startPointId === inside.id)
            s = { ...s, vertices: elbowVertices(s.vertices, false, ecsPt), startPointId: ecs.id }
          if (s.endPointId === inside.id)
            s = { ...s, vertices: elbowVertices(s.vertices, true,  ecsPt), endPointId: ecs.id }
          return s
        }).filter(s => s.startPointId !== s.endPointId)
        workPts = workPts.filter(p => p.id !== inside.id)
        anyChanged = true; changed = true
      }
    }

    const hasConnected = workSegs.some(s => s.startPointId === ecs.id || s.endPointId === ecs.id)
    if (!hasConnected && ecs.type !== 'groupe') {
      let bestHit = null, bestD = Infinity
      for (const seg of workSegs) {
        const vs = seg.vertices
        for (let i = 0; i < vs.length - 1; i++) {
          const a = vs[i], b = vs[i + 1]
          const dx = b.x - a.x, dy = b.y - a.y
          const l2 = dx * dx + dy * dy
          if (!l2) continue
          const t = Math.max(0, Math.min(1, ((ecs.x - a.x) * dx + (ecs.y - a.y) * dy) / l2))
          const proj = { x: a.x + t * dx, y: a.y + t * dy }
          if (Math.abs(proj.x - ecs.x) > hw || Math.abs(proj.y - ecs.y) > hh) continue
          const d = Math.hypot(proj.x - ecs.x, proj.y - ecs.y)
          if (d < bestD) { bestD = d; bestHit = { seg, subIdx: i, proj } }
        }
      }
      if (bestHit) {
        const { seg, subIdx, proj } = bestHit
        const sp = { x: snap(proj.x), y: snap(proj.y) }
        const vs = seg.vertices
        const seg1 = { ...seg, id: uid('T'), vertices: collapseCollinear([...vs.slice(0, subIdx + 1), sp]), endPointId: ecs.id }
        const seg2 = { ...seg, id: uid('T'), vertices: collapseCollinear([sp, ...vs.slice(subIdx + 1)]), startPointId: ecs.id }
        workSegs = workSegs.filter(s => s.id !== seg.id).concat([seg1, seg2])
        workPts  = workPts.map(p => p.id === ecs.id ? { ...p, x: sp.x, y: sp.y } : p)
        anyChanged = true
      }
    }
  }

  return anyChanged ? { segs: workSegs, pts: workPts } : null
}
