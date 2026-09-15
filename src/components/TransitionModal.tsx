import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  TRANSITION_LABELS, computeXiTransition, transitionAngles,
  isThreeSided, isElbow310, isPyramidal, isStepped, refIsDownstream,
  LH47_MIN, LH47_MAX, matchTransition, newTransitionId,
  type TransitionType, type VentNodeTransition, type TransitionShape,
} from '../utils/transitionCalc'
import { waveC } from '../utils/schemaDraw'
import { NumInput } from './NumInput'

// Libellés courts pour les cartes, sur deux lignes comme celles des coudes
const CARD_LABELS: Record<TransitionType, string[]> = {
  'trans-4-1-div':  ['Circulaire', 'symétrique'],
  'trans-4-1-conv': ['Circulaire', 'symétrique'],
  'trans-4-2-div':  ['Rectangulaire', 'symétrique'],
  'trans-4-2-conv': ['Rectangulaire', 'symétrique'],
  'trans-4-3-div':  ['Rectangulaire', '3 côtés droits'],
  'trans-4-3-conv': ['Rectangulaire', '3 côtés droits'],
  'trans-3-10-div':  ['Coudée 90°', 'rectangulaire'],
  'trans-3-10-conv': ['Coudée 90°', 'rectangulaire'],
  'trans-4-4-div':   ['Rectangulaire', 'pyramidale'],
  'trans-4-4-conv':  ['Rectangulaire', 'pyramidale'],
  'trans-ed42-div':  ['Circulaire →', 'rectangulaire'],
  'trans-ed42-conv': ['Circulaire →', 'rectangulaire'],
  'trans-er43-div':  ['Rectangulaire →', 'circulaire'],
  'trans-er43-conv': ['Rectangulaire →', 'circulaire'],
  'trans-4-7':       ['Conique à', 'décrochement'],
}

interface ViewDim {
  d0: number; d1: number
  lettre:  string           // lettre cotée en amont
  lettre1: string           // lettre cotée en aval — elle en diffère si la forme change
  fixe:    string | null    // dimension vue de chant, rappelée en légende
  vue:     string | null    // plan de coupe du schéma
}

/** Dimension vue dans le plan du schéma : le diamètre en circulaire, le côté qui
 *  varie en rectangulaire. L'autre côté est vu de chant et ne se dessine pas,
 *  d'où le rappel en légende — conservé pour les 4-2 / 4-3 / 3-10, variable lui
 *  aussi pour la pyramide du 4-4, où le schéma ne montre donc qu'un des deux
 *  plans. Le plan de coupe suit le côté dessiné : la largeur se voit de dessus,
 *  la hauteur de profil, comme pour les coudes rectangulaires. */
function viewDim(s0: TransitionShape, s1: TransitionShape): ViewDim {
  const mm = (v: number) => `${Math.round(v)} mm`
  if (s0.shape === 'circular' && s1.shape === 'circular') {
    return { d0: s0.d_mm, d1: s1.d_mm, lettre: 'D', lettre1: 'D', fixe: null, vue: null }
  }
  if (s0.shape === 'rectangular' && s1.shape === 'rectangular') {
    // Pyramide : les deux côtés varient, le schéma passe en volume. La face avant
    // porte la hauteur, les fuyantes portent la largeur — il n'y a plus ni plan
    // de coupe à annoncer, ni dimension à rappeler en légende : tout est coté sur
    // le dessin.
    if (Math.abs(s0.h_mm - s1.h_mm) >= 0.5 && Math.abs(s0.l_mm - s1.l_mm) >= 0.5) {
      return { d0: s0.h_mm, d1: s1.h_mm, lettre: 'H', lettre1: 'H', vue: null, fixe: null }
    }
    return Math.abs(s0.l_mm - s1.l_mm) >= 0.5
      ? { d0: s0.l_mm, d1: s1.l_mm, lettre: 'L', lettre1: 'L',
          fixe: `H₀ = H₁ = ${mm(s0.h_mm)}`, vue: 'Vue de dessus' }
      : { d0: s0.h_mm, d1: s1.h_mm, lettre: 'H', lettre1: 'H',
          fixe: `L₀ = L₁ = ${mm(s0.l_mm)}`, vue: 'Vue de profil' }
  }
  // Changement de forme : la coupe montre le diamètre d'un côté, la hauteur de
  // l'autre. La largeur du rectangle, vue de chant, passe en légende.
  const rect = s0.shape === 'rectangular' ? s0 : s1
  return {
    d0: s0.shape === 'circular' ? s0.d_mm : s0.h_mm,
    d1: s1.shape === 'circular' ? s1.d_mm : s1.h_mm,
    lettre:  s0.shape === 'circular' ? 'D' : 'H',
    lettre1: s1.shape === 'circular' ? 'D' : 'H',
    fixe: rect.shape === 'rectangular' ? `L = ${mm(rect.l_mm)}` : null,
    vue: 'Vue de profil',
  }
}

// ── Schéma ASHRAE 4-1 / 4-2 — transition concentrique, vue de profil ─────────
// Gaine amont horizontale à gauche, cône, gaine aval à droite.
// θ est l'angle total entre les deux parois — les tables montent à 180°, qui est
// le changement de section brusque. La longueur du cône n'est donc pas libre :
//   L = |d₁ − d₀| / (2·tan(θ/2)),  nulle à 180°.
// Elle est calculée sur les dimensions *dessinées*, ce qui garde l'angle tracé
// exactement égal à θ même quand leur rapport est borné.
function SchemaTransition({ mini, type, s0, s1, theta, v0_ms, lCone_mm, lRatio }: {
  mini?: boolean; type: TransitionType
  s0: TransitionShape; s1: TransitionShape; theta: number
  v0_ms?: number | null
  lCone_mm?: number | null       // 4-7 : longueur de la partie conique, à coter
  lRatio?: number | null         // 4-7 : l rapporté à son maximum géométrique
}) {
  const f = (v: number) => +v.toFixed(1)

  // Chaque extrémité se coupe selon sa propre forme : le 4-5 raccorde justement
  // une gaine ronde à une gaine rectangulaire.
  const round0 = s0.shape === 'circular', round1 = s1.shape === 'circular'
  const asym  = isThreeSided(type)
  const { d0: D0_mm, d1: D1_mm, lettre, lettre1 } = viewDim(s0, s1)
  const big = Math.max(D0_mm, D1_mm), small = Math.min(D0_mm, D1_mm)
  // Rapport réel, borné des deux côtés : à A₀/A₁ = 0,06 la petite gaine ne serait
  // qu'un trait, et à sections presque égales la transition elle-même
  // disparaîtrait, avec sa cote d'angle. Le schéma illustre la pièce, il n'est
  // pas à l'échelle — l'angle tracé, lui, vaut toujours exactement θ.
  const ratio = big > 0 ? Math.min(0.82, Math.max(1 / 3, small / big)) : 1
  const Hbig = 100, Hsml = 100 * ratio
  const H0 = D0_mm >= D1_mm ? Hbig : Hsml
  const H1 = D1_mm >= D0_mm ? Hbig : Hsml

  // Longueur imposée par l'angle. Elle diffère selon la pièce : le 4-1/4-2
  // reprend la variation par deux parois symétriques, le 4-3 par une seule, qui
  // doit donc reprendre toute la différence — d'où tan θ au lieu de 2·tan(θ/2).
  const thMax = asym ? 90 : 180
  const th  = Math.max(1, Math.min(thMax, theta)) * Math.PI / 180
  // Plafonnée : le 4-7 descend à 0°, où la formule diverge. Le plafond ne mord
  // pas pour les autres pièces, dont l'angle minimal est 10°.
  const Lc  = theta >= thMax - 0.5 ? 0
    : Math.min(420, Math.abs(H1 - H0) / (asym ? Math.tan(th) : 2 * Math.tan(th / 2)))
  const arm = 70
  // 4-7 : la pièce est un décrochement suivi d'un cône. À l maximal le cône
  // reprend toute la différence de section et ses parois rejoignent les extrémités
  // de la limite amont ; en deçà, le reste est repris par le décrochement.
  const stepped = isStepped(type)
  const rho   = stepped ? Math.max(0, Math.min(1, lRatio ?? 1)) : 1
  const Lcone = Lc * rho                       // longueur dessinée du cône
  const H0c   = stepped ? H1 + rho * (H0 - H1) : H0   // hauteur à l'entrée du cône
  const x1 = arm, x2 = arm + Lcone, xEnd = x2 + arm

  // Parois. En 4-3 trois côtés restent droits : la paroi haute est commune aux
  // deux gaines, c'est la basse qui s'incline, et la gaine n'est donc plus
  // centrée sur l'axe du dessin.
  const yt0 = asym ? -Hbig / 2 : -H0 / 2
  const yt1 = asym ? -Hbig / 2 : -H1 / 2
  const yb0 = yt0 + H0
  const yb1 = yt1 + H1
  const yAx = (yt0 + yb0) / 2                 // axe de la gaine amont

  // La cote de l se loge au-dessus de la gaine : elle demande sa propre marge
  // haute, que le cadrage réserve d'ordinaire entièrement en bas.
  const coteL = !mini && lCone_mm != null && lCone_mm > 0 && Lcone > 0.5
  const annL = mini ? 0 : 62, annR = mini ? 0 : 62
  const annV = mini ? 4 : coteL ? 34 : 10
  const contentW = annL + xEnd + annR
  const contentH = Hbig + 2 * annV
  const VW = 500, M = 16
  // Cadre ajusté à l'élancement du contenu : il varie fortement avec θ, d'un
  // rapport 1,6:1 à 180° jusqu'à 5:1 aux petits angles.
  const VH = Math.max(150, Math.min(420, (VW - 2 * M) * contentH / contentW + 2 * M))
  const scl = Math.min((VW - 2 * M) / contentW, (VH - 2 * M) / contentH)
  const tx = M + ((VW - 2 * M) - contentW * scl) / 2 + annL * scl
  const ty = M + ((VH - 2 * M) - contentH * scl) / 2 + (Hbig / 2 + (coteL ? 34 : 0)) * scl
  const vx = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy = (wy: number) => +(ty + wy * scl).toFixed(1)
  const sw = mini ? f(0.05 * Hbig * scl) : 3

  // Silhouette fermée : paroi haute de gauche à droite, extrémité aval, paroi
  // basse en retour, extrémité amont. En circulaire les deux extrémités sont
  // des coupes de gaine ronde : elles se dessinent ondulées, une arête droite se
  // lisant justement comme une gaine rectangulaire vue de profil.
  const cut = (x: number, ya: number, yb: number, H: number, rd: boolean) => rd
    ? waveC(vx(x), vy(ya), vx(x), vy(yb), 0.125 * H * scl)
    : `L ${vx(x)} ${vy(yb)}`
  const d = [
    `M ${vx(0)} ${vy(yt0)}`,
    `L ${vx(x1)} ${vy(yt0)}`,
    ...(stepped ? [`L ${vx(x1)} ${vy(-H0c / 2)}`] : []),
    `L ${vx(x2)} ${vy(yt1)}`,
    `L ${vx(xEnd)} ${vy(yt1)}`,
    cut(xEnd, yt1, yb1, H1, round1),
    `L ${vx(x2)} ${vy(yb1)}`,
    ...(stepped ? [`L ${vx(x1)} ${vy(H0c / 2)}`] : []),
    `L ${vx(x1)} ${vy(yb0)}`,
    `L ${vx(0)} ${vy(yb0)}`,
    cut(0, yb0, yt0, H0, round0),
    'Z',
  ].join(' ')

  // Arc de l'angle : tendu d'une paroi à l'autre, bombé vers la grande section
  // — à droite en divergent, à gauche en convergent, ce qui fait basculer seul
  // le sens de l'arc. Un arc centré sur le sommet du cône serait d'autant plus
  // courbé que θ est grand, au point de déborder les deux limites ; ici la
  // flèche reste faible quel que soit θ.
  // La corde est reculée d'une flèche pour que le sommet du bombement — donc le
  // label de l'angle — tombe pile au milieu des deux lignes de limite.
  // À 180° le cône est de longueur nulle : les deux limites se confondent et les
  // parois sont les deux faces verticales du ressaut, donc alignées. La cote se
  // réduit alors au segment droit qui les joint, à mi-hauteur du ressaut — un
  // arc n'aurait plus de sens — et le label se centre sur ce segment, son halo
  // blanc l'interrompant proprement.
  // L'arc de l'angle se mesure sur la partie conique seule : c'est H0c, et non la
  // section amont, qui en est l'entrée.
  const hasCone = Math.abs(H0c - H1) > 1e-9
  const abrupt  = Lcone <= 0.5
  const dir     = H1 > H0c ? 1 : -1
  const wallY = (x: number) => abrupt ? (H0c + H1) / 4
    : H0c / 2 + (x - x1) / Lcone * (H1 / 2 - H0c / 2)
  const xm   = (x1 + x2) / 2
  const sagM = 0.24 * wallY(xm)                        // flèche de l'arc
  const sag  = abrupt ? sagM : Math.min(sagM, 0.35 * Lcone)
  const xc   = abrupt ? x1 : xm - dir * sag            // abscisse de la corde
  const yw   = wallY(xc)                               // demi-hauteur à la corde
  const xLbl = abrupt ? xc : xc + dir * sag            // sommet du bombement
  const rArc = (yw * yw + sag * sag) / (2 * sag)
  // Tangente en bas de l'arc, dirigée vers l'extérieur : elle porte les pointes
  // de flèche. L'échelle étant uniforme, la direction se transpose telle quelle
  // du monde au viewBox. À 180° la cote est droite : la tangente est verticale.
  const tAx  = rArc - sag                              // composante axiale
  const tLen = Math.hypot(yw, tAx) || 1
  const uX   = abrupt ? 0 : -dir * yw / tLen
  const uY   = abrupt ? 1 : tAx / tLen

  // Cote d'angle du 4-3 : θ se mesure entre le seul côté incliné et la direction
  // du conduit, pas entre deux parois. L'arc est donc centré sur le sommet où la
  // paroi quitte la gaine amont, entre le prolongement droit de celle-ci —
  // rappelé en pointillé — et la paroi inclinée.
  const aWdx = Lc, aWdy = yb1 - yb0
  const aWl  = Math.hypot(aWdx, aWdy) || 1
  const aWx  = aWdx / aWl, aWy = aWdy / aWl
  const aSgn = aWdy > 0 ? 1 : -1
  // Rayon de l'arc. Son ouverture vaut θ : à angle fermé, un rayon fixe donnerait
  // un arc plus court que ses deux pointes de flèche, qui se recouvriraient. On
  // s'éloigne donc du sommet à mesure que θ diminue, pour viser une longueur
  // d'arc constante à l'écran. L'arc doit rester entre les deux lignes de limite,
  // ce qui le borne à la longueur du cône — sauf à 90°, où celle-ci est nulle :
  // il n'y a plus d'intervalle, et c'est alors la paroi qui borne.
  const aArcPx = 52                                    // longueur d'arc visée
  const aMax   = Lc > 0.5 ? Math.min(0.80 * Lc, 0.92 * aWl) : 0.92 * aWl
  const rA     = Math.min(aMax, Math.max(0.16 * Hbig, aArcPx / scl / th))
  // Pointes réduites si l'arc est court, pour qu'elles ne se recouvrent jamais.
  const aBarb  = Math.min(7, 0.34 * rA * th * scl)
  const aBx  = 1 + aWx, aBy = aWy                      // bissectrice du secteur
  const aBl  = Math.hypot(aBx, aBy) || 1
  // Label posé au-delà de l'arc, sur la bissectrice : 26 unités de viewBox de
  // dégagement, converties en unités monde puisque le placement l'est.
  const aLd  = rA + 26 / scl


  const ann = '#64748b'
  // Vitesse amont portée par le label de la flèche. Elle doit tenir dans la
  // gaine amont, sans mordre sur la cote D₀ à gauche ni sur le cône à droite :
  // on réduit le corps du texte, puis on passe à deux lignes lorsqu'une seule
  // deviendrait illisible — ce qui n'arrive qu'aux cônes très allongés, où le
  // dessin est fortement réduit.
  const v0Val  = v0_ms != null && isFinite(v0_ms)
    ? `${v0_ms.toFixed(2).replace('.', ',')} m/s` : null
  const fsFor  = (n: number) => (x1 - 4) * scl / (0.55 * n)
  const v0One  = v0Val ? `V₀ = ${v0Val}` : 'V₀'
  const v0Lines = v0Val && fsFor(v0One.length) < 9 ? ['V₀', v0Val] : [v0One]
  const v0Fs   = Math.max(8.5, Math.min(13, fsFor(Math.max(...v0Lines.map(s => s.length)))))
  const v0x    = vx(arm * 0.46)

  // Pointe de flèche en (X, Y), ouverte vers l'arrière du sens de progression
  // (ux, uy) — même dessin que les cotes de rayon des coudes.
  const barb = (X: number, Y: number, ux: number, uy: number, aw = 7, aa = Math.PI / 6) => {
    const bx = -ux, by = -uy
    const p = (s: number) => [
      +(X + aw * (bx * Math.cos(s) - by * Math.sin(s))).toFixed(1),
      +(Y + aw * (bx * Math.sin(s) + by * Math.cos(s))).toFixed(1),
    ]
    const [a1x, a1y] = p(aa), [a2x, a2y] = p(-aa)
    return <>
      <line x1={X} y1={Y} x2={a1x} y2={a1y} stroke={ann} strokeWidth="1.2" strokeLinecap="round" />
      <line x1={X} y1={Y} x2={a2x} y2={a2y} stroke={ann} strokeWidth="1.2" strokeLinecap="round" />
    </>
  }

  const cote = (x: number, yT: number, yB: number, side: -1 | 1, txt: string) => {
    const xd = x + side * 14, ym = vy((yT + yB) / 2)
    const xt = +(vx(xd) + side * 15).toFixed(1)
    return <>
      <line x1={vx(x + side * 6)} y1={vy(yT)} x2={vx(x + side * 22)} y2={vy(yT)}
        stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={vx(x + side * 6)} y1={vy(yB)} x2={vx(x + side * 22)} y2={vy(yB)}
        stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={vx(xd)} y1={vy(yT)} x2={vx(xd)} y2={vy(yB)}
        stroke={ann} strokeWidth="1" strokeLinecap="round" />
      <text x={xt} y={ym} fontSize="13" fill={ann}
        textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
        paintOrder="stroke" stroke="white" strokeWidth="4"
        transform={`rotate(-90, ${xt}, ${ym})`}>{txt}</text>
    </>
  }

  return (
    <svg viewBox={`0 0 ${VW} ${f(VH)}`} width="100%" height="100%"
      style={{ display: 'block' }} overflow="visible">
      <path d={d} fill="#f1f5f9" stroke="#374151" strokeWidth={sw}
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Limites de la transition — début et fin du cône */}
      <line x1={vx(x1)} y1={vy(yt0)} x2={vx(x1)} y2={vy(yb0)}
        stroke="#cbd5e1" strokeWidth="1.2" strokeLinecap="round" />
      <line x1={vx(x2)} y1={vy(yt1)} x2={vx(x2)} y2={vy(yb1)}
        stroke="#cbd5e1" strokeWidth="1.2" strokeLinecap="round" />
      {!mini && <>
        {/* Angle θ — 4-1/4-2 : arc d'une paroi à l'autre, bombement au milieu des
            limites, segment droit à 180° où les parois sont alignées.
            4-3 : arc au sommet, entre le prolongement droit et le côté incliné. */}
        {hasCone && asym && (<>
          <line x1={vx(x1)} y1={vy(yb0)} x2={vx(x1 + rA + 10 / scl)} y2={vy(yb0)}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
          <path d={`M ${vx(x1 + rA)} ${vy(yb0)} A ${f(rA * scl)} ${f(rA * scl)} 0 0 ${aSgn > 0 ? 1 : 0} ${vx(x1 + rA * aWx)} ${vy(yb0 + rA * aWy)}`}
            stroke={ann} strokeWidth="1.2" fill="none" strokeLinecap="round" />
          {barb(vx(x1 + rA), vy(yb0), 0, -aSgn, aBarb)}
          {barb(vx(x1 + rA * aWx), vy(yb0 + rA * aWy),
                aSgn > 0 ? -aWy : aWy, aSgn > 0 ? aWx : -aWx, aBarb)}
          <text x={vx(x1 + aLd * aBx / aBl)} y={vy(yb0 + aLd * aBy / aBl)}
            fontSize="13" fill={ann}
            textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
            paintOrder="stroke" stroke="white" strokeWidth="4">θ = {theta}°</text>
        </>)}
        {hasCone && !asym && (<>
          {abrupt
            ? <line x1={vx(xc)} y1={vy(-yw)} x2={vx(xc)} y2={vy(yw)}
                stroke={ann} strokeWidth="1.2" strokeLinecap="round" />
            : <path d={`M ${vx(xc)} ${vy(-yw)} A ${f(rArc * scl)} ${f(rArc * scl)} 0 0 ${dir > 0 ? 1 : 0} ${vx(xc)} ${vy(yw)}`}
                stroke={ann} strokeWidth="1.2" fill="none" strokeLinecap="round" />}
          {barb(vx(xc), vy(-yw), uX, -uY)}
          {barb(vx(xc), vy(+yw), uX, +uY)}
          <text x={vx(xLbl)} y={vy(0)} fontSize="13" fill={ann}
            textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
            paintOrder="stroke" stroke="white" strokeWidth="4">θ = {theta}°</text>
        </>)}
        {/* Sens d'écoulement — de gauche à droite, sur l'axe de la gaine amont.
            Le fût s'arrête à la base du triangle, sans le traverser. */}
        <line x1={vx(14)} y1={vy(yAx)} x2={vx(arm * 0.52)} y2={vy(yAx)}
          stroke={ann} strokeWidth="1.5" />
        <path d={`M ${vx(arm * 0.72)} ${vy(yAx)} L ${vx(arm * 0.52)} ${vy(yAx - 7)} L ${vx(arm * 0.52)} ${vy(yAx + 7)} Z`}
          fill={ann} />
        <text x={v0x} y={f(vy(yAx) - 14 - (v0Lines.length - 1) * 0.55 * v0Fs)} fontSize={f(v0Fs)}
          fill={ann} textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
          paintOrder="stroke" stroke="white" strokeWidth="4">
          {v0Lines.map((s, i) => (
            <tspan key={i} x={v0x} dy={i === 0 ? 0 : f(1.1 * v0Fs)}>{s}</tspan>
          ))}
        </text>
        {/* Longueur de la partie conique : l se mesure entre les deux limites */}
        {coteL && (() => {
          const ym = vy(-Hbig / 2 - 14)
          return <>
            <line x1={vx(x1)} y1={vy(-Hbig / 2 - 6)} x2={vx(x1)} y2={vy(-Hbig / 2 - 22)}
              stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(x2)} y1={vy(-Hbig / 2 - 6)} x2={vx(x2)} y2={vy(-Hbig / 2 - 22)}
              stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(x1)} y1={ym} x2={vx(x2)} y2={ym}
              stroke={ann} strokeWidth="1" strokeLinecap="round" />
            <text x={vx((x1 + x2) / 2)} y={f(ym - 16)} fontSize="13" fill={ann}
              textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">
              l = {Math.round(lCone_mm!)} mm
            </text>
          </>
        })()}
        {cote(0, yt0, yb0, -1, `${lettre}₀ = ${Math.round(D0_mm)} mm`)}
        {cote(xEnd, yt1, yb1, 1, `${lettre1}₁ = ${Math.round(D1_mm)} mm`)}
      </>}
    </svg>
  )
}

// ── Schéma ASHRAE 4-4 — transition pyramidale, vue en volume ─────────────────
// Construit autour de l'axe : quatre sections rectangulaires centrées dessus —
// les deux extrémités et les deux limites du tronc — que les arêtes relient.
//
// Le dessin ne cherche pas à mesurer θ, mais à ce que **les deux cotes d'angle
// s'accordent**. La longueur du tronc suit θ seul, l'évasement en largeur suit le
// vrai rapport L₀:L₁, et l'évasement en hauteur est résolu pour que l'ouverture
// apparente de la face du dessus égale celle de la face avant. Sans cela la
// longueur, calculée sur la seule hauteur, rendait la face avant juste et celle
// du dessus quelconque — les deux arcs affichaient le même angle en en montrant
// deux différents.
function SchemaPyramid44({ mini, s0, s1, theta, v0_ms }: {
  mini?: boolean; s0: TransitionShape; s1: TransitionShape
  theta: number; v0_ms?: number | null
}) {
  const f = (v: number) => +v.toFixed(1)
  if (s0.shape !== 'rectangular' || s1.shape !== 'rectangular') return null
  const H0m = s0.h_mm, H1m = s1.h_mm, L0m = s0.l_mm, L1m = s1.l_mm

  // Élancement largeur/hauteur visé, comprimé par une racine : c'est le cadrage
  // d'ensemble, indépendant des rapports entre sections.
  const asp = Math.min(1.7, Math.max(0.75,
    Math.sqrt(Math.max(L0m, L1m) / Math.max(H0m, H1m))))
  const hMid = 46, dMidT = 46 * asp

  // Longueur du tronc : pilotée par l'angle seul, nulle à 180° où les deux
  // sections centrales se confondent.
  const th  = Math.max(1, Math.min(180, theta)) * Math.PI / 180
  const Lc  = Math.min(230, 22 / Math.tan(th / 2))
  const abrupt = Lc <= 0.5
  const arm = 70
  const iA = 30 * Math.PI / 180, cA = Math.cos(iA), sA = Math.sin(iA)
  const sH = H1m >= H0m ? 1 : -1
  const ang2 = (ax: number, ay: number, bx: number, by: number) => {
    const n = Math.hypot(ax, ay) * Math.hypot(bx, by) || 1
    return Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / n)))
  }
  /** Ouverture apparente de la face avant moins celle du dessus, pour un
   *  évasement donné en profondeur et en hauteur. Les deux arêtes de la face
   *  avant partagent leur portée horizontale a, celles du dessus vont de a à b. */
  const gapOf = (dd: number, dh: number) => {
    const a = Lc + dd * cA, b = Lc - dd * cA, s = dd * sA
    return ang2(a, -dh + s, a, dh + s) - ang2(a, -dh + s, b, -dh - s)
  }

  // Les deux rapports H₀:H₁ et L₀:L₁ sont respectés à l'échelle près. Il reste
  // une inconnue — l'échelle relative des largeurs — et c'est elle qui absorbe
  // la contrainte d'égalité des deux arcs. Une solution existe toujours : à
  // profondeur nulle seule la face avant est ouverte, à profondeur infinie seul
  // le dessus l'est, et l'écart change donc de signe entre les deux.
  const kH  = 2 * hMid / (H0m + H1m)
  const kLT = 2 * dMidT / (L0m + L1m)
  const dL  = L1m - L0m
  let h0: number, h1: number, d0: number, d1: number
  if (abrupt) {
    // Sans tronc il n'y a plus d'ouverture à accorder : les deux rapports sont
    // exacts et l'élancement reste celui qui est visé.
    h0 = kH * H0m; h1 = kH * H1m
    d0 = kLT * L0m; d1 = kLT * L1m
  } else {
    const dhP = kH * (H1m - H0m)
    let lo = kLT * 1e-4, hi = kLT * 1e4
    const sLo = Math.sign(gapOf(lo * dL, dhP))
    for (let k = 0; k < 80; k++) {
      const m = Math.sqrt(lo * hi)
      if (Math.sign(gapOf(m * dL, dhP)) === sLo) lo = m; else hi = m
    }
    const kSol = Math.sqrt(lo * hi)
    // Bornée : sans cela, une gaine dont la hauteur varie beaucoup et la largeur
    // à peine serait dessinée absurdement profonde.
    const kL = Math.min(kLT * 2.5, Math.max(kLT * 0.4, kSol))
    d0 = kL * L0m; d1 = kL * L1m
    if (Math.abs(kL - kSol) < 1e-9 * kLT) {
      h0 = kH * H0m; h1 = kH * H1m
    } else {
      // L'échelle a buté sur sa borne : le reliquat retombe sur l'évasement
      // vertical, seul cas où le rapport des hauteurs est infléchi.
      const dd = kL * dL
      let a2 = 0, b2 = 1.9 * hMid
      for (let k = 0; k < 44; k++) {
        const m = (a2 + b2) / 2
        if (gapOf(dd, sH * m) < 0) a2 = m; else b2 = m
      }
      const tH = (a2 + b2) / 2
      h0 = hMid - sH * tH / 2; h1 = hMid + sH * tH / 2
    }
  }

  const X  = [0, arm, arm + Lc, arm + Lc + arm]
  const HH = [h0, h0, h1, h1]
  const DD = [d0, d0, d1, d1]
  // z = −d est la face proche, z = +d la lointaine ; le centre de chaque section
  // reste sur l'axe.
  const CX = (i: number, sz: -1 | 1) => X[i] - sz * DD[i] * cA
  const CY = (i: number, sy: -1 | 1, sz: -1 | 1) => sy * HH[i] - sz * DD[i] * sA

  const annL = mini ? 0 : 58, annR = mini ? 0 : 58, annV = mini ? 4 : 34
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity
  for (let i = 0; i < 4; i++) for (const sy of [-1, 1] as const) for (const sz of [-1, 1] as const) {
    xmin = Math.min(xmin, CX(i, sz)); xmax = Math.max(xmax, CX(i, sz))
    ymin = Math.min(ymin, CY(i, sy, sz)); ymax = Math.max(ymax, CY(i, sy, sz))
  }
  const contentW = annL + (xmax - xmin) + annR
  const contentH = 2 * annV + (ymax - ymin)
  const VW = 500, M = 16
  const VH = Math.max(150, Math.min(420, (VW - 2 * M) * contentH / contentW + 2 * M))
  const scl = Math.min((VW - 2 * M) / contentW, (VH - 2 * M) / contentH)
  const tx = M + ((VW - 2 * M) - contentW * scl) / 2 + (annL - xmin) * scl
  const ty = M + ((VH - 2 * M) - contentH * scl) / 2 + (annV - ymin) * scl
  const vx = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy = (wy: number) => +(ty + wy * scl).toFixed(1)
  const ann = '#64748b', edge = '#374151'
  const ew = mini ? f(0.03 * hMid * scl) : 2

  // Silhouette réelle du volume : ses bords extrêmes sont l'arête haute lointaine
  // et l'arête basse proche, exactement opposées, donc symétriques par rapport à
  // l'axe. La seule face avant, elle, dérive puisqu'elle est à la profondeur −d.
  const yTop = (i: number) => -HH[i] - DD[i] * sA
  const yBot = (i: number) =>  HH[i] + DD[i] * sA
  const sil = [
    `M ${vx(CX(0, 1))} ${vy(yTop(0))}`,
    ...[1, 2, 3].map(i => `L ${vx(CX(i, 1))} ${vy(yTop(i))}`),
    `L ${vx(CX(3, -1))} ${vy(CY(3, -1, -1))}`,
    `L ${vx(CX(3, -1))} ${vy(yBot(3))}`,
    ...[2, 1, 0].map(i => `L ${vx(CX(i, -1))} ${vy(yBot(i))}`),
    `L ${vx(CX(0, 1))} ${vy(CY(0, 1, 1))}`,
    'Z',
  ].join(' ')

  // Les arêtes du contour sont plus grasses que celles de l'intérieur — sauf
  // lorsqu'elles passent en caché, où elles perdent ce statut.
  const ewOut = mini ? f(0.05 * hMid * scl) : 3
  const seg = (ax: number, ay: number, bx: number, by: number,
               hidden: boolean, k: string, bold = false) => (
    <line key={k} x1={vx(ax)} y1={vy(ay)} x2={vx(bx)} y2={vy(by)}
      stroke={edge} strokeWidth={bold && !hidden ? ewOut : ew} strokeLinecap="round"
      strokeDasharray={hidden ? '5 4' : undefined} />
  )

  const barb = (X0: number, Y0: number, ux: number, uy: number, aw = 8, aa = Math.PI / 4.5) => {
    const bx = -ux, by = -uy
    const p = (s: number) => [
      +(X0 + aw * (bx * Math.cos(s) - by * Math.sin(s))).toFixed(1),
      +(Y0 + aw * (bx * Math.sin(s) + by * Math.cos(s))).toFixed(1),
    ]
    const [a1x, a1y] = p(aa), [a2x, a2y] = p(-aa)
    return <>
      <line x1={X0} y1={Y0} x2={a1x} y2={a1y} stroke={ann} strokeWidth="1.2" strokeLinecap="round" />
      <line x1={X0} y1={Y0} x2={a2x} y2={a2y} stroke={ann} strokeWidth="1.2" strokeLinecap="round" />
    </>
  }

  /** Cote d'angle : arc tendu entre les deux arêtes, bombé selon la normale.
   *  Le drapeau de balayage doit s'accorder au centre calculé — à l'envers, SVG
   *  bascule sans broncher sur l'autre centre et trace l'arc en miroir, ce qui
   *  laisse les tangentes, donc les pointes, orientées de travers. */
  const angleMark = (Ax: number, Ay: number, Bx: number, By: number,
                     nx: number, ny: number, key: string) => {
    const ux = Bx - Ax, uy = By - Ay
    const len = Math.hypot(ux, uy)
    if (len < 1e-6) return null
    const half = len / 2, Mx = (Ax + Bx) / 2, My = (Ay + By) / 2
    const sagN = abrupt ? 0 : Math.min(0.24 * half, 0.35 * Lc)
    const lbl = (px: number, py: number) => (
      <text x={vx(px)} y={vy(py)} fontSize="13" fill={ann}
        textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
        paintOrder="stroke" stroke="white" strokeWidth="4">θ = {theta}°</text>
    )
    if (sagN < 1e-6) {                       // 180° : les arêtes sont confondues
      const k = 1 / len
      return <g key={key}>
        <line x1={vx(Ax)} y1={vy(Ay)} x2={vx(Bx)} y2={vy(By)}
          stroke={ann} strokeWidth="1.2" strokeLinecap="round" />
        {barb(vx(Ax), vy(Ay), -ux * k, -uy * k)}
        {barb(vx(Bx), vy(By), ux * k, uy * k)}
        {lbl(Mx + nx * 14 / scl, My + ny * 14 / scl)}
      </g>
    }
    const R  = (half * half + sagN * sagN) / (2 * sagN)
    const Cx = Mx - nx * (R - sagN), Cy = My - ny * (R - sagN)
    const cr = ux * ny - uy * nx             // sens de la normale par rapport à la corde
    const sw = cr > 0 ? 0 : 1
    const aX = Ax - Cx, aY = Ay - Cy, bX = Bx - Cx, bY = By - Cy
    const oA = cr > 0 ? [-aY / R, aX / R] : [aY / R, -aX / R]
    const oB = cr > 0 ? [bY / R, -bX / R] : [-bY / R, bX / R]
    return <g key={key}>
      <path d={`M ${vx(Ax)} ${vy(Ay)} A ${f(R * scl)} ${f(R * scl)} 0 0 ${sw} ${vx(Bx)} ${vy(By)}`}
        stroke={ann} strokeWidth="1.2" fill="none" strokeLinecap="round" />
      {barb(vx(Ax), vy(Ay), oA[0], oA[1])}
      {barb(vx(Bx), vy(By), oB[0], oB[1])}
      {lbl(Mx + nx * sagN, My + ny * sagN)}
    </g>
  }

  /** Cote linéaire le long d'une arête, verticale ou oblique : deux traits
   *  d'attache perpendiculaires, la ligne de cote parallèle, le texte dessus.
   *  Les déports sont exprimés en unités de viewBox, donc constants à l'écran. */
  const cote = (Ax: number, Ay: number, Bx: number, By: number,
                nx: number, ny: number, deg: number, txt: string, key: string) => {
    const o = (p: number) => p / scl
    const at = (px: number, py: number, k: number) => [px + nx * o(k), py + ny * o(k)]
    const [a1x, a1y] = at(Ax, Ay, 6), [a2x, a2y] = at(Ax, Ay, 24)
    const [b1x, b1y] = at(Bx, By, 6), [b2x, b2y] = at(Bx, By, 24)
    const [l1x, l1y] = at(Ax, Ay, 16), [l2x, l2y] = at(Bx, By, 16)
    const [tX, tY] = at((Ax + Bx) / 2, (Ay + By) / 2, 31)
    return <g key={key}>
      <line x1={vx(a1x)} y1={vy(a1y)} x2={vx(a2x)} y2={vy(a2y)}
        stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={vx(b1x)} y1={vy(b1y)} x2={vx(b2x)} y2={vy(b2y)}
        stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={vx(l1x)} y1={vy(l1y)} x2={vx(l2x)} y2={vy(l2y)}
        stroke={ann} strokeWidth="1" strokeLinecap="round" />
      <text x={vx(tX)} y={vy(tY)} fontSize="13" fill={ann}
        textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
        paintOrder="stroke" stroke="white" strokeWidth="4"
        transform={`rotate(${deg}, ${vx(tX)}, ${vy(tY)})`}>{txt}</text>
    </g>
  }

  // Deux arêtes du 3e losange émergent du volume avant d'y replonger : sa fuyante
  // basse, qui part du bas de sa verticale vers le nord-ouest, et sa verticale
  // arrière, prise depuis le haut. Toutes deux sont pleines tant qu'elles restent
  // à découvert, puis passent en tiret dès qu'elles croisent une arête du volume.
  // On cherche donc la première intersection rencontrée depuis leur départ plutôt
  // que de désigner l'arête à l'avance : celle-ci change avec l'angle et les
  // sections. Sans aucune intersection, l'arête reste masquée de bout en bout.
  const P = (i: number, sy: -1 | 1, sz: -1 | 1): [number, number] => [CX(i, sz), CY(i, sy, sz)]
  const edges: { k: string; s: [number, number][] }[] = []
  for (let i = 0; i < 3; i++) for (const sy of [-1, 1] as const) for (const sz of [-1, 1] as const) {
    edges.push({ k: `lon${i}${sy}${sz}`, s: [P(i, sy, sz), P(i + 1, sy, sz)] })
  }
  for (let i = 0; i < 4; i++) for (const sz of [-1, 1] as const) {
    edges.push({ k: `ver${i}${sz}`, s: [P(i, -1, sz), P(i, 1, sz)] })
  }
  for (let i = 0; i < 4; i++) for (const sy of [-1, 1] as const) {
    edges.push({ k: `fuy${i}${sy}`, s: [P(i, sy, -1), P(i, sy, 1)] })
  }
  /** Fraction du trajet A→B parcourue avant la première arête croisée ; 1 si aucune. */
  const cutAt = (A: [number, number], B: [number, number], self: string) => {
    const rx = B[0] - A[0], ry = B[1] - A[1]
    let t1 = 1
    for (const e of edges) {
      if (e.k === self) continue
      const [q1, q2] = e.s
      const sx = q2[0] - q1[0], sy2 = q2[1] - q1[1]
      const den = rx * sy2 - ry * sx
      if (Math.abs(den) < 1e-9) continue
      const t = ((q1[0] - A[0]) * sy2 - (q1[1] - A[1]) * sx) / den
      const u = ((q1[0] - A[0]) * ry - (q1[1] - A[1]) * rx) / den
      if (t > 0.02 && t < t1 && u > 0.02 && u < 0.98) t1 = t
    }
    return t1
  }
  const lerp = (A: [number, number], B: [number, number], t: number): [number, number] =>
    [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]

  // Chaque arête sort du volume dès qu'elle passe à gauche de son homologue du
  // losange précédent, à laquelle elle est parallèle — sinon elle reste masquée de
  // bout en bout. La comparaison se fait donc sur le décalage perpendiculaire, et
  // chacune a sa propre référence : la fuyante se compare à la fuyante, la
  // verticale à la verticale.
  const degDb = cA * (h1 - h0) - sA * Lc > 1e-9                  // fuyantes basses
  const degFv = X[2] - d1 * cA < X[1] - d0 * cA - 1e-9           // verticales arrière
  // Cas symétrique, en diminution : la fuyante haute du 3e losange passe à gauche
  // de celle du 2e. Le tronc se referme alors devant lui-même — le 3e losange et
  // tout ce qui le relie au 2e disparaissent derrière le volume, tandis que les
  // arêtes qui le prolongent vers la sortie en ressortent.
  const replie = cA * (h0 - h1) - sA * Lc > 1e-9

  /** Arête tracée d'un seul tenant, ou coupée à la première arête croisée. */
  const lines: React.ReactElement[] = []
  const put = (A: [number, number], B: [number, number], hidden: boolean, k: string, bold = false) =>
    lines.push(seg(A[0], A[1], B[0], B[1], hidden, k, bold))
  const putSplit = (A: [number, number], B: [number, number], self: string,
                    k: string, hiddenFirst: boolean, bold = false) => {
    const t = cutAt(A, B, self)
    if (t >= 1) { put(A, B, hiddenFirst, k, bold); return }
    const C = lerp(A, B, t)
    put(A, C, hiddenFirst, `${k}a`, bold)
    put(C, B, !hiddenFirst, `${k}b`, bold)
  }

  // Arêtes longitudinales, quatre par intervalle. Deux d'entre elles — haute
  // lointaine et basse proche — forment le contour de la silhouette.
  for (let i = 0; i < 3; i++) {
    const corners: [-1 | 1, -1 | 1, boolean][] = [
      [-1, -1, false], [1, -1, false], [-1, 1, false], [1, 1, true],
    ]
    for (const [sy, sz, caché] of corners) {
      const A = P(i, sy, sz), B = P(i + 1, sy, sz), k = `lon${i}${sy}${sz}`
      const bord = (sy === -1 && sz === 1) || (sy === 1 && sz === -1)
      if (replie && i === 1) put(A, B, true, k)               // relie 2e et 3e losanges
      else if (replie && i === 2 && !(sy === 1 && sz === 1))   // sauf l'arête basse arrière
        putSplit(A, B, k, k, true, bord)                       // depuis le 3e losange
      else put(A, B, caché, k, bord)
    }
  }
  // Losanges de section
  for (let i = 0; i < 4; i++) {
    const nv = `ver${i}-1`, fv = `ver${i}1`, dt = `fuy${i}-1`, db = `fuy${i}1`
    const tout = replie && i === 2                            // 3e losange entièrement caché
    put(P(i, -1, -1), P(i, 1, -1), tout, nv, i === 3)
    put(P(i, -1, -1), P(i, -1, 1), tout, dt, i === 3)
    if (i === 2 && !tout) {
      // Ces deux-là ressortent du volume quand elles passent à gauche de leur
      // homologue du 2e losange ; sinon elles restent masquées de bout en bout.
      if (degFv) putSplit(P(2, -1, 1), P(2, 1, 1), fv, fv, false)
      else put(P(2, -1, 1), P(2, 1, 1), true, fv)
      if (degDb) putSplit(P(2, 1, -1), P(2, 1, 1), db, db, false)
      else put(P(2, 1, -1), P(2, 1, 1), true, db)
    } else {
      put(P(i, -1, 1), P(i, 1, 1), tout || i !== 0, fv, i === 0)
      put(P(i, 1, -1), P(i, 1, 1), tout || i !== 0, db, i === 0)
    }
  }

  const xm = (X[1] + X[2]) / 2, dm = (d0 + d1) / 2
  const sL = L1m >= L0m ? 1 : -1
  // En diminution de section, les deux cotes d'angle se bombent dans l'autre sens.
  const inv = L1m * H1m < L0m * H0m ? -1 : 1
  const iDeg = 180 * iA / Math.PI
  const v0Txt = v0_ms != null && isFinite(v0_ms)
    ? `V₀ = ${v0_ms.toFixed(2).replace('.', ',')} m/s` : 'V₀'
  const v0Fs = Math.max(8.5, Math.min(13, (arm - 6) * scl / (0.55 * v0Txt.length)))

  return (
    <svg viewBox={`0 0 ${VW} ${f(VH)}`} width="100%" height="100%"
      style={{ display: 'block' }} overflow="visible">
      {/* La silhouette n'est plus que le remplissage : chaque arête, contour
          compris, est tracée séparément pour porter son propre style. */}
      <path d={sil} fill="#f1f5f9" stroke="none" />
      {lines}
      {!mini && <>
        {/* Les deux cotes d'angle, d'ouverture apparente égale par construction */}
        {angleMark(xm + dm * cA, -hMid + dm * sA, xm + dm * cA, hMid + dm * sA, sH * inv, 0, 'av')}
        {angleMark(xm + dm * cA, -hMid + dm * sA, xm - dm * cA, -hMid - dm * sA,
                   sL * inv * sA, -sL * inv * cA, 'ah')}
        {/* Sens d'écoulement, centré sur le losange d'entrée, à une taille
            constante à l'écran ; la vitesse se lit juste au-dessus. */}
        {(() => {
          const xa = X[0] - 23 / scl, xt = X[0] + 23 / scl, xb = xt - 14 / scl
          return <>
            <line x1={vx(xa)} y1={vy(0)} x2={vx(xb)} y2={vy(0)}
              stroke={ann} strokeWidth="1.5" />
            <path d={`M ${vx(xt)} ${vy(0)} L ${vx(xb)} ${f(vy(0) - 6)} L ${vx(xb)} ${f(vy(0) + 6)} Z`}
              fill={ann} />
          </>
        })()}
        <text x={vx(X[0])} y={f(vy(0) - 19)} fontSize={f(v0Fs)} fill={ann}
          textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
          paintOrder="stroke" stroke="white" strokeWidth="4">{v0Txt}</text>
        {/* H₀ sur la verticale arrière gauche, H₁ sur la verticale avant droite */}
        {cote(CX(0, 1), CY(0, -1, 1), CX(0, 1), CY(0, 1, 1), -1, 0, -90,
              `H₀ = ${Math.round(H0m)} mm`, 'cH0')}
        {cote(CX(3, -1), CY(3, -1, -1), CX(3, -1), CY(3, 1, -1), 1, 0, -90,
              `H₁ = ${Math.round(H1m)} mm`, 'cH1')}
        {/* L₀ et L₁ le long de leur fuyante, cote parallèle à celle-ci */}
        {cote(CX(0, -1), CY(0, 1, -1), CX(0, 1), CY(0, 1, 1), -sA, cA, iDeg,
              `L₀ = ${Math.round(L0m)} mm`, 'cL0')}
        {cote(CX(3, -1), CY(3, -1, -1), CX(3, 1), CY(3, -1, 1), sA, -cA, iDeg,
              `L₁ = ${Math.round(L1m)} mm`, 'cL1')}
      </>}
    </svg>
  )
}

// ── Schéma ASHRAE 3-10 — coude rectangulaire à 90° avec changement de section ──
// Entrée horizontale par la gauche, sortie verticale vers le bas. W est la
// dimension dans le plan du coude — la seule qui varie — vue ici en vraie
// grandeur : en travers de la gaine amont, le long de la gaine aval. L'angle
// vaut 90° par construction, il n'est pas coté mais marqué au coin intérieur.
function SchemaElbow310({ mini, s0, s1, v0_ms }: {
  mini?: boolean; s0: TransitionShape; s1: TransitionShape; v0_ms?: number | null
}) {
  const f = (v: number) => +v.toFixed(1)
  const { d0: D0_mm, d1: D1_mm, lettre } = viewDim(s0, s1)
  const big = Math.max(D0_mm, D1_mm), small = Math.min(D0_mm, D1_mm)
  const ratio = big > 0 ? Math.min(0.82, Math.max(1 / 3, small / big)) : 1
  const Wbig = 100, Wsml = 100 * ratio
  const W0 = D0_mm >= D1_mm ? Wbig : Wsml     // largeur de la gaine amont
  const W1 = D1_mm >= D0_mm ? Wbig : Wsml     // largeur de la gaine aval

  const arm = 78
  const X = arm + W1                          // paroi extérieure du coude
  const Y = W0 + arm                          // extrémité de la gaine aval
  const iX = X - W1, iY = W0                  // coin intérieur

  // Marges identiques des quatre côtés, pour que le coude lui-même — et pas
  // seulement l'ensemble dessin + cotes — tombe au centre du cadre.
  // Les cotes sortent à 22 unités monde du dessin puis leur texte occupe encore
  // une largeur fixe en unités de viewBox : cette part-là dépend de l'échelle,
  // qui dépend de la marge. Deux itérations suffisent à converger ; surdimensionner
  // la marge à la place décalerait le dessin.
  const VW = 500, M = 16
  let ann4 = mini ? 0 : 40
  for (let i = 0; i < 3 && !mini; i++) {
    const cW = 2 * ann4 + X, cH = 2 * ann4 + Y
    const vh = Math.max(150, Math.min(420, (VW - 2 * M) * cH / cW + 2 * M))
    ann4 = 22 + 26 / Math.min((VW - 2 * M) / cW, (vh - 2 * M) / cH)
  }
  const contentW = 2 * ann4 + X
  const contentH = 2 * ann4 + Y
  const VH = Math.max(150, Math.min(420, (VW - 2 * M) * contentH / contentW + 2 * M))
  const scl = Math.min((VW - 2 * M) / contentW, (VH - 2 * M) / contentH)
  const tx = M + ((VW - 2 * M) - contentW * scl) / 2 + ann4 * scl
  const ty = M + ((VH - 2 * M) - contentH * scl) / 2 + ann4 * scl
  const vx = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy = (wy: number) => +(ty + wy * scl).toFixed(1)

  // Silhouette en L : paroi extérieure du coin, puis paroi intérieure en retour.
  const d = [
    `M ${vx(0)} ${vy(0)}`, `L ${vx(X)} ${vy(0)}`, `L ${vx(X)} ${vy(Y)}`,
    `L ${vx(iX)} ${vy(Y)}`, `L ${vx(iX)} ${vy(iY)}`, `L ${vx(0)} ${vy(iY)}`, 'Z',
  ].join(' ')

  const ann = '#64748b'
  const v0Txt = v0_ms != null && isFinite(v0_ms)
    ? `V₀ = ${v0_ms.toFixed(2).replace('.', ',')} m/s` : 'V₀'
  const v0Fs = Math.max(8.5, Math.min(13, (iX - 6) * scl / (0.55 * v0Txt.length)))

  return (
    <svg viewBox={`0 0 ${VW} ${f(VH)}`} width="100%" height="100%"
      style={{ display: 'block' }} overflow="visible">
      <path d={d} fill="#f1f5f9" stroke="#374151" strokeWidth={mini ? f(0.05 * Wbig * scl) : 3}
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Limite du coude : où la gaine amont cède la place à la gaine aval */}
      <line x1={vx(iX)} y1={vy(0)} x2={vx(iX)} y2={vy(iY)}
        stroke="#cbd5e1" strokeWidth="1.2" strokeLinecap="round" />
      <line x1={vx(iX)} y1={vy(iY)} x2={vx(X)} y2={vy(iY)}
        stroke="#cbd5e1" strokeWidth="1.2" strokeLinecap="round" />
      {!mini && <>
        {/* Coin droit — l'angle vaut 90° par construction, il ne se règle pas */}
        <path d={`M ${vx(iX)} ${vy(iY - 13)} L ${vx(iX + 13)} ${vy(iY - 13)} L ${vx(iX + 13)} ${vy(iY)}`}
          stroke={ann} strokeWidth="1.2" fill="none" />
        <text x={vx(iX + 6.5)} y={f(vy(iY - 6.5) + 1)} fontSize="11" fill={ann}
          textAnchor="middle" dominantBaseline="middle" fontStyle="italic">90°</text>
        {/* Sens d'écoulement : entrée horizontale, puis sortie vers le bas */}
        <line x1={vx(10)} y1={vy(W0 / 2)} x2={vx(iX * 0.62)} y2={vy(W0 / 2)}
          stroke={ann} strokeWidth="1.5" />
        <path d={`M ${vx(iX * 0.82)} ${vy(W0 / 2)} L ${vx(iX * 0.62)} ${vy(W0 / 2 - 7)} L ${vx(iX * 0.62)} ${vy(W0 / 2 + 7)} Z`}
          fill={ann} />
        <text x={vx(iX * 0.45)} y={f(vy(W0 / 2) - 14)} fontSize={f(v0Fs)} fill={ann}
          textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
          paintOrder="stroke" stroke="white" strokeWidth="4">{v0Txt}</text>
        {/* Cote W₀ — en travers de la gaine amont, à gauche */}
        <line x1={vx(-6)} y1={vy(0)} x2={vx(-22)} y2={vy(0)} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(-6)} y1={vy(iY)} x2={vx(-22)} y2={vy(iY)} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(-14)} y1={vy(0)} x2={vx(-14)} y2={vy(iY)} stroke={ann} strokeWidth="1" strokeLinecap="round" />
        <text x={f(vx(-14) - 15)} y={vy(iY / 2)} fontSize="13" fill={ann}
          textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
          paintOrder="stroke" stroke="white" strokeWidth="4"
          transform={`rotate(-90, ${f(vx(-14) - 15)}, ${vy(iY / 2)})`}>
          {lettre}₀ = {Math.round(D0_mm)} mm
        </text>
        {/* Cote W₁ — en travers de la gaine aval, en bas */}
        <line x1={vx(iX)} y1={vy(Y + 6)} x2={vx(iX)} y2={vy(Y + 22)} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(X)} y1={vy(Y + 6)} x2={vx(X)} y2={vy(Y + 22)} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(iX)} y1={vy(Y + 14)} x2={vx(X)} y2={vy(Y + 14)} stroke={ann} strokeWidth="1" strokeLinecap="round" />
        <text x={vx((iX + X) / 2)} y={f(vy(Y + 14) + 16)} fontSize="13" fill={ann}
          textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
          paintOrder="stroke" stroke="white" strokeWidth="4">
          {lettre}₁ = {Math.round(D1_mm)} mm
        </text>
      </>}
    </svg>
  )
}

interface Props {
  isOpen:      boolean
  onClose:     () => void
  onSave:      (t: VentNodeTransition) => void
  editing:     VentNodeTransition | null
  s0:          TransitionShape // section amont — porte V₀
  s1:          TransitionShape // section aval
  dynPressure:  number | null  // pression dynamique amont (Pa)
  dynPressure1?: number | null // pression dynamique aval — le 4-7 s'y rapporte
  v0_ms?:      number | null   // vitesse amont (m/s), portée par le label V₀
  Re?:         number | null   // Reynolds amont — le 3-10 en dépend
  nodeInfo?:   string
}

function TypeCard({ type, selected, onClick, s0, s1, theta, lRatio }: {
  type: TransitionType; selected: boolean; onClick: () => void
  s0: TransitionShape; s1: TransitionShape; theta: number
  lRatio?: number | null
}) {
  return (
    <button onClick={onClick} title={TRANSITION_LABELS[type]} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '7px 5px 7px',
      border: `1.5px solid ${selected ? '#2563eb' : '#e2e8f0'}`,
      borderRadius: 8,
      background: selected ? '#eff6ff' : '#f8fafc',
      cursor: 'pointer', transition: 'all 0.12s',
      boxShadow: selected ? '0 0 0 3px #2563eb22' : 'none',
    }}>
      <div style={{ width: '100%', height: 58 }}>
        {isElbow310(type) ? <SchemaElbow310 mini s0={s0} s1={s1} />
          : isPyramidal(type) ? <SchemaPyramid44 mini s0={s0} s1={s1} theta={theta} />
          : <SchemaTransition mini type={type} s0={s0} s1={s1} theta={theta} lRatio={lRatio} />}
      </div>
      <span style={{
        fontSize: 9, fontWeight: selected ? 700 : 500,
        color: selected ? '#1d4ed8' : '#64748b',
        textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', width: '100%', display: 'block',
      }}>
        {CARD_LABELS[type].join(' · ')}
      </span>
    </button>
  )
}

export default function TransitionModal({
  isOpen, onClose, onSave, editing, s0, s1, dynPressure, dynPressure1, v0_ms, Re, nodeInfo,
}: Props) {
  const [theta,   setTheta]   = useState<number>(30)
  const [lCone,   setLCone]   = useState<number>(0)
  const [pick,    setPick]    = useState<TransitionType | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setMounted(true))
      setTheta(editing?.theta ?? 30)
      setLCone(editing?.l_mm ?? 0)
      setPick(editing?.type ?? null)
    } else setMounted(false)
  }, [isOpen, editing])

  if (!isOpen) return null

  // Le sens d'écoulement et les sections fixent le sens de la transition, jamais
  // la fabrication : en rectangulaire, 4-2 et 4-3 s'appliquent également, et
  // c'est à l'utilisateur de dire laquelle est posée.
  const view    = viewDim(s0, s1)
  const match   = matchTransition(s0, s1)
  const selType = match.types.includes(pick as TransitionType) ? pick! : (match.types[0] ?? null)
  // Le 4-3 s'arrête à 90° : on ramène l'angle dans le domaine du type retenu.
  const angles  = selType ? transitionAngles(selType) : []
  const thEff   = selType && !angles.includes(theta)
    ? angles.reduce((a, b) => Math.abs(b - theta) < Math.abs(a - theta) ? b : a, angles[0])
    : theta
  // 4-7 : l se saisit en mm, la table se lisant sur l/H où H est la hauteur du
  // rectangulaire amont. La plage admise en découle.
  const cone    = selType != null && isStepped(selType)
  const hRect   = s0.shape === 'rectangular' ? s0.h_mm : 0
  // Maximum géométrique : au-delà, le cône reprendrait plus que la différence de
  // section et ses parois dépasseraient la limite amont. Il se resserre quand
  // l'angle s'ouvre, et devient donc plus contraignant que le domaine tabulé.
  const dHD     = s0.shape === 'rectangular' && s1.shape === 'circular'
    ? Math.abs(s0.h_mm - s1.d_mm) : 0
  const lGeo    = dHD / (2 * Math.tan(Math.max(0.5, thEff) * Math.PI / 360))
  const lMin    = Math.round(LH47_MIN * hRect)
  const lMax    = Math.max(lMin, Math.round(Math.min(LH47_MAX * hRect, lGeo)))
  // Par défaut, le milieu de la plage : ni le cône le plus court, ni le plus long.
  const lMid    = Math.round((lMin + lMax) / 2)
  const lEff    = cone ? Math.min(lMax, Math.max(lMin, lCone || lMid)) : 0
  const lRho    = cone && lGeo > 0 ? Math.min(1, lEff / lGeo) : 1
  const saved   = selType
    ? { id: editing?.id ?? newTransitionId(), type: selType, theta: thEff,
        ...(cone ? { l_mm: lEff } : {}) }
    : null
  const xi      = saved ? computeXiTransition(saved, s0, s1, Re ?? undefined) : 0
  // Le coefficient du 4-7 se rapporte à la vitesse aval, tous les autres à l'amont.
  const dynRef  = selType && refIsDownstream(selType) ? dynPressure1 : dynPressure
  const dp      = dynRef != null ? xi * dynRef : null

  const inp: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
    fontSize: 13, background: '#f8fafc', fontFamily: 'ui-monospace, monospace',
    color: '#1e293b', fontWeight: 600, width: 74, boxSizing: 'border-box',
  }
  const lbl: React.CSSProperties = { fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.01em' }
  const sectionTitle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, color: '#b0bec5',
    textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5,
  }

  return createPortal(
    <>
      {/* Zone de clic pour fermer (invisible) */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 280, bottom: 0, zIndex: 999,
      }} onMouseDown={onClose} />

      {/* Panneau */}
      <div style={{
        position: 'fixed', right: 280, top: '50%',
        transform: `translateY(-50%) translateX(${mounted ? 0 : 24}px)`,
        opacity: mounted ? 1 : 0,
        transition: 'transform 0.2s cubic-bezier(0.16,1,0.3,1), opacity 0.16s ease',
        zIndex: 1000, width: 660, height: 540, background: '#fff',
        borderRadius: '10px 0 0 10px', display: 'flex', flexDirection: 'column',
        boxShadow: '-1px 0 0 0 #e5e7eb, -16px 0 48px rgba(0,0,0,0.12)',
        overflow: 'hidden',
      }}>

        {/* ── En-tête ── */}
        <div style={{
          flexShrink: 0, padding: '10px 18px 9px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: nodeInfo ? 3 : 0 }}>
              {editing ? 'Modifier la transition' : 'Transition de section'}
            </div>
            {nodeInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: '#6366f1', flexShrink: 0, display: 'inline-block',
                }} />
                {nodeInfo}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: '#94a3b8', lineHeight: 1, padding: '2px 4px', marginTop: 1,
          }}>×</button>
        </div>

        {/* ── Sélecteur de type ── */}
        <div style={{ flexShrink: 0, padding: '10px 18px 9px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ ...sectionTitle, marginBottom: 7 }}>Type de transition</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {match.types.length > 0
              ? match.types.map(t => (
                  <TypeCard key={t} type={t} selected={t === selType} onClick={() => setPick(t)}
                    s0={s0} s1={s1} theta={transitionAngles(t).includes(theta) ? theta : 90}
                    lRatio={isStepped(t) ? (cone ? lRho : 0.6) : null} />
                ))
              : <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                  {match.reason}
                </span>}
          </div>
        </div>

        {/* ── Zone de détail ── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {!selType ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 9,
            }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="17" stroke="#e2e8f0" strokeWidth="1.5" />
                <path d="M18 11v8M18 25h.01" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 500 }}>
                Il n'y a aucune pièce à raccorder
              </span>
            </div>
          ) : (
            <>
              {/* ── Schéma ── */}
              <div style={{
                position: 'relative', width: 400, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                borderRight: '1px solid #f1f5f9', background: '#f8fafd',
              }}>
                {view.vue && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0, zIndex: 2, pointerEvents: 'none',
                    background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', borderLeft: '1px solid #cbd5e1',
                    borderRadius: '0 0 0 4px',
                    width: 96, textAlign: 'center', boxSizing: 'border-box',
                    padding: '2px 8px', fontSize: 11, color: '#94a3b8', fontStyle: 'italic',
                  }}>
                    {view.vue}
                  </div>
                )}
                <div style={{ flex: 1, padding: 0, minHeight: 0, overflow: 'hidden' }}>
                  {isElbow310(selType) ? <SchemaElbow310 s0={s0} s1={s1} v0_ms={v0_ms} />
                    : isPyramidal(selType)
                      ? <SchemaPyramid44 s0={s0} s1={s1} theta={thEff} v0_ms={v0_ms} />
                      : <SchemaTransition type={selType} s0={s0} s1={s1} theta={thEff}
                        v0_ms={v0_ms} lCone_mm={cone ? lEff : null}
                        lRatio={cone ? lRho : null} />}
                </div>
                {/* Côtés parallèles — conservés, donc vus de chant et non
                    dessinés. En pied de zone, pas dans le SVG : celui-ci est
                    mis à l'échelle et sa base ne touche pas le bas du cadre. */}
                {view.fixe && (
                  <div style={{
                    flexShrink: 0, padding: '0 12px 11px', textAlign: 'center',
                    fontSize: 11, color: '#64748b', fontStyle: 'italic',
                  }}>
                    {view.fixe}
                  </div>
                )}
              </div>

              {/* ── Paramètres ── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div style={{ padding: '12px 16px 0 16px', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                    {TRANSITION_LABELS[selType]}
                  </div>
                  {/* Séparateur du titre — inutile quand aucun champ ne suit :
                      il doublerait celui du bloc de résultat */}
                  {!isElbow310(selType) && <div style={{ borderTop: '1px solid #f1f5f9' }} />}
                </div>

                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 14px 16px' }}>

                  {/* Champs — le 3-10 n'a pas d'axe d'angle : 90° est imposé par
                      la pièce, il n'y a donc rien à régler */}
                  {!isElbow310(selType) && (
                    <div style={{
                      display: 'grid', gridTemplateColumns: '1fr 74px',
                      rowGap: 10, columnGap: 8, alignItems: 'center',
                    }}>
                      <>

                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                          <span style={lbl}>Angle θ</span>
                          {isThreeSided(selType) && (
                            <span style={{ fontSize: 10, color: '#94a3b8', fontStyle: 'italic' }}>
                              du côté incliné
                            </span>
                          )}
                        </div>
                        <select value={thEff} onChange={e => setTheta(Number(e.target.value))}
                          style={{ ...inp, width: 74, cursor: 'pointer' }}>
                          {angles.map(a => <option key={a} value={a}>{a}°</option>)}
                        </select>
                        {cone && (<>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                            <span style={lbl}>l</span>
                            <span style={{ fontSize: 9, color: '#94a3b8' }}>
                              {lMin} – {lMax} mm
                            </span>
                          </div>
                          <NumInput min={lMin} max={lMax} step={5} value={lEff}
                            onChange={v => setLCone(Math.max(lMin, Math.min(lMax, v ?? lMin)))}
                            style={inp} />
                        </>)}
                      </>
                    </div>
                  )}

                  {/* ── Résultat ξ / ΔP ── */}
                  <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{
                        flex: 1, padding: '9px 12px', borderRadius: 7,
                        background: '#eff6ff', border: '1px solid #bfdbfe',
                      }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd',
                          letterSpacing: '0.04em', marginBottom: 4 }}>
                          <span style={{ textTransform: 'uppercase' as const }}>Coeff.</span>
                          {' ξ'}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8',
                          fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
                          {xi.toFixed(3)}
                        </div>
                      </div>
                      {dp != null && (
                        <div style={{
                          flex: 1, padding: '9px 12px', borderRadius: 7,
                          background: '#f0fdfa', border: '1px solid #99f6e4',
                        }}>
                          <div style={{ fontSize: 9, fontWeight: 600, color: '#2dd4bf', marginBottom: 3 }}>
                            ΔP singulière
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f766e',
                            fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
                            {dp.toFixed(2)}
                            <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 3, color: '#0d9488' }}>Pa</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Pied de page ── */}
        <div style={{
          flexShrink: 0, height: 52, display: 'flex', alignItems: 'center',
          justifyContent: 'flex-end', gap: 8, padding: '0 18px',
          borderTop: '1px solid #f1f5f9',
        }}>
          <button onClick={onClose} style={{
            padding: '6px 16px', borderRadius: 6, border: '1px solid #e2e8f0',
            background: '#f8fafc', fontSize: 12, fontWeight: 500,
            color: '#374151', cursor: 'pointer',
          }}>Annuler</button>
          <button
            onClick={() => { if (saved) onSave(saved) }}
            disabled={!selType}
            style={{
              padding: '6px 18px', borderRadius: 6, border: 'none',
              background: selType ? '#2563eb' : '#e2e8f0',
              fontSize: 12, fontWeight: 700,
              color: selType ? '#fff' : '#94a3b8',
              cursor: selType ? 'pointer' : 'default', transition: 'background 0.1s',
            }}>
            {editing ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>

      </div>
    </>, document.body
  )
}
