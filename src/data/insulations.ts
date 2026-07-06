export const DEFAULT_INSULATIONS = [
  {
    // Couvertures flexibles — réf. : Spaceloft (Aspen Aerogels) / Cabot Thermal Wrap
    // Très haute performance — usage contraintes d'espace sévères
    // λ = 0,015 W/(m·K) · T_max 200 °C
    id: 'aerogel',
    name: 'Aérogel',
    enabled: false,
    lambda: 0.015,
    thicknesses: [5, 10, 15, 20],
  },
  {
    // Manchons souples cellules fermées — EN 14304
    // Réf. : Armaflex XG / Armaflex ACE (Armacell) · K-Flex ST (SAGI K-Flex)
    // Vapeur-étanche — ECS, climatisation, eau glacée — distribué Cedeo, Rexel, D&C
    // λ = 0,036 W/(m·K) à 40 °C · T_max 105 °C
    id: 'rubber_foam',
    name: 'Élastomère (Armaflex)',
    enabled: false,
    lambda: 0.036,
    thicknesses: [6, 9, 13, 19, 25, 32, 40],
  },
  {
    // Coquilles concentriques — EN 13162 — Incombustible A1
    // Réf. : Rockwool 800 / Rockwool 835 · K-Flex K-Rock ALU
    // ECS, chauffage, vapeur — distribué Cedeo, Rexel
    // λ = 0,035 W/(m·K) à 40 °C · T_max 600 °C
    id: 'rock_wool',
    name: 'Laine de roche',
    enabled: false,
    lambda: 0.035,
    thicknesses: [20, 25, 30, 40, 50, 60, 80, 100, 120],
  },
  {
    // Coquilles concentriques — EN 13162
    // Réf. : Isover PROTECT 1000S / U Protect Pipe Section ALU (Saint-Gobain)
    // ECS, chauffage — distribué Cedeo, Rexel, Saint-Gobain Distrib.
    // λ = 0,035 W/(m·K) à 40 °C · T_max 650 °C
    id: 'glass_wool',
    name: 'Laine de verre',
    enabled: false,
    lambda: 0.035,
    thicknesses: [20, 25, 30, 40, 50, 60, 80, 100, 120],
  },
  {
    // Matelas flexibles découpables — EN 14303
    // Réf. : Basotect G+ (BASF) — usage locaux techniques, gaines, robinetterie
    // Bonne absorption acoustique
    // λ = 0,036 W/(m·K) à 40 °C · T_max 240 °C
    id: 'melamine_foam',
    name: 'Mousse mélamine (Basotect)',
    enabled: false,
    lambda: 0.036,
    thicknesses: [13, 19, 25, 32, 40, 50],
  },
  {
    // Coquilles rigides — EN 14314
    // Réf. : Kingspan Kooltherm Pipe · Paroc Marine Section
    // Haute performance, faible épaisseur — ECS, chauffage, froid — distribué Rexel
    // λ = 0,023 W/(m·K) à 10 °C · T_max 110 °C
    id: 'phenolic',
    name: 'Mousse phénolique (Kooltherm)',
    enabled: false,
    lambda: 0.023,
    thicknesses: [15, 20, 25, 30, 40, 50],
  },
  {
    // Coquilles rigides — EN 14313
    // Réf. : Isopipe PU (Isover) · Corafoam (Recticel) · Armaflex PU (Armacell)
    // ECS, chauffage — bon rapport performance/prix
    // λ = 0,027 W/(m·K) · T_max 120 °C
    id: 'pu_foam',
    name: 'Mousse polyuréthane (PU)',
    enabled: false,
    lambda: 0.027,
    thicknesses: [20, 25, 30, 40, 50, 60],
  },
  {
    // Manchons souples cellules fermées — réf. : Tubolit DG / Tubolit S (Armacell)
    // Économique — plomberie, ECS basse température, protection antigel
    // Distribué Cedeo, Rexel, Bricorama — très courant en logement
    // λ = 0,040 W/(m·K) à 40 °C · T_max 80 °C
    id: 'pe_foam',
    name: 'Polyéthylène expansé (Tubolit)',
    enabled: false,
    lambda: 0.040,
    thicknesses: [6, 9, 13, 19, 25, 32],
  },
  {
    // Coquilles rigides — réf. : Kaimann PIR · Armaflex PIR (Armacell) · Paroc AluCoat T
    // Très haute performance — ECS, chauffage, froid industriel
    // λ = 0,025 W/(m·K) · T_max 130 °C
    id: 'pir',
    name: 'Polyisocyanurate (PIR)',
    enabled: false,
    lambda: 0.025,
    thicknesses: [20, 25, 30, 40, 50, 60],
  },
  {
    // Coquilles rigides — EN 13167 — Incombustible A1, vapeur-étanche
    // Réf. : Foamglas T3+ (Owens Corning/Pittsburgh Corning)
    // Process industriel, locaux à risque, gaines — usage spécialisé
    // λ = 0,040 W/(m·K) à 40 °C · T_max 430 °C
    id: 'cellular_glass',
    name: 'Verre cellulaire (Foamglas)',
    enabled: false,
    lambda: 0.040,
    thicknesses: [30, 40, 50, 60, 80, 100, 120],
  },
]
