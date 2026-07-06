export type EmetteurType =
  | 'radiateur-ht'
  | 'radiateur-bt'
  | 'plancher-chauffant'
  | 'plafond-chauffant'
  | 'ventilo-convecteur'
  | 'aerotherme'
  | 'batterie-chaude-cta'

export interface EmetteurDef {
  id: EmetteurType
  label: string
  deltaTDefault: number  // ΔT eau aller/retour (°C)
}

export const EMETTEUR_TYPES: EmetteurDef[] = [
  { id: 'radiateur-ht',        label: 'Radiateur HT',         deltaTDefault: 20 },
  { id: 'radiateur-bt',        label: 'Radiateur BT',          deltaTDefault: 10 },
  { id: 'plancher-chauffant',  label: 'Plancher chauffant',    deltaTDefault: 7  },
  { id: 'plafond-chauffant',   label: 'Plafond chauffant',     deltaTDefault: 5  },
  { id: 'ventilo-convecteur',  label: 'Ventilo-convecteur',    deltaTDefault: 10 },
  { id: 'aerotherme',          label: 'Aérotherme',            deltaTDefault: 15 },
  { id: 'batterie-chaude-cta', label: 'Batterie chaude CTA',   deltaTDefault: 15 },
]
