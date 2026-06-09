export const sf = (val, decimals = 2, fallback = '—') => {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback
  return val.toFixed(decimals)
}
