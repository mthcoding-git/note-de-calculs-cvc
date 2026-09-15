import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
  JUNCTION_LABELS, JUNCTION_ANGLE, computeXiJunction, newJunctionId,
  resolveArmsFor, isConical, junctionTypesApplicables, junctionShapes,
  shapeLibre, isFallback, longueurEntree59, sectionsCompensees,
  type JunctionType, type VentNodeJunction,
} from '../utils/junctionCalc'
import { waveC } from '../utils/schemaDraw'

/** Une arrivée au nœud, telle que le panneau la connaît. */
export interface JunctionArm {
  segId:  string
  label:  string
  Q_m3h:  number
  A_mm2:  number              // section réelle, pas celle du diamètre hydraulique
  di_mm:  number              // Ø intérieur, ou Dh en rectangulaire
  shape:  'circular' | 'rectangular'
  a_mm?:  number              // rectangulaire : largeur
  b_mm?:  number              // rectangulaire : hauteur
}

/** Section d'un conduit, telle qu'on la lit sur un plan. */
function sect(a: JunctionArm): string {
  return a.shape === 'rectangular'
    ? `${Math.round(a.a_mm ?? 0)} × ${Math.round(a.b_mm ?? 0)} mm`
    : `Ø${Math.round(a.di_mm)} mm`
}

/** Les jonctions proposées. L'angle n'en fait pas partie : il se choisit
 *  ensuite, comme l'angle d'une transition.
 *  — collecteur cylindrique : le trajet droit garde le diamètre du commun ;
 *  — collecteur conique : le commun s'élargit, aucune contrainte de diamètre. */
const FAMILIES = [
  // Le 60° n'a pas de modèle ASHRAE : c'est le repli Idelchik qui le tient,
  // proposé ici comme un angle de plus plutôt que comme une pièce à part.
  { key: 'droit', shape: 'circular', conical: false,
    label: ['Collecteur', 'cylindrique'],
    title: 'Jonction convergente circulaire', angles: [30, 45, 60, 90],
    types: { 30: 'jonc-5-1', 45: 'jonc-5-2', 60: 'jonc-idel60', 90: 'jonc-5-3' } },
  { key: 'conique', shape: 'circular', conical: true,
    label: ['Collecteur', 'conique'],
    title: 'Jonction convergente circulaire à collecteur conique', angles: [30, 45],
    types: { 30: 'jonc-5-4', 45: 'jonc-5-5' } },
  { key: 'te-rect', shape: 'rectangular', conical: false,
    label: ['Té', 'branche coudée'],
    title: 'Té convergent rectangulaire à 90°, branche coudée', angles: [90],
    types: { 90: 'jonc-5-6' } },
  { key: 'te-mixte', shape: 'rectangular', conical: false,
    label: ['Té', 'piquage rond'], angles: [90],
    title: 'Té convergent à 90°, piquage circulaire sur principal rectangulaire',
    types: { 90: 'jonc-5-7' } },
  { key: 'te-droit', shape: 'rectangular', conical: false,
    label: ['Té', 'piquage droit'], angles: [90],
    title: 'Té convergent rectangulaire à 90°, piquage droit',
    types: { 90: 'jonc-5-8' } },
  { key: 'te-45', shape: 'rectangular', conical: false,
    label: ['Té', 'entrée 45°'], angles: [45],
    title: 'Té convergent rectangulaire, entrée de branche à 45°',
    types: { 45: 'jonc-5-9' } },
  // Les raccords sans contrainte de forme, réunis sous un seul choix : l'angle
  // en décide. À 30° c'est le modèle tabulé qui répond quand il s'applique, le
  // repli analytique sinon ; aux trois autres angles il n'existe que le repli.
  { key: 'libre', shape: 'rectangular', conical: false, libreShape: true,
    label: ['Sections', 'quelconques'],
    title: 'Jonction convergente, sections quelconques', angles: [30, 45, 60, 90],
    types: { 30: 'jonc-5-1r', 45: 'jonc-idel45', 60: 'jonc-idel60', 90: 'jonc-idel90' },
    alt:   { 30: 'jonc-idel30' } },
  // Géométrie à part : les deux arrivées se partagent la section du commun au
  // lieu que le trajet droit la garde entière. Elle exclut donc les autres
  // raccords, et eux l'excluent — d'où sa carte propre.
  { key: 'compensee', shape: 'rectangular', conical: false, libreShape: true,
    label: ['Sections', 'compensées'], angles: [15, 30],
    title: 'Culotte convergente à sections compensées',
    types: { 15: 'jonc-idel15', 30: 'jonc-idel30c' } },
] as const

type Family = typeof FAMILIES[number]

/** Famille qui porte un raccord donné — celle où il figure, principal ou de
 *  secours. Sert à rouvrir une pièce déjà posée sur la bonne carte. */
function famDe(t: JunctionType): string {
  const a = FAMILIES.find(f => Object.values(f.types).includes(t as never)
    || Object.values((f as any).alt ?? {}).includes(t))
  return a?.key ?? FAMILIES[0].key
}

/** Chaque angle a son propre diagramme — on n'interpole jamais entre eux.
 *  Un angle peut avoir un second modèle de secours : on ne le retient que si le
 *  premier ne s'applique pas à ce nœud. */
function typeOf(fam: Family, angle: number, util?: JunctionType[]): JunctionType {
  const t = (fam.types as Record<number, JunctionType>)[angle]
  const a = ((fam as any).alt as Record<number, JunctionType> | undefined)?.[angle]
  if (a && util && !util.includes(t) && util.includes(a)) return a
  return t
}

interface Props {
  isOpen:   boolean
  onClose:  () => void
  onSave:   (j: VentNodeJunction) => void
  editing:  VentNodeJunction | null
  arms:     JunctionArm[]      // exactement deux arrivées
  common:   JunctionArm        // le conduit commun, en aval
  rho:      number             // masse volumique au nœud (kg/m³)
  nodeInfo?: string
}

// ── Schéma ASHRAE 5-1 à 5-5 — jonction convergente, vue de profil ─────────
// Le trajet droit entre à gauche, la branche arrive par en dessous sous l'angle
// θ, le conduit commun repart à droite. Sur collecteur cylindrique (5-1/5-2/5-3)
// la règle d'emploi impose As = Ac et la principale garde un diamètre constant ;
// sur collecteur conique (5-4/5-5) elle s'évase de Ds à Dc, et c'est sur ce cône
// que la branche se greffe.
//
// Le raccord est tracé d'un seul trait fermé. La paroi basse de la principale
// s'interrompt entre les deux points où les parois de la branche la rejoignent :
// c'est l'ouverture par laquelle les deux écoulements se mélangent. Ces deux
// points se déduisent de θ et de la pente du cône, ce qui donne au 30° sa longue
// fourche et au 90° un simple piquage droit.
function SchemaJunction({
  mini, angle, mainRect, branchRect, lettreMain = 'D', lettreBranche = 'D',
  defRatio = 0.5, sansLettre, hautPlat, dc_mm, db_mm, ds_mm, Qb, Qs, Qc,
}: {
  defRatio?: number           // proportion de convention, faute de dimensions
  hautPlat?: boolean          // paroi haute rectiligne, l'apport se fait par le bas
  sansLettre?: boolean        // rôles non tranchés : ne pas nommer la dimension
  mini?:  boolean
  angle:  number
  mainRect?:   boolean        // principale rectangulaire : coupes droites
  branchRect?: boolean        // branche rectangulaire : coupe droite
  lettreMain?: string         // lettre des cotes de la principale
  lettreBranche?: string      // lettre de la cote de branche
  // Dimension vue dans le plan du schéma : le diamètre en circulaire, la hauteur
  // en rectangulaire — la largeur, vue de chant, se rappelle en légende.
  dc_mm:  number              // conduit commun
  db_mm?: number | null       // branche — null tant qu'elle n'est pas désignée
  ds_mm?: number | null       // trajet droit amont — null de même
  Qb?:    number | null
  Qs?:    number | null
  Qc?:    number | null
}) {
  const f = (v: number) => +v.toFixed(1)

  // Rapports réels des diamètres, bornés en bas : sous un tiers la branche ne
  // serait plus qu'un trait. Le schéma illustre la pièce, il n'est pas à
  // l'échelle — l'angle tracé, lui, vaut toujours exactement θ.
  // Tant que les rôles ne sont pas tranchés, les deux diamètres amont sont
  // inconnus : le dessin en prend un de convention, le même pour les deux, assez
  // inférieur au commun pour que le cône et ses diagonales se voient.
  const rap = (d?: number | null) => d != null && dc_mm > 0
    ? Math.min(1, Math.max(0.30, d / dc_mm)) : defRatio
  /** Texte d'une cote. Tant que les rôles ne sont pas tranchés sur une gaine
   *  rectangulaire, la cote ne nomme pas sa dimension : écrire H ou L
   *  trancherait un plan de coupe que rien n'a encore fixé. */
  const cotxt = (L: string, ind: string, v?: number | null) =>
    sansLettre ? (v != null ? `${Math.round(v)} mm` : '')
      : v != null ? `${L}${ind} = ${Math.round(v)} mm`
      : L === 'D' ? `${L}${ind}` : ''
  const hc = 50, hb = 50 * rap(db_mm), hs = 50 * rap(ds_mm)
  // Deux façons de raccorder un trajet droit plus étroit que le commun : le
  // centrer sur l'axe, et le raccord s'évase des deux côtés ; ou aligner sa paroi
  // haute sur celle du commun, et tout l'apport se fait par le bas, là où la
  // branche arrive. C'est ce second tracé qu'appellent les sections compensées,
  // où la branche complète exactement le trajet droit.
  const off = hautPlat ? hs - hc : 0    // décalage de l'axe du trajet droit
  const ysT = -hs + off                 // paroi haute du trajet droit
  const ysB =  hs + off                 // paroi basse, d'où part le cône

  const th = Math.max(5, Math.min(90, angle)) * Math.PI / 180
  const ct = Math.cos(th), st = Math.sin(th)
  // Axe de la branche, orienté depuis le nœud vers son extrémité libre, et sa
  // normale. À 90° il descend tout droit, à 30° il fuit vers l'amont.
  const wx = -ct, wy = st
  const px = -st, py = -ct

  // Le cône occupe le corps du raccord : il part de xA, où finit la partie droite
  // amont, et sa demi-hauteur passe de hs à hc sur sa longueur. L'ouverture de la
  // fourche vaut 2·hb/(sin θ + k·cos θ) — la coupe d'un cylindre par un plan
  // incliné —, d'où une longueur de cône qui la contient avec une marge de part
  // et d'autre. k dépend de cette longueur : quelques itérations la fixent.
  const arm = 66, pad = 26
  const dH = hc - ysB
  let Lc = 150
  for (let n = 0; n < 24; n++) Lc = 2 * hb / (st + (dH / Lc) * ct) + 2 * pad
  const k  = dH / Lc                   // pente de la demi-hauteur
  const R  = st + k * ct
  const xA = arm, xB = xA + Lc
  const coneY = (x: number) => ysB + (x - xA) * k  // paroi basse du cône

  // Nœud placé pour que la fourche soit centrée dans le cône.
  const xJ = ((xA + Lc / 2) * R + ct * (ysB - k * xA)) / st
  /** Rencontre d'une paroi de branche avec la paroi basse : sg = +1 côté amont
   *  (la longue), sg = −1 côté aval. */
  const rencontre = (sg: number) => {
    const sq = (ysB + k * (xJ - xA) + sg * hb * (ct - k * st)) / R
    return { s: sq, x: xJ - sg * hb * st - sq * ct }
  }
  const mUp = rencontre(1), mDn = rencontre(-1)
  const xP = mUp.x, yP = coneY(xP)     // ouverture, côté amont
  const xM = mDn.x, yM = coneY(xM)     // ouverture, côté aval
  const Lb = mUp.s + arm               // longueur de branche dessinée
  const xEnd = xB + arm

  // Extrémité libre de la branche : son axe, puis ses deux coins.
  const ex = xJ + Lb * wx, ey = Lb * wy
  const c1x = ex + hb * px, c1y = ey + hb * py   // côté paroi amont
  const c2x = ex - hb * px, c2y = ey - hb * py   // côté paroi aval

  // Cadrage — mêmes marges d'annotation que les transitions : les cotes de
  // diamètre débordent à gauche et à droite, celle de la branche par le bas.
  const annL = mini ? 0 : 62, annR = mini ? 0 : 62
  const annT = mini ? 4 : 16, annB = mini ? 4 : 46
  const xmin = Math.min(0, c1x, c2x), xmax = Math.max(xEnd, c1x, c2x)
  const ymin = Math.min(-hc, ysT), ymax = Math.max(hc, ysB, c1y, c2y)
  const contentH = (ymax - ymin) + annT + annB
  const VW = 500, M = 16
  /** Cadrage pour une réserve donnée à droite. */
  const cadre = (resR: number) => {
    const cW  = (xmax - xmin) + annL + annR + resR
    const vh  = Math.max(150, Math.min(420, (VW - 2 * M) * contentH / cW + 2 * M))
    return { cW, vh, s: Math.min((VW - 2 * M) / cW, (vh - 2 * M) / contentH) }
  }
  // Étiquette de débit de la branche, posée à droite de sa flèche : elle sort du
  // dessin utile, il faut donc lui réserver la place avant de figer l'échelle.
  const long = (l: string[]) => Math.max(...l.map(s => s.length))
  const lB   = [Qb != null && isFinite(Qb) ? `Qb = ${Math.round(Qb)} m³/h` : 'Qb']
  const sMid = (hc / st + Lb) / 2                      // milieu de la partie libre
  const bMx  = xJ + sMid * wx, bMy = sMid * wy
  // Dégagement horizontal de la flèche : ses barbes s'écartent de 7 de part et
  // d'autre de l'axe, soit 7/sin θ en projection horizontale.
  const degB  = 7 / st + 6
  const s0    = cadre(0).s
  const larg  = (s: number) => 0.55 * Math.max(8.5, Math.min(12, 1.5 * arm * s / (0.55 * long(lB))))
    * long(lB) / s
  const resB  = mini ? 0 : Math.max(0, bMx + degB + larg(s0) - xEnd)
  const { cW: contentW, vh: VH, s: scl } = cadre(resB)
  const tx  = M + ((VW - 2 * M) - contentW * scl) / 2 + (annL - xmin) * scl
  const ty  = M + ((VH - 2 * M) - contentH * scl) / 2 + (annT - ymin) * scl
  const vx  = (wxx: number) => +(tx + wxx * scl).toFixed(1)
  const vy  = (wyy: number) => +(ty + wyy * scl).toFixed(1)
  const sw  = mini ? f(0.05 * 2 * hc * scl) : 3

  // Silhouette fermée. Les trois extrémités sont des coupes de gaine ronde :
  // elles se dessinent ondulées, une arête droite se lisant justement comme une
  // gaine rectangulaire vue de profil.
  const coupe = (ax: number, ay: number, bx: number, by: number, h: number,
                 droite = false) =>
    droite ? `L ${bx} ${by}` : waveC(ax, ay, bx, by, 0.125 * 2 * h * scl)
  const d = [
    `M ${vx(0)} ${vy(ysT)}`,
    `L ${vx(xA)} ${vy(ysT)}`,
    `L ${vx(xB)} ${vy(-hc)}`,
    `L ${vx(xEnd)} ${vy(-hc)}`,
    coupe(vx(xEnd), vy(-hc), vx(xEnd), vy(hc), hc, mainRect),
    `L ${vx(xB)} ${vy(hc)}`,
    `L ${vx(xM)} ${vy(yM)}`,
    `L ${vx(c2x)} ${vy(c2y)}`,
    coupe(vx(c2x), vy(c2y), vx(c1x), vy(c1y), hb, branchRect),
    `L ${vx(xP)} ${vy(yP)}`,
    `L ${vx(xA)} ${vy(ysB)}`,
    `L ${vx(0)} ${vy(ysB)}`,
    coupe(vx(0), vy(ysB), vx(0), vy(ysT), hs, mainRect),
    'Z',
  ].join(' ')

  const ann = '#64748b'

  /** Flèche de sens d'écoulement, pointe en (bx, by). Fût interrompu à la base
   *  du triangle, qu'il ne traverse pas. */
  const arrow = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1
    const ux = dx / l, uy = dy / l
    const kx = bx - 14 * ux, ky = by - 14 * uy
    return <>
      <line x1={vx(ax)} y1={vy(ay)} x2={vx(kx)} y2={vy(ky)} stroke={ann} strokeWidth="1.5" />
      <path fill={ann} d={`M ${vx(bx)} ${vy(by)} L ${vx(kx - 7 * uy)} ${vy(ky + 7 * ux)} `
        + `L ${vx(kx + 7 * uy)} ${vy(ky - 7 * ux)} Z`} />
    </>
  }

  // Étiquettes : le corps se règle sur la largeur disponible — une moitié de
  // gaine — de sorte que deux étiquettes voisines ne puissent jamais se toucher.
  const fsOf = (l: string[], avail: number) =>
    Math.max(8.5, Math.min(12, avail * scl / (0.55 * long(l))))
  const texte = (X: number, Y: number, l: string[], avail: number) => {
    const fz = fsOf(l, avail)
    return (
      <text x={X} y={f(Y - (l.length - 1) * 0.55 * fz)} fontSize={f(fz)} fill={ann}
        textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
        paintOrder="stroke" stroke="white" strokeWidth="4">
        {l.map((s, i) => <tspan key={i} x={X} dy={i === 0 ? 0 : f(1.15 * fz)}>{s}</tspan>)}
      </text>
    )
  }
  const lignes = (t: string, q?: number | null) =>
    [q != null && isFinite(q) ? `${t} = ${Math.round(q)} m³/h` : t]

  /** Cote de diamètre, perpendiculaire à une coupe. (A, B) sont les deux coins
   *  de la coupe, (nx, ny) la normale sortante. Même dessin que les cotes de
   *  section des transitions, mais orientable : la coupe de branche est inclinée. */
  const cote = (Ax: number, Ay: number, Bx: number, By: number,
                nx: number, ny: number, txt: string) => {
    const [ax, ay] = [vx(Ax), vy(Ay)], [bx, by] = [vx(Bx), vy(By)]
    const o = (k: number, X: number, Y: number): [number, number] =>
      [+(X + k * nx).toFixed(1), +(Y + k * ny).toFixed(1)]
    const t1 = 6 * scl, t2 = 22 * scl, td = 14 * scl
    const [a6, a6y] = o(t1, ax, ay), [a2, a2y] = o(t2, ax, ay)
    const [b6, b6y] = o(t1, bx, by), [b2, b2y] = o(t2, bx, by)
    const [d1, d1y] = o(td, ax, ay), [d2, d2y] = o(td, bx, by)
    const [lx, ly] = o(td + 15, (ax + bx) / 2, (ay + by) / 2)
    // Le texte suit la coupe, jamais tête en bas.
    let rot = Math.atan2(by - ay, bx - ax) * 180 / Math.PI
    if (rot > 90) rot -= 180
    if (rot < -90) rot += 180
    return <>
      <line x1={a6} y1={a6y} x2={a2} y2={a2y} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={b6} y1={b6y} x2={b2} y2={b2y} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={d1} y1={d1y} x2={d2} y2={d2y} stroke={ann} strokeWidth="1" strokeLinecap="round" />
      <text x={lx} y={ly} fontSize="13" fill={ann}
        textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
        paintOrder="stroke" stroke="white" strokeWidth="4"
        transform={`rotate(${f(rot)}, ${lx}, ${ly})`}>{txt}</text>
    </>
  }

  // Cote de l'angle : arc centré sur le nœud, entre l'axe de la principale pris
  // vers l'amont et l'axe de la branche. Le rayon s'éloigne quand θ se ferme,
  // pour garder une longueur d'arc lisible à l'écran, sans jamais sortir de la
  // branche dessinée.
  const rA    = Math.min(0.86 * Lb, Math.max(0.34 * hc, 46 / scl / th))
  const aBarb = Math.min(7, 0.34 * rA * th * scl)
  const bix = -1 + wx, biy = wy                 // bissectrice du secteur
  const bil = Math.hypot(bix, biy) || 1
  const aLd = rA + 24 / scl

  /** Pointe de flèche en (X, Y), ouverte vers l'arrière de (ux, uy). */
  const barb = (X: number, Y: number, ux: number, uy: number, aw = 7) => {
    const bx = -ux, by = -uy, aa = Math.PI / 6
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

  // Étiquette de la branche : contre sa flèche, à droite et à la même hauteur.
  // Elle est plus large que la branche n'est épaisse, donc elle en déborde ; son
  // halo blanc interrompt proprement la paroi, comme pour les cotes.
  const avB  = 1.5 * arm
  const xQb  = bMx + degB + 0.55 * fsOf(lB, avB) * long(lB) / (2 * scl)
  // Débits de la principale : posés juste au-dessus de leur flèche, dans la
  // gaine. Chacun dispose d'une moitié de dessin, ce qui empêche les deux de se
  // rejoindre ; recentré au besoin pour ne pas déborder de l'extrémité.
  const avM  = 0.44 * xEnd
  const lS = lignes('Qs', Qs), lC = lignes('Qc', Qc)
  const demi = (l: string[]) => 0.55 * fsOf(l, avM) * long(l) / (2 * scl)
  const xQs  = Math.max(0.5 * (12 + 12 + 0.62 * arm), demi(lS))
  const xQc  = Math.min(xEnd - 0.42 * arm, xEnd - demi(lC))
  const yLblS = f(vy(off) - 16), yLblC = f(vy(0) - 16)

  return (
    <svg viewBox={`0 0 ${VW} ${f(VH)}`} width="100%" height="100%"
      style={{ display: 'block' }} overflow="visible">
      <path d={d} fill="#f1f5f9" stroke="#374151" strokeWidth={sw}
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Début et fin du cône : les deux sections où se lisent Ds et Dc. Rien à
          marquer sur collecteur cylindrique, où il n'y a pas de diagonale. */}
      {Math.abs(hc - hs) > 0.5 && (() => {
        // Dans la vignette, le viewBox est réduit d'environ cinq fois : un trait
        // de 1,2 y tomberait sous le pixel et s'afficherait gris pâle. Il se cale
        // donc sur l'épaisseur du contour, comme tout le reste du dessin.
        const w = mini ? f(0.6 * sw) : 1.2
        return <>
          <line x1={vx(xA)} y1={vy(ysT)} x2={vx(xA)} y2={vy(ysB)}
            stroke="#374151" strokeWidth={w} strokeLinecap="round" />
          <line x1={vx(xB)} y1={vy(-hc)} x2={vx(xB)} y2={vy(hc)}
            stroke="#374151" strokeWidth={w} strokeLinecap="round" />
        </>
      })()}
      {!mini && <>
        {/* Angle θ entre l'axe amont de la principale et celui de la branche.
            Les deux directions mesurées sont rappelées en pointillé, sans quoi
            l'arc flotterait sans référence. */}
        <line x1={vx(xJ)} y1={vy(0)} x2={vx(xJ - rA - 12 / scl)} y2={vy(0)}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <line x1={vx(xJ)} y1={vy(0)} x2={vx(xJ + (rA + 12 / scl) * wx)} y2={vy((rA + 12 / scl) * wy)}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <path d={`M ${vx(xJ - rA)} ${vy(0)} A ${f(rA * scl)} ${f(rA * scl)} 0 0 0 `
          + `${vx(xJ + rA * wx)} ${vy(rA * wy)}`}
          stroke={ann} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {/* Pointes tournées vers l'extérieur de l'arc : opposée au sens de
            parcours au départ, dans son sens à l'arrivée. */}
        {barb(vx(xJ - rA), vy(0), 0, -1, aBarb)}
        {barb(vx(xJ + rA * wx), vy(rA * wy), wy, -wx, aBarb)}
        <text x={vx(xJ + aLd * bix / bil)} y={vy(aLd * biy / bil)} fontSize="13" fill={ann}
          textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
          paintOrder="stroke" stroke="white" strokeWidth="4">θ = {angle}°</text>

        {/* Sens d'écoulement : les deux arrivées convergent vers le commun */}
        {arrow(12, off, 12 + 0.62 * arm, off)}
        {texte(vx(xQs), yLblS, lS, avM)}
        {arrow(bMx + 0.30 * arm * wx, bMy + 0.30 * arm * wy,
               bMx - 0.30 * arm * wx, bMy - 0.30 * arm * wy)}
        {texte(vx(xQb), vy(bMy), lB, avB)}
        {arrow(xEnd - 0.72 * arm, 0, xEnd - 12, 0)}
        {texte(vx(xQc), yLblC, lC, avM)}

        {/* Diamètres des trois extrémités */}
        {cote(0, ysT, 0, ysB, -1, 0, cotxt(lettreMain, 's', ds_mm))}
        {cote(xEnd, -hc, xEnd, hc, 1, 0, cotxt(lettreMain, 'c', dc_mm))}
        {cote(c1x, c1y, c2x, c2y, wx, wy, cotxt(lettreBranche, 'b', db_mm))}
      </>}
    </svg>
  )
}

// ── Schéma ASHRAE 5-6 — té convergent rectangulaire, vue de profil ──────────
// Le trajet droit entre à gauche, le conduit commun repart à droite, la branche
// arrive par en dessous — même orientation que les raccords ronds.
//
// La principale n'a pas de cône : sa paroi haute est droite d'un bout à l'autre
// et tout changement de section se lit sur la paroi basse. La branche, elle,
// tourne de 90° vers la droite sur un rayon de gorge r = wb, condition de
// géométrie du fitting (r/wb = 1) : elle rejoint donc le commun dans son sens
// d'écoulement, sa paroi intérieure devenant la paroi basse du commun.
function SchemaTee56({
  mini, lettre = 'H', sansLettre, hc_mm, hb_mm, hs_mm, Qb, Qs, Qc,
}: {
  mini?:   boolean
  lettre?: 'H' | 'L'          // dimension vue dans le plan de courbure
  sansLettre?: boolean        // rôles non tranchés : ne pas nommer la dimension
  // Dimensions dans ce plan ; celle vue de chant se rappelle en légende.
  hc_mm:  number              // conduit commun
  hb_mm?: number | null       // branche — null tant qu'elle n'est pas désignée
  hs_mm?: number | null       // trajet droit amont — null de même
  Qb?:    number | null
  Qs?:    number | null
  Qc?:    number | null
}) {
  const f = (v: number) => +v.toFixed(1)

  // Hauteurs dessinées, bornées en bas : sous un tiers la branche ne serait plus
  // qu'un trait. Tant que les rôles ne sont pas tranchés, les deux entrants
  // prennent la même valeur de convention.
  // Faute de rôles désignés, les trois conduits prennent la même dimension : le
  // dessin ne suggère alors aucun rapport de sections qu'on ne connaît pas encore.
  const rap = (d: number | null | undefined, def: number) => d != null && hc_mm > 0
    ? Math.min(1, Math.max(0.30, d / hc_mm)) : def
  const hc = 50, hb = 50 * rap(hb_mm, 1)
  /** Sans valeur connue, la cote ne nomme pas sa dimension : écrire H ou L
   *  trancherait un plan de coupe que rien n'a encore fixé. */
  const cotxt = (ind: string, v?: number | null) =>
    v == null ? '' : sansLettre ? `${Math.round(v)} mm`
      : `${lettre}${ind} = ${Math.round(v)} mm`
  // La paroi extérieure du coude doit pouvoir rejoindre la paroi basse amont :
  // il y faut Hs + Hb ≥ Hc. Le cas contraire — un commun plus haut que ses deux
  // entrants empilés — ne se dessine pas, la hauteur amont y est donc relevée.
  const hs = Math.max(50 * rap(hs_mm, 1), hc - hb)

  const arm = 66
  const yTop = -hc                     // paroi haute, droite de bout en bout
  const yS   = -hc + 2 * hs            // paroi basse du trajet droit amont
  const yC   = hc                      // paroi basse du commun
  // r est le rayon de **gorge** : la paroi intérieure du virage est à r de son
  // centre, l'extérieure à r + wb, et l'axe à r + wb/2. Avec r/wb = 1 le virage
  // est donc ample, sa paroi intérieure ayant le rayon de la largeur de branche.
  const rIn  = 2 * hb                  // rayon de gorge = wb
  const R    = rIn + hb                // rayon d'axe
  const rOut = rIn + 2 * hb            // rayon extérieur
  const xc   = arm + hb                // axe de la partie verticale de la branche
  const yQ   = yC + rIn                // début du coude, sur cet axe
  const cx   = xc + R, cy = yQ         // centre du coude
  // Rencontre de la paroi extérieure avec la paroi basse amont : le pied de la
  // fourche. La borne sur hs garantit que la racine existe.
  const dx   = Math.sqrt(Math.max(0, rOut * rOut - (yS - cy) ** 2))
  const xF   = cx - dx
  const xEnd = cx + arm
  const yB   = yQ + arm                // extrémité libre de la branche

  const annL = mini ? 0 : 62, annR = mini ? 0 : 62
  const annT = mini ? 4 : 16, annB = mini ? 4 : 46
  const contentW = xEnd + annL + annR
  const contentH = (yB - yTop) + annT + annB
  const VW = 500, M = 16
  const VH  = Math.max(150, Math.min(420, (VW - 2 * M) * contentH / contentW + 2 * M))
  const scl = Math.min((VW - 2 * M) / contentW, (VH - 2 * M) / contentH)
  const tx  = M + ((VW - 2 * M) - contentW * scl) / 2 + annL * scl
  const ty  = M + ((VH - 2 * M) - contentH * scl) / 2 + (annT - yTop) * scl
  const vx  = (w: number) => +(tx + w * scl).toFixed(1)
  const vy  = (w: number) => +(ty + w * scl).toFixed(1)
  const sw  = mini ? f(0.05 * 2 * hc * scl) : 3

  // Silhouette fermée. Les extrémités de gaine rectangulaire se coupent au trait
  // droit — l'onde est la marque des gaines rondes.
  const arc = (r: number, sweep: 0 | 1, x: number, y: number) =>
    `A ${f(r * scl)} ${f(r * scl)} 0 0 ${sweep} ${vx(x)} ${vy(y)}`
  const d = [
    `M ${vx(0)} ${vy(yTop)}`,
    `L ${vx(xEnd)} ${vy(yTop)}`,
    `L ${vx(xEnd)} ${vy(yC)}`,
    `L ${vx(cx)} ${vy(yC)}`,
    arc(rIn, 0, xc + hb, yQ),          // paroi intérieure du coude
    `L ${vx(xc + hb)} ${vy(yB)}`,
    `L ${vx(xc - hb)} ${vy(yB)}`,
    `L ${vx(xc - hb)} ${vy(yQ)}`,
    arc(rOut, 1, xF, yS),              // paroi extérieure, jusqu'au pied de fourche
    `L ${vx(0)} ${vy(yS)}`,
    'Z',
  ].join(' ')

  const ann = '#64748b'

  const arrow = (ax: number, ay: number, bx: number, by: number) => {
    const ux0 = bx - ax, uy0 = by - ay, l = Math.hypot(ux0, uy0) || 1
    const ux = ux0 / l, uy = uy0 / l
    const kx = bx - 14 * ux, ky = by - 14 * uy
    return <>
      <line x1={vx(ax)} y1={vy(ay)} x2={vx(kx)} y2={vy(ky)} stroke={ann} strokeWidth="1.5" />
      <path fill={ann} d={`M ${vx(bx)} ${vy(by)} L ${vx(kx - 7 * uy)} ${vy(ky + 7 * ux)} `
        + `L ${vx(kx + 7 * uy)} ${vy(ky - 7 * ux)} Z`} />
    </>
  }

  const long = (l: string[]) => Math.max(...l.map(s => s.length))
  const fsOf = (l: string[], avail: number) =>
    Math.max(8.5, Math.min(12, avail * scl / (0.55 * long(l))))
  const texte = (X: number, Y: number, l: string[], avail: number) => {
    const fz = fsOf(l, avail)
    return (
      <text x={X} y={f(Y - (l.length - 1) * 0.55 * fz)} fontSize={f(fz)} fill={ann}
        textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
        paintOrder="stroke" stroke="white" strokeWidth="4">
        {l.map((s, i) => <tspan key={i} x={X} dy={i === 0 ? 0 : f(1.15 * fz)}>{s}</tspan>)}
      </text>
    )
  }
  const debit = (t: string, q?: number | null) =>
    [q != null && isFinite(q) ? `${t} = ${Math.round(q)} m³/h` : t]

  /** Cote perpendiculaire à une coupe, orientable comme celles des transitions. */
  const cote = (Ax: number, Ay: number, Bx: number, By: number,
                nx: number, ny: number, txt: string) => {
    const [ax, ay] = [vx(Ax), vy(Ay)], [bx, by] = [vx(Bx), vy(By)]
    const o = (k: number, X: number, Y: number): [number, number] =>
      [+(X + k * nx).toFixed(1), +(Y + k * ny).toFixed(1)]
    const t1 = 6 * scl, t2 = 22 * scl, td = 14 * scl
    const [a6, a6y] = o(t1, ax, ay), [a2, a2y] = o(t2, ax, ay)
    const [b6, b6y] = o(t1, bx, by), [b2, b2y] = o(t2, bx, by)
    const [d1, d1y] = o(td, ax, ay), [d2, d2y] = o(td, bx, by)
    const [lx, ly] = o(td + 15, (ax + bx) / 2, (ay + by) / 2)
    let rot = Math.atan2(by - ay, bx - ax) * 180 / Math.PI
    if (rot > 90) rot -= 180
    if (rot < -90) rot += 180
    return <>
      <line x1={a6} y1={a6y} x2={a2} y2={a2y} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={b6} y1={b6y} x2={b2} y2={b2y} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={d1} y1={d1y} x2={d2} y2={d2y} stroke={ann} strokeWidth="1" strokeLinecap="round" />
      <text x={lx} y={ly} fontSize="13" fill={ann}
        textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
        paintOrder="stroke" stroke="white" strokeWidth="4"
        transform={`rotate(${f(rot)}, ${lx}, ${ly})`}>{txt}</text>
    </>
  }

  // Cotation du virage, à la manière des coudes : les deux rayons d'extrémité
  // en tirets — l'un horizontal dans le prolongement de la branche, l'autre
  // vertical dans celui du commun —, l'arc de l'angle entre les deux, et le
  // rayon lui-même en trait plein sur l'horizontale. L'étiquette se pose au-delà
  // du centre, hors de la gaine : le centre du virage tombe justement dans le
  // vide, sous le commun et à droite du coude.
  // Le rayon se cote en diagonale, du centre vers la gorge du virage. L'angle
  // droit entre les deux rayons d'extrémité se marque au carré, et non à l'arc.
  const uR   = Math.SQRT1_2
  const rTxt = hb_mm != null ? `r = ${Math.round(hb_mm)} mm` : ''

  // Débits : sur l'axe de chaque conduit, étiquette au-dessus de la flèche.
  const yAxS = (yTop + yS) / 2
  const lS = debit('Qs', Qs), lC = debit('Qc', Qc), lB = debit('Qb', Qb)
  const demi = (l: string[]) => 0.55 * fsOf(l, arm) * long(l) / (2 * scl)
  const yMid = (yQ + 0.2 * arm + yQ + 0.78 * arm) / 2

  return (
    <svg viewBox={`0 0 ${VW} ${f(VH)}`} width="100%" height="100%"
      style={{ display: 'block' }} overflow="visible">
      <path d={d} fill="#f1f5f9" stroke="#374151" strokeWidth={sw}
        strokeLinejoin="round" strokeLinecap="round" />
      {!mini && <>
        {/* Rayon et angle du virage — c'est la condition d'emploi du fitting */}
        {/* Les deux rayons d'extrémité, en tirets, s'arrêtent à la paroi :
            l'horizontale au flanc de la branche, la verticale à la paroi basse
            du commun. */}
        <line x1={vx(xc + hb)} y1={vy(cy)} x2={vx(cx)} y2={vy(cy)}
          stroke={ann} strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <line x1={vx(cx)} y1={vy(cy)} x2={vx(cx)} y2={vy(yC)}
          stroke={ann} strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        {/* Angle droit au carré, entre les deux rayons */}
        <path d={`M ${f(vx(cx) - 11)} ${vy(cy)} L ${f(vx(cx) - 11)} ${f(vy(cy) - 11)} `
          + `L ${vx(cx)} ${f(vy(cy) - 11)}`}
          stroke={ann} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        {/* Le rayon se cote jusqu'à la gorge, où il vient buter sur la paroi
            intérieure — c'est elle que r mesure. */}
        <line x1={vx(cx)} y1={vy(cy)} x2={vx(cx - rIn * uR)} y2={vy(cy - rIn * uR)}
          stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx={vx(cx)} cy={vy(cy)} r="2" fill={ann} />
        <text x={f(vx(cx) + 10)} y={vy(cy)} fontSize="12" fill={ann}
          textAnchor="start" dominantBaseline="middle" fontStyle="italic"
          paintOrder="stroke" stroke="white" strokeWidth="4">{rTxt}</text>

        {/* Sens d'écoulement : les deux arrivées convergent vers le commun */}
        {arrow(12, yAxS, 12 + 0.62 * arm, yAxS)}
        {texte(vx(Math.max(0.5 * arm, demi(lS))), f(vy(yAxS) - 15), lS, arm)}
        {arrow(xc, yB - 0.18 * arm, xc, yQ + 0.24 * arm)}
        {texte(vx(xc + 13 + demi(lB)), vy(yMid), lB, 1.5 * arm)}
        {arrow(xEnd - 0.72 * arm, 0, xEnd - 12, 0)}
        {texte(vx(Math.min(xEnd - 0.5 * arm, xEnd - demi(lC))), f(vy(0) - 15), lC, arm)}

        {/* Hauteurs des trois conduits — la largeur, vue de chant, est en légende */}
        {cote(0, yTop, 0, yS, -1, 0, cotxt('s', hs_mm))}
        {cote(xEnd, yTop, xEnd, yC, 1, 0, cotxt('c', hc_mm))}
        {cote(xc - hb, yB, xc + hb, yB, 0, 1, cotxt('b', hb_mm))}
      </>}
    </svg>
  )
}

// ── Schéma ASHRAE 5-9 — entrée de branche à 45°, vue de profil ──────────────
// Le principal traverse à section constante, paroi haute droite. La branche est
// verticale ; c'est sa paroi aval qui s'ouvre à 45° vers le commun, sur une
// longueur L = 0,25 W jamais inférieure à trois pouces. Cette longueur est une
// condition de fabrication du raccord, pas une variable des tables.
function SchemaTee59({
  mini, lettre = 'H', sansLettre, hc_mm, hb_mm, hs_mm, L_mm, Qb, Qs, Qc,
}: {
  mini?:   boolean
  lettre?: 'H' | 'L'
  sansLettre?: boolean
  hc_mm:  number
  hb_mm?: number | null
  hs_mm?: number | null
  L_mm?:  number | null       // longueur de l'entrée à 45°, en mm
  Qb?:    number | null
  Qs?:    number | null
  Qc?:    number | null
}) {
  const f = (v: number) => +v.toFixed(1)

  const rap = (d: number | null | undefined, def: number) => d != null && hc_mm > 0
    ? Math.min(1, Math.max(0.30, d / hc_mm)) : def
  const hc = 50, hb = 50 * rap(hb_mm, 1)
  const hs = 50 * rap(hs_mm, 1)

  const arm = 66
  const yTop = -hc                     // paroi haute, droite de bout en bout
  const yS   = -hc + 2 * hs            // paroi basse amont
  const yC   = hc                      // paroi basse du commun
  // Longueur du sabot, à l'échelle de la branche dessinée. Faute de dimensions
  // connues, le rapport publié de 0,25 sert de convention.
  const Ld   = 2 * hb * (hb_mm != null && L_mm != null && hb_mm > 0
    ? L_mm / hb_mm : 0.25)
  const xc   = arm + hb                // axe de la branche
  const xD   = xc + hb + Ld            // pied du sabot, sur la paroi du commun
  const xEnd = xD + arm
  const yB   = yC + Ld + arm           // extrémité libre de la branche

  const annL = mini ? 0 : 62, annR = mini ? 0 : 62
  const annT = mini ? 4 : 16, annB = mini ? 4 : 46
  const contentW = xEnd + annL + annR
  const contentH = (yB - yTop) + annT + annB
  const VW = 500, M = 16
  const VH  = Math.max(150, Math.min(420, (VW - 2 * M) * contentH / contentW + 2 * M))
  const scl = Math.min((VW - 2 * M) / contentW, (VH - 2 * M) / contentH)
  const tx  = M + ((VW - 2 * M) - contentW * scl) / 2 + annL * scl
  const ty  = M + ((VH - 2 * M) - contentH * scl) / 2 + (annT - yTop) * scl
  const vx  = (w: number) => +(tx + w * scl).toFixed(1)
  const vy  = (w: number) => +(ty + w * scl).toFixed(1)
  const sw  = mini ? f(0.05 * 2 * hc * scl) : 3

  // Silhouette fermée, toutes coupes droites : les trois conduits sont
  // rectangulaires. La paroi aval de la branche s'ouvre à 45° vers la droite.
  const d = [
    'M ' + vx(0) + ' ' + vy(yTop),
    'L ' + vx(xEnd) + ' ' + vy(yTop),
    'L ' + vx(xEnd) + ' ' + vy(yC),
    'L ' + vx(xD) + ' ' + vy(yC),
    'L ' + vx(xc + hb) + ' ' + vy(yC + Ld),     // sabot à 45°
    'L ' + vx(xc + hb) + ' ' + vy(yB),
    'L ' + vx(xc - hb) + ' ' + vy(yB),
    'L ' + vx(xc - hb) + ' ' + vy(yS),
    'L ' + vx(0) + ' ' + vy(yS),
    'Z',
  ].join(' ')

  const ann = '#64748b'

  const arrow = (ax: number, ay: number, bx: number, by: number) => {
    const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy) || 1
    const ux = dx / l, uy = dy / l
    const kx = bx - 14 * ux, ky = by - 14 * uy
    return <>
      <line x1={vx(ax)} y1={vy(ay)} x2={vx(kx)} y2={vy(ky)} stroke={ann} strokeWidth="1.5" />
      <path fill={ann} d={'M ' + vx(bx) + ' ' + vy(by)
        + ' L ' + vx(kx - 7 * uy) + ' ' + vy(ky + 7 * ux)
        + ' L ' + vx(kx + 7 * uy) + ' ' + vy(ky - 7 * ux) + ' Z'} />
    </>
  }

  const long = (l: string[]) => Math.max(...l.map(s => s.length))
  const fsOf = (l: string[], avail: number) =>
    Math.max(8.5, Math.min(12, avail * scl / (0.55 * long(l))))
  const texte = (X: number, Y: number, l: string[], avail: number) => {
    const fz = fsOf(l, avail)
    return (
      <text x={X} y={f(Y - (l.length - 1) * 0.55 * fz)} fontSize={f(fz)} fill={ann}
        textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
        paintOrder="stroke" stroke="white" strokeWidth="4">
        {l.map((s, i) => <tspan key={i} x={X} dy={i === 0 ? 0 : f(1.15 * fz)}>{s}</tspan>)}
      </text>
    )
  }
  const debit = (t: string, q?: number | null) =>
    [q != null && isFinite(q) ? t + ' = ' + Math.round(q) + ' m³/h' : t]
  const cotxt = (ind: string, v?: number | null) =>
    v == null ? '' : sansLettre ? Math.round(v) + ' mm'
      : lettre + ind + ' = ' + Math.round(v) + ' mm'

  const cote = (Ax: number, Ay: number, Bx: number, By: number,
                nx: number, ny: number, txt: string) => {
    if (!txt) return null
    const [ax, ay] = [vx(Ax), vy(Ay)], [bx, by] = [vx(Bx), vy(By)]
    const o = (k: number, X: number, Y: number): [number, number] =>
      [+(X + k * nx).toFixed(1), +(Y + k * ny).toFixed(1)]
    const t1 = 6 * scl, t2 = 22 * scl, td = 14 * scl
    const [a6, a6y] = o(t1, ax, ay), [a2, a2y] = o(t2, ax, ay)
    const [b6, b6y] = o(t1, bx, by), [b2, b2y] = o(t2, bx, by)
    const [d1, d1y] = o(td, ax, ay), [d2, d2y] = o(td, bx, by)
    const [lx, ly] = o(td + 15, (ax + bx) / 2, (ay + by) / 2)
    let rot = Math.atan2(by - ay, bx - ax) * 180 / Math.PI
    if (rot > 90) rot -= 180
    if (rot < -90) rot += 180
    return <>
      <line x1={a6} y1={a6y} x2={a2} y2={a2y} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={b6} y1={b6y} x2={b2} y2={b2y} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
      <line x1={d1} y1={d1y} x2={d2} y2={d2y} stroke={ann} strokeWidth="1" strokeLinecap="round" />
      <text x={lx} y={ly} fontSize="13" fill={ann}
        textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
        paintOrder="stroke" stroke="white" strokeWidth="4"
        transform={'rotate(' + f(rot) + ', ' + lx + ', ' + ly + ')'}>{txt}</text>
    </>
  }

  const yAxS = (yTop + yS) / 2
  const lS = debit('Qs', Qs), lC = debit('Qc', Qc), lB = debit('Qb', Qb)
  const demi = (l: string[]) => 0.55 * fsOf(l, arm) * long(l) / (2 * scl)
  const yMidB = (yC + Ld + yB) / 2

  // Sommet du sabot : l'angle s'y mesure entre la paroi verticale et la pente.
  const sx = xc + hb, sy = yC + Ld
  const aR = Math.max(0.28 * arm, Math.min(0.55 * Ld, 0.5 * arm))

  return (
    <svg viewBox={'0 0 ' + VW + ' ' + f(VH)} width="100%" height="100%"
      style={{ display: 'block' }} overflow="visible">
      <path d={d} fill="#f1f5f9" stroke="#374151" strokeWidth={sw}
        strokeLinejoin="round" strokeLinecap="round" />
      {!mini && <>
        {/* Sens d'écoulement */}
        {arrow(12, yAxS, 12 + 0.62 * arm, yAxS)}
        {texte(vx(Math.max(0.5 * arm, demi(lS))), f(vy(yAxS) - 15), lS, arm)}
        {arrow(xc, yB - 0.18 * arm, xc, yC + Ld + 0.24 * arm)}
        {texte(vx(xc + 13 + demi(lB)), vy(yMidB), lB, 1.5 * arm)}
        {arrow(xEnd - 0.72 * arm, 0, xEnd - 12, 0)}
        {texte(vx(Math.min(xEnd - 0.5 * arm, xEnd - demi(lC))), f(vy(0) - 15), lC, arm)}

        {/* Sections, puis longueur de l'entrée à 45° le long du commun */}
        {cote(0, yTop, 0, yS, -1, 0, cotxt('s', hs_mm))}
        {cote(xEnd, yTop, xEnd, yC, 1, 0, cotxt('c', hc_mm))}
        {cote(xc - hb, yB, xc + hb, yB, 0, 1, cotxt('b', hb_mm))}
        {/* L se mesure en hauteur, de la paroi du commun au départ de la pente.
            Une ligne de rappel amène ce niveau à gauche de la branche, où la
            cote trouve la place de se lire. */}
        {L_mm != null && (() => {
          const xg = xc - hb - 16, xt = f(vx(xg) - 8), ym = vy(yC + Ld / 2)
          return <>
            <line x1={vx(sx)} y1={vy(sy)} x2={f(vx(xg) - 6)} y2={vy(sy)}
              stroke={ann} strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
            <line x1={vx(xc - hb)} y1={vy(yC)} x2={f(vx(xg) - 6)} y2={vy(yC)}
              stroke={ann} strokeWidth="1" strokeLinecap="round" />
            <line x1={vx(xg)} y1={vy(yC)} x2={vx(xg)} y2={vy(sy)}
              stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
            <text x={xt} y={ym} fontSize="13" fill={ann}
              textAnchor="end" dominantBaseline="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">
              L = {Math.round(L_mm)} mm
            </text>
          </>
        })()}
      </>}
    </svg>
  )
}

function TypeCard({ label, title, selected, onClick, angle, dc_mm, db_mm, ds_mm,
                   rect, coude, brect, e45, hautPlat }: {
  label: readonly string[]; title: string; selected: boolean; onClick: () => void
  angle: number; dc_mm: number; db_mm?: number | null; ds_mm?: number | null
  rect: boolean; coude: boolean; brect: boolean; e45: boolean; hautPlat: boolean
}) {
  return (
    <button onClick={onClick} title={title} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '7px 5px 7px',
      border: `1.5px solid ${selected ? '#2563eb' : '#e2e8f0'}`,
      borderRadius: 8,
      background: selected ? '#eff6ff' : '#f8fafc',
      cursor: 'pointer', transition: 'all 0.12s',
      boxShadow: selected ? '0 0 0 3px #2563eb22' : 'none',
    }}>
      <div style={{ width: '100%', height: 58 }}>
        {e45
          ? <SchemaTee59 mini hc_mm={dc_mm} hb_mm={db_mm} hs_mm={ds_mm}
              L_mm={db_mm != null ? longueurEntree59(db_mm) : null} />
          : coude
          ? <SchemaTee56 mini hc_mm={dc_mm} hb_mm={db_mm} hs_mm={ds_mm} />
          : <SchemaJunction mini angle={angle} mainRect={rect} branchRect={brect}
              defRatio={rect ? 1 : 0.5} hautPlat={hautPlat}
              dc_mm={dc_mm} db_mm={db_mm} ds_mm={ds_mm} />}
      </div>
      <span style={{
        fontSize: 9, fontWeight: selected ? 700 : 500,
        color: selected ? '#1d4ed8' : '#64748b',
        textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', width: '100%', display: 'block',
      }}>
        {label.join(' · ')}
      </span>
    </button>
  )
}

export default function JunctionModal({
  isOpen, onClose, onSave, editing, arms, common, rho, nodeInfo,
}: Props) {
  const [famKey,  setFamKey]  = useState<string>(FAMILIES[0].key)
  const [angle,   setAngle]   = useState<number>(90)
  const [branch,  setBranch]  = useState<string | null>(null)
  const [orient,  setOrient]  = useState<'horizontal' | 'vertical'>('vertical')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (isOpen) {
      requestAnimationFrame(() => setMounted(true))
      setFamKey(editing ? famDe(editing.type) : FAMILIES[0].key)
      setAngle(editing ? JUNCTION_ANGLE[editing.type] : 90)
      // Par défaut aucune arrivée n'est désignée : le rôle n'est pas devinable.
      setBranch(editing?.branchSegId ?? null)
      // Une branche qui arrive par en dessous se coude dans un plan vertical :
      // sa dimension de référence est alors la hauteur.
      setOrient(editing?.orientation ?? 'vertical')
    } else setMounted(false)
  }, [isOpen, editing])

  if (!isOpen) return null

  const dis  = arms.map(a => ({ segId: a.segId, di_mm: a.di_mm, shape: a.shape,
    a_mm: a.a_mm, b_mm: a.b_mm, A_mm2: a.A_mm2 }))
  const dcom = { segId: common.segId, di_mm: common.di_mm, shape: common.shape,
    a_mm: common.a_mm, b_mm: common.b_mm, A_mm2: common.A_mm2 }
  // Les raccords réellement applicables sont décidés une seule fois, au même
  // endroit que le panneau : une famille n'est offerte que si l'un de ses types
  // en fait partie.
  const util = junctionTypesApplicables(arms, common)
  /** Angles d'une famille que ce nœud permet réellement de calculer. */
  const anglesDe = (f: Family) =>
    (f.angles as readonly number[]).filter(a => util.includes(typeOf(f, a, util)))
  // Cartes à présenter. Une famille liée à une forme ne sort que sur cette
  // forme ; celle qui n'en impose aucune sort partout. Un même modèle n'est
  // jamais proposé deux fois : la première famille qui le porte se le réserve,
  // ce qui laisse le 60° au sélecteur cylindrique quand celui-ci s'applique.
  const pris = new Set<JunctionType>()
  const cartes: { f: Family; angs: number[] }[] = []
  for (const f of FAMILIES) {
    if (!(f as any).libreShape && f.shape !== common.shape) continue
    const d = anglesDe(f).filter(a => !pris.has(typeOf(f, a, util)))
    if (d.length === 0) continue
    // Une famille attachée à une forme ne se montre pas pour son seul angle de
    // repli : « Collecteur cylindrique » n'ayant que le 60° à offrir ne dirait
    // rien de juste. Cet angle revient alors à la famille sans contrainte.
    if (!(f as any).libreShape && !d.some(a => !isFallback(typeOf(f, a, util)))) continue
    d.forEach(a => pris.add(typeOf(f, a, util)))
    cartes.push({ f, angs: d })
  }
  const vide = cartes.length === 0
  const choix = cartes.find(c => c.f.key === famKey) ?? cartes[0]
  const fam   = choix?.f ?? FAMILIES[0]
  const angs  = choix?.angs ?? []
  const ang   = angs.includes(angle) ? angle : (angs[0] ?? fam.angles[0])
  const type  = typeOf(fam, ang, util)

  // Cylindrique : les rôles découlent des diamètres et ne sont demandés que si
  // les deux arrivées portent celui du commun. Conique : toujours demandés.
  const roles = resolveArmsFor(type, dis, dcom, branch)
  const pret  = roles.ok
  const motif = roles.ok || roles.ambigu ? null : roles.reason
  const armB  = roles.ok ? arms.find(a => a.segId === roles.branchId)! : null
  const armS  = roles.ok ? arms.find(a => a.segId === roles.straightId)! : null
  // Dimension vue dans le plan du schéma : le diamètre en circulaire, la hauteur
  // en rectangulaire. Tant que la branche n'est pas désignée, les deux entrants
  // restent indéterminés plutôt que d'inventer une valeur.
  // Formes à dessiner. Les raccords à forme imposée les tiennent de leur
  // définition ; celui qui n'en impose aucune les lit sur les conduits.
  const fsh    = junctionShapes(type)
  const libre  = shapeLibre(type)
  const mRect  = libre ? common.shape === 'rectangular' : fsh.main === 'rectangular'
  const bRectF = libre
    ? (armB ? armB.shape === 'rectangular'
      : arms.every(a => a.shape === 'rectangular'))
    : fsh.branch === 'rectangular'
  // Un plan de coupe n'a de sens que si au moins un conduit est rectangulaire.
  const rectF = mRect || bRectF
  const coude  = type === 'jonc-5-6'    // seul raccord dont la branche est coudée
  const e45    = type === 'jonc-5-9'    // branche verticale, sabot aval à 45°
  // Le plan de coupe décide de la dimension vue ; l'autre, vue de chant, ne se
  // dessine pas et se rappelle sous le schéma. Une branche ronde, elle, montre
  // son diamètre dans les deux plans.
  const vert  = orient === 'vertical'
  const LET   = vert ? 'H' : 'L'
  const CHANT = vert ? 'L' : 'H'
  const plan  = (a: JunctionArm) => a.shape === 'rectangular'
    ? ((vert ? a.b_mm : a.a_mm) ?? 0) : a.di_mm
  const chant = (a: JunctionArm) => (vert ? a.a_mm : a.b_mm) ?? 0
  // plan() rend déjà le diamètre d'une gaine ronde : il vaut pour les deux formes.
  const vue   = (a: JunctionArm | null) => a == null ? null : plan(a)
  const dB = vue(armB)
  const dS = rectF || fam.conical || libre ? vue(armS) : common.di_mm
  const dC = plan(common)
  // Seuls les conduits rectangulaires ont une dimension vue de chant à rappeler.
  const lg = (a: JunctionArm | null) =>
    a && a.shape === 'rectangular' ? Math.round(chant(a)) : null
  const lgC = lg(common), lgB = lg(armB), lgS = lg(armS)
  const largeurs = !rectF ? null
    : lgB == null
      ? (lgS != null && lgS === lgC ? `${CHANT} = ${lgC} mm`
        : `${CHANT}s = ${lgS ?? '—'} · ${CHANT}c = ${lgC} mm`)
      : lgS != null && lgB === lgC && lgS === lgC
        ? `${CHANT} = ${lgC} mm`
        : `${CHANT}s = ${lgS ?? '—'} · ${CHANT}b = ${lgB} · ${CHANT}c = ${lgC} mm`

  const Vc = common.A_mm2 > 0 ? (common.Q_m3h / 3600) / (common.A_mm2 / 1e6) : 0
  const pdyn = 0.5 * rho * Vc * Vc
  const res = pret ? computeXiJunction(type, {
    Qb: armB!.Q_m3h, Qs: armS!.Q_m3h, Qc: common.Q_m3h,
    Ab: armB!.A_mm2, As: armS!.A_mm2, Ac: common.A_mm2,
    Vc_ms: Vc,                 // le 5-7 change de régime à 1200 fpm
    Ws: armS!.a_mm, Hs: armS!.b_mm, Wc: common.a_mm, Hc: common.b_mm,
  }) : null
  // Chaque trajet vit sa vie : sur le té rectangulaire, les deux coefficients se
  // lisent sur des rapports de débit différents, donc l'un peut sortir du domaine
  // sans l'autre. Le motif accompagne alors le trajet concerné.
  const rien = pret && res!.Ccb == null && res!.Ccs == null

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

  /** Un trajet : son couple coefficient / perte, ou le motif de son absence. */
  const trajet = (titre: string, nom: string, dp: string,
                  cc: number | null, motifCc: string | null, bas: number) => (
    <div style={{ marginBottom: bas }}>
      <div style={{ ...sectionTitle, marginBottom: 6 }}>{titre}</div>
      {cc == null ? (
        <div style={{ fontSize: 10.5, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.45 }}>
          {motifCc}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          {carte(<><span style={{ textTransform: 'uppercase' as const }}>Coeff.</span>{' ' + nom}</>,
            cc.toFixed(3), null, '#eff6ff', '#bfdbfe', '#93c5fd', '#1d4ed8')}
          {carte(dp, (cc * pdyn).toFixed(2), 'Pa', '#f0fdfa', '#99f6e4', '#2dd4bf', '#0f766e')}
        </div>
      )}
    </div>
  )

  /** Une carte de résultat, au gabarit de celles de la transition. */
  const carte = (titre: React.ReactNode, val: string, unite: string | null,
                 fond: string, bord: string, teinte: string, valeur: string) => (
    <div style={{ flex: 1, padding: '9px 12px', borderRadius: 7,
      background: fond, border: `1px solid ${bord}` }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: teinte,
        letterSpacing: '0.04em', marginBottom: 4 }}>{titre}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: valeur,
        fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
        {val}
        {unite && <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 3,
          color: '#0d9488' }}>{unite}</span>}
      </div>
    </div>
  )

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
              {editing ? 'Modifier la jonction' : 'Jonction convergente'}
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
          <div style={{ ...sectionTitle, marginBottom: 7 }}>Type de jonction</div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {vide && (
              <span style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic' }}>
                Aucun raccord répertorié ne couvre cette géométrie.
              </span>
            )}
            {/* Chaque vignette montre sa propre famille : les rôles se résolvent
                donc pour elle, et non pour celle qui est sélectionnée. Sans cela,
                le conique hériterait du trajet droit déduit par le cylindrique et
                se dessinerait sans cône. */}
            {cartes.map(({ f, angs: dispo }) => {
              const a  = dispo.includes(ang) ? ang : dispo[0]
              const r  = resolveArmsFor(typeOf(f, a, util), dis, dcom, branch)
              const rS = r.ok ? arms.find(x => x.segId === r.straightId)! : null
              const rB = r.ok ? arms.find(x => x.segId === r.branchId)! : null
              const re = f.shape === 'rectangular'
              const vu = (x: JunctionArm | null) =>
                x == null ? null : re ? plan(x) : x.di_mm
              return (
                <TypeCard key={f.key} label={f.label} title={f.title}
                  selected={f.key === fam.key} onClick={() => setFamKey(f.key)}
                  angle={a} rect={re} coude={typeOf(f, a, util) === 'jonc-5-6'}
                  brect={junctionShapes(typeOf(f, a, util)).branch === 'rectangular'}
                  e45={typeOf(f, a, util) === 'jonc-5-9'}
                  hautPlat={sectionsCompensees(typeOf(f, a, util))}
                  dc_mm={re ? plan(common) : common.di_mm}
                  db_mm={vu(rB)}
                  ds_mm={re || f.conical ? vu(rS) : common.di_mm} />
              )
            })}
          </div>
        </div>

        {/* ── Zone de détail ── */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {vide ? (
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
          ) : (<>

          {/* ── Schéma ── */}
          <div style={{
            position: 'relative', width: 400, flexShrink: 0,
            display: 'flex', flexDirection: 'column',
            borderRight: '1px solid #f1f5f9', background: '#f8fafd',
          }}>
            {rectF && (
              <div style={{
                position: 'absolute', top: 0, right: 0, zIndex: 2, pointerEvents: 'none',
                background: '#f1f5f9', borderBottom: '1px solid #cbd5e1',
                borderLeft: '1px solid #cbd5e1', borderRadius: '0 0 0 4px',
                width: 96, textAlign: 'center', boxSizing: 'border-box',
                padding: '2px 8px', fontSize: 11, color: '#94a3b8', fontStyle: 'italic',
              }}>
                {/* Le plan de coupe suit celui du coude : la hauteur se voit de
                    profil, la largeur de dessus. */}
                {vert ? 'Vue de profil' : 'Vue de dessus'}
              </div>
            )}
            <div style={{ flex: 1, padding: 0, minHeight: 0, overflow: 'hidden' }}>
              {e45
                ? <SchemaTee59 lettre={LET} sansLettre={!pret} hc_mm={dC} hb_mm={dB} hs_mm={dS}
                    L_mm={dB != null ? longueurEntree59(dB) : null}
                    Qb={armB?.Q_m3h} Qs={armS?.Q_m3h} Qc={common.Q_m3h} />
                : coude
                ? <SchemaTee56 lettre={LET} sansLettre={!pret} hc_mm={dC} hb_mm={dB} hs_mm={dS}
                    Qb={armB?.Q_m3h} Qs={armS?.Q_m3h} Qc={common.Q_m3h} />
                : <SchemaJunction angle={ang} dc_mm={dC} db_mm={dB} ds_mm={dS}
                    defRatio={rectF ? 1 : 0.5} sansLettre={rectF && !pret}
                    hautPlat={sectionsCompensees(type)}
                    mainRect={mRect} lettreMain={mRect ? LET : 'D'}
                    branchRect={bRectF} lettreBranche={bRectF ? LET : 'D'}
                    Qb={armB?.Q_m3h} Qs={armS?.Q_m3h} Qc={common.Q_m3h} />}
            </div>
            {largeurs && (
              <div style={{
                flexShrink: 0, padding: '0 12px 11px', textAlign: 'center',
                fontSize: 11, color: '#64748b', fontStyle: 'italic',
              }}>
                {largeurs}
              </div>
            )}
          </div>

          {/* ── Paramètres ── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '12px 16px 0 16px', flexShrink: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                {JUNCTION_LABELS[type]}
              </div>
              <div style={{ borderTop: '1px solid #f1f5f9' }} />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 14px 16px',
              display: 'flex', flexDirection: 'column' }}>

              {/* Angle du raccord — diagrammes distincts, jamais interpolés. Le té
                  rectangulaire n'en a qu'un : il n'y a rien à régler. */}
              {angs.length > 1 && (
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 74px',
                  rowGap: 10, columnGap: 8, alignItems: 'center',
                }}>
                  <span style={lbl}>Angle θ</span>
                  <select value={ang} onChange={e => setAngle(Number(e.target.value))}
                    style={{ ...inp, width: 74, cursor: 'pointer' }}>
                    {angs.map(a => <option key={a} value={a}>{a}°</option>)}
                  </select>
                </div>
              )}

              {/* Plan dans lequel la branche se coude. Il ne change aucun
                  coefficient — les tables ne connaissent que des sections — mais
                  il désigne le wb de la condition r/wb = 1 et fixe la coupe. */}
              {rectF && (
                <div style={{ marginBottom: 2 }}>
                  <div style={{ ...sectionTitle, marginBottom: 5 }}>Piquage de la branche</div>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {(['horizontal', 'vertical'] as const).map(o => {
                      const sel = orient === o
                      return (
                        <button key={o} onClick={() => setOrient(o)} style={{
                          flex: 1, display: 'flex', flexDirection: 'column',
                          alignItems: 'center', justifyContent: 'center',
                          padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                          border: `1.5px solid ${sel ? '#0284c7' : '#e2e8f0'}`,
                          background: sel ? '#e0f2fe' : '#f8fafc',
                          transition: 'all 0.12s',
                          boxShadow: sel ? '0 0 0 3px #0284c722' : 'none',
                        }}>
                          <span style={{ fontSize: 11.5, fontWeight: 700,
                            color: sel ? '#0369a1' : '#475569' }}>
                            {o === 'horizontal' ? 'Sur la largeur' : 'Sur la hauteur'}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Rôle des deux arrivées — demandé seulement s'il est indécidable.
                  Un rôle par tronçon, désigné explicitement : choisir l'un fixe
                  l'autre, il n'y a que deux arrivées. */}
              {roles.ambigu && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ ...sectionTitle, marginBottom: 7 }}>Rôle des tronçons entrants</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {arms.map(a => {
                      const estBranche = branch === a.segId
                      const estDroit   = branch !== null && !estBranche
                      const autre      = arms.find(x => x.segId !== a.segId)
                      const role = (actif: boolean, teinte: string, txt: string, onClick: () => void) => (
                        <button onClick={onClick} style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 9.5, fontWeight: 600,
                          border: `1px solid ${actif ? teinte : '#e2e8f0'}`,
                          background: actif ? teinte : '#f1f5f9',
                          color: actif ? '#fff' : '#64748b', cursor: 'pointer',
                          whiteSpace: 'nowrap' as const,
                        }}>{txt}</button>
                      )
                      return (
                        <div key={a.segId} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 10px', borderRadius: 7,
                          border: '1px solid #e2e8f0', background: '#f8fafc',
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b',
                              overflow: 'hidden', textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap' as const }}>
                              {a.label}
                            </div>
                            <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 1 }}>
                              {sect(a)} · {Math.round(a.Q_m3h)} m³/h
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                            {role(estDroit, '#6366f1', 'Trajet droit',
                              () => { if (autre) setBranch(autre.segId) })}
                            {role(estBranche, '#2563eb', 'Branche', () => setBranch(a.segId))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Résultat Cc / ΔP, un couple par trajet ── */}
              <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                {!pret ? (
                  motif && (
                    <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.45 }}>
                      {motif}
                    </div>
                  )
                ) : rien ? (
                  <div style={{ fontSize: 11, color: '#94a3b8', fontStyle: 'italic', lineHeight: 1.45 }}>
                    {res!.motifB}
                  </div>
                ) : (<>
                  {trajet('Trajet branche → commun', 'Cc,b', 'ΔP branche',
                    res!.Ccb, res!.motifB, 11)}
                  {trajet('Trajet droit → commun', 'Cc,s', 'ΔP droit',
                    res!.Ccs, res!.motifS, 0)}
                </>)}
              </div>
            </div>
          </div>
          </>)}
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
            onClick={() => { if (pret && !rien) onSave({
              id: editing?.id ?? newJunctionId(), type, branchSegId: branch,
              ...(rectF ? { orientation: orient } : {}),
            }) }}
            disabled={!pret || rien}
            style={{
              padding: '6px 18px', borderRadius: 6, border: 'none',
              background: pret && !rien ? '#2563eb' : '#e2e8f0',
              fontSize: 12, fontWeight: 700,
              color: pret && !rien ? '#fff' : '#94a3b8',
              cursor: pret && !rien ? 'pointer' : 'default', transition: 'background 0.1s',
            }}>
            {editing ? 'Enregistrer' : 'Ajouter'}
          </button>
        </div>

      </div>
    </>, document.body
  )
}
