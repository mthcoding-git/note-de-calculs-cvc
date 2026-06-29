import { useState, useRef, useEffect } from 'react'

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
  const col = active ? '#1d4ed8' : '#4f46e5'
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
function PumpSymbol({ rotation = 0, size = 14, color = '#4f46e5', bg = 'rgba(238,242,255,0.97)' }) {
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
  chaufferie, editChaufferie, onEditChaufferieChange, onAddChaufferie,
  placingChaufferie, placingEquipment,
  onAddProductionECS, onAddPump, hasProductionECS,
  onAddArriveeEF,
  canvasDisplay, onCanvasDisplayToggle,
  activeFluidId, activeCalcId,
  pdcParams,
}) {
  const [displayOpen, setDisplayOpen] = useState(false)
  const displayRef = useRef(null)

  useEffect(() => {
    if (!displayOpen) return
    const handle = (e) => { if (!displayRef.current?.contains(e.target)) setDisplayOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [displayOpen])

  const activateDraw = (type) => {
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
        onClick={() => setDrawMode('select')}
>
        <CursorIcon /> Sélectionner
      </button>

      {/* Attribuer params — right after Sélectionner */}
      <button
        className={`tb-btn ${isEditParams ? 'active' : ''}`}
        onClick={() => setDrawMode(isEditParams ? 'select' : 'editParams')}
        >
        <PropsIcon /> Attribuer
      </button>

      {/* Afficher — options d'étiquettes sur le schéma */}
      <div ref={displayRef} style={{ position: 'relative' }}>
        <button
          className={`tb-btn ${displayOpen ? 'active' : ''}`}
          onClick={() => setDisplayOpen(o => !o)}
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
        {activeCalcId === 'alimentation-ef' ? (
          <button
            className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'aller' ? 'active-aller-ef' : ''}`}
            onClick={() => activateDraw('aller')}
            >
            <span className="pipe-prev-aller-ef" /> Aller EF
          </button>
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
        {activeCalcId !== 'alimentation-ef' && <span className="toolbar-label">Équipements :</span>}

        {/* Local ECS — masqué en mode EF */}
        {activeCalcId !== 'alimentation-ef' && (!chaufferie?.placed ? (
          <button
            className={`tb-btn ${placingChaufferie ? 'active' : ''}`}
            onClick={onAddChaufferie}
            >
            Local ECS
          </button>
        ) : (
          <button
            className={`tb-btn ${editChaufferie ? 'active' : ''}`}
            onClick={() => onEditChaufferieChange(!editChaufferie)}
            >
            ✎ Modifier local ECS
          </button>
        ))}

        {activeCalcId === 'alimentation-ef' ? (
          /* Arrivée EF — plusieurs autorisées en alimentation-ef */
          <button
            className={`tb-btn ${placingEquipment?.type === 'arriveeEF' ? 'active' : ''}`}
            onClick={onAddArriveeEF}
            >
            Arrivée EF
          </button>
        ) : (
          <>
            {/* Prod. ECS */}
            <button
              className={`tb-btn ${placingEquipment?.type === 'productionECS' ? 'active' : ''}`}
              onClick={onAddProductionECS}
              disabled={hasProductionECS}
              >
              Prod. ECS
            </button>

            {/* Pompe */}
            <button
              className={`tb-btn ${placingEquipment?.type === 'pump' ? 'active' : ''}`}
              onClick={onAddPump}
              >
              <PumpSymbol
                rotation={180}
                color={placingEquipment?.type === 'pump' ? '#1d4ed8' : '#4f46e5'}
                bg={placingEquipment?.type === 'pump' ? '#dbeafe' : 'rgba(238,242,255,0.97)'}
              />
              Pompe
            </button>

            {/* Vanne d'équilibrage */}
            <button
              className={`tb-btn ${drawMode === 'draw' && pipeType === 'vanne' ? 'active' : ''}`}
              onClick={() => activateDraw('vanne')}
              >
              <VanneIcon active={drawMode === 'draw' && pipeType === 'vanne'} />
              Vanne équilib.
            </button>
          </>
        )}
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
      {placingChaufferie && (
        <span className="toolbar-hint">
          Cliquez sur le schéma pour placer · Échap pour annuler
        </span>
      )}
      {editChaufferie && (
        <span className="toolbar-hint">
          Glissez l'intérieur pour déplacer, les bords pour redimensionner · ✎ ou Échap pour terminer
        </span>
      )}

    </div>
  )
}
