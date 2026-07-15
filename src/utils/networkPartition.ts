/**
 * Partition un réseau en sous-graphes connexes selon la présence de nœuds de production.
 *
 * Pour le mode "bouclage ECS" avec plusieurs productions ECS indépendantes,
 * retourne une entrée par production et détecte si deux productions sont reliées
 * par des tronçons (cas d'erreur).
 */
export function partitionNetworkByProduction(
  segments: any[],
  points:   any[],
  prodType: string = 'productionECS',
): {
  partitions:              Array<{ prodId: string; segments: any[]; points: any[] }>
  hasConnectedProductions: boolean
} {
  const prodNodes = points.filter(p => p.type === prodType)

  if (prodNodes.length <= 1) {
    return {
      partitions: prodNodes.length === 1
        ? [{ prodId: prodNodes[0].id, segments, points }]
        : [],
      hasConnectedProductions: false,
    }
  }

  // Graphe non orienté
  const adj = new Map<string, string[]>()
  for (const pt of points) adj.set(pt.id, [])
  for (const seg of segments) {
    const a = seg.startPointId
    const b = seg.endPointId
    if (a && b && adj.has(a) && adj.has(b)) {
      adj.get(a)!.push(b)
      adj.get(b)!.push(a)
    }
  }

  // Composantes connexes par BFS
  const compOf    = new Map<string, number>()
  const components: Set<string>[] = []

  for (const pt of points) {
    if (compOf.has(pt.id)) continue
    const idx  = components.length
    const comp = new Set<string>()
    components.push(comp)
    const queue = [pt.id]
    comp.add(pt.id)
    compOf.set(pt.id, idx)
    while (queue.length) {
      const cur = queue.shift()!
      for (const nb of adj.get(cur) ?? []) {
        if (!comp.has(nb)) {
          comp.add(nb)
          compOf.set(nb, idx)
          queue.push(nb)
        }
      }
    }
  }

  const hasConnectedProductions = components.some(
    comp => prodNodes.filter(p => comp.has(p.id)).length >= 2,
  )

  const ptMap = new Map(points.map(p => [p.id, p]))
  const partitions = components
    .map(comp => {
      const prods = prodNodes.filter(p => comp.has(p.id))
      if (prods.length === 0) return null
      return {
        prodId:   prods[0].id,
        segments: segments.filter(
          s => s.startPointId && comp.has(s.startPointId)
            && s.endPointId   && comp.has(s.endPointId),
        ),
        points: [...comp].map(id => ptMap.get(id)).filter(Boolean),
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  return { partitions, hasConnectedProductions }
}
