import { useState, useEffect } from 'react'

function Stepper({ value, onChange, min = 0, max = 30 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <button onClick={() => onChange(Math.max(min, value - 1))} style={BTN_S}>−</button>
      <span style={{ width: 32, textAlign: 'center', fontWeight: 700, fontSize: 15, color: '#1f2937' }}>{value}</span>
      <button onClick={() => onChange(Math.min(max, value + 1))} style={BTN_S}>+</button>
    </div>
  )
}

const BTN_S = {
  width: 28, height: 28, borderRadius: 6, border: '1px solid #d1d5db',
  background: '#f9fafb', fontSize: 15, cursor: 'pointer', lineHeight: 1, padding: 0,
}

function buildLevelNames(nSousSol, nFloors) {
  const names = []
  for (let i = nSousSol; i >= 1; i--) names.push(`SS-${i}`)
  for (let i = 0; i < nFloors; i++)  names.push(i === 0 ? 'RDC' : `R+${i}`)
  return names
}

export default function NetworkSetupCard({ fluidLabel, calcLabel, onPreview, onComplete }) {
  const [nSousSol, setNSousSol] = useState(1)
  const [nFloors,  setNFloors]  = useState(3)
  const [nCols,    setNCols]    = useState(3)

  // Sync canvas preview on first render
  useEffect(() => { onPreview?.(1, 3, 3) }, [])

  const update = (key, val) => {
    const next = { nSousSol, nFloors, nCols, [key]: val }
    if (key === 'nSousSol') setNSousSol(val)
    else if (key === 'nFloors') setNFloors(val)
    else setNCols(val)
    onPreview?.(next.nSousSol, next.nFloors, next.nCols)
  }

  const levelNames = buildLevelNames(nSousSol, nFloors)
  const total = levelNames.length
  const ready = !!calcLabel

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' }}>

      {/* En-tête */}
      <div style={{ padding: '18px 16px 14px', borderBottom: '1px solid #e5e7eb' }}>
        {(fluidLabel || calcLabel) && (
          <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>
            {fluidLabel}{calcLabel ? ` · ${calcLabel}` : ''}
          </div>
        )}
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1f2937' }}>
          Configuration du bâtiment
        </div>
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>
          Définissez la structure du bâtiment.
        </div>
      </div>

      {/* Steppers */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            ['Niveaux hors-sol',    'RDC, R+1, R+2, …', nFloors, 'nFloors', 1, 30],
            ['Niveaux en sous-sol', 'SS-1, SS-2, …', nSousSol, 'nSousSol', 0, 5],
            ['Colonnes montantes',  null, nCols, 'nCols', 1, 20],
          ].map(([label, desc, val, key, mn, mx]) => (
            <div key={key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8,
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#1f2937' }}>{label}</div>
                {desc && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{desc}</div>}
              </div>
              <Stepper value={val as number} onChange={v => update(key as string, v)} min={mn as number} max={mx as number} />
            </div>
          ))}
        </div>

        {/* Aperçu */}
        <div style={{ marginTop: 12, padding: '8px 12px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, color: '#64748b' }}>
          {total} niveau{total > 1 ? 'x' : ''} · {nCols} colonne{nCols > 1 ? 's' : ''}
          <br />
          <span style={{ color: '#94a3b8' }}>{levelNames.join(' · ')}</span>
        </div>
      </div>

      {/* Bouton */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #e5e7eb' }}>
        <button
          onClick={() => ready && onComplete?.()}
          disabled={!ready}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 7, border: 'none',
            background: ready ? '#4f46e5' : '#e5e7eb',
            color: ready ? '#fff' : '#9ca3af',
            fontSize: 13, fontWeight: 700,
            cursor: ready ? 'pointer' : 'not-allowed',
            boxShadow: ready ? '0 2px 8px rgba(79,70,229,0.25)' : 'none',
            transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
          }}>
          Créer le réseau →
        </button>
      </div>

    </div>
  )
}
