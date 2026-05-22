import { useState } from 'react'

let _uid = 0
const uid = (p = 'x') => `${p}-${Date.now()}-${++_uid}`

function Section({ title, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="lp-section">
      <button className="lp-section-header" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span className="lp-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="lp-section-body">{children}</div>}
    </div>
  )
}

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

// ── Global params ──────────────────────────────────────
function GlobalParamsSection({ params, onChange }) {
  const set = (k, v) => onChange({ ...params, [k]: v })
  return (
    <Section title="Paramètres généraux">
      <Field label="T° départ" unit="°C">
        <input type="number" value={params.T_depart} onChange={e => set('T_depart', e.target.value)} />
      </Field>
      <Field label="Masse volumique ρ" unit="kg/m³">
        <input type="number" value={params.rho} onChange={e => set('rho', e.target.value)} />
      </Field>
      <Field label="Chaleur spécifique cp" unit="J/kg·K">
        <input type="number" value={params.cp} onChange={e => set('cp', e.target.value)} />
      </Field>
      <Field label="T° ambiante sous-sol" unit="°C">
        <input type="number" value={params.T_amb_ss} onChange={e => set('T_amb_ss', e.target.value)} />
      </Field>
      <Field label="T° ambiante autre niveau" unit="°C">
        <input type="number" value={params.T_amb_other} onChange={e => set('T_amb_other', e.target.value)} />
      </Field>
      <Field label="Coef. transfert he" unit="W/m²·K">
        <input type="number" value={params.he} onChange={e => set('he', e.target.value)} />
      </Field>
    </Section>
  )
}

// ── Levels ─────────────────────────────────────────────
function LevelsSection({ levels, lineYs, onLevelsChange, onLineYsChange }) {
  const rename = (id, name) => onLevelsChange(levels.map(l => l.id === id ? { ...l, name } : l))

  const moveUp = (i) => {
    if (i >= levels.length - 1) return
    const next = [...levels]
    ;[next[i], next[i + 1]] = [next[i + 1], next[i]]
    onLevelsChange(next)
  }
  const moveDown = (i) => {
    if (i <= 0) return
    const next = [...levels]
    ;[next[i], next[i - 1]] = [next[i - 1], next[i]]
    onLevelsChange(next)
  }

  const addLevel = () => {
    // New zone inserted between last level and Toiture
    const newLvl = { id: uid(), name: `R+${levels.length - 1}` }
    const newYs  = [...lineYs]
    const topY   = newYs[newYs.length - 1]  // Toiture y
    const prevY  = newYs[newYs.length - 2]  // last level top y
    newYs.splice(newYs.length - 1, 0, Math.round((topY + prevY) / 2))
    onLevelsChange([...levels, newLvl])
    onLineYsChange(newYs)
  }

  const removeLevel = (idx) => {
    if (levels.length <= 1) return
    const nextLvls = levels.filter((_, i) => i !== idx)
    // Remove lineYs[idx+1] (the top boundary of this level)
    const nextYs   = lineYs.filter((_, i) => i !== idx + 1)
    onLevelsChange(nextLvls)
    onLineYsChange(nextYs)
  }

  // Display bottom→top: reverse for UI (top first in the list)
  const displayOrder = [...levels].reverse()

  return (
    <Section title="Niveaux">
      <p className="lp-hint">Glissez les lignes sur le plan pour ajuster la hauteur des niveaux.</p>
      <div className="lp-levels-list">
        {/* Toiture indicator */}
        <div className="lp-level-row lp-level-toiture">
          <span className="lp-level-badge">▲</span>
          <span className="lp-level-toiture-label">Toiture</span>
        </div>
        {displayOrder.map((lvl) => {
          const origIdx = levels.indexOf(lvl)
          return (
            <div key={lvl.id} className="lp-level-row">
              <input
                className="lp-level-name"
                value={lvl.name}
                onChange={e => rename(lvl.id, e.target.value)}
              />
              <div className="lp-level-btns">
                <button className="lp-icon-btn" onClick={() => moveUp(origIdx)} title="Monter" disabled={origIdx >= levels.length - 1}>▲</button>
                <button className="lp-icon-btn" onClick={() => moveDown(origIdx)} title="Descendre" disabled={origIdx <= 0}>▼</button>
                <button className="lp-icon-btn danger" onClick={() => removeLevel(origIdx)} title="Supprimer">✕</button>
              </div>
            </div>
          )
        })}
      </div>
      <button className="lp-add-btn" onClick={addLevel}>+ Ajouter un niveau</button>
    </Section>
  )
}

// ── Materials ──────────────────────────────────────────
function MaterialsSection({ materials, onChange }) {
  const [expanded, setExpanded] = useState(null)

  const toggle      = id      => onChange(m => m.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x))
  const setLambda   = (id, v) => onChange(m => m.map(x => x.id === id ? { ...x, lambda: v } : x))
  const setName     = (id, v) => onChange(m => m.map(x => x.id === id ? { ...x, name: v } : x))
  const removeMat   = id      => onChange(m => m.filter(x => x.id !== id))
  const setDnField  = (mid, idx, key, v) => onChange(m => m.map(x => {
    if (x.id !== mid) return x
    const dns = x.dns.map((d, i) => i === idx ? { ...d, [key]: key === 'dn' ? v : (parseFloat(v) || 0) } : d)
    return { ...x, dns }
  }))
  const addDnRow    = id      => onChange(m => m.map(x => x.id === id ? { ...x, dns: [...x.dns, { dn: '', di: 0, de: 0 }] } : x))
  const removeDnRow = (id, i) => onChange(m => m.map(x => x.id === id ? { ...x, dns: x.dns.filter((_, j) => j !== i) } : x))
  const addCustom   = ()      => onChange(m => [...m, { id: uid('mat'), name: '', enabled: true, lambda: '', dns: [], custom: true }])

  return (
    <Section title="Matériaux des canalisations">
      {materials.map(mat => (
        <div key={mat.id} className="lp-mat-block">
          <div className="lp-mat-header">
            <label className="lp-checkbox-label" style={{ flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={mat.enabled} onChange={() => toggle(mat.id)} />
              {mat.custom
                ? <input value={mat.name} onChange={e => setName(mat.id, e.target.value)}
                    placeholder="Nom du matériau" className="lp-level-name" style={{ flex: 1 }} />
                : <span>{mat.name}</span>
              }
            </label>
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              {mat.enabled && (
                <button className="lp-icon-btn" onClick={() => setExpanded(x => x === mat.id ? null : mat.id)}>
                  {expanded === mat.id ? '▾' : '▸'}
                </button>
              )}
              {mat.custom && (
                <button className="lp-icon-btn danger" onClick={() => removeMat(mat.id)} title="Supprimer">✕</button>
              )}
            </div>
          </div>
          {mat.enabled && (
            <div className="lp-mat-lambda">
              <span>λ =</span>
              <input type="number" step="0.001" value={mat.lambda}
                onChange={e => setLambda(mat.id, e.target.value)} />
              <span className="lp-unit">W/m·K</span>
            </div>
          )}
          {mat.enabled && expanded === mat.id && (
            <>
              <table className="lp-dn-table">
                <thead>
                  <tr><th>DN</th><th>Di (mm)</th><th>De (mm)</th>{mat.custom && <th></th>}</tr>
                </thead>
                <tbody>
                  {mat.dns.map((d, i) => (
                    <tr key={i}>
                      <td>{mat.custom
                        ? <input type="text" value={d.dn} onChange={e => setDnField(mat.id, i, 'dn', e.target.value)} />
                        : d.dn}
                      </td>
                      <td><input type="number" value={d.di} onChange={e => setDnField(mat.id, i, 'di', e.target.value)} /></td>
                      <td><input type="number" value={d.de} onChange={e => setDnField(mat.id, i, 'de', e.target.value)} /></td>
                      {mat.custom && (
                        <td><button className="lp-icon-btn danger" onClick={() => removeDnRow(mat.id, i)}>✕</button></td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {mat.custom && (
                <button className="lp-add-btn small" onClick={() => addDnRow(mat.id)}>+ Ajouter DN</button>
              )}
            </>
          )}
        </div>
      ))}
      <button className="lp-add-btn" onClick={addCustom}>+ Ajouter matériau personnalisé</button>
    </Section>
  )
}

// ── Insulations ────────────────────────────────────────
function InsulationsSection({ insulations, onChange }) {
  const toggle      = id      => onChange(ins => ins.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x))
  const setLambda   = (id, v) => onChange(ins => ins.map(x => x.id === id ? { ...x, lambda: v } : x))
  const setName     = (id, v) => onChange(ins => ins.map(x => x.id === id ? { ...x, name: v } : x))
  const removeIns   = id      => onChange(ins => ins.filter(x => x.id !== id))
  const setThick    = (id, idx, v) => onChange(ins => ins.map(x => {
    if (x.id !== id) return x
    const t = [...x.thicknesses]; t[idx] = parseFloat(v) || 0
    return { ...x, thicknesses: t }
  }))
  const addThick    = id      => onChange(ins => ins.map(x => x.id === id ? { ...x, thicknesses: [...x.thicknesses, ''] } : x))
  const removeThick = (id, idx) => onChange(ins => ins.map(x =>
    x.id === id ? { ...x, thicknesses: x.thicknesses.filter((_, i) => i !== idx) } : x
  ))
  const addCustom   = ()      => onChange(ins => [...ins, { id: uid('ins'), name: '', enabled: true, lambda: '', thicknesses: [], custom: true }])

  return (
    <Section title="Isolants (calorifugeage)">
      {insulations.map(ins => (
        <div key={ins.id} className="lp-mat-block">
          <div className="lp-mat-header">
            <label className="lp-checkbox-label" style={{ flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={ins.enabled} onChange={() => toggle(ins.id)} />
              {ins.custom
                ? <input value={ins.name} onChange={e => setName(ins.id, e.target.value)}
                    placeholder="Nom de l'isolant" className="lp-level-name" style={{ flex: 1 }} />
                : <span>{ins.name}</span>
              }
            </label>
            {ins.custom && (
              <button className="lp-icon-btn danger" onClick={() => removeIns(ins.id)} title="Supprimer">✕</button>
            )}
          </div>
          {ins.enabled && (
            <>
              <div className="lp-mat-lambda">
                <span>λ =</span>
                <input type="number" step="0.001" value={ins.lambda}
                  onChange={e => setLambda(ins.id, e.target.value)} />
                <span className="lp-unit">W/m·K</span>
              </div>
              <div className="lp-thicknesses">
                <label className="lp-label">Épaisseurs disponibles (mm) :</label>
                {ins.thicknesses.length === 0 && (
                  <p className="lp-hint">Aucune épaisseur ajoutée.</p>
                )}
                {ins.thicknesses.map((t, i) => (
                  <div key={i} className="lp-thickness-row">
                    <input type="number" value={t}
                      onChange={e => setThick(ins.id, i, e.target.value)} />
                    <span className="lp-unit">mm</span>
                    <button className="lp-icon-btn danger" onClick={() => removeThick(ins.id, i)}>✕</button>
                  </div>
                ))}
                <button className="lp-add-btn small" onClick={() => addThick(ins.id)}>+ Ajouter</button>
              </div>
            </>
          )}
        </div>
      ))}
      <button className="lp-add-btn" onClick={addCustom}>+ Ajouter isolant personnalisé</button>
    </Section>
  )
}

export default function LeftPanel({
  globalParams, onGlobalParamsChange,
  levels, lineYs, onLevelsChange, onLineYsChange,
  materials, onMaterialsChange,
  insulations, onInsulationsChange,
}) {
  return (
    <div className="left-panel">
      <GlobalParamsSection params={globalParams} onChange={onGlobalParamsChange} />
      <LevelsSection
        levels={levels} lineYs={lineYs}
        onLevelsChange={onLevelsChange} onLineYsChange={onLineYsChange}
      />
      <MaterialsSection materials={materials} onChange={onMaterialsChange} />
      <InsulationsSection insulations={insulations} onChange={onInsulationsChange} />
    </div>
  )
}
