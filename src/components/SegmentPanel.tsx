import { useState, useRef, useEffect } from 'react'
import type { CalcMode } from '../types'
import { getDisplayName } from '../utils/naming'
import { getModeFlags } from '../utils/calcModeFlags'
import { computeSegUI, getSegAmbTemp } from '../utils/thermalCalc'
import { sf } from '../utils/fmt'
import { FITTING_TYPES, EQUIPMENT_TYPES } from '../utils/pdcCalc'
import { NumInput } from './NumInput'
import { tAvalStyle, Field, SectionLabel, SegNameField, CoteSection, TempBadge, AntenneGroupesAval } from './rpShared'
import PdcSegResults from './PdcSegResults'
import { ABAQUE } from '../utils/alimentationCalc'

// ── Panneau compact accessoires (ξ) ──────────────────────────────────────
function SegFittingsPanel({ seg, set, pdcParams }) {
  const [addOpen, setAddOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!addOpen) return
    const h = (e: MouseEvent) => { if (!dropRef.current?.contains(e.target as Node)) setAddOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [addOpen])

  const fittings: any[]  = seg.fittings ?? []
  const libOverrides     = pdcParams?.fittingOverrides ?? {}

  const setCount = (typeId: string, n: number) => {
    if (n <= 0) set('fittings', fittings.filter(f => f.type !== typeId))
    else set('fittings', fittings.map(f => f.type === typeId ? { ...f, count: n } : f))
  }
  const setXi = (typeId: string, val: number | null) => {
    set('fittings', fittings.map(f => f.type === typeId ? { ...f, xiOverride: val ?? undefined } : f))
  }
  const del = (typeId: string) => set('fittings', fittings.filter(f => f.type !== typeId))
  const add = (typeId: string) => {
    setAddOpen(false)
    if (!fittings.find(f => f.type === typeId)) {
      set('fittings', [...fittings, { type: typeId, count: 1 }])
    }
  }

  const customLibF: any[] = pdcParams?.customFittings ?? []
  const allStdF = [
    ...FITTING_TYPES,
    ...customLibF.map(t => ({ id: t.id, label: t.label || 'Personnalisé', xi: t.xi })),
  ]
  const available = allStdF.filter(t => !fittings.find(f => f.type === t.id))

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4,
    padding: '5px 8px', background: '#fef7f4', border: '1px solid #fbd5c5', borderRadius: 5,
  }
  const inp = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid #e5e7eb',
    textAlign: 'center' as const, ...extra,
  })

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#c2562d', marginBottom: 5, letterSpacing: '0.03em' }}>
        Accessoires
      </div>

      {fittings.length === 0 && (
        <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginBottom: 6 }}>
          Aucun accessoire sur ce tronçon
        </div>
      )}

      {fittings.map(f => {
        const def       = allStdF.find(t => t.id === f.type)
        const libXi     = def ? (libOverrides[f.type] ?? def.xi) : null
        const xi        = f.xiOverride ?? libXi
        const overridden = f.xiOverride != null
        return (
          <div key={f.type} style={row}>
            <span style={{ flex: 1, fontSize: 10, color: '#374151', lineHeight: 1.3 }}>
              {def?.label ?? f.type}
            </span>
            <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>n</span>
            <NumInput min={1} step={1} value={f.count ?? 1}
              onChange={v => setCount(f.type, Math.max(1, Math.round(v ?? 1)))}
              style={{ ...inp(), width: 32 }} />
            <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>ξ</span>
            <NumInput min={0} step={0.01} value={xi ?? null} allowEmpty
              placeholder={libXi != null ? `${libXi} (par défaut)` : ''}
              onChange={v => setXi(f.type, v)}
              style={{ ...inp({ width: 44, color: overridden ? '#c2562d' : '#374151',
                                border: `1px solid ${overridden ? '#fbd5c5' : '#e5e7eb'}` }) }} />
            {overridden && (
              <button onClick={() => setXi(f.type, null)} title={`Rétablir (ξ = ${libXi})`}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>
                ↺
              </button>
            )}
            <button onClick={() => del(f.type)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>
              ×
            </button>
          </div>
        )
      })}

      <div ref={dropRef} style={{ position: 'relative' }}>
        <button onClick={() => setAddOpen(a => !a)}
          style={{ fontSize: 10, padding: '3px 10px', border: '1px dashed #c2562d', borderRadius: 5,
                   color: '#c2562d', background: addOpen ? '#fff7ed' : 'transparent', cursor: 'pointer', fontWeight: 600 }}>
          + Ajouter
        </button>
        {addOpen && (
          <div style={{ position: 'absolute', left: 0, top: '110%', zIndex: 300, background: '#fff',
                        border: '1px solid #e5e7eb', borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 250, padding: 6 }}>
            {available.length === 0 ? (
              <div style={{ padding: '6px 10px', fontSize: 10, color: '#9ca3af' }}>
                Tous les accessoires sont déjà ajoutés
              </div>
            ) : available.map(t => {
              const libXi = libOverrides[t.id] ?? t.xi
              const long = t.label.length > 32
              return (
                <div key={t.id} onClick={() => add(t.id)}
                  style={{ padding: '5px 10px', fontSize: 10.5, cursor: 'pointer', borderRadius: 5,
                           display: 'flex', flexDirection: long ? 'column' : 'row',
                           alignItems: long ? 'flex-start' : 'baseline', gap: long ? 1 : 6 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fef0ea')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{t.label}</span>
                  <span style={{ fontSize: 9.5, color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>ξ = {libXi}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Panneau compact équipements (Kv) ─────────────────────────────────────
function SegEquipPanel({ seg, set, pdcParams }) {
  const [addOpen, setAddOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!addOpen) return
    const h = (e: MouseEvent) => { if (!dropRef.current?.contains(e.target as Node)) setAddOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [addOpen])

  const equipment: any[]  = seg.equipment ?? []
  const libOverrides       = pdcParams?.equipmentOverrides ?? {}

  const setKv = (typeId: string, val: number | null) => {
    set('equipment', equipment.map(e => e.type === typeId ? { ...e, kvOverride: val ?? undefined } : e))
  }
  const del = (typeId: string) => set('equipment', equipment.filter(e => e.type !== typeId))
  const add = (typeId: string) => {
    setAddOpen(false)
    if (!equipment.find(e => e.type === typeId)) {
      set('equipment', [...equipment, { type: typeId }])
    }
  }

  const customLibE: any[] = pdcParams?.customEquipments ?? []
  const allStdE = [
    ...EQUIPMENT_TYPES,
    ...customLibE.map(t => ({ id: t.id, label: t.label || 'Personnalisé', kvDefault: t.kvDefault })),
  ]
  const available = allStdE.filter(t => !equipment.find(e => e.type === t.id))

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4,
    padding: '5px 8px', background: '#faf8ff', border: '1px solid #ddd6fe', borderRadius: 5,
  }
  const inp = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid #e5e7eb',
    textAlign: 'center' as const, ...extra,
  })

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed', marginBottom: 5, letterSpacing: '0.03em' }}>
        Équipements
      </div>

      {equipment.length === 0 && (
        <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginBottom: 6 }}>
          Aucun équipement sur ce tronçon
        </div>
      )}

      {equipment.map(e => {
        const def       = allStdE.find(t => t.id === e.type)
        const libKv     = def ? (libOverrides[e.type] ?? def.kvDefault) : null
        const kv        = e.kvOverride ?? libKv
        const overridden = e.kvOverride != null
        const needsKv   = kv == null
        return (
          <div key={e.type} style={row}>
            <span style={{ flex: 1, fontSize: 10, color: '#374151', lineHeight: 1.3 }}>
              {def?.label ?? e.type}
            </span>
            <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>Kv</span>
            <NumInput min={0} step={0.1} value={kv ?? null} allowEmpty
              placeholder={libKv != null ? `${libKv} (par défaut)` : 'requis'}
              onChange={val => setKv(e.type, val)}
              style={{ ...inp({ width: 50,
                                color: needsKv ? '#f97316' : overridden ? '#7c3aed' : '#374151',
                                border: `1px solid ${needsKv ? '#fed7aa' : overridden ? '#ddd6fe' : '#e5e7eb'}` }) }} />
            <span style={{ fontSize: 8, color: '#9ca3af', flexShrink: 0, lineHeight: 1 }}>m³/h<br/>√bar</span>
            {overridden && libKv != null && (
              <button onClick={() => setKv(e.type, null)} title={`Rétablir (Kv = ${libKv})`}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                ↺
              </button>
            )}
            <button onClick={() => del(e.type)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>
              ×
            </button>
          </div>
        )
      })}

      <div ref={dropRef} style={{ position: 'relative' }}>
        <button onClick={() => setAddOpen(a => !a)}
          style={{ fontSize: 10, padding: '3px 10px', border: '1px dashed #7c3aed', borderRadius: 5,
                   color: '#7c3aed', background: addOpen ? '#faf8ff' : 'transparent', cursor: 'pointer', fontWeight: 600 }}>
          + Ajouter
        </button>
        {addOpen && (
          <div style={{ position: 'absolute', left: 0, top: '110%', zIndex: 300, background: '#fff',
                        border: '1px solid #e5e7eb', borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 250, padding: 6 }}>
            {available.length === 0 ? (
              <div style={{ padding: '6px 10px', fontSize: 10, color: '#9ca3af' }}>
                Tous les équipements sont déjà ajoutés
              </div>
            ) : available.map(t => {
              const libKv = libOverrides[t.id] ?? t.kvDefault
              const long = t.label.length > 32
              return (
                <div key={t.id} onClick={() => add(t.id)}
                  style={{ padding: '5px 10px', fontSize: 10.5, cursor: 'pointer', borderRadius: 5,
                           display: 'flex', flexDirection: long ? 'column' : 'row',
                           alignItems: long ? 'flex-start' : 'baseline', gap: long ? 1 : 6 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#faf8ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{t.label}</span>
                  <span style={{ fontSize: 9.5, color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    Kv = {libKv ?? '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
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
}

export default function SegmentPanel({ seg, onUpdate, materials, insulations, allSegs, levels, lineYs, columns, columnXs, chaufferie, points, flowData, globalParams, thermalData, roleMap, drawMode, onExitEditParams, activeCalcId, alimentationData, alimentationParams = null, pdcParams, pdcResult, resultsView, onResultsViewChange, pdcCumResults, pdcCumAlimResults, segToCol, flowDirections, groupDisplayNames = null }: SegmentPanelProps) {
  const [tab, setTab]                       = useState('params')
  const [openDetailTherm, setOpenDetailTherm] = useState(false)
  const set = (key, val) => onUpdate(seg.id, 'segment', { [key]: val })

  const enabledMats = materials.filter(m => m.enabled)
  const enabledIns  = insulations.filter(i => i.enabled)
  const selMat      = materials.find(m => m.id === seg.materialId)
  const selIns      = insulations.find(i => i.id === seg.insulationId)
  const dnDef       = selMat?.dns.find(d => d.dn === seg.dn)

  const isDefault   = !seg.name
  const displayName = getDisplayName(seg, allSegs, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(seg.id), activeCalcId, roleMap, flowDirections)

  const uiValue = computeSegUI(seg, materials, insulations, 10)

  const { isBouclage, isAlimECS, isAlimEF, isAlimMode, isChauffage } = getModeFlags(activeCalcId as CalcMode | null)

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
        <h3 className="rp-title">Tronçon</h3>

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
          <SegNameField displayName={displayName} isDefault={isDefault} value={seg.name ?? ''} onChange={v => set('name', v)} />
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
            <NumInput min={0}
              value={seg.length_override ?? null}
              placeholder="saisie manuelle"
              allowEmpty
              onChange={v => set('length_override', v)} />
          </Field>

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
              {seg.dn && dnDef && selMat.minDi != null && dnDef.di < selMat.minDi && (
                <Alert level="error"
                  msg={`di = ${dnDef.di} mm — diamètre intérieur inférieur au minimum prescrit par le NF DTU 60.11 (min. ${selMat.minDi} mm)`} />
              )}
            </Field>
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
              <SectionLabel>Accessoires &amp; équipements</SectionLabel>
              {pdcParams.methodeSing === 'accessoires' && (
                <SegFittingsPanel seg={seg} set={set} pdcParams={pdcParams} />
              )}
              {pdcParams.equipementsActifs && (
                <SegEquipPanel seg={seg} set={set} pdcParams={pdcParams} />
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
                    padding: '2px 10px 7px', fontSize: 10.5,
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

  return (
    <div className="rp-section">
      <h3 className="rp-title">Tronçon</h3>

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
          {pdcParams != null && (
            <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 12 }}>
              {(['dimensionnement', 'pdc'] as const).map(key => (
                <button key={key} onClick={() => onResultsViewChange(key)} style={{
                  padding: '2px 10px 7px', fontSize: 10.5,
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
                    : pdcCumResults?.segCumDp.get(seg.id)}
                  postJunction={isAlimMode ? false : (pdcCumResults?.segPostJunction.get(seg.id) ?? false)}
                  segCol={segToCol?.get(seg.id) ?? null}
                  isOnCriticalPath={isAlimMode
                    ? (pdcCumAlimResults?.criticalSegIds?.has(seg.id) ?? false)
                    : (pdcCumResults?.criticalSegIds?.has(seg.id) ?? false)}
                  criticalCol={isAlimMode ? null : (segToCol?.get(pdcCumResults?.criticalLeafSegId ?? '') ?? null)}
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
          ) : thermalData ? (() => {
            const { Q, deltaT, T_from, T_to, T_amb } = thermalData
            const velocity = flowData?.velocity
            const flowRate = flowData?.flowRate
            const T_depart = globalParams?.T_depart ?? 60
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
            const prodECS    = points?.find(p => p.type === 'productionECS')
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
                        const fmt = (pa: number) => u === 'mmCE' ? `${(pa / 9.81).toFixed(0)} mmCE`
                          : u === 'both' ? `${Math.round(pa)} Pa / ${(pa / 9.81).toFixed(0)} mmCE`
                          : `${Math.round(pa)} Pa`
                        return dRow('ΔP tronçon', fmt(pdcResult.dpTotal))
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
      <SegNameField displayName={displayName} isDefault={isDefault} value={seg.name ?? ''} onChange={v => set('name', v)} />

      <Field label="Type de tronçon" labelFlex="44%">
        <select value={seg.type} onChange={e => set('type', e.target.value)}>
          <option value="aller">Aller ECS</option>
          <option value="retour">Retour ECS</option>
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
        <NumInput min={0}
          value={seg.length_override ?? null}
          placeholder="saisie manuelle"
          allowEmpty
          onChange={v => set('length_override', v)} />
      </Field>

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
            {seg.dn && dnDef && selMat.minDi != null && dnDef.di < selMat.minDi && (
              <div style={{ marginTop: 4, padding: '4px 7px', background: '#fef2f2',
                border: '1px solid #fecaca', borderRadius: 4, fontSize: 10,
                display: 'flex', gap: 5, alignItems: 'flex-start' }}>
                <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>⚠</span>
                <span style={{ color: '#b91c1c', fontWeight: 600 }}>
                  {`di = ${dnDef.di} mm — diamètre intérieur inférieur au minimum prescrit par le NF DTU 60.11 (min. ${selMat.minDi} mm)`}
                </span>
              </div>
            )}
          </Field>

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
        return (
          <Field label="T° ambiante" unit="°C">
            <NumInput
              step={0.5}
              value={seg.t_amb_override ?? null}
              placeholder={tAmbDefault != null ? `${tAmbDefault} (par défaut)` : 'par défaut'}
              allowEmpty
              onChange={v => set('t_amb_override', v)}
            />
          </Field>
        )
      })()}
      </>)}

      {pdcParams && (pdcParams.methodeSing === 'accessoires' || pdcParams.equipementsActifs) && (
        <>
          <hr className="rp-divider" />
          <SectionLabel>Accessoires &amp; équipements</SectionLabel>
          {pdcParams.methodeSing === 'accessoires' && (
            <SegFittingsPanel seg={seg} set={set} pdcParams={pdcParams} />
          )}
          {pdcParams.equipementsActifs && (
            <SegEquipPanel seg={seg} set={set} pdcParams={pdcParams} />
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
