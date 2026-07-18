import { useState, useRef, useEffect } from 'react'
import type { CalcMode } from '../types'
import { getDisplayName } from '../utils/naming'
import { getModeFlags } from '../utils/calcModeFlags'
import { sf } from '../utils/fmt'
import { type TronconAmontEF, type TronconAmontResult } from '../utils/pdcCalc'
import { SegFittingsPanel, SegEquipPanel } from './segPanelShared'
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
                <SegEquipPanel seg={tr} set={(k, v) => set(k, v)} pdcParams={pdcParams} mode="alimentation-ecs" />
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
                <span style={{ color: '#6b7280' }}>ΔP depuis {r.sourceLabel}</span>
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
                  <div style={{ fontSize: 9, color: '#9ca3af' }}>depuis {r.sourceLabel}</div>
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

function ChaufferiePanel({ chaufferie, onChange, levels, isChauffage = false, isEauGlacee = false }: { chaufferie: any; onChange: any; levels: any[]; isChauffage?: boolean; isEauGlacee?: boolean }) {
  const set = (key, val) => onChange({ ...chaufferie, [key]: val })
  const width  = Math.round(chaufferie.x2 - chaufferie.x1)
  const height = Math.round(chaufferie.height)
  const panelTitle = isChauffage ? 'Chaufferie' : isEauGlacee ? 'Local groupe froid' : 'Production ECS'
  const entityName = isChauffage ? 'la chaufferie' : isEauGlacee ? 'le local groupe froid' : 'la production ECS'

  return (
    <div className="rp-section">
      <h3 className="rp-title">{panelTitle}</h3>

      <label className="lp-checkbox-label" style={{ marginBottom: 8 }}>
        <input type="checkbox"
          checked={!!chaufferie.enabled}
          onChange={e => set('enabled', e.target.checked)} />
        <span style={{ fontSize: 11, color: '#374151' }}>Afficher {entityName}</span>
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
          Supprimer {entityName}
        </button>
      </div>
    </div>
  )
}

function LocalZonePanel({ zone, label, onClose, onChange, onDelete, levels }: { zone: any; label: string; onClose?: string; onChange: any; onDelete: any; levels: any[] }) {
  const set = (key, val) => onChange({ ...zone, [key]: val })
  const width  = Math.round(zone.x2 - zone.x1)
  const height = Math.round(zone.height)
  return (
    <div className="rp-section">
      <h3 className="rp-title">{label}</h3>
      <label className="lp-checkbox-label" style={{ marginBottom: 8 }}>
        <input type="checkbox" checked={!!zone.enabled} onChange={e => set('enabled', e.target.checked)} />
        <span style={{ fontSize: 11, color: '#374151' }}>Afficher</span>
      </label>
      <Field label="Niveau">
        <select value={zone.levelId ?? ''} onChange={e => set('levelId', e.target.value)}>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </Field>
      <Field label="Largeur" unit="px">
        <NumInput min={20} step={10} value={width}
          onChange={v => { const w = Math.max(20, v ?? 20); set('x2', zone.x1 + w) }} />
      </Field>
      <Field label="Hauteur" unit="px">
        <NumInput min={20} step={10} value={height}
          onChange={v => set('height', Math.max(20, v ?? 20))} />
      </Field>
      <div style={{ marginTop: 16, borderTop: '1px solid #e5e7eb', paddingTop: 12 }}>
        <button onClick={onDelete}
          style={{ width: '100%', padding: '6px 0', fontSize: 12, fontWeight: 600,
            background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 5, cursor: 'pointer' }}>
          Supprimer {onClose ?? label.toLowerCase()}
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
  locauxECS?: any[]; onLocauxECSChange: any
  selectedLocalECSId?: string | null; onSelectedLocalECSChange: any
  locauxChauffage?: any[]; onLocauxChauffageChange: any
  selectedLocalChauffageId?: string | null; onSelectedLocalChauffageChange: any
  locauxGroupeFroid?: any[]; onLocauxGroupeFroidChange?: any
  selectedLocalGroupeFroidId?: string | null; onSelectedLocalGroupeFroidChange?: any
  chauffageFlows?: any; chauffageParams?: any; onChauffageParamsChange?: any; chauffageThermal?: any
  eauGlaceeFlows?: any; eauGlaceeParams?: any; onEauGlaceeParamsChange?: any; eauGlaceeThermal?: any
  eauGlaceePumpHMT?: Map<string, any>
  eauGlaceeSplitCumDp?: any
  mixingNodes?: Set<string>
  chauffagePumpHMT?: Map<string, any>
  chauffageSplitCumDp?: { segCumDp: Map<string, number>; secondarySegIds: Set<string>; segPostJunction: Map<string, boolean>; criticalSegIds: Set<string>; segJunctionWinner: Map<string, string> } | null
  onShowCriticalPath?: (segIds: string[]) => void
  pumpCriticalMap?: Map<string, { critDp: number | null; criticalSegIds: Set<string> }> | null
  criticalPathIds?: string[]
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
  locauxECS = [], onLocauxECSChange,
  selectedLocalECSId = null, onSelectedLocalECSChange,
  locauxChauffage = [], onLocauxChauffageChange,
  selectedLocalChauffageId = null, onSelectedLocalChauffageChange,
  locauxGroupeFroid = [], onLocauxGroupeFroidChange,
  selectedLocalGroupeFroidId = null, onSelectedLocalGroupeFroidChange,
  chauffageFlows, chauffageParams, onChauffageParamsChange, chauffageThermal,
  eauGlaceeFlows, eauGlaceeParams, onEauGlaceeParamsChange, eauGlaceeThermal,
  eauGlaceePumpHMT, eauGlaceeSplitCumDp,
  mixingNodes, chauffagePumpHMT, chauffageSplitCumDp, onShowCriticalPath,
  pumpCriticalMap = null,
  criticalPathIds = [],
}: RightPanelProps) {
  const [resultsView, setResultsView] = useState<'dimensionnement' | 'pdc'>('dimensionnement')

  const { isChauffage: _isChauffage, isEauGlacee: _isEauGlacee } = getModeFlags(activeCalcId)
  if (editChaufferie && chaufferie?.placed) {
    return (
      <ChaufferiePanel
        chaufferie={chaufferie}
        onChange={onChaufferieChange}
        levels={levels ?? []}
        isChauffage={_isChauffage}
        isEauGlacee={_isEauGlacee}
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

  const selectedLECS = selectedLocalECSId ? (locauxECS ?? []).find(l => l.id === selectedLocalECSId) : null
  if (selectedLECS) {
    return (
      <LocalZonePanel
        zone={selectedLECS} label="Local ECS" onClose="le local ECS"
        onChange={updated => onLocauxECSChange?.((locauxECS ?? []).map(l => l.id === updated.id ? updated : l))}
        onDelete={() => { onLocauxECSChange?.((locauxECS ?? []).filter(l => l.id !== selectedLocalECSId)); onSelectedLocalECSChange?.(null) }}
        levels={levels ?? []}
      />
    )
  }

  const selectedLCh = selectedLocalChauffageId ? (locauxChauffage ?? []).find(l => l.id === selectedLocalChauffageId) : null
  if (selectedLCh) {
    return (
      <LocalZonePanel
        zone={selectedLCh} label="Local chauffage" onClose="le local chauffage"
        onChange={updated => onLocauxChauffageChange?.((locauxChauffage ?? []).map(l => l.id === updated.id ? updated : l))}
        onDelete={() => { onLocauxChauffageChange?.((locauxChauffage ?? []).filter(l => l.id !== selectedLocalChauffageId)); onSelectedLocalChauffageChange?.(null) }}
        levels={levels ?? []}
      />
    )
  }

  const selectedLGF = selectedLocalGroupeFroidId ? (locauxGroupeFroid ?? []).find(l => l.id === selectedLocalGroupeFroidId) : null
  if (selectedLGF) {
    return (
      <LocalZonePanel
        zone={selectedLGF} label="Local groupe froid" onClose="le local groupe froid"
        onChange={updated => onLocauxGroupeFroidChange?.((locauxGroupeFroid ?? []).map(l => l.id === updated.id ? updated : l))}
        onDelete={() => { onLocauxGroupeFroidChange?.((locauxGroupeFroid ?? []).filter(l => l.id !== selectedLocalGroupeFroidId)); onSelectedLocalGroupeFroidChange?.(null) }}
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
      flowData={chauffageFlows?.get(seg.id) ?? eauGlaceeFlows?.get(seg.id) ?? networkFlows?.get(seg.id)}
      globalParams={globalParams}
      thermalData={thermalResults?.segResults.get(seg.id)}
      chauffageThermal={chauffageThermal}
      eauGlaceeThermal={eauGlaceeThermal}
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
      chauffageSplitCumDp={chauffageSplitCumDp}
      eauGlaceeSplitCumDp={eauGlaceeSplitCumDp}
    />
  )
  if (pt) {
    const inSegs = segments
      .filter(s => flowDirections?.get(s.id)?.toId === pt.id)
      .map(s => ({
        id: s.id,
        name: getDisplayName(s, segments, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(s.id), activeCalcId, roleMap, flowDirections),
        flowRate: chauffageFlows?.get(s.id)?.flowRate ?? eauGlaceeFlows?.get(s.id)?.flowRate ?? networkFlows?.get(s.id)?.flowRate ?? null,
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
        eauGlaceeFlows={eauGlaceeFlows}
        eauGlaceeParams={eauGlaceeParams}
        onEauGlaceeParamsChange={onEauGlaceeParamsChange}
        eauGlaceeThermal={eauGlaceeThermal}
        eauGlaceePumpHMT={eauGlaceePumpHMT}
        eauGlaceeSplitCumDp={eauGlaceeSplitCumDp}
        networkFlows={networkFlows}
        mixingNodes={mixingNodes}
        chauffagePumpHMT={chauffagePumpHMT}
        chauffageSplitCumDp={chauffageSplitCumDp}
        onShowCriticalPath={onShowCriticalPath}
        pumpCriticalMap={pumpCriticalMap}
        criticalPathIds={criticalPathIds}
      />
    )
  }

  return null
}
