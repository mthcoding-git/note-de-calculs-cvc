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
  deltaTDefault: number   // ΔT eau aller/retour (°C) — conservé pour rétrocompat
  T_entreeDefault: number // T° entrée émetteur par défaut (°C)
  T_sortieDefault: number // T° sortie émetteur par défaut (°C)
}

export interface CustomEmetteurDef {
  id: string
  label: string
  deltaTDefault: number
  T_entreeDefault: number
  T_sortieDefault: number
}

export const EMETTEUR_TYPES: EmetteurDef[] = [
  { id: 'radiateur-ht',        label: 'Radiateur HT',         deltaTDefault: 20, T_entreeDefault: 70, T_sortieDefault: 50 },
  { id: 'radiateur-bt',        label: 'Radiateur BT',          deltaTDefault: 10, T_entreeDefault: 50, T_sortieDefault: 40 },
  { id: 'plancher-chauffant',  label: 'Plancher chauffant',    deltaTDefault: 7,  T_entreeDefault: 35, T_sortieDefault: 28 },
  { id: 'plafond-chauffant',   label: 'Plafond chauffant',     deltaTDefault: 5,  T_entreeDefault: 40, T_sortieDefault: 35 },
  { id: 'ventilo-convecteur',  label: 'Ventilo-convecteur',    deltaTDefault: 10, T_entreeDefault: 55, T_sortieDefault: 45 },
  { id: 'aerotherme',          label: 'Aérotherme',            deltaTDefault: 15, T_entreeDefault: 70, T_sortieDefault: 55 },
  { id: 'batterie-chaude-cta', label: 'Batterie chaude CTA',   deltaTDefault: 15, T_entreeDefault: 80, T_sortieDefault: 60 },
]
