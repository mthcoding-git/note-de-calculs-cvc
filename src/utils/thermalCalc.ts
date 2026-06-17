/**
 * Calcul thermique du réseau ECS bouclé (NF DTU 60.11 P1-2).
 */

/**
 * UI — coefficient de transfert thermique linéaire (W/(m·K)).
 * Formule : 2π / ( ln(de/di)/λtube + ln((de+2e)/de)/λisol + 2/(he·(de+2e)) )
 * Toutes les entrées en mm sauf he en W/(m²·K).
 */
export function computeSegUI(seg, materials, insulations, he) {
  const selMat = materials.find(m => m.id === seg.materialId)
  const selIns = insulations.find(i => i.id === seg.insulationId)
  const dnDef  = selMat?.dns.find(d => d.dn === seg.dn)

  const de_mm       = seg.de_override ?? dnDef?.de
  const di_mm       = seg.di_override ?? dnDef?.di
  const e_mm        = typeof seg.thickness === 'number' ? seg.thickness : null
  const lambda_tube = seg.lambda_tube_override ?? selMat?.lambda
  const lambda_isol = seg.lambda_insul_override ?? selIns?.lambda

  if (!de_mm || !di_mm || de_mm <= 0 || di_mm <= 0 || di_mm >= de_mm) return null
  if (!lambda_tube || lambda_tube <= 0) return null

  const term1 = Math.log(de_mm / di_mm) / lambda_tube

  let term2 = 0
  if (selIns && e_mm != null && e_mm > 0 && lambda_isol && lambda_isol > 0) {
    term2 = Math.log((de_mm + 2 * e_mm) / de_mm) / lambda_isol
  }

  const de_isol_m = (de_mm + 2 * (e_mm ?? 0)) / 1000
  if (!he || he <= 0 || de_isol_m <= 0) return null
  const term3 = 2 / (he * de_isol_m)

  const denom = term1 + term2 + term3
  if (denom <= 0) return null
  return (2 * Math.PI) / denom
}

/**
 * Température ambiante du tronçon selon le niveau dans lequel il se trouve.
 * Les tronçons sont toujours entièrement dans une zone (frontières auto-découpées).
 */
export function getSegAmbTemp(seg, levels, lineYs, globalParams) {
  if (seg.t_amb_override != null) return seg.t_amb_override
  const midY = seg.vertices.reduce((s, v) => s + v.y, 0) / seg.vertices.length
  for (let i = 0; i < levels.length; i++) {
    const yBot = lineYs[i]
    const yTop = lineYs[i + 1]
    if (yTop !== undefined && midY >= yTop && midY <= yBot) {
      return levels[i].isSousSol
        ? (globalParams.T_amb_ss  ?? 10)
        : (globalParams.T_amb_other ?? 20)
    }
  }
  return globalParams.T_amb_other ?? 20
}

/**
 * Propage les températures depuis la Production ECS par BFS selon les sens d'écoulement.
 *
 * Retourne :
 *   segResults : Map<segId, { Q: W, deltaT: K, T_from: °C, T_to: °C, T_amb: °C }>
 *   nodeTemps  : Map<ptId, °C>
 */
export function computeThermal(
  segments, points, materials, insulations,
  flowDirections, networkFlows,
  levels, lineYs, globalParams
) {
  const prodECS = points.find(p => p.type === 'productionECS')
  if (!prodECS) return { segResults: new Map(), nodeTemps: new Map() }

  const T_depart = prodECS.T_depart_override ?? globalParams.T_depart ?? 60
  const he       = globalParams.he ?? 10
  // cp saisi en J/(kg·K) → conversion en Wh/(kg·K) pour cohérence avec Q[W] et q[m³/h]
  const cp_Wh  = (globalParams.cp ?? 4180) / 3600   // Wh/(kg·K)
  const factor = (globalParams.rho ?? 1000) * cp_Wh  // Wh/(m³·K)

  const nodeTemps  = new Map()
  const segResults = new Map()
  nodeTemps.set(prodECS.id, T_depart)

  let changed = true
  const maxIter = segments.length + 4
  for (let iter = 0; changed && iter < maxIter; iter++) {
    changed = false

    // ── Étape A : calculer les tronçons dont le nœud amont est connu ──
    for (const seg of segments) {
      if (segResults.has(seg.id)) continue

      const dir = flowDirections.get(seg.id)
      if (!dir) continue

      const T_from = nodeTemps.get(dir.fromId)
      if (T_from == null) continue

      const UI     = computeSegUI(seg, materials, insulations, he)
      const L      = seg.length_override
      const q      = networkFlows.get(seg.id)?.flowRate

      if (UI == null || L == null || q == null || q <= 0) continue

      const T_amb  = getSegAmbTemp(seg, levels, lineYs, globalParams)
      const Q      = UI * L * (T_from - T_amb)
      const deltaT = Q / (q * factor)
      const T_to   = T_from - deltaT

      segResults.set(seg.id, { Q, deltaT, T_from, T_to, T_amb })
      changed = true
    }

    // ── Étape B : résoudre les températures de nœuds ──────────────────
    for (const pt of points) {
      if (nodeTemps.has(pt.id)) continue

      const inSegs = segments.filter(s => flowDirections.get(s.id)?.toId === pt.id)
      if (inSegs.length === 0) continue

      // Attendre que tous les tronçons entrants soient résolus
      if (!inSegs.every(s => segResults.has(s.id))) continue

      const weighted = inSegs.map(s => ({
        q: networkFlows.get(s.id)?.flowRate,
        T: segResults.get(s.id).T_to,
      }))
      if (weighted.some(d => d.q == null)) continue

      const sumQ = weighted.reduce((s, d) => s + d.q, 0)
      if (sumQ <= 0) continue

      nodeTemps.set(pt.id, weighted.reduce((s, d) => s + d.q * d.T, 0) / sumQ)
      changed = true
    }
  }

  return { segResults, nodeTemps }
}
