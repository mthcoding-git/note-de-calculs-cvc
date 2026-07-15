import React from 'react'

// Symboles de synoptique ECS/EF/Chauffage — noirs, viewBox "-11 -11 22 22".
// Conventions ISO 14617 / usage bureaux d'études plomberie-CVC France.
export function AccessorySymbol({ type, counterAngle = 0 }: { type: string; counterAngle?: number }) {
  const C = '#000'
  switch (type) {

    // ── VANNE D'ARRÊT ────────────────────────────────────────────────────
    // Symbole papillon (bowtie) — standard français vanne d'isolement
    case 'vanne_arret':
      return (
        <>
          <polygon points="-6,-5.1 -6,5.1 0,0" fill={C} />
          <polygon points="6,-5.1 6,5.1 0,0" fill={C} />
        </>
      )

    // ── CLAPET ANTI-RETOUR ───────────────────────────────────────────────
    // Triangle plein (sens d'écoulement) + barre d'arrêt — ISO 14617
    case 'clapet_anti_retour':
      return (
        <>
          <polygon points="-6,-5 -6,5 5,0" fill={C} />
          <line x1={5} y1={-6} x2={5} y2={6} stroke={C} strokeWidth={1.6} strokeLinecap="round" />
        </>
      )

    // ── FILTRE À TAMIS ───────────────────────────────────────────────────
    // Symbole filtre en Y : corps vertical × 2 + canalisation + panier diagonal SE + bouchon
    case 'filtre_y':
      return (
        <>
          <line x1={-5} y1={0} x2={9} y2={0} stroke={C} strokeWidth={1.5} strokeLinecap="round" />
          <line x1={-5} y1={-3.5} x2={-5} y2={3.5} stroke={C} strokeWidth={1.4} strokeLinecap="round" />
          <line x1={9} y1={-3.5} x2={9} y2={3.5} stroke={C} strokeWidth={1.4} strokeLinecap="round" />
          <line x1={0} y1={0} x2={4.5} y2={4.5} stroke={C} strokeWidth={1.3} strokeLinecap="round" />
          <line x1={2.7} y1={6.3} x2={6.3} y2={2.7} stroke={C} strokeWidth={1.3} strokeLinecap="round" />
        </>
      )

    // ── MANOMÈTRE ────────────────────────────────────────────────────────
    // Cadran circulaire + aiguille + pivot central
    case 'manometre':
      return (
        <>
          <circle cx={0} cy={0} r={6.5} fill="none" stroke={C} strokeWidth={1.4} />
          <line x1={0} y1={0} x2={-3.5} y2={-4} stroke={C} strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={0} cy={0} r={1.2} fill={C} />
        </>
      )

    // ── THERMOMÈTRE ──────────────────────────────────────────────────────
    // Tige capillaire + bulbe réservoir + colonne de mercure
    case 'thermometre':
      return (
        <>
          <path d="M 1.5,1.3 A 3.5,3.5 0 1,1 -1.5,1.3"
            fill="none" stroke={C} strokeWidth={1.3} />
          <circle cx={0} cy={4.5} r={1.8} fill={C} />
          <path d="M -1.5,2 L -1.5,-6 A 1.5,2.5 0 0,1 1.5,-6 L 1.5,2"
            fill="none" stroke={C} strokeWidth={1.3} />
          <line x1={0} y1={4.5} x2={0} y2={-5}
            stroke={C} strokeWidth={1.1} strokeLinecap="round" />
        </>
      )

    // ── MITIGEUR THERMOSTATIQUE ──────────────────────────────────────────
    // Vanne mélangeuse 3 voies : triangle de convergence (EF + ECS → mitigé)
    // + connexions + bulbe thermostatique de régulation
    case 'mitigeur_thermo':
      return (
        <>
          <polygon points="-7,5 7,5 0,-3.5"
            fill="none" stroke={C} strokeWidth={1.4} />
          <line x1={-9} y1={5} x2={-7} y2={5}
            stroke={C} strokeWidth={1.4} strokeLinecap="round" />
          <line x1={7} y1={5} x2={9} y2={5}
            stroke={C} strokeWidth={1.4} strokeLinecap="round" />
          <line x1={0} y1={-3.5} x2={0} y2={-8}
            stroke={C} strokeWidth={1.4} strokeLinecap="round" />
          {/* Bulbe thermostatique (ajusté pour rester dans le viewBox ±11) */}
          <circle cx={0} cy={-8.8} r={1.8} fill={C} />
        </>
      )

    // ── VASE D'EXPANSION ─────────────────────────────────────────────────
    // Cercle + membrane diaphragme (ligne horizontale) + eau (vague basse)
    case 'vase_expansion':
      return (
        <>
          <circle cx={0} cy={0} r={6.5} fill="none" stroke={C} strokeWidth={1.4} />
          <line x1={-6.5} y1={0} x2={6.5} y2={0} stroke={C} strokeWidth={1.2} />
          {/* Vague eau (Bézier quadratique — courbe sinusoïdale lisse) */}
          <path d="M-5,3 Q-2.5,0.5 0,3 Q2.5,5.5 5.8,3"
            fill="none" stroke={C} strokeWidth={1.2} />
        </>
      )

    // ── PURGEUR D'AIR ────────────────────────────────────────────────────
    // Capsule carrée (tête) + corps arrondi + embout bas — silhouette purgeur automatique
    case 'purgeur_air':
      return (
        <>
          <rect x={-2} y={-7.5} width={4} height={3} rx={1} fill="none" stroke={C} strokeWidth={1.2} />
          <rect x={-4.5} y={-4.5} width={9} height={9} rx={2} fill="none" stroke={C} strokeWidth={1.3} />
        </>
      )

    // ── ROBINET DE VIDANGE ───────────────────────────────────────────────
    // Corps vanne (triangle) + col + bec de vidange descendant
    case 'robinet_vidange':
      return (
        <>
          <polygon points="-5,-5 -5,5 3,0" fill={C} />
          <line x1={3} y1={0} x2={3} y2={6}
            stroke={C} strokeWidth={1.3} strokeLinecap="round" />
          <polygon points="0,6 6,6 3,10" fill={C} />
        </>
      )

    // ── DISCONNECTEUR (BA/CA) ─────────────────────────────────────────────
    // Corps rectangulaire + 2 clapets anti-retour dans le même sens (droite)
    // + drain central court — ISO 14617
    case 'disconnecteur':
      return (
        <>
          {/* Ligne tuyauterie — limitée au rectangle, sans dépassement */}
          <line x1={-9} y1={0} x2={9} y2={0} stroke={C} strokeWidth={1.4} />
          {/* Corps */}
          <rect x={-9} y={-4} width={18} height={8} rx={1}
            fill="none" stroke={C} strokeWidth={1.4} />
          {/* Clapet gauche — triangle pointant droite + barre (ne touche pas le rectangle) */}
          <polygon points="-5.5,-2.8 -5.5,2.8 -1.5,0" fill={C} />
          <line x1={-1.5} y1={-2} x2={-1.5} y2={2} stroke={C} strokeWidth={1.5} strokeLinecap="round" />
          {/* Clapet droit — triangle pointant droite + barre (ne touche pas le rectangle) */}
          <polygon points="1.5,-2.8 1.5,2.8 5.5,0" fill={C} />
          <line x1={5.5} y1={-2} x2={5.5} y2={2} stroke={C} strokeWidth={1.5} strokeLinecap="round" />
          {/* Drain central — raccourci */}
          <line x1={0} y1={4} x2={0} y2={7} stroke={C} strokeWidth={1.4} strokeLinecap="round" />
        </>
      )

    // ── RÉDUCTEUR DE PRESSION ────────────────────────────────────────────
    // Corps rectangulaire + axe + ressort stylisé — synoptique hydraulique/CVC
    case 'reducteur_pression':
      return (
        <>
          {/* Corps rectangulaire — straddling the pipe (y=0) */}
          <rect x={-5} y={-3} width={10} height={6} rx={0.5}
            fill="none" stroke={C} strokeWidth={1.3} />
          {/* Axe vertical centré */}
          <line x1={0} y1={-3} x2={0} y2={-5}
            stroke={C} strokeWidth={1.2} strokeLinecap="round" />
          {/* Ressort stylisé */}
          <polyline
            points="0,-5 -2,-6 2,-7 -2,-8 2,-9 0,-10"
            fill="none" stroke={C} strokeWidth={1.2}
            strokeLinejoin="round" strokeLinecap="round"
          />
        </>
      )

    // ── COMPTEUR D'EAU ───────────────────────────────────────────────────
    // Cercle + lettre C toujours verticale (counterAngle annule la rotation du tronçon)
    case 'compteur_eau':
      return (
        <>
          <circle cx={0} cy={0} r={6.5} fill="none" stroke={C} strokeWidth={1.4} />
          <text x={0} y={3.5} textAnchor="middle" fontSize="10" fontWeight="700"
            fontFamily="sans-serif" fill={C}
            transform={`rotate(${counterAngle})`}>C</text>
        </>
      )

    // ── BALLON ANTI-BÉLIER ───────────────────────────────────────────────
    // Sphère de pression (absorbeur de coups de bélier) + col de connexion
    // + membrane interne (air / eau)
    case 'ballon_anti_belier':
      return (
        <>
          <line x1={0} y1={-9} x2={0} y2={-4.5}
            stroke={C} strokeWidth={1.4} strokeLinecap="round" />
          <circle cx={0} cy={1} r={5.5} fill="none" stroke={C} strokeWidth={1.4} />
          <line x1={-5} y1={1} x2={5} y2={1} stroke={C} strokeWidth={1.2} />
        </>
      )

    // ── SOUPAPE DE SÉCURITÉ ──────────────────────────────────────────────
    // Branchement latéral (comme purgeur d'air) — triangle (siège/disque, décharge vers
    // le haut) + ressort taré en zigzag + chapeau/bonnet — ISO 14617 / P&ID standard
    case 'soupape_securite':
      return (
        <>
          {/* Triangle — base en bas (connexion tuyau), apex vers le haut (décharge) */}
          <polygon points="-4,4 4,4 0,-2" fill="none" stroke={C} strokeWidth={1.4} />
          {/* Ressort taré */}
          <polyline
            points="0,-2 -2,-3.5 2,-5 -2,-6.5 0,-8"
            fill="none" stroke={C} strokeWidth={1.2}
            strokeLinejoin="round" strokeLinecap="round"
          />
          {/* Chapeau / bonnet */}
          <line x1={-2.5} y1={-8} x2={2.5} y2={-8}
            stroke={C} strokeWidth={1.5} strokeLinecap="round" />
        </>
      )

    // ── POT À BOUES ──────────────────────────────────────────────────────
    // Capsule verticale allongée + brides (petits carrés pleins) au niveau du tronçon
    case 'pot_boues':
      return (
        <>
          {/* Corps capsule — allongé et étroit */}
          <rect x={-3.5} y={-8.5} width={7} height={18} rx={3.5}
            fill="none" stroke={C} strokeWidth={1.3} />
          {/* Raccord en tête (purgeur / évent) — y positif = sommet sur canvas (axe y inversé) */}
          <rect x={-2} y={9.5} width={4} height={1.5}
            fill="none" stroke={C} strokeWidth={1.2} />
          {/* Brides au niveau du tronçon (y=0) */}
          <rect x={-5.5} y={-1.5} width={2} height={3} fill={C} />
          <rect x={3.5} y={-1.5} width={2} height={3} fill={C} />
        </>
      )

    // ── COMPTEUR D'ÉNERGIE THERMIQUE ─────────────────────────────────────
    // Cercle + lettre E toujours verticale (counterAngle annule la rotation du tronçon)
    case 'compteur_energie':
      return (
        <>
          <circle cx={0} cy={0} r={6.5} fill="none" stroke={C} strokeWidth={1.4} />
          <text x={0} y={3.5} textAnchor="middle" fontSize="10" fontWeight="700"
            fontFamily="sans-serif" fill={C}
            transform={`rotate(${counterAngle})`}>E</text>
        </>
      )

    // ── POMPE (usage interne — placée via bouton dédié) ──────────────────
    case 'pompe':
      return (
        <>
          <circle cx={0} cy={0} r={6} fill="none" stroke={C} strokeWidth={1.4} />
          <polygon points="-2.5,-3.5 -2.5,3.5 3.5,0" fill={C} />
        </>
      )

    default:
      return null
  }
}

export function AccessoryPreview({ type, size = 28 }: { type: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-11 -11 22 22">
      <AccessorySymbol type={type} />
    </svg>
  )
}
