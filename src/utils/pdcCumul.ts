export interface SegIncoming {
  segId: string
  cumDp: number
}

export interface CumDpResult {
  segCumDp:          Map<string, number>
  nodeCumDp:         Map<string, number>
  nodeIncoming:      Map<string, SegIncoming[]>
  nodePostJunction:  Map<string, boolean>
  segPostJunction:   Map<string, boolean>
  criticalSegIds:    Set<string>    // tous les tronçons du circuit le plus défavorisé
  criticalLeafSegId: string | null  // tronçon retour le plus en amont (identifie la colonne)
  criticalDp:        number | null  // ΔP total du circuit critique
}

/**
 * Calcule les pertes de charge cumulées depuis la production ECS.
 * Suit le sens du fluide (flowDirections) en propagation topologique.
 * Aux jonctions (multiple tronçons entrants), retient le max — circuit le plus défavorisé.
 */
export function computeCumDp(
  segments:       any[],
  points:         any[],
  flowDirections: Map<string, { fromId: string; toId: string }>,
  pdcResults:     Map<string, { dpTotal: number; dpPompe?: number }> | null,
): CumDpResult | null {
  const prodNode = points.find(p => p.type === 'productionECS')
  if (!prodNode) return null

  const nodeCumDp        = new Map<string, number>()
  const nodePostJunction = new Map<string, boolean>()
  const segCumDp         = new Map<string, number>()
  const nodeIncoming     = new Map<string, SegIncoming[]>()

  // Nombre de tronçons entrants par nœud (selon flowDirections)
  const totalIncoming = new Map<string, number>()
  for (const seg of segments) {
    const dir = flowDirections.get(seg.id)
    if (!dir) continue
    totalIncoming.set(dir.toId, (totalIncoming.get(dir.toId) ?? 0) + 1)
  }

  const resolvedIncoming = new Map<string, number>()

  // Amorçage : production ECS à 0, marquée comme déjà résolue (évite l'attente de retours entrants)
  nodeCumDp.set(prodNode.id, 0)
  nodePostJunction.set(prodNode.id, false)
  resolvedIncoming.set(prodNode.id, totalIncoming.get(prodNode.id) ?? 0)

  const queue: string[] = [prodNode.id]
  const queued = new Set<string>([prodNode.id])

  while (queue.length > 0) {
    const nodeId = queue.shift()!
    const cumHere  = nodeCumDp.get(nodeId) ?? 0
    const postHere = nodePostJunction.get(nodeId) ?? false

    for (const seg of segments) {
      const dir = flowDirections.get(seg.id)
      if (!dir || dir.fromId !== nodeId) continue

      const r          = pdcResults?.get(seg.id)
      const dp         = r?.dpPompe ?? r?.dpTotal ?? 0
      const cumAfter   = cumHere + dp
      segCumDp.set(seg.id, cumAfter)

      const toId = dir.toId

      if (!nodeIncoming.has(toId)) nodeIncoming.set(toId, [])
      nodeIncoming.get(toId)!.push({ segId: seg.id, cumDp: cumAfter })

      // Max pour les jonctions
      const prev = nodeCumDp.get(toId)
      nodeCumDp.set(toId, prev == null ? cumAfter : Math.max(prev, cumAfter))

      // Ne pas reboucler sur la production
      if (toId === prodNode.id) continue

      const inCount  = totalIncoming.get(toId) ?? 1
      const resolved = (resolvedIncoming.get(toId) ?? 0) + 1
      resolvedIncoming.set(toId, resolved)

      const isJunction   = inCount > 1
      const toPostJunction = postHere || isJunction
      if (!nodePostJunction.has(toId) || toPostJunction) {
        nodePostJunction.set(toId, toPostJunction)
      }

      if (resolved >= inCount && !queued.has(toId)) {
        queued.add(toId)
        queue.push(toId)
      }
    }
  }

  // Un tronçon est "post-jonction" si son nœud source l'est
  const segPostJunction = new Map<string, boolean>()
  for (const seg of segments) {
    const dir = flowDirections.get(seg.id)
    if (!dir) continue
    segPostJunction.set(seg.id, nodePostJunction.get(dir.fromId) ?? false)
  }

  // ── Chemin critique ────────────────────────────────────────────────────────
  const segTypeMap = new Map<string, string>()
  for (const seg of segments) segTypeMap.set(seg.id, seg.type ?? '')

  // ΔP total du circuit critique = max cumDp des tronçons retour arrivant à l'ECS
  const ecsRetourInc = (nodeIncoming.get(prodNode.id) ?? [])
    .filter(s => segTypeMap.get(s.segId) === 'retour')
  const criticalDp = ecsRetourInc.length > 0
    ? Math.max(...ecsRetourInc.map(s => s.cumDp))
    : null

  // Tracé à rebours depuis l'ECS en suivant les tronçons retour (max cumDp à chaque jonction)
  const criticalRetourIds = new Set<string>()
  let criticalLeafSegId: string | null = null
  let critLeafNode = prodNode.id
  let critCur = prodNode.id

  while (true) {
    const inc = (nodeIncoming.get(critCur) ?? [])
      .filter(s => segTypeMap.get(s.segId) === 'retour')
    if (inc.length === 0) break
    const winner = inc.reduce((best, s) => s.cumDp >= best.cumDp ? s : best, inc[0])
    criticalRetourIds.add(winner.segId)
    criticalLeafSegId = winner.segId
    const dir = flowDirections.get(winner.segId)
    const fromId = dir?.fromId
    if (!fromId || fromId === prodNode.id) break
    critLeafNode = fromId
    critCur = fromId
  }

  // BFS dans le sens aller pour trouver le chemin ECS → critLeafNode
  const criticalAllerIds = new Set<string>()
  if (critLeafNode !== prodNode.id) {
    const allerSegs = segments.filter(s => s.type === 'aller' && flowDirections.has(s.id))
    const parent = new Map<string, string>()
    const visited = new Set<string>([prodNode.id])
    const q: string[] = [prodNode.id]
    let found = false
    outer: while (q.length > 0) {
      const cur = q.shift()!
      for (const seg of allerSegs) {
        const d = flowDirections.get(seg.id)
        if (!d || d.fromId !== cur || visited.has(d.toId)) continue
        parent.set(d.toId, seg.id)
        if (d.toId === critLeafNode) { found = true; break outer }
        visited.add(d.toId)
        q.push(d.toId)
      }
    }
    if (found) {
      let node = critLeafNode
      while (node !== prodNode.id) {
        const sId = parent.get(node)
        if (!sId) break
        criticalAllerIds.add(sId)
        const d = flowDirections.get(sId)
        if (!d) break
        node = d.fromId
      }
    }
  }

  const criticalSegIds = new Set([...criticalRetourIds, ...criticalAllerIds])

  return { segCumDp, nodeCumDp, nodeIncoming, nodePostJunction, segPostJunction,
           criticalSegIds, criticalLeafSegId, criticalDp }
}

export interface CumDpAlimResult {
  segCumDp:         Map<string, number>  // cumulatif total (frottement + statique) en Pa
  segCumDpFriction: Map<string, number>  // cumulatif frottement seul en Pa
  segDpStatic:      Map<string, number>  // ΔP hauteur du tronçon en Pa
  segDeltaH:        Map<string, number>  // Δh du tronçon en m
  segCoteAmont:     Map<string, number>  // cote nœud amont (m)
  segCoteAval:      Map<string, number>  // cote nœud aval (m)
  segPressionAval:  Map<string, number>  // pression disponible aval en Pa
  segPStatAval:     Map<string, number>  // pression statique aval en Pa (DTU ≤ 4 bar)
  criticalDp:       number | null
  criticalSegIds:   Set<string>
}

/**
 * Calcule les pertes de charge cumulées pour le réseau Alimentation ECS (arbre, sans retour).
 * Depuis la production ECS avec la pression source disponible, propage le long des tronçons aller.
 * Intègre les pertes de charge statiques : ΔP_stat = ρ × g × Δh.
 * Retourne la pression résiduelle aval de chaque tronçon et le circuit le plus défavorisé.
 */
export function computeCumDpAlim(
  segments:         any[],
  points:           any[],
  flowDirections:   Map<string, { fromId: string; toId: string }>,
  pdcResults:       Map<string, { dpTotal: number }> | null,
  pressionSource:   number,
  nodeCotes:        Map<string, number> = new Map(),
  rho:              number = 980,
  sourceNodeType:   string = 'productionECS',
): CumDpAlimResult | null {
  const prodNode = points.find(p => p.type === sourceNodeType)
  if (!prodNode) return null

  const coteSource         = nodeCotes.get(prodNode.id) ?? 0
  const allerSegs          = segments.filter(s => s.type === 'aller')
  const nodePression       = new Map<string, number>()
  const nodeCumDpFriction  = new Map<string, number>()
  const segCumDp           = new Map<string, number>()
  const segCumDpFriction   = new Map<string, number>()
  const segDpStatic        = new Map<string, number>()
  const segDeltaH          = new Map<string, number>()
  const segCoteAmont       = new Map<string, number>()
  const segCoteAval        = new Map<string, number>()
  const segPressionAval    = new Map<string, number>()
  const segPStatAval       = new Map<string, number>()

  nodePression.set(prodNode.id, pressionSource)
  nodeCumDpFriction.set(prodNode.id, 0)

  const queue: string[] = [prodNode.id]
  const queued = new Set<string>([prodNode.id])

  while (queue.length > 0) {
    const nodeId             = queue.shift()!
    const presHere           = nodePression.get(nodeId) ?? pressionSource
    const cumDpHere          = pressionSource - presHere
    const cumDpFrictionHere  = nodeCumDpFriction.get(nodeId) ?? 0

    for (const seg of allerSegs) {
      const dir = flowDirections.get(seg.id)
      if (!dir || dir.fromId !== nodeId) continue

      const deltaH             = (nodeCotes.get(dir.toId) ?? 0) - (nodeCotes.get(nodeId) ?? 0)
      const dpStatic           = rho * 9.81 * deltaH
      const dpFric             = pdcResults?.get(seg.id)?.dpTotal ?? 0
      const cumDpAfter         = cumDpHere + dpFric + dpStatic
      const cumDpFrictionAfter = cumDpFrictionHere + dpFric
      const presAval           = pressionSource - cumDpAfter

      const coteAval = nodeCotes.get(dir.toId) ?? 0
      const pStatAval = pressionSource - rho * 9.81 * (coteAval - coteSource)

      segCumDp.set(seg.id, cumDpAfter)
      segCumDpFriction.set(seg.id, cumDpFrictionAfter)
      segDpStatic.set(seg.id, dpStatic)
      segDeltaH.set(seg.id, deltaH)
      segCoteAmont.set(seg.id, nodeCotes.get(nodeId) ?? 0)
      segCoteAval.set(seg.id, coteAval)
      segPressionAval.set(seg.id, presAval)
      segPStatAval.set(seg.id, pStatAval)

      const toId = dir.toId
      if (!queued.has(toId)) {
        nodePression.set(toId, presAval)
        nodeCumDpFriction.set(toId, cumDpFrictionAfter)
        queued.add(toId)
        queue.push(toId)
      }
    }
  }

  // Tronçons retour : hauteur statique et pression statique aval
  const retourSegs = segments.filter(s => s.type === 'retour')
  for (const seg of retourSegs) {
    const dir = flowDirections.get(seg.id)
    if (!dir) continue
    const coteAmont = nodeCotes.get(dir.fromId) ?? 0
    const coteAval  = nodeCotes.get(dir.toId)   ?? 0
    const deltaH    = coteAval - coteAmont
    const dpStat    = rho * 9.81 * deltaH
    segDeltaH.set(seg.id, deltaH)
    segDpStatic.set(seg.id, dpStat)
    segCoteAmont.set(seg.id, coteAmont)
    segCoteAval.set(seg.id, coteAval)
    segPStatAval.set(seg.id, pressionSource - rho * 9.81 * (coteAval - coteSource))
  }

  // Nœuds terminaux (sans tronçon aller sortant)
  const hasOut = new Set<string>()
  for (const seg of allerSegs) {
    const dir = flowDirections.get(seg.id)
    if (dir) hasOut.add(dir.fromId)
  }

  let minPression: number | null = null
  let critEndNode: string | null = null

  for (const [nodeId, pres] of nodePression) {
    if (nodeId === prodNode.id || hasOut.has(nodeId)) continue
    if (minPression === null || pres < minPression) {
      minPression = pres
      critEndNode = nodeId
    }
  }

  // Tracé à rebours du chemin critique (réseau en arbre → un seul parent par nœud)
  const parentSeg = new Map<string, string>()
  for (const seg of allerSegs) {
    const dir = flowDirections.get(seg.id)
    if (dir) parentSeg.set(dir.toId, seg.id)
  }

  const criticalSegIds = new Set<string>()
  if (critEndNode) {
    let cur = critEndNode
    while (cur !== prodNode.id) {
      const segId = parentSeg.get(cur)
      if (!segId) break
      criticalSegIds.add(segId)
      const dir = flowDirections.get(segId)
      if (!dir) break
      cur = dir.fromId
    }
  }

  const criticalDp = minPression !== null ? pressionSource - minPression : null

  return { segCumDp, segCumDpFriction, segDpStatic, segDeltaH, segCoteAmont, segCoteAval, segPressionAval, segPStatAval, criticalDp, criticalSegIds }
}
