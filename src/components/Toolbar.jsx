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

export default function Toolbar({
  drawMode, setDrawMode,
  pipeType, setPipeType,
  panelOpen, onTogglePanel,
  errorCount, onShowErrors,
  chaufferie, editChaufferie, onEditChaufferieChange, onAddChaufferie,
  placingChaufferie, placingEquipment,
  onAddProductionECS, onAddPump,
}) {
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

  return (
    <div className="toolbar">

      {/* Panel toggle — disabled in Attribuer mode (panel is forced open) */}
      <button
        className="tb-btn tb-panel-toggle"
        onClick={onTogglePanel}
        disabled={isEditParams}
        title={isEditParams ? 'Panneau forcé ouvert en mode Attribuer' : panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'}>
        {panelOpen ? '◀ Paramètres' : '▶ Paramètres'}
      </button>

      <div className="toolbar-sep" />

      {/* Select mode */}
      <button
        className={`tb-btn ${isSelect ? 'active' : ''}`}
        onClick={() => setDrawMode('select')}
        title="Mode sélection (Échap)">
        <CursorIcon /> Sélectionner
      </button>

      {/* Attribuer params — right after Sélectionner */}
      <button
        className={`tb-btn ${isEditParams ? 'active' : ''}`}
        onClick={() => setDrawMode(isEditParams ? 'select' : 'editParams')}
        title="Cliquer sur un tronçon pour lui attribuer ses paramètres">
        <PropsIcon /> Attribuer
      </button>

      <div className="toolbar-sep" />

      {/* Draw tools */}
      <div className="toolbar-group">
        <span className="toolbar-label">Tracé :</span>
        <button
          className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'aller' ? 'active-aller' : ''}`}
          onClick={() => activateDraw('aller')}
          title="Aller ECS — cliquer à nouveau ou Échap pour quitter">
          <span className="pipe-prev-aller" /> Aller ECS
        </button>
        <button
          className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'retour' ? 'active-retour' : ''}`}
          onClick={() => activateDraw('retour')}
          title="Retour ECS — cliquer à nouveau ou Échap pour quitter">
          <span className="pipe-prev-retour" /> Retour ECS
        </button>
        <button
          className={`tb-btn ${drawMode === 'draw' && pipeType === 'point' ? 'active' : ''}`}
          onClick={() => activateDraw('point')}
          title="Ajouter un nœud — clic sur le schéma pour créer, clic sur un tronçon pour le diviser · Échap pour quitter">
          <NodeSquareIcon /> Nœud
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* Equipment */}
      <div className="toolbar-group">
        <span className="toolbar-label">Équipements :</span>

        {/* Chaufferie */}
        {!chaufferie?.placed ? (
          <button
            className={`tb-btn ${placingChaufferie ? 'active' : ''}`}
            onClick={onAddChaufferie}
            title="Cliquer sur le schéma pour placer la zone chaufferie">
            Chaufferie
          </button>
        ) : (
          <button
            className={`tb-btn ${editChaufferie ? 'active' : ''}`}
            onClick={() => onEditChaufferieChange(!editChaufferie)}
            title="Activer pour déplacer et redimensionner la zone chaufferie">
            ✎ Modifier chaufferie
          </button>
        )}

        {/* Prod. ECS */}
        <button
          className={`tb-btn ${placingEquipment?.type === 'productionECS' ? 'active' : ''}`}
          onClick={onAddProductionECS}
          title="Cliquer sur le schéma pour placer une production ECS">
          Prod. ECS
        </button>

        {/* Pompe */}
        <button
          className={`tb-btn ${placingEquipment?.type === 'pump' ? 'active' : ''}`}
          onClick={onAddPump}
          title="Cliquer sur le schéma pour placer une pompe (sens modifiable via clic)">
          <PumpSymbol
            rotation={180}
            color={placingEquipment?.type === 'pump' ? '#1d4ed8' : '#4f46e5'}
            bg={placingEquipment?.type === 'pump' ? '#dbeafe' : 'rgba(238,242,255,0.97)'}
          />
          Pompe
        </button>
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
      {(placingChaufferie || placingEquipment) && (
        <span className="toolbar-hint">
          Cliquez sur le schéma pour placer · Échap pour annuler
        </span>
      )}
      {editChaufferie && (
        <span className="toolbar-hint">
          Glissez l'intérieur pour déplacer, les bords pour redimensionner · ✎ ou Échap pour terminer
        </span>
      )}
      {isEditParams && (
        <span className="toolbar-hint">
          Cliquez sur un tronçon pour lui attribuer ses paramètres · Échap pour quitter
        </span>
      )}

    </div>
  )
}
