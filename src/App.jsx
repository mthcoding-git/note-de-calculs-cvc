import { useState, useCallback } from 'react'
import { applyNodeChanges, applyEdgeChanges, addEdge, MarkerType } from '@xyflow/react'
import NetworkEditor from './components/NetworkEditor'
import GlobalParams from './components/GlobalParams'
import PropertiesPanel from './components/PropertiesPanel'
import ResultsPanel from './components/ResultsPanel'
import { calculateThermal } from './engine/thermalCalc'
import { exportToExcel } from './export/excelExport'
import './App.css'

const DEFAULT_PARAMS = { T_depart: 55, T_amb: 20, rho: 985, cp: 4186 }

const DEFAULT_EDGE_DATA = {
  name: '', length: '', diameter_int: '', diameter_ext: '',
  lambda_tube: '', insulation_thickness: '', lambda_insul: '', flow_rate: '',
}

export default function App() {
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])
  const [globalParams, setGlobalParams] = useState(DEFAULT_PARAMS)
  const [selected, setSelected] = useState(null)
  const [results, setResults] = useState(null)

  const onNodesChange = useCallback(
    changes => setNodes(nds => applyNodeChanges(changes, nds)), []
  )
  const onEdgesChange = useCallback(
    changes => setEdges(eds => applyEdgeChanges(changes, eds)), []
  )
  const onConnect = useCallback(
    conn => setEdges(eds => addEdge({
      ...conn,
      markerEnd: { type: MarkerType.ArrowClosed },
      data: { ...DEFAULT_EDGE_DATA },
    }, eds)),
    []
  )

  const updateElement = useCallback((id, type, newData) => {
    if (type === 'node') {
      setNodes(ns => ns.map(n => n.id === id ? { ...n, data: { ...n.data, ...newData } } : n))
    } else {
      setEdges(es => es.map(e => e.id !== id ? e : { ...e, data: { ...e.data, ...newData } }))
      setSelected(sel => sel && sel.element.id === id
        ? { ...sel, element: { ...sel.element, data: { ...sel.element.data, ...newData } } }
        : sel
      )
    }
  }, [])

  const handleCalculate = () => {
    try {
      setResults(calculateThermal(nodes, edges, globalParams))
    } catch (e) {
      alert('Erreur de calcul : ' + e.message)
    }
  }

  const handleExport = () => {
    if (!results) { alert("Lancez d'abord le calcul."); return }
    exportToExcel(nodes, edges, globalParams, results)
  }

  const handleSave = () => {
    const blob = new Blob([JSON.stringify({ nodes, edges, globalParams }, null, 2)], { type: 'application/json' })
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: 'projet-ecs.json' })
    a.click()
  }

  const handleLoad = () => {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' })
    input.onchange = e => {
      const reader = new FileReader()
      reader.onload = ev => {
        try {
          const d = JSON.parse(ev.target.result)
          setNodes(d.nodes || [])
          setEdges(d.edges || [])
          setGlobalParams(d.globalParams || DEFAULT_PARAMS)
          setResults(null)
          setSelected(null)
        } catch { alert('Fichier invalide.') }
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
          <button onClick={handleCalculate} className="btn btn-primary">⚡ Calculer</button>
          <button onClick={handleExport} className="btn btn-success" disabled={!results}>📊 Export Excel</button>
        </div>
      </header>
      <div className="app-body">
        <aside className="sidebar-left">
          <GlobalParams params={globalParams} onChange={setGlobalParams} />
        </aside>
        <main className="canvas-area">
          <NetworkEditor
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onSelectElement={setSelected}
            results={results}
            setNodes={setNodes}
          />
        </main>
        <aside className="sidebar-right">
          <PropertiesPanel selected={selected} onUpdate={updateElement} />
          {results && <ResultsPanel results={results} />}
        </aside>
      </div>
    </div>
  )
}
