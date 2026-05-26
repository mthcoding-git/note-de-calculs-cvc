import { useState, useEffect } from 'react'
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

function SegmentPanel({ seg, onUpdate, materials, insulations, allSegs, levels, lineYs, columns, columnXs, chaufferie, points }) {
  const set = (key, val) => onUpdate(seg.id, 'segment', { [key]: val })

  const enabledMats = materials.filter(m => m.enabled)
  const enabledIns  = insulations.filter(i => i.enabled)
  const selMat      = materials.find(m => m.id === seg.materialId)
  const selIns      = insulations.find(i => i.id === seg.insulationId)
  const dnDef       = selMat?.dns.find(d => d.dn === seg.dn)

  const isDefault   = !seg.name
  const displayName = getDisplayName(seg, allSegs, levels, lineYs, columns, columnXs, chaufferie, points)

  // Local state for flow/velocity mode — resets when switching segment
  const [flowMode, setFlowMode] = useState(() => seg.velocity != null ? 'velocity' : 'flowRate')
  useEffect(() => {
    setFlowMode(seg.velocity != null ? 'velocity' : 'flowRate')
  }, [seg.id])

  const SectionLabel = ({ children }) => (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
      letterSpacing: '0.05em', marginBottom: 5, marginTop: 2 }}>
      {children}
    </div>
  )

  return (
    <div className="rp-section">
      <h3 className="rp-title">Tronçon</h3>

      {/* Identification */}
      <SectionLabel>Identification</SectionLabel>
      <div className="lp-field">
        <label className="lp-label">Nom</label>
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
          placeholder="Personnaliser le nom..."
        />
        {isDefault
          ? <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, display: 'block' }}>par défaut</span>
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

      <div className="lp-field">
        <label className="lp-label">Débit / Vitesse</label>
        <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
          <button
            className={`lp-icon-btn${flowMode === 'flowRate' ? ' active' : ''}`}
            style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '4px 0' }}
            onClick={() => { setFlowMode('flowRate'); set('velocity', null) }}>
            Débit (L/h)
          </button>
          <button
            className={`lp-icon-btn${flowMode === 'velocity' ? ' active' : ''}`}
            style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '4px 0' }}
            onClick={() => { setFlowMode('velocity'); set('flowRate', null) }}>
            Vitesse (m/s)
          </button>
        </div>
        {flowMode === 'flowRate' ? (
          <input type="number" min="0" placeholder="L/h"
            value={seg.flowRate ?? ''}
            onChange={e => set('flowRate', e.target.value === '' ? null : +e.target.value)} />
        ) : (
          <input type="number" min="0" step="0.01" placeholder="m/s"
            value={seg.velocity ?? ''}
            onChange={e => set('velocity', e.target.value === '' ? null : +e.target.value)} />
        )}
      </div>

      <hr className="rp-divider" />

      {/* Réseau */}
      <SectionLabel>Réseau</SectionLabel>
      <Field label="Type">
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
  levels, lineYs, columns, columnXs, chaufferie,
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
    />
  )
  if (pt) return <PointPanel pt={pt} onUpdate={onUpdate} />

  return null
}
