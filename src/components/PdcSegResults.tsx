import { useState } from 'react'
import { sf } from '../utils/fmt'
import { FITTING_TYPES, EQUIPMENT_TYPES } from '../utils/pdcCalc'
import { Field, SectionLabel } from './rpShared'

export default function PdcSegResults({ pdcResult, pdcParams, seg, dnDef, flowData, alimentationData = null, cumDp, postJunction = false, segCol = null, isOnCriticalPath = false, criticalCol = null,
                         isAlimEcs = false, deltaH = null, dpStatic = null, pressionAval = null, pStatAval = null,
                         isTerminalGroupePuisage = false, buildingType = 'habitation' }) {
  const [showIter, setShowIter]     = useState(false)
  const [openLin, setOpenLin]       = useState(false)
  const [openSing, setOpenSing]     = useState(false)
  const [openEquip, setOpenEquip]   = useState(false)
  const [openStat, setOpenStat]     = useState(false)
  const [openDetail, setOpenDetail] = useState(false)

  const fmtPa = (v: number) => Math.abs(v) >= 10000
    ? `${(v / 1000).toFixed(2)} kPa`
    : `${Math.round(v)} Pa`
  const pct = (v: number) => pdcResult && pdcResult.dpTotal > 0
    ? `${Math.round(v / pdcResult.dpTotal * 100)} %`
    : '—'

  if (isAlimEcs && seg.type === 'retour') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Pression statique aval */}
        <div style={{ padding: '10px 12px', borderRadius: 8,
          background: '#fff', border: '1px solid #e5e7eb', textAlign: 'center' }}>
          <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
            textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
            Pression statique aval
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
            <span style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>
              {pStatAval != null ? (pStatAval / 100000).toFixed(2) : '—'}
            </span>
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
          </div>
        </div>
        {/* Hauteur statique */}
        {deltaH != null && dpStatic != null && (
          <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #94a3b8', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '7px 12px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6' }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: '#374151',
                textTransform: 'uppercase', letterSpacing: '0.05em' }}>Hauteur statique</span>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b',
                fontFamily: 'ui-monospace, monospace' }}>{fmtPa(dpStatic)}</span>
            </div>
            <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '2px 0', borderBottom: '1px solid #f3f4f6', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#6b7280' }}>Δh  (cote aval − cote amont)</span>
                <span style={{ fontSize: 10.5, fontWeight: 500, color: '#374151',
                  fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{deltaH.toFixed(2)} m</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '4px 0', marginTop: 4, gap: 6 }}>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>ΔP_stat = ρ · g · Δh</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b',
                  fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{fmtPa(dpStatic)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

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
  const Q     = isAlimEcs
    ? (alimentationData?.flowRateForPdc != null && alimentationData.flowRateForPdc > 0
        ? alimentationData.flowRateForPdc * 3.6 : null)
    : (flowData?.flowRate ?? null)
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

  const row = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '2px 0', borderBottom: '1px solid #f3f4f6', gap: 6 }}>
      <span style={{ fontSize: 10, color: '#6b7280', minWidth: 0 }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 500, color: '#374151',
        fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
    </div>
  )
  const rowBlack = (label: string, value: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '2px 0', borderBottom: '1px solid #f3f4f6', gap: 6 }}>
      <span style={{ fontSize: 10, color: '#111827', minWidth: 0 }}>{label}</span>
      <span style={{ fontSize: 10.5, fontWeight: 500, color: '#111827',
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
    <div style={{ marginTop: 10 }}>
      <button onClick={() => setOpenDetail(o => !o)} style={{
        background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer',
        fontSize: 9, color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500,
      }}>
        <span style={{ display: 'inline-block', fontSize: 7,
          transform: openDetail ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>▶</span>
        Données techniques
      </button>
      {openDetail && (
        <div style={{ fontSize: 9, color: '#9ca3af', lineHeight: 2,
          fontFamily: 'ui-monospace, monospace', paddingLeft: 12, marginTop: 2 }}>
          {children}
        </div>
      )}
    </div>
  )
  const cardHeader = (title: string, value: React.ReactNode, pctVal: string, color: string, light: string, onClick?: () => void) => (
    <div onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 12px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6',
      cursor: onClick ? 'pointer' : 'default', userSelect: 'none' }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#374151',
        textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
        <span style={{ fontSize: 9.5, color: light }}>{pctVal}</span>
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
            const p = pressionAval
            const isHabitation = buildingType === 'habitation'
            const err3mCE   = p != null && p < 30000
            const err1bar   = p != null && isTerminalGroupePuisage && isHabitation && p < 100000
            const isErr  = err3mCE || err1bar
            const valCol = isErr ? '#dc2626' : '#0f172a'
            const bg     = isErr ? '#fef2f2' : '#fff'
            const border = isErr ? '#fca5a5' : '#e5e7eb'
            const hint   = p == null ? null
              : p < 0       ? 'Pression négative — eau n\'atteint pas ce point'
              : err3mCE     ? '< 0,3 bar — insuffisant (≈ 3 mCE réglementaire)'
              : err1bar     ? '< 1 bar — insuffisant à l\'entrée du logement'
              : isTerminalGroupePuisage && isHabitation ? '≥ 1 bar'
              : '≥ 0,3 bar'
            const hintCol = isErr ? '#dc2626' : '#16a34a'
            return (
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: bg, border: `1px solid ${border}`, textAlign: 'center' }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Pression disponible aval
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: valCol }}>
                    {p != null ? (p / 100000).toFixed(2) : '—'}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                </div>
                {hint && (
                  <div style={{ fontSize: 9, marginTop: 2, color: hintCol, fontWeight: 700, textAlign: 'center' }}>{hint}</div>
                )}
                {p != null && pdcResult && (
                  <div style={{ marginTop: 2, paddingTop: 2, borderTop: '1px solid #f1f5f9', textAlign: 'center', lineHeight: 1 }}>
                    <span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 500 }}>amont · </span>
                    <span style={{ fontSize: 8.5, fontWeight: 600, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                      {((p + pdcResult.dpTotal + (dpStatic ?? 0)) / 100000).toFixed(2)} bar
                    </span>
                  </div>
                )}
              </div>
            )
          })()}
          {/* Pression statique aval */}
          {(() => {
            const over = pStatAval != null && pStatAval > 400000 && isTerminalGroupePuisage
            return (
              <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8,
                background: over ? '#fef2f2' : '#fff', border: `1px solid ${over ? '#fecaca' : '#e5e7eb'}`, textAlign: 'center' }}>
                <div style={{ fontSize: 8.5, fontWeight: 700, color: '#6b7280',
                  textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
                  Pression statique aval
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, justifyContent: 'center' }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: over ? '#dc2626' : '#0f172a' }}>
                    {pStatAval != null ? (pStatAval / 100000).toFixed(2) : '—'}
                  </span>
                  <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>bar</span>
                </div>
                {isTerminalGroupePuisage && (
                  <div style={{ fontSize: 9, marginTop: 2, textAlign: 'center',
                    color: over ? '#dc2626' : '#16a34a', fontWeight: over ? 700 : 600 }}>
                    {over ? '> 4 bar — réducteur de pression requis' : '≤ 4 bar'}
                  </div>
                )}
                {pStatAval != null && dpStatic != null && (
                  <div style={{ marginTop: 2, paddingTop: 2, borderTop: '1px solid #f1f5f9', textAlign: 'center', lineHeight: 1 }}>
                    <span style={{ fontSize: 8, color: '#94a3b8', fontWeight: 500 }}>amont · </span>
                    <span style={{ fontSize: 8.5, fontWeight: 600, color: '#94a3b8', fontFamily: 'ui-monospace, monospace' }}>
                      {((pStatAval + dpStatic) / 100000).toFixed(2)} bar
                    </span>
                  </div>
                )}
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

      {/* ── Bouclage ECS : ΔP Total tronçon (carte principale) ── */}
      {!isAlimEcs && (() => {
        const majoré = pdcResult.dpPompe != null
        const displayVal = majoré ? pdcResult.dpPompe! : pdcResult.dpTotal
        return (
          <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase',
                  letterSpacing: '0.06em', marginBottom: 4 }}>ΔP Total tronçon</div>
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

      {/* ── Séparateur "Détail" ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '2px 0' }}>
        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase',
          letterSpacing: '0.06em' }}>Détail</span>
        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
      </div>

      {/* ── Alimentation ECS : carte récap "Pertes du tronçon" (dans Détail) ── */}
      {isAlimEcs && (() => {
        const dpFriction = pdcResult.dpTotal
        const dpStat     = dpStatic ?? 0
        const total      = dpFriction + dpStat
        const majoré     = pdcResult.dpPompe != null
        return (
          <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #374151', borderRadius: 8, overflow: 'hidden' }}>
            {cardHeader('Pertes du tronçon', fmtPNode(total), '', '#111827', '#374151')}
            <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {/* Barre 4 couleurs */}
              {total > 0 && (
                <div style={{ height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', gap: 2, marginBottom: 4 }}>
                  <div style={{ flex: pdcResult.dpReg, background: '#2563eb', borderRadius: 3 }} />
                  <div style={{ flex: pdcResult.dpSing, background: '#c2562d', borderRadius: 3 }} />
                  {pdcResult.dpEquip > 0 && <div style={{ flex: pdcResult.dpEquip, background: '#7c3aed', borderRadius: 3 }} />}
                  {dpStat > 0 && <div style={{ flex: dpStat, background: '#94a3b8', borderRadius: 3 }} />}
                </div>
              )}
              {rowBlack('ΔP frottement', fmtP(dpFriction))}
              {rowBlack('ΔP hauteur statique', dpStatic != null ? fmtP(dpStat) : '—')}
              {majoré && rowBlack(`ΔP frottement majoré (+${pdcParams?.coefPompe ?? 10} %)`, fmtP(pdcResult.dpPompe!))}
            </div>
          </div>
        )
      })()}

      {/* ── Pertes linéaires ── */}
      <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #2563eb', borderRadius: 8, overflow: 'hidden' }}>
        {cardHeader('Pertes linéaires', fmtPNode(pdcResult.dpReg), pct(pdcResult.dpReg), '#2563eb', '#93c5fd', () => setOpenLin(v => !v))}
        {openLin && <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
            'ΔP_lin = J×L',
            `${pdcResult.J.toFixed(1)}×${L != null ? L.toFixed(1) : '—'} = ${fmtP(pdcResult.dpReg)}`,
            '#2563eb'
          )}
        </div>}
      </div>

      {/* ── Pertes singulières ── */}
      <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #c2562d', borderRadius: 8, overflow: 'hidden' }}>
        {cardHeader('Pertes singulières', fmtPNode(pdcResult.dpSing), pct(pdcResult.dpSing), '#c2562d', '#fca38a', () => setOpenSing(v => !v))}
        {openSing && <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
            {pdcParams?.methodeSing === 'pourcentage'
              ? `Forfaitaire — ${pdcParams.pourcentageSing ?? 20} % des pertes linéaires`
              : 'Par accessoires — ξ × ρV²/2'}
          </div>
          {pdcParams?.methodeSing === 'pourcentage'
            ? (<>
                {row(`ΔP_lin × ${pdcParams.pourcentageSing ?? 20} %`, `${Math.round(pdcResult.dpReg)} × ${((pdcParams.pourcentageSing ?? 20) / 100).toFixed(2)}`)}
                {resultRow('ΔP_sing', fmtP(pdcResult.dpSing), '#c2562d')}
              </>)
            : (() => {
                const fittings: any[] = seg.fittings ?? []
                const active = fittings.filter(f => (f.count ?? 0) > 0)
                return (<>
                  {row('ρV²/2  (pression dynamique)', fmtP(dynPressure))}
                  {active.length === 0
                    ? <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', padding: '3px 0' }}>Aucun accessoire renseigné</div>
                    : active.map(f => {
                        const def = FITTING_TYPES.find(t => t.id === f.type)
                        const xi  = f.xiOverride ?? def?.xi ?? 0
                        const dp  = xi * (f.count ?? 1) * dynPressure
                        return row(`${f.count}× ${def?.label ?? f.type}  (ξ = ${xi})`, fmtP(dp))
                      })
                  }
                  {active.length > 0 && resultRow('ΔP_sing = Σ', fmtP(pdcResult.dpSing), '#c2562d')}
                </>)
              })()
          }
        </div>}
      </div>

      {/* ── Équipements ── */}
      {pdcParams?.equipementsActifs && (
        <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #7c3aed', borderRadius: 8, overflow: 'hidden' }}>
          {cardHeader('Équipements', fmtPNode(pdcResult.dpEquip), pct(pdcResult.dpEquip), '#7c3aed', '#c4b5fd', () => setOpenEquip(v => !v))}
          {openEquip && <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
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
                  return row(`${def?.label ?? e.type}`, dp != null ? fmtP(dp) : 'Kv manquant')
                })}
                {resultRow('ΔP_équip = Σ', fmtP(pdcResult.dpEquip), '#7c3aed')}
              </>)
            })()}
          </div>}
        </div>
      )}

      {/* ── Hauteur statique (alimentation ECS — après équipements) ── */}
      {isAlimEcs && (dpStatic != null || deltaH != null) && (
        <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #94a3b8', borderRadius: 8, overflow: 'hidden' }}>
          {cardHeader('Hauteur statique', fmtPNode(dpStatic ?? 0), '—', '#64748b', '#94a3b8', () => setOpenStat(v => !v))}
          {openStat && <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {row('Δh  (cote aval − cote amont)', deltaH != null ? `${deltaH.toFixed(2)} m` : '—')}
            {resultRow('ΔP_stat = ρ·g·Δh', dpStatic != null ? fmtP(dpStatic) : '—', '#64748b')}
          </div>}
        </div>
      )}

      {/* ── Données techniques ── */}
      {techBox(<>
        {Q != null && <div>Q  = {Q.toFixed(3)} m³/h</div>}
        <div>di = {di_mm != null ? `${di_mm} mm` : '—'}</div>
        <div>V  = {pdcResult.V.toFixed(3)} m/s</div>
        {L != null && <div>L  = {L.toFixed(1)} m</div>}
        {pdcResult.epsilon_used != null && <div>ε  = {pdcResult.epsilon_used} m</div>}
        <div>T  = {pdcResult.T_used.toFixed(1)} °C</div>
        {isAlimEcs && <div>g  = 9.81 m/s²</div>}
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
