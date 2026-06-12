export interface SegIncoming {
  segId: string
  cumDp: number
}

export interface CumDpResult {
  segCumDp:         Map<string, number>
  nodeCumDp:        Map<string, number>
  nodeIncoming:     Map<string, SegIncoming[]>
  nodePostJunction: Map<string, boolean>
  segPostJunction:  Map<string, boolean>
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
  pdcResults:     Map<string, { dpTotal: number }> | null,
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

      const dp         = pdcResults?.get(seg.id)?.dpTotal ?? 0
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

  return { segCumDp, nodeCumDp, nodeIncoming, nodePostJunction, segPostJunction }
}
