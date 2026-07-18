// Bibliothèque d'isolants pour les réseaux d'eau glacée (EG) en circuit fermé.
// Température de fonctionnement : 6–12 °C (départ/retour).
//
// Différences vs bibliothèque partagée :
//   - λ mesurés à 0 °C (température proche de la paroi EG) et non à 40 °C.
//     Les isolants sont en général plus performants à froid : gain 5–12 %.
//   - Épaisseurs calées sur les préconisations EG (arrêté du 3 mai 2007, COSTIC,
//     RE2020) et les réalités de chantier. Les très faibles épaisseurs (6–9 mm)
//     n'ont pas leur place sur un réseau EG (condensation assurée).
//   - Ordre : alphabétique par nom de matériau.

export const DEFAULT_INSULATIONS_EAU_GLACEE = [

  // ────────────────────────────────────────────────────────────────────────
  // AÉROGEL — couvertures flexibles
  // Réf. terrain : Spaceloft (Aspen Aerogels) · Cabot Thermal Wrap
  // Utilisé ponctuellement sur l'EG pour les espaces très contraints
  // (passages de gaines serrés, manchettes de robinetterie).
  // λ = 0,013 W/(m·K) à 0 °C.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'aerogel',
    name: 'Aérogel',
    enabled: false,
    lambda: 0.013,
    thicknesses: [10, 15, 20, 25],
  },

  // ────────────────────────────────────────────────────────────────────────
  // ÉLASTOMÈRE NITRILE — EN 14304 — cellules fermées
  // Réf. terrain : Armaflex XG / ACE (Armacell) · K-Flex ST / HT (SAGI K-Flex)
  // LE matériau de référence EG : vapeur-étanche intrinsèque, flexible,
  // facile à poser sur robinetterie. Présent sur la quasi-totalité des
  // installations EG en France (résidentiel à grand tertiaire).
  // λ = 0,033 W/(m·K) à 0 °C — certifié Armacell/SAGI à froid.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'rubber_foam',
    name: 'Élastomère (Armaflex / K-Flex)',
    enabled: false,
    lambda: 0.033,
    thicknesses: [13, 19, 25, 32, 40, 50],
  },

  // ────────────────────────────────────────────────────────────────────────
  // LAINE DE ROCHE — EN 13162 — coquilles concentriques — Incombustible A1
  // Réf. terrain : Rockwool 800 / 835 · K-Flex K-Rock ALU
  // Utilisée sur les grosses canalisations EG (DN80+) en locaux techniques,
  // gaines et faux-plafonds. Toujours avec parement aluminium (barrière vapeur).
  // λ = 0,031 W/(m·K) à 0 °C.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'rock_wool',
    name: 'Laine de roche (+BV alu)',
    enabled: false,
    lambda: 0.031,
    thicknesses: [25, 30, 40, 50, 60, 80, 100],
  },

  // ────────────────────────────────────────────────────────────────────────
  // LAINE DE VERRE — EN 13162 — coquilles concentriques
  // Réf. terrain : Isover PROTECT 1000S · U Protect Pipe Section ALU
  // Même usage que la laine de roche pour l'EG : gros DN en locaux techniques.
  // Toujours avec parement aluminium (barrière vapeur obligatoire pour l'EG).
  // λ = 0,031 W/(m·K) à 0 °C.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'glass_wool',
    name: 'Laine de verre (+BV alu)',
    enabled: false,
    lambda: 0.031,
    thicknesses: [25, 30, 40, 50, 60, 80, 100],
  },

  // ────────────────────────────────────────────────────────────────────────
  // MOUSSE PHÉNOLIQUE — EN 14314 — coquilles rigides
  // Réf. terrain : Kingspan Kooltherm Pipe · Paroc Marine Section
  // Haute performance — permet des épaisseurs réduites à performance égale.
  // Utilisé sur les EG tertiaires et industriels exigeants.
  // Nécessite une barrière vapeur externe (alu ou PVC) pour l'EG.
  // λ = 0,021 W/(m·K) à 0 °C.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'phenolic',
    name: 'Mousse phénolique (Kooltherm)',
    enabled: false,
    lambda: 0.021,
    thicknesses: [15, 20, 25, 30, 40, 50],
  },

  // ────────────────────────────────────────────────────────────────────────
  // MOUSSE POLYURÉTHANE (PU) — EN 14313 — coquilles rigides
  // Réf. terrain : Isopipe PU (Isover) · Corafoam (Recticel)
  // Présent sur les EG collectifs et petits tertiaires.
  // Nécessite barrière vapeur externe (feuille alu ou gaine PVC).
  // λ = 0,025 W/(m·K) à 0 °C.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'pu_foam',
    name: 'Mousse polyuréthane (PU)',
    enabled: false,
    lambda: 0.025,
    thicknesses: [20, 25, 30, 40, 50, 60],
  },

  // ────────────────────────────────────────────────────────────────────────
  // POLYÉTHYLÈNE EXPANSÉ — cellules fermées
  // Réf. terrain : Tubolit DG / Tubolit S (Armacell) · K-Flex PE (SAGI)
  // Utilisé sur les installations EG résidentielles et secondaires :
  // raccordements de ventiloconvecteurs, poutres froides petites sections.
  // Semi-étanche à la vapeur — isolation complémentaire souvent nécessaire.
  // λ = 0,038 W/(m·K) à 0 °C.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'pe_foam',
    name: 'Polyéthylène expansé (Tubolit)',
    enabled: false,
    lambda: 0.038,
    thicknesses: [9, 13, 19, 25, 32],
  },

  // ────────────────────────────────────────────────────────────────────────
  // POLYISOCYANURATE (PIR) — coquilles rigides
  // Réf. terrain : Kaimann PIR · Armaflex PIR (Armacell) · Paroc AluCoat T
  // Bon rapport performance/prix, très répandu sur les EG tertiaires.
  // Le revêtement aluminium intégré sert souvent de barrière vapeur.
  // λ = 0,022 W/(m·K) à 0 °C.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'pir',
    name: 'Polyisocyanurate (PIR)',
    enabled: false,
    lambda: 0.022,
    thicknesses: [20, 25, 30, 40, 50, 60],
  },

  // ────────────────────────────────────────────────────────────────────────
  // VERRE CELLULAIRE — EN 13167 — Incombustible A1, vapeur-étanche
  // Réf. terrain : Foamglas T3+ (Owens Corning / Pittsburgh Corning)
  // Utilisé en EG industriel, process et locaux à risque. Perméabilité
  // vapeur nulle → barrière vapeur intrinsèque. Coût élevé.
  // λ = 0,040 W/(m·K) — stable sur toute la plage de température.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'cellular_glass',
    name: 'Verre cellulaire (Foamglas)',
    enabled: false,
    lambda: 0.040,
    thicknesses: [40, 50, 60, 80, 100, 120],
  },
]
