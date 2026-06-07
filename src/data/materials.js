export const DEFAULT_MATERIALS = [
  {
    id: 'copper',
    name: 'Cuivre',
    enabled: false,
    lambda: 380,
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
    id: 'galvanized_steel',
    name: 'Acier galvanisé',
    enabled: false,
    lambda: 50,
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
    ],
  },
  {
    id: 'stainless',
    name: 'Acier inoxydable',
    enabled: false,
    lambda: 15,
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
    id: 'ppr',
    name: 'PPR PN20',
    enabled: false,
    lambda: 0.22,
    minDi: 12,   // NF DTU 60.11 — autres matériaux : di ≥ 12 mm
    // Dimensions selon NF EN ISO 15874-2 — SDR 6 (PN20 à 70°C)
    dns: [
      { dn: '20×3.4',  di: 13.2, de: 20.0 },
      { dn: '25×4.2',  di: 16.6, de: 25.0 },
      { dn: '32×5.4',  di: 21.2, de: 32.0 },
      { dn: '40×6.7',  di: 26.6, de: 40.0 },
      { dn: '50×8.4',  di: 33.2, de: 50.0 },
      { dn: '63×10.5', di: 42.0, de: 63.0 },
      { dn: '75×12.5', di: 50.0, de: 75.0 },
      { dn: '90×15',   di: 60.0, de: 90.0 },
      { dn: '110×18.4',di: 73.2, de: 110.0 },
    ],
  },
  {
    id: 'pvc_c',
    name: 'PVC-C',
    enabled: false,
    lambda: 0.14,
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
    id: 'per',
    name: 'PER / PEX',
    enabled: false,
    lambda: 0.40,
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
    id: 'pb',
    name: 'PB (polybutylène)',
    enabled: false,
    lambda: 0.22,
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
    id: 'multilayer',
    name: 'Multicouche (PEX-AL-PEX)',
    enabled: false,
    lambda: 0.45,
    minDi: 12,   // NF DTU 60.11 — autres matériaux : di ≥ 12 mm
    // Dimensions selon NF EN ISO 21003 — e totale paroi PE+Al+PE
    dns: [
      { dn: '14×2',  di: 10.0, de: 14.0 },
      { dn: '16×2',  di: 12.0, de: 16.0 },
      { dn: '20×2',  di: 16.0, de: 20.0 },
      { dn: '25×2.5',di: 20.0, de: 25.0 },
      { dn: '32×3',  di: 26.0, de: 32.0 },
      { dn: '40×3.5',di: 33.0, de: 40.0 },
      { dn: '50×4',  di: 42.0, de: 50.0 },
      { dn: '63×4',  di: 55.0, de: 63.0 },
    ],
  },
]
