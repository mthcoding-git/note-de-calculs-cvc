import { useState, useCallback, useRef, useEffect } from 'react'
import DrawingCanvas from './components/DrawingCanvas'
import LeftPanel from './components/LeftPanel'
import RightPanel from './components/RightPanel'
import Toolbar from './components/Toolbar'
import { DEFAULT_MATERIALS } from './data/materials'
import { DEFAULT_INSULATIONS } from './data/insulations'
import './App.css'

const DEFAULT_GLOBAL_PARAMS = {
  T_depart: 60, rho: 985, cp: 4180,
  T_amb_ss: 10, T_amb_other: 20, he: 10,
}

// 5 niveaux SS-1…R+3, du bas vers le haut
const DEFAULT_LEVELS = [
  { id: 'ss1', name: 'SS-1', isSousSol: true  },
  { id: 'rdc', name: 'RDC',  isSousSol: false },
  { id: 'r1',  name: 'R+1',  isSousSol: false },
  { id: 'r2',  name: 'R+2',  isSousSol: false },
  { id: 'r3',  name: 'R+3',  isSousSol: false },
]
// 6 valeurs (n+1) : lineYs[0]=fond SS-1, lineYs[5]=Toiture — espacement 210 px
const DEFAULT_LINE_YS = [1110, 900, 690, 480, 270, 80]

// 5 colonnes par défaut, 6 lignes verticales — espacement 450 px
const DEFAULT_COLUMNS = [
  { id: 'col1', name: 'Colonne 1', levelIds: 'all' },
  { id: 'col2', name: 'Colonne 2', levelIds: 'all' },
  { id: 'col3', name: 'Colonne 3', levelIds: 'all' },
  { id: 'col4', name: 'Colonne 4', levelIds: 'all' },
  { id: 'col5', name: 'Colonne 5', levelIds: 'all' },
]
const DEFAULT_COLUMN_XS = [200, 650, 1100, 1550, 2000, 2450]

const DEFAULT_CHAUFFERIE = {
  placed: false,
  enabled: false,
  levelId: 'ss1',
  x1: 1190,
  x2: 1460,
  height: 150,
}

const DEFAULT_POINTS = []

function initProject() {
  return {
    globalParams: DEFAULT_GLOBAL_PARAMS,
    materials: DEFAULT_MATERIALS,
    insulations: DEFAULT_INSULATIONS,
    levels: DEFAULT_LEVELS,
    lineYs: DEFAULT_LINE_YS,
    columns: DEFAULT_COLUMNS,
    columnXs: DEFAULT_COLUMN_XS,
    chaufferie: DEFAULT_CHAUFFERIE,
    segments: [],
    points: DEFAULT_POINTS,
  }
}

// ── Undo/redo store ────────────────────────────────────
function useHistory(init) {
  const histRef  = useRef([init])
  const idxRef   = useRef(0)
  const [, bump] = useState(0)

  const project = histRef.current[idxRef.current]

  const setProject = useCallback((updater) => {
    const cur  = histRef.current[idxRef.current]
    const next = typeof updater === 'function' ? updater(cur) : updater
    const newHist = [...histRef.current.slice(0, idxRef.current + 1), next]
    histRef.current = newHist.length > 60 ? newHist.slice(-60) : newHist
    idxRef.current  = histRef.current.length - 1
    bump(n => n + 1)
  }, [])

  const undo = useCallback(() => {
    if (idxRef.current > 0) { idxRef.current--; bump(n => n + 1) }
  }, [])
  const redo = useCallback(() => {
    if (idxRef.current < histRef.current.length - 1) { idxRef.current++; bump(n => n + 1) }
  }, [])
  const canUndo = idxRef.current > 0
  const canRedo = idxRef.current < histRef.current.length - 1

  return { project, setProject, undo, redo, canUndo, canRedo }
}

export default function App() {
  const { project, setProject, undo, redo, canUndo, canRedo } = useHistory(initProject())
  const [drawMode,           setDrawMode]           = useState('select')
  const [pipeType,           setPipeType]           = useState('aller')
  const [selectedIds,        setSelectedIds]        = useState([])
  const [panelOpen,          setPanelOpen]          = useState(true)
  const [editLevelsEnabled,    setEditLevelsEnabled]    = useState(false)
  const [editColumnsEnabled,   setEditColumnsEnabled]   = useState(false)
  const [editChaufferie,       setEditChaufferie]       = useState(false)
  const [placingEquipment,     setPlacingEquipment]     = useState(null)  // null | { type, name, rotation?, size }
  const [nextPumpRotation,     setNextPumpRotation]     = useState(180)   // rotation applied to next pump placed
  const [placingChaufferie,    setPlacingChaufferie]    = useState(false)
  const [editParam, setEditParam] = useState({
    paramType: 'type', segType: 'aller',
    materialId: null, dn: null,
    insulationId: null, thickness: null,
    length: null,
    flowVelocityMode: 'flowRate', flowVelocityValue: null,
  })

  // Generic updater for any project key
  const update = useCallback((key, valOrFn) => {
    setProject(p => ({ ...p, [key]: typeof valOrFn === 'function' ? valOrFn(p[key]) : valOrFn }))
  }, [setProject])

  const onAssignParam = useCallback((segId) => {
    update('segments', segs => segs.map(s => {
      if (s.id !== segId) return s
      if (editParam.paramType === 'type')
        return { ...s, type: editParam.segType }
      if (editParam.paramType === 'material')
        return { ...s, materialId: editParam.materialId, dn: editParam.dn, di_override: null, de_override: null, lambda_tube_override: null }
      if (editParam.paramType === 'insulation')
        return { ...s, insulationId: editParam.insulationId, thickness: editParam.thickness, lambda_insul_override: null }
      if (editParam.paramType === 'length' && editParam.length != null)
        return { ...s, length_override: editParam.length }
      if (editParam.paramType === 'flowVelocity' && editParam.flowVelocityValue != null)
        return editParam.flowVelocityMode === 'flowRate'
          ? { ...s, flowRate: editParam.flowVelocityValue, velocity: null }
          : { ...s, velocity: editParam.flowVelocityValue, flowRate: null }
      return s
    }))
  }, [editParam, update])

  // Combined atomic update (single undo entry)
  const updateNetwork = useCallback((segsFnOrVal, ptsFnOrVal) => {
    setProject(p => ({
      ...p,
      segments: typeof segsFnOrVal === 'function' ? segsFnOrVal(p.segments) : (segsFnOrVal ?? p.segments),
      points:   typeof ptsFnOrVal  === 'function' ? ptsFnOrVal(p.points)   : (ptsFnOrVal  ?? p.points),
    }))
  }, [setProject])

  // Update a single segment or point by id
  const updateElement = useCallback((id, type, newData) => {
    if (type === 'segment') {
      setProject(p => ({ ...p, segments: p.segments.map(s => s.id !== id ? s : { ...s, ...newData }) }))
    } else {
      setProject(p => ({ ...p, points: p.points.map(pt => pt.id !== id ? pt : { ...pt, ...newData }) }))
    }
  }, [setProject])

  // Ctrl+Z / Ctrl+Y
  useEffect(() => {
    const handler = e => {
      const tag = e.target.tagName
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo() }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) { e.preventDefault(); redo() }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  const handleAddPump = () => {
    const pumps = project.points.filter(p => p.type === 'pump')
    const count = pumps.length
    const name = count === 0
      ? 'Pompe bouclage ECS'
      : `Pompe bouclage ECS n°${count + 1}`
    setPlacingEquipment({
      type: 'pump', name, rotation: nextPumpRotation, size: 12,
      ...(count === 1 ? { renameFirstPump: pumps[0].id } : {}),
    })
  }

  const handleAddProductionECS = () => {
    setPlacingEquipment({ type: 'productionECS', name: 'Production ECS', size: { w: 44, h: 28 } })
  }

  const handleAddChaufferie = () => {
    setPlacingChaufferie(true)
  }

  const handleSave = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'projet-ecs.json' })
    a.click()
  }

  const handleLoad = () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' })
    input.onchange = e => {
      const reader = new FileReader()
      reader.onload = ev => {
        try { setProject(JSON.parse(ev.target.result)); setSelectedIds([]) }
        catch { alert('Fichier invalide.') }
      }
      reader.readAsText(e.target.files[0])
    }
    input.click()
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <span className="app-title-main">Bouclage ECS</span>
          <span className="app-title-sub">Note de calcul thermique</span>
        </div>
        <div className="header-actions">
          <button onClick={handleSave} className="btn btn-secondary">💾 Sauvegarder</button>
          <button onClick={handleLoad} className="btn btn-secondary">📂 Charger</button>
          <button className="btn btn-primary" disabled>⚡ Calculer</button>
          <button className="btn btn-success" disabled>📊 Export Excel</button>
        </div>
      </header>

      <Toolbar
        drawMode={drawMode} setDrawMode={setDrawMode}
        pipeType={pipeType} setPipeType={setPipeType}
        panelOpen={panelOpen} onTogglePanel={() => setPanelOpen(o => !o)}
      />

      <div className="app-body">
        <aside className={`sidebar-left ${panelOpen ? '' : 'sidebar-closed'}`}>
          {panelOpen && (
            <LeftPanel
              globalParams={project.globalParams}
              onGlobalParamsChange={v => update('globalParams', v)}
              levels={project.levels}
              lineYs={project.lineYs}
              onLevelsChange={v => update('levels', v)}
              onLineYsChange={v => update('lineYs', v)}
              editLevelsEnabled={editLevelsEnabled}
              onEditLevelsChange={setEditLevelsEnabled}
              materials={project.materials}
              onMaterialsChange={v => update('materials', typeof v === 'function' ? v(project.materials) : v)}
              insulations={project.insulations}
              onInsulationsChange={v => update('insulations', typeof v === 'function' ? v(project.insulations) : v)}
              columns={project.columns}
              columnXs={project.columnXs}
              onColumnsChange={v => update('columns', v)}
              onColumnXsChange={v => update('columnXs', v)}
              editColumnsEnabled={editColumnsEnabled}
              onEditColumnsChange={setEditColumnsEnabled}
              chaufferie={project.chaufferie}
              onChaufferieChange={v => update('chaufferie', v)}
              editChaufferie={editChaufferie}
              onEditChaufferieChange={setEditChaufferie}
              onAddPump={handleAddPump}
              onAddProductionECS={handleAddProductionECS}
              onAddChaufferie={handleAddChaufferie}
              nextPumpRotation={nextPumpRotation}
              onPumpRotationChange={setNextPumpRotation}
              segments={project.segments}
              points={project.points}
              drawMode={drawMode}
              editParam={editParam}
              onEditParamChange={setEditParam}
              onSelectIds={setSelectedIds}
            />
          )}
        </aside>

        <main className="canvas-area">
          <DrawingCanvas
            levels={project.levels}
            lineYs={project.lineYs}
            onLineYsChange={v => update('lineYs', typeof v === 'function' ? v(project.lineYs) : v)}
            segments={project.segments}
            onSegmentsChange={v => update('segments', typeof v === 'function' ? v(project.segments) : v)}
            points={project.points}
            onPointsChange={v => update('points', typeof v === 'function' ? v(project.points) : v)}
            onNetworkChange={updateNetwork}
            drawMode={drawMode}
            pipeType={pipeType}
            selectedIds={selectedIds}
            onSelectIds={setSelectedIds}
            editLevelsEnabled={editLevelsEnabled}
            editColumnsEnabled={editColumnsEnabled}
            columns={project.columns}
            columnXs={project.columnXs}
            onColumnXsChange={v => update('columnXs', v)}
            chaufferie={project.chaufferie}
            onChaufferieChange={v => update('chaufferie', v)}
            editChaufferie={editChaufferie}
            placingEquipment={placingEquipment}
            onPlacingDone={() => setPlacingEquipment(null)}
            placingChaufferie={placingChaufferie}
            onPlacingChaufferieDone={() => setPlacingChaufferie(false)}
            editParam={drawMode === 'editParams' ? editParam : null}
            onAssignParam={onAssignParam}
          />
        </main>

        <aside className="sidebar-right">
          <RightPanel
            selectedIds={selectedIds}
            segments={project.segments}
            points={project.points}
            onUpdate={updateElement}
            materials={project.materials}
            insulations={project.insulations}
            levels={project.levels}
            lineYs={project.lineYs}
            columns={project.columns}
            columnXs={project.columnXs}
            chaufferie={project.chaufferie}
          />
        </aside>
      </div>
    </div>
  )
}
