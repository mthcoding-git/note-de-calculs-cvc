import { useRef, useEffect, useMemo } from 'react'
import { computeSegUI } from '../utils/thermalCalc'
import { buildTableRows } from '../utils/tableOrder'
import { getDisplayName } from '../utils/naming'

const fmt = (v, d) => v != null && !isNaN(v) ? Number(v).toFixed(d) : '—'
const TOTAL_COLS = 21

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

// Extrait le nom de colonne uniquement si les deux extrémités du nom sont des colonnes
function extractColonne(shortName, columns) {
  const parts = shortName.split(' → ')
  if (parts.length < 2) return null
  // Supprime le suffixe de désambiguïsation (ex. " - n°2") puis le suffixe de niveau (ex. " (SS-1)")
  const clean = s => s.replace(/\s*-\s*n°\d+$/, '').replace(/\s*\([^)]+\)$/, '').trim()
  const nameFirst = clean(parts[0])
  const nameLast  = clean(parts[parts.length - 1])
  const isCol = n => columns?.some(c => !c.isGap && c.name === n)
  return (isCol(nameFirst) && nameFirst === nameLast) ? nameFirst : null
}

// Background T_aval : dégradé vert (T_depart) → rouge (50°C), blanc en dessous de 50°C
function tAvalStyle(T_aval, T_depart) {
  if (T_aval == null) return {}
  if (T_aval < 50) return { background: '#dc2626', color: '#fff', fontWeight: 700 }
  const ratio = Math.max(0, Math.min(1, (T_aval - 50) / Math.max(T_depart - 50, 1)))
  const hue   = Math.round(120 * ratio)   // 120 = vert, 0 = rouge
  return { background: `hsl(${hue},58%,91%)` }
}

// ── Ligne tronçon ──────────────────────────────────────────────────────────

function SegRow({ row, segments, points, materials, insulations,
                  levels, lineYs, columns, columnXs, chaufferie,
                  globalParams, networkFlows, thermalResults,
                  selectedIds, onSelectIds, rowRef }) {
  const { seg, depth } = row

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

  // ── Mise en forme conditionnelle ────────────────────────────────────────
  const isSS = segSousSol(seg, levels, lineYs)
  const vMax = isSS ? 1 : 0.5
  const velocityRed = seg.type === 'retour' && velocity != null
    && (velocity < 0.2 || velocity > vMax)
  const prodECS = points?.find(p => p.type === 'productionECS')
  const isLinkedToProdECS = prodECS != null
    && (seg.startPointId === prodECS.id || seg.endPointId === prodECS.id)
  const dtFromProdRed = isLinkedToProdECS && seg.type === 'retour'
    && deltaTFromProd != null && deltaTFromProd > 5
  const tAvalStyleObj = tAvalStyle(T_aval, T_depart)

  const isSelected = selectedIds?.includes(seg.id)

  // défaut vs override
  const cls = (isDefault) => isDefault ? 'rt-val-default' : 'rt-val-override'
  const matIsDefault    = seg.materialId == null
  const insIsDefault    = seg.insulationId == null
  const lenIsDefault    = seg.length_override == null
  const flowIsDefault   = seg.flowRate == null && seg.velocity == null

  const shortName = getDisplayName(seg, segments, levels, lineYs, columns, columnXs, chaufferie, points)
    .replace(/^(Aller|Retour) ECS\s*–\s*/, '')
  const colonneName = extractColonne(shortName, columns)
  const levelName   = segLevelName(seg, levels, lineYs)
  const indent      = depth * 13

  return (
    <tr ref={rowRef} className={`rt-row${isSelected ? ' rt-row-selected' : ''}`}
        onClick={() => onSelectIds([seg.id])} style={{ cursor: 'pointer' }}>

      {/* Identification */}
      <td className="rt-cell rt-cell-name" style={{ paddingLeft: 6 + indent }}>
        {depth > 0 && <span className="rt-depth">{'└─'}</span>}
        {shortName}
      </td>
      <td className="rt-cell rt-cell-sm">{levelName}</td>
      <td className="rt-cell rt-cell-sm">{colonneName ?? <span className="rt-val-default">—</span>}</td>

      {/* Canalisation */}
      <td className="rt-cell"><span className={cls(matIsDefault)}>{mat?.name ?? '—'}</span></td>
      <td className="rt-cell"><span className={cls(matIsDefault)}>{seg.dn ?? '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.di_override == null)}>{di != null ? fmt(di, 1) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.de_override == null)}>{de != null ? fmt(de, 1) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.lambda_tube_override == null)}>{lambdaTube != null ? fmt(lambdaTube, 0) : '—'}</span></td>

      {/* Isolation */}
      <td className="rt-cell"><span className={cls(insIsDefault)}>{ins?.name ?? '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.thickness == null)}>{seg.thickness != null ? fmt(seg.thickness, 0) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(seg.lambda_insul_override == null)}>{lambdaInsul != null ? fmt(lambdaInsul, 3) : '—'}</span></td>

      {/* Hydraulique */}
      <td className="rt-cell"><span className={cls(lenIsDefault)}>{seg.length_override != null ? fmt(seg.length_override, 2) : '—'}</span></td>
      <td className="rt-cell"><span className={cls(flowIsDefault)}>{flowRate != null ? flowRate.toFixed(3) : '—'}</span></td>

      {/* Thermique */}
      <td className="rt-cell"><span className="rt-val-default">{T_amb != null ? fmt(T_amb, 1) : '—'}</span></td>
      <td className="rt-cell">{T_amont != null ? fmt(T_amont, 1) : '—'}</td>

      {/* Résultats */}
      <td className="rt-cell rt-result">{Ui != null ? fmt(Ui, 3) : '—'}</td>
      <td className="rt-cell rt-result">{Q_W != null ? fmt(Q_W, 1) : '—'}</td>
      <td className="rt-cell rt-result" style={{ color: velocityRed ? '#dc2626' : undefined, fontWeight: velocityRed ? 700 : undefined }}>
        {velocity != null ? fmt(velocity, 3) : '—'}
      </td>
      <td className="rt-cell rt-result" style={tAvalStyleObj}>
        {T_aval != null ? fmt(T_aval, 1) : '—'}
      </td>
      <td className="rt-cell rt-result">{deltaT != null ? fmt(deltaT, 2) : '—'}</td>
      <td className="rt-cell rt-result" style={{ color: dtFromProdRed ? '#dc2626' : undefined, fontWeight: dtFromProdRed ? 700 : undefined }}>
        {deltaTFromProd != null ? fmt(deltaTFromProd, 2) : '—'}
      </td>
    </tr>
  )
}

// ── Ligne nœud de jonction ─────────────────────────────────────────────────

function JunctionRow({ row, thermalResults }) {
  const { ptId, depth, incomingCount } = row
  const T_mix = thermalResults?.nodeTemps?.get(ptId)
  return (
    <tr className="rt-junction-row">
      <td colSpan={TOTAL_COLS} style={{ paddingLeft: 6 + depth * 13 }}>
        <span className="rt-junction-icon">⑂</span>
        <span className="rt-junction-label">Nœud de jonction ({incomingCount ?? '?'} tronçons)</span>
        {T_mix != null && (
          <span className="rt-junction-temp">
            — T mélange = <strong>{fmt(T_mix, 1)} °C</strong>
          </span>
        )}
      </td>
    </tr>
  )
}

// ── Section (Aller ou Retour) ──────────────────────────────────────────────

function TableSection({ title, color, rows, selectedIds, ...props }) {
  const selectedRowRef = useRef(null)

  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [selectedIds])

  return (
    <div className="rt-section">
      <div className="rt-section-title" style={{ borderLeftColor: color }}>{title}</div>
      <div className="rt-table-scroll">
        <table className="rt-table">
          <thead>
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
              <th className="rt-th rt-th-result">ΔT /Prod.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const isSelected = row.kind === 'segment' && selectedIds?.includes(row.seg.id)
              return row.kind === 'segment'
                ? <SegRow key={row.seg.id} row={row} selectedIds={selectedIds}
                    rowRef={isSelected ? selectedRowRef : null} {...props} />
                : <JunctionRow key={`junc-${row.ptId}-${i}`} row={row}
                    thermalResults={props.thermalResults} />
            })}
            {rows.length === 0 && (
              <tr><td colSpan={TOTAL_COLS} className="rt-empty">Aucun tronçon</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}


// ── Export principal ───────────────────────────────────────────────────────

export default function ResultsTable({
  segments, points, materials, insulations,
  levels, lineYs, columns, columnXs, chaufferie,
  flowDirections, networkFlows, thermalResults,
  globalParams, selectedIds, onSelectIds,
  height,
}) {
  const { allerRows, retourRows } = useMemo(
    () => buildTableRows(segments, points, flowDirections),
    [segments, points, flowDirections]
  )

  const shared = {
    segments, points, materials, insulations,
    levels, lineYs, columns, columnXs, chaufferie,
    globalParams, networkFlows, thermalResults,
    selectedIds, onSelectIds,
  }

  return (
    <div className="rt-panel" style={{ height: height ?? 320 }}>
      <TableSection title="Aller ECS" color="#dc2626" rows={allerRows} selectedIds={selectedIds} {...shared} />
      <TableSection title="Retour ECS" color="#f97316" rows={retourRows} selectedIds={selectedIds} {...shared} />
    </div>
  )
}
