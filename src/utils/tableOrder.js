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

  // Tronçons non atteignables (pas de direction connue) → ajout en fin sans indent
  for (const seg of allerSegs) {
    if (!allerVisited.has(seg.id)) allerRows.push({ kind: 'segment', seg, depth: 0 })
  }

  // ── Retour : BFS à rebours depuis la Production ECS ─────────────────────
  const retourRows    = []
  const retourVisited = new Set()

  const walkRetour = (ptId, depth) => {
    // Tronçons retour dont le flux arrive EN ptId (dir.toId === ptId)
    const nexts = retourSegs.filter(s => {
      const d = flowDirections.get(s.id)
      return d && d.toId === ptId && !retourVisited.has(s.id)
    })
    // Jonction : plusieurs tronçons se rejoignent en ce nœud → mélange de température
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
