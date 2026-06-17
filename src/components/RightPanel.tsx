import { useState, useRef, useEffect } from 'react'
import { ABAQUE } from '../utils/alimentationCalc'
import { getDisplayName } from '../utils/naming'
import { computeSegUI, getSegAmbTemp } from '../utils/thermalCalc'
import { sf } from '../utils/fmt'
import { FITTING_TYPES, EQUIPMENT_TYPES } from '../utils/pdcCalc'
import { getNodeCote, getNodeDefaultCote } from '../utils/coteCalc'

function tAvalStyle(T, T_depart) {
  if (T == null) return {}
  if (T < 50) return { background: '#dc2626', color: '#fff', fontWeight: 700, borderColor: '#b91c1c', labelColor: 'rgba(255,255,255,0.8)' }
  const ratio = Math.max(0, Math.min(1, (T - 50) / Math.max(T_depart - 50, 1)))
  const hue   = Math.round(120 * ratio)
  return { background: `hsl(${hue},58%,91%)`, borderColor: `hsl(${hue},50%,68%)`, labelColor: `hsl(${hue},40%,32%)` }
}

function Field({ label, unit = null, children }: { label: any, unit?: any, children: any }) {
  return (
    <div className="lp-field">
      <label className="lp-label">
        {label}{unit && <span className="lp-unit"> ({unit})</span>}
      </label>
      {children}
    </div>
  )
}


function CoteSection({ seg, points, levels, lineYs, onUpdate }: { seg: any, points: any[], levels: any[], lineYs: number[], onUpdate: any }) {
  const startPt = points?.find(p => p.id === seg.startPointId) ?? null
  const endPt   = points?.find(p => p.id === seg.endPointId)   ?? null
  if (!startPt && !endPt) return null
  const mkInput = (pt: any) => {
    if (!pt) return null
    const def = getNodeDefaultCote(pt, levels ?? [], lineYs ?? [])
    return (
      <Field label={pt.id === seg.startPointId ? 'Cote amont' : 'Cote aval'} unit="m">
        <input type="number" step="0.01"
          value={pt.cote_override != null ? pt.cote_override : ''}
          placeholder={`${def.toFixed(2)} (par défaut)`}
          onChange={e => onUpdate(pt.id, 'point', { cote_override: e.target.value === '' ? null : parseFloat(e.target.value) })} />
      </Field>
    )
  }
  return (
    <>
      <SectionLabel>Cote</SectionLabel>
      {mkInput(startPt)}
      {mkInput(endPt)}
    </>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
      letterSpacing: '0.05em', marginBottom: 5, marginTop: 2 }}>
      {children}
    </div>
  )
}

function SegNameField({ displayName, isDefault, value, onChange }) {
  const autoResize = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }
  return (
    <div className="lp-field">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <label className="lp-label" style={{ margin: 0 }}>Nom</label>
        {isDefault
          ? <span style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', letterSpacing: '0.02em' }}>par défaut</span>
          : <span style={{ fontSize: 9, color: '#6366f1', letterSpacing: '0.02em' }}>personnalisé</span>
        }
      </div>

      {isDefault && (
        <div style={{
          padding: '5px 8px', marginBottom: 5,
          background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 4,
          fontSize: 12, color: '#374151', lineHeight: 1.45, wordBreak: 'break-word',
        }}>
          {displayName}
        </div>
      )}

      <textarea
        value={value}
        placeholder={isDefault ? 'Renommer…' : ''}
        rows={1}
        onChange={e => onChange(e.target.value || null)}
        onInput={e => autoResize(e.currentTarget)}
        style={isDefault ? { color: '#6b7280' } : undefined}
      />

      {!isDefault && (
        <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 3, display: 'block' }}>
          Effacez pour rétablir le nom par défaut
        </span>
      )}
    </div>
  )
}

function PdcSegResults({ pdcResult, pdcParams, seg, dnDef, flowData, cumDp, postJunction = false, segCol = null, isOnCriticalPath = false, criticalCol = null,
                         isAlimEcs = false, deltaH = null, dpStatic = null, pressionAval = null, pStatAval = null }) {
  const [showIter, setShowIter] = useState(false)

  const fmtPa = (v: number) => v >= 10000
    ? `${(v / 1000).toFixed(2)} kPa`
    : `${Math.round(v)} Pa`
  const pct = (v: number) => pdcResult && pdcResult.dpTotal > 0
    ? `${Math.round(v / pdcResult.dpTotal * 100)} %`
    : '—'

  if (!pdcResult) {
    const L = seg.length_override
    const di_mm = seg.di_override ?? dnDef?.di
    return (
      <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
        {!L
          ? 'Saisissez une longueur manuelle pour calculer les pertes de charge.'
          : !flowData?.flowRate
          ? 'En attente du débit (calculé par le réseau ou à saisir en mode Dimensionnement).'
          : !di_mm
          ? 'Configurez le matériau et le DN du tronçon.'
          : 'Calcul en attente.'}
      </div>
    )
  }

  const L     = seg.length_override
  const di_mm = seg.di_override ?? dnDef?.di
  const Q     = flowData?.flowRate ?? null
  const dynPressure = pdcResult.dynPressure ?? (pdcResult.rho * pdcResult.V ** 2 / 2)

  const unite = pdcParams?.uniteAffichage ?? 'Pa'
  const fmtMce = (pa: number): string => `${(pa / 9.81).toFixed(0)} mmCE`
  const fmtP = (pa: number): string => {
    if (unite === 'mmCE') return fmtMce(pa)
    if (unite === 'both') return `${fmtPa(pa)} / ${fmtMce(pa)}`
    return fmtPa(pa)
  }
  const fmtPNode = (pa: number): React.ReactNode => {
    if (unite === 'mmCE') return fmtMce(pa)
    if (unite === 'both') return (
      <>{fmtPa(pa)}<span style={{ fontSize: '0.75em', color: '#8d96a8', fontWeight: 400 }}> /{fmtMce(pa)}</span></>
    )
    return fmtPa(pa)
  }
  const paStr = (pa: number): string => `${Math.round(pa)} Pa`

  const secLabel = (text: string) => (
    <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
      letterSpacing: '0.04em', marginBottom: 4 }}>{text}</div>
  )
  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '2px 0', borderBottom: '1px solid #f3f4f6', gap: 6 }}>
      <span style={{ fontSize: 10, color: '#6b7280', minWidth: 0 }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 500, color: '#374151',
        fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
    </div>
  )
  const resultRow = (label: string, value: string, color: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '4px 0', marginTop: 4, gap: 6 }}>
      <span style={{ fontSize: 10, color, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
    </div>
  )
  const techBox = (children: React.ReactNode) => (
    <div style={{ padding: '7px 10px', background: '#f9fafb', border: '1px solid #f3f4f6',
      borderRadius: 6, fontSize: 10, color: '#9ca3af', lineHeight: 1.9, marginTop: 6 }}>
      {secLabel('Données techniques')}
      {children}
    </div>
  )
  const cardHeader = (title: string, value: React.ReactNode, pctVal: string, color: string, light: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 12px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: '#374151',
        textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color }}>{value}</span>
        <span style={{ fontSize: 10, color: light }}>{pctVal}</span>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Alimentation ECS : pression aval (2 cartes) ── */}
      {isAlimEcs ? (
        <div style={{ display: 'flex', gap: 8 }}>
          {/* Pression disponible aval */}
          {(() => {
            const neg = pressionAval != null && pressionAval < 0
            return (
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8,
                background: '#fff', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Pression disponible aval
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: neg ? '#dc2626' : '#0f172a' }}>
                    {pressionAval != null ? (pressionAval / 100000).toFixed(2) : '—'}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                </div>
                {neg && (
                  <div style={{ fontSize: 9, marginTop: 2, color: '#dc2626', fontWeight: 700 }}>
                    Pression négative !
                  </div>
                )}
              </div>
            )
          })()}
          {/* Pression statique aval */}
          {(() => {
            const over = pStatAval != null && pStatAval > 400000
            return (
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8,
                background: '#fff', border: '1px solid #e5e7eb' }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Pression statique aval
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: over ? '#dc2626' : '#0f172a' }}>
                    {pStatAval != null ? (pStatAval / 100000).toFixed(2) : '—'}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                </div>
                <div style={{ fontSize: 9, marginTop: 2,
                  color: over ? '#dc2626' : '#16a34a', fontWeight: over ? 700 : 600 }}>
                  {over ? '> 4 bar — réducteur requis (DTU)' : '≤ 4 bar (DTU)'}
                </div>
              </div>
            )
          })()}
        </div>
      ) : (
        /* ── Bouclage ECS : ΔP depuis production ── */
        cumDp != null && (
          <div style={{ paddingBottom: 10, marginBottom: 2, borderBottom: '2px solid #e5e7eb', paddingLeft: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: (postJunction && segCol) ? 3 : 0 }}>
              <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
                letterSpacing: '0.07em' }}>ΔP depuis production ECS</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#0f172a',
                fontFamily: 'ui-monospace, monospace' }}>{fmtPNode(cumDp)}</span>
            </div>
            {postJunction && segCol && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9, color: '#6b7280' }}>
                  <strong style={{ color: '#374151' }}>{segCol}</strong>
                </span>
                {isOnCriticalPath ? (
                  <span style={{ fontSize: 8, background: '#fef3c7', color: '#92400e',
                    padding: '1px 5px', borderRadius: 3, fontWeight: 700, letterSpacing: '0.02em' }}>
                    défavorisé
                  </span>
                ) : criticalCol ? (
                  <span style={{ fontSize: 8, color: '#9ca3af' }}>
                    défavorisé : <strong style={{ color: '#6b7280' }}>{criticalCol}</strong>
                  </span>
                ) : null}
              </div>
            )}
          </div>
        )
      )}

      {/* ── ΔP Total / ΔP pertes max ── */}
      {(() => {
        const majoré = pdcResult.dpPompe != null
        const displayVal = majoré ? pdcResult.dpPompe! : pdcResult.dpTotal
        return (
          <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 4 }}>{isAlimEcs ? 'ΔP pertes max tronçon' : 'ΔP Total tronçon'}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                    {unite === 'mmCE'
                      ? (displayVal / 9.81).toFixed(0)
                      : displayVal >= 10000 ? (displayVal / 1000).toFixed(2) : Math.round(displayVal)}
                  </span>
                  <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                    {unite === 'mmCE' ? 'mmCE' : displayVal >= 10000 ? 'kPa' : 'Pa'}
                  </span>
                  {unite === 'both' && (
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>/ {fmtMce(displayVal)}</span>
                  )}
                </div>
                {majoré && (
                  <div style={{ fontSize: 9.5, color: '#9ca3af', marginTop: 3 }}>
                    sans majoration {fmtPNode(pdcResult.dpTotal)}
                    <span style={{ marginLeft: 5, color: '#9ca3af' }}>+{pdcParams?.coefPompe ?? 10} %</span>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, textAlign: 'right', lineHeight: 1.9 }}>
                <div style={{ color: '#2563eb' }}>lin. {fmtPNode(pdcResult.dpReg)}</div>
                <div style={{ color: '#c2562d' }}>sing. {fmtPNode(pdcResult.dpSing)}</div>
                {pdcParams?.equipementsActifs && pdcResult.dpEquip > 0 && (
                  <div style={{ color: '#7c3aed' }}>équip. {fmtPNode(pdcResult.dpEquip)}</div>
                )}
              </div>
            </div>
            <div style={{ marginTop: 10, height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', gap: 2 }}>
              <div style={{ flex: pdcResult.dpReg, background: '#2563eb', borderRadius: 3 }} />
              <div style={{ flex: pdcResult.dpSing, background: '#c2562d', borderRadius: 3 }} />
              {pdcParams?.equipementsActifs && pdcResult.dpEquip > 0 && (
                <div style={{ flex: pdcResult.dpEquip, background: '#7c3aed', borderRadius: 3 }} />
              )}
            </div>
          </div>
        )
      })()}

      {/* ── Pertes linéaires ── */}
      <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #2563eb', borderRadius: 8, overflow: 'hidden' }}>
        {cardHeader('Pertes linéaires', fmtPNode(pdcResult.dpReg), pct(pdcResult.dpReg), '#2563eb', '#93c5fd')}
        <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
            {pdcParams?.methodeReg === 'darcy-colebrook'
              ? 'Darcy-Weisbach + Colebrook-White'
              : `DTU 60.11 — formule approchée${pdcParams?.dtuUnite === 'mCE' ? ' (mCE)' : ' (Pa)'}`}
          </div>

          {pdcParams?.methodeReg === 'darcy-colebrook' && (<>
            {row('ρ', `${pdcResult.rho.toFixed(2)} kg/m³`)}
            {row('μ', `${(pdcResult.mu * 1e3).toFixed(3)} ×10⁻³ Pa·s`)}
            {row('ν', `${(pdcResult.nu * 1e6).toFixed(3)} ×10⁻⁶ m²/s`)}
            {pdcResult.Re != null && row(
              `Re — ${pdcResult.regime === 'laminar' ? 'laminaire' : pdcResult.regime === 'transition' ? 'transition' : 'turbulent'}`,
              `${Math.round(pdcResult.Re)}`
            )}
            {pdcResult.regime === 'laminar'     && row('λ', `${pdcResult.lambda?.toFixed(5)}`)}
            {pdcResult.regime === 'transition'  && row('λ  (interpolation)', `${pdcResult.lambda?.toFixed(5)}`)}
            {pdcResult.regime === 'turbulent' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '2px 0', borderBottom: '1px solid #f3f4f6' }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>λ</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 10.5, fontWeight: 500, color: '#374151',
                    fontFamily: 'ui-monospace, monospace' }}>{pdcResult.lambda?.toFixed(5)}</span>
                  {pdcResult.iterations && (
                    <button onClick={() => setShowIter(v => !v)}
                      style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3, cursor: 'pointer',
                        background: showIter ? '#e0f2fe' : '#f1f5f9',
                        border: `1px solid ${showIter ? '#7dd3fc' : '#cbd5e1'}`,
                        color: showIter ? '#0284c7' : '#64748b', fontWeight: 600 }}>
                      {pdcResult.iterations.length} iter. {showIter ? '▴' : '▾'}
                    </button>
                  )}
                </div>
              </div>
            )}
            {showIter && pdcResult.iterations && (
              <div style={{ margin: '3px 0', padding: '7px 9px', background: '#f8fafc',
                border: '1px solid #e2e8f0', borderRadius: 5 }}>
                <div style={{ fontSize: 9.5, color: '#64748b', fontStyle: 'italic', marginBottom: 5 }}>
                  Init. Swamee-Jain : λ₀ = <span style={{ fontFamily: 'ui-monospace, monospace', color: '#374151' }}>
                    {pdcResult.lambdaInit?.toFixed(6)}
                  </span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '20px 1fr 80px', gap: '2px 8px', fontSize: 9.5 }}>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>i</span>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>λ</span>
                  <span style={{ color: '#94a3b8', fontWeight: 600 }}>|Δλ|</span>
                  {pdcResult.iterations.map((it, idx) => (
                    <span key={idx} style={{ display: 'contents' }}>
                      <span style={{ color: '#6b7280' }}>{it.i}</span>
                      <span style={{ fontFamily: 'ui-monospace, monospace', color: '#0f172a' }}>{it.lambda.toFixed(7)}</span>
                      <span style={{ fontFamily: 'ui-monospace, monospace',
                        color: it.delta < 1e-8 ? '#16a34a' : '#9ca3af', fontSize: 9 }}>
                        {it.delta.toExponential(1)}
                      </span>
                    </span>
                  ))}
                </div>
                <div style={{ marginTop: 5, fontSize: 9, color: '#16a34a', fontWeight: 600 }}>
                  ✓ Convergence atteinte (|Δλ| &lt; 10⁻⁸)
                </div>
              </div>
            )}
            {row('J', `${pdcResult.J.toFixed(1)} Pa/m`)}
          </>)}
          {pdcParams?.methodeReg === 'dtu-approche' && row('J', `${pdcResult.J.toFixed(1)} Pa/m`)}

          {resultRow(
            'ΔP_lin = J × L',
            `${pdcResult.J.toFixed(1)} × ${L != null ? L.toFixed(1) : '—'} = ${paStr(pdcResult.dpReg)}`,
            '#2563eb'
          )}
        </div>
      </div>

      {/* ── Pertes singulières ── */}
      <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #c2562d', borderRadius: 8, overflow: 'hidden' }}>
        {cardHeader('Pertes singulières', fmtPNode(pdcResult.dpSing), pct(pdcResult.dpSing), '#c2562d', '#fca38a')}
        <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
            {pdcParams?.methodeSing === 'pourcentage'
              ? `Forfaitaire — ${pdcParams.pourcentageSing ?? 10} % des pertes linéaires`
              : 'Par accessoires — ξ × ρV²/2'}
          </div>
          {pdcParams?.methodeSing === 'pourcentage'
            ? (<>
                {row(`ΔP_lin × ${pdcParams.pourcentageSing ?? 10} %`, `${Math.round(pdcResult.dpReg)} × ${((pdcParams.pourcentageSing ?? 10) / 100).toFixed(2)}`)}
                {resultRow('ΔP_sing', paStr(pdcResult.dpSing), '#c2562d')}
              </>)
            : (() => {
                const fittings: any[] = seg.fittings ?? []
                const active = fittings.filter(f => (f.count ?? 0) > 0)
                return (<>
                  {row('ρV²/2  (pression dynamique)', paStr(dynPressure))}
                  {active.length === 0
                    ? <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', padding: '3px 0' }}>Aucun accessoire renseigné</div>
                    : active.map(f => {
                        const def = FITTING_TYPES.find(t => t.id === f.type)
                        const xi  = f.xiOverride ?? def?.xi ?? 0
                        const dp  = xi * (f.count ?? 1) * dynPressure
                        return row(`${f.count}× ${def?.label ?? f.type}  (ξ = ${xi})`, paStr(dp))
                      })
                  }
                  {active.length > 0 && resultRow('ΔP_sing = Σ', paStr(pdcResult.dpSing), '#c2562d')}
                </>)
              })()
          }
        </div>
      </div>

      {/* ── Hauteur statique (alimentation ECS uniquement) ── */}
      {isAlimEcs && (dpStatic != null || deltaH != null) && (
        <div style={{ border: '1px solid #d1fae5', borderLeft: '3px solid #059669', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: '#ecfdf5',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#059669',
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>Hauteur statique</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#059669',
              fontFamily: 'ui-monospace, monospace' }}>
              {dpStatic != null ? fmtPNode(dpStatic) : '—'}
            </span>
          </div>
          <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#374151' }}>
              <span style={{ color: '#6b7280' }}>Δh tronçon</span>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600,
                color: deltaH != null && deltaH !== 0 ? '#059669' : '#374151' }}>
                {deltaH != null ? `${deltaH.toFixed(2)} m` : '—'}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: '#374151' }}>
              <span style={{ color: '#6b7280' }}>ΔP_stat = ρ × g × Δh</span>
              <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600,
                color: dpStatic != null && dpStatic !== 0 ? '#059669' : '#374151' }}>
                {dpStatic != null ? fmtPNode(dpStatic) : '—'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Équipements ── */}
      {pdcParams?.equipementsActifs && (
        <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #7c3aed', borderRadius: 8, overflow: 'hidden' }}>
          {cardHeader('Équipements', fmtPNode(pdcResult.dpEquip), pct(pdcResult.dpEquip), '#7c3aed', '#c4b5fd')}
          <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {(() => {
              const equipment: any[] = seg.equipment ?? []
              if (equipment.length === 0) return (
                <div style={{ fontSize: 10, color: '#c4b5fd', fontStyle: 'italic', padding: '3px 0' }}>Aucun équipement configuré</div>
              )
              return (<>
                {equipment.map((e, idx) => {
                  const def = EQUIPMENT_TYPES.find(t => t.id === e.type)
                  const kv  = e.kvOverride ?? def?.kvDefault ?? null
                  const dp  = kv && Q ? Math.pow(Q / kv, 2) * 100000 : null
                  return row(`${def?.label ?? e.type}`, dp != null ? paStr(dp) : 'Kv manquant')
                })}
                {resultRow('ΔP_équip = Σ', paStr(pdcResult.dpEquip), '#7c3aed')}
              </>)
            })()}
          </div>
        </div>
      )}

      {/* ── Données techniques (bloc unifié) ── */}
      {techBox(<>
        <div>V = {pdcResult.V.toFixed(3)} m/s · di = {di_mm != null ? `${di_mm} mm` : '—'} · L = {L != null ? `${L.toFixed(1)} m` : '—'}</div>
        {(pdcResult.epsilon_used != null || pdcParams?.methodeReg === 'darcy-colebrook') && (
          <div>
            {pdcResult.epsilon_used != null && `ε = ${pdcResult.epsilon_used} m`}
            {pdcResult.epsilon_used != null && pdcParams?.methodeReg === 'darcy-colebrook' ? ' · ' : ''}
            {pdcParams?.methodeReg === 'darcy-colebrook' && `T = ${pdcResult.T_used.toFixed(1)} °C`}
          </div>
        )}
        {Q != null && <div>Q = {Q.toFixed(3)} m³/h</div>}
        {pdcParams?.equipementsActifs && (seg.equipment ?? []).length > 0 && (
          Array.from(new Map((seg.equipment ?? []).map((e: any) => [e.type, e])).values())
            .map((e: any) => {
              const def = EQUIPMENT_TYPES.find(t => t.id === e.type)
              const kv  = e.kvOverride ?? def?.kvDefault ?? null
              return <div key={e.type}>{def?.label ?? e.type} — Kv = {kv ?? '?'} m³/h/√bar</div>
            })
        )}
      </>)}

    </div>
  )
}

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
  const setXi = (typeId: string, val: string) => {
    const num = val === '' ? undefined : parseFloat(val)
    set('fittings', fittings.map(f => f.type === typeId ? { ...f, xiOverride: num } : f))
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
    display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
    padding: '4px 7px', background: '#fef7f4', border: '1px solid #fbd5c5', borderRadius: 5,
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
            <input type="number" min="1" step="1" value={f.count ?? 1}
              onChange={e => setCount(f.type, parseInt(e.target.value) || 1)}
              style={{ ...inp(), width: 32 }} />
            <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>ξ</span>
            <input type="number" min="0" step="0.01" value={xi ?? ''}
              placeholder={libXi != null ? String(libXi) : ''}
              onChange={e => setXi(f.type, e.target.value)}
              style={{ ...inp({ width: 44, color: overridden ? '#c2562d' : '#374151',
                                border: `1px solid ${overridden ? '#fbd5c5' : '#e5e7eb'}` }) }} />
            {overridden && (
              <button onClick={() => setXi(f.type, '')} title={`Rétablir (ξ = ${libXi})`}
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
              return (
                <div key={t.id} onClick={() => add(t.id)}
                  style={{ padding: '5px 10px', fontSize: 10.5, cursor: 'pointer', borderRadius: 5,
                           display: 'flex', justifyContent: 'space-between', gap: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fef0ea')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{t.label}</span>
                  <span style={{ color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>ξ = {libXi}</span>
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

  const setKv = (typeId: string, val: string) => {
    const num = val === '' ? undefined : parseFloat(val)
    set('equipment', equipment.map(e => e.type === typeId ? { ...e, kvOverride: num } : e))
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
    display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4,
    padding: '4px 7px', background: '#faf8ff', border: '1px solid #ddd6fe', borderRadius: 5,
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
            <input type="number" min="0" step="0.1" value={kv ?? ''}
              placeholder={libKv != null ? String(libKv) : 'requis'}
              onChange={ev => setKv(e.type, ev.target.value)}
              style={{ ...inp({ width: 50,
                                color: needsKv ? '#f97316' : overridden ? '#7c3aed' : '#374151',
                                border: `1px solid ${needsKv ? '#fed7aa' : overridden ? '#ddd6fe' : '#e5e7eb'}` }) }} />
            <span style={{ fontSize: 8, color: '#9ca3af', flexShrink: 0, lineHeight: 1 }}>m³/h/√bar</span>
            {overridden && libKv != null && (
              <button onClick={() => setKv(e.type, '')} title={`Rétablir (Kv = ${libKv})`}
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
              return (
                <div key={t.id} onClick={() => add(t.id)}
                  style={{ padding: '5px 10px', fontSize: 10.5, cursor: 'pointer', borderRadius: 5,
                           display: 'flex', justifyContent: 'space-between', gap: 8 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#faf8ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{t.label}</span>
                  <span style={{ color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
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

function SegmentPanel({ seg, onUpdate, materials, insulations, allSegs, levels, lineYs, columns, columnXs, chaufferie, points, flowData, globalParams, thermalData, roleMap, drawMode, onExitEditParams, activeCalcId, alimentationData, pdcParams, pdcResult, calcSubMode, pdcCumResults, pdcCumAlimResults, segToCol }) {
  const [tab, setTab] = useState('params')
  const set = (key, val) => onUpdate(seg.id, 'segment', { [key]: val })

  const enabledMats = materials.filter(m => m.enabled)
  const enabledIns  = insulations.filter(i => i.enabled)
  const selMat      = materials.find(m => m.id === seg.materialId)
  const selIns      = insulations.find(i => i.id === seg.insulationId)
  const dnDef       = selMat?.dns.find(d => d.dn === seg.dn)

  const isDefault   = !seg.name
  const displayName = getDisplayName(seg, allSegs, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(seg.id), activeCalcId, roleMap)

  const he = globalParams?.he ?? 10
  const uiValue = computeSegUI(seg, materials, insulations, he)

  // ── Vue dédiée Alimentation ECS (dimensionnement) et Alimentation EF ──────────────────────
  if (activeCalcId === 'alimentation-ef' || (activeCalcId === 'alimentation-ecs' && calcSubMode !== 'pdc')) {
    const di_mm = seg.di_override ?? dnDef?.di ?? null
    const ad    = alimentationData

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
        <div style={{ flex: 1, padding: '8px 12px',
          background: ok ? '#f0fdf4' : '#fff',
          border: `1px solid ${ko ? '#fca5a5' : ok ? '#bbf7d0' : '#e5e7eb'}`,
          borderRadius: 6 }}>
          <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: ko ? '#dc2626' : '#111827' }}>
              {sf(di_min, 1)}
            </span>
            <span style={{ fontSize: 11, color: '#9ca3af' }}>mm</span>
          </div>
          {di_mm != null && di_min != null && (
            <div style={{ fontSize: 9, marginTop: 2, color: ok ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
              {ok ? `✓ di=${di_mm} mm` : `✗ di=${di_mm} mm`}
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

        {/* ── Identification ── */}
        <SectionLabel>Identification</SectionLabel>
        <SegNameField displayName={displayName} isDefault={isDefault} value={seg.name ?? ''} onChange={v => set('name', v)} />

        <hr className="rp-divider" />
        <CoteSection seg={seg} points={points} levels={levels} lineYs={lineYs} onUpdate={onUpdate} />
        <hr className="rp-divider" />

        {/* ── Canalisation ── */}
        <SectionLabel>Canalisation</SectionLabel>

        <Field label="Longueur" unit="m">
          <input type="number" min="0"
            value={seg.length_override ?? ''}
            placeholder="saisie manuelle"
            onChange={e => set('length_override', e.target.value === '' ? null : +e.target.value)} />
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
              <input type="number"
                value={seg.di_override ?? ''}
                placeholder={`${dnDef.di} (par défaut)`}
                onChange={e => set('di_override', e.target.value === '' ? null : +e.target.value)} />
            </Field>
          )}
        </>)}

        {/* ════ Bandeau Résultats ════ */}
        <div style={{
          margin: '14px -14px 12px', padding: '6px 14px',
          background: 'linear-gradient(to right, #eef2ff, #f8fafc)',
          borderTop: '1px solid #c7d2fe', borderBottom: '1px solid #e2e8f0',
          fontSize: 10, fontWeight: 700, color: '#4338ca',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Résultats
        </div>


        {ad ? (() => {
          const isCollective = ad.method === 'collective'
          const c = isCollective ? ad.collective : null

          const methodReason = isCollective
            ? ad.collectiveReason === 'N > 5'
              ? `N = ${ad.N} > 5`
              : `N = ${ad.N} ≤ 5 et X = ${sf(ad.X, 1)} > 15`
            : `N = ${ad.N} ≤ 5 et X = ${sf(ad.X, 1)} ≤ 15`

          const Cell = ({ label, value, unit }) => (
            <div style={{ padding: '7px 5px', background: '#fff', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>{label}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{value}</div>
              {unit && <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>{unit}</div>}
            </div>
          )

          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

              {/* Méthode */}
              <div style={{ fontSize: 10, color: '#3b82f6', fontWeight: 500 }}>
                Méthode {isCollective ? 'collective' : 'individuelle'} — {methodReason}
              </div>

              {/* ── Collective ── */}
              {isCollective && c && (<>
                <DiMinCard di_min={c.di_min} di_mm={di_mm} label="Diamètre intérieur minimum requis" />

                {c.N_for_y > 0 ? (
                  <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
                      <Cell label="N Appareils en aval" value={String(c.N_for_y)} unit="" />
                      <div style={{ background: '#e5e7eb' }} />
                      <Cell label="Débit de base" value={sf(c.Qs_for_y, 3)} unit="l/s" />
                    </div>
                    <div style={{ height: 1, background: '#e5e7eb' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
                      <Cell label="Coeff. de simultanéité y" value={sf(c.y, 3)} unit="" />
                      <div style={{ background: '#e5e7eb' }} />
                      <Cell label="Débit probable" value={sf(c.Qp, 3)} unit="l/s" />
                    </div>
                  </div>
                ) : (
                  <div style={{ padding: '6px 10px', background: '#f9fafb',
                    border: '1px solid #e5e7eb', borderRadius: 5, fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>
                    Débit calculé intégralement depuis les WC robinets de chasse — aucun appareil soumis au coefficient y
                  </div>
                )}

                {c.isEnseignement && c.N_sim > 0 && (
                  <div style={{ padding: '6px 10px', background: '#eff6ff',
                    border: '1px solid #bfdbfe', borderRadius: 5, fontSize: 10, color: '#1e40af' }}>
                    <span style={{ fontWeight: 700 }}>Enseignement</span>
                    {' — lavabos et douches en simultané : '}
                    {c.N_sim} app. → {sf(c.Qs_sim, 3)} l/s (plein débit, y = 1)
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
                {di_mm != null && ad.di_min != null && di_mm < ad.di_min && (
                  <Alert level="error"
                    msg={`di = ${di_mm} mm insuffisant — minimum requis : ${sf(ad.di_min, 1)} mm`} />
                )}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr' }}>
                    <Cell label="N appareils en aval" value={String(ad.N)} unit="" />
                    <div style={{ background: '#e5e7eb' }} />
                    <Cell label="Coeff. d'usage X" value={sf(ad.X, 1)} unit="" />
                  </div>
                </div>
                <div style={{ padding: '8px 10px', background: '#f9fafb',
                  border: '1px solid #e5e7eb', borderRadius: 6 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#6b7280',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                    Abaque — Figure 1
                  </div>
                  <AbaqueChart X={ad.X} di_min={ad.di_min} />
                </div>
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
            Aucun groupe de puisage en aval, ou aucun appareil activé.
          </p>
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
          {calcSubMode === 'pdc' ? (
            <PdcSegResults pdcResult={pdcResult} pdcParams={pdcParams} seg={seg} dnDef={dnDef} flowData={flowData}
              cumDp={activeCalcId === 'alimentation-ecs'
                ? pdcCumAlimResults?.segCumDp?.get(seg.id)
                : pdcCumResults?.segCumDp.get(seg.id)}
              postJunction={activeCalcId === 'alimentation-ecs' ? false : (pdcCumResults?.segPostJunction.get(seg.id) ?? false)}
              segCol={segToCol?.get(seg.id) ?? null}
              isOnCriticalPath={activeCalcId === 'alimentation-ecs'
                ? (pdcCumAlimResults?.criticalSegIds?.has(seg.id) ?? false)
                : (pdcCumResults?.criticalSegIds?.has(seg.id) ?? false)}
              criticalCol={activeCalcId === 'alimentation-ecs' ? null : (segToCol?.get(pdcCumResults?.criticalLeafSegId ?? '') ?? null)}
              isAlimEcs={activeCalcId === 'alimentation-ecs'}
              deltaH={pdcCumAlimResults?.segDeltaH?.get(seg.id) ?? null}
              dpStatic={pdcCumAlimResults?.segDpStatic?.get(seg.id) ?? null}
              pressionAval={pdcCumAlimResults?.segPressionAval?.get(seg.id) ?? null}
              pStatAval={pdcCumAlimResults?.segPStatAval?.get(seg.id) ?? null}
            />
          ) : thermalData ? (() => {
            const { Q, deltaT, T_from, T_to, T_amb } = thermalData
            const velocity = flowData?.velocity
            const flowRate = flowData?.flowRate
            const T_depart = globalParams?.T_depart ?? 60
            const dT_depuis_depart = T_to - T_depart

            const de_mm = seg.de_override ?? dnDef?.de
            const di_mm = seg.di_override ?? dnDef?.di
            const e_mm  = typeof seg.thickness === 'number' ? seg.thickness : null
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

                {/* ── Vitesse ── */}
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
                  </div>
                  {isRetour && velocity != null && velocity < 0.2 && (
                    <Alert level="error"
                      msg="Vitesse < 0,2 m/s — risque de stagnation favorisant le développement du biofilm et l'accumulation de dépôts" />
                  )}
                  {isRetour && velocity != null && velocity > vMax && (
                    isCollecteurRetour
                      ? <Alert level="warning"
                          msg="Vitesse > 1,0 m/s — risque d'érosion (collecteur retour)" />
                      : <Alert level="warning"
                          msg="Vitesse > 0,5 m/s — risque de bruit et d'érosion" />
                  )}
                  {isRetour && selMat?.id === 'copper' && velocity != null && velocity > 0.3 && velocity <= vMax && (
                    <Alert level="warning"
                      msg="Vitesse > 0,3 m/s — Pour le cuivre, une vitesse inférieure à 0,3 m/s est conseillée pour limiter les risques d'érosion" />
                  )}
                </div>

                {/* ── Débit · UI · Pertes ── */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr' }}>
                    {[
                      { label: 'Débit',      value: flowRate != null ? flowRate.toFixed(3) : '—', unit: 'm³/h'   },
                      { label: 'UI',         value: uiValue  != null ? uiValue.toFixed(4)  : '—', unit: 'W/(m·K)' },
                      { label: 'Pertes th.', value: sf(Q, 1),                                       unit: 'W'      },
                    ].reduce((acc, item, i) => {
                      if (i > 0) acc.push(
                        <div key={`sep${i}`} style={{ background: '#e5e7eb' }} />
                      )
                      acc.push(
                        <div key={item.label} style={{ padding: '7px 6px', background: '#fff', textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700,
                            textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3 }}>
                            {item.label}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>
                            {item.value}
                          </div>
                          <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1 }}>{item.unit}</div>
                        </div>
                      )
                      return acc
                    }, [])}
                  </div>
                </div>

                {/* ── Données techniques ── */}
                <div style={{ padding: '6px 10px', background: '#f9fafb',
                  border: '1px solid #f3f4f6', borderRadius: 5 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af',
                    textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
                    Données techniques
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', lineHeight: 1.9 }}>
                    <div>T amb = {sf(T_amb, 1)} °C · ΔT tronçon = {sf(Math.abs(deltaT), 3)} K</div>
                    <div>
                      he = {he} W/(m²·K)
                      {de_mm != null && <> · de = {de_mm} · di = {di_mm ?? '—'} mm</>}
                    </div>
                    {e_mm != null && <div>e = {e_mm} mm</div>}
                    {lt != null && (
                      <div>λ tube = {lt}{li != null ? ` · λ isol = ${li}` : ''} W/(m·K)</div>
                    )}
                  </div>
                </div>

              </div>
            )
          })() : (() => {
            const velocity = flowData?.velocity
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {velocity != null && (
                  <div style={{ padding: '8px 12px', background: '#fff',
                    border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.05em', marginBottom: 3 }}>Vitesse</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{sf(velocity, 3)}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>m/s</span>
                    </div>
                  </div>
                )}
                {uiValue != null && (
                  <div style={{ padding: '8px 12px', background: '#fff',
                    border: '1px solid #e5e7eb', borderRadius: 6 }}>
                    <div style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.05em', marginBottom: 3 }}>UI</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{sf(uiValue, 4)}</span>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>W/(m·K)</span>
                    </div>
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#9ca3af', fontStyle: 'italic' }}>
                  {!seg.length_override
                    ? 'Saisissez une longueur manuelle pour calculer les pertes thermiques.'
                    : 'En attente des données amont (température de départ, débit, UI).'}
                </div>
              </div>
            )
          })()}

        </div>
      )}

      {tab === 'params' && (calcSubMode === 'pdc' ? (
        <>
          <SectionLabel>Identification</SectionLabel>
          <SegNameField displayName={displayName} isDefault={isDefault} value={seg.name ?? ''} onChange={v => set('name', v)} />
          {activeCalcId !== 'alimentation-ecs' && (
            <Field label="Type de tronçon">
              <select value={seg.type} onChange={e => set('type', e.target.value)}>
                <option value="aller">Aller ECS</option>
                <option value="retour">Retour ECS</option>
              </select>
            </Field>
          )}

          <hr className="rp-divider" />
          {activeCalcId === 'alimentation-ecs' && <CoteSection seg={seg} points={points} levels={levels} lineYs={lineYs} onUpdate={onUpdate} />}
          <hr className="rp-divider" />

          {activeCalcId !== 'alimentation-ecs' && <>
            <SectionLabel>Hydraulique</SectionLabel>
            {(() => {
              const di_mm  = seg.di_override ?? dnDef?.di ?? null
              const area   = di_mm ? Math.PI * (di_mm / 1000) ** 2 / 4 : null
              const hasManualQ = seg.flowRate != null
              const hasManualV = seg.velocity != null
              const hasManual  = hasManualQ || hasManualV
              const resolved   = flowData

              const qPlaceholder = hasManualV && area
                ? sf(seg.velocity * area * 3600, 3)
                : (!hasManual && resolved?.flowRate != null)
                ? `Calculé : ${sf(resolved.flowRate, 3)}`
                : 'm³/h'

              const vPlaceholder = hasManualQ && area
                ? sf(seg.flowRate / (area * 3600), 3)
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
                      <input type="number" min="0" step="0.001"
                        placeholder={qPlaceholder}
                        value={seg.flowRate ?? ''}
                        onChange={e => {
                          const v = e.target.value === '' ? null : +e.target.value
                          set('flowRate', v)
                          if (v != null) set('velocity', null)
                        }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Vitesse (m/s)</div>
                      <input type="number" min="0" step="0.001"
                        placeholder={vPlaceholder}
                        value={seg.velocity ?? ''}
                        onChange={e => {
                          const v = e.target.value === '' ? null : +e.target.value
                          set('velocity', v)
                          if (v != null) set('flowRate', null)
                        }} />
                    </div>
                  </div>
                  {!hasManual && resolved?.source === 'computed' && resolved.flowRate != null && (
                    <div style={{ marginTop: 5, padding: '5px 8px', background: '#f0fdf4',
                      border: '1px solid #86efac', borderRadius: 4, fontSize: 11, color: '#15803d' }}>
                      <span style={{ fontWeight: 700 }}>🔢 Calculé par le réseau</span>
                      <div style={{ fontSize: 10, color: '#166534', marginTop: 2 }}>
                        Saisissez une valeur pour passer en mode manuel.
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
            <hr className="rp-divider" />
          </>}

          <SectionLabel>Canalisation</SectionLabel>
          <Field label="Longueur" unit="m">
            <input type="number" min="0"
              value={seg.length_override ?? ''}
              placeholder="saisie manuelle"
              onChange={e => set('length_override', e.target.value === '' ? null : +e.target.value)} />
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
                  onChange={e => { set('dn', e.target.value || null); set('di_override', null) }}>
                  <option value="">— Choisir —</option>
                  {selMat.dns.map(d => <option key={d.dn} value={d.dn}>{d.dn}</option>)}
                </select>
              </Field>
              {dnDef && (
                <Field label="Di" unit="mm">
                  <input type="number"
                    value={seg.di_override ?? ''}
                    placeholder={`${dnDef.di} (par défaut)`}
                    onChange={e => set('di_override', e.target.value === '' ? null : +e.target.value)} />
                </Field>
              )}
            </>
          )}

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
        </>
      ) : <>
      {/* Identification */}
      <SectionLabel>Identification</SectionLabel>
      <SegNameField displayName={displayName} isDefault={isDefault} value={seg.name ?? ''} onChange={v => set('name', v)} />

      <Field label="Type de tronçon">
        <select value={seg.type} onChange={e => set('type', e.target.value)}>
          <option value="aller">Aller ECS</option>
          <option value="retour">Retour ECS</option>
        </select>
      </Field>

      <hr className="rp-divider" />
      {activeCalcId === 'alimentation-ecs' && <CoteSection seg={seg} points={points} levels={levels} lineYs={lineYs} onUpdate={onUpdate} />}
      <hr className="rp-divider" />

      {/* Hydraulique */}
      <SectionLabel>Hydraulique</SectionLabel>
      {(() => {
        const di_mm  = seg.di_override ?? dnDef?.di ?? null
        const area   = di_mm ? Math.PI * (di_mm / 1000) ** 2 / 4 : null
        const hasManualQ = seg.flowRate != null
        const hasManualV = seg.velocity != null
        const hasManual  = hasManualQ || hasManualV
        const resolved   = flowData

        const qPlaceholder = hasManualV && area
          ? sf(seg.velocity * area * 3600, 3)
          : (!hasManual && resolved?.flowRate != null)
          ? `Calculé : ${sf(resolved.flowRate, 3)}`
          : 'm³/h'

        const vPlaceholder = hasManualQ && area
          ? sf(seg.flowRate / (area * 3600), 3)
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
                <input type="number" min="0" step="0.001"
                  placeholder={qPlaceholder}
                  value={seg.flowRate ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? null : +e.target.value
                    set('flowRate', v)
                    if (v != null) set('velocity', null)
                  }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: '#9ca3af', marginBottom: 2 }}>Vitesse (m/s)</div>
                <input type="number" min="0" step="0.001"
                  placeholder={vPlaceholder}
                  value={seg.velocity ?? ''}
                  onChange={e => {
                    const v = e.target.value === '' ? null : +e.target.value
                    set('velocity', v)
                    if (v != null) set('flowRate', null)
                  }} />
              </div>
            </div>
            {!hasManual && resolved?.source === 'computed' && resolved.flowRate != null && (
              <div style={{ marginTop: 5, padding: '5px 8px', background: '#f0fdf4',
                border: '1px solid #86efac', borderRadius: 4, fontSize: 11, color: '#15803d' }}>
                <span style={{ fontWeight: 700 }}>🔢 Calculé par le réseau</span>
                <div style={{ fontSize: 10, color: '#166534', marginTop: 2 }}>
                  Saisissez une valeur pour passer en mode manuel.
                </div>
              </div>
            )}
          </div>
        )
      })()}

      <hr className="rp-divider" />

      {/* Canalisation */}
      <SectionLabel>Canalisation</SectionLabel>
      <Field label="Longueur" unit="m">
        <input type="number" min="0"
          value={seg.length_override ?? ''}
          placeholder="saisie manuelle"
          onChange={e => set('length_override', e.target.value === '' ? null : +e.target.value)} />
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
                <input type="number"
                  value={seg.di_override ?? ''}
                  placeholder={`${dnDef.di} (par défaut)`}
                  onChange={e => set('di_override', e.target.value === '' ? null : +e.target.value)} />
              </Field>
              <Field label="De" unit="mm">
                <input type="number"
                  value={seg.de_override ?? ''}
                  placeholder={`${dnDef.de} (par défaut)`}
                  onChange={e => set('de_override', e.target.value === '' ? null : +e.target.value)} />
              </Field>
            </>
          )}

          <Field label="λ tube" unit="W/m·K">
            <input type="number" step="0.001"
              value={seg.lambda_tube_override ?? ''}
              placeholder={`${selMat.lambda} (par défaut)`}
              onChange={e => set('lambda_tube_override', e.target.value === '' ? null : +e.target.value)} />
          </Field>
        </>
      )}

      <hr className="rp-divider" />

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
              <input type="number" placeholder="Saisir manuellement"
                value={seg.thickness ?? ''}
                onChange={e => set('thickness', e.target.value === '' ? null : +e.target.value)} />
            )}
          </Field>

          {seg.thickness === '__custom' && (
            <Field label="Épaisseur personnalisée" unit="mm">
              <input type="number" onChange={e => set('thickness', +e.target.value)} />
            </Field>
          )}

          <Field label="λ isolant" unit="W/m·K">
            <input type="number" step="0.001"
              value={seg.lambda_insul_override ?? ''}
              placeholder={`${selIns.lambda} (par défaut)`}
              onChange={e => set('lambda_insul_override', e.target.value === '' ? null : +e.target.value)} />
          </Field>
        </>
      )}

      <hr className="rp-divider" />

      {/* Thermique */}
      <SectionLabel>Thermique</SectionLabel>
      {(() => {
        const tAmbDefault = getSegAmbTemp(
          { ...seg, t_amb_override: null }, levels, lineYs, globalParams
        )
        const hasOverride = seg.t_amb_override != null
        return (
          <Field label="T° ambiante" unit="°C">
            <input
              type="number" step="0.5"
              value={seg.t_amb_override ?? ''}
              placeholder={tAmbDefault != null ? `${tAmbDefault} (défaut)` : 'défaut'}
              onChange={e => set('t_amb_override', e.target.value === '' ? null : +e.target.value)}
            />
            {hasOverride && (
              <button
                onClick={() => set('t_amb_override', null)}
                style={{ marginTop: 4, fontSize: 10, color: '#6b7280', background: 'none',
                  border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                Rétablir la valeur par défaut ({tAmbDefault} °C)
              </button>
            )}
          </Field>
        )
      })()}

      </>)}

    </div>
  )
}

const DIR_BTNS = [
  { label: '←', rot: 180, title: 'Vers la gauche' },
  { label: '↑', rot: 270, title: 'Vers le haut' },
  { label: '→', rot: 0,   title: 'Vers la droite' },
  { label: '↓', rot: 90,  title: 'Vers le bas' },
]

function TempBadge({ temp, T_depart }) {
  if (temp == null) return null
  const dT = T_depart != null ? temp - T_depart : null
  const ts = tAvalStyle(temp, T_depart ?? 60)
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ padding: '7px 10px', background: ts.background,
        border: `1px solid ${ts.borderColor}`, borderRadius: 6 }}>
        <div style={{ fontSize: 9, color: ts.labelColor, fontWeight: 700, marginBottom: 3,
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>Température au nœud</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: ts.fontWeight ?? 700, color: ts.color ?? '#111827' }}>{sf(temp, 2)}</span>
          <span style={{ fontSize: 10, color: ts.color ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>°C</span>
        </div>
      </div>
      {dT != null && (
        <div style={{ marginTop: 2, textAlign: 'center', fontSize: 10, color: '#6b7280' }}>
          ΔT depuis départ : <span style={{ fontWeight: 700, color: '#374151' }}>{sf(dT, 2)} K</span>
        </div>
      )}
    </div>
  )
}

function PointPanel({ pt, onUpdate, nodeTemp, inSegs = [], globalParams, activeCalcId, alimentationParams, points = [], calcSubMode, pdcCumResults, pdcParams, levels = [], lineYs = [] }) {
  const set = (key, val) => onUpdate(pt.id, 'point', { [key]: val })
  const T_depart = globalParams?.T_depart ?? null
  const [showDims, setShowDims] = useState(false)

  const coteDef = getNodeDefaultCote(pt, levels, lineYs)
  const coteJsx = activeCalcId === 'alimentation-ecs' ? (
    <Field label="Cote" unit="m">
      <input type="number" step="0.01"
        value={pt.cote_override != null ? pt.cote_override : ''}
        placeholder={`${coteDef.toFixed(2)} (par défaut)`}
        onChange={e => set('cote_override', e.target.value === '' ? null : parseFloat(e.target.value))} />
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
        <Field label="Nom">
          <input value={pt.name ?? ''} onChange={e => set('name', e.target.value || null)} />
        </Field>
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

        {/* Dimensions */}
        <div style={{ marginTop: 8, borderTop: '1px solid #f3f4f6', paddingTop: 6 }}>
          <button
            onClick={() => setShowDims(v => !v)}
            style={{ fontSize: 10, color: '#9ca3af', background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span>{showDims ? '▲' : '▼'}</span> Dimensions
          </button>
          {showDims && (
            <Field label="Rayon" unit="px">
              <input type="number" min="8" max="40" step="1"
                value={pt.size ?? 12}
                onChange={e => set('size', Math.max(8, Math.min(40, +e.target.value)))} />
            </Field>
          )}
        </div>

        {/* Direction — sous les dimensions */}
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
      </div>
    )
  }

  if (pt.type === 'groupe') {
    const setEquip = (appId, val) => {
      const equip = { ...(pt.equipements ?? {}), [appId]: val || null }
      for (const k of Object.keys(equip)) { if (!equip[k]) delete equip[k] }
      set('equipements', equip)
    }
    const enabledAppareils = (activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef')
      ? (alimentationParams?.appareils ?? []).filter(a => a.enabled)
      : []
    return (
      <div className="rp-section">
        <h3 className="rp-title">Groupe de points de puisage</h3>
        <Field label="Nom">
          <input value={pt.name ?? ''} onChange={e => set('name', e.target.value || null)}
            placeholder="Nom du groupe..." />
        </Field>
        {coteJsx}
        {enabledAppareils.length > 0 && (<>
          <hr className="rp-divider" />
          <SectionLabel>Équipements</SectionLabel>
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
        <TempBadge temp={activeCalcId === 'alimentation-ecs' ? null : nodeTemp} T_depart={T_depart} />

      </div>
    )
  }

  if (pt.type === 'arriveeEF') {
    const arriveeEFs = points.filter(p => p.type === 'arriveeEF')
    const idx = arriveeEFs.findIndex(p => p.id === pt.id)
    const defaultName = `Arrivée EF n°${idx + 1}`
    return (
      <div className="rp-section">
        <h3 className="rp-title">Arrivée EF</h3>
        <Field label="Nom">
          <input value={pt.name ?? ''} onChange={e => set('name', e.target.value || null)}
            placeholder={defaultName} />
        </Field>
        {coteJsx}
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

        {activeCalcId === 'bouclage-ecs' && (
          <>
            {/* Champ T départ éditable — au-dessus des badges */}
            <Field label="T départ" unit="°C">
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="number"
                  step="0.5"
                  value={tOverride ?? ''}
                  placeholder={String(T_depart ?? 60)}
                  onChange={e => {
                    const v = e.target.value === '' ? null : parseFloat(e.target.value)
                    set('T_depart_override', v == null || isNaN(v) ? null : v)
                  }}
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
            {!isOverridden && (
              <div style={{ fontSize: 9, color: '#9ca3af', marginTop: -4, marginBottom: 6, paddingLeft: 2 }}>
                Valeur par défaut ({T_depart ?? 60} °C)
              </div>
            )}
            {isOverridden && (
              <div style={{ fontSize: 9, color: '#0369a1', marginTop: -4, marginBottom: 6, paddingLeft: 2 }}>
                Valeur locale — défaut global : {T_depart ?? 60} °C
              </div>
            )}
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

        {coteJsx}

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
                <input type="number" min="30" step="1"
                  value={pt.size?.w ?? 44}
                  onChange={e => set('size', { ...(pt.size ?? { w: 44, h: 28 }), w: Math.max(30, +e.target.value) })} />
              </Field>
              <Field label="Hauteur" unit="px">
                <input type="number" min="20" step="1"
                  value={pt.size?.h ?? 28}
                  onChange={e => set('size', { ...(pt.size ?? { w: 44, h: 28 }), h: Math.max(20, +e.target.value) })} />
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

      {nodeTemp != null && calcSubMode !== 'pdc' && (
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

      {/* Tronçons arrivants */}
      {inSegs.length > 0 && (
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
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
                    <div>
                      <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>Débit</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>
                        {s.flowRate != null ? s.flowRate.toFixed(3) + ' m³/h' : '—'}
                      </div>
                    </div>
                    {calcSubMode === 'pdc' && segCumDp != null ? (
                      <div>
                        <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>ΔP depuis Prod. ECS</div>
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
                      <div>
                        <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>T arrivée</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                          {s.T_to != null ? s.T_to.toFixed(2) + ' °C' : '—'}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              )
            })
          })()}
        </div>
      )}

      {inSegs.length === 0 && nodeTemp == null && calcSubMode !== 'pdc' && (
        <p className="lp-hint">Aucune propriété modifiable.</p>
      )}
    </div>
  )
}

function ValvePanel({ valve, onUpdate, valveKvResult, activeCalcId, segToCol }) {
  const isBouclage = activeCalcId === 'bouclage-ecs'
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
      <Field label="Nom">
        <input
          value={valve.name ?? ''}
          onChange={e => onUpdate(valve.id, { name: e.target.value })}
          placeholder="Nom de la vanne..."
        />
      </Field>

      {isBouclage && (
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px',
              background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6 }}>
              <span style={{ fontSize: 13 }}>★</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
                Circuit défavorisé — grand ouvert
              </span>
            </div>
          ) : (
            <>
              <div style={{ padding: '10px 12px', background: '#eff6ff',
                border: '1px solid #bfdbfe', borderRadius: 6, marginBottom: 10 }}>
                <div style={{ fontSize: 9, color: '#3b82f6', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.05em', marginBottom: 3 }}>Kv recommandé</div>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#1e40af',
                  fontFamily: 'ui-monospace, monospace' }}>
                  {r.kv != null ? r.kv.toFixed(2) : '—'}
                </span>
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
        <input type="number" min="20" step="10"
          value={width}
          onChange={e => {
            const w = Math.max(20, +e.target.value)
            set('x2', chaufferie.x1 + w)
          }} />
      </Field>

      <Field label="Hauteur" unit="px">
        <input type="number" min="20" step="10"
          value={height}
          onChange={e => set('height', Math.max(20, +e.target.value))} />
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

export default function RightPanel({
  calcSubMode,
  selectedIds, segments, points, onUpdate, materials, insulations,
  levels, lineYs, columns, columnXs, chaufferie, onChaufferieChange,
  editChaufferie, flowDirections, networkFlows, globalParams, thermalResults, roleMap,
  drawMode, onExitEditParams,
  selectedValveId, valves, onValveUpdate,
  activeCalcId, alimentationParams, alimentationResults,
  pdcParams, pdcResults, pdcCumResults, pdcCumAlimResults, segToCol, valveKvResults,
}) {
  // In editChaufferie mode, chaufferie panel takes priority
  if (editChaufferie && chaufferie?.placed) {
    return (
      <ChaufferiePanel
        chaufferie={chaufferie}
        onChange={onChaufferieChange}
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
      flowData={networkFlows?.get(seg.id)}
      globalParams={globalParams}
      thermalData={thermalResults?.segResults.get(seg.id)}
      roleMap={roleMap}
      drawMode={drawMode}
      onExitEditParams={onExitEditParams}
      activeCalcId={activeCalcId}
      alimentationData={alimentationResults?.get(seg.id)}
      pdcParams={pdcParams}
      pdcResult={pdcResults?.get(seg.id)}
      calcSubMode={calcSubMode}
      pdcCumResults={pdcCumResults}
      pdcCumAlimResults={pdcCumAlimResults}
      segToCol={segToCol}
    />
  )
  if (pt) {
    const inSegs = segments
      .filter(s => flowDirections?.get(s.id)?.toId === pt.id)
      .map(s => ({
        id: s.id,
        name: getDisplayName(s, segments, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(s.id), activeCalcId, roleMap),
        flowRate: networkFlows?.get(s.id)?.flowRate ?? null,
        T_to:     thermalResults?.segResults.get(s.id)?.T_to ?? null,
        type:     s.type,
      }))
    return (
      <PointPanel
        pt={pt} onUpdate={onUpdate}
        nodeTemp={calcSubMode === 'pdc' ? null : thermalResults?.nodeTemps.get(pt.id)}
        inSegs={inSegs}
        globalParams={globalParams}
        activeCalcId={activeCalcId}
        alimentationParams={alimentationParams}
        points={points}
        calcSubMode={calcSubMode}
        pdcCumResults={pdcCumResults}
        pdcParams={pdcParams}
        levels={levels}
        lineYs={lineYs}
      />
    )
  }

  return null
}
