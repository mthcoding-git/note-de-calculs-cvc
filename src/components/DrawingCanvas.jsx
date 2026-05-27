import { useState, useRef, useCallback, useEffect } from 'react'
import { getDisplayName } from '../utils/naming'

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
// T-junction: 2h+1v → 'h' (horizontal base, vertical arm follows); 1h+2v → 'v'
function getDragConstraint(ptId, segs) {
  const connected = segs.filter(s => s.startPointId === ptId || s.endPointId === ptId)
  if (!connected.length) return 'free'
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

// Delete a junction node: pair collinear segments of same type and merge them.
// Unpaired (orphan) segments get a new endpoint node placed at the original position.
function deleteNodeFromNetwork(ptId, segs, pts) {
  const pt = pts.find(p => p.id === ptId)
  if (!pt) return { newSegs: segs, newPts: pts.filter(p => p.id !== ptId) }

  const ending   = segs.filter(s => s.endPointId   === ptId)
  const starting = segs.filter(s => s.startPointId === ptId)

  const edgeDir = (a, b) => Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'

  const resultSegs = []
  const removeIds  = new Set()
  const usedEnd    = new Set()
  const usedStart  = new Set()

  for (const s1 of ending) {
    if (usedEnd.has(s1.id)) continue
    const vs1 = s1.vertices; if (vs1.length < 2) continue
    const dir1 = edgeDir(vs1[vs1.length - 2], vs1[vs1.length - 1])
    for (const s2 of starting) {
      if (usedStart.has(s2.id) || s2.type !== s1.type) continue
      const vs2 = s2.vertices; if (vs2.length < 2) continue
      if (edgeDir(vs2[0], vs2[1]) !== dir1) continue
      resultSegs.push({ ...s1, id: uid('T'), vertices: [...vs1, ...vs2.slice(1)], endPointId: s2.endPointId })
      removeIds.add(s1.id); removeIds.add(s2.id)
      usedEnd.add(s1.id);   usedStart.add(s2.id)
      break
    }
  }

  const orphanE = ending.filter(s => !usedEnd.has(s.id))
  const orphanS = starting.filter(s => !usedStart.has(s.id))
  const extraPts = []
  if (orphanE.length || orphanS.length) {
    const np = { id: uid('P'), name: pt.name ?? '', x: pt.x, y: pt.y }
    extraPts.push(np)
    orphanE.forEach(s => { resultSegs.push({ ...s, endPointId:   np.id }); removeIds.add(s.id) })
    orphanS.forEach(s => { resultSegs.push({ ...s, startPointId: np.id }); removeIds.add(s.id) })
  }

  return {
    newSegs: segs.filter(s => !removeIds.has(s.id)).concat(resultSegs),
    newPts:  pts.filter(p => p.id !== ptId).concat(extraPts),
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

  const edgeAxisAt = seg => {
    const vs = seg.vertices; if (vs.length < 2) return null
    const isEnd = seg.endPointId === ptId
    const [a, b] = isEnd ? [vs[vs.length - 2], vs[vs.length - 1]] : [vs[0], vs[1]]
    return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
  }

  // L-corner: exactly 2 connected segments, exactly 1 along movAxis → introduce a bend
  const segsAlongAxis = connected.filter(s => edgeAxisAt(s) === movAxis).length
  const isLCorner = constraint !== 'free' && connected.length === 2 && segsAlongAxis === 1

  const rigidPtIds = new Set()
  if (constraint !== 'free' && !isLCorner) {
    for (const seg of connected) {
      const vs = seg.vertices; if (vs.length < 2) continue
      const isEnd = seg.endPointId === ptId
      const segAxis = edgeAxisAt(seg)
      if (segAxis !== movAxis) rigidPtIds.add(isEnd ? seg.startPointId : seg.endPointId)
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
      const isEnd = isMainEnd
      const segAxis = edgeAxisAt(seg)
      const oldEndV = { x: origPt.x, y: origPt.y }
      const newEndV = { x: snap(origPt.x + dx), y: snap(origPt.y + dy) }

      if (segAxis !== movAxis && isLCorner) {
        // Introduce a 90° bend: keep old endpoint as intermediate vertex, new position as endpoint
        return isEnd
          ? { ...seg, vertices: collapseCollinear([...vs.slice(0, -1), oldEndV, newEndV]) }
          : { ...seg, vertices: collapseCollinear([newEndV, oldEndV, ...vs.slice(1)]) }
      }
      if (segAxis !== movAxis && constraint !== 'free') {
        // T-junction: rigid body shift of perpendicular arm
        return { ...seg, vertices: seg.vertices.map(v => ({ x: snap(v.x + dx), y: snap(v.y + dy) })) }
      }
      // Same axis: stretch/shorten by moving only the endpoint vertex
      const v = [...vs], idx = isEnd ? v.length - 1 : 0
      v[idx] = { x: snap(v[idx].x + dx), y: snap(v[idx].y + dy) }
      return { ...seg, vertices: v }
    }

    if (isRigidStart || isRigidEnd) {
      const v = [...seg.vertices]
      if (isRigidStart) v[0]            = { x: snap(v[0].x           + dx), y: snap(v[0].y           + dy) }
      if (isRigidEnd)   v[v.length - 1] = { x: snap(v[v.length-1].x  + dx), y: snap(v[v.length-1].y  + dy) }
      return { ...seg, vertices: v }
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
function applySpecialPtSnap(segs, pts) {
  let workSegs = segs, workPts = pts, anyChanged = false

  for (const ecsOrig of pts.filter(p => p.type === 'productionECS')) {
    const ecs = workPts.find(p => p.id === ecsOrig.id)
    if (!ecs) continue
    const w = ecs.size?.w ?? 44, h = ecs.size?.h ?? 28
    const hw = w / 2, hh = h / 2

    // 1. Fusionner les nœuds ordinaires à l'intérieur du rectangle ECS → garder ECS
    let changed = true
    while (changed) {
      changed = false
      const inside = workPts.find(p =>
        p.id !== ecs.id && !p.isLocked && p.type !== 'pump' && p.type !== 'productionECS' &&
        Math.abs(p.x - ecs.x) <= hw && Math.abs(p.y - ecs.y) <= hh
      )
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
    const hasConnected = workSegs.some(s => s.startPointId === ecs.id || s.endPointId === ecs.id)
    if (!hasConnected) {
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
  drawMode, pipeType,
  selectedIds, onSelectIds,
  editLevelsEnabled, editColumnsEnabled,
  columns, columnXs, onColumnXsChange,
  chaufferie, onChaufferieChange, editChaufferie,
  placingEquipment, onPlacingDone,
  placingChaufferie, onPlacingChaufferieDone,
  editParam, onAssignParam,
  connHighlightIds, onConnHighlight,
  networkFlows,
}) {
  const svgRef    = useRef(null)
  const spaceRef  = useRef(false)
  const ptDragRef    = useRef(null)   // {ptId, startX, startY, origX, origY, moved, constraint}
  const segDragRef   = useRef(null)   // {segId, dir, startScreenX, startScreenY, origPerp, moved}
  const blockDragRef = useRef(null)   // {startScreenX, startScreenY, moved}

  const [tf,        setTf]        = useState({ x: 80, y: 40, k: 1 })
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

  // ── Clear drawing on mode/type change ────────────────
  useEffect(() => { if (drawMode !== 'draw') setDrawing(null) }, [drawMode])
  useEffect(() => { if (pipeType === 'point') setDrawing(null) }, [pipeType])

  // ── Auto-split segments at frontier Ys ───────────────
  useEffect(() => {
    const result = applyFrontierSplits(segments, points, levels, lineYs)
    if (result) onNetworkChange(result.segs, result.pts)
  }, [segments, points, levels, lineYs]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Auto-connect Production ECS to network ───────────
  useEffect(() => {
    const result = applySpecialPtSnap(segments, points)
    if (result) onNetworkChange(result.segs, result.pts)
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
  const commitDrawing = useCallback((d) => {
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
    const { newSegs, newPts } = deleteNodeFromNetwork(ptId, segments, points)
    onNetworkChange(newSegs, newPts)
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
        const delPtIds  = selectedIds.filter(id => points.some(p => p.id === id && !p.isLocked))
        const delSegIds = new Set(selectedIds.filter(id => segments.some(s => s.id === id)))

        let newSegs = segments.filter(s => !delSegIds.has(s.id))
        let newPts  = [...points]
        for (const ptId of delPtIds) {
          const result = deleteNodeFromNetwork(ptId, newSegs, newPts)
          newSegs = result.newSegs
          newPts  = result.newPts
        }
        onNetworkChange(newSegs, newPts)
        onSelectIds([])
      }
    }
    const ku = e => { if (e.code === 'Space') spaceRef.current = false }
    window.addEventListener('keydown', kd)
    window.addEventListener('keyup',   ku)
    return () => { window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku) }
  }, [drawing, commitDrawing, selectedIds, segments, points, onNetworkChange, onSelectIds, placingEquipment, onPlacingDone, placingChaufferie, onPlacingChaufferieDone])

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
        : p.type === 'productionECS'
        ? Math.max(PT_HIT, Math.max((p.size?.w ?? 44) / 2, (p.size?.h ?? 28) / 2))
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
        // Lock axis on first movement for free-constraint nodes (L/+ junctions)
        if (ptDragRef.current.constraint === 'free') {
          ptDragRef.current.lockedAxis = Math.abs(dx) >= Math.abs(dy) ? 'h' : 'v'
        }
      }
      if (ptDragRef.current.moved) {
        const { constraint, lockedAxis, origX, origY } = ptDragRef.current
        const effectiveConstraint = lockedAxis ?? constraint
        const x = effectiveConstraint === 'v' ? origX : snap(pos.x)
        const y = effectiveConstraint === 'h' ? origY : snap(pos.y)
        setPtDragPos({ ptId: ptDragRef.current.ptId, x, y, effectiveConstraint })
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
        const delta = snap(origPerp + rawDelta) - origPerp
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
    if (rectSt) setSelRect({ x1: rectSt.x, y1: rectSt.y, x2: pos.x, y2: pos.y })
  }, [tf, panSt, dragLine, dragCol, dragCh, rectSt, onLineYsChange, onColumnXsChange, chaufferie, onChaufferieChange, levels, lineYs])

  // ── mouse down ───────────────────────────────────────
  const onMouseDown = useCallback(e => {
    if (!svgRef.current) return
    const pos = toCanvas(e, svgRef.current, tf)

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
      const onSeg = nearestOnSegments(snapped, segments)
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

    // ── Attribution mode: segment assignment handled by onClick, block all other interactions ──
    if (editParam) return

    // ── Select mode ──

    // Bloc drag : tous les éléments sélectionnés → déplacement libre du bloc entier
    const allSelected = !e.shiftKey && selectedIds.length > 0
      && segments.length + points.length > 0
      && segments.every(s => selectedIds.includes(s.id))
      && points.every(p => selectedIds.includes(p.id))
    if (allSelected) {
      const hitPt  = nearPt(pos)
      const hitSeg = nearestOnSegments(pos, segments)
      if (hitPt || hitSeg) {
        blockDragRef.current = { startScreenX: e.clientX, startScreenY: e.clientY, moved: false }
        return
      }
    }

    const np = nearPt(pos)
    if (np) {
      onSelectIds(ids => e.shiftKey
        ? ids.includes(np.id) ? ids.filter(i => i !== np.id) : [...ids, np.id]
        : [np.id])
      if (!np.isLocked) {
        ptDragRef.current = {
          ptId: np.id, startX: e.clientX, startY: e.clientY,
          origX: np.x, origY: np.y, moved: false,
          constraint: getDragConstraint(np.id, segments), lockedAxis: null,
        }
      }
      return
    }
    const nsInfo = nearestOnSegments(pos, segments)
    if (nsInfo) {
      const ns = nsInfo.seg
      const { subIdx } = nsInfo
      onSelectIds(ids => e.shiftKey
        ? ids.includes(ns.id) ? ids.filter(i => i !== ns.id) : [...ids, ns.id]
        : [ns.id])
      const a = ns.vertices[subIdx], b = ns.vertices[subIdx + 1]
      const edgeDir = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? 'h' : 'v'
      const origPerp = edgeDir === 'h' ? a.y : a.x
      segDragRef.current = { segId: ns.id, subIdx, dir: edgeDir, startScreenX: e.clientX, startScreenY: e.clientY, origPerp, moved: false }
      return
    }

    // Empty space → rectangle de sélection (glisser) ou désélection (clic)
    setRectSt(pos)
    setSelRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y })
  }, [tf, lineYs, drawMode, drawing, pipeType, nearPt,
      finalize, splitSegment, resolveSnap, deletePoint,
      segments, points, selectedIds, onNetworkChange, onSelectIds,
      placingEquipment, onPlacingDone,
      placingChaufferie, onPlacingChaufferieDone, levels, chaufferie, onChaufferieChange,
      connHighlightIds, onConnHighlight])

  // ── mouse up ──────────────────────────────────────────
  const onMouseUp = useCallback(e => {
    setPanSt(null)
    setDragLine(null)
    setDragCol(null)
    setDragCh(null)

    // Commit point drag
    if (ptDragRef.current && ptDragRef.current.moved && ptDragPos) {
      const { ptId } = ptDragRef.current
      const np = { x: ptDragPos.x, y: ptDragPos.y }

      // Priority 1: overlapping another point → merge (productionECS > pump > regular)
      const dragged = points.find(p => p.id === ptId)
      const overlap = points.find(p => p.id !== ptId && dist(p, np) < PT_HIT)
      if (overlap && dragged) {
        const rank = p => p?.type === 'productionECS' ? 2 : p?.type === 'pump' ? 1 : 0
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
        const { newSegs, newPts } = computeSegMove(segDragState.segId, segDragState.subIdx, segDragState.delta, segments, points)
        onNetworkChange(newSegs, newPts)
      }
      setSegDragState(null)
      segDragRef.current = null
    }

    // Commit bloc drag
    if (blockDragRef.current) {
      if (blockDragState && blockDragRef.current.moved) {
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
        points.forEach(p   => { if (ptInRect(p, selRect))  ids.push(p.id) })
        onSelectIds(prev => e.shiftKey ? [...new Set([...prev, ...ids])] : ids)
      }
      setRectSt(null); setSelRect(null)
    }
  }, [rectSt, selRect, segments, points, selectedIds, onSelectIds, ptDragPos, segDragState, blockDragState, onNetworkChange])

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
  const contentW   = Math.max(3000, ((columnXs ?? []).at(-1) ?? 0) + 400)
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
          if (col.isGap) return <g key={col.id} />
          return (
            <g key={col.id} style={{ pointerEvents: 'none' }}>
              <line x1={x1} y1={yTop} x2={x1} y2={yBot} stroke="#d1d9e6" strokeWidth={1} />
              <line x1={x2} y1={yTop} x2={x2} y2={yBot} stroke="#d1d9e6" strokeWidth={1} />
              <text x={(x1 + x2) / 2} y={yTop + 16} fontSize={12} fill="#b8c0cc" fontWeight="600"
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

        {/* Chaufferie */}
        {chaufferie?.enabled && (() => {
          const levelIdx = levels.findIndex(l => l.id === chaufferie.levelId)
          if (levelIdx < 0 || levelIdx >= lineYs.length) return null
          const yBot = lineYs[levelIdx]
          const yTop = yBot - chaufferie.height
          const { x1, x2 } = chaufferie
          const H = 6
          return (
            <g key="chaufferie">
              <rect x={x1} y={yTop} width={x2 - x1} height={chaufferie.height}
                fill="rgba(238,242,255,0.5)" stroke="#818cf8" strokeWidth={1.5}
                style={{ pointerEvents: 'none' }} />
              <text x={(x1 + x2) / 2} y={yTop + 13}
                fontSize={10} fill="#818cf8" fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none', pointerEvents: 'none' }}>Chaufferie</text>
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
        {renderSegs.map(seg => {
          const sel  = selectedIds.includes(seg.id)
          const col  = seg.type === 'retour' ? '#f97316' : '#dc2626'
          const dash = seg.type === 'retour' ? '10,6' : 'none'
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
                const matches = flowVelocityMode === 'flowRate'
                  ? seg.flowRate === flowVelocityValue
                  : seg.velocity === flowVelocityValue
                editStyle = matches ? 'match' : hasAny ? 'other' : 'missing'
              } else {
                editStyle = hasAny ? 'match' : 'missing'
              }
            }
          }

          // connHighlight: highlighted segment → normal color, others → light gray
          const isHighlighted = connHighlightIds?.length > 0 && connHighlightIds.includes(seg.id)
          const isGrayed      = connHighlightIds?.length > 0 && !connHighlightIds.includes(seg.id)

          // match=green · missing=red · other=gray · dash always follows segment type
          const strokeColor = isGrayed      ? '#d1d5db'
            : editStyle === 'match'   ? '#16a34a'
            : editStyle === 'missing' ? '#ef4444'
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
              {seg.showFlowRate && (seg.flowRate != null || seg.velocity != null) && (() => {
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
                const lbl = seg.flowRate != null ? `${seg.flowRate} m³/h` : `${seg.velocity} m/s`
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
              {seg.showName && (() => {
                const label = getDisplayName(seg, renderSegs, levels, lineYs, columns, columnXs, chaufferie, renderPts)
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

        {/* Nœuds */}
        {renderPts.map(pt => {
          const sel     = selectedIds.includes(pt.id)
          const dragged = ptDragPos?.ptId === pt.id
          if (pt.isLocked) {
            return (
              <g key={pt.id} style={{ pointerEvents: 'none' }}>
                <polygon
                  points={`${pt.x},${pt.y - 6} ${pt.x + 6},${pt.y} ${pt.x},${pt.y + 6} ${pt.x - 6},${pt.y}`}
                  fill="#fff7ed" stroke="#94a3b8" strokeWidth={1.5} />
              </g>
            )
          }
          const selClick = ev => {
            ev.stopPropagation()
            onSelectIds(ids => ev.shiftKey
              ? ids.includes(pt.id) ? ids.filter(i => i !== pt.id) : [...ids, pt.id]
              : [pt.id])
          }
          if (pt.type === 'pump') {
            const r = pt.size ?? 15, ts = r / 15
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <circle cx={pt.x} cy={pt.y} r={r + 4} fill="transparent" />
                <g transform={`translate(${pt.x},${pt.y}) rotate(${pt.rotation ?? 180})`} style={{ pointerEvents: 'none' }}>
                  <circle r={r} fill={sel || dragged ? '#dbeafe' : 'rgba(238,242,255,0.97)'} stroke={sel || dragged ? '#2563eb' : '#4f46e5'} strokeWidth={1.5} />
                  <polygon points={`${-6*ts},${-7*ts} ${-6*ts},${7*ts} ${8*ts},0`} fill={sel || dragged ? '#2563eb' : '#4f46e5'} />
                </g>
              </g>
            )
          }
          if (pt.type === 'productionECS') {
            const w = pt.size?.w ?? 44, h = pt.size?.h ?? 28
            const fs = Math.max(6, Math.min(9, h * 0.28))
            const col = sel || dragged ? '#2563eb' : '#4f46e5'
            return (
              <g key={pt.id} style={{ cursor: 'pointer' }} onClick={selClick}>
                <rect x={pt.x - w/2 - 4} y={pt.y - h/2 - 4} width={w + 8} height={h + 8} fill="transparent" />
                <g style={{ pointerEvents: 'none' }}>
                  <rect x={pt.x - w/2} y={pt.y - h/2} width={w} height={h} fill={sel || dragged ? '#dbeafe' : 'rgba(238,242,255,0.97)'} stroke={col} strokeWidth={1.5} rx={3} />
                  <text x={pt.x} y={pt.y - h * 0.15} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>Production</text>
                  <text x={pt.x} y={pt.y + h * 0.28} fontSize={fs} fill={col} fontWeight="700" textAnchor="middle" style={{ userSelect: 'none' }}>ECS</text>
                </g>
              </g>
            )
          }
          return (
            <g key={pt.id}
              style={{ cursor: 'pointer' }}
              onClick={selClick}>
              <rect x={pt.x - PT_R - 6} y={pt.y - PT_R - 6} width={(PT_R + 6) * 2} height={(PT_R + 6) * 2} fill="transparent" />
              <rect x={pt.x - PT_R} y={pt.y - PT_R} width={PT_R * 2} height={PT_R * 2}
                fill={sel || dragged ? '#dbeafe' : '#fff'}
                stroke={sel || dragged ? '#2563eb' : '#374151'} strokeWidth={1.5} />
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
              <rect key={i} x={v.x - 2.5} y={v.y - 2.5} width={5} height={5}
                fill={pipeType === 'retour' ? '#f97316' : '#dc2626'}
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
                fill="rgba(238,242,255,0.5)" stroke="#818cf8" strokeWidth={1.5} strokeDasharray="6,4" />
              <text x={gx1 + w / 2} y={yBot - chaufferie.height + 13}
                fontSize={10} fill="rgba(129,140,248,0.8)" fontWeight="600" textAnchor="middle"
                style={{ userSelect: 'none' }}>Chaufferie</text>
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
          Cliquez pour placer la chaufferie · Échap pour annuler
        </text>
      )}
      {!drawing && (drawMode === 'select' || drawMode === 'errors') && (
        <text x={8} y={18} fontSize={10} fill="#cbd5e1">
          Ctrl+Glisser : déplacer la vue · Glisser sur vide : sélection rect · Shift+Clic : multi-sélection · Suppr : effacer · Ctrl+Z/Y : annuler/rétablir
        </text>
      )}
    </svg>
  )
}
