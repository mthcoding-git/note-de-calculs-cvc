// Constantes de layout des colonnes — partagées avec App.tsx pour les calculs
// de positionnement des groupes et des zones PP.
export const LOCAL_W   = 60
export const LOCAL_GAP = 10

// ── Zone manipulation ────────────────────────────────────────────────────────

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
    if (sg) { const np = { id: mkId(), x: verts[0].x, y: verts[0].y };                          extraPoints.push(np); sId = np.id }
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
export function expandZone(project, xBoundary, delta) {
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

export function removeGapColumn(project, gapIdx) {
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

export function removeRegularColumn(project, idx) {
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
export function moveGaine(project, gapIdx, finalLeft) {
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
export function adjustPPZone(p, colId, newPoints, newSegments) {
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

// Removes a groupe point, its connected segment, and — when the other endpoint of that
// segment sits exactly on a séparation line (a lineY value) — that node and its own
// remaining segment as well (one-hop cascade cleanup).
export function removeGroupeBranch(points, segments, groupePtId, lineYs?: number[]) {
  const SEP_TOL = 2 // px tolerance for matching a lineY coordinate

  const branchSegs   = segments.filter(s => s.startPointId === groupePtId || s.endPointId === groupePtId)
  const branchSegIds = new Set(branchSegs.map(s => s.id))

  // Collect séparation nodes to cascade-delete
  const sepNodeIds = new Set<string>()
  const sepSegIds  = new Set<string>()
  if (lineYs?.length) {
    for (const seg of branchSegs) {
      const neighborId = seg.startPointId === groupePtId ? seg.endPointId : seg.startPointId
      const neighbor   = points.find(p => p.id === neighborId)
      if (!neighbor) continue
      const onSep = lineYs.some(ly => Math.abs(neighbor.y - ly) <= SEP_TOL)
      if (!onSep) continue
      // Node is on a séparation line — also remove it and its remaining segment
      sepNodeIds.add(neighborId)
      const remainingSeg = segments.find(
        s => !branchSegIds.has(s.id) && (s.startPointId === neighborId || s.endPointId === neighborId)
      )
      if (remainingSeg) sepSegIds.add(remainingSeg.id)
    }
  }

  return {
    points:   points.filter(p => p.id !== groupePtId && !sepNodeIds.has(p.id)),
    segments: segments.filter(s => !branchSegIds.has(s.id) && !sepSegIds.has(s.id)),
  }
}
