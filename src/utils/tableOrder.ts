
/**
 * Construit les lignes dans l'ordre de l'écoulement par DFS aller+retour couplés.
 *
 * Deux parcours DFS symétriques depuis Production ECS :
 *   – Aller  : suit le flux (flowDir.fromId → toId)
 *   – Retour : part à rebours du flux (flowDir.toId → fromId), même direction topologique
 *              "vers l'extérieur", sans supposer que les nœuds aller et retour soient partagés.
 *
 * À chaque séparation :
 *   – un marqueur 'separation' est inséré
 *   – les branches sont triées par |x − ecsX| croissant et couplées par rang
 *   – un 'col-header' est inséré avant la première branche qui traverse une colonne
 *     (le col-header englobe le tronçon de liaison + les tronçons de la colonne)
 *
 * Le tronçon retour directement connecté à Production ECS est placé APRÈS 'flow-end'.
 *
 * Retour kinds: 'flow-start'|'flow-end'|'col-header'|'separation'|'segment'(+segType)|'junction'
 */
// ── Vérifie si au moins un tronçon retour est accessible en aval depuis startNodeId ──
function hasRetourDownstream(startNodeId, allerSegs, retourSegs, flowDirections) {
  const visited = new Set()
  const queue = [startNodeId]
  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    for (const seg of retourSegs) {
      const d = flowDirections.get(seg.id)
      if (d?.fromId === nodeId) return true
    }
    for (const seg of allerSegs) {
      const d = flowDirections.get(seg.id)
      if (d?.fromId === nodeId && !visited.has(d.toId)) queue.push(d.toId)
    }
  }
  return false
}

export function buildFlowRows(segments, points, flowDirections, columns, columnXs, levels, lineYs, activeCalcId) {
  if (!segments?.length) return []
  const prodECS = points?.find(p => p.type === 'productionECS')
  if (!prodECS) return []

  const allerSegs  = segments.filter(s => s.type === 'aller')
  const retourSegs = segments.filter(s => s.type === 'retour')

  // Pré-calcul : segments aller possédant un retour accessible en aval
  // (utilisé pour le filtre tirage ET la détection collecteur)
  const allerHasRetour = new Set()
  for (const seg of allerSegs) {
    const fd = flowDirections.get(seg.id)
    if (fd && hasRetourDownstream(fd.toId, allerSegs, retourSegs, flowDirections)) {
      allerHasRetour.add(seg.id)
    }
  }

  const visitedAller  = new Set()
  const visitedRetour = new Set()

  // ── Colonne d'un point ────────────────────────────────────────────────────
  const getColFor = (ptId) => {
    const pt = points?.find(p => p.id === ptId)
    if (!pt) return null
    let levelId = null
    for (let i = 0; i < (levels?.length ?? 0); i++) {
      const yBot = lineYs?.[i], yTop = lineYs?.[i + 1]
      if (yTop == null) continue
      if (pt.y > yTop && pt.y <= yBot) { levelId = levels[i].id; break }
    }
    for (let i = 0; i < (columns?.length ?? 0); i++) {
      const cx1 = columnXs?.[i], cx2 = columnXs?.[i + 1]
      if (cx1 == null || cx2 == null) continue
      const col = columns[i]
      if (col.isGap) continue
      if (pt.x < cx1 || pt.x > cx2) continue
      const covers = col.levelIds === 'all' ||
        (Array.isArray(col.levelIds) && levelId && col.levelIds.includes(levelId))
      if (covers) return col.name
    }
    return null
  }

  const segColName = (seg) => {
    const fd = flowDirections.get(seg.id)
    const fc = getColFor(fd?.fromId ?? seg.startPointId)
    const tc = getColFor(fd?.toId   ?? seg.endPointId)
    return (fc && fc === tc) ? fc : null
  }

  // ── Primitives de parcours ────────────────────────────────────────────────
  const getOutgoingAller = (nodeId) =>
    allerSegs.filter(s => {
      const d = flowDirections.get(s.id)
      return d?.fromId === nodeId && !visitedAller.has(s.id)
    })

  const getOutwardRetour = (nodeId) =>
    retourSegs.filter(s => {
      const d = flowDirections.get(s.id)
      return d?.toId === nodeId && !visitedRetour.has(s.id)
    })

  const xDist = (nodeId) => {
    const pt = points.find(p => p.id === nodeId)
    return pt ? Math.abs(pt.x - prodECS.x) : Infinity
  }

  const sortAller  = (segs) => [...segs].sort((a, b) =>
    xDist(flowDirections.get(a.id)?.toId) - xDist(flowDirections.get(b.id)?.toId))

  const sortRetour = (segs) => [...segs].sort((a, b) =>
    xDist(flowDirections.get(a.id)?.fromId) - xDist(flowDirections.get(b.id)?.fromId))

  // Cherche la première colonne dans la série aller à partir de aSeg (look-ahead sans marquer).
  const findBranchColumn = (aSeg) => {
    let col = segColName(aSeg)
    if (col) return col
    let cur = flowDirections.get(aSeg.id)?.toId
    const tempVis = new Set()
    while (cur) {
      const out = allerSegs.filter(s => {
        const d = flowDirections.get(s.id)
        return d?.fromId === cur && !visitedAller.has(s.id) && !tempVis.has(s.id)
      })
      if (out.length !== 1) break
      const s = out[0]; tempVis.add(s.id)
      col = segColName(s)
      if (col) return col
      cur = flowDirections.get(s.id).toId
    }
    return null
  }

  // Prédicats de topologie (ignorent l'état visited — lecture de structure uniquement)
  // Ne compte que les branches aller avec retour en aval (exclut les tirages)
  const leadsToSeparation = (nodeId) => {
    let cur = nodeId
    const tempSeen = new Set()
    while (!tempSeen.has(cur)) {
      tempSeen.add(cur)
      const out = allerSegs.filter(s => flowDirections.get(s.id)?.fromId === cur && allerHasRetour.has(s.id))
      if (out.length > 1) return true
      if (out.length === 0) return false
      cur = flowDirections.get(out[0].id).toId
    }
    return false
  }

  const retourLeadsFromJunction = (nodeId) => {
    let cur = nodeId
    const tempSeen = new Set()
    while (!tempSeen.has(cur)) {
      tempSeen.add(cur)
      const inc = retourSegs.filter(s => flowDirections.get(s.id)?.toId === cur)
      if (inc.length > 1) return true
      if (inc.length === 0) return false
      cur = flowDirections.get(inc[0].id).fromId
    }
    return false
  }

  // ── DFS couplé ────────────────────────────────────────────────────────────
  const dfs = (allerNode, retourNode) => {
    const rows = []

    // Série aller (1 sortant à chaque pas)
    const allerSeries = []
    let aCur = allerNode
    while (true) {
      const out = getOutgoingAller(aCur)
      if (out.length !== 1) break
      const seg = out[0]; visitedAller.add(seg.id)
      allerSeries.push({ seg, toId: flowDirections.get(seg.id).toId })
      aCur = flowDirections.get(seg.id).toId
    }

    // Série retour à rebours (1 "sortant outward" à chaque pas)
    const retourSeries = []
    let rCur = retourNode
    while (true) {
      const inc = getOutwardRetour(rCur)
      if (inc.length !== 1) break
      const seg = inc[0]; visitedRetour.add(seg.id)
      retourSeries.push(seg)
      rCur = flowDirections.get(seg.id).fromId
    }

    const aBranches = getOutgoingAller(aCur)
    const rBranches = getOutwardRetour(rCur)

    const allerCollecteur = aBranches.filter(s => allerHasRetour.has(s.id)).length > 1 ? 'aller' : undefined
    const retourCollecteur = rBranches.length > 1 ? 'retour' : undefined

    for (const { seg } of allerSeries) {
      rows.push({ kind: 'segment', seg, depth: 0, segType: 'aller', collecteur: allerCollecteur })
    }

    if (aBranches.length > 1) {
      rows.push({ kind: 'separation', ptId: aCur, branchCount: aBranches.length })

      const sortedA = sortAller(aBranches)
      const sortedR = sortRetour(rBranches)

      for (let i = 0; i < sortedA.length; i++) {
        const aSeg = sortedA[i]
        const rSeg = sortedR[i]

        // En-tête de colonne : englobe le tronçon de liaison + les tronçons de la colonne
        const branchCol = findBranchColumn(aSeg)
        if (branchCol) rows.push({ kind: 'col-header', name: branchCol })

        visitedAller.add(aSeg.id)
        const aNext = flowDirections.get(aSeg.id).toId
        rows.push({ kind: 'segment', seg: aSeg, depth: 0, segType: 'aller', collecteur: leadsToSeparation(aNext) ? 'aller' : undefined })

        let rNext = null
        if (rSeg) { visitedRetour.add(rSeg.id); rNext = flowDirections.get(rSeg.id).fromId }

        rows.push(...dfs(aNext, rNext ?? aNext))

        if (rSeg) rows.push({ kind: 'segment', seg: rSeg, depth: 0, segType: 'retour', collecteur: retourLeadsFromJunction(flowDirections.get(rSeg.id).fromId) ? 'retour' : undefined })
      }

      if (rBranches.length > 1) {
        rows.push({ kind: 'junction', ptId: rCur, depth: 0, incomingCount: rBranches.length })
      }
    }

    for (let i = retourSeries.length - 1; i >= 0; i--) {
      rows.push({ kind: 'segment', seg: retourSeries[i], depth: 0, segType: 'retour', collecteur: retourCollecteur })
    }

    return rows
  }

  // ── Entrée depuis Production ECS ─────────────────────────────────────────
  const contentRows = []
  const toProdRows  = []  // tronçons retour directement vers ECS → après flow-end

  const aBranchesECS = getOutgoingAller(prodECS.id)
  const rBranchesECS = getOutwardRetour(prodECS.id)

  // Marquer tous les retours vers ECS comme visités dès le départ
  for (const s of rBranchesECS) {
    visitedRetour.add(s.id)
    const fromNode = flowDirections.get(s.id).fromId
    const isCollecteurRetour = retourLeadsFromJunction(fromNode)
    toProdRows.push({ kind: 'segment', seg: s, depth: 0, segType: 'retour', collecteur: isCollecteurRetour ? 'retour' : undefined })
  }

  if (aBranchesECS.length === 1) {
    const aSeg = aBranchesECS[0]; visitedAller.add(aSeg.id)
    const aNext = flowDirections.get(aSeg.id).toId
    // rNext = nœud côté réseau du (premier) retour vers ECS
    const rNext = rBranchesECS[0] ? flowDirections.get(rBranchesECS[0].id).fromId : aNext
    const isCollecteurAller = leadsToSeparation(aNext)
    contentRows.push({ kind: 'segment', seg: aSeg, depth: 0, segType: 'aller', collecteur: isCollecteurAller ? 'aller' : undefined })
    contentRows.push(...dfs(aNext, rNext))
  } else if (aBranchesECS.length > 1) {
    contentRows.push({ kind: 'separation', ptId: prodECS.id, branchCount: aBranchesECS.length })
    const sortedA = sortAller(aBranchesECS)
    // rBranchesECS déjà visités ; on utilise leurs fromId pour le DFS retour
    const sortedRFromIds = sortRetour(rBranchesECS).map(s => flowDirections.get(s.id).fromId)
    for (let i = 0; i < sortedA.length; i++) {
      const aSeg = sortedA[i]; visitedAller.add(aSeg.id)
      const aNext = flowDirections.get(aSeg.id).toId
      const rNext = sortedRFromIds[i] ?? aNext
      const branchCol = findBranchColumn(aSeg)
      if (branchCol) contentRows.push({ kind: 'col-header', name: branchCol })
      contentRows.push({ kind: 'segment', seg: aSeg, depth: 0, segType: 'aller', collecteur: leadsToSeparation(aNext) ? 'aller' : undefined })
      contentRows.push(...dfs(aNext, rNext))
    }
    if (rBranchesECS.length > 1) {
      contentRows.push({ kind: 'junction', ptId: prodECS.id, depth: 0, incomingCount: rBranchesECS.length })
    }
  }

  // Orphelins
  for (const seg of segments) {
    if (!visitedAller.has(seg.id) && !visitedRetour.has(seg.id)) {
      contentRows.push({ kind: 'segment', seg, depth: 0, segType: seg.type })
    }
  }

  let finalRows = [{ kind: 'flow-start' }, ...contentRows, { kind: 'flow-end' }, ...toProdRows]

  // ── Bouclage + Alimentation : exclure les tronçons aller sans retour en aval (tirages) ──
  if (activeCalcId === 'bouclage-ecs' || activeCalcId === 'alimentation-ecs') {
    finalRows = finalRows.filter(row => {
      if (row.kind !== 'segment' || row.segType !== 'aller') return true
      return allerHasRetour.has(row.seg.id)
    })

    // En alimentation : retirer aussi les tronçons retour et les jonctions
    if (activeCalcId === 'alimentation-ecs') {
      finalRows = finalRows.filter(row => {
        if (row.kind === 'segment' && row.segType === 'retour') return false
        if (row.kind === 'junction') return false
        return true
      })
    }

    // Retirer les col-headers orphelins (non immédiatement suivis d'un segment)
    finalRows = finalRows.filter((row, i) => {
      if (row.kind !== 'col-header') return true
      return finalRows[i + 1]?.kind === 'segment'
    })
  }

  const roleMap = new Map()
  for (const row of finalRows) {
    if (row.kind === 'segment') {
      roleMap.set(row.seg.id,
        row.collecteur === 'aller'  ? 'collecteur-aller'  :
        row.collecteur === 'retour' ? 'collecteur-retour' :
        row.segType === 'retour'    ? 'retour' : 'aller')
    }
  }

  return { rows: finalRows, roleMap }
}

/**
 * Construit les lignes de tableau pour le mode Alimentation EF.
 * Retourne un tableau : une entrée par arrivée EF → { sourceId, rows, roleMap }.
 * Chaque tronçon n'apparaît que dans le tableau de la source la plus proche.
 */
export function buildFlowRowsEF(segments, points, flowDirections, columns, columnXs, levels, lineYs) {
  const sources = points.filter(p => p.type === 'arriveeEF')
  if (!sources.length) return []

  const allerSegs = segments.filter(s => s.type === 'aller' && flowDirections.get(s.id) != null)
  const globalVisited = new Set()

  const getColFor = (ptId) => {
    const pt = points?.find(p => p.id === ptId)
    if (!pt) return null
    let levelId = null
    for (let i = 0; i < (levels?.length ?? 0); i++) {
      const yBot = lineYs?.[i], yTop = lineYs?.[i + 1]
      if (yTop == null) continue
      if (pt.y > yTop && pt.y <= yBot) { levelId = levels[i].id; break }
    }
    for (let i = 0; i < (columns?.length ?? 0); i++) {
      const cx1 = columnXs?.[i], cx2 = columnXs?.[i + 1]
      if (cx1 == null || cx2 == null) continue
      const col = columns[i]
      if (col.isGap) continue
      if (pt.x < cx1 || pt.x > cx2) continue
      const covers = col.levelIds === 'all' ||
        (Array.isArray(col.levelIds) && levelId && col.levelIds.includes(levelId))
      if (covers) return col.name
    }
    return null
  }

  const segColName = (seg) => {
    const fd = flowDirections.get(seg.id)
    const fc = getColFor(fd?.fromId ?? seg.startPointId)
    const tc = getColFor(fd?.toId   ?? seg.endPointId)
    return (fc && fc === tc) ? fc : null
  }

  const buildSourceRows = (srcId) => {
    const srcPt = points.find(p => p.id === srcId)
    const visitedLocal = new Set()

    const getOutgoing = (nodeId) =>
      allerSegs.filter(s => {
        const d = flowDirections.get(s.id)
        return d?.fromId === nodeId && !globalVisited.has(s.id) && !visitedLocal.has(s.id)
      })

    const xDist = (nodeId) => {
      const pt = points.find(p => p.id === nodeId)
      return pt && srcPt ? Math.abs(pt.x - srcPt.x) : Infinity
    }

    const sortSegs = (segs) => [...segs].sort((a, b) =>
      xDist(flowDirections.get(a.id)?.toId) - xDist(flowDirections.get(b.id)?.toId))

    const findBranchColumn = (aSeg) => {
      let col = segColName(aSeg)
      if (col) return col
      let cur = flowDirections.get(aSeg.id)?.toId
      const tempVis = new Set()
      while (cur) {
        const out = allerSegs.filter(s => {
          const d = flowDirections.get(s.id)
          return d?.fromId === cur && !globalVisited.has(s.id) && !visitedLocal.has(s.id) && !tempVis.has(s.id)
        })
        if (out.length !== 1) break
        const s = out[0]; tempVis.add(s.id)
        col = segColName(s)
        if (col) return col
        cur = flowDirections.get(s.id).toId
      }
      return null
    }

    const dfs = (nodeId) => {
      const rows = []
      const series = []
      let cur = nodeId
      while (true) {
        const out = getOutgoing(cur)
        if (out.length !== 1) break
        const seg = out[0]
        visitedLocal.add(seg.id)
        series.push(seg)
        cur = flowDirections.get(seg.id).toId
      }
      for (const seg of series) {
        rows.push({ kind: 'segment', seg, depth: 0, segType: 'aller' })
      }
      const branches = getOutgoing(cur)
      if (branches.length > 1) {
        rows.push({ kind: 'separation', ptId: cur, branchCount: branches.length })
        for (const seg of sortSegs(branches)) {
          visitedLocal.add(seg.id)
          const branchCol = findBranchColumn(seg)
          if (branchCol) rows.push({ kind: 'col-header', name: branchCol })
          rows.push({ kind: 'segment', seg, depth: 0, segType: 'aller' })
          rows.push(...dfs(flowDirections.get(seg.id).toId))
        }
      }
      return rows
    }

    const contentRows = dfs(srcId)
    for (const row of contentRows) {
      if (row.kind === 'segment') globalVisited.add(row.seg.id)
    }

    let rows = [{ kind: 'flow-start' }, ...contentRows, { kind: 'flow-end' }]
    rows = rows.filter((row, i) => {
      if (row.kind !== 'col-header') return true
      return rows[i + 1]?.kind === 'segment'
    })

    const roleMap = new Map()
    for (const row of rows) {
      if (row.kind === 'segment') roleMap.set(row.seg.id, 'aller')
    }
    return { rows, roleMap }
  }

  const result = sources.map(src => ({ sourceId: src.id, ...buildSourceRows(src.id) }))

  // Orphans non réclamés → premier tableau
  const orphans = allerSegs.filter(s => !globalVisited.has(s.id))
  if (orphans.length > 0 && result.length > 0) {
    const orphanRows = orphans.map(seg => ({ kind: 'segment', seg, depth: 0, segType: 'aller' }))
    result[0].rows.push(...orphanRows)
    for (const seg of orphans) result[0].roleMap.set(seg.id, 'aller')
  }

  return result
}
