export type TerminalFroidType =
  | 'ventiloconvecteur'
  | 'poutre-froide-active'
  | 'poutre-froide-passive'
  | 'dalle-froide'
  | 'batterie-froide-cta'

export interface TerminalFroidDef {
  id: TerminalFroidType
  label: string
  deltaTDefault: number    // ΔT eau entrée/sortie (°C)
  T_entreeDefault: number  // T° entrée terminal par défaut (°C)
  T_sortieDefault: number  // T° sortie terminal par défaut (°C)
}

export interface CustomTerminalFroidDef {
  id: string
  label: string
  deltaTDefault: number
  T_entreeDefault: number
  T_sortieDefault: number
}

export const TERMINAL_FROID_TYPES: TerminalFroidDef[] = [
  { id: 'ventiloconvecteur',     label: 'Ventilo-convecteur',    deltaTDefault: 5, T_entreeDefault: 7,  T_sortieDefault: 12 },
  { id: 'poutre-froide-active',  label: 'Poutre froide active',  deltaTDefault: 3, T_entreeDefault: 14, T_sortieDefault: 17 },
  { id: 'poutre-froide-passive', label: 'Poutre froide passive', deltaTDefault: 3, T_entreeDefault: 14, T_sortieDefault: 17 },
  { id: 'dalle-froide',          label: 'Dalle froide',          deltaTDefault: 4, T_entreeDefault: 15, T_sortieDefault: 19 },
  { id: 'batterie-froide-cta',   label: 'Batterie froide CTA',   deltaTDefault: 5, T_entreeDefault: 7,  T_sortieDefault: 12 },
]
