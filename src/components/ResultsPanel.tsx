function fmt(val, decimals = 2) {
  if (typeof val !== 'number' || !Number.isFinite(val)) return '—'
  return val.toFixed(decimals)
}

export default function ResultsPanel({ results }) {
  const { summary, edgeResults } = results

  const deltaClass =
    summary.delta_T_bouclage == null ? '' :
    summary.delta_T_bouclage <= 5 ? 'result-success' : 'result-warning'

  return (
    <>
      <div className="section">
        <h3>Résultats globaux</h3>
        <div className="result-item">
          <span className="result-label">Φ total</span>
          <span className="result-value">{fmt(summary.totalPhi, 1)} W</span>
        </div>
        <div className="result-item">
          <span className="result-label">T retour</span>
          <span className="result-value">{fmt(summary.T_retour)} °C</span>
        </div>
        <div className="result-item">
          <span className="result-label">ΔT bouclage</span>
          <span className={`result-value ${deltaClass}`}>{fmt(summary.delta_T_bouclage)} °C</span>
        </div>
      </div>

      <div className="section">
        <h3>Tronçons</h3>
        <table className="results-table">
          <thead>
            <tr>
              <th>Nom</th>
              <th>T in</th>
              <th>T out</th>
              <th>Φ (W)</th>
            </tr>
          </thead>
          <tbody>
            {(Object.values(edgeResults) as any[]).map(r => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td>{fmt(r.T_in)} °C</td>
                <td>{fmt(r.T_out)} °C</td>
                <td>{fmt(r.phi, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
