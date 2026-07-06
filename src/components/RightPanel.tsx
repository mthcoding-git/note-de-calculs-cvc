import { useState, useRef, useEffect } from 'react'
import type { CalcMode } from '../types'
import { getDisplayName } from '../utils/naming'
import { getModeFlags } from '../utils/calcModeFlags'
import { sf } from '../utils/fmt'
import { FITTING_TYPES, EQUIPMENT_TYPES, type TronconAmontEF, type TronconAmontResult } from '../utils/pdcCalc'
import { NumInput } from './NumInput'
import { Field, SectionLabel, SegNameField } from './rpShared'
import SegmentPanel from './SegmentPanel'
import PointPanel from './PointPanel'
import PdcSegResults from './PdcSegResults'

function TronconAmontPanel({ tr, index, result, materials, totalQpAlimM3h, pdcParams, onUpdate, onRemove }: {
  tr: TronconAmontEF, index: number, result: TronconAmontResult | null
  materials: any[], totalQpAlimM3h: number, pdcParams: any
  onUpdate: (tr: TronconAmontEF) => void, onRemove: () => void
}) {
  const [tab, setTab] = useState<'params' | 'results'>('params')
  const set = (k: string, v: any) => onUpdate({ ...tr, [k]: v })

  const enabledMats = materials.filter((m: any) => m.enabled)
  const selMat      = materials.find((m: any) => m.id === tr.materialId)
  const dnDef       = selMat?.dns.find((d: any) => d.dn === tr.dn)
  const res         = result

  return (
    <div className="rp-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 className="rp-title" style={{ margin: 0 }}>Tronçon</h3>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#2563eb',
          background: '#dbeafe', padding: '2px 6px', borderRadius: 3 }}>EF</span>
      </div>

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {([['params', 'Paramètres'], ['results', 'Résultats']] as [string, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key as any)} style={{
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
          {res ? (
            <PdcSegResults
              pdcResult={{
                dpReg:         res.dpFric,
                dpSing:        res.dpSing,
                dpEquip:       res.dpEquip,
                dpTotal:       res.dpFric + res.dpSing + res.dpEquip,
                dpPompe:       pdcParams?.coefPompeActif
                  ? (res.dpFric + res.dpSing + res.dpEquip) * (1 + (pdcParams.coefPompe ?? 10) / 100)
                  : undefined,
                V:             res.V,
                J:             res.J,
                rho:           res.rho,
                mu:            res.mu,
                nu:            res.nu,
                Re:            res.Re,
                regime:        res.regime,
                lambda:        res.lambda,
                T_used:        res.T_used,
                epsilon_used:  res.epsilon_used,
                dynPressure:   res.dynPressure,
                A:             null,
              }}
              pdcParams={pdcParams}
              seg={{ type: 'aller', length_override: tr.length, fittings: tr.fittings ?? [], equipment: tr.equipment ?? [] }}
              dnDef={dnDef}
              flowData={{ flowRate: totalQpAlimM3h, velocity: res.V }}
              alimentationData={null}
              cumDp={null}
              postJunction={false}
              segCol={null}
              isOnCriticalPath={false}
              criticalCol={null}
              isAlimEcs={true}
              deltaH={(tr.coteAval ?? 0) - (tr.coteAmont ?? 0)}
              dpStatic={res.dpStatic}
              pressionAval={res.presOut}
              pStatAval={res.presIn - res.dpStatic}
              isTerminalGroupePuisage={false}
              buildingType="habitation"
            />
          ) : (
            <p className="lp-hint">Renseignez la longueur et le diamètre pour calculer les pertes de charge.</p>
          )}
        </div>
      )}


      {tab === 'params' && (
        <>
          <SectionLabel>Identification</SectionLabel>
          <div style={{ padding: '5px 8px', background: '#f8fafc',
            border: '1px solid #e5e7eb', borderRadius: 4, fontSize: 12, color: '#374151', marginBottom: 8 }}>
            Tronçon arrivée EF n°{index + 1}
          </div>
          <div style={{ fontSize: 9.5, color: '#9ca3af', marginBottom: 6, lineHeight: 1.5 }}>
            Tronçon amont permettant de calculer la pression disponible à l'arrivée EF depuis le réseau de distribution.
          </div>

          <hr className="rp-divider" />
          <SectionLabel>Cote</SectionLabel>
          <Field label="Cote amont" unit="m">
            <NumInput step={0.01}
              value={tr.coteAmont ?? null}
              placeholder="0.00 (par défaut)"
              allowEmpty
              onChange={v => set('coteAmont', v)} />
          </Field>
          <Field label="Cote aval" unit="m">
            <NumInput step={0.01}
              value={tr.coteAval ?? null}
              placeholder="0.00 (par défaut)"
              allowEmpty
              onChange={v => set('coteAval', v)} />
          </Field>

          <hr className="rp-divider" />
          <SectionLabel>Canalisation</SectionLabel>
          <Field label="Longueur" unit="m">
            <NumInput min={0}
              value={tr.length ?? null}
              placeholder="saisie manuelle"
              allowEmpty
              onChange={v => set('length', v)} />
          </Field>
          <Field label="Matériau">
            {enabledMats.length === 0
              ? <p className="lp-hint">Aucun matériau activé dans les paramètres.</p>
              : (
                <select value={tr.materialId || ''}
                  onChange={e => onUpdate({ ...tr, materialId: e.target.value || null, dn: null, di_override: null })}>
                  <option value="">— Choisir —</option>
                  {enabledMats.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              )
            }
          </Field>
          {selMat && (
            <>
              <Field label="DN">
                <select value={tr.dn || ''}
                  onChange={e => onUpdate({ ...tr, dn: e.target.value || null, di_override: null })}>
                  <option value="">— Choisir —</option>
                  {selMat.dns.map((d: any) => <option key={d.dn} value={d.dn}>{d.dn}</option>)}
                </select>
              </Field>
              {dnDef && (
                <Field label="Di" unit="mm">
                  <NumInput
                    value={tr.di_override ?? null}
                    placeholder={`${dnDef.di} (par défaut)`}
                    allowEmpty
                    onChange={v => set('di_override', v)} />
                </Field>
              )}
            </>
          )}

          {pdcParams && (pdcParams.methodeSing === 'accessoires' || pdcParams.equipementsActifs) && (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Accessoires &amp; équipements</SectionLabel>
              {pdcParams.methodeSing === 'accessoires' && (
                <SegFittingsPanel seg={tr} set={(k, v) => set(k, v)} pdcParams={pdcParams} />
              )}
              {pdcParams.equipementsActifs && (
                <SegEquipPanel seg={tr} set={(k, v) => set(k, v)} pdcParams={pdcParams} />
              )}
            </>
          )}

          <hr className="rp-divider" />
          <button onClick={onRemove}
            style={{ width: '100%', marginTop: 4, padding: '6px 0', fontSize: 11, fontWeight: 600,
              background: '#fef2f2', color: '#dc2626',
              border: '1px solid #fecaca', borderRadius: 5, cursor: 'pointer' }}>
            Supprimer ce tronçon
          </button>
        </>
      )}
    </div>
  )
}

// ── Panneau compact accessoires (ξ) — utilisé par TronconAmontPanel ──────
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

  const rowStyle: React.CSSProperties = {
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
          <div key={f.type} style={rowStyle}>
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

// ── Panneau compact équipements (Kv) — utilisé par TronconAmontPanel ─────
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

  const rowStyle: React.CSSProperties = {
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
          <div key={e.type} style={rowStyle}>
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

function ValvePanel({ valve, onUpdate, valveKvResult, activeCalcId, segToCol }) {
  const { hasKv: showKv } = getModeFlags(activeCalcId)
  const r          = valveKvResult  // ValveKvResult | undefined
  const colName    = segToCol?.get(valve.segmentId) ?? null

  const fmtBar = (pa: number) => `${(pa / 100000).toFixed(4)} bar`

  const Row = ({ label, value }: { label: string; value: string }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '3px 0', borderBottom: '1px solid #f3f4f6', fontSize: 11 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 500, color: '#111827', fontFamily: 'ui-monospace, monospace' }}>{value}</span>
    </div>
  )

  return (
    <div className="rp-section">
      <h3 className="rp-title">Vanne d'équilibrage</h3>
      {(() => {
        const isDefaultValveName = !valve.name || valve.name.startsWith("Vanne d'équilibrage")
        return (
          <SegNameField
            displayName={valve.name ?? "Vanne d'équilibrage"}
            isDefault={isDefaultValveName}
            value={isDefaultValveName ? '' : (valve.name ?? '')}
            onChange={v => onUpdate(valve.id, { name: v || null })}
          />
        )
      })()}

      {showKv && (
        <>
          <hr className="rp-divider" />
          {colName && (
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 8 }}>
              Colonne : <strong style={{ color: '#374151' }}>{colName}</strong>
            </div>
          )}

          {r == null ? (
            <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
              Lancez le calcul PDC pour obtenir le Kv.
            </div>
          ) : r.isCritical ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
                background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, marginBottom: 10 }}>
                <span style={{ fontSize: 13 }}>★</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                  Circuit défavorisé — grand ouvert
                </span>
              </div>
              <Row label="Débit" value={r.Q != null ? `${sf(r.Q, 3)} m³/h` : '—'} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '3px 0', borderBottom: '1px solid #f3f4f6', fontSize: 11 }}>
                <span style={{ color: '#6b7280' }}>ΔP depuis Production ECS</span>
                <span style={{ fontWeight: 500, color: '#111827', fontFamily: 'ui-monospace, monospace' }}>
                  {fmtBar(r.branchDp)}
                </span>
              </div>
            </>
          ) : (
            <>
              <div style={{ padding: '10px 12px', background: '#eff6ff',
                border: '1px solid #bfdbfe', borderRadius: 6, marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', marginBottom: 3 }}>Kv recommandé</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: '#1e40af',
                    fontFamily: 'ui-monospace, monospace' }}>
                    {r.kv != null ? r.kv.toFixed(2) : '—'}
                  </span>
                  <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600 }}>m³/h</span>
                </div>
              </div>
              <Row label="Débit" value={r.Q != null ? `${sf(r.Q, 3)} m³/h` : '—'} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '3px 0', borderBottom: '1px solid #f3f4f6', fontSize: 11 }}>
                <span style={{ color: '#6b7280' }}>ΔP max à la jonction</span>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontWeight: 500, color: '#111827', fontFamily: 'ui-monospace, monospace' }}>{fmtBar(r.referenceDp)}</span>
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>depuis Production ECS</div>
                </div>
              </div>
              {r.nValves > 1 && (
                <div style={{ marginTop: 6, fontSize: 9, color: '#9ca3af', fontStyle: 'italic' }}>
                  {r.nValves} vannes en série sur cette branche — ΔP réparti équitablement
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function ChaufferiePanel({ chaufferie, onChange, levels }) {
  const set = (key, val) => onChange({ ...chaufferie, [key]: val })
  const width  = Math.round(chaufferie.x2 - chaufferie.x1)
  const height = Math.round(chaufferie.height)

  return (
    <div className="rp-section">
      <h3 className="rp-title">Local ECS</h3>

      <label className="lp-checkbox-label" style={{ marginBottom: 8 }}>
        <input type="checkbox"
          checked={!!chaufferie.enabled}
          onChange={e => set('enabled', e.target.checked)} />
        <span style={{ fontSize: 11, color: '#374151' }}>Afficher le local ECS</span>
      </label>

      <Field label="Niveau">
        <select
          value={chaufferie.levelId ?? ''}
          onChange={e => set('levelId', e.target.value)}>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>

      <Field label="Largeur" unit="px">
        <NumInput min={20} step={10}
          value={width}
          onChange={v => {
            const w = Math.max(20, v ?? 20)
            set('x2', chaufferie.x1 + w)
          }} />
      </Field>

      <Field label="Hauteur" unit="px">
        <NumInput min={20} step={10}
          value={height}
          onChange={v => set('height', Math.max(20, v ?? 20))} />
      </Field>

      <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        <button
          onClick={() => onChange({ ...chaufferie, placed: false, enabled: false })}
          style={{
            width: '100%', padding: '6px 0', fontSize: 12, fontWeight: 600,
            background: '#fef2f2', color: '#dc2626',
            border: '1px solid #fecaca', borderRadius: 5, cursor: 'pointer',
          }}>
          Supprimer le local ECS
        </button>
      </div>
    </div>
  )
}

function LocalEFPanel({ lef, onChange, onDelete, levels }) {
  const set = (key, val) => onChange({ ...lef, [key]: val })
  const width  = Math.round(lef.x2 - lef.x1)
  const height = Math.round(lef.height)

  return (
    <div className="rp-section">
      <h3 className="rp-title">Local EF</h3>

      <label className="lp-checkbox-label" style={{ marginBottom: 8 }}>
        <input type="checkbox"
          checked={!!lef.enabled}
          onChange={e => set('enabled', e.target.checked)} />
        <span style={{ fontSize: 11, color: '#374151' }}>Afficher le local EF</span>
      </label>

      <Field label="Niveau">
        <select
          value={lef.levelId ?? ''}
          onChange={e => set('levelId', e.target.value)}>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>

      <Field label="Largeur" unit="px">
        <NumInput min={20} step={10}
          value={width}
          onChange={v => {
            const w = Math.max(20, v ?? 20)
            set('x2', lef.x1 + w)
          }} />
      </Field>

      <Field label="Hauteur" unit="px">
        <NumInput min={20} step={10}
          value={height}
          onChange={v => set('height', Math.max(20, v ?? 20))} />
      </Field>

      <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        <button
          onClick={onDelete}
          style={{
            width: '100%', padding: '6px 0', fontSize: 12, fontWeight: 600,
            background: '#fef2f2', color: '#dc2626',
            border: '1px solid #fecaca', borderRadius: 5, cursor: 'pointer',
          }}>
          Supprimer le local EF
        </button>
      </div>
    </div>
  )
}

interface RightPanelProps {
  selectedIds: string[]; segments: any[]; points: any[]
  onUpdate: any; materials: any[]; insulations: any[]
  levels: any[]; lineYs: number[]; columns: any[]; columnXs: number[]
  chaufferie: any; onChaufferieChange: any; editChaufferie: boolean
  flowDirections: any; networkFlows: any; globalParams: any
  thermalResults: any; roleMap: any
  drawMode: string; onExitEditParams: any
  selectedValveId: string | null; valves: any[]; onValveUpdate: any
  activeCalcId: CalcMode | null; alimentationParams: any; alimentationResults: any
  pdcParams: any; pdcResults: any; pdcCumResults: any; pdcCumAlimResults: any
  segToCol: any; valveKvResults: any
  selectedAmontId: string | null; tronçonsAmont: any[]
  onUpdateAmontTroncon: any; onRemoveAmontTroncon: any
  amontTronconResults: any; totalQpAlimM3h?: number
  pressionSourceAlimECS?: number | null; pressionSourceAlimECSStatic?: number | null
  pressionSourceAlimEF?: number | null; pressionSourceAlimEFStatic?: number | null
  pdcParamsAlimECS?: any
  groupDisplayNames?: any
  locauxEF?: any[]; onLocauxEFChange: any
  selectedLocalEFId?: string | null; onSelectedLocalEFChange: any
  chauffageFlows?: any; chauffageParams?: any; onChauffageParamsChange?: any; chauffageThermal?: any
}

export default function RightPanel({
  selectedIds, segments, points, onUpdate, materials, insulations,
  levels, lineYs, columns, columnXs, chaufferie, onChaufferieChange,
  editChaufferie, flowDirections, networkFlows, globalParams, thermalResults, roleMap,
  drawMode, onExitEditParams,
  selectedValveId, valves, onValveUpdate,
  activeCalcId, alimentationParams, alimentationResults,
  pdcParams, pdcResults, pdcCumResults, pdcCumAlimResults, segToCol, valveKvResults,
  selectedAmontId, tronçonsAmont, onUpdateAmontTroncon, onRemoveAmontTroncon,
  amontTronconResults, totalQpAlimM3h = 0, pressionSourceAlimECS = null, pressionSourceAlimECSStatic = null,
  pressionSourceAlimEF = null, pressionSourceAlimEFStatic = null,
  pdcParamsAlimECS = null,
  groupDisplayNames = null,
  locauxEF = [], onLocauxEFChange,
  selectedLocalEFId = null, onSelectedLocalEFChange,
  chauffageFlows, chauffageParams, onChauffageParamsChange, chauffageThermal,
}: RightPanelProps) {
  const [resultsView, setResultsView] = useState<'dimensionnement' | 'pdc'>('dimensionnement')

  if (editChaufferie && chaufferie?.placed) {
    return (
      <ChaufferiePanel
        chaufferie={chaufferie}
        onChange={onChaufferieChange}
        levels={levels ?? []}
      />
    )
  }

  const selectedLEF = selectedLocalEFId ? (locauxEF ?? []).find(l => l.id === selectedLocalEFId) : null
  if (selectedLEF) {
    return (
      <LocalEFPanel
        lef={selectedLEF}
        onChange={updated => onLocauxEFChange?.((locauxEF ?? []).map(l => l.id === updated.id ? updated : l))}
        onDelete={() => { onLocauxEFChange?.((locauxEF ?? []).filter(l => l.id !== selectedLocalEFId)); onSelectedLocalEFChange?.(null) }}
        levels={levels ?? []}
      />
    )
  }

  const selectedValve = selectedValveId ? (valves ?? []).find(v => v.id === selectedValveId) : null
  if (selectedValve) {
    return <ValvePanel valve={selectedValve} onUpdate={onValveUpdate}
      valveKvResult={valveKvResults?.get(selectedValve.id)}
      activeCalcId={activeCalcId} segToCol={segToCol} />
  }

  if (selectedAmontId && (!selectedIds || selectedIds.length === 0)) {
    const trIndex = (tronçonsAmont ?? []).findIndex((t: TronconAmontEF) => t.id === selectedAmontId)
    const tr = trIndex >= 0 ? (tronçonsAmont ?? [])[trIndex] : null
    if (tr) {
      return (
        <TronconAmontPanel
          tr={tr}
          index={trIndex}
          result={amontTronconResults?.get(selectedAmontId) ?? null}
          materials={materials ?? []}
          totalQpAlimM3h={totalQpAlimM3h}
          pdcParams={pdcParamsAlimECS}
          onUpdate={onUpdateAmontTroncon}
          onRemove={() => onRemoveAmontTroncon?.(selectedAmontId)}
        />
      )
    }
  }

  if (!selectedIds || selectedIds.length === 0) {
    return (
      <div className="rp-section rp-empty">
        <p>Cliquez sur un tronçon ou un point pour éditer ses propriétés.</p>
        <p style={{ marginTop: 8 }}>Shift + clic pour sélectionner plusieurs éléments.</p>
      </div>
    )
  }

  if (selectedIds.length > 1) {
    return (
      <div className="rp-section">
        <h3 className="rp-title">Sélection multiple</h3>
        <p className="lp-hint">{selectedIds.length} éléments sélectionnés.</p>
        <p className="lp-hint" style={{ marginTop: 6 }}>Appuyez sur <strong>Suppr</strong> pour supprimer la sélection.</p>
      </div>
    )
  }

  const seg = segments.find(s => s.id === selectedIds[0])
  const pt  = points.find(p => p.id === selectedIds[0])

  if (seg) return (
    <SegmentPanel
      seg={seg} onUpdate={onUpdate} materials={materials} insulations={insulations}
      allSegs={segments} levels={levels} lineYs={lineYs}
      columns={columns} columnXs={columnXs} chaufferie={chaufferie}
      points={points}
      flowData={chauffageFlows?.get(seg.id) ?? networkFlows?.get(seg.id)}
      globalParams={globalParams}
      thermalData={thermalResults?.segResults.get(seg.id)}
      roleMap={roleMap}
      drawMode={drawMode}
      onExitEditParams={onExitEditParams}
      activeCalcId={activeCalcId}
      alimentationData={alimentationResults?.get(seg.id)}
      alimentationParams={alimentationParams}
      pdcParams={pdcParams}
      pdcResult={pdcResults?.get(seg.id)}
      resultsView={resultsView}
      onResultsViewChange={setResultsView}
      pdcCumResults={pdcCumResults}
      pdcCumAlimResults={pdcCumAlimResults}
      segToCol={segToCol}
      flowDirections={flowDirections}
      groupDisplayNames={groupDisplayNames}
    />
  )
  if (pt) {
    const inSegs = segments
      .filter(s => flowDirections?.get(s.id)?.toId === pt.id)
      .map(s => ({
        id: s.id,
        name: getDisplayName(s, segments, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(s.id), activeCalcId, roleMap, flowDirections),
        flowRate: networkFlows?.get(s.id)?.flowRate ?? null,
        T_to:     thermalResults?.segResults.get(s.id)?.T_to ?? null,
        type:     s.type,
      }))
    return (
      <PointPanel
        pt={pt} onUpdate={onUpdate}
        nodeTemp={resultsView === 'pdc' || activeCalcId === 'alimentation-ecs' ? null : thermalResults?.nodeTemps.get(pt.id)}
        inSegs={inSegs}
        globalParams={globalParams}
        activeCalcId={activeCalcId}
        alimentationParams={alimentationParams}
        alimentationResults={alimentationResults}
        points={points}
        calcSubMode={resultsView}
        onResultsViewChange={setResultsView}
        pdcCumResults={pdcCumResults}
        pdcParams={pdcParams}
        pdcCumAlimResults={pdcCumAlimResults}
        levels={levels}
        lineYs={lineYs}
        pressionSourceAlimECS={pressionSourceAlimECS}
        pressionSourceAlimECSStatic={pressionSourceAlimECSStatic}
        pressionSourceAlimEF={pressionSourceAlimEF}
        pressionSourceAlimEFStatic={pressionSourceAlimEFStatic}
        groupDisplayNames={groupDisplayNames}
        allSegs={segments}
        flowDirections={flowDirections}
        materials={materials}
        roleMap={roleMap}
        columns={columns}
        columnXs={columnXs}
        thermalResults={thermalResults}
        chauffageFlows={chauffageFlows}
        chauffageParams={chauffageParams}
        onChauffageParamsChange={onChauffageParamsChange}
        chauffageThermal={chauffageThermal}
      />
    )
  }

  return null
}
