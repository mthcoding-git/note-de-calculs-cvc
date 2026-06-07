import React, { useRef, useEffect, useMemo } from 'react'
import { computeSegUI } from '../utils/thermalCalc'
import { getDisplayName } from '../utils/naming'

const fmt = (v, d) => v != null && !isNaN(v) ? Number(v).toFixed(d) : '—'
const TOTAL_COLS = 21
const ALIM_COLS  = 13

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
                  selectedIds, onSelectIds, rowRef, roleMap }) {
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

  const shortName = getDisplayName(seg, segments, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(seg.id))
    .replace(/^(Collecteur (aller|retour)|Aller|Retour) ECS\s*–\s*/, '')
  const colonneName = extractColonne(shortName, columns)
  const levelName   = segLevelName(seg, levels, lineYs)
  const indent      = depth * 13

  const isAller = segType === 'aller'
  const badgeText = role === 'collecteur-aller' ? 'CA' : role === 'collecteur-retour' ? 'CR' : isAller ? 'A' : 'R'

  return (
    <tr ref={rowRef} className={`rt-row${isSelected ? ' rt-row-selected' : ''}`}
        onClick={() => onSelectIds([seg.id])} style={{ cursor: 'pointer' }}>

      <td className="rt-cell rt-cell-name" style={{ paddingLeft: 6 + indent }}>
        <span className={isAller ? 'rt-badge-a' : 'rt-badge-r'}>{badgeText}</span>
        {depth > 0 && <span className="rt-depth">{'└─'}</span>}
        {shortName}
      </td>
      <td className="rt-cell rt-cell-sm">{levelName}</td>
      <td className="rt-cell rt-cell-sm">{colonneName ?? <span className="rt-val-default">—</span>}</td>

      <td className="rt-cell"><span className={cls(matIsDefault)}>{mat?.name ?? '—'}</span></td>
      <td className="rt-cell"><span className={cls(matIsDefault)}>{seg.dn ?? '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.di_override == null)}>{di != null ? fmt(di, 1) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.de_override == null)}>{de != null ? fmt(de, 1) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.lambda_tube_override == null)}>{lambdaTube != null ? fmt(lambdaTube, 0) : '—'}</span></td>

      <td className="rt-cell"><span className={cls(insIsDefault)}>{ins?.name ?? '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.thickness == null)}>{seg.thickness != null ? fmt(seg.thickness, 0) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.lambda_insul_override == null)}>{lambdaInsul != null ? fmt(lambdaInsul, 3) : '—'}</span></td>

      <td className="rt-cell"><span className={cls(lenIsDefault)}>{seg.length_override != null ? fmt(seg.length_override, 2) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(flowIsDefault)}>{flowRate != null ? flowRate.toFixed(3) : '—'}</span></td>

      <td className="rt-cell"><span className="rt-val-default">{T_amb != null ? fmt(T_amb, 1) : '—'}</span></td>
      <td className="rt-cell">{T_amont != null ? fmt(T_amont, 2) : '—'}</td>

      <td className="rt-cell rt-result">{Ui != null ? fmt(Ui, 3) : '—'}</td>
      <td className="rt-cell rt-result">{Q_W != null ? fmt(Q_W, 1) : '—'}</td>
      <td className="rt-cell rt-result" style={{
        color: velocityRedMin ? '#dc2626' : velocityOrangeMax ? '#f97316' : undefined,
        fontWeight: (velocityRedMin || velocityOrangeMax) ? 700 : undefined }}>
        {velocity != null ? fmt(velocity, 3) : '—'}
      </td>
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
                      alimentationResults, selectedIds, onSelectIds, rowRef, roleMap, hideAllerBadge }) {
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

  const shortName = getDisplayName(seg, segments, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(seg.id))
    .replace(/^(Collecteur (aller|retour)|Aller|Retour) ECS\s*–\s*/, '')

  const methodLabel  = ar == null ? '—' : ar.method === 'individual' ? 'Individuelle' : 'Collective'
  const methodReason = ar == null ? '' : ar.method === 'collective'
    ? (ar.collectiveReason === 'N > 5' ? 'N>5' : 'X>15')
    : 'N≤5, X≤15'

  return (
    <tr ref={rowRef} className={`rt-row${isSelected ? ' rt-row-selected' : ''}`}
        onClick={() => onSelectIds([seg.id])} style={{ cursor: 'pointer' }}>

      {/* Tronçon */}
      <td className="rt-cell rt-cell-name" style={{ paddingLeft: 6 }}>
        {!hideAllerBadge && (() => {
          const role = roleMap?.get(seg.id)
          return <span className="rt-badge-a">{role === 'collecteur-aller' ? 'CA' : 'A'}</span>
        })()}
        {shortName}
      </td>

      {/* Niveau */}
      <td className="rt-cell rt-cell-sm">{segLevelName(seg, levels, lineYs)}</td>

      {/* Colonne */}
      <td className="rt-cell rt-cell-sm">{extractColonne(shortName, columns) ?? <span className="rt-val-default">—</span>}</td>

      {/* Appareils en aval */}
      <td className="rt-cell" style={{ textAlign: 'center' }}>
        {ar != null ? ar.N : '—'}
      </td>

      {/* Méthode */}
      <td className="rt-cell" style={{ textAlign: 'center', fontSize: 10 }}>
        {ar == null ? '—' : (
          <span>
            {methodLabel}
            {methodReason ? <span style={{ color: '#6b7280', marginLeft: 3 }}>{methodReason}</span> : null}
          </span>
        )}
      </td>

      {/* DN */}
      <td className="rt-cell" style={{ textAlign: 'center' }}>
        <span className={seg.dn == null ? 'rt-val-default' : ''}>{seg.dn ?? '—'}</span>
      </td>

      {/* dᵢ effectif */}
      <td className="rt-cell" style={{
        textAlign: 'center',
        color: diErr ? '#dc2626' : undefined,
        fontWeight: diErr ? 700 : undefined,
      }}>
        {di != null ? fmt(di, 1) : '—'}
      </td>

      {/* Individuelle — Coeff. X */}
      <td className="rt-cell rt-result" style={{ textAlign: 'center' }}>
        {!isCollective && ar != null ? fmt(ar.X, 1) : '—'}
      </td>

      {/* Individuelle — dᵢ min. requis */}
      <td className="rt-cell rt-result" style={{ textAlign: 'center' }}>
        {!isCollective && ar?.di_min != null ? fmt(ar.di_min, 1) : '—'}
      </td>

      {/* Collective — Débit de base */}
      <td className="rt-cell rt-result" style={{ textAlign: 'center', borderLeft: '2px solid #bfdbfe' }}>
        {isCollective && c?.Qs_for_y != null ? fmt(c.Qs_for_y, 3) : '—'}
      </td>

      {/* Collective — Coeff. y */}
      <td className="rt-cell rt-result" style={{ textAlign: 'center' }}>
        {isCollective && c?.y != null ? fmt(c.y, 3) : '—'}
      </td>

      {/* Collective — Débit probable */}
      <td className="rt-cell rt-result" style={{ textAlign: 'center' }}>
        {isCollective && c?.Qp != null ? fmt(c.Qp, 3) : '—'}
      </td>

      {/* Collective — Vitesse */}
      <td className="rt-cell rt-result" style={{
        textAlign: 'center',
        color: velErr ? '#dc2626' : velWarn ? '#f97316' : undefined,
        fontWeight: (velErr || velWarn) ? 700 : undefined,
      }}>
        {isCollective && velocity != null ? fmt(velocity, 2) : '—'}
      </td>
    </tr>
  )
}

// ── Export principal ───────────────────────────────────────────────────────

export default function ResultsTable({
  rows, roleMap,
  activeCalcId,
  efFlowRowsArr,
  segments, points, materials, insulations,
  levels, lineYs, columns, columnXs, chaufferie,
  flowDirections, networkFlows, thermalResults,
  alimentationResults,
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
        const afterBanner = prevKind === 'flow-start' || prevKind === 'flow-end' || prevKind === 'col-header' || prevKind === 'junction'
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
    selectedIds, onSelectIds, roleMap,
  }

  const isAlim = activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef'
  const nCols  = isAlim ? ALIM_COLS : TOTAL_COLS

  const sharedAlim = {
    segments, points, materials, insulations,
    levels, lineYs, columns, columnXs, chaufferie,
    alimentationResults, selectedIds, onSelectIds, roleMap,
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
                <th colSpan={2} className="rt-thg rt-thg-result">Individuelle</th>
                <th colSpan={4} className="rt-thg rt-thg-result" style={{ borderLeft: '2px solid #bfdbfe' }}>Collective</th>
              </tr>
              <tr className="rt-thead-cols">
                <th className="rt-th">Tronçon</th>
                <th className="rt-th">Niveau</th>
                <th className="rt-th">Colonne</th>
                <th className="rt-th">Appareils en aval</th>
                <th className="rt-th">Méthode</th>
                <th className="rt-th">DN</th>
                <th className="rt-th">dᵢ (mm)</th>
                <th className="rt-th rt-th-result">Coeff. X</th>
                <th className="rt-th rt-th-result">dᵢ min. requis (mm)</th>
                <th className="rt-th rt-th-result" style={{ borderLeft: '2px solid #bfdbfe' }}>Débit de base (l/s)</th>
                <th className="rt-th rt-th-result">Coeff. de simultanéité</th>
                <th className="rt-th rt-th-result">Débit probable (l/s)</th>
                <th className="rt-th rt-th-result">Vitesse (m/s)</th>
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
                  <th colSpan={2} className="rt-thg">Canalisation</th>
                  <th colSpan={2} className="rt-thg rt-thg-result">Individuelle</th>
                  <th colSpan={4} className="rt-thg rt-thg-result" style={{ borderLeft: '2px solid #bfdbfe' }}>Collective</th>
                </tr>
                <tr className="rt-thead-cols">
                  <th className="rt-th">Tronçon</th>
                  <th className="rt-th">Niveau</th>
                  <th className="rt-th">Colonne</th>
                  <th className="rt-th">Appareils en aval</th>
                  <th className="rt-th">Méthode</th>
                  <th className="rt-th">DN</th>
                  <th className="rt-th">dᵢ (mm)</th>
                  <th className="rt-th rt-th-result">Coeff. X</th>
                  <th className="rt-th rt-th-result">dᵢ min. requis (mm)</th>
                  <th className="rt-th rt-th-result" style={{ borderLeft: '2px solid #bfdbfe' }}>Débit de base (l/s)</th>
                  <th className="rt-th rt-th-result">Coeff. de simultanéité</th>
                  <th className="rt-th rt-th-result">Débit probable (l/s)</th>
                  <th className="rt-th rt-th-result">Vitesse (m/s)</th>
                </tr>
              </>
            ) : (
              <>
                <tr className="rt-thead-group">
                  <th colSpan={3} className="rt-thg">Identification</th>
                  <th colSpan={5} className="rt-thg">Canalisation</th>
                  <th colSpan={3} className="rt-thg">Isolation</th>
                  <th colSpan={2} className="rt-thg">Hydraulique</th>
                  <th colSpan={2} className="rt-thg">Thermique</th>
                  <th colSpan={6} className="rt-thg rt-thg-result">Résultats</th>
                </tr>
                <tr className="rt-thead-cols">
                  <th className="rt-th">Tronçon</th>
                  <th className="rt-th">Niveau</th>
                  <th className="rt-th">Colonne</th>
                  <th className="rt-th">Matériau</th>
                  <th className="rt-th">DN</th>
                  <th className="rt-th">dᵢ (mm)</th>
                  <th className="rt-th">dₑ (mm)</th>
                  <th className="rt-th">λ_tube</th>
                  <th className="rt-th">Isolant</th>
                  <th className="rt-th">ép. (mm)</th>
                  <th className="rt-th">λ_isol</th>
                  <th className="rt-th">L (m)</th>
                  <th className="rt-th">Débit (m³/h)</th>
                  <th className="rt-th">T° amb</th>
                  <th className="rt-th">T amont (°C)</th>
                  <th className="rt-th rt-th-result">Ui (W/m·K)</th>
                  <th className="rt-th rt-th-result">Pertes (W)</th>
                  <th className="rt-th rt-th-result">Vitesse (m/s)</th>
                  <th className="rt-th rt-th-result">T aval (°C)</th>
                  <th className="rt-th rt-th-result">ΔT tronçon</th>
                  <th className="rt-th rt-th-result">ΔT/Départ</th>
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
