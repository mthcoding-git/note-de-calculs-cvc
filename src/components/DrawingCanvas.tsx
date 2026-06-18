import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { getDisplayName, getNodeLocation } from '../utils/naming'
import { sf } from '../utils/fmt'

const PT_R       = 4
const HIT        = 8     // segment click radius
const PT_HIT     = 10    // point click/snap radius
const DRAW_SNAP  = 14    // snap-to-point radius during drawing
const SNAP       = 10
const ZOOM_F     = 1.08

const snap = v => Math.round(v / SNAP) * SNAP
const dist = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2)

const EQUIP_ABBR = {
  evier: 'EV', lavabo: 'LB', bidet: 'BD', baignoire: 'BG', douche: 'DU',
  poste_12: 'R½', poste_34: 'R¾', wc_reservoir: 'WC', wc_robinet: 'WCR',
  urinoir_ind: 'UR', urinoir_siph: 'US', lave_mains: 'LM', bac_laver: 'BL',
  machine_linge: 'LL', machine_vaiss: 'LV',
}

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

// Parametric position (t ∈ [0,1]) of the closest point on a polyline to pos.
// Always returns { t, x, y, angle, dist } — callers decide on the distance threshold.
function closestTOnPolyline(pos, vertices) {
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

// Given t ∈ [0,1] on a polyline, return the real x,y,angle.
function positionFromT(vertices, t) {
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

// Auto-name a valve from its segment's column — VE [colName] n°1, VE [colName] n°2, …
function nameValve(segId, segToCol, existingValves, segments?, points?, levels?, lineYs?, columns?, columnXs?, chaufferie?) {
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
  const base    = `VE ${colName}`
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
// T-junction: 2h+1v → 'h' (horizontal base, vertical arm follows); 1h+2v → 'v'
function getDragConstraint(ptId, segs) {
  const connected = segs.filter(s => s.startPointId === ptId || s.endPointId === ptId)
  if (!connected.length) return 'free'
  // Endpoint nodes (single segment) can move freely in both directions
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

// Delete a pass-through node (exactly 2 incident segments of same type).
// Handles all 3 orientation cases (1in+1out, 2in, 2out) by reversing as needed.
// Returns null if deletion is not allowed (endpoint or junction with ≥3 segments).
function deleteNodeFromNetwork(ptId, segs, pts) {
  const ending   = segs.filter(s => s.endPointId   === ptId)
  const starting = segs.filter(s => s.startPointId === ptId)
  const total    = ending.length + starting.length

  if (total !== 2) return null

  let sA, sB, vsA, vsB, startId, endId

  if (ending.length === 1 && starting.length === 1) {
    // Normal case: sA ends at node, sB starts at node
    sA = ending[0];   sB = starting[0]
    if (sA.type !== sB.type) return null
    vsA = sA.vertices; vsB = sB.vertices
    if (vsA.length < 2 || vsB.length < 2) return null
    startId = sA.startPointId; endId = sB.endPointId
    // vertices: A→...→NODE→...→B
    const verts = [...vsA, ...vsB.slice(1)]
    return {
      newSegs: segs.filter(s => s.id !== sA.id && s.id !== sB.id)
                   .concat([{ ...sA, id: uid('T'), vertices: verts, startPointId: startId, endPointId: endId }]),
      newPts: pts.filter(p => p.id !== ptId),
    }
  }

  if (ending.length === 2) {
    // Both end at node: sA ends at NODE, sB ends at NODE → reverse sB
    sA = ending[0]; sB = ending[1]
    if (sA.type !== sB.type) return null
    vsA = sA.vertices; vsB = [...sB.vertices].reverse()
    if (vsA.length < 2 || vsB.length < 2) return null
    startId = sA.startPointId; endId = sB.startPointId
    const verts = [...vsA, ...vsB.slice(1)]
    return {
      newSegs: segs.filter(s => s.id !== sA.id && s.id !== sB.id)
                   .concat([{ ...sA, id: uid('T'), vertices: verts, startPointId: startId, endPointId: endId }]),
      newPts: pts.filter(p => p.id !== ptId),
    }
  }

  // Both start at node: sA starts at NODE, sB starts at NODE → reverse sA
  sA = starting[0]; sB = starting[1]
  if (sA.type !== sB.type) return null
  vsA = [...sA.vertices].reverse(); vsB = sB.vertices
  if (vsA.length < 2 || vsB.length < 2) return null
  startId = sA.endPointId; endId = sB.endPointId
  const verts = [...vsA, ...vsB.slice(1)]
  return {
    newSegs: segs.filter(s => s.id !== sA.id && s.id !== sB.id)
                 .concat([{ ...sA, id: uid('T'), vertices: verts, startPointId: startId, endPointId: endId }]),
    newPts: pts.filter(p => p.id !== ptId),
  }
}

// Direction of a segment ('h', 'v', or null)
function getSegmentDir(seg) {
  const vs = seg.vertices
  if (vs.length < 2) return null
  const dx = Math.abs(vs[vs.length - 1].x - vs[0].x)
  const dy = Math.abs(vs[vs.length - 1].y - vs[0].y)
  if (dx === 0 && dy === 0) return null
  return dx >= dy ? 'h' : 'v'
}

// Remove intermediate vertices that make two consecutive edges share the same axis,
// and skip zero-length edges (duplicate consecutive vertices).
// [A, M, B] where A→M and M→B are both horizontal → [A, B].
// [A, A, B] (zero-length first edge) → [A, B].
function collapseCollinear(vertices) {
  if (vertices.length < 2) return vertices
  const result = [vertices[0]]
  for (let i = 1; i < vertices.length; i++) {
    const curr = vertices[i]
    const prev = result[result.length - 1]
    if (curr.x === prev.x && curr.y === prev.y) continue  // arête longueur zéro
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

function collapseSegs(segs) {
  return segs.map(s => {
    const vs = collapseCollinear(s.vertices)
    return vs.length < s.vertices.length ? { ...s, vertices: vs } : s
  })
}

// Déplace une extrémité de tronçon vers newPos en insérant un coude 90° si nécessaire
// pour maintenir l'orthogonalité des arêtes adjacentes.
// isEnd: true = extrémité finale, false = extrémité initiale
function elbowVertices(vertices, isEnd, newPos) {
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

// Returns { minDelta, maxDelta } clamping the perpendicular movement of a segment sub-edge
// so no moving node can cross a directly-connected static neighbor.
function computeSegDeltaLimits(segId, subIdx, segs, pts) {
  const seg = segs.find(s => s.id === segId)
  if (!seg) return { minDelta: -Infinity, maxDelta: Infinity }
  const vs = seg.vertices
  if (vs.length < 2 || subIdx >= vs.length - 1) return { minDelta: -Infinity, maxDelta: Infinity }
  const a = vs[subIdx], b = vs[subIdx + 1]
  const edgeDir = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
  const isVert  = edgeDir === 'v'
  const barCoord = isVert ? a.x : a.y
  const onBar   = v => (isVert ? v.x : v.y) === barCoord

  // BFS: find all node IDs that will move with this column/bar (mirrors computeSegMove)
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

  // For each moving node, find perpendicular connections to static neighbors
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
      if (isVert ? !edH : edH) continue  // skip non-perpendicular sub-edges
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

// After a segment move that brought two nodes to the same position, merge coincident nodes.
// A zero-length segment (vertices collapsed to < 2 by collapseSegs) signals the merger.
function mergeCoincidentNodes(segs, pts) {
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

// Move a segment sub-edge perpendicularly by delta.
// Horizontal edge: the entire connected horizontal bar (all sub-edges at same Y, reachable via shared nodes)
//   moves together; connected vertical segments stretch.
// Vertical edge: only this sub-edge moves (original per-sub-edge behaviour).
function computeSegMove(segId, subIdx, delta, segs, pts) {
  const seg = segs.find(s => s.id === segId)
  if (!seg) return { newSegs: segs, newPts: pts }
  const vs = seg.vertices
  if (vs.length < 2 || subIdx < 0 || subIdx >= vs.length - 1) return { newSegs: segs, newPts: pts }
  const a = vs[subIdx], b = vs[subIdx + 1]
  const edgeDir = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'

  if (edgeDir === 'h') {
    const barY = a.y
    const onBarY = v => v.y === barY

    // BFS : trouver tous les tronçons ayant un sous-trait horizontal au même Y, reliés entre eux
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
      // Suivre les connexions aux extrémités situées sur la barre
      if (onBarY(s.vertices[0]))
        segs.forEach(x => { if (x.id !== sid && (x.startPointId === s.startPointId || x.endPointId === s.startPointId)) queue.push(x.id) })
      if (onBarY(s.vertices[s.vertices.length - 1]))
        segs.forEach(x => { if (x.id !== sid && (x.startPointId === s.endPointId || x.endPointId === s.endPointId)) queue.push(x.id) })
    }

    // Nœuds terminaux des tronçons de la barre qui sont au barY
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
      // Tronçons verticaux connectés à la barre : étirer l'extrémité qui bouge
      const v = [...s.vertices]; let changed = false
      if (barNodeIds.has(s.startPointId)) { v[0]            = applyDelta(v[0]);            changed = true }
      if (barNodeIds.has(s.endPointId))   { v[v.length - 1] = applyDelta(v[v.length - 1]); changed = true }
      return changed ? { ...s, vertices: v } : s
    })
    return { newSegs: collapseSegs(newSegs), newPts }
  }

  // Arête verticale : BFS colonne — tous les tronçons verticaux au même X, reliés entre eux
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

// Move a node to np maintaining orthogonality.
// T-junction (2+ segs along movAxis): perpendicular arm moves rigidly.
// T-junction: perpendicular arm (and its entire vertical chain) translates rigidly.
// L-corner (exactly 1 seg per axis): a bend vertex is inserted in the perpendicular segment
//   so the far end stays fixed and the corner "turns the corner".
function computeNodeMove(ptId, np, segs, pts, constraintOverride = null) {
  const origPt = pts.find(p => p.id === ptId)
  if (!origPt) return { newSegs: segs, newPts: pts }
  const dx = np.x - origPt.x, dy = np.y - origPt.y
  if (dx === 0 && dy === 0) return { newSegs: segs, newPts: pts }
  const constraint = constraintOverride ?? getDragConstraint(ptId, segs)
  const movAxis = dx !== 0 ? 'h' : 'v'
  const connected = segs.filter(s => s.startPointId === ptId || s.endPointId === ptId)

  // Axis of a segment at a given node (looks at the two vertices touching that node)
  const axisAt = (seg, fromPtId) => {
    const vs = seg.vertices; if (vs.length < 2) return null
    const isEnd = seg.endPointId === fromPtId
    const [a, b] = isEnd ? [vs[vs.length - 2], vs[vs.length - 1]] : [vs[0], vs[1]]
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
  }
  const edgeAxisAt = seg => axisAt(seg, ptId)

  // L-corner: exactly 2 connected segments with different axes (1 perp + 1 parallel).
  // The node can move freely; the perpendicular segment gets a 90° elbow while its
  // far end stays fixed; the parallel segment stretches.
  const segsAlongAxis = connected.filter(s => edgeAxisAt(s) === movAxis).length
  // L-corner: 2 segments, one perpendicular + one parallel (classic corner)
  // Endpoint: 1 segment moving perpendicular to it → same elbow logic, far end stays fixed
  const isLCorner = (connected.length === 2 && segsAlongAxis === 1) ||
                    (connected.length === 1 && segsAlongAxis === 0)

  // Returns true if every sub-edge of seg is perpendicular to movAxis.
  const isFullyPerp = seg => {
    const vs = seg.vertices
    for (let i = 1; i < vs.length; i++) {
      const ax = Math.abs(vs[i].x - vs[i-1].x) >= Math.abs(vs[i].y - vs[i-1].y) ? 'h' : 'v'
      if (ax === movAxis) return false
    }
    return true
  }

  // BFS: far ends of fully-perpendicular segments → must translate rigidly with the moved node.
  // Not needed for L-corners (far ends stay fixed; elbow handles the perpendicular segment).
  // Cascades along perpendicular chains; stops at locked frontier nodes.
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
          // L-corner: introduce a 90° bend — far end stays fixed, old position becomes elbow
          const oldEndV = { x: origPt.x, y: origPt.y }
          const newEndV = { x: snap(origPt.x + dx), y: snap(origPt.y + dy) }
          return isMainEnd
            ? { ...seg, vertices: collapseCollinear([...vs.slice(0, -1), oldEndV, newEndV]) }
            : { ...seg, vertices: collapseCollinear([newEndV, oldEndV, ...vs.slice(1)]) }
        }
        // Non-L-corner: walk from the moving end, translating vertices through consecutive
        // perpendicular sub-edges, stop at the first parallel one (which stretches).
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
      // First sub-edge is parallel: stretch by moving only the endpoint vertex
      const v = [...vs], idx = isMainEnd ? v.length - 1 : 0
      v[idx] = { x: snap(v[idx].x + dx), y: snap(v[idx].y + dy) }
      return { ...seg, vertices: v }
    }

    if (isRigidStart || isRigidEnd) {
      if (isRigidStart && isRigidEnd) {
        // Both ends rigid: translate entire segment (preserves internal geometry)
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


// Renvoie les Y des lignes séparant un niveau sous-sol d'un niveau non-sous-sol
function getFrontierYs(levels, lineYs) {
  const ys = []
  for (let i = 1; i < levels.length; i++) {
    if (!!levels[i - 1].isSousSol !== !!levels[i].isSousSol) ys.push(lineYs[i])
  }
  return ys
}

// Découpe les segments verticaux aux Y frontières et crée des nœuds verrouillés (idempotent)
// Étape 1 : supprime les nœuds verrouillés qui ne sont plus sur une frontière et fusionne leurs tronçons
// Étape 2 : découpe les tronçons qui traversent une frontière
function applyFrontierSplits(segs, pts, levels, lineYs) {
  const frontierYs = getFrontierYs(levels, lineYs)
  let workSegs = segs, workPts = pts, anyChanged = false

  // Étape 1 — nettoyage des nœuds verrouillés invalides
  // Règles : orphelin → supprimer ; hors frontière avec 2 tronçons → fusionner ;
  //          hors frontière avec 1 tronçon → déverrouiller (nœud ordinaire)
  let cleanupChanged = true
  while (cleanupChanged) {
    cleanupChanged = false
    for (const pt of workPts) {
      if (!pt.isLocked) continue
      const segIn    = workSegs.find(s => s.endPointId   === pt.id)
      const segOut   = workSegs.find(s => s.startPointId === pt.id)
      const atFrontier = frontierYs.includes(pt.y)

      if (!segIn && !segOut) {
        // Orphelin : aucun tronçon connecté → supprimer
        workPts = workPts.filter(p => p.id !== pt.id)
        anyChanged = true; cleanupChanged = true; break
      }

      if (!atFrontier) {
        if (segIn && segOut) {
          // Hors frontière avec deux tronçons → fusionner
          const mergedVerts = collapseCollinear([...segIn.vertices, ...segOut.vertices.slice(1)])
          const merged = { ...segIn, id: uid('T'), vertices: mergedVerts, endPointId: segOut.endPointId }
          workSegs = workSegs.filter(s => s.id !== segIn.id && s.id !== segOut.id).concat([merged])
          workPts  = workPts.filter(p => p.id !== pt.id)
        } else {
          // Hors frontière avec un seul tronçon → déverrouiller
          workPts = workPts.map(p => p.id === pt.id ? { ...p, isLocked: false } : p)
        }
        anyChanged = true; cleanupChanged = true; break
      }
    }
  }

  // Étape 2 — découpe aux frontières
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

// Connexion automatique de Production ECS au réseau :
// 1. Fusionne tout nœud ordinaire à l'intérieur du rectangle ECS (ECS survit)
// 2. Si ECS n'a aucun tronçon connecté, le snapping sur le tronçon qui traverse son rectangle
function applySpecialPtSnap(segs, pts, skipGroupeIds = null) {
  let workSegs = segs, workPts = pts, anyChanged = false

  for (const ecsOrig of pts.filter(p => p.type === 'productionECS' || p.type === 'arriveeEF' || p.type === 'groupe')) {
    const ecs = workPts.find(p => p.id === ecsOrig.id)
    if (!ecs) continue
    // Ne pas snapper un groupe qui vient d'être déplacé par l'utilisateur
    if (ecs.type === 'groupe' && skipGroupeIds?.has(ecs.id)) continue
    const w = ecs.type === 'groupe' ? 60 : (ecs.size?.w ?? 44)
    const h = ecs.type === 'groupe' ? 30 : (ecs.size?.h ?? 28)
    const hw = w / 2, hh = h / 2

    // 1. Fusionner les nœuds ordinaires à l'intérieur du rectangle ECS → garder ECS
    let changed = true
    while (changed) {
      changed = false
      const inside = workPts.find(p => {
        if (p.id === ecs.id || p.isLocked || p.type === 'pump' || p.type === 'productionECS' || p.type === 'arriveeEF' || p.type === 'groupe') return false
        if (Math.abs(p.x - ecs.x) > hw || Math.abs(p.y - ecs.y) > hh) return false
        if (ecs.type === 'groupe') {
          // Groupe déjà connecté : pas de connexion supplémentaire
          const groupeConn = workSegs.filter(s => s.startPointId === ecs.id || s.endPointId === ecs.id).length
          if (groupeConn >= 1) return false
          // Seulement les extrémités libres (exactement 1 tronçon connecté)
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

    // 2. Si aucun tronçon connecté : snapping sur le tronçon traversant le rectangle ECS
    // (non applicable aux groupes de puisage : connexion aux extrémités seulement)
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

let _c = 0
const uid = p => `${p}-${Date.now()}-${++_c}`


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
  chaufferie, onChaufferieChange, editChaufferie,
  placingEquipment, onPlacingDone,
  placingChaufferie, onPlacingChaufferieDone,
  editParam, onAssignParam,
  connHighlightIds, onConnHighlight,
  networkFlows,
  flowDirections,
  groupesEditMode,
  onRemoveGroupeById,
  showGroupeNames,
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
  calcSubMode,
  pdcParams,
  segToCol,
  onExitSpecialMode,
}) {
  const svgRef    = useRef(null)
  const spaceRef  = useRef(false)
  const ptDragRef    = useRef(null)   // {ptId, startX, startY, origX, origY, moved, constraint}
  const segDragRef   = useRef(null)   // {segId, dir, startScreenX, startScreenY, origPerp, moved}
  const blockDragRef = useRef(null)   // {startScreenX, startScreenY, moved}
  const valveDragRef = useRef(null)   // {valveId, segmentId, origT}

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
  const [drawing,   setDrawing]   = useState(null)
  const [mouse,     setMouse]     = useState({ x: 0, y: 0 })
  const [rectSt,    setRectSt]    = useState(null)
  const [selRect,   setSelRect]   = useState(null)
  const [ptDragPos,    setPtDragPos]    = useState(null)  // live drag {ptId,x,y}
  const [segDragState, setSegDragState] = useState(null)  // live drag {segId, delta}
  const [blockDragState, setBlockDragState] = useState(null)  // live drag {dx, dy}
  const [previewVanne,  setPreviewVanne]  = useState(null)  // { x, y, angle, t, segId }
  const [valveDragT, setValveDragT] = useState(null)  // { valveId, t } live drag
  const justMovedGroupeIdsRef = useRef(new Set())

  // ── Clear drawing on mode/type change ────────────────
  useEffect(() => { if (drawMode !== 'draw') setDrawing(null) }, [drawMode])
  useEffect(() => { if (pipeType === 'point') setDrawing(null) }, [pipeType])

  // ── Auto-split segments at frontier Ys ───────────────
  // Uses onNetworkPatch (not onNetworkChange) to avoid polluting the undo stack.
  useEffect(() => {
    const result = applyFrontierSplits(segments, points, levels, lineYs)
    if (result) onNetworkPatch(result.segs, result.pts)
  }, [segments, points, levels, lineYs]) // eslint-disable-line react-hooks/exhaustive-deps

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
    onNetworkChange(
      s => s.filter(x => x.id !== seg.id).concat([seg1, seg2]),
      p => existing ? p : [...p, junctionPt]
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
    onNetworkChange(result.newSegs, result.newPts)
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
if (drawing) commitDrawing()
        else { onSelectIds([]); onSelectedValveChange?.(null) }
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
        for (const ptId of delPtIds) {
          const pt = newPts.find(p => p.id === ptId)
          if (pt?.type === 'productionECS' || pt?.type === 'arriveeEF') {
            newPts = newPts.map(p => p.id === ptId ? { id: p.id, name: p.name ?? '', x: p.x, y: p.y } : p)
            continue
          }
          if (pt?.type === 'pump') {
            newPts = newPts.filter(p => p.id !== ptId)
            continue
          }
          const result = deleteNodeFromNetwork(ptId, newSegs, newPts)
          if (result) { newSegs = result.newSegs; newPts = result.newPts }
        }
        if (delPtIds.length > 0 || delSegIds.size > 0) onNetworkChange(newSegs, newPts)
        onSelectIds([])
      }
    }
    const ku = e => { if (e.code === 'Space') spaceRef.current = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup',   ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [drawing, commitDrawing, selectedIds, segments, points, onNetworkChange, onSelectIds, placingEquipment, onPlacingDone, placingChaufferie, onPlacingChaufferieDone, onRemoveGroupeById, selectedValveId, onSelectedValveChange, onValvesChange, drawMode, onExitSpecialMode])

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
        : p.type === 'productionECS' || p.type === 'arriveeEF'
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
      if (dragCh.type === 'top') {
        const rawH = dragCh.origHeight - (e.clientY - dragCh.screenY) / tf.k
        const levelIdx = levels.findIndex(l => l.id === chaufferie.levelId)
        const yBottom  = levelIdx >= 0 ? lineYs[levelIdx] : 0
        const levelAboveY = (levelIdx >= 0 && levelIdx + 1 < lineYs.length) ? lineYs[levelIdx + 1] : yBottom - 2000
        const maxH = yBottom - levelAboveY - MIN_GAP
        onChaufferieChange({ ...chaufferie, height: Math.round(Math.max(MIN_H, Math.min(Math.max(maxH, MIN_H), rawH))) })
      } else if (dragCh.type === 'left') {
        const rawX1 = dragCh.origX1 + (e.clientX - dragCh.screenX) / tf.k
        onChaufferieChange({ ...chaufferie, x1: snap(Math.min(dragCh.origX2 - MIN_W, rawX1)) })
      } else if (dragCh.type === 'right') {
        const rawX2 = dragCh.origX2 + (e.clientX - dragCh.screenX) / tf.k
        onChaufferieChange({ ...chaufferie, x2: snap(Math.max(dragCh.origX1 + MIN_W, rawX2)) })
      } else if (dragCh.type === 'move') {
        const rawDx = (e.clientX - dragCh.screenX) / tf.k
        const mouseY = dragCh.origCenterY + (e.clientY - dragCh.screenY) / tf.k
        let newLevelId = chaufferie.levelId
        for (let i = 0; i < levels.length; i++) {
          const yBot = lineYs[i], yTop = lineYs[i + 1]
          if (yTop !== undefined && mouseY > yTop && mouseY <= yBot) { newLevelId = levels[i].id; break }
        }
        onChaufferieChange({ ...chaufferie, x1: snap(dragCh.origX1 + rawDx), x2: snap(dragCh.origX2 + rawDx), levelId: newLevelId })
      }
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
  }, [tf, panSt, dragLine, dragCol, dragCh, rectSt, onLineYsChange, onColumnXsChange, onPPZoneDrag, chaufferie, onChaufferieChange, levels, lineYs, drawMode, pipeType, segments, previewVanne])

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

      // productionECS : si un nœud existant est à portée, le convertir directement
      // (évite les doublons après suppression d'une productionECS)
      if (placingEquipment.type === 'productionECS') {
        const existingPt = points.find(p => dist(p, snapped) < PT_HIT)
        if (existingPt) {
          onNetworkChange(
            s => s,
            p => p.map(x => x.id === existingPt.id
              ? { ...x, type: 'productionECS', name: placingEquipment.name ?? x.name, size: placingEquipment.size ?? x.size }
              : x)
          )
          onPlacingDone()
          return
        }
      }

      const onSeg = nearestOnSegments(snapped, hitSegs)
      const sp = (onSeg && onSeg.d < HIT) ? onSeg.pt : snapped
      const newPt = {
        id: uid('eq'), name: placingEquipment.name, x: sp.x, y: sp.y,
        type: placingEquipment.type,
        ...(placingEquipment.type === 'pump'
          ? { rotation: placingEquipment.rotation ?? 0, size: placingEquipment.size ?? 12 }
          : { size: placingEquipment.size ?? { w: 44, h: 28 } }),
      }
      const renameId = placingEquipment.renameFirstPump ?? null
      const ptsUpdate = p => [
        ...(renameId
          ? p.map(x => x.id === renameId ? { ...x, name: 'Pompe bouclage ECS n°1' } : x)
          : p),
        newPt,
      ]
      if (onSeg && onSeg.d < HIT) {
        const { seg, subIdx } = onSeg
        const vs = seg.vertices
        const seg1 = { ...seg, id: uid('T'), vertices: [...vs.slice(0, subIdx + 1), sp], endPointId: newPt.id }
        const seg2 = { ...seg, id: uid('T'), vertices: [sp, ...vs.slice(subIdx + 1)], startPointId: newPt.id }
        onNetworkChange(s => s.filter(x => x.id !== seg.id).concat([seg1, seg2]), ptsUpdate)
      } else {
        onNetworkChange(s => s, ptsUpdate)
      }
      onPlacingDone()
      return
    }

    // ── Chaufferie placement mode ──
    if (placingChaufferie) {
      let li = 0
      for (let i = 0; i < levels.length; i++) {
        const yBot = lineYs[i], yTop = lineYs[i + 1]
        if (yTop !== undefined && pos.y > yTop && pos.y <= yBot) { li = i; break }
      }
      if (levels.length > 0 && lineYs.length > levels.length && pos.y <= lineYs[levels.length]) {
        li = levels.length - 1
      }
      const w = chaufferie.x2 - chaufferie.x1
      const newX1 = snap(pos.x - w / 2)
      onChaufferieChange({ ...chaufferie, placed: true, enabled: true, levelId: levels[li]?.id ?? chaufferie.levelId, x1: newX1, x2: newX1 + w })
      onPlacingChaufferieDone()
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
        // Priorité : si le clic brut est proche d'un nœud existant, finaliser vers ce nœud
        let rawNearPt = null, rawNearD = DRAW_SNAP
        for (const p of points) {
          const d = dist(p, pos)
          if (d < rawNearD) { rawNearD = d; rawNearPt = p }
        }
        if (rawNearPt) {
          finalize({ x: rawNearPt.x, y: rawNearPt.y }, rawNearPt.id)
        } else {
          const { pos: sp, ptId, onSeg } = resolveSnap(snapped)
          if (ptId) {
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
          valveDragRef.current = { valveId: valve.id, segmentId: valve.segmentId, origT: valve.t, moved: false }
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
    setRectSt(pos)
    setSelRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
  }, [tf, lineYs, drawMode, drawing, pipeType, nearPt,
      finalize, splitSegment, resolveSnap, deletePoint,
      segments, points, selectedIds, onNetworkChange, onSelectIds,
      placingEquipment, onPlacingDone,
      placingChaufferie, onPlacingChaufferieDone, levels, lineYs, chaufferie, onChaufferieChange,
      columns, columnXs, valves, onValvesChange, selectedValveId, onSelectedValveChange,
      connHighlightIds, onConnHighlight])

  // ── mouse up ──────────────────────────────────────────
  const onMouseUp = useCallback(e => {
    setPanSt(null)
    setDragLine(null)
    setDragCol(null)
    setDragCh(null)

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

    // Commit point drag
    if (ptDragRef.current && ptDragRef.current.moved && ptDragPos) {
      const { ptId } = ptDragRef.current
      const np = { x: ptDragPos.x, y: ptDragPos.y }

      // Priority 1: overlapping another point → merge (productionECS > pump > regular)
      const dragged = points.find(p => p.id === ptId)
      if (dragged?.type === 'groupe') justMovedGroupeIdsRef.current.add(ptId)
      const overlap = points.find(p => {
        if (p.id === ptId || dist(p, np) >= PT_HIT) return false
        // Ne pas merger vers un groupe déjà connecté à un tronçon
        if (p.type === 'groupe' && segments.filter(s => s.startPointId === p.id || s.endPointId === p.id).length >= 1) return false
        return true
      })
      if (overlap && dragged) {
        const rank = p => p?.type === 'productionECS' ? 3 : p?.type === 'groupe' ? 2 : p?.type === 'pump' ? 1 : 0
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

        if (hitSeg && hitSeg.d < SNAP && dragged?.type !== 'groupe') {
          const { seg, subIdx } = hitSeg
          const seg1 = { ...seg, id: uid('T'), vertices: [...seg.vertices.slice(0, subIdx + 1), np], endPointId: ptId }
          const seg2 = { ...seg, id: uid('T'), vertices: [np, ...seg.vertices.slice(subIdx + 1)], startPointId: ptId }
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
            p => p.map(x => x.id === ptId ? { ...x, ...np } : x)
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
        onNetworkChange(newSegs, newPts)
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
  }, [rectSt, selRect, segments, points, selectedIds, onSelectIds, ptDragPos, segDragState, blockDragState, onNetworkChange, lineYs, onValvesChange, valveDragT])

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
    : placingEquipment !== null || placingChaufferie ? 'crosshair'
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
            <rect x={0} y={z.yTop} width={contentW} height={z.yBot - z.yTop}
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
          // PP zone gap column: render its left separator border
          if (col.isPPZone) {
            const hasGroupe = (points ?? []).some(p => p.type === 'groupe' && p.colId === col.colId)
            if (!hasGroupe) return <g key={col.id} />
            return (
              <g key={col.id} style={{ pointerEvents: 'none' }}>
                <line x1={x1} y1={yTop} x2={x1} y2={yBot} stroke="#d1d9e6" strokeWidth={1} />
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

        {/* Chaufferie / Local EF */}
        {chaufferie?.enabled && (() => {
          const levelIdx = levels.findIndex(l => l.id === chaufferie.levelId)
          if (levelIdx < 0 || levelIdx >= lineYs.length) return null
          const yBot = lineYs[levelIdx]
          const yTop = yBot - chaufferie.height
          const { x1, x2 } = chaufferie
          const H = 6
          const isEFLocal = activeCalcId === 'alimentation-ef'
          const localStroke = isEFLocal ? '#3b82f6' : '#818cf8'
          const localFill   = isEFLocal ? 'rgba(219,234,254,0.5)' : 'rgba(238,242,255,0.5)'
          const localLabel  = isEFLocal ? 'Local EF' : 'Local ECS'
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

        {/* Level lines */}
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

        {/* Segments */}
        {visRenderSegs.map(seg => {
          const sel  = selectedIds.includes(seg.id)
          const isEF = activeCalcId === 'alimentation-ef'
          const col  = isEF ? '#2563eb' : (seg.type === 'retour' ? '#f97316' : '#dc2626')
          const dash = (!isEF && seg.type === 'retour') ? '10,6' : 'none'
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

          // connHighlight: highlighted segment → normal color, others → light gray
          const isHighlighted = connHighlightIds?.length > 0 && connHighlightIds.includes(seg.id)
          const isGrayed      = connHighlightIds?.length > 0 && !connHighlightIds.includes(seg.id)

          // match=green · missing=red(ECS)/blue(EF) · other=gray · dash always follows segment type
          const missingColor = isEF ? '#93c5fd' : '#ef4444'
          const strokeColor = isGrayed      ? '#d1d5db'
            : editStyle === 'match'   ? '#16a34a'
            : editStyle === 'missing' ? missingColor
            : editStyle === 'other'   ? '#9ca3af'
            : sel ? '#2563eb' : col
          const strokeW = isGrayed ? 1
            : editStyle === 'match' ? 3 : editStyle === 'missing' ? 2 : editStyle === 'other' ? 1 : sel ? 2.5 : 1.5
          const segDash = sel ? 'none' : dash
          const opacity = 1

          return (
            <g key={seg.id}>
              <path d={path} stroke="transparent" strokeWidth={14} fill="none"
                style={{ cursor: editParam ? 'pointer' : drawMode === 'delete' ? 'crosshair' : 'pointer' }}
                onClick={ev => {
                  if (drawMode === 'delete') return
                  ev.stopPropagation()
                  if (editParam) { onAssignParam(seg.id); return }
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
                  const name = getDisplayName(seg, renderSegs, levels, lineYs, columns, columnXs, chaufferie, renderPts, roleMap?.get(seg.id), activeCalcId, roleMap)
                  if (name) lines.push({ text: name })
                }
                if (canvasDisplay?.length && seg.length_override != null) {
                  lines.push({ text: `${seg.length_override} m` })
                }
                if (canvasDisplay?.material || canvasDisplay?.dn) {
                  const mat = materials?.find(m => m.id === seg.materialId)
                  if (canvasDisplay?.material && canvasDisplay?.dn && seg.dn) {
                    lines.push({ text: mat ? `${mat.name} DN${seg.dn}` : `DN${seg.dn}` })
                  } else if (canvasDisplay?.material && mat) {
                    lines.push({ text: mat.name })
                  } else if (canvasDisplay?.dn && seg.dn) {
                    lines.push({ text: `DN${seg.dn}` })
                  }
                }
                if (canvasDisplay?.insulation && seg.insulationId) {
                  const ins = insulations?.find(i => i.id === seg.insulationId)
                  if (ins) lines.push({ text: seg.thickness != null ? `${ins.name} ${seg.thickness}mm` : ins.name })
                }
                if (canvasDisplay?.debit) {
                  if (activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef') {
                    const ar = alimentationResults?.get(seg.id)
                    if (ar?.method === 'collective' && ar.collective?.Qp != null)
                      lines.push({ text: `${ar.collective.Qp.toFixed(2)} l/s` })
                  } else {
                    const flow = networkFlows?.get(seg.id)
                    if (flow?.flowRate != null) lines.push({ text: `${flow.flowRate.toFixed(3)} m³/h` })
                  }
                }
                if (canvasDisplay?.vitesse) {
                  if (activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef') {
                    const ar = alimentationResults?.get(seg.id)
                    const dnDef = (() => {
                      const mat = seg.materialId ? materials?.find(m => m.id === seg.materialId) : null
                      return mat && seg.dn ? mat.dns?.find(d => d.dn === seg.dn) : null
                    })()
                    const di_mm = seg.di_override ?? dnDef?.di ?? null
                    const c = ar?.method === 'collective' ? ar.collective : null
                    const area = c && di_mm ? Math.PI * (di_mm / 1000) ** 2 / 4 : null
                    const v = area && c?.Qp > 0 ? (c.Qp * 1e-3) / area : null
                    if (v != null) lines.push({ text: `${sf(v, 2)} m/s`, orange: v > 1.5 && v <= 2.0, red: v > 2.0 })
                  } else {
                    const flow = networkFlows?.get(seg.id)
                    if (flow?.velocity != null) {
                      const v = flow.velocity
                      const segRole = roleMap?.get(seg.id)
                      const vMax = segRole === 'collecteur-retour' ? 1.0 : 0.5
                      const isRedMin    = seg.type === 'retour' && v < 0.2
                      const isOrangeMax = seg.type === 'retour' && v > vMax
                      lines.push({ text: `${sf(v, 2)} m/s`, red: isRedMin, orange: isOrangeMax && !isRedMin })
                    }
                  }
                }
                if (canvasDisplay?.deltaT && activeCalcId !== 'alimentation-ecs' && activeCalcId !== 'alimentation-ef') {
                  const sr = thermalResults?.segResults?.get(seg.id)
                  if (sr?.deltaT != null) lines.push({ text: `ΔT ${sf(sr.deltaT, 2)} °C` })
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
                      fill="rgba(255,255,255,0.9)" stroke={col} strokeWidth={0.4} rx={2} />
                    {lines.map((line, i) => (
                      <text key={i} x={bx + PAD} y={by + PAD + (i + 1) * LH - 1}
                        fontSize={8.5}
                        fill={line.red ? '#dc2626' : line.orange ? '#f97316' : col}
                        fontWeight="600">{line.text}</text>
                    ))}
                  </g>
                )
              })()}
              {seg.showName && (() => {
                const label = getDisplayName(seg, renderSegs, levels, lineYs, columns, columnXs, chaufferie, renderPts, null, activeCalcId)
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
          const color = sel ? '#2563eb' : '#1e3a5f'
          // T always points world-up on horizontal segs, world-right on vertical segs
          const ar = angle * Math.PI / 180
          const isHoriz = Math.abs(Math.cos(ar)) >= Math.abs(Math.sin(ar))
          const tDir = isHoriz
            ? (Math.cos(ar) >= 0 ? -1 : 1)
            : (Math.sin(ar) >= 0 ? -1 : 1)
          const TH = S + 1  // T stem length
          return (
            <g key={valve.id}
              transform={`translate(${x},${y}) rotate(${angle})`}
              style={{ cursor: liveDrag ? 'grabbing' : 'grab' }}>
              <circle r={14} fill="transparent" />
              <polygon points={`${-S},${-S*0.85} ${-S},${S*0.85} 0,0`}
                fill={color} style={{ pointerEvents: 'none' }} />
              <polygon points={`${S},${-S*0.85} ${S},${S*0.85} 0,0`}
                fill={color} style={{ pointerEvents: 'none' }} />
              {/* T mark — always points world-up (horiz) or world-right (vert) */}
              <line x1="0" y1="0" x2="0" y2={tDir * TH}
                stroke={color} strokeWidth="1.5" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              <line x1={-(S * 0.6)} y1={tDir * TH} x2={S * 0.6} y2={tDir * TH}
                stroke={color} strokeWidth="1.5" strokeLinecap="round" style={{ pointerEvents: 'none' }} />
              {sel && (
                <circle r={9} fill="none" stroke="#2563eb" strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }} />
              )}
            </g>
          )
        })}

        {/* Prévisualisation vanne */}
        {previewVanne && (
          <g transform={`translate(${previewVanne.x},${previewVanne.y}) rotate(${previewVanne.angle})`}
            style={{ pointerEvents: 'none', opacity: 0.5 }}>
            {(() => {
              const S = 6, TH = S + 1
              const ar = previewVanne.angle * Math.PI / 180
              const isHoriz = Math.abs(Math.cos(ar)) >= Math.abs(Math.sin(ar))
              const tDir = isHoriz ? (Math.cos(ar) >= 0 ? -1 : 1) : (Math.sin(ar) >= 0 ? -1 : 1)
              return (
                <>
                  <polygon points={`${-S},${-S*0.85} ${-S},${S*0.85} 0,0`} fill="#4f46e5" />
                  <polygon points={`${S},${-S*0.85} ${S},${S*0.85} 0,0`} fill="#4f46e5" />
                  <line x1="0" y1="0" x2="0" y2={tDir * TH}
                    stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round" />
                  <line x1={-(S * 0.6)} y1={tDir * TH} x2={S * 0.6} y2={tDir * TH}
                    stroke="#4f46e5" strokeWidth="1.5" strokeLinecap="round" />
                </>
              )
            })()}
          </g>
        )}

        {/* Nœuds */}
        {visRenderPts.map(pt => {
          const sel     = selectedIds.includes(pt.id)
          const dragged = ptDragPos?.ptId === pt.id

          // Temperature helpers
          const resolveNodeTemp = (ptId) => {
            if (!canvasDisplay?.temperatureNoeud) return null
            if (activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef') return null
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

          if (pt.isLocked) {
            const lockedClick = ev => {
              if (drawMode === 'editParams') return
              ev.stopPropagation()
              onSelectIds(ids => ev.shiftKey
                ? ids.includes(pt.id) ? ids.filter(i => i !== pt.id) : [...ids, pt.id]
                : [pt.id])
            }
            const lockedTemp = resolveNodeTemp(pt.id)
            return (
              <g key={pt.id} onClick={lockedClick} style={{ cursor: 'pointer' }}>
                <circle cx={pt.x} cy={pt.y} r={10} fill="transparent" />
                <polygon
                  points={`${pt.x},${pt.y - 6} ${pt.x + 6},${pt.y} ${pt.x},${pt.y + 6} ${pt.x - 6},${pt.y}`}
                  fill={sel ? '#fef3c7' : '#fff7ed'}
                  stroke={sel ? '#f59e0b' : '#94a3b8'}
                  strokeWidth={1.5}
                  style={{ pointerEvents: 'none' }} />
                <TempBadge x={pt.x + 8} y={pt.y} T={lockedTemp} />
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
                  <circle r={r} fill={sel || dragged ? '#dbeafe' : 'rgba(238,242,255,0.97)'} stroke={sel || dragged ? '#2563eb' : '#4f46e5'} strokeWidth={1.5} />
                  <polygon points={`${-6*ts},${-7*ts} ${-6*ts},${7*ts} ${8*ts},0`} fill={sel || dragged ? '#2563eb' : '#4f46e5'} />
                </g>
                <TempBadge x={pt.x + r + 2} y={pt.y} T={pumpTemp} />
              </g>
            )
          }
          if (pt.type === 'groupe') {
            const w = 60
            const col = sel || dragged ? '#2563eb' : '#0369a1'
            const bg  = sel || dragged ? '#dbeafe' : '#f0f9ff'
            const showName = pt.name
            const label = showName ? pt.name : 'PP'
            const labelCol = sel || dragged ? '#2563eb' : showName ? '#0c4a6e' : '#7dd3fc'
            const equipLines = []
            if (canvasDisplay?.equipment && pt.equipements) {
              const items = (alimentationParams?.appareils ?? [])
                .filter(a => (pt.equipements[a.id] ?? 0) > 0)
                .map(a => `${EQUIP_ABBR[a.id] ?? a.id}×${pt.equipements[a.id]}`)
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
            // h: fixed 30 when no equip; expands to fit name + equip lines when shown
            const h = hasEquip ? Math.max(30, 20 + equipLines.length * 9) : 30
            const nameFontSize = hasEquip ? 7 : 9
            // Center the [name + equip] block vertically inside the rect
            const contentH = hasEquip ? 8 + 2 + equipLines.length * 9 : 0
            const contentTop = hasEquip ? pt.y - h / 2 + (h - contentH) / 2 : pt.y
            const equipStartY = contentTop + 10
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={ev => { ev.stopPropagation(); selClick(ev) }}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h}
                    fill={bg} stroke={col} strokeWidth={1.2} rx={3} />
                  <text x={pt.x} y={hasEquip ? contentTop : pt.y}
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
              </g>
            )
          }
          if (pt.type === 'arriveeEF') {
            const w = pt.size?.w ?? 44, h = pt.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            const col = sel || dragged ? '#1d4ed8' : '#2563eb'
            const bg  = sel || dragged ? '#bfdbfe' : '#dbeafe'
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h} fill={bg} stroke={col} strokeWidth={1.5} rx={3} />
                  <text x={pt.x} y={pt.y - h * 0.15} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>Arrivée</text>
                  <text x={pt.x} y={pt.y + h * 0.28} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>EF</text>
                </g>
              </g>
            )
          }

          if (pt.type === 'productionECS') {
            const w = pt.size?.w ?? 44, h = pt.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            const col = sel || dragged ? '#2563eb' : '#4f46e5'

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
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h} fill={sel || dragged ? '#dbeafe' : 'rgba(238,242,255,0.97)'} stroke={col} strokeWidth={1.5} rx={3} />
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
            </g>
          )
        })}

        {/* Drawing preview */}
        {previewPath && (
          <>
            <path d={previewPath}
              stroke={activeCalcId === 'alimentation-ef' ? '#2563eb' : pipeType === 'retour' ? '#f97316' : '#dc2626'} strokeWidth={1.5}
              strokeDasharray={activeCalcId !== 'alimentation-ef' && pipeType === 'retour' ? '10,6' : '5,3'}
              fill="none" opacity={0.6} style={{ pointerEvents: 'none' }} />
            {drawing.vertices.map((v, i) =>
              <rect key={i} x={v.x - 2.5} y={v.y - 2.5} width={5} height={5}
                fill={activeCalcId === 'alimentation-ef' ? '#2563eb' : pipeType === 'retour' ? '#f97316' : '#dc2626'}
                style={{ pointerEvents: 'none' }} />
            )}
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
                  <circle r={r} fill="rgba(238,242,255,0.6)" stroke="#818cf8" strokeWidth={1.5} strokeDasharray="4,3" />
                  <polygon points={`${-6*ts},${-7*ts} ${-6*ts},${7*ts} ${8*ts},0`} fill="rgba(79,70,229,0.5)" />
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
                  fill="rgba(219,234,254,0.6)" stroke="#60a5fa" strokeWidth={1.5} strokeDasharray="4,3" rx={3} />
                <text x={gx} y={gy - h * 0.15} fontSize={fs} fill="rgba(37,99,235,0.7)" fontWeight="700" textAnchor="middle">Arrivée</text>
                <text x={gx} y={gy + h * 0.28} fontSize={fs} fill="rgba(37,99,235,0.7)" fontWeight="700" textAnchor="middle">EF</text>
              </g>
            )
          }
          if (placingEquipment.type === 'productionECS') {
            const w = placingEquipment.size?.w ?? 44, h = placingEquipment.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            return (
              <g style={{ pointerEvents: 'none' }}>
                <rect x={gx - w/2} y={gy - h/2} width={w} height={h}
                  fill="rgba(238,242,255,0.6)" stroke="#818cf8" strokeWidth={1.5} strokeDasharray="4,3" rx={3} />
                <text x={gx} y={gy - h * 0.15} fontSize={fs} fill="rgba(79,70,229,0.7)" fontWeight="700" textAnchor="middle">Production</text>
                <text x={gx} y={gy + h * 0.28} fontSize={fs} fill="rgba(79,70,229,0.7)" fontWeight="700" textAnchor="middle">ECS</text>
              </g>
            )
          }
          return null
        })()}

        {/* Ghost de placement chaufferie */}
        {placingChaufferie && levels.length > 0 && (() => {
          let li = 0
          for (let i = 0; i < levels.length; i++) {
            const yBot = lineYs[i], yTop = lineYs[i + 1]
            if (yTop !== undefined && mouse.y > yTop && mouse.y <= yBot) { li = i; break }
          }
          if (lineYs.length > levels.length && mouse.y <= lineYs[levels.length]) li = levels.length - 1
          const yBot = lineYs[li]
          const w = chaufferie.x2 - chaufferie.x1
          const gx1 = snap(mouse.x - w / 2)
          return (
            <g style={{ pointerEvents: 'none' }}>
              <rect x={gx1} y={yBot - chaufferie.height} width={w} height={chaufferie.height}
                fill={activeCalcId === 'alimentation-ef' ? 'rgba(219,234,254,0.5)' : 'rgba(238,242,255,0.5)'}
                stroke={activeCalcId === 'alimentation-ef' ? '#60a5fa' : '#818cf8'} strokeWidth={1.5} strokeDasharray="6,4" />
              <text x={gx1 + w / 2} y={yBot - chaufferie.height + 13}
                fontSize={10} fill={activeCalcId === 'alimentation-ef' ? 'rgba(37,99,235,0.8)' : 'rgba(129,140,248,0.8)'} fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none' }}>{activeCalcId === 'alimentation-ef' ? 'Local EF' : 'Local ECS'}</text>
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
        <text x={8} y={18} fontSize={10} fill={activeCalcId === 'alimentation-ef' ? '#2563eb' : '#818cf8'}>
          {activeCalcId === 'alimentation-ef' ? 'Cliquez pour placer le local EF · Échap pour annuler' : 'Cliquez pour placer le local ECS · Échap pour annuler'}
        </text>
      )}
    </svg>
  )
}
