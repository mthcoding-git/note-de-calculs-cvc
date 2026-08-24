import { useState, useRef, useEffect } from 'react'
import type { CalcMode } from '../types'
import { getDisplayName } from '../utils/naming'
import { getModeFlags } from '../utils/calcModeFlags'
import { computeSegUI, getSegAmbTemp } from '../utils/thermalCalc'
import { getSegHR, computeCondensationFromParams, getDewPoint, getRequiredResistance,
  getInternalResistance, getPipeWallResistance, getInsulationResistance, getExteriorResistance,
  H_INT_DEFAULT, H_EXT_DEFAULT } from '../utils/condensationCalc'
import { sf, fmtDpLabel } from '../utils/fmt'
import { NumInput } from './NumInput'
import { SegFittingsPanel, SegEquipPanel } from './segPanelShared'
import SingularityModal from './SingularityModal'
import { computeXiSingularity, SING_LABELS, newSingId } from '../utils/singularityCalc'
import type { VentSingularity } from '../utils/singularityCalc'
import { tAvalStyle, Field, SectionLabel, SegNameField, CoteSection, TempBadge, AntenneGroupesAval } from './rpShared'
import PdcSegResults from './PdcSegResults'
import VentPdcResults from './VentPdcResults'
import { ABAQUE } from '../utils/alimentationCalc'

// ── Panneau singularités circulaires ────────────────────────────────────────
function VentSingularitiesPanel({ sings, dynPressure, di_mm, Re, onChange, configured, ductInfo }: {
  sings: VentSingularity[]
  dynPressure: number | null
  di_mm: number | null
  Re: number | null
  onChange: (v: VentSingularity[]) => void
  configured: boolean
  ductInfo: string | null
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<VentSingularity | null>(null)

  const openAdd  = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (s: VentSingularity) => { setEditing(s); setModalOpen(true) }
  const close    = () => { setModalOpen(false); setEditing(null) }

  const handleSave = (s: VentSingularity) => {
    onChange(editing ? sings.map(x => x.id === s.id ? s : x) : [...sings, s])
    close()
  }

  if (!configured) {
    return (
      <div style={{
        padding: '9px 11px', background: '#fefce8', border: '1px solid #fde68a',
        borderRadius: 6, fontSize: 10, color: '#92400e',
        display: 'flex', alignItems: 'flex-start', gap: 6,
      }}>
        <span>⚠</span>
        <span>Sélectionnez un matériau et les dimensions de la gaine pour pouvoir ajouter des singularités.</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

      {sings.length === 0 && (
        <p className="lp-hint">Aucune singularité sur ce tronçon</p>
      )}
      {sings.map(s => {
        const xi   = computeXiSingularity(s, Re ?? undefined, di_mm ?? undefined)
        const cnt  = s.count ?? 1
        const dp   = dynPressure != null ? xi * dynPressure * cnt : null
        const setCount = (n: number) => onChange(sings.map(x => x.id === s.id ? { ...x, count: Math.max(1, n) } : x))
        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 8px', background: '#f9fafb',
            borderRadius: 6, border: '1px solid #e5e7eb',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#1e293b',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {SING_LABELS[s.type]}
              </div>
              <div style={{ fontSize: 9.5, color: '#6b7280', fontFamily: 'ui-monospace, monospace' }}>
                δ={s.angle}°&nbsp;&nbsp;ξ={xi.toFixed(3)}
                {dp != null ? `  →  ${dp.toFixed(2)} Pa` : ''}
              </div>
            </div>
            {/* Sélecteur quantité */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <button onClick={() => setCount(cnt - 1)} style={{
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4,
                width: 18, height: 18, fontSize: 13, lineHeight: 1, cursor: 'pointer',
                color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>−</button>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151',
                minWidth: 18, textAlign: 'center' }}>{cnt}</span>
              <button onClick={() => setCount(cnt + 1)} style={{
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4,
                width: 18, height: 18, fontSize: 13, lineHeight: 1, cursor: 'pointer',
                color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>+</button>
            </div>
            <button onClick={() => openEdit(s)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 4px', color: '#6366f1', fontSize: 12, lineHeight: 1,
            }} title="Modifier">✏</button>
            <button onClick={() => onChange(sings.filter(x => x.id !== s.id))} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 4px', color: '#ef4444', fontSize: 13, lineHeight: 1,
            }} title="Supprimer">✕</button>
          </div>
        )
      })}
      <button onClick={openAdd} style={{
        width: '100%', padding: '6px 0', fontSize: 10.5, color: '#c2562d',
        background: '#fef0ea', border: '1px dashed #fbd5c5', borderRadius: 6,
        cursor: 'pointer', fontWeight: 600, marginTop: sings.length > 0 ? 2 : 0,
      }}>
        + Ajouter un coude circulaire
      </button>
      {modalOpen && (
        <SingularityModal
          isOpen={modalOpen}
          onClose={close}
          onSave={s => {
            onChange(editing
              ? sings.map(x => x.id === s.id ? { ...s, count: x.count } : x)
              : [...sings, s])
            close()
          }}
          editing={editing}
          di_mm={di_mm}
          dynPressure={dynPressure}
          ductInfo={ductInfo}
        />
      )}
    </div>
  )
}

// ── Panneau singularités rectangulaires ──────────────────────────────────────
function VentRectSingularitiesPanel({ sings, dynPressure, l_mm, h_mm, Re, onChange, configured, ductInfo }: {
  sings: VentSingularity[]
  dynPressure: number | null
  l_mm: number | null
  h_mm: number | null
  Re: number | null
  onChange: (v: VentSingularity[]) => void
  configured: boolean
  ductInfo: string | null
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing]     = useState<VentSingularity | null>(null)

  const openAdd  = () => { setEditing(null); setModalOpen(true) }
  const openEdit = (s: VentSingularity) => { setEditing(s); setModalOpen(true) }
  const close    = () => { setModalOpen(false); setEditing(null) }

  const handleSave = (s: VentSingularity) => {
    onChange(editing ? sings.map(x => x.id === s.id ? s : x) : [...sings, s])
    close()
  }

  if (!configured) {
    return (
      <div style={{
        padding: '9px 11px', background: '#fefce8', border: '1px solid #fde68a',
        borderRadius: 6, fontSize: 10, color: '#92400e',
        display: 'flex', alignItems: 'flex-start', gap: 6,
      }}>
        <span>⚠</span>
        <span>Sélectionnez un matériau et les dimensions de la gaine pour pouvoir ajouter des singularités.</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sings.length === 0 && (
        <p className="lp-hint">Aucune singularité sur ce tronçon</p>
      )}
      {sings.map(s => {
        const xi  = computeXiSingularity({ ...s, l_mm: l_mm ?? s.l_mm, h_mm: h_mm ?? s.h_mm }, Re ?? undefined)
        const cnt = s.count ?? 1
        const dp  = dynPressure != null ? xi * dynPressure * cnt : null
        const setCount = (n: number) => onChange(sings.map(x => x.id === s.id ? { ...x, count: Math.max(1, n) } : x))
        return (
          <div key={s.id} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '5px 8px', background: '#f9fafb',
            borderRadius: 6, border: '1px solid #e5e7eb',
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: '#1e293b',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {SING_LABELS[s.type]}
              </div>
              <div style={{ fontSize: 9.5, color: '#6b7280', fontFamily: 'ui-monospace, monospace' }}>
                δ={s.angle}°&nbsp;&nbsp;ξ={xi.toFixed(3)}
                {dp != null ? `  →  ${dp.toFixed(2)} Pa` : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <button onClick={() => setCount(cnt - 1)} style={{
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4,
                width: 18, height: 18, fontSize: 13, lineHeight: 1, cursor: 'pointer',
                color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>−</button>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#374151',
                minWidth: 18, textAlign: 'center' }}>{cnt}</span>
              <button onClick={() => setCount(cnt + 1)} style={{
                background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 4,
                width: 18, height: 18, fontSize: 13, lineHeight: 1, cursor: 'pointer',
                color: '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>+</button>
            </div>
            <button onClick={() => openEdit(s)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 4px', color: '#6366f1', fontSize: 12, lineHeight: 1,
            }} title="Modifier">✏</button>
            <button onClick={() => onChange(sings.filter(x => x.id !== s.id))} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '2px 4px', color: '#ef4444', fontSize: 13, lineHeight: 1,
            }} title="Supprimer">✕</button>
          </div>
        )
      })}
      <button onClick={openAdd} style={{
        width: '100%', padding: '6px 0', fontSize: 10.5, color: '#c2562d',
        background: '#fef0ea', border: '1px dashed #fbd5c5', borderRadius: 6,
        cursor: 'pointer', fontWeight: 600, marginTop: sings.length > 0 ? 2 : 0,
      }}>
        + Ajouter un coude rectangulaire
      </button>
      {modalOpen && (
        <SingularityModal
          isOpen={modalOpen}
          onClose={close}
          onSave={s => {
            onChange(editing
              ? sings.map(x => x.id === s.id ? { ...s, count: x.count } : x)
              : [...sings, s])
            close()
          }}
          editing={editing}
          di_mm={null}
          dynPressure={dynPressure}
          ductInfo={ductInfo}
          ductShape="rectangular"
          l_mm={l_mm}
          h_mm={h_mm}
        />
      )}
    </div>
  )
}

interface SegmentPanelProps {
  seg: any; onUpdate: any; materials: any[]; insulations: any[]
  allSegs: any[]; levels: any[]; lineYs: number[]; columns: any[]; columnXs: number[]
  chaufferie: any; points: any[]; flowData: any; globalParams: any; thermalData: any
  roleMap: any; drawMode: string; onExitEditParams: any
  activeCalcId: string | null
  alimentationData: any; alimentationParams?: any
  pdcParams: any; pdcResult: any; resultsView: string; onResultsViewChange: any
  pdcCumResults: any; pdcCumAlimResults: any; segToCol: any; flowDirections: any
  groupDisplayNames?: any
  chauffageThermal?: any
  eauGlaceeThermal?: any
  egApportsMap?: Map<string, number> | null
  chauffageSplitCumDp?: { segCumDp: Map<string, number>; secondarySegIds: Set<string>; segPostJunction: Map<string, boolean>; criticalSegIds: Set<string>; segJunctionWinner: Map<string, string> } | null
  eauGlaceeSplitCumDp?: { segCumDp: Map<string, number>; secondarySegIds: Set<string>; segPostJunction: Map<string, boolean>; criticalSegIds: Set<string>; segJunctionWinner: Map<string, string> } | null
  eauGlaceeParams?: any
  hrGlobalDefault?: number | null
  calcConstants?: import('../types').CalcConstants
  ventilationResult?: any
  ventilationFlow?: any
  displayPrefs?: any
}

export default function SegmentPanel({ seg, onUpdate, materials, insulations, allSegs, levels, lineYs, columns, columnXs, chaufferie, points, flowData, globalParams, thermalData, roleMap, drawMode, onExitEditParams, activeCalcId, alimentationData, alimentationParams = null, pdcParams, pdcResult, resultsView, onResultsViewChange, pdcCumResults, pdcCumAlimResults, segToCol, flowDirections, groupDisplayNames = null, chauffageThermal = null, eauGlaceeThermal = null, egApportsMap = null, chauffageSplitCumDp = null, eauGlaceeSplitCumDp = null, eauGlaceeParams = null, hrGlobalDefault = null, calcConstants, ventilationResult = null, ventilationFlow = null, displayPrefs = null }: SegmentPanelProps) {
  const [tab, setTab]                       = useState('params')
  const [openDetailTherm, setOpenDetailTherm] = useState(false)
  const [openCondDetail, setOpenCondDetail]   = useState(false)
  const [openResDetail, setOpenResDetail]     = useState(false)
  const [calcOpen, setCalcOpen]               = useState(false)
  const [exprStr,  setExprStr]                = useState(() =>
    seg.length_override != null ? `= ${seg.length_override}` : ''
  )
  const set = (key, val) => onUpdate(seg.id, 'segment', { [key]: val })

  useEffect(() => {
    setCalcOpen(false)
    setExprStr(seg.length_override != null ? `= ${seg.length_override}` : '')
  }, [seg.id])

  const evalExpr = (text: string) => {
    const norm = text.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').trim()
    const safe = norm.replace(/[^0-9+\-*/.() ]/g, '').trim()
    if (!safe) return
    try {
      // eslint-disable-next-line no-new-func
      const result = new Function(`return (${safe})`)()
      if (typeof result === 'number' && isFinite(result) && result > 0)
        set('length_override', parseFloat(result.toFixed(3)))
    } catch { /* expression invalide — valeur inchangée */ }
  }

  const enabledMats = materials.filter(m => m.enabled)
  const enabledIns  = insulations.filter(i => i.enabled)
  const selMat      = materials.find(m => m.id === seg.materialId)
  const selIns      = insulations.find(i => i.id === seg.insulationId)
  const dnDef       = selMat?.dns.find(d => d.dn === seg.dn)

  const isDefault   = !seg.name
  const displayName = getDisplayName(seg, allSegs, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(seg.id), activeCalcId, roleMap, flowDirections)

  const uiValue = computeSegUI(seg, materials, insulations, 10)

  const { isBouclage, isAlimECS, isAlimEF, isAlimMode, isChauffage, isEauGlacee, isVentilation } = getModeFlags(activeCalcId as CalcMode | null)

  // ── Vue dédiée Alimentation ECS (dimensionnement) et Alimentation EF ──────────────────────
  if (isAlimEF || isAlimECS) {
    const di_mm = seg.di_override ?? dnDef?.di ?? null
    const ad    = alimentationData
    const segRole = roleMap?.get(seg.id)
    const segTypeLabel = isAlimEF
      ? 'EF'
      : segRole === 'collecteur-aller'  ? 'Collecteur aller ECS'
      : segRole === 'collecteur-retour' ? 'Collecteur retour ECS'
      : segRole === 'antenne'           ? 'Antenne ECS'
      : seg.type === 'retour'           ? 'Retour ECS'
      : 'Aller ECS'

    const ecsShortCode = !isAlimECS ? '' :
      segRole === 'collecteur-aller'  ? 'CA' :
      segRole === 'collecteur-retour' ? 'CR' :
      segRole === 'antenne'           ? 'ANT' :
      seg.type === 'retour'           ? 'R' : 'A'
    const ecsRoleLabel = !isAlimECS ? '' :
      segRole === 'collecteur-aller'  ? 'Collecteur aller — ECS' :
      segRole === 'collecteur-retour' ? 'Collecteur retour — ECS' :
      segRole === 'antenne'           ? 'Antenne — ECS' :
      seg.type === 'retour'           ? 'Retour — ECS' : 'Aller — ECS'
    const ecsColor = seg.type === 'retour'
      ? (displayPrefs?.ecs?.colorRetour ?? '#f97316')
      : (displayPrefs?.ecs?.colorAller  ?? '#dc2626')
    const ecsDisplayName = isDefault && displayName ? displayName.replace(/^[^–]*–\s*/, '') : displayName

    const Alert = ({ msg, level = 'error' }) => {
      const isErr = level === 'error'
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 4,
          padding: '4px 7px',
          background: isErr ? '#fef2f2' : '#fff7ed',
          border: `1px solid ${isErr ? '#fecaca' : '#fed7aa'}`,
          borderRadius: 4, fontSize: 10 }}>
          <span style={{ color: isErr ? '#dc2626' : '#f97316', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>⚠</span>
          <span style={{ color: isErr ? '#b91c1c' : '#c2410c', fontWeight: 600 }}>{msg}</span>
        </div>
      )
    }

    // Carte di_min réutilisable (individuelle et collective)
    const DiMinCard = ({ di_min, di_mm, label }) => {
      const ok = di_mm != null && di_min != null && di_mm >= di_min
      const ko = di_mm != null && di_min != null && di_mm < di_min
      return (
        <div style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
          <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
              {sf(di_min, 1)}
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>mm</span>
          </div>
          {ok && (
            <div style={{ fontSize: 9, marginTop: 2, fontWeight: 600, color: '#16a34a' }}>
              ✓ di = {di_mm} mm — DN suffisant
            </div>
          )}
          {ko && (
            <div style={{ fontSize: 9, marginTop: 2, fontWeight: 600, color: '#dc2626' }}>
              ✗ DN insuffisant — di disponible {di_mm} mm
            </div>
          )}
          {di_mm == null && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 2, fontStyle: 'italic' }}>Choisir un DN</div>}
        </div>
      )
    }

    // Abaque SVG inline
    const AbaqueChart = ({ X, di_min }) => {
      const W = 220, H = 130, pad = { l: 32, r: 10, t: 10, b: 24 }
      const iW = W - pad.l - pad.r
      const iH = H - pad.t - pad.b
      const xMin = 0, xMax = 16
      const yMin = 10, yMax = 22
      const px = v => pad.l + (v - xMin) / (xMax - xMin) * iW
      const py = v => pad.t + (1 - (v - yMin) / (yMax - yMin)) * iH

      const curve = ABAQUE.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(' ')

      const xClamp = Math.min(Math.max(X, xMin), xMax)
      const xScreen = px(xClamp)
      const diScreen = di_min != null ? py(di_min) : null

      return (
        <svg width={W} height={H} style={{ display: 'block', overflow: 'visible' }}>
          {/* Axes */}
          <line x1={pad.l} y1={pad.t} x2={pad.l} y2={pad.t + iH} stroke="#d1d5db" strokeWidth={1} />
          <line x1={pad.l} y1={pad.t + iH} x2={pad.l + iW} y2={pad.t + iH} stroke="#d1d5db" strokeWidth={1} />

          {/* Y grid + labels */}
          {[10, 12, 14, 16, 18, 20].map(v => (
            <g key={v}>
              <line x1={pad.l} y1={py(v)} x2={pad.l + iW} y2={py(v)} stroke="#f3f4f6" strokeWidth={1} />
              <text x={pad.l - 3} y={py(v) + 3.5} fontSize={8} textAnchor="end" fill="#9ca3af">{v}</text>
            </g>
          ))}
          {/* X labels */}
          {[0, 5, 10, 15].map(v => (
            <text key={v} x={px(v)} y={pad.t + iH + 13} fontSize={8} textAnchor="middle" fill="#9ca3af">{v}</text>
          ))}
          {/* Axis labels */}
          <text x={pad.l + iW / 2} y={H - 1} fontSize={8} textAnchor="middle" fill="#6b7280">X</text>
          <text x={7} y={pad.t + iH / 2} fontSize={8} textAnchor="middle" fill="#6b7280"
            transform={`rotate(-90, 7, ${pad.t + iH / 2})`}>di (mm)</text>

          {/* Abaque curve */}
          <path d={curve} fill="none" stroke="#6366f1" strokeWidth={2} strokeLinejoin="round" />

          {/* X marker */}
          {X > 0 && X <= 15 && (
            <>
              <line x1={xScreen} y1={pad.t} x2={xScreen} y2={pad.t + iH}
                stroke="#ef4444" strokeWidth={1} strokeDasharray="3 2" />
              {diScreen != null && (
                <>
                  <line x1={pad.l} y1={diScreen} x2={pad.l + iW} y2={diScreen}
                    stroke="#ef4444" strokeWidth={1} strokeDasharray="3 2" />
                  <circle cx={xScreen} cy={diScreen} r={3.5} fill="#ef4444" />
                </>
              )}
            </>
          )}
        </svg>
      )
    }

    return (
      <div className="rp-section">
        {isAlimECS ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 className="rp-title" style={{ margin: 0 }}>Tronçon</h3>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 8px', background: ecsColor + '18', border: `1px solid ${ecsColor}44`,
              borderRadius: 4, fontSize: 10, fontWeight: 700, color: ecsColor }}>
              <span style={{ fontSize: 8, background: ecsColor, color: '#fff',
                borderRadius: 3, padding: '1px 4px', letterSpacing: '0.4px' }}>{ecsShortCode}</span>
              {ecsRoleLabel}
            </div>
          </div>
        ) : (
          <h3 className="rp-title">Tronçon</h3>
        )}

        {/* ── Onglets ── */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {[['params', 'Paramètres'], ['results', 'Résultats']].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              flex: 1, padding: '5px 0', fontSize: 11, fontWeight: tab === key ? 700 : 500,
              border: `1px solid ${tab === key ? '#6366f1' : '#e5e7eb'}`,
              borderRadius: 5, cursor: 'pointer',
              background: tab === key ? '#eef2ff' : '#f9fafb',
              color: tab === key ? '#4338ca' : '#6b7280',
            }}>{label}</button>
          ))}
        </div>

        {/* ── Paramètres ── */}
        {tab === 'params' && (<>
          <SectionLabel>Identification</SectionLabel>
          <SegNameField displayName={isAlimECS ? ecsDisplayName : displayName} isDefault={isDefault} value={seg.name ?? ''} onChange={v => set('name', v)} />
          {!isAlimEF && (
            <Field label="Type de tronçon" labelFlex="44%">
              <select value={seg.type} onChange={e => set('type', e.target.value)}>
                <option value="aller">Aller ECS</option>
                <option value="retour">Retour ECS</option>
              </select>
            </Field>
          )}

          <hr className="rp-divider" />
          <CoteSection seg={seg} points={points} levels={levels} lineYs={lineYs} onUpdate={onUpdate} flowDirections={flowDirections} />
          <hr className="rp-divider" />

          <SectionLabel>Canalisation</SectionLabel>

          <Field label="Longueur" unit="m">
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
              <NumInput min={0}
                value={seg.length_override ?? null}
                placeholder="saisie manuelle"
                allowEmpty
                style={{ flex: 1, minWidth: 0 }}
                onChange={v => { set('length_override', v); setExprStr(v != null ? `= ${v}` : '') }} />
              <button
                onClick={() => setCalcOpen(o => !o)}
                title="Calculette"
                style={{
                  background: calcOpen ? '#eff6ff' : 'transparent',
                  border: `1px solid ${calcOpen ? '#93c5fd' : '#d1d5db'}`,
                  borderRadius: 5, cursor: 'pointer', padding: '3px 7px',
                  fontSize: 15, lineHeight: 1, flexShrink: 0,
                  color: calcOpen ? '#2563eb' : '#9ca3af',
                }}
              ><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><rect x="1" y="1" width="12" height="12" rx="1.5"/><rect x="2.5" y="2.5" width="9" height="2.5" rx="0.5"/><circle cx="4" cy="7.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="7" cy="7.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="10" cy="7.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="4" cy="10.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="7" cy="10.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="10" cy="10.5" r="0.9" fill="#f97316" stroke="none"/></svg></button>
            </div>
          </Field>
          {calcOpen && (
            <div style={{ margin: '2px 0 8px', padding: '8px 10px 10px', background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, marginBottom: 6 }}>Calcul de longueur</div>
              <input
                type="text"
                value={exprStr}
                placeholder="Saisir un calcul"
                autoFocus
                onChange={e => { const v = e.target.value; setExprStr(v); evalExpr(v) }}
                onKeyDown={e => { if (e.key === 'Escape') setCalcOpen(false) }}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>
          )}

          <Field label="Matériau">
            {enabledMats.length === 0
              ? <p className="lp-hint">Aucun matériau activé.</p>
              : <select value={seg.materialId || ''}
                  onChange={e => { set('materialId', e.target.value || null); set('dn', null) }}>
                  <option value="">— Choisir —</option>
                  {enabledMats.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
            }
          </Field>

          {selMat && (<>
            <Field label="DN">
              <select value={seg.dn || ''}
                onChange={e => { set('dn', e.target.value || null); set('di_override', null) }}>
                <option value="">— Choisir —</option>
                {selMat.dns.map(d => <option key={d.dn} value={d.dn}>{d.dn}</option>)}
              </select>
            </Field>
            {seg.dn && dnDef && selMat.minDi != null && dnDef.di < selMat.minDi && (
              <div style={{
                margin: '2px 0 6px', padding: '7px 10px', background: '#fef2f2',
                border: '1px solid #fecaca', borderRadius: 6,
                display: 'flex', gap: 7, alignItems: 'flex-start',
              }}>
                <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0, fontSize: 13, lineHeight: 1.3 }}>⚠</span>
                <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: 10.5, lineHeight: 1.5 }}>
                  {`di = ${dnDef.di} mm — diamètre intérieur inférieur au minimum prescrit par le NF DTU 60.11 (min. ${selMat.minDi} mm)`}
                </div>
              </div>
            )}
            {dnDef && (
              <Field label="Di" unit="mm">
                <NumInput
                  value={seg.di_override ?? null}
                  placeholder={`${dnDef.di} (par défaut)`}
                  allowEmpty
                  onChange={v => set('di_override', v)} />
              </Field>
            )}
            {selMat.encrassement && (selMat.encrassementEpaisseur ?? 0) > 0 && (
              <Field label="Ép. tartre" unit="mm">
                <NumInput
                  min={0} step={0.1}
                  value={seg.encrassementEpaisseur ?? null}
                  placeholder={`${selMat.encrassementEpaisseur} (par défaut)`}
                  allowEmpty
                  onChange={v => set('encrassementEpaisseur', v)} />
              </Field>
            )}
          </>)}

          {pdcParams && (pdcParams.methodeSing === 'accessoires' || pdcParams.equipementsActifs) && (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Singularités &amp; équipements</SectionLabel>
              {pdcParams.methodeSing === 'accessoires' && (
                <SegFittingsPanel seg={seg} set={set} pdcParams={pdcParams} mode={activeCalcId} />
              )}
              {pdcParams.equipementsActifs && (
                <SegEquipPanel seg={seg} set={set} pdcParams={pdcParams} mode={activeCalcId as string | null} />
              )}
            </>
          )}

          <AntenneGroupesAval
            seg={seg} allSegs={allSegs} points={points ?? []}
            flowDirections={flowDirections} materials={materials}
            roleMap={roleMap} groupDisplayNames={groupDisplayNames}
          />
        </>)}

        {/* ── Résultats ── */}
        {tab === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* Toggle Dimensionnement / Pertes de charge (alimentation-ecs et alimentation-ef) */}
            {isAlimMode && pdcParams != null && (
              <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 4 }}>
                {(['dimensionnement', 'pdc'] as const).map(key => (
                  <button key={key} onClick={() => onResultsViewChange(key)} style={{
                    flex: 1, textAlign: 'center' as const,
                    padding: '2px 4px 7px', fontSize: 10.5,
                    fontWeight: resultsView === key ? 700 : 400,
                    color: resultsView === key ? '#4338ca' : '#6b7280',
                    border: 'none',
                    borderBottom: resultsView === key ? '2px solid #6366f1' : '2px solid transparent',
                    background: 'none', cursor: 'pointer', marginBottom: -1,
                    whiteSpace: 'nowrap', transition: 'color 0.1s',
                  }}>
                    {key === 'pdc' ? 'Pertes de charge' : 'Dimensionnement'}
                  </button>
                ))}
              </div>
            )}

            {/* Résultats Pertes de charge */}
            {resultsView === 'pdc' && pdcParams != null && isAlimMode && (() => {
              const toId = flowDirections?.get(seg.id)?.toId
              const isTerminal = toId != null && points.find(p => p.id === toId)?.type === 'groupe'
              return (
                <PdcSegResults pdcResult={pdcResult} pdcParams={pdcParams} seg={seg} dnDef={dnDef} flowData={flowData}
                  alimentationData={isAlimECS ? alimentationData : null}
                  cumDp={pdcCumAlimResults?.segCumDp?.get(seg.id)}
                  postJunction={false}
                  segCol={segToCol?.get(seg.id) ?? null}
                  isOnCriticalPath={pdcCumAlimResults?.criticalSegIds?.has(seg.id) ?? false}
                  criticalCol={null}
                  isAlimEcs={true}
                  deltaH={pdcCumAlimResults?.segDeltaH?.get(seg.id) ?? null}
                  dpStatic={pdcCumAlimResults?.segDpStatic?.get(seg.id) ?? null}
                  pressionAval={pdcCumAlimResults?.segPressionAval?.get(seg.id) ?? null}
                  pStatAval={pdcCumAlimResults?.segPStatAval?.get(seg.id) ?? null}
                  isTerminalGroupePuisage={isTerminal}
                  buildingType={alimentationParams?.buildingType ?? 'habitation'}
                />
              )
            })()}

            {/* Résultats Dimensionnement NF DTU 60.11 */}
            {(resultsView !== 'pdc' || pdcParams == null) && (ad ? (() => {
              const isCollective = ad.method === 'collective'
              const c = isCollective ? ad.collective : null

              const methodReason = isCollective
                ? ad.collectiveReason === 'N > 5'
                  ? `N = ${ad.N} > 5`
                  : `N = ${ad.N} ≤ 5 et X = ${sf(ad.X, 1)} > 15`
                : `N = ${ad.N} ≤ 5 et X = ${sf(ad.X, 1)} ≤ 15`

              const velocity = (isCollective && c?.Qp != null && di_mm != null && di_mm > 0)
                ? (c.Qp * 1e-3) / (Math.PI * Math.pow(di_mm / 2000, 2))
                : null
              const vMax   = ad.isSousSol ? 2.0 : 1.5
              const velErr = velocity != null && velocity > vMax
              // Encrassement : vitesse avec diamètre réduit (avertissement, pas dimensionnement)
              const e_encr = selMat?.encrassement ? (seg.encrassementEpaisseur ?? selMat?.encrassementEpaisseur ?? 0) : 0
              const di_eff_val = (di_mm != null && e_encr > 0) ? Math.max(1, di_mm - 2 * e_encr) : null
              const velocity_eff = (isCollective && c?.Qp != null && di_eff_val != null && di_eff_val > 0)
                ? (c.Qp * 1e-3) / (Math.PI * Math.pow(di_eff_val / 2000, 2))
                : null
              const velErrEncr = !velErr && velocity_eff != null && velocity_eff > vMax

              const calcRow = (label: string, value: string) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '5px 10px', borderBottom: '1px solid #f3f4f6', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#6b7280' }}>{label}</span>
                  <span style={{ fontSize: 10.5, fontWeight: 500, color: '#374151',
                    fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
                </div>
              )
              const resultCalcRow = (label: string, value: string) => (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                  padding: '6px 10px', background: '#f9fafb', gap: 8 }}>
                  <span style={{ fontSize: 10, color: '#374151', fontWeight: 600 }}>{label}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#111827',
                    fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
                </div>
              )

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                  <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 500 }}>
                    Méthode {isCollective ? 'collective' : 'individuelle'} — {methodReason}
                  </div>

                  {/* ── Collective ── */}
                  {isCollective && c && (<>
                    {/* Vitesse */}
                    {velocity != null && (
                      <div style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                        <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700,
                          textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Vitesse</div>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                          <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>
                            {velocity.toFixed(2)}
                          </span>
                          <span style={{ fontSize: 11, color: '#9ca3af' }}>m/s</span>
                        </div>
                        <div style={{ fontSize: 9, marginTop: 2, fontWeight: 600,
                          color: velErr ? '#dc2626' : '#16a34a' }}>
                          {velErr
                            ? `✗ v > ${vMax === 2.0 ? '2,0' : '1,5'} m/s — risque d'érosion et bruit`
                            : `✓ v ≤ ${vMax === 2.0 ? '2,0' : '1,5'} m/s — conforme`}
                        </div>
                      </div>
                    )}

                    {velErrEncr && di_eff_val != null && velocity_eff != null && (
                      <Alert level="warning"
                        msg={`Avec tartre : dᵢ = ${di_eff_val.toFixed(1)} mm → V = ${velocity_eff.toFixed(2)} m/s > ${vMax === 2.0 ? '2,0' : '1,5'} m/s`} />
                    )}

                    {/* Diamètre intérieur minimum requis */}
                    <DiMinCard di_min={c.di_min} di_mm={di_mm} label="Diamètre intérieur min. requis" />

                    {/* Séparateur Détail */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0' }}>
                      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                      <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.06em' }}>Détail</span>
                      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                    </div>

                    {c.N_for_y > 0 ? (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                        {calcRow('N appareils en aval', String(c.N_for_y))}
                        {calcRow(`Débit de base Qs`, `${sf(c.Qs_for_y, 3)} l/s`)}
                        {calcRow('Coeff. de simultanéité y', sf(c.y, 3))}
                        {resultCalcRow('Débit probable Qp', `${sf(c.Qp, 3)} l/s`)}
                      </div>
                    ) : (
                      <div style={{ padding: '6px 10px', background: '#f9fafb',
                        border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>
                        Débit calculé intégralement depuis les WC robinets de chasse — aucun appareil soumis au coefficient y
                      </div>
                    )}

                    {c.isBatimentSim && c.N_sim > 0 && (
                      <div style={{ padding: '6px 10px', background: '#eff6ff',
                        border: '1px solid #bfdbfe', borderRadius: 5, fontSize: 10, color: '#1e40af' }}>
                        Lavabos et douches : simultanéité totale (y = 1) — {c.N_sim} app. → {sf(c.Qs_sim, 3)} l/s
                      </div>
                    )}
                    {c.N_wcc > 0 && (
                      <div style={{ padding: '6px 10px', background: '#fff7ed',
                        border: '1px solid #fed7aa', borderRadius: 5, fontSize: 10, color: '#374151' }}>
                        <span style={{ fontWeight: 700, color: '#c2410c' }}>WC robinets de chasse</span>
                        {' — '}{c.N_wcc} installé{c.N_wcc > 1 ? 's' : ''}
                        {' → '}{c.N_wcc_eff} simultané{c.N_wcc_eff > 1 ? 's' : ''}
                        {' → '}{sf(c.Qp_wcc, 3)} l/s
                      </div>
                    )}
                    {c.machineLingeLimited && (
                      <div style={{ padding: '6px 10px', background: '#f0fdf4',
                        border: '1px solid #bbf7d0', borderRadius: 5, fontSize: 10, color: '#166534' }}>
                        <span style={{ fontWeight: 700 }}>Machine à laver le linge</span>
                        {` — ${c.machineLinge_total} installées — 1 seule prise en compte dans le débit de base Qs (§3.2.2)`}
                      </div>
                    )}
                  </>)}

                  {/* ── Individuelle ── */}
                  {!isCollective && (<>
                    <DiMinCard di_min={ad.di_min} di_mm={di_mm} label="Diamètre intérieur minimum requis" />

                    {/* Séparateur Détail */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                      <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.06em' }}>Détail</span>
                      <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                    </div>

                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                      {calcRow('N appareils en aval', String(ad.N))}
                      {calcRow("Coeff. d'usage X", sf(ad.X, 1))}
                    </div>
                    <div style={{ padding: '8px 10px', background: '#f9fafb',
                      border: '1px solid #e5e7eb', borderRadius: 6 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280',
                        textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                        Abaque — Figure 1
                      </div>
                      <AbaqueChart X={ad.X} di_min={ad.di_min} />
                    </div>

                    {/* Vitesse et débit — simultanéité totale, à titre indicatif */}
                    {ad.flowRateForPdc != null && ad.flowRateForPdc > 0 && di_mm != null && di_mm > 0 && (() => {
                      const qAll = ad.flowRateForPdc
                      const vAll = (qAll * 1e-3) / (Math.PI * Math.pow(di_mm / 2000, 2))
                      return (
                        <div style={{ padding: '5px 10px', background: '#f8fafc',
                          border: '1px solid #e5e7eb', borderRadius: 6,
                          display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 8.5, color: '#94a3b8', fontStyle: 'italic', flexShrink: 0 }}>
                            Ouverture simultanée de tous les équipements :
                          </span>
                          <span style={{ fontSize: 9, fontWeight: 600, color: '#6b7280',
                            fontFamily: 'ui-monospace, monospace' }}>
                            Qs = {sf(qAll, 3)} l/s · V = {vAll.toFixed(2)} m/s
                          </span>
                        </div>
                      )
                    })()}
                  </>)}

                  {ad.nonDTUIds.length > 0 && (
                    <div style={{ padding: '6px 10px', background: '#fff7ed',
                      border: '1px solid #fed7aa', borderRadius: 5, fontSize: 10, color: '#374151' }}>
                      <span style={{ fontWeight: 700, color: '#c2410c' }}>Appareils hors tableau :</span>
                      {' '}dimensionnement sur données fabricant (débit, di min, pression min).
                    </div>
                  )}

                </div>
              )
            })() : (
              <p className="lp-hint" style={{ padding: '4px 0' }}>
                {seg.type === 'retour'
                  ? 'Tronçon retour — le dimensionnement s\'applique uniquement aux tronçons aller en Alimentation ECS.'
                  : isAlimEF
                    ? 'Aucun résultat — vérifiez qu\'un groupe de puisage est présent en aval, que des appareils sont activés, et que l\'arrivée EF est définie.'
                    : 'Aucun résultat — vérifiez qu\'un groupe de puisage est présent en aval, que des appareils sont activés, et que la production ECS est définie.'}
              </p>
            ))}
          </div>
        )}
      </div>
    )
  }

  if (isVentilation) {
    const vr = ventilationResult
    const dRow = (label: string, value: string, color?: string) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        padding: '5px 10px', borderBottom: '1px solid #f3f4f6', gap: 8 }}>
        <span style={{ fontSize: 10, color: '#6b7280' }}>{label}</span>
        <span style={{ fontSize: 10.5, fontWeight: color ? 700 : 500, color: color ?? '#374151',
          fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
      </div>
    )
    const role = roleMap?.get(seg.id) ?? (seg.type === 'retour' ? 'reprise' : 'soufflage')
    const roleLabel = role === 'reprise' ? 'Air extrait' : role === 'air-neuf' ? 'Air neuf' : role === 'air-rejete' ? 'Air rejeté' : 'Air soufflé'
    const roleBadge = role === 'reprise' ? 'AE' : role === 'air-rejete' ? 'AR' : role === 'air-neuf' ? 'AN' : 'AS'
    const roleColor = role === 'reprise' ? '#db2777' : role === 'air-rejete' ? '#64748b' : role === 'air-neuf' ? '#0ea5e9' : '#059669'
    // Strip "Air xxx – " prefix from auto-generated name — the badge already shows the network type
    const ventDisplayName = isDefault && displayName
      ? displayName.replace(/^[^–]*–\s*/, '')
      : displayName

    return (
      <div className="rp-section">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 className="rp-title" style={{ margin: 0 }}>Tronçon</h3>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', background: roleColor + '18', border: `1px solid ${roleColor}44`,
            borderRadius: 4, fontSize: 10, fontWeight: 700, color: roleColor }}>
            <span style={{ fontSize: 8, background: roleColor, color: '#fff',
              borderRadius: 3, padding: '1px 4px', letterSpacing: '0.4px' }}>{roleBadge}</span>
            {roleLabel}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {[['params', 'Paramètres'], ['results', 'Résultats']].map(([key, label]) => (
            <button key={key} onClick={() => {
              setTab(key)
              if (key === 'params' && drawMode === 'editParams') onExitEditParams?.()
            }} style={{
              flex: 1, padding: '5px 0', fontSize: 11, fontWeight: tab === key ? 700 : 500,
              border: `1px solid ${tab === key ? '#6366f1' : '#e5e7eb'}`,
              borderRadius: 5, cursor: 'pointer',
              background: tab === key ? '#eef2ff' : '#f9fafb',
              color: tab === key ? '#4338ca' : '#6b7280',
            }}>{label}</button>
          ))}
        </div>

        {tab === 'params' && (<>
          <SectionLabel>Identification</SectionLabel>
          <SegNameField displayName={ventDisplayName} isDefault={isDefault} value={seg.name ?? ''} onChange={v => set('name', v)} />
          <hr className="rp-divider" />
          <SectionLabel>Canalisation</SectionLabel>

          {/* Longueur */}
          <Field label="Longueur" unit="m">
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
              <NumInput min={0}
                value={seg.length_override ?? null}
                placeholder="saisie manuelle"
                allowEmpty style={{ flex: 1, minWidth: 0 }}
                onChange={v => { set('length_override', v); setExprStr(v != null ? `= ${v}` : '') }} />
              <button onClick={() => setCalcOpen(o => !o)} title="Calculette" style={{
                background: calcOpen ? '#eff6ff' : 'transparent',
                border: `1px solid ${calcOpen ? '#93c5fd' : '#d1d5db'}`,
                borderRadius: 5, cursor: 'pointer', padding: '3px 7px',
                fontSize: 15, lineHeight: 1, flexShrink: 0,
                color: calcOpen ? '#2563eb' : '#9ca3af',
              }}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><rect x="1" y="1" width="12" height="12" rx="1.5"/><rect x="2.5" y="2.5" width="9" height="2.5" rx="0.5"/><circle cx="4" cy="7.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="7" cy="7.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="10" cy="7.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="4" cy="10.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="7" cy="10.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="10" cy="10.5" r="0.9" fill="#f97316" stroke="none"/></svg></button>
            </div>
          </Field>
          {calcOpen && (
            <div style={{ margin: '2px 0 8px', padding: '8px 10px 10px', background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
              <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, marginBottom: 6 }}>Calcul de longueur</div>
              <input type="text" value={exprStr} placeholder="Saisir un calcul" autoFocus
                onChange={e => { const v = e.target.value; setExprStr(v); evalExpr(v) }}
                onKeyDown={e => { if (e.key === 'Escape') setCalcOpen(false) }}
                style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
          )}

          {/* Toggle Circulaire / Rectangulaire */}
          {(() => {
            const ductShape: 'circular' | 'rectangular' = (seg as any).ductShape ?? 'circular'
            const circMats  = enabledMats.filter(m => !m.shapeType || m.shapeType === 'circular')
            const rectMats  = enabledMats.filter(m => m.shapeType === 'rectangular')
            const shapeMats = ductShape === 'rectangular' ? rectMats : circMats
            const shapeMat  = materials.find(m => m.id === seg.materialId)
            const shapeDnDef = shapeMat?.dns.find(d => d.dn === seg.dn) as any

            const switchShape = (next: 'circular' | 'rectangular') => {
              if (ductShape === next) return
              const autoMat = next === 'rectangular' ? rectMats[0] : null
              set('ductShape', next)
              set('materialId', autoMat?.id ?? null)
              set('dn', null)
              set('di_override', null)
              set('a_override', null)
              set('b_override', null)
            }

            return (<>
              {/* Pill toggle */}
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 7, padding: 2, marginBottom: 10, gap: 2 }}>
                {([['circular', '◎  Circulaire'], ['rectangular', '▭  Rectangulaire']] as const).map(([val, label]) => (
                  <button key={val} onClick={() => switchShape(val)} style={{
                    flex: 1, padding: '5px 4px', fontSize: 10.5, fontWeight: ductShape === val ? 700 : 500,
                    background: ductShape === val ? '#fff' : 'transparent',
                    border: ductShape === val ? '1px solid #cbd5e1' : '1px solid transparent',
                    borderRadius: 5, cursor: 'pointer',
                    color: ductShape === val ? '#1e40af' : '#94a3b8',
                    boxShadow: ductShape === val ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    transition: 'all 0.15s',
                  }}>{label}</button>
                ))}
              </div>

              {/* Matériau */}
              <Field label="Matériau">
                {shapeMats.length === 0
                  ? <p className="lp-hint">Aucun matériau activé.</p>
                  : <select value={seg.materialId || ''}
                      onChange={e => { set('materialId', e.target.value || null); set('dn', null); set('di_override', null) }}>
                      <option value="">— Choisir —</option>
                      {shapeMats.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>}
              </Field>

              {/* Circulaire : DN + Di */}
              {ductShape === 'circular' && shapeMat && (<>
                <Field label="DN">
                  <select value={seg.dn || ''}
                    onChange={e => { set('dn', e.target.value || null); set('di_override', null) }}>
                    <option value="">— Choisir —</option>
                    {shapeMat.dns.map(d => <option key={d.dn} value={d.dn}>{d.dn}</option>)}
                  </select>
                </Field>
                {shapeDnDef && (
                  <Field label="Di" unit="mm">
                    <NumInput value={seg.di_override ?? null} placeholder={`${shapeDnDef.di} (par défaut)`}
                      allowEmpty onChange={v => set('di_override', v)} />
                  </Field>
                )}
              </>)}

              {/* Rectangulaire : A×B modifiables + Dh calculé */}
              {ductShape === 'rectangular' && shapeMat && (<>
                <Field label="Dimensions">
                  <select value={seg.dn || ''}
                    onChange={e => {
                      set('dn', e.target.value || null)
                      set('di_override', null)
                      set('a_override', null)
                      set('b_override', null)
                    }}>
                    <option value="">— Choisir —</option>
                    {shapeMat.dns.map(d => <option key={d.dn} value={d.dn}>{d.dn} mm</option>)}
                  </select>
                </Field>
                {shapeDnDef && (() => {
                  const aEff = (seg as any).a_override ?? shapeDnDef.a
                  const bEff = (seg as any).b_override ?? shapeDnDef.b
                  const dhEff = Math.round(2 * aEff * bEff / (aEff + bEff))
                  return (<>
                    <Field label="Largeur (L)" unit="mm">
                      <NumInput min={1} value={(seg as any).a_override ?? null}
                        placeholder={`${shapeDnDef.a} (par défaut)`} allowEmpty
                        onChange={v => set('a_override', v)} />
                    </Field>
                    <Field label="Hauteur (H)" unit="mm">
                      <NumInput min={1} value={(seg as any).b_override ?? null}
                        placeholder={`${shapeDnDef.b} (par défaut)`} allowEmpty
                        onChange={v => set('b_override', v)} />
                    </Field>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '5px 8px', background: '#f8fafc', border: '1px solid #e2e8f0',
                      borderRadius: 5, marginBottom: 6,
                    }}>
                      <span style={{ fontSize: 10, color: '#6b7280' }}>Dh (diamètre hydraulique)</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', fontFamily: 'ui-monospace, monospace' }}>
                        {dhEff} mm
                      </span>
                    </div>
                  </>)
                })()}
              </>)}
            </>)
          })()}

          {pdcParams && (pdcParams.methodeSing === 'accessoires' || pdcParams.equipementsActifs) && (<>
            <hr className="rp-divider" />
            <SectionLabel>Singularités &amp; équipements</SectionLabel>
            {pdcParams.methodeSing === 'accessoires' && (() => {
              const ductShape: 'circular' | 'rectangular' = (seg as any).ductShape ?? 'circular'
              const ventSings = (seg as any).ventSingularites as VentSingularity[] ?? []
              const dynP      = vr ? 0.5 * vr.rho * vr.v_ms ** 2 : null
              const Re_seg    = vr ? vr.v_ms * (vr.di_mm / 1000) / 15e-6 : null
              const singMat   = materials.find(m => m.id === seg.materialId)
              const singDnDef = singMat?.dns?.find((d: any) => d.dn === seg.dn) as any

              if (ductShape === 'circular') {
                // Diamètre : priorité au résultat calculé, fallback sur définition DN
                const seg_di_mm  = (seg as any).di_override ?? singDnDef?.di ?? null
                const di_mm      = vr?.di_mm ?? seg_di_mm
                const configured = !!(seg.materialId && seg.dn && seg_di_mm != null)
                const ductInfo   = configured && singMat
                  ? `${singMat.name} · Circulaire · Ø ${(seg_di_mm as number).toFixed(0)} mm`
                  : null
                return (
                  <VentSingularitiesPanel
                    sings={ventSings}
                    dynPressure={dynP}
                    di_mm={di_mm}
                    Re={Re_seg}
                    onChange={v => set('ventSingularites', v)}
                    configured={configured}
                    ductInfo={ductInfo}
                  />
                )
              }

              // Gaine rectangulaire
              const a_mm           = (seg as any).a_override ?? singDnDef?.a ?? null
              const h_mm_val       = (seg as any).b_override ?? singDnDef?.b ?? null
              const rectConfigured = !!(seg.materialId && seg.dn && (a_mm != null || h_mm_val != null))
              const rectDuctInfo   = rectConfigured && singMat
                ? `${singMat.name} · Rectangulaire · ${a_mm ?? '?'} × ${h_mm_val ?? '?'} mm`
                : null
              return (
                <VentRectSingularitiesPanel
                  sings={ventSings}
                  dynPressure={dynP}
                  l_mm={a_mm}
                  h_mm={h_mm_val}
                  Re={Re_seg}
                  onChange={v => set('ventSingularites', v)}
                  configured={rectConfigured}
                  ductInfo={rectDuctInfo}
                />
              )
            })()}
            {pdcParams.equipementsActifs && (
              <SegEquipPanel seg={seg} set={set} pdcParams={pdcParams} mode={activeCalcId as string | null} />
            )}
          </>)}
        </>)}

        {tab === 'results' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

            {/* ── Sous-onglets Dimensionnement / Pertes de charge ── */}
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 4 }}>
              {(['dimensionnement', 'pdc'] as const).map(key => (
                <button key={key} onClick={() => onResultsViewChange(key)} style={{
                  flex: 1, textAlign: 'center' as const,
                  padding: '2px 4px 7px', fontSize: 10.5,
                  fontWeight: resultsView === key ? 700 : 400,
                  color: resultsView === key ? '#4338ca' : '#6b7280',
                  border: 'none',
                  borderBottom: resultsView === key ? '2px solid #6366f1' : '2px solid transparent',
                  background: 'none', cursor: 'pointer', marginBottom: -1,
                  whiteSpace: 'nowrap', transition: 'color 0.1s',
                }}>
                  {key === 'pdc' ? 'Pertes de charge' : 'Dimensionnement'}
                </button>
              ))}
            </div>

            {ventilationFlow?.hasError && (
              <div style={{ padding: '7px 10px', background: '#fef2f2', border: '1px solid #fecaca',
                borderRadius: 6, fontSize: 10, color: '#dc2626', fontWeight: 600 }}>
                ⚠ Incohérence — vérifier les débits aux nœuds
              </div>
            )}

            {/* ── Dimensionnement ── */}
            {resultsView !== 'pdc' && (() => {
              const flow = ventilationFlow
              const Q    = vr?.Q_m3h ?? flow?.flowRate ?? null
              const src  = flow?.source ?? null
              const sourceBadge = src && (
                <span style={{ fontSize: 8, fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                  background: src === 'bouche' ? '#f0fdf4' : src === 'computed' ? '#eff6ff' : '#fdf4ff',
                  color: src === 'bouche' ? '#16a34a' : src === 'computed' ? '#2563eb' : '#7c3aed',
                  border: `1px solid ${src === 'bouche' ? '#bbf7d0' : src === 'computed' ? '#bfdbfe' : '#e9d5ff'}` }}>
                  {src === 'bouche' ? 'bouche' : src === 'computed' ? 'calculé' : 'manuel'}
                </span>
              )
              return (<>
                {/* Débit — affiché même sans matériau/DN */}
                {Q != null ? (
                  <div style={{ padding: '8px 12px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700,
                        textTransform: 'uppercase', letterSpacing: '0.05em' }}>Débit</div>
                      {sourceBadge}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{Q.toFixed(0)}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>m³/h</span>
                    </div>
                  </div>
                ) : (
                  <p className="lp-hint">Débit non calculé — saisir les débits aux bouches ou nœuds d'extrémité.</p>
                )}

                {/* Vitesse + di — uniquement si matériau et DN sélectionnés */}
                {vr ? (<>
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                    {dRow('Vitesse', `${vr.v_ms.toFixed(2)} m/s`)}
                    {vr.shape === 'rectangular' && vr.a_mm && vr.b_mm
                      ? (<>
                          {dRow('Dimensions', `${vr.a_mm} × ${vr.b_mm} mm`)}
                          {dRow('Dh', `${vr.di_mm.toFixed(0)} mm`)}
                        </>)
                      : dRow('di', `${vr.di_mm.toFixed(1)} mm`)}
                  </div>
                </>) : Q != null && (
                  <p className="lp-hint" style={{ fontStyle: 'italic' }}>
                    {enabledMats.length === 0
                      ? 'Aucun matériau activé — configurez les matériaux ventilation.'
                      : !seg.materialId
                        ? 'Vitesse non calculable — choisir un matériau.'
                        : !seg.dn
                          ? 'Vitesse non calculable — choisir un DN / section.'
                          : null}
                  </p>
                )}
              </>)
            })()}

            {/* ── Pertes de charge ── */}
            {resultsView === 'pdc' && (vr
              ? <VentPdcResults vr={vr} pdcParams={pdcParams} seg={seg} />
              : (
                <p className="lp-hint">
                  {enabledMats.length === 0
                    ? 'Aucun matériau activé — configurez les matériaux ventilation.'
                    : !seg.materialId ? 'Choisir un matériau.'
                    : !seg.dn ? 'Choisir un DN / section.'
                    : 'Débit non calculé — saisir les débits aux bouches ou nœuds d\'extrémité.'}
                </p>
              )
            )}
          </div>
        )}
      </div>
    )
  }

  const csRole      = roleMap?.get(seg.id)
  const csIsRetour  = seg.type === 'retour'
  const csShowBadge = isBouclage || isChauffage || isEauGlacee
  const csModeLabel = isBouclage ? 'ECS' : isChauffage ? 'CH' : 'EG'
  const csIsBypass  = (isChauffage || isEauGlacee) && csIsRetour && !!displayName?.includes('vers mélange')
  const csShortCode = !csShowBadge ? '' :
    csRole === 'collecteur-aller'        ? 'CA' :
    csRole === 'collecteur-retour'       ? 'CR' :
    (isBouclage && csRole === 'antenne') ? 'ANT' :
    csIsRetour ? 'R' : 'A'
  const csRoleLabel = !csShowBadge ? '' :
    csRole === 'collecteur-aller'        ? `Collecteur aller — ${csModeLabel}` :
    csRole === 'collecteur-retour'       ? `Collecteur retour — ${csModeLabel}` :
    (isBouclage && csRole === 'antenne') ? 'Antenne — ECS' :
    csIsRetour ? `Retour — ${csModeLabel}` : `Aller — ${csModeLabel}`
  const csDisplayName = csShowBadge && !csIsBypass && isDefault && displayName
    ? displayName.replace(/^[^–]*–\s*/, '')
    : displayName
  const csColor = isBouclage
    ? (csIsRetour ? (displayPrefs?.ecs?.colorRetour       ?? '#f97316') : (displayPrefs?.ecs?.colorAller       ?? '#dc2626'))
    : isChauffage
    ? (csIsRetour ? (displayPrefs?.chauffage?.colorRetour ?? '#2563eb') : (displayPrefs?.chauffage?.colorAller ?? '#2563eb'))
    : isEauGlacee
    ? (csIsRetour ? (displayPrefs?.eauglacee?.colorRetour ?? '#1d4ed8') : (displayPrefs?.eauglacee?.colorAller ?? '#06b6d4'))
    : '#6366f1'

  return (
    <div className="rp-section">
      {csShowBadge ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 className="rp-title" style={{ margin: 0 }}>Tronçon</h3>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '3px 8px', background: csColor + '18', border: `1px solid ${csColor}44`,
            borderRadius: 4, fontSize: 10, fontWeight: 700, color: csColor }}>
            <span style={{ fontSize: 8, background: csColor, color: '#fff',
              borderRadius: 3, padding: '1px 4px', letterSpacing: '0.4px' }}>{csShortCode}</span>
            {csRoleLabel}
          </div>
        </div>
      ) : (
        <h3 className="rp-title">Tronçon</h3>
      )}

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {[['params', 'Paramètres'], ['results', 'Résultats']].map(([key, label]) => (
          <button key={key} onClick={() => {
            setTab(key)
            if (key === 'params' && drawMode === 'editParams') onExitEditParams?.()
          }} style={{
            flex: 1, padding: '5px 0', fontSize: 11, fontWeight: tab === key ? 700 : 500,
            border: `1px solid ${tab === key ? '#6366f1' : '#e5e7eb'}`,
            borderRadius: 5, cursor: 'pointer',
            background: tab === key ? '#eef2ff' : '#f9fafb',
            color: tab === key ? '#4338ca' : '#6b7280',
          }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'results' && (
        <div>
          {(pdcParams != null || isEauGlacee) && (
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 12 }}>
              {(isEauGlacee
                ? ['dimensionnement', 'condensation', ...(pdcParams != null ? ['pdc'] : [])]
                : ['dimensionnement', 'pdc']
              ).map(key => {
                const label = isEauGlacee
                  ? key === 'dimensionnement' ? 'Dimensionnement'
                  : key === 'condensation'    ? 'Condensation'
                  :                             'PDC'
                  : key === 'pdc' ? 'Pertes de charge' : 'Dimensionnement'
                return (
                  <button key={key} onClick={() => onResultsViewChange(key)} style={{
                    flex: 1, textAlign: 'center' as const,
                    padding: '2px 4px 7px', fontSize: 10.5,
                    fontWeight: resultsView === key ? 700 : 400,
                    color: resultsView === key ? '#4338ca' : '#6b7280',
                    border: 'none',
                    borderBottom: resultsView === key ? '2px solid #6366f1' : '2px solid transparent',
                    background: 'none', cursor: 'pointer', marginBottom: -1,
                    whiteSpace: 'nowrap', transition: 'color 0.1s',
                  }}>
                    {label}
                  </button>
                )
              })}
            </div>
          )}
          {isBouclage && roleMap?.get(seg.id) === 'antenne' ? (
            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
              Antenne — pas de recirculation sur ce tronçon, aucun calcul hydraulique ou thermique de bouclage ne s'applique.
            </div>
          ) : resultsView === 'pdc' && pdcParams != null ? (
            (() => {
              const toId = flowDirections?.get(seg.id)?.toId
              const isTerminal = isAlimMode && toId != null
                && points.find(p => p.id === toId)?.type === 'groupe'
              return (
                <PdcSegResults pdcResult={pdcResult} pdcParams={pdcParams} seg={seg} dnDef={dnDef} flowData={flowData}
                  alimentationData={isAlimECS ? alimentationData : null}
                  cumDp={isAlimMode
                    ? pdcCumAlimResults?.segCumDp?.get(seg.id)
                    : (isChauffage || isEauGlacee)
                      ? ((isChauffage ? chauffageSplitCumDp : eauGlaceeSplitCumDp)?.segCumDp.get(seg.id) ?? pdcCumResults?.segCumDp.get(seg.id))
                      : pdcCumResults?.segCumDp.get(seg.id)}
                  cumDpLabel={isChauffage
                    ? (chauffageSplitCumDp?.secondarySegIds.has(seg.id) ? 'ΔP depuis vanne mélange' : 'ΔP depuis production CH')
                    : isEauGlacee
                      ? (eauGlaceeSplitCumDp?.secondarySegIds.has(seg.id) ? 'ΔP depuis vanne mélange' : 'ΔP depuis groupe froid')
                      : 'ΔP depuis production ECS'}
                  postJunction={isAlimMode ? false : (isChauffage || isEauGlacee)
                    ? ((isChauffage ? chauffageSplitCumDp : eauGlaceeSplitCumDp)?.segPostJunction.get(seg.id) ?? false)
                    : (pdcCumResults?.segPostJunction.get(seg.id) ?? false)}
                  segCol={(isChauffage || isEauGlacee)
                    ? (() => {
                        const splitDp = isChauffage ? chauffageSplitCumDp : eauGlaceeSplitCumDp
                        const winnerId = splitDp?.segJunctionWinner?.get(seg.id)
                        return winnerId ? (segToCol?.get(winnerId) ?? null) : null
                      })()
                    : (segToCol?.get(seg.id) ?? null)}
                  isOnCriticalPath={isAlimMode
                    ? (pdcCumAlimResults?.criticalSegIds?.has(seg.id) ?? false)
                    : (isChauffage || isEauGlacee)
                      ? ((isChauffage ? chauffageSplitCumDp : eauGlaceeSplitCumDp)?.criticalSegIds.has(seg.id) ?? false)
                      : (pdcCumResults?.criticalSegIds?.has(seg.id) ?? false)}
                  criticalCol={isAlimMode ? null : (isChauffage || isEauGlacee) ? null : (segToCol?.get(pdcCumResults?.criticalLeafSegId ?? '') ?? null)}
                  isAlimEcs={isAlimMode}
                  deltaH={pdcCumAlimResults?.segDeltaH?.get(seg.id) ?? null}
                  dpStatic={pdcCumAlimResults?.segDpStatic?.get(seg.id) ?? null}
                  pressionAval={pdcCumAlimResults?.segPressionAval?.get(seg.id) ?? null}
                  pStatAval={pdcCumAlimResults?.segPStatAval?.get(seg.id) ?? null}
                  isTerminalGroupePuisage={isTerminal}
                  buildingType={alimentationParams?.buildingType ?? 'habitation'}
                />
              )
            })()
          ) : resultsView === 'condensation' && isEauGlacee ? (() => {
            const thermalEntry  = eauGlaceeThermal?.segResults?.get(seg.id)
            const T_from_cond   = thermalEntry?.T_from ?? null
            const T_fluid: number = T_from_cond ?? eauGlaceeParams?.T_depart ?? 7
            const T_amb_cond    = getSegAmbTemp(seg, levels, lineYs)
            const HR            = getSegHR(seg, levels, lineYs, hrGlobalDefault)
            const de_mm: number | null = seg.de_override ?? dnDef?.de ?? null
            const di_mm: number | null = seg.di_override ?? dnDef?.di ?? null
            const lambda_tube: number | null = seg.lambda_tube_override ?? selMat?.lambda ?? null
            const e_mm = typeof seg.thickness === 'number' && seg.thickness > 0 ? seg.thickness : null
            const hasInsul = selIns != null && e_mm != null
            const anyInsulEnabled = enabledIns.length > 0

            const dRowC = (label: string, value: string, color?: string) => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '5px 10px', borderBottom: '1px solid #f3f4f6', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>{label}</span>
                <span style={{ fontSize: 10.5, fontWeight: color ? 700 : 500, color: color ?? '#374151',
                  fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
              </div>
            )

            if (!anyInsulEnabled) {
              return (
                <div style={{ fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>
                  Aucun isolant activé dans les paramètres EG.
                </div>
              )
            }

            if (HR == null) {
              return (
                <div style={{ padding: '10px 12px', background: '#fffbeb',
                  border: '1px solid #fde68a', borderRadius: 6, fontSize: 10.5, color: '#92400e' }}>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>Humidité relative (HR) non renseignée</div>
                  <div style={{ color: '#78350f' }}>
                    Saisir la valeur globale dans le panneau <strong>Isolants</strong> (panneau gauche)
                    ou la valeur propre à ce tronçon dans <strong>HR tronçon</strong> ci-dessous.
                  </div>
                </div>
              )
            }

            if (de_mm == null) {
              return (
                <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>
                  Matériau / DN non défini — impossible de calculer.
                </div>
              )
            }

            const T_rosee    = getDewPoint(T_amb_cond, HR)
            const lambda_ins = hasInsul ? (seg.lambda_insul_override ?? selIns!.lambda) : 0.04
            const res        = computeCondensationFromParams(
              T_fluid, T_amb_cond, HR, de_mm,
              hasInsul ? e_mm! : 0,
              lambda_ins, di_mm, lambda_tube,
              calcConstants?.h_ext_eg ?? H_EXT_DEFAULT,
              calcConstants?.h_int_eg ?? H_INT_DEFAULT,
              calcConstants?.margin_cond ?? 1,
            )
            const T_surf = res.T_surf
            const marge  = res.marge
            const risque = res.risque
            const R_nec  = res.R_nec
            const margeColor = risque ? '#ef4444' : '#16a34a'

            // Résistances individuelles
            const R_si_val   = (di_mm != null && di_mm > 0) ? getInternalResistance(di_mm) : 0
            const R_tube_val = (di_mm != null && di_mm > 0 && lambda_tube != null && lambda_tube > 0)
              ? getPipeWallResistance(di_mm, de_mm, lambda_tube) : 0
            const lambda_ins_val = hasInsul ? (seg.lambda_insul_override ?? selIns!.lambda) : null
            const R_ins_val  = hasInsul && lambda_ins_val != null
              ? getInsulationResistance(de_mm, e_mm!, lambda_ins_val) : 0
            const R_ext_val  = getExteriorResistance(de_mm, hasInsul ? e_mm! : 0)

            // Résistance totale requise (R_si + R_tube + R_ins_nec + R_ext_bare)
            const R_ext_bare   = getExteriorResistance(de_mm, 0)
            const R_total_nec  = R_nec != null && isFinite(R_nec)
              ? R_si_val + R_tube_val + R_nec + R_ext_bare
              : null

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* Statut */}
                <div style={{ padding: '8px 12px', background: '#fff',
                  border: `1px solid ${risque ? '#fecaca' : '#d1fae5'}`, borderRadius: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: risque ? '#ef4444' : '#16a34a' }}>
                    {risque ? '⚠ Condensation probable' : '✓ Pas de condensation'}
                  </div>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: margeColor, marginTop: 2 }}>
                    {risque ? `Déficit = ${marge.toFixed(1)} °C` : `Marge = +${marge.toFixed(1)} °C`}
                  </div>
                </div>

                {/* Résultats */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                  {/* Résistance totale actuelle avec détail inline */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '5px 10px', borderBottom: '1px solid #f3f4f6', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 10, color: '#6b7280' }}>Résistance totale</span>
                      <button onClick={() => setOpenResDetail(o => !o)} style={{
                        background: 'none', border: 'none', padding: '0 2px', cursor: 'pointer',
                        fontSize: 8.5, color: '#c4c9d4', display: 'flex', alignItems: 'center', gap: 2, fontWeight: 500,
                      }}>
                        <span style={{ display: 'inline-block', fontSize: 6,
                          transform: openResDetail ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                        détail
                      </button>
                    </div>
                    <span style={{ fontSize: 10.5, fontWeight: 500, color: '#374151',
                      fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
                      {(R_si_val + R_tube_val + R_ins_val + R_ext_val).toFixed(3)} K·m/W
                    </span>
                  </div>
                  {openResDetail && (
                    <div style={{ borderBottom: '1px solid #f3f4f6',
                      fontSize: 9, color: '#9ca3af', lineHeight: 2,
                      fontFamily: 'ui-monospace, monospace', padding: '2px 10px 6px 22px' }}>
                      {R_si_val > 0   && <div>R conv. intérieure  = {R_si_val.toFixed(4)} K·m/W</div>}
                      {R_tube_val > 0 && <div>R tube = {R_tube_val.toFixed(4)} K·m/W</div>}
                      {hasInsul       && <div>R isolant            = {R_ins_val.toFixed(4)} K·m/W</div>}
                      <div>R conv. extérieure  = {R_ext_val.toFixed(4)} K·m/W</div>
                    </div>
                  )}
                  {risque && R_total_nec != null && dRowC(
                    'Résistance totale requise',
                    `${R_total_nec.toFixed(3)} K·m/W`,
                    '#ef4444'
                  )}
                  {dRowC(
                    hasInsul ? 'Température de surface' : 'Température de surface (nue)',
                    `${T_surf.toFixed(1)} °C`
                  )}
                  {dRowC('Température de rosée', `${T_rosee.toFixed(1)} °C`)}
                  {risque  && dRowC('Déficit', `${marge.toFixed(1)} °C`, '#ef4444')}
                  {!risque && dRowC('Marge',   `+${marge.toFixed(1)} °C`, '#16a34a')}
                </div>

                {risque && R_nec != null && (
                  <div style={{ fontSize: 9.5, color: '#6b7280' }}>
                    Isolant requis : R isolant ≥ {isFinite(R_nec) ? R_nec.toFixed(3) : '∞'} K·m/W
                  </div>
                )}

                {/* Données techniques */}
                <div style={{ marginTop: 4 }}>
                  <button onClick={() => setOpenCondDetail(o => !o)} style={{
                    background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                    fontSize: 9, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500,
                  }}>
                    <span style={{ display: 'inline-block', fontSize: 7,
                      transform: openCondDetail ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                    Données techniques
                  </button>
                  {openCondDetail && (
                    <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 2,
                      fontFamily: 'ui-monospace, monospace', paddingLeft: 12, marginTop: 2 }}>
                      <div>T° fluide = {T_fluid.toFixed(1)} °C</div>
                      <div>T° ambiante = {T_amb_cond.toFixed(1)} °C</div>
                      <div>Humidité relative = {HR.toFixed(0)} %</div>
                      {di_mm != null && <div>Diamètre intérieur = {di_mm} mm</div>}
                      <div>Diamètre extérieur = {de_mm} mm</div>
                      {lambda_tube != null && <div>λ tube = {lambda_tube.toFixed(3)} W/(m·K)</div>}
                      {hasInsul
                        ? <>
                            <div>Isolant = {selIns!.name} — {e_mm} mm</div>
                            {lambda_ins_val != null && <div>λ isolant = {lambda_ins_val.toFixed(3)} W/(m·K)</div>}
                          </>
                        : <div>Isolant = Non isolé</div>}
                      <div>Conv. intérieure = {H_INT_DEFAULT} W/(m²·K)</div>
                      <div>Conv. extérieure = {H_EXT_DEFAULT} W/(m²·K)</div>
                    </div>
                  )}
                </div>

              </div>
            )
          })()
          : (isChauffage || isEauGlacee) ? (() => {
            const thermalEntry = isChauffage ? chauffageThermal?.segResults?.get(seg.id) : eauGlaceeThermal?.segResults?.get(seg.id)
            const T_from       = thermalEntry?.T_from ?? null
            const T_to         = thermalEntry?.T_to   ?? null
            const velocity     = flowData?.velocity   ?? null
            const flowRate     = flowData?.flowRate   ?? null
            const puissanceW   = flowData?.puissanceAmont ?? null
            const puissanceKW  = puissanceW != null ? puissanceW / 1000 : null
            const di_mm        = seg.di_override ?? dnDef?.di ?? null

            const J = pdcResult?.J ?? null   // gradient linéaire Pa/m

            const dRow = (label: string, value: string, color?: string) => (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '5px 10px', borderBottom: '1px solid #f3f4f6', gap: 8 }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>{label}</span>
                <span style={{ fontSize: 10.5, fontWeight: color ? 700 : 500, color: color ?? '#374151',
                  fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
              </div>
            )

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* ── Vitesse ── */}
                {velocity != null ? (
                  <div style={{ padding: '8px 12px', background: '#fff',
                    border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Vitesse</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                        {velocity.toFixed(3)}
                      </span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>m/s</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                    {di_mm == null
                      ? 'Choisir un DN pour calculer la vitesse.'
                      : isChauffage ? 'Débit non calculé — placez une production chauffage.' : 'Débit non calculé — placez un groupe froid.'}
                  </div>
                )}

                {/* ── Gradient linéaire ── */}
                {J != null ? (
                  <div style={{ padding: '8px 12px', background: '#fff',
                    border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700,
                      textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>Pertes de charge linéaires</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                        {J.toFixed(1)}
                      </span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>Pa/m</span>
                    </div>
                  </div>
                ) : velocity != null && di_mm != null ? (
                  <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                    Configurez les paramètres PDC pour calculer R.
                  </div>
                ) : null}

                {/* ── Tableau récap ── */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                  {flowRate    != null && dRow('Débit',               `${flowRate.toFixed(3)} m³/h`)}
                  {puissanceKW != null && puissanceKW > 0 && dRow('Puissance transportée', `${puissanceKW.toFixed(2)} kW`)}
                  {isEauGlacee && (() => {
                    const Q_apport = egApportsMap?.get(seg.id)
                    if (Q_apport == null || Q_apport <= 0) return null
                    const txt = Q_apport >= 1000 ? `${(Q_apport / 1000).toFixed(2)} kW` : `${Math.round(Q_apport)} W`
                    return dRow('Apports thermiques', txt, '#f97316')
                  })()}
                </div>

                {/* ── Données techniques ── */}
                <div style={{ marginTop: 4 }}>
                  <button onClick={() => setOpenDetailTherm(o => !o)} style={{
                    background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                    fontSize: 9, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500,
                  }}>
                    <span style={{ display: 'inline-block', fontSize: 7,
                      transform: openDetailTherm ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                    Données techniques
                  </button>
                  {openDetailTherm && (
                    <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 2,
                      fontFamily: 'ui-monospace, monospace', paddingLeft: 12, marginTop: 2 }}>
                      {di_mm != null && <div>dᵢ = {di_mm} mm</div>}
                      {seg.length_override != null && <div>L = {seg.length_override.toFixed(2)} m</div>}
                      {pdcResult?.dpTotal != null && <div>ΔP = {pdcResult.dpTotal.toFixed(1)} Pa</div>}
                    </div>
                  )}
                </div>


              </div>
            )
          })() : thermalData ? (() => {
            const { Q, deltaT, T_from, T_to, T_amb } = thermalData
            const velocity = flowData?.velocity
            const flowRate = flowData?.flowRate
            const prodECS    = points?.find(p => p.type === 'productionECS')
            const T_depart = prodECS?.T_depart_override ?? globalParams?.T_depart ?? 60
            const dT_depuis_depart = T_to - T_depart

            const de_mm       = seg.de_override ?? dnDef?.de
            const di_mm       = seg.di_override ?? dnDef?.di
            const e_tartre    = selMat?.encrassement ? (seg.encrassementEpaisseur ?? selMat?.encrassementEpaisseur ?? 0) : 0
            const di_eff_therm = (di_mm != null && e_tartre > 0) ? Math.max(1, di_mm - 2 * e_tartre) : null
            const e_mm        = typeof seg.thickness === 'number' ? seg.thickness : null
            const lt    = seg.lambda_tube_override ?? selMat?.lambda
            const li    = seg.lambda_insul_override ?? selIns?.lambda

            const dtFromProd = T_depart - T_to
            const isRetour   = seg.type === 'retour'
            const isLinkedToProdECS = prodECS != null
              && (seg.startPointId === prodECS.id || seg.endPointId === prodECS.id)
            const isCollecteurRetour = roleMap?.get(seg.id) === 'collecteur-retour'
            const vMax = isCollecteurRetour ? 1.0 : 0.5

            // level: 'error' (rouge, obligatoire) | 'warning' (orange, règle de conception)
            const Alert = ({ msg, level = 'error' }) => {
              const isErr = level === 'error'
              return (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 4,
                  padding: '4px 7px',
                  background: isErr ? '#fef2f2' : '#fff7ed',
                  border: `1px solid ${isErr ? '#fecaca' : '#fed7aa'}`,
                  borderRadius: 4, fontSize: 10 }}>
                  <span style={{ color: isErr ? '#dc2626' : '#f97316', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>⚠</span>
                  <span style={{ color: isErr ? '#b91c1c' : '#c2410c', fontWeight: 600 }}>{msg}</span>
                </div>
              )
            }

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* ── Températures ── */}
                <div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[['T° amont', T_from], ['T° aval', T_to]].map(([label, val]) => {
                      const ts = tAvalStyle(val, T_depart)
                      return (
                        <div key={label} style={{ flex: 1, padding: '9px 8px', background: ts.background ?? '#fffbeb',
                          border: `1px solid ${ts.borderColor ?? '#fde68a'}`, borderRadius: 6, textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: ts.labelColor ?? '#a16207', fontWeight: 700, marginBottom: 3,
                            textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                          <div style={{ fontSize: 20, fontWeight: ts.fontWeight ?? 700, color: ts.color ?? '#111827', lineHeight: 1 }}>
                            {sf(val, 2)}
                          </div>
                          <div style={{ fontSize: 10, color: ts.color ? 'rgba(255,255,255,0.7)' : '#9ca3af', marginTop: 2 }}>°C</div>
                        </div>
                      )
                    })}
                  </div>
                  {T_to < 50 && (
                    <Alert level="error"
                      msg="Température < 50 °C — risque de développement de Légionelles" />
                  )}
                </div>

                {/* ΔT depuis départ */}
                <div>
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                    ΔT depuis départ :{' '}
                    <span style={{ fontWeight: 700, color: dtFromProd > 5 && isRetour && isLinkedToProdECS ? '#f97316' : '#374151' }}>
                      {sf(dtFromProd, 2)} K
                    </span>
                    <span style={{ color: '#9ca3af', marginLeft: 5, fontSize: 10 }}>
                      ({sf(T_depart, 0)} → {sf(T_to, 2)} °C)
                    </span>
                  </div>
                  {dtFromProd > 5 && isRetour && isLinkedToProdECS && (
                    <Alert level="warning"
                      msg={`ΔT = ${sf(dtFromProd, 1)} K > 5 K — objectif de dimensionnement non atteint`} />
                  )}
                </div>

                {/* ── Vitesse (retour ECS uniquement) ── */}
                {isRetour && (
                  <div>
                    <div style={{ padding: '8px 12px', background: '#fff',
                      border: '1px solid #e5e7eb', borderRadius: 6 }}>
                      <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '0.05em', marginBottom: 3 }}>Vitesse</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                        <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>
                          {velocity != null ? velocity.toFixed(3) : '—'}
                        </span>
                        <span style={{ fontSize: 11, color: '#9ca3af' }}>m/s</span>
                      </div>
                      {velocity != null && (() => {
                        const velLow  = velocity < 0.2
                        const velHigh = velocity > vMax
                        const velOk   = !velLow && !velHigh
                        const vMaxStr = isCollecteurRetour ? '1,0' : '0,5'
                        return (
                          <div style={{ marginTop: 4, paddingTop: 4, borderTop: '1px solid #f1f5f9',
                            fontSize: 9.5, fontWeight: 600,
                            color: velOk ? '#16a34a' : velLow ? '#dc2626' : '#f97316' }}>
                            {velLow  ? '✗ v < 0,2 m/s — risque de stagnation'
                             : velHigh ? `✗ v > ${vMaxStr} m/s — risque d'érosion et bruit`
                             : `✓ 0,2 ≤ v ≤ ${vMaxStr} m/s — conforme`}
                          </div>
                        )
                      })()}
                    </div>
                    {selMat?.id === 'copper' && velocity != null && velocity > 0.3 && velocity <= vMax && (
                      <Alert level="warning"
                        msg="Vitesse > 0,3 m/s — Pour le cuivre, une vitesse inférieure à 0,3 m/s est conseillée pour limiter les risques d'érosion" />
                    )}
                  </div>
                )}

                {/* ── Séparateur Détail ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                  <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600,
                    textTransform: 'uppercase', letterSpacing: '0.06em' }}>Détail</span>
                  <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                </div>

                {(() => {
                  const dRow = (label: string, value: string) => (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      padding: '5px 10px', borderBottom: '1px solid #f3f4f6', gap: 8 }}>
                      <span style={{ fontSize: 10, color: '#6b7280' }}>{label}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 500, color: '#374151',
                        fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
                    </div>
                  )
                  return (<>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                      {flowRate != null && dRow('Débit', `${flowRate.toFixed(3)} m³/h`)}
                      {!isRetour && velocity != null && dRow('Vitesse', `${velocity.toFixed(3)} m/s`)}
                      {uiValue  != null && dRow('UI', `${uiValue.toFixed(4)} W/(m·K)`)}
                      {dRow('Pertes th.', `${sf(Q, 1)} W`)}
                      {isBouclage && pdcResult?.dpTotal != null && (() => {
                        const u = pdcParams?.uniteAffichage ?? 'Pa'
                        return dRow('ΔP tronçon', fmtDpLabel(pdcResult.dpTotal, u))
                      })()}
                    </div>
                    <div style={{ marginTop: 4 }}>
                      <button onClick={() => setOpenDetailTherm(o => !o)} style={{
                        background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                        fontSize: 9, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500,
                      }}>
                        <span style={{ display: 'inline-block', fontSize: 7,
                          transform: openDetailTherm ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                        Données techniques
                      </button>
                      {openDetailTherm && (
                        <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 2,
                          fontFamily: 'ui-monospace, monospace', paddingLeft: 12, marginTop: 2 }}>
                          <div>T amb   = {sf(T_amb, 1)} °C</div>
                          <div>ΔT      = {sf(Math.abs(deltaT), 3)} K</div>
                          <div>he      = 10 W/(m²·K)</div>
                          {de_mm        != null && <div>de          = {de_mm} mm</div>}
                          {di_mm        != null && <div>di          = {di_mm} mm</div>}
                          {di_eff_therm != null && <div>di (tartre) = {di_eff_therm.toFixed(1)} mm</div>}
                          {e_mm         != null && <div>e           = {e_mm} mm</div>}
                          {lt    != null && <div>λ tube  = {lt} W/(m·K)</div>}
                          {li    != null && <div>λ isol  = {li} W/(m·K)</div>}
                        </div>
                      )}
                    </div>
                  </>)
                })()}

              </div>
            )
          })() : (() => {
            const velocity = flowData?.velocity
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                  {!seg.length_override
                    ? 'Saisissez une longueur manuelle pour calculer les pertes thermiques.'
                    : 'En attente des données amont (température de départ, débit, UI).'}
                </div>
                {(velocity != null || uiValue != null) && (
                  <div style={{ marginTop: 2 }}>
                    <button onClick={() => setOpenDetailTherm(o => !o)} style={{
                      background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
                      fontSize: 9, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500,
                    }}>
                      <span style={{ display: 'inline-block', fontSize: 7,
                        transform: openDetailTherm ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
                      Détail
                    </button>
                    {openDetailTherm && (
                      <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 2,
                        fontFamily: 'ui-monospace, monospace', paddingLeft: 12, marginTop: 2 }}>
                        {velocity != null && <div>Vitesse = {sf(velocity, 3)} m/s</div>}
                        {uiValue  != null && <div>UI      = {sf(uiValue, 4)} W/(m·K)</div>}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

        </div>
      )}

      {tab === 'params' && (<>
      {/* Identification */}
      <SectionLabel>Identification</SectionLabel>
      <SegNameField displayName={csDisplayName} isDefault={isDefault} value={seg.name ?? ''} onChange={v => set('name', v)} />

      <Field label="Type de tronçon" labelFlex="44%">
        <select value={seg.type} onChange={e => set('type', e.target.value)}>
          {isChauffage ? (<>
            <option value="aller">Aller CH</option>
            <option value="retour">Retour CH</option>
          </>) : isEauGlacee ? (<>
            <option value="aller">Aller EG</option>
            <option value="retour">Retour EG</option>
          </>) : (<>
            <option value="aller">Aller ECS</option>
            <option value="retour">Retour ECS</option>
          </>)}
        </select>
      </Field>

      {isAlimECS ? (
        <>
          <hr className="rp-divider" />
          <CoteSection seg={seg} points={points} levels={levels} lineYs={lineYs} onUpdate={onUpdate} />
          <hr className="rp-divider" />
        </>
      ) : (
        <hr className="rp-divider" />
      )}

      {/* Hydraulique — masqué pour les antennes bouclage ECS */}
      {isBouclage && roleMap?.get(seg.id) !== 'antenne' && (
        <>
          <SectionLabel>Hydraulique</SectionLabel>
          {(() => {
            const di_mm  = seg.di_override ?? dnDef?.di ?? null
            const area   = di_mm ? Math.PI * (di_mm / 1000) ** 2 / 4 : null
            const hasManualQ = seg.flowRate != null
            const hasManualV = seg.velocity != null
            const hasManual  = hasManualQ || hasManualV
            const resolved   = flowData
            const qPlaceholder = hasManualV && area
              ? `Calculé : ${sf(seg.velocity! * area * 3600, 3)}`
              : (!hasManual && resolved?.flowRate != null)
              ? `Calculé : ${sf(resolved.flowRate, 3)}`
              : 'm³/h'
            const vPlaceholder = hasManualQ && area
              ? `Calculé : ${sf(seg.flowRate! / (area * 3600), 3)}`
              : (!hasManual && resolved?.velocity != null)
              ? `Calculé : ${sf(resolved.velocity, 3)}`
              : 'm/s'
            return (
              <div className="lp-field">
                <label className="lp-label">
                  Débit / Vitesse
                  {resolved?.source === 'manual' && (
                    <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, color: '#2563eb',
                      background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 3, padding: '1px 4px' }}>
                      MANUEL
                    </span>
                  )}
                  {resolved?.source === 'computed' && (
                    <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700, color: '#15803d',
                      background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 3, padding: '1px 4px' }}>
                      CALCULÉ
                    </span>
                  )}
                </label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Débit (m³/h)</div>
                    <NumInput min={0} step={0.001}
                      placeholder={qPlaceholder}
                      value={seg.flowRate ?? null} allowEmpty
                      onChange={v => { set('flowRate', v); if (v != null) set('velocity', null) }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Vitesse (m/s)</div>
                    <NumInput min={0} step={0.001}
                      placeholder={vPlaceholder}
                      value={seg.velocity ?? null} allowEmpty
                      onChange={v => { set('velocity', v); if (v != null) set('flowRate', null) }} />
                  </div>
                </div>
              </div>
            )
          })()}
          <hr className="rp-divider" />
        </>
      )}

      {/* Canalisation */}
      <SectionLabel>Canalisation</SectionLabel>
      <Field label="Longueur" unit="m">
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0 }}>
          <NumInput min={0}
            value={seg.length_override ?? null}
            placeholder="saisie manuelle"
            allowEmpty
            style={{ flex: 1, minWidth: 0 }}
            onChange={v => { set('length_override', v); setExprStr(v != null ? `= ${v}` : '') }} />
          <button
            onClick={() => setCalcOpen(o => !o)}
            title="Calculette"
            style={{
              background: calcOpen ? '#eff6ff' : 'transparent',
              border: `1px solid ${calcOpen ? '#93c5fd' : '#d1d5db'}`,
              borderRadius: 5, cursor: 'pointer', padding: '3px 7px',
              fontSize: 15, lineHeight: 1, flexShrink: 0,
              color: calcOpen ? '#2563eb' : '#9ca3af',
            }}
          ><svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1a1a1a" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}><rect x="1" y="1" width="12" height="12" rx="1.5"/><rect x="2.5" y="2.5" width="9" height="2.5" rx="0.5"/><circle cx="4" cy="7.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="7" cy="7.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="10" cy="7.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="4" cy="10.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="7" cy="10.5" r="0.9" fill="#f97316" stroke="none"/><circle cx="10" cy="10.5" r="0.9" fill="#f97316" stroke="none"/></svg></button>
        </div>
      </Field>
      {calcOpen && (
        <div style={{ margin: '2px 0 8px', padding: '8px 10px 10px', background: '#f0f7ff', border: '1px solid #bfdbfe', borderRadius: 8 }}>
          <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 500, marginBottom: 6 }}>Calcul de longueur</div>
          <input
            type="text"
            value={exprStr}
            placeholder="Saisir un calcul"
            autoFocus
            onChange={e => { const v = e.target.value; setExprStr(v); evalExpr(v) }}
            onKeyDown={e => { if (e.key === 'Escape') setCalcOpen(false) }}
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        </div>
      )}

      <Field label="Matériau">
        {enabledMats.length === 0
          ? <p className="lp-hint">Aucun matériau activé dans les paramètres.</p>
          : (
            <select value={seg.materialId || ''}
              onChange={e => { set('materialId', e.target.value || null); set('dn', null) }}>
              <option value="">— Choisir —</option>
              {enabledMats.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          )
        }
      </Field>

      {selMat && (
        <>
          <Field label="DN">
            <select value={seg.dn || ''}
              onChange={e => { set('dn', e.target.value || null); set('di_override', null); set('de_override', null) }}>
              <option value="">— Choisir —</option>
              {selMat.dns.map(d => <option key={d.dn} value={d.dn}>{d.dn}</option>)}
            </select>
          </Field>
          {seg.dn && dnDef && selMat.minDi != null && dnDef.di < selMat.minDi && (
            <div style={{
              margin: '2px 0 6px', padding: '7px 10px', background: '#fef2f2',
              border: '1px solid #fecaca', borderRadius: 6,
              display: 'flex', gap: 7, alignItems: 'flex-start',
            }}>
              <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0, fontSize: 13, lineHeight: 1.3 }}>⚠</span>
              <div style={{ color: '#b91c1c', fontWeight: 600, fontSize: 10.5, lineHeight: 1.5 }}>
                {`di = ${dnDef.di} mm — diamètre intérieur inférieur au minimum prescrit par le NF DTU 60.11 (min. ${selMat.minDi} mm)`}
              </div>
            </div>
          )}

          {dnDef && (
            <>
              <Field label="Di" unit="mm">
                <NumInput
                  value={seg.di_override ?? null}
                  placeholder={`${dnDef.di} (par défaut)`}
                  allowEmpty
                  onChange={v => set('di_override', v)} />
              </Field>
              <Field label="De" unit="mm">
                <NumInput
                  value={seg.de_override ?? null}
                  placeholder={`${dnDef.de} (par défaut)`}
                  allowEmpty
                  onChange={v => set('de_override', v)} />
              </Field>
            </>
          )}

          {selMat?.encrassement && (selMat?.encrassementEpaisseur ?? 0) > 0 && (
            <Field label="Ép. tartre" unit="mm">
              <NumInput
                min={0} step={0.1}
                value={seg.encrassementEpaisseur ?? null}
                placeholder={`${selMat.encrassementEpaisseur} (par défaut)`}
                allowEmpty
                onChange={v => set('encrassementEpaisseur', v)} />
            </Field>
          )}

          <Field label="λ tube" unit="W/m·K">
            <NumInput step={0.001}
              value={seg.lambda_tube_override ?? null}
              placeholder={`${selMat.lambda} (par défaut)`}
              allowEmpty
              onChange={v => set('lambda_tube_override', v)} />
          </Field>
        </>
      )}

      <hr className="rp-divider" />

      {!isChauffage && (<>
        {/* Isolation */}
        <SectionLabel>Isolation</SectionLabel>
        <Field label="Isolant">
          {enabledIns.length === 0
            ? <p className="lp-hint">Aucun isolant activé dans les paramètres.</p>
            : (
              <select value={seg.insulationId || ''}
                onChange={e => { set('insulationId', e.target.value || null); set('thickness', null) }}>
                <option value="">— Sans isolant —</option>
                {enabledIns.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            )
          }
        </Field>

        {selIns && (
          <>
            <Field label="Épaisseur" unit="mm">
              {selIns.thicknesses.length > 0 ? (
                <select value={seg.thickness ?? ''}
                  onChange={e => set('thickness', e.target.value === '' ? null : +e.target.value)}>
                  <option value="">— Choisir —</option>
                  {selIns.thicknesses.map(t => <option key={t} value={t}>{t} mm</option>)}
                  <option value="__custom">Autre (saisie manuelle)</option>
                </select>
              ) : (
                <NumInput placeholder="Saisir manuellement"
                  value={seg.thickness ?? null}
                  allowEmpty
                  onChange={v => set('thickness', v)} />
              )}
            </Field>

            {seg.thickness === '__custom' && (
              <Field label="Épaisseur personnalisée" unit="mm">
                <NumInput allowEmpty onChange={v => { if (v != null) set('thickness', v) }} value={null} />
              </Field>
            )}

            <Field label="λ isolant" unit="W/m·K">
              <NumInput step={0.001}
                value={seg.lambda_insul_override ?? null}
                placeholder={`${selIns.lambda} (par défaut)`}
                allowEmpty
                onChange={v => set('lambda_insul_override', v)} />
            </Field>
          </>
        )}

        <hr className="rp-divider" />
      </>)}

      {/* Thermique */}
      {!isChauffage && (<>
      <SectionLabel>Thermique</SectionLabel>
      {(() => {
        const tAmbDefault = getSegAmbTemp(
          { ...seg, t_amb_override: null }, levels, lineYs
        )
        const egEntry = isEauGlacee ? eauGlaceeThermal?.segResults?.get(seg.id) : null
        const T_eg_calc = egEntry?.T_from ?? null
        return (
          <>
            <Field label="T° ambiante" unit="°C">
              <NumInput
                step={0.5}
                value={seg.t_amb_override ?? null}
                placeholder={tAmbDefault != null ? `${tAmbDefault} (par défaut)` : 'par défaut'}
                allowEmpty
                onChange={v => set('t_amb_override', v)}
              />
            </Field>
            {isEauGlacee && (
              <Field label="T° tronçon" unit="°C">
                <NumInput
                  min={-20} max={30} step={0.5} allowEmpty
                  value={seg.T_eg_override ?? null}
                  placeholder={T_eg_calc != null ? `calculé : ${T_eg_calc.toFixed(1)} °C` : 'calculé : —'}
                  onChange={v => set('T_eg_override', v)}
                />
              </Field>
            )}
            {isEauGlacee && (
              <Field label="HR tronçon" unit="%">
                <NumInput
                  min={0} max={100} step={1} allowEmpty
                  value={seg.hr_override ?? null}
                  placeholder={(() => { const v = getSegHR({ ...seg, hr_override: null }, levels, lineYs, hrGlobalDefault); return v != null ? `${v} (par défaut)` : '— non définie' })()}
                  onChange={v => set('hr_override', v)}
                />
              </Field>
            )}
          </>
        )
      })()}
      </>)}

      {isChauffage && (() => {
        const chauffEntry = chauffageThermal?.segResults?.get(seg.id)
        const T_calc = chauffEntry?.T_from ?? null
        return (
          <>
            <SectionLabel>Température</SectionLabel>
            <Field label="Tronçon" unit="°C">
              <NumInput
                className="temp-ch-input"
                min={0} max={150} step={0.5} allowEmpty
                value={seg.T_ch_override ?? null}
                placeholder={T_calc != null ? `calculé : ${T_calc.toFixed(1)} °C` : 'calculé : —'}
                onChange={v => set('T_ch_override', v)}
              />
            </Field>
          </>
        )
      })()}


      {pdcParams && (pdcParams.methodeSing === 'accessoires' || pdcParams.equipementsActifs) && (
        <>
          <hr className="rp-divider" />
          <SectionLabel>Accessoires &amp; équipements</SectionLabel>
          {pdcParams.methodeSing === 'accessoires' && (
            <SegFittingsPanel seg={seg} set={set} pdcParams={pdcParams} mode={activeCalcId} />
          )}
          {pdcParams.equipementsActifs && (
            <SegEquipPanel seg={seg} set={set} pdcParams={pdcParams} mode={activeCalcId as string | null} />
          )}
        </>
      )}

      <AntenneGroupesAval
        seg={seg} allSegs={allSegs} points={points ?? []}
        flowDirections={flowDirections} materials={materials}
        roleMap={roleMap} groupDisplayNames={groupDisplayNames}
      />

      </>)}

    </div>
  )
}
