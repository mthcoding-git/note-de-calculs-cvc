// ── Primitives de tracé partagées par les schémas SVG ────────────────────────

/** Segment bézier cubique simulant une onde en S entre deux points.
 *  C'est la marque de section employée par tous les schémas de gaine
 *  circulaire : une extrémité coupée se dessine ondulée, jamais droite,
 *  une arête droite se lisant comme une gaine rectangulaire vue de profil. */
export function waveC(ax: number, ay: number, bx: number, by: number, amp = 10): string {
  const f = (v: number) => +v.toFixed(1)
  const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy) || 1
  const px = (-dy / len) * amp, py = (dx / len) * amp
  return `C ${f(ax+dx/3+px)} ${f(ay+dy/3+py)} ${f(ax+2*dx/3-px)} ${f(ay+2*dy/3-py)} ${bx} ${by}`
}
