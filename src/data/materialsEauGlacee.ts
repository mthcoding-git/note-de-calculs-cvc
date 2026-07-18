// Bibliothèque de matériaux pour les réseaux d'eau glacée (EG) en circuit fermé.
// Température nominale : 6/12 °C (départ/retour). Pression maximale courante : 6–10 bar.
//
// Contenu : matériaux réellement rencontrés sur les installations EG en France,
// du résidentiel au grand tertiaire (neuf et rénovation).

export const DEFAULT_MATERIALS_EAU_GLACEE = [

  // ────────────────────────────────────────────────────────────────────────
  // ACIER GALVANISÉ — NF EN 10255:2004 série M (moyenne)
  // Très répandu sur les installations existantes (avant 2000) et encore posé
  // dans certains chantiers pour l'EG, notamment en rénovation. Déconseillé
  // pour les circuits fermés (risque de dézincification et dépôts), mais
  // présent sur un grand nombre de réseaux en exploitation.
  // ε = 0,15 mm — revêtement zinc.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'galvanized_steel',
    name: 'Acier galvanisé',
    enabled: false,
    lambda: 50,
    epsilon: 0.00015,
    minDi: 12.5,
    dns: [
      { dn: 'DN10',  di: 12.5,  de: 17.2  },
      { dn: 'DN15',  di: 16.1,  de: 21.3  },
      { dn: 'DN20',  di: 21.7,  de: 26.9  },
      { dn: 'DN25',  di: 27.3,  de: 33.7  },
      { dn: 'DN32',  di: 35.9,  de: 42.4  },
      { dn: 'DN40',  di: 41.9,  de: 48.3  },
      { dn: 'DN50',  di: 53.1,  de: 60.3  },
      { dn: 'DN65',  di: 68.9,  de: 76.1  },
      { dn: 'DN80',  di: 82.5,  de: 88.9  },
      { dn: 'DN100', di: 107.1, de: 114.3 },
      { dn: 'DN125', di: 131.7, de: 139.7 },
      { dn: 'DN150', di: 155.1, de: 165.1 },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // ACIER INOXYDABLE — NF EN 10312:2002 — tubes soudés à paroi mince
  // Présent dans les installations sensibles : hôpitaux, salles blanches,
  // agroalimentaire, data centers. Résistant aux condensats.
  // Séries austénitiques 304 / 316L.
  // ε = 0,045 mm.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'stainless',
    name: 'Acier inoxydable',
    enabled: false,
    lambda: 15,
    epsilon: 0.000045,
    minDi: 15.2,
    dns: [
      { dn: 'DN10',  di: 15.2,  de: 17.2  },
      { dn: 'DN15',  di: 19.3,  de: 21.3  },
      { dn: 'DN20',  di: 24.9,  de: 26.9  },
      { dn: 'DN25',  di: 31.3,  de: 33.7  },
      { dn: 'DN32',  di: 39.4,  de: 42.4  },
      { dn: 'DN40',  di: 45.3,  de: 48.3  },
      { dn: 'DN50',  di: 57.3,  de: 60.3  },
      { dn: 'DN65',  di: 72.1,  de: 76.1  },
      { dn: 'DN80',  di: 84.9,  de: 88.9  },
      { dn: 'DN100', di: 110.3, de: 114.3 },
      { dn: 'DN125', di: 135.7, de: 139.7 },
      { dn: 'DN150', di: 161.1, de: 165.1 },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // ACIER NOIR — NF EN 10255:2004 série M (moyenne)
  // Matériau dominant pour les réseaux EG collectif et tertiaire.
  // Raccordement par soudure (grands DN) ou filetage (petits DN).
  // ε = 0,046 mm — acier commercial neuf.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'black_steel',
    name: 'Acier noir',
    enabled: false,
    lambda: 50,
    epsilon: 0.000046,
    minDi: 12.5,
    dns: [
      { dn: 'DN10',  di: 12.5,  de: 17.2  },
      { dn: 'DN15',  di: 16.1,  de: 21.3  },
      { dn: 'DN20',  di: 21.7,  de: 26.9  },
      { dn: 'DN25',  di: 27.3,  de: 33.7  },
      { dn: 'DN32',  di: 35.9,  de: 42.4  },
      { dn: 'DN40',  di: 41.9,  de: 48.3  },
      { dn: 'DN50',  di: 53.1,  de: 60.3  },
      { dn: 'DN65',  di: 68.9,  de: 76.1  },
      { dn: 'DN80',  di: 82.5,  de: 88.9  },
      { dn: 'DN100', di: 107.1, de: 114.3 },
      { dn: 'DN125', di: 131.7, de: 139.7 },
      { dn: 'DN150', di: 155.1, de: 165.1 },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // CUIVRE — NF EN 1057:2006+A1:2010 — tubes ronds sans soudure
  // Très courant en résidentiel et petit collectif pour l'EG : ventiloconvecteurs,
  // poutres froides, CTA. Raccordement par brasage ou sertissage.
  // ε = 0,0015 mm — cuivre écroui, paroi très lisse.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'copper',
    name: 'Cuivre',
    enabled: false,
    lambda: 380,
    epsilon: 0.0000015,
    minDi: 8.0,
    dns: [
      { dn: '10×1',     di: 8.0,   de: 10.0  },
      { dn: '12×1',     di: 10.0,  de: 12.0  },
      { dn: '14×1',     di: 12.0,  de: 14.0  },
      { dn: '15×1',     di: 13.0,  de: 15.0  },
      { dn: '18×1',     di: 16.0,  de: 18.0  },
      { dn: '22×1',     di: 20.0,  de: 22.0  },
      { dn: '28×1',     di: 26.0,  de: 28.0  },
      { dn: '35×1.5',   di: 32.0,  de: 35.0  },
      { dn: '42×1.5',   di: 39.0,  de: 42.0  },
      { dn: '54×2',     di: 50.0,  de: 54.0  },
      { dn: '64×2',     di: 60.0,  de: 64.0  },
      { dn: '76.1×2',   di: 72.1,  de: 76.1  },
      { dn: '88.9×2.5', di: 83.9,  de: 88.9  },
      { dn: '108×2.5',  di: 103.0, de: 108.0 },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // MULTICOUCHE (PEX-AL-PEX) — NF EN ISO 21003:2008 type V
  // Courant en résidentiel et petit tertiaire pour l'EG. La couche aluminium
  // constitue une barrière vapeur, ce qui limite la condensation externe.
  // Raccordement par sertissage. Gamme limitée aux petits diamètres.
  // ε = 0,007 mm — paroi plastique lisse.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'multilayer',
    name: 'Multicouche (PEX-AL-PEX)',
    enabled: false,
    lambda: 0.45,
    epsilon: 0.000007,
    minDi: 10.0,
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

  // ────────────────────────────────────────────────────────────────────────
  // PE-RT (TYPE II) — NF EN ISO 22391-2 — série SDR 11
  // Présent sur les raccordements de ventiloconvecteurs, poutres froides
  // et CTA. Convient parfaitement aux températures EG (6–14 °C).
  // ε = 0,010 mm — plastique lisse.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'pert',
    name: 'PE-RT (type II)',
    enabled: false,
    lambda: 0.38,
    epsilon: 0.00001,
    minDi: 13.0,
    dns: [
      { dn: '16×1.5', di: 13.0, de: 16.0  },
      { dn: '20×1.9', di: 16.2, de: 20.0  },
      { dn: '25×2.3', di: 20.4, de: 25.0  },
      { dn: '32×3',   di: 26.0, de: 32.0  },
      { dn: '40×3.7', di: 32.6, de: 40.0  },
      { dn: '50×4.6', di: 40.8, de: 50.0  },
      { dn: '63×5.8', di: 51.4, de: 63.0  },
      { dn: '75×6.8', di: 61.4, de: 75.0  },
      { dn: '90×8.2', di: 73.6, de: 90.0  },
      { dn: '110×10', di: 90.0, de: 110.0 },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // PEHD PE100 SDR17 (PN10 à 20 °C) — NF EN ISO 4427-2:2007
  // Rencontré sur les réseaux EG primaires (de la chaufferie aux sous-stations)
  // et dans les grandes installations tertiaires / industrielles.
  // PN10 suffisant pour les pressions de bâtiment. Paroi lisse, sans corrosion.
  // ε = 0,010 mm. λ = 0,40 W/(m·K). Notation : de × e_min (SDR17 = de/e).
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'pehd_sdr17',
    name: 'PEHD PE100 SDR17 (PN10)',
    enabled: false,
    lambda: 0.40,
    epsilon: 0.00001,
    minDi: 17.6,
    dns: [
      { dn: '20×1.2',   di: 17.6,  de: 20.0  },
      { dn: '25×1.5',   di: 22.0,  de: 25.0  },
      { dn: '32×1.9',   di: 28.2,  de: 32.0  },
      { dn: '40×2.4',   di: 35.2,  de: 40.0  },
      { dn: '50×2.9',   di: 44.2,  de: 50.0  },
      { dn: '63×3.8',   di: 55.4,  de: 63.0  },
      { dn: '75×4.5',   di: 66.0,  de: 75.0  },
      { dn: '90×5.4',   di: 79.2,  de: 90.0  },
      { dn: '110×6.6',  di: 96.8,  de: 110.0 },
      { dn: '125×7.4',  di: 110.2, de: 125.0 },
      { dn: '140×8.3',  di: 123.4, de: 140.0 },
      { dn: '160×9.5',  di: 141.0, de: 160.0 },
      { dn: '180×10.7', di: 158.6, de: 180.0 },
      { dn: '200×11.9', di: 176.2, de: 200.0 },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // PER / PEX — NF EN ISO 15875-2 — série SDR 11
  // Même usage que le PE-RT pour les raccordements de terminaux EG.
  // Très répandu pour les distributions secondaires et les dérivations.
  // ε = 0,010 mm — plastique lisse.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'per',
    name: 'PER / PEX',
    enabled: false,
    lambda: 0.40,
    epsilon: 0.00001,
    minDi: 13.0,
    dns: [
      { dn: '16×1.5', di: 13.0, de: 16.0  },
      { dn: '20×1.9', di: 16.2, de: 20.0  },
      { dn: '25×2.3', di: 20.4, de: 25.0  },
      { dn: '32×3',   di: 26.0, de: 32.0  },
      { dn: '40×3.7', di: 32.6, de: 40.0  },
      { dn: '50×4.6', di: 40.8, de: 50.0  },
      { dn: '63×5.8', di: 51.4, de: 63.0  },
      { dn: '75×6.8', di: 61.4, de: 75.0  },
      { dn: '90×8.2', di: 73.6, de: 90.0  },
      { dn: '110×10', di: 90.0, de: 110.0 },
    ],
  },

  // ────────────────────────────────────────────────────────────────────────
  // PPR PN10 — NF EN ISO 15874-2:2013 — série SDR 11
  // Version adaptée à l'eau froide / EG : paroi plus fine que le PN20,
  // section d'écoulement plus grande à diamètre extérieur égal.
  // Présent sur les installations neuves de distribution EG en résidentiel
  // et petit tertiaire.
  // ε = 0,010 mm — plastique lisse.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'ppr_pn10',
    name: 'PPR PN10 (SDR11)',
    enabled: false,
    lambda: 0.22,
    epsilon: 0.00001,
    minDi: 13.0,
    dns: [
      { dn: '16×1.5',   di: 13.0,  de: 16.0  },
      { dn: '20×1.9',   di: 16.2,  de: 20.0  },
      { dn: '25×2.3',   di: 20.4,  de: 25.0  },
      { dn: '32×2.9',   di: 26.2,  de: 32.0  },
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

  // ────────────────────────────────────────────────────────────────────────
  // PPR PN20 — NF EN ISO 15874-2:2013 — série SDR 6
  // Souvent posé pour l'EG par les installateurs qui utilisent le même
  // matériau pour les circuits chauffage et refroidissement. Techniquement
  // compatible avec l'EG (surdimensionné en pression). Paroi plus épaisse
  // que le PN10 → section d'écoulement réduite à diamètre extérieur égal.
  // ε = 0,010 mm — plastique lisse.
  // ────────────────────────────────────────────────────────────────────────
  {
    id: 'ppr',
    name: 'PPR PN20 (SDR6)',
    enabled: false,
    lambda: 0.22,
    epsilon: 0.00001,
    minDi: 10.6,
    dns: [
      { dn: '16×2.7',   di: 10.6,  de: 16.0  },
      { dn: '20×3.4',   di: 13.2,  de: 20.0  },
      { dn: '25×4.2',   di: 16.6,  de: 25.0  },
      { dn: '32×5.4',   di: 21.2,  de: 32.0  },
      { dn: '40×6.7',   di: 26.6,  de: 40.0  },
      { dn: '50×8.4',   di: 33.2,  de: 50.0  },
      { dn: '63×10.5',  di: 42.0,  de: 63.0  },
      { dn: '75×12.5',  di: 50.0,  de: 75.0  },
      { dn: '90×15',    di: 60.0,  de: 90.0  },
      { dn: '110×18.4', di: 73.2,  de: 110.0 },
      { dn: '125×20.8', di: 83.4,  de: 125.0 },
      { dn: '160×26.7', di: 106.6, de: 160.0 },
    ],
  },
]
