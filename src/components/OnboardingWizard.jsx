import { useState } from 'react'
import { DEFAULT_MATERIALS } from '../data/materials'
import { DEFAULT_INSULATIONS } from '../data/insulations'

// ── Project generation ──────────────────────────────────
let _uid = 0
const mkId = () => `loc-${Date.now()}-${++_uid}`

function buildLevels(nSousSol, nFloors) {
  const levels = []
  for (let i = nSousSol; i >= 1; i--)
    levels.push({ id: `ss${i}`, name: `SS-${i}`, isSousSol: true })
  for (let i = 0; i < nFloors; i++)
    levels.push({ id: i === 0 ? 'rdc' : `r${i}`, name: i === 0 ? 'RDC' : `R+${i}`, isSousSol: false })
  return levels
}

function buildLineYs(nLevels) {
  const SPACING = 210, TOP_Y = 80
  return Array.from({ length: nLevels + 1 }, (_, i) => TOP_Y + (nLevels - i) * SPACING)
}

function buildColumns(nCols, columnLevelIds) {
  return Array.from({ length: nCols }, (_, i) => ({
    id: `col${i + 1}`, name: `Colonne ${i + 1}`,
    levelIds: columnLevelIds?.[i] ?? 'all',
  }))
}

const LOCAL_W = 50, LOCAL_GAP = 10
// Column pipe zone width (visible column area). Local zone sits to its right.
const COL_PIPE_W = 320
// Distance from column x1 to the left edge of the first logement slot (starts after the full column)
const COL_LOCAL_OFFSET = COL_PIPE_W + 8 + 5  // 333

function buildColumnXs(nCols, maxGroupesParCol) {
  const xs = [200]
  for (let i = 0; i < nCols; i++) {
    const n = maxGroupesParCol[i] ?? 0
    const space = n > 0
      ? COL_PIPE_W + 23 + n * (LOCAL_W + LOCAL_GAP)
      : COL_PIPE_W
    xs.push(xs[i] + space)
  }
  return xs
}

function maxGroupesParCol(nCols, nLevels, grid) {
  return Array.from({ length: nCols }, (_, c) => {
    let max = 0
    for (let l = 0; l < nLevels; l++) max = Math.max(max, grid[`${l}-${c}`] ?? 0)
    return max
  })
}

const snapGrid = v => Math.round(v / 10) * 10

function buildGroupesPoints(levels, lineYs, columns, columnXs, grid) {
  const points = []
  columns.forEach((col, c) => {
    levels.forEach((level, l) => {
      const count = grid[`${l}-${c}`] ?? 0
      const midY = (lineYs[l] + lineYs[l + 1]) / 2
      for (let k = 0; k < count; k++) {
        points.push({
          id: mkId(), type: 'groupe', name: '', showName: false,
          colId: col.id, levelId: level.id,
          x: snapGrid(columnXs[c] + COL_LOCAL_OFFSET + k * (LOCAL_W + LOCAL_GAP) + LOCAL_W / 2),
          y: snapGrid(midY),
          isLocked: false,
        })
      }
    })
  })
  return points
}

export function buildProjectFromConfig({
  globalParams, materials, insulations,
  nSousSol, nFloors, nCols, groupesGrid, columnLevelIds,
}) {
  const levels  = buildLevels(nSousSol, nFloors)
  const nLevels = levels.length
  const lineYs  = buildLineYs(nLevels)
  const columns = buildColumns(nCols, columnLevelIds)
  const maxCols = maxGroupesParCol(nCols, nLevels, groupesGrid)
  const columnXs = buildColumnXs(nCols, maxCols)
  const points   = buildGroupesPoints(levels, lineYs, columns, columnXs, groupesGrid)
  return {
    globalParams, materials, insulations,
    levels, lineYs, columns, columnXs,
    chaufferie: { placed: false, enabled: false, levelId: levels[0]?.id ?? 'ss1', x1: 1190, x2: 1460, height: 150 },
    segments: [], points,
  }
}

// ── Wizard UI ────────────────────────────────────────────
const DEFAULT_GLOBAL_PARAMS = { T_depart: 60, rho: 985, cp: 4180, T_amb_ss: 10, T_amb_other: 20, he: 10 }

const STEP_LABELS = ['Paramètres', 'Matériaux', 'Isolants', 'Configuration', 'Groupes']

function Progress({ step, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', padding: '0 0 20px' }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 700,
            background: i < step ? '#4f46e5' : i === step ? '#4f46e5' : '#e5e7eb',
            color: i <= step ? '#fff' : '#9ca3af',
            transition: 'all 0.2s',
            border: i === step ? '3px solid #c7d2fe' : '3px solid transparent',
          }}>{i + 1}</div>
          <span style={{ fontSize: 9, color: i === step ? '#4f46e5' : '#9ca3af', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {STEP_LABELS[i]}
          </span>
        </div>
      ))}
    </div>
  )
}

function NavButtons({ onPrev, onNext, nextLabel, prevDisabled }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '16px 28px', borderTop: '1px solid #e5e7eb', background: '#fafafa', borderRadius: '0 0 12px 12px' }}>
      <button onClick={onPrev} disabled={prevDisabled}
        style={{
          padding: '9px 22px', borderRadius: 7, border: '1px solid #d1d5db',
          background: prevDisabled ? '#f9fafb' : '#fff',
          color: prevDisabled ? '#d1d5db' : '#374151',
          fontSize: 13, fontWeight: 600, cursor: prevDisabled ? 'default' : 'pointer',
        }}>
        ← Retour
      </button>
      <button onClick={onNext}
        style={{
          padding: '9px 28px', borderRadius: 7, border: 'none',
          background: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
        }}>
        {nextLabel} →
      </button>
    </div>
  )
}

// Step 1
function StepParams({ params, onChange }) {
  const set = (k, v) => onChange({ ...params, [k]: v })
  const rows = [
    ['T° de départ', 'T_depart', '°C', 1],
    ['Masse volumique ρ', 'rho', 'kg/m³', 1],
    ['Chaleur spécifique cp', 'cp', 'J/kg·K', 1],
    ['Coef. transfert he', 'he', 'W/m²·K', 0.1],
    ['T° ambiante sous-sol', 'T_amb_ss', '°C', 1],
    ['T° ambiante autres niveaux', 'T_amb_other', '°C', 1],
  ]
  return (
    <div>
      <h2 style={TITLE_S}>Paramètres généraux</h2>
      <p style={SUBTITLE_S}>Ces valeurs s'appliquent à l'ensemble du réseau ECS.</p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {rows.map(([label, key, unit, step]) => (
          <div key={key}>
            <label style={FIELD_LABEL_S}>{label}</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <input type="number" value={params[key]} step={step}
                onChange={e => set(key, +e.target.value)}
                style={INPUT_S} />
              <span style={{ fontSize: 11, color: '#9ca3af', whiteSpace: 'nowrap' }}>{unit}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Steps 2 & 3
function StepCheckList({ title, subtitle, items, onChange }) {
  return (
    <div>
      <h2 style={TITLE_S}>{title}</h2>
      <p style={SUBTITLE_S}>{subtitle}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <label key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
            border: `1.5px solid ${item.enabled ? '#a5b4fc' : '#e5e7eb'}`,
            borderRadius: 8, cursor: 'pointer', userSelect: 'none',
            background: item.enabled ? '#f5f3ff' : '#fff',
            transition: 'all 0.15s',
          }}>
            <input type="checkbox" checked={item.enabled}
              onChange={e => onChange(items.map(i => i.id === item.id ? { ...i, enabled: e.target.checked } : i))}
              style={{ width: 16, height: 16, accentColor: '#4f46e5', flexShrink: 0 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{item.name}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                {item.dns
                  ? `${item.dns.length} diamètres disponibles`
                  : item.thicknesses?.length > 0
                  ? `Épaisseurs : ${item.thicknesses.join(', ')} mm`
                  : 'Épaisseur libre'}
              </div>
            </div>
          </label>
        ))}
      </div>
    </div>
  )
}

// Step 4
function Stepper({ value, onChange, min = 0, max = 30 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>−</button>
      <span style={{ width: 32, textAlign: 'center', fontWeight: 700, fontSize: 16 }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))}
        style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>+</button>
    </div>
  )
}

function StepConfig({ nSousSol, nFloors, nCols, onNSousSolChange, onNFloorsChange, onNColsChange,
                      columnLevelIds, onColumnLevelIdsChange }) {
  const previewLevels = buildLevels(nSousSol, nFloors)
  const [expandedCol, setExpandedCol] = useState(null)

  const setLevelIds = (colIdx, ids) => {
    const next = Array.from({ length: nCols }, (_, i) => columnLevelIds[i] ?? 'all')
    next[colIdx] = ids
    onColumnLevelIdsChange(next)
  }

  return (
    <div>
      <h2 style={TITLE_S}>Configuration du bâtiment</h2>
      <p style={SUBTITLE_S}>Définissez la structure du bâtiment.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        {[
          ['Niveaux en sous-sol', 'SS-1, SS-2, …', nSousSol, onNSousSolChange, 0, 5],
          ['Niveaux hors-sol', 'RDC, R+1, R+2, …', nFloors, onNFloorsChange, 1, 30],
          ['Colonnes montantes', null, nCols, onNColsChange, 1, 20],
        ].map(([label, desc, val, fn, mn, mx]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid #e5e7eb', borderRadius: 8 }}>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{label}</div>
              {desc && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{desc}</div>}
            </div>
            <Stepper value={val} onChange={fn} min={mn} max={mx} />
          </div>
        ))}
      </div>

      <div style={{ padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, color: '#64748b', marginBottom: 16 }}>
        Niveaux : {previewLevels.map(l => l.name).join(' · ')}
      </div>

      {/* Per-column level assignment */}
      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        Niveaux couverts par colonne
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {Array.from({ length: nCols }, (_, i) => {
          const ids = columnLevelIds[i] ?? 'all'
          const isAll = ids === 'all'
          const isOpen = expandedCol === i
          const coveredNames = isAll
            ? 'Tous les niveaux'
            : (Array.isArray(ids) && ids.length > 0
                ? previewLevels.filter(l => ids.includes(l.id)).map(l => l.name).join(', ')
                : 'Aucun niveau')
          return (
            <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: isOpen ? '#f5f3ff' : '#fff', cursor: 'pointer', userSelect: 'none' }}
                   onClick={() => setExpandedCol(isOpen ? null : i)}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>Colonne {i + 1}</span>
                  <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{coveredNames}</span>
                </div>
                <span style={{ fontSize: 10, color: '#9ca3af', transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s', display: 'inline-block' }}>▶</span>
              </div>
              {isOpen && (
                <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', background: '#fafafa', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={isAll}
                      onChange={e => setLevelIds(i, e.target.checked ? 'all' : previewLevels.map(l => l.id))}
                      style={{ accentColor: '#4f46e5' }} />
                    <span style={{ fontWeight: 600, color: '#4f46e5' }}>Tous les niveaux</span>
                  </label>
                  {!isAll && previewLevels.map(level => {
                    const checked = Array.isArray(ids) && ids.includes(level.id)
                    return (
                      <label key={level.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, paddingLeft: 16, cursor: 'pointer' }}>
                        <input type="checkbox" checked={checked}
                          onChange={e => {
                            const arr = Array.isArray(ids) ? [...ids] : previewLevels.map(l => l.id)
                            const next = e.target.checked ? [...arr, level.id] : arr.filter(id => id !== level.id)
                            setLevelIds(i, next.length === previewLevels.length ? 'all' : next)
                          }}
                          style={{ accentColor: '#4f46e5' }} />
                        <span style={{ color: '#374151' }}>{level.name}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// Step 5
function StepGroupes({ levels, nCols, groupesGrid, onGridChange }) {
  const displayLevels = [...levels].reverse()
  const colNames = Array.from({ length: nCols }, (_, i) => `Col. ${i + 1}`)

  const get = (origIdx, c) => groupesGrid[`${origIdx}-${c}`] ?? 0
  const set = (origIdx, c, v) =>
    onGridChange({ ...groupesGrid, [`${origIdx}-${c}`]: Math.max(0, Math.min(99, v)) })

  return (
    <div>
      <h2 style={TITLE_S}>Groupes de points de puisage par niveau et par colonne</h2>
      <p style={SUBTITLE_S}>
        Indiquez le nombre de groupes raccordés à chaque colonne par niveau.<br />
        <span style={{ fontStyle: 'italic' }}>Un groupe peut représenter un appartement, des sanitaires, une loge, etc.</span>
      </p>
      <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 340, borderRadius: 8, border: '1px solid #e5e7eb' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: nCols * 90 + 90 }}>
          <thead>
            <tr style={{ background: '#f8fafc', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ ...TH_S, textAlign: 'left', minWidth: 72 }}>Niveau</th>
              {colNames.map((c, i) => <th key={i} style={TH_S}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {displayLevels.map((level, di) => {
              const origIdx = levels.length - 1 - di
              const rowTotal = Array.from({ length: nCols }, (_, c) => get(origIdx, c)).reduce((a, b) => a + b, 0)
              return (
                <tr key={level.id} style={{ background: di % 2 === 0 ? '#fff' : '#fafafa' }}>
                  <td style={{ ...TD_S, fontWeight: 600, color: '#374151', borderRight: '2px solid #e5e7eb' }}>
                    <div>{level.name}</div>
                    {rowTotal > 0 && <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 400 }}>{rowTotal} groupe{rowTotal > 1 ? 's' : ''}</div>}
                  </td>
                  {Array.from({ length: nCols }, (_, c) => (
                    <td key={c} style={{ ...TD_S, textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <button onClick={() => set(origIdx, c, get(origIdx, c) - 1)}
                          style={CELL_BTN_S}>−</button>
                        <input type="number" min="0" max="99"
                          value={get(origIdx, c)}
                          onChange={e => set(origIdx, c, +e.target.value)}
                          style={{ width: 36, textAlign: 'center', border: '1px solid #d1d5db', borderRadius: 4, padding: '3px 0', fontSize: 13, fontWeight: 600 }} />
                        <button onClick={() => set(origIdx, c, get(origIdx, c) + 1)}
                          style={CELL_BTN_S}>+</button>
                      </div>
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af', textAlign: 'right' }}>
        {(() => { const t = Object.values(groupesGrid).reduce((a, b) => a + (b ?? 0), 0); return `Total : ${t} groupe${t > 1 ? 's' : ''}` })()}
      </div>
    </div>
  )
}

// ── Shared styles ────────────────────────────────────────
const TITLE_S    = { margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#1f2937' }
const SUBTITLE_S = { margin: '0 0 20px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }
const FIELD_LABEL_S = { fontSize: 12, fontWeight: 600, color: '#374151' }
const INPUT_S    = { flex: 1, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: '100%' }
const TH_S       = { padding: '10px 8px', fontSize: 11, fontWeight: 700, color: '#6b7280', textAlign: 'center', borderBottom: '2px solid #e5e7eb', textTransform: 'uppercase', letterSpacing: '0.04em' }
const TD_S       = { padding: '7px 8px', borderBottom: '1px solid #f1f5f9' }
const CELL_BTN_S = { width: 22, height: 22, borderRadius: 4, border: '1px solid #d1d5db', background: '#f9fafb', fontSize: 13, cursor: 'pointer', lineHeight: 1, padding: 0 }

// ── Main wizard ──────────────────────────────────────────
export default function OnboardingWizard({ onComplete, onDismiss }) {
  const [step, setStep] = useState(0)
  const [globalParams, setGlobalParams]   = useState(DEFAULT_GLOBAL_PARAMS)
  const [materials,    setMaterials]      = useState(() => DEFAULT_MATERIALS.map(m => ({ ...m, enabled: false })))
  const [insulations,  setInsulations]    = useState(() => DEFAULT_INSULATIONS.map(i => ({ ...i, enabled: false })))
  const [nSousSol,        setNSousSol]          = useState(1)
  const [nFloors,         setNFloors]           = useState(4)
  const [nCols,           setNCols]             = useState(5)
  const [columnLevelIds,  setColumnLevelIds]    = useState(() => Array.from({ length: 5 }, () => 'all'))
  const [groupesGrid,     setLocauxGrid]        = useState({})

  const levels     = buildLevels(nSousSol, nFloors)
  const totalSteps = 5
  const isLast     = step === totalSteps - 1

  const handleNColsChange = (n) => {
    setNCols(n)
    setColumnLevelIds(prev => Array.from({ length: n }, (_, i) => prev[i] ?? 'all'))
  }

  const handleNext = () => {
    if (isLast) {
      onComplete({ globalParams, materials, insulations, nSousSol, nFloors, nCols, groupesGrid, columnLevelIds })
    } else {
      setStep(s => s + 1)
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(15,23,42,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(2px)',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: step === 4 ? Math.max(560, Math.min(960, nCols * 110 + 200)) : 640,
        maxHeight: '92vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
        margin: '0 16px',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f1f5f9', position: 'relative' }}>
          {onDismiss && (
            <button onClick={onDismiss} style={{
              position: 'absolute', top: 14, right: 16,
              width: 28, height: 28, borderRadius: '50%',
              border: '1px solid #e5e7eb', background: '#f9fafb',
              fontSize: 16, lineHeight: 1, cursor: 'pointer', color: '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }} title="Fermer">✕</button>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
            Bouclage ECS · Note de calcul thermique
          </div>
          <Progress step={step} total={totalSteps} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px' }}>
          {step === 0 && <StepParams params={globalParams} onChange={setGlobalParams} />}
          {step === 1 && (
            <StepCheckList
              title="Matériaux des canalisations"
              subtitle="Sélectionnez les matériaux utilisés dans ce projet."
              items={materials} onChange={setMaterials} />
          )}
          {step === 2 && (
            <StepCheckList
              title="Isolants"
              subtitle="Sélectionnez les isolants utilisés dans ce projet."
              items={insulations} onChange={setInsulations} />
          )}
          {step === 3 && (
            <StepConfig
              nSousSol={nSousSol} nFloors={nFloors} nCols={nCols}
              onNSousSolChange={setNSousSol} onNFloorsChange={setNFloors}
              onNColsChange={handleNColsChange}
              columnLevelIds={columnLevelIds}
              onColumnLevelIdsChange={setColumnLevelIds} />
          )}
          {step === 4 && (
            <StepGroupes
              levels={levels} nCols={nCols}
              groupesGrid={groupesGrid} onGridChange={setLocauxGrid} />
          )}
        </div>

        {/* Footer */}
        <NavButtons
          onPrev={() => setStep(s => Math.max(0, s - 1))}
          onNext={handleNext}
          prevDisabled={step === 0}
          nextLabel={isLast ? 'Créer le projet' : 'Suivant'} />
      </div>
    </div>
  )
}
