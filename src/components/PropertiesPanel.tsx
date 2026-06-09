const TUBE_MATERIALS = [
  { label: '— Choisir —', lambda: '' },
  { label: 'Cuivre', lambda: 380 },
  { label: 'Acier', lambda: 50 },
  { label: 'Inox', lambda: 15 },
  { label: 'PER/PEX', lambda: 0.35 },
  { label: 'Multicouche', lambda: 0.45 },
  { label: 'Personnalisé', lambda: null },
]

const INSULATION_TYPES = [
  { label: '— Choisir —', lambda: '' },
  { label: 'Laine de verre', lambda: 0.035 },
  { label: 'Laine de roche', lambda: 0.040 },
  { label: 'Mousse PU', lambda: 0.028 },
  { label: 'Mousse caoutchouc', lambda: 0.040 },
  { label: 'Sans isolant', lambda: 0 },
  { label: 'Personnalisé', lambda: null },
]

function EdgeForm({ edge, onUpdate }) {
  const d = edge.data || {}
  const set = (key, val) => onUpdate(edge.id, 'edge', { [key]: val })

  const handleMaterial = e => {
    const mat = TUBE_MATERIALS.find(m => m.label === e.target.value)
    if (mat && mat.lambda !== null && mat.lambda !== '') {
      set('lambda_tube', mat.lambda)
    }
  }

  const handleInsulation = e => {
    const ins = INSULATION_TYPES.find(i => i.label === e.target.value)
    if (ins && ins.lambda !== null && ins.lambda !== '') {
      set('lambda_insul', ins.lambda)
      if (ins.label === 'Sans isolant') set('insulation_thickness', 0)
    }
  }

  return (
    <div className="section">
      <h3>Tronçon</h3>

      <div className="field">
        <label>Nom</label>
        <input value={d.name || ''} onChange={e => set('name', e.target.value)} placeholder="ex : A1" />
      </div>

      <div className="field">
        <label>Longueur (m)</label>
        <input type="number" min="0" value={d.length ?? ''} onChange={e => set('length', e.target.value)} />
      </div>

      <div className="field">
        <label>Ø intérieur (mm)</label>
        <input type="number" min="0" value={d.diameter_int ?? ''} onChange={e => set('diameter_int', e.target.value)} />
      </div>

      <div className="field">
        <label>Ø extérieur (mm)</label>
        <input type="number" min="0" value={d.diameter_ext ?? ''} onChange={e => set('diameter_ext', e.target.value)} />
      </div>

      <div className="field">
        <label>Matériau du tube</label>
        <select onChange={handleMaterial} defaultValue="">
          {TUBE_MATERIALS.map(m => <option key={m.label}>{m.label}</option>)}
        </select>
      </div>

      <div className="field">
        <label>λ tube (W/m·K)</label>
        <input type="number" min="0" step="0.001" value={d.lambda_tube ?? ''} onChange={e => set('lambda_tube', e.target.value)} />
      </div>

      <div className="field">
        <label>Type d'isolant</label>
        <select onChange={handleInsulation} defaultValue="">
          {INSULATION_TYPES.map(i => <option key={i.label}>{i.label}</option>)}
        </select>
      </div>

      <div className="field">
        <label>Épaisseur isolant (mm)</label>
        <input type="number" min="0" value={d.insulation_thickness ?? ''} onChange={e => set('insulation_thickness', e.target.value)} />
      </div>

      <div className="field">
        <label>λ isolant (W/m·K)</label>
        <input type="number" min="0" step="0.001" value={d.lambda_insul ?? ''} onChange={e => set('lambda_insul', e.target.value)} />
      </div>

      <div className="field">
        <label>Débit (m³/h)</label>
        <input type="number" min="0" value={d.flow_rate ?? ''} onChange={e => set('flow_rate', e.target.value)} />
      </div>
    </div>
  )
}

function NodeForm({ node, onUpdate }) {
  return (
    <div className="section">
      <h3>Nœud</h3>
      <div className="field">
        <label>Nom</label>
        <input
          value={node.data?.label || ''}
          onChange={e => onUpdate(node.id, 'node', { label: e.target.value })}
        />
      </div>
    </div>
  )
}

export default function PropertiesPanel({ selected, onUpdate }) {
  if (!selected) {
    return (
      <div className="section empty-panel">
        <p>Cliquez sur un tronçon ou un nœud pour éditer ses propriétés.</p>
      </div>
    )
  }

  if (selected.type === 'edge') {
    return <EdgeForm edge={selected.element} onUpdate={onUpdate} />
  }

  return <NodeForm node={selected.element} onUpdate={onUpdate} />
}
