// ── Interpolation sur tables ASHRAE ──────────────────────────────────────────
// Les diagrammes publient des valeurs discrètes sans prescrire de méthode. Les
// interpolations ci-dessous sont donc une règle d'implémentation, et non une
// formule ASHRAE. Aux extrémités elles saturent au lieu d'extrapoler : au-delà
// du domaine tabulé, le document ne dit rien.

/** Indice de l'intervalle contenant v, après saturation sur l'axe. */
function span(axis: number[], v: number): { i: number; t: number } {
  const x = Math.max(axis[0], Math.min(axis[axis.length - 1], v))
  let i = axis.length - 2
  for (let k = 0; k < axis.length - 1; k++) { if (axis[k + 1] >= x) { i = k; break } }
  return { i, t: (x - axis[i]) / (axis[i + 1] - axis[i]) }
}

/** Interpolation linéaire bornée aux extrémités. */
export function interp1(axis: number[], vals: number[], v: number): number {
  const { i, t } = span(axis, v)
  return vals[i] * (1 - t) + vals[i + 1] * t
}

/** Interpolation bilinéaire bornée aux extrémités. */
export function interp2(
  rows: number[], cols: number[], table: number[][], r: number, c: number,
): number {
  const a = span(rows, r), b = span(cols, c)
  return table[a.i][b.i]         * (1 - a.t) * (1 - b.t)
       + table[a.i][b.i + 1]     * (1 - a.t) * b.t
       + table[a.i + 1][b.i]     * a.t       * (1 - b.t)
       + table[a.i + 1][b.i + 1] * a.t       * b.t
}

/** Interpolation trilinéaire bornée aux extrémités. */
export function interp3(
  zs: number[], rows: number[], cols: number[], cube: number[][][],
  z: number, r: number, c: number,
): number {
  return interp1(zs, cube.map(t => interp2(rows, cols, t, r, c)), z)
}
