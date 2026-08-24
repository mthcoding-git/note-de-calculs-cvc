import { useState } from 'react'
import { FITTING_TYPES, EQUIPMENT_TYPES } from '../utils/pdcCalc'
import type { VentSegResult } from '../utils/ventilationCalc'

export default function VentPdcResults({ vr, pdcParams, seg }: {
  vr: VentSegResult
  pdcParams: any
  seg: any
}) {
  const [openLin,    setOpenLin]    = useState(false)
  const [openSing,   setOpenSing]   = useState(false)
  const [openEquip,  setOpenEquip]  = useState(false)
  const [openDetail, setOpenDetail] = useState(false)

  const L    = seg.length_override ?? null
  const hasL = L != null && L > 0

  const fmtPa   = (v: number) => `${Math.round(v)} Pa`
  const pct     = (v: number) => vr.dp_total_Pa > 0
    ? `${Math.round(v / vr.dp_total_Pa * 100)} %` : '—'
  const dynP    = 0.5 * vr.rho * vr.v_ms ** 2

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
      <span style={{ fontSize: 11, fontWeight: 700, color,
        fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>{value}</span>
    </div>
  )
  const cardHeader = (title: string, value: string, pctVal: string, color: string, light: string, onClick?: () => void) => (
    <div onClick={onClick} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '7px 12px', background: '#f9fafb', borderBottom: '1px solid #f3f4f6',
      cursor: onClick ? 'pointer' : 'default', userSelect: 'none' as const }}>
      <span style={{ fontSize: 9.5, fontWeight: 700, color: '#374151',
        textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>{title}</span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexShrink: 0, whiteSpace: 'nowrap' as const }}>
        <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
        <span style={{ fontSize: 9.5, color: light }}>{pctVal}</span>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── ΔP Total tronçon ── */}
      {hasL ? (
        <div style={{ padding: '10px 14px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 9, color: '#64748b', fontWeight: 700, textTransform: 'uppercase' as const,
                letterSpacing: '0.06em', marginBottom: 4 }}>ΔP Total tronçon</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>
                  {Math.round(vr.dp_total_Pa)}
                </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>Pa</span>
              </div>
            </div>
            <div style={{ fontSize: 10, textAlign: 'right' as const, lineHeight: 1.9 }}>
              <div style={{ color: '#2563eb' }}>lin. {fmtPa(vr.dp_Pa)}</div>
              {vr.dp_sing_Pa > 0 && <div style={{ color: '#c2562d' }}>sing. {fmtPa(vr.dp_sing_Pa)}</div>}
              {vr.dp_equip_Pa > 0 && <div style={{ color: '#7c3aed' }}>équip. {fmtPa(vr.dp_equip_Pa)}</div>}
            </div>
          </div>
          {vr.dp_total_Pa > 0 && (
            <div style={{ marginTop: 10, height: 5, borderRadius: 3, overflow: 'hidden', display: 'flex', gap: 2 }}>
              {vr.dp_Pa     > 0 && <div style={{ flex: vr.dp_Pa,     background: '#2563eb', borderRadius: 3 }} />}
              {vr.dp_sing_Pa  > 0 && <div style={{ flex: vr.dp_sing_Pa,  background: '#c2562d', borderRadius: 3 }} />}
              {vr.dp_equip_Pa > 0 && <div style={{ flex: vr.dp_equip_Pa, background: '#7c3aed', borderRadius: 3 }} />}
            </div>
          )}
        </div>
      ) : (
        <p className="lp-hint">Saisir une longueur pour calculer ΔP total.</p>
      )}

      {/* ── Séparateur ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
        <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase' as const,
          letterSpacing: '0.06em' }}>Détail</span>
        <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
      </div>

      {/* ── Pertes linéaires ── */}
      <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #2563eb', borderRadius: 8, overflow: 'hidden' }}>
        {cardHeader('Pertes linéaires', hasL ? fmtPa(vr.dp_Pa) : '—', hasL ? pct(vr.dp_Pa) : '—', '#2563eb', '#93c5fd', () => setOpenLin(v => !v))}
        {openLin && (
          <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Darcy-Weisbach + Swamee-Jain</div>
            {row('Re', vr.Re.toFixed(0))}
            {row('J', `${vr.dp_Pa_m.toFixed(2)} Pa/m`)}
            {resultRow(
              hasL ? 'ΔP_lin = J × L' : 'J (longueur manquante)',
              hasL
                ? `${vr.dp_Pa_m.toFixed(2)} × ${(L as number).toFixed(1)} = ${fmtPa(vr.dp_Pa)}`
                : `${vr.dp_Pa_m.toFixed(2)} Pa/m`,
              '#2563eb'
            )}
          </div>
        )}
      </div>

      {/* ── Pertes singulières ── */}
      <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #c2562d', borderRadius: 8, overflow: 'hidden' }}>
        {cardHeader('Pertes singulières', fmtPa(vr.dp_sing_Pa), pct(vr.dp_sing_Pa), '#c2562d', '#fca38a', () => setOpenSing(v => !v))}
        {openSing && (
          <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4 }}>Singularités — ξ × ρv²/2</div>
            {row('ρv²/2 (pression dynamique)', `${dynP.toFixed(1)} Pa`)}
            {(() => {
              const fittings: any[]    = seg.fittings ?? []
              const libOverrides       = pdcParams?.fittingOverrides ?? {}
              const customF: any[]     = pdcParams?.customFittings ?? []
              const allF               = [
                ...FITTING_TYPES,
                ...customF.map((t: any) => ({ id: t.id, label: t.label, xi: t.xi })),
              ]
              const active = fittings.filter(f => (f.count ?? 0) > 0)
              if (active.length === 0) return (
                <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', padding: '3px 0' }}>
                  Aucun accessoire renseigné
                </div>
              )
              return (<>
                {active.map(f => {
                  const def = allF.find(t => t.id === f.type)
                  const xi  = f.xiOverride ?? libOverrides[f.type] ?? def?.xi ?? 0
                  const dp  = xi * (f.count ?? 1) * dynP
                  return row(`${f.count}× ${def?.label ?? f.type}  (ξ = ${xi})`, fmtPa(dp))
                })}
                {resultRow('ΔP_sing = Σ', fmtPa(vr.dp_sing_Pa), '#c2562d')}
              </>)
            })()}
          </div>
        )}
      </div>

      {/* ── Équipements ── */}
      {pdcParams?.equipementsActifs && (
        <div style={{ border: '1px solid #e5e7eb', borderLeft: '3px solid #7c3aed', borderRadius: 8, overflow: 'hidden' }}>
          {cardHeader('Équipements', fmtPa(vr.dp_equip_Pa), pct(vr.dp_equip_Pa), '#7c3aed', '#c4b5fd', () => setOpenEquip(v => !v))}
          {openEquip && (
            <div style={{ padding: '8px 12px', background: '#fff', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(() => {
                const equipment: any[] = seg.equipment ?? []
                const libOverrides     = pdcParams?.equipmentOverrides ?? {}
                const customE: any[]   = pdcParams?.customEquipments ?? []
                const allE             = [
                  ...EQUIPMENT_TYPES,
                  ...customE.map((t: any) => ({ id: t.id, label: t.label, dpDefault: t.dpDefault })),
                ]
                if (equipment.length === 0) return (
                  <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', padding: '3px 0' }}>
                    Aucun équipement configuré
                  </div>
                )
                return (<>
                  {equipment.map(e => {
                    const def = allE.find(t => t.id === e.type)
                    const dp  = e.dpOverride ?? libOverrides[e.type] ?? (def as any)?.dpDefault ?? null
                    return row(def?.label ?? e.type, dp != null ? fmtPa(dp) : '— (ΔP requis)')
                  })}
                  {resultRow('ΔP_équip = Σ', fmtPa(vr.dp_equip_Pa), '#7c3aed')}
                </>)
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── Données techniques ── */}
      <div style={{ marginTop: 4 }}>
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
            <div>Q = {vr.Q_m3h.toFixed(0)} m³/h</div>
            {vr.shape === 'rectangular' && vr.a_mm && vr.b_mm ? (<>
              <div>Section = {vr.a_mm} × {vr.b_mm} mm</div>
              <div>Dh = {vr.di_mm.toFixed(0)} mm</div>
            </>) : (
              <div>di = {vr.di_mm.toFixed(1)} mm</div>
            )}
            <div>v = {vr.v_ms.toFixed(2)} m/s</div>
            {hasL && <div>L = {(L as number).toFixed(1)} m</div>}
            <div>T = {vr.T_air.toFixed(0)} °C</div>
            <div>ρ = {vr.rho.toFixed(3)} kg/m³</div>
          </div>
        )}
      </div>

    </div>
  )
}
