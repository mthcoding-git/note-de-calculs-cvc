// Accessoires de synoptique — purement visuels.
// La liste affichée dans la palette dépend du mode actif (voir Toolbar.tsx).
export interface AccessoryType {
  id: string
  label: string
}

export const ACCESSORY_TYPES: AccessoryType[] = [
  // ── ECS (alimentation + bouclage) ───────────────────────────────────
  { id: 'vanne_arret',        label: 'Vanne d\'arrêt' },
  { id: 'clapet_anti_retour', label: 'Clapet anti-retour' },
  { id: 'filtre_y',           label: 'Filtre à tamis' },
  { id: 'manometre',          label: 'Manomètre' },
  { id: 'thermometre',        label: 'Thermomètre' },
{ id: 'vase_expansion',     label: 'Vase d\'expansion' },
  { id: 'purgeur_air',        label: 'Purgeur d\'air' },
  { id: 'robinet_vidange',    label: 'Robinet de vidange' },
  // ── EF (alimentation) ───────────────────────────────────────────────
  { id: 'disconnecteur',      label: 'Disconnecteur (BA/CA)' },
  { id: 'reducteur_pression', label: 'Réducteur de pression' },
  { id: 'compteur_eau',       label: 'Compteur d\'eau' },
  { id: 'ballon_anti_belier', label: 'Ballon anti-bélier' },
  // ── Interne (placé via bouton dédié, pas dans la palette) ───────────
  { id: 'pompe',              label: 'Pompe / circulateur' },
]
