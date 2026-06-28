import { useState } from 'react'
import { sf } from '../utils/fmt'
import { getNodeCote, getNodeDefaultCote } from '../utils/coteCalc'
import { NumInput } from './NumInput'
import { tAvalStyle, Field, SectionLabel, SegNameField, CoteSection, TempBadge, computeGroupePath, MAX_ANTENNE_LEN_M, MAX_ANTENNE_VOL_L } from './rpShared'

const DIR_BTNS = [
  { label: '←', rot: 180, title: 'Vers la gauche' },
  { label: '↑', rot: 270, title: 'Vers le haut' },
  { label: '→', rot: 0,   title: 'Vers la droite' },
  { label: '↓', rot: 90,  title: 'Vers le bas' },
]

export default function PointPanel({ pt, onUpdate, nodeTemp, inSegs = [], globalParams, activeCalcId, alimentationParams, alimentationResults, points = [], calcSubMode, onResultsViewChange = null, pdcCumResults, pdcParams, pdcCumAlimResults, levels = [], lineYs = [], pressionSourceAlimECS = null, pressionSourceAlimECSStatic = null, pressionSourceAlimEF = null, pressionSourceAlimEFStatic = null, groupDisplayNames = null, allSegs = [], flowDirections = null, materials = [], roleMap = null, columns = [], columnXs = [], thermalResults = null }) {
  const set = (key, val) => onUpdate(pt.id, 'point', { [key]: val })
  const T_depart = globalParams?.T_depart ?? null
  const [showDims, setShowDims] = useState(false)

  const coteDef = getNodeDefaultCote(pt, levels, lineYs)
  const coteJsx = (activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef') ? (
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
    const showTemp  = activeCalcId !== 'alimentation-ecs' && nodeTemp != null
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
    const enabledAppareils = (activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef' || activeCalcId === 'bouclage-ecs')
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

        {(activeCalcId === 'alimentation-ecs' || activeCalcId === 'bouclage-ecs') && alimentationParams?.buildingType === 'hopital' && (<>
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
              Seul l'appareil le plus demandeur (hors WC) est pris en compte, quantité 1.
            </p>
          )}
        </>)}

        {(activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef' || activeCalcId === 'bouclage-ecs') && (<>
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

        {(activeCalcId === 'alimentation-ecs' || activeCalcId === 'bouclage-ecs') && (() => {
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
        <TempBadge temp={activeCalcId === 'alimentation-ecs' ? null : nodeTemp} T_depart={T_depart} />

        {(activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef') && calcSubMode === 'pdc' && (() => {
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
    const showEFPressure = activeCalcId === 'alimentation-ef' && calcSubMode === 'pdc' && pressionSourceAlimEF != null
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
              borderRadius: 5, background: '#fff', color: pt.modeProduction ? '#111827' : '#9ca3af',
              cursor: 'pointer' }}
          >
            <option value="">— Choisir un mode —</option>
            <option value="instantane">Production instantanée par échangeur</option>
            <option value="echangeur-ballons-perm">Échangeur + ballons ECS</option>
            <option value="ballon-echangeur">Ballon à échangeur (serpentin / tubulaire)</option>
            <option value="ballons-electriques">Ballons électriques collectifs</option>
            <option value="pac-echangeur">PAC collective + échangeur externe</option>
            <option value="pac-ballon">PAC collective + ballon à échangeur</option>
          </select>
        </div>
        {!pt.modeProduction ? (
          <div style={{ fontSize: 9.5, color: '#9ca3af', fontStyle: 'italic', marginBottom: 8 }}>
            Choisissez un mode pour accéder au dimensionnement.
          </div>
        ) : pt.modeProduction !== 'instantane' && pt.modeProduction !== 'echangeur-ballons-perm' && (
          <div style={{ fontSize: 9.5, color: '#9ca3af', fontStyle: 'italic', padding: '3px 8px',
            background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 4, marginBottom: 8 }}>
            Dimensionnement disponible prochainement.
          </div>
        )}
        <hr className="rp-divider" />

        {activeCalcId === 'bouclage-ecs' && (
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

        {activeCalcId === 'alimentation-ecs' && calcSubMode === 'pdc' && pressionSourceAlimECS != null && (() => {
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

        {activeCalcId === 'bouclage-ecs' && pdcCumResults != null && (() => {
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
          const dT_prim      = pt.delta_t_primaire ?? 20
          const P_puisage_kW = Qs_m3h > 0 ? Qs_m3h * 1.163 * (T_ECS_val - T_EF_val) : null

          let P_pertes_kW: number | null = null
          if (thermalResults?.segResults?.size > 0) {
            let totalW = 0
            for (const [, d] of thermalResults.segResults) totalW += d.Q ?? 0
            if (totalW > 0) P_pertes_kW = totalW / 1000
          }

          const P_total_kW   = P_puisage_kW != null ? P_puisage_kW + (P_pertes_kW ?? 0) : null
          const q_primaire   = P_total_kW != null && dT_prim > 0
            ? (1000 * P_total_kW) / (1.16 * dT_prim)
            : null

          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Dimensionnement — Production instantanée</SectionLabel>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto',
                columnGap: 8, rowGap: 5, alignItems: 'center', marginBottom: 8 }}>
                {[
                  { label: 'T° eau froide', val: pt.T_ef,             key: 'T_ef',             min: 0, step: 0.5, ph: '10 (par défaut)', unit: '°C' },
                  { label: 'ΔT primaire',   val: pt.delta_t_primaire, key: 'delta_t_primaire', min: 1, step: 1,   ph: '20 (par défaut)', unit: '°C' },
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
                          Demande de pointe
                        </div>
                        <div style={{ fontSize: 9, color: '#b0b8c4', lineHeight: 1.4 }}>
                          {Qs_m3h.toFixed(3)} m³/h × 1,163 × ({T_ECS_val}−{T_EF_val}) °C
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                          fontFamily: 'ui-monospace, monospace' }}>
                          {P_puisage_kW!.toFixed(1)}
                        </span>
                        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                      </div>
                    </div>

                    {/* Pertes réseau (si disponibles) */}
                    {P_pertes_kW != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'center', paddingBottom: 8, marginBottom: 8,
                        borderBottom: '1px solid #e5e7eb' }}>
                        <span style={{ fontSize: 10.5, color: '#6b7280' }}>
                          Pertes thermiques réseau
                        </span>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>
                            {P_pertes_kW.toFixed(1)}
                          </span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                        </div>
                      </div>
                    )}

                    {/* Puissance totale échangeur */}
                    {P_total_kW != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between',
                        alignItems: 'baseline',
                        paddingBottom: 10, marginBottom: 10,
                        borderBottom: '2px solid #e2e8f0' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>
                          Puissance échangeur
                        </span>
                        <div style={{ flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a',
                            fontFamily: 'ui-monospace, monospace' }}>
                            {P_total_kW.toFixed(1)}
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
                            côté chaudière — ΔT = {dT_prim} K
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

                  {P_pertes_kW == null && (
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
          const dT_prim   = pt.delta_t_primaire ?? 20
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

          let P_sans_b: number | null = null
          let P_supp:   number | null = null
          let P_total:  number | null = null
          let q_charge: number | null = null
          let q_primaire: number | null = null

          if (Ns != null && Ns > 0 && V != null && V > 0) {
            P_sans_b = Ns * 14 * Math.pow(V, -0.365)
            if (hasBouclage) P_supp = 0.70 * Math.sqrt(q_retour_Lh)
            P_total = P_sans_b + (P_supp ?? 0)
            const dT_ecs = T_ECS_val - T_EF_val
            if (dT_ecs > 0) q_charge = (1000 * P_total) / (1.16 * dT_ecs)
            if (dT_prim > 0) q_primaire = (1000 * P_total) / (1.16 * dT_prim)
          }

          return (
            <>
              <hr className="rp-divider" />
              <SectionLabel>Dimensionnement — Échangeur + ballons ECS</SectionLabel>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto',
                columnGap: 8, rowGap: 5, alignItems: 'center', marginBottom: 8 }}>
                {[
                  { label: 'Log. standards (Ns)', val: pt.ns_logements_standards, key: 'ns_logements_standards', min: 0,   step: 1,   ph: '—',               unit: ''   },
                  { label: 'Volume stockage ECS', val: pt.v_stockage_ecs,         key: 'v_stockage_ecs',         min: 100, step: 50,  ph: '—',               unit: 'L'  },
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

              {P_sans_b == null ? (
                <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginTop: 4, lineHeight: 1.5 }}>
                  Renseignez le nombre de logements standards et le volume de stockage.
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                    letterSpacing: '0.06em', marginTop: 8, marginBottom: 4 }}>Résultats</div>
                  <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 7,
                    padding: '10px 12px' }}>

                    {/* Puissance de production */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                      paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid #e5e7eb' }}>
                      <div>
                        <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>Production</div>
                        <div style={{ fontSize: 9, color: '#b0b8c4' }}>{Ns} × 14 × {V}^(−0,365)</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                          fontFamily: 'ui-monospace, monospace' }}>{P_sans_b.toFixed(1)}</span>
                        <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                      </div>
                    </div>

                    {/* Supplément bouclage */}
                    {hasBouclage && P_supp != null && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
                        paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid #e5e7eb' }}>
                        <div>
                          <div style={{ fontSize: 10.5, color: '#6b7280', marginBottom: 2 }}>Supplément bouclage</div>
                          <div style={{ fontSize: 9, color: '#b0b8c4' }}>0,70 × √{q_retour_Lh.toFixed(0)} L/h</div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 8 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#374151',
                            fontFamily: 'ui-monospace, monospace' }}>+{P_supp.toFixed(1)}</span>
                          <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 2 }}>kW</span>
                        </div>
                      </div>
                    )}

                    {/* Puissance totale */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      paddingBottom: q_charge != null ? 10 : 0,
                      marginBottom: q_charge != null ? 10 : 0,
                      borderBottom: q_charge != null ? '2px solid #e2e8f0' : 'none' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#1e293b' }}>Puissance échangeur</span>
                      <div style={{ flexShrink: 0, marginLeft: 8 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a',
                          fontFamily: 'ui-monospace, monospace' }}>{P_total!.toFixed(1)}</span>
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
                              côté chaudière — ΔT = {dT_prim} K
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
      {activeCalcId === 'alimentation-ecs' && (() => {
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
      {inSegs.length > 0 && activeCalcId !== 'alimentation-ecs' && (
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
                  <div style={{ display: 'grid', gridTemplateColumns: calcSubMode !== 'pdc' && segCumDp != null ? '1fr auto auto' : '1fr 1fr', gap: 4 }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>Débit</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                        {s.flowRate != null ? s.flowRate.toFixed(3) + ' m³/h' : '—'}
                      </div>
                    </div>
                    {calcSubMode === 'pdc' && segCumDp != null ? (
                      <div>
                        <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>ΔP / Prod.ECS</div>
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
                    ) : calcSubMode !== 'pdc' ? (
                      <>
                        <div style={{ paddingLeft: 6 }}>
                          <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>T arrivée</div>
                          <div style={{ fontSize: 11, fontWeight: 600, color: '#374151' }}>
                            {s.T_to != null ? s.T_to.toFixed(2) + ' °C' : '—'}
                          </div>
                        </div>
                        {segCumDp != null && (
                          <div style={{ paddingLeft: 6 }}>
                            <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>ΔP / Prod.ECS</div>
                            <div style={{ fontSize: 11, fontWeight: isWorst ? 700 : 600,
                              color: isWorst ? '#0f172a' : '#374151', fontFamily: 'ui-monospace, monospace' }}>
                              {fmtDp(segCumDp)}
                            </div>
                          </div>
                        )}
                      </>
                    ) : null}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {inSegs.length === 0 && nodeTemp == null && calcSubMode !== 'pdc' && activeCalcId !== 'alimentation-ecs' && (
        <p className="lp-hint">Aucune propriété modifiable.</p>
      )}
    </div>
  )
}
