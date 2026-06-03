import { useState } from 'react'
import { getDisplayName } from '../utils/naming'
import { computeSegUI, getSegAmbTemp } from '../utils/thermalCalc'

function Field({ label, unit, children }) {
  return (
    <div className="lp-field">
      <label className="lp-label">
        {label}{unit && <span className="lp-unit"> ({unit})</span>}
      </label>
      {children}
    </div>
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

function segSousSol(seg, levels, lineYs) {
  if (!seg.vertices?.length) return false
  const midY = seg.vertices.reduce((s, v) => s + v.y, 0) / seg.vertices.length
  for (let i = 0; i < levels.length; i++) {
    const yBot = lineYs[i], yTop = lineYs[i + 1]
    if (yTop !== undefined && midY >= yTop && midY <= yBot) return !!levels[i].isSousSol
  }
  return false
}

function SegmentPanel({ seg, onUpdate, materials, insulations, allSegs, levels, lineYs, columns, columnXs, chaufferie, points, flowData, globalParams, thermalData }) {
  const [tab, setTab] = useState('params')
  const set = (key, val) => onUpdate(seg.id, 'segment', { [key]: val })

  const enabledMats = materials.filter(m => m.enabled)
  const enabledIns  = insulations.filter(i => i.enabled)
  const selMat      = materials.find(m => m.id === seg.materialId)
  const selIns      = insulations.find(i => i.id === seg.insulationId)
  const dnDef       = selMat?.dns.find(d => d.dn === seg.dn)

  const isDefault   = !seg.name
  const displayName = getDisplayName(seg, allSegs, levels, lineYs, columns, columnXs, chaufferie, points)

  const he = globalParams?.he ?? 10
  const uiValue = computeSegUI(seg, materials, insulations, he)

  return (
    <div className="rp-section">
      <h3 className="rp-title">📐 Tronçon</h3>

      {/* Tab toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {[['params', 'Paramètres'], ['results', 'Résultats']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
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
          {thermalData ? (() => {
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

            const isSS       = segSousSol(seg, levels, lineYs)
            const dtFromProd = T_depart - T_to
            const isRetour   = seg.type === 'retour'
            const prodECS    = points?.find(p => p.type === 'productionECS')
            const isLinkedToProdECS = prodECS != null
              && (seg.startPointId === prodECS.id || seg.endPointId === prodECS.id)

            const DtuAlert = ({ msg }) => (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 4,
                padding: '3px 7px', background: '#fef2f2',
                border: '1px solid #fecaca', borderRadius: 4, fontSize: 10 }}>
                <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>⚠</span>
                <span style={{ color: '#b91c1c', fontWeight: 500 }}>{msg}</span>
                <span style={{ color: '#9ca3af', fontSize: 9, marginLeft: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }}>NF DTU 60.11</span>
              </div>
            )

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

                {/* ── Températures ── */}
                <div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[['T° amont', T_from], ['T° aval', T_to]].map(([label, val]) => (
                      <div key={label} style={{ flex: 1, padding: '9px 8px', background: '#fffbeb',
                        border: '1px solid #fde68a', borderRadius: 6, textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: '#a16207', fontWeight: 700, marginBottom: 3,
                          textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</div>
                        <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', lineHeight: 1 }}>
                          {val.toFixed(2)}
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>°C</div>
                      </div>
                    ))}
                  </div>
                  {T_to < 50 && (
                    <DtuAlert msg="T° < 50 °C en tout point — risque de développement de Légionelles" />
                  )}
                </div>

                {/* ΔT depuis départ */}
                <div>
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>
                    ΔT depuis départ :{' '}
                    <span style={{ fontWeight: 700, color: dtFromProd > 5 && isRetour && isLinkedToProdECS ? '#dc2626' : '#374151' }}>
                      {dtFromProd.toFixed(2)} K
                    </span>
                    <span style={{ color: '#9ca3af', marginLeft: 5, fontSize: 10 }}>
                      ({T_depart.toFixed(0)} → {T_to.toFixed(2)} °C)
                    </span>
                  </div>
                  {dtFromProd > 5 && isRetour && isLinkedToProdECS && (
                    <DtuAlert msg={`ΔT depuis départ = ${dtFromProd.toFixed(1)} °C > 5 °C — pertes thermiques excessives`} />
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
                    <DtuAlert msg="Vitesse < 0,2 m/s — risque de dépôts et d'entartrage" />
                  )}
                  {isRetour && velocity != null && velocity > (isSS ? 1 : 0.5) && (
                    <DtuAlert msg={`Vitesse > ${isSS ? '1' : '0,5'} m/s${isSS ? ' (sous-sol)' : ''} — risque de bruit`} />
                  )}
                </div>

                {/* ── Débit · UI · Pertes ── */}
                <div style={{ border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1px 1fr 1px 1fr' }}>
                    {[
                      { label: 'Débit',  value: flowRate != null ? flowRate.toFixed(3) : '—', unit: 'm³/h'   },
                      { label: 'UI',     value: uiValue  != null ? uiValue.toFixed(4)  : '—', unit: 'W/(m·K)' },
                      { label: 'Pertes', value: Q.toFixed(1),                                  unit: 'W'      },
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
                    <div>T amb = {T_amb.toFixed(1)} °C · ΔT tronçon = {Math.abs(deltaT).toFixed(3)} K</div>
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
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{velocity.toFixed(3)}</span>
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
                      <span style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{uiValue.toFixed(4)}</span>
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

      {tab === 'params' && <>
      {/* Identification */}
      <SectionLabel>Identification</SectionLabel>
      <div className="lp-field">
        <label className="lp-label">Nom automatique</label>
        <div style={{
          fontSize: 12, lineHeight: 1.5, padding: '4px 7px',
          background: isDefault ? '#f5f3ff' : '#f9fafb',
          border: `1px solid ${isDefault ? '#e4dff5' : '#e5e7eb'}`,
          borderRadius: 4, marginBottom: 5, wordBreak: 'break-word',
          color: '#111827',
        }}>
          {displayName}
        </div>
        <input
          value={seg.name ?? ''}
          onChange={e => set('name', e.target.value || null)}
          placeholder="Nom personnalisé (optionnel)..."
        />
        {isDefault
          ? <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, display: 'block' }}>généré automatiquement</span>
          : <span style={{ fontSize: 10, color: '#6b7280', marginTop: 2, display: 'block' }}>personnalisé · effacez pour rétablir le défaut</span>
        }
      </div>

      <hr className="rp-divider" />

      {/* Hydraulique */}
      <SectionLabel>Hydraulique</SectionLabel>
      <Field label="Longueur" unit="m">
        <input type="number" min="0"
          value={seg.length_override ?? ''}
          placeholder="saisie manuelle"
          onChange={e => set('length_override', e.target.value === '' ? null : +e.target.value)} />
      </Field>

      {/* Débit / Vitesse */}
      {(() => {
        const di_mm  = seg.di_override ?? dnDef?.di ?? null
        const area   = di_mm ? Math.PI * (di_mm / 1000) ** 2 / 4 : null
        const hasManualQ = seg.flowRate != null
        const hasManualV = seg.velocity != null
        const hasManual  = hasManualQ || hasManualV
        const resolved   = flowData

        const qPlaceholder = hasManualV && area
          ? (seg.velocity * area * 3600).toFixed(3)
          : (!hasManual && resolved?.flowRate != null)
          ? `Calculé : ${resolved.flowRate.toFixed(3)}`
          : 'm³/h'

        const vPlaceholder = hasManualQ && area
          ? (seg.flowRate / (area * 3600)).toFixed(3)
          : (!hasManual && resolved?.velocity != null)
          ? `Calculé : ${resolved.velocity.toFixed(3)}`
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

      {(seg.flowRate != null || seg.velocity != null || flowData?.source === 'computed') && (
        <label className="lp-checkbox-label" style={{ marginTop: 4, marginBottom: 2 }}>
          <input type="checkbox"
            checked={!!seg.showFlowRate}
            onChange={e => set('showFlowRate', e.target.checked || null)} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>Afficher le débit / vitesse sur le schéma</span>
        </label>
      )}

      <hr className="rp-divider" />

      {/* Réseau ECS */}
      <SectionLabel>Réseau ECS</SectionLabel>
      <Field label="Type de tronçon">
        <select value={seg.type} onChange={e => set('type', e.target.value)}>
          <option value="aller">Aller ECS</option>
          <option value="retour">Retour ECS</option>
        </select>
      </Field>

      <hr className="rp-divider" />

      {/* Canalisation */}
      <SectionLabel>Canalisation</SectionLabel>
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

      {/* Affichage schéma — bas de section Canalisation */}
      {seg.dn && (
        <label className="lp-checkbox-label" style={{ marginTop: 6 }}>
          <input type="checkbox"
            checked={!!seg.showDN}
            onChange={e => set('showDN', e.target.checked || null)} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>Afficher le DN sur le schéma</span>
        </label>
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

      </>}

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
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ padding: '7px 10px', background: '#fffbeb',
        border: '1px solid #fde68a', borderRadius: 6 }}>
        <div style={{ fontSize: 9, color: '#a16207', fontWeight: 700, marginBottom: 3,
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>Température au nœud</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>{temp.toFixed(2)}</span>
          <span style={{ fontSize: 10, color: '#9ca3af' }}>°C</span>
        </div>
      </div>
      {dT != null && (
        <div style={{ marginTop: 2, textAlign: 'center', fontSize: 10, color: '#6b7280' }}>
          ΔT depuis départ : <span style={{ fontWeight: 700, color: '#374151' }}>{dT.toFixed(2)} K</span>
        </div>
      )}
    </div>
  )
}

function PointPanel({ pt, onUpdate, nodeTemp, inSegs = [], globalParams }) {
  const set = (key, val) => onUpdate(pt.id, 'point', { [key]: val })
  const T_depart = globalParams?.T_depart ?? null

  if (pt.type === 'pump') {
    return (
      <div className="rp-section">
        <h3 className="rp-title">Pompe</h3>
        <Field label="Nom">
          <input value={pt.name ?? ''} onChange={e => set('name', e.target.value || null)} />
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
        <Field label="Rayon" unit="px">
          <input type="number" min="8" max="40" step="1"
            value={pt.size ?? 12}
            onChange={e => set('size', Math.max(8, Math.min(40, +e.target.value)))} />
        </Field>
        <TempBadge temp={nodeTemp} T_depart={T_depart} />
      </div>
    )
  }

  if (pt.type === 'groupe') {
    return (
      <div className="rp-section">
        <h3 className="rp-title">Groupe de points de puisage</h3>
        <Field label="Nom">
          <input value={pt.name ?? ''} onChange={e => set('name', e.target.value || null)}
            placeholder="Nom du groupe..." />
        </Field>
        <label className="lp-checkbox-label" style={{ marginTop: 4 }}>
          <input type="checkbox" checked={!!pt.showName}
            onChange={e => set('showName', e.target.checked)} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>Afficher le nom sur le schéma</span>
        </label>
        <TempBadge temp={nodeTemp} T_depart={T_depart} />
      </div>
    )
  }

  if (pt.type === 'productionECS') {
    return (
      <div className="rp-section">
        <h3 className="rp-title">Production ECS</h3>
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
        <TempBadge temp={nodeTemp} T_depart={T_depart} />
      </div>
    )
  }

  // ── Nœud de jonction ────────────────────────────────────────────
  const dT_depuis_depart = nodeTemp != null && T_depart != null ? nodeTemp - T_depart : null

  return (
    <div className="rp-section">
      <h3 className="rp-title">Nœud</h3>

      {nodeTemp != null ? (
        <>
          <div style={{ padding: '9px 10px', background: '#fffbeb',
            border: '1px solid #fde68a', borderRadius: 6 }}>
            <div style={{ fontSize: 9, color: '#a16207', fontWeight: 700, marginBottom: 3,
              textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Température au nœud
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: '#111827' }}>
                {nodeTemp.toFixed(2)}
              </span>
              <span style={{ fontSize: 11, color: '#9ca3af' }}>°C</span>
            </div>
          </div>
          {dT_depuis_depart != null && (
            <div style={{ marginTop: 3, textAlign: 'center', fontSize: 10, color: '#6b7280' }}>
              ΔT depuis départ :{' '}
              <span style={{ fontWeight: 700, color: '#374151' }}>{dT_depuis_depart.toFixed(2)} K</span>
              <span style={{ color: '#9ca3af', marginLeft: 5 }}>
                ({T_depart.toFixed(0)} → {nodeTemp.toFixed(2)} °C)
              </span>
            </div>
          )}
        </>
      ) : (
        <p className="lp-hint" style={{ marginBottom: 8 }}>
          Température non calculée — vérifiez longueur, débit et données matériau des tronçons amont.
        </p>
      )}

      {/* Tronçons arrivants */}
      {inSegs.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {inSegs.length > 1 && (
            <SectionLabel>Tronçons arrivants ({inSegs.length})</SectionLabel>
          )}
          {inSegs.map(s => (
            <div key={s.id} style={{ padding: '8px 10px', background: '#f9fafb',
              border: '1px solid #e5e7eb', borderRadius: 5, marginBottom: 5 }}>
              {/* Nom sur autant de lignes que nécessaire */}
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
                <div>
                  <div style={{ fontSize: 9, color: '#9ca3af', marginBottom: 1 }}>T arrivée</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>
                    {s.T_to != null ? s.T_to.toFixed(2) + ' °C' : '—'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {inSegs.length === 0 && nodeTemp == null && (
        <p className="lp-hint">Aucune propriété modifiable.</p>
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
      <h3 className="rp-title">Zone chaufferie</h3>

      <label className="lp-checkbox-label" style={{ marginBottom: 8 }}>
        <input type="checkbox"
          checked={!!chaufferie.enabled}
          onChange={e => set('enabled', e.target.checked)} />
        <span style={{ fontSize: 11, color: '#374151' }}>Afficher la chaufferie</span>
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
          Supprimer la chaufferie
        </button>
      </div>
    </div>
  )
}

export default function RightPanel({
  selectedIds, segments, points, onUpdate, materials, insulations,
  levels, lineYs, columns, columnXs, chaufferie, onChaufferieChange,
  editChaufferie, flowDirections, networkFlows, globalParams, thermalResults,
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
    />
  )
  if (pt) {
    const inSegs = segments
      .filter(s => flowDirections?.get(s.id)?.toId === pt.id)
      .map(s => ({
        id: s.id,
        name: getDisplayName(s, segments, levels, lineYs, columns, columnXs, chaufferie, points),
        flowRate: networkFlows?.get(s.id)?.flowRate ?? null,
        T_to:     thermalResults?.segResults.get(s.id)?.T_to ?? null,
        type:     s.type,
      }))
    return (
      <PointPanel
        pt={pt} onUpdate={onUpdate}
        nodeTemp={thermalResults?.nodeTemps.get(pt.id)}
        inSegs={inSegs}
        globalParams={globalParams}
      />
    )
  }

  return null
}
