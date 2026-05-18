import { useCallback } from 'react'
import {
  ReactFlow,
  Controls,
  Background,
  Handle,
  Position,
  Panel,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

function SourceNode({ data, selected }) {
  return (
    <div className={`custom-node source-node${selected ? ' node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="left-in" />
      <Handle type="target" position={Position.Top} id="top-in" />
      <div className="node-label">{data.label || 'Source ECS'}</div>
      <Handle type="source" position={Position.Right} id="right-out" />
      <Handle type="source" position={Position.Bottom} id="bottom-out" />
    </div>
  )
}

function JunctionNode({ data, selected }) {
  return (
    <div className={`custom-node junction-node${selected ? ' node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="left-in" />
      <Handle type="target" position={Position.Top} id="top-in" />
      <div className="node-label">{data.label || 'Jonction'}</div>
      <Handle type="source" position={Position.Right} id="right-out" />
      <Handle type="source" position={Position.Bottom} id="bottom-out" />
    </div>
  )
}

function EndpointNode({ data, selected }) {
  return (
    <div className={`custom-node endpoint-node${selected ? ' node-selected' : ''}`}>
      <Handle type="target" position={Position.Left} id="left-in" />
      <Handle type="target" position={Position.Top} id="top-in" />
      <div className="node-label">{data.label || 'Extrémité'}</div>
      <Handle type="source" position={Position.Right} id="right-out" />
      <Handle type="source" position={Position.Bottom} id="bottom-out" />
    </div>
  )
}

const nodeTypes = { source: SourceNode, junction: JunctionNode, endpoint: EndpointNode }

let counter = 0
function uid(prefix) { return `${prefix}-${Date.now()}-${counter++}` }

export default function NetworkEditor({
  nodes, edges, onNodesChange, onEdgesChange, onConnect,
  onSelectElement, results, setNodes,
}) {
  const addNode = useCallback((type) => {
    const labels = { source: 'Source ECS', junction: 'Jonction', endpoint: 'Extrémité' }
    setNodes(ns => [...ns, {
      id: uid(type),
      type,
      position: { x: 150 + Math.random() * 300, y: 150 + Math.random() * 200 },
      data: { label: labels[type] },
    }])
  }, [setNodes])

  // Annotate edges with result temperatures for display
  const displayEdges = edges.map(e => {
    const r = results?.edgeResults?.[e.id]
    const name = e.data?.name || ''
    return {
      ...e,
      label: r
        ? `${name ? name + ' | ' : ''}${r.T_in.toFixed(1)}° → ${r.T_out.toFixed(1)}°C`
        : name,
      markerEnd: { type: MarkerType.ArrowClosed },
      style: r ? { stroke: '#3b82f6', strokeWidth: 2 } : { strokeWidth: 2 },
    }
  })

  return (
    <ReactFlow
      nodes={nodes}
      edges={displayEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      nodeTypes={nodeTypes}
      onNodeClick={(_, node) => onSelectElement({ type: 'node', element: node })}
      onEdgeClick={(_, edge) => onSelectElement({ type: 'edge', element: edge })}
      onPaneClick={() => onSelectElement(null)}
      deleteKeyCode="Delete"
      fitView
    >
      <Controls />
      <Background color="#e2e8f0" gap={20} />
      <Panel position="top-left">
        <div className="node-toolbar">
          <span className="toolbar-label">Ajouter :</span>
          <button onClick={() => addNode('source')} className="btn-node btn-source">+ Source</button>
          <button onClick={() => addNode('junction')} className="btn-node btn-junction">+ Jonction</button>
          <button onClick={() => addNode('endpoint')} className="btn-node btn-endpoint">+ Extrémité</button>
          <span className="toolbar-hint">Relier : glisser d'un connecteur vers un autre • Supprimer : sélectionner + Suppr</span>
        </div>
      </Panel>
    </ReactFlow>
  )
}
