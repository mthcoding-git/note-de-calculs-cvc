import type { Material } from '../types'

const EPS = 0.15  // rugosité absolue (mm) — acier galvanisé

function circ(dn: number, e: number) {
  return { dn: `Ø${dn}`, di: dn, de: dn + 2 * e }
}

function rect(a: number, b: number) {
  const dh = Math.round(2 * a * b / (a + b))
  return { dn: `${a}×${b}`, a, b, dh, di: dh, de: dh + 1.0 }
}

export const DEFAULT_MATERIALS_VENTILATION: Material[] = [
  {
    id: 'gaine_acier_spirale',
    name: 'Acier galvanisé spiralé',
    shapeType: 'circular',
    enabled: true,
    lambda: 50,
    epsilon: EPS,
    dns: [
      circ(100, 0.4), circ(125, 0.4), circ(140, 0.4), circ(160, 0.4),
      circ(180, 0.5), circ(200, 0.5), circ(224, 0.5), circ(250, 0.5),
      circ(280, 0.5), circ(315, 0.5),
      circ(355, 0.6), circ(400, 0.6), circ(450, 0.6), circ(500, 0.6),
      circ(560, 0.6), circ(630, 0.6),
      circ(710, 0.8), circ(800, 0.8),
    ],
  },
  {
    id: 'gaine_acier_rect',
    name: 'Acier galvanisé rectangulaire',
    shapeType: 'rectangular',
    enabled: true,
    lambda: 50,
    epsilon: EPS,
    dns: [
      // 100 mm de hauteur
      rect(100, 100), rect(150, 100), rect(200, 100), rect(250, 100), rect(300, 100),
      // 150 mm de hauteur
      rect(150, 150), rect(200, 150), rect(250, 150), rect(300, 150), rect(400, 150),
      // 200 mm de hauteur
      rect(200, 200), rect(250, 200), rect(300, 200), rect(400, 200), rect(500, 200), rect(600, 200),
      // 250 mm de hauteur
      rect(250, 250), rect(300, 250), rect(400, 250), rect(500, 250), rect(600, 250),
      // 300 mm de hauteur
      rect(300, 300), rect(400, 300), rect(500, 300), rect(600, 300), rect(800, 300),
      // 400 mm de hauteur
      rect(400, 400), rect(500, 400), rect(600, 400), rect(800, 400), rect(1000, 400),
      // 500 mm de hauteur
      rect(500, 500), rect(600, 500), rect(800, 500), rect(1000, 500),
      // 600 mm de hauteur
      rect(600, 600), rect(800, 600), rect(1000, 600),
      // Grandes sections
      rect(800, 800), rect(1000, 800), rect(1200, 800),
      rect(1000, 1000), rect(1200, 1000),
    ],
  },
]
