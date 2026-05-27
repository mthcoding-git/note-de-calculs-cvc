import { getDisplayName } from '../utils/naming'

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

function SegmentPanel({ seg, onUpdate, materials, insulations, allSegs, levels, lineYs, columns, columnXs, chaufferie, points, flowData }) {
  const set = (key, val) => onUpdate(seg.id, 'segment', { [key]: val })

  const enabledMats = materials.filter(m => m.enabled)
  const enabledIns  = insulations.filter(i => i.enabled)
  const selMat      = materials.find(m => m.id === seg.materialId)
  const selIns      = insulations.find(i => i.id === seg.insulationId)
  const dnDef       = selMat?.dns.find(d => d.dn === seg.dn)

  const isDefault   = !seg.name
  const displayName = getDisplayName(seg, allSegs, levels, lineYs, columns, columnXs, chaufferie, points)


  const SectionLabel = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
      letterSpacing: '0.05em', marginBottom: 5, marginTop: 2 }}>
      {children}
    </div>
  )

  return (
    <div className="rp-section">
      <h3 className="rp-title">📐 Tronçon</h3>

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

    </div>
  )
}

const DIR_BTNS = [
  { label: '←', rot: 180, title: 'Vers la gauche' },
  { label: '↑', rot: 270, title: 'Vers le haut' },
  { label: '→', rot: 0,   title: 'Vers la droite' },
  { label: '↓', rot: 90,  title: 'Vers le bas' },
]

function PointPanel({ pt, onUpdate }) {
  const set = (key, val) => onUpdate(pt.id, 'point', { [key]: val })

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
      </div>
    )
  }

  return (
    <div className="rp-section">
      <h3 className="rp-title">Nœud</h3>
      <p className="lp-hint">Aucune propriété modifiable sur ce nœud.</p>
    </div>
  )
}

export default function RightPanel({
  selectedIds, segments, points, onUpdate, materials, insulations,
  levels, lineYs, columns, columnXs, chaufferie, flowDirections, networkFlows,
}) {
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
    />
  )
  if (pt) return <PointPanel pt={pt} onUpdate={onUpdate} />

  return null
}
