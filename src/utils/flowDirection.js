/**
 * Retourne la longueur d'un tronçon :
 *  - length_override (m) si renseigné
 *  - sinon longueur géométrique en pixels (proxy proportionnel)
 */
export function getSegmentLength(seg) {
  if (seg.length_override != null) return seg.length_override
  const vs = seg.vertices
  let len = 0
  for (let i = 0; i < vs.length - 1; i++)
    len += Math.hypot(vs[i + 1].x - vs[i].x, vs[i + 1].y - vs[i].y)
  return len
}

/**
 * Dijkstra depuis `startId` en ne traversant que les tronçons de `type` ('aller' | 'retour').
 * Retourne une Map<nodeId, distance>.
 */
function dijkstraFiltered(startId, segments, type) {
  const filtered = segments.filter(s => s.type === type)
  const dist = new Map([[startId, 0]])
  // file de priorité minimale : tableau de [distance, nodeId]
  const queue = [[0, startId]]

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0])
    const [d, id] = queue.shift()
    if (d > (dist.get(id) ?? Infinity)) continue

    for (const seg of filtered) {
      if (seg.startPointId !== id && seg.endPointId !== id) continue
      const neighborId = seg.startPointId === id ? seg.endPointId : seg.startPointId
      const newDist = d + getSegmentLength(seg)
      if (newDist < (dist.get(neighborId) ?? Infinity)) {
        dist.set(neighborId, newDist)
        queue.push([newDist, neighborId])
      }
    }
  }

  return dist
}

/**
 * Calcule le sens d'écoulement pour chaque tronçon.
 *
 * Règle aller  : fluide va du nœud le plus proche de la Production ECS
 *                vers le nœud le plus éloigné (chemin uniquement aller).
 * Règle retour : fluide va du nœud le plus éloigné de la Production ECS
 *                vers le nœud le plus proche (chemin uniquement retour).
 *
 * Retourne Map<segId, { fromId, toId } | null>.
 *   null = direction indéterminée (tronçon non connecté à la Production ECS).
 */
export function computeFlowDirections(segments, points) {
  const prodECS = points.find(p => p.type === 'productionECS')
  if (!prodECS) return new Map()

  const distAller  = dijkstraFiltered(prodECS.id, segments, 'aller')
  const distRetour = dijkstraFiltered(prodECS.id, segments, 'retour')

  const result = new Map()

  for (const seg of segments) {
    const distMap = seg.type === 'aller' ? distAller : distRetour
    const dStart  = distMap.get(seg.startPointId) ?? Infinity
    const dEnd    = distMap.get(seg.endPointId)   ?? Infinity

    if (!isFinite(dStart) && !isFinite(dEnd)) {
      result.set(seg.id, null)
      continue
    }

    let fromId, toId
    if (seg.type === 'aller') {
      // plus proche → plus éloigné (s'écarte de la Production ECS)
      if (dStart <= dEnd) { fromId = seg.startPointId; toId = seg.endPointId }
      else                { fromId = seg.endPointId;   toId = seg.startPointId }
    } else {
      // plus éloigné → plus proche (revient vers la Production ECS)
      if (dStart >= dEnd) { fromId = seg.startPointId; toId = seg.endPointId }
      else                { fromId = seg.endPointId;   toId = seg.startPointId }
    }

    result.set(seg.id, { fromId, toId })
  }

  return result
}

/**
 * Calcule le sens d'écoulement pour un réseau Alimentation EF avec plusieurs arrivées.
 * Multi-source Dijkstra depuis tous les points de type 'arriveeEF'.
 * Seuls les tronçons 'aller' sont supportés (pas de retour en EF).
 *
 * Retourne Map<segId, { fromId, toId } | null>.
 *   null = tronçon non aller ou non connecté à une arrivée EF.
 */
export function computeFlowDirectionsEF(segments, points) {
  const sources = points.filter(p => p.type === 'arriveeEF')
  if (!sources.length) return new Map()

  const allerSegs = segments.filter(s => s.type === 'aller')
  const dist = new Map(sources.map(p => [p.id, 0]))
  const queue = sources.map(p => [0, p.id])

  while (queue.length > 0) {
    queue.sort((a, b) => a[0] - b[0])
    const [d, id] = queue.shift()
    if (d > (dist.get(id) ?? Infinity)) continue

    for (const seg of allerSegs) {
      if (seg.startPointId !== id && seg.endPointId !== id) continue
      const neighborId = seg.startPointId === id ? seg.endPointId : seg.startPointId
      const newDist = d + getSegmentLength(seg)
      if (newDist < (dist.get(neighborId) ?? Infinity)) {
        dist.set(neighborId, newDist)
        queue.push([newDist, neighborId])
      }
    }
  }

  const result = new Map()
  for (const seg of segments) {
    if (seg.type !== 'aller') {
      result.set(seg.id, null)
      continue
    }
    const dStart = dist.get(seg.startPointId) ?? Infinity
    const dEnd   = dist.get(seg.endPointId)   ?? Infinity

    if (!isFinite(dStart) && !isFinite(dEnd)) {
      result.set(seg.id, null)
      continue
    }

    if (dStart <= dEnd) {
      result.set(seg.id, { fromId: seg.startPointId, toId: seg.endPointId })
    } else {
      result.set(seg.id, { fromId: seg.endPointId, toId: seg.startPointId })
    }
  }

  return result
}
