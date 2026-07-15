import { useState, useMemo, useEffect, useRef } from 'react'
import type { CalcMode } from '../types'
import { getDisplayName } from '../utils/naming'
import { EQUIPMENT_TYPES, FITTING_TYPES, getEquipmentForMode } from '../utils/pdcCalc'
import { NumInput } from './NumInput'
import { uid } from '../utils/idGen'
import { getModeFlags } from '../utils/calcModeFlags'

const asNum = (v: any): number | null => {
  if (v == null || v === '') return null
  const n = Number(v)
  return isNaN(n) ? null : n
}

function Section({ title = null, children, noPad = false }) {
  return (
    <div className="lp-section">
      {title && <div className="lp-section-subtitle">{title}</div>}
      <div className={noPad ? 'lp-section-body-nopad' : 'lp-section-body'}>{children}</div>
    </div>
  )
}

function Field({ label, unit = undefined, children }) {
  return (
    <div className="lp-field">
      <label className="lp-label">
        {label}{unit && <span className="lp-unit"> ({unit})</span>}
      </label>
      {children}
    </div>
  )
}


// ── Levels ─────────────────────────────────────────────
function LevelsSection({ levels, lineYs, onLevelsChange, onLineYsChange, chaufferie, onAddChaufferie, editChaufferie, onEditChaufferieChange, placingChaufferie, activeCalcId, locauxEF, onAddLocalEF, placingLocalEF, editLocauxEF, onEditLocauxEFChange, locauxECS, onAddLocalECS, placingLocalECS, editLocauxECS, onEditLocauxECSChange, locauxChauffage, onAddLocalChauffage, placingLocalChauffage, editLocauxChauffage, onEditLocauxChauffageChange }) {
  const { isAlimEF, isChauffage, isBouclage, isAlimECS, isEauGlacee } = getModeFlags(activeCalcId)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const rename        = (id, name)  => onLevelsChange(levels.map(l => l.id === id ? { ...l, name } : l))
  const setHauteur    = (id, h)     => onLevelsChange(levels.map(l => l.id === id ? { ...l, hauteur: h } : l))
  const setTAmb       = (id, v)     => onLevelsChange(levels.map(l => l.id === id ? { ...l, t_amb_override: v } : l))
  const toggleSousSol = (id)        => onLevelsChange(levels.map(l => l.id === id ? { ...l, isSousSol: !l.isSousSol } : l))

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
    const h      = prevY - topY
    newYs.push(topY - h)
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
  const tAmbSS    = 10
  const tAmbOther = 20

  return (
    <Section title="Niveaux">
      <div className="lp-levels-list">
        <div className="lp-level-row lp-level-toiture">
          <span className="lp-level-badge">▲</span>
          <span className="lp-level-toiture-label">Toiture</span>
        </div>
        {displayOrder.map((lvl) => {
          const origIdx = levels.indexOf(lvl)
          const isOpen  = expandedId === lvl.id
          const tDefault = lvl.isSousSol ? tAmbSS : tAmbOther
          return (
            <div key={lvl.id}>
              <div className="lp-level-row">
                <button
                  className="lp-icon-btn"
                  style={{ flexShrink: 0 }}
                  onClick={() => setExpandedId(x => x === lvl.id ? null : lvl.id)}
                  title={isOpen ? 'Réduire' : 'Modifier hauteur et température'}
                >{isOpen ? '▾' : '▸'}</button>
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
              {isOpen && (
                <div className="lp-level-expanded">
                  <div className="lp-level-expanded-row">
                    <span className="lp-level-expanded-label">Hauteur</span>
                    <NumInput
                      min={0} step={0.1}
                      className="lp-level-exp-input"
                      value={lvl.hauteur ?? null}
                      placeholder={`2,70 (par défaut)`}
                      allowEmpty
                      onChange={v => setHauteur(lvl.id, v ?? undefined)}
                    />
                    <span className="lp-level-expanded-unit">m</span>
                  </div>
                  {!isChauffage && (
                  <div className="lp-level-expanded-row">
                    <span className="lp-level-expanded-label">T° ambiante</span>
                    <NumInput
                      step={0.5}
                      className="lp-level-exp-input"
                      value={lvl.t_amb_override ?? null}
                      placeholder={`${tDefault} (par défaut)`}
                      allowEmpty
                      onChange={v => setTAmb(lvl.id, v)}
                    />
                    <span className="lp-level-expanded-unit">°C</span>
                  </div>
                  )}
                  {/* ── Chaufferie / Production ECS — bouton Modifier uniquement si déjà posée ── */}
                  {!isAlimEF && chaufferie?.placed && chaufferie?.enabled && chaufferie?.levelId === lvl.id && (
                    <button
                      onClick={() => onEditChaufferieChange?.(!editChaufferie)}
                      style={{
                        marginTop: 6, width: '100%', padding: '4px 0', fontSize: 11, fontWeight: 600,
                        background: editChaufferie ? '#eef2ff' : '#f8fafc',
                        color: editChaufferie ? '#4338ca' : '#6b7280',
                        border: `1px solid ${editChaufferie ? '#818cf8' : '#e5e7eb'}`,
                        borderRadius: 5, cursor: 'pointer',
                      }}>
                      ✎ Modifier {isChauffage ? 'la chaufferie' : isEauGlacee ? 'la production EG' : 'la production ECS'}
                    </button>
                  )}
                  {/* ── Locaux ECS (mode ECS bouclage / alim) ── */}
                  {(isBouclage || isAlimECS) && (() => {
                    const hasOnThisLevel = (locauxECS ?? []).some(l => l.levelId === lvl.id)
                    return (
                      <>
                        {hasOnThisLevel && (
                          <button
                            onClick={() => onEditLocauxECSChange?.(!editLocauxECS)}
                            style={{
                              marginTop: 6, width: '100%', padding: '4px 0', fontSize: 11, fontWeight: 600,
                              background: editLocauxECS ? '#eef2ff' : '#f8fafc',
                              color: editLocauxECS ? '#4338ca' : '#6b7280',
                              border: `1px solid ${editLocauxECS ? '#818cf8' : '#e5e7eb'}`,
                              borderRadius: 5, cursor: 'pointer',
                            }}>
                            ✎ Modifier les locaux ECS
                          </button>
                        )}
                        <button
                          onClick={() => onAddLocalECS?.()}
                          style={{
                            marginTop: 6, width: '100%', padding: '4px 0', fontSize: 11, fontWeight: 600,
                            background: placingLocalECS ? '#ecfdf5' : '#f8fafc',
                            color: placingLocalECS ? '#047857' : '#6b7280',
                            border: `1px solid ${placingLocalECS ? '#6ee7b7' : '#e5e7eb'}`,
                            borderRadius: 5, cursor: 'pointer',
                          }}>
                          Ajouter un local ECS
                        </button>
                      </>
                    )
                  })()}
                  {/* ── Locaux Chauffage ── */}
                  {isChauffage && (() => {
                    const hasOnThisLevel = (locauxChauffage ?? []).some(l => l.levelId === lvl.id)
                    return (
                      <>
                        {hasOnThisLevel && (
                          <button
                            onClick={() => onEditLocauxChauffageChange?.(!editLocauxChauffage)}
                            style={{
                              marginTop: 6, width: '100%', padding: '4px 0', fontSize: 11, fontWeight: 600,
                              background: editLocauxChauffage ? '#eef2ff' : '#f8fafc',
                              color: editLocauxChauffage ? '#4338ca' : '#6b7280',
                              border: `1px solid ${editLocauxChauffage ? '#818cf8' : '#e5e7eb'}`,
                              borderRadius: 5, cursor: 'pointer',
                            }}>
                            ✎ Modifier les locaux chauffage
                          </button>
                        )}
                        <button
                          onClick={() => onAddLocalChauffage?.()}
                          style={{
                            marginTop: 6, width: '100%', padding: '4px 0', fontSize: 11, fontWeight: 600,
                            background: placingLocalChauffage ? '#fff7ed' : '#f8fafc',
                            color: placingLocalChauffage ? '#c2410c' : '#6b7280',
                            border: `1px solid ${placingLocalChauffage ? '#fed7aa' : '#e5e7eb'}`,
                            borderRadius: 5, cursor: 'pointer',
                          }}>
                          Ajouter un local chauffage
                        </button>
                      </>
                    )
                  })()}
                  {/* ── Locaux EF ── */}
                  {isAlimEF && (() => {
                    const hasOnThisLevel = (locauxEF ?? []).some(l => l.levelId === lvl.id)
                    return (
                      <>
                        {hasOnThisLevel && (
                          <button
                            onClick={() => onEditLocauxEFChange?.(!editLocauxEF)}
                            style={{
                              marginTop: 6, width: '100%', padding: '4px 0', fontSize: 11, fontWeight: 600,
                              background: editLocauxEF ? '#eef2ff' : '#f8fafc',
                              color: editLocauxEF ? '#4338ca' : '#6b7280',
                              border: `1px solid ${editLocauxEF ? '#818cf8' : '#e5e7eb'}`,
                              borderRadius: 5, cursor: 'pointer',
                            }}>
                            ✎ Modifier les locaux EF
                          </button>
                        )}
                        <button
                          onClick={() => onAddLocalEF?.()}
                          style={{
                            marginTop: 6, width: '100%', padding: '4px 0', fontSize: 11, fontWeight: 600,
                            background: placingLocalEF ? '#eef2ff' : '#f8fafc',
                            color: placingLocalEF ? '#4338ca' : '#6b7280',
                            border: `1px solid ${placingLocalEF ? '#818cf8' : '#e5e7eb'}`,
                            borderRadius: 5, cursor: 'pointer',
                          }}>
                          Ajouter un local EF
                        </button>
                      </>
                    )
                  })()}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <button className="lp-add-btn" onClick={addLevel}>+ Ajouter un niveau</button>
    </Section>
  )
}

// ── Columns ────────────────────────────────────────────
function ColumnsSection({ columns, columnXs, onColumnsChange, onColumnXsChange, onRemoveColumn, onAddColumn, onAddGap, onMoveGaine, levels }) {
  const [expanded, setExpanded] = useState(null)

  const setName = (id, name) =>
    onColumnsChange(cols => cols.map(c => c.id === id ? { ...c, name } : c))

  const setLevelIds = (id, levelIds) =>
    onColumnsChange(cols => cols.map(c => c.id === id ? { ...c, levelIds } : c))

  // Returns the nearest regular column index to the left of idx, skipping all gap entries.
  const prevColIdx = (idx) => {
    let i = idx - 1
    while (i >= 0 && columns[i]?.isGap) i--
    return i
  }

  // Returns the nearest regular column index to the right of idx, skipping all gap entries.
  const nextColIdx = (idx) => {
    let i = idx + 1
    while (i < columns.length && columns[i]?.isGap) i++
    return i < columns.length ? i : -1
  }

  // Swap only name (and levelIds) between two column slots — xs and ids stay fixed.
  const swapColNames = (idxA, idxB) => {
    onColumnsChange(cols => {
      const newCols = [...cols]
      const { name: nA, levelIds: lA } = newCols[idxA]
      const { name: nB, levelIds: lB } = newCols[idxB]
      newCols[idxA] = { ...newCols[idxA], name: nB, levelIds: lB }
      newCols[idxB] = { ...newCols[idxB], name: nA, levelIds: lA }
      return newCols
    })
  }

  const moveLeft = (idx) => {
    const prev = prevColIdx(idx)
    if (prev < 0) return
    swapColNames(prev, idx)
  }

  const moveRight = (idx) => {
    const next = nextColIdx(idx)
    if (next < 0) return
    swapColNames(idx, next)
  }

  const removeCol = (idx) => {
    if (columns.length <= 1) return
    onRemoveColumn(idx)
  }

  const addGap = () => onAddGap()

  return (
    <Section title="Colonnes">
      <div className="lp-levels-list">
        {columns.map((col, i) => (
          <div key={col.id}>
            {col.isGap ? (
              <div className="lp-level-row" style={{ opacity: 0.65 }}>
                <span style={{ flex: 1, fontSize: 11, color: '#9ca3af', fontStyle: 'italic', paddingLeft: 4 }}>
                  {col.isPPZone ? '— Gaine (groupe) —' : '— Gaine —'}
                </span>
                <div className="lp-level-btns">
                  {!col.isPPZone && (() => {
                    const leftIsGroup = columns[i - 1]?.isPPZone
                    const leftTargetIdx = leftIsGroup ? i - 2 : i - 1
                    const leftX = columnXs[leftTargetIdx]
                    const leftDisabled = leftTargetIdx < 0 || leftX === undefined
                    const rightCol = columns[i + 1]
                    const rightHasGroup = rightCol && !rightCol.isGap &&
                      columns[i + 2]?.isPPZone && columns[i + 2]?.colId === rightCol.id
                    const rightX = rightHasGroup ? columnXs[i + 3] : columnXs[i + 2]
                    const rightDisabled = rightX === undefined
                    return (<>
                      <button className="lp-icon-btn"
                        onClick={() => onMoveGaine(i, leftX)}
                        disabled={leftDisabled}
                        title="Vers la gauche">◀</button>
                      <button className="lp-icon-btn"
                        onClick={() => onMoveGaine(i, rightX)}
                        disabled={rightDisabled}
                        title="Vers la droite">▶</button>
                    </>)
                  })()}
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
                {(() => {
                  const pIdx = prevColIdx(i)
                  const nIdx = nextColIdx(i)
                  return (<>
                    <button className="lp-icon-btn" onClick={() => moveLeft(i)} disabled={pIdx < 0} title="Vers la gauche">◀</button>
                    <button className="lp-icon-btn" onClick={() => moveRight(i)} disabled={nIdx < 0} title="Vers la droite">▶</button>
                  </>)
                })()}
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
      <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
        <button className="lp-add-btn" style={{ flex: 1, padding: '4px 4px', whiteSpace: 'nowrap' }} onClick={onAddColumn}>+ Ajouter une colonne</button>
        <button className="lp-add-btn" style={{ flex: 1, padding: '4px 4px', whiteSpace: 'nowrap' }} onClick={addGap}>+ Ajouter une gaine</button>
      </div>
    </Section>
  )
}


// ── Alimentation ECS : débits de base par appareil ─────
function AlimentationParamsSection({ params, onChange }) {
  const [editMode,    setEditMode]    = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newName,     setNewName]     = useState('')
  const [newQBase,    setNewQBase]    = useState<number | null>(null)
  if (!params?.appareils) return null

  const setEnabled = (id, v) => onChange({
    ...params,
    appareils: params.appareils.map(a => a.id === id ? { ...a, enabled: v } : a),
  })
  const setQBase = (id, v) => onChange({
    ...params,
    appareils: params.appareils.map(a => a.id === id ? { ...a, qBase: parseFloat(v) || 0 } : a),
  })
  const removeAppareil = (id) => onChange({
    ...params,
    appareils: params.appareils.filter(a => a.id !== id),
  })
  const addAppareil = () => {
    if (!newName.trim() || newQBase == null || newQBase <= 0) return
    onChange({
      ...params,
      appareils: [...params.appareils, { id: `custom_${Date.now()}`, name: newName.trim(), qBase: newQBase, k: null, enabled: true }],
    })
    setNewName('')
    setNewQBase(null)
    setShowAddForm(false)
  }

  return (
    <Section>
      <div className="lp-field" style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
        <label className="lp-label" style={{ marginBottom: 0, whiteSpace: 'nowrap' }}>Type de bâtiment</label>
        <select
          value={params.buildingType ?? 'habitation'}
          onChange={e => onChange({ ...params, buildingType: e.target.value })}
          style={{
            flex: 1, fontSize: 13, padding: '4px 6px', borderRadius: 5,
            border: '1px solid #d1d5db', background: '#f9fafb', color: '#111827', cursor: 'pointer',
          }}>
          <option value="habitation">Habitation</option>
          <option value="bureaux">Bureaux</option>
          <option value="enseignement">Enseignement</option>
          <option value="hopital">Hôpital</option>
          <option value="internat">Internat</option>
          <option value="stade">Stade</option>
          <option value="gymnase">Gymnase</option>
          <option value="caserne">Caserne</option>
          <option value="autre">Autre</option>
        </select>
      </div>

      {params.appareils.map(a => (
        <div key={a.id} className="lp-mat-block" style={{ marginBottom: 2, paddingBottom: 2, borderBottom: 'none' }}>
          <div className="lp-mat-header">
            <label className="lp-checkbox-label" style={{ flex: 1, minWidth: 0 }}>
              <input type="checkbox" checked={a.enabled}
                onChange={e => setEnabled(a.id, e.target.checked)} />
              <span style={{ color: a.enabled ? '#111827' : '#6b7280' }}>{a.name}</span>
            </label>
            {editMode ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                <NumInput step={0.01} min={0}
                  value={asNum(a.qBase)}
                  onChange={v => { if (v != null) setQBase(a.id, v) }}
                  style={{ width: 60, fontSize: 11 }} />
                <span style={{ fontSize: 10, color: '#374151' }}>l/s</span>
                {a.id.startsWith('custom_') && (
                  <button onClick={() => removeAppareil(a.id)}
                    style={{ marginLeft: 2, width: 18, height: 18, border: '1px solid #fca5a5',
                      borderRadius: 3, background: '#fef2f2', color: '#dc2626',
                      cursor: 'pointer', fontSize: 12, lineHeight: 1,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    ×
                  </button>
                )}
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
      <div style={{ marginTop: 4 }}>
        {showAddForm ? (
          <div style={{ display: 'flex', gap: 4, alignItems: 'stretch' }}>
            <input
              type="text"
              placeholder="Nom"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addAppareil(); if (e.key === 'Escape') { setShowAddForm(false); setNewName(''); setNewQBase(null) } }}
              autoFocus
              style={{ flex: 2, fontSize: 11, padding: '4px 7px',
                border: '1px solid #d1d5db', borderRadius: 5, minWidth: 0 }}
            />
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0,
              border: '1px solid #d1d5db', borderRadius: 5, overflow: 'hidden', background: '#fff' }}>
              <NumInput step={0.01} min={0} value={newQBase}
                onChange={v => setNewQBase(v)}
                style={{ flex: 1, fontSize: 11, border: 'none', minWidth: 0 }} />
              <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 500,
                paddingRight: 6, flexShrink: 0 }}>l/s</span>
            </div>
            <button onClick={addAppareil}
              disabled={!newName.trim() || newQBase == null || newQBase <= 0}
              style={{ flexShrink: 0, width: 28, fontSize: 16, fontWeight: 500,
                border: '1px solid #d1d5db', borderRadius: 5, cursor: 'pointer',
                background: '#f3f4f6', color: '#6b7280', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              +
            </button>
          </div>
        ) : (
          <button className="lp-add-btn" onClick={() => setShowAddForm(true)}>
            + Ajouter un équipement
          </button>
        )}
      </div>

      <label className="lp-checkbox-label" style={{ marginTop: 6, paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
        <input type="checkbox" checked={editMode} onChange={e => setEditMode(e.target.checked)} />
        <span>Modifier les valeurs</span>
      </label>
    </Section>
  )
}

// ── Materials ──────────────────────────────────────────
function MaterialsSection({ materials, onChange, showLambda = true, showEpsilon = false, compact = false, isChauffage = false }) {
  const [expanded, setExpanded] = useState(null)

  const toggle      = id      => onChange(m => m.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x))
  const setLambda   = (id, v) => onChange(m => m.map(x => x.id === id ? { ...x, lambda: v } : x))
  const setEpsilon  = (id, v) => onChange(m => m.map(x => x.id === id ? { ...x, epsilon: v } : x))
  const setName     = (id, v) => onChange(m => m.map(x => x.id === id ? { ...x, name: v } : x))
  const removeMat   = id      => onChange(m => m.filter(x => x.id !== id))
  const setEncrassement         = (id, v) => onChange(m => m.map(x => x.id === id ? { ...x, encrassement: v } : x))
  const setEncrassementEpaisseur = (id, v) => onChange(m => m.map(x => x.id === id ? { ...x, encrassementEpaisseur: v } : x))
  const setDnField  = (mid, idx, key, v) => onChange(m => m.map(x => {
    if (x.id !== mid) return x
    const dns = x.dns.map((d, i) => i === idx ? { ...d, [key]: key === 'dn' ? v : (typeof v === 'number' ? v : parseFloat(v) || 0) } : d)
    return { ...x, dns }
  }))
  const addDnRow    = id      => onChange(m => m.map(x => x.id === id ? { ...x, dns: [...x.dns, { dn: '', di: 0, de: 0 }] } : x))
  const removeDnRow = (id, i) => onChange(m => m.map(x => x.id === id ? { ...x, dns: x.dns.filter((_, j) => j !== i) } : x))
  const addCustom   = ()      => onChange(m => [...m, { id: uid('mat'), name: '', enabled: true, lambda: '', dns: [], custom: true }])

  return (
    <Section>
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
              {mat.custom && !compact && (
                <button className="lp-icon-btn danger" onClick={() => removeMat(mat.id)} title="Supprimer">✕</button>
              )}
            </div>
          </div>
          {mat.enabled && expanded === mat.id && (
            <>
              {showLambda && !compact && (
                <div className="lp-mat-lambda">
                  <span>λ =</span>
                  <NumInput step={0.001} value={asNum(mat.lambda)}
                    onChange={v => { if (v != null) setLambda(mat.id, v) }} />
                  <span className="lp-unit">W/m·K</span>
                </div>
              )}
              {showEpsilon && !compact && (
                <div className="lp-mat-lambda">
                  <span>ε =</span>
                  <NumInput step={0.000001} min={0}
                    value={mat.epsilon ?? null}
                    placeholder={mat.epsilon != null ? String(mat.epsilon) : '0.0001'}
                    allowEmpty
                    onChange={v => { if (v != null) setEpsilon(mat.id, v) }} />
                  <span className="lp-unit">m</span>
                  <span style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic' }}>(rugosité)</span>
                </div>
              )}
              {!compact && !isChauffage && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#6b7280', marginBottom: 4 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <span>Présence de tartre</span>
                    <input type="checkbox" style={{ width: 'auto', margin: 0, marginTop: 2 }}
                      checked={mat.encrassement ?? false}
                      onChange={() => setEncrassement(mat.id, !(mat.encrassement ?? false))} />
                  </label>
                  {mat.encrassement && (<>
                    <span style={{ whiteSpace: 'nowrap' }}>ép.</span>
                    <div style={{ width: 42, flexShrink: 0 }}>
                      <NumInput step={0.1} min={0}
                        value={mat.encrassementEpaisseur ?? null}
                        placeholder=""
                        allowEmpty
                        onChange={v => setEncrassementEpaisseur(mat.id, v ?? undefined)} />
                    </div>
                    <span className="lp-unit">mm</span>
                  </>)}
                </div>
              )}
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
                      <td><NumInput value={asNum(d.di)} onChange={v => { if (v != null) setDnField(mat.id, i, 'di', v) }} /></td>
                      <td><NumInput value={asNum(d.de)} onChange={v => { if (v != null) setDnField(mat.id, i, 'de', v) }} /></td>
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
  const [expanded, setExpanded] = useState(null)
  const toggle      = id      => onChange(ins => ins.map(x => x.id === id ? { ...x, enabled: !x.enabled } : x))
  const setLambda   = (id, v) => onChange(ins => ins.map(x => x.id === id ? { ...x, lambda: v } : x))
  const setName     = (id, v) => onChange(ins => ins.map(x => x.id === id ? { ...x, name: v } : x))
  const removeIns   = id      => onChange(ins => ins.filter(x => x.id !== id))
  const setThick    = (id, idx, v) => onChange(ins => ins.map(x => {
    if (x.id !== id) return x
    const t = [...x.thicknesses]; t[idx] = typeof v === 'number' ? v : (parseFloat(String(v)) || 0)
    return { ...x, thicknesses: t }
  }))
  const addThick    = id      => onChange(ins => ins.map(x => x.id === id ? { ...x, thicknesses: [...x.thicknesses, ''] } : x))
  const removeThick = (id, idx) => onChange(ins => ins.map(x =>
    x.id === id ? { ...x, thicknesses: x.thicknesses.filter((_, i) => i !== idx) } : x
  ))
  const addCustom   = ()      => onChange(ins => [...ins, { id: uid('ins'), name: '', enabled: true, lambda: '', thicknesses: [], custom: true }])

  return (
    <Section>
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
            <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
              {ins.enabled && (
                <button className="lp-icon-btn" onClick={() => setExpanded(x => x === ins.id ? null : ins.id)}>
                  {expanded === ins.id ? '▾' : '▸'}
                </button>
              )}
              {ins.custom && (
                <button className="lp-icon-btn danger" onClick={() => removeIns(ins.id)} title="Supprimer">✕</button>
              )}
            </div>
          </div>
          {ins.enabled && expanded === ins.id && (
            <>
              <div className="lp-mat-lambda">
                <span>λ =</span>
                <NumInput step={0.001} value={asNum(ins.lambda)}
                  onChange={v => { if (v != null) setLambda(ins.id, v) }} />
                <span className="lp-unit">W/m·K</span>
              </div>
              <div className="lp-thicknesses">
                <label className="lp-label">Épaisseurs disponibles (mm) :</label>
                {ins.thicknesses.length === 0 && (
                  <p className="lp-hint">Aucune épaisseur ajoutée.</p>
                )}
                {ins.thicknesses.map((t, i) => (
                  <div key={i} className="lp-thickness-row">
                    <NumInput value={asNum(t)}
                      onChange={v => { if (v != null) setThick(ins.id, i, v) }} />
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

function computeGroups(paramType, segments, materials, insulations, isChauffage = false) {
  if (paramType === 'type') {
    const aller = [], retour = []
    for (const s of segments) { if (s.type === 'aller') aller.push(s.id); else retour.push(s.id) }
    const suffix = isChauffage ? 'CH' : 'ECS'
    return { rows: [
      { key: 'aller',  label: `Aller ${suffix}`,  ids: aller,  color: '#dc2626' },
      { key: 'retour', label: `Retour ${suffix}`, ids: retour, color: '#f97316' },
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
  const { isAlimEF: isEF, isAlimMode: isAlim, isChauffage } = getModeFlags(activeCalcId)
  const set = patch => onEditParamChange({ ...editParam, ...patch })
  const { paramType, segType, materialId, dn, insulationId, thickness,
          length, flowVelocityMode, flowVelocityValue } = editParam

  const isBouclageECS = !isEF && !isAlim && !isChauffage
  const validTypes = isEF ? ['material', 'length']
    : isAlim   ? ['material', 'length']
    : isChauffage ? ['material', 'length']
    : ['material', 'insulation', 'length', 'flowVelocity']
  useEffect(() => {
    if (!validTypes.includes(paramType)) set({ paramType: 'material' })
  }, [isAlim, isChauffage, paramType])

  const enabledMats = materials.filter(m => m.enabled)
  const enabledIns  = insulations.filter(i => i.enabled)
  const selMat = enabledMats.find(m => m.id === materialId)
  const selIns = enabledIns.find(i => i.id === insulationId)

  const { rows: groups, missing } = useMemo(
    () => computeGroups(paramType, segments, materials, insulations, isChauffage),
    [paramType, segments, materials, insulations, isChauffage]
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
          <option value="material">Matériau & DN</option>
          {!isAlim && !isChauffage && <option value="insulation">Isolant & épaisseur</option>}
          <option value="length">Longueur</option>
          {isBouclageECS && <option value="flowVelocity">Débit / vitesse</option>}
        </select>
      </div>

      {/* Value selector */}
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
                <option value="">— Choisir —</option>
                {selIns.thicknesses.map(t => <option key={t} value={t}>{t} mm</option>)}
              </select>
            ) : (
              <NumInput placeholder="mm" value={thickness ?? null} allowEmpty
                onChange={v => set({ thickness: v })} />
            )}
          </div>
        )}
      </>)}

      {paramType === 'length' && (
        <div className="lp-field">
          <label className="lp-label">Valeur à appliquer</label>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <NumInput min={0} step={0.1} style={{ flex: 1 }}
              value={length ?? null} placeholder="m" allowEmpty
              onChange={v => set({ length: v })} />
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
          <NumInput min={0}
            step={0.001}
            value={flowVelocityValue ?? null}
            placeholder={flowVelocityMode === 'flowRate' ? 'm³/h' : 'm/s'}
            allowEmpty
            onChange={v => set({ flowVelocityValue: v })} />
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

function ErrorPanel({ segments, points, levels, lineYs, columns, columnXs, chaufferie, networkFlows, onSelectIds, onConnHighlight, activeCalcId, flowDirections = null, roleMap = null, hasConnectedProductions = false }) {
  const [showConnHighlight,   setShowConnHighlight]   = useState(false)
  const [showManualHighlight, setShowManualHighlight] = useState(false)
  const { isAlimEF: isEF, isChauffage, isEauGlacee } = getModeFlags(activeCalcId)

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
      // Les bouts fermés légitimes : groupes, arrivées EF, émetteurs chauffage
      const startPt = points.find(p => p.id === s.startPointId)
      const endPt   = points.find(p => p.id === s.endPointId)
      return startPt?.type !== 'groupe'    && endPt?.type !== 'groupe'
        && startPt?.type !== 'arriveeEF'   && endPt?.type !== 'arriveeEF'
        && startPt?.type !== 'emetteur'    && endPt?.type !== 'emetteur'
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
      {getDisplayName(s, segments, levels, lineYs, columns, columnXs, chaufferie, points, roleMap?.get(s.id) ?? null, activeCalcId, roleMap ?? null, flowDirections ?? null)}
    </div>
  )

  const hasAllerRetour   = segments.some(s => s.type === 'aller' || s.type === 'retour' || s.type === 'aller-ch' || s.type === 'retour-ch')
  const hasProdECS       = points.some(p => p.type === 'productionECS')
  const hasProdCH        = points.some(p => p.type === 'productionChauffage')
  const hasProdEG        = points.some(p => p.type === 'productionEauGlacee')
  const hasArriveeEF     = points.some(p => p.type === 'arriveeEF')
  const missingProdECS   = !isEF && !isChauffage && !isEauGlacee && hasAllerRetour && !hasProdECS
  const missingProdCH    = isChauffage && hasAllerRetour && !hasProdCH
  const missingProdEG    = isEauGlacee && hasAllerRetour && !hasProdEG
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

      {missingProdCH && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#991b1b', marginBottom: 4 }}>
            Production chauffage non placée
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
            Des tronçons Aller/Retour CH sont tracés, mais aucune
            production chauffage n'est placée sur le synoptique.
            Utilisez le bouton <strong style={{ color: '#374151' }}>Prod. CH</strong> dans
            la barre d'outils pour la positionner.
          </div>
        </div>
      )}

      {missingProdEG && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#991b1b', marginBottom: 4 }}>
            Production eau glacée non placée
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
            Des tronçons Aller/Retour EG sont tracés, mais aucune
            production eau glacée n'est placée sur le synoptique.
            Utilisez le bouton <strong style={{ color: '#374151' }}>Prod. EG</strong> dans
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

      {hasConnectedProductions && (
        <div style={{ padding: '10px 12px', borderBottom: '1px solid #e5e7eb', background: '#fef2f2' }}>
          <div style={{ fontWeight: 600, fontSize: 11, color: '#991b1b', marginBottom: 4 }}>
            Productions ECS reliées entre elles
          </div>
          <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.5 }}>
            Deux productions ECS ou plus sont connectées par des tronçons.
            Chaque production ECS doit appartenir à un réseau indépendant (non relié aux autres).
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

// ── Composants PDC (définis ici, hors des fonctions, pour éviter un remontage sur chaque render) ──
function Block({ color, children }) {
  return (
    <div style={{
      borderLeft: `3px solid ${color}`,
      borderTop: '1px solid #e5e7eb',
      borderRight: '1px solid #e5e7eb',
      borderBottom: '1px solid #e5e7eb',
      background: '#fff',
      borderRadius: '0 6px 6px 0',
      padding: '10px 10px 10px 12px',
      marginBottom: 8,
    }}>
      {children}
    </div>
  )
}
function BlockTitle({ color, children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color, textTransform: 'uppercase',
      letterSpacing: '0.06em', marginBottom: 8 }}>{children}</div>
  )
}
function BtnRow({ options, value, onSelect, activeColor, activeBg, activeBorder }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {options.map(opt => {
        const active = value === opt.value
        return (
          <button key={opt.value} onClick={() => onSelect(opt.value)}
            style={{
              flex: 1, padding: '4px 6px', fontSize: 10,
              fontWeight: active ? 700 : 500,
              border: `1px solid ${active ? activeBorder : '#e5e7eb'}`,
              borderRadius: 5, cursor: 'pointer',
              background: active ? activeBg : '#f9fafb',
              color: active ? activeColor : '#6b7280',
              transition: 'all 0.1s', lineHeight: 1.3,
            }}>
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
function FormulaHint({ children }) {
  return (
    <div style={{ marginTop: 3, fontSize: 10, color: '#6b7280', lineHeight: 1.3, paddingLeft: 2 }}>
      {children}
    </div>
  )
}

// ── Pertes de charge — commun Bouclage + Alimentation ECS/EF ────────────
function PdcParamsSection({ params, onChange,
  isAlimECS = false,
  isAlimEF = false,
  isChauffage = false,
  totalQpAlimM3h = 0,
  selectedAmontId = null, onSelectAmontId, amontTronconResults,
  pressionSourceAlimECSStatic = null,
}: {
  params: any, onChange: (p: any) => void,
  isAlimECS?: boolean,
  isAlimEF?: boolean,
  isChauffage?: boolean,
  totalQpAlimM3h?: number,
  selectedAmontId?: string | null, onSelectAmontId?: (id: string | null) => void,
  amontTronconResults?: Map<string, any>,
  pressionSourceAlimECSStatic?: number | null,
}) {
  const set = (k, v) => onChange({ ...params, [k]: v })
  const mode = params.modePresSource ?? 'depart-ecs'
  const presAtECS = useMemo(() => {
    const tronçons = params.tronçonsAmont ?? []
    if (tronçons.length === 0) return params.pressionArriveeEF ?? 300000
    const lastId = tronçons[tronçons.length - 1].id
    return amontTronconResults?.get(lastId)?.presOut ?? (params.pressionArriveeEF ?? 300000)
  }, [params, amontTronconResults])

  return (
    <Section title="Paramètres">
      <>
        {/* ── Source de pression (alimentation EF uniquement) ── */}
        {isAlimEF && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div className="lp-field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="lp-label">P. arrivée EF <span className="lp-unit">(bar)</span></label>
                <NumInput step={0.1}
                  value={params.pressionEF != null ? params.pressionEF / 100000 : null}
                  placeholder="3,00 (par défaut)"
                  allowEmpty
                  onChange={v => set('pressionEF', v != null ? v * 100000 : null)} />
              </div>
              <div className="lp-field" style={{ flex: 1, marginBottom: 0 }}>
                <label className="lp-label">T° EF <span className="lp-unit">(°C)</span></label>
                <NumInput step={1}
                  value={params.T_ef ?? null}
                  placeholder="10 (par défaut)"
                  allowEmpty
                  onChange={v => set('T_ef', v)} />
              </div>
            </div>
            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '0 0 12px' }} />
          </>
        )}

        {/* ── Source de pression (alimentation ECS uniquement) ── */}
        {isAlimECS && (
          <>
            <div className="lp-field" style={{ marginBottom: 10 }}>
              <label className="lp-label">Source de pression</label>
              <BtnRow
                value={mode}
                onSelect={v => set('modePresSource', v)}
                activeColor="#374151" activeBg="#f3f4f6" activeBorder="#9ca3af"
                options={[
                  { value: 'depart-ecs', label: 'Départ ECS' },
                  { value: 'arrivee-ef', label: 'Arrivée EF → ECS' },
                ]}
              />
            </div>

            {mode === 'depart-ecs' ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 }}>
                <label style={{ fontSize: 11, color: '#374151', fontWeight: 500, flex: 1, marginBottom: 0 }}>
                  Pression dispo. départ ECS
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <NumInput min={0} step={0.1}
                    value={params.pressionSourceDisponible != null ? params.pressionSourceDisponible / 100000 : null}
                    placeholder="3,00 (par défaut)"
                    allowEmpty
                    style={{ width: 105 }}
                    onChange={v => set('pressionSourceDisponible', v != null ? v * 100000 : null)} />
                  <span style={{ fontSize: 10.5, color: '#9ca3af', fontWeight: 400 }}>bar</span>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <div className="lp-field" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="lp-label">P. arrivée EF <span className="lp-unit">(bar)</span></label>
                    <NumInput step={0.1}
                      value={params.pressionArriveeEF != null ? params.pressionArriveeEF / 100000 : null}
                      placeholder="3,00 (par défaut)"
                      allowEmpty
                      onChange={v => set('pressionArriveeEF', v != null ? v * 100000 : null)} />
                  </div>
                  <div className="lp-field" style={{ flex: 1, marginBottom: 0 }}>
                    <label className="lp-label">T° EF <span className="lp-unit">(°C)</span></label>
                    <NumInput step={1}
                      value={params.T_ef ?? null}
                      placeholder="10 (par défaut)"
                      allowEmpty
                      onChange={v => set('T_ef', v)} />
                  </div>
                </div>

                <div style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span className="lp-label" style={{ marginBottom: 0 }}>
                      Tronçons arrivée EF
                    </span>
                    <button onClick={() => {
                      const tr = { id: uid('tr'), length: null, materialId: null, dn: null, di_override: null, coteAmont: null, coteAval: null, pourcentageSing: 20 }
                      set('tronçonsAmont', [...(params.tronçonsAmont ?? []), tr])
                    }} style={{ fontSize: 9.5, padding: '2px 8px', borderRadius: 3,
                      border: '1px solid #d1d5db', background: '#f9fafb', cursor: 'pointer', color: '#374151' }}>
                      + Ajouter
                    </button>
                  </div>
                  {(params.tronçonsAmont ?? []).length === 0 ? (
                    <div style={{ fontSize: 9.5, color: '#9ca3af', fontStyle: 'italic', padding: '2px 0 6px' }}>
                      Aucun tronçon — pression arrivée EF = pression au départ ECS.
                    </div>
                  ) : (params.tronçonsAmont ?? []).map((tr: any, i: number) => {
                    const res = amontTronconResults?.get(tr.id)
                    const active = selectedAmontId === tr.id
                    return (
                      <div key={tr.id}
                        onClick={() => onSelectAmontId?.(tr.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          padding: '6px 8px', borderRadius: 5, cursor: 'pointer', marginBottom: 4,
                          background: active ? '#eff6ff' : '#f9fafb',
                          border: `1px solid ${active ? '#93c5fd' : '#e5e7eb'}`,
                          transition: 'all 0.1s',
                        }}>
                        <span style={{ fontSize: 8.5, fontWeight: 700, color: '#2563eb',
                          background: '#dbeafe', padding: '1px 5px', borderRadius: 3, flexShrink: 0 }}>EF</span>
                        <span style={{ fontSize: 10, flex: 1, color: '#374151', fontWeight: active ? 600 : 400 }}>
                          {`Tronçon arrivée EF n°${i + 1}`}
                        </span>
                        {res && res.V > 0 && (
                          <span style={{ fontSize: 9, color: '#6b7280' }}>{res.V.toFixed(2)} m/s</span>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); set('tronçonsAmont', (params.tronçonsAmont ?? []).filter((_: any, j: number) => j !== i)) }}
                          style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer',
                            fontSize: 13, lineHeight: 1, padding: '0 1px', flexShrink: 0 }}>×</button>
                      </div>
                    )
                  })}
                </div>

                {(() => {
                  const p   = presAtECS
                  const err = p < 30000
                  return (
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                      borderTop: '1px solid #f3f4f6', paddingTop: 7, marginBottom: 12,
                    }}>
                      <span style={{ fontSize: 10, color: '#6b7280' }}>P. disponible au départ ECS</span>
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: err ? '#dc2626' : '#374151',
                        fontFamily: 'ui-monospace, monospace', flexShrink: 0 }}>
                        {(p / 100000).toFixed(2)} bar
                      </span>
                    </div>
                  )
                })()}
              </>
            )}

            <hr style={{ border: 'none', borderTop: '1px solid #e5e7eb', margin: '12px 0' }} />
          </>
        )}

        {/* ── Pertes linéaires ── */}
        <Block color="#3b82f6">
          <BlockTitle color="#1d4ed8">Pertes de charge linéaires</BlockTitle>
          <div className="lp-field" style={{ marginBottom: 0 }}>
            <label className="lp-label">Méthode de calcul</label>
            {isChauffage ? (
              <FormulaHint>
                <span style={{ fontFamily: 'ui-monospace, monospace', color: '#1e40af' }}>J = λ/D × ρV²/2</span>
                <br /><span style={{ color: '#94a3b8' }}>Darcy-Weisbach — λ par Colebrook-White itératif</span>
              </FormulaHint>
            ) : (
              <>
                <BtnRow
                  value={params.methodeReg}
                  onSelect={v => set('methodeReg', v)}
                  activeColor="#1d4ed8" activeBg="#dbeafe" activeBorder="#93c5fd"
                  options={[
                    { value: 'darcy-colebrook', label: 'Darcy-Weisbach' },
                    { value: 'dtu-approche',    label: 'Simplifiée DTU 60.11' },
                  ]}
                />
                {params.methodeReg === 'darcy-colebrook' && (
                  <FormulaHint>
                    <span style={{ fontFamily: 'ui-monospace, monospace', color: '#1e40af' }}>J = λ/D × ρV²/2</span>
                    <br /><span style={{ color: '#94a3b8' }}>Darcy-Weisbach — λ par Colebrook-White itératif</span>
                  </FormulaHint>
                )}
              </>
            )}
          </div>
          {!isChauffage && params.methodeReg === 'dtu-approche' && (
            <div className="lp-field" style={{ marginBottom: 0, marginTop: 8 }}>
              <label className="lp-label">Formule</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {([
                  { value: 'Pa',  coef: '5,65', units: 'J en Pa/m · V en m/s · D en m' },
                  { value: 'mCE', coef: '3,80', units: 'J en mCE/m · V en m/s · D en mm' },
                ] as { value: string; coef: string; units: string }[]).map(opt => {
                  const active = (params.dtuUnite ?? 'Pa') === opt.value
                  return (
                    <div key={opt.value}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer' }}>
                        <input type="radio" name={`dtuUnite-${isAlimECS ? 'alim-ecs' : isAlimEF ? 'alim-ef' : 'boucl'}`}
                          checked={active}
                          onChange={() => set('dtuUnite', opt.value)} />
                        <span style={{ fontSize: 11,
                          fontWeight: active ? 600 : 400,
                          color: active ? '#1e40af' : '#6b7280' }}>
                          J = {opt.coef} × V<sup>1,896</sup> / D<sup>1,276</sup>
                        </span>
                      </label>
                      {active && (
                        <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 2, paddingLeft: 22 }}>
                          {opt.units}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div style={{ fontSize: 9, color: '#cbd5e1', marginTop: 6 }}>
                Formule empirique NF DTU 60.11
              </div>
            </div>
          )}
        </Block>

        {/* ── Singulières ── */}
        <Block color="#c2562d">
          <BlockTitle color="#c2562d">Pertes de charge singulières</BlockTitle>
          <div className="lp-field" style={{ marginBottom: 0 }}>
            <label className="lp-label">Méthode de calcul</label>
            <BtnRow
              value={params.methodeSing}
              onSelect={v => set('methodeSing', v)}
              activeColor="#c2562d" activeBg="#fef0ea" activeBorder="#fbd5c5"
              options={[
                { value: 'pourcentage', label: 'Forfaitaire (%)' },
                { value: 'accessoires', label: 'Accessoires (ξ)' },
              ]}
            />
            {params.methodeSing === 'pourcentage' && (
              <FormulaHint>
                <span style={{ fontFamily: 'ui-monospace, monospace', color: '#c2562d' }}>ΔP_sing = ΔP_rég × x %</span>
                <br />Majoration forfaitaire appliquée sur les ΔP régulières
              </FormulaHint>
            )}
            {params.methodeSing === 'accessoires' && (
              <FormulaHint>
                <span style={{ fontFamily: 'ui-monospace, monospace', color: '#c2562d' }}>ΔP = Σ ξ × ρV²/2</span>
                <br />Accessoires renseignés tronçon par tronçon
              </FormulaHint>
            )}
          </div>
          {params.methodeSing === 'pourcentage' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 8, marginBottom: 0 }}>
              <span style={{ fontSize: 11, color: '#6b7280' }}>Majoration</span>
              <NumInput min={0} max={100} step={1}
                value={params.pourcentageSing ?? null}
                placeholder="20"
                allowEmpty
                style={{ width: 44 }}
                onChange={v => set('pourcentageSing', v)} />
              <span className="lp-unit">%</span>
            </div>
          )}
        </Block>

        {/* ── Équipements ── */}
        <Block color="#7c3aed">
          <label className="lp-checkbox-label" style={{ margin: 0, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!params.equipementsActifs}
              onChange={e => set('equipementsActifs', e.target.checked)} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed',
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pertes de charge des équipements
            </span>
          </label>
        </Block>

        {/* ── Coefficient de sécurité ── */}
        <div className="lp-field" style={{ marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
            <label className="lp-checkbox-label" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!params.coefPompeActif}
                onChange={e => set('coefPompeActif', e.target.checked)} />
              <span style={{ color: '#6b7280', fontSize: 11 }}>Coefficient de sécurité</span>
            </label>
            {params.coefPompeActif && (<>
              <NumInput min={0} max={50} step={1}
                style={{ width: 44 }}
                value={params.coefPompe ?? null}
                placeholder="10"
                allowEmpty
                onChange={v => set('coefPompe', v)} />
              <span className="lp-unit">%</span>
            </>)}
          </div>
          {params.coefPompeActif && (
            <div style={{ fontSize: 9.5, color: '#94a3b8', marginTop: 4, paddingLeft: 20, lineHeight: 1.5 }}>
              <span style={{ fontFamily: 'ui-monospace, monospace', color: '#6b7280' }}>
                ΔP_majoré = ΔP_total × (1 + x %)
              </span>
              <br />Marge appliquée sur le ΔP total
            </div>
          )}
        </div>

      </>
    </Section>
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
    <Section>
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

// ── Bibliothèque PDC : valeurs ξ et Kv par défaut, types personnalisés ────
function FittingLibrarySection({ pdcParams, onChange, mode = null }: { pdcParams: any; onChange: any; mode?: string | null }) {
  const fOverrides = pdcParams?.fittingOverrides  ?? {}
  const eOverrides = pdcParams?.equipmentOverrides ?? {}
  const customF    = pdcParams?.customFittings    ?? []
  const customE    = pdcParams?.customEquipments  ?? []

  const showF = pdcParams?.methodeSing === 'accessoires'
  const showE = !!pdcParams?.equipementsActifs
  if (!showF && !showE) return null

  // ── Accessoires ──────────────────────────────────────
  const setFxi = (id: string, val: number | null) => {
    const next = { ...fOverrides }
    if (val == null) delete next[id]
    else next[id] = val
    onChange({ ...pdcParams, fittingOverrides: next })
  }
  const addCustomF = () => {
    const id = `custom_f_${Date.now()}`
    onChange({ ...pdcParams, customFittings: [...customF, { id, label: '', xi: 1.0 }] })
  }
  const updateCustomF = (id: string, field: string, val: string) => {
    onChange({ ...pdcParams, customFittings: customF.map((f: any) =>
      f.id === id ? { ...f, [field]: field === 'xi' ? (parseFloat(val) || 0) : val } : f
    )})
  }
  const removeCustomF = (id: string) => {
    onChange({ ...pdcParams, customFittings: customF.filter((f: any) => f.id !== id) })
  }

  // ── Équipements ──────────────────────────────────────
  const setEkv = (id: string, val: number | null) => {
    const next = { ...eOverrides }
    if (val == null) delete next[id]
    else next[id] = val
    onChange({ ...pdcParams, equipmentOverrides: next })
  }
  const addCustomE = () => {
    const id = `custom_e_${Date.now()}`
    onChange({ ...pdcParams, customEquipments: [...customE, { id, label: '', kvDefault: null }] })
  }
  const updateCustomE = (id: string, field: string, val: string) => {
    const parsed = field === 'kvDefault' ? (val === '' ? null : parseFloat(val)) : val
    onChange({ ...pdcParams, customEquipments: customE.map((e: any) =>
      e.id === id ? { ...e, [field]: parsed } : e
    )})
  }
  const removeCustomE = (id: string) => {
    onChange({ ...pdcParams, customEquipments: customE.filter((e: any) => e.id !== id) })
  }

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5,
  }
  const subHeader = (label: string, color: string) => (
    <div style={{ fontSize: 9.5, fontWeight: 700, color, textTransform: 'uppercase' as const,
                  letterSpacing: '0.06em', marginBottom: 7, marginTop: 2 }}>{label}</div>
  )

  const title = showF && showE ? 'Accessoires & Équipements'
    : showF ? 'Accessoires'
    : 'Équipements'

  return (
    <Section title={title}>
      <>
        {showF && (
          <>
            {showE && subHeader('Accessoires', '#c2562d')}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 3 }}>
              <span style={{ width: 50, fontSize: 9, color: '#9ca3af', textAlign: 'center', fontWeight: 600 }}>ξ</span>
            </div>
            {FITTING_TYPES.map(t => {
              const ov  = fOverrides[t.id]
              const val = ov ?? t.xi
              return (
                <div key={t.id} style={row}>
                  <span style={{ flex: 1, fontSize: 10, color: '#374151', lineHeight: 1.3 }}>{t.label}</span>
                  <NumInput min={0} step={0.01} value={val ?? null} allowEmpty
                    onChange={v => setFxi(t.id, v)}
                    style={{ width: 50, fontSize: 10, padding: '2px 4px', textAlign: 'center', borderRadius: 4,
                             border: `1px solid ${ov != null ? '#fbd5c5' : '#e5e7eb'}`,
                             color: ov != null ? '#c2562d' : '#374151' }} />
                  {ov != null && (
                    <button onClick={() => setFxi(t.id, null)} title={`Rétablir (${t.xi})`}
                      style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                      ↺
                    </button>
                  )}
                </div>
              )
            })}
            {customF.map((t: any) => (
              <div key={t.id} style={{ ...row, background: '#fffaf8', border: '1px solid #fbd5c5',
                                       borderRadius: 5, padding: '4px 6px', marginBottom: 5 }}>
                <input value={t.label} placeholder="Nom…"
                  onChange={e => updateCustomF(t.id, 'label', e.target.value)}
                  style={{ flex: 1, fontSize: 10, padding: '2px 4px', border: '1px solid #e5e7eb',
                           borderRadius: 4, minWidth: 0 }} />
                <input type="number" min="0" step="0.01"
                  key={t.id + '_xi'}
                  defaultValue={t.xi}
                  onBlur={e => updateCustomF(t.id, 'xi', e.target.value)}
                  style={{ width: 50, fontSize: 10, padding: '2px 4px', textAlign: 'center',
                           borderRadius: 4, border: '1px solid #fbd5c5', color: '#c2562d' }} />
                <button onClick={() => removeCustomF(t.id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                           fontSize: 15, padding: '0 2px', lineHeight: 1 }}>×</button>
              </div>
            ))}
            <button onClick={addCustomF}
              style={{ fontSize: 10, padding: '3px 10px', border: '1px dashed #c2562d', borderRadius: 5,
                       color: '#c2562d', background: 'transparent', cursor: 'pointer', fontWeight: 600,
                       marginBottom: 4 }}>
              + Personnalisé
            </button>
          </>
        )}

        {showF && showE && <hr style={{ border: 'none', borderTop: '1px solid #f1f5f9', margin: '10px 0' }} />}

        {showE && (
          <>
            {showF && subHeader('Équipements', '#7c3aed')}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 3 }}>
              <span style={{ width: 50, fontSize: 9, color: '#9ca3af', textAlign: 'center', fontWeight: 600 }}>Kv</span>
            </div>
            {getEquipmentForMode(mode).map(t => {
              const ov  = eOverrides[t.id]
              const val = ov ?? t.kvDefault
              return (
                <div key={t.id} style={row}>
                  <span style={{ flex: 1, fontSize: 10, color: '#374151', lineHeight: 1.3 }}>{t.label}</span>
                  <NumInput min={0} step={0.1} value={val ?? null} allowEmpty
                    placeholder={t.kvDefault == null ? 'à saisir' : undefined}
                    onChange={v => setEkv(t.id, v)}
                    style={{ width: 50, fontSize: 10, padding: '2px 4px', textAlign: 'center', borderRadius: 4,
                             border: `1px solid ${ov != null ? '#ddd6fe' : '#e5e7eb'}`,
                             color: ov != null ? '#7c3aed' : '#374151' }} />
                  {ov != null && (
                    <button onClick={() => setEkv(t.id, null)} title={`Rétablir (${t.kvDefault ?? '—'})`}
                      style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                      ↺
                    </button>
                  )}
                </div>
              )
            })}
            {customE.map((t: any) => (
              <div key={t.id} style={{ ...row, background: '#faf8ff', border: '1px solid #ddd6fe',
                                       borderRadius: 5, padding: '4px 6px', marginBottom: 5 }}>
                <input value={t.label} placeholder="Nom…"
                  onChange={e => updateCustomE(t.id, 'label', e.target.value)}
                  style={{ flex: 1, fontSize: 10, padding: '2px 4px', border: '1px solid #e5e7eb',
                           borderRadius: 4, minWidth: 0 }} />
                <input type="number" min="0" step="0.1"
                  key={t.id + '_kv'}
                  defaultValue={t.kvDefault ?? ''}
                  placeholder="Kv"
                  onBlur={e => updateCustomE(t.id, 'kvDefault', e.target.value)}
                  style={{ width: 50, fontSize: 10, padding: '2px 4px', textAlign: 'center',
                           borderRadius: 4, border: '1px solid #ddd6fe', color: '#7c3aed' }} />
                <button onClick={() => removeCustomE(t.id)}
                  style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer',
                           fontSize: 15, padding: '0 2px', lineHeight: 1 }}>×</button>
              </div>
            ))}
            <button onClick={addCustomE}
              style={{ fontSize: 10, padding: '3px 10px', border: '1px dashed #7c3aed', borderRadius: 5,
                       color: '#7c3aed', background: 'transparent', cursor: 'pointer', fontWeight: 600,
                       marginBottom: 4 }}>
              + Personnalisé
            </button>
          </>
        )}
      </>
    </Section>
  )
}


interface LeftPanelProps {
  activeSection: string
  activeCalcId: CalcMode | null
  alimentationParams: any; onAlimentationParamsChange: any
  alimentationParamsEF: any; onAlimentationParamsEFChange: any
  pdcParams: any; onPdcParamsChange: any
  pdcParamsChauffage: any; onPdcParamsChauffageChange: any
  pdcParamsAlimECS: any; onPdcParamsAlimECSChange: any; totalQpAlimM3h?: number
  pdcParamsAlimEF: any; onPdcParamsAlimEFChange: any; totalQpAlimEFM3h?: number
  selectedAmontId: string | null; onSelectAmontId: any; amontTronconResults: any
  pressionSourceAlimECSStatic?: number | null
  levels: any[]; lineYs: number[]; onLevelsChange: any; onLineYsChange: any
  editLinesEnabled: boolean; onEditLinesChange: any
  materials: any[]; onMaterialsChange: any
  materialsEF: any[]; onMaterialsEFChange: any
  insulations: any[]; onInsulationsChange: any
  columns: any[]; columnXs: number[]
  onColumnsChange: any; onColumnXsChange: any; onRemoveColumn: any; onAddColumn: any
  onAddGap: any; onMoveGaine: any
  chaufferie: any; onChaufferieChange: any; onAddChaufferie: any
  editChaufferie: boolean; onEditChaufferieChange: any; placingChaufferie: boolean
  locauxEF: any[]; onAddLocalEF: any; placingLocalEF: boolean
  editLocauxEF: boolean; onEditLocauxEFChange: any
  locauxECS: any[]; onAddLocalECS: any; placingLocalECS: boolean
  editLocauxECS: boolean; onEditLocauxECSChange: any
  locauxChauffage: any[]; onAddLocalChauffage: any; placingLocalChauffage: boolean
  editLocauxChauffage: boolean; onEditLocauxChauffageChange: any
  chauffageParams?: any; onChauffageParamsChange?: any
  pdcParamsEauGlacee?: any; onPdcParamsEauGlaceeChange?: any
  materialsEauGlacee?: any[]; onMaterialsEauGlaceeChange?: any
  segments: any[]; points: any[]; networkFlows: any
  flowDirections?: any; roleMap?: any
  hasConnectedProductions?: boolean
  drawMode: string; editParam: any; onEditParamChange: any
  onSelectIds: any; onConnHighlight: any
  groupesEditMode: boolean; onGroupesEditModeChange: any
  showGroupeNames: boolean; onShowGroupeNamesChange: any
  onAddGroupe: any; onRemoveGroupe: any
  selectedIds: string[]; onUpdateSegment: any
}

export default function LeftPanel({
  activeSection,
  activeCalcId,
  alimentationParams, onAlimentationParamsChange,
  alimentationParamsEF, onAlimentationParamsEFChange,
  pdcParams, onPdcParamsChange,
  pdcParamsChauffage, onPdcParamsChauffageChange,
  pdcParamsAlimECS, onPdcParamsAlimECSChange, totalQpAlimM3h = 0,
  pdcParamsAlimEF, onPdcParamsAlimEFChange, totalQpAlimEFM3h = 0,
  selectedAmontId, onSelectAmontId, amontTronconResults, pressionSourceAlimECSStatic = null,
  levels, lineYs, onLevelsChange, onLineYsChange,
  editLinesEnabled, onEditLinesChange,
  materials, onMaterialsChange,
  materialsEF, onMaterialsEFChange,
  insulations, onInsulationsChange,
  columns, columnXs, onColumnsChange, onColumnXsChange, onRemoveColumn, onAddColumn, onAddGap, onMoveGaine,
  chaufferie, onChaufferieChange, onAddChaufferie, editChaufferie, onEditChaufferieChange, placingChaufferie,
  locauxEF, onAddLocalEF, placingLocalEF, editLocauxEF, onEditLocauxEFChange,
  locauxECS, onAddLocalECS, placingLocalECS, editLocauxECS, onEditLocauxECSChange,
  locauxChauffage, onAddLocalChauffage, placingLocalChauffage, editLocauxChauffage, onEditLocauxChauffageChange,
  chauffageParams, onChauffageParamsChange,
  pdcParamsEauGlacee, onPdcParamsEauGlaceeChange,
  materialsEauGlacee, onMaterialsEauGlaceeChange,
  segments, points, networkFlows,
  flowDirections, roleMap,
  hasConnectedProductions = false,
  drawMode, editParam, onEditParamChange,
  onSelectIds, onConnHighlight,
  groupesEditMode, onGroupesEditModeChange, showGroupeNames, onShowGroupeNamesChange,
  onAddGroupe, onRemoveGroupe,
  selectedIds, onUpdateSegment,
}: LeftPanelProps) {
  const { isBouclage, isAlimECS, isAlimEF, isChauffage, isEauGlacee } = getModeFlags(activeCalcId)

  if (drawMode === 'editParams') {
    return (
      <div className="left-panel">
        <div className="lp-panel-title">Attribution des paramètres</div>
        <div className="lp-section">
          <div className="lp-section-body">
            <EditParamsPanel
              segments={segments} points={points}
              materials={isAlimEF ? materialsEF : materials} insulations={insulations}
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
        flowDirections={flowDirections}
        roleMap={roleMap}
        hasConnectedProductions={hasConnectedProductions}
      />
    )
  }

  const levelsCol = (
    <>
      <LevelsSection
        levels={levels} lineYs={lineYs}
        onLevelsChange={onLevelsChange} onLineYsChange={onLineYsChange}
        chaufferie={chaufferie}
        onAddChaufferie={onAddChaufferie}
        editChaufferie={editChaufferie}
        onEditChaufferieChange={onEditChaufferieChange}
        placingChaufferie={placingChaufferie}
        activeCalcId={activeCalcId}
        onAddLocalEF={onAddLocalEF}
        placingLocalEF={placingLocalEF}
        locauxEF={locauxEF}
        editLocauxEF={editLocauxEF}
        onEditLocauxEFChange={onEditLocauxEFChange}
        locauxECS={locauxECS}
        onAddLocalECS={onAddLocalECS}
        placingLocalECS={placingLocalECS}
        editLocauxECS={editLocauxECS}
        onEditLocauxECSChange={onEditLocauxECSChange}
        locauxChauffage={locauxChauffage}
        onAddLocalChauffage={onAddLocalChauffage}
        placingLocalChauffage={placingLocalChauffage}
        editLocauxChauffage={editLocauxChauffage}
        onEditLocauxChauffageChange={onEditLocauxChauffageChange}
      />
      <ColumnsSection
        columns={columns} columnXs={columnXs}
        onColumnsChange={onColumnsChange} onColumnXsChange={onColumnXsChange}
        onRemoveColumn={onRemoveColumn} onAddColumn={onAddColumn} onAddGap={onAddGap} onMoveGaine={onMoveGaine}
        levels={levels}
      />
      <div className="lp-section">
        <div className="lp-section-body">
          <label className="lp-checkbox-label">
            <input type="checkbox" checked={editLinesEnabled}
              onChange={e => onEditLinesChange(e.target.checked)} />
            <span>Modifier les lignes de niveaux / colonnes</span>
          </label>
          {editLinesEnabled && (
            <p className="lp-hint">Glissez les lignes sur le plan pour ajuster les hauteurs et largeurs.</p>
          )}
        </div>
      </div>
    </>
  )

  const activePdcP = isAlimECS ? pdcParamsAlimECS
    : isAlimEF ? pdcParamsAlimEF
    : pdcParams
  const activePdcOnChange = isAlimECS ? onPdcParamsAlimECSChange
    : isAlimEF ? onPdcParamsAlimEFChange
    : onPdcParamsChange

  const activeMaterials = isAlimEF ? materialsEF : isEauGlacee ? (materialsEauGlacee ?? materials) : materials
  const activeMaterialsChange = isAlimEF ? onMaterialsEFChange : isEauGlacee ? (onMaterialsEauGlaceeChange ?? onMaterialsChange) : onMaterialsChange

  let content: React.ReactNode = null
  switch (activeSection) {
    case 'niveaux':
      content = levelsCol
      break
    case 'groupes':
      content = <GroupesSection
        groupesEditMode={groupesEditMode} onGroupesEditModeChange={onGroupesEditModeChange}
        showGroupeNames={showGroupeNames} onShowGroupeNamesChange={onShowGroupeNamesChange}
        onAddGroupe={onAddGroupe} onRemoveGroupe={onRemoveGroupe}
        columns={columns} levels={levels} points={points}
      />
      break
    case 'materiaux':
      content = <MaterialsSection materials={activeMaterials} onChange={activeMaterialsChange} showEpsilon={true} isChauffage={isChauffage || isEauGlacee} />
      break
    case 'isolation':
      if (isAlimEF) {
        content = null
      } else {
        content = <InsulationsSection insulations={insulations} onChange={onInsulationsChange} />
      }
      break
    case 'equipements':
      content = <>
        {(isChauffage || isEauGlacee) ? null : isAlimEF ? (
          alimentationParamsEF != null && (
            <AlimentationParamsSection params={alimentationParamsEF} onChange={onAlimentationParamsEFChange} />
          )
        ) : (isBouclage || isAlimECS) ? (
          <AlimentationParamsSection params={alimentationParams} onChange={onAlimentationParamsChange} />
        ) : null}
      </>
      break
    case 'pdc':
      if (isChauffage) {
        content = <>
          <PdcParamsSection params={pdcParamsChauffage} onChange={onPdcParamsChauffageChange} isChauffage />
          <FittingLibrarySection pdcParams={pdcParamsChauffage} onChange={onPdcParamsChauffageChange} mode={activeCalcId} />
        </>
      } else if (isEauGlacee) {
        content = <>
          <PdcParamsSection params={pdcParamsEauGlacee} onChange={onPdcParamsEauGlaceeChange} isChauffage />
          <FittingLibrarySection pdcParams={pdcParamsEauGlacee} onChange={onPdcParamsEauGlaceeChange} mode={activeCalcId} />
        </>
      } else if (isBouclage) {
        content = <>
          <PdcParamsSection params={pdcParams} onChange={onPdcParamsChange} />
          <FittingLibrarySection pdcParams={pdcParams} onChange={onPdcParamsChange} mode={activeCalcId} />
        </>
      } else if (isAlimECS) {
        content = <>
          <PdcParamsSection
            params={pdcParamsAlimECS} onChange={onPdcParamsAlimECSChange}
            isAlimECS
            totalQpAlimM3h={totalQpAlimM3h}
            selectedAmontId={selectedAmontId} onSelectAmontId={onSelectAmontId}
            amontTronconResults={amontTronconResults}
            pressionSourceAlimECSStatic={pressionSourceAlimECSStatic}
          />
          <FittingLibrarySection pdcParams={pdcParamsAlimECS} onChange={onPdcParamsAlimECSChange} mode={activeCalcId} />
        </>
      } else if (isAlimEF && pdcParamsAlimEF != null) {
        content = <>
          <PdcParamsSection
            params={pdcParamsAlimEF} onChange={onPdcParamsAlimEFChange}
            isAlimEF
            totalQpAlimM3h={totalQpAlimEFM3h}
          />
          <FittingLibrarySection pdcParams={pdcParamsAlimEF} onChange={onPdcParamsAlimEFChange} mode={activeCalcId} />
        </>
      } else {
        content = <div className="lp-section"><p className="lp-hint" style={{ padding: '12px 14px' }}>Les pertes de charge sont configurables en mode Bouclage ECS ou Alimentation ECS.</p></div>
      }
      break
    default:
      content = null
  }

  const panelTitles: Record<string, string> = {
    niveaux:     'Niveaux & Colonnes',
    groupes:     'Groupes de points de puisage',
    materiaux:   'Matériaux des canalisations',
    isolation:   'Isolants (calorifugeage)',
    equipements: 'Équipements',
    pdc:         'Pertes de charge',
  }

  return (
    <div className="left-panel">
      {activeSection && panelTitles[activeSection] && (
        <div className="lp-panel-title">
          <span>{panelTitles[activeSection]}</span>
        </div>
      )}
      {content}
    </div>
  )
}
