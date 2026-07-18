import type { CalcMode } from '../types'
import { findLevelIndexAt } from './levelUtils'
import { getNodeLocation, buildECSDistances, buildRetourDistances } from './pointLocation'
import { getModeFlags } from './calcModeFlags'
import { EMETTEUR_TYPES } from '../data/emetteurs'
import { TERMINAL_FROID_TYPES } from '../data/terminauxFroids'

export { getNodeLocation }

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
function findAntenneColLoc(seg, allSegs, roleMap, allerDist, levels, lineYs, columns, columnXs) {
  if (!allSegs || !roleMap || !allerDist) return null
  const verts = seg.vertices ?? []
  if (!verts.length) return null

  const s0 = verts[0], sN = verts[verts.length - 1]
  const h0 = verts.length > 1 ? verts[1]                : null
  const hN = verts.length > 1 ? verts[verts.length - 2] : null
  const startDist = allerDist.get(seg.startPointId) ?? Infinity
  const endDist   = allerDist.get(seg.endPointId)   ?? Infinity

  const [fromV, fromHint, fromPtId] = startDist <= endDist
    ? [s0, h0, seg.startPointId]
    : [sN, hN, seg.endPointId]
  const myMinDist = Math.min(startDist, endDist)

  const colLoc = getVertexColLoc(fromV, fromHint, levels, lineYs, columns, columnXs)
  if (colLoc) return colLoc

  for (const s of allSegs) {
    if (s.id === seg.id || s.type !== 'aller') continue
    if (roleMap.get(s.id) !== 'antenne') continue
    if (s.startPointId !== fromPtId && s.endPointId !== fromPtId) continue
    const sMinDist = Math.min(
      allerDist.get(s.startPointId) ?? Infinity,
      allerDist.get(s.endPointId)   ?? Infinity,
    )
    if (sMinDist >= myMinDist) continue
    const result = findAntenneColLoc(s, allSegs, roleMap, allerDist, levels, lineYs, columns, columnXs)
    if (result) return result
  }
  return null
}

// Nom par défaut d'un tronçon, sans disambiguation.
export function getDefaultSegName(seg, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist = null, retourDist = null, role = null, activeCalcId: CalcMode | null | string = null, allSegs = null, roleMap = null, flowDirections = null) {
  const { isBouclage, isAlimECS, isAlimEF, isChauffage: isChauffageMode, isEauGlacee: isEauGlaceeMode } = getModeFlags(activeCalcId as CalcMode | null)
  const isChaufSeg = seg.type === 'aller-ch' || seg.type === 'retour-ch'
    || (isChauffageMode && (seg.type === 'aller' || seg.type === 'retour'))
  const isEGSeg    = isEauGlaceeMode && (seg.type === 'aller' || seg.type === 'retour')
  const isRetourCh = isChaufSeg && (seg.type === 'retour-ch' || seg.type === 'retour')
  const isRetourEG = isEGSeg && seg.type === 'retour'
  const ecsDistances = allerDist
  if (!seg.vertices?.length) return ''
  const verts    = seg.vertices
  const startV   = verts[0]
  const endV     = verts[verts.length - 1]
  const startHint = verts.length > 1 ? verts[1]                : null
  const endHint   = verts.length > 1 ? verts[verts.length - 2] : null

  // Bypass retour CH : la chaîne physique depuis ce tronçon mène d'un côté au nœud mélange
  // (≥2 aller + ≥1 retour) et de l'autre au nœud séparation (≥3 retour).
  const isBypassToMixing = (isRetourCh || isRetourEG) && allSegs != null && (() => {
    const segs = allSegs as any[]
    const nRetour = (ptId: string) => segs.filter(s =>
      (s.type === 'retour' || s.type === 'retour-ch') &&
      (s.startPointId === ptId || s.endPointId === ptId)).length
    const nAller  = (ptId: string) => segs.filter(s =>
      (s.type === 'aller' || s.type === 'aller-ch') &&
      (s.startPointId === ptId || s.endPointId === ptId)).length
    const isMixing = (ptId: string) => nAller(ptId) >= 2 && nRetour(ptId) >= 1
    const isSep    = (ptId: string) => nRetour(ptId) >= 3

    // Traverse les tronçons retour depuis startPtId (sans repasser par fromSegId).
    // Retourne 'mixing' | 'separation' | 'none'.
    const traverse = (startPtId: string, fromSegId: string): 'mixing' | 'separation' | 'none' => {
      const visitedSegs = new Set<string>([fromSegId])
      const visitedPts  = new Set<string>()
      const queue = [startPtId]
      while (queue.length > 0) {
        const ptId = queue.shift()!
        if (visitedPts.has(ptId)) continue
        visitedPts.add(ptId)
        if (isMixing(ptId)) return 'mixing'
        if (isSep(ptId))    return 'separation'
        for (const s of segs) {
          if (visitedSegs.has(s.id)) continue
          if (s.type !== 'retour' && s.type !== 'retour-ch') continue
          if (s.startPointId === ptId) { visitedSegs.add(s.id); queue.push(s.endPointId) }
          else if (s.endPointId === ptId) { visitedSegs.add(s.id); queue.push(s.startPointId) }
        }
      }
      return 'none'
    }

    const fromStart = traverse(seg.startPointId, seg.id)
    const fromEnd   = traverse(seg.endPointId,   seg.id)
    return (fromStart === 'mixing' && fromEnd === 'separation') ||
           (fromEnd   === 'mixing' && fromStart === 'separation')
  })()

  const prefix = isAlimEF ? 'EF'
    : isRetourCh  && isBypassToMixing            ? 'Retour CH vers mélange'
    : isRetourCh  && role === 'collecteur-retour' ? 'Collecteur Retour CH'
    : isRetourCh  ? 'Retour CH'
    : isChaufSeg  && role === 'collecteur-aller'  ? 'Collecteur Aller CH'
    : isChaufSeg  ? 'Aller CH'
    : isRetourEG  && isBypassToMixing            ? 'Retour EG vers mélange'
    : isRetourEG  && role === 'collecteur-retour' ? 'Collecteur Retour EG'
    : isRetourEG  ? 'Retour EG'
    : isEGSeg     && role === 'collecteur-aller'  ? 'Collecteur Aller EG'
    : isEGSeg     ? 'Aller EG'
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

  const specialLabel = (ptId, v, hint) => {
    const sp = specialPts?.find(p => p.id === ptId && (p.type === 'pump' || p.type === 'productionECS' || p.type === 'arriveeEF'))
    if (!sp) return null
    const lvl = getLevelName(v, hint)
    if (sp.type === 'pump')      return `${sp.name} (${lvl})`
    if (sp.type === 'arriveeEF') return sp.name ? `${sp.name} (${lvl})` : `Arrivée EF (${lvl})`
    return `Production ECS (${lvl})`
  }

  const startL = specialLabel(seg.startPointId, startV, startHint)
    ?? getNodeLocation(startV, levels, lineYs, columns, columnXs, chaufferie, startHint, specialPts)
  const endL = specialLabel(seg.endPointId, endV, endHint)
    ?? getNodeLocation(endV, levels, lineYs, columns, columnXs, chaufferie, endHint, specialPts)

  if (seg.type === 'retour' && retourDist?.size) {
    const startD = retourDist.get(seg.startPointId) ?? -Infinity
    const endD   = retourDist.get(seg.endPointId)   ?? -Infinity
    const putStartFirst = startD >= endD
    const [firstL, secondL] = putStartFirst ? [startL, endL] : [endL, startL]
    return `${prefix} – ${firstL} → ${secondL}`
  }
  if (ecsDistances?.size) {
    const startDist = ecsDistances.get(seg.startPointId) ?? Infinity
    const endDist   = ecsDistances.get(seg.endPointId)   ?? Infinity
    const putStartFirst = startDist <= endDist
    const [firstL, secondL] = putStartFirst ? [startL, endL] : [endL, startL]

    if (role === 'antenne' && (isAlimECS || isBouclage)) {
      const colLoc = findAntenneColLoc(seg, allSegs, roleMap, ecsDistances, levels, lineYs, columns, columnXs)
      if (colLoc) return `${prefix} – ${colLoc} → ${colLoc}`
    }

    return `${prefix} – ${firstL} → ${secondL}`
  }
  if (isAlimEF && flowDirections) {
    const fd = (flowDirections as Map<string, { fromId: string; toId: string }>).get(seg.id)
    if (fd) {
      const [firstL, secondL] = seg.startPointId === fd.fromId ? [startL, endL] : [endL, startL]
      return `${prefix} – ${firstL} → ${secondL}`
    }
  }
  if (isChaufSeg || isEGSeg) {
    const fmtNode = (ptId: string, loc: string) => {
      const pt = specialPts?.find((p: any) => p.id === ptId)
      if (!pt) return loc
      if (pt.type === 'emetteur') {
        const typeName = EMETTEUR_TYPES.find(e => e.id === pt.emetteurType)?.label ?? 'Émetteur'
        return `${typeName} (${loc})`
      }
      if (pt.type === 'terminalFroid') {
        const typeName = TERMINAL_FROID_TYPES.find(t => t.id === pt.terminalFroidType)?.label ?? 'Terminal froid'
        return `${typeName} (${loc})`
      }
      return loc
    }
    if (flowDirections) {
      const fd = (flowDirections as Map<string, { fromId: string; toId: string }>).get(seg.id)
      if (fd) {
        const [firstL, secondL] = seg.startPointId === fd.fromId ? [startL, endL] : [endL, startL]
        return `${prefix} – ${fmtNode(fd.fromId, firstL)} → ${fmtNode(fd.toId, secondL)}`
      }
    }
    return `${prefix} – ${fmtNode(seg.startPointId, startL)} → ${fmtNode(seg.endPointId, endL)}`
  }
  return `${prefix} – ${startL} → ${endL}`
}

// ── Groupes de points de puisage ────────────────────────────────────────────

export function getDefaultGroupName(
  pt: any,
  allSegs: any[],
  flowDirections: Map<string, { fromId: string; toId: string }>,
  allerDist: Map<string, number>,
  roleMap: Map<string, string> | null,
  levels: any[], lineYs: number[], columns: any[], columnXs: number[]
): string {
  const li = findLevelIndexAt(pt.y, lineYs)
  let levelName = li >= 0 ? levels[li].name : '?'
  if (levelName === '?') {
    const topLine = lineYs[levels.length]
    if (topLine !== undefined && pt.y <= topLine) levelName = 'Toiture'
  }

  const incomingSegs = allSegs.filter(
    s => s.type === 'aller' && flowDirections.get(s.id)?.toId === pt.id
  )

  for (const seg of incomingSegs) {
    const colLoc = findAntenneColLoc(seg, allSegs, roleMap, allerDist, levels, lineYs, columns, columnXs)
    if (colLoc) return `Groupe de puisage - ${colLoc}`
  }

  return `Groupe de puisage - ${levelName}`
}

export function getDisplayGroupNames(
  allPts: any[],
  allSegs: any[],
  flowDirections: Map<string, { fromId: string; toId: string }>,
  allerDist: Map<string, number>,
  roleMap: Map<string, string> | null,
  levels: any[], lineYs: number[], columns: any[], columnXs: number[]
): Map<string, string> {
  const result  = new Map<string, string>()
  const groupes = allPts.filter(p => p.type === 'groupe')

  for (const pt of groupes) {
    if (pt.name) result.set(pt.id, pt.name)
  }

  const autoGroupes = groupes.filter(p => !p.name)
  const baseOf = new Map<string, string>()
  for (const pt of autoGroupes) {
    baseOf.set(pt.id, getDefaultGroupName(pt, allSegs, flowDirections, allerDist, roleMap, levels, lineYs, columns, columnXs))
  }

  const byBase = new Map<string, string[]>()
  for (const [id, base] of baseOf) {
    if (!byBase.has(base)) byBase.set(base, [])
    byBase.get(base)!.push(id)
  }

  for (const [base, ids] of byBase) {
    if (ids.length === 1) {
      result.set(ids[0], base)
    } else {
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

// Nom d'affichage final (avec suffixe " - n°x" si doublons, triés par sens d'écoulement).
export function getDisplayName(seg, allSegs, levels, lineYs, columns, columnXs, chaufferie, specialPts, role = null, activeCalcId: CalcMode | null | string = null, roleMap = null, flowDirections = null) {
  if (seg.name) return seg.name
  const allerDist  = buildECSDistances(allSegs, specialPts)
  const retourDist = buildRetourDistances(allSegs, specialPts)
  const { isAlimECS } = getModeFlags(activeCalcId as CalcMode | null)
  const base = getDefaultSegName(seg, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist, role, activeCalcId, allSegs, roleMap, flowDirections)

  const isAlimAntenne = role === 'antenne' && isAlimECS && roleMap != null

  let dupes
  if (isAlimAntenne) {
    dupes = allSegs.filter(s => !s.name &&
      getDefaultSegName(s, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist,
        roleMap.get(s.id) ?? null, activeCalcId, allSegs, roleMap, flowDirections) === base)
  } else {
    const baseRoute = getDefaultSegName(seg, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist, null, activeCalcId, allSegs, null, flowDirections)
    dupes = allSegs.filter(s => !s.name &&
      getDefaultSegName(s, levels, lineYs, columns, columnXs, chaufferie, specialPts, allerDist, retourDist, null, activeCalcId, allSegs, null, flowDirections) === baseRoute)
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
