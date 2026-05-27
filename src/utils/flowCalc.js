/**
 * Calcul des débits dans le réseau ECS par loi des nœuds (Kirchhoff hydraulique).
 *
 * Règle : en chaque nœud, ΣQ_entrant = ΣQ_sortant
 * Les valeurs manuelles servent d'ancrage ; les inconnues sont propagées par itération.
 * Les incohérences (valeurs manuelles contradictoires) sont signalées.
 */

/** Di en mm pour un tronçon (di_override > table matériau) */
export function getDi_mm(seg, materials) {
  const mat   = materials.find(m => m.id === seg.materialId)
  const dnDef = mat?.dns.find(d => d.dn === seg.dn)
  return seg.di_override ?? dnDef?.di ?? null
}

/** Débit manuel en m³/h pour un tronçon (null si pas renseigné ou Di manquant) */
function getManualFlow(seg, materials) {
  if (seg.flowRate != null) return seg.flowRate
  if (seg.velocity != null) {
    const di_mm = getDi_mm(seg, materials)
    if (di_mm == null) return null
    const area = Math.PI * (di_mm / 1000) ** 2 / 4
    return seg.velocity * area * 3600
  }
  return null
}

/**
 * Calcule les débits de tous les tronçons.
 *
 * @param {Array}  segments        - tronçons du projet
 * @param {Array}  points          - nœuds du projet
 * @param {Array}  materials       - matériaux (pour Di)
 * @param {Map}    flowDirections  - Map<segId, {fromId, toId}|null> (de computeFlowDirections)
 *
 * @returns Map<segId, {
 *   flowRate: number|null,   // m³/h (résolu)
 *   velocity: number|null,   // m/s  (si Di connu)
 *   source:   'manual'|'computed'|null,
 *   hasError: boolean,
 * }>
 */
export function computeNetworkFlows(segments, points, materials, flowDirections) {
  const TOLE = 1e-9

  // ── Étape 1 : initialiser avec les valeurs manuelles ─────────────────
  // flowMap : segId → { value: m³/h|null, source }
  const flowMap = new Map()
  for (const seg of segments) {
    const q = getManualFlow(seg, materials)
    flowMap.set(seg.id, q != null
      ? { value: q, source: 'manual' }
      : { value: null, source: null }
    )
  }

  // ── Étape 2 : propagation itérative par loi des nœuds ────────────────
  // Pour chaque nœud : si une seule inconnue → on la calcule.
  // On itère jusqu'à stabilité (au plus n+2 tours pour un arbre).
  let changed = true
  const maxIter = segments.length + 4
  for (let iter = 0; changed && iter < maxIter; iter++) {
    changed = false
    for (const pt of points) {
      // Tronçons avec direction connue, connectés à ce nœud
      const incident = segments.filter(s => {
        const d = flowDirections.get(s.id)
        return d && (s.startPointId === pt.id || s.endPointId === pt.id)
      })
      if (incident.length < 2) continue

      const inSegs  = incident.filter(s => flowDirections.get(s.id).toId   === pt.id)
      const outSegs = incident.filter(s => flowDirections.get(s.id).fromId === pt.id)

      const knownIn   = inSegs.filter(s  => flowMap.get(s.id).value != null)
      const unknownIn = inSegs.filter(s  => flowMap.get(s.id).value == null)
      const knownOut  = outSegs.filter(s => flowMap.get(s.id).value != null)
      const unknownOut= outSegs.filter(s => flowMap.get(s.id).value == null)

      const sumIn  = knownIn.reduce((a, s)  => a + flowMap.get(s.id).value, 0)
      const sumOut = knownOut.reduce((a, s) => a + flowMap.get(s.id).value, 0)

      if (unknownIn.length === 0 && unknownOut.length === 1) {
        const q = sumIn - sumOut
        flowMap.set(unknownOut[0].id, { value: Math.max(0, q), source: 'computed' })
        changed = true
      } else if (unknownIn.length === 1 && unknownOut.length === 0) {
        const q = sumOut - sumIn
        flowMap.set(unknownIn[0].id, { value: Math.max(0, q), source: 'computed' })
        changed = true
      }
    }
  }

  // ── Étape 3 : détection d'incohérences ───────────────────────────────
  // Un nœud dont tous les débits sont connus mais ne s'équilibrent pas → erreur.
  // On marque uniquement les tronçons manuels impliqués.
  const errorSegs = new Set()
  for (const pt of points) {
    const incident = segments.filter(s => {
      const d = flowDirections.get(s.id)
      return d && (s.startPointId === pt.id || s.endPointId === pt.id)
    })
    if (incident.length < 2) continue
    if (!incident.every(s => flowMap.get(s.id).value != null)) continue

    const inSegs  = incident.filter(s => flowDirections.get(s.id).toId   === pt.id)
    const outSegs = incident.filter(s => flowDirections.get(s.id).fromId === pt.id)
    const sumIn   = inSegs.reduce((a, s)  => a + flowMap.get(s.id).value, 0)
    const sumOut  = outSegs.reduce((a, s) => a + flowMap.get(s.id).value, 0)

    if (Math.abs(sumIn - sumOut) > TOLE) {
      for (const seg of incident) {
        if (flowMap.get(seg.id).source === 'manual') errorSegs.add(seg.id)
      }
    }
  }

  // ── Étape 4 : résultat final avec vitesse ────────────────────────────
  const result = new Map()
  for (const seg of segments) {
    const { value: flowRate, source } = flowMap.get(seg.id)
    const di_mm = getDi_mm(seg, materials)
    let velocity = null
    if (flowRate != null && di_mm != null) {
      const area = Math.PI * (di_mm / 1000) ** 2 / 4
      velocity = flowRate / (area * 3600)
    }
    result.set(seg.id, { flowRate, velocity, source, hasError: errorSegs.has(seg.id) })
  }
  return result
}
