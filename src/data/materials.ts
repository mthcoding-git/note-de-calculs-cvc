export const DEFAULT_MATERIALS = [
  {
    id: 'galvanized_steel',
    name: 'Acier galvanisé',
    enabled: false,
    lambda: 50,
    epsilon: 0.00015, // rugosité (m) pour Colebrook-White — acier galvanisé
    minDi: 16.1, // NF DTU 60.11 — min. DN 15 (di=16,1 mm)
    dns: [
      { dn: 'DN15',  di: 16.1, de: 21.3 },
      { dn: 'DN20',  di: 21.7, de: 26.9 },
      { dn: 'DN25',  di: 27.3, de: 33.7 },
      { dn: 'DN32',  di: 35.9, de: 42.4 },
      { dn: 'DN40',  di: 41.9, de: 48.3 },
      { dn: 'DN50',  di: 53.1, de: 60.3 },
      { dn: 'DN65',  di: 68.9, de: 76.1 },
      { dn: 'DN80',  di: 82.5, de: 88.9 },
      { dn: 'DN100', di: 107.1, de: 114.3 },
      { dn: 'DN125', di: 131.7, de: 139.7 },
      { dn: 'DN150', di: 155.1, de: 165.1 },
    ],
  },
  {
    id: 'stainless',
    name: 'Acier inoxydable',
    enabled: false,
    lambda: 15,
    epsilon: 0.000045, // rugosité (m) — acier inoxydable poli
    minDi: 12,   // NF DTU 60.11 — autres matériaux : di ≥ 12 mm
    // Dimensions selon NF EN 10312 (tubes soudés à paroi mince, usage sanitaire/ECS)
    dns: [
      { dn: 'DN15',  di: 19.3, de: 21.3 },
      { dn: 'DN20',  di: 24.9, de: 26.9 },
      { dn: 'DN25',  di: 31.3, de: 33.7 },
      { dn: 'DN32',  di: 39.4, de: 42.4 },
      { dn: 'DN40',  di: 45.3, de: 48.3 },
      { dn: 'DN50',  di: 57.3, de: 60.3 },
      { dn: 'DN65',  di: 72.1, de: 76.1 },
      { dn: 'DN80',  di: 84.9, de: 88.9 },
      { dn: 'DN100', di: 110.3, de: 114.3 },
    ],
  },
  {
    id: 'black_steel',
    name: 'Acier noir',
    enabled: false,
    lambda: 50,
    epsilon: 0.000046, // rugosité (m) — acier noir commercial
    minDi: 16.1, // NF EN 10255 — série moyenne, même référence que galvanisé
    // Dimensions selon NF EN 10255 — série moyenne (même que galvanisé, sans zingage)
    dns: [
      { dn: 'DN15',  di: 16.1, de: 21.3 },
      { dn: 'DN20',  di: 21.7, de: 26.9 },
      { dn: 'DN25',  di: 27.3, de: 33.7 },
      { dn: 'DN32',  di: 35.9, de: 42.4 },
      { dn: 'DN40',  di: 41.9, de: 48.3 },
      { dn: 'DN50',  di: 53.1, de: 60.3 },
      { dn: 'DN65',  di: 68.9, de: 76.1 },
      { dn: 'DN80',  di: 82.5, de: 88.9 },
      { dn: 'DN100', di: 107.1, de: 114.3 },
      { dn: 'DN125', di: 131.7, de: 139.7 },
      { dn: 'DN150', di: 155.1, de: 165.1 },
    ],
  },
  {
    id: 'copper',
    name: 'Cuivre',
    enabled: false,
    lambda: 380,
    epsilon: 0.0000015, // rugosité (m) — cuivre
    minDi: 12,   // NF DTU 60.11 — min. 14×1 (di=12 mm)
    dns: [
      { dn: '10×1',   di: 8.0,  de: 10.0 },
      { dn: '12×1',   di: 10.0, de: 12.0 },
      { dn: '14×1',   di: 12.0, de: 14.0 },
      { dn: '15×1',   di: 13.0, de: 15.0 },
      { dn: '18×1',   di: 16.0, de: 18.0 },
      { dn: '22×1',   di: 20.0, de: 22.0 },
      { dn: '28×1',   di: 26.0, de: 28.0 },
      { dn: '35×1.5', di: 32.0, de: 35.0 },
      { dn: '42×1.5', di: 39.0, de: 42.0 },
      { dn: '54×2',   di: 50.0, de: 54.0 },
      { dn: '64×2',   di: 60.0, de: 64.0 },
      { dn: '76.1×2', di: 72.1, de: 76.1 },
    ],
  },
  {
    id: 'multilayer',
    name: 'Multicouche (PEX-AL-PEX)',
    enabled: false,
    lambda: 0.45,
    epsilon: 0.000007, // rugosité (m) — multicouche
    minDi: 12,   // NF DTU 60.11 — autres matériaux : di ≥ 12 mm
    // Dimensions selon NF EN ISO 21003 — e totale paroi PE+Al+PE
    dns: [
      { dn: '14×2',   di: 10.0, de: 14.0 },
      { dn: '16×2',   di: 12.0, de: 16.0 },
      { dn: '20×2',   di: 16.0, de: 20.0 },
      { dn: '25×2.5', di: 20.0, de: 25.0 },
      { dn: '32×3',   di: 26.0, de: 32.0 },
      { dn: '40×3.5', di: 33.0, de: 40.0 },
      { dn: '50×4',   di: 42.0, de: 50.0 },
      { dn: '63×4',   di: 55.0, de: 63.0 },
    ],
  },
  {
    id: 'pb',
    name: 'PB (polybutylène)',
    enabled: false,
    lambda: 0.22,
    epsilon: 0.00001, // rugosité (m) — plastique lisse
    minDi: 13,   // NF DTU 60.11 — min. DN 16 − 16×1,5 (di=13 mm)
    dns: [
      { dn: 'DN16', di: 12.0, de: 16.0 },
      { dn: 'DN20', di: 15.4, de: 20.0 },
      { dn: 'DN25', di: 19.4, de: 25.0 },
      { dn: 'DN32', di: 24.8, de: 32.0 },
      { dn: 'DN40', di: 31.0, de: 40.0 },
      { dn: 'DN50', di: 38.8, de: 50.0 },
    ],
  },
  {
    id: 'pert',
    name: 'PE-RT (type II)',
    enabled: false,
    lambda: 0.38,
    epsilon: 0.00001, // rugosité (m) — plastique lisse
    minDi: 13,   // NF DTU 60.11 — autres matériaux : di ≥ 12 mm ; 16×1,5 → di=13 mm
    // Dimensions selon NF EN ISO 22391-2 — SDR 11 (PN6 à 70°C)
    dns: [
      { dn: '16×1.5', di: 13.0, de: 16.0 },
      { dn: '20×1.9', di: 16.2, de: 20.0 },
      { dn: '25×2.3', di: 20.4, de: 25.0 },
      { dn: '32×3',   di: 26.0, de: 32.0 },
      { dn: '40×3.7', di: 32.6, de: 40.0 },
      { dn: '50×4.6', di: 40.8, de: 50.0 },
      { dn: '63×5.8', di: 51.4, de: 63.0 },
    ],
  },
  {
    id: 'pe100',
    name: 'PE100 / HDPE',
    enabled: false,
    lambda: 0.40,
    epsilon: 0.00001, // rugosité (m) — plastique lisse
    minDi: 16.2, // 20×1,9 → di=16,2 mm (plus petite taille courante en bâtiment)
    // Dimensions selon NF EN 12201-2 — SDR 11 (PN16 à 20°C, EF uniquement)
    dns: [
      { dn: '20×1.9',   di: 16.2,  de: 20.0  },
      { dn: '25×2.3',   di: 20.4,  de: 25.0  },
      { dn: '32×3',     di: 26.0,  de: 32.0  },
      { dn: '40×3.7',   di: 32.6,  de: 40.0  },
      { dn: '50×4.6',   di: 40.8,  de: 50.0  },
      { dn: '63×5.8',   di: 51.4,  de: 63.0  },
      { dn: '75×6.8',   di: 61.4,  de: 75.0  },
      { dn: '90×8.2',   di: 73.6,  de: 90.0  },
      { dn: '110×10',   di: 90.0,  de: 110.0 },
      { dn: '125×11.4', di: 102.2, de: 125.0 },
      { dn: '160×14.6', di: 130.8, de: 160.0 },
    ],
  },
  {
    id: 'per',
    name: 'PER / PEX',
    enabled: false,
    lambda: 0.40,
    epsilon: 0.00001, // rugosité (m) — plastique lisse
    minDi: 13,   // NF DTU 60.11 — min. DN 16 − 16×1,5 (di=13 mm)
    dns: [
      { dn: 'DN16', di: 13.0, de: 16.0 },
      { dn: 'DN20', di: 16.2, de: 20.0 },
      { dn: 'DN25', di: 20.4, de: 25.0 },
      { dn: 'DN32', di: 26.2, de: 32.0 },
      { dn: 'DN40', di: 33.0, de: 40.0 },
      { dn: 'DN50', di: 41.4, de: 50.0 },
    ],
  },
  {
    id: 'lead',
    name: 'Plomb',
    enabled: false,
    lambda: 35,
    epsilon: 0.0000015, // rugosité (m) — plomb laminé
    minDi: 8,
    // Dimensions selon NF A 43-013 (retirée) — désignation par diamètre intérieur
    dns: [
      { dn: 'Ø8',  di: 8.0,  de: 12.0 },
      { dn: 'Ø10', di: 10.0, de: 14.0 },
      { dn: 'Ø12', di: 12.0, de: 16.0 },
      { dn: 'Ø15', di: 15.0, de: 20.0 },
      { dn: 'Ø18', di: 18.0, de: 23.0 },
      { dn: 'Ø22', di: 22.0, de: 28.0 },
      { dn: 'Ø28', di: 28.0, de: 35.0 },
      { dn: 'Ø35', di: 35.0, de: 43.0 },
    ],
  },
  {
    id: 'ppr',
    name: 'PPR PN20',
    enabled: false,
    lambda: 0.22,
    epsilon: 0.00001, // rugosité (m) — plastique lisse
    minDi: 12,   // NF DTU 60.11 — autres matériaux : di ≥ 12 mm
    // Dimensions selon NF EN ISO 15874-2 — SDR 6 (PN20 à 70°C)
    dns: [
      { dn: '20×3.4',   di: 13.2, de: 20.0  },
      { dn: '25×4.2',   di: 16.6, de: 25.0  },
      { dn: '32×5.4',   di: 21.2, de: 32.0  },
      { dn: '40×6.7',   di: 26.6, de: 40.0  },
      { dn: '50×8.4',   di: 33.2, de: 50.0  },
      { dn: '63×10.5',  di: 42.0, de: 63.0  },
      { dn: '75×12.5',  di: 50.0, de: 75.0  },
      { dn: '90×15',    di: 60.0, de: 90.0  },
      { dn: '110×18.4', di: 73.2, de: 110.0 },
    ],
  },
  {
    id: 'pvc_c',
    name: 'PVC-C',
    enabled: false,
    lambda: 0.14,
    epsilon: 0.00001, // rugosité (m) — plastique lisse
    minDi: 12.4, // NF DTU 60.11 — min. DN 16 (di=12,4 mm)
    dns: [
      { dn: 'DN16', di: 12.4, de: 16.0 },
      { dn: 'DN20', di: 15.6, de: 20.0 },
      { dn: 'DN25', di: 19.4, de: 25.0 },
      { dn: 'DN32', di: 25.0, de: 32.0 },
      { dn: 'DN40', di: 31.4, de: 40.0 },
      { dn: 'DN50', di: 38.6, de: 50.0 },
      { dn: 'DN63', di: 49.0, de: 63.0 },
    ],
  },
  {
    id: 'pvc_u',
    name: 'PVC-U rigide',
    enabled: false,
    lambda: 0.15,
    epsilon: 0.00001, // rugosité (m) — plastique lisse
    minDi: 13.0, // DN16 SDR 11 → di=13 mm
    // Dimensions selon NF EN ISO 1452-2 — SDR 11 (PN16 à 20°C, EF uniquement)
    dns: [
      { dn: 'DN16',  di: 13.0, de: 16.0  },
      { dn: 'DN20',  di: 16.2, de: 20.0  },
      { dn: 'DN25',  di: 20.4, de: 25.0  },
      { dn: 'DN32',  di: 26.0, de: 32.0  },
      { dn: 'DN40',  di: 32.6, de: 40.0  },
      { dn: 'DN50',  di: 40.8, de: 50.0  },
      { dn: 'DN63',  di: 51.4, de: 63.0  },
      { dn: 'DN75',  di: 61.4, de: 75.0  },
      { dn: 'DN90',  di: 73.6, de: 90.0  },
      { dn: 'DN110', di: 90.0, de: 110.0 },
    ],
  },
]
