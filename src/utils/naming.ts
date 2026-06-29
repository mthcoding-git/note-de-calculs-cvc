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

// Retourne "NomColonne (Niveau)" si le vertex v est dans une colonne, sinon null.
function getVertexColLoc(v, hint, levels, lineYs, columns, columnXs) {
  if (!columns?.length || !columnXs?.length) return null
  let levelName = '?', levelId = null
  for (let i = 0; i < levels.length; i++) {
    const yBot = lineYs[i], yTop = lineYs[i + 1]
    if (yTop === undefined) continue
    const goingIn = v.y === yTop && hint && hint.y > v.y
    if ((v.y > yTop && v.y <= yBot) || goingIn) {
      levelName = levels[i].name
      levelId   = levels[i].id
      break
    }
  }
  for (let i = 0; i < columns.length; i++) {
    const cx1 = columnXs[i], cx2 = columnXs[i + 1]
    if (cx1 === undefined || cx2 === undefined) continue
    if (v.x < cx1 || v.x > cx2) continue
    const col = columns[i]
    if (col.isGap) continue
    const covers = col.levelIds === 'all' ||
      (Array.isArray(col.levelIds) && levelId && col.levelIds.includes(levelId))
    if (covers) return `${col.name} (${levelName})`
  }
  return null
}

// Remonte la chaîne des antennes parentes pour trouver la colonne d'une antenne.
// Vérifie d'abord l'extrémité amont du tronçon courant, puis les antennes en amont.
function findAntenneColLoc(seg, allSegs, roleMap, allerDist, levels, lineYs, columns, columnXs) {
  if (!allSegs || !roleMap || !allerDist) return null
  const verts = seg.vertices ?? []
  if (!verts.length) return null

  const s0 = verts[0], sN = verts[verts.length - 1]
  const h0 = verts.length > 1 ? verts[1]                 : null
  const hN = verts.length > 1 ? verts[verts.length - 2]  : null
  const startDist = allerDist.get(seg.startPointId) ?? Infinity
  const endDist   = allerDist.get(seg.endPointId)   ?? Infinity

  const [fromV, fromHint, fromPtId] = startDist <= endDist
    ? [s0, h0, seg.startPointId]
    : [sN, hN, seg.endPointId]
  const myMinDist = Math.min(startDist, endDist)

  // Extrémité amont directement dans une colonne ?
  const colLoc = getVertexColLoc(fromV, fromHint, levels, lineYs, columns, columnXs)
  if (colLoc) return colLoc

  // Sinon, remonter via les antennes parentes
  for (const s of allSegs) {
    if (s.id === seg.id || s.type !== 'aller') continue
    if (roleMap.get(s.id) !== 'antenne') continue
    if (s.startPointId !== fromPtId && s.endPointId !== fromPtId) continue
    const sMinDist = Math.min(
      allerDist.get(s.startPointId) ?? Infinity,
      allerDist.get(s.endPointId)   ?? Infinity,
    )
    if (sMinDist >= myMinDist) continue  // pas en amont
    const result = findAntenneColLoc(s, allSegs, roleMap, allerDist, levels, lineYs, columns, columnXs)
    if (result) return result
  }
  return null
}

// Nom par défaut d'un tronçon, sans disambiguation.
// allerDist : Map<ptId, px> depuis buildECSDistances ; retourDist : depuis buildRetourDistances.
// Aller : l'extrémité la plus proche de l'ECS (allerDist min) en premier.
// Retour : l'extrémité la plus loin de l'ECS (retourDist max) en premier (sens du fluide).
export function getDefaultSegName(seg, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist = null, retourDist = null, role = null, activeCalcId = null, allSegs = null, roleMap = null, flowDirections = null) {
  const isEF = activeCalcId === 'alimentation-ef'
  const ecsDistances = allerDist
  if (!seg.vertices?.length) return ''
  const verts = seg.vertices
  const startV = verts[0]
  const endV = verts[verts.length - 1]
  const startHint = verts.length > 1 ? verts[1] : null
  const endHint = verts.length > 1 ? verts[verts.length - 2] : null
  const prefix = isEF ? 'EF'
    : role === 'collecteur-aller'  ? 'Collecteur aller ECS'
    : role === 'collecteur-retour' ? 'Collecteur retour ECS'
    : role === 'antenne'           ? 'Antenne ECS'
    : seg.type === 'retour' ? 'Retour ECS'
    : 'Aller ECS'

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

  // Si l'extrémité EST un nœud pompe/ECS/arriveeEF (par ID), son nom prend priorité sur toute zone
  const specialLabel = (ptId, v, hint) => {
    const sp = specialPts?.find(p => p.id === ptId && (p.type === 'pump' || p.type === 'productionECS' || p.type === 'arriveeEF'))
    if (!sp) return null
    const lvl = getLevelName(v, hint)
    if (sp.type === 'pump')         return `${sp.name} (${lvl})`
    if (sp.type === 'arriveeEF')    return sp.name ? `${sp.name} (${lvl})` : `Arrivée EF (${lvl})`
    return `Production ECS (${lvl})`
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
  if (ecsDistances?.size) {
    // Aller : le plus proche de l'ECS en premier
    const startDist = ecsDistances.get(seg.startPointId) ?? Infinity
    const endDist   = ecsDistances.get(seg.endPointId)   ?? Infinity
    const putStartFirst = startDist <= endDist
    const [firstL, secondL] = putStartFirst ? [startL, endL] : [endL, startL]

    // Antenne en alimentation-ecs ou bouclage-ecs : chercher la colonne via la chaîne d'antennes parentes
    if (role === 'antenne' && (activeCalcId === 'alimentation-ecs' || activeCalcId === 'bouclage-ecs')) {
      const colLoc = findAntenneColLoc(seg, allSegs, roleMap, ecsDistances, levels, lineYs, columns, columnXs)
      if (colLoc) return `${prefix} – ${colLoc} → ${colLoc}`
    }

    return `${prefix} – ${firstL} → ${secondL}`
  }
  if (isEF && flowDirections) {
    const fd = (flowDirections as Map<string, { fromId: string; toId: string }>).get(seg.id)
    if (fd) {
      const [firstL, secondL] = seg.startPointId === fd.fromId ? [startL, endL] : [endL, startL]
      return `${prefix} – ${firstL} → ${secondL}`
    }
  }
  return `${prefix} – ${startL} → ${endL}`
}

// ── Groupes de points de puisage ────────────────────────────────────────────

// Nom de base d'un groupe : remonte les antennes ECS en sens inverse du flux
// jusqu'au tronçon aller ECS pour récupérer sa colonne.
export function getDefaultGroupName(
  pt: any,
  allSegs: any[],
  flowDirections: Map<string, { fromId: string; toId: string }>,
  allerDist: Map<string, number>,
  roleMap: Map<string, string> | null,
  levels: any[], lineYs: number[], columns: any[], columnXs: number[]
): string {
  // Niveau où se trouve physiquement le groupe
  let levelName = '?'
  for (let i = 0; i < levels.length; i++) {
    const yBot = lineYs[i], yTop = lineYs[i + 1]
    if (yTop === undefined) continue
    if (pt.y > yTop && pt.y <= yBot) { levelName = levels[i].name; break }
  }
  if (levelName === '?') {
    const topLine = lineYs[levels.length]
    if (topLine !== undefined && pt.y <= topLine) levelName = 'Toiture'
  }

  // Segments aller entrant dans ce groupe (sens du flux → groupe)
  const incomingSegs = allSegs.filter(
    s => s.type === 'aller' && flowDirections.get(s.id)?.toId === pt.id
  )

  // Remonte les antennes pour trouver la colonne du tronçon aller ECS
  for (const seg of incomingSegs) {
    const colLoc = findAntenneColLoc(seg, allSegs, roleMap, allerDist, levels, lineYs, columns, columnXs)
    if (colLoc) return `Groupe de puisage - ${colLoc}`
  }

  return `Groupe de puisage - ${levelName}`
}

// Calcule le nom d'affichage final (avec "- n°x" si doublons) pour tous les groupes.
// Retourne Map<ptId, displayName>.
export function getDisplayGroupNames(
  allPts: any[],
  allSegs: any[],
  flowDirections: Map<string, { fromId: string; toId: string }>,
  allerDist: Map<string, number>,
  roleMap: Map<string, string> | null,
  levels: any[], lineYs: number[], columns: any[], columnXs: number[]
): Map<string, string> {
  const result = new Map<string, string>()
  const groupes = allPts.filter(p => p.type === 'groupe')

  // Noms personnalisés — priorité absolue
  for (const pt of groupes) {
    if (pt.name) result.set(pt.id, pt.name)
  }

  // Noms auto pour les groupes sans nom personnalisé
  const autoGroupes = groupes.filter(p => !p.name)
  const baseOf = new Map<string, string>()
  for (const pt of autoGroupes) {
    baseOf.set(pt.id, getDefaultGroupName(pt, allSegs, flowDirections, allerDist, roleMap, levels, lineYs, columns, columnXs))
  }

  // Regrouper par nom de base → numérotation si doublon
  const byBase = new Map<string, string[]>()
  for (const [id, base] of baseOf) {
    if (!byBase.has(base)) byBase.set(base, [])
    byBase.get(base)!.push(id)
  }

  for (const [base, ids] of byBase) {
    if (ids.length === 1) {
      result.set(ids[0], base)
    } else {
      // Tri : X croissant puis Y croissant (ordre visuel gauche→droite, haut→bas)
      const sorted = [...ids].sort((a, b) => {
        const pA = groupes.find(p => p.id === a)!
        const pB = groupes.find(p => p.id === b)!
        return pA.x !== pB.x ? pA.x - pB.x : pA.y - pB.y
      })
      sorted.forEach((id, i) => result.set(id, `${base} - n°${i + 1}`))
    }
  }

  return result
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
export function getDisplayName(seg, allSegs, levels, lineYs, columns, columnXs, chaufferie, specialPts, role = null, activeCalcId = null, roleMap = null, flowDirections = null) {
  if (seg.name) return seg.name
  const allerDist  = buildECSDistances(allSegs, specialPts)
  const retourDist = buildRetourDistances(allSegs, specialPts)
  const base = getDefaultSegName(seg, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist, role, activeCalcId, allSegs, roleMap, flowDirections)

  // Pour les antennes en alimentation-ecs avec roleMap : comparer par nom complet (inclut colonne)
  // afin que deux antennes de la même colonne soient bien groupées pour la numérotation.
  // Pour tous les autres cas : comportement original (comparer par nom sans rôle).
  const isAlimAntenne = role === 'antenne' && activeCalcId === 'alimentation-ecs' && roleMap != null

  let dupes
  if (isAlimAntenne) {
    dupes = allSegs.filter(s => !s.name &&
      getDefaultSegName(s, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist,
        roleMap.get(s.id) ?? null, activeCalcId, allSegs, roleMap, flowDirections) === base)
  } else {
    const baseRoute = getDefaultSegName(seg, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist, null, activeCalcId, null, null, flowDirections)
    dupes = allSegs.filter(s => !s.name &&
      getDefaultSegName(s, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist, null, activeCalcId, null, null, flowDirections) === baseRoute)
  }

  if (dupes.length <= 1) return base

  let sorted
  if (seg.type === 'aller') {
    const score = s => Math.min(allerDist.get(s.startPointId) ?? Infinity, allerDist.get(s.endPointId) ?? Infinity)
    sorted = [...dupes].sort((a, b) => score(a) - score(b))
  } else {
    const score = s => Math.max(retourDist.get(s.startPointId) ?? -Infinity, retourDist.get(s.endPointId) ?? -Infinity)
    sorted = [...dupes].sort((a, b) => score(b) - score(a))
  }

  const idx = sorted.findIndex(s => s.id === seg.id)
  return `${base} - n°${idx + 1}`
}
