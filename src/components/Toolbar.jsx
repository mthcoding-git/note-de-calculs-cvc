export default function Toolbar({
  drawMode, setDrawMode,
  pipeType, setPipeType,
  onUndo, onRedo, canUndo, canRedo,
  panelOpen, onTogglePanel,
}) {
  return (
    <div className="toolbar">

      {/* Panel toggle */}
      <button className="tb-btn tb-panel-toggle" onClick={onTogglePanel}
        title={panelOpen ? 'Masquer le panneau' : 'Afficher le panneau'}>
        {panelOpen ? '◀ Paramètres' : '▶ Paramètres'}
      </button>

      <div className="toolbar-sep" />

      {/* Undo / Redo */}
      <button className="tb-btn" onClick={onUndo} disabled={!canUndo} title="Annuler (Ctrl+Z)">↩ Annuler</button>
      <button className="tb-btn" onClick={onRedo} disabled={!canRedo} title="Rétablir (Ctrl+Y)">↪ Rétablir</button>

      <div className="toolbar-sep" />

      {/* Draw modes */}
      <div className="toolbar-group">
        <button className={`tb-btn ${drawMode === 'select' ? 'active' : ''}`}
          onClick={() => setDrawMode('select')} title="Sélection">
          ↖ Sélection
        </button>
        <button className={`tb-btn ${drawMode === 'draw' ? 'active' : ''}`}
          onClick={() => setDrawMode('draw')} title="Dessiner">
          ✏ Dessiner
        </button>
        <button className={`tb-btn ${drawMode === 'delete' ? 'active-delete' : ''}`}
          onClick={() => setDrawMode(m => m === 'delete' ? 'select' : 'delete')} title="Supprimer">
          ✕ Supprimer
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
              <span className="pipe-prev-point" /> Point
            </button>
          </div>
        </>
      )}

      <span className="toolbar-hint">
        {drawMode === 'draw' && pipeType !== 'point'
          ? 'Clic : point · Double-clic : fin · Échap : valider · Ctrl+Z : annuler sommet · Espace+Glisser : naviguer'
          : drawMode === 'draw' && pipeType === 'point'
          ? 'Clic : créer un point · Clic sur un trait : jonction'
          : drawMode === 'delete'
          ? 'Clic sur un élément : supprimer (Ctrl+Z pour annuler)'
          : 'Drag : déplacer la vue · Ctrl+Drag : sélection · Shift+Clic : multi-sélection · Suppr : effacer · Molette : zoom'}
      </span>
    </div>
  )
}
