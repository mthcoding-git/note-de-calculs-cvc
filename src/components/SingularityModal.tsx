import { useState, useEffect, useId, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { NumInput } from './NumInput'
import {
  VentSingularity, SingularityType, XiParts,
  computeXiSingularityFull, lambdaDarcy, SING_LABELS, newSingId,
} from '../utils/singularityCalc'

// ── SVG schemas ───────────────────────────────────────────────────────────────

function lineIntersect(
  p1: [number,number], d1: [number,number],
  p2: [number,number], d2: [number,number],
): [number,number] {
  const dx = p2[0] - p1[0], dy = p2[1] - p1[1]
  const det = d1[0] * (-d2[1]) - d1[1] * (-d2[0])
  if (Math.abs(det) < 1e-9) return [(p1[0]+p2[0])/2, (p1[1]+p2[1])/2]
  const t = (dx * (-d2[1]) - dy * (-d2[0])) / det
  return [p1[0] + t * d1[0], p1[1] + t * d1[1]]
}

// ── Marques de section SVG ────────────────────────────────────────────────────

// Retourne un segment bezier cubique simulant une onde S entre deux points
function waveC(ax: number, ay: number, bx: number, by: number, amp = 10): string {
  const f = (v: number) => +v.toFixed(1)
  const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy) || 1
  const px = (-dy / len) * amp, py = (dx / len) * amp
  return `C ${f(ax+dx/3+px)} ${f(ay+dy/3+py)} ${f(ax+2*dx/3-px)} ${f(ay+2*dy/3-py)} ${bx} ${by}`
}

interface SchemaProps { angle: number; rOverD?: number; nPieces?: number; typeAubes?: 'simple' | 'double'; mini?: boolean; di_mm?: number | null }

function SchemaCoudeLisse({ angle, rOverD = 1.5, mini, di_mm }: SchemaProps) {
  const δ    = Math.max(1, Math.min(179, angle)) * Math.PI / 180
  const D    = 80
  const rOD  = rOverD
  const R    = D * (rOD + 0.5)
  const r    = Math.max(0, D * (rOD - 0.5))
  const cRad = D * rOD
  const cx   = 150 + R
  const cy   = 350
  const exitLen = 120

  const exitDx = Math.sin(δ), exitDy = -Math.cos(δ)
  const ox2 = cx - R * Math.cos(δ),  oy2 = cy - R * Math.sin(δ)
  const ix2 = cx - r * Math.cos(δ),  iy2 = cy - r * Math.sin(δ)
  const oEx = ox2 + exitLen * exitDx, oEy = oy2 + exitLen * exitDy
  const iEx = ix2 + exitLen * exitDx, iEy = iy2 + exitLen * exitDy
  const laf  = δ > Math.PI ? 1 : 0

  // Duct path — world coordinates, scaled by <g transform> below
  const pathD = [
    `M 150 470`, `L 150 ${cy}`,
    `A ${R.toFixed(1)} ${R.toFixed(1)} 0 ${laf} 1 ${ox2.toFixed(1)} ${oy2.toFixed(1)}`,
    `L ${oEx.toFixed(1)} ${oEy.toFixed(1)}`,
    waveC(oEx, oEy, iEx, iEy),
    `L ${ix2.toFixed(1)} ${iy2.toFixed(1)}`,
    `A ${r.toFixed(1)} ${r.toFixed(1)} 0 ${laf} 0 230 ${cy}`,
    `L 230 470`,
    waveC(230, 470, 150, 470),
  ].join(' ')

  // Fixed viewBox — map world bounding box into VW×VH with margin
  const arcTop = δ >= Math.PI / 2 ? cy - R : cy - R * Math.sin(δ)
  const xRight = Math.max(oEx, cx + R * Math.max(0, -Math.cos(δ)))
  const yTop   = Math.min(arcTop, oEy)
  const VW = 500, VH = 420, M = 16
  const scl = Math.min((VW - 2 * M) / (xRight - 150), (VH - 2 * M) / (525 - yTop))
  const tx  = M + ((VW - 2 * M) - (xRight - 150) * scl) / 2 - 150 * scl
  const ty  = M + ((VH - 2 * M) - (525 - yTop) * scl) / 2 - yTop * scl + (mini ? 0 : 10)

  // Map world → viewBox coordinates
  const vx = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy = (wy: number) => +(ty + wy * scl).toFixed(1)

  const fill    = '#f1f5f9'
  const stroke  = '#374151'
  const d0Label = di_mm != null ? `D = ${di_mm.toFixed(0)} mm` : 'D'

  // All annotation positions in viewBox space — sizes are fixed (viewBox units)
  const cx_v  = vx(cx),  cy_v  = vy(cy)
  const ecx_v = vx(ox2), ecy_v = vy(oy2)
  const Px_v  = vx(cx - cRad * Math.cos(δ / 2))
  const Py_v  = vy(cy - cRad * Math.sin(δ / 2))

  const arcR  = 28  // fixed viewBox units
  const annBx = +(cx_v - arcR * Math.cos(δ)).toFixed(1)
  const annBy = +(cy_v - arcR * Math.sin(δ)).toFixed(1)

  const aw  = 8   // fixed arrowhead size (viewBox units)
  const dPx = cx_v - Px_v, dPy = cy_v - Py_v
  const pLen = Math.hypot(dPx, dPy) || 1
  const gnx = dPx / pLen, gny = dPy / pLen
  const aa  = Math.PI / 6, ca = Math.cos(aa), sa = Math.sin(aa)
  const arr1x = +(Px_v + aw * (gnx * ca - gny * sa)).toFixed(1)
  const arr1y = +(Py_v + aw * (gnx * sa + gny * ca)).toFixed(1)
  const arr2x = +(Px_v + aw * (gnx * ca + gny * sa)).toFixed(1)
  const arr2y = +(Py_v + aw * (-gnx * sa + gny * ca)).toFixed(1)
  const rLabel = di_mm != null ? `r = ${Math.round(rOD * di_mm)} mm` : 'r'

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }}>
      {/* Duct geometry scaled to fit the fixed viewBox */}
      <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scl.toFixed(4)})`}>
        <path d={pathD} fill={fill} stroke={stroke} strokeWidth={mini ? +(10/scl).toFixed(2) : +(3/scl).toFixed(3)}
          strokeLinejoin="round" strokeLinecap="round" />
      </g>
      {!mini && <>
        {/* Annotation angulaire — coordonnées viewBox, tailles fixes */}
        <line x1={vx(150)} y1={cy_v} x2={cx_v} y2={cy_v}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <line x1={ecx_v} y1={ecy_v} x2={cx_v} y2={cy_v}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <path d={`M ${cx_v - arcR} ${cy_v} A ${arcR} ${arcR} 0 0 1 ${annBx} ${annBy}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={cx_v} y={cy_v + 20} fontSize="15" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle">δ = {angle}°</text>
        {/* Flèche R₀ */}
        <line x1={cx_v} y1={cy_v} x2={Px_v} y2={Py_v}
          stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={Px_v} y1={Py_v} x2={arr1x} y2={arr1y}
          stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={Px_v} y1={Py_v} x2={arr2x} y2={arr2y}
          stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
        <text x={(cx_v + Px_v) / 2} y={(cy_v + Py_v) / 2} fontSize="15" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="5">{rLabel}</text>
        {/* D₀ */}
        <line x1={vx(150)} y1={vy(478)} x2={vx(150)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(230)} y1={vy(478)} x2={vx(230)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(150)} y1={vy(484)} x2={vx(230)} y2={vy(484)} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <text x={vx(190)} y={vy(506)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{d0Label}</text>
      </>}
    </svg>
  )
}

function SchemaCoudeSegmente({ angle, nPieces = 4, mini, di_mm, rOverD = 1.5 }: SchemaProps) {
  const n    = Math.max(2, Math.min(5, Math.round(nPieces))) - 1
  const δ    = Math.max(1, Math.min(179, angle)) * Math.PI / 180
  const D    = 80
  const rOD  = rOverD
  const R    = D * (rOD + 0.5)
  const r    = Math.max(0, D * (rOD - 0.5))
  const cRad = D * rOD
  const cx   = 150 + R
  const cy   = 350
  const exitLen = 120

  const outerRef: [number, number][] = []
  const innerRef: [number, number][] = []
  const dirs:     [number, number][] = []
  for (let k = 0; k <= n; k++) {
    const θ = (k / n) * δ
    outerRef.push([cx - R * Math.cos(θ), cy - R * Math.sin(θ)])
    innerRef.push([cx - r * Math.cos(θ), cy - r * Math.sin(θ)])
    dirs.push([Math.sin(θ), -Math.cos(θ)])
  }

  const outerJoints: [number, number][] = []
  const innerJoints: [number, number][] = []
  for (let k = 0; k < n; k++) {
    outerJoints.push(lineIntersect(outerRef[k], dirs[k], outerRef[k+1], dirs[k+1]))
    innerJoints.push(lineIntersect(innerRef[k], dirs[k], innerRef[k+1], dirs[k+1]))
  }

  const exitDx = Math.sin(δ), exitDy = -Math.cos(δ)
  const eoEnd: [number, number] = [outerRef[n][0] + exitLen * exitDx, outerRef[n][1] + exitLen * exitDy]
  const eiEnd: [number, number] = [innerRef[n][0] + exitLen * exitDx, innerRef[n][1] + exitLen * exitDy]

  // Duct path — world coordinates, scaled by <g transform> below
  const toS = ([x, y]: [number, number]) => `${x.toFixed(1)} ${y.toFixed(1)}`
  const parts = [`M 150 470`]
  outerJoints.forEach(j => parts.push(`L ${toS(j)}`))
  parts.push(`L ${toS(eoEnd)}`, waveC(eoEnd[0], eoEnd[1], eiEnd[0], eiEnd[1]))
  ;[...innerJoints].reverse().forEach(j => parts.push(`L ${toS(j)}`))
  parts.push(`L 230 470`, waveC(230, 470, 150, 470))
  const pathD = parts.join(' ')

  // Fixed viewBox — map world bounding box into VW×VH with margin
  const arcTop = δ >= Math.PI / 2 ? cy - R : cy - R * Math.sin(δ)
  const xRight = Math.max(eoEnd[0], cx + R * Math.max(0, -Math.cos(δ)))
  const yTop   = Math.min(arcTop, eoEnd[1])
  const VW = 500, VH = 420, M = 16
  const scl = Math.min((VW - 2 * M) / (xRight - 150), (VH - 2 * M) / (525 - yTop))
  const tx  = M + ((VW - 2 * M) - (xRight - 150) * scl) / 2 - 150 * scl
  const ty  = M + ((VH - 2 * M) - (525 - yTop) * scl) / 2 - yTop * scl + (mini ? 0 : 10)

  // Map world → viewBox coordinates
  const vx = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy = (wy: number) => +(ty + wy * scl).toFixed(1)

  const fill    = '#f1f5f9'
  const stroke  = '#374151'
  const d0Label = di_mm != null ? `D = ${di_mm.toFixed(0)} mm` : 'D'

  // All annotation positions in viewBox space — sizes are fixed (viewBox units)
  const cx_v  = vx(cx),              cy_v  = vy(cy)
  const ecx_v = vx(outerRef[n][0]),  ecy_v = vy(outerRef[n][1])
  const Px_v  = vx(cx - cRad * Math.cos(δ / 2))
  const Py_v  = vy(cy - cRad * Math.sin(δ / 2))

  const arcR  = 28  // fixed viewBox units
  const annBx = +(cx_v - arcR * Math.cos(δ)).toFixed(1)
  const annBy = +(cy_v - arcR * Math.sin(δ)).toFixed(1)

  const aw   = 8   // fixed arrowhead size (viewBox units)
  const dPx  = cx_v - Px_v, dPy = cy_v - Py_v
  const pLen = Math.hypot(dPx, dPy) || 1
  const gnx  = dPx / pLen, gny = dPy / pLen
  const aa   = Math.PI / 6, ca = Math.cos(aa), sa = Math.sin(aa)
  const arr1x = +(Px_v + aw * (gnx * ca - gny * sa)).toFixed(1)
  const arr1y = +(Py_v + aw * (gnx * sa + gny * ca)).toFixed(1)
  const arr2x = +(Px_v + aw * (gnx * ca + gny * sa)).toFixed(1)
  const arr2y = +(Py_v + aw * (-gnx * sa + gny * ca)).toFixed(1)
  const rLabel = di_mm != null ? `r = ${Math.round(rOD * di_mm)} mm` : 'r'

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }}>
      {/* Duct geometry scaled to fit the fixed viewBox */}
      <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scl.toFixed(4)})`}>
        <path d={pathD} fill={fill} stroke={stroke} strokeWidth={mini ? +(10/scl).toFixed(2) : +(3/scl).toFixed(3)}
          strokeLinejoin="round" strokeLinecap="round" />
        {outerJoints.map((oj, k) => (
          <line key={k}
            x1={oj[0].toFixed(1)} y1={oj[1].toFixed(1)}
            x2={innerJoints[k][0].toFixed(1)} y2={innerJoints[k][1].toFixed(1)}
            stroke={stroke} strokeWidth={mini ? +(6/scl).toFixed(2) : +(2/scl).toFixed(3)} strokeLinecap="round" />
        ))}
      </g>
      {!mini && <>
        {/* Annotation angulaire — coordonnées viewBox, tailles fixes */}
        <line x1={vx(150)} y1={cy_v} x2={cx_v} y2={cy_v}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <line x1={ecx_v} y1={ecy_v} x2={cx_v} y2={cy_v}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <path d={`M ${cx_v - arcR} ${cy_v} A ${arcR} ${arcR} 0 0 1 ${annBx} ${annBy}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={cx_v} y={cy_v + 20} fontSize="15" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle">δ = {angle}°</text>
        {/* Flèche R₀ */}
        <line x1={cx_v} y1={cy_v} x2={Px_v} y2={Py_v}
          stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={Px_v} y1={Py_v} x2={arr1x} y2={arr1y}
          stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={Px_v} y1={Py_v} x2={arr2x} y2={arr2y}
          stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
        <text x={(cx_v + Px_v) / 2} y={(cy_v + Py_v) / 2} fontSize="15" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="5">{rLabel}</text>
        {/* D₀ */}
        <line x1={vx(150)} y1={vy(478)} x2={vx(150)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(230)} y1={vy(478)} x2={vx(230)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(150)} y1={vy(484)} x2={vx(230)} y2={vy(484)} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <text x={vx(190)} y={vy(506)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{d0Label}</text>
      </>}
    </svg>
  )
}

function SchemaCoudeOnglet({ angle, mini, di_mm }: SchemaProps) {
  const δ       = Math.max(1, Math.min(179, angle)) * Math.PI / 180
  // Centre virtuel de courbure identique à coude lisse r/D=1.5 — sert uniquement à définir la géométrie du biseau
  const cx = 310, cy = 350
  const R  = 160,  r  = 80
  const exitLen = 120

  const d0: [number,number] = [0, -1]
  const d1: [number,number] = [Math.sin(δ), -Math.cos(δ)]
  const oRef1: [number,number] = [cx - R * Math.cos(δ), cy - R * Math.sin(δ)]
  const iRef1: [number,number] = [cx - r * Math.cos(δ), cy - r * Math.sin(δ)]
  const oc = lineIntersect([150, cy], d0, oRef1, d1)
  const ic = lineIntersect([230, cy], d0, iRef1, d1)
  const eoEnd: [number,number] = [oRef1[0] + exitLen * d1[0], oRef1[1] + exitLen * d1[1]]
  const eiEnd: [number,number] = [iRef1[0] + exitLen * d1[0], iRef1[1] + exitLen * d1[1]]

  // Duct path — world coordinates
  const toS = ([x, y]: [number,number]) => `${x.toFixed(1)} ${y.toFixed(1)}`
  const pathD = [
    `M 150 470`, `L ${toS(oc)}`, `L ${toS(eoEnd)}`,
    waveC(eoEnd[0], eoEnd[1], eiEnd[0], eiEnd[1]),
    `L ${toS(ic)}`, `L 230 470`,
    waveC(230, 470, 150, 470),
  ].join(' ')

  // Fixed viewBox — world bounding box
  const xRight = Math.max(eoEnd[0], cx)
  const yTop   = Math.min(oRef1[1], eoEnd[1])
  const VW = 500, VH = 420, M = 16
  const scl = Math.min((VW - 2 * M) / (xRight - 150), (VH - 2 * M) / (525 - yTop))
  const tx  = M + ((VW - 2 * M) - (xRight - 150) * scl) / 2 - 150 * scl
  const ty  = M + ((VH - 2 * M) - (525 - yTop) * scl) / 2 - yTop * scl + (mini ? 0 : 10)

  const vx = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy = (wy: number) => +(ty + wy * scl).toFixed(1)

  const fill    = '#f1f5f9'
  const stroke  = '#374151'
  const d0Label = di_mm != null ? `D = ${di_mm.toFixed(0)} mm` : 'D'

  // Annotation — viewBox space, tailles fixes
  const cx_v  = vx(cx),      cy_v  = vy(cy)
  const ecx_v = vx(oRef1[0]), ecy_v = vy(oRef1[1])
  const arcR  = 28
  const annBx = +(cx_v - arcR * Math.cos(δ)).toFixed(1)
  const annBy = +(cy_v - arcR * Math.sin(δ)).toFixed(1)

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }}>
      <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scl.toFixed(4)})`}>
        <path d={pathD} fill={fill} stroke={stroke} strokeWidth={mini ? +(10/scl).toFixed(2) : +(3/scl).toFixed(3)}
          strokeLinejoin="round" strokeLinecap="round" />
      </g>
      {!mini && <>
        <line x1={vx(150)} y1={cy_v} x2={cx_v} y2={cy_v}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <line x1={ecx_v} y1={ecy_v} x2={cx_v} y2={cy_v}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <path d={`M ${cx_v - arcR} ${cy_v} A ${arcR} ${arcR} 0 0 1 ${annBx} ${annBy}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={cx_v} y={cy_v + 20} fontSize="15" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle">δ = {angle}°</text>
        <line x1={vx(150)} y1={vy(478)} x2={vx(150)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(230)} y1={vy(478)} x2={vx(230)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(150)} y1={vy(484)} x2={vx(230)} y2={vy(484)} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <text x={vx(190)} y={vy(506)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{d0Label}</text>
      </>}
    </svg>
  )
}

function SchemaCoudeZ({ mini, di_mm, lOverD }: { mini?: boolean; di_mm?: number | null; lOverD?: number | null }) {
  const θ = Math.PI / 6
  const cθ = Math.cos(θ), sθ = Math.sin(θ)
  const r = 40
  const lOD = Math.max(0, Math.min(3, lOverD ?? 1.5))
  const L = lOD * 80

  const eCy = 150, mx0 = 140, eLx = 50
  const dDir: [number, number] = [cθ, sθ]
  const nu: [number, number] = [sθ, -cθ]
  const nl: [number, number] = [-sθ, cθ]

  const mx1 = mx0 + L * cθ, my1 = eCy + L * sθ
  const exEnd = mx1 + 90

  const ic1 = lineIntersect([mx0, eCy - r], [1, 0], [mx0 + r * nu[0], eCy + r * nu[1]], dDir)
  const oc1 = lineIntersect([mx0, eCy + r], [1, 0], [mx0 + r * nl[0], eCy + r * nl[1]], dDir)
  const oc2 = lineIntersect([mx1, my1 - r], [1, 0], [mx1 + r * nu[0], my1 + r * nu[1]], dDir)
  const ic2 = lineIntersect([mx1, my1 + r], [1, 0], [mx1 + r * nl[0], my1 + r * nl[1]], dDir)

  const toS = ([x, y]: [number, number]) => `${x.toFixed(1)} ${y.toFixed(1)}`
  const pathD = [
    `M ${eLx} ${eCy - r}`,
    `L ${toS(ic1)}`, `L ${toS(oc2)}`,
    `L ${exEnd.toFixed(1)} ${(my1 - r).toFixed(1)}`,
    waveC(exEnd, my1 - r, exEnd, my1 + r),
    `L ${toS(ic2)}`, `L ${toS(oc1)}`,
    `L ${eLx} ${eCy + r}`,
    waveC(eLx, eCy + r, eLx, eCy - r),
  ].join(' ')

  const VW = 500, VH = 420, M = 16
  const xLeft = 0, xRight = exEnd
  const yTop = eCy - r, yBot = my1 + r
  const scl = Math.min((VW - 2 * M) / (xRight - xLeft), (VH - 2 * M) / (yBot - yTop))
  const tx = M + ((VW - 2 * M) - (xRight - xLeft) * scl) / 2 - xLeft * scl
  const ty = M + ((VH - 2 * M) - (yBot - yTop) * scl) / 2 - yTop * scl
  const vx = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy = (wy: number) => +(ty + wy * scl).toFixed(1)

  const d0Label = di_mm != null ? `D = ${di_mm.toFixed(0)} mm` : 'D'
  const arcR = 28

  const dashLen = 70

  const lNx = sθ, lNy = -cθ        // perpendiculaire extérieure (au-dessus de la paroi diagonale)
  const lOff = 36, lExt = 5
  const ld1x = vx(ic1[0] + lOff * lNx), ld1y = vy(ic1[1] + lOff * lNy)
  const ld2x = vx(oc2[0] + lOff * lNx), ld2y = vy(oc2[1] + lOff * lNy)
  const le1x = vx(ic1[0] + (lOff + lExt) * lNx), le1y = vy(ic1[1] + (lOff + lExt) * lNy)
  const le2x = vx(oc2[0] + (lOff + lExt) * lNx), le2y = vy(oc2[1] + (lOff + lExt) * lNy)
  const lMidX = (ld1x + ld2x) / 2, lMidY = (ld1y + ld2y) / 2
  const lLabelX = +lMidX.toFixed(1), lLabelY = +lMidY.toFixed(1)
  const lLabel = di_mm != null ? `L = ${Math.round(lOD * di_mm)} mm` : 'L'

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }}>
      <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scl.toFixed(4)})`}>
        <path d={pathD} fill="#f1f5f9" stroke="#374151" strokeWidth={mini ? +(10/scl).toFixed(2) : +(3/scl).toFixed(3)}
          strokeLinejoin="round" strokeLinecap="round" />
        <line x1={ic1[0].toFixed(1)} y1={ic1[1].toFixed(1)} x2={oc1[0].toFixed(1)} y2={oc1[1].toFixed(1)}
          stroke="#374151" strokeWidth={mini ? +(6/scl).toFixed(2) : +(2/scl).toFixed(3)} strokeLinecap="round" />
        <line x1={oc2[0].toFixed(1)} y1={oc2[1].toFixed(1)} x2={ic2[0].toFixed(1)} y2={ic2[1].toFixed(1)}
          stroke="#374151" strokeWidth={mini ? +(6/scl).toFixed(2) : +(2/scl).toFixed(3)} strokeLinecap="round" />
      </g>
      {!mini && <>
        {/* D₀ : repères horizontaux + trait vertical à gauche de l'entrée (gap=8, repère=12) */}
        <line x1={vx(30)} y1={vy(eCy - r)} x2={vx(42)} y2={vy(eCy - r)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(30)} y1={vy(eCy + r)} x2={vx(42)} y2={vy(eCy + r)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(36)} y1={vy(eCy - r)} x2={vx(36)} y2={vy(eCy + r)} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <text x={vx(14)} y={vy(eCy)} fontSize="15" fill="#64748b" textAnchor="middle"
          dominantBaseline="middle" fontStyle="italic"
          transform={`rotate(-90, ${vx(14)}, ${vy(eCy)})`}>{d0Label}</text>

        {/* Onglet haut : pointillé depuis ic1 (paroi supérieure entrée) vers la droite + arc + 30° */}
        <line x1={vx(ic1[0])} y1={vy(ic1[1])} x2={+(vx(ic1[0]) + dashLen).toFixed(1)} y2={vy(ic1[1])}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <path d={`M ${+(vx(ic1[0]) + arcR).toFixed(1)} ${vy(ic1[1])} A ${arcR} ${arcR} 0 0 1 ${+(vx(ic1[0]) + arcR * cθ).toFixed(1)} ${+(vy(ic1[1]) + arcR * sθ).toFixed(1)}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(vx(ic1[0]) + (arcR + 18) * Math.cos(Math.PI / 12)).toFixed(1)}
              y={+(vy(ic1[1]) + (arcR + 18) * Math.sin(Math.PI / 12)).toFixed(1)}
              fontSize="15" fill="#374151" fontWeight="600" textAnchor="middle" dominantBaseline="middle">30°</text>

        {/* Onglet bas : pointillé depuis ic2 (paroi inférieure sortie) vers la gauche + arc + 30° */}
        <line x1={vx(ic2[0])} y1={vy(ic2[1])} x2={+(vx(ic2[0]) - dashLen).toFixed(1)} y2={vy(ic2[1])}
          stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
        <path d={`M ${+(vx(ic2[0]) - arcR).toFixed(1)} ${vy(ic2[1])} A ${arcR} ${arcR} 0 0 1 ${+(vx(ic2[0]) - arcR * cθ).toFixed(1)} ${+(vy(ic2[1]) - arcR * sθ).toFixed(1)}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(vx(ic2[0]) + (arcR + 18) * Math.cos(Math.PI + Math.PI / 12)).toFixed(1)}
              y={+(vy(ic2[1]) + (arcR + 18) * Math.sin(Math.PI + Math.PI / 12)).toFixed(1)}
              fontSize="15" fill="#374151" fontWeight="600" textAnchor="middle" dominantBaseline="middle">30°</text>

        {/* Cote L : barres de renvoi + ligne parallèle à la diagonale + label */}
        <line x1={vx(ic1[0])} y1={vy(ic1[1])} x2={le1x} y2={le1y} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <line x1={vx(oc2[0])} y1={vy(oc2[1])} x2={le2x} y2={le2y} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <line x1={ld1x} y1={ld1y} x2={ld2x} y2={ld2y} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <text x={lLabelX} y={lLabelY} fontSize="15" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="5">{lLabel}</text>
      </>}
    </svg>
  )
}

// ── Schémas rectangulaires ────────────────────────────────────────────────────

interface RectSchemaProps {
  angle:          number
  orientation?:   'horizontal' | 'vertical'
  l_mm?:          number | null
  h_mm?:          number | null
  rOverA?:        number
  rOverB?:        number
  nVanes?:        1 | 2 | 3
  vaneThickness?: 'simple' | 'double'
  design38?:      1 | 2 | 3
  design39?:      1 | 2 | 3 | 4
  mini?:          boolean
}

// Largeur visible en pixels : proportionnelle à a₀/(a₀+b₀), clampée à [35, 130]
function rectW(l: number | null | undefined, h: number | null | undefined, ori: 'horizontal' | 'vertical' = 'horizontal'): number {
  const a0 = ori === 'vertical' ? (h ?? 200) : (l ?? 300)
  const b0 = ori === 'vertical' ? (l ?? 300) : (h ?? 200)
  return Math.max(35, Math.min(130, Math.round(160 * a0 / (a0 + b0))))
}

function SchemaRectOnglet({ angle, orientation = 'horizontal', l_mm, h_mm, mini }: RectSchemaProps) {
  const δ = Math.max(10, Math.min(90, angle)) * Math.PI / 180

  // Géométrie identique à SchemaCoudeOnglet — centre virtuel cx,cy pour le biseau
  const cx = 310, cy = 350
  const R  = 160,  r  = 80
  const exitLen = 120

  const d0: [number, number] = [0, -1]
  const d1: [number, number] = [Math.sin(δ), -Math.cos(δ)]
  const oRef1: [number, number] = [cx - R * Math.cos(δ), cy - R * Math.sin(δ)]
  const iRef1: [number, number] = [cx - r * Math.cos(δ), cy - r * Math.sin(δ)]
  const oc = lineIntersect([150, cy], d0, oRef1, d1)
  const ic = lineIntersect([230, cy], d0, iRef1, d1)
  const eoEnd: [number, number] = [oRef1[0] + exitLen * d1[0], oRef1[1] + exitLen * d1[1]]
  const eiEnd: [number, number] = [iRef1[0] + exitLen * d1[0], iRef1[1] + exitLen * d1[1]]

  const toS = ([x, y]: [number, number]) => `${x.toFixed(1)} ${y.toFixed(1)}`
  // Coude rect. : même chemin que coude circulaire à onglet, sans les vagues
  const pathD = [
    `M 150 470`, `L ${toS(oc)}`, `L ${toS(eoEnd)}`,
    `L ${toS(eiEnd)}`, `L ${toS(ic)}`, `L 230 470 Z`,
  ].join(' ')

  // Mise à l'échelle — identique à SchemaRectRayonLisse (viewBox "30 140 430 390")
  const xRight_w = Math.max(eoEnd[0], cx)
  const yTop_w   = Math.min(oRef1[1], eoEnd[1])
  const vbL = 143, vbT = 143, vbR = 456, vbB = 525, M = 8
  const scl = Math.min((vbR - vbL - 2*M) / (xRight_w - 150), (vbB - vbT - 2*M) / (510 - yTop_w))
  const tx  = vbL + M + ((vbR - vbL - 2*M) - (xRight_w - 150) * scl) / 2 - 150 * scl
  const ty  = vbT + M + ((vbB - vbT - 2*M) - (500 - yTop_w) * scl) / 2 - yTop_w * scl + (mini ? 0 : 10)
  const vx  = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy  = (wy: number) => +(ty + wy * scl).toFixed(1)

  const fill = '#f1f5f9', stroke = '#374151'
  const dimLabel = orientation === 'vertical'
    ? (h_mm != null ? `H = ${h_mm} mm` : 'H')
    : (l_mm != null ? `L = ${l_mm} mm` : 'L')

  // Annotation angle — identique à SchemaCoudeOnglet (lignes pointillées + arc au centre virtuel)
  const cx_v  = vx(cx),       cy_v  = vy(cy)
  const ecx_v = vx(oRef1[0]), ecy_v = vy(oRef1[1])
  const arcR  = 28
  const annBx = +(cx_v - arcR * Math.cos(δ)).toFixed(1)
  const annBy = +(cy_v - arcR * Math.sin(δ)).toFixed(1)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox="30 140 430 390" width="100%" height="100%" style={{ display: 'block' }}>
        <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scl.toFixed(4)})`}>
          <path d={pathD} fill={fill} stroke={stroke}
            strokeWidth={mini ? +(10/scl).toFixed(2) : +(3/scl).toFixed(3)}
            strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {!mini && <>
          <line x1={vx(150)} y1={cy_v} x2={cx_v} y2={cy_v}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
          <line x1={ecx_v} y1={ecy_v} x2={cx_v} y2={cy_v}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
          <path d={`M ${cx_v - arcR} ${cy_v} A ${arcR} ${arcR} 0 0 1 ${annBx} ${annBy}`}
            stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <text x={cx_v} y={+(cy_v + 20).toFixed(1)} fontSize="15" fill="#374151" fontWeight="600"
            textAnchor="middle" dominantBaseline="middle">δ = {angle}°</text>
          <line x1={vx(150)} y1={vy(478)} x2={vx(150)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(230)} y1={vy(478)} x2={vx(230)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(150)} y1={vy(484)} x2={vx(230)} y2={vy(484)} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
          <text x={vx(190)} y={vy(506)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{dimLabel}</text>
        </>}
      </svg>
      {!mini && (() => {
        const lv = l_mm ?? 300, hv = h_mm ?? 200
        const pad = 5
        const maxCsW = 100, maxCsH = 80
        const sc = Math.min(maxCsW / lv, maxCsH / hv)
        const csW = Math.max(8, Math.round(sc * lv))
        const csH = Math.max(6, Math.round(sc * hv))
        const csX1 = pad + csW, csY1 = pad + csH
        const lLbl = l_mm != null ? `L = ${l_mm} mm` : 'L'
        const hLbl = h_mm != null ? `H = ${h_mm} mm` : 'H'
        return (
          <svg style={{ position: 'absolute', top: -10, left: 0, width: '51%', height: '33%', pointerEvents: 'none' }}
            viewBox="0 0 220 130" preserveAspectRatio="xMinYMin meet">
            <rect x={pad} y={pad} width={csW} height={csH}
              fill="#f1f5f9" stroke="#374151" strokeWidth="1.5" strokeLinejoin="round" />
            <line x1={pad}  y1={csY1 + 8}  x2={pad}  y2={csY1 + 20} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1} y1={csY1 + 8}  x2={csX1} y2={csY1 + 20} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={pad}  y1={csY1 + 14} x2={csX1} y2={csY1 + 14} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={pad + csW / 2} y={csY1 + 36} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">{lLbl}</text>
            <line x1={csX1 + 8}  y1={pad}  x2={csX1 + 20} y2={pad}  stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1 + 8}  y1={csY1} x2={csX1 + 20} y2={csY1} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1 + 14} y1={pad}  x2={csX1 + 14} y2={csY1} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={csX1 + 26} y={pad + csH / 2} fontSize="15" fill="#64748b" textAnchor="start" dominantBaseline="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">{hLbl}</text>
          </svg>
        )
      })()}
    </div>
  )
}

function SchemaRectRayonLisse({ angle, orientation = 'horizontal', l_mm, h_mm, rOverA = 1.5, mini }: RectSchemaProps) {
  const w  = 80
  const δ  = Math.max(1, Math.min(179, angle)) * Math.PI / 180
  const f  = (v: number) => +v.toFixed(1)

  // Même formule que les coudes circulaires : R = w×(r/W+0.5), r = w×(r/W-0.5)
  const R  = w * (rOverA + 0.5)
  const r  = Math.max(0, w * (rOverA - 0.5))
  const xO = 150  // paroi extérieure entrée (coords monde fixes)
  const cx = xO + R, cy = 350, exitLen = 120

  const ox2 = cx - R * Math.cos(δ),  oy2 = cy - R * Math.sin(δ)
  const ix2 = cx - r * Math.cos(δ),  iy2 = cy - r * Math.sin(δ)
  const exitDx = Math.sin(δ),         exitDy = -Math.cos(δ)
  const oEx = ox2 + exitLen * exitDx, oEy = oy2 + exitLen * exitDy
  const iEx = ix2 + exitLen * exitDx, iEy = iy2 + exitLen * exitDy
  const laf = δ > Math.PI ? 1 : 0
  const xI  = cx - r

  const pathD = [
    `M ${f(xO)} 470`, `L ${f(xO)} ${cy}`,
    `A ${f(R)} ${f(R)} 0 ${laf} 1 ${f(ox2)} ${f(oy2)}`,
    `L ${f(oEx)} ${f(oEy)}`, `L ${f(iEx)} ${f(iEy)}`, `L ${f(ix2)} ${f(iy2)}`,
    `A ${f(Math.max(0.01, r))} ${f(Math.max(0.01, r))} 0 ${laf} 0 ${f(xI)} ${cy}`,
    `L ${f(xI)} 470 Z`,
  ].join(' ')

  // Boîte englobante monde → projection dans la zone droite du viewBox "30 140 430 390"
  const arcTop   = δ >= Math.PI / 2 ? cy - R : oy2
  const xRight_w = Math.max(oEx, iEx, cx + R * Math.max(0, -Math.cos(δ)))
  const yTop_w   = Math.min(arcTop, oEy, iEy)
  const vbL = 143, vbT = 143, vbR = 456, vbB = 525, M = 8
  const scl = Math.min((vbR - vbL - 2*M) / (xRight_w - xO), (vbB - vbT - 2*M) / (510 - yTop_w))
  const tx  = vbL + M + ((vbR - vbL - 2*M) - (xRight_w - xO) * scl) / 2 - xO * scl
  const ty  = vbT + M + ((vbB - vbT - 2*M) - (500 - yTop_w) * scl) / 2 - yTop_w * scl + (mini ? 0 : 10)
  const vx  = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy  = (wy: number) => +(ty + wy * scl).toFixed(1)

  const fill = '#f1f5f9', stroke = '#374151'
  const dimLabel = orientation === 'vertical'
    ? (h_mm != null ? `H = ${h_mm} mm` : 'H')
    : (l_mm != null ? `L = ${l_mm} mm` : 'L')

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* SVG principal — coude centré (preserveAspectRatio par défaut xMidYMid meet) */}
      <svg viewBox="30 140 430 390" width="100%" height="100%" style={{ display: 'block' }}>
        <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scl.toFixed(4)})`}>
          <path d={pathD} fill={fill} stroke={stroke} strokeWidth={mini ? +(10/scl).toFixed(2) : +(3/scl).toFixed(3)}
            strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {!mini && (() => {
          const cx_vb = vx(cx), cy_vb = vy(cy)
          const rCtr  = rOverA * w
          const Px_vb = vx(cx - rCtr * Math.cos(δ / 2))
          const Py_vb = vy(cy - rCtr * Math.sin(δ / 2))
          const gnx = Math.cos(δ / 2), gny = Math.sin(δ / 2)
          const aa = Math.PI / 6, aw = 8
          const arr1x = +(Px_vb + aw * (gnx * Math.cos(aa)  - gny * Math.sin(aa))).toFixed(1)
          const arr1y = +(Py_vb + aw * (gnx * Math.sin(aa)  + gny * Math.cos(aa))).toFixed(1)
          const arr2x = +(Px_vb + aw * (gnx * Math.cos(-aa) - gny * Math.sin(-aa))).toFixed(1)
          const arr2y = +(Py_vb + aw * (gnx * Math.sin(-aa) + gny * Math.cos(-aa))).toFixed(1)
          const midX_vb = +((cx_vb + Px_vb) / 2).toFixed(1)
          const midY_vb = +((cy_vb + Py_vb) / 2).toFixed(1)
          const a0_val = orientation === 'vertical' ? (h_mm ?? 200) : (l_mm ?? 300)
          const rLbl = l_mm != null ? `r = ${Math.round(rOverA * a0_val)} mm` : 'r'
          const arcR = 28
          const annBx = +(cx_vb - arcR * Math.cos(δ)).toFixed(1)
          const annBy = +(cy_vb - arcR * Math.sin(δ)).toFixed(1)
          return <>
            <line x1={vx(xO)} y1={cy_vb} x2={cx_vb} y2={cy_vb}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
            <line x1={vx(ox2)} y1={vy(oy2)} x2={cx_vb} y2={cy_vb}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
            <path d={`M ${+(cx_vb - arcR).toFixed(1)} ${cy_vb} A ${arcR} ${arcR} 0 0 1 ${annBx} ${annBy}`}
              stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
            <text x={cx_vb} y={+(cy_vb + 20).toFixed(1)} fontSize="15" fill="#374151" fontWeight="600"
              textAnchor="middle" dominantBaseline="middle">δ = {angle}°</text>
            <line x1={vx(xO)} y1={vy(478)} x2={vx(xO)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(xI)} y1={vy(478)} x2={vx(xI)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(xO)} y1={vy(484)} x2={vx(xI)} y2={vy(484)} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={vx(xO + w / 2)} y={vy(506)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{dimLabel}</text>
            <line x1={cx_vb} y1={cy_vb} x2={Px_vb} y2={Py_vb} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={Px_vb} y1={Py_vb} x2={arr1x} y2={arr1y} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={Px_vb} y1={Py_vb} x2={arr2x} y2={arr2y} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
            <text x={midX_vb} y={midY_vb} fontSize="15" fill="#374151" fontWeight="600"
              textAnchor="middle" dominantBaseline="middle"
              paintOrder="stroke" stroke="white" strokeWidth="5">{rLbl}</text>
          </>
        })()}
      </svg>
      {/* Section transversale — SVG indépendant, ancré coin top-left du conteneur */}
      {!mini && (() => {
        const lv = l_mm ?? 300, hv = h_mm ?? 200
        const pad = 5
        const maxCsW = 100, maxCsH = 80
        const sc = Math.min(maxCsW / lv, maxCsH / hv)
        const csW = Math.max(8, Math.round(sc * lv))
        const csH = Math.max(6, Math.round(sc * hv))
        const csX1 = pad + csW, csY1 = pad + csH
        const lLbl = l_mm != null ? `L = ${l_mm} mm` : 'L'
        const hLbl = h_mm != null ? `H = ${h_mm} mm` : 'H'
        return (
          <svg
            style={{ position: 'absolute', top: -10, left: 0, width: '51%', height: '33%', pointerEvents: 'none' }}
            viewBox="0 0 220 130"
            preserveAspectRatio="xMinYMin meet"
          >
            <rect x={pad} y={pad} width={csW} height={csH}
              fill="#f1f5f9" stroke="#374151" strokeWidth="1.5" strokeLinejoin="round" />
            {/* Cote L — en dessous, même espacement que coude circulaire : gap=8, tick=8→20, ligne=14, label=36 */}
            <line x1={pad}  y1={csY1 + 8}  x2={pad}  y2={csY1 + 20} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1} y1={csY1 + 8}  x2={csX1} y2={csY1 + 20} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={pad}  y1={csY1 + 14} x2={csX1} y2={csY1 + 14} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={pad + csW / 2} y={csY1 + 36} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">{lLbl}</text>
            {/* Cote H — à droite, même espacement : gap=8, tick=8→20, ligne=14, label à 26 */}
            <line x1={csX1 + 8}  y1={pad}  x2={csX1 + 20} y2={pad}  stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1 + 8}  y1={csY1} x2={csX1 + 20} y2={csY1} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1 + 14} y1={pad}  x2={csX1 + 14} y2={csY1} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={csX1 + 26} y={pad + csH / 2} fontSize="15" fill="#64748b" textAnchor="start" dominantBaseline="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">{hLbl}</text>
          </svg>
        )
      })()}
    </div>
  )
}

// Tables CR pour positionnement des aubes (ASHRAE 3-7.a/b/c)
const A37_CR1_RW = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50]
const A37_CR1    = [0.218, 0.302, 0.361, 0.408, 0.447, 0.480, 0.509, 0.535, 0.557, 0.577]
const A37_CR2_RW = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]
const A37_CR2    = [0.362, 0.450, 0.507, 0.550, 0.585, 0.613]
const A37_CR3_RW = [0.05, 0.10]
const A37_CR3    = [0.467, 0.549]

function interpCR(rw: number[], cr: number[], rOverB: number): number {
  const v = Math.max(rw[0], Math.min(rw[rw.length - 1], rOverB))
  for (let i = 0; i < rw.length - 1; i++) {
    if (rw[i + 1] >= v) {
      const t = (v - rw[i]) / (rw[i + 1] - rw[i])
      return cr[i] * (1 - t) + cr[i + 1] * t
    }
  }
  return cr[cr.length - 1]
}

function SchemaRectAubes({ angle, orientation = 'horizontal', l_mm, h_mm, rOverB = 0.70, nVanes = 1, mini }: RectSchemaProps) {
  const w  = 80
  const δ  = Math.max(1, Math.min(179, angle)) * Math.PI / 180
  const f  = (v: number) => +v.toFixed(1)

  // Géométrie variable identique à SchemaRectRayonLisse (rOverA = rOverB = r/W)
  const rW_calc = Math.max(0.05, rOverB - 0.5)   // R/W = r/W − 0,5
  const R  = w * (rOverB + 0.5)                  // paroi extérieure
  const r  = Math.max(0, w * (rOverB - 0.5))     // gorge
  const xO = 150
  const cx = xO + R, cy = 350, exitLen = 120

  const ox2 = cx - R * Math.cos(δ),  oy2 = cy - R * Math.sin(δ)
  const ix2 = cx - r * Math.cos(δ),  iy2 = cy - r * Math.sin(δ)
  const exitDx = Math.sin(δ),         exitDy = -Math.cos(δ)
  const oEx = ox2 + exitLen * exitDx, oEy = oy2 + exitLen * exitDy
  const iEx = ix2 + exitLen * exitDx, iEy = iy2 + exitLen * exitDy
  const laf = δ > Math.PI ? 1 : 0
  const xI  = cx - r

  const pathD = [
    `M ${f(xO)} 470`, `L ${f(xO)} ${cy}`,
    `A ${f(R)} ${f(R)} 0 ${laf} 1 ${f(ox2)} ${f(oy2)}`,
    `L ${f(oEx)} ${f(oEy)}`, `L ${f(iEx)} ${f(iEy)}`, `L ${f(ix2)} ${f(iy2)}`,
    `A ${f(Math.max(0.01, r))} ${f(Math.max(0.01, r))} 0 ${laf} 0 ${f(xI)} ${cy}`,
    `L ${f(xI)} 470 Z`,
  ].join(' ')

  const arcTop   = δ >= Math.PI / 2 ? cy - R : oy2
  const xRight_w = Math.max(oEx, iEx, cx + R * Math.max(0, -Math.cos(δ)))
  const yTop_w   = Math.min(arcTop, oEy, iEy)
  const vbL = 143, vbT = 143, vbR = 456, vbB = 525, M = 8
  const scl = Math.min((vbR - vbL - 2*M) / (xRight_w - xO), (vbB - vbT - 2*M) / (510 - yTop_w))
  const tx  = vbL + M + ((vbR - vbL - 2*M) - (xRight_w - xO) * scl) / 2 - xO * scl
  const ty  = vbT + M + ((vbB - vbT - 2*M) - (500 - yTop_w) * scl) / 2 - yTop_w * scl + (mini ? 0 : 10)
  const vx  = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy  = (wy: number) => +(ty + wy * scl).toFixed(1)

  const fill = '#f1f5f9', stroke = '#374151'
  const dimLabel = orientation === 'vertical'
    ? (h_mm != null ? `H = ${h_mm} mm` : 'H')
    : (l_mm != null ? `L = ${l_mm} mm` : 'L')

  // Positions des aubes : Rk = r_gorge / CR^k (formule directe ASHRAE 3-7)
  const [crRW, crVals] = nVanes >= 3 ? [A37_CR3_RW, A37_CR3] : nVanes >= 2 ? [A37_CR2_RW, A37_CR2] : [A37_CR1_RW, A37_CR1]
  const CR = interpCR(crRW, crVals, rW_calc)
  const vaneFracs  = Array.from({ length: nVanes }, (_, k) =>
    Math.min(1, rW_calc * (1 / Math.pow(CR, k + 1) - 1))
  )
  const vaneRadii = Array.from({ length: nVanes }, (_, k) => r / Math.pow(CR, k + 1))
  const vaneW = +(2 / scl).toFixed(3)
  const vaneWMini = +(8 / scl).toFixed(2)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox="30 140 430 390" width="100%" height="100%" style={{ display: 'block' }}>
        <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scl.toFixed(4)})`}>
          <path d={pathD} fill={fill} stroke={stroke}
            strokeWidth={mini ? +(10/scl).toFixed(2) : +(3/scl).toFixed(3)}
            strokeLinejoin="round" strokeLinecap="round" />
          {vaneRadii.map((rho, k) => (
            <path key={k}
              d={`M ${f(cx - rho)} ${f(cy)} A ${f(rho)} ${f(rho)} 0 ${laf} 1 ${f(cx - rho * Math.cos(δ))} ${f(cy - rho * Math.sin(δ))}`}
              fill="none" stroke="#374151"
              strokeWidth={mini ? vaneWMini : vaneW}
              strokeLinecap="round" />
          ))}
        </g>
        {!mini && (() => {
          const cx_vb = vx(cx), cy_vb = vy(cy)
          const rCtr  = rOverB * w  // rayon axe central = r/W × w (à l'échelle)
          const Px_vb = vx(cx - rCtr * Math.cos(δ / 2))
          const Py_vb = vy(cy - rCtr * Math.sin(δ / 2))
          const gnx = Math.cos(δ / 2), gny = Math.sin(δ / 2)
          const aa = Math.PI / 6, aw = 8
          const arr1x = +(Px_vb + aw * (gnx * Math.cos(aa)  - gny * Math.sin(aa))).toFixed(1)
          const arr1y = +(Py_vb + aw * (gnx * Math.sin(aa)  + gny * Math.cos(aa))).toFixed(1)
          const arr2x = +(Px_vb + aw * (gnx * Math.cos(-aa) - gny * Math.sin(-aa))).toFixed(1)
          const arr2y = +(Py_vb + aw * (gnx * Math.sin(-aa) + gny * Math.cos(-aa))).toFixed(1)
          const midX_vb = +((cx_vb + Px_vb) / 2).toFixed(1)
          const midY_vb = +((cy_vb + Py_vb) / 2).toFixed(1)
          const a0_val = orientation === 'vertical' ? h_mm : l_mm
          const rLbl = a0_val != null ? `r = ${Math.round(rOverB * a0_val)} mm` : 'r'
          return <>
            <line x1={vx(xO)} y1={cy_vb} x2={cx_vb} y2={cy_vb}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
            <line x1={vx(ox2)} y1={vy(oy2)} x2={cx_vb} y2={cy_vb}
              stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
            <text x={cx_vb} y={+(cy_vb + 20).toFixed(1)} fontSize="15" fill="#374151" fontWeight="600"
              textAnchor="middle" dominantBaseline="middle">δ = {angle}°</text>
            <line x1={vx(xO)} y1={vy(478)} x2={vx(xO)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(xI)} y1={vy(478)} x2={vx(xI)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(xO)} y1={vy(484)} x2={vx(xI)} y2={vy(484)} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={vx(xO + w / 2)} y={vy(506)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{dimLabel}</text>
            <line x1={cx_vb} y1={cy_vb} x2={Px_vb} y2={Py_vb} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={Px_vb} y1={Py_vb} x2={arr1x} y2={arr1y} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={Px_vb} y1={Py_vb} x2={arr2x} y2={arr2y} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
            <text x={midX_vb} y={midY_vb} fontSize="15" fill="#374151" fontWeight="600"
              textAnchor="middle" dominantBaseline="middle"
              paintOrder="stroke" stroke="white" strokeWidth="5">{rLbl}</text>
            {/* Cotes R₁ R₂ R₃ : lignes horizontales depuis le centre de courbure */}
            {(() => {
              const yLevels = [388, 407, 426]  // positions fixes : R1 toujours en haut, R2 au milieu, R3 en bas
              const subs    = ['₁', '₂', '₃']
              const W_phys  = orientation === 'vertical' ? h_mm : l_mm
              const Rg_phys = W_phys != null ? W_phys * rW_calc : null
              const xRef    = +cx_vb.toFixed(1)
              const yBot    = +vy(462).toFixed(1)
              return <>
                {vaneRadii.map((ρ, k) => {
                  const xv   = +vx(cx - ρ).toFixed(1)
                  const yv   = +vy(yLevels[k]).toFixed(1)
                  const xMid = +((xv + xRef) / 2).toFixed(1)
                  const Rk   = Rg_phys != null ? Math.round(Rg_phys / Math.pow(CR, k + 1)) : null
                  const lbl  = Rk != null ? `R${subs[k]} = ${Rk} mm` : `R${subs[k]}`
                  return (
                    <g key={`rk-${k}`}>
                      {/* ligne horizontale vane → centre */}
                      <line x1={xv} y1={yv} x2={xRef} y2={yv}
                        stroke="#374151" strokeWidth="1" strokeLinecap="round" />
                      {/* tick côté aube */}
                      <line x1={xv} y1={+(yv - 5).toFixed(1)} x2={xv} y2={+(yv + 5).toFixed(1)}
                        stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
                      {/* tick côté centre */}
                      <line x1={xRef} y1={+(yv - 5).toFixed(1)} x2={xRef} y2={+(yv + 5).toFixed(1)}
                        stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
                      {/* label centré au-dessus de la ligne */}
                      <text x={xMid} y={+(yv - 7).toFixed(1)} fontSize="12" fill="#374151"
                        textAnchor="middle" dominantBaseline="auto"
                        paintOrder="stroke" stroke="white" strokeWidth="3">{lbl}</text>
                    </g>
                  )
                })}
              </>
            })()}
          </>
        })()}
      </svg>
      {!mini && (() => {
        const lv = l_mm ?? 300, hv = h_mm ?? 200
        const pad = 5
        const maxCsW = 100, maxCsH = 80
        const sc = Math.min(maxCsW / lv, maxCsH / hv)
        const csW = Math.max(8, Math.round(sc * lv))
        const csH = Math.max(6, Math.round(sc * hv))
        const csX1 = pad + csW, csY1 = pad + csH
        const lLbl = l_mm != null ? `L = ${l_mm} mm` : 'L'
        const hLbl = h_mm != null ? `H = ${h_mm} mm` : 'H'
        return (
          <svg
            style={{ position: 'absolute', top: -10, left: 0, width: '51%', height: '33%', pointerEvents: 'none' }}
            viewBox="0 0 220 130"
            preserveAspectRatio="xMinYMin meet"
          >
            <rect x={pad} y={pad} width={csW} height={csH}
              fill="#f1f5f9" stroke="#374151" strokeWidth="1.5" strokeLinejoin="round" />
            {vaneFracs.map((frac, k) => {
              if (orientation === 'vertical') {
                const yv = +(csY1 - frac * csH).toFixed(1)
                return <line key={k} x1={pad} y1={yv} x2={csX1} y2={yv}
                  stroke="#374151" strokeWidth="1" strokeLinecap="round" />
              } else {
                const xv = +(csX1 - frac * csW).toFixed(1)
                return <line key={k} x1={xv} y1={pad} x2={xv} y2={csY1}
                  stroke="#374151" strokeWidth="1" strokeLinecap="round" />
              }
            })}
            <line x1={pad}  y1={csY1 + 8}  x2={pad}  y2={csY1 + 20} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1} y1={csY1 + 8}  x2={csX1} y2={csY1 + 20} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={pad}  y1={csY1 + 14} x2={csX1} y2={csY1 + 14} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={pad + csW / 2} y={csY1 + 36} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">{lLbl}</text>
            <line x1={csX1 + 8}  y1={pad}  x2={csX1 + 20} y2={pad}  stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1 + 8}  y1={csY1} x2={csX1 + 20} y2={csY1} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1 + 14} y1={pad}  x2={csX1 + 14} y2={csY1} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={csX1 + 26} y={pad + csH / 2} fontSize="15" fill="#64748b" textAnchor="start" dominantBaseline="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">{hLbl}</text>
          </svg>
        )
      })()}
    </div>
  )
}

function SchemaRectOngletAubes({
  orientation = 'horizontal', l_mm, h_mm,
  vaneThickness = 'simple', design38 = 1, design39 = 1,
  mini,
}: RectSchemaProps) {
  const f  = (v: number) => +v.toFixed(1)
  const ff = (v: number) => +v.toFixed(2)

  // Fixed 90° geometry — identical to SchemaRectOnglet at δ=90°
  const oc:    [number, number] = [150, 190]
  const eoEnd: [number, number] = [430, 190]
  const eiEnd: [number, number] = [430, 270]
  const ic:    [number, number] = [230, 270]
  const toS = ([x, y]: [number, number]) => `${f(x)} ${f(y)}`
  const pathD = [`M 150 470`, `L ${toS(oc)}`, `L ${toS(eoEnd)}`,
                 `L ${toS(eiEnd)}`, `L ${toS(ic)}`, `L 230 470 Z`].join(' ')

  // Auto-scaling (fixed values for 90°)
  const xRight_w = 430, yTop_w = 190
  const vbL = 143, vbT = 143, vbR = 456, vbB = 525, Mg = 8
  const scl = Math.min((vbR-vbL-2*Mg)/(xRight_w-150), (vbB-vbT-2*Mg)/(510-yTop_w))
  const tx   = vbL+Mg+((vbR-vbL-2*Mg)-(xRight_w-150)*scl)/2 - 150*scl
  const ty   = vbT+Mg+((vbB-vbT-2*Mg)-(500-yTop_w)*scl)/2  - yTop_w*scl + (mini ? 0 : 10)
  const vx   = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy   = (wy: number) => +(ty + wy * scl).toFixed(1)

  // Annotation angle — même centre virtuel que SchemaRectOnglet à 90°
  const cx_v  = vx(310), cy_v  = vy(350)
  const ecx_v = vx(310), ecy_v = vy(190)
  const arcR  = 28

  const dimLabel = orientation === 'vertical'
    ? (h_mm != null ? `H = ${h_mm} mm` : 'H')
    : (l_mm != null ? `L = ${l_mm} mm` : 'L')

  const clipId   = `roa-${useId().replace(/:/g, '')}`
  const dkStroke = '#374151', dkFill = '#f1f5f9'

  // ASHRAE design parameters (inches)
  const DESIGNS_38: Record<1|2|3, { r: number; s: number; L: number }> = {
    1: { r: 2.0, s: 1.5,  L: 0.75 },
    2: { r: 4.5, s: 2.25, L: 0 },
    3: { r: 4.5, s: 3.25, L: 1.60 },
  }
  const DESIGNS_39: Record<1|2|3|4, { r: number; s: number }> = {
    1: { r: 2.0, s: 1.5 },
    2: { r: 2.0, s: 1.5 },
    3: { r: 2.0, s: 2.13 },
    4: { r: 4.5, s: 3.25 },
  }

  const isDouble = vaneThickness === 'double'
  const dp  = isDouble ? DESIGNS_39[design39 as 1|2|3|4] : DESIGNS_38[design38 as 1|2|3]
  const L_in = isDouble ? 0 : DESIGNS_38[design38 as 1|2|3].L

  const W_phys  = (orientation === 'vertical' ? h_mm : l_mm) ?? 300
  const sc_vane = 80 / W_phys        // world units per mm
  const s_w     = dp.s * 25.4 * sc_vane
  const r_w     = dp.r * 25.4 * sc_vane
  const L_w     = L_in * 25.4 * sc_vane

  // Premier rayon au coin intérieur (d=0), puis espacés de s_w
  const N_total = Math.max(1, Math.min(
    Math.max(1, Math.round(W_phys / (dp.s * 25.4))),
    Math.floor(80 / Math.max(0.5, s_w)),
  ))
  const N_vanes = N_total
  const sw_vane = mini ? ff(10 / scl) : ff(3 / scl)

  // Vane arcs: sweep=1 (CW in SVG y-down) → enters going up, exits going right
  // Miter line at 90°: y = x + 40 → vane k at x_k = 230 − (k+1)·s_w, y_k = x_k + 40
  const vaneElems = Array.from({ length: N_vanes }, (_, k) => {
    const d  = k * s_w
    if (d >= 80) return null
    const xk = 230 - d
    const yk = xk + 40   // centre de l'aube sur la diagonale y = x + 40

    if (isDouble && !mini) {
      // Double épaisseur — deux traits sans remplissage :
      //   Arc extérieur (face flux) : T1 → grand arc CW → T2
      //   Chemin intérieur (dos)    : T1 → longue ligne V ↑ → petit arc CW → longue ligne H → T2
      const r_c = Math.max(0.8, r_w * 0.15)  // petit arc de coin

      const outerD = [
        `M ${f(xk - r_w)} ${f(yk)}`,
        `A ${ff(r_w)} ${ff(r_w)} 0 0 1 ${f(xk)} ${f(yk - r_w)}`,
      ].join(' ')

      // V ↑ de T1=(xk−r,yk) jusqu'au départ de l'arc, puis arc CW, puis H → jusqu'à T2
      const arcCx = f(xk - r_w + r_c)
      const arcCy = f(yk - r_w + r_c)   // centre du petit arc (coin haut-gauche)
      const innerD = [
        `M ${f(xk - r_w)} ${f(yk)}`,
        `L ${f(xk - r_w)} ${f(yk - r_w + r_c)}`,                  // V ↑ (long)
        `A ${ff(r_c)} ${ff(r_c)} 0 0 1 ${arcCx} ${f(yk - r_w)}`,  // petit arc CW
        `L ${f(xk)} ${f(yk - r_w)}`,                               // H → (long)
      ].join(' ')

      return (
        <g key={k}>
          <path d={outerD} fill="none" stroke={dkStroke} strokeWidth={sw_vane} strokeLinecap="round" />
          <path d={innerD} fill="none" stroke={dkStroke} strokeWidth={sw_vane} strokeLinecap="round" />
        </g>
      )
    }

    // Arc : de (xk−r, yk) à (xk, yk−r), centre à (xk, yk) sur la diagonale
    const pts = [
      `M ${f(xk - r_w)} ${f(yk)}`,
      `A ${ff(r_w)} ${ff(r_w)} 0 0 1 ${f(xk)} ${f(yk - r_w)}`,
    ]
    if (L_w > 0) pts.push(`L ${f(xk + L_w)} ${f(yk - r_w)}`)
    return (
      <path key={k} d={pts.join(' ')} fill="none"
        stroke={dkStroke} strokeWidth={sw_vane} strokeLinecap="round" />
    )
  })

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox="30 140 430 390" width="100%" height="100%" style={{ display: 'block' }}>
        <defs>
          <clipPath id={clipId}>
            <path d={pathD} />
          </clipPath>
        </defs>
        <g transform={`translate(${f(tx)} ${f(ty)}) scale(${scl.toFixed(4)})`}>
          <path d={pathD} fill={dkFill} stroke={dkStroke}
            strokeWidth={mini ? ff(10 / scl) : ff(3 / scl)}
            strokeLinejoin="round" strokeLinecap="round" />
          <g clipPath={`url(#${clipId})`}>
            {vaneElems}
          </g>
        </g>
        {!mini && <>
          <line x1={vx(150)} y1={cy_v} x2={cx_v} y2={cy_v}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
          <line x1={ecx_v} y1={ecy_v} x2={cx_v} y2={cy_v}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="5 4" strokeLinecap="round" />
          <path d={`M ${+(cx_v - arcR).toFixed(1)} ${cy_v} A ${arcR} ${arcR} 0 0 1 ${cx_v} ${+(cy_v - arcR).toFixed(1)}`}
            stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
          <text x={cx_v} y={+(cy_v + 20).toFixed(1)} fontSize="15" fill="#374151" fontWeight="600"
            textAnchor="middle" dominantBaseline="middle">δ = 90°</text>
          <line x1={vx(150)} y1={vy(478)} x2={vx(150)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(230)} y1={vy(478)} x2={vx(230)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(150)} y1={vy(484)} x2={vx(230)} y2={vy(484)} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
          <text x={vx(190)} y={vy(506)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{dimLabel}</text>
        </>}
      </svg>
      {!mini && (() => {
        const lv = l_mm ?? 300, hv = h_mm ?? 200
        const pad = 5, maxCsW = 100, maxCsH = 80
        const sc2 = Math.min(maxCsW / lv, maxCsH / hv)
        const csW = Math.max(8, Math.round(sc2 * lv))
        const csH = Math.max(6, Math.round(sc2 * hv))
        const csX1 = pad + csW, csY1 = pad + csH
        const lLbl = l_mm != null ? `L = ${l_mm} mm` : 'L'
        const hLbl = h_mm != null ? `H = ${h_mm} mm` : 'H'
        return (
          <svg style={{ position: 'absolute', top: -10, left: 0, width: '51%', height: '33%', pointerEvents: 'none' }}
            viewBox="0 0 220 130" preserveAspectRatio="xMinYMin meet">
            <rect x={pad} y={pad} width={csW} height={csH} fill="#f1f5f9" stroke="none" />
            {orientation === 'vertical'
              ? <path d={`M ${pad} ${csY1} L ${pad} ${pad} L ${csX1} ${pad} L ${csX1} ${csY1}`}
                  fill="none" stroke="#374151" strokeWidth="1.5" strokeLinejoin="round" />
              : <path d={`M ${csX1} ${pad} L ${pad} ${pad} L ${pad} ${csY1} L ${csX1} ${csY1}`}
                  fill="none" stroke="#374151" strokeWidth="1.5" strokeLinejoin="round" />
            }
            {Array.from({ length: N_total }, (_, k) => {
              const d = k * s_w
              if (d >= 80) return null
              if (orientation === 'vertical') {
                const yv = +(csY1 - d / 80 * csH).toFixed(1)
                return <line key={k} x1={pad} y1={yv} x2={csX1} y2={yv}
                  stroke="#374151" strokeWidth="1" strokeLinecap="round" />
              } else {
                const xv = +(csX1 - d / 80 * csW).toFixed(1)
                return <line key={k} x1={xv} y1={pad} x2={xv} y2={csY1}
                  stroke="#374151" strokeWidth="1" strokeLinecap="round" />
              }
            })}
            <line x1={pad}      y1={csY1+8}  x2={pad}      y2={csY1+20} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1}     y1={csY1+8}  x2={csX1}     y2={csY1+20} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={pad}      y1={csY1+14} x2={csX1}     y2={csY1+14} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={pad+csW/2} y={csY1+36}  fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">{lLbl}</text>
            <line x1={csX1+8}  y1={pad}      x2={csX1+20} y2={pad}      stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1+8}  y1={csY1}     x2={csX1+20} y2={csY1}     stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={csX1+14} y1={pad}      x2={csX1+14} y2={csY1}     stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={csX1+26}  y={pad+csH/2} fontSize="15" fill="#64748b" textAnchor="start" dominantBaseline="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="4">{hLbl}</text>
          </svg>
        )
      })()}
    </div>
  )
}

// ── Cartes de choix de type ───────────────────────────────────────────────────

interface TypeCardProps {
  type: SingularityType
  selected: boolean
  onClick: () => void
  orientation?: 'horizontal' | 'vertical'
  l_mm?: number | null
  h_mm?: number | null
}

const FULL_LABELS: Record<SingularityType, string[]> = {
  'coude-lisse':       ['Coude', 'lisse à rayon'],
  'coude-segmente':   ['Coude', 'segmenté'],
  'coude-onglet':     ['Coude', 'à onglet'],
  'coude-z':          ['Dévoi.', 'Z (2×30°)'],
  'rect-rayon-lisse': ['Coude', 'rayon lisse'],
  'rect-onglet':      ['Coude', 'à onglet'],
  'rect-aubes':        ['Coude aubes', 'séparatrices'],
  'rect-onglet-aubes': ['Coude onglet', 'avec aubes'],
}

function TypeCard({ type, selected, onClick, orientation = 'horizontal', l_mm, h_mm }: TypeCardProps) {
  const miniSchemas: Record<SingularityType, ReactElement> = {
    'coude-lisse':       <SchemaCoudeLisse angle={90} rOverD={1.5} mini />,
    'coude-segmente':   <SchemaCoudeSegmente angle={90} nPieces={3} mini />,
    'coude-onglet':     <SchemaCoudeOnglet angle={90} mini />,
    'coude-z':          <SchemaCoudeZ mini />,
    'rect-rayon-lisse': <SchemaRectRayonLisse angle={90} orientation="horizontal" mini />,
    'rect-onglet':      <SchemaRectOnglet angle={90} orientation="horizontal" mini />,
    'rect-aubes':        <SchemaRectAubes angle={90} orientation="horizontal" rOverB={1.0} nVanes={1} mini />,
    'rect-onglet-aubes': <SchemaRectOngletAubes angle={90} orientation="horizontal" l_mm={300} vaneThickness="simple" design38={2} mini />,
  }
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '7px 5px 6px',
      border: `1.5px solid ${selected ? '#2563eb' : '#e2e8f0'}`,
      borderRadius: 8,
      background: selected ? '#eff6ff' : '#f8fafc',
      cursor: 'pointer', gap: 3, transition: 'all 0.12s',
      boxShadow: selected ? '0 0 0 3px #2563eb22' : 'none',
    }}>
      <div style={{ width: '100%', height: 58 }}>
        {miniSchemas[type]}
      </div>
      <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
        <span style={{ fontSize: 9.5, fontWeight: selected ? 700 : 500,
          color: selected ? '#1d4ed8' : '#64748b', display: 'block' }}>
          {FULL_LABELS[type][0]}
        </span>
        <span style={{ fontSize: 9.5, fontWeight: selected ? 700 : 500,
          color: selected ? '#1d4ed8' : '#64748b', display: 'block' }}>
          {FULL_LABELS[type][1]}
        </span>
      </div>
    </button>
  )
}

// ── Modal principal ───────────────────────────────────────────────────────────

interface Props {
  isOpen:      boolean
  onClose:     () => void
  onSave:      (s: VentSingularity) => void
  editing:     VentSingularity | null
  di_mm:       number | null
  dynPressure: number | null
  ductInfo?:   string | null
  ductShape?:  'circular' | 'rectangular'
  l_mm?:       number | null
  h_mm?:       number | null
}

const CIRC_TYPES: SingularityType[] = ['coude-lisse', 'coude-segmente', 'coude-onglet', 'coude-z']
const RECT_TYPES: SingularityType[] = ['rect-rayon-lisse', 'rect-onglet', 'rect-aubes', 'rect-onglet-aubes']

export default function SingularityModal({ isOpen, onClose, onSave, editing, di_mm, dynPressure, ductInfo, ductShape = 'circular', l_mm, h_mm }: Props) {
  const [selType,     setSelType]     = useState<SingularityType | null>(null)
  const [angle,       setAngle]       = useState<number>(90)
  const [rOverD,      setROverD]      = useState<number>(1.5)
  const [nPieces,     setNPieces]     = useState<3 | 4 | 5>(3)
  const [typeAubes,   setTypeAubes]   = useState<'simple' | 'double'>('simple')
  const [nVanes,      setNVanes]      = useState<1 | 2 | 3>(1)
  const [orientation, setOrientation] = useState<'horizontal' | 'vertical'>('horizontal')
  const [rOverA,      setROverA]      = useState<number>(1.5)
  const [rOverB,        setROverB]        = useState<number>(0.70)
  const [lOverD,        setLOverD]        = useState<number>(1.5)
  const [vaneThickness, setVaneThickness] = useState<'simple' | 'double'>('simple')
  const [design38,      setDesign38]      = useState<1 | 2 | 3>(1)
  const [design39,      setDesign39]      = useState<1 | 2 | 3 | 4>(1)
  const [mounted,       setMounted]       = useState(false)

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => setMounted(true))
    else setMounted(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (editing) {
      setSelType(editing.type); setAngle(editing.angle)
      setROverD(editing.rOverD ?? 1.5)
      setNPieces((editing.nPieces ?? 3) as 3 | 4 | 5)
      setTypeAubes(editing.typeAubes ?? 'simple')
      setNVanes((editing.nVanes ?? 1) as 1 | 2 | 3)
      setLOverD(editing.lOverD ?? 1.5)
      setOrientation(editing.orientation ?? 'horizontal')
      setROverA(editing.rOverA ?? 1.5)
      setROverB(editing.rOverB ?? 0.70)
      setVaneThickness(editing.vaneThickness ?? 'simple')
      setDesign38((editing.design38 ?? 1) as 1 | 2 | 3)
      setDesign39((editing.design39 ?? 1) as 1 | 2 | 3 | 4)
    } else {
      setSelType(null); setAngle(90); setROverD(1.5); setNPieces(3)
      setTypeAubes('simple'); setNVanes(1); setOrientation('horizontal'); setROverA(1.5); setROverB(0.70); setLOverD(1.5)
      setVaneThickness('simple'); setDesign38(1); setDesign39(1)
    }
  }, [isOpen, editing])

  if (!isOpen) return null

  const ANGLE_MAX_90: SingularityType[] = ['rect-onglet', 'coude-onglet']
  const ANGLE_MIN_20: SingularityType[] = ['rect-onglet', 'coude-onglet']
  const angleMax = selType && ANGLE_MAX_90.includes(selType) ? 90 : 180
  const angleMin = selType && ANGLE_MIN_20.includes(selType) ? 20 : 1

  const isRectMode = ductShape === 'rectangular'
  const activeTypes = isRectMode ? RECT_TYPES : CIRC_TYPES

  const RHO_AIR = 1.2, NU_AIR = 15e-6
  const v_ms   = dynPressure != null ? Math.sqrt(2 * dynPressure / RHO_AIR) : null
  const Dh_m   = ductShape === 'circular' && di_mm != null
    ? di_mm / 1000
    : ductShape === 'rectangular' && l_mm != null && h_mm != null
      ? 2 * l_mm * h_mm / (l_mm + h_mm) / 1000
      : null
  const Re_duct = v_ms != null && Dh_m != null ? v_ms * Dh_m / NU_AIR : null
  const lambda  = Re_duct != null ? lambdaDarcy(Re_duct) : undefined

  const singObj: VentSingularity | null = selType ? {
    id: '', type: selType, angle, rOverD, nPieces, lOverD,
    typeAubes, nVanes, orientation, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined, rOverA, rOverB,
    vaneThickness, design38, design39,
  } : null
  const xiParts = singObj ? computeXiSingularityFull(singObj, lambda, Re_duct ?? undefined, di_mm ?? undefined, v_ms) : null
  const xi      = xiParts?.ksi_total ?? null
  const dp      = xi != null && dynPressure != null ? xi * dynPressure : null

  const handleSave = () => {
    if (!selType) return
    onSave({
      id: editing?.id ?? newSingId(), type: selType,
      angle: selType === 'coude-z' ? 30 : selType === 'rect-onglet-aubes' ? 90 : angle,
      ...(selType === 'coude-lisse'      ? { rOverD }           : {}),
      ...(selType === 'coude-segmente'   ? { nPieces, rOverD }  : {}),
      ...(selType === 'coude-z'          ? { lOverD }           : {}),
      ...(selType === 'rect-rayon-lisse' ? { orientation, rOverA, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-onglet'       ? { orientation, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-aubes'        ? { orientation, nVanes, rOverB, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-onglet-aubes' ? { orientation, vaneThickness, design38, design39, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
    })
    onClose()
  }

  const BigSchema = () => {
    if (!selType) return null
    const rp = { angle, orientation, l_mm, h_mm }
    switch (selType) {
      case 'coude-lisse':      return <SchemaCoudeLisse angle={angle} rOverD={rOverD} di_mm={di_mm} />
      case 'coude-segmente':   return <SchemaCoudeSegmente angle={angle} nPieces={nPieces} rOverD={rOverD} di_mm={di_mm} />
      case 'coude-onglet':     return <SchemaCoudeOnglet angle={angle} di_mm={di_mm} />
      case 'coude-z':          return <SchemaCoudeZ di_mm={di_mm} lOverD={lOverD} />
      case 'rect-rayon-lisse': return <SchemaRectRayonLisse {...rp} rOverA={rOverA} />
      case 'rect-onglet':       return <SchemaRectOnglet {...rp} />
      case 'rect-aubes':        return <SchemaRectAubes {...rp} nVanes={nVanes} rOverB={rOverB} />
      case 'rect-onglet-aubes': return <SchemaRectOngletAubes {...rp} angle={90} vaneThickness={vaneThickness} design38={design38} design39={design39} />
    }
  }

  // Styles communs
  const inp: React.CSSProperties = {
    padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6,
    fontSize: 13, background: '#f8fafc', fontFamily: 'ui-monospace, monospace',
    color: '#1e293b', fontWeight: 600, width: 74, boxSizing: 'border-box' as const,
  }
  const lbl: React.CSSProperties = {
    fontSize: 11, color: '#64748b', fontWeight: 600,
    letterSpacing: '0.01em',
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
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: ductInfo ? 3 : 0 }}>
              {editing ? 'Modifier le coude' : isRectMode ? 'Coude rectangulaire' : 'Coude circulaire'}
            </div>
            {ductInfo && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: '#6366f1', flexShrink: 0, display: 'inline-block',
                }} />
                {ductInfo}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: '#94a3b8', lineHeight: 1, padding: '2px 4px', marginTop: 1,
          }}>×</button>
        </div>

        {/* ── Sélecteur de type (+ orientation inline pour rect) ── */}
        <div style={{ flexShrink: 0, padding: '10px 18px 9px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: '#b0bec5',
              textTransform: 'uppercase' as const, letterSpacing: '0.07em' }}>
              {isRectMode ? 'Type de coude — rectangulaire' : 'Type de coude — circulaire'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {activeTypes.map(t => <TypeCard key={t} type={t} selected={selType === t} onClick={() => {
              setSelType(t)
              if (t === 'coude-z') { setAngle(30); return }
              if (selType === 'coude-z') setAngle(90)
              if (ANGLE_MAX_90.includes(t)) setAngle(a => Math.min(a, 90))
              if (ANGLE_MIN_20.includes(t)) setAngle(a => Math.max(a, 20))
              if (t === 'coude-segmente') setROverD(v => Math.max(0.75, Math.min(2.0, v)))
              if (t === 'coude-lisse')    setROverD(v => Math.max(0.5,  Math.min(2.5, v)))
            }} orientation={orientation} l_mm={l_mm} h_mm={h_mm} />)}
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
                Choisissez un type ci-dessus
              </span>
            </div>
          ) : (
            <>
              {/* ── Schéma SVG ── */}
              <div style={{
                position: 'relative',
                width: 400, flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                borderRight: '1px solid #f1f5f9', background: '#f8fafd',
              }}>
                {isRectMode && (selType === 'rect-rayon-lisse' || selType === 'rect-onglet' || selType === 'rect-aubes') && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0, zIndex: 2, pointerEvents: 'none',
                    background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', borderLeft: '1px solid #cbd5e1',
                    borderRadius: '0 0 0 4px',
                    width: 96, textAlign: 'center' as const, boxSizing: 'border-box' as const,
                    padding: '2px 8px', fontSize: 11, color: '#94a3b8', fontStyle: 'italic',
                  }}>
                    {orientation === 'vertical' ? 'Vue de profil' : 'Vue de dessus'}
                  </div>
                )}
                <div style={{ flex: 1, padding: '18px 14px 10px 18px', minHeight: 0 }}>
                  <BigSchema />
                </div>
              </div>

              {/* ── Paramètres ── */}
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column',
                padding: '16px 16px 14px 16px', overflowY: 'auto',
              }}>
                {/* Nom du type */}
                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                  {SING_LABELS[selType]}
                </div>
                <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 14 }} />

                {/* Orientation — rectangulaire uniquement */}
                {isRectMode && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: '#b0bec5',
                      textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 5 }}>
                      Orientation du coude
                    </div>
                    <div style={{ display: 'flex', gap: 5 }}>
                      {(['horizontal', 'vertical'] as const).map(o => {
                        const sel = orientation === o
                        const a0Label = o === 'horizontal'
                          ? `L${l_mm != null ? ` = ${l_mm} mm` : ''}`
                          : `H${h_mm != null ? ` = ${h_mm} mm` : ''}`
                        return (
                          <button key={o} onClick={() => setOrientation(o)} style={{
                            flex: 1, display: 'flex', flexDirection: 'column',
                            alignItems: 'center', justifyContent: 'center',
                            padding: '5px 8px', borderRadius: 6, cursor: 'pointer',
                            border: `1.5px solid ${sel ? '#0284c7' : '#e2e8f0'}`,
                            background: sel ? '#e0f2fe' : '#f8fafc',
                            transition: 'all 0.12s',
                            boxShadow: sel ? '0 0 0 3px #0284c722' : 'none',
                          }}>
                            <span style={{ fontSize: 11.5, fontWeight: 700, color: sel ? '#0369a1' : '#475569' }}>
                              {o === 'horizontal' ? 'Sur la largeur' : 'Sur la hauteur'}
                            </span>
                            <span style={{ fontSize: 9.5, color: sel ? '#0284c7' : '#94a3b8', fontStyle: 'italic' }}>
                              {a0Label}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Champs */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 74px',
                  rowGap: 10, columnGap: 8, alignItems: 'center',
                }}>
                  {selType !== 'coude-z' && selType !== 'rect-onglet-aubes' && <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>Angle δ (°)</span>
                      {(selType === 'coude-onglet' || selType === 'rect-onglet')
                        ? <span style={{ fontSize: 9, color: '#94a3b8' }}>20° – 90°</span>
                        : angleMax === 90
                          ? <span style={{ fontSize: 9, color: '#94a3b8' }}>≤ 90°</span>
                          : null}
                    </div>
                    <NumInput min={angleMin} max={angleMax} step={1} value={angle}
                      onChange={v => setAngle(Math.max(angleMin, Math.min(angleMax, v ?? 90)))} style={inp} />
                  </>}

                  {/* Circulaire — progressif */}
                  {selType === 'coude-lisse' && (<>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>r/D</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>0,50 – 2,50</span>
                    </div>
                    <NumInput min={0.5} max={2.5} step={0.05} value={rOverD}
                      onChange={v => setROverD(Math.max(0.5, Math.min(2.5, v ?? 1.50)))} style={inp} />
                  </>)}


                  {/* Circulaire — segmenté */}
                  {selType === 'coude-segmente' && (<>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>r/D</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>0,75 – 2,00</span>
                    </div>
                    <NumInput min={0.75} max={2.0} step={0.05} value={rOverD}
                      onChange={v => setROverD(Math.max(0.75, Math.min(2.0, v ?? 1.0)))} style={inp} />
                    <label style={{ ...lbl, marginTop: 4 }}>Nb. d'éléments</label>
                    <div style={{ display: 'flex', gap: 5, marginTop: 4, marginBottom: 10 }}>
                      {([3, 4, 5] as const).map(n => (
                        <button key={n} onClick={() => setNPieces(n)} style={{
                          flex: 1, padding: '5px 0', borderRadius: 6,
                          fontSize: 12, fontWeight: 700,
                          border: `1.5px solid ${nPieces === n ? '#2563eb' : '#e2e8f0'}`,
                          background: nPieces === n ? '#eff6ff' : '#f8fafc',
                          color: nPieces === n ? '#1d4ed8' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.1s',
                        }}>{n}</button>
                      ))}
                    </div>
                  </>)}

                  {/* Circulaire — dévoiement Z */}
                  {selType === 'coude-z' && (<>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>L/D</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>0 – 3</span>
                    </div>
                    <NumInput min={0} max={3} step={0.1} value={lOverD}
                      onChange={v => setLOverD(Math.max(0, Math.min(3, v ?? 1.5)))} style={inp} />
                  </>)}

                  {/* Rectangulaire — r/a₀ (rayon lisse uniquement) */}
                  {selType === 'rect-rayon-lisse' && (<>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                      <span style={lbl}>{`r/${orientation === 'vertical' ? 'H' : 'L'}`}</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>0,50 – 2,00</span>
                    </div>
                    <NumInput min={0.5} max={2.0} step={0.05} value={rOverA}
                      onChange={v => setROverA(Math.max(0.5, Math.min(2.0, v ?? 1.0)))} style={inp} />
                  </>)}

                  {/* Rectangulaire — aubes séparatrices (ASHRAE 3-7) */}
                  {selType === 'rect-aubes' && (<>
                    <label style={{ ...lbl, marginTop: 4 }}>Nb. d'aubes</label>
                    <div style={{ display: 'flex', gap: 5, marginTop: 4, marginBottom: 10 }}>
                      {([1, 2, 3] as const).map(n => {
                        const maxrW = n === 1 ? 1.00 : n === 2 ? 0.80 : 0.60
                        return (
                          <button key={n} onClick={() => {
                            setNVanes(n)
                            setROverB(v => Math.max(0.55, Math.min(v, maxrW)))
                          }} style={{
                            flex: 1, padding: '5px 0', borderRadius: 6,
                            fontSize: 12, fontWeight: 700,
                            border: `1.5px solid ${nVanes === n ? '#2563eb' : '#e2e8f0'}`,
                            background: nVanes === n ? '#eff6ff' : '#f8fafc',
                            color: nVanes === n ? '#1d4ed8' : '#64748b',
                            cursor: 'pointer', transition: 'all 0.1s',
                          }}>{n}</button>
                        )
                      })}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>{`r/${orientation === 'vertical' ? 'H' : 'L'}`}</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>
                        0,55 – {nVanes === 1 ? '1,00' : nVanes === 2 ? '0,80' : '0,60'}
                      </span>
                    </div>
                    <NumInput
                      min={0.55}
                      max={nVanes === 1 ? 1.00 : nVanes === 2 ? 0.80 : 0.60}
                      step={0.05}
                      value={rOverB}
                      onChange={v => {
                        const maxrW = nVanes === 1 ? 1.00 : nVanes === 2 ? 0.80 : 0.60
                        setROverB(Math.max(0.55, Math.min(maxrW, v ?? 0.70)))
                      }}
                      style={inp} />
                  </>)}

                  {/* Rectangulaire — onglet avec aubes directrices (ASHRAE 3-8 / 3-9) */}
                  {selType === 'rect-onglet-aubes' && (() => {
                    const info38: Record<1|2|3, { r: string; s: string; L: string }> = {
                      1: { r: '2,0"', s: '1,5"',  L: '0,75"' },
                      2: { r: '4,5"', s: '2,25"', L: '0' },
                      3: { r: '4,5"', s: '3,25"', L: '1,60"' },
                    }
                    const info39: Record<1|2|3|4, { r: string; s: string; runner: string }> = {
                      1: { r: '2,0"', s: '1,5"',  runner: 'Embossed' },
                      2: { r: '2,0"', s: '1,5"',  runner: 'Push-On' },
                      3: { r: '2,0"', s: '2,13"', runner: 'Embossed' },
                      4: { r: '4,5"', s: '3,25"', runner: 'Embossed' },
                    }
                    const btnStyle = (active: boolean): React.CSSProperties => ({
                      flex: 1, padding: '5px 0', borderRadius: 6,
                      fontSize: 11, fontWeight: 700,
                      border: `1.5px solid ${active ? '#2563eb' : '#e2e8f0'}`,
                      background: active ? '#eff6ff' : '#f8fafc',
                      color: active ? '#1d4ed8' : '#64748b',
                      cursor: 'pointer', transition: 'all 0.1s',
                    })
                    const infoStyle: React.CSSProperties = {
                      marginTop: 6, padding: '7px 10px', borderRadius: 6,
                      background: '#f8fafc', border: '1px solid #e2e8f0',
                      fontSize: 11, color: '#475569', lineHeight: 1.6,
                    }
                    return (
                      <div style={{ gridColumn: '1 / -1' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ ...lbl, flexShrink: 0 }}>Type d'aubes</span>
                          <div style={{ display: 'flex', gap: 5, flex: 1 }}>
                            <button onClick={() => setVaneThickness('simple')} style={btnStyle(vaneThickness === 'simple')}>Simple épaisseur</button>
                            <button onClick={() => setVaneThickness('double')} style={btnStyle(vaneThickness === 'double')}>Double épaisseur</button>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ ...lbl, flexShrink: 0 }}>Design</span>
                          <div style={{ display: 'flex', gap: 5, flex: 1 }}>
                            {(vaneThickness === 'simple' ? [1, 2, 3] as const : [1, 2, 3, 4] as const).map(n => (
                              <button key={n}
                                onClick={() => vaneThickness === 'simple' ? setDesign38(n as 1|2|3) : setDesign39(n as 1|2|3|4)}
                                style={btnStyle(vaneThickness === 'simple' ? design38 === n : design39 === n)}>
                                {n}
                              </button>
                            ))}
                          </div>
                        </div>
                        {vaneThickness === 'simple' ? (
                          <div style={infoStyle}>
                            r = {info38[design38].r} · s = {info38[design38].s} · L = {info38[design38].L}
                          </div>
                        ) : (<>
                          <div style={infoStyle}>
                            r = {info39[design39].r} · s = {info39[design39].s} · Runner : {info39[design39].runner}
                          </div>
                          <div style={{ ...infoStyle, marginTop: 4 }}>
                            V₀ = {v_ms != null ? v_ms.toFixed(2) + ' m/s' : '— m/s'}
                          </div>
                        </>)}
                      </div>
                    )
                  })()}
                </div>

                {/* ── Résultat ξ / ΔP ── */}
                {xi != null && (
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
                        {xiParts && xiParts.ksi_fr > 0.0005 && (
                          <div style={{ marginTop: 3, fontSize: 9,
                            color: '#818cf8', fontFamily: 'ui-monospace, monospace', lineHeight: 1.75 }}>
                            <span style={{ opacity: 0.7 }}>local </span>{xiParts.ksi_local.toFixed(3)}
                            {'  +  '}
                            <span style={{ opacity: 0.7 }}>fr </span>{xiParts.ksi_fr.toFixed(3)}
                          </div>
                        )}
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
                )}
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
          <button onClick={handleSave} disabled={!selType} style={{
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
