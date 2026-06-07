/**
 * NF DTU 60.11 §3.2.1 — Alimentation ECS
 *
 * §3.2.1.2 Méthode individuelle  : N ≤ 5 ET X ≤ 15 → abaque Figure 1 → di_min
 * §3.2.2  Méthode collective     : N > 5 OU X > 15  → Qp = y × Qs + Qp_wcc → di_min
 */

// ── Abaque §3.2.1.2 Figure 1 — [X, di_min mm] ─────────────────────────────
export const ABAQUE = [
  [2.0, 11.0], [2.5, 11.5], [3.0, 12.1], [3.5, 12.8],
  [4.0, 13.4], [4.5, 14.1], [5.0, 14.6], [5.5, 15.1],
  [6.0, 15.6], [6.5, 15.9], [7.0, 16.2], [7.5, 16.6],
  [8.0, 16.9], [8.5, 17.2], [9.0, 17.5], [9.5, 17.8],
  [10.0, 18.0], [10.5, 18.2], [11.0, 18.5], [11.5, 18.8],
  [12.0, 19.0], [12.5, 19.3], [13.0, 19.5], [13.5, 19.8],
  [14.0, 20.0], [14.5, 20.0], [15.0, 20.0],
]

export function lookupDiMin(X) {
  if (X <= ABAQUE[0][0]) return ABAQUE[0][1]
  if (X >= ABAQUE[ABAQUE.length - 1][0]) return ABAQUE[ABAQUE.length - 1][1]
  for (let i = 0; i < ABAQUE.length - 1; i++) {
    const [x0, d0] = ABAQUE[i]
    const [x1, d1] = ABAQUE[i + 1]
    if (X >= x0 && X <= x1) return d0 + (X - x0) / (x1 - x0) * (d1 - d0)
  }
  return null
}

// ── §3.2.2 — Abattement WC robinets de chasse ──────────────────────────────
function wccEffectif(n) {
  if (n <= 0)  return 0
  if (n <= 3)  return 1
  if (n <= 12) return 2
  if (n <= 24) return 3
  if (n <= 50) return 4
  return 5
}

// ── §3.2.2 — Débit probable collectif ──────────────────────────────────────
function computeCollective(totalEquip, appareils, buildingType) {
  // §3.2.2 Note 1 : enseignement → lavabos et douches tous simultanés
  const isEnseignement = buildingType === 'enseignement'
  const SIM_IDS = new Set(['lavabo', 'douche'])

  let Qs_sim = 0, N_sim = 0   // lavabos+douches (enseignement : y=1)
  let Qs_y   = 0, N_y   = 0   // autres appareils soumis au coeff y
  let N_wcc  = 0
  let machineLingeCounted = false
  let machineLinge_total  = 0

  for (const a of appareils) {
    if (!a.enabled) continue
    const cnt = totalEquip[a.id] ?? 0
    if (cnt === 0) continue

    // WC robinets de chasse — traitement séparé (§3.2.2)
    if (a.id === 'wc_robinet') { N_wcc += cnt; continue }

    const qBase = a.qBase ?? 0

    // Machine à laver : une seule comptée dans Qs (§3.2.2)
    let effCnt = cnt
    if (a.id === 'machine_linge') {
      machineLinge_total = cnt
      effCnt = machineLingeCounted ? 0 : 1
      machineLingeCounted = true
    }

    if (isEnseignement && SIM_IDS.has(a.id)) {
      Qs_sim += qBase * cnt   // débit plein, tous simultanés
      N_sim  += cnt
    } else {
      Qs_y += qBase * effCnt
      N_y  += cnt
    }
  }

  // N et Qs servant au calcul de y selon le type de bâtiment
  // Standard    : y appliqué à tous les appareils hors wcc robinets
  // Enseignement: y appliqué uniquement aux appareils hors lavabos/douches
  const N_for_y  = isEnseignement ? N_y : N_y + N_sim
  const Qs_for_y = isEnseignement ? Qs_y : Qs_y + Qs_sim
  const y = N_for_y > 5
    ? 0.8 / Math.sqrt(N_for_y - 1)
    : N_for_y > 0 ? 1.0 : 0

  const Qp_y      = y * Qs_for_y
  // Pour enseignement : on ajoute les lavabos/douches en plein débit
  const Qp_autres = isEnseignement ? Qs_sim + Qp_y : Qp_y

  // WC robinets de chasse
  const N_wcc_eff = wccEffectif(N_wcc)
  const Qp_wcc    = N_wcc_eff * 1.50
  const Qp        = Qp_autres + Qp_wcc

  // di_min depuis V_max = 2 m/s (§3.1 — sous-sol / locaux techniques)
  const V_max  = 2.0
  const di_min = Qp > 0
    ? Math.sqrt(4 * (Qp * 1e-3) / (Math.PI * V_max)) * 1000
    : null

  return {
    Qp, y,
    Qs_for_y, N_for_y,
    Qs_sim, N_sim, isEnseignement,
    N_wcc, N_wcc_eff, Qp_wcc, Qp_autres,
    di_min, V_max,
    machineLingeLimited: machineLinge_total > 1,
    machineLinge_total,
  }
}

// ── BFS : groupes de puisage en aval d'un nœud ─────────────────────────────
function collectDownstreamGroupes(startNodeId, segments, points, flowDirections) {
  const visited = new Set()
  const queue   = [startNodeId]
  const groupes = []
  const allerSegs = segments.filter(s => s.type === 'aller')

  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    const pt = points.find(p => p.id === nodeId)
    if (pt?.type === 'groupe') groupes.push(pt)
    for (const seg of allerSegs) {
      const dir = flowDirections.get(seg.id)
      if (dir?.fromId === nodeId && !visited.has(dir.toId)) queue.push(dir.toId)
    }
  }
  return groupes
}

// ── Point d'entrée principal ────────────────────────────────────────────────
export function computeAlimentationResults(segments, points, alimentationParams, flowDirections) {
  if (!alimentationParams || !flowDirections) return new Map()

  const appareils    = alimentationParams.appareils ?? []
  const buildingType = alimentationParams.buildingType ?? 'habitation'
  const enabledIds   = new Set(appareils.filter(a => a.enabled).map(a => a.id))
  const results      = new Map()

  for (const seg of segments) {
    if (seg.type !== 'aller') continue
    const dir = flowDirections.get(seg.id)
    if (!dir) continue

    const groupes = collectDownstreamGroupes(dir.toId, segments, points, flowDirections)

    // Agréger les équipements de tous les groupes en aval
    const totalEquip = {}
    for (const g of groupes) {
      if (!g.equipements) continue
      for (const [id, cnt] of Object.entries(g.equipements)) {
        if (!enabledIds.has(id)) continue
        totalEquip[id] = (totalEquip[id] ?? 0) + cnt
      }
    }

    // X = Σ(k_i × n_i) — appareils du Tableau 2
    let X = 0
    const nonDTUIds = []
    for (const a of appareils) {
      if (!enabledIds.has(a.id)) continue
      const cnt = totalEquip[a.id] ?? 0
      if (cnt === 0) continue
      if (a.id === 'wc_robinet') continue  // abattement DTU §3.2.2 propre, pas "hors tableau"
      if (a.k != null) X += cnt * a.k
      else nonDTUIds.push(a.id)
    }

    const N = Object.values(totalEquip).reduce((s, n) => s + n, 0)
    if (N === 0 && nonDTUIds.length === 0) continue

    // Choix de la méthode (§3.2.1.2 vs §3.2.2)
    let method, collectiveReason
    if (N > 5)        { method = 'collective'; collectiveReason = 'N > 5' }
    else if (X > 15)  { method = 'collective'; collectiveReason = 'X > 15' }
    else              { method = 'individual';  collectiveReason = null }

    // Méthode individuelle — abaque Figure 1
    const di_min = method === 'individual'
      ? (X >= ABAQUE[0][0] ? lookupDiMin(X) : X > 0 ? ABAQUE[0][1] : null)
      : null

    // Méthode collective §3.2.2
    const collective = method === 'collective'
      ? computeCollective(totalEquip, appareils, buildingType)
      : null

    results.set(seg.id, {
      X, N, di_min,
      method, collectiveReason,
      groupeCount: groupes.length,
      equipDetail: { ...totalEquip },
      nonDTUIds,
      collective,
    })
  }

  return results
}
