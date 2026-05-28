export default function Toolbar({
  drawMode, setDrawMode,
  pipeType, setPipeType,
  panelOpen, onTogglePanel,
  errorCount, onShowErrors,
}) {
  return (
    <div className="toolbar">

      {/* Panel toggle */}
      <button className="tb-btn tb-panel-toggle" onClick={onTogglePanel}
        title={panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'}>
        {panelOpen ? '◀ Paramètres' : '▶ Paramètres'}
      </button>

      <div className="toolbar-sep" />

      {/* Draw modes */}
      <div className="toolbar-group">
        <button className={`tb-btn ${drawMode === 'select' ? 'active' : ''}`}
          onClick={() => setDrawMode('select')} title="Sélectionner">
          ↖ Sélectionner
        </button>
        <button className={`tb-btn ${drawMode === 'draw' ? 'active' : ''}`}
          onClick={() => setDrawMode('draw')} title="Dessiner">
          ✏ Dessiner
        </button>
        <button className={`tb-btn ${drawMode === 'editParams' ? 'active' : ''}`}
          onClick={() => setDrawMode('editParams')} title="Attribuer des paramètres">
          🏷 Attribuer
        </button>
      </div>

      {/* Pipe type (only in draw mode) */}
      {drawMode === 'draw' && (
        <>
          <div className="toolbar-sep" />
          <div className="toolbar-group">
            <span className="toolbar-label">Type :</span>
            <button
              className={`tb-btn pipe-btn ${pipeType === 'aller' ? 'active-aller' : ''}`}
              onClick={() => setPipeType('aller')}>
              <span className="pipe-prev-aller" /> Aller ECS
            </button>
            <button
              className={`tb-btn pipe-btn ${pipeType === 'retour' ? 'active-retour' : ''}`}
              onClick={() => setPipeType('retour')}>
              <span className="pipe-prev-retour" /> Retour ECS
            </button>
            <button
              className={`tb-btn pipe-btn ${pipeType === 'point' ? 'active' : ''}`}
              onClick={() => setPipeType('point')}>
              <span className="pipe-prev-point" /> Nœud
            </button>
          </div>
        </>
      )}

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

    </div>
  )
}
