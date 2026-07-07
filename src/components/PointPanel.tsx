import { useState, useRef } from 'react'
import type { CalcMode } from '../types'
import { sf } from '../utils/fmt'
import { getNodeCote, getNodeDefaultCote } from '../utils/coteCalc'
import { NumInput } from './NumInput'
import { tAvalStyle, Field, SectionLabel, SegNameField, CoteSection, TempBadge, computeGroupePath, MAX_ANTENNE_LEN_M, MAX_ANTENNE_VOL_L } from './rpShared'
import { getModeFlags } from '../utils/calcModeFlags'
import { EMETTEUR_TYPES } from '../data/emetteurs'

const DIR_BTNS = [
  { label: '←', rot: 180, title: 'Vers la gauche' },
  { label: '↑', rot: 270, title: 'Vers le haut' },
  { label: '→', rot: 0,   title: 'Vers la droite' },
  { label: '↓', rot: 90,  title: 'Vers le bas' },
]

interface PointPanelProps {
  pt: any; onUpdate: any; nodeTemp: number | null
  inSegs?: any[]; globalParams: any
  activeCalcId: CalcMode | null
  alimentationParams: any; alimentationResults: any
  points?: any[]; calcSubMode: string; onResultsViewChange?: any
  pdcCumResults: any; pdcParams: any; pdcCumAlimResults: any
  levels?: any[]; lineYs?: number[]
  pressionSourceAlimECS?: number | null; pressionSourceAlimECSStatic?: number | null
  pressionSourceAlimEF?: number | null; pressionSourceAlimEFStatic?: number | null
  groupDisplayNames?: any; allSegs?: any[]; flowDirections?: any
  materials?: any[]; roleMap?: any; columns?: any[]; columnXs?: number[]
  thermalResults?: any; chauffageFlows?: any; chauffageParams?: any; onChauffageParamsChange?: any; chauffageThermal?: any
}

export default function PointPanel({ pt, onUpdate, nodeTemp, inSegs = [], globalParams, activeCalcId, alimentationParams, alimentationResults, points = [], calcSubMode, onResultsViewChange = null, pdcCumResults, pdcParams, pdcCumAlimResults, levels = [], lineYs = [], pressionSourceAlimECS = null, pressionSourceAlimECSStatic = null, pressionSourceAlimEF = null, pressionSourceAlimEFStatic = null, groupDisplayNames = null, allSegs = [], flowDirections = null, materials = [], roleMap = null, columns = [], columnXs = [], thermalResults = null, chauffageFlows = null, chauffageParams = null, onChauffageParamsChange = null, chauffageThermal = null }: PointPanelProps) {
  const set = (key, val) => onUpdate(pt.id, 'point', { [key]: val })
  const T_depart = globalParams?.T_depart ?? null
  const [showDims, setShowDims] = useState(false)
  const deltaTByType = useRef<Record<string, number | null>>({})

  const { isBouclage, isAlimECS, isAlimEF, isAlimMode, hasPdc, isChauffage } = getModeFlags(activeCalcId)

  const coteDef = getNodeDefaultCote(pt, levels, lineYs)
  const coteJsx = isAlimMode ? (
    <Field label="Cote" unit="m">
      <NumInput step={0.01}
        value={pt.cote_override ?? null}
        placeholder={`${coteDef.toFixed(2)} (par défaut)`}
        allowEmpty
        onChange={v => set('cote_override', v)} />
    </Field>
  ) : null

  const renderPdcCum = () => {
    if (calcSubMode !== 'pdc' || !pdcCumResults) return null
    const incoming       = pdcCumResults.nodeIncoming.get(pt.id) ?? []
    const isJunction     = incoming.length > 1
    const isPostJunction = pdcCumResults.nodePostJunction.get(pt.id) ?? false
    const cumDp          = pdcCumResults.nodeCumDp.get(pt.id)
    if (cumDp == null && incoming.length === 0) return null

    const unite = pdcParams?.uniteAffichage ?? 'Pa'
    const fmtDpNode = (pa: number): React.ReactNode => {
      const mmce = `${(pa / 9.81).toFixed(0)} mmCE`
      if (unite === 'mmCE') return mmce
      if (unite === 'both') return (
        <>{Math.round(pa)} Pa<span style={{ fontSize: '0.8em', color: '#8d96a8', fontWeight: 400 }}> /{mmce}</span></>
      )
      return `${Math.round(pa)} Pa`
    }

    const title = (
      <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
        letterSpacing: '0.06em', marginBottom: 6 }}>ΔP depuis production ECS</div>
    )

    const wrap = (children: React.ReactNode) => (
      <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: '2px solid #e5e7eb' }}>
        {title}
        {children}
      </div>
    )


    if (cumDp != null) {
      return wrap(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a',
            fontFamily: 'ui-monospace, monospace', letterSpacing: '-0.5px' }}>{fmtDpNode(cumDp)}</span>
          {isPostJunction && (
            <span style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic' }}>
              circuit le plus défavorisé
            </span>
          )}
        </div>
      )
    }
    return null
  }

  if (pt.type === 'pump') {
    const pumpFlowRateLh = inSegs.length > 0
      ? Math.round(inSegs.reduce((s, seg) => s + (seg.flowRate ?? 0), 0) * 1000)
      : null
    const critDp = pdcCumResults?.criticalDp ?? null
    const hmtMce = critDp != null ? critDp / 9810 : null
    const unite  = pdcParams?.uniteAffichage ?? 'Pa'
    const fmtDp  = (pa: number) => {
      const mmce = `${(pa / 9.81).toFixed(0)} mmCE`
      if (unite === 'mmCE') return mmce
      if (unite === 'both') return `${Math.round(pa)} Pa / ${mmce}`
      return `${Math.round(pa)} Pa`
    }
    const statRow = (label: string, value: React.ReactNode) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a',
          fontFamily: 'ui-monospace, monospace' }}>{value}</span>
      </div>
    )
    const showDebit = pumpFlowRateLh != null && pumpFlowRateLh > 0
    const showPdc   = critDp != null
    const showTemp  = !isAlimECS && nodeTemp != null
    return (
      <div className="rp-section">
        <h3 className="rp-title">Pompe</h3>
        {(() => {
          const pumpsSorted = points.filter((p: any) => p.type === 'pump')
          const pumpIdx = pumpsSorted.findIndex((p: any) => p.id === pt.id)
          const autoName = pumpsSorted.length <= 1
            ? 'Pompe bouclage ECS'
            : `Pompe bouclage ECS n°${pumpIdx + 1}`
          const isDefaultName = !pt.name || pt.name === autoName
          return (
            <SegNameField
              displayName={autoName}
              isDefault={isDefaultName}
              value={isDefaultName ? '' : (pt.name ?? '')}
              onChange={v => set('name', v || autoName)}
            />
          )
        })()}
        <hr className="rp-divider" />
        {coteJsx}

        {/* Résultats : débit, ΔP, HMT, température */}
        {(showDebit || showPdc || showTemp) && (
          <div style={{ marginTop: 10, borderTop: '2px solid #e5e7eb', paddingTop: 10 }}>
            <SectionLabel>Résultats pompe</SectionLabel>
            {showDebit &&
              statRow('Débit de circulation',
                <>{pumpFlowRateLh} <span style={{ fontSize: 10, fontWeight: 400 }}>L/h</span></>)
            }
            {showPdc && (<>
              {statRow('ΔP circuit défavorisé', fmtDp(critDp!))}
              {hmtMce != null &&
                statRow('HMT', <>{hmtMce.toFixed(2)} <span style={{ fontSize: 10, fontWeight: 400 }}>mCE</span></>)
              }
            </>)}
            {showTemp && <TempBadge temp={nodeTemp} T_depart={T_depart} />}
          </div>
        )}

        {/* Caractéristiques */}
        <div style={{ marginTop: 8, borderTop: '1px solid #f3f4f6', paddingTop: 6 }}>
          <button
            onClick={() => setShowDims(v => !v)}
            style={{ fontSize: 10, color: '#9ca3af', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span>{showDims ? '▲' : '▼'}</span> Caractéristiques
          </button>
          {showDims && (<>
            <Field label="Rayon" unit="px">
              <NumInput min={8} max={40} step={1}
                value={pt.size ?? 12}
                onChange={v => set('size', Math.max(8, Math.min(40, v ?? 12)))} />
            </Field>
            <Field label="Direction">
              <div style={{ display: 'flex', gap: 3 }}>
                {DIR_BTNS.map(btn => (
                  <button key={btn.rot}
                    className={`lp-icon-btn${(pt.rotation ?? 180) === btn.rot ? ' active' : ''}`}
                    title={btn.title} style={{ minWidth: 26, fontWeight: 700 }}
                    onClick={() => set('rotation', btn.rot)}>
                    {btn.label}
                  </button>
                ))}
              </div>
            </Field>
          </>)}
        </div>
      </div>
    )
  }

  if (pt.type === 'groupe') {
    const setEquip = (appId, val) => {
      const equip = { ...(pt.equipements ?? {}), [appId]: val || null }
      for (const k of Object.keys(equip)) { if (!equip[k]) delete equip[k] }
      set('equipements', equip)
    }
    const enabledAppareils = hasPdc
      ? (alimentationParams?.appareils ?? []).filter(a => a.enabled)
      : []
    return (
      <div className="rp-section">
        <h3 className="rp-title">Groupe de points de puisage</h3>
        <SegNameField
          displayName={(groupDisplayNames as Map<string,string> | null)?.get(pt.id) ?? 'Groupe de puisage'}
          isDefault={!pt.name}
          value={pt.name ?? ''}
          onChange={v => set('name', v)}
        />

        {hasPdc && alimentationParams?.buildingType === 'hopital' && (<>
          <hr className="rp-divider" />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', padding: '3px 0' }}>
            <input type="checkbox"
              checked={!!pt.isChambreHopital}
              onChange={e => set('isChambreHopital', e.target.checked)}
            />
            <span style={{ color: '#111827' }}>Chambre d'hôpital</span>
          </label>
          {pt.isChambreHopital && (
            <p style={{ fontSize: 10, color: '#6b7280', margin: '2px 0 0', fontStyle: 'italic' }}>
              {isAlimEF
                ? "Appareil le plus demandeur (hors WC) quantité 1 + WC présent dans la chambre (réservoir ou robinet de chasse) quantité 1."
                : "Seul l'appareil le plus demandeur (hors WC) est pris en compte, quantité 1."}
            </p>
          )}
        </>)}

        {hasPdc && (<>
          <hr className="rp-divider" />
          <SectionLabel>Équipements</SectionLabel>
          {enabledAppareils.length === 0 && (
            <p style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic', margin: '4px 0 6px' }}>
              Aucun équipement actif — activez les appareils sanitaires dans les paramètres.
            </p>
          )}
        </>)}
        {enabledAppareils.length > 0 && (<>
          {enabledAppareils.map(a => {
            const cnt = pt.equipements?.[a.id] ?? 0
            return (
              <div key={a.id} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 0', borderBottom: '1px solid #f3f4f6',
              }}>
                <div style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: cnt > 0 ? '#0369a1' : '#d1d5db' }} />
                <span style={{ flex: 1, fontSize: 11, color: cnt > 0 ? '#111827' : '#6b7280' }}>{a.name}</span>
                <button onClick={() => setEquip(a.id, Math.max(0, cnt - 1))}
                  style={{ width: 22, height: 22, border: '1px solid #d1d5db', borderRadius: 4,
                    background: '#fff', cursor: cnt > 0 ? 'pointer' : 'default', fontSize: 15, lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    opacity: cnt > 0 ? 1 : 0.35 }}>−</button>
                <span style={{ fontSize: 12, fontWeight: 700,
                  color: cnt > 0 ? '#0369a1' : '#6b7280',
                  minWidth: 22, textAlign: 'center' }}>{cnt}</span>
                <button onClick={() => setEquip(a.id, cnt + 1)}
                  style={{ width: 22, height: 22, border: '1px solid #d1d5db', borderRadius: 4,
                    background: '#fff', cursor: 'pointer', fontSize: 15, lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
              </div>
            )
          })}
        </>)}

        {coteJsx && (<>
          <hr className="rp-divider" />
          {coteJsx}
        </>)}

        {(isAlimECS || isBouclage) && (() => {
          const path = computeGroupePath(pt.id, allSegs, flowDirections ?? undefined, materials, roleMap ?? undefined)
          const lenOk = path.length <= MAX_ANTENNE_LEN_M
          const volOk = path.volume <= MAX_ANTENNE_VOL_L
          const ok    = lenOk && volOk
          const bg    = ok ? '#f0fdf4' : '#fef2f2'
          const border = ok ? '#bbf7d0' : '#fca5a5'
          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Antenne</SectionLabel>
              <div style={{ padding: '7px 10px', background: bg, border: `1px solid ${border}`, borderRadius: 6, marginBottom: 4 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9.5, color: '#6b7280' }}>Longueur antenne</span>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
                      color: lenOk ? '#16a34a' : '#dc2626' }}>
                      {path.length.toFixed(1)} m {lenOk ? '✓' : `⚠ > ${MAX_ANTENNE_LEN_M} m`}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9.5, color: '#6b7280' }}>Volume antenne</span>
                    <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'ui-monospace, monospace',
                      color: volOk ? '#16a34a' : '#dc2626' }}>
                      {path.volume.toFixed(2)} L {volOk ? '✓' : `⚠ > ${MAX_ANTENNE_VOL_L} L`}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', marginBottom: 4 }}>
                Depuis le tronçon aller ECS — seuils : {MAX_ANTENNE_LEN_M} m / {MAX_ANTENNE_VOL_L} L
              </div>
            </>
          )
        })()}
        <TempBadge temp={isAlimECS ? null : nodeTemp} T_depart={T_depart} />

        {isAlimMode && calcSubMode === 'pdc' && (() => {
          const segId = inSegs[0]?.id
          if (!segId) return null
          const p      = pdcCumAlimResults?.segPressionAval?.get(segId) ?? null
          const pStat  = pdcCumAlimResults?.segPStatAval?.get(segId) ?? null
          if (p == null && pStat == null) return null

          const isHabitation = alimentationParams?.buildingType === 'habitation'
          const err3mCE = p != null && p < 30000
          const err1bar = p != null && isHabitation && p < 100000
          const isErrP  = err3mCE || err1bar
          const valColP = isErrP ? '#dc2626' : '#0f172a'
          const bgP     = isErrP ? '#fef2f2' : '#fff'
          const borderP = isErrP ? '#fca5a5' : '#e5e7eb'
          const hintP   = p == null ? null
            : p < 0     ? 'Pression négative — eau n\'atteint pas ce point'
            : err3mCE   ? '< 0,3 bar — insuffisant (≈ 3 mCE réglementaire)'
            : err1bar   ? '< 1 bar — insuffisant à l\'entrée du logement'
            : isHabitation ? '≥ 1 bar'
            : '≥ 0,3 bar'
          const hintColP = isErrP ? '#dc2626' : '#16a34a'

          const overStat = pStat != null && pStat > 400000
          const bgS      = overStat ? '#fef2f2' : '#fff'
          const borderS  = overStat ? '#fca5a5' : '#e5e7eb'

          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Pression au point de puisage</SectionLabel>
              <div style={{ display: 'flex', gap: 8 }}>
                {p != null && (
                  <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: bgP,
                    border: `1px solid ${borderP}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                      Pression disponible aval
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: valColP }}>
                        {(p / 100000).toFixed(2)}
                      </span>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                    </div>
                    {hintP && (
                      <div style={{ fontSize: 9, marginTop: 2, color: hintColP, fontWeight: 700 }}>{hintP}</div>
                    )}
                  </div>
                )}
                {pStat != null && (
                  <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: bgS,
                    border: `1px solid ${borderS}`, textAlign: 'center' }}>
                    <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                      textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                      Pression statique aval
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: overStat ? '#dc2626' : '#0f172a' }}>
                        {(pStat / 100000).toFixed(2)}
                      </span>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                    </div>
                    <div style={{ fontSize: 9, marginTop: 2, fontWeight: 700,
                      color: overStat ? '#dc2626' : '#16a34a' }}>
                      {overStat ? '> 4 bar — réducteur de pression requis' : '≤ 4 bar'}
                    </div>
                  </div>
                )}
              </div>
            </>
          )
        })()}

      </div>
    )
  }

  if (pt.type === 'arriveeEF') {
    // Compute column-based default name
    let colName: string | null = null
    if (columns?.length && columnXs?.length) {
      for (let ci = 0; ci < columns.length; ci++) {
        const cx1 = columnXs[ci], cx2 = columnXs[ci + 1]
        if (cx1 == null || cx2 == null) continue
        if (pt.x >= cx1 && pt.x <= cx2 && !columns[ci].isGap) { colName = columns[ci].name; break }
      }
    }
    const defaultName = colName ? `Arrivée EF – ${colName}` : 'Arrivée EF'
    const isDefaultName = !pt.name
    const showEFPressure = isAlimEF && calcSubMode === 'pdc' && pressionSourceAlimEF != null
    return (
      <div className="rp-section">
        <h3 className="rp-title">Arrivée EF</h3>
        <SegNameField
          displayName={defaultName}
          isDefault={isDefaultName}
          value={isDefaultName ? '' : (pt.name ?? '')}
          onChange={v => set('name', v || null)}
        />
        {coteJsx}
        {showEFPressure && (() => {
          const pDyn  = pressionSourceAlimEF!
          const pStat = pressionSourceAlimEFStatic ?? pDyn
          const isErrDyn  = pDyn < 30000
          const isWarnDyn = !isErrDyn && pDyn < 100000
          const colDyn = isErrDyn ? '#dc2626' : '#0f172a'
          const bgDyn  = isErrDyn ? '#fef2f2' : '#fff'
          const bdDyn  = isErrDyn ? '#fca5a5' : '#e5e7eb'
          const hintDyn = pDyn < 0 ? 'Pression négative'
            : pDyn < 30000  ? '< 0,3 bar — pression insuffisante'
            : pDyn < 100000 ? '< 1 bar — risque d\'insuffisance'
            : '≥ 1 bar'
          const hintColDyn = isErrDyn || isWarnDyn ? '#dc2626' : '#16a34a'
          const overStat = pStat > 400000
          const bgStat   = overStat ? '#fef2f2' : '#fff'
          const bdStat   = overStat ? '#fca5a5' : '#e5e7eb'
          const colStat  = overStat ? '#dc2626' : '#0f172a'
          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Pression à l'arrivée EF</SectionLabel>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8,
                  background: bgDyn, border: `1px solid ${bdDyn}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Pression disponible
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: colDyn }}>{(pDyn / 100000).toFixed(2)}</span>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                  </div>
                  <div style={{ fontSize: 9, marginTop: 2, fontWeight: 700, color: hintColDyn }}>{hintDyn}</div>
                </div>
                <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8,
                  background: bgStat, border: `1px solid ${bdStat}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Pression statique
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: colStat }}>{(pStat / 100000).toFixed(2)}</span>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                  </div>
                  <div style={{ fontSize: 9, marginTop: 2, fontWeight: 700,
                    color: overStat ? '#dc2626' : '#16a34a' }}>
                    {overStat ? '> 4 bar — réducteur de pression requis' : '≤ 4 bar'}
                  </div>
                </div>
              </div>
            </>
          )
        })()}
      </div>
    )
  }

  if (pt.type === 'productionChauffage') {
    const tDepart = chauffageParams?.T_depart   ?? 70
    const deltaT  = chauffageParams?.deltaT_reseau ?? 20
    const tRetourCalc: number | null = chauffageThermal?.nodeRetourT?.get(pt.id) ?? null
    const tRetour = tRetourCalc ?? (tDepart - deltaT)
    const emetteurs = points.filter((p: any) => p.type === 'emetteur')
    const totalPuissance = emetteurs.reduce((s: number, e: any) => s + (e.puissance ?? 0), 0)
    const RHO_CP = 1163
    const totalQ = totalPuissance > 0 && deltaT > 0
      ? totalPuissance / (RHO_CP * deltaT)
      : null
    const statRow = (label: string, value: React.ReactNode) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{value}</span>
      </div>
    )
    const setCP = (key: string, val: number) =>
      onChauffageParamsChange?.({ ...chauffageParams, [key]: val })
    return (
      <div className="rp-section">
        <h3 className="rp-title">Production Chauffage</h3>
        <SectionLabel>Paramètres réseau</SectionLabel>
        <Field label="T° départ" unit="°C">
          <NumInput value={tDepart} min={20} max={120} step={1} onChange={v => setCP('T_depart', v)} />
        </Field>
        <Field label="ΔT aller/retour" unit="°C">
          <NumInput value={deltaT} min={1} max={50} step={1} onChange={v => setCP('deltaT_reseau', v)} />
        </Field>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 10 }}>
          <div style={{ flex: 1, padding: '6px 10px', background: '#fef2f2',
            border: '1px solid #fca5a5', borderRadius: 6 }}>
            <div style={{ fontSize: 9, color: '#dc2626', fontWeight: 700, marginBottom: 2,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>T aller</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>{tDepart}</span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>°C</span>
            </div>
          </div>
          <div style={{ flex: 1, padding: '6px 10px', background: '#fff7ed',
            border: '1px solid #fed7aa', borderRadius: 6 }}>
            <div style={{ fontSize: 9, color: '#c2410c', fontWeight: 700, marginBottom: 2,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>T retour</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 16, fontWeight: 700, color: '#111827' }}>
                {tRetourCalc != null ? sf(tRetourCalc, 2) : tRetour}
              </span>
              <span style={{ fontSize: 10, color: '#9ca3af' }}>°C</span>
            </div>
          </div>
        </div>
        <hr className="rp-divider" />
        <SectionLabel>Réseau</SectionLabel>
        {statRow('Nb émetteurs', emetteurs.length)}
        {statRow('Puissance totale',
          <>{(totalPuissance / 1000).toFixed(1)} <span style={{ fontSize: 10, fontWeight: 400 }}>kW</span></>)}
        {totalQ != null && statRow('Débit total',
          <>{(totalQ * 1000).toFixed(1)} <span style={{ fontSize: 10, fontWeight: 400 }}>L/h</span></>)}
        <p className="lp-hint" style={{ marginTop: 6 }}>
          Le ΔT global peut être overridé par émetteur dans le panneau de droite.
        </p>
      </div>
    )
  }

  if (pt.type === 'emetteur') {
    const emetteurDef  = EMETTEUR_TYPES.find(e => e.id === pt.emetteurType)
    const label        = emetteurDef?.label ?? pt.emetteurType ?? 'Émetteur'
    const puissanceW   = pt.puissance ?? null
    const globalDeltaT = chauffageParams?.deltaT_reseau ?? 20
    const deltaTEff    = pt.deltaT_emetteur ?? globalDeltaT
    const RHO_CP       = 1163
    const flowRateLh   = puissanceW != null && deltaTEff > 0
      ? (puissanceW / (RHO_CP * deltaTEff)) * 1000
      : null

    const handleTypeChange = (newTypeId: string) => {
      const prevTypeId = pt.emetteurType ?? ''
      deltaTByType.current[`${pt.id}_${prevTypeId}`] = pt.deltaT_emetteur ?? null
      const saved   = deltaTByType.current[`${pt.id}_${newTypeId}`]
      const newDef  = EMETTEUR_TYPES.find(e => e.id === newTypeId)
      const newDt   = (saved != null) ? saved : (newDef?.deltaTDefault ?? globalDeltaT)
      onUpdate(pt.id, 'point', { emetteurType: newTypeId, deltaT_emetteur: newDt })
    }

    const statRow = (lbl: string, value: React.ReactNode) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
        <span style={{ fontSize: 11, color: '#6b7280' }}>{lbl}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{value}</span>
      </div>
    )

    return (
      <div className="rp-section">
        <h3 className="rp-title">{label}</h3>

        <Field label="Type d'émetteur">
          <select
            value={pt.emetteurType ?? ''}
            onChange={e => handleTypeChange(e.target.value)}
            style={{ width: '100%', fontSize: 11, padding: '5px 6px', border: '1px solid #d1d5db',
              borderRadius: 5, background: '#fff', cursor: 'pointer' }}
          >
            {EMETTEUR_TYPES.map(e => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </Field>

        <Field label="Puissance" unit="W">
          <NumInput min={1} step={100} allowEmpty
            value={puissanceW}
            placeholder="—"
            onChange={v => set('puissance', v)} />
        </Field>

        <Field label="ΔT émetteur" unit="K">
          <NumInput min={1} max={60} step={1}
            value={pt.deltaT_emetteur ?? globalDeltaT}
            onChange={v => set('deltaT_emetteur', v ?? globalDeltaT)} />
        </Field>

        {flowRateLh != null && (
          <>
            <hr className="rp-divider" />
            <SectionLabel>Résultats</SectionLabel>
            <div style={{ padding: '8px 12px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6 }}>
              <div style={{ fontSize: 9, color: '#0284c7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Débit</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>{flowRateLh.toFixed(1)}</span>
                <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>L/h</span>
              </div>
            </div>
          </>
        )}
      </div>
    )
  }

  if (pt.type === 'productionECS') {
    const tOverride    = pt.T_depart_override ?? null
    const tEffective   = tOverride ?? T_depart ?? 60
    const isOverridden = tOverride != null
    // T_retour = T_to du/des tronçon(s) arrivant au nœud (température réelle en retour de boucle)
    const returnTemps = inSegs.map(s => s.T_to).filter(t => t != null)
    const T_retour = returnTemps.length > 0 ? Math.min(...returnTemps) : null
    const dT_loop  = T_retour != null ? tEffective - T_retour : null
    return (
      <div className="rp-section">
        <h3 className="rp-title">Production ECS</h3>

        {/* Sélecteur de mode de production */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 5 }}>Mode de production</div>
          <select
            value={pt.modeProduction ?? ''}
            onChange={e => set('modeProduction', e.target.value || null)}
            style={{ width: '100%', fontSize: 11, padding: '5px 6px', border: '1px solid #d1d5db',
              borderRadius: 5, background: '#fff', color: pt.modeProduction ? '#111827' : '#6b7280',
              cursor: 'pointer' }}
          >
            <option value="">— Choisir un mode —</option>
            <option value="instantane">Production instantanée par échangeur</option>
            <option value="echangeur-ballons-perm">Échangeur à plaques + stockage ECS</option>
            <option value="ballon-echangeur">Ballon ECS à échangeur</option>
            <option value="ballons-electriques">Ballons électriques collectifs</option>
            <option value="pac-collective">Pompe à chaleur dédiée ECS</option>
          </select>
        </div>
        {!pt.modeProduction ? (
          <div style={{ fontSize: 9.5, color: '#9ca3af', fontStyle: 'italic', marginBottom: 8 }}>
            Choisissez un mode pour accéder au dimensionnement.
          </div>
        ) : pt.modeProduction !== 'instantane' && pt.modeProduction !== 'echangeur-ballons-perm' && pt.modeProduction !== 'ballon-echangeur' && pt.modeProduction !== 'ballons-electriques' && pt.modeProduction !== 'pac-collective' && (
          <div style={{ fontSize: 9.5, color: '#9ca3af', fontStyle: 'italic', padding: '3px 8px',
            background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 4, marginBottom: 8 }}>
            Dimensionnement disponible prochainement.
          </div>
        )}
        <hr className="rp-divider" />

        {isBouclage && (
          <>
            {/* Champ T départ éditable — au-dessus des badges */}
            <Field label="T départ" unit="°C">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <NumInput
                  step={0.5}
                  value={tOverride ?? null}
                  placeholder={`${T_depart ?? 60} (par défaut)`}
                  allowEmpty
                  onChange={v => set('T_depart_override', v)}
                  style={{ fontStyle: isOverridden ? 'normal' : 'italic',
                    color: isOverridden ? '#111827' : '#9ca3af', flex: 1 }}
                />
                {isOverridden && (
                  <button
                    title={`Réinitialiser (défaut global : ${T_depart ?? 60} °C)`}
                    onClick={() => set('T_depart_override', null)}
                    style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: 'none',
                      cursor: 'pointer', padding: '0 2px', lineHeight: 1, flexShrink: 0 }}>
                    ↺
                  </button>
                )}
              </div>
            </Field>
                    <hr className="rp-divider" />
            {/* Badges T départ / T retour — lecture seule */}
            <div style={{ display: 'flex', gap: 8 }}>
              {(() => {
                const tsD = tAvalStyle(tEffective, tEffective)
                return (
                  <div style={{ flex: 1, padding: '8px 10px',
                    background: tsD.background ?? '#fef2f2',
                    border: `1px solid ${tsD.borderColor ?? '#fca5a5'}`,
                    borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: tsD.labelColor ?? '#dc2626', fontWeight: 700, marginBottom: 3,
                      textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      T départ
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: tsD.fontWeight ?? 700, color: tsD.color ?? '#111827' }}>
                        {sf(tEffective, 1)}
                      </span>
                      <span style={{ fontSize: 10, color: tsD.color ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>°C</span>
                    </div>
                  </div>
                )
              })()}
              {(() => {
                const tsR = tAvalStyle(T_retour, tEffective)
                return (
                  <div style={{ flex: 1, padding: '8px 10px', background: tsR.background ?? '#fff7ed',
                    border: `1px solid ${tsR.borderColor ?? '#fed7aa'}`, borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: tsR.labelColor ?? '#c2410c', fontWeight: 700, marginBottom: 3,
                      textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      T retour
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 18, fontWeight: tsR.fontWeight ?? 700, color: tsR.color ?? '#111827' }}>
                        {sf(T_retour, 2)}
                      </span>
                      <span style={{ fontSize: 10, color: tsR.color ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>°C</span>
                    </div>
                    {T_retour == null && (
                      <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', marginTop: 2 }}>
                        Non calculée
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            {dT_loop != null && (
              <div style={{ marginTop: 3, fontSize: 10, color: '#6b7280' }}>
                ΔT depuis départ :{' '}
                <span style={{ fontWeight: 700, color: '#374151' }}>{sf(dT_loop, 2)} K</span>
                <span style={{ color: '#9ca3af', marginLeft: 5 }}>
                  ({sf(tEffective, 0)} → {sf(T_retour, 2)} °C)
                </span>
              </div>
            )}
            {dT_loop != null && dT_loop > 5 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 4,
                padding: '4px 7px', background: '#fff7ed',
                border: '1px solid #fed7aa', borderRadius: 4, fontSize: 10 }}>
                <span style={{ color: '#f97316', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>⚠</span>
                <span style={{ color: '#c2410c', fontWeight: 600 }}>
                  ΔT = {sf(dT_loop, 1)} K &gt; 5 K — objectif de dimensionnement non atteint
                </span>
              </div>
            )}
          </>
        )}

        {isAlimECS && calcSubMode === 'pdc' && pressionSourceAlimECS != null && (() => {
          const pDyn  = pressionSourceAlimECS
          const pStat = pressionSourceAlimECSStatic ?? pressionSourceAlimECS

          const isErrDyn  = pDyn < 30000
          const isWarnDyn = !isErrDyn && pDyn < 100000
          const colDyn    = isErrDyn ? '#dc2626' : '#0f172a'
          const bgDyn     = isErrDyn ? '#fef2f2' : '#fff'
          const bdDyn     = isErrDyn ? '#fca5a5' : '#e5e7eb'
          const hintDyn   = pDyn < 0      ? 'Pression négative'
                          : pDyn < 30000  ? '< 0,3 bar — pression insuffisante'
                          : pDyn < 100000 ? '< 1 bar — risque d\'insuffisance'
                          :                 '≥ 1 bar'
          const hintColDyn = isErrDyn || isWarnDyn ? '#dc2626' : '#16a34a'

          const overStat = pStat > 400000
          const bgStat   = overStat ? '#fef2f2' : '#fff'
          const bdStat   = overStat ? '#fca5a5' : '#e5e7eb'
          const colStat  = overStat ? '#dc2626' : '#0f172a'

          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Pression à Production ECS</SectionLabel>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8,
                  background: bgDyn, border: `1px solid ${bdDyn}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Pression disponible
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: colDyn }}>{(pDyn / 100000).toFixed(2)}</span>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                  </div>
                  <div style={{ fontSize: 9, marginTop: 2, fontWeight: 700, color: hintColDyn }}>{hintDyn}</div>
                </div>
                <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8,
                  background: bgStat, border: `1px solid ${bdStat}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Pression statique
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: colStat }}>{(pStat / 100000).toFixed(2)}</span>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                  </div>
                  <div style={{ fontSize: 9, marginTop: 2, fontWeight: 700,
                    color: overStat ? '#dc2626' : '#16a34a' }}>
                    {overStat ? '> 4 bar — réducteur de pression requis' : '≤ 4 bar'}
                  </div>
                </div>
              </div>
            </>
          )
        })()}

        {isBouclage && pdcCumResults != null && (() => {
          const retDps = inSegs.map(s => pdcCumResults.segCumDp.get(s.id)).filter((v): v is number => v != null)
          if (retDps.length === 0) return null
          const maxDp = Math.max(...retDps)
          const u = pdcParams?.uniteAffichage ?? 'Pa'
          const fmt = (pa: number) => u === 'mmCE' ? `${(pa / 9.81).toFixed(0)} mmCE`
            : u === 'both' ? `${Math.round(pa)} Pa / ${(pa / 9.81).toFixed(0)} mmCE`
            : `${Math.round(pa)} Pa`
          return (
            <>
              <hr className="rp-divider" />
              <div style={{ padding: '9px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <div style={{ fontSize: 8.5, color: '#64748b', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 4 }}>
                  ΔP retour (circuit le plus défavorisé)
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', fontFamily: 'ui-monospace, monospace' }}>
                  {fmt(maxDp)}
                </div>
              </div>
            </>
          )
        })()}

        {coteJsx}

        {pt.modeProduction === 'instantane' && (() => {
          const directAllerSegs = allSegs.filter(s =>
            s.type === 'aller' && flowDirections?.get(s.id)?.fromId === pt.id
          )
          const Qs_m3h = directAllerSegs.reduce((sum, s) => {
            const ar = alimentationResults?.get(s.id)
            return sum + (ar?.flowRateForPdc ?? 0) * 3.6
          }, 0)

          const T_ECS_val    = tEffective
          const T_EF_val     = pt.T_ef ?? 10
          const dT_prim      = pt.delta_t_primaire ?? 10
          const P_pointe_kW = Qs_m3h > 0 ? Qs_m3h * 1.163 * (T_ECS_val - T_EF_val) : null

          let P_pertes_b_kW: number | null = null
          if (thermalResults?.segResults?.size > 0) {
            let totalW = 0
            for (const [, d] of thermalResults.segResults) totalW += d.Q ?? 0
            if (totalW > 0) P_pertes_b_kW = totalW / 1000
          }

          const P_ech_kW   = P_pointe_kW != null ? P_pointe_kW + (P_pertes_b_kW ?? 0) : null
          const q_primaire   = P_ech_kW != null && dT_prim > 0
            ? (1000 * P_ech_kW) / (1.16 * dT_prim)
            : null

          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Dimensionnement — Production instantanée</SectionLabel>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto',
                columnGap: 8, rowGap: 5, alignItems: 'center', marginBottom: 8 }}>
                {[
                  { label: 'T° eau froide', val: pt.T_ef,             key: 'T_ef',             min: 0, step: 0.5, ph: '10 (par défaut)', unit: '°C' },
                  { label: 'ΔT primaire',   val: pt.delta_t_primaire, key: 'delta_t_primaire', min: 1, step: 1,   ph: '10 (par défaut)', unit: '°C' },
                ].flatMap(f => [
                  <span key={f.key + '-l'} style={{ fontSize: 11, color: '#374151', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.label}
                  </span>,
                  <NumInput key={f.key + '-i'} min={f.min} step={f.step} value={f.val ?? null}
                    placeholder={f.ph} allowEmpty
                    style={{ width: 82, minWidth: 82, textAlign: 'right', padding: '3px 6px',
                      border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }}
                    onChange={v => set(f.key, v)} />,
                  <span key={f.key + '-u'} style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>
                    {f.unit}
                  </span>,
                ])}
              </div>


              {Qs_m3h === 0 ? (
                <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic',
                  marginTop: 6, lineHeight: 1.5 }}>
                  Dessinez le réseau de distribution ECS pour calculer le dimensionnement.
                </div>
              ) : (
                <>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0',
                    borderRadius: 7, padding: '10px 12px', marginTop: 6 }}>

                    {/* Demande de pointe */}
                    <div style={{ display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', paddingBottom: 8, marginBottom: 8,
                      borderBottom: '1px solid #e5e7eb' }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>
                          Puissance de pointe ECS
                        </div>
                        <div style={{ fontSize: 9, color: '#b0b8c4', lineHeight: 1.4 }}>
                          {Qs_m3h.toFixed(3)} m³/h × 1,163 × ({T_ECS_val}−{T_EF_val}) °C
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                          fontFamily: 'ui-monospace, monospace' }}>
                          {P_pointe_kW!.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                      </div>
                    </div>

                    {/* Pertes réseau (si disponibles) */}
                    {P_pertes_b_kW != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', paddingBottom: 8, marginBottom: 8,
                        borderBottom: '1px solid #e5e7eb' }}>
                        <span style={{ fontSize: 10.5, color: '#6b7280' }}>
                          Pertes réseau de bouclage
                        </span>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>
                            {P_pertes_b_kW.toFixed(1)}
                          </span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                        </div>
                      </div>
                    )}

                    {/* Puissance totale échangeur */}
                    {P_ech_kW != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline',
                        paddingBottom: 10, marginBottom: 10,
                        borderBottom: '2px solid #e2e8f0' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>
                          Puissance nominale échangeur
                        </span>
                        <div style={{ flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a',
                            fontFamily: 'ui-monospace, monospace' }}>
                            {P_ech_kW.toFixed(1)}
                          </span>
                          <span style={{ fontSize: 11, color: '#64748b',
                            fontWeight: 600, marginLeft: 3 }}>kW</span>
                        </div>
                      </div>
                    )}

                    {/* Débit primaire */}
                    {q_primaire != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>
                            Débit primaire
                          </div>
                          <div style={{ fontSize: 9, color: '#b0b8c4' }}>
                            côté production — ΔT = {dT_prim} K
                            {pt.delta_t_primaire == null && <span style={{ fontStyle: 'italic' }}> (défaut)</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>
                            {Math.round(q_primaire).toLocaleString('fr-FR')}
                          </span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>L/h</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {P_pertes_b_kW == null && (
                    <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic',
                      marginTop: 5, lineHeight: 1.5 }}>
                      + Dessinez le réseau de bouclage ECS pour inclure les pertes thermiques.
                    </div>
                  )}
                </>
              )}
            </>
          )
        })()}

        {pt.modeProduction === 'echangeur-ballons-perm' && (() => {
          const Ns        = pt.ns_logements_standards ?? null
          const V         = pt.v_stockage_ecs ?? null
          const T_EF_val  = pt.T_ef ?? 10
          const dT_prim   = pt.delta_t_primaire ?? 10
          const T_ECS_val = tEffective

          const q_retour_Lh = inSegs
            .filter(s => s.type === 'retour')
            .reduce((sum, s) => sum + (s.flowRate ?? 0), 0) * 1000

          let hasBouclage = false
          if (thermalResults?.segResults?.size > 0) {
            let totalW = 0
            for (const [, d] of thermalResults.segResults) totalW += d.Q ?? 0
            hasBouclage = totalW > 0 && q_retour_Lh > 0
          }

          let P_sb: number | null = null
          let P_supp_b:   number | null = null
          let P_ech:  number | null = null
          let q_charge: number | null = null
          let q_primaire: number | null = null

          if (Ns != null && Ns > 0 && V != null && V > 0) {
            P_sb = Ns * 14 * Math.pow(V, -0.365)
            if (hasBouclage) P_supp_b = 0.70 * Math.sqrt(q_retour_Lh)
            P_ech = P_sb + (P_supp_b ?? 0)
            const dT_ecs = T_ECS_val - T_EF_val
            if (dT_ecs > 0) q_charge = (1000 * P_ech) / (1.16 * dT_ecs)
            if (dT_prim > 0) q_primaire = (1000 * P_ech) / (1.16 * dT_prim)
          }

          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Dimensionnement — Échangeur à plaques + stockage ECS</SectionLabel>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto',
                columnGap: 8, rowGap: 5, alignItems: 'center', marginBottom: 8 }}>
                {[
                  { label: 'Log. standards (Ns)', val: pt.ns_logements_standards, key: 'ns_logements_standards', min: 0,   step: 1,   ph: '',                unit: ''   },
                  { label: 'Volume stockage ECS', val: pt.v_stockage_ecs,         key: 'v_stockage_ecs',         min: 100, step: 50,  ph: '',                unit: 'L'  },
                  { label: 'T° eau froide',       val: pt.T_ef,                   key: 'T_ef',                   min: 0,   step: 0.5, ph: '10 (par défaut)',  unit: '°C' },
                  { label: 'ΔT primaire',         val: pt.delta_t_primaire,       key: 'delta_t_primaire',       min: 1,   step: 1,   ph: '20 (par défaut)',  unit: '°C' },
                ].flatMap(f => [
                  <span key={f.key + '-l'} style={{ fontSize: 11, color: '#374151', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.label}
                  </span>,
                  <NumInput key={f.key + '-i'} min={f.min} step={f.step} value={f.val ?? null}
                    placeholder={f.ph} allowEmpty
                    style={{ width: 82, minWidth: 82, textAlign: 'right', padding: '3px 6px',
                      border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }}
                    onChange={v => set(f.key, v)} />,
                  <span key={f.key + '-u'} style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>
                    {f.unit}
                  </span>,
                ])}
              </div>


              {Ns != null && Ns > 0 && Ns < 10 && (
                <div style={{ fontSize: 9, color: '#f97316', fontStyle: 'italic', marginBottom: 4, lineHeight: 1.4 }}>
                  ⚠ Méthode valable à partir de 10 logements standards.
                </div>
              )}

              {P_sb == null ? (
                <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
                  Renseignez le nombre de logements standards et le volume de stockage.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginTop: 8, marginBottom: 4 }}>Résultats</div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7,
                    padding: '10px 12px' }}>

                    {/* Puissance de production — seulement si modifiée ensuite */}
                    {hasBouclage && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid #e5e7eb' }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>P ECS sans bouclage</div>
                          <div style={{ fontSize: 9, color: '#b0b8c4' }}>{Ns} × 14 × {V}^(−0,365)</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>{P_sb.toFixed(1)}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                        </div>
                      </div>
                    )}

                    {/* Supplément bouclage */}
                    {hasBouclage && P_supp_b != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid #e5e7eb' }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>Supplément bouclage</div>
                          <div style={{ fontSize: 9, color: '#b0b8c4' }}>0,70 × √{q_retour_Lh.toFixed(0)} L/h</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>+{P_supp_b.toFixed(1)}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                        </div>
                      </div>
                    )}

                    {/* Puissance totale */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      paddingBottom: q_charge != null ? 10 : 0,
                      marginBottom: q_charge != null ? 10 : 0,
                      borderBottom: q_charge != null ? '2px solid #e2e8f0' : 'none' }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>Puissance nominale échangeur</span>
                        {!hasBouclage && (
                          <div style={{ fontSize: 9, color: '#b0b8c4', marginTop: 2 }}>
                            {Ns} × 14 × {V}^(−0,365)
                          </div>
                        )}
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a',
                          fontFamily: 'ui-monospace, monospace' }}>{P_ech!.toFixed(1)}</span>
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginLeft: 3 }}>kW</span>
                      </div>
                    </div>

                    {/* Débits */}
                    {q_charge != null && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>Débit de charge</div>
                            <div style={{ fontSize: 9, color: '#b0b8c4' }}>
                              côté ECS — ΔT = {(T_ECS_val - T_EF_val).toFixed(0)} K
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                              fontFamily: 'ui-monospace, monospace' }}>
                              {Math.round(q_charge).toLocaleString('fr-FR')}
                            </span>
                            <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>L/h</span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>Débit primaire</div>
                            <div style={{ fontSize: 9, color: '#b0b8c4' }}>
                              côté production — ΔT = {dT_prim} K
                              {pt.delta_t_primaire == null && <span style={{ fontStyle: 'italic' }}> (défaut)</span>}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                              fontFamily: 'ui-monospace, monospace' }}>
                              {Math.round(q_primaire!).toLocaleString('fr-FR')}
                            </span>
                            <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>L/h</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {!hasBouclage && (
                    <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', marginTop: 5, lineHeight: 1.5 }}>
                      + Dessinez le réseau de bouclage ECS pour inclure le supplément de puissance.
                    </div>
                  )}
                </>
              )}
            </>
          )
        })()}

        {pt.modeProduction === 'ballon-echangeur' && (() => {
          const Ns       = pt.ns_logements_standards ?? null
          const V        = pt.v_stockage_ecs ?? null
          const T_EF_val = pt.T_ef ?? 10
          const dT_prim  = pt.delta_t_primaire ?? 10
          const typeEch  = pt.typeEchangeur ?? 'serpentin'
          const posRet   = pt.positionRetourBouclage ?? null
          const h_pct    = pt.position_haut_echangeur ?? null

          let P_bouclage_kW: number | null = null
          if (thermalResults?.segResults?.size > 0) {
            let totalW = 0
            for (const [, d] of thermalResults.segResults) totalW += d.Q ?? 0
            if (totalW > 0) P_bouclage_kW = totalW / 1000
          }

          let F_corr: number | null = null
          if (typeEch === 'tubulaire' && h_pct != null) {
            F_corr = 0.97 * (h_pct / 100) + 0.76
          }

          let P_sb:      number | null = null
          let P_sb_corr: number | null = null
          let P_supp_b:  number | null = null
          let P_ech:     number | null = null
          let q_primaire: number | null = null

          if (Ns != null && Ns > 0 && V != null && V > 0) {
            P_sb = Ns * 40 * Math.pow(V, -0.48)
            P_sb_corr = F_corr != null ? F_corr * P_sb : P_sb
            if (P_bouclage_kW != null && posRet != null) {
              const mult = posRet === 'au-dessus' ? 5 : 3
              P_supp_b = mult * P_bouclage_kW
            }
            P_ech = P_sb_corr + (P_supp_b ?? 0)
            if (dT_prim > 0) q_primaire = (1000 * P_ech) / (1.16 * dT_prim)
          }

          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Dimensionnement — Ballon ECS à échangeur</SectionLabel>

              {/* Choix type échangeur */}
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 5 }}>Type d'échangeur</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['serpentin', 'tubulaire'] as const).map(t => (
                    <button key={t}
                      onClick={() => set('typeEchangeur', t)}
                      style={{
                        flex: 1, fontSize: 11, padding: '4px 0',
                        border: `1px solid ${typeEch === t ? '#64748b' : '#e5e7eb'}`,
                        borderRadius: 5,
                        background: typeEch === t ? '#f1f5f9' : '#fff',
                        color: typeEch === t ? '#1e293b' : '#6b7280',
                        fontWeight: typeEch === t ? 700 : 400,
                        cursor: 'pointer',
                      }}>
                      {t === 'serpentin' ? 'Serpentin' : 'Tubulaire'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grille d'entrées */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto',
                columnGap: 8, rowGap: 5, alignItems: 'center', marginBottom: 8 }}>
                {[
                  { label: 'Log. standards (Ns)', val: pt.ns_logements_standards,    key: 'ns_logements_standards',    min: 0,  max: undefined, step: 1,   ph: '',               unit: ''   },
                  { label: 'Volume stockage ECS', val: pt.v_stockage_ecs,            key: 'v_stockage_ecs',            min: 100,max: undefined, step: 50,  ph: '',               unit: 'L'  },
                  { label: 'T° eau froide',        val: pt.T_ef,                      key: 'T_ef',                      min: 0,  max: undefined, step: 0.5, ph: '10 (par défaut)', unit: '°C' },
                  { label: 'ΔT primaire',          val: pt.delta_t_primaire,          key: 'delta_t_primaire',          min: 1,  max: undefined, step: 1,   ph: '10 (par défaut)', unit: '°C' },
                  ...(typeEch === 'tubulaire' ? [{
                    label: 'Pos. haut échangeur', val: pt.position_haut_echangeur, key: 'position_haut_echangeur', min: 15, max: 45, step: 1, ph: 'vide si pos. référence', unit: '%',
                  }] : []),
                ].flatMap(f => [
                  <span key={f.key + '-l'} style={{ fontSize: 11, color: '#374151', fontWeight: 500,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.label}
                  </span>,
                  <NumInput key={f.key + '-i'} min={f.min} max={f.max} step={f.step} value={f.val ?? null}
                    placeholder={f.ph} allowEmpty
                    style={{ width: 75, minWidth: 75, textAlign: 'right', padding: '3px 6px',
                      border: '1px solid #d1d5db', borderRadius: 4, fontSize: 12 }}
                    onChange={v => set(f.key, v)} />,
                  <span key={f.key + '-u'} style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>
                    {f.unit}
                  </span>,
                ])}
              </div>



              {/* Position retour bouclage */}
              {P_bouclage_kW != null && (
                <div style={{ marginBottom: 8 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginBottom: 5 }}>Position retour bouclage</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      { val: 'serpentin', label: 'Au niveau du serpentin', mult: 3 },
                      { val: 'au-dessus', label: 'Au-dessus de l\'échangeur', mult: 5 },
                    ].map(opt => (
                      <label key={opt.val} style={{ display: 'flex', alignItems: 'center', gap: 6,
                        cursor: 'pointer', fontSize: 11, color: '#374151' }}>
                        <input type="radio"
                          name={`posRet-${pt.id}`}
                          checked={posRet === opt.val}
                          onChange={() => set('positionRetourBouclage', opt.val)}
                        />
                        {opt.label}
                        <span style={{ fontSize: 10, color: '#9ca3af' }}>(×{opt.mult})</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {Ns != null && Ns > 0 && Ns < 10 && (
                <div style={{ fontSize: 9, color: '#f97316', fontStyle: 'italic', marginBottom: 4, lineHeight: 1.4 }}>
                  ⚠ Méthode valable à partir de 10 logements standards.
                </div>
              )}

              {P_sb == null ? (
                <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
                  Renseignez le nombre de logements standards et le volume du ballon.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginTop: 8, marginBottom: 4 }}>Résultats</div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7,
                    padding: '10px 12px' }}>

                    {/* Puissance de base — seulement si modifiée ensuite */}
                    {(F_corr != null || P_supp_b != null) && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid #e5e7eb' }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>P ECS sans bouclage</div>
                          <div style={{ fontSize: 9, color: '#b0b8c4' }}>{Ns} × 40 × {V}^(−0,48)</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>{P_sb.toFixed(1)}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                        </div>
                      </div>
                    )}

                    {/* Facteur correctif tubulaire F_corr */}
                    {F_corr != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid #e5e7eb' }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>Facteur correctif (tubulaire)</div>
                          <div style={{ fontSize: 9, color: '#b0b8c4' }}>
                            F = 0,97 × {(h_pct! / 100).toFixed(2)} + 0,76
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>× {F_corr.toFixed(3)}</span>
                        </div>
                      </div>
                    )}

                    {/* P ECS corrigée (tubulaire) */}
                    {F_corr != null && P_sb_corr != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 10.5, color: '#6b7280' }}>P ECS corrigée</div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>{P_sb_corr.toFixed(1)}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                        </div>
                      </div>
                    )}

                    {/* Supplément bouclage */}
                    {P_supp_b != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid #e5e7eb' }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>Supplément bouclage</div>
                          <div style={{ fontSize: 9, color: '#b0b8c4' }}>
                            {posRet === 'au-dessus' ? '5' : '3'} × {P_bouclage_kW!.toFixed(2)} kW
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>+{P_supp_b.toFixed(1)}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                        </div>
                      </div>
                    )}

                    {/* Puissance échangeur total */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      paddingBottom: q_primaire != null ? 10 : 0,
                      marginBottom: q_primaire != null ? 10 : 0,
                      borderBottom: q_primaire != null ? '2px solid #e2e8f0' : 'none' }}>
                      <div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>Puissance nominale échangeur</span>
                        <div style={{ fontSize: 9, color: '#b0b8c4', marginTop: 2 }}>
                          {F_corr == null && P_supp_b == null
                            ? `${Ns} × 40 × ${V}^(−0,48)`
                            : 'régime 10/45°C'}
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a',
                          fontFamily: 'ui-monospace, monospace' }}>{P_ech!.toFixed(1)}</span>
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginLeft: 3 }}>kW</span>
                      </div>
                    </div>

                    {/* Débit primaire */}
                    {q_primaire != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>Débit primaire</div>
                          <div style={{ fontSize: 9, color: '#b0b8c4' }}>
                            côté production — ΔT = {dT_prim} K
                            {pt.delta_t_primaire == null && <span style={{ fontStyle: 'italic' }}> (défaut)</span>}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>
                            {Math.round(q_primaire).toLocaleString('fr-FR')}
                          </span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>L/h</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {P_bouclage_kW != null && posRet == null && (
                    <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', marginTop: 5, lineHeight: 1.5 }}>
                      + Choisissez la position du retour bouclage pour inclure le supplément.
                    </div>
                  )}
                  {P_bouclage_kW == null && (
                    <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', marginTop: 5, lineHeight: 1.5 }}>
                      + Dessinez le réseau de bouclage ECS pour inclure le supplément de puissance.
                    </div>
                  )}
                </>
              )}
            </>
          )
        })()}

        {pt.modeProduction === 'ballons-electriques' && (() => {
          const parc = (pt.typeParc ?? 'social') as 'social' | 'prive'
          const tr   = pt.temps_reconstitution ?? 8

          const VOLUMES = {
            social: { log_T1: 90, log_T2: 105, log_T3: 150, log_T4: 210, log_T5: 270, log_T6p: 285 },
            prive:  { log_T1: 90, log_T2: 105, log_T3: 135, log_T4: 165, log_T5: 195, log_T6p: 210 },
          }
          const vTable = VOLUMES[parc]

          const logTypes = [
            { key: 'log_T1',  label: 'T1'  },
            { key: 'log_T2',  label: 'T2'  },
            { key: 'log_T3',  label: 'T3'  },
            { key: 'log_T4',  label: 'T4'  },
            { key: 'log_T5',  label: 'T5'  },
            { key: 'log_T6p', label: 'T6+' },
          ]

          const counts: Record<string, number> = {
            log_T1:  pt.log_T1  ?? 0,
            log_T2:  pt.log_T2  ?? 0,
            log_T3:  pt.log_T3  ?? 0,
            log_T4:  pt.log_T4  ?? 0,
            log_T5:  pt.log_T5  ?? 0,
            log_T6p: pt.log_T6p ?? 0,
          }

          let V_ECS = 0
          for (const { key } of logTypes) V_ECS += counts[key] * vTable[key as keyof typeof vTable]
          const totalLogs = Object.values(counts).reduce((s, v) => s + v, 0)
          const P_ECS = V_ECS > 0 && tr > 0 ? (1.16 * V_ECS * 50) / (1000 * tr) : null

          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Dimensionnement — Ballons électriques collectifs</SectionLabel>

              {/* Toggle parc */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 5 }}>Type de parc</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {(['social', 'prive'] as const).map(p => (
                    <button key={p}
                      onClick={() => set('typeParc', p)}
                      style={{
                        flex: 1, fontSize: 11, padding: '4px 0',
                        border: `1px solid ${parc === p ? '#64748b' : '#e5e7eb'}`,
                        borderRadius: 5,
                        background: parc === p ? '#f1f5f9' : '#fff',
                        color: parc === p ? '#1e293b' : '#6b7280',
                        fontWeight: parc === p ? 700 : 400,
                        cursor: 'pointer',
                      }}>
                      {p === 'social' ? 'Social' : 'Privé'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Composition du parc */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 4 }}>Composition du parc</div>

                {logTypes.map(({ key, label }) => {
                  const cnt   = counts[key]
                  const vUnit = vTable[key as keyof typeof vTable]
                  const active = cnt > 0
                  return (
                    <div key={key} style={{ display: 'flex', alignItems: 'center',
                      padding: '5px 2px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ fontSize: 12, fontWeight: 600, width: 28, flexShrink: 0,
                        color: active ? '#0369a1' : '#374151' }}>{label}</span>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', gap: 6 }}>
                        <button
                          onClick={() => set(key, Math.max(0, cnt - 1))}
                          style={{ width: 22, height: 22, border: '1px solid #d1d5db', borderRadius: 4,
                            background: '#fff', cursor: cnt > 0 ? 'pointer' : 'default', fontSize: 14, lineHeight: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            opacity: cnt > 0 ? 1 : 0.3, flexShrink: 0 }}>−</button>
                        <span style={{ fontSize: 13, fontWeight: active ? 700 : 400,
                          color: active ? '#0369a1' : '#9ca3af',
                          width: 24, textAlign: 'center' }}>{cnt}</span>
                        <button
                          onClick={() => set(key, cnt + 1)}
                          style={{ width: 22, height: 22, border: '1px solid #d1d5db', borderRadius: 4,
                            background: '#fff', cursor: 'pointer', fontSize: 14, lineHeight: 1,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0 }}>+</button>
                      </div>
                      <span style={{ fontSize: 10, width: 36, textAlign: 'right', flexShrink: 0,
                        color: active ? '#0369a1' : '#9ca3af', fontWeight: active ? 600 : 400 }}>
                        {vUnit} L
                      </span>
                    </div>
                  )
                })}
              </div>

              {/* Temps de reconstitution */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 5 }}>Temps de reconstitution</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {[6, 7, 8].map(h => (
                    <button key={h}
                      onClick={() => set('temps_reconstitution', h)}
                      style={{
                        flex: 1, fontSize: 11, padding: '4px 0',
                        border: `1px solid ${tr === h ? '#64748b' : '#e5e7eb'}`,
                        borderRadius: 5,
                        background: tr === h ? '#f1f5f9' : '#fff',
                        color: tr === h ? '#1e293b' : '#6b7280',
                        fontWeight: tr === h ? 700 : 400,
                        cursor: 'pointer',
                      }}>
                      {h} h
                    </button>
                  ))}
                </div>
              </div>

              {/* Résultats */}
              {totalLogs > 0 ? (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginTop: 8, marginBottom: 4 }}>Résultats</div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7,
                    padding: '10px 12px' }}>

                    {/* Volume de stockage */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>Volume ECS journalier (V_ECS)</div>
                        <div style={{ fontSize: 9, color: '#b0b8c4' }}>besoins journaliers maximaux à 60°C</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                          fontFamily: 'ui-monospace, monospace' }}>
                          {V_ECS.toLocaleString('fr-FR')}
                        </span>
                        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>L</span>
                      </div>
                    </div>

                    {/* Puissance résistances */}
                    {P_ECS != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                        <div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>Puissance résistances électriques</span>
                          <div style={{ fontSize: 9, color: '#b0b8c4', marginTop: 2 }}>
                            1,16 × {V_ECS.toLocaleString('fr-FR')} × 50 / (1 000 × {tr})
                          </div>
                        </div>
                        <div style={{ flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a',
                            fontFamily: 'ui-monospace, monospace' }}>{P_ECS.toFixed(1)}</span>
                          <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginLeft: 3 }}>kW</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', marginTop: 5, lineHeight: 1.5 }}>
                    Le maintien en température du bouclage est assuré par un réchauffeur de boucle spécifique.
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
                  Renseignez la composition du parc pour calculer le dimensionnement.
                </div>
              )}
            </>
          )
        })()}

        {pt.modeProduction === 'pac-collective' && (() => {
          const pacType = (pt.pac_type ?? 'co2') as 'co2' | 'stratification' | 'echangeur-externe' | 'ballon-echangeur'
          const Ns = pt.ns_logements_standards ?? null
          const V  = pt.v_stockage_ecs ?? null
          const isStrat    = pacType === 'stratification'
          const avecAppoint = isStrat ? true : !!(pt.pac_avec_appoint)

          let a: number | null = null
          let b: number | null = null
          if (Ns != null && Ns >= 1) {
            if (pacType === 'co2' || pacType === 'stratification') {
              a = 14 * Ns + 495
              b = -0.77 + 0.076 * Math.log(Ns)
            } else if (pacType === 'echangeur-externe') {
              a = -32 * Ns + 5856
              b = -1.28 + 0.2 * Math.log(Ns)
            } else {
              a = -425 * Ns + 97466
              b = -1.68 + 0.213 * Math.log(Ns)
            }
          }

          const P_ECS     = a != null && b != null && V != null && V > 0
            ? a * Math.pow(V, b) : null
          const P_PAC_nom     = pt.pac_p_nominale ?? null
          const P_PAC_Tb  = pt.pac_p_t_base  ?? null

          let cond_PAC: boolean | null = null
          let P_appoint:  number | null = null

          if (P_ECS != null && P_ECS > 0) {
            if (!avecAppoint) {
              cond_PAC = P_PAC_Tb != null ? P_PAC_Tb >= P_ECS : null
            } else {
              cond_PAC = P_PAC_nom != null ? P_PAC_nom >= 0.70 * P_ECS : null
              if (P_PAC_nom != null && P_PAC_Tb != null && P_PAC_nom > 0) {
                const ac = P_PAC_nom / P_ECS
                const bc = P_PAC_Tb / P_PAC_nom
                P_appoint = P_ECS * (1.20 - ac * bc)
              }
            }
          }

          const vLabel = pacType === 'ballon-echangeur' ? 'Volume stockage ECS' : 'Volume stockage ECS'

          const PAC_TYPES = [
            { val: 'co2',               label: 'PAC au CO₂',              sub: 'T sortie 65°C' },
            { val: 'stratification',    label: 'Stratification dynamique', sub: 'T sortie ≥60°C · appoint obligatoire' },
            { val: 'echangeur-externe', label: 'Échangeur externe',        sub: 'ΔT 5–7 K' },
            { val: 'ballon-echangeur',  label: 'Ballon à échangeur',       sub: 'ΔT 5–7 K' },
          ]

          const inputRow = (label: string, val: number | null | undefined, key: string, min: number, step: number, unit: string) => [
            <span key={key + '-l'} style={{ fontSize: 10.5, color: '#374151', fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
            </span>,
            <NumInput key={key + '-i'} min={min} step={step} value={val ?? null}
              placeholder="" allowEmpty
              style={{ width: 65, minWidth: 65, textAlign: 'right', padding: '3px 5px',
                border: '1px solid #d1d5db', borderRadius: 4, fontSize: 11 }}
              onChange={v => set(key, v)} />,
            <span key={key + '-u'} style={{ fontSize: 11, color: '#9ca3af', fontWeight: 400 }}>
              {unit}
            </span>,
          ]

          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Dimensionnement — Pompe à chaleur dédiée ECS</SectionLabel>

              {/* Sélection sous-type PAC */}
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 5 }}>Mode de production PAC</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {PAC_TYPES.map(t => (
                    <button key={t.val}
                      onClick={() => set('pac_type', t.val)}
                      style={{
                        width: '100%', textAlign: 'left', fontSize: 11, padding: '6px 8px',
                        border: `1px solid ${pacType === t.val ? '#64748b' : '#e5e7eb'}`,
                        borderRadius: 5,
                        background: pacType === t.val ? '#f1f5f9' : '#fff',
                        color: pacType === t.val ? '#1e293b' : '#6b7280',
                        fontWeight: pacType === t.val ? 700 : 400,
                        cursor: 'pointer',
                      }}>
                      {t.label}
                      <span style={{ fontSize: 9, fontWeight: 400,
                        color: pacType === t.val ? '#64748b' : '#9ca3af', marginLeft: 6 }}>
                        — {t.sub}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Données communes */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto',
                columnGap: 8, rowGap: 5, alignItems: 'center', marginBottom: 8 }}>
                {[
                  ...inputRow('Log. standards (Ns)', pt.ns_logements_standards, 'ns_logements_standards', 0, 1, ''),
                  ...inputRow(vLabel, pt.v_stockage_ecs, 'v_stockage_ecs', 100, 50, 'L'),
                ]}
              </div>

              {Ns != null && Ns > 0 && Ns < 10 && (
                <div style={{ fontSize: 9, color: '#f97316', fontStyle: 'italic', marginBottom: 6, lineHeight: 1.4 }}>
                  ⚠ Méthode valable à partir de 10 logements standards.
                </div>
              )}

              {/* Toggle appoint */}
              {isStrat ? (
                <div style={{ fontSize: 9.5, color: '#475569', background: '#f1f5f9',
                  border: '1px solid #cbd5e1', borderRadius: 4, padding: '5px 8px', marginBottom: 8 }}>
                  Appoint électrique obligatoire (P_nominale ≥ 70 % × P_ECS)
                </div>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5,
                  cursor: 'pointer', padding: '3px 0', marginBottom: 8 }}>
                  <input type="checkbox"
                    checked={!!pt.pac_avec_appoint}
                    onChange={e => set('pac_avec_appoint', e.target.checked)}
                  />
                  <span style={{ color: '#111827' }}>Avec appoint électrique</span>
                </label>
              )}

              {/* Données appoint / vérification */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto',
                columnGap: 8, rowGap: 5, alignItems: 'center', marginBottom: 8 }}>
                {avecAppoint && inputRow('P nominale PAC', pt.pac_p_nominale, 'pac_p_nominale', 0, 0.5, 'kW')}
                {inputRow('P PAC (T ext. base)', pt.pac_p_t_base, 'pac_p_t_base', 0, 0.5, 'kW')}
              </div>

              {/* Résultats */}
              {P_ECS == null ? (
                <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
                  Renseignez le nombre de logements standards et le volume de stockage.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginTop: 8, marginBottom: 4 }}>Résultats</div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7, padding: '10px 12px' }}>

                    {/* P_ECS */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #e5e7eb' }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>P ECS nécessaire</div>
                        <div style={{ fontSize: 9, color: '#b0b8c4' }}>
                          {a?.toFixed(0)} × {V}^({b?.toFixed(3)})
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a',
                          fontFamily: 'ui-monospace, monospace' }}>{P_ECS.toFixed(1)}</span>
                        <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginLeft: 3 }}>kW</span>
                      </div>
                    </div>

                    {/* Sans appoint — condition P_PAC ≥ P_ECS */}
                    {!avecAppoint && (
                      <div>
                        <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>
                          Condition : P_PAC(T_base) ≥ P_ECS
                        </div>
                        {P_PAC_Tb != null ? (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', color: '#374151' }}>
                              {P_PAC_Tb.toFixed(1)} kW {cond_PAC ? '≥' : '<'} {P_ECS.toFixed(1)} kW
                            </span>
                            <span style={{ fontSize: 11, fontWeight: 700,
                              color: cond_PAC ? '#16a34a' : '#dc2626' }}>
                              {cond_PAC ? '✓ OK' : '✗ insuffisant'}
                            </span>
                          </div>
                        ) : (
                          <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic' }}>
                            Renseignez P PAC (T ext. base) pour vérifier la condition.
                          </div>
                        )}
                      </div>
                    )}

                    {/* Avec appoint */}
                    {avecAppoint && (<>
                      {/* Condition P_nominale ≥ 70% P_ECS */}
                      {P_PAC_nom != null ? (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                          paddingBottom: 7, marginBottom: 7, borderBottom: P_appoint != null ? '1px solid #e5e7eb' : 'none' }}>
                          <div>
                            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 2 }}>P_nominale ≥ 70 % × P_ECS</div>
                            <div style={{ fontSize: 9, color: '#b0b8c4' }}>
                              {P_PAC_nom.toFixed(1)} kW vs {(0.70 * P_ECS).toFixed(1)} kW min
                            </div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, flexShrink: 0, marginLeft: 8,
                            color: cond_PAC ? '#16a34a' : '#dc2626' }}>
                            {cond_PAC ? '✓ OK' : '✗ insuffisant'}
                          </span>
                        </div>
                      ) : (
                        <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', marginBottom: 6 }}>
                          Renseignez P nominale PAC pour vérifier la condition.
                        </div>
                      )}

                      {/* P_appoint */}
                      {P_appoint != null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <div>
                            <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>P appoint requis</span>
                            {(() => {
                              const ac = P_PAC_nom! / P_ECS
                              const bc = P_PAC_Tb! / P_PAC_nom!
                              return (
                                <div style={{ fontSize: 9, color: '#b0b8c4', marginTop: 2 }}>
                                  {P_ECS.toFixed(1)} × (120% − {ac.toFixed(2)} × {bc.toFixed(2)})
                                </div>
                              )
                            })()}
                          </div>
                          <div style={{ flexShrink: 0, marginLeft: 8 }}>
                            <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a',
                              fontFamily: 'ui-monospace, monospace' }}>
                              {Math.max(0, P_appoint).toFixed(1)}
                            </span>
                            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginLeft: 3 }}>kW</span>
                          </div>
                        </div>
                      )}
                    </>)}
                  </div>

                  <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', marginTop: 5, lineHeight: 1.5 }}>
                    Le maintien en température du bouclage est assuré par un réchauffeur de boucle spécifique.
                  </div>
                </>
              )}
            </>
          )
        })()}

        {/* Bouton discret pour les dimensions */}
        <div style={{ marginTop: 10, borderTop: '1px solid #f3f4f6', paddingTop: 6 }}>
          <button
            onClick={() => setShowDims(v => !v)}
            style={{ fontSize: 10, color: '#9ca3af', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span>{showDims ? '▲' : '▼'}</span> Dimensions
          </button>
          {showDims && (
            <>
              <Field label="Largeur" unit="px">
                <NumInput min={30} step={1}
                  value={pt.size?.w ?? 44}
                  onChange={v => set('size', { ...(pt.size ?? { w: 44, h: 28 }), w: Math.max(30, v ?? 44) })} />
              </Field>
              <Field label="Hauteur" unit="px">
                <NumInput min={20} step={1}
                  value={pt.size?.h ?? 28}
                  onChange={v => set('size', { ...(pt.size ?? { w: 44, h: 28 }), h: Math.max(20, v ?? 28) })} />
              </Field>
            </>
          )}
        </div>
      </div>
    )
  }

  // ── Nœud de jonction ────────────────────────────────────────────
  const dT_depuis_depart = nodeTemp != null && T_depart != null ? nodeTemp - T_depart : null

  return (
    <div className="rp-section">
      <h3 className="rp-title">Nœud</h3>


      {coteJsx}

{nodeTemp != null && (
      <>
        {(() => {
          const tsN = tAvalStyle(nodeTemp, T_depart ?? 60)
          return (
            <div style={{ padding: '9px 10px', background: tsN.background ?? '#fffbeb',
              border: `1px solid ${tsN.borderColor ?? '#fde68a'}`, borderRadius: 6, marginTop: 8 }}>
              <div style={{ fontSize: 9, color: tsN.labelColor ?? '#a16207', fontWeight: 700, marginBottom: 3,
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Température au nœud
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: tsN.fontWeight ?? 700, color: tsN.color ?? '#111827' }}>
                  {sf(nodeTemp, 2)}
                </span>
                <span style={{ fontSize: 11, color: tsN.color ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>°C</span>
              </div>
            </div>
          )
        })()}
        {dT_depuis_depart != null && (
          <div style={{ marginTop: 3, textAlign: 'center', fontSize: 10, color: '#6b7280' }}>
            ΔT depuis départ :{' '}
            <span style={{ fontWeight: 700, color: '#374151' }}>{sf(dT_depuis_depart, 2)} K</span>
            <span style={{ color: '#9ca3af', marginLeft: 5 }}>
              ({sf(T_depart, 0)} → {sf(nodeTemp, 2)} °C)
            </span>
          </div>
        )}
      </>
    )}

      {/* Pression au nœud — alimentation ECS */}
      {isAlimECS && (() => {
        const segId = inSegs[0]?.id
        if (!segId) return null
        const p     = pdcCumAlimResults?.segPressionAval?.get(segId) ?? null
        const pStat = pdcCumAlimResults?.segPStatAval?.get(segId) ?? null
        if (p == null && pStat == null) return null

        const isErrP  = p != null && p < 30000
        const valColP = isErrP ? '#dc2626' : '#0f172a'
        const bgP     = isErrP ? '#fef2f2' : '#fff'
        const borderP = isErrP ? '#fca5a5' : '#e5e7eb'
        const hintP   = p == null ? null
          : p < 0     ? 'Pression négative — eau n\'atteint pas ce point'
          : isErrP    ? '< 0,3 bar — insuffisant (≈ 3 mCE réglementaire)'
          : '≥ 0,3 bar'
        const hintColP = isErrP ? '#dc2626' : '#16a34a'

        return (
          <>
            <hr className="rp-divider" />
            <SectionLabel>Pression au nœud</SectionLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {p != null && (
                <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: bgP,
                  border: `1px solid ${borderP}`, textAlign: 'center' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Pression disponible
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: valColP }}>
                      {(p / 100000).toFixed(2)}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                  </div>
                  {hintP && (
                    <div style={{ fontSize: 9, marginTop: 2, color: hintColP, fontWeight: 700 }}>{hintP}</div>
                  )}
                </div>
              )}
              {pStat != null && (
                <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8,
                  background: '#fff', border: '1px solid #e5e7eb', textAlign: 'center' }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                    Pression statique
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
                      {(pStat / 100000).toFixed(2)}
                    </span>
                    <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )
      })()}

      {/* Tronçons arrivants */}
      {inSegs.length > 0 && !isAlimECS && (
        <div style={{ marginTop: 8 }}>
          {inSegs.length > 1 && (
            <SectionLabel>Tronçons arrivants ({inSegs.length})</SectionLabel>
          )}
          {(() => {
            const pdcCumDps = inSegs.map(s => pdcCumResults?.segCumDp.get(s.id) ?? null)
            const maxCumDp  = calcSubMode === 'pdc' && inSegs.length > 1
              ? Math.max(...pdcCumDps.filter(v => v != null) as number[])
              : null
            const unite = pdcParams?.uniteAffichage ?? 'Pa'
            const fmtDp = (pa: number) => {
              if (unite === 'mmCE') return `${(pa / 9.81).toFixed(0)} mmCE`
              if (unite === 'both') return `${Math.round(pa)} Pa / ${(pa / 9.81).toFixed(0)} mmCE`
              return `${Math.round(pa)} Pa`
            }
            return inSegs.map((s, i) => {
              const segCumDp = pdcCumDps[i]
              const isWorst  = maxCumDp != null && segCumDp === maxCumDp
              return (
                <div key={s.id} style={{ padding: '8px 10px', background: '#f9fafb',
                  border: `1px solid ${isWorst ? '#cbd5e1' : '#e5e7eb'}`, borderRadius: 5, marginBottom: 5 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#111827',
                    marginBottom: 6, lineHeight: 1.4, wordBreak: 'break-word' }}>
                    {s.name}
                    <span style={{ marginLeft: 5, fontSize: 9, fontWeight: 700,
                      color: '#6b7280', background: '#e5e7eb',
                      borderRadius: 3, padding: '1px 4px' }}>
                      {s.type ?? '—'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 40px' }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>Débit</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                        {s.flowRate != null ? s.flowRate.toFixed(3) + ' m³/h' : '—'}
                      </div>
                    </div>
                    {!isChauffage && calcSubMode !== 'pdc' && (
                      <div>
                        <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>T arrivée</div>
                        <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                          {s.T_to != null ? s.T_to.toFixed(2) + ' °C' : '—'}
                        </div>
                      </div>
                    )}
                    {segCumDp != null && (
                      <div>
                        <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>ΔP / Prod.</div>
                        <div style={{ fontSize: 12, fontWeight: isWorst ? 700 : 600,
                          color: isWorst ? '#0f172a' : '#374151', fontFamily: 'ui-monospace, monospace' }}>
                          {fmtDp(segCumDp)}
                        </div>
                        {isWorst && (
                          <div style={{ fontSize: 8.5, color: '#9ca3af', fontStyle: 'italic', marginTop: 1 }}>
                            circuit le plus défavorisé
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {inSegs.length === 0 && nodeTemp == null && calcSubMode !== 'pdc' && !isAlimECS && (
        <p className="lp-hint">Aucune propriété modifiable.</p>
      )}
    </div>
  )
}
