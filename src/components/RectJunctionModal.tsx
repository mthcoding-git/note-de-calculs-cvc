import { useState, useEffect, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { NumInput } from './NumInput'
import type { RectJunctionType, RectNodeJunction, JunctionBranchRectInput } from '../utils/junctionCalc'
import {
  RECT_JUNCTION_LABELS, RECT_JUNCTION_NEEDS_ANGLE, RECT_JUNCTION_ANGLE_RANGE,
  computeXiJunctionRect, newJunctionId,
} from '../utils/junctionCalc'

// ── Props ─────────────────────────────────────────────────────────────────────

export interface AmontSegInfoRect {
  id:    string
  name:  string
  Q_m3h: number
  a_mm:  number
  b_mm:  number
}

interface Props {
  isOpen:    boolean
  onClose:   () => void
  onSave:    (j: RectNodeJunction) => void
  editing:   RectNodeJunction | null
  amontSegs: AmontSegInfoRect[]
  avalA_mm:  number
  avalB_mm:  number
  avalQ_m3h: number
  avalV_ms:  number
  rho:       number
}

// ── Schémas SVG ───────────────────────────────────────────────────────────────
// Vue en plan (dessus) — la largeur a_mm est représentée proportionnellement.
// La hauteur b_mm est annotée en texte.

function SchemaRectTee({ straightSegId, amontSegs, avalA_mm, avalB_mm, avalQ_m3h, alpha, mini, miniViewBox }: {
  straightSegId: string | null
  amontSegs:     AmontSegInfoRect[]
  avalA_mm:      number
  avalB_mm:      number
  avalQ_m3h:     number
  alpha:         number
  mini?:         boolean
  miniViewBox?:  string
}) {
  const f    = (v: number) => +v.toFixed(1)
  const fill = '#f1f5f9'
  const strk = '#374151'
  const jx   = 280, jy = 395

  const lateralSeg  = amontSegs.find(s => s.id !== straightSegId)
  const straightSeg = amontSegs.find(s => s.id === straightSegId)

  const Hr_a = straightSeg?.a_mm ?? avalA_mm
  const Hl_a = lateralSeg?.a_mm ?? avalA_mm
  const Hc = 55
  const Hr = Math.round(Math.min(70, Math.max(15, (Hr_a / avalA_mm) * Hc)))
  const Hl = Math.round(Math.min(65, Math.max(15, (Hl_a / avalA_mm) * Hc)))

  const αRad = Math.max(30, Math.min(90, alpha)) * Math.PI / 180
  const cosA = Math.cos(αRad), sinA = Math.sin(αRad)
  const bLen = 165

  const lOpX     = f(jx - Hl + bLen * cosA)
  const lOpY     = f(jy - Hc - bLen * sinA)
  const CLIP_X   = 460
  const rOpX_raw = jx + Hl + bLen * cosA
  const isClipped = rOpX_raw > CLIP_X
  const rOpX     = isClipped ? CLIP_X : f(rOpX_raw)
  const rOpY     = isClipped ? f(jy - Hc - (CLIP_X - jx - Hl) * sinA / cosA) : lOpY

  const outerPath = [
    `M 100 ${jy + Hc}`,
    `L 100 ${jy - Hc}`,
    `L ${jx - Hl} ${jy - Hc}`,
    `L ${lOpX} ${lOpY}`,
    `L ${rOpX} ${rOpY}`,
    `L ${jx + Hl} ${jy - Hc}`,
    ...(Hr !== Hc ? [`L ${jx + Hl} ${jy - Hr}`] : []),
    `L 460 ${jy - Hr}`,
    `L 460 ${jy + Hr}`,
    `L ${jx} ${jy + Hr}`,
    ...(Hr !== Hc ? [`L ${jx} ${jy + Hc}`] : []),
    `L 100 ${jy + Hc}`,
    'Z',
  ].join(' ')

  const arHalf    = 45
  const arRCenter = Math.round((jx + Hl + 460) / 2)
  const arRX1 = arRCenter + arHalf,  arRX2 = arRCenter - arHalf
  const arLCenter = Math.round((100 + jx) / 2)
  const arLX1 = arLCenter + arHalf,  arLX2 = arLCenter - arHalf
  const arBCX   = f(jx + (bLen / 2) * cosA)
  const arBCY   = f(jy - Hc - (bLen / 2) * sinA)
  const arBX1   = f(arBCX + arHalf * cosA)
  const arBY1   = f(arBCY - arHalf * sinA)
  const arBX2   = f(arBCX - arHalf * cosA)
  const arBY2   = f(arBCY + arHalf * sinA)
  const arBHead = [
    `${f(arBX2 + 5 * sinA)},${f(arBY2 + 5 * cosA)}`,
    `${f(arBX2 - 5 * sinA)},${f(arBY2 - 5 * cosA)}`,
    `${f(arBX2 - 12 * cosA)},${f(arBY2 + 12 * sinA)}`,
  ].join(' ')

  const topQ   = straightSegId !== null ? lateralSeg?.Q_m3h  : undefined
  const rightQ = straightSegId !== null ? straightSeg?.Q_m3h : undefined
  const qBX    = f(arBCX + 7 * sinA)
  const qBY    = f(arBCY + 7 * cosA)

  const lBarX = lOpX, lBarY = f(lOpY - 14)
  const rBarX = rOpX, rBarY = f(rOpY - 14)
  const dimBX = (lBarX + (isClipped ? lBarX : rBarX)) / 2
  const dimBY = f(lBarY - 12)
  const latLX     = isClipped ? f(rOpX - 8) : f(rOpX + 8 * sinA)
  const latLY     = f(+rOpY - 8 * cosA + 4)
  const latAnchor = isClipped ? 'end' : 'start'

  const arcR      = 28
  const arcCX     = jx + Hl
  const arcCY     = jy - Hr
  const arcStartX = f(arcCX + arcR)
  const arcStartY = f(arcCY)
  const arcEndX   = f(arcCX + arcR * cosA)
  const arcEndY   = f(arcCY - arcR * sinA)
  const bisRad    = (alpha / 2) * Math.PI / 180
  const arcTxtX   = f(arcCX + (arcR + 14) * Math.cos(bisRad))
  const arcTxtY   = f(arcCY - (arcR + 14) * Math.sin(bisRad))

  const dimC  = `${avalA_mm.toFixed(0)}×${avalB_mm.toFixed(0)}`
  const dimHr = straightSeg ? `${straightSeg.a_mm.toFixed(0)}×${straightSeg.b_mm.toFixed(0)}` : ''
  const dimHl = lateralSeg  ? `${lateralSeg.a_mm.toFixed(0)}×${lateralSeg.b_mm.toFixed(0)}`  : ''

  return (
    <svg viewBox={mini ? (miniViewBox ?? '100 140 360 390') : '60 140 440 390'}
      width="100%" height="100%"
      overflow={mini ? 'hidden' : 'visible'}
      style={{ display: 'block' }}>

      <path d={outerPath} fill={fill} stroke={strk} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />

      <line x1="100" y1={jy} x2="460" y2={jy}
        stroke="#94a3b8" strokeWidth="0.6" strokeDasharray="4 3" opacity="0.55" />

      <line x1={arRX1} y1={jy} x2={arRX2} y2={jy}
        stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" />
      <polygon points={`${arRX2},${jy-5} ${arRX2},${jy+5} ${arRX2-12},${jy}`} fill="#2563eb" />

      <line x1={arBX1} y1={arBY1} x2={arBX2} y2={arBY2}
        stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" />
      <polygon points={arBHead} fill="#2563eb" />

      <line x1={arLX1} y1={jy} x2={arLX2} y2={jy}
        stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" />
      <polygon points={`${arLX2},${jy-5} ${arLX2},${jy+5} ${arLX2-12},${jy}`} fill="#2563eb" />

      {!mini && <>
      <text x={arRCenter} y={jy - 11} textAnchor="middle" fontSize="9.5" fontWeight="700"
        fill="#2563eb" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {rightQ != null ? `${rightQ.toFixed(0)} m³/h` : '—'}
      </text>
      <text x={qBX} y={qBY} textAnchor="start" fontSize="9.5" fontWeight="700"
        fill="#2563eb" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {topQ != null ? `${topQ.toFixed(0)} m³/h` : '—'}
      </text>
      <text x={arLCenter} y={jy - 11} textAnchor="middle" fontSize="9.5" fontWeight="700"
        fill="#2563eb" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {avalQ_m3h.toFixed(0)} m³/h
      </text>

      <text x={latLX} y={latLY} textAnchor={latAnchor} fontSize="10.5" fill="#475569" fontStyle="italic">Latéral</text>
      <text x={460} y={jy - Hr - 8} textAnchor="end" fontSize="11" fill="#475569" fontStyle="italic">Rectiligne</text>
      <text x={100} y={jy - Hc - 8} textAnchor="start" fontSize="11" fill="#475569" fontStyle="italic">collecteur</text>

      <path d={`M ${arcStartX} ${arcStartY} A ${arcR} ${arcR} 0 0 0 ${arcEndX} ${arcEndY}`}
        fill="none" stroke="#374151" strokeWidth="1" />
      <text x={arcTxtX} y={arcTxtY} textAnchor="middle" fontSize="12" fontWeight="600"
        fill="#374151" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {alpha}°
      </text>

      {/* Cotes collecteur */}
      <line x1="81" y1={jy - Hc} x2="91" y2={jy - Hc} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="81" y1={jy + Hc} x2="91" y2={jy + Hc} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="86" y1={jy - Hc} x2="86" y2={jy + Hc} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      <text x="79" y={jy + 4} textAnchor="end" fontSize="10" fill="#64748b">{dimC} mm</text>

      {/* Cote branche latérale */}
      <line x1={lBarX} y1={f(lBarY - 5)} x2={lBarX} y2={f(lBarY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={rBarX} y1={f(rBarY - 5)} x2={rBarX} y2={f(rBarY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={lBarX} y1={lBarY} x2={rBarX} y2={rBarY} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      <text x={dimBX} y={dimBY} textAnchor="middle" fontSize="10" fill="#64748b">{dimHl} mm</text>

      {/* Cote branche rectiligne */}
      <line x1="469" y1={jy - Hr} x2="481" y2={jy - Hr} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="469" y1={jy + Hr} x2="481" y2={jy + Hr} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="475" y1={jy - Hr} x2="475" y2={jy + Hr} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      <text x="483" y={jy + 4} textAnchor="start" fontSize="10" fill="#64748b">{dimHr} mm</text>
      </>}
    </svg>
  )
}

function SchemaRectWye({ amontSegs, avalA_mm, avalB_mm, avalQ_m3h, alpha, mini, miniViewBox }: {
  amontSegs:    AmontSegInfoRect[]
  avalA_mm:     number
  avalB_mm:     number
  avalQ_m3h:    number
  alpha:        number
  mini?:        boolean
  miniViewBox?: string
}) {
  const f    = (v: number) => +v.toFixed(1)
  const fill = '#f1f5f9'
  const strk = '#374151'
  const jx = 280, jy = 335

  const seg0 = amontSegs[0]
  const seg1 = amontSegs[1]

  const Hc     = 55
  const Hb_up  = Math.round(Math.min(65, Math.max(12, ((seg0?.a_mm ?? avalA_mm) / avalA_mm) * Hc)))
  const Hb_lo  = Math.round(Math.min(65, Math.max(12, ((seg1?.a_mm ?? avalA_mm) / avalA_mm) * Hc)))
  const Hb_ref = Math.round((Hb_up + Hb_lo) / 2)

  const halfAlpha = alpha / 2
  const αRad = Math.max(30, Math.min(90, halfAlpha)) * Math.PI / 180
  const cosA = Math.cos(αRad), sinA = Math.sin(αRad)
  const bLen = 110

  const pX    = f(jx + Hb_ref - Hc / Math.tan(αRad))
  const arcCX = pX

  const jxIn = jx + Hb_ref
  const jxUp = jx + Hb_ref - 2 * Hb_up
  const jxLo = jx + Hb_ref - 2 * Hb_lo

  const lUpX = f(jxUp + bLen * cosA), lUpY = f(jy - Hc - bLen * sinA)
  const rUpX = f(jxIn + bLen * cosA), rUpY = lUpY
  const lLoX = f(jxLo + bLen * cosA), lLoY = f(jy + Hc + bLen * sinA)
  const rLoX = f(jxIn + bLen * cosA), rLoY = lLoY

  const outerPath = [
    `M 100 ${jy + Hc}`,
    `L 100 ${jy - Hc}`,
    `L ${jxUp} ${jy - Hc}`,
    `L ${lUpX} ${lUpY}`,
    `L ${rUpX} ${rUpY}`,
    `L ${pX} ${jy}`,
    `L ${rLoX} ${rLoY}`,
    `L ${lLoX} ${lLoY}`,
    `L ${jxLo} ${jy + Hc}`,
    `L 100 ${jy + Hc}`,
    'Z',
  ].join(' ')

  const arCC  = Math.round((100 + Math.min(jxUp, jxLo)) / 2)
  const arHalf = 45
  const arUpCX = f((jxUp + jxIn) / 2 + (bLen / 2) * cosA)
  const arUpCY = f(jy - Hc - (bLen / 2) * sinA)
  const arUpX1 = f(arUpCX + arHalf * cosA), arUpY1 = f(arUpCY - arHalf * sinA)
  const arUpX2 = f(arUpCX - arHalf * cosA), arUpY2 = f(arUpCY + arHalf * sinA)
  const arUpHead = [
    `${f(arUpX2 + 5 * sinA)},${f(arUpY2 + 5 * cosA)}`,
    `${f(arUpX2 - 5 * sinA)},${f(arUpY2 - 5 * cosA)}`,
    `${f(arUpX2 - 12 * cosA)},${f(arUpY2 + 12 * sinA)}`,
  ].join(' ')
  const arLoCX = f((jxLo + jxIn) / 2 + (bLen / 2) * cosA)
  const arLoCY = f(jy + Hc + (bLen / 2) * sinA)
  const arLoX1 = f(arLoCX + arHalf * cosA), arLoY1 = f(arLoCY + arHalf * sinA)
  const arLoX2 = f(arLoCX - arHalf * cosA), arLoY2 = f(arLoCY - arHalf * sinA)
  const arLoHead = [
    `${f(arLoX2 - 5 * sinA)},${f(arLoY2 + 5 * cosA)}`,
    `${f(arLoX2 + 5 * sinA)},${f(arLoY2 - 5 * cosA)}`,
    `${f(arLoX2 - 12 * cosA)},${f(arLoY2 - 12 * sinA)}`,
  ].join(' ')

  const arcR  = 22
  const arcSX = f(arcCX + arcR * cosA), arcSY = f(jy - arcR * sinA)
  const arcEX = arcSX,                  arcEY = f(jy + arcR * sinA)

  const upCoteY = f(lUpY - 14)
  const loCoteY = f(lLoY + 14)
  const upDimX  = f((lUpX + rUpX) / 2)
  const loDimX  = f((lLoX + rLoX) / 2)

  const dimC  = `${avalA_mm.toFixed(0)}×${avalB_mm.toFixed(0)}`
  const dimUp = seg0 ? `${seg0.a_mm.toFixed(0)}×${seg0.b_mm.toFixed(0)}` : ''
  const dimLo = seg1 ? `${seg1.a_mm.toFixed(0)}×${seg1.b_mm.toFixed(0)}` : ''

  return (
    <svg viewBox={mini ? (miniViewBox ?? '100 140 360 390') : '60 140 380 390'}
      width="100%" height="100%"
      overflow={mini ? 'hidden' : 'visible'}
      style={{ display: 'block' }}>

      <path d={outerPath} fill={fill} stroke={strk} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />

      <line x1="100" y1={jy} x2={Math.min(jxUp, jxLo)} y2={jy}
        stroke="#94a3b8" strokeWidth="0.6" strokeDasharray="4 3" opacity="0.55" />

      <line x1={arCC + arHalf} y1={jy} x2={arCC - arHalf} y2={jy}
        stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" />
      <polygon points={`${arCC - arHalf},${jy - 5} ${arCC - arHalf},${jy + 5} ${arCC - arHalf - 12},${jy}`} fill="#2563eb" />

      <line x1={arUpX1} y1={arUpY1} x2={arUpX2} y2={arUpY2}
        stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" />
      <polygon points={arUpHead} fill="#2563eb" />

      <line x1={arLoX1} y1={arLoY1} x2={arLoX2} y2={arLoY2}
        stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" />
      <polygon points={arLoHead} fill="#2563eb" />

      {!mini && <>
      <text x={arCC} y={jy - 11} textAnchor="middle" fontSize="9.5" fontWeight="700"
        fill="#2563eb" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {avalQ_m3h.toFixed(0)} m³/h
      </text>
      <text x={f(arUpCX + 7 * sinA)} y={f(arUpCY + 7 * cosA)} textAnchor="start" fontSize="9.5" fontWeight="700"
        fill="#2563eb" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {seg0?.Q_m3h != null ? `${seg0.Q_m3h.toFixed(0)} m³/h` : '—'}
      </text>
      <text x={f(arLoCX + 7 * sinA)} y={f(arLoCY - 7 * cosA)} textAnchor="start" fontSize="9.5" fontWeight="700"
        fill="#2563eb" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {seg1?.Q_m3h != null ? `${seg1.Q_m3h.toFixed(0)} m³/h` : '—'}
      </text>

      <text x={100} y={jy - Hc - 8} textAnchor="start" fontSize="11" fill="#475569" fontStyle="italic">collecteur</text>

      <path d={`M ${arcSX} ${arcSY} A ${arcR} ${arcR} 0 0 1 ${arcEX} ${arcEY}`}
        fill="none" stroke="#374151" strokeWidth="1" />
      <text x={f(arcCX + arcR + 5)} y={f(jy + 4)} textAnchor="start" fontSize="12" fontWeight="600"
        fill="#374151" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {alpha}°
      </text>

      {/* Cote collecteur */}
      <line x1="81" y1={jy - Hc} x2="91" y2={jy - Hc} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="81" y1={jy + Hc} x2="91" y2={jy + Hc} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="86" y1={jy - Hc} x2="86" y2={jy + Hc} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      <text x="79" y={jy + 4} textAnchor="end" fontSize="10" fill="#64748b">{dimC} mm</text>

      {/* Cote branche haute */}
      <line x1={lUpX} y1={f(upCoteY - 5)} x2={lUpX} y2={f(upCoteY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={rUpX} y1={f(upCoteY - 5)} x2={rUpX} y2={f(upCoteY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={lUpX} y1={upCoteY} x2={rUpX} y2={upCoteY} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      <text x={upDimX} y={f(lUpY - 26)} textAnchor="middle" fontSize="10" fill="#64748b">{dimUp} mm</text>

      {/* Cote branche basse */}
      <line x1={lLoX} y1={f(loCoteY - 5)} x2={lLoX} y2={f(loCoteY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={rLoX} y1={f(loCoteY - 5)} x2={rLoX} y2={f(loCoteY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={lLoX} y1={loCoteY} x2={rLoX} y2={loCoteY} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      <text x={loDimX} y={f(lLoY + 28)} textAnchor="middle" fontSize="10" fill="#64748b">{dimLo} mm</text>
      </>}
    </svg>
  )
}

function SchemaRectWyeAsym({ branch1Seg, branch2Seg, avalA_mm, avalB_mm, avalQ_m3h, alpha1, alpha2, mini, miniViewBox }: {
  branch1Seg: { a_mm: number; b_mm: number; Q_m3h: number } | undefined
  branch2Seg: { a_mm: number; b_mm: number; Q_m3h: number } | undefined
  avalA_mm:   number
  avalB_mm:   number
  avalQ_m3h:  number
  alpha1:     number
  alpha2:     number
  mini?:      boolean
  miniViewBox?: string
}) {
  const f    = (v: number) => +v.toFixed(1)
  const fill = '#f1f5f9'
  const strk = '#374151'
  const jx = 280, jy = 335

  const Hc     = 55
  const Hb_up  = Math.round(Math.min(65, Math.max(12, ((branch1Seg?.a_mm ?? avalA_mm) / avalA_mm) * Hc)))
  const Hb_lo  = Math.round(Math.min(65, Math.max(12, ((branch2Seg?.a_mm ?? avalA_mm) / avalA_mm) * Hc)))
  const Hb_ref = Math.round((Hb_up + Hb_lo) / 2)

  const α1Rad = Math.max(15, Math.min(90, alpha1)) * Math.PI / 180
  const α2Rad = Math.max(15, Math.min(90, alpha2)) * Math.PI / 180
  const cosA1 = Math.cos(α1Rad), sinA1 = Math.sin(α1Rad)
  const cosA2 = Math.cos(α2Rad), sinA2 = Math.sin(α2Rad)
  const bLen = 110

  const jxIn = jx + Hb_ref
  const jxUp = jxIn - 2 * Hb_up
  const jxLo = jxIn - 2 * Hb_lo

  const denom = cosA2 * (sinA1 / cosA1) + sinA2
  const s2    = denom > 0 ? 2 * Hc / denom : Hc / sinA2
  const tipX  = f(jxIn - s2 * cosA2)
  const tipY  = f(jy + Hc - s2 * sinA2)

  const lUpX = f(jxUp + bLen * cosA1), lUpY = f(jy - Hc - bLen * sinA1)
  const rUpX = f(jxIn + bLen * cosA1), rUpY = lUpY
  const lLoX = f(jxLo + bLen * cosA2), lLoY = f(jy + Hc + bLen * sinA2)
  const rLoX = f(jxIn + bLen * cosA2), rLoY = lLoY

  const outerPath = [
    `M 100 ${jy + Hc}`,
    `L 100 ${jy - Hc}`,
    `L ${jxUp} ${jy - Hc}`,
    `L ${lUpX} ${lUpY}`,
    `L ${rUpX} ${rUpY}`,
    `L ${tipX} ${tipY}`,
    `L ${rLoX} ${rLoY}`,
    `L ${lLoX} ${lLoY}`,
    `L ${jxLo} ${jy + Hc}`,
    `L 100 ${jy + Hc}`,
    'Z',
  ].join(' ')

  const arHalf = 38
  const arCC   = Math.round((100 + Math.min(jxUp, jxLo)) / 2)
  const arUpCX = f((jxUp + jxIn) / 2 + (bLen / 2) * cosA1)
  const arUpCY = f(jy - Hc - (bLen / 2) * sinA1)
  const arUpX1 = f(arUpCX + arHalf * cosA1), arUpY1 = f(arUpCY - arHalf * sinA1)
  const arUpX2 = f(arUpCX - arHalf * cosA1), arUpY2 = f(arUpCY + arHalf * sinA1)
  const arUpHead = [
    `${f(arUpX2 + 5 * sinA1)},${f(arUpY2 + 5 * cosA1)}`,
    `${f(arUpX2 - 5 * sinA1)},${f(arUpY2 - 5 * cosA1)}`,
    `${f(arUpX2 - 12 * cosA1)},${f(arUpY2 + 12 * sinA1)}`,
  ].join(' ')
  const arLoCX = f((jxLo + jxIn) / 2 + (bLen / 2) * cosA2)
  const arLoCY = f(jy + Hc + (bLen / 2) * sinA2)
  const arLoX1 = f(arLoCX + arHalf * cosA2), arLoY1 = f(arLoCY + arHalf * sinA2)
  const arLoX2 = f(arLoCX - arHalf * cosA2), arLoY2 = f(arLoCY - arHalf * sinA2)
  const arLoHead = [
    `${f(arLoX2 - 5 * sinA2)},${f(arLoY2 + 5 * cosA2)}`,
    `${f(arLoX2 + 5 * sinA2)},${f(arLoY2 - 5 * cosA2)}`,
    `${f(arLoX2 - 12 * cosA2)},${f(arLoY2 - 12 * sinA2)}`,
  ].join(' ')

  const arcR    = 20
  const arcUpEX = f(+tipX + arcR * cosA1), arcUpEY = f(+tipY - arcR * sinA1)
  const arcLoEX = f(+tipX + arcR * cosA2), arcLoEY = f(+tipY + arcR * sinA2)
  const bis1 = alpha1 / 2 * Math.PI / 180, bis2 = alpha2 / 2 * Math.PI / 180
  const arcUpTX = f(+tipX + (arcR + 14) * Math.cos(bis1)), arcUpTY = f(+tipY - (arcR + 14) * Math.sin(bis1))
  const arcLoTX = f(+tipX + (arcR + 14) * Math.cos(bis2)), arcLoTY = f(+tipY + (arcR + 14) * Math.sin(bis2))

  const upCoteY = f(lUpY - 14), loCoteY = f(lLoY + 14)
  const upDimX  = f((lUpX + rUpX) / 2), loDimX = f((lLoX + rLoX) / 2)
  const dimC  = `${avalA_mm.toFixed(0)}×${avalB_mm.toFixed(0)}`
  const dimUp = branch1Seg ? `${branch1Seg.a_mm.toFixed(0)}×${branch1Seg.b_mm.toFixed(0)}` : ''
  const dimLo = branch2Seg ? `${branch2Seg.a_mm.toFixed(0)}×${branch2Seg.b_mm.toFixed(0)}` : ''

  return (
    <svg viewBox={mini ? (miniViewBox ?? '100 140 360 390') : '60 140 380 390'}
      width="100%" height="100%"
      overflow={mini ? 'hidden' : 'visible'}
      style={{ display: 'block' }}>

      <path d={outerPath} fill={fill} stroke={strk} strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />

      <line x1="100" y1={jy} x2={Math.min(jxUp, jxLo)} y2={jy}
        stroke="#94a3b8" strokeWidth="0.6" strokeDasharray="4 3" opacity="0.55" />

      <line x1={arCC + arHalf} y1={jy} x2={arCC - arHalf} y2={jy} stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" />
      <polygon points={`${arCC - arHalf},${jy - 5} ${arCC - arHalf},${jy + 5} ${arCC - arHalf - 12},${jy}`} fill="#2563eb" />
      <line x1={arUpX1} y1={arUpY1} x2={arUpX2} y2={arUpY2} stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" />
      <polygon points={arUpHead} fill="#2563eb" />
      <line x1={arLoX1} y1={arLoY1} x2={arLoX2} y2={arLoY2} stroke="#2563eb" strokeWidth="1.5" strokeDasharray="6 4" />
      <polygon points={arLoHead} fill="#2563eb" />

      {!mini && <>
      <text x={arCC} y={jy - 11} textAnchor="middle" fontSize="9.5" fontWeight="700"
        fill="#2563eb" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {avalQ_m3h.toFixed(0)} m³/h
      </text>
      <text x={f(arUpCX + 7 * sinA1)} y={f(arUpCY + 7 * cosA1)} textAnchor="start" fontSize="9.5" fontWeight="700"
        fill="#2563eb" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {branch1Seg?.Q_m3h != null ? `${branch1Seg.Q_m3h.toFixed(0)} m³/h` : '—'}
      </text>
      <text x={f(arLoCX + 7 * sinA2)} y={f(arLoCY - 7 * cosA2)} textAnchor="start" fontSize="9.5" fontWeight="700"
        fill="#2563eb" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        {branch2Seg?.Q_m3h != null ? `${branch2Seg.Q_m3h.toFixed(0)} m³/h` : '—'}
      </text>
      <text x={100} y={jy - Hc - 8} textAnchor="start" fontSize="11" fill="#475569" fontStyle="italic">collecteur</text>

      {/* Ligne de référence horizontale — base commune des deux arcs */}
      <line x1={f(+tipX - 5)} y1={tipY} x2={f(+tipX + arcR + 28)} y2={tipY}
        stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 3" />

      <path d={`M ${f(+tipX + arcR)} ${tipY} A ${arcR} ${arcR} 0 0 0 ${arcUpEX} ${arcUpEY}`}
        fill="none" stroke="#374151" strokeWidth="1" />
      <text x={arcUpTX} y={arcUpTY} textAnchor="middle" fontSize="11" fontWeight="600"
        fill="#374151" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        α1={alpha1}°
      </text>
      <path d={`M ${f(+tipX + arcR)} ${tipY} A ${arcR} ${arcR} 0 0 1 ${arcLoEX} ${arcLoEY}`}
        fill="none" stroke="#374151" strokeWidth="1" />
      <text x={arcLoTX} y={arcLoTY} textAnchor="middle" fontSize="11" fontWeight="600"
        fill="#374151" paintOrder="stroke" stroke="white" strokeWidth="3" strokeLinejoin="round">
        α2={alpha2}°
      </text>

      <line x1="81" y1={jy - Hc} x2="91" y2={jy - Hc} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="81" y1={jy + Hc} x2="91" y2={jy + Hc} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="86" y1={jy - Hc} x2="86" y2={jy + Hc} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      <text x="79" y={jy + 4} textAnchor="end" fontSize="10" fill="#64748b">{dimC} mm</text>
      <line x1={lUpX} y1={f(upCoteY - 5)} x2={lUpX} y2={f(upCoteY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={rUpX} y1={f(upCoteY - 5)} x2={rUpX} y2={f(upCoteY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={lUpX} y1={upCoteY} x2={rUpX} y2={upCoteY} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      <text x={upDimX} y={f(lUpY - 26)} textAnchor="middle" fontSize="10" fill="#64748b">{dimUp} mm</text>
      <line x1={lLoX} y1={f(loCoteY - 5)} x2={lLoX} y2={f(loCoteY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={rLoX} y1={f(loCoteY - 5)} x2={rLoX} y2={f(loCoteY + 5)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
      <line x1={lLoX} y1={loCoteY} x2={rLoX} y2={loCoteY} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      <text x={loDimX} y={f(lLoY + 28)} textAnchor="middle" fontSize="10" fill="#64748b">{dimLo} mm</text>
      </>}
    </svg>
  )
}

// ── Cartes de type ────────────────────────────────────────────────────────────

const TYPE_ORDER: RectJunctionType[] = ['rect-tee-oblique', 'rect-wye-symetrique', 'rect-wye-asymetrique']

function TypeCard({ type, selected, onClick }: {
  type: RectJunctionType; selected: boolean; onClick: () => void
}) {
  const miniSchemas: Record<RectJunctionType, ReactElement> = {
    'rect-tee-oblique':     <SchemaRectTee straightSegId={null} amontSegs={[]} avalA_mm={200} avalB_mm={150} avalQ_m3h={500} alpha={90} mini miniViewBox="90 158 380 318" />,
    'rect-wye-symetrique':  <SchemaRectWye amontSegs={[]} avalA_mm={200} avalB_mm={150} avalQ_m3h={500} alpha={90} mini miniViewBox="80 190 400 285" />,
    'rect-wye-asymetrique': <SchemaRectWyeAsym branch1Seg={undefined} branch2Seg={undefined} avalA_mm={200} avalB_mm={150} avalQ_m3h={500} alpha1={45} alpha2={30} mini miniViewBox="80 190 400 285" />,
  }
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '7px 5px 6px',
      border: `1.5px solid ${selected ? '#2563eb' : '#e2e8f0'}`,
      borderRadius: 8, background: selected ? '#eff6ff' : '#f8fafc',
      cursor: 'pointer', gap: 5, transition: 'all 0.12s',
      boxShadow: selected ? '0 0 0 3px #2563eb22' : 'none',
    }}>
      <div style={{ width: '100%', height: 58 }}>
        {miniSchemas[type]}
      </div>
      <span style={{ fontSize: 9.5, fontWeight: selected ? 700 : 500,
        color: selected ? '#1d4ed8' : '#475569', display: 'block', textAlign: 'center' }}>
        {RECT_JUNCTION_LABELS[type]}
      </span>
    </button>
  )
}

// ── Modal principal ───────────────────────────────────────────────────────────

export default function RectJunctionModal({
  isOpen, onClose, onSave, editing,
  amontSegs, avalA_mm, avalB_mm, avalQ_m3h, avalV_ms, rho,
}: Props) {
  const [selType,       setSelType]       = useState<RectJunctionType | null>(null)
  const [straightSegId, setStraightSegId] = useState<string | null>(null)
  const [alpha,         setAlpha]         = useState<number>(90)
  const [alpha1,        setAlpha1]        = useState<number>(45)
  const [alpha2,        setAlpha2]        = useState<number>(45)
  const [branch1SegId,  setBranch1SegId]  = useState<string | null>(null)
  const [mounted,       setMounted]       = useState(false)

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => setMounted(true))
    else setMounted(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (editing) {
      setSelType(editing.type)
      setStraightSegId(editing.straightSegId ?? null)
      setAlpha(editing.alpha_deg ?? 90)
      setAlpha1(editing.alpha1_deg ?? 45)
      setAlpha2(editing.alpha2_deg ?? 45)
      setBranch1SegId(editing.branch1SegId ?? null)
    } else {
      setSelType(null)
      setStraightSegId(null)
      setAlpha(90)
      setAlpha1(45)
      setAlpha2(45)
      setBranch1SegId(null)
    }
  }, [isOpen, editing])

  if (!isOpen) return null

  const needsAngle = selType ? RECT_JUNCTION_NEEDS_ANGLE[selType] : false
  const [aMin, aMax] = selType ? RECT_JUNCTION_ANGLE_RANGE[selType] : [30, 89]
  const needsRole  = selType === 'rect-tee-oblique'
  const isAsym     = selType === 'rect-wye-asymetrique'
  const dynPressure = 0.5 * rho * avalV_ms ** 2

  let xiMap: Map<string, number> | null = null
  if (selType && (!needsRole || straightSegId) && (!isAsym || branch1SegId)) {
    const mockJunction: RectNodeJunction = {
      id: '',
      type: selType,
      ...(needsRole  ? { straightSegId: straightSegId! }                                      : {}),
      ...(needsAngle ? { alpha_deg: alpha }                                                    : {}),
      ...(isAsym     ? { alpha1_deg: alpha1, alpha2_deg: alpha2, branch1SegId: branch1SegId! } : {}),
    }
    const branches: JunctionBranchRectInput[] = amontSegs.map(s => ({
      segId:      s.id,
      Q_m3h:      s.Q_m3h,
      a_mm:       s.a_mm,
      b_mm:       s.b_mm,
      isStraight: straightSegId === s.id,
    }))
    xiMap = computeXiJunctionRect(mockJunction, branches, avalQ_m3h, avalA_mm, avalB_mm)
  }

  const canSave = selType != null
    && (!needsRole || straightSegId != null)
    && (!isAsym || branch1SegId != null)

  const handleSave = () => {
    if (!canSave || !selType) return
    onSave({
      id:   editing?.id ?? newJunctionId(),
      type: selType,
      ...(needsRole  ? { straightSegId: straightSegId! }                                      : {}),
      ...(needsAngle ? { alpha_deg: alpha }                                                    : {}),
      ...(isAsym     ? { alpha1_deg: alpha1, alpha2_deg: alpha2, branch1SegId: branch1SegId! } : {}),
    })
    onClose()
  }

  const inp: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
    fontSize: 13, background: '#f8fafc', fontFamily: 'ui-monospace, monospace',
    color: '#1e293b', fontWeight: 600, width: 74, boxSizing: 'border-box' as const,
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, color: '#64748b', fontWeight: 600, letterSpacing: '0.01em',
  }

  return createPortal(
    <>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 280, bottom: 0, zIndex: 999 }}
        onMouseDown={onClose} />

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

        {/* En-tête */}
        <div style={{
          flexShrink: 0, padding: '10px 18px 9px',
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          borderBottom: '1px solid #f1f5f9',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
            {editing ? 'Modifier la réunion' : 'Configurer la réunion'}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: '#94a3b8', lineHeight: 1, padding: '2px 4px' }}>×</button>
        </div>

        {/* Sélecteur de type */}
        <div style={{ flexShrink: 0, padding: '10px 18px 9px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#b0bec5',
            textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 7 }}>
            Type de réunion — rectangulaire
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {TYPE_ORDER.map(t => (
              <TypeCard key={t} type={t} selected={selType === t}
                onClick={() => { setSelType(t); setStraightSegId(null); setBranch1SegId(null) }} />
            ))}
          </div>
        </div>

        {/* Zone de détail */}
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          {!selType ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 9 }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <circle cx="18" cy="18" r="17" stroke="#e2e8f0" strokeWidth="1.5" />
                <path d="M18 11v8M18 25h.01" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <span style={{ fontSize: 11.5, color: '#94a3b8', fontWeight: 500 }}>
                Choisissez un type ci-dessus
              </span>
            </div>
          ) : (
            <>
              {/* Schéma SVG */}
              <div style={{
                width: 390, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                borderRight: '1px solid #f1f5f9', background: '#f8fafd',
              }}>
                <div style={{ flex: 1, padding: '12px 10px 10px 16px', minHeight: 0 }}>
                  {selType === 'rect-tee-oblique' ? (
                    <SchemaRectTee
                      straightSegId={straightSegId}
                      amontSegs={straightSegId !== null ? amontSegs : []}
                      avalA_mm={avalA_mm}
                      avalB_mm={avalB_mm}
                      avalQ_m3h={avalQ_m3h}
                      alpha={alpha}
                    />
                  ) : selType === 'rect-wye-asymetrique' ? (
                    <SchemaRectWyeAsym
                      branch1Seg={amontSegs.find(s => s.id === branch1SegId)}
                      branch2Seg={amontSegs.find(s => s.id !== branch1SegId)}
                      avalA_mm={avalA_mm}
                      avalB_mm={avalB_mm}
                      avalQ_m3h={avalQ_m3h}
                      alpha1={alpha1}
                      alpha2={alpha2}
                    />
                  ) : (
                    <SchemaRectWye
                      amontSegs={amontSegs}
                      avalA_mm={avalA_mm}
                      avalB_mm={avalB_mm}
                      avalQ_m3h={avalQ_m3h}
                      alpha={alpha}
                    />
                  )}
                </div>
              </div>

              {/* Paramètres */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                padding: '14px 16px 14px 16px', overflowY: 'auto' }}>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 2 }}>
                  {RECT_JUNCTION_LABELS[selType]}
                </div>

                {/* Angle α (T et Y symétrique) */}
                {needsAngle && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 74px',
                    rowGap: 8, columnGap: 8, alignItems: 'center', marginBottom: 14 }}>
                    <label style={lbl}>Angle α (°)</label>
                    <NumInput min={aMin} max={aMax} step={1}
                      value={alpha} onChange={v => setAlpha(v ?? 90)} style={inp} />
                    <span style={{ gridColumn: '1 / -1', fontSize: 9.5, color: '#94a3b8', marginTop: -4 }}>
                      {selType === 'rect-wye-symetrique'
                        ? 'Angle total entre les deux branches (60°–180°)'
                        : 'Angle branche latérale / axe commun (30°–90°)'}
                    </span>
                  </div>
                )}

                {/* Angles α1 et α2 (Y asymétrique) */}
                {isAsym && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 74px',
                    rowGap: 8, columnGap: 8, alignItems: 'center', marginBottom: 14 }}>
                    <label style={lbl}>Angle α1 — branche 1 (°)</label>
                    <NumInput min={15} max={90} step={1}
                      value={alpha1} onChange={v => setAlpha1(v ?? 45)} style={inp} />
                    <label style={lbl}>Angle α2 — branche 2 (°)</label>
                    <NumInput min={15} max={90} step={1}
                      value={alpha2} onChange={v => setAlpha2(v ?? 45)} style={inp} />
                    <span style={{ gridColumn: '1 / -1', fontSize: 9.5, color: '#94a3b8', marginTop: -4 }}>
                      Angle de chaque branche par rapport à l'axe commun (15°–90°)
                    </span>
                  </div>
                )}

                {/* Rôles des tronçons */}
                {needsRole && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#b0bec5',
                      textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 7 }}>
                      Rôle des tronçons entrants
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {amontSegs.map(seg => {
                        const isStraight = straightSegId === seg.id
                        const isLateral  = !isStraight && straightSegId !== null
                        return (
                          <div key={seg.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', borderRadius: 7,
                            border: '1px solid #e2e8f0', background: '#f8fafc',
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                {seg.name}
                              </div>
                              <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 1 }}>
                                {seg.a_mm}×{seg.b_mm} mm · {seg.Q_m3h.toFixed(0)} m³/h
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
                              <button onClick={() => setStraightSegId(seg.id)} style={{
                                padding: '2px 8px', borderRadius: 4, fontSize: 9.5, fontWeight: 600,
                                border: `1px solid ${isStraight ? '#6366f1' : '#e2e8f0'}`,
                                background: isStraight ? '#6366f1' : '#f1f5f9',
                                color: isStraight ? '#fff' : '#64748b', cursor: 'pointer',
                              }}>Rectiligne</button>
                              <button
                                onClick={() => {
                                  const other = amontSegs.find(s => s.id !== seg.id)
                                  if (other) setStraightSegId(other.id)
                                }}
                                style={{
                                  padding: '2px 8px', borderRadius: 4, fontSize: 9.5, fontWeight: 600,
                                  border: `1px solid ${isLateral ? '#2563eb' : '#e2e8f0'}`,
                                  background: isLateral ? '#2563eb' : '#f1f5f9',
                                  color: isLateral ? '#fff' : '#64748b', cursor: 'pointer',
                                }}>Latéral</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {!straightSegId && (
                      <div style={{ marginTop: 5, fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>
                        Désignez la branche rectiligne (dans l'axe du collecteur)
                      </div>
                    )}
                  </div>
                )}

                {/* Assignation branche 1 / branche 2 (Y asymétrique) */}
                {isAsym && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#b0bec5',
                      textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 7 }}>
                      Rôle des tronçons entrants
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      {amontSegs.map(seg => {
                        const isBranch1 = branch1SegId === seg.id
                        const isBranch2 = !isBranch1 && branch1SegId !== null
                        return (
                          <div key={seg.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            padding: '7px 10px', borderRadius: 7,
                            border: '1px solid #e2e8f0', background: '#f8fafc',
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: '#1e293b',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                {seg.name}
                              </div>
                              <div style={{ fontSize: 9.5, color: '#64748b', marginTop: 1 }}>
                                {seg.a_mm}×{seg.b_mm} mm · {seg.Q_m3h.toFixed(0)} m³/h
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                              <button onClick={() => setBranch1SegId(seg.id)} style={{
                                padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                                border: `1.5px solid ${isBranch1 ? '#6366f1' : '#e2e8f0'}`,
                                background: isBranch1 ? '#6366f1' : '#f1f5f9',
                                color: isBranch1 ? '#fff' : '#94a3b8', cursor: 'pointer',
                              }}>α1</button>
                              <button onClick={() => {
                                const other = amontSegs.find(s => s.id !== seg.id)
                                if (other) setBranch1SegId(other.id)
                              }} style={{
                                padding: '3px 10px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                                border: `1.5px solid ${isBranch2 ? '#2563eb' : '#e2e8f0'}`,
                                background: isBranch2 ? '#2563eb' : '#f1f5f9',
                                color: isBranch2 ? '#fff' : '#94a3b8', cursor: 'pointer',
                              }}>α2</button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {!branch1SegId && (
                      <div style={{ marginTop: 5, fontSize: 10, color: '#f59e0b', fontWeight: 600 }}>
                        Désignez quel tronçon est la branche α1
                      </div>
                    )}
                  </div>
                )}

                {/* Résultats ξ / ΔP */}
                {xiMap && (
                  <div style={{ marginTop: 'auto', borderTop: '1px solid #f1f5f9', paddingTop: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#b0bec5',
                      textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 7 }}>
                      Résultats
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {amontSegs.map(seg => {
                        const xi = xiMap!.get(seg.id)
                        if (xi == null) return null
                        const dp = xi * dynPressure
                        const isStraight = straightSegId === seg.id
                        const roleLabel  = selType === 'rect-wye-symetrique'
                          ? `${seg.a_mm.toFixed(0)}×${seg.b_mm.toFixed(0)} mm · ${seg.Q_m3h.toFixed(0)} m³/h`
                          : selType === 'rect-wye-asymetrique'
                          ? (branch1SegId === seg.id ? `α1 = ${alpha1}°` : `α2 = ${alpha2}°`)
                          : isStraight ? 'rectiligne' : 'latéral'
                        return (
                          <div key={seg.id} style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            padding: '6px 8px', borderRadius: 6,
                            background: '#f8fafc', border: '1px solid #e2e8f0',
                          }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#1e293b',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                                {seg.name}
                              </div>
                              <div style={{ fontSize: 8.5, color: '#64748b', marginTop: 1 }}>{roleLabel}</div>
                            </div>
                            <div style={{ textAlign: 'right' as const, minWidth: 48 }}>
                              <div style={{ fontSize: 8, fontWeight: 600, color: '#93c5fd',
                                fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>ξ</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#1d4ed8',
                                fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
                                {xi.toFixed(3)}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right' as const, minWidth: 58 }}>
                              <div style={{ fontSize: 8, fontWeight: 600, color: '#2dd4bf' }}>ΔP</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: '#0f766e',
                                fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
                                {dp.toFixed(1)}<span style={{ fontSize: 8, marginLeft: 2, color: '#0d9488' }}>Pa</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop: 6, fontSize: 8, color: '#b0bec5', fontStyle: 'italic' }}>
                      Idelchik Chap. 7 — ξ rapporté à ρv_c²/2
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Pied de page */}
        <div style={{ flexShrink: 0, height: 52, display: 'flex', alignItems: 'center',
          justifyContent: 'flex-end', gap: 8, padding: '0 18px', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} style={{ padding: '6px 16px', borderRadius: 6,
            border: '1px solid #e2e8f0', background: '#f8fafc',
            fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
            Annuler
          </button>
          <button onClick={handleSave} disabled={!canSave} style={{
            padding: '6px 18px', borderRadius: 6, border: 'none',
            background: canSave ? '#2563eb' : '#e2e8f0',
            fontSize: 12, fontWeight: 700,
            color: canSave ? '#fff' : '#94a3b8',
            cursor: canSave ? 'pointer' : 'default', transition: 'background 0.1s',
          }}>
            {editing ? 'Enregistrer' : 'Valider'}
          </button>
        </div>
      </div>
    </>, document.body
  )
}
