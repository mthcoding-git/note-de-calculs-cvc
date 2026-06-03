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
        return `Chaufferie (${levelName || '?'})`
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

// Longueur géométrique d'un tronçon en pixels (somme des distances entre sommets)
function segPixelLength(seg) {
  const vs = seg.vertices ?? []
  let len = 0
  for (let i = 0; i < vs.length - 1; i++) {
    const dx = vs[i + 1].x - vs[i].x, dy = vs[i + 1].y - vs[i].y
    len += Math.sqrt(dx * dx + dy * dy)
  }
  return Math.max(len, 1)
}

// Dijkstra depuis les nœuds Production ECS en ne traversant que les tronçons Aller ECS.
// Retourne Map<ptId, distancePixels> — clé absente = nœud non encore atteint.
export function buildECSDistances(allSegs, specialPts) {
  const dist = new Map()
  const ecsNodes = (specialPts ?? []).filter(p => p.type === 'productionECS')
  if (!ecsNodes.length) return dist

  // Graphe d'adjacence : Aller ECS uniquement, non orienté
  const adj = new Map()
  for (const seg of (allSegs ?? [])) {
    if (seg.type !== 'aller' || !seg.startPointId || !seg.endPointId) continue
    const len = segPixelLength(seg)
    for (const [a, b] of [[seg.startPointId, seg.endPointId], [seg.endPointId, seg.startPointId]]) {
      if (!adj.has(a)) adj.set(a, [])
      adj.get(a).push({ id: b, len })
    }
  }

  const queue = []
  for (const ecs of ecsNodes) {
    dist.set(ecs.id, 0)
    queue.push({ id: ecs.id, d: 0 })
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

// Nom par défaut d'un tronçon, sans disambiguation.
// allerDist : Map<ptId, px> depuis buildECSDistances ; retourDist : depuis buildRetourDistances.
// Aller : l'extrémité la plus proche de l'ECS (allerDist min) en premier.
// Retour : l'extrémité la plus loin de l'ECS (retourDist max) en premier (sens du fluide).
export function getDefaultSegName(seg, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist = null, retourDist = null) {
  const ecsDistances = allerDist
  if (!seg.vertices?.length) return ''
  const verts = seg.vertices
  const startV = verts[0]
  const endV = verts[verts.length - 1]
  const startHint = verts.length > 1 ? verts[1] : null
  const endHint = verts.length > 1 ? verts[verts.length - 2] : null
  const prefix = seg.type === 'retour' ? 'Retour ECS' : 'Aller ECS'

  const getLevelName = (v, hint) => {
    for (let i = 0; i < levels.length; i++) {
      const yBot = lineYs[i], yTop = lineYs[i + 1]
      if (yTop === undefined) continue
      const goingIn = v.y === yTop && hint && hint.y > v.y
      if ((v.y > yTop && v.y <= yBot) || goingIn) return levels[i].name
    }
    const topLine = lineYs[levels.length]
    if (topLine !== undefined && v.y <= topLine) return 'Toiture'
    return '?'
  }

  // Si l'extrémité EST un nœud pompe/ECS (par ID), son nom prend priorité sur toute zone
  const specialLabel = (ptId, v, hint) => {
    const sp = specialPts?.find(p => p.id === ptId && (p.type === 'pump' || p.type === 'productionECS'))
    if (!sp) return null
    const lvl = getLevelName(v, hint)
    return sp.type === 'pump' ? `${sp.name} (${lvl})` : `Production ECS (${lvl})`
  }

  const startL = specialLabel(seg.startPointId, startV, startHint)
    ?? getNodeLocation(startV, levels, lineYs, columns, columnXs, chaufferie, startHint, specialPts)
  const endL = specialLabel(seg.endPointId, endV, endHint)
    ?? getNodeLocation(endV, levels, lineYs, columns, columnXs, chaufferie, endHint, specialPts)

  if (seg.type === 'retour' && retourDist) {
    // Retour : le fluide revient vers l'ECS → l'extrémité la plus loin (retourDist max) en premier
    const startD = retourDist.get(seg.startPointId) ?? -Infinity
    const endD   = retourDist.get(seg.endPointId)   ?? -Infinity
    const putStartFirst = startD >= endD
    const [firstL, secondL] = putStartFirst ? [startL, endL] : [endL, startL]
    return `${prefix} – ${firstL} → ${secondL}`
  }
  if (ecsDistances) {
    // Aller : le plus proche de l'ECS en premier
    const startDist = ecsDistances.get(seg.startPointId) ?? Infinity
    const endDist   = ecsDistances.get(seg.endPointId)   ?? Infinity
    const putStartFirst = startDist <= endDist
    const [firstL, secondL] = putStartFirst ? [startL, endL] : [endL, startL]
    return `${prefix} – ${firstL} → ${secondL}`
  }
  return `${prefix} – ${startL} → ${endL}`
}

// Dijkstra depuis les nœuds Production ECS en ne traversant que les tronçons Retour ECS.
// Symétrique à buildECSDistances. Retourne Map<ptId, distancePixels>.
export function buildRetourDistances(allSegs, specialPts) {
  const dist = new Map()
  const ecsNodes = (specialPts ?? []).filter(p => p.type === 'productionECS')
  if (!ecsNodes.length) return dist

  const adj = new Map()
  for (const seg of (allSegs ?? [])) {
    if (seg.type !== 'retour' || !seg.startPointId || !seg.endPointId) continue
    const len = segPixelLength(seg)
    for (const [a, b] of [[seg.startPointId, seg.endPointId], [seg.endPointId, seg.startPointId]]) {
      if (!adj.has(a)) adj.set(a, [])
      adj.get(a).push({ id: b, len })
    }
  }

  const queue = []
  for (const ecs of ecsNodes) {
    dist.set(ecs.id, 0)
    queue.push({ id: ecs.id, d: 0 })
  }

  while (queue.length > 0) {
    queue.sort((a, b) => a.d - b.d)
    const { id, d } = queue.shift()
    if ((dist.get(id) ?? Infinity) < d) continue
    for (const { id: nId, len } of (adj.get(id) ?? [])) {
      const nd = d + len
      if (nd < (dist.get(nId) ?? Infinity)) { dist.set(nId, nd); queue.push({ id: nId, d: nd }) }
    }
  }

  return dist
}

// Nom d'affichage final (avec suffixe " - n°x" si doublons, triés par sens d'écoulement).
export function getDisplayName(seg, allSegs, levels, lineYs, columns, columnXs, chaufferie, specialPts) {
  if (seg.name) return seg.name
  const allerDist  = buildECSDistances(allSegs, specialPts)
  const retourDist = buildRetourDistances(allSegs, specialPts)
  const base = getDefaultSegName(seg, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist)
  const dupes = allSegs.filter(s => !s.name &&
    getDefaultSegName(s, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist) === base)
  if (dupes.length <= 1) return base

  let sorted
  if (seg.type === 'aller') {
    // Aller : n°1 = le plus proche de l'ECS (allerDist min)
    const score = s => Math.min(allerDist.get(s.startPointId) ?? Infinity, allerDist.get(s.endPointId) ?? Infinity)
    sorted = [...dupes].sort((a, b) => score(a) - score(b))
  } else {
    // Retour : n°1 = le plus loin de l'ECS (retourDist max) — le fluide y passe en premier
    const score = s => Math.max(retourDist.get(s.startPointId) ?? -Infinity, retourDist.get(s.endPointId) ?? -Infinity)
    sorted = [...dupes].sort((a, b) => score(b) - score(a))
  }

  const idx = sorted.findIndex(s => s.id === seg.id)
  return `${base} - n°${idx + 1}`
}
