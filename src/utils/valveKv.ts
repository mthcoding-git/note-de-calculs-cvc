export interface ValveKvResult {
  kv:          number | null  // Kv recommandé (null si grand ouvert)
  dpVanne:     number         // ΔP que cette vanne absorbe (Pa), divisé par nValves si plusieurs en série
  dpTotal:     number         // ΔP total de la branche à absorber (Pa)
  branchDp:    number         // ΔP cumulé de la branche jusqu'à la jonction locale (Pa)
  referenceDp: number         // ΔP de référence = nodeCumDp[jonction] (Pa)
  isCritical:  boolean        // branche dominante à la jonction → grand ouvert
  nValves:     number         // vannes en série sur cette branche
  Q:           number | null  // débit du tronçon porteur (m³/h)
  sourceLabel: string         // libellé de la source : 'Production ECS' | 'Production CH' | 'Nœud mélange'
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
  sourceType = 'productionECS',
): Map<string, ValveKvResult> {
  const result = new Map<string, ValveKvResult>()
  if (!pdcCumResults || !networkFlows || valves.length === 0) return result

  const { segCumDp, nodeCumDp, nodeIncoming } = pdcCumResults
  const prodECS = points.find((p: any) => p.type === sourceType)
  if (!prodECS) return result

  const sourceLabel = sourceType === 'productionChauffage' ? 'Production CH' : 'Production ECS'

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
    const visited   = new Set<string>()

    while (currentNode !== prodECS.id) {
      if (visited.has(currentNode)) break    // cycle détecté
      visited.add(currentNode)

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
      referenceDp, isCritical, nValves, Q, sourceLabel,
    })
  }

  return result
}

/**
 * Calcule les Kv des vannes d'équilibrage en mode chauffage, en gérant les circuits
 * secondaires (nœuds mélange) séparément du circuit primaire.
 *
 * - Vannes sur segments primaires : utilise pdcCumResults (ΔP depuis production CH)
 * - Vannes sur segments secondaires : utilise chauffageSplitCumDp (ΔP depuis nœud mélange)
 *   et construit localement nodeIncoming + nodeCumDp pour le circuit secondaire.
 */
export function computeValveKvsChauffage(
  valves:               any[],
  segments:             any[],
  points:               any[],
  flowDirections:       Map<string, { fromId: string; toId: string }>,
  pdcCumResults:        { segCumDp: Map<string, number>; nodeCumDp: Map<string, number>; nodeIncoming: Map<string, { segId: string; cumDp: number }[]> } | null,
  chauffageFlows:       Map<string, { flowRate: number | null }> | null,
  chauffageSplitCumDp:  { segCumDp: Map<string, number>; secondarySegIds: Set<string> } | null,
  mixingNodes:          Set<string> = new Set(),
): Map<string, ValveKvResult> {
  const result = new Map<string, ValveKvResult>()
  if (valves.length === 0 || !chauffageFlows) return result

  const secondarySegIds = chauffageSplitCumDp?.secondarySegIds ?? new Set<string>()
  const splitSegCumDp   = chauffageSplitCumDp?.segCumDp        ?? new Map<string, number>()

  const primaryValves   = valves.filter(v => !secondarySegIds.has(v.segmentId))
  const secondaryValves = valves.filter(v =>  secondarySegIds.has(v.segmentId))

  // ── Circuit primaire ─────────────────────────────────────────────────────
  if (primaryValves.length > 0) {
    if (chauffageSplitCumDp) {
      // pdcCumResults deadlocke quand un nœud mélange crée un cycle dans le BFS topologique
      // (M attend retourSec4 qui dépend de M). On reconstruit la trace depuis splitSegCumDp
      // qui contient les bonnes valeurs pour tous les tronçons.
      const primarySegs = segments.filter((s: any) => !secondarySegIds.has(s.id))

      // nodeIncoming primaire uniquement — évite que M soit détecté comme jonction
      const primNodeIncoming = new Map<string, { segId: string; cumDp: number }[]>()
      for (const seg of primarySegs) {
        const dir = flowDirections.get(seg.id)
        if (!dir) continue
        const cumDp = splitSegCumDp.get(seg.id) ?? 0
        if (!primNodeIncoming.has(dir.toId)) primNodeIncoming.set(dir.toId, [])
        primNodeIncoming.get(dir.toId)!.push({ segId: seg.id, cumDp })
      }
      const primNodeCumDp = new Map<string, number>()
      for (const [nodeId, inc] of primNodeIncoming) {
        primNodeCumDp.set(nodeId, Math.max(...inc.map(i => i.cumDp)))
      }

      // outgoing : secondaires en premier, primaires en dernier (primaires prioritaires)
      // → à S, outgoing[S] = retourPrim (primaire) plutôt que retourSec4 (secondaire)
      // → à M, outgoing[M] = allerSec (secondaire, pas de primaire depuis M)
      const outgoing = new Map<string, string>()
      for (const seg of segments) {
        const dir = flowDirections.get(seg.id)
        if (dir) outgoing.set(dir.fromId, seg.id)
      }
      for (const seg of primarySegs) {
        const dir = flowDirections.get(seg.id)
        if (dir) outgoing.set(dir.fromId, seg.id)
      }

      const prodCH = points.find((p: any) => p.type === 'productionChauffage')
      if (prodCH) {
        const valveTrace = new Map<string, { junctionId: string; lastSegId: string; branchDp: number }>()
        for (const valve of primaryValves) {
          const dir = flowDirections.get(valve.segmentId)
          if (!dir) continue

          let currentNode = dir.toId
          let lastSegId   = valve.segmentId
          const visited   = new Set<string>()

          while (currentNode !== prodCH.id) {
            if (visited.has(currentNode)) break
            visited.add(currentNode)

            const incoming = primNodeIncoming.get(currentNode) ?? []
            if (incoming.length > 1) break

            const nextSegId = outgoing.get(currentNode)
            if (!nextSegId) break
            const nextDir = flowDirections.get(nextSegId)
            if (!nextDir) break

            lastSegId   = nextSegId
            currentNode = nextDir.toId
          }

          const branchDp = splitSegCumDp.get(lastSegId) ?? 0
          valveTrace.set(valve.id, { junctionId: currentNode, lastSegId, branchDp })
        }

        const groups = new Map<string, string[]>()
        for (const valve of primaryValves) {
          const trace = valveTrace.get(valve.id)
          if (!trace) continue
          const key = `${trace.junctionId}::${trace.lastSegId}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(valve.id)
        }

        for (const valve of primaryValves) {
          const trace = valveTrace.get(valve.id)
          if (!trace) continue

          const referenceDp = primNodeCumDp.get(trace.junctionId) ?? 0
          const dpTotal     = Math.max(0, referenceDp - trace.branchDp)
          const isCritical  = dpTotal < 1

          const key     = `${trace.junctionId}::${trace.lastSegId}`
          const nValves = groups.get(key)?.length ?? 1
          const dpVanne = dpTotal / nValves

          const Q  = chauffageFlows.get(valve.segmentId)?.flowRate ?? null
          const kv = (!isCritical && Q != null && Q > 0 && dpVanne > 0)
            ? Q / Math.sqrt(dpVanne / 100000)
            : null

          result.set(valve.id, {
            kv, dpVanne, dpTotal,
            branchDp: trace.branchDp,
            referenceDp, isCritical, nValves, Q,
            sourceLabel: 'Production CH',
          })
        }
      }
    } else if (pdcCumResults) {
      const primaryResults = computeValveKvs(
        primaryValves, segments, points, flowDirections,
        pdcCumResults, chauffageFlows, 'productionChauffage',
      )
      for (const [id, r] of primaryResults) result.set(id, r)
    }
  }

  // ── Circuit secondaire ───────────────────────────────────────────────────
  if (secondaryValves.length > 0) {
    const secondarySegs = segments.filter((s: any) => secondarySegIds.has(s.id))

    // outgoing restreint aux segments secondaires
    const outgoing = new Map<string, string>()
    for (const seg of secondarySegs) {
      const dir = flowDirections.get(seg.id)
      if (dir) outgoing.set(dir.fromId, seg.id)
    }

    // nodeIncoming et nodeCumDp depuis le segCumDp secondaire (base = nœud mélange)
    const nodeIncoming = new Map<string, { segId: string; cumDp: number }[]>()
    for (const seg of secondarySegs) {
      const dir = flowDirections.get(seg.id)
      if (!dir) continue
      const cumDp = splitSegCumDp.get(seg.id) ?? 0
      if (!nodeIncoming.has(dir.toId)) nodeIncoming.set(dir.toId, [])
      nodeIncoming.get(dir.toId)!.push({ segId: seg.id, cumDp })
    }

    const nodeCumDp = new Map<string, number>()
    for (const [nodeId, inc] of nodeIncoming) {
      nodeCumDp.set(nodeId, Math.max(...inc.map(i => i.cumDp)))
    }

    // Trace chaque vanne vers la jonction aval la plus proche
    const valveTrace = new Map<string, { junctionId: string; lastSegId: string; branchDp: number }>()
    for (const valve of secondaryValves) {
      const dir = flowDirections.get(valve.segmentId)
      if (!dir) continue

      let currentNode = dir.toId
      let lastSegId   = valve.segmentId
      const visited   = new Set<string>()

      while (true) {
        if (visited.has(currentNode)) break
        visited.add(currentNode)

        if (mixingNodes.has(currentNode)) break

        const incoming = nodeIncoming.get(currentNode) ?? []
        if (incoming.length > 1) break

        const nextSegId = outgoing.get(currentNode)
        if (!nextSegId) break
        const nextDir = flowDirections.get(nextSegId)
        if (!nextDir) break

        lastSegId   = nextSegId
        currentNode = nextDir.toId
      }

      const branchDp = splitSegCumDp.get(lastSegId) ?? 0
      valveTrace.set(valve.id, { junctionId: currentNode, lastSegId, branchDp })
    }

    // Grouper par branche (junctionId :: lastSegId)
    const groups = new Map<string, string[]>()
    for (const valve of secondaryValves) {
      const trace = valveTrace.get(valve.id)
      if (!trace) continue
      const key = `${trace.junctionId}::${trace.lastSegId}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(valve.id)
    }

    // Calculer le Kv de chaque vanne secondaire
    for (const valve of secondaryValves) {
      const trace = valveTrace.get(valve.id)
      if (!trace) continue

      const referenceDp = nodeCumDp.get(trace.junctionId) ?? 0
      const dpTotal     = Math.max(0, referenceDp - trace.branchDp)
      const isCritical  = dpTotal < 1

      const key     = `${trace.junctionId}::${trace.lastSegId}`
      const nValves = groups.get(key)?.length ?? 1
      const dpVanne = dpTotal / nValves

      const Q  = chauffageFlows.get(valve.segmentId)?.flowRate ?? null
      const kv = (!isCritical && Q != null && Q > 0 && dpVanne > 0)
        ? Q / Math.sqrt(dpVanne / 100000)
        : null

      result.set(valve.id, {
        kv, dpVanne, dpTotal,
        branchDp: trace.branchDp,
        referenceDp, isCritical, nValves, Q,
        sourceLabel: 'Nœud mélange',
      })
    }
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

    result.set(valve.id, { kv, dpVanne, dpTotal, branchDp: trace.branchDp, referenceDp, isCritical, nValves, Q, sourceLabel: 'Production ECS' })
  }

  return result
}
