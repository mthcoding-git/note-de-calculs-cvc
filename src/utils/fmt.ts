export const sf = (val, decimals = 2, fallback = '—') => {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback
  return val.toFixed(decimals)
}

export function fmtDpLabel(pa: number | null | undefined, unit: string): string {
  if (pa == null || !Number.isFinite(pa)) return '—'
  if (unit === 'mmCE') return `${(pa / 9.81).toFixed(0)} mmCE`
  if (unit === 'both') return `${Math.round(pa)} Pa / ${(pa / 9.81).toFixed(0)} mmCE`
  return `${Math.round(pa)} Pa`
}

export function fmtDpCellVal(pa: number | null | undefined, unit: string): string {
  if (pa == null || !Number.isFinite(pa)) return '—'
  if (unit === 'mmCE') return `${(pa / 9.81).toFixed(0)}`
  if (unit === 'both') return `${Math.round(pa)} / ${(pa / 9.81).toFixed(0)}`
  return `${Math.round(pa)}`
}
