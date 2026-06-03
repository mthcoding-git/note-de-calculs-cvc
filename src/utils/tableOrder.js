
/**
 * Construit l'ordre d'affichage des tronçons dans les tableaux de résultats.
 * BFS depuis la Production ECS :
 *  - Aller  : suit le sens d'écoulement (fromId → toId)
 *  - Retour : remonte contre le flux depuis la Production ECS (toId → fromId)
 *             insère une ligne de nœud de jonction quand plusieurs retours convergent
 */
export function buildTableRows(segments, points, flowDirections) {
  const prodECS = points.find(p => p.type === 'productionECS')
  if (!prodECS) return { allerRows: [], retourRows: [] }

  const allerSegs  = segments.filter(s => s.type === 'aller')
  const retourSegs = segments.filter(s => s.type === 'retour')

  // ── Aller : BFS en suivant le flux ──────────────────────────────────────
  const allerRows    = []
  const allerVisited = new Set()

  const walkAller = (ptId, depth) => {
    const nexts = allerSegs.filter(s => {
      const d = flowDirections.get(s.id)
      return d && d.fromId === ptId && !allerVisited.has(s.id)
    })
    for (const seg of nexts) {
      allerVisited.add(seg.id)
      allerRows.push({ kind: 'segment', seg, depth })
      walkAller(flowDirections.get(seg.id).toId, depth + 1)
    }
  }
  walkAller(prodECS.id, 0)

  for (const seg of allerSegs) {
    if (!allerVisited.has(seg.id)) allerRows.push({ kind: 'segment', seg, depth: 0 })
  }

  // ── Retour : BFS à rebours depuis la Production ECS ─────────────────────
  const retourRows    = []
  const retourVisited = new Set()

  const walkRetour = (ptId, depth) => {
    const nexts = retourSegs.filter(s => {
      const d = flowDirections.get(s.id)
      return d && d.toId === ptId && !retourVisited.has(s.id)
    })
    if (nexts.length > 1) {
      retourRows.push({ kind: 'junction', ptId, depth, incomingCount: nexts.length })
    }
    for (const seg of nexts) {
      retourVisited.add(seg.id)
      retourRows.push({ kind: 'segment', seg, depth: nexts.length > 1 ? depth + 1 : depth })
      walkRetour(flowDirections.get(seg.id).fromId, (nexts.length > 1 ? depth + 1 : depth) + 1)
    }
  }
  walkRetour(prodECS.id, 0)

  for (const seg of retourSegs) {
    if (!retourVisited.has(seg.id)) retourRows.push({ kind: 'segment', seg, depth: 0 })
  }

  return { allerRows, retourRows }
}

/**
 * Construit les lignes dans l'ordre de l'écoulement, groupées par colonne.
 * Classification basée sur la topologie (positions, flowDirections, connectivité)
 * — indépendante des noms de tronçons.
 *
 * Retour kinds: 'flow-start' | 'flow-end' | 'col-header' | 'segment' (+segType) | 'junction'
 */
export function buildFlowRows(segments, points, flowDirections, columns, columnXs, levels, lineYs, chaufferie) {
  if (!segments?.length) return []
  const prodECS = points?.find(p => p.type === 'productionECS')
  if (!prodECS) return []

  const colNameSet = new Set(columns?.filter(c => !c.isGap).map(c => c.name) ?? [])

  // Retourne le nom de la colonne contenant ce point, ou null.
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

  const classify = (seg) => {
    const fd      = flowDirections?.get(seg.id)
    const fromId  = fd?.fromId ?? seg.startPointId
    const toId    = fd?.toId   ?? seg.endPointId
    const fromCol = getColFor(fromId)
    const toCol   = getColFor(toId)
    if (seg.type === 'aller') {
      if (fromId === prodECS.id)           return { kind: 'from-prod-ecs' }
      if (fromCol && fromCol === toCol)    return { kind: 'col-member', col: fromCol }
      if (toCol && !fromCol)               return { kind: 'into-col',   col: toCol }
    } else {
      if (toId === prodECS.id)             return { kind: 'to-prod-ecs' }
      if (fromCol && fromCol === toCol)    return { kind: 'col-member', col: fromCol }
      if (fromCol && !toCol)               return { kind: 'from-col',   col: fromCol }
    }
    return { kind: 'other' }
  }

  // Ordre des colonnes d'après le BFS aller
  const { allerRows, retourRows } = buildTableRows(segments, points, flowDirections)
  const seenCols = new Set()
  const colOrder = []
  for (const row of allerRows) {
    if (row.kind !== 'segment') continue
    const c = classify(row.seg)
    if ((c.kind === 'col-member' || c.kind === 'into-col') && c.col && !seenCols.has(c.col)) {
      seenCols.add(c.col); colOrder.push(c.col)
    }
  }
  for (const col of colNameSet) {
    if (!seenCols.has(col)) { seenCols.add(col); colOrder.push(col) }
  }

  // Buckets
  const fromProdRows = []
  const toProdRows   = []
  const intoColBkts  = new Map(colOrder.map(c => [c, []]))
  const memberBkts   = new Map(colOrder.map(c => [c, []]))
  const fromColBkts  = new Map(colOrder.map(c => [c, []]))
  const otherRows    = []
  const used         = new Set()

  const pushRow = (seg, segType) => {
    if (used.has(seg.id)) return
    used.add(seg.id)
    const c = classify(seg)
    const r = { kind: 'segment', seg, depth: 0, segType }
    if      (c.kind === 'from-prod-ecs') fromProdRows.push(r)
    else if (c.kind === 'to-prod-ecs')   toProdRows.push(r)
    else if (c.kind === 'col-member')    (memberBkts.get(c.col)  ?? otherRows).push(r)
    else if (c.kind === 'into-col')      (intoColBkts.get(c.col) ?? otherRows).push(r)
    else if (c.kind === 'from-col')      (fromColBkts.get(c.col) ?? otherRows).push(r)
    else                                 otherRows.push(r)
  }

  for (const row of allerRows) {
    if (row.kind === 'segment') pushRow(row.seg, 'aller')
  }
  const retourSegRows = retourRows.filter(r => r.kind === 'segment')
  for (let i = retourSegRows.length - 1; i >= 0; i--) {
    pushRow(retourSegRows[i].seg, 'retour')
  }
  for (const seg of segments) {
    if (!used.has(seg.id)) pushRow(seg, seg.type)
  }

  // ── Post-traitement : chaînage des segments de continuation ──────────────
  // Compte les arrivées retour par point (pour détecter les jonctions)
  const retourArrivals = new Map()
  for (const seg of segments) {
    if (seg.type !== 'retour') continue
    const d = flowDirections.get(seg.id)
    if (d?.toId != null) retourArrivals.set(d.toId, (retourArrivals.get(d.toId) ?? 0) + 1)
  }

  const junctionsShown = new Set()

  // Chaînage inter-colonne : pour chaque segment from-col, cherche un successeur immédiat
  // dans un autre bucket (fromId du successeur = toId du segment courant).
  for (const colX of colOrder) {
    const arr = fromColBkts.get(colX)
    if (!arr) continue
    let i = 0
    while (i < arr.length) {
      const row = arr[i]
      if (row.kind === 'segment') {
        const toId = flowDirections.get(row.seg.id)?.toId
        if (toId != null) {
          let contRow = null, srcArr = null, srcIdx = -1
          outer: for (const colY of colOrder) {
            if (colY === colX) continue
            for (const bkt of [fromColBkts.get(colY), memberBkts.get(colY)]) {
              if (!bkt) continue
              const idx = bkt.findIndex(
                r => r.kind === 'segment' && flowDirections.get(r.seg.id)?.fromId === toId
              )
              if (idx !== -1) { contRow = bkt[idx]; srcArr = bkt; srcIdx = idx; break outer }
            }
          }
          if (contRow) {
            srcArr.splice(srcIdx, 1)
            const inserts = []
            const cnt = retourArrivals.get(toId) ?? 0
            if (cnt > 1 && !junctionsShown.has(toId)) {
              junctionsShown.add(toId)
              inserts.push({ kind: 'junction', ptId: toId, depth: 0, incomingCount: cnt })
            }
            inserts.push(contRow)
            arr.splice(i + 1, 0, ...inserts)
          }
        }
      }
      i++
    }
  }

  // Jonctions intra-colonne : pour tout segment retour dont le fromId a plusieurs arrivées
  // et n'a pas encore été inséré, ajouter la ligne de jonction juste avant ce segment.
  for (const col of colOrder) {
    for (const bkt of [memberBkts.get(col), fromColBkts.get(col)]) {
      if (!bkt) continue
      let j = 0
      while (j < bkt.length) {
        const row = bkt[j]
        if (row.kind === 'segment' && row.segType === 'retour') {
          const fromId = flowDirections.get(row.seg.id)?.fromId
          const cnt    = fromId ? (retourArrivals.get(fromId) ?? 0) : 0
          if (fromId && cnt > 1 && !junctionsShown.has(fromId)) {
            junctionsShown.add(fromId)
            bkt.splice(j, 0, { kind: 'junction', ptId: fromId, depth: 0, incomingCount: cnt })
            j++ // sauter la ligne de jonction qu'on vient d'insérer
          }
        }
        j++
      }
    }
  }

  // Assemblage
  const result = [{ kind: 'flow-start' }]
  result.push(...fromProdRows)
  for (const col of colOrder) {
    const into   = intoColBkts.get(col)  || []
    const member = memberBkts.get(col)   || []
    const from   = fromColBkts.get(col)  || []
    if (!into.length && !member.length && !from.length) continue
    result.push({ kind: 'col-header', name: col })
    result.push(...into)
    result.push(...member)
    result.push(...from)
  }
  result.push(...otherRows)
  result.push({ kind: 'flow-end' })
  result.push(...toProdRows)
  return result
}
