export default function GlobalParams({ params, onChange }) {
  const set = (key, val) => onChange({ ...params, [key]: val })

  return (
    <div className="section">
      <h3>Paramètres généraux</h3>

      <div className="field">
        <label>T° départ (°C)</label>
        <input
          type="number"
          value={params.T_depart}
          onChange={e => set('T_depart', e.target.value)}
        />
      </div>

      <div className="field">
        <label>T° ambiante (°C)</label>
        <input
          type="number"
          value={params.T_amb}
          onChange={e => set('T_amb', e.target.value)}
        />
      </div>

      <div className="field">
        <label>Masse volumique ρ (kg/m³)</label>
        <input
          type="number"
          value={params.rho}
          onChange={e => set('rho', e.target.value)}
        />
      </div>

      <div className="field">
        <label>Chaleur spécifique cp (J/kg·K)</label>
        <input
          type="number"
          value={params.cp}
          onChange={e => set('cp', e.target.value)}
        />
      </div>
    </div>
  )
}
