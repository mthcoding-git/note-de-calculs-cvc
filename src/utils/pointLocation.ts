// Longueur géométrique d'un tronçon en pixels (somme des distances entre sommets).
function segPixelLength(seg) {
  const vs = seg.vertices ?? []
  let len = 0
  for (let i = 0; i < vs.length - 1; i++) {
    const dx = vs[i + 1].x - vs[i].x, dy = vs[i + 1].y - vs[i].y
    len += Math.sqrt(dx * dx + dy * dy)
  }
  return Math.max(len, 1)
}

// Retourne la localisation textuelle d'un point (sommet) :
// – "NomPompe (Niveau)" si c'est un nœud pompe
// – "Production ECS (Niveau)" si c'est un nœud ECS
// – "Chaufferie (Niveau)" si dans la zone chaufferie
// – "NomColonne (Niveau)" si dans une colonne
// – "Niveau" sinon
export function getNodeLocation(pt, levels, lineYs, columns, columnXs, chaufferie, dirHint, specialPts) {
  let levelName = ''
  let levelId   = null
  for (let i = 0; i < levels.length; i++) {
    const yBot = lineYs[i]
    const yTop = lineYs[i + 1]
    if (yTop === undefined) continue
    const goingIntoThisLevel = pt.y === yTop && dirHint && dirHint.y > pt.y
    if ((pt.y > yTop && pt.y <= yBot) || goingIntoThisLevel) {
      levelName = levels[i].name
      levelId   = levels[i].id
      break
    }
  }
  if (!levelName) {
    const topLine = lineYs[levels.length]
    if (topLine !== undefined && pt.y <= topLine) levelName = 'Toiture'
  }

  // Équipements spéciaux (priorité sur toute zone)
  if (specialPts?.length) {
    for (const sp of specialPts) {
      if (Math.abs(pt.x - sp.x) < 2 && Math.abs(pt.y - sp.y) < 2) {
        if (sp.type === 'pump') return `${sp.name} (${levelName || '?'})`
        if (sp.type === 'productionECS') return `Production ECS (${levelName || '?'})`
      }
    }
  }

  // Zone chaufferie
  if (chaufferie?.enabled) {
    const lvlIdx = levels.findIndex(l => l.id === chaufferie.levelId)
    if (lvlIdx >= 0) {
      const yBot = lineYs[lvlIdx]
      const yTop = yBot - chaufferie.height
      if (pt.x >= chaufferie.x1 && pt.x <= chaufferie.x2 && pt.y >= yTop && pt.y <= yBot) {
        return `Local ECS (${levelName || '?'})`
      }
    }
  }

  // Colonne
  if (columns?.length && columnXs?.length) {
    for (let i = 0; i < columns.length; i++) {
      const cx1 = columnXs[i], cx2 = columnXs[i + 1]
      if (cx1 === undefined || cx2 === undefined) continue
      if (pt.x < cx1 || pt.x > cx2) continue
      const col = columns[i]
      if (col.isGap) continue
      const covers = col.levelIds === 'all' ||
        (Array.isArray(col.levelIds) && levelId && col.levelIds.includes(levelId))
      if (covers) return `${col.name} (${levelName || '?'})`
    }
  }

  return levelName || '?'
}

// Dijkstra depuis un nœud source en ne traversant que les tronçons d'un type donné.
// Retourne Map<ptId, distancePixels>.
function dijkstraByType(allSegs, sourceNodes, segType: string) {
  const dist = new Map()
  if (!sourceNodes.length) return dist

  const adj = new Map()
  for (const seg of (allSegs ?? [])) {
    if (seg.type !== segType || !seg.startPointId || !seg.endPointId) continue
    const len = segPixelLength(seg)
    for (const [a, b] of [[seg.startPointId, seg.endPointId], [seg.endPointId, seg.startPointId]]) {
      if (!adj.has(a)) adj.set(a, [])
      adj.get(a).push({ id: b, len })
    }
  }

  const queue = []
  for (const node of sourceNodes) {
    dist.set(node.id, 0)
    queue.push({ id: node.id, d: 0 })
  }

  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d)
    const { id, d } = queue.shift()
    if ((dist.get(id) ?? Infinity) < d) continue
    for (const { id: nId, len } of (adj.get(id) ?? [])) {
      const nd = d + len
      if (nd < (dist.get(nId) ?? Infinity)) {
        dist.set(nId, nd)
        queue.push({ id: nId, d: nd })
      }
    }
  }

  return dist
}

// Dijkstra depuis les nœuds Production ECS, tronçons Aller uniquement.
export function buildECSDistances(allSegs, specialPts) {
  const ecsNodes = (specialPts ?? []).filter(p => p.type === 'productionECS')
  return dijkstraByType(allSegs, ecsNodes, 'aller')
}

// Dijkstra depuis les nœuds Production ECS, tronçons Retour uniquement.
export function buildRetourDistances(allSegs, specialPts) {
  const ecsNodes = (specialPts ?? []).filter(p => p.type === 'productionECS')
  return dijkstraByType(allSegs, ecsNodes, 'retour')
}
