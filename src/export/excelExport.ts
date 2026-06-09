import * as XLSX from 'xlsx'

export function exportToExcel(nodes, edges, globalParams, results) {
  const wb = XLSX.utils.book_new()

  // Sheet 1 — Paramètres généraux + résumé
  const paramsData = [
    ['PARAMÈTRES GÉNÉRAUX', '', ''],
    ['Paramètre', 'Valeur', 'Unité'],
    ['Température de départ', globalParams.T_depart, '°C'],
    ['Température ambiante', globalParams.T_amb, '°C'],
    ['Masse volumique', globalParams.rho, 'kg/m³'],
    ['Chaleur spécifique', globalParams.cp, 'J/kg·K'],
    [],
    ['RÉSULTATS GLOBAUX', '', ''],
    ['Paramètre', 'Valeur', 'Unité'],
    ['Pertes thermiques totales', results.summary.totalPhi != null ? +results.summary.totalPhi.toFixed(1) : '', 'W'],
    ['Température de retour', results.summary.T_retour != null ? +results.summary.T_retour.toFixed(2) : '', '°C'],
    ['ΔT bouclage', results.summary.delta_T_bouclage != null ? +results.summary.delta_T_bouclage.toFixed(2) : '', '°C'],
  ]
  const wsParams = XLSX.utils.aoa_to_sheet(paramsData)
  wsParams['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 12 }]
  XLSX.utils.book_append_sheet(wb, wsParams, 'Paramètres')

  // Sheet 2 — Tronçons
  const headers = [
    'Tronçon',
    'Longueur (m)',
    'Ø int (mm)',
    'Ø ext (mm)',
    'λ tube (W/m·K)',
    'Ép. isolant (mm)',
    'λ isolant (W/m·K)',
    'Débit (L/h)',
    'UI (W/m·K)',
    'T entrée (°C)',
    'T sortie (°C)',
    'Φ (W)',
  ]

  const rows = edges.map(edge => {
    const d = edge.data || {}
    const r = results.edgeResults[edge.id]
    return [
      d.name || edge.id,
      d.length !== '' ? +d.length : '',
      d.diameter_int !== '' ? +d.diameter_int : '',
      d.diameter_ext !== '' ? +d.diameter_ext : '',
      d.lambda_tube !== '' ? +d.lambda_tube : '',
      d.insulation_thickness !== '' ? +d.insulation_thickness : '',
      d.lambda_insul !== '' ? +d.lambda_insul : '',
      d.flow_rate !== '' ? +d.flow_rate : '',
      r ? +r.UI.toFixed(4) : '',
      r ? +r.T_in.toFixed(2) : '',
      r ? +r.T_out.toFixed(2) : '',
      r ? +r.phi.toFixed(1) : '',
    ]
  })

  const wsTroncons = XLSX.utils.aoa_to_sheet([headers, ...rows])
  wsTroncons['!cols'] = headers.map(() => ({ wch: 18 }))
  XLSX.utils.book_append_sheet(wb, wsTroncons, 'Tronçons')

  XLSX.writeFile(wb, 'note-calcul-ecs.xlsx')
}
