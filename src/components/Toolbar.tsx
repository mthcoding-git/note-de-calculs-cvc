import React, { useState, useRef, useEffect } from 'react'
import { ACCESSORY_TYPES } from '../data/accessories'
import { AccessorySymbol } from './AccessorySymbol'
import type { CalcMode } from '../types'
import { getModeFlags } from '../utils/calcModeFlags'
import { EMETTEUR_TYPES } from '../data/emetteurs'

const ACC_IDS_BY_CALCID: Partial<Record<CalcMode, string[]>> = {
  'alimentation-ecs': ['vanne_arret', 'clapet_anti_retour', 'filtre_y', 'manometre', 'thermometre', 'vase_expansion', 'purgeur_air', 'robinet_vidange'],
  'bouclage-ecs':     ['vanne_arret', 'clapet_anti_retour', 'filtre_y', 'manometre', 'thermometre', 'vase_expansion', 'purgeur_air', 'robinet_vidange'],
  'alimentation-ef':  ['vanne_arret', 'clapet_anti_retour', 'filtre_y', 'manometre', 'disconnecteur', 'reducteur_pression', 'compteur_eau', 'ballon_anti_belier', 'robinet_vidange'],
}

// Cursor SVG icon for "select" mode
function CursorIcon() {
  return (
    <svg width={12} height={14} viewBox="0 0 10 13" style={{ display: 'block', flexShrink: 0 }}>
      <polygon points="1,1 1,10 3.2,7.8 5,12 6.5,11.4 4.7,7.2 8.5,7.2"
        fill="currentColor" />
    </svg>
  )
}

// Properties icon for "Attribuer" mode
function PropsIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 13 13" style={{ display: 'block', flexShrink: 0 }}>
      <rect x={1} y={1} width={11} height={11} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.2} />
      <line x1={3.5} y1={4}   x2={9.5} y2={4}   stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
      <line x1={3.5} y1={6.5} x2={9.5} y2={6.5} stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
      <line x1={3.5} y1={9}   x2={7}   y2={9}   stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
    </svg>
  )
}

// Square node icon — matches the node symbol drawn on canvas
function NodeSquareIcon() {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" style={{ display: 'block', flexShrink: 0 }}>
      <rect x={1} y={1} width={8} height={8} fill="currentColor" />
    </svg>
  )
}

// Balancing valve symbol: two triangles tip-to-tip (bowtie) + T mark perpendicular
function VanneIcon({ active = false }) {
  const col = active ? '#1d4ed8' : '#000'
  return (
    <svg width={14} height={18} viewBox="-7 -12 14 18" style={{ display: 'block', flexShrink: 0 }}>
      <polygon points="-6,-5 -6,5 0,0" fill={col} />
      <polygon points="6,-5 6,5 0,0" fill={col} />
      <line x1="0" y1="0" x2="0" y2="-9" stroke={col} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="-3.6" y1="-9" x2="3.6" y2="-9" stroke={col} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// Pump symbol: circle + directional triangle, same geometry as on canvas
function PumpSymbol({ rotation = 0, size = 14, color = '#000', bg = '#fff' }) {
  const r  = size / 2
  const ts = r / 11
  const cx = r + 1, cy = r + 1
  return (
    <svg width={size + 2} height={size + 2} style={{ display: 'block', flexShrink: 0 }}>
      <g transform={`translate(${cx},${cy}) rotate(${rotation})`}>
        <circle r={r} fill={bg} stroke={color} strokeWidth={1.5} />
        <polygon
          points={`${-5*ts},${-6*ts} ${-5*ts},${6*ts} ${7*ts},0`}
          fill={color} />
      </g>
    </svg>
  )
}

const DISPLAY_OPTIONS = [
  { key: 'nomTroncon',       label: 'Nom du tronçon',          calcIds: null },
  { key: 'material',         label: 'Matériau',                calcIds: null },
  { key: 'dn',               label: 'DN',                      calcIds: null },
  { key: 'length',           label: 'Longueur',                calcIds: ['bouclage-ecs', 'alimentation-ecs', 'alimentation-ef'] },
  { key: 'insulation',       label: 'Isolant & épaisseur',     calcIds: ['bouclage-ecs'] },
  { key: 'debit',            label: 'Débit',                   calcIds: ['bouclage-ecs', 'alimentation-ecs', 'alimentation-ef'] },
  { key: 'vitesse',          label: 'Vitesse',                 calcIds: ['bouclage-ecs', 'alimentation-ecs', 'alimentation-ef'] },
  { key: 'temperatureNoeud', label: 'T° nœuds',               calcIds: ['bouclage-ecs'] },
  { key: 'deltaT',           label: 'ΔT tronçon',             calcIds: ['bouclage-ecs'] },
  { key: 'dpNoeud',          label: 'ΔP depuis prod. ECS',    calcIds: ['bouclage-ecs'] },
  { key: 'dpTroncon',        label: 'ΔP tronçon',             calcIds: ['bouclage-ecs'] },
  { key: 'pressionDispo',    label: 'Pression disponible',    calcIds: ['alimentation-ecs', 'alimentation-ef'] },
  { key: 'pressionStat',     label: 'Pression statique',      calcIds: ['alimentation-ecs', 'alimentation-ef'] },
  { key: 'equipment',        label: 'Équipements (groupes PP)', calcIds: ['alimentation-ecs', 'alimentation-ef', 'bouclage-ecs'] },
]

export default function Toolbar({
  drawMode, setDrawMode,
  pipeType, setPipeType,
  panelOpen, onTogglePanel,
  errorCount, onShowErrors,
  placingEquipment, onCancelPlacingEquipment,
  onAddProductionECS, onAddPump, hasProductionECS,
  onAddArriveeEF,
  onAddProductionChauffage, hasProductionChauffage,
  onAddEmetteur,
  canvasDisplay, onCanvasDisplayToggle,
  activeFluidId, activeCalcId,
  pdcParams,
  placingAccessoryType, onPlacingAccessoryTypeChange,
}) {
  const [displayOpen, setDisplayOpen] = useState(false)
  const displayRef = useRef(null)
  const [accOpen, setAccOpen] = useState(false)
  const [emetteurOpen, setEmetteurOpen] = useState(false)
  const emetteurRef = useRef(null)
  const [emetteurParams, setEmetteurParams] = useState<Record<string, { deltaT: number; puissance: number | null }>>(() =>
    Object.fromEntries(EMETTEUR_TYPES.map(em => [em.id, { deltaT: em.deltaTDefault, puissance: null }]))
  )
  const { isAlimEF, isChauffage } = getModeFlags(activeCalcId)
  const [accPos, setAccPos] = useState({ top: 0, left: 0 })
  const accRef = useRef(null)

  useEffect(() => {
    if (!displayOpen) return
    const handle = (e) => { if (!displayRef.current?.contains(e.target)) setDisplayOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [displayOpen])

  useEffect(() => {
    if (!emetteurOpen) return
    const handle = (e) => { if (!emetteurRef.current?.contains(e.target)) setEmetteurOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [emetteurOpen])

  const cancelVanne = () => {
    if (drawMode === 'draw' && pipeType === 'vanne') setDrawMode('select')
  }

  const cancelEquipment = () => {
    if (placingEquipment) onCancelPlacingEquipment?.()
  }

  const openAcc = () => {
    cancelVanne()
    cancelEquipment()
    if (accOpen) { setAccOpen(false); return }
    if (accRef.current) {
      const rect   = accRef.current.getBoundingClientRect()
      const ids    = ACC_IDS_BY_CALCID[activeCalcId] ?? []
      const popW   = Math.min(ids.length * 36 - 2 + 16, window.innerWidth - 24)
      const left   = Math.max(12, Math.min(rect.left, window.innerWidth - popW - 12))
      setAccPos({ top: rect.bottom + 6, left })
    }
    setAccOpen(true)
  }

  const closeAcc = () => {
    setAccOpen(false)
    onPlacingAccessoryTypeChange?.(null)
  }

  const activateDraw = (type) => {
    closeAcc()
    cancelEquipment()
    if (drawMode === 'draw' && pipeType === type) {
      setDrawMode('select')
    } else {
      setDrawMode('draw')
      setPipeType(type)
    }
  }

  const isSelect = drawMode === 'select'

  const isEditParams = drawMode === 'editParams'

  // ── État 1 : aucun fluide sélectionné ───────────────
  if (!activeFluidId) {
    return <div className="toolbar" />
  }

  // ── État 2 : fluide choisi, sous-mode non encore sélectionné ─
  if (!activeCalcId) {
    return <div className="toolbar" />
  }

  // ── État 3 : sous-mode sélectionné — toolbar complète ────────
  return (
    <div className="toolbar">

      <div className="toolbar-sep" />

      {/* Select mode */}
      <button
        className={`tb-btn ${isSelect ? 'active' : ''}`}
        onClick={() => { closeAcc(); cancelEquipment(); setDrawMode('select') }}
>
        <CursorIcon /> Sélectionner
      </button>

      {/* Attribuer params — right after Sélectionner */}
      <button
        className={`tb-btn ${isEditParams ? 'active' : ''}`}
        onClick={() => { closeAcc(); cancelEquipment(); setDrawMode(isEditParams ? 'select' : 'editParams') }}
        >
        <PropsIcon /> Attribuer
      </button>

      {/* Afficher — options d'étiquettes sur le schéma */}
      <div ref={displayRef} style={{ position: 'relative' }}>
        <button
          className={`tb-btn ${displayOpen ? 'active' : ''}`}
          onClick={() => { closeAcc(); cancelVanne(); cancelEquipment(); setDisplayOpen(o => !o) }}
          >
          Afficher ▾
        </button>
        {displayOpen && (
          <div className="tb-display-popover">
            {DISPLAY_OPTIONS
              .filter(o => !o.calcIds || o.calcIds.includes(activeCalcId))
              .map(({ key, label }) => {
                const active = !!canvasDisplay?.[key]
                return (
                  <label key={key} className="tb-display-item">
                    <input type="checkbox" checked={active}
                      onChange={() => onCanvasDisplayToggle?.(key)} />
                    <span>{label}</span>
                  </label>
                )
              })}
          </div>
        )}
      </div>

      <div className="toolbar-sep" />

      {/* Draw tools */}
      <div className="toolbar-group">
        <span className="toolbar-label">Tracé :</span>
        {isAlimEF ? (
          <button
            className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'aller' ? 'active-aller-ef' : ''}`}
            onClick={() => activateDraw('aller')}
            >
            <span className="pipe-prev-aller-ef" /> Aller EF
          </button>
        ) : isChauffage ? (
          <>
            <button
              className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'aller' ? 'active-aller' : ''}`}
              onClick={() => activateDraw('aller')}
              >
              <span className="pipe-prev-aller" /> Aller CH
            </button>
            <button
              className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'retour' ? 'active-retour' : ''}`}
              onClick={() => activateDraw('retour')}
              >
              <span className="pipe-prev-retour" /> Retour CH
            </button>
          </>
        ) : (
          <>
            <button
              className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'aller' ? 'active-aller' : ''}`}
              onClick={() => activateDraw('aller')}
              >
              <span className="pipe-prev-aller" /> Aller ECS
            </button>
            <button
              className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'retour' ? 'active-retour' : ''}`}
              onClick={() => activateDraw('retour')}
              >
              <span className="pipe-prev-retour" /> Retour ECS
            </button>
          </>
        )}
        <button
          className={`tb-btn ${drawMode === 'draw' && pipeType === 'point' ? 'active' : ''}`}
          onClick={() => activateDraw('point')}
          >
          <NodeSquareIcon /> Nœud
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* Equipment */}
      <div className="toolbar-group">
        <span className="toolbar-label">Équipements :</span>

        {/* Arrivée EF — alimentation-ef uniquement */}
        {isAlimEF && (
          <button
            className={`tb-btn ${placingEquipment?.type === 'arriveeEF' ? 'active' : ''}`}
            onClick={() => { closeAcc(); onAddArriveeEF?.() }}
          >
            Arrivée EF
          </button>
        )}

        {/* Équipements Chauffage */}
        {isChauffage && (
          <>
            <button
              className={`tb-btn ${placingEquipment?.type === 'productionChauffage' ? 'active' : ''}`}
              onClick={() => { closeAcc(); cancelVanne(); onAddProductionChauffage?.() }}
              disabled={hasProductionChauffage}
            >
              Prod. Chauffage
            </button>
            {/* Émetteurs dropdown */}
            <div ref={emetteurRef} style={{ position: 'relative' }}>
              <button
                className={`tb-btn ${emetteurOpen || placingEquipment?.type === 'emetteur' ? 'active' : ''}`}
                onClick={() => { closeAcc(); cancelVanne(); setEmetteurOpen(o => !o) }}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <svg width={18} height={12} viewBox="0 0 18 12" style={{ display: 'block', flexShrink: 0 }}>
                  <rect x={0.6} y={0.6} width={16.8} height={10.8} fill="none" stroke="currentColor" strokeWidth={1.2} rx={1} />
                  {[5.5, 9, 12.5].map((x, i) => (
                    <line key={i} x1={x} y1={2} x2={x} y2={10} stroke="currentColor" strokeWidth={0.9} />
                  ))}
                </svg>
                Émetteur {emetteurOpen ? '▲' : '▾'}
              </button>
              {emetteurOpen && (
                <div className="tb-display-popover" style={{ padding: '6px 8px 8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'max-content 44px 50px', columnGap: 6, rowGap: 1, alignItems: 'center' }}>
                    {/* En-tête */}
                    <span />
                    <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 2 }}>ΔT K</span>
                    <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 2 }}>P W</span>
                    {/* Séparateur */}
                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', margin: '2px 0 3px' }} />
                    {/* Lignes */}
                    {EMETTEUR_TYPES.map(em => {
                      const p = emetteurParams[em.id]
                      const setP = (patch: Partial<typeof p>) =>
                        setEmetteurParams(prev => ({ ...prev, [em.id]: { ...prev[em.id], ...patch } }))
                      const doPlace = () => { setEmetteurOpen(false); onAddEmetteur?.(em.id, p.deltaT, p.puissance) }
                      const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') doPlace() }
                      return (
                        <React.Fragment key={em.id}>
                          <button onClick={doPlace} className="tb-display-item"
                            style={{ padding: '4px 8px 4px 4px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 11, color: '#1e293b', borderRadius: 4, whiteSpace: 'nowrap' }}>
                            {em.label}
                          </button>
                          <input type="number" min={1} max={60} step={1}
                            value={p.deltaT}
                            onChange={e => setP({ deltaT: Math.max(1, Number(e.target.value)) })}
                            onKeyDown={onKey} onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textAlign: 'right', fontWeight: 600, color: '#1e293b', background: '#f8fafc' }} />
                          <input type="number" min={1} step={100}
                            value={p.puissance ?? ''}
                            placeholder="—"
                            onChange={e => setP({ puissance: e.target.value === '' ? null : Math.max(1, Number(e.target.value)) })}
                            onKeyDown={onKey} onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textAlign: 'right', background: '#f8fafc', color: p.puissance != null ? '#1e293b' : '#9ca3af' }} />
                        </React.Fragment>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {/* Équipements ECS — hors alimentation-ef et hors chauffage */}
        {!isAlimEF && !isChauffage && (
          <>
            <button
              className={`tb-btn ${placingEquipment?.type === 'productionECS' ? 'active' : ''}`}
              onClick={() => { closeAcc(); cancelVanne(); onAddProductionECS?.() }}
              disabled={hasProductionECS}
            >
              Prod. ECS
            </button>
            <button
              className={`tb-btn ${placingEquipment?.type === 'pump' ? 'active' : ''}`}
              onClick={() => { closeAcc(); cancelVanne(); onAddPump?.() }}
            >
              <PumpSymbol
                rotation={180}
                color={placingEquipment?.type === 'pump' ? '#1d4ed8' : '#000'}
                bg={placingEquipment?.type === 'pump' ? '#dbeafe' : '#fff'}
              />
              Pompe
            </button>
            <button
              className={`tb-btn ${drawMode === 'draw' && pipeType === 'vanne' ? 'active' : ''}`}
              onClick={() => activateDraw('vanne')}
            >
              <VanneIcon active={drawMode === 'draw' && pipeType === 'vanne'} />
              Vanne équilib.
            </button>
          </>
        )}

        {/* Popover accessoires — toujours visible */}
        <div ref={accRef}>
          <button
            className={`tb-btn ${accOpen || placingAccessoryType ? 'active' : ''}`}
            onClick={openAcc}
          >
            Accessoires {accOpen ? '▲' : '▾'}
          </button>
          {accOpen && (
            <div className="tb-acc-popover" style={{ top: accPos.top, left: accPos.left }}>
              <div className="tb-acc-grid">
                {(ACC_IDS_BY_CALCID[activeCalcId] ?? []).map(accId => {
                  const acc = ACCESSORY_TYPES.find(a => a.id === accId)
                  if (!acc) return null
                  const isActive = placingAccessoryType === accId
                  return (
                    <button
                      key={accId}
                      className={`tb-acc-item${isActive ? ' tb-acc-item-active' : ''}`}
                      data-tooltip={acc.label}
                      onClick={() => onPlacingAccessoryTypeChange?.(isActive ? null : accId)}
                    >
                      <svg width={18} height={18} viewBox="-11 -11 22 22">
                        <AccessorySymbol type={accId} />
                      </svg>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Errors */}
      {(errorCount > 0 || drawMode === 'errors') && (
        <>
          <div className="toolbar-sep" />
          <button
            className={`tb-btn${drawMode === 'errors' ? ' active' : ''}`}
            onClick={() => drawMode === 'errors' ? setDrawMode('select') : onShowErrors()}
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 700 }}>
            ⚠ {errorCount} erreur{errorCount > 1 ? 's' : ''}
          </button>
        </>
      )}

      {/* Contextual hints */}

    </div>
  )
}
