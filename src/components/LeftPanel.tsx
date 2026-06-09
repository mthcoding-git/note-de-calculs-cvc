import { useState, useMemo, useEffect } from 'react'
import { getDisplayName } from '../utils/naming'

let _uid = 0
const uid = (p = 'x') => `${p}-${Date.now()}-${++_uid}`

function Section({ title, children, defaultOpen = true, noPad = false }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="lp-section">
      <button className="lp-section-header" onClick={() => setOpen(o => !o)}>
        <span>{title}</span>
        <span className="lp-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className={noPad ? 'lp-section-body-nopad' : 'lp-section-body'}>{children}</div>}
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
    <Section title="Paramètres généraux" defaultOpen={false}>
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
function LevelsSection({ levels, lineYs, onLevelsChange, onLineYsChange, editLevelsEnabled, onEditLevelsChange }) {
  const rename        = (id, name) => onLevelsChange(levels.map(l => l.id === id ? { ...l, name } : l))
  const toggleSousSol = (id)       => onLevelsChange(levels.map(l => l.id === id ? { ...l, isSousSol: !l.isSousSol } : l))

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
    const newLvl = { id: uid(), name: `R+${levels.length - 1}`, isSousSol: false }
    const newYs  = [...lineYs]
    const topY   = newYs[newYs.length - 1]
    const prevY  = newYs[newYs.length - 2]
    const h      = prevY - topY   // hauteur du niveau supérieur actuel
    newYs.push(topY - h)          // la toiture monte d'une hauteur de niveau
    onLevelsChange([...levels, newLvl])
    onLineYsChange(newYs)
  }

  const removeLevel = (idx) => {
    if (levels.length <= 1) return
    const nextLvls = levels.filter((_, i) => i !== idx)
    const nextYs   = lineYs.filter((_, i) => i !== idx + 1)
    onLevelsChange(nextLvls)
    onLineYsChange(nextYs)
  }

  const displayOrder = [...levels].reverse()

  return (
    <Section title="Niveaux" defaultOpen={false}>
      <div className="lp-field">
        <label className="lp-checkbox-label">
          <input type="checkbox" checked={editLevelsEnabled}
            onChange={e => onEditLevelsChange(e.target.checked)} />
          <span>Déplacer les lignes de niveaux</span>
        </label>
      </div>
      {editLevelsEnabled && (
        <p className="lp-hint">Glissez les lignes horizontales sur le plan pour ajuster la hauteur.</p>
      )}
      <div className="lp-levels-list">
        <div className="lp-level-row lp-level-toiture">
          <span className="lp-level-badge">▲</span>
          <span className="lp-level-toiture-label">Toiture</span>
        </div>
        {displayOrder.map((lvl) => {
          const origIdx = levels.indexOf(lvl)
          return (
            <div key={lvl.id} className="lp-level-row">
              <button
                className={`lp-icon-btn lp-ss-btn ${lvl.isSousSol ? 'lp-ss-active' : ''}`}
                onClick={() => toggleSousSol(lvl.id)}
                title={lvl.isSousSol ? 'Sous-sol (cliquer pour désactiver)' : 'Marquer comme sous-sol'}
              >SS</button>
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

// ── Columns ────────────────────────────────────────────
function ColumnsSection({ columns, columnXs, onColumnsChange, onColumnXsChange, onRemoveColumn, onAddColumn, onAddGap, onMoveGaine, levels, editColumnsEnabled, onEditColumnsChange }) {
  const [expanded, setExpanded] = useState(null)

  const setName = (id, name) =>
    onColumnsChange(cols => cols.map(c => c.id === id ? { ...c, name } : c))

  const setLevelIds = (id, levelIds) =>
    onColumnsChange(cols => cols.map(c => c.id === id ? { ...c, levelIds } : c))

  const moveLeft = (idx) => {
    if (idx <= 0) return
    onColumnsChange(cols => {
      const next = [...cols]; [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]; return next
    })
    onColumnXsChange(xs => {
      const next = [...xs]
      // Glisse la frontière partagée : largeur de chaque colonne préservée
      next[idx] = xs[idx - 1] + (xs[idx + 1] - xs[idx])
      return next
    })
  }
  const moveRight = (idx) => {
    if (idx >= columns.length - 1) return
    onColumnsChange(cols => {
      const next = [...cols]; [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]]; return next
    })
    onColumnXsChange(xs => {
      const next = [...xs]
      next[idx + 1] = xs[idx] + (xs[idx + 2] - xs[idx + 1])
      return next
    })
  }

  const removeCol = (idx) => {
    if (columns.length <= 1) return
    onRemoveColumn(idx)
  }

  const addGap = () => onAddGap()

  return (
    <Section title="Colonnes" defaultOpen={false}>
      <div className="lp-field">
        <label className="lp-checkbox-label">
          <input type="checkbox" checked={editColumnsEnabled}
            onChange={e => onEditColumnsChange(e.target.checked)} />
          <span>Déplacer les colonnes</span>
        </label>
      </div>
      {editColumnsEnabled && (
        <p className="lp-hint">Glissez les lignes verticales sur le plan pour ajuster la largeur.</p>
      )}
      <div className="lp-levels-list">
        {columns.map((col, i) => (
          <div key={col.id}>
            {col.isGap ? (
              <div className="lp-level-row" style={{ opacity: 0.65 }}>
                <span style={{ flex: 1, fontSize: 11, color: '#9ca3af', fontStyle: 'italic', paddingLeft: 4 }}>
                  — Gaine —
                </span>
                <div className="lp-level-btns">
                  <button className="lp-icon-btn"
                    onClick={() => onMoveGaine(i, columnXs[i - 1])}
                    disabled={i <= 0}
                    title="Vers la gauche">◀</button>
                  <button className="lp-icon-btn"
                    onClick={() => onMoveGaine(i, columnXs[i + 2])}
                    disabled={i >= columns.length - 1 || columnXs[i + 2] === undefined}
                    title="Vers la droite">▶</button>
                  <button className="lp-icon-btn danger" onClick={() => removeCol(i)} title="Supprimer">✕</button>
                </div>
              </div>
            ) : (
            <div className="lp-level-row">
              <button className="lp-icon-btn" style={{ flexShrink: 0 }}
                onClick={() => setExpanded(x => x === col.id ? null : col.id)}>
                {expanded === col.id ? '▾' : '▸'}
              </button>
              <input className="lp-level-name" value={col.name}
                onChange={e => setName(col.id, e.target.value)} />
              <div className="lp-level-btns">
                <button className="lp-icon-btn" onClick={() => moveLeft(i)} disabled={i <= 0} title="Vers la gauche">◀</button>
                <button className="lp-icon-btn" onClick={() => moveRight(i)} disabled={i >= columns.length - 1} title="Vers la droite">▶</button>
                <button className="lp-icon-btn danger" onClick={() => removeCol(i)} disabled={columns.length <= 1} title="Supprimer">✕</button>
              </div>
            </div>
            )}
            {!col.isGap && expanded === col.id && (
              <div style={{ paddingLeft: 22, paddingBottom: 8, paddingTop: 3 }}>
                <div className="lp-label" style={{ marginBottom: 4 }}>Niveaux couverts :</div>
                <label className="lp-checkbox-label" style={{ marginBottom: 4 }}>
                  <input type="checkbox"
                    checked={col.levelIds === 'all'}
                    onChange={e => setLevelIds(col.id, e.target.checked ? 'all' : levels.map(l => l.id))} />
                  <span>Tous les niveaux</span>
                </label>
                {col.levelIds !== 'all' && [...levels].reverse().map(lvl => {
                  const arr = Array.isArray(col.levelIds) ? col.levelIds : levels.map(l => l.id)
                  return (
                    <label key={lvl.id} className="lp-checkbox-label" style={{ paddingLeft: 8, marginBottom: 2 }}>
                      <input type="checkbox"
                        checked={arr.includes(lvl.id)}
                        onChange={e => {
                          const next = e.target.checked
                            ? [...arr, lvl.id]
                            : arr.filter(id => id !== lvl.id)
                          setLevelIds(col.id, next.length === levels.length ? 'all' : next)
                        }} />
                      <span>{lvl.name}</span>
                    </label>
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 5, marginTop: 2 }}>
        <button className="lp-add-btn" style={{ flex: 1 }} onClick={onAddColumn}>+ Ajouter une colonne</button>
        <button className="lp-add-btn" style={{ flex: 1 }} onClick={addGap}>+ Ajouter une gaine</button>
      </div>
    </Section>
  )
}


// ── Alimentation ECS : débits de base par appareil ─────
function AlimentationParamsSection({ params, onChange }) {
  const [editMode, setEditMode] = useState(false)
  if (!params?.appareils) return null

  const setEnabled = (id, v) => onChange({
    ...params,
    appareils: params.appareils.map(a => a.id === id ? { ...a, enabled: v } : a),
  })
  const setQBase = (id, v) => onChange({
    ...params,
    appareils: params.appareils.map(a => a.id === id ? { ...a, qBase: parseFloat(v) || 0 } : a),
  })

  return (
    <Section title="Débits de base par équipement" defaultOpen={false}>
      <div className="lp-field" style={{ marginBottom: 8 }}>
        <label className="lp-label">Type de bâtiment</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { value: 'habitation',   label: 'Standard' },
            { value: 'enseignement', label: 'Enseignement' },
          ].map(opt => {
            const active = (params.buildingType === opt.value) ||
              (opt.value === 'habitation' && !['enseignement'].includes(params.buildingType))
            return (
              <button key={opt.value}
                onClick={() => onChange({ ...params, buildingType: opt.value })}
                style={{
                  flex: 1, padding: '4px 0', fontSize: 11, fontWeight: active ? 700 : 500,
                  border: `1px solid ${active ? '#6366f1' : '#e5e7eb'}`,
                  borderRadius: 5, cursor: 'pointer',
                  background: active ? '#eef2ff' : '#f9fafb',
                  color: active ? '#4338ca' : '#6b7280',
                }}>
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      {params.appareils.map(a => (
        <div key={a.id} className="lp-mat-block" style={{ marginBottom: 2, paddingBottom: 2 }}>
          <div className="lp-mat-header">
            <label className="lp-checkbox-label" style={{ flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={a.enabled}
                onChange={e => setEnabled(a.id, e.target.checked)} />
              <span style={{ color: a.enabled ? '#111827' : '#6b7280' }}>{a.name}</span>
            </label>
            {editMode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <input type="number" step="0.01" min="0"
                  value={a.qBase}
                  onChange={e => setQBase(a.id, e.target.value)}
                  style={{ width: 60, fontSize: 11 }} />
                <span style={{ fontSize: 10, color: '#374151' }}>l/s</span>
              </div>
            ) : (
              <span style={{ fontSize: 11, color: a.enabled ? '#111827' : '#6b7280',
                flexShrink: 0, marginLeft: 6, minWidth: 72, textAlign: 'right' }}>
                {a.qBase} l/s
              </span>
            )}
          </div>
        </div>
      ))}
      <label className="lp-checkbox-label" style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
        <input type="checkbox" checked={editMode} onChange={e => setEditMode(e.target.checked)} />
        <span>Modifier les valeurs</span>
      </label>
    </Section>
  )
}

// ── Materials ──────────────────────────────────────────
function MaterialsSection({ materials, onChange, showLambda = true }) {
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
    <Section title="Matériaux des canalisations" defaultOpen={false}>
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
          {mat.enabled && showLambda && (
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
                {mat.custom
                  ? <colgroup><col style={{width:'68px'}}/><col style={{width:'64px'}}/><col style={{width:'64px'}}/><col style={{width:'22px'}}/></colgroup>
                  : <colgroup><col style={{width:'72px'}}/><col style={{width:'68px'}}/><col style={{width:'68px'}}/></colgroup>
                }
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
    <Section title="Isolants (calorifugeage)" defaultOpen={false}>
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

// ── Attribution ────────────────────────────────────────
const PARAM_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#14b8a6']

function computeGroups(paramType, segments, materials, insulations) {
  if (paramType === 'type') {
    const aller = [], retour = []
    for (const s of segments) { if (s.type === 'aller') aller.push(s.id); else retour.push(s.id) }
    return { rows: [
      { key: 'aller',  label: 'Aller ECS',  ids: aller,  color: '#dc2626' },
      { key: 'retour', label: 'Retour ECS', ids: retour, color: '#f97316' },
    ], missing: [] }
  }
  if (paramType === 'material') {
    const byKey = new Map(), none = []
    for (const s of segments) {
      if (!s.materialId || !s.dn) { none.push(s.id); continue }
      const k = `${s.materialId}||${s.dn}`
      if (!byKey.has(k)) byKey.set(k, { ids: [], materialId: s.materialId, dn: s.dn })
      byKey.get(k).ids.push(s.id)
    }
    const rows = []
    for (const [, v] of byKey) {
      const mat = materials.find(m => m.id === v.materialId)
      rows.push({ key: `${v.materialId}||${v.dn}`, label: `${mat?.name ?? v.materialId} – ${v.dn}`, ids: v.ids, color: '#64748b' })
    }
    rows.sort((a, b) => a.label.localeCompare(b.label))
    return { rows, missing: none }
  }
  if (paramType === 'insulation') {
    const byKey = new Map(), none = []
    for (const s of segments) {
      if (!s.insulationId) { none.push(s.id); continue }
      const k = `${s.insulationId}||${s.thickness ?? '__'}`
      if (!byKey.has(k)) byKey.set(k, { ids: [], insulationId: s.insulationId, thickness: s.thickness })
      byKey.get(k).ids.push(s.id)
    }
    const rows = []
    for (const [, v] of byKey) {
      const ins = insulations.find(i => i.id === v.insulationId)
      const thick = v.thickness != null ? `${v.thickness} mm` : 'ép. non définie'
      rows.push({ key: `${v.insulationId}||${v.thickness ?? '__'}`, label: `${ins?.name ?? v.insulationId} – ${thick}`, ids: v.ids, color: '#64748b' })
    }
    rows.sort((a, b) => a.label.localeCompare(b.label))
    return { rows, missing: none }
  }
  if (paramType === 'length') {
    const byLen = new Map(), none = []
    for (const s of segments) {
      if (s.length_override == null) { none.push(s.id); continue }
      const k = String(s.length_override)
      if (!byLen.has(k)) byLen.set(k, { ids: [], length: s.length_override })
      byLen.get(k).ids.push(s.id)
    }
    const rows = []
    for (const [, v] of byLen)
      rows.push({ key: String(v.length), label: `${v.length} m`, ids: v.ids, color: '#64748b' })
    rows.sort((a, b) => parseFloat(a.key) - parseFloat(b.key))
    return { rows, missing: none }
  }
  if (paramType === 'flowVelocity') {
    const byKey = new Map(), none = []
    for (const s of segments) {
      const hasFlow = s.flowRate != null, hasVel = s.velocity != null
      if (!hasFlow && !hasVel) { none.push(s.id); continue }
      const k = hasFlow ? `flow||${s.flowRate}` : `vel||${s.velocity}`
      if (!byKey.has(k)) byKey.set(k, { ids: [], isFlow: hasFlow, value: hasFlow ? s.flowRate : s.velocity })
      byKey.get(k).ids.push(s.id)
    }
    const rows = []
    for (const [k, v] of byKey)
      rows.push({ key: k, label: v.isFlow ? `${v.value} m³/h` : `${v.value} m/s`, ids: v.ids, color: '#64748b' })
    return { rows, missing: none }
  }
  return { rows: [], missing: [] }
}

function EditParamsPanel({
  segments, points, materials, insulations,
  levels, lineYs, columns, columnXs, chaufferie,
  editParam, onEditParamChange,
  activeCalcId, alimentationParams,
}) {
  const isAlim = activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef'
  const isEF   = activeCalcId === 'alimentation-ef'
  const set = patch => onEditParamChange({ ...editParam, ...patch })
  const { paramType, segType, materialId, dn, insulationId, thickness,
          length, flowVelocityMode, flowVelocityValue } = editParam

  // Réinitialise paramType si la valeur courante n'est pas disponible dans ce mode
  const validTypes = isEF ? ['material'] : isAlim ? ['type', 'material'] : ['type', 'material', 'insulation', 'length', 'flowVelocity']
  useEffect(() => {
    if (!validTypes.includes(paramType)) set({ paramType: 'material' })
  }, [isAlim, paramType])

  const enabledMats = materials.filter(m => m.enabled)
  const enabledIns  = insulations.filter(i => i.enabled)
  const selMat = enabledMats.find(m => m.id === materialId)
  const selIns = enabledIns.find(i => i.id === insulationId)

  const { rows: groups, missing } = useMemo(
    () => computeGroups(paramType, segments, materials, insulations),
    [paramType, segments, materials, insulations]
  )

  const currentKey = paramType === 'type' ? segType
    : paramType === 'material' ? (materialId && dn ? `${materialId}||${dn}` : null)
    : paramType === 'insulation' ? (insulationId ? `${insulationId}||${thickness ?? '__'}` : null)
    : paramType === 'length' ? (length != null ? String(length) : null)
    : paramType === 'flowVelocity' ? (flowVelocityValue != null ? `${flowVelocityMode === 'flowRate' ? 'flow' : 'vel'}||${flowVelocityValue}` : null)
    : null

  return (
    <div style={{ padding: '6px 2px' }}>

      {/* Param type */}
      <div className="lp-field">
        <label className="lp-label">Paramètre</label>
        <select value={paramType} onChange={e => set({ paramType: e.target.value, materialId: null, dn: null, insulationId: null, thickness: null, length: null, flowVelocityValue: null })}>
          {!isEF && <option value="type">Réseau (Aller / Retour ECS)</option>}
          <option value="material">Matériau & DN</option>
          {!isAlim && <option value="insulation">Isolant & épaisseur</option>}
          {!isAlim && <option value="length">Longueur</option>}
          {!isAlim && <option value="flowVelocity">Débit / Vitesse</option>}
        </select>
      </div>

      {/* Value selector */}
      {paramType === 'type' && (
        <div className="lp-field">
          <label className="lp-label">Valeur à appliquer</label>
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ v: 'aller', label: 'Aller ECS', col: '#dc2626' }, { v: 'retour', label: 'Retour ECS', col: '#f97316' }].map(({ v, label, col }) => (
              <button key={v} onClick={() => set({ segType: v })}
                className="lp-icon-btn"
                style={{ flex: 1, fontWeight: 600, fontSize: 11, padding: '4px 0',
                  background: segType === v ? col : undefined,
                  color: segType === v ? '#fff' : undefined,
                  border: `1.5px solid ${segType === v ? col : '#d1d5db'}`,
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {paramType === 'material' && (<>
        <div className="lp-field">
          <label className="lp-label">Matériau</label>
          <select value={materialId ?? ''} onChange={e => set({ materialId: e.target.value || null, dn: null })}>
            <option value="">— Choisir —</option>
            {enabledMats.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        {selMat && (
          <div className="lp-field">
            <label className="lp-label">DN</label>
            <select value={dn ?? ''} onChange={e => set({ dn: e.target.value || null })}>
              <option value="">— Choisir —</option>
              {selMat.dns.map(d => <option key={d.dn} value={d.dn}>{d.dn}</option>)}
            </select>
          </div>
        )}
      </>)}
      {paramType === 'insulation' && (<>
        <div className="lp-field">
          <label className="lp-label">Isolant</label>
          <select value={insulationId ?? ''} onChange={e => set({ insulationId: e.target.value || null, thickness: null })}>
            <option value="">— Choisir —</option>
            {enabledIns.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        {selIns && (
          <div className="lp-field">
            <label className="lp-label">Épaisseur</label>
            {selIns.thicknesses.length > 0 ? (
              <select value={thickness ?? ''} onChange={e => set({ thickness: e.target.value === '' ? null : +e.target.value })}>
                <option value="">— Toutes —</option>
                {selIns.thicknesses.map(t => <option key={t} value={t}>{t} mm</option>)}
              </select>
            ) : (
              <input type="number" placeholder="mm" value={thickness ?? ''}
                onChange={e => set({ thickness: e.target.value === '' ? null : +e.target.value })} />
            )}
          </div>
        )}
      </>)}

      {paramType === 'length' && (
        <div className="lp-field">
          <label className="lp-label">Valeur à appliquer</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="number" min="0" step="0.1" style={{ flex: 1 }}
              value={length ?? ''} placeholder="m"
              onChange={e => set({ length: e.target.value === '' ? null : +e.target.value })} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>m</span>
          </div>
        </div>
      )}
      {paramType === 'flowVelocity' && (
        <div className="lp-field">
          <label className="lp-label">Valeur à appliquer</label>
          <div style={{ display: 'flex', gap: 4, marginBottom: 5 }}>
            {[{ v: 'flowRate', label: 'Débit (m³/h)' }, { v: 'velocity', label: 'Vitesse (m/s)' }].map(({ v, label }) => (
              <button key={v} onClick={() => set({ flowVelocityMode: v, flowVelocityValue: null })}
                className="lp-icon-btn"
                style={{ flex: 1, fontSize: 11, fontWeight: 600, padding: '4px 0',
                  background: flowVelocityMode === v ? '#3b82f6' : undefined,
                  color: flowVelocityMode === v ? '#fff' : undefined,
                  border: `1.5px solid ${flowVelocityMode === v ? '#3b82f6' : '#d1d5db'}`,
                }}>
                {label}
              </button>
            ))}
          </div>
          <input type="number" min="0"
            step={flowVelocityMode === 'flowRate' ? '0.001' : '0.001'}
            value={flowVelocityValue ?? ''}
            placeholder={flowVelocityMode === 'flowRate' ? 'm³/h' : 'm/s'}
            onChange={e => set({ flowVelocityValue: e.target.value === '' ? null : +e.target.value })} />
        </div>
      )}

      {/* Groups (segments) */}
      {(
      <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 6, marginTop: 4 }}>
        <div className="lp-label" style={{ marginBottom: 4 }}>Tronçons existants</div>
        {groups.length === 0 && <p className="lp-hint">Aucun tronçon avec cette valeur.</p>}
        {groups.map(g => {
          const isTarget = currentKey === g.key
          return (
            <div key={g.key}
              onClick={() => {
                if (paramType === 'material') { const [mid, d] = g.key.split('||'); set({ materialId: mid, dn: d }) }
                else if (paramType === 'insulation') { const [iid, t] = g.key.split('||'); set({ insulationId: iid, thickness: t === '__' ? null : +t }) }
                else if (paramType === 'length') { set({ length: +g.key }) }
                else if (paramType === 'flowVelocity') { const [mode, val] = g.key.split('||'); set({ flowVelocityMode: mode === 'flow' ? 'flowRate' : 'velocity', flowVelocityValue: +val }) }
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '5px 7px', marginBottom: 3, borderRadius: 5,
                border: `1.5px solid ${isTarget ? '#16a34a' : '#e5e7eb'}`,
                background: isTarget ? '#f0fdf4' : '#fafafa',
                cursor: paramType !== 'type' ? 'pointer' : 'default', userSelect: 'none',
              }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: isTarget ? '#16a34a' : '#d1d5db',
                boxShadow: isTarget ? '0 0 0 2px #16a34a40' : 'none' }} />
              <span style={{ flex: 1, fontSize: 11, color: isTarget ? '#15803d' : '#111827', fontWeight: isTarget ? 600 : 400 }}>{g.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: isTarget ? '#16a34a' : '#6b7280',
                background: isTarget ? '#dcfce7' : '#f3f4f6',
                borderRadius: 10, padding: '1px 6px' }}>{g.ids.length}</span>
            </div>
          )
        })}
        {missing.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7,
            padding: '5px 7px', borderRadius: 5,
            border: '1px solid #fde68a', background: '#fffbeb', userSelect: 'none' }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: '#f59e0b' }} />
            <span style={{ flex: 1, fontSize: 11, color: '#92400e' }}>
              Sans {paramType === 'material' ? 'matériau / DN'
                  : paramType === 'insulation' ? 'isolant'
                  : paramType === 'length' ? 'longueur'
                  : 'débit / vitesse'}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#92400e',
              background: '#fde68a', borderRadius: 10, padding: '1px 6px' }}>{missing.length}</span>
          </div>
        )}
      </div>
      )}

      {paramType !== 'equipment' && (
      <div style={{ marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
        {currentKey ? (<>
          <p className="lp-hint" style={{ marginBottom: 6 }}>Cliquez sur un tronçon du schéma pour lui attribuer la valeur sélectionnée.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {[
              { color: '#16a34a', label: 'Valeur déjà attribuée', line: 'thick' },
              { color: '#ef4444', label: 'Paramètre absent — à attribuer', line: 'normal' },
              { color: '#9ca3af', label: 'Autre valeur attribuée', line: 'normal' },
            ].map(({ color, label, line }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <svg width={28} height={12} style={{ flexShrink: 0 }}>
                  <line x1={2} y1={6} x2={26} y2={6}
                    stroke={color}
                    strokeWidth={line === 'thick' ? 3 : line === 'normal' ? 2 : 1}
                    strokeDasharray={line === 'thin' ? '4,3' : 'none'} />
                </svg>
                <span style={{ fontSize: 10, color: '#374151' }}>{label}</span>
              </div>
            ))}
          </div>
        </>) : (
          <p className="lp-hint">Sélectionnez une valeur ci-dessus, puis cliquez sur un tronçon.</p>
        )}
      </div>
      )}

    </div>
  )
}

function ErrorPanel({ segments, points, levels, lineYs, columns, columnXs, chaufferie, networkFlows, onSelectIds, onConnHighlight, activeCalcId }) {
  const [showConnHighlight,   setShowConnHighlight]   = useState(false)
  const [showManualHighlight, setShowManualHighlight] = useState(false)
  const isEF = activeCalcId === 'alimentation-ef'

  const connIssues = useMemo(() => {
    const ptCount = new Map()
    for (const s of segments) {
      if (s.startPointId) ptCount.set(s.startPointId, (ptCount.get(s.startPointId) ?? 0) + 1)
      if (s.endPointId)   ptCount.set(s.endPointId,   (ptCount.get(s.endPointId)   ?? 0) + 1)
    }
    return segments.filter(s => {
      const sc = (ptCount.get(s.startPointId) ?? 0) >= 2
      const ec = (ptCount.get(s.endPointId)   ?? 0) >= 2
      if ((sc ? 1 : 0) + (ec ? 1 : 0) > 1) return false
      // Les tronçons connectés à un groupe de puisage sont des bouts fermés — pas une erreur
      const startPt = points.find(p => p.id === s.startPointId)
      const endPt   = points.find(p => p.id === s.endPointId)
      return startPt?.type !== 'groupe' && endPt?.type !== 'groupe'
        && startPt?.type !== 'arriveeEF' && endPt?.type !== 'arriveeEF'
    })
  }, [segments, points])

  const flowErrorSegs = useMemo(() => {
    if (!networkFlows) return []
    return segments.filter(s => networkFlows.get(s.id)?.hasError)
  }, [segments, networkFlows])

  const manualFlowSegs = useMemo(
    () => segments.filter(s => s.flowRate != null || s.velocity != null),
    [segments]
  )

  useEffect(() => {
    const ids = [
      ...(showConnHighlight   ? connIssues.map(s => s.id)     : []),
      ...(showManualHighlight ? manualFlowSegs.map(s => s.id) : []),
    ]
    onConnHighlight?.(ids)
  }, [showConnHighlight, showManualHighlight, connIssues, manualFlowSegs])

  useEffect(() => () => { onConnHighlight?.([]) }, [])

  const segItem = (s) => (
    <div key={s.id} onClick={() => onSelectIds?.([s.id])}
      style={{
        fontSize: 10, padding: '3px 8px', borderRadius: 3, cursor: 'pointer', lineHeight: 1.5,
        background: '#f9fafb', border: '1px solid transparent', color: '#6b7280', marginBottom: 2,
      }}>
      {getDisplayName(s, segments, levels, lineYs, columns, columnXs, chaufferie, points, null, activeCalcId)}
    </div>
  )

  const hasAllerRetour  = segments.some(s => s.type === 'aller' || s.type === 'retour')
  const hasProdECS      = points.some(p => p.type === 'productionECS')
  const hasArriveeEF    = points.some(p => p.type === 'arriveeEF')
  const missingProdECS  = !isEF && hasAllerRetour && !hasProdECS
  const missingArriveeEF = isEF && segments.length > 0 && !hasArriveeEF

  return (
    <div className="left-panel" style={{ gap: 0 }}>
      <div style={{ padding: '10px 12px', background: '#fffbeb', borderBottom: '1px solid #fde68a' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#92400e' }}>⚠ Erreurs dans le réseau</span>
      </div>

      {missingProdECS && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#991b1b', marginBottom: 4 }}>
            Production ECS non placée
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
            Des tronçons Aller/Retour ECS sont tracés, mais aucune
            Production ECS n'est placée sur le synoptique.
            Utilisez le bouton <strong style={{ color: '#374151' }}>Prod. ECS</strong> dans
            la barre d'outils pour la positionner.
          </div>
        </div>
      )}

      {missingArriveeEF && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#991b1b', marginBottom: 4 }}>
            Arrivée EF non placée
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
            Des tronçons sont tracés, mais aucune arrivée d'eau froide n'est placée sur le synoptique.
            Utilisez le bouton <strong style={{ color: '#374151' }}>Arrivée EF</strong> dans
            la barre d'outils pour la positionner.
          </div>
        </div>
      )}

      {connIssues.length > 0 && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#374151', marginBottom: 6 }}>
            Extrémités non connectées ({connIssues.length})
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 8, cursor: 'pointer', color: '#374151' }}>
            <input type="checkbox" checked={showConnHighlight}
              onChange={e => setShowConnHighlight(e.target.checked)} />
            Afficher les tronçons non reliés
          </label>
          <div>{connIssues.map(s => segItem(s))}</div>
        </div>
      )}

      {flowErrorSegs.length > 0 && (
        <div style={{ padding: '10px 12px' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#374151', marginBottom: 6 }}>
            Débits incohérents ({flowErrorSegs.length})
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, marginBottom: 8, cursor: 'pointer', color: '#374151' }}>
            <input type="checkbox" checked={showManualHighlight}
              onChange={e => setShowManualHighlight(e.target.checked)} />
            Afficher les tronçons avec débit / vitesse manuel
          </label>
          <div>{manualFlowSegs.map(s => segItem(s))}</div>
        </div>
      )}
    </div>
  )
}

function GroupesSection({
  groupesEditMode, onGroupesEditModeChange,
  showGroupeNames, onShowGroupeNamesChange,
  onAddGroupe, onRemoveGroupe,
  columns, levels, points,
}) {
  const nonGapCols = (columns ?? []).filter(c => !c.isGap)
  const locals = (points ?? []).filter(p => p.type === 'groupe')
  const getCount = (colId, levelId) => locals.filter(p => p.colId === colId && p.levelId === levelId).length
  const displayLevels = [...(levels ?? [])].reverse()

  return (
    <Section title="Groupes de points de puisage" defaultOpen={false}>
      <>
          <div className="lp-label" style={{ marginBottom: 4 }}>Groupes par niveau :</div>
          <div style={{ overflowX: 'auto', marginBottom: 8 }}>
            <table style={{ borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '3px 4px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', fontWeight: 600, position: 'sticky', left: 0, background: '#fff', zIndex: 1, borderRight: '1px solid #e5e7eb' }}>Niveau</th>
                  {nonGapCols.map(col => (
                    <th key={col.id} style={{ textAlign: 'center', padding: '3px 4px', color: '#6b7280', borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{col.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayLevels.map(level => (
                  <tr key={level.id}>
                    <td style={{ padding: '3px 4px', color: '#374151', position: 'sticky', left: 0, background: '#fff', zIndex: 1, borderRight: '1px solid #e5e7eb' }}>{level.name}</td>
                    {nonGapCols.map(col => {
                      const count = getCount(col.id, level.id)
                      return (
                        <td key={col.id} style={{ textAlign: 'center', padding: '2px 3px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            <button className="lp-icon-btn" style={{ padding: '1px 5px', lineHeight: 1 }}
                              onClick={() => onRemoveGroupe(col.id, level.id)}
                              disabled={count === 0}>−</button>
                            <span style={{ minWidth: 14, textAlign: 'center', fontWeight: 600 }}>{count}</span>
                            <button className="lp-icon-btn" style={{ padding: '1px 5px', lineHeight: 1 }}
                              onClick={() => onAddGroupe(col.id, level.id)}>+</button>
                          </div>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="lp-field">
            <label className="lp-checkbox-label">
              <input type="checkbox" checked={!!groupesEditMode}
                onChange={e => onGroupesEditModeChange(e.target.checked)} />
              <span>Déplacer les groupes</span>
            </label>
          </div>
      </>
    </Section>
  )
}

export default function LeftPanel({
  activeCalcId,
  globalParams, onGlobalParamsChange,
  alimentationParams, onAlimentationParamsChange,
  levels, lineYs, onLevelsChange, onLineYsChange,
  editLevelsEnabled, onEditLevelsChange,
  materials, onMaterialsChange,
  insulations, onInsulationsChange,
  columns, columnXs, onColumnsChange, onColumnXsChange, onRemoveColumn, onAddColumn, onAddGap, onMoveGaine,
  editColumnsEnabled, onEditColumnsChange,
  chaufferie,
  segments, points, networkFlows,
  drawMode, editParam, onEditParamChange,
  onSelectIds, onConnHighlight,
  groupesEditMode, onGroupesEditModeChange, showGroupeNames, onShowGroupeNamesChange,
  onAddGroupe, onRemoveGroupe,
}) {
  if (drawMode === 'editParams') {
    return (
      <div className="left-panel">
        <div className="lp-section">
          <div className="lp-section-header" style={{ pointerEvents: 'none' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width={13} height={13} viewBox="0 0 13 13" style={{ flexShrink: 0 }}>
                <rect x={1} y={1} width={11} height={11} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.2} />
                <line x1={3.5} y1={4}   x2={9.5} y2={4}   stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
                <line x1={3.5} y1={6.5} x2={9.5} y2={6.5} stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
                <line x1={3.5} y1={9}   x2={7}   y2={9}   stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
              </svg>
              Attribution des paramètres
            </span>
          </div>
          <div className="lp-section-body">
            <EditParamsPanel
              segments={segments} points={points}
              materials={materials} insulations={insulations}
              levels={levels} lineYs={lineYs}
              columns={columns} columnXs={columnXs}
              chaufferie={chaufferie}
              editParam={editParam} onEditParamChange={onEditParamChange}
              activeCalcId={activeCalcId}
              alimentationParams={alimentationParams}
            />
          </div>
        </div>
      </div>
    )
  }

  if (drawMode === 'errors') {
    return (
      <ErrorPanel
        segments={segments} points={points}
        levels={levels} lineYs={lineYs}
        columns={columns} columnXs={columnXs}
        chaufferie={chaufferie}
        networkFlows={networkFlows}
        onSelectIds={onSelectIds}
        onConnHighlight={onConnHighlight}
        activeCalcId={activeCalcId}
      />
    )
  }

  if (activeCalcId === 'alimentation-ecs' || activeCalcId === 'alimentation-ef') {
    return (
      <div className="left-panel">
        <MaterialsSection materials={materials} onChange={onMaterialsChange} showLambda={false} />
        <AlimentationParamsSection params={alimentationParams} onChange={onAlimentationParamsChange} />
        <LevelsSection
          levels={levels} lineYs={lineYs}
          onLevelsChange={onLevelsChange} onLineYsChange={onLineYsChange}
          editLevelsEnabled={editLevelsEnabled} onEditLevelsChange={onEditLevelsChange}
        />
        <ColumnsSection
          columns={columns} columnXs={columnXs}
          onColumnsChange={onColumnsChange} onColumnXsChange={onColumnXsChange}
          onRemoveColumn={onRemoveColumn} onAddColumn={onAddColumn} onAddGap={onAddGap} onMoveGaine={onMoveGaine}
          levels={levels}
          editColumnsEnabled={editColumnsEnabled} onEditColumnsChange={onEditColumnsChange}
        />
        <GroupesSection
          groupesEditMode={groupesEditMode} onGroupesEditModeChange={onGroupesEditModeChange}
          showGroupeNames={showGroupeNames} onShowGroupeNamesChange={onShowGroupeNamesChange}
          onAddGroupe={onAddGroupe} onRemoveGroupe={onRemoveGroupe}
          columns={columns} levels={levels} points={points}
        />
      </div>
    )
  }

  return (
    <div className="left-panel">
      <GlobalParamsSection params={globalParams} onChange={onGlobalParamsChange} />
      <MaterialsSection materials={materials} onChange={onMaterialsChange} />
      <InsulationsSection insulations={insulations} onChange={onInsulationsChange} />
      <LevelsSection
        levels={levels} lineYs={lineYs}
        onLevelsChange={onLevelsChange} onLineYsChange={onLineYsChange}
        editLevelsEnabled={editLevelsEnabled} onEditLevelsChange={onEditLevelsChange}
      />
      <ColumnsSection
        columns={columns} columnXs={columnXs}
        onColumnsChange={onColumnsChange} onColumnXsChange={onColumnXsChange}
        onRemoveColumn={onRemoveColumn} onAddColumn={onAddColumn} onAddGap={onAddGap} onMoveGaine={onMoveGaine}
        levels={levels}
        editColumnsEnabled={editColumnsEnabled} onEditColumnsChange={onEditColumnsChange}
      />
      <GroupesSection
        groupesEditMode={groupesEditMode} onGroupesEditModeChange={onGroupesEditModeChange}
        showGroupeNames={showGroupeNames} onShowGroupeNamesChange={onShowGroupeNamesChange}
        onAddGroupe={onAddGroupe} onRemoveGroupe={onRemoveGroupe}
        columns={columns} levels={levels} points={points}
      />
    </div>
  )
}
