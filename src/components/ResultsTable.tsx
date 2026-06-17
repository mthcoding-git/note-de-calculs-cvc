import React, { useRef, useEffect, useMemo } from 'react'
import { computeSegUI } from '../utils/thermalCalc'
import { getDisplayName } from '../utils/naming'
import { FITTING_TYPES, EQUIPMENT_TYPES } from '../utils/pdcCalc'

const fmt = (v, d) => { const n = Number(v); return typeof v === 'number' && Number.isFinite(n) ? n.toFixed(d) : '—' }
const TOTAL_COLS = 21
const ALIM_COLS  = 14

function pdcColCount(pdcParams) {
  const isDarcy       = pdcParams?.methodeReg === 'darcy-colebrook'
  const isAccessoires = pdcParams?.methodeSing === 'accessoires'
  const hasEquip      = !!pdcParams?.equipementsActifs
  const hasCoef       = !!pdcParams?.coefPompeActif
  const fixedCols = 3 + (isDarcy ? 5 : 4) + 2 + (isDarcy ? 6 : 0) + 2
  const singCols  = isAccessoires ? 5 : 1
  const equipCols = hasEquip ? 4 : 0
  const totalCols = 2 + (hasCoef ? 1 : 0) + 1
  return fixedCols + singCols + equipCols + totalCols
}

// ── Helpers ────────────────────────────────────────────────────────────────

function segSousSol(seg, levels, lineYs) {
  if (!seg.vertices?.length) return false
  const midY = seg.vertices.reduce((s, v) => s + v.y, 0) / seg.vertices.length
  for (let i = 0; i < levels.length; i++) {
    const yBot = lineYs[i], yTop = lineYs[i + 1]
    if (yTop !== undefined && midY >= yTop && midY <= yBot) return !!levels[i].isSousSol
  }
  return false
}

function segLevelName(seg, levels, lineYs) {
  if (!seg.vertices?.length) return '—'
  const midY = seg.vertices.reduce((s, v) => s + v.y, 0) / seg.vertices.length
  for (let i = 0; i < levels.length; i++) {
    const yBot = lineYs[i], yTop = lineYs[i + 1]
    if (yTop !== undefined && midY >= yTop && midY <= yBot)
      return levels[i].name || `Niv. ${i + 1}`
  }
  return '—'
}

function extractColonne(shortName, columns) {
  const parts = shortName.split(' → ')
  if (parts.length < 2) return null
  const clean = s => s.replace(/\s*-\s*n°\d+$/, '').replace(/\s*\([^)]+\)$/, '').trim()
  const nameFirst = clean(parts[0])
  const nameLast  = clean(parts[parts.length - 1])
  const isCol = n => columns?.some(c => !c.isGap && c.name === n)
  return (isCol(nameFirst) && nameFirst === nameLast) ? nameFirst : null
}

function tAvalStyle(T_aval, T_depart) {
  if (T_aval == null) return {}
  if (T_aval < 50) return { background: '#dc2626', color: '#fff', fontWeight: 700 }
  const ratio = Math.max(0, Math.min(1, (T_aval - 50) / Math.max(T_depart - 50, 1)))
  const hue   = Math.round(120 * ratio)
  return { background: `hsl(${hue},58%,91%)` }
}

// ── Ligne tronçon ──────────────────────────────────────────────────────────

function SegRow({ row, segments, points, materials, insulations,
                  levels, lineYs, columns, columnXs, chaufferie,
                  globalParams, networkFlows, thermalResults,
                  selectedIds, onSelectIds, rowRef, roleMap, activeCalcId }) {
  const { seg, depth, segType } = row

  const sr = thermalResults?.segResults?.get(seg.id)
  const fr = networkFlows?.get(seg.id)

  const mat    = materials?.find(m => m.id === seg.materialId)
  const dnDef  = mat?.dns.find(d => d.dn === seg.dn)
  const ins    = insulations?.find(i => i.id === seg.insulationId)

  const di          = seg.di_override ?? dnDef?.di
  const de          = seg.de_override ?? dnDef?.de
  const lambdaTube  = seg.lambda_tube_override ?? mat?.lambda
  const lambdaInsul = seg.lambda_insul_override ?? ins?.lambda
  const Ui          = computeSegUI(seg, materials, insulations, globalParams?.he ?? 10)

  const flowRate = fr?.flowRate
  const velocity = fr?.velocity
  const Q_W      = sr?.Q
  const T_amont  = sr?.T_from
  const T_aval   = sr?.T_to
  const deltaT   = sr?.deltaT
  const T_amb    = sr?.T_amb
  const T_depart = globalParams?.T_depart ?? 60
  const deltaTFromProd = T_aval != null ? T_depart - T_aval : null

  const role = roleMap?.get(seg.id)
  const isCollecteurRetour = role === 'collecteur-retour'
  const vMax = isCollecteurRetour ? 1.0 : 0.5
  const velocityRedMin    = seg.type === 'retour' && velocity != null && velocity < 0.2
  const velocityOrangeMax = seg.type === 'retour' && velocity != null && velocity > vMax
  const prodECS = points?.find(p => p.type === 'productionECS')
  const isLinkedToProdECS = prodECS != null
    && (seg.startPointId === prodECS.id || seg.endPointId === prodECS.id)
  const dtFromProdOrange = isLinkedToProdECS && seg.type === 'retour'
    && deltaTFromProd != null && deltaTFromProd > 5
  const tAvalStyleObj = tAvalStyle(T_aval, T_depart)

  const isSelected = selectedIds?.includes(seg.id)

  const cls = (isDefault) => isDefault ? 'rt-val-default' : 'rt-val-override'
  const matIsDefault  = seg.materialId == null
  const insIsDefault  = seg.insulationId == null
  const lenIsDefault  = seg.length_override == null
  const flowIsDefault = seg.flowRate == null && seg.velocity == null

  const shortName = getDisplayName(seg, segments, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(seg.id), activeCalcId, roleMap)
    .replace(/^((Collecteur (aller|retour)|Aller|Retour|Antenne) ECS|EF)\s*–\s*/, '')
  const colonneName = extractColonne(shortName, columns)
  const levelName   = segLevelName(seg, levels, lineYs)
  const indent      = depth * 13

  const isAller   = segType === 'aller'
  const isAntenne = role === 'antenne'
  const badgeText = isAntenne ? 'ANT' : role === 'collecteur-aller' ? 'CA' : role === 'collecteur-retour' ? 'CR' : isAller ? 'A' : 'R'
  const badgeCls  = isAntenne ? 'rt-badge-ant' : isAller ? 'rt-badge-a' : 'rt-badge-r'


  return (
    <tr ref={rowRef} className={`rt-row${isSelected ? ' rt-row-selected' : ''}`}
        onClick={() => onSelectIds([seg.id])}
        style={{ cursor: 'pointer' }}>

      <td className="rt-cell rt-cell-name" style={{ paddingLeft: 6 + indent }}>
        <span className={badgeCls}>{badgeText}</span>
        {depth > 0 && <span className="rt-depth">{'└─'}</span>}
        {isAntenne && <span style={{ marginRight: 4 }}>↳</span>}
        {shortName}
      </td>
      <td className="rt-cell rt-cell-sm">{levelName}</td>
      <td className="rt-cell rt-cell-sm">{colonneName ?? <span className="rt-val-default">—</span>}</td>

      <td className="rt-cell"><span className={cls(matIsDefault)}>{mat?.name ?? '—'}</span></td>
      <td className="rt-cell"><span className={cls(matIsDefault)}>{seg.dn ?? '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.di_override == null)}>{di != null ? fmt(di, 1) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.de_override == null)}>{de != null ? fmt(de, 1) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.lambda_tube_override == null)}>{lambdaTube != null ? fmt(lambdaTube, 0) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(lenIsDefault)}>{seg.length_override != null ? fmt(seg.length_override, 2) : '—'}</span></td>

      <td className="rt-cell"><span className={cls(insIsDefault)}>{ins?.name ?? '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.thickness == null)}>{seg.thickness != null ? fmt(seg.thickness, 0) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.lambda_insul_override == null)}>{lambdaInsul != null ? fmt(lambdaInsul, 3) : '—'}</span></td>

      <td className="rt-cell"><span className="rt-val-default">{T_amb != null ? fmt(T_amb, 1) : '—'}</span></td>
      <td className="rt-cell">{T_amont != null ? fmt(T_amont, 2) : '—'}</td>

      <td className="rt-cell"><span className={cls(flowIsDefault)}>{flowRate != null ? flowRate.toFixed(3) : '—'}</span></td>
      <td className="rt-cell" style={{
        color: velocityRedMin ? '#dc2626' : velocityOrangeMax ? '#f97316' : undefined,
        fontWeight: (velocityRedMin || velocityOrangeMax) ? 700 : undefined }}>
        {velocity != null ? fmt(velocity, 3) : '—'}
      </td>

      <td className="rt-cell rt-result rt-result-first">{Ui != null ? fmt(Ui, 3) : '—'}</td>
      <td className="rt-cell rt-result">{Q_W != null ? fmt(Q_W, 1) : '—'}</td>
      <td className="rt-cell rt-result" style={tAvalStyleObj}>
        {T_aval != null ? fmt(T_aval, 2) : '—'}
      </td>
      <td className="rt-cell rt-result">{deltaT != null ? fmt(deltaT, 2) : '—'}</td>
      <td className="rt-cell rt-result" style={{ color: dtFromProdOrange ? '#f97316' : undefined, fontWeight: dtFromProdOrange ? 700 : undefined }}>
        {deltaTFromProd != null ? fmt(deltaTFromProd, 2) : '—'}
      </td>
    </tr>
  )
}

// ── Ligne nœud de jonction ─────────────────────────────────────────────────

function JunctionRow({ row, thermalResults, globalParams, selectedIds, onSelectIds, rowRef }) {
  const { ptId, incomingCount } = row
  const T_mix      = thermalResults?.nodeTemps?.get(ptId)
  const isSelected = selectedIds?.includes(ptId)

  return (
    <tr ref={rowRef}
        className={`rt-junction-row${isSelected ? ' rt-row-selected' : ''}`}
        onClick={() => onSelectIds?.([ptId])}
        style={{ cursor: 'pointer' }}>
      <td colSpan={TOTAL_COLS} className="rt-junction-td">
        <span className="rt-junction-icon">⑂</span>
        <span className="rt-junction-title">Nœud</span>
        {incomingCount != null && (
          <span className="rt-junction-count"> · {incomingCount} tronçons</span>
        )}
        {T_mix != null && (
          <span className="rt-junction-temp"> — T&nbsp;=&nbsp;<strong>{fmt(T_mix, 2)} °C</strong></span>
        )}
      </td>
    </tr>
  )
}

// ── Ligne tronçon Alimentation ECS ────────────────────────────────────────

function SegRowAlim({ row, segments, points, materials, insulations,
                      levels, lineYs, columns, columnXs, chaufferie,
                      alimentationResults, selectedIds, onSelectIds, rowRef, roleMap, hideAllerBadge = false, activeCalcId }) {
  const { seg } = row

  const ar   = alimentationResults?.get(seg.id)
  const mat  = materials?.find(m => m.id === seg.materialId)
  const dnDef = mat?.dns.find(d => d.dn === seg.dn)
  const di   = seg.di_override ?? dnDef?.di

  const isSelected = selectedIds?.includes(seg.id)
  const isCollective = ar?.method === 'collective'
  const c = ar?.collective

  // Vitesse à partir de Qp et di (collectif seulement)
  const velocity = (isCollective && c?.Qp != null && di != null && di > 0)
    ? (c.Qp * 1e-3) / (Math.PI * (di / 2000) ** 2)
    : null

  const diOk      = ar?.di_min == null || di == null || di >= ar.di_min
  const collectDiOk = isCollective && (c?.di_min == null || di == null || di >= c.di_min)
  const diErr     = isCollective ? !collectDiOk : !diOk
  const velErr    = velocity != null && velocity > 2.0
  const velWarn   = velocity != null && velocity > 1.5 && velocity <= 2.0

  const shortName = getDisplayName(seg, segments, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(seg.id), activeCalcId, roleMap)
    .replace(/^((Collecteur (aller|retour)|Aller|Retour|Antenne) ECS|EF)\s*–\s*/, '')

  const methodLabel  = ar == null ? '—' : ar.method === 'individual' ? 'Individuelle' : 'Collective'
  const methodReason = ar == null ? '' : ar.method === 'collective'
    ? (ar.collectiveReason === 'N > 5' ? 'N>5' : 'X>15')
    : 'N≤5, X≤15'

  const role      = roleMap?.get(seg.id)
  const isAntenne = role === 'antenne'


  return (
    <tr ref={rowRef} className={`rt-row${isSelected ? ' rt-row-selected' : ''}`}
        onClick={() => onSelectIds([seg.id])}
        style={{ cursor: 'pointer' }}>

      {/* Tronçon */}
      <td className="rt-cell rt-cell-name" style={{ paddingLeft: 6 }}>
        {!hideAllerBadge && (
          isAntenne
            ? <span className="rt-badge-ant">ANT</span>
            : <span className="rt-badge-a">{role === 'collecteur-aller' ? 'CA' : 'A'}</span>
        )}
        {isAntenne && <span style={{ marginRight: 4 }}>↳</span>}
        {shortName}
      </td>

      {/* Niveau */}
      <td className="rt-cell rt-cell-sm">{segLevelName(seg, levels, lineYs)}</td>

      {/* Colonne */}
      <td className="rt-cell rt-cell-sm">{extractColonne(shortName, columns) ?? <span className="rt-val-default">—</span>}</td>

      {/* N appareils */}
      <td className="rt-cell">
        {ar != null ? ar.N : '—'}
      </td>

      {/* Méthode */}
      <td className="rt-cell">
        {ar == null ? '—' : (
          <span>
            {methodLabel}
            {methodReason ? <span style={{ color: '#6b7280', marginLeft: 3 }}>{methodReason}</span> : null}
          </span>
        )}
      </td>

      {/* Matériau */}
      <td className="rt-cell">
        <span className={seg.materialId == null ? 'rt-val-default' : 'rt-val-override'}>{mat?.name ?? '—'}</span>
      </td>

      {/* DN */}
      <td className="rt-cell">
        <span className={seg.dn == null ? 'rt-val-default' : 'rt-val-override'}>{seg.dn ?? '—'}</span>
      </td>

      {/* dᵢ effectif */}
      <td className="rt-cell">
        <span className={seg.di_override == null ? 'rt-val-default' : 'rt-val-override'}>{di != null ? fmt(di, 1) : '—'}</span>
      </td>

      <td className="rt-cell rt-result rt-result-first">
        {!isCollective && ar != null ? fmt(ar.X, 1) : '—'}
      </td>
      <td className="rt-cell rt-result">
        {isCollective && c?.Qs_for_y != null ? fmt(c.Qs_for_y, 3) : '—'}
      </td>
      <td className="rt-cell rt-result">
        {isCollective && c?.y != null ? fmt(c.y, 3) : '—'}
      </td>
      <td className="rt-cell rt-result">
        {isCollective && c?.Qp != null ? fmt(c.Qp, 3) : '—'}
      </td>
      <td className="rt-cell rt-result" style={{
        color: velErr ? '#dc2626' : velWarn ? '#f97316' : undefined,
        fontWeight: (velErr || velWarn) ? 700 : undefined,
      }}>
        {isCollective && velocity != null ? fmt(velocity, 2) : '—'}
      </td>
      <td className="rt-cell rt-result" style={{
        color: diErr ? '#dc2626' : undefined,
        fontWeight: diErr ? 700 : undefined,
      }}>
        {isCollective
          ? (c?.di_min != null ? fmt(c.di_min, 1) : '—')
          : (ar?.di_min != null ? fmt(ar.di_min, 1) : '—')
        }
      </td>
    </tr>
  )
}

// ── Ligne tronçon PDC ─────────────────────────────────────────────────────

function SegRowPdc({ row, segments, points, materials, levels, lineYs, columns, columnXs,
                     chaufferie, networkFlows, alimentationResults, pdcResult, pdcParams, cumDp, postJunction, pressionAval,
                     dpStatic, deltaH, pStatAval,
                     needsSingTot, needsEquipTot,
                     selectedIds, onSelectIds, rowRef, roleMap, activeCalcId }) {
  const { seg, depth, segType } = row

  const mat   = materials?.find(m => m.id === seg.materialId)
  const dnDef = mat?.dns.find(d => d.dn === seg.dn)
  const di    = seg.di_override ?? dnDef?.di
  const fr    = networkFlows?.get(seg.id)
  const isAlimEcs = activeCalcId === 'alimentation-ecs'
  const alimResult = isAlimEcs ? alimentationResults?.get(seg.id) : null
  const displayFlowRate = isAlimEcs
    ? (alimResult?.flowRateForPdc != null && alimResult.flowRateForPdc > 0 ? alimResult.flowRateForPdc * 3.6 : null)
    : (fr?.flowRate ?? null)

  const isDarcy       = pdcParams?.methodeReg === 'darcy-colebrook'
  const isAccessoires = pdcParams?.methodeSing === 'accessoires'
  const hasEquip      = !!pdcParams?.equipementsActifs
  const hasCoef       = !!pdcParams?.coefPompeActif
  const unite         = pdcParams?.uniteAffichage ?? 'Pa'

  const fmtDp = (pa) => {
    if (pa == null || !Number.isFinite(pa)) return '—'
    if (unite === 'mmCE') return `${(pa / 9.81).toFixed(0)}`
    if (unite === 'both') return `${Math.round(pa)} / ${(pa / 9.81).toFixed(0)}`
    return `${Math.round(pa)}`
  }

  const isSelected = selectedIds?.includes(seg.id)
  const isAller    = segType === 'aller'
  const role       = roleMap?.get(seg.id)
  const isAntenne  = role === 'antenne'
  const badgeText  = isAntenne ? 'ANT' : role === 'collecteur-aller' ? 'CA' : role === 'collecteur-retour' ? 'CR' : isAller ? 'A' : 'R'
  const badgeCls   = isAntenne ? 'rt-badge-ant' : isAller ? 'rt-badge-a' : 'rt-badge-r'
  const indent     = depth * 13

  const shortName = getDisplayName(seg, segments, levels, lineYs, columns, columnXs, chaufferie, points, role, activeCalcId, roleMap)
    .replace(/^((Collecteur (aller|retour)|Aller|Retour|Antenne) ECS|EF)\s*–\s*/, '')
  const colonneName = extractColonne(shortName, columns)
  const levelName   = segLevelName(seg, levels, lineYs)

  const activeFittings  = isAccessoires ? (seg.fittings ?? []).filter(f => (f.count ?? 0) > 0) : []
  const activeEquipment = hasEquip ? (seg.equipment ?? []) : []
  const nRows = Math.max(activeFittings.length, activeEquipment.length, 1)

  const noFittings  = activeFittings.length === 0
  const noEquipment = activeEquipment.length === 0

  const rs = (extraStyle: React.CSSProperties = {}) => ({
    rowSpan: nRows,
    style: { verticalAlign: 'middle' as const, ...extraStyle },
  })
  const subTd: React.CSSProperties = { fontSize: 10, color: '#6b7280', paddingTop: 2, paddingBottom: 2 }
  const emptyTd: React.CSSProperties = { ...subTd, textAlign: 'center', verticalAlign: 'middle' }
  const fDpTd: React.CSSProperties = needsSingTot  ? subTd : { ...subTd, fontWeight: 600, color: '#1e293b' }
  const eDpTd: React.CSSProperties = needsEquipTot ? subTd : { ...subTd, fontWeight: 600, color: '#1e293b' }

  const cls = (isDefault: boolean) => isDefault ? 'rt-val-default' : 'rt-val-override'
  const epsilonIsDefault = pdcParams?.roughnessMode !== 'par-materiau' || mat?.epsilon == null

  const rows: React.ReactElement[] = []

  for (let i = 0; i < nRows; i++) {
    const f    = activeFittings[i]
    const e    = activeEquipment[i]
    const fDef         = f ? FITTING_TYPES.find(t => t.id === f.type) : null
    const fLibOverride = f ? (pdcParams?.fittingOverrides?.[f.type] ?? null) : null
    const fCustomDef   = f ? ((pdcParams?.customFittings ?? []).find((t: any) => t.id === f.type)?.xi ?? null) : null
    const fXi          = f ? (f.xiOverride ?? fLibOverride ?? fDef?.xi ?? fCustomDef ?? 0) : null
    const fXiIsDefault = f != null && f.xiOverride == null && fLibOverride == null
    const fDp          = f && fXi != null ? fXi * (f.count ?? 1) * (pdcResult?.dynPressure ?? 0) : null
    const eDef         = e ? EQUIPMENT_TYPES.find(t => t.id === e.type) : null
    const eLibOverride = e ? (pdcParams?.equipmentOverrides?.[e.type] ?? null) : null
    const eCustomDef   = e ? ((pdcParams?.customEquipments ?? []).find((t: any) => t.id === e.type)?.kvDefault ?? null) : null
    const eKv          = e ? (e.kvOverride ?? eLibOverride ?? eDef?.kvDefault ?? eCustomDef ?? null) : null
    const eKvIsDefault = e != null && e.kvOverride == null && eLibOverride == null
    const eQ   = fr?.flowRate
    const eDp  = eKv && eQ ? Math.pow(eQ / eKv, 2) * 100000 : null

    const trCls  = `rt-row${isSelected ? ' rt-row-selected' : ''}`
    const onClick = () => onSelectIds([seg.id])

    if (i === 0) {
      rows.push(
        <tr key={`${seg.id}-0`} ref={rowRef} className={trCls} onClick={onClick} style={{ cursor: 'pointer' }}>

          {/* ── Identification (rowspan) ── */}
          <td className="rt-cell rt-cell-name" {...rs({ paddingLeft: 6 + indent })}>
            <span className={badgeCls}>{badgeText}</span>
            {depth > 0 && <span className="rt-depth">{'└─'}</span>}
            {isAntenne && <span style={{ marginRight: 4 }}>↳</span>}
            {shortName}
          </td>
          <td className="rt-cell rt-cell-sm" {...rs()}>{levelName}</td>
          <td className="rt-cell rt-cell-sm" {...rs()}>{colonneName ?? <span className="rt-val-default">—</span>}</td>

          {/* ── Canalisation (rowspan) ── */}
          <td className="rt-cell" {...rs()}><span className={seg.materialId == null ? 'rt-val-default' : 'rt-val-override'}>{mat?.name ?? '—'}</span></td>
          <td className="rt-cell" {...rs()}><span className={seg.dn == null ? 'rt-val-default' : 'rt-val-override'}>{seg.dn ?? '—'}</span></td>
          <td className="rt-cell" {...rs()}><span className={seg.di_override == null ? 'rt-val-default' : 'rt-val-override'}>{di != null ? fmt(di, 1) : '—'}</span></td>
          {isDarcy && <td className="rt-cell" {...rs()}><span className={epsilonIsDefault ? 'rt-val-default' : ''}>{pdcResult?.epsilon_used ?? '—'}</span></td>}
          <td className="rt-cell" {...rs()}><span className={seg.length_override == null ? 'rt-val-default' : 'rt-val-override'}>{seg.length_override != null ? fmt(seg.length_override, 2) : '—'}</span></td>

          {/* ── Hydraulique (rowspan) ── */}
          <td className="rt-cell" {...rs()}><span className={isAlimEcs ? 'rt-val-default' : (seg.flowRate == null ? 'rt-val-default' : 'rt-val-override')}>{displayFlowRate != null ? fmt(displayFlowRate, 3) : '—'}</span></td>
          <td className="rt-cell" {...rs()}>{pdcResult?.V != null ? fmt(pdcResult.V, 3) : '—'}</td>

          {/* ── Fluide (rowspan) — même style que résultats linéaires ── */}
          {isDarcy && <>
            <td className="rt-cell rt-result rt-result-first" {...rs()}>{pdcResult?.T_used != null ? fmt(pdcResult.T_used, 1) : '—'}</td>
            <td className="rt-cell rt-result" {...rs()}>{pdcResult?.rho != null ? fmt(pdcResult.rho, 2) : '—'}</td>
            <td className="rt-cell rt-result" {...rs()}>{pdcResult?.mu != null ? fmt(pdcResult.mu * 1e3, 3) : '—'}</td>
            <td className="rt-cell rt-result" {...rs()}>{pdcResult?.nu != null ? fmt(pdcResult.nu * 1e6, 3) : '—'}</td>
            <td className="rt-cell rt-result" {...rs()}>{pdcResult?.Re != null ? Math.round(pdcResult.Re).toLocaleString('fr') : '—'}</td>
            <td className="rt-cell rt-result" {...rs()}>{pdcResult?.lambda != null ? fmt(pdcResult.lambda, 5) : '—'}</td>
          </>}

          {/* ── Pertes linéaires (rowspan) ── */}
          <td className={`rt-cell rt-result${isDarcy ? ' rt-group-sep' : ' rt-result-first'}`} {...rs()}>{pdcResult?.J != null ? fmt(pdcResult.J, 1) : '—'}</td>
          <td className="rt-cell rt-result" {...rs()}>{pdcResult?.dpReg != null ? fmtDp(pdcResult.dpReg) : '—'}</td>

          {/* ── Accessoires — ligne 0 ── */}
          {isAccessoires ? <>
            {noFittings ? (
              <>
                <td className="rt-cell rt-group-sep" rowSpan={nRows} style={emptyTd}>—</td>
                <td className="rt-cell" rowSpan={nRows} style={emptyTd}>—</td>
                <td className="rt-cell" rowSpan={nRows} style={emptyTd}>—</td>
                <td className="rt-cell rt-result" rowSpan={nRows} style={emptyTd}>—</td>
              </>
            ) : (
              <>
                <td className="rt-cell rt-group-sep" style={subTd}>{f ? (fDef?.label ?? f.type) : '—'}</td>
                <td className="rt-cell" style={subTd}>{f ? (f.count ?? '—') : '—'}</td>
                <td className="rt-cell" style={subTd}><span className={cls(fXiIsDefault)}>{fXi ?? '—'}</span></td>
                <td className="rt-cell rt-result" style={fDpTd}>{fDp != null ? fmtDp(fDp) : '—'}</td>
              </>
            )}
            {needsSingTot && <td className="rt-cell rt-result" {...rs({ fontWeight: 600 })}>{pdcResult?.dpSing != null ? fmtDp(pdcResult.dpSing) : '—'}</td>}
          </> : (
            <td className="rt-cell rt-result rt-group-sep" {...rs()}>{pdcResult?.dpSing != null ? fmtDp(pdcResult.dpSing) : '—'}</td>
          )}

          {/* ── Équipements — ligne 0 ── */}
          {hasEquip && <>
            {noEquipment ? (
              <>
                <td className="rt-cell rt-group-sep" rowSpan={nRows} style={emptyTd}>—</td>
                <td className="rt-cell" rowSpan={nRows} style={emptyTd}>—</td>
                <td className="rt-cell rt-result" rowSpan={nRows} style={emptyTd}>—</td>
              </>
            ) : (
              <>
                <td className="rt-cell rt-group-sep" style={subTd}>{e ? (eDef?.label ?? e.type) : '—'}</td>
                <td className="rt-cell" style={subTd}><span className={cls(eKvIsDefault)}>{eKv ?? '—'}</span></td>
                <td className="rt-cell rt-result" style={eDpTd}>{eDp != null ? fmtDp(eDp) : '—'}</td>
              </>
            )}
            {needsEquipTot && <td className="rt-cell rt-result" {...rs({ fontWeight: 600 })}>{pdcResult?.dpEquip != null ? fmtDp(pdcResult.dpEquip) : '—'}</td>}
          </>}

          {/* ── Pertes totales frottement (rowspan) ── */}
          <td className="rt-cell rt-result rt-group-sep" {...rs({ fontWeight: 600 })}>{pdcResult?.dpTotal != null ? fmtDp(pdcResult.dpTotal) : '—'}</td>
          {hasCoef && <td className="rt-cell rt-result" {...rs({ fontWeight: 700 })}>{pdcResult?.dpPompe != null ? fmtDp(pdcResult.dpPompe) : '—'}</td>}
          {isAlimEcs ? (<>
            {/* ── Hauteur (rowspan) ── */}
            <td className="rt-cell rt-result rt-group-sep" {...rs({ color: deltaH != null && deltaH !== 0 ? '#0369a1' : undefined })}>
              {deltaH != null ? fmt(deltaH, 2) : '—'}
            </td>
            <td className="rt-cell rt-result" {...rs({ color: dpStatic != null && dpStatic !== 0 ? '#0369a1' : undefined })}>
              {dpStatic != null ? fmtDp(dpStatic) : '—'}
            </td>
            {/* ── Nœud aval (rowspan) ── */}
            <td className="rt-cell rt-result rt-group-sep" {...rs({
              fontWeight: pressionAval != null ? 600 : undefined,
              color: pressionAval != null && pressionAval < 0 ? '#dc2626' : undefined,
            })}>
              {pressionAval != null ? `${(pressionAval / 100000).toFixed(2)}` : '—'}
            </td>
            <td className="rt-cell rt-result" {...rs({
              fontWeight: pStatAval != null ? 600 : undefined,
              color: pStatAval != null && pStatAval > 400000 ? '#dc2626' : undefined,
            })}>
              {pStatAval != null ? `${(pStatAval / 100000).toFixed(2)}` : '—'}
            </td>
          </>) : (
            /* ── ΔP cumulé bouclage ── */
            <td className="rt-cell rt-result" {...rs({ fontWeight: cumDp != null ? 600 : undefined })}>
              {cumDp != null ? fmtDp(cumDp) : '—'}
            </td>
          )}
        </tr>
      )
    } else {
      rows.push(
        <tr key={`${seg.id}-${i}`} className={trCls} onClick={onClick} style={{ cursor: 'pointer' }}>
          {/* ── Accessoires — lignes suivantes (seulement si accessoires présents) ── */}
          {isAccessoires && !noFittings && <>
            <td className="rt-cell rt-group-sep" style={subTd}>{f ? (fDef?.label ?? f.type) : '—'}</td>
            <td className="rt-cell" style={subTd}>{f ? (f.count ?? '—') : '—'}</td>
            <td className="rt-cell" style={subTd}><span className={cls(fXiIsDefault)}>{fXi ?? '—'}</span></td>
            <td className="rt-cell rt-result" style={fDpTd}>{fDp != null ? fmtDp(fDp) : '—'}</td>
          </>}
          {/* ── Équipements — lignes suivantes (seulement si équipements présents) ── */}
          {hasEquip && !noEquipment && <>
            <td className="rt-cell rt-group-sep" style={subTd}>{e ? (eDef?.label ?? e.type) : '—'}</td>
            <td className="rt-cell" style={subTd}><span className={cls(eKvIsDefault)}>{eKv ?? '—'}</span></td>
            <td className="rt-cell rt-result" style={eDpTd}>{eDp != null ? fmtDp(eDp) : '—'}</td>
          </>}
        </tr>
      )
    }
  }

  return <>{rows}</>
}

// ── Export principal ───────────────────────────────────────────────────────

export default function ResultsTable({
  rows, roleMap,
  activeCalcId,
  calcSubMode,
  efFlowRowsArr,
  segments, points, materials, insulations,
  levels, lineYs, columns, columnXs, chaufferie,
  flowDirections, networkFlows, thermalResults,
  alimentationResults,
  pdcResults, pdcParams, pdcCumResults, pdcCumAlimResults, segToCol,
  globalParams, selectedIds, onSelectIds,
  height,
}) {
  const selectedRowRef = useRef(null)
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedIds])

  const isAlimMode = activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef'
  const isEF = activeCalcId === 'alimentation-ef'

  const displayRows = useMemo(() => {
    const result = []
    let lastCollecteurRole = null
    let pastFlowEnd = false
    let prevKind = null
    for (const row of (rows ?? [])) {
      if (row.kind === 'separation') continue
      if (row.kind === 'flow-end') pastFlowEnd = true
      // En alimentation, tous les segments aller sont avant flow-end → pastFlowEnd toujours false
      if (row.kind === 'segment' && (!pastFlowEnd || isAlimMode)) {
        const r = roleMap?.get(row.seg.id)
        const isCollecteur = r === 'collecteur-aller' || r === 'collecteur-retour'
        const afterBanner = prevKind === 'flow-start' || prevKind === 'flow-end' || prevKind === 'col-header' || prevKind === 'junction' || prevKind === 'collecteur-header'
        if (isCollecteur && r !== lastCollecteurRole && !afterBanner) {
          result.push({ kind: 'collecteur-header', role: r })
        }
        lastCollecteurRole = isCollecteur ? r : null
      } else if (row.kind !== 'segment') {
        lastCollecteurRole = null
      }
      prevKind = row.kind
      result.push(row)
    }
    return result
  }, [rows, roleMap, isAlimMode])

  const shared = {
    segments, points, materials, insulations,
    levels, lineYs, columns, columnXs, chaufferie,
    globalParams, networkFlows, thermalResults,
    selectedIds, onSelectIds, roleMap, activeCalcId,
  }

  const isAlim = activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef'
  const nCols  = isAlim ? ALIM_COLS : TOTAL_COLS

  const sharedAlim = {
    segments, points, materials, insulations,
    levels, lineYs, columns, columnXs, chaufferie,
    alimentationResults, selectedIds, onSelectIds, roleMap, activeCalcId,
  }

  // ── PDC ────────────────────────────────────────────────────────────────────
  const isPdc = (activeCalcId === 'bouclage-ecs' || activeCalcId === 'alimentation-ecs') && calcSubMode === 'pdc'
  if (isPdc) {
    const isAlimEcsPdc  = activeCalcId === 'alimentation-ecs'
    const isDarcy       = pdcParams?.methodeReg === 'darcy-colebrook'
    const isAccessoires = pdcParams?.methodeSing === 'accessoires'
    const hasEquip      = !!pdcParams?.equipementsActifs
    const hasCoef       = !!pdcParams?.coefPompeActif
    const unite         = pdcParams?.uniteAffichage ?? 'Pa'
    const dpUnit        = unite === 'mmCE' ? 'mmCE' : unite === 'both' ? 'Pa / mmCE' : 'Pa'

    // Colonnes "tot" uniquement si au moins un tronçon a >1 accessoire ou >1 équipement
    const needsSingTot = isAccessoires && displayRows.some(r =>
      r.kind === 'segment' && (r.seg.fittings ?? []).filter(f => (f.count ?? 0) > 0).length > 1
    )
    const needsEquipTot = hasEquip && displayRows.some(r =>
      r.kind === 'segment' && (r.seg.equipment ?? []).length > 1
    )

    const fixedCols = 3 + (isDarcy ? 5 : 4) + 2 + (isDarcy ? 6 : 0) + 2
    const singCols  = isAccessoires ? (4 + (needsSingTot ? 1 : 0)) : 1
    const equipCols = hasEquip ? (3 + (needsEquipTot ? 1 : 0)) : 0
    const totalCols = isAlimEcsPdc
      ? 5 + (hasCoef ? 1 : 0)   // ΔP pertes + majoré + Δh + ΔP hauteur + Pression dispo + Pression stat
      : 3 + (hasCoef ? 1 : 0)   // ΔP total + majoré + ΔP depuis prod. ECS
    const nPdcCols  = fixedCols + singCols + equipCols + totalCols

    const sharedPdc = {
      segments, points, materials, levels, lineYs, columns, columnXs, chaufferie,
      networkFlows, alimentationResults, pdcParams, needsSingTot, needsEquipTot, selectedIds, onSelectIds, roleMap, activeCalcId,
    }

    return (
      <div className="rt-panel" style={{ height: height ?? 320 }}>
        <div className="rt-table-scroll">
          <table className="rt-table">
            <thead>
              <tr className="rt-thead-group">
                <th colSpan={3} className="rt-thg">Identification</th>
                <th colSpan={isDarcy ? 5 : 4} className="rt-thg">Canalisation</th>
                <th colSpan={2} className="rt-thg">Hydraulique</th>
                <th colSpan={isDarcy ? 8 : 2} className="rt-thg rt-thg-result rt-th-result-first">Pertes linéaires</th>
                <th colSpan={isAccessoires ? (4 + (needsSingTot ? 1 : 0)) : 1} className="rt-thg rt-thg-result">Pertes singulières</th>
                {hasEquip && <th colSpan={3 + (needsEquipTot ? 1 : 0)} className="rt-thg rt-thg-result">Équipements</th>}
                {isAlimEcsPdc ? (<>
                  <th colSpan={1 + (hasCoef ? 1 : 0)} className="rt-thg rt-thg-result">Pertes de charge</th>
                  <th colSpan={2} className="rt-thg rt-thg-result">Hauteur statique</th>
                  <th colSpan={2} className="rt-thg rt-thg-result">Pression aval</th>
                </>) : (
                  <th colSpan={3 + (hasCoef ? 1 : 0)} className="rt-thg rt-thg-result">Total</th>
                )}
              </tr>
              <tr className="rt-thead-cols">
                <th className="rt-th">Tronçon</th>
                <th className="rt-th">Niveau</th>
                <th className="rt-th">Colonne</th>
                <th className="rt-th">Matériau</th>
                <th className="rt-th">DN</th>
                <th className="rt-th">dᵢ (mm)</th>
                {isDarcy && <th className="rt-th">ε (m)</th>}
                <th className="rt-th">L (m)</th>
                <th className="rt-th">Q (m³/h)</th>
                <th className="rt-th">V (m/s)</th>
                {isDarcy && <>
                  <th className="rt-th rt-th-result rt-th-result-first">T (°C)</th>
                  <th className="rt-th rt-th-result">ρ (kg/m³)</th>
                  <th className="rt-th rt-th-result">μ (×10⁻³ Pa·s)</th>
                  <th className="rt-th rt-th-result">ν (×10⁻⁶ m²/s)</th>
                  <th className="rt-th rt-th-result">Re</th>
                  <th className="rt-th rt-th-result">λ</th>
                </>}
                <th className={`rt-th rt-th-result${isDarcy ? ' rt-group-sep' : ' rt-th-result-first'}`}>J (Pa/m)</th>
                <th className="rt-th rt-th-result">ΔP lin ({dpUnit})</th>
                {isAccessoires ? <>
                  <th className="rt-th rt-th-result rt-group-sep">Accessoire</th>
                  <th className="rt-th rt-th-result">n</th>
                  <th className="rt-th rt-th-result">ξ</th>
                  <th className="rt-th rt-th-result">ΔP ({dpUnit})</th>
                  {needsSingTot && <th className="rt-th rt-th-result">ΔP sing tot ({dpUnit})</th>}
                </> : (
                  <th className="rt-th rt-th-result rt-group-sep">ΔP sing ({dpUnit})</th>
                )}
                {hasEquip && <>
                  <th className="rt-th rt-th-result rt-group-sep">Équipement</th>
                  <th className="rt-th rt-th-result">Kv</th>
                  <th className="rt-th rt-th-result">ΔP ({dpUnit})</th>
                  {needsEquipTot && <th className="rt-th rt-th-result">ΔP équip tot ({dpUnit})</th>}
                </>}
                <th className="rt-th rt-th-result rt-group-sep">{isAlimEcsPdc ? `ΔP pertes max (${dpUnit})` : `ΔP total (${dpUnit})`}</th>
                {hasCoef && <th className="rt-th rt-th-result">ΔP majoré ({dpUnit})</th>}
                {isAlimEcsPdc ? (<>
                  <th className="rt-th rt-th-result rt-group-sep">Δh tronçon (m)</th>
                  <th className="rt-th rt-th-result">ΔP hauteur statique ({dpUnit})</th>
                  <th className="rt-th rt-th-result rt-group-sep">Pression disponible aval (bar)</th>
                  <th className="rt-th rt-th-result">Pression statique aval (bar)</th>
                </>) : (
                  <th className="rt-th rt-th-result">ΔP depuis prod. ECS ({dpUnit})</th>
                )}
              </tr>
            </thead>
            <tbody>
              {displayRows.length === 0 && (
                <tr><td colSpan={nPdcCols} className="rt-empty">Aucun tronçon — tracez des tronçons et placez une Production ECS</td></tr>
              )}
              {displayRows.map((row, i) => {
                if (row.kind === 'flow-start') return (
                  <tr key="flow-start" className="rt-flow-banner rt-flow-banner-start">
                    <td colSpan={nPdcCols}>▶ Production ECS — Départ</td>
                  </tr>
                )
                if (row.kind === 'flow-end') return isAlimEcsPdc ? null : (
                  <tr key="flow-end" className="rt-flow-banner rt-flow-banner-end">
                    <td colSpan={nPdcCols}>◀ Production ECS — Retour</td>
                  </tr>
                )
                if (row.kind === 'collecteur-header') return (
                  <tr key={`coll-h-${row.role}-${i}`} className="rt-collecteur-header">
                    <td colSpan={nPdcCols} />
                  </tr>
                )
                if (row.kind === 'col-header') return (
                  <tr key={`col-${row.name}-${i}`} className="rt-col-sep">
                    <td colSpan={nPdcCols}>{row.name}</td>
                  </tr>
                )
                if (row.kind === 'junction') return (
                  <tr key={`junc-${row.ptId}-${i}`} className="rt-junction-row"
                      onClick={() => onSelectIds?.([row.ptId])} style={{ cursor: 'pointer' }}>
                    <td colSpan={nPdcCols} className="rt-junction-td">
                      <span className="rt-junction-icon">⑂</span>
                      <span className="rt-junction-title">Nœud</span>
                      {row.incomingCount != null && (
                        <span className="rt-junction-count"> · {row.incomingCount} tronçons</span>
                      )}
                    </td>
                  </tr>
                )
                if (row.kind !== 'segment') return null
                const pdcResult    = pdcResults?.get(row.seg.id)
                const cumDp        = isAlimEcsPdc
                  ? (pdcCumAlimResults?.segCumDp?.get(row.seg.id) ?? null)
                  : (pdcCumResults?.segCumDp?.get(row.seg.id) ?? null)
                const pressionAval = isAlimEcsPdc
                  ? (pdcCumAlimResults?.segPressionAval?.get(row.seg.id) ?? null)
                  : undefined
                const dpStatic     = isAlimEcsPdc
                  ? (pdcCumAlimResults?.segDpStatic?.get(row.seg.id) ?? null)
                  : undefined
                const deltaH       = isAlimEcsPdc
                  ? (pdcCumAlimResults?.segDeltaH?.get(row.seg.id) ?? null)
                  : undefined
                const pStatAval    = isAlimEcsPdc
                  ? (pdcCumAlimResults?.segPStatAval?.get(row.seg.id) ?? null)
                  : undefined
                const postJunc     = isAlimEcsPdc ? false : (pdcCumResults?.segPostJunction?.get(row.seg.id) ?? false)
                const isSelected   = selectedIds?.includes(row.seg.id)
                return (
                  <SegRowPdc key={row.seg.id} row={row}
                    pdcResult={pdcResult} cumDp={cumDp} postJunction={postJunc} pressionAval={pressionAval}
                    dpStatic={dpStatic} deltaH={deltaH} pStatAval={pStatAval}
                    selectedIds={selectedIds}
                    rowRef={isSelected ? selectedRowRef : null}
                    {...sharedPdc} />
                )
              })}
              {!isAlimEcsPdc && (() => {
                const critIds  = pdcCumResults?.criticalSegIds
                const critDp   = pdcCumResults?.criticalDp
                const leafId   = pdcCumResults?.criticalLeafSegId
                const critCol  = leafId ? (segToCol?.get(leafId) ?? null) : null
                const fmtCrit  = (pa: number) => {
                  if (unite === 'mmCE') return `${(pa / 9.81).toFixed(0)} mmCE`
                  if (unite === 'both') return `${Math.round(pa)} Pa / ${(pa / 9.81).toFixed(0)} mmCE`
                  return `${Math.round(pa)} Pa`
                }
                if (!critIds || critIds.size === 0) return null
                const critArr = Array.from(critIds)
                const isActive = critArr.every(id => selectedIds?.includes(id))
                return (
                  <tr>
                    <td colSpan={nPdcCols} style={{ padding: '6px 12px', borderTop: '1px solid #e5e7eb', background: '#f8fafc' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 10, color: '#374151' }}>
                          Circuit le plus défavorisé :
                          <strong style={{ marginLeft: 5, color: '#0f172a' }}>{critCol ?? '—'}</strong>
                          {critDp != null && (
                            <span style={{ marginLeft: 10, fontFamily: 'ui-monospace, monospace', color: '#2563eb', fontWeight: 600 }}>
                              ΔP cumulé = {fmtCrit(critDp)}
                            </span>
                          )}
                        </span>
                        <button
                          onClick={() => onSelectIds(isActive ? [] : critArr)}
                          style={{ fontSize: 9, padding: '2px 9px', borderRadius: 4, cursor: 'pointer',
                            background: isActive ? '#dbeafe' : '#e0f2fe',
                            border: `1px solid ${isActive ? '#93c5fd' : '#7dd3fc'}`,
                            color: isActive ? '#1d4ed8' : '#0369a1', fontWeight: 600,
                            flexShrink: 0 }}>
                          {isActive ? 'Désélectionner' : 'Voir le circuit'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })()}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  // ── EF : tableau unique multi-sources ──────────────────────────────────────
  if (isEF) {
    const sourceList = efFlowRowsArr ?? []
    return (
      <div className="rt-panel" style={{ height: height ?? 320 }}>
        <div className="rt-table-scroll">
          <table className="rt-table">
            <thead>
              <tr className="rt-thead-group">
                <th colSpan={5} className="rt-thg">Identification</th>
                <th colSpan={2} className="rt-thg">Canalisation</th>
                <th colSpan={6} className="rt-thg rt-thg-result rt-th-result-first">Résultats</th>
              </tr>
              <tr className="rt-thead-cols">
                <th className="rt-th">Tronçon</th>
                <th className="rt-th">Niveau</th>
                <th className="rt-th">Colonne</th>
                <th className="rt-th">N appareils en aval</th>
                <th className="rt-th">Méthode</th>
                <th className="rt-th">DN</th>
                <th className="rt-th">dᵢ (mm)</th>
                <th className="rt-th rt-th-result rt-th-result-first">Coeff. X</th>
                <th className="rt-th rt-th-result">Débit de base (l/s)</th>
                <th className="rt-th rt-th-result">Coeff. de simult. y</th>
                <th className="rt-th rt-th-result">Débit probable (l/s)</th>
                <th className="rt-th rt-th-result">Vitesse (m/s)</th>
                <th className="rt-th rt-th-result">dᵢ min. requis (mm)</th>
              </tr>
            </thead>
            <tbody>
              {sourceList.length === 0 ? (
                <tr><td colSpan={ALIM_COLS} className="rt-empty">Placez une arrivée EF et tracez des tronçons</td></tr>
              ) : sourceList.map(({ sourceId, rows: srcRows, roleMap: srcRoleMap }, srcIdx) => {
                const srcPt = points?.find(p => p.id === sourceId)
                const srcLabel = srcPt?.name || `Arrivée EF n°${srcIdx + 1}`
                const bannerLabel = `▶ ${srcLabel} — Départ`
                const srcSharedAlim = { ...sharedAlim, roleMap: srcRoleMap, hideAllerBadge: true }
                const srcDisplayRows = srcRows.filter(r => r.kind !== 'separation')
                return (
                  <React.Fragment key={sourceId ?? `src-${srcIdx}`}>
                    {srcIdx > 0 && (
                      <tr className="rt-ef-spacer"><td colSpan={ALIM_COLS} /></tr>
                    )}
                    <tr className="rt-flow-banner rt-flow-banner-ef-start">
                      <td colSpan={ALIM_COLS}>{bannerLabel}</td>
                    </tr>
                    {srcDisplayRows.filter(r => r.kind !== 'flow-start' && r.kind !== 'flow-end').map((row, i) => {
                      if (row.kind === 'col-header') return (
                        <tr key={`col-${row.name}-${i}`} className="rt-col-sep">
                          <td colSpan={ALIM_COLS}>{row.name}</td>
                        </tr>
                      )
                      if (row.kind !== 'segment') return null
                      const isSegSelected = selectedIds?.includes(row.seg.id)
                      return (
                        <SegRowAlim key={row.seg.id} row={row} selectedIds={selectedIds}
                          rowRef={isSegSelected ? selectedRowRef : null} {...srcSharedAlim} />
                      )
                    })}
                    {srcDisplayRows.filter(r => r.kind === 'segment').length === 0 && (
                      <tr><td colSpan={ALIM_COLS} className="rt-empty">Aucun tronçon connecté à cette arrivée EF</td></tr>
                    )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  return (
    <div className="rt-panel" style={{ height: height ?? 320 }}>
      <div className="rt-table-scroll">
        <table className="rt-table">
          <thead>
            {isAlim ? (
              <>
                <tr className="rt-thead-group">
                  <th colSpan={5} className="rt-thg">Identification</th>
                  <th colSpan={3} className="rt-thg">Canalisation</th>
                  <th colSpan={6} className="rt-thg rt-thg-result rt-th-result-first">Résultats</th>
                </tr>
                <tr className="rt-thead-cols">
                  <th className="rt-th">Tronçon</th>
                  <th className="rt-th">Niveau</th>
                  <th className="rt-th">Colonne</th>
                  <th className="rt-th">N appareils en aval</th>
                  <th className="rt-th">Méthode</th>
                  <th className="rt-th">Matériau</th>
                  <th className="rt-th">DN</th>
                  <th className="rt-th">dᵢ (mm)</th>
                  <th className="rt-th rt-th-result rt-th-result-first">Coeff. X</th>
                  <th className="rt-th rt-th-result">Débit de base (l/s)</th>
                  <th className="rt-th rt-th-result">Coeff. de simult. y</th>
                  <th className="rt-th rt-th-result">Débit probable (l/s)</th>
                  <th className="rt-th rt-th-result">Vitesse (m/s)</th>
                  <th className="rt-th rt-th-result">dᵢ min. requis (mm)</th>
                </tr>
              </>
            ) : (
              <>
                <tr className="rt-thead-group">
                  <th colSpan={3} className="rt-thg">Identification</th>
                  <th colSpan={6} className="rt-thg">Canalisation</th>
                  <th colSpan={3} className="rt-thg">Isolation</th>
                  <th colSpan={2} className="rt-thg">Thermique</th>
                  <th colSpan={2} className="rt-thg">Hydraulique</th>
                  <th colSpan={5} className="rt-thg rt-thg-result rt-th-result-first">Résultats</th>
                </tr>
                <tr className="rt-thead-cols">
                  <th className="rt-th">Tronçon</th>
                  <th className="rt-th">Niveau</th>
                  <th className="rt-th">Colonne</th>
                  <th className="rt-th">Matériau</th>
                  <th className="rt-th">DN</th>
                  <th className="rt-th">dᵢ (mm)</th>
                  <th className="rt-th">dₑ (mm)</th>
                  <th className="rt-th">λ_tube (W/m·K)</th>
                  <th className="rt-th">L (m)</th>
                  <th className="rt-th">Isolant</th>
                  <th className="rt-th">ép. (mm)</th>
                  <th className="rt-th">λ_isol (W/m·K)</th>
                  <th className="rt-th">T° amb (°C)</th>
                  <th className="rt-th">T amont (°C)</th>
                  <th className="rt-th">Débit (m³/h)</th>
                  <th className="rt-th">Vitesse (m/s)</th>
                  <th className="rt-th rt-th-result rt-th-result-first">Ui (W/m·K)</th>
                  <th className="rt-th rt-th-result">Pertes th. (W)</th>
                  <th className="rt-th rt-th-result">T aval (°C)</th>
                  <th className="rt-th rt-th-result">ΔT tronçon (°C)</th>
                  <th className="rt-th rt-th-result">ΔT/Dép. (°C)</th>
                </tr>
              </>
            )}
          </thead>
          <tbody>
            {displayRows.length === 0 && (
              <tr><td colSpan={nCols} className="rt-empty">Aucun tronçon — tracez des tronçons Aller/Retour ECS et placez une Production ECS</td></tr>
            )}
            {displayRows.map((row, i) => {
              if (row.kind === 'flow-start') return (
                <tr key="flow-start" className="rt-flow-banner rt-flow-banner-start">
                  <td colSpan={nCols}>▶ Production ECS — Départ</td>
                </tr>
              )
              if (row.kind === 'flow-end') {
                if (isAlim) return null
                return (
                  <tr key="flow-end" className="rt-flow-banner rt-flow-banner-end">
                    <td colSpan={nCols}>◀ Production ECS — Retour</td>
                  </tr>
                )
              }
              if (row.kind === 'collecteur-header') return (
                <tr key={`coll-h-${row.role}-${i}`} className="rt-collecteur-header">
                  <td colSpan={nCols} />
                </tr>
              )
              if (row.kind === 'col-header') return (
                <tr key={`col-${row.name}-${i}`} className="rt-col-sep">
                  <td colSpan={nCols}>{row.name}</td>
                </tr>
              )
              if (isAlim) {
                if (row.kind !== 'segment') return null
                const isSegSelected = selectedIds?.includes(row.seg.id)
                return (
                  <SegRowAlim key={row.seg.id} row={row} selectedIds={selectedIds}
                    rowRef={isSegSelected ? selectedRowRef : null} {...sharedAlim} />
                )
              }
              const isSegSelected  = row.kind === 'segment'  && selectedIds?.includes(row.seg.id)
              const isJuncSelected = row.kind === 'junction' && selectedIds?.includes(row.ptId)
              return row.kind === 'segment'
                ? <SegRow key={row.seg.id} row={row} selectedIds={selectedIds}
                    rowRef={isSegSelected ? selectedRowRef : null} {...shared} />
                : <JunctionRow key={`junc-${row.ptId}-${i}`} row={row}
                    thermalResults={thermalResults} globalParams={globalParams}
                    selectedIds={selectedIds} onSelectIds={onSelectIds}
                    rowRef={isJuncSelected ? selectedRowRef : null} />
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}