import { useState, useRef, useEffect } from 'react'

function getDisplay(v, variantN) {
  const prefix = v.isBase ? 'État de référence' : `Variante ${variantN}`
  return v.name ? `${prefix} — ${v.name}` : prefix
}

function buildItems(variants) {
  let n = 0
  return variants.map(v => {
    if (!v.isBase) n++
    return { ...v, variantN: n, display: getDisplay(v, n) }
  })
}

function NewVariantPopup({ items, onConfirm, onCancel }) {
  const [sourceId, setSourceId] = useState(items[0]?.id ?? '')

  return (
    <div className="nvp-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onCancel() }}>
      <div className="nvp-box">
        <div className="nvp-title">Nouvelle variante</div>
        <div className="nvp-subtitle">Créer à partir de :</div>
        <div className="nvp-list">
          {items.map(item => (
            <label
              key={item.id}
              className={`nvp-option${sourceId === item.id ? ' nvp-option-sel' : ''}`}>
              <input
                type="radio"
                name="nvp-source"
                value={item.id}
                checked={sourceId === item.id}
                onChange={() => setSourceId(item.id)}
              />
              {item.isBase && <span className="nvp-star">★</span>}
              <span>{item.display}</span>
            </label>
          ))}
        </div>
        <div className="nvp-actions">
          <button className="nvp-btn-cancel" onClick={onCancel}>Annuler</button>
          <button className="nvp-btn-create" onClick={() => onConfirm(sourceId)}>Créer</button>
        </div>
      </div>
    </div>
  )
}

export default function VariantBar({
  variants, activeVariantId, calcLabel,
  onActivate, onDuplicate, onDelete, onDeleteBase, onRename, onSetBase, onReorder,
}) {
  const [open,         setOpen]         = useState(false)
  const [showNewPopup, setShowNewPopup] = useState(false)
  const [editingId,    setEditingId]    = useState(null)
  const dropRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const h = e => { if (!dropRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])

  const items      = buildItems(variants)
  const activeItem = items.find(v => v.id === activeVariantId)

  return (
    <>
      <div className="vbar-group">
        <div ref={dropRef} className="vbar-drop-wrap">
          <button
            className={`vbar-selector${open ? ' vbar-selector-open' : ''}`}
            onClick={() => setOpen(o => !o)}>
            {activeItem?.isBase && <span className="vbar-sel-star">★</span>}
            {calcLabel && <span className="vbar-calc-tag">{calcLabel}</span>}
            <span className="vbar-sel-text">{activeItem?.display ?? '—'}</span>
            <span className="vbar-sel-chev">{open ? '▴' : '▾'}</span>
          </button>

          {open && (
            <div className="vbar-dropdown">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className={`vbar-opt${item.id === activeVariantId ? ' vbar-opt-active' : ''}`}>
                  <div className="vbar-opt-top" onClick={() => { onActivate(item.id); setOpen(false) }}>
                    {item.isBase
                      ? <span className="vbar-opt-star" title="État de référence">★</span>
                      : <button
                          className="vbar-star-btn"
                          title="Définir comme état de référence"
                          onClick={e => { e.stopPropagation(); onSetBase(item.id) }}>☆</button>
                    }
                    {calcLabel && <span className="vbar-calc-tag">{calcLabel}</span>}
                    <span className="vbar-opt-label">{item.display}</span>
                    <button
                      className={`vbar-pencil-btn${editingId === item.id ? ' active' : ''}`}
                      title="Renommer"
                      onClick={e => { e.stopPropagation(); setEditingId(id => id === item.id ? null : item.id) }}>✎</button>
                    <span className="vbar-opt-btns" onClick={e => e.stopPropagation()}>
                      {!item.isBase && (<>
                        <button
                          className="vbar-ord-btn"
                          disabled={i <= 1}
                          title="Monter"
                          onClick={() => onReorder(i, i - 1)}>▲</button>
                        <button
                          className="vbar-ord-btn"
                          disabled={i === items.length - 1}
                          title="Descendre"
                          onClick={() => onReorder(i, i + 1)}>▼</button>
                      </>)}
                      <button
                        className="vbar-ord-btn vbar-del-btn"
                        title={item.isBase ? "Supprimer l'état de référence" : "Supprimer cette variante"}
                        onClick={() => {
                          if (item.isBase) { onDeleteBase?.(); } else { onDelete(item.id) }
                          setOpen(false)
                        }}>✕</button>
                    </span>
                  </div>
                  {editingId === item.id && (
                    <input
                      className="vbar-inline-name"
                      placeholder="Nom optionnel…"
                      value={item.name ?? ''}
                      autoFocus
                      onClick={e => e.stopPropagation()}
                      onChange={e => onRename(item.id, e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' || e.key === 'Escape') {
                          e.preventDefault(); e.stopPropagation(); setEditingId(null)
                        }
                      }}
                      onBlur={() => setEditingId(null)}
                    />
                  )}
                </div>
              ))}
              <div
                className="vbar-opt vbar-opt-add"
                onClick={e => { e.stopPropagation(); setOpen(false); setShowNewPopup(true) }}>
                <div className="vbar-opt-top">
                  <span className="vbar-opt-star" />
                  <span>+ Nouvelle variante</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {showNewPopup && (
        <NewVariantPopup
          items={items}
          onConfirm={sourceId => { onDuplicate(sourceId); setShowNewPopup(false) }}
          onCancel={() => setShowNewPopup(false)}
        />
      )}
    </>
  )
}
