import type { CalcMode } from '../types'
import { getModeFlags } from './calcModeFlags'

/**
 * Construit les lignes dans l'ordre de l'écoulement par DFS aller+retour couplés.
 *
 * Deux parcours DFS symétriques depuis Production ECS :
 *   – Aller  : suit le flux (flowDir.fromId → toId)
 *   – Retour : part à rebours du flux (flowDir.toId → fromId), même direction topologique
 *              "vers l'extérieur", sans supposer que les nœuds aller et retour soient partagés.
 *
 * À chaque séparation :
 *   – un marqueur 'separation' est inséré
 *   – les branches sont triées par |x − ecsX| croissant et couplées par rang
 *   – un 'col-header' est inséré avant la première branche qui traverse une colonne
 *     (le col-header englobe le tronçon de liaison + les tronçons de la colonne)
 *
 * Le tronçon retour directement connecté à Production ECS est placé APRÈS 'flow-end'.
 *
 * Retour kinds: 'flow-start'|'flow-end'|'col-header'|'separation'|'segment'(+segType)|'junction'
 */
// ── Vérifie si au moins un tronçon retour est accessible en aval depuis startNodeId ──
function hasRetourDownstream(startNodeId, allerSegs, retourSegs, flowDirections) {
  const visited = new Set()
  const queue = [startNodeId]
  while (queue.length > 0) {
    const nodeId = queue.shift()
    if (visited.has(nodeId)) continue
    visited.add(nodeId)
    for (const seg of retourSegs) {
      const d = flowDirections.get(seg.id)
      if (d?.fromId === nodeId) return true
    }
    for (const seg of allerSegs) {
      const d = flowDirections.get(seg.id)
      if (d?.fromId === nodeId && !visited.has(d.toId)) queue.push(d.toId)
    }
  }
  return false
}

export function buildECSFlowRows(segments, points, flowDirections, columns, columnXs, levels, lineYs, activeCalcId: CalcMode) {
  if (!segments?.length) return []
  const prodECS = points?.find(p => p.type === 'productionECS')
  if (!prodECS) return []

  const { isBouclage, isAlimECS } = getModeFlags(activeCalcId)

  const allerSegs  = segments.filter(s => s.type === 'aller')
  const retourSegs = segments.filter(s => s.type === 'retour')

  // ── allerHasRetour : aller segments ayant un retour accessible en aval ────
  const allerHasRetour = new Set()
  for (const seg of allerSegs) {
    const fd = flowDirections.get(seg.id)
    if (fd && hasRetourDownstream(fd.toId, allerSegs, retourSegs, flowDirections))
      allerHasRetour.add(seg.id)
  }

  // ── Nœuds atteignables via aller-avec-retour (exclut les tirages) ─────────
  const reachable = new Set([prodECS.id])
  let changed = true
  while (changed) {
    changed = false
    for (const s of allerSegs) {
      if (!allerHasRetour.has(s.id)) continue
      const d = flowDirections.get(s.id)
      if (d && reachable.has(d.fromId) && !reachable.has(d.toId)) {
        reachable.add(d.toId); changed = true
      }
    }
  }

  // ── Nombre de tronçons retour arrivant à chaque nœud (jonctions retour) ──
  const retourIncomingCount = new Map()
  for (const s of retourSegs) {
    const d = flowDirections.get(s.id)
    if (!d) continue
    retourIncomingCount.set(d.toId, (retourIncomingCount.get(d.toId) ?? 0) + 1)
  }
  const junctionEmitted = new Map()

  const visited    = new Set()
  const rows       = []
  const toProdRows = []   // tronçons retour arrivant à ECS → placés après flow-end

  // ── Colonne d'un point ────────────────────────────────────────────────────
  const getColFor = (ptId) => {
    const pt = points?.find(p => p.id === ptId)
    if (!pt) return null
    let levelId = null
    for (let i = 0; i < (levels?.length ?? 0); i++) {
      const yBot = lineYs?.[i], yTop = lineYs?.[i + 1]
      if (yTop == null) continue
      if (pt.y > yTop && pt.y <= yBot) { levelId = levels[i].id; break }
    }
    for (let i = 0; i < (columns?.length ?? 0); i++) {
      const cx1 = columnXs?.[i], cx2 = columnXs?.[i + 1]
      if (cx1 == null || cx2 == null) continue
      const col = columns[i]
      if (col.isGap) continue
      if (pt.x < cx1 || pt.x > cx2) continue
      const covers = col.levelIds === 'all' ||
        (Array.isArray(col.levelIds) && levelId && col.levelIds.includes(levelId))
      if (covers) return col.name
    }
    return null
  }

  const segColName = (seg) => {
    const fd = flowDirections.get(seg.id)
    const fc = getColFor(fd?.fromId ?? seg.startPointId)
    const tc = getColFor(fd?.toId   ?? seg.endPointId)
    return (fc && fc === tc) ? fc : null
  }

  const findBranchColumn = (aSeg) => {
    let col = segColName(aSeg)
    if (col) return col
    let cur = flowDirections.get(aSeg.id)?.toId
    const tempVis = new Set()
    while (cur) {
      const out = allerSegs.filter(s => {
        const d = flowDirections.get(s.id)
        return d?.fromId === cur && allerHasRetour.has(s.id) && !visited.has(s.id) && !tempVis.has(s.id)
      })
      if (out.length !== 1) break
      const s = out[0]; tempVis.add(s.id)
      col = segColName(s)
      if (col) return col
      cur = flowDirections.get(s.id).toId
    }
    return null
  }

  const xOf = (nodeId) => points.find(p => p.id === nodeId)?.x ?? Infinity

  // Prédicat topologique : y a-t-il une séparation aller en aval de nodeId ?
  const leadsToSeparation = (nodeId) => {
    let cur = nodeId
    const seen = new Set()
    while (!seen.has(cur)) {
      seen.add(cur)
      const out = allerSegs.filter(s =>
        flowDirections.get(s.id)?.fromId === cur && allerHasRetour.has(s.id))
      if (out.length > 1) return true
      if (out.length === 0) return false
      cur = flowDirections.get(out[0].id).toId
    }
    return false
  }

  // Suit récursivement une antenne (aller sans retour aval) depuis nodeId
  const followAntenne = (nodeId) => {
    const out = allerSegs.filter(s => {
      const d = flowDirections.get(s.id)
      return d?.fromId === nodeId && !visited.has(s.id) && !allerHasRetour.has(s.id)
    })
    out.sort((a, b) => xOf(flowDirections.get(a.id).toId) - xOf(flowDirections.get(b.id).toId))
    for (const seg of out) {
      visited.add(seg.id)
      rows.push({ kind: 'segment', seg, depth: 0, segType: 'aller', antenne: true })
      followAntenne(flowDirections.get(seg.id).toId)
    }
  }

  // ── Parcours principal ────────────────────────────────────────────────────
  // Suit le fluide depuis startNodeId jusqu'à une jonction incomplète ou ECS.
  const processFrom = (startNodeId, isTopLevel = false) => {
    let cur = startNodeId
    let allerEmitted = 0   // compte les tronçons aller émis dans CET appel

    while (true) {
      // ── Phase aller ──────────────────────────────────────────────────────
      const allerOut = allerSegs.filter(s => {
        const d = flowDirections.get(s.id)
        return d?.fromId === cur && !visited.has(s.id) && allerHasRetour.has(s.id)
      })

      if (allerOut.length === 1) {
        // Émettre les antennes depuis cur avant de continuer sur le bouclage principal
        followAntenne(cur)
        const seg = allerOut[0]; visited.add(seg.id)
        const toId = flowDirections.get(seg.id).toId
        const isCollecteur = leadsToSeparation(toId)
        // Séparateur uniquement après le 1er tronçon de l'appel principal (depuis prodECS)
        if (isTopLevel && isCollecteur && allerEmitted === 1)
          rows.push({ kind: 'collecteur-header', role: 'collecteur-aller' })
        rows.push({ kind: 'segment', seg, depth: 0, segType: 'aller',
          collecteur: isCollecteur ? 'aller' : undefined })
        allerEmitted++
        cur = toId
        continue
      }

      if (allerOut.length > 1) {
        // Séparation : trier bouclage + antennes ensemble par x
        const antenneFromCur = allerSegs.filter(s => {
          const d = flowDirections.get(s.id)
          return d?.fromId === cur && !visited.has(s.id) && !allerHasRetour.has(s.id)
        })
        const allBranches = [...allerOut, ...antenneFromCur]
        const sorted = allBranches.sort((a, b) =>
          xOf(flowDirections.get(a.id).toId) - xOf(flowDirections.get(b.id).toId))

        for (const branchSeg of sorted) {
          const branchToId = flowDirections.get(branchSeg.id).toId
          if (allerHasRetour.has(branchSeg.id)) {
            const branchIsCollecteur = leadsToSeparation(branchToId)
            if (branchIsCollecteur) {
              rows.push({ kind: 'collecteur-header', role: 'collecteur-aller' })
            } else {
              rows.push({ kind: 'col-header', name: findBranchColumn(branchSeg) ?? null })
            }
            visited.add(branchSeg.id)
            rows.push({ kind: 'segment', seg: branchSeg, depth: 0, segType: 'aller',
              collecteur: branchIsCollecteur ? 'aller' : undefined })
            processFrom(branchToId)
          } else {
            // Antenne : émettre et suivre jusqu'au bout
            visited.add(branchSeg.id)
            rows.push({ kind: 'segment', seg: branchSeg, depth: 0, segType: 'aller', antenne: true })
            followAntenne(branchToId)
          }
        }
        return
      }

      // ── Plus d'aller bouclage : émettre les antennes depuis cur avant le retour ──
      followAntenne(cur)

      // ── Phase retour (plus d'aller disponible) ───────────────────────────
      let collecteurRetourActif = false

      while (true) {
        const retourOut = retourSegs.filter(s => {
          const d = flowDirections.get(s.id)
          return d?.fromId === cur && !visited.has(s.id)
        })

        if (retourOut.length === 0) return   // impasse

        const seg = retourOut[0]; visited.add(seg.id)
        const nextNode = flowDirections.get(seg.id).toId

        // Collecteur-retour : part d'une jonction OU suite d'un collecteur-retour en série
        const isCollecteur = (retourIncomingCount.get(cur) ?? 0) > 1 || collecteurRetourActif
        collecteurRetourActif = isCollecteur

        // Tronçon retour arrivant directement à ECS → différé après flow-end
        if (nextNode === prodECS.id) {
          toProdRows.push({ kind: 'segment', seg, depth: 0, segType: 'retour',
            collecteur: isCollecteur ? 'retour' : undefined })
          return
        }

        rows.push({ kind: 'segment', seg, depth: 0, segType: 'retour',
          collecteur: isCollecteur ? 'retour' : undefined })

        const totalIn = retourIncomingCount.get(nextNode) ?? 0
        if (totalIn > 1) {
          // Nœud jonction : vérifier si toutes les branches sont traitées
          const emitted = (junctionEmitted.get(nextNode) ?? 0) + 1
          junctionEmitted.set(nextNode, emitted)
          if (emitted < totalIn) return       // jonction incomplète → on s'arrête
          rows.push({ kind: 'junction', ptId: nextNode, depth: 0, incomingCount: totalIn })
          collecteurRetourActif = false       // après une jonction, on repart en mode normal
        }

        cur = nextNode
      }
    }
  }

  // ── Lancement depuis Production ECS ──────────────────────────────────────
  rows.push({ kind: 'flow-start' })
  processFrom(prodECS.id, true)

  // Orphelins (tronçons non visités)
  for (const seg of segments) {
    if (!visited.has(seg.id))
      rows.push({ kind: 'segment', seg, depth: 0, segType: seg.type })
  }

  rows.push({ kind: 'flow-end' })
  // Tronçons retour arrivant à ECS → après "◀ Production ECS — Retour"
  rows.push(...toProdRows)
  // Jonction à ECS après les tronçons retour qui y arrivent
  if (toProdRows.length > 1)
    rows.push({ kind: 'junction', ptId: prodECS.id, depth: 0, incomingCount: toProdRows.length })

  // ── Filtres mode bouclage / alimentation ─────────────────────────────────
  let finalRows = rows
  if (isBouclage || isAlimECS) {
    finalRows = finalRows.filter(row => {
      if (row.kind !== 'segment' || row.segType !== 'aller') return true
      // Bouclage ECS : seulement les tronçons du bouclage (avec retour aval), pas les antennes
      if (isBouclage) return allerHasRetour.has(row.seg.id)
      // Alimentation ECS : tous les tronçons aller (bouclage + antennes)
      return true
    })
    if (isAlimECS) {
      finalRows = finalRows.filter(row =>
        !(row.kind === 'segment' && row.segType === 'retour') && row.kind !== 'junction')
    }
    finalRows = finalRows.filter((row, i) => {
      if (row.kind !== 'col-header') return true
      return finalRows[i + 1]?.kind === 'segment'
    })
  }

  const roleMap = new Map()
  for (const row of finalRows) {
    if (row.kind === 'segment') {
      roleMap.set(row.seg.id,
        row.antenne                   ? 'antenne'          :
        row.collecteur === 'aller'    ? 'collecteur-aller'  :
        row.collecteur === 'retour'   ? 'collecteur-retour' :
        row.segType === 'retour'      ? 'retour' : 'aller')
    }
  }

  // En bouclage-ecs, les antennes sont filtrées du tableau (finalRows) mais doivent
  // quand même figurer dans roleMap pour la détection UI (nommage, masquage Hydraulique…)
  if (isBouclage) {
    for (const row of rows) {
      if (row.kind === 'segment' && row.antenne && !roleMap.has(row.seg.id)) {
        roleMap.set(row.seg.id, 'antenne')
      }
    }
  }

  return { rows: finalRows, roleMap }
}

/**
 * Construit les lignes de tableau pour le mode Chauffage.
 * Même logique BFS que buildECSFlowRows mais pour aller-ch / retour-ch.
 * Rôles : collecteur-aller / collecteur-retour / antenne (Aller CH / Retour CH).
 *
 * Nœud jonction   = nœud connecté à ≥ 3 tronçons aller  (le flux aller se ramifie).
 * Nœud séparation = nœud connecté à ≥ 3 tronçons retour (les retours confluent).
 *
 * Aller CH (antenne)   : chemin du toId jusqu'à un émetteur sans nœud jonction.
 * Collecteur Aller CH  : chemin passe par un nœud jonction avant tout émetteur.
 * Retour CH (antenne)  : chemin du fromId jusqu'à un émetteur sans nœud séparation.
 * Collecteur Retour CH : chemin passe par un nœud séparation avant tout émetteur.
 */
export function buildChauffageFlowRows(segments, points, flowDirections, columns?, columnXs?, levels?, lineYs?) {
  if (!segments?.length) return { rows: [], roleMap: new Map() }
  const prod = points?.find((p: any) => p.type === 'productionChauffage')
  if (!prod) return { rows: [], roleMap: new Map() }

  const allerSegs  = segments.filter((s: any) => s.type === 'aller-ch' || s.type === 'aller')
  const retourSegs = segments.filter((s: any) => s.type === 'retour-ch' || s.type === 'retour')

  // Degré aller / retour par nœud (non-dirigé : toutes connexions comptent)
  const allerDegree  = new Map<string, number>()
  const retourDegree = new Map<string, number>()
  for (const s of allerSegs) {
    const d = flowDirections?.get(s.id); if (!d) continue
    allerDegree.set(d.fromId, (allerDegree.get(d.fromId) ?? 0) + 1)
    allerDegree.set(d.toId,   (allerDegree.get(d.toId)   ?? 0) + 1)
  }
  for (const s of retourSegs) {
    const d = flowDirections?.get(s.id); if (!d) continue
    retourDegree.set(d.fromId, (retourDegree.get(d.fromId) ?? 0) + 1)
    retourDegree.set(d.toId,   (retourDegree.get(d.toId)   ?? 0) + 1)
  }

  // Depuis un nœud aller, atteint-on un émetteur sans nœud jonction (allerDegree ≥ 3) ?
  const memoAller = new Map<string, boolean>()
  const isAntenneAllerFrom = (nodeId: string): boolean => {
    if (memoAller.has(nodeId)) return memoAller.get(nodeId)!
    const pt = points.find((p: any) => p.id === nodeId)
    if (pt?.type === 'emetteur') { memoAller.set(nodeId, true); return true }
    if ((allerDegree.get(nodeId) ?? 0) >= 3) { memoAller.set(nodeId, false); return false }
    const outgoing = allerSegs.filter((s: any) => flowDirections?.get(s.id)?.fromId === nodeId)
    const result = outgoing.some((s: any) => {
      const toId = flowDirections?.get(s.id)?.toId
      return toId != null && isAntenneAllerFrom(toId)
    })
    memoAller.set(nodeId, result)
    return result
  }

  // Depuis un nœud retour (amont), atteint-on un émetteur sans nœud séparation (retourDegree ≥ 3) ?
  const memoRetour = new Map<string, boolean>()
  const isAntenneRetourFrom = (nodeId: string): boolean => {
    if (memoRetour.has(nodeId)) return memoRetour.get(nodeId)!
    const pt = points.find((p: any) => p.id === nodeId)
    if (pt?.type === 'emetteur') { memoRetour.set(nodeId, true); return true }
    if ((retourDegree.get(nodeId) ?? 0) >= 3) { memoRetour.set(nodeId, false); return false }
    const incoming = retourSegs.filter((s: any) => flowDirections?.get(s.id)?.toId === nodeId)
    const result = incoming.some((s: any) => {
      const fromId = flowDirections?.get(s.id)?.fromId
      return fromId != null && isAntenneRetourFrom(fromId)
    })
    memoRetour.set(nodeId, result)
    return result
  }

  const makeSegRow = (seg: any, segType: 'aller' | 'retour') => {
    const d = flowDirections?.get(seg.id)
    const isAllerSeg = segType === 'aller'
    const antenne = d != null && (isAllerSeg
      ? isAntenneAllerFrom(d.toId)
      : isAntenneRetourFrom(d.fromId))
    const collecteur = antenne ? undefined : (isAllerSeg ? 'aller' : 'retour')
    return { kind: 'segment', seg, depth: 0, segType, antenne, collecteur }
  }

  // ── Colonne d'un point ────────────────────────────────────────────────────
  const getColFor = (ptId) => {
    const pt = points?.find((p: any) => p.id === ptId)
    if (!pt) return null
    let levelId = null
    for (let i = 0; i < (levels?.length ?? 0); i++) {
      const yBot = lineYs?.[i], yTop = lineYs?.[i + 1]
      if (yTop == null) continue
      if (pt.y > yTop && pt.y <= yBot) { levelId = levels[i].id; break }
    }
    for (let i = 0; i < (columns?.length ?? 0); i++) {
      const cx1 = columnXs?.[i], cx2 = columnXs?.[i + 1]
      if (cx1 == null || cx2 == null) continue
      const col = columns[i]
      if (col.isGap) continue
      if (pt.x < cx1 || pt.x > cx2) continue
      const covers = col.levelIds === 'all' ||
        (Array.isArray(col.levelIds) && levelId && col.levelIds.includes(levelId))
      if (covers) return col.name
    }
    return null
  }

  const segColName = (seg: any) => {
    const fd = flowDirections?.get(seg.id)
    const fc = getColFor(fd?.fromId ?? seg.startPointId)
    const tc = getColFor(fd?.toId   ?? seg.endPointId)
    return (fc && fc === tc) ? fc : null
  }

  const findBranchColumn = (aSeg: any) => {
    let col = segColName(aSeg)
    if (col) return col
    let cur = flowDirections?.get(aSeg.id)?.toId
    const tempVis = new Set<string>()
    while (cur) {
      const out = allerSegs.filter((s: any) => {
        const d = flowDirections?.get(s.id)
        return d?.fromId === cur && !visited.has(s.id) && !tempVis.has(s.id)
      })
      if (out.length !== 1) break
      const s = out[0]; tempVis.add(s.id)
      col = segColName(s)
      if (col) return col
      cur = flowDirections?.get(s.id)?.toId
    }
    return null
  }

  const retourIncomingCount = new Map<string, number>()
  for (const s of retourSegs) {
    const d = flowDirections?.get(s.id)
    if (!d) continue
    retourIncomingCount.set(d.toId, (retourIncomingCount.get(d.toId) ?? 0) + 1)
  }
  const junctionEmitted = new Map<string, number>()
  const visited = new Set<string>()
  const rows: any[] = []
  const toProdRows: any[] = []

  const xOf = (nodeId: string) => (points.find((p: any) => p.id === nodeId) as any)?.x ?? Infinity

  const processFrom = (startNodeId: string, isTopLevel = false) => {
    let cur = startNodeId
    let allerEmitted = 0
    while (true) {
      const allerOut = allerSegs.filter((s: any) => {
        const d = flowDirections?.get(s.id)
        return d?.fromId === cur && !visited.has(s.id)
      })

      if (allerOut.length === 1) {
        const seg = allerOut[0]; visited.add(seg.id)
        const toId = flowDirections.get(seg.id).toId
        const isCollecteur = !isAntenneAllerFrom(toId)
        if (isTopLevel && isCollecteur && allerEmitted === 1)
          rows.push({ kind: 'collecteur-header', role: 'collecteur-aller' })
        rows.push(makeSegRow(seg, 'aller'))
        allerEmitted++
        cur = toId
        continue
      }

      if (allerOut.length > 1) {
        const sorted = [...allerOut].sort((a, b) =>
          xOf(flowDirections.get(a.id).toId) - xOf(flowDirections.get(b.id).toId))
        for (const branchSeg of sorted) {
          const branchToId = flowDirections.get(branchSeg.id).toId
          const branchIsAntenne = isAntenneAllerFrom(branchToId)
          if (branchIsAntenne) {
            rows.push({ kind: 'col-header', name: findBranchColumn(branchSeg) ?? null })
          } else {
            rows.push({ kind: 'collecteur-header', role: 'collecteur-aller' })
          }
          visited.add(branchSeg.id)
          rows.push(makeSegRow(branchSeg, 'aller'))
          processFrom(branchToId)
        }
        return
      }

      while (true) {
        const retourOut = retourSegs.filter((s: any) => {
          const d = flowDirections?.get(s.id)
          return d?.fromId === cur && !visited.has(s.id)
        })
        if (retourOut.length === 0) return

        const seg = retourOut[0]; visited.add(seg.id)
        const nextNode = flowDirections.get(seg.id).toId

        if (nextNode === prod.id) {
          toProdRows.push(makeSegRow(seg, 'retour'))
          return
        }

        rows.push(makeSegRow(seg, 'retour'))

        const totalIn = retourIncomingCount.get(nextNode) ?? 0
        if (totalIn > 1) {
          const emitted = (junctionEmitted.get(nextNode) ?? 0) + 1
          junctionEmitted.set(nextNode, emitted)
          if (emitted < totalIn) return
          rows.push({ kind: 'junction', ptId: nextNode, depth: 0, incomingCount: totalIn })
        }
        cur = nextNode
      }
    }
  }

  rows.push({ kind: 'flow-start' })
  processFrom(prod.id, true)

  for (const seg of [...allerSegs, ...retourSegs]) {
    if (!visited.has(seg.id)) {
      const segType: 'aller' | 'retour' = (seg.type === 'aller-ch' || seg.type === 'aller') ? 'aller' : 'retour'
      rows.push(makeSegRow(seg, segType))
    }
  }

  rows.push({ kind: 'flow-end' })
  rows.push(...toProdRows)
  if (toProdRows.length > 1)
    rows.push({ kind: 'junction', ptId: prod.id, depth: 0, incomingCount: toProdRows.length })

  // Supprimer les col-header orphelins (non suivis d'un segment)
  const finalRows = rows.filter((row, i) => {
    if (row.kind !== 'col-header') return true
    return rows[i + 1]?.kind === 'segment'
  })

  const roleMap = new Map<string, string>()
  for (const row of finalRows) {
    if (row.kind === 'segment')
      roleMap.set(row.seg.id,
        row.antenne             ? 'antenne'           :
        row.collecteur === 'aller'  ? 'collecteur-aller'  :
        row.collecteur === 'retour' ? 'collecteur-retour' :
        row.segType === 'retour'    ? 'retour'            : 'aller')
  }

  return { rows: finalRows, roleMap }
}

/**
 * Construit les lignes de tableau pour le mode Alimentation EF.
 * Retourne un tableau : une entrée par arrivée EF → { sourceId, rows, roleMap }.
 * Chaque tronçon n'apparaît que dans le tableau de la source la plus proche.
 */
export function buildFlowRowsEF(segments, points, flowDirections, columns, columnXs, levels, lineYs) {
  const sources = points.filter(p => p.type === 'arriveeEF')
  if (!sources.length) return []

  const allerSegs = segments.filter(s => s.type === 'aller' && flowDirections.get(s.id) != null)
  const globalVisited = new Set()

  const getColFor = (ptId) => {
    const pt = points?.find(p => p.id === ptId)
    if (!pt) return null
    let levelId = null
    for (let i = 0; i < (levels?.length ?? 0); i++) {
      const yBot = lineYs?.[i], yTop = lineYs?.[i + 1]
      if (yTop == null) continue
      if (pt.y > yTop && pt.y <= yBot) { levelId = levels[i].id; break }
    }
    for (let i = 0; i < (columns?.length ?? 0); i++) {
      const cx1 = columnXs?.[i], cx2 = columnXs?.[i + 1]
      if (cx1 == null || cx2 == null) continue
      const col = columns[i]
      if (col.isGap) continue
      if (pt.x < cx1 || pt.x > cx2) continue
      const covers = col.levelIds === 'all' ||
        (Array.isArray(col.levelIds) && levelId && col.levelIds.includes(levelId))
      if (covers) return col.name
    }
    return null
  }

  const segColName = (seg) => {
    const fd = flowDirections.get(seg.id)
    const fc = getColFor(fd?.fromId ?? seg.startPointId)
    const tc = getColFor(fd?.toId   ?? seg.endPointId)
    return (fc && fc === tc) ? fc : null
  }

  const buildSourceRows = (srcId) => {
    const srcPt = points.find(p => p.id === srcId)
    const visitedLocal = new Set()

    const getOutgoing = (nodeId) =>
      allerSegs.filter(s => {
        const d = flowDirections.get(s.id)
        return d?.fromId === nodeId && !globalVisited.has(s.id) && !visitedLocal.has(s.id)
      })

    const xOf = (nodeId) => {
      const pt = points.find(p => p.id === nodeId)
      return pt ? pt.x : Infinity
    }

    const sortSegs = (segs) => [...segs].sort((a, b) =>
      xOf(flowDirections.get(a.id)?.toId) - xOf(flowDirections.get(b.id)?.toId))

    const findBranchColumn = (aSeg) => {
      let col = segColName(aSeg)
      if (col) return col
      let cur = flowDirections.get(aSeg.id)?.toId
      const tempVis = new Set()
      while (cur) {
        const out = allerSegs.filter(s => {
          const d = flowDirections.get(s.id)
          return d?.fromId === cur && !globalVisited.has(s.id) && !visitedLocal.has(s.id) && !tempVis.has(s.id)
        })
        if (out.length !== 1) break
        const s = out[0]; tempVis.add(s.id)
        col = segColName(s)
        if (col) return col
        cur = flowDirections.get(s.id).toId
      }
      return null
    }

    const dfs = (nodeId) => {
      const rows = []
      const series = []
      let cur = nodeId
      while (true) {
        const out = getOutgoing(cur)
        if (out.length !== 1) break
        const seg = out[0]
        visitedLocal.add(seg.id)
        series.push(seg)
        cur = flowDirections.get(seg.id).toId
      }
      for (const seg of series) {
        rows.push({ kind: 'segment', seg, depth: 0, segType: 'aller' })
      }
      const branches = getOutgoing(cur)
      if (branches.length > 1) {
        rows.push({ kind: 'separation', ptId: cur, branchCount: branches.length })
        for (const seg of sortSegs(branches)) {
          visitedLocal.add(seg.id)
          const branchSegRow: any = { kind: 'segment', seg, depth: 0, segType: 'aller' }
          const subRows = dfs(flowDirections.get(seg.id).toId)
          const isLeaf = !subRows.some((r: any) => r.kind === 'separation')
          if (isLeaf) {
            branchSegRow.leafBranch = true
            for (const r of subRows) if (r.kind === 'segment') (r as any).leafBranch = true
            const branchCol = findBranchColumn(seg)
            if (branchCol) rows.push({ kind: 'col-header', name: branchCol })
          } else {
            rows.push({ kind: 'collecteur-header' })
          }
          rows.push(branchSegRow)
          rows.push(...subRows)
        }
      }
      return rows
    }

    const contentRows = dfs(srcId)
    for (const row of contentRows) {
      if (row.kind === 'segment') globalVisited.add(row.seg.id)
    }

    let rows = [{ kind: 'flow-start' }, ...contentRows, { kind: 'flow-end' }]
    rows = rows.filter((row, i) => {
      if (row.kind !== 'col-header') return true
      return rows[i + 1]?.kind === 'segment'
    })

    const roleMap = new Map()
    for (const row of rows) {
      if (row.kind === 'segment') roleMap.set(row.seg.id, (row as any).leafBranch ? 'leaf-branch' : 'aller')
    }
    return { rows, roleMap }
  }

  const result = sources.map(src => ({ sourceId: src.id, ...buildSourceRows(src.id) }))

  // Orphans non réclamés → premier tableau
  const orphans = allerSegs.filter(s => !globalVisited.has(s.id))
  if (orphans.length > 0 && result.length > 0) {
    const orphanRows = orphans.map(seg => ({ kind: 'segment', seg, depth: 0, segType: 'aller' }))
    result[0].rows.push(...orphanRows)
    for (const seg of orphans) result[0].roleMap.set(seg.id, 'aller')
  }

  return result
}
