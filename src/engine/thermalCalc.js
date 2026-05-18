function calculateUI(d_int_mm, d_ext_mm, lambda_tube, e_insul_mm, lambda_insul) {
  const r1 = d_int_mm / 2000
  const r2 = d_ext_mm / 2000
  const r3 = r2 + e_insul_mm / 1000

  if (r1 <= 0 || r2 <= r1) return 0

  const R_tube = Math.log(r2 / r1) / lambda_tube
  const R_insul = e_insul_mm > 0 && lambda_insul > 0 ? Math.log(r3 / r2) / lambda_insul : 0

  return (2 * Math.PI) / (R_tube + R_insul)
}

export function calculateThermal(nodes, edges, globalParams) {
  const T_depart = parseFloat(globalParams.T_depart)
  const T_amb = parseFloat(globalParams.T_amb)
  const rho = parseFloat(globalParams.rho)
  const cp = parseFloat(globalParams.cp)

  const sourceNode = nodes.find(n => n.type === 'source')
  if (!sourceNode) throw new Error('Aucun nœud source défini.')
  if (nodes.length < 2) throw new Error('Le réseau doit avoir au moins 2 nœuds.')

  const outEdgesMap = new Map()
  const inEdgesMap = new Map()
  nodes.forEach(n => { outEdgesMap.set(n.id, []); inEdgesMap.set(n.id, []) })
  edges.forEach(e => {
    outEdgesMap.get(e.source)?.push(e)
    inEdgesMap.get(e.target)?.push(e)
  })

  const nodeTemps = new Map()
  const edgeResults = new Map()
  nodeTemps.set(sourceNode.id, T_depart)

  // Pending incoming edges count per node (0 for source so it starts immediately)
  const pendingIn = new Map()
  nodes.forEach(n => {
    pendingIn.set(n.id, n.id === sourceNode.id ? 0 : inEdgesMap.get(n.id).length)
  })

  const readyQueue = [sourceNode.id]

  while (readyQueue.length > 0) {
    const nodeId = readyQueue.shift()
    const T_node = nodeTemps.get(nodeId)

    for (const edge of (outEdgesMap.get(nodeId) || [])) {
      const d = edge.data || {}
      const flow_l_h = parseFloat(d.flow_rate) || 0
      const flow_kg_s = (flow_l_h / 3600000) * rho
      const L = parseFloat(d.length) || 0

      const UI = calculateUI(
        parseFloat(d.diameter_int) || 20,
        parseFloat(d.diameter_ext) || 22,
        parseFloat(d.lambda_tube) || 380,
        parseFloat(d.insulation_thickness) || 20,
        parseFloat(d.lambda_insul) || 0.04
      )

      let T_out, phi
      if (flow_kg_s > 0 && L > 0) {
        T_out = T_amb + (T_node - T_amb) * Math.exp(-(UI * L) / (flow_kg_s * cp))
        phi = UI * L * ((T_node + T_out) / 2 - T_amb)
      } else {
        T_out = T_node
        phi = 0
      }

      edgeResults.set(edge.id, {
        name: d.name || edge.id,
        T_in: T_node,
        T_out,
        UI,
        phi,
        flow_kg_s,
        flow_l_h,
        length: L,
      })

      const targetId = edge.target
      const newPending = (pendingIn.get(targetId) || 0) - 1
      pendingIn.set(targetId, newPending)

      if (newPending <= 0 && !nodeTemps.has(targetId)) {
        const inEdges = inEdgesMap.get(targetId) || []
        let totalMass = 0, totalHeat = 0
        for (const ie of inEdges) {
          const r = edgeResults.get(ie.id)
          if (r) { totalMass += r.flow_kg_s; totalHeat += r.flow_kg_s * r.T_out }
        }
        nodeTemps.set(targetId, totalMass > 0 ? totalHeat / totalMass : T_node)
        readyQueue.push(targetId)
      }
    }
  }

  // Return temperature at source (weighted mix of all return edges)
  const returnEdges = inEdgesMap.get(sourceNode.id) || []
  let retMass = 0, retHeat = 0
  for (const e of returnEdges) {
    const r = edgeResults.get(e.id)
    if (r) { retMass += r.flow_kg_s; retHeat += r.flow_kg_s * r.T_out }
  }
  const T_retour = retMass > 0 ? retHeat / retMass : null
  const totalPhi = Array.from(edgeResults.values()).reduce((s, r) => s + r.phi, 0)

  return {
    edgeResults: Object.fromEntries(edgeResults),
    nodeTemps: Object.fromEntries(nodeTemps),
    summary: {
      totalPhi,
      T_retour,
      delta_T_bouclage: T_retour !== null ? T_depart - T_retour : null,
    },
  }
}
