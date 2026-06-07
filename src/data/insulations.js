export const DEFAULT_INSULATIONS = [
  {
    // Coquilles — EN 13162 — produit de référence : Isover PROTECT 1000S
    id: 'glass_wool',
    name: 'Laine de verre',
    enabled: false,
    lambda: 0.035,
    thicknesses: [20, 30, 40, 50, 60, 80, 100],
  },
  {
    // Coquilles — EN 13162 — produit de référence : Rockwool 800 / 835 (λ à 40°C)
    id: 'rock_wool',
    name: 'Laine de roche',
    enabled: false,
    lambda: 0.035,
    thicknesses: [20, 30, 40, 50, 60, 80, 100],
  },
  {
    // Coquilles — produit de référence : Isopipe PU, Armaflex PU
    id: 'pu_foam',
    name: 'Mousse polyuréthane (PU)',
    enabled: false,
    lambda: 0.028,
    thicknesses: [20, 30, 40, 50, 60, 80],
  },
  {
    // Manchons — EN 14304 — produit de référence : Armaflex AF / K-Flex ST (λ à 40°C)
    id: 'rubber_foam',
    name: 'Élastomère expansé (nitrile)',
    enabled: false,
    lambda: 0.040,
    thicknesses: [6, 10, 13, 19, 25, 32],
  },
  {
    // Manchons — produit de référence : Tubolit, Trocellen
    id: 'pe_foam',
    name: 'Polyéthylène expansé (PE)',
    enabled: false,
    lambda: 0.040,
    thicknesses: [6, 9, 13, 19, 25, 32],
  },
  {
    // Panneaux découpables — produit de référence : Basotect BASF
    id: 'melamine_foam',
    name: 'Mousse mélamine',
    enabled: false,
    lambda: 0.035,
    thicknesses: [13, 19, 25, 32, 40, 50],
  },
  {
    // Coquilles — produit de référence : Foamglas T3+ (λ à 40°C)
    // Incombustible A1, vapeur-étanche — usage en gaines, locaux à risque
    id: 'cellular_glass',
    name: 'Verre cellulaire',
    enabled: false,
    lambda: 0.040,
    thicknesses: [30, 40, 50, 60, 80, 100],
  },
  {
    // Matelas flexibles à enrouler — produit de référence : Spaceloft (Aspen Aerogels)
    id: 'aerogel',
    name: 'Aérogel',
    enabled: false,
    lambda: 0.015,
    thicknesses: [5, 10, 15, 20, 25, 30],
  },
]
