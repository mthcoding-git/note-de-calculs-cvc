export interface ValveKvResult {
  kv:          number | null  // Kv recommandé (null si grand ouvert)
  dpVanne:     number         // ΔP que cette vanne absorbe (Pa), divisé par nValves si plusieurs en série
  dpTotal:     number         // ΔP total de la branche à absorber (Pa)
  branchDp:    number         // ΔP cumulé de la branche jusqu'à la jonction locale (Pa)
  referenceDp: number         // ΔP de référence = nodeCumDp[jonction] (Pa)
  isCritical:  boolean        // branche dominante à la jonction → grand ouvert
  nValves:     number         // vannes en série sur cette branche
  Q:           number | null  // débit du tronçon porteur (m³/h)
}

/**
 * Pour chaque vanne, calcule le Kv nécessaire pour équilibrer sa branche
 * à sa jonction aval la plus proche.
 *
 * Principe : à chaque jonction, le ΔP de référence = max des branches arrivantes
 * (nodeCumDp). La vanne absorbe l'écart entre ce max et le ΔP de sa branche.
 * Si plusieurs vannes sur la même branche, le ΔP est réparti équitablement.
 */
export function computeValveKvs(
  valves:         any[],
  segments:       any[],
  points:         any[],
  flowDirections: Map<string, { fromId: string; toId: string }>,
  pdcCumResults:  {
    segCumDp:    Map<string, number>
    nodeCumDp:   Map<string, number>
    nodeIncoming: Map<string, { segId: string; cumDp: number }[]>
  } | null,
  networkFlows:   Map<string, { flowRate: number | null }> | null,
): Map<string, ValveKvResult> {
  const result = new Map<string, ValveKvResult>()
  if (!pdcCumResults || !networkFlows || valves.length === 0) return result

  const { segCumDp, nodeCumDp, nodeIncoming } = pdcCumResults
  const prodECS = points.find((p: any) => p.type === 'productionECS')
  if (!prodECS) return result

  // nodeId → segId sortant (sens du flux) — un seul par nœud hors jonction
  const outgoing = new Map<string, string>()
  for (const seg of segments) {
    const dir = flowDirections.get(seg.id)
    if (dir) outgoing.set(dir.fromId, seg.id)
  }

  // Pour chaque vanne, remonter vers la jonction aval la plus proche
  const valveTrace = new Map<string, {
    junctionId: string
    lastSegId:  string
    branchDp:   number
  }>()

  for (const valve of valves) {
    const dir = flowDirections.get(valve.segmentId)
    if (!dir) continue

    let currentNode = dir.toId
    let lastSegId   = valve.segmentId

    while (currentNode !== prodECS.id) {
      const incoming = nodeIncoming.get(currentNode) ?? []
      if (incoming.length > 1) break        // jonction trouvée

      const nextSegId = outgoing.get(currentNode)
      if (!nextSegId) break                  // nœud terminal
      const nextDir = flowDirections.get(nextSegId)
      if (!nextDir) break

      lastSegId   = nextSegId
      currentNode = nextDir.toId
    }

    const branchDp = segCumDp.get(lastSegId) ?? 0
    valveTrace.set(valve.id, { junctionId: currentNode, lastSegId, branchDp })
  }

  // Grouper les vannes par (junctionId :: lastSegId) = même branche vers même jonction
  const groups = new Map<string, string[]>()
  for (const valve of valves) {
    const trace = valveTrace.get(valve.id)
    if (!trace) continue
    const key = `${trace.junctionId}::${trace.lastSegId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(valve.id)
  }

  // Calculer le Kv de chaque vanne
  for (const valve of valves) {
    const trace = valveTrace.get(valve.id)
    if (!trace) continue

    const referenceDp = nodeCumDp.get(trace.junctionId) ?? 0
    const dpTotal     = Math.max(0, referenceDp - trace.branchDp)
    const isCritical  = dpTotal < 1

    const key     = `${trace.junctionId}::${trace.lastSegId}`
    const nValves = groups.get(key)?.length ?? 1
    const dpVanne = dpTotal / nValves

    const Q  = networkFlows.get(valve.segmentId)?.flowRate ?? null
    const kv = (!isCritical && Q != null && Q > 0 && dpVanne > 0)
      ? Q / Math.sqrt(dpVanne / 100000)
      : null

    result.set(valve.id, {
      kv, dpVanne, dpTotal,
      branchDp: trace.branchDp,
      referenceDp, isCritical, nValves, Q,
    })
  }

  return result
}

export function computeValveKvsAlim(
  valves:              any[],
  segments:            any[],
  points:              any[],
  flowDirections:      Map<string, { fromId: string; toId: string }>,
  pdcCumAlimResults:   { segCumDp: Map<string, number> } | null,
  alimentationResults: Map<string, { flowRateForPdc: number }> | null,
): Map<string, ValveKvResult> {
  const result = new Map<string, ValveKvResult>()
  if (!pdcCumAlimResults || !alimentationResults || valves.length === 0) return result

  const { segCumDp } = pdcCumAlimResults
  const prodECS = points.find((p: any) => p.type === 'productionECS')
  if (!prodECS) return result

  const allerSegs = segments.filter((s: any) => s.type === 'aller')

  // Build nodeIncoming from aller segments
  const nodeIncoming = new Map<string, { segId: string; cumDp: number }[]>()
  for (const seg of allerSegs) {
    const dir = flowDirections.get(seg.id)
    if (!dir) continue
    const cumDp = segCumDp.get(seg.id) ?? 0
    if (!nodeIncoming.has(dir.toId)) nodeIncoming.set(dir.toId, [])
    nodeIncoming.get(dir.toId)!.push({ segId: seg.id, cumDp })
  }

  // nodeCumDp = max ΔP among arriving branches
  const nodeCumDp = new Map<string, number>()
  nodeCumDp.set(prodECS.id, 0)
  for (const [nodeId, incoming] of nodeIncoming) {
    nodeCumDp.set(nodeId, Math.max(...incoming.map(i => i.cumDp)))
  }

  // outgoing: nodeId → downstream aller segment
  const outgoing = new Map<string, string>()
  for (const seg of allerSegs) {
    const dir = flowDirections.get(seg.id)
    if (dir) outgoing.set(dir.fromId, seg.id)
  }

  const valveTrace = new Map<string, { junctionId: string; lastSegId: string; branchDp: number }>()

  for (const valve of valves) {
    const dir = flowDirections.get(valve.segmentId)
    if (!dir) continue

    let currentNode = dir.toId
    let lastSegId   = valve.segmentId

    while (currentNode !== prodECS.id) {
      const incoming = nodeIncoming.get(currentNode) ?? []
      if (incoming.length > 1) break
      const nextSegId = outgoing.get(currentNode)
      if (!nextSegId) break
      const nextDir = flowDirections.get(nextSegId)
      if (!nextDir) break
      lastSegId   = nextSegId
      currentNode = nextDir.toId
    }

    const branchDp = segCumDp.get(lastSegId) ?? 0
    valveTrace.set(valve.id, { junctionId: currentNode, lastSegId, branchDp })
  }

  const groups = new Map<string, string[]>()
  for (const valve of valves) {
    const trace = valveTrace.get(valve.id)
    if (!trace) continue
    const key = `${trace.junctionId}::${trace.lastSegId}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(valve.id)
  }

  for (const valve of valves) {
    const trace = valveTrace.get(valve.id)
    if (!trace) continue

    const referenceDp = nodeCumDp.get(trace.junctionId) ?? 0
    const dpTotal     = Math.max(0, referenceDp - trace.branchDp)
    const isCritical  = dpTotal < 1

    const key     = `${trace.junctionId}::${trace.lastSegId}`
    const nValves = groups.get(key)?.length ?? 1
    const dpVanne = dpTotal / nValves

    const ar = alimentationResults.get(valve.segmentId)
    const Q  = ar?.flowRateForPdc != null ? ar.flowRateForPdc * 3.6 : null
    const kv = (!isCritical && Q != null && Q > 0 && dpVanne > 0)
      ? Q / Math.sqrt(dpVanne / 100000)
      : null

    result.set(valve.id, { kv, dpVanne, dpTotal, branchDp: trace.branchDp, referenceDp, isCritical, nValves, Q })
  }

  return result
}
