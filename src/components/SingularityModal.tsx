import { useState, useEffect, useId, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { NumInput } from './NumInput'
import {
  VentSingularity, SingularityType, XiParts,
  computeXiSingularityFull, lambdaDarcy, SING_LABELS, newSingId,
} from '../utils/singularityCalc'
import { waveC } from '../utils/schemaDraw'

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
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
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
          textAnchor="middle" dominantBaseline="middle">θ = {angle}°</text>
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
        <text x={vx(190)} y={+(vy(484) + 16).toFixed(1)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{d0Label}</text>
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
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
      {/* Duct geometry scaled to fit the fixed viewBox */}
      <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scl.toFixed(4)})`}>
        <path d={pathD} fill={fill} stroke={stroke} strokeWidth={mini ? +(10/scl).toFixed(2) : +(3/scl).toFixed(3)}
          strokeLinejoin="round" strokeLinecap="round" />
        {outerJoints.map((oj, k) => (
          <line key={k}
            x1={oj[0].toFixed(1)} y1={oj[1].toFixed(1)}
            x2={innerJoints[k][0].toFixed(1)} y2={innerJoints[k][1].toFixed(1)}
            stroke={stroke} strokeWidth={mini ? +(10/scl).toFixed(2) : +(2/scl).toFixed(3)} strokeLinecap="round" />
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
          textAnchor="middle" dominantBaseline="middle">θ = {angle}°</text>
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
        <text x={vx(190)} y={+(vy(484) + 16).toFixed(1)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{d0Label}</text>
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
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
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
          textAnchor="middle" dominantBaseline="middle">θ = {angle}°</text>
        <line x1={vx(150)} y1={vy(478)} x2={vx(150)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(230)} y1={vy(478)} x2={vx(230)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(150)} y1={vy(484)} x2={vx(230)} y2={vy(484)} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <text x={vx(190)} y={+(vy(484) + 16).toFixed(1)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{d0Label}</text>
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
    <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
      <g transform={`translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${scl.toFixed(4)})`}>
        <path d={pathD} fill="#f1f5f9" stroke="#374151" strokeWidth={mini ? +(10/scl).toFixed(2) : +(3/scl).toFixed(3)}
          strokeLinejoin="round" strokeLinecap="round" />
        <line x1={ic1[0].toFixed(1)} y1={ic1[1].toFixed(1)} x2={oc1[0].toFixed(1)} y2={oc1[1].toFixed(1)}
          stroke="#374151" strokeWidth={mini ? +(10/scl).toFixed(2) : +(2/scl).toFixed(3)} strokeLinecap="round" />
        <line x1={oc2[0].toFixed(1)} y1={oc2[1].toFixed(1)} x2={ic2[0].toFixed(1)} y2={ic2[1].toFixed(1)}
          stroke="#374151" strokeWidth={mini ? +(10/scl).toFixed(2) : +(2/scl).toFixed(3)} strokeLinecap="round" />
      </g>
      {!mini && <>
        {/* D₀ : repères horizontaux + trait vertical à gauche de l'entrée (gap=8, repère=12) */}
        <line x1={vx(30)} y1={vy(eCy - r)} x2={vx(42)} y2={vy(eCy - r)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(30)} y1={vy(eCy + r)} x2={vx(42)} y2={vy(eCy + r)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <line x1={vx(36)} y1={vy(eCy - r)} x2={vx(36)} y2={vy(eCy + r)} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <text x={+(vx(36) - 16).toFixed(1)} y={vy(eCy)} fontSize="15" fill="#64748b" textAnchor="middle"
          dominantBaseline="middle" fontStyle="italic"
          transform={`rotate(-90, ${+(vx(36) - 16).toFixed(1)}, ${vy(eCy)})`}>{d0Label}</text>

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

// ── Schéma ASHRAE 3-13 — Dévoiement en S / col de cygne ──────────────────────

function SchemaCoudeS({ mini, theta_s, di_mm, rOverDs, lOverDs, elbowTypeS, nPiecesS }: { mini?: boolean; theta_s?: number; di_mm?: number | null; rOverDs?: number; lOverDs?: number; elbowTypeS?: 'lisse' | 'segmente'; nPiecesS?: 3 | 4 | 5 }) {
  const cx   = 500
  const axL  = 76
  const axC  = 38
  const cy1  = 110

  // cy2 proportionnel à D (1 unité l/D = 2·axL px, même échelle que D), plafonné à lMaxVis
  const lOD     = Math.max(0, lOverDs ?? 4)
  const lMaxVis = 2.5
  const lVisLen = Math.max(10, Math.round(Math.min(lOD, lMaxVis) * 2 * axL))
  const cy2     = cy1 + lVisLen

  // len calculé par dichotomie : à θ=90°, ligne verticale / D = rOverDs
  const rOD = rOverDs ?? 1.0
  const _computeT90 = (L: number) => {
    const dx = L * Math.sqrt(3) / 2 + axL / 2
    const dy = 1.5 * L - axL * Math.sqrt(3) / 2
    const ri = (dx * dx + dy * dy) / (2 * dx)
    const rm = ri + axL
    const d  = ri - L * Math.sqrt(3) / 2
    return -L / 2 + Math.sqrt(Math.max(0, rm * rm - d * d))
  }
  const _targetT = rOD * 2 * axL
  let _lo = 50, _hi = 2000
  for (let _i = 0; _i < 60; _i++) {
    const _m = (_lo + _hi) / 2
    if (_computeT90(_m) < _targetT) _lo = _m; else _hi = _m
  }
  const len = (_lo + _hi) / 2

  const lx  = cx - axL  // 424
  const rxE = cx + axL  // 576

  // Diagonale fixe : 30° sous l'horizontale (cos30=√3/2, sin30=0.5)
  const dsx = +(lx - len * (Math.sqrt(3) / 2)).toFixed(1)
  const dsy = +(cy2 + len * 0.5).toFixed(1)

  // "Verticale" dynamique : tourne proportionnellement à θ
  //   à θ=90° → direction 90° (verticale bas)   arc=120°
  //   à θ=45° → direction 30° (bas-droite)       arc=60°
  const θ_deg      = Math.max(15, Math.min(90, theta_s ?? 90))
  const arcSpanDeg = 120 * θ_deg / 90               // 120° à θ=90°, 60° à θ=45°, …
  const vertDirRad = (330 + arcSpanDeg) * Math.PI / 180

  // Arcs concentriques : centre à y=cy2 → tangente verticale au départ, écart = 2·axL exact
  // Ri imposé par la contrainte : arc intérieur passe par le point de référence θ=90°
  const nwX_90 = dsx - axL * 0.5
  const nwY_90 = dsy + len - axL * (Math.sqrt(3) / 2)
  const Ri   = Math.round(((lx - nwX_90) ** 2 + (cy2 - nwY_90) ** 2) / (2 * (lx - nwX_90)))
  const Ro   = Ri + 2 * axL   // même centre → gap constant = 2·axL
  const Cx   = lx - Ri        // centre sur la ligne y=cy2
  const Cy   = cy2
  const Rmid = (Ri + Ro) / 2

  // Jonctions de segments (elbowTypeS === 'segmente')
  const nSeg = nPiecesS ?? 3

  // Intersection du rayon θ avec le cercle médian → position et orientation automatiques de l'ovale
  const cv  = Math.cos(vertDirRad)
  const sv  = Math.sin(vertDirRad)
  const bQ  = (dsx - Cx) * cv + (dsy - Cy) * sv
  const cQ  = (dsx - Cx) ** 2 + (dsy - Cy) ** 2 - Rmid ** 2
  const t   = -bQ + Math.sqrt(bQ * bQ - cQ)
  const dex = +(dsx + t * cv).toFixed(1)
  const dey = +(dsy + t * sv).toFixed(1)

  // Orientation automatique : direction radiale depuis le centre des arcs
  const φ_rad = Math.atan2(+dey - Cy, +dex - Cx)
  const cosφ  = Math.cos(φ_rad)
  const sinφ  = Math.sin(φ_rad)
  const nwX   = +(+dex - axL * cosφ).toFixed(1)
  const nwY   = +(+dey - axL * sinφ).toFixed(1)
  const seX   = +(+dex + axL * cosφ).toFixed(1)
  const seY   = +(+dey + axL * sinφ).toFixed(1)

  // Annotation D sur l'ovale incliné
  const d0Label = di_mm != null ? `D = ${di_mm.toFixed(0)} mm` : 'D'
  const rLabel  = di_mm != null && rOverDs != null ? `r = ${Math.round(rOverDs * di_mm)} mm` : 'r'
  const lLabel  = di_mm != null ? `l = ${Math.round(lOD * di_mm)} mm` : 'l'
  const φDeg   = (φ_rad * 180 / Math.PI).toFixed(1)
  const annOff = 32
  const annTx  = +(+dex - annOff * sinφ).toFixed(1)
  const annTy  = +(+dey + annOff * cosφ).toFixed(1)

  // Ligne r bas : du coin (dsx,dsy) vers le milieu de l'arc Rmid
  const rEndX  = +(Cx + Rmid * Math.cos(φ_rad / 2)).toFixed(1)
  const rEndY  = +(Cy + Rmid * Math.sin(φ_rad / 2)).toFixed(1)
  const rLen   = Math.hypot(+rEndX - +dsx, +rEndY - +dsy)
  const rDirX  = (+rEndX - +dsx) / rLen
  const rDirY  = (+rEndY - +dsy) / rLen
  const rLabelX = +((+dsx + +rEndX) / 2).toFixed(1)
  const rLabelY = +((+dsy + +rEndY) / 2).toFixed(1)

  // Arc θ bas : de 330° CW jusqu'à vertDirRad
  const aR  = 38
  const ax0 = +(dsx + aR * Math.cos(330 * Math.PI / 180)).toFixed(1)
  const ay0 = +(dsy + aR * Math.sin(330 * Math.PI / 180)).toFixed(1)
  const ax1 = +(dsx + aR * Math.cos(vertDirRad)).toFixed(1)
  const ay1 = +(dsy + aR * Math.sin(vertDirRad)).toFixed(1)

  // ── Virage supérieur (miroir du bas : x→2cx-x, y→cy1+cy2-y, virage vers la droite) ──
  const Cx_t   = rxE + Ri                                    // centre arcs supérieurs
  const dsx_t  = +(2 * cx - (+dsx)).toFixed(1)
  const dsy_t  = +(cy1 + cy2 - (+dsy)).toFixed(1)
  const dex_t  = +(2 * cx - (+dex)).toFixed(1)
  const dey_t  = +(cy1 + cy2 - (+dey)).toFixed(1)
  const nwX_t  = +(2 * cx - (+nwX)).toFixed(1)              // extrémité arc intérieur top
  const nwY_t  = +(cy1 + cy2 - (+nwY)).toFixed(1)
  const seX_t  = +(2 * cx - (+seX)).toFixed(1)              // extrémité arc extérieur top
  const seY_t  = +(cy1 + cy2 - (+seY)).toFixed(1)
  const rEndX_t  = +(Cx_t - Rmid * Math.cos(φ_rad / 2)).toFixed(1)
  const rEndY_t  = +(cy1   - Rmid * Math.sin(φ_rad / 2)).toFixed(1)
  const rLabelX_t = +((+dsx_t + +rEndX_t) / 2).toFixed(1)
  const rLabelY_t = +((+dsy_t + +rEndY_t) / 2).toFixed(1)
  // Arc θ haut : de 150° CW jusqu'à (150+arcSpanDeg)° (miroir du bas = +180°)
  const topArcStart = 150 * Math.PI / 180
  const topArcEnd   = (150 + arcSpanDeg) * Math.PI / 180
  const ax0_t = +(+dsx_t + aR * Math.cos(topArcStart)).toFixed(1)
  const ay0_t = +(+dsy_t + aR * Math.sin(topArcStart)).toFixed(1)
  const ax1_t = +(+dsx_t + aR * Math.cos(topArcEnd)).toFixed(1)
  const ay1_t = +(+dsy_t + aR * Math.sin(topArcEnd)).toFixed(1)
  // Extrémités de l'axe majeur de l'ovale supérieur (pour demi-ellipses plein/pointillé)
  const _ovalRX_t = +(+dex_t + axL * cosφ).toFixed(1)
  const _ovalRY_t = +(+dey_t + axL * sinφ).toFixed(1)
  const _ovalLX_t = +(+dex_t - axL * cosφ).toFixed(1)
  const _ovalLY_t = +(+dey_t - axL * sinφ).toFixed(1)

  // Boîte englobante automatique : géométrie + marge pour les labels
  const _pad  = mini ? 8 : 15
  const _xMin = Math.floor(mini ? (+dsx - _pad) : (+dsx - 90))
  const _xMax = Math.ceil(Math.max(
    mini ? (+dsx_t + _pad) : (+dsx_t + 90),
    +nwX_t + _pad,
    mini ? 0 : (cx + axL + 160)
  ))
  const _yMin = Math.floor(+seY_t - _pad)
  const _yMax = Math.ceil(+seY + _pad)
  const _vW   = _xMax - _xMin
  const _vH   = _yMax - _yMin
  const sw    = +((mini ? 10 : 3.75) * _vW / 500).toFixed(1)

  return (
    <svg viewBox={`${_xMin} ${_yMin} ${_vW} ${_vH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
      {/* Ovale cy1 — moitié basse pleine, moitié haute en pointillé */}
      {!mini && <ellipse cx={cx} cy={cy1} rx={axL} ry={axC} fill="#f1f5f9" stroke="none" />}
      {!mini && <path d={`M ${cx + axL} ${cy1} A ${axL} ${axC} 0 0 1 ${cx - axL} ${cy1}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />}
      {!mini && <path d={`M ${cx + axL} ${cy1} A ${axL} ${axC} 0 0 0 ${cx - axL} ${cy1}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray="10 9" />}
      {/* Ovale cy2 — moitié basse pleine, moitié haute en pointillé */}
      {!mini && <ellipse cx={cx} cy={cy2} rx={axL} ry={axC} fill="#f1f5f9" stroke="none" />}
      {!mini && <path d={`M ${cx + axL} ${cy2} A ${axL} ${axC} 0 0 1 ${cx - axL} ${cy2}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />}
      {!mini && <path d={`M ${cx + axL} ${cy2} A ${axL} ${axC} 0 0 0 ${cx - axL} ${cy2}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray="10 9" />}
      {/* Lignes verticales */}
      <line x1={lx}  y1={cy1} x2={lx}  y2={cy2} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      <line x1={rxE} y1={cy1} x2={rxE} y2={cy2} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      {/* ── Virage supérieur (vers la droite) ── */}
      {/* Ovale supérieur orienté : fond + demi-avant (plein) + demi-arrière (pointillé) */}
      <ellipse cx={dex_t} cy={dey_t} rx={axL} ry={axC}
        fill="#f1f5f9" stroke="none"
        transform={`rotate(${φDeg}, ${dex_t}, ${dey_t})`} />
      <path d={`M ${_ovalRX_t} ${_ovalRY_t} A ${axL} ${axC} ${φDeg} 0 0 ${_ovalLX_t} ${_ovalLY_t}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      <path d={`M ${_ovalRX_t} ${_ovalRY_t} A ${axL} ${axC} ${φDeg} 0 1 ${_ovalLX_t} ${_ovalLY_t}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray="10 9" />
      {/* Paroi intérieure top (depuis rxE, sweep CW = monte puis tourne à droite) */}
      <path d={`M ${rxE} ${cy1} A ${Ri} ${Ri} 0 0 1 ${nwX_t} ${nwY_t}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Paroi extérieure top (depuis lx, sweep CW) */}
      <path d={`M ${lx} ${cy1} A ${Ro} ${Ro} 0 0 1 ${seX_t} ${seY_t}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Jonctions de segments top */}
      {elbowTypeS === 'segmente' && Array.from({ length: nSeg - 1 }, (_, i) => {
        const α  = (i + 1) * φ_rad / nSeg
        const ix = +(Cx_t - Ri * Math.cos(α)).toFixed(1)
        const iy = +(cy1  - Ri * Math.sin(α)).toFixed(1)
        const ox = +(Cx_t - Ro * Math.cos(α)).toFixed(1)
        const oy = +(cy1  - Ro * Math.sin(α)).toFixed(1)
        return <line key={i} x1={ix} y1={iy} x2={ox} y2={oy}
          stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      })}
      {/* Pointillés top (masqués en mini) */}
      {!mini && <>
        <line x1={cx} y1={cy1} x2={dsx_t} y2={dsy_t}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
        <line x1={dsx_t} y1={dsy_t} x2={dex_t} y2={dey_t}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
      </>}
      {/* ── Virage inférieur (vers la gauche) ── */}
      {/* Ovale bas orienté NW-SE à 60° (dessiné avant les pointillés) */}
      <ellipse cx={dex} cy={dey} rx={axL} ry={axC}
        fill="#f1f5f9" stroke="#374151" strokeWidth={sw}
        transform={`rotate(${φDeg}, ${dex}, ${dey})`} />
      {/* Paroi intérieure — arc concentrique, départ vertical, gap = 2·axL constant */}
      <path d={`M ${lx} ${cy2} A ${Ri} ${Ri} 0 0 1 ${nwX} ${nwY}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Paroi extérieure — arc concentrique, même centre, Ro = Ri + 2·axL */}
      <path d={`M ${rxE} ${cy2} A ${Ro} ${Ro} 0 0 1 ${seX} ${seY}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Jonctions de segments bas */}
      {elbowTypeS === 'segmente' && Array.from({ length: nSeg - 1 }, (_, i) => {
        const α = (i + 1) * φ_rad / nSeg
        const ix = +(Cx + Ri * Math.cos(α)).toFixed(1)
        const iy = +(Cy + Ri * Math.sin(α)).toFixed(1)
        const ox = +(Cx + Ro * Math.cos(α)).toFixed(1)
        const oy = +(Cy + Ro * Math.sin(α)).toFixed(1)
        return <line key={i} x1={ix} y1={iy} x2={ox} y2={oy}
          stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      })}
      {/* Pointillés bas (masqués en mini) */}
      {!mini && <>
        <line x1={cx} y1={cy2} x2={dsx} y2={dsy}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
        <line x1={dsx} y1={dsy} x2={dex} y2={dey}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
      </>}
      {/* Annotations (mode grand schéma uniquement) */}
      {!mini && <>
        {/* Arc θ haut (150° → 150°+arcSpan, CW) + label à droite */}
        <path d={`M ${ax0_t} ${ay0_t} A ${aR} ${aR} 0 0 1 ${ax1_t} ${ay1_t}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(+dsx_t + 12).toFixed(1)} y={dsy_t} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="start" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">θ = {θ_deg}°</text>
        {/* Rayon r haut */}
        <line x1={dsx_t} y1={dsy_t} x2={rEndX_t} y2={rEndY_t}
          stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <text x={rLabelX_t} y={rLabelY_t} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">{rLabel}</text>
        {/* Arc θ bas (330° → 330°+arcSpan, CW) + label à gauche */}
        <path d={`M ${ax0} ${ay0} A ${aR} ${aR} 0 0 1 ${ax1} ${ay1}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(dsx - 12).toFixed(1)} y={dsy} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="end" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">θ = {θ_deg}°</text>
        {/* Annotation D sur l'ovale incliné : tirets perpendiculaires + ligne d'axe + label */}
        <g transform={`rotate(${φDeg}, ${dex}, ${dey})`}>
          <line x1={(+dex - axL).toFixed(1)} y1={(+dey - 6).toFixed(1)} x2={(+dex - axL).toFixed(1)} y2={(+dey + 6).toFixed(1)}
            stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={(+dex + axL).toFixed(1)} y1={(+dey - 6).toFixed(1)} x2={(+dex + axL).toFixed(1)} y2={(+dey + 6).toFixed(1)}
            stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={(+dex - axL).toFixed(1)} y1={dey} x2={(+dex + axL).toFixed(1)} y2={dey}
            stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        </g>
        <text x={annTx} y={annTy} fontSize="25" fill="#64748b" textAnchor="middle" fontStyle="italic">{d0Label}</text>
        {/* Rayon r : du coin des pointillés vers le milieu de l'arc */}
        <line x1={dsx} y1={dsy} x2={rEndX} y2={rEndY}
          stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <text x={rLabelX} y={rLabelY} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">{rLabel}</text>
        {/* Annotation l : côté gauche de la gaine */}
        {(() => {
          const lx2 = cx - axL - 20
          const ym  = (cy1 + cy2) / 2
          return <>
            <line x1={lx2 - 10} y1={cy1} x2={lx2 + 10} y2={cy1} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={lx2 - 10} y1={cy2} x2={lx2 + 10} y2={cy2} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={lx2} y1={cy1} x2={lx2} y2={cy2} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
            <text x={lx2 - 16} y={ym} fontSize="25" fill="#64748b" textAnchor="end" dominantBaseline="middle" fontStyle="italic">{lLabel}</text>
          </>
        })()}
      </>}
    </svg>
  )
}

// ── Schéma ASHRAE 3-14 — Dévoiement en S, deux plans perpendiculaires ────────

function SchemaCoude314({ mini, theta_s, di_mm, rOverDs, lOverDs, elbowTypeS, nPiecesS }: { mini?: boolean; theta_s?: number; di_mm?: number | null; rOverDs?: number; lOverDs?: number; elbowTypeS?: 'lisse' | 'segmente'; nPiecesS?: 3 | 4 | 5 }) {
  const cx   = 500
  const axL  = 76
  const axC  = 38
  const cy1  = 110

  const lOD     = Math.max(0, lOverDs ?? 4)
  const lMaxVis = 2.5
  const lVisLen = Math.max(10, Math.round(Math.min(lOD, lMaxVis) * 2 * axL))
  const cy2     = cy1 + lVisLen

  const rOD = rOverDs ?? 1.0
  const _computeT90 = (L: number) => {
    const dx = L * Math.sqrt(3) / 2 + axL / 2
    const dy = 1.5 * L - axL * Math.sqrt(3) / 2
    const ri = (dx * dx + dy * dy) / (2 * dx)
    const rm = ri + axL
    const d  = ri - L * Math.sqrt(3) / 2
    return -L / 2 + Math.sqrt(Math.max(0, rm * rm - d * d))
  }
  const _targetT = rOD * 2 * axL
  let _lo = 50, _hi = 2000
  for (let _i = 0; _i < 60; _i++) {
    const _m = (_lo + _hi) / 2
    if (_computeT90(_m) < _targetT) _lo = _m; else _hi = _m
  }
  const len = (_lo + _hi) / 2

  const lx  = cx - axL
  const rxE = cx + axL

  const dsx = +(lx - len * (Math.sqrt(3) / 2)).toFixed(1)
  const dsy = +(cy2 + len * 0.5).toFixed(1)

  const θ_deg      = Math.max(60, Math.min(90, theta_s ?? 90))
  const arcSpanDeg = 120 * θ_deg / 90
  const vertDirRad = (330 + arcSpanDeg) * Math.PI / 180

  const nwX_90 = dsx - axL * 0.5
  const nwY_90 = dsy + len - axL * (Math.sqrt(3) / 2)
  const Ri   = Math.round(((lx - nwX_90) ** 2 + (cy2 - nwY_90) ** 2) / (2 * (lx - nwX_90)))
  const Ro   = Ri + 2 * axL
  const Cx   = lx - Ri
  const Cy   = cy2
  const Rmid = (Ri + Ro) / 2

  const cv  = Math.cos(vertDirRad)
  const sv  = Math.sin(vertDirRad)
  const bQ  = (dsx - Cx) * cv + (dsy - Cy) * sv
  const cQ  = (dsx - Cx) ** 2 + (dsy - Cy) ** 2 - Rmid ** 2
  const t   = -bQ + Math.sqrt(bQ * bQ - cQ)
  const dex = +(dsx + t * cv).toFixed(1)
  const dey = +(dsy + t * sv).toFixed(1)

  const φ_rad = Math.atan2(+dey - Cy, +dex - Cx)
  const cosφ  = Math.cos(φ_rad)
  const sinφ  = Math.sin(φ_rad)
  const nwX   = +(+dex - axL * cosφ).toFixed(1)

  // Valeurs θ=90° fixes pour la partie haute (arcs et ovale indépendants de θ)
  const cv_90    = Math.cos((330 + 120) * Math.PI / 180)
  const sv_90    = Math.sin((330 + 120) * Math.PI / 180)
  const bQ_90    = (dsx - Cx) * cv_90 + (dsy - Cy) * sv_90
  const t_90     = -bQ_90 + Math.sqrt(bQ_90 * bQ_90 - cQ)
  const dex_90   = +(dsx + t_90 * cv_90).toFixed(1)
  const dey_90   = +(dsy + t_90 * sv_90).toFixed(1)
  const φ_rad_90 = Math.atan2(+dey_90 - Cy, +dex_90 - Cx)
  const cosφ_90  = Math.cos(φ_rad_90)
  const sinφ_90  = Math.sin(φ_rad_90)
  const nwY   = +(+dey - axL * sinφ).toFixed(1)
  const seX   = +(+dex + axL * cosφ).toFixed(1)
  const seY   = +(+dey + axL * sinφ).toFixed(1)

  const nSeg    = nPiecesS ?? 3
  const rEndX   = +(Cx + Rmid * Math.cos(φ_rad / 2)).toFixed(1)
  const rEndY   = +(Cy + Rmid * Math.sin(φ_rad / 2)).toFixed(1)
  const rLabelX = +((+dsx + +rEndX) / 2).toFixed(1)
  const rLabelY = +((+dsy + +rEndY) / 2).toFixed(1)
  const rLabel  = di_mm != null && rOverDs != null ? `r = ${Math.round(rOverDs * di_mm)} mm` : 'r'

  const φDeg   = (φ_rad * 180 / Math.PI).toFixed(1)
  const d0Label = di_mm != null ? `D = ${di_mm.toFixed(0)} mm` : 'D'
  const lLabel  = di_mm != null ? `l = ${Math.round(lOD * di_mm)} mm` : 'l'
  const annOff = 32
  const annTx  = +(+dex - annOff * sinφ).toFixed(1)
  const annTy  = +(+dey + annOff * cosφ).toFixed(1)

  const aR  = 38
  const ax0 = +(dsx + aR * Math.cos(330 * Math.PI / 180)).toFixed(1)
  const ay0 = +(dsy + aR * Math.sin(330 * Math.PI / 180)).toFixed(1)
  const ax1 = +(dsx + aR * Math.cos(vertDirRad)).toFixed(1)
  const ay1 = +(dsy + aR * Math.sin(vertDirRad)).toFixed(1)

  // Ovale haut : haut-droite de cy1, orientation inversée SW-NE (fixé à θ=90°)
  const dex_top = +(2 * cx - (+dex_90)).toFixed(1)
  const dey_top = +(cy1 - (+dey_90 - cy2) * 0.8).toFixed(1)
  const φDeg_t  = +(180 - φ_rad_90 * 180 / Math.PI).toFixed(1)

  // Arc droit (virage supérieur Y-Z) — bezier depuis (rxE, cy1) vers bas de l'ovale haut
  const botX_t = +(+dex_top - axL * cosφ_90).toFixed(1)
  const botY_t = +(+dey_top + axL * sinφ_90).toFixed(1)
  const cTop   = +(Ro * 0.38).toFixed(1)
  const bP1y   = +(cy1 - +cTop).toFixed(1)
  const arrAng = 15 * Math.PI / 180
  const bP2x   = +(+botX_t - Math.cos(arrAng) * +cTop).toFixed(1)
  const bP2y   = +(+botY_t - Math.sin(arrAng) * +cTop).toFixed(1)
  const topX_t  = +(+botX_t + 2 * axL * Math.sin(arrAng)).toFixed(1)
  const topY_t  = +(+botY_t - 2 * axL * Math.cos(arrAng)).toFixed(1)

  // Ovale haut : centre = milieu SW-NE, orientation perpendiculaire à l'axe d'arrivée (arrAng)
  const dex_topN = +(+botX_t + axL * Math.sin(arrAng)).toFixed(1)
  const dey_topN = +(+botY_t - axL * Math.cos(arrAng)).toFixed(1)
  const φDeg_tN  = +(arrAng * 180 / Math.PI - 90).toFixed(1)

  // Arc de gauche — paroi extérieure du virage supérieur
  const lC1y = +(cy1 - +cTop * 2.0).toFixed(1)
  const lC2x = +(+topX_t - Math.cos(arrAng) * +cTop * 1.8).toFixed(1)
  const lC2y = +(+topY_t - Math.sin(arrAng) * +cTop * 1.8).toFixed(1)

  // Pointillés haut
  const top_sx = +(2 * cx - +dsx).toFixed(1)
  const top_sy = +(cy1 + (+dsy - cy2)).toFixed(1)

  // Endpoint ligne pointillée haut : milieu transversal des deux parois au paramètre t_θ=θ/90
  const t_θ        = θ_deg / 90
  const _t1        = 1 - t_θ
  const lMx_θ      = _t1**3*lx    + 3*_t1**2*t_θ*lx    + 3*_t1*t_θ**2*+lC2x + t_θ**3*+topX_t
  const lMy_θ      = _t1**3*cy1   + 3*_t1**2*t_θ*+lC1y  + 3*_t1*t_θ**2*+lC2y + t_θ**3*+topY_t
  const rMx_θ      = _t1**3*rxE   + 3*_t1**2*t_θ*rxE   + 3*_t1*t_θ**2*+bP2x + t_θ**3*+botX_t
  const rMy_θ      = _t1**3*cy1   + 3*_t1**2*t_θ*+bP1y  + 3*_t1*t_θ**2*+bP2y + t_θ**3*+botY_t
  const topDashEndX = +((lMx_θ + rMx_θ) / 2).toFixed(1)
  const topDashEndY = +((lMy_θ + rMy_θ) / 2).toFixed(1)
  const φDeg_θ      = +(Math.atan2(lMy_θ - rMy_θ, lMx_θ - rMx_θ) * 180 / Math.PI).toFixed(1)
  // De Casteljau à t_θ : sous-arc [0..t_θ] — même courbure, s'arrête à l'ovale
  // Arc gauche  P0=(lx,cy1)  P1=(lx,lC1y)  P2=(lC2x,lC2y)  P3=(topX_t,topY_t)
  const _dLA01y  = cy1*_t1    + +lC1y*t_θ
  const _dLA12x  = lx*_t1     + +lC2x*t_θ
  const _dLA12y  = +lC1y*_t1  + +lC2y*t_θ
  const _dLA012x = lx*_t1     + _dLA12x*t_θ
  const _dLA012y = _dLA01y*_t1 + _dLA12y*t_θ
  // Arc droit   P0=(rxE,cy1) P1=(rxE,bP1y) P2=(bP2x,bP2y)  P3=(botX_t,botY_t)
  const _dRA01y  = cy1*_t1    + +bP1y*t_θ
  const _dRA12x  = rxE*_t1    + +bP2x*t_θ
  const _dRA12y  = +bP1y*_t1  + +bP2y*t_θ
  const _dRA012x = rxE*_t1    + _dRA12x*t_θ
  const _dRA012y = _dRA01y*_t1 + _dRA12y*t_θ
  // Ligne r : du coin vers le milieu de l'arc (Bézier à t_θ/2) — miroir du bas (φ/2)
  const t_mid     = t_θ / 2
  const _tm1      = 1 - t_mid
  const _lMx_m    = _tm1**3*lx  + 3*_tm1**2*t_mid*lx   + 3*_tm1*t_mid**2*+lC2x + t_mid**3*+topX_t
  const _lMy_m    = _tm1**3*cy1 + 3*_tm1**2*t_mid*+lC1y + 3*_tm1*t_mid**2*+lC2y + t_mid**3*+topY_t
  const _rMx_m    = _tm1**3*rxE + 3*_tm1**2*t_mid*rxE   + 3*_tm1*t_mid**2*+bP2x + t_mid**3*+botX_t
  const _rMy_m    = _tm1**3*cy1 + 3*_tm1**2*t_mid*+bP1y + 3*_tm1*t_mid**2*+bP2y + t_mid**3*+botY_t
  const rEndX_t   = +((_lMx_m + _rMx_m) / 2).toFixed(1)
  const rEndY_t   = +((_lMy_m + _rMy_m) / 2).toFixed(1)
  const rLabelX_t = +((+top_sx + rEndX_t) / 2).toFixed(1)
  const rLabelY_t = +((+top_sy + rEndY_t) / 2).toFixed(1)
  // Arc annotation : 2/3 de l'angle visuel à 90°
  const topAng0      = Math.atan2(cy1 - +top_sy, cx - +top_sx)
  const topAng0_n    = topAng0 < 0 ? topAng0 + 2 * Math.PI : topAng0
  const topArcEnd_90 = (150 + 120) * Math.PI / 180
  const topArcEnd    = topAng0_n + (topArcEnd_90 - topAng0_n) * (θ_deg / 90)
  const tax0         = +(+top_sx + aR * Math.cos(topAng0)).toFixed(1)
  const tay0         = +(+top_sy + aR * Math.sin(topAng0)).toFixed(1)
  const tax1         = +(+top_sx + aR * Math.cos(topArcEnd)).toFixed(1)
  const tay1         = +(+top_sy + aR * Math.sin(topArcEnd)).toFixed(1)

  // Viewbox centré sur le contenu
  const _pad  = mini ? 8 : 15
  const _cL   = Math.min(+dsx, lx)
  const _cR   = Math.max(+seX, +topX_t, +top_sx, +dex_topN, rxE)
  const _midX = Math.round((_cL + _cR) / 2)
  const _halfW = Math.ceil((_cR - _cL) / 2) + (mini ? _pad : 90)
  const _xMin = _midX - _halfW
  const _xMax = _midX + _halfW
  const _yMin = Math.floor(Math.min(+topY_t, +dey_top, +top_sy) - (mini ? _pad : 35))
  const _yMax = Math.ceil(Math.max(+seY, +dsy) + _pad)
  const _vW   = _xMax - _xMin
  const _vH   = _yMax - _yMin
  const sw    = +((mini ? 10 : 3.75) * _vW / 500).toFixed(1)

  return (
    <svg viewBox={`${_xMin} ${_yMin} ${_vW} ${_vH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
      {/* Ovale cy1 */}
      {!mini && <ellipse cx={cx} cy={cy1} rx={axL} ry={axC} fill="#f1f5f9" stroke="none" />}
      {!mini && <path d={`M ${cx + axL} ${cy1} A ${axL} ${axC} 0 0 1 ${cx - axL} ${cy1}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />}
      {!mini && <path d={`M ${cx + axL} ${cy1} A ${axL} ${axC} 0 0 0 ${cx - axL} ${cy1}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray="10 9" />}
      {/* Ovale cy2 */}
      {!mini && <ellipse cx={cx} cy={cy2} rx={axL} ry={axC} fill="#f1f5f9" stroke="none" />}
      {!mini && <path d={`M ${cx + axL} ${cy2} A ${axL} ${axC} 0 0 1 ${cx - axL} ${cy2}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />}
      {!mini && <path d={`M ${cx + axL} ${cy2} A ${axL} ${axC} 0 0 0 ${cx - axL} ${cy2}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray="10 9" />}
      {/* Lignes verticales cy1–cy2 */}
      <line x1={lx}  y1={cy1} x2={lx}  y2={cy2} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      <line x1={rxE} y1={cy1} x2={rxE} y2={cy2} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      {/* Ovale haut — centré sur le milieu SW-NE, perpendiculaire à la tangente d'arrivée */}
      <ellipse cx={topDashEndX} cy={topDashEndY} rx={axL} ry={axC}
        fill="#f1f5f9" stroke="#374151" strokeWidth={sw}
        transform={`rotate(${φDeg_θ}, ${topDashEndX}, ${topDashEndY})`} />
      {/* Arc gauche virage haut — tronqué à t_θ par de Casteljau */}
      <path d={`M ${lx} ${cy1} C ${lx} ${_dLA01y} ${_dLA012x} ${_dLA012y} ${lMx_θ} ${lMy_θ}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Arc droit virage haut — tronqué à t_θ par de Casteljau */}
      <path d={`M ${rxE} ${cy1} C ${rxE} ${_dRA01y} ${_dRA012x} ${_dRA012y} ${rMx_θ} ${rMy_θ}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Jonctions de segments haut */}
      {elbowTypeS === 'segmente' && Array.from({ length: nSeg - 1 }, (_, i) => {
        const t_i  = (i + 1) * t_θ / nSeg
        const _ti1 = 1 - t_i
        const sx   = +(_ti1**3*lx  + 3*_ti1**2*t_i*lx   + 3*_ti1*t_i**2*+lC2x + t_i**3*+topX_t).toFixed(1)
        const sy   = +(_ti1**3*cy1 + 3*_ti1**2*t_i*+lC1y + 3*_ti1*t_i**2*+lC2y + t_i**3*+topY_t).toFixed(1)
        const ex   = +(_ti1**3*rxE + 3*_ti1**2*t_i*rxE   + 3*_ti1*t_i**2*+bP2x + t_i**3*+botX_t).toFixed(1)
        const ey   = +(_ti1**3*cy1 + 3*_ti1**2*t_i*+bP1y + 3*_ti1*t_i**2*+bP2y + t_i**3*+botY_t).toFixed(1)
        return <line key={`seg-top-${i}`} x1={sx} y1={sy} x2={ex} y2={ey}
          stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      })}
      {/* Ovale bas incliné (virage inférieur) */}
      <ellipse cx={dex} cy={dey} rx={axL} ry={axC}
        fill="#f1f5f9" stroke="#374151" strokeWidth={sw}
        transform={`rotate(${φDeg}, ${dex}, ${dey})`} />
      {/* Paroi intérieure bas */}
      <path d={`M ${lx} ${cy2} A ${Ri} ${Ri} 0 0 1 ${nwX} ${nwY}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Paroi extérieure bas */}
      <path d={`M ${rxE} ${cy2} A ${Ro} ${Ro} 0 0 1 ${seX} ${seY}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Jonctions de segments bas */}
      {elbowTypeS === 'segmente' && Array.from({ length: nSeg - 1 }, (_, i) => {
        const α = (i + 1) * φ_rad / nSeg
        const ix = +(Cx + Ri * Math.cos(α)).toFixed(1)
        const iy = +(Cy + Ri * Math.sin(α)).toFixed(1)
        const ox = +(Cx + Ro * Math.cos(α)).toFixed(1)
        const oy = +(Cy + Ro * Math.sin(α)).toFixed(1)
        return <line key={i} x1={ix} y1={iy} x2={ox} y2={oy}
          stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      })}
      {/* Pointillés bas */}
      {!mini && <>
        <line x1={cx} y1={cy2} x2={dsx} y2={dsy}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
        <line x1={dsx} y1={dsy} x2={dex} y2={dey}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
      </>}
      {/* Pointillés haut */}
      {!mini && <>
        <line x1={cx} y1={cy1} x2={top_sx} y2={top_sy}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
        <line x1={top_sx} y1={top_sy} x2={topDashEndX} y2={topDashEndY}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
      </>}
      {/* Annotations (mode grand schéma uniquement) */}
      {!mini && <>
        {/* Arc θ bas + label */}
        <path d={`M ${ax0} ${ay0} A ${aR} ${aR} 0 0 1 ${ax1} ${ay1}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(dsx - 12).toFixed(1)} y={dsy} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="end" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">θ = {θ_deg}°</text>
        {/* Annotation D sur l'ovale incliné */}
        <g transform={`rotate(${φDeg}, ${dex}, ${dey})`}>
          <line x1={(+dex - axL).toFixed(1)} y1={(+dey - 6).toFixed(1)} x2={(+dex - axL).toFixed(1)} y2={(+dey + 6).toFixed(1)}
            stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={(+dex + axL).toFixed(1)} y1={(+dey - 6).toFixed(1)} x2={(+dex + axL).toFixed(1)} y2={(+dey + 6).toFixed(1)}
            stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={(+dex - axL).toFixed(1)} y1={dey} x2={(+dex + axL).toFixed(1)} y2={dey}
            stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        </g>
        <text x={annTx} y={annTy} fontSize="25" fill="#64748b" textAnchor="middle" fontStyle="italic">{d0Label}</text>
        {/* Rayon r bas */}
        <line x1={dsx} y1={dsy} x2={rEndX} y2={rEndY}
          stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <text x={rLabelX} y={rLabelY} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">{rLabel}</text>
        {/* Arc θ haut + label */}
        <path d={`M ${tax0} ${tay0} A ${aR} ${aR} 0 0 1 ${tax1} ${tay1}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(+top_sx + 12).toFixed(1)} y={top_sy} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="start" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">θ = {θ_deg}°</text>
        {/* Rayon r haut */}
        <line x1={top_sx} y1={top_sy} x2={rEndX_t} y2={rEndY_t}
          stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <text x={rLabelX_t} y={rLabelY_t} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">{rLabel}</text>
        {/* Annotation l */}
        {(() => {
          const lx2 = cx - axL - 20
          const ym  = (cy1 + cy2) / 2
          return <>
            <line x1={lx2 - 10} y1={cy1} x2={lx2 + 10} y2={cy1} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={lx2 - 10} y1={cy2} x2={lx2 + 10} y2={cy2} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={lx2} y1={cy1} x2={lx2} y2={cy2} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
            <text x={lx2 - 16} y={ym} fontSize="25" fill="#64748b" textAnchor="end" dominantBaseline="middle" fontStyle="italic">{lLabel}</text>
          </>
        })()}
      </>}
    </svg>
  )
}

// ── Schéma ASHRAE 3-13 — Dévoiement en S — RECTANGULAIRE (losanges) ─────────
function SchemaCoudeRectS({ mini, theta_s, l_mm, h_mm, orientation, rOverWs, lOverDs }: {
  mini?: boolean; theta_s?: number; l_mm?: number | null; h_mm?: number | null
  orientation?: 'horizontal' | 'vertical'; rOverWs?: number; lOverDs?: number
}) {
  const cx   = 500
  const cy1  = 110

  const W    = orientation === 'vertical' ? (h_mm ?? null) : (l_mm ?? null)
  const H    = orientation === 'vertical' ? (l_mm ?? null) : (h_mm ?? null)
  const _W   = W ?? 300, _H = H ?? 150
  const axL  = 76
  const axC  = 38

  const lOD     = Math.max(0, lOverDs ?? 1)
  const lMaxVis = 2.5
  const lVisLen = Math.max(10, Math.round(Math.min(lOD, lMaxVis) * 2 * axL))
  const cy2     = cy1 + lVisLen

  const rOD = rOverWs ?? 1.0
  const _computeT90 = (L: number) => {
    const dx = L * Math.sqrt(3) / 2 + axL / 2
    const dy = 1.5 * L - axL * Math.sqrt(3) / 2
    const ri = (dx * dx + dy * dy) / (2 * dx)
    const rm = ri + axL
    const d  = ri - L * Math.sqrt(3) / 2
    return -L / 2 + Math.sqrt(Math.max(0, rm * rm - d * d))
  }
  const _targetT = rOD * 2 * axL
  let _lo = 50, _hi = 2000
  for (let _i = 0; _i < 60; _i++) {
    const _m = (_lo + _hi) / 2
    if (_computeT90(_m) < _targetT) _lo = _m; else _hi = _m
  }
  const len = (_lo + _hi) / 2

  const lx  = cx - axL
  const rxE = cx + axL

  const dsx = +(lx - len * (Math.sqrt(3) / 2)).toFixed(1)
  const dsy = +(cy2 + len * 0.5).toFixed(1)

  const θ_deg      = Math.max(15, Math.min(90, theta_s ?? 90))
  const arcSpanDeg = 120 * θ_deg / 90
  const vertDirRad = (330 + arcSpanDeg) * Math.PI / 180

  const nwX_90 = dsx - axL * 0.5
  const nwY_90 = dsy + len - axL * (Math.sqrt(3) / 2)
  const Ri   = Math.round(((lx - nwX_90) ** 2 + (cy2 - nwY_90) ** 2) / (2 * (lx - nwX_90)))
  const Ro   = Ri + 2 * axL
  const Cx   = lx - Ri
  const Cy   = cy2
  const Rmid = (Ri + Ro) / 2
  const R_B  = Math.round(Math.hypot(axL + Ri, axC))  // rayon de l'arc "angle droit"

  const cv  = Math.cos(vertDirRad)
  const sv  = Math.sin(vertDirRad)
  const bQ  = (dsx - Cx) * cv + (dsy - Cy) * sv
  const cQ  = (dsx - Cx) ** 2 + (dsy - Cy) ** 2 - Rmid ** 2
  const t   = -bQ + Math.sqrt(bQ * bQ - cQ)
  const dex = +(dsx + t * cv).toFixed(1)
  const dey = +(dsy + t * sv).toFixed(1)

  const φ_rad  = Math.atan2(+dey - Cy, +dex - Cx)
  const cosφ   = Math.cos(φ_rad)
  const sinφ   = Math.sin(φ_rad)
  // Inclinaison des losanges d'exit (~29° de décalage)
  const φ_dia  = φ_rad - 0.5
  const cosφd  = Math.cos(φ_dia)
  const sinφd  = Math.sin(φ_dia)
  const nwX   = +(+dex - axL * cosφ).toFixed(1)
  const nwY   = +(+dey - axL * sinφ).toFixed(1)
  const seX   = +(+dex + axL * cosφ).toFixed(1)
  const seY   = +(+dey + axL * sinφ).toFixed(1)

  // Labels avec dimensions réelles
  const Dhyd = W != null && H != null && (W + H) > 0 ? (2 * H * W) / (H + W) : null
  const rLabel = W != null ? `r = ${Math.round(rOD * W)} mm` : 'r'
  const lLabel = Dhyd != null ? `l = ${Math.round(lOD * Dhyd)} mm` : 'l'

  const φDeg    = (φ_rad * 180 / Math.PI).toFixed(1)
  const annOff  = 32
  const rEndX   = +(Cx + Rmid * Math.cos(φ_rad / 2)).toFixed(1)
  const rEndY   = +(Cy + Rmid * Math.sin(φ_rad / 2)).toFixed(1)
  const rLabelX = +((+dsx + +rEndX) / 2).toFixed(1)
  const rLabelY = +((+dsy + +rEndY) / 2).toFixed(1)

  const aR  = 38

  // Virage supérieur (miroir 180°)
  const Cx_t     = rxE + Ri
  const dsx_t    = +(2 * cx - (+dsx)).toFixed(1)
  const dsy_t    = +(cy1 + cy2 - (+dsy)).toFixed(1)
  const dex_t    = +(2 * cx - (+dex)).toFixed(1)
  const dey_t    = +(cy1 + cy2 - (+dey)).toFixed(1)
  const nwX_t    = +(2 * cx - (+nwX)).toFixed(1)
  const nwY_t    = +(cy1 + cy2 - (+nwY)).toFixed(1)
  const seX_t    = +(2 * cx - (+seX)).toFixed(1)
  const seY_t    = +(cy1 + cy2 - (+seY)).toFixed(1)
  const rEndX_t  = +(Cx_t - Rmid * Math.cos(φ_rad / 2)).toFixed(1)
  const rEndY_t  = +(cy1   - Rmid * Math.sin(φ_rad / 2)).toFixed(1)
  const rLabelX_t = +((+dsx_t + +rEndX_t) / 2).toFixed(1)
  const rLabelY_t = +((+dsy_t + +rEndY_t) / 2).toFixed(1)

  // Sommets losange bas (dex, dey) — rotation φ_dia
  const diR_x = +(+dex + axL * cosφd).toFixed(1)
  const diR_y = +(+dey + axL * sinφd).toFixed(1)
  const diT_x = +(+dex + axC * sinφd).toFixed(1)
  const diT_y = +(+dey - axC * cosφd).toFixed(1)
  const diL_x = +(+dex - axL * cosφd).toFixed(1)
  const diL_y = +(+dey - axL * sinφd).toFixed(1)
  const diB_x = +(+dex - axC * sinφd).toFixed(1)
  const diB_y = +(+dey + axC * cosφd).toFixed(1)
  // Sommets losange haut = rot180 exact des sommets bas (vecteurs changent de signe)
  const diR_x_t = +(2 * cx - (+diR_x)).toFixed(1)
  const diR_y_t = +(cy1 + cy2 - (+diR_y)).toFixed(1)
  const diT_x_t = +(2 * cx - (+diT_x)).toFixed(1)
  const diT_y_t = +(cy1 + cy2 - (+diT_y)).toFixed(1)
  const diL_x_t = +(2 * cx - (+diL_x)).toFixed(1)
  const diL_y_t = +(cy1 + cy2 - (+diL_y)).toFixed(1)
  const diB_x_t = +(2 * cx - (+diB_x)).toFixed(1)
  const diB_y_t = +(cy1 + cy2 - (+diB_y)).toFixed(1)

  // ── Sommets mis à l'échelle H/L ──────────────────────────────────────────
  // Facteur d'échelle : moyenne géométrique → k*H = côté H, k*L = côté L
  const side_ref = Math.sqrt(axL**2 + axC**2)
  const k = Math.max(0.06, Math.min(0.8, side_ref / Math.sqrt(_W * _H)))

  // Vecteurs unitaires le long des côtés du rhombe (directions fixes par φ_dia)
  // T→R : côté "L" (vers le bas sur le losange bas)
  const uTR_x = (axL*cosφd - axC*sinφd) / side_ref
  const uTR_y = (axL*sinφd + axC*cosφd) / side_ref
  // T→L : côté "H" (vers la gauche sur le losange bas)
  const uTL_x = (-axL*cosφd - axC*sinφd) / side_ref
  const uTL_y = (-axL*sinφd + axC*cosφd) / side_ref

  // Losange bas — ancre = diT (sommet NE, fixe)
  const bR_x = +(+diT_x + k*_W*uTR_x).toFixed(1), bR_y = +(+diT_y + k*_W*uTR_y).toFixed(1)
  const bL_x = +(+diT_x + k*_H*uTL_x).toFixed(1), bL_y = +(+diT_y + k*_H*uTL_y).toFixed(1)
  const bB_x = +(+bR_x  + k*_H*uTL_x).toFixed(1), bB_y = +(+bR_y  + k*_H*uTL_y).toFixed(1)

  // Losange haut — rotation 180° du losange bas : tR=rot(bL), tL=rot(bR), tB=rot(bB)
  const tR_x = +(+diT_x_t - k*_H*uTL_x).toFixed(1), tR_y = +(+diT_y_t - k*_H*uTL_y).toFixed(1)
  const tL_x = +(+diT_x_t - k*_W*uTR_x).toFixed(1), tL_y = +(+diT_y_t - k*_W*uTR_y).toFixed(1)
  const tB_x = +(+tR_x    - k*_W*uTR_x).toFixed(1), tB_y = +(+tR_y    - k*_W*uTR_y).toFixed(1)

  // Sommets des angles figés à leur valeur θ=90° (cv=0, sv=1 → sortie verticale),
  // pour qu'ils ne se déplacent plus quand θ varie
  const _bQ90    = dsy - Cy
  const _t90     = -_bQ90 + Math.sqrt(_bQ90 * _bQ90 - cQ)
  const _φ90     = Math.atan2(dsy + _t90 - Cy, dsx - Cx)
  const _cd90    = Math.cos(_φ90 - 0.5), _sd90 = Math.sin(_φ90 - 0.5)
  const uTR_x_t  = (axL*_cd90 - axC*_sd90) / side_ref
  const uTL_x_t  = (-axL*_cd90 - axC*_sd90) / side_ref
  const _diT_x90 = dsx + axC * _sd90
  const _bB_x90  = _diT_x90 + k*_W*uTR_x_t + k*_H*uTL_x_t
  const apexBotX = +((_diT_x90 + _bB_x90) / 2).toFixed(1)
  // Le losange haut est le miroir du bas : son sommet figé l'est aussi
  const apexTopX = +(2 * cx - apexBotX).toFixed(1)

  // Arc central top : part de rot180(cx,cy2+axC) = (cx,cy1−axC) → diT_t, même rayon R_B
  const tCenter_y = cy1 - axC
  const R_top_track = R_B

  // Losanges milieu — ancre B = sommet Sud (cx, cy+axC), fixe
  // B→R direction = (axL, -axC)/side_ref = côté L
  // B→L direction = (-axL, -axC)/side_ref = côté H
  const scL = k*_W / side_ref, scH = k*_H / side_ref
  // cy2
  const mR2_x = +(cx + scL*axL).toFixed(1), mR2_y = +(cy2+axC - scL*axC).toFixed(1)
  const mL2_x = +(cx - scH*axL).toFixed(1), mL2_y = +(cy2+axC - scH*axC).toFixed(1)
  const mT2_x = +((cx + (scL-scH)*axL)).toFixed(1), mT2_y = +(cy2+axC - (scL+scH)*axC).toFixed(1)
  // cy1 (gardés pour annotation l)
  const mR1_x = mR2_x, mR1_y = +(cy1+axC - scL*axC).toFixed(1)
  const mL1_x = mL2_x, mL1_y = +(cy1+axC - scH*axC).toFixed(1)
  const mT1_x = mT2_x, mT1_y = +(cy1+axC - (scL+scH)*axC).toFixed(1)

  // Losange milieu-haut = rot180 du losange milieu-bas (centre = (cx,(cy1+cy2)/2))
  const mT1r_x = +(cx + (scH-scL)*axL).toFixed(1)
  const mT1r_y = +(cy1-axC + (scL+scH)*axC).toFixed(1)

  // Parois droite et gauche (annotation l uniquement)
  const rWall_x = +mR2_x, rWall_y1 = +mR1_y, rWall_y2 = +mR2_y
  const lWall_x = +mL2_x, lWall_y1 = +mL1_y, lWall_y2 = +mL2_y

  // Points de départ des arcs haut = rot180 des points de départ des arcs bas
  const tInner_x = +(2*cx - lWall_x).toFixed(1), tInner_y = +(cy1+cy2 - lWall_y2).toFixed(1)
  const tOuter_x = +(2*cx - rWall_x).toFixed(1), tOuter_y = +(cy1+cy2 - rWall_y2).toFixed(1)

  // Arcs arrière : bB↔mT2 et mT1r↔tB (mT1r = rot180(mT2))
  const _dxB1 = +mT2_x - +bB_x, _dyB1 = +mT2_y - +bB_y
  const R_back1 = _dxB1 > 0 ? Math.round((_dxB1**2 + _dyB1**2) / (2*_dxB1)) : Math.round(Math.hypot(_dxB1, _dyB1))
  const _dxB2 = +tB_x - mT1r_x, _dyB2 = +tB_y - mT1r_y
  const R_back2 = _dxB2 > 0 ? Math.round((_dxB2**2 + _dyB2**2) / (2*_dxB2)) : Math.round(Math.hypot(_dxB2, _dyB2))

  // Rayons des arcs intérieur/extérieur bas (paroi tangente verticale au départ)
  // Ri_bi : centre à gauche de (lWall_x, lWall_y2), arc vers bL
  const _dxBi = lWall_x - +bL_x, _dyBi = lWall_y2 - +bL_y
  const Ri_bi = _dxBi > 0 ? Math.round((_dxBi**2 + _dyBi**2) / (2*_dxBi)) : Ri
  // Ro_bo : centre à gauche de (rWall_x, rWall_y2), arc vers bR
  const _dxBo = rWall_x - +bR_x, _dyBo = rWall_y2 - +bR_y
  const Ro_bo = _dxBo > 0 ? Math.round((_dxBo**2 + _dyBo**2) / (2*_dxBo)) : Ro

  // Arcs haut : mêmes rayons que bas (rot180 garantit cordes identiques)
  const Ri_ti = Ri_bi
  const Ro_to = Ro_bo

  // Centres des losanges (milieu de la diagonale B↔T) pour les pointillés
  const cM2x = +(cx + (mT2_x - cx) / 2).toFixed(1),  cM2y = +((cy2+axC + +mT2_y) / 2).toFixed(1)
  const cM1x = +((cx + mT1r_x) / 2).toFixed(1),       cM1y = +((cy1-axC + mT1r_y) / 2).toFixed(1)
  const cEx_x  = +((+diT_x   + +bB_x) / 2).toFixed(1), cEx_y  = +((+diT_y   + +bB_y) / 2).toFixed(1)
  const cEx_xt = +((+diT_x_t + +tB_x) / 2).toFixed(1), cEx_yt = +((+diT_y_t + +tB_y) / 2).toFixed(1)

  // Midpoint d'un arc SVG (sweep CW, large-arc=0) : formule centre + demi-angle
  const _arcMid = (x1: number, y1: number, x2: number, y2: number, R: number): [number, number] => {
    const dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2
    const d = Math.hypot(dx2, dy2)
    const h = Math.sqrt(Math.max(0, R*R - d*d))
    const acx = (x1+x2)/2 + h * dy2 / d
    const acy = (y1+y2)/2 - h * dx2 / d
    const a1 = Math.atan2(y1 - acy, x1 - acx)
    const a2r = Math.atan2(y2 - acy, x2 - acx)
    const a2 = a2r < a1 ? a2r + 2*Math.PI : a2r
    return [acx + R * Math.cos((a1+a2)/2), acy + R * Math.sin((a1+a2)/2)]
  }
  // Midpoint bas : moyenne arc intérieur (lWall→bL) et arc extérieur (rWall→bR)
  const [_biMx, _biMy] = _arcMid(lWall_x, lWall_y2, +bL_x, +bL_y, Ri_bi)
  const [_boMx, _boMy] = _arcMid(rWall_x, rWall_y2, +bR_x, +bR_y, Ro_bo)
  const rMidX_B = +((_biMx + _boMx) / 2).toFixed(1)
  const rMidY_B = +((_biMy + _boMy) / 2).toFixed(1)
  // Midpoint haut : tInner→tR et tOuter→tL (rot180 des arcs bas)
  const [_tiMx, _tiMy] = _arcMid(tInner_x, tInner_y, +tR_x, +tR_y, Ri_ti)
  const [_toMx, _toMy] = _arcMid(tOuter_x, tOuter_y, +tL_x, +tL_y, Ro_to)
  const rMidX_T = +((_tiMx + _toMx) / 2).toFixed(1)
  const rMidY_T = +((_tiMy + _toMy) / 2).toFixed(1)
  // Ancres annotations θ et r : aux sommets figés, arcs bornés par les directions
  // réelles des deux bras pointillés (sinon l'arc se détache du bras dès θ<90°)
  const _botAng0 = Math.atan2(+cM2y  - +dsy, +cM2x  - +apexBotX)
  const _botAng1 = Math.atan2(+cEx_y - +dsy, +cEx_x - +apexBotX)
  const ax0c   = +(+apexBotX + aR * Math.cos(_botAng0)).toFixed(1)
  const ay0c   = +(+dsy      + aR * Math.sin(_botAng0)).toFixed(1)
  const ax1c   = +(+apexBotX + aR * Math.cos(_botAng1)).toFixed(1)
  const ay1c   = +(+dsy      + aR * Math.sin(_botAng1)).toFixed(1)
  const rLabelXc   = +((+apexBotX + +rMidX_B) / 2).toFixed(1)
  const rLabelYc   = +((+dsy      + +rMidY_B) / 2).toFixed(1)
  const rLabelYc_t = +((+dsy_t  + +rMidY_T) / 2).toFixed(1)

  // Translation horizontale du groupe supérieur : Δx = (scL−scH)·axL
  // Aligne le centre du losange milieu-haut sur le même axe vertical que le milieu-bas
  // → les 3 parois de liaison entre losanges milieu deviennent strictement verticales
  const sh_x      = (scL - scH) * axL
  const tInner_xs  = tInner_x  + sh_x
  const tOuter_xs  = tOuter_x  + sh_x
  const mT1r_xs    = mT1r_x    + sh_x
  const tR_xs      = tR_x      + sh_x
  const tL_xs      = tL_x      + sh_x
  const tB_xs      = tB_x      + sh_x
  const diT_xs_t   = diT_x_t   + sh_x
  const cx_ts      = cx         + sh_x
  const cEx_xts    = cEx_xt    + sh_x
  const cM1xs      = cM1x      + sh_x
  const apexTopXs  = apexTopX  + sh_x
  const _topAng0   = Math.atan2(+cM1y    - +dsy_t, +cM1xs    - apexTopXs)
  const _topAng1   = Math.atan2(+cEx_yt  - +dsy_t, +cEx_xts  - apexTopXs)
  const ax0c_ts    = +(apexTopXs + aR * Math.cos(_topAng0)).toFixed(1)
  const ay0c_ts    = +(+dsy_t    + aR * Math.sin(_topAng0)).toFixed(1)
  const ax1c_ts    = +(apexTopXs + aR * Math.cos(_topAng1)).toFixed(1)
  const ay1c_ts    = +(+dsy_t    + aR * Math.sin(_topAng1)).toFixed(1)
  const [_tiMxs, _tiMys] = _arcMid(tInner_xs, tInner_y, tR_xs, tR_y, Ri_ti)
  const [_toMxs, _toMys] = _arcMid(tOuter_xs, tOuter_y, tL_xs, tL_y, Ro_to)
  const rMidX_Ts    = (_tiMxs + _toMxs) / 2
  const rMidY_Ts    = (_tiMys + _toMys) / 2
  const rLabelXc_ts = (apexTopXs + rMidX_Ts) / 2

  // ViewBox
  const _pad  = mini ? 8 : 15

  // Bornes Y des annotations H et L
  // H : côté diT_t→tL (direction uTL), normal sortant = (-uTL_y, uTL_x)
  const _hMidX = (tL_xs + tB_xs) / 2, _hMidY = (tL_y + tB_y) / 2
  const _vAnnTopX = _hMidX + (-uTL_y) * 30, _vAnnTopY = _hMidY + uTL_x * 30
  // L : côté bL→bB (direction uTR), normal sortant = (uTR_y, -uTR_x)
  const _lMidX = (+bL_x + +bB_x) / 2, _lMidY = (+bL_y + +bB_y) / 2
  const _vAnnBotX = _lMidX + uTR_y * 30, _vAnnBotY = _lMidY + (-uTR_x) * 30

  const _allX = [+bR_x, +bL_x, +bB_x, +diT_x, tR_xs, tL_xs, tB_xs, diT_xs_t,
                 +mR2_x, +mL2_x, +mT2_x, mT1r_xs, cx, cx_ts,
                 tInner_xs, tOuter_xs]
  const _allY = [+bR_y, +bL_y, +bB_y, +diT_y, +tR_y, +tL_y, +tB_y, +diT_y_t,
                 +mR2_y, +mL2_y, +mT2_y, mT1r_y, cy2+axC,
                 tInner_y, tOuter_y, tCenter_y]

  const _xMin = Math.floor(mini
    ? (Math.min(..._allX) - _pad)
    : Math.min(Math.min(..._allX) - _pad, +apexBotX - 90, +cEx_x - 20, +dsx - 90, _vAnnTopX - 20, _vAnnBotX - 20))
  const _xMax = Math.ceil(Math.max(
    Math.max(..._allX) + _pad,
    mini ? 0 : (Math.max(..._allX) + 90),
    mini ? 0 : (rWall_x + 160)
  ))
  const _yMin = Math.floor(mini
    ? (Math.min(..._allY) - _pad)
    : Math.min(Math.min(..._allY) - _pad, _vAnnTopY - 40))
  const _yMax = Math.ceil(Math.max(Math.max(..._allY) + _pad, mini ? 0 : _vAnnBotY + 40))
  const _vW   = _xMax - _xMin
  const _vH   = _yMax - _yMin
  const sw    = +((mini ? 10 : 3.75) * _vW / 500).toFixed(1)
  const da    = mini ? `${+(sw * 3.5).toFixed(1)} ${+(sw * 3).toFixed(1)}` : "10 9"

  return (
    <svg viewBox={`${_xMin} ${_yMin} ${_vW} ${_vH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
      {/* ── Losange milieu haut = rot180(losange milieu bas) décalé de sh_x ── */}
      {!mini && <polygon points={`${tOuter_xs},${tOuter_y} ${mT1r_xs},${mT1r_y} ${tInner_xs},${tInner_y} ${cx_ts},${tCenter_y}`}
        fill="#f1f5f9" stroke="none" />}
      {/* côtés avant B'→R' et L'→B' (pointillé) */}
      {!mini && <polyline points={`${cx_ts},${tCenter_y} ${tOuter_xs},${tOuter_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 9" />}
      {!mini && <polyline points={`${tInner_xs},${tInner_y} ${cx_ts},${tCenter_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 9" />}
      {/* côtés arrière R'→T'→L' (plein) */}
      {!mini && <polyline points={`${tOuter_xs},${tOuter_y} ${mT1r_xs},${mT1r_y} ${tInner_xs},${tInner_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />}
      {/* ── Losange milieu bas (cy2) — ancre B=(cx,cy2+axC), Sud fixe ── */}
      {!mini && <polygon points={`${mR2_x},${mR2_y} ${mT2_x},${mT2_y} ${mL2_x},${mL2_y} ${cx},${cy2+axC}`}
        fill="#f1f5f9" stroke="none" />}
      {/* côtés avant B→R et L→B (plein) */}
      {!mini && <polyline points={`${cx},${cy2+axC} ${mR2_x},${mR2_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />}
      {!mini && <polyline points={`${mL2_x},${mL2_y} ${cx},${cy2+axC}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />}
      {/* côtés arrière R→T→L (pointillé) */}
      {!mini && <polyline points={`${mR2_x},${mR2_y} ${mT2_x},${mT2_y} ${mL2_x},${mL2_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 9" />}
      {/* ── Parois du tronçon droit — toutes verticales après translation sh_x ── */}
      {/* Droite : (tInner+sh) → mR2, même abscisse x=cx+scL·axL */}
      <line x1={tInner_xs} y1={tInner_y} x2={rWall_x} y2={rWall_y2} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      {/* Gauche : (tOuter+sh) → mL2, même abscisse x=cx−scH·axL */}
      <line x1={tOuter_xs} y1={tOuter_y} x2={lWall_x} y2={lWall_y2} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      {/* Centre : T''=(mT1r+sh) → B_bas, même abscisse x=cx */}
      <line x1={mT1r_xs} y1={mT1r_y} x2={cx} y2={cy2+axC} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      {/* ── Virage supérieur (décalé de sh_x) ── */}
      {/* Losange haut : ancre diT_xs_t (NE) */}
      <polygon points={`${tR_xs},${tR_y} ${diT_xs_t},${diT_y_t} ${tL_xs},${tL_y} ${tB_xs},${tB_y}`}
        fill="#f1f5f9" stroke="none" />
      {/* côtés avant R→T→L (pointillé) */}
      <polyline points={`${tR_xs},${tR_y} ${diT_xs_t},${diT_y_t} ${tL_xs},${tL_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={da} />
      {/* côtés arrière L→B→R (plein) */}
      <polyline points={`${tL_xs},${tL_y} ${tB_xs},${tB_y} ${tR_xs},${tR_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      {/* Paroi intérieure top : (tInner+sh) → (tR+sh) — mêmes rayons, translation rigide */}
      <path d={`M ${tInner_xs} ${tInner_y} A ${Ri_ti} ${Ri_ti} 0 0 1 ${tR_xs} ${tR_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Paroi extérieure top : (tOuter+sh) → (tL+sh) */}
      <path d={`M ${tOuter_xs} ${tOuter_y} A ${Ro_to} ${Ro_to} 0 0 1 ${tL_xs} ${tL_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Arc central top : (cx+sh, cy1−axC) → (diT_t+sh) — pointillé car arrive au sommet T (2 côtés tirets) */}
      <path d={`M ${cx_ts} ${tCenter_y} A ${R_top_track} ${R_top_track} 0 0 1 ${diT_xs_t} ${diT_y_t}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={da} />
      {/* Pointillés top */}
      {!mini && <>
        <line x1={cM1xs} y1={cM1y} x2={apexTopXs} y2={dsy_t}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
        <line x1={apexTopXs} y1={dsy_t} x2={cEx_xts} y2={cEx_yt}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
      </>}
      {/* ── Virage inférieur ── */}
      {/* Losange bas : ancre diT (NE) */}
      <polygon points={`${bR_x},${bR_y} ${diT_x},${diT_y} ${bL_x},${bL_y} ${bB_x},${bB_y}`}
        fill="#f1f5f9" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      {/* Paroi intérieure bas : lWall → bL */}
      <path d={`M ${lWall_x} ${lWall_y2} A ${Ri_bi} ${Ri_bi} 0 0 1 ${bL_x} ${bL_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Paroi extérieure bas : rWall → bR */}
      <path d={`M ${rWall_x} ${rWall_y2} A ${Ro_bo} ${Ro_bo} 0 0 1 ${bR_x} ${bR_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Arc central bas */}
      <path d={`M ${cx} ${cy2+axC} A ${R_B} ${R_B} 0 0 1 ${diT_x} ${diT_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Chemin arrière bas + paroi arrière verticale : bB → mT2 → B''=(cx_ts,tCenter_y) */}
      <path d={`M ${bB_x} ${bB_y} A ${R_back1} ${R_back1} 0 0 0 ${mT2_x} ${mT2_y} L ${cx_ts} ${tCenter_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={da} />
      {/* Chemin arrière haut : T''=(mT1r_xs,mT1r_y) → tB_xs */}
      <path d={`M ${mT1r_xs} ${mT1r_y} A ${R_back2} ${R_back2} 0 0 1 ${tB_xs} ${tB_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Pointillés bas */}
      {!mini && <>
        <line x1={cM2x} y1={cM2y} x2={apexBotX} y2={dsy}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
        <line x1={apexBotX} y1={dsy} x2={cEx_x} y2={cEx_y}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
      </>}
      {/* Annotations */}
      {!mini && <>
        {/* Arc θ haut + label */}
        <path d={`M ${ax0c_ts} ${ay0c_ts} A ${aR} ${aR} 0 0 1 ${ax1c_ts} ${ay1c_ts}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(apexTopXs + 12).toFixed(1)} y={dsy_t} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="start" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">θ = {θ_deg}°</text>
        {/* Rayon r haut */}
        <line x1={apexTopXs} y1={dsy_t} x2={rMidX_Ts} y2={rMidY_Ts}
          stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <text x={rLabelXc_ts} y={rLabelYc_t} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">{rLabel}</text>
        {/* Arc θ bas + label */}
        <path d={`M ${ax0c} ${ay0c} A ${aR} ${aR} 0 0 1 ${ax1c} ${ay1c}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(+apexBotX - 12).toFixed(1)} y={dsy} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="end" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">θ = {θ_deg}°</text>
        {/* Rayon r bas */}
        <line x1={apexBotX} y1={dsy} x2={rMidX_B} y2={rMidY_B}
          stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <text x={rLabelXc} y={rLabelYc} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">{rLabel}</text>
        {/* Annotation l : côté gauche de la gaine */}
        {(() => {
          const lx2 = lWall_x - 20
          const ym  = (lWall_y1 + lWall_y2) / 2
          return <>
            <line x1={lx2 - 10} y1={lWall_y1} x2={lx2 + 10} y2={lWall_y1} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={lx2 - 10} y1={lWall_y2} x2={lx2 + 10} y2={lWall_y2} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={lx2} y1={lWall_y1} x2={lx2} y2={lWall_y2} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
            <text x={lx2 - 16} y={ym} fontSize="25" fill="#64748b" textAnchor="end" dominantBaseline="middle" fontStyle="italic">{lLabel}</text>
          </>
        })()}
        {/* Annotation H — côté parallèle tL_xs→tB_xs du losange haut décalé */}
        {(() => {
          const sx = tB_xs - tL_xs, sy = tB_y - tL_y
          const sl = Math.hypot(sx, sy) || 1
          const epX = sy / sl, epY = -sx / sl   // normale sortante vers la droite
          const a0x = +(tL_xs + 5*epX).toFixed(1), a0y = +(tL_y + 5*epY).toFixed(1)
          const a2x = +(tL_xs + 19*epX).toFixed(1), a2y = +(tL_y + 19*epY).toFixed(1)
          const b0x = +(tB_xs + 5*epX).toFixed(1),  b0y = +(tB_y + 5*epY).toFixed(1)
          const b2x = +(tB_xs + 19*epX).toFixed(1), b2y = +(tB_y + 19*epY).toFixed(1)
          const a1x = +(tL_xs + 12*epX).toFixed(1), a1y = +(tL_y + 12*epY).toFixed(1)
          const b1x = +(tB_xs + 12*epX).toFixed(1), b1y = +(tB_y + 12*epY).toFixed(1)
          const mx  = +((tL_xs + tB_xs) / 2 + 30*epX).toFixed(1)
          const my  = +((tL_y + tB_y) / 2 + 30*epY).toFixed(1)
          const lbl = orientation === 'vertical'
            ? (l_mm != null ? `L = ${l_mm} mm` : 'L')
            : (h_mm != null ? `H = ${h_mm} mm` : 'H')
          let ang = Math.atan2(sy, sx) * 180 / Math.PI
          if (ang > 90) ang -= 180
          if (ang < -90) ang += 180
          return <>
            <line x1={a0x} y1={a0y} x2={a2x} y2={a2y} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={b0x} y1={b0y} x2={b2x} y2={b2y} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={a1x} y1={a1y} x2={b1x} y2={b1y} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={mx} y={my} fontSize="25" fill="#64748b" fontStyle="italic"
              textAnchor="middle" dominantBaseline="middle"
              paintOrder="stroke" stroke="white" strokeWidth="6"
              transform={`rotate(${ang.toFixed(1)}, ${mx}, ${my})`}>{lbl}</text>
          </>
        })()}
        {/* Annotation L — côté bL→bB du losange bas (côté L proportionnel) */}
        {(() => {
          const sx = +bB_x - +bL_x, sy = +bB_y - +bL_y
          const sl = Math.hypot(sx, sy) || 1
          const epX = -uTR_y, epY = uTR_x   // normale sortante du côté L (vers l'extérieur gauche)
          const a0x = +(+bL_x + 5*epX).toFixed(1), a0y = +(+bL_y + 5*epY).toFixed(1)
          const a2x = +(+bL_x + 19*epX).toFixed(1), a2y = +(+bL_y + 19*epY).toFixed(1)
          const b0x = +(+bB_x + 5*epX).toFixed(1),  b0y = +(+bB_y + 5*epY).toFixed(1)
          const b2x = +(+bB_x + 19*epX).toFixed(1), b2y = +(+bB_y + 19*epY).toFixed(1)
          const a1x = +(+bL_x + 12*epX).toFixed(1), a1y = +(+bL_y + 12*epY).toFixed(1)
          const b1x = +(+bB_x + 12*epX).toFixed(1), b1y = +(+bB_y + 12*epY).toFixed(1)
          const mx  = +((+bL_x + +bB_x) / 2 + 30*epX).toFixed(1)
          const my  = +((+bL_y + +bB_y) / 2 + 30*epY).toFixed(1)
          const lbl = orientation === 'vertical'
            ? (h_mm != null ? `H = ${h_mm} mm` : 'H')
            : (l_mm != null ? `L = ${l_mm} mm` : 'L')
          let ang = Math.atan2(sy, sx) * 180 / Math.PI
          if (ang > 45) ang -= 180
          return <>
            <line x1={a0x} y1={a0y} x2={a2x} y2={a2y} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={b0x} y1={b0y} x2={b2x} y2={b2y} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={a1x} y1={a1y} x2={b1x} y2={b1y} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={mx} y={my} fontSize="25" fill="#64748b" fontStyle="italic"
              textAnchor="middle" dominantBaseline="middle"
              paintOrder="stroke" stroke="white" strokeWidth="6"
              transform={`rotate(${ang.toFixed(1)}, ${mx}, ${my})`}>{lbl}</text>
          </>
        })()}
      </>}
    </svg>
  )
}

function SchemaRect314({ mini, theta_s, l_mm, h_mm, orientation, rOverWs, lOverDs }: {
  mini?: boolean; theta_s?: number; l_mm?: number | null; h_mm?: number | null
  orientation?: 'horizontal' | 'vertical'; rOverWs?: number; lOverDs?: number
}) {
  const cx   = 500
  const cy1  = 110

  const W    = orientation === 'vertical' ? (h_mm ?? null) : (l_mm ?? null)
  const H    = orientation === 'vertical' ? (l_mm ?? null) : (h_mm ?? null)
  const _W   = W ?? 300, _H = H ?? 150
  const axL  = 76
  const axC  = 38

  const lOD     = Math.max(0, lOverDs ?? 1)
  const lMaxVis = 2.5
  const lVisLen = Math.max(10, Math.round(Math.min(lOD, lMaxVis) * 2 * axL))
  const cy2     = cy1 + lVisLen

  const rOD = rOverWs ?? 1.0
  const _computeT90 = (L: number) => {
    const dx = L * Math.sqrt(3) / 2 + axL / 2
    const dy = 1.5 * L - axL * Math.sqrt(3) / 2
    const ri = (dx * dx + dy * dy) / (2 * dx)
    const rm = ri + axL
    const d  = ri - L * Math.sqrt(3) / 2
    return -L / 2 + Math.sqrt(Math.max(0, rm * rm - d * d))
  }
  const _targetT = rOD * 2 * axL
  let _lo = 50, _hi = 2000
  for (let _i = 0; _i < 60; _i++) {
    const _m = (_lo + _hi) / 2
    if (_computeT90(_m) < _targetT) _lo = _m; else _hi = _m
  }
  const len = (_lo + _hi) / 2

  const lx  = cx - axL
  const rxE = cx + axL

  const dsx = +(lx - len * (Math.sqrt(3) / 2)).toFixed(1)
  const dsy = +(cy2 + len * 0.5).toFixed(1)

  const θ_deg      = Math.max(15, Math.min(90, theta_s ?? 90))
  const arcSpanDeg = 120 * θ_deg / 90
  const vertDirRad = (330 + arcSpanDeg) * Math.PI / 180

  const nwX_90 = dsx - axL * 0.5
  const nwY_90 = dsy + len - axL * (Math.sqrt(3) / 2)
  const Ri   = Math.round(((lx - nwX_90) ** 2 + (cy2 - nwY_90) ** 2) / (2 * (lx - nwX_90)))
  const Ro   = Ri + 2 * axL
  const Cx   = lx - Ri
  const Cy   = cy2
  const Rmid = (Ri + Ro) / 2
  const R_B  = Math.round(Math.hypot(axL + Ri, axC))

  const cv  = Math.cos(vertDirRad)
  const sv  = Math.sin(vertDirRad)
  const bQ  = (dsx - Cx) * cv + (dsy - Cy) * sv
  const cQ  = (dsx - Cx) ** 2 + (dsy - Cy) ** 2 - Rmid ** 2
  const t   = -bQ + Math.sqrt(bQ * bQ - cQ)
  const dex = +(dsx + t * cv).toFixed(1)
  const dey = +(dsy + t * sv).toFixed(1)

  const φ_rad  = Math.atan2(+dey - Cy, +dex - Cx)
  const cosφ   = Math.cos(φ_rad)
  const sinφ   = Math.sin(φ_rad)
  const φ_dia  = φ_rad - 0.5
  const cosφd  = Math.cos(φ_dia)
  const sinφd  = Math.sin(φ_dia)
  const nwX   = +(+dex - axL * cosφ).toFixed(1)
  const nwY   = +(+dey - axL * sinφ).toFixed(1)
  const seX   = +(+dex + axL * cosφ).toFixed(1)
  const seY   = +(+dey + axL * sinφ).toFixed(1)

  const Dhyd = W != null && H != null && (W + H) > 0 ? (2 * H * W) / (H + W) : null
  const rLabel = W != null ? `r = ${Math.round(rOD * W)} mm` : 'r'
  const lLabel = Dhyd != null ? `l = ${Math.round(lOD * Dhyd)} mm` : 'l'

  const φDeg    = (φ_rad * 180 / Math.PI).toFixed(1)
  const annOff  = 32
  const rEndX   = +(Cx + Rmid * Math.cos(φ_rad / 2)).toFixed(1)
  const rEndY   = +(Cy + Rmid * Math.sin(φ_rad / 2)).toFixed(1)
  const rLabelX = +((+dsx + +rEndX) / 2).toFixed(1)
  const rLabelY = +((+dsy + +rEndY) / 2).toFixed(1)

  const aR  = 38

  const Cx_t     = rxE + Ri
  const dsx_t    = +(2 * cx - (+dsx)).toFixed(1)
  const dsy_t    = +(cy1 + cy2 - (+dsy)).toFixed(1)
  const dex_t    = +(2 * cx - (+dex)).toFixed(1)
  const dey_t    = +(cy1 + cy2 - (+dey)).toFixed(1)
  const nwX_t    = +(2 * cx - (+nwX)).toFixed(1)
  const nwY_t    = +(cy1 + cy2 - (+nwY)).toFixed(1)
  const seX_t    = +(2 * cx - (+seX)).toFixed(1)
  const seY_t    = +(cy1 + cy2 - (+seY)).toFixed(1)
  const topArcStart = 150 * Math.PI / 180
  const topArcEnd   = (150 + arcSpanDeg) * Math.PI / 180

  const diR_x = +(+dex + axL * cosφd).toFixed(1)
  const diR_y = +(+dey + axL * sinφd).toFixed(1)
  const diT_x = +(+dex + axC * sinφd).toFixed(1)
  const diT_y = +(+dey - axC * cosφd).toFixed(1)
  const diL_x = +(+dex - axL * cosφd).toFixed(1)
  const diL_y = +(+dey - axL * sinφd).toFixed(1)
  const diB_x = +(+dex - axC * sinφd).toFixed(1)
  const diB_y = +(+dey + axC * cosφd).toFixed(1)
  const diR_x_t = +(2 * cx - (+diR_x)).toFixed(1)
  const diR_y_t = +(cy1 + cy2 - (+diR_y)).toFixed(1)
  const diT_x_t = +(2 * cx - (+diT_x)).toFixed(1)
  const diT_y_t = +(cy1 + cy2 - (+diT_y)).toFixed(1)
  const diL_x_t = +(2 * cx - (+diL_x)).toFixed(1)
  const diL_y_t = +(cy1 + cy2 - (+diL_y)).toFixed(1)
  const diB_x_t = +(2 * cx - (+diB_x)).toFixed(1)
  const diB_y_t = +(cy1 + cy2 - (+diB_y)).toFixed(1)

  const side_ref = Math.sqrt(axL**2 + axC**2)
  const k = Math.max(0.06, Math.min(0.8, side_ref / Math.sqrt(_W * _H)))

  const uTR_x = (axL*cosφd - axC*sinφd) / side_ref
  const uTR_y = (axL*sinφd + axC*cosφd) / side_ref
  const uTL_x = (-axL*cosφd - axC*sinφd) / side_ref
  const uTL_y = (-axL*sinφd + axC*cosφd) / side_ref

  const bR_x = +(+diT_x + k*_W*uTR_x).toFixed(1), bR_y = +(+diT_y + k*_W*uTR_y).toFixed(1)
  const bL_x = +(+diT_x + k*_H*uTL_x).toFixed(1), bL_y = +(+diT_y + k*_H*uTL_y).toFixed(1)
  const bB_x = +(+bR_x  + k*_H*uTL_x).toFixed(1), bB_y = +(+bR_y  + k*_H*uTL_y).toFixed(1)

  const tR_x = +(+diT_x_t - k*_H*uTL_x).toFixed(1), tR_y = +(+diT_y_t - k*_H*uTL_y).toFixed(1)
  const tL_x = +(+diT_x_t - k*_W*uTR_x).toFixed(1), tL_y = +(+diT_y_t - k*_W*uTR_y).toFixed(1)
  const tB_x = +(+tR_x    - k*_W*uTR_x).toFixed(1), tB_y = +(+tR_y    - k*_W*uTR_y).toFixed(1)
  // Vecteurs unitaires figés à θ=90° (cv=0, sv=1) pour geler la géométrie du virage haut
  const _bQ90   = dsy - Cy
  const _t90    = -_bQ90 + Math.sqrt(_bQ90 * _bQ90 - cQ)
  const _φ90    = Math.atan2(dsy + _t90 - Cy, dsx - Cx)
  const _cd90   = Math.cos(_φ90 - 0.5), _sd90 = Math.sin(_φ90 - 0.5)
  const uTR_x_t = (axL*_cd90 - axC*_sd90) / side_ref
  const uTR_y_t = (axL*_sd90 + axC*_cd90) / side_ref
  const uTL_x_t = (-axL*_cd90 - axC*_sd90) / side_ref
  const uTL_y_t = (-axL*_sd90 + axC*_cd90) / side_ref

  const tCenter_y = cy1 - axC
  const R_top_track = R_B

  const scL = k*_W / side_ref, scH = k*_H / side_ref
  const mR2_x = +(cx + scL*axL).toFixed(1), mR2_y = +(cy2+axC - scL*axC).toFixed(1)
  const mL2_x = +(cx - scH*axL).toFixed(1), mL2_y = +(cy2+axC - scH*axC).toFixed(1)
  const mT2_x = +((cx + (scL-scH)*axL)).toFixed(1), mT2_y = +(cy2+axC - (scL+scH)*axC).toFixed(1)
  const mR1_x = mR2_x, mR1_y = +(cy1+axC - scL*axC).toFixed(1)
  const mL1_x = mL2_x, mL1_y = +(cy1+axC - scH*axC).toFixed(1)
  const mT1_x = mT2_x, mT1_y = +(cy1+axC - (scL+scH)*axC).toFixed(1)

  const mT1r_x = +(cx + (scH-scL)*axL).toFixed(1)
  const mT1r_y = +(cy1-axC + (scL+scH)*axC).toFixed(1)

  const rWall_x = +mR2_x, rWall_y1 = +mR1_y, rWall_y2 = +mR2_y
  const lWall_x = +mL2_x, lWall_y1 = +mL1_y, lWall_y2 = +mL2_y

  const tInner_x = +(2*cx - lWall_x).toFixed(1), tInner_y = +(cy1+cy2 - lWall_y2).toFixed(1)
  const tOuter_x = +(2*cx - rWall_x).toFixed(1), tOuter_y = +(cy1+cy2 - rWall_y2).toFixed(1)

  const _dxB1 = +mT2_x - +bB_x, _dyB1 = +mT2_y - +bB_y
  const R_back1 = _dxB1 > 0 ? Math.round((_dxB1**2 + _dyB1**2) / (2*_dxB1)) : Math.round(Math.hypot(_dxB1, _dyB1))

  const _dxBi = lWall_x - +bL_x, _dyBi = lWall_y2 - +bL_y
  const Ri_bi = _dxBi > 0 ? Math.round((_dxBi**2 + _dyBi**2) / (2*_dxBi)) : Ri
  const _dxBo = rWall_x - +bR_x, _dyBo = rWall_y2 - +bR_y
  const Ro_bo = _dxBo > 0 ? Math.round((_dxBo**2 + _dyBo**2) / (2*_dxBo)) : Ro

  const cM2x = +(cx + (mT2_x - cx) / 2).toFixed(1),  cM2y = +((cy2+axC + +mT2_y) / 2).toFixed(1)
  const cEx_x  = +((+diT_x   + +bB_x) / 2).toFixed(1), cEx_y  = +((+diT_y   + +bB_y) / 2).toFixed(1)
  // Sommet de l'angle bas : valeur de cEx_x à θ=90°, pour qu'il ne bouge plus avec θ
  const _diT_x90 = dsx + axC * _sd90
  const _bR_x90  = _diT_x90 + k*_W*uTR_x_t
  const _bB_x90  = _bR_x90  + k*_H*uTL_x_t
  const apexBotX = +((_diT_x90 + _bB_x90) / 2).toFixed(1)

  const _arcMid = (x1: number, y1: number, x2: number, y2: number, R: number): [number, number] => {
    const dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2
    const d = Math.hypot(dx2, dy2)
    const h = Math.sqrt(Math.max(0, R*R - d*d))
    const acx = (x1+x2)/2 + h * dy2 / d
    const acy = (y1+y2)/2 - h * dx2 / d
    const a1 = Math.atan2(y1 - acy, x1 - acx)
    const a2r = Math.atan2(y2 - acy, x2 - acx)
    const a2 = a2r < a1 ? a2r + 2*Math.PI : a2r
    return [acx + R * Math.cos((a1+a2)/2), acy + R * Math.sin((a1+a2)/2)]
  }
  const [_biMx, _biMy] = _arcMid(lWall_x, lWall_y2, +bL_x, +bL_y, Ri_bi)
  const [_boMx, _boMy] = _arcMid(rWall_x, rWall_y2, +bR_x, +bR_y, Ro_bo)
  const rMidX_B = +((_biMx + _boMx) / 2).toFixed(1)
  const rMidY_B = +((_biMy + _boMy) / 2).toFixed(1)

  // Arc θ bas : borné par les directions réelles des deux bras pointillés
  const _botAng0 = Math.atan2(+cM2y  - +dsy, +cM2x  - +apexBotX)  // vers losange milieu-bas
  const _botAng1 = Math.atan2(+cEx_y - +dsy, +cEx_x - +apexBotX)  // vers losange de sortie
  const ax0c   = +(+apexBotX + aR * Math.cos(_botAng0)).toFixed(1)
  const ay0c   = +(+dsy      + aR * Math.sin(_botAng0)).toFixed(1)
  const ax1c   = +(+apexBotX + aR * Math.cos(_botAng1)).toFixed(1)
  const ay1c   = +(+dsy      + aR * Math.sin(_botAng1)).toFixed(1)
  const rLabelXc   = +((+apexBotX + +rMidX_B) / 2).toFixed(1)
  const rLabelYc   = +((+dsy      + +rMidY_B) / 2).toFixed(1)

  const sh_x      = (scL - scH) * axL
  const tInner_xs  = tInner_x  + sh_x
  const tOuter_xs  = tOuter_x  + sh_x
  const mT1r_xs    = mT1r_x    + sh_x
  const cx_ts      = cx         + sh_x
  // x du losange haut : identique à la rotation 180° (2*cx - x_bas + sh_x)
  const tR_xs      = tR_x      + sh_x
  const tL_xs      = tL_x      + sh_x
  const tB_xs      = tB_x      + sh_x
  const diT_xs_t   = diT_x_t   + sh_x
  // Losange haut de référence (θ=90°) — sommet NW ancré à distance fixe du losange milieu-haut
  // Les 3 autres sommets sont déduits de NW via les dimensions H et L (uTR / uTL figés)
  const _nw_x0    = +tInner_xs + 65
  const _nw_y0    = +tInner_y - 87
  const _htAnc_x0 = _nw_x0 + k*_W*uTR_x_t
  const _htAnc_y0 = _nw_y0 - k*_W*uTR_y_t
  const _htNE_x0  = _htAnc_x0 - k*_H*uTL_x_t
  const _htNE_y0  = _htAnc_y0 + k*_H*uTL_y_t
  const _htSE_x0  = _nw_x0 - k*_H*uTL_x_t
  const _htSE_y0  = _nw_y0 + k*_H*uTL_y_t
  // Centre de référence : le bras 2 part de (apexTopX, topAnnY) et y arrive à θ=90°
  const _c0x      = (_nw_x0 + _htNE_x0) / 2
  const _c0y      = (_nw_y0 + _htNE_y0) / 2
  const topAnnY   = +(cy1 + (+dsy - cy2)).toFixed(1)
  const apexTopX  = +_c0x.toFixed(1)
  const _arm2Len  = topAnnY - _c0y
  // Bras 1 (vers le losange milieu-haut) : référence d'ouverture de l'angle θ
  const cM1x      = +((+cx_ts + +mT1r_xs) / 2).toFixed(1)
  const cM1y      = +((+tCenter_y + +mT1r_y) / 2).toFixed(1)
  const _tA0r     = Math.atan2(+cM1y - topAnnY, +cM1x - +apexTopX)
  const _topAng0  = _tA0r < 0 ? _tA0r + 2 * Math.PI : _tA0r
  // Bras 2 : l'ouverture vaut θ_deg/90 de celle à 90° (bras vertical, 3π/2)
  const _arm2Dir  = _topAng0 + (3 * Math.PI / 2 - _topAng0) * (θ_deg / 90)
  const arm2EndX  = +(_c0x + _arm2Len * Math.cos(_arm2Dir)).toFixed(1)
  const arm2EndY  = +(topAnnY + _arm2Len * Math.sin(_arm2Dir)).toFixed(1)
  // Le losange haut suit le bras 2, incliné de la moitié de son écart à la verticale
  const _rot      = (_arm2Dir - 3 * Math.PI / 2) / 2
  const _cr       = Math.cos(_rot), _sr = Math.sin(_rot)
  const _xfTop = (px: number, py: number): [number, number] => {
    const dx = px - _c0x, dy = py - _c0y
    return [+(+arm2EndX + dx*_cr - dy*_sr).toFixed(1), +(+arm2EndY + dx*_sr + dy*_cr).toFixed(1)]
  }
  const [nw_x, nw_y]       = _xfTop(_nw_x0, _nw_y0)
  const [htAnc_x, htAnc_y] = _xfTop(_htAnc_x0, _htAnc_y0)
  const [htNE_x, htNE_y]   = _xfTop(_htNE_x0, _htNE_y0)
  const [htSE_x, htSE_y]   = _xfTop(_htSE_x0, _htSE_y0)
  const _dxA1   = +nw_x - +mT1r_xs
  const _dyA1   = +nw_y - +mT1r_y
  const R_arc1  = _dxA1 > 0 ? Math.round((_dxA1**2 + _dyA1**2) / (2*_dxA1)) : Math.round(Math.hypot(_dxA1, _dyA1))
  const _dxA2   = +htSE_x - +tInner_xs
  const _dyA2   = +htSE_y - +tInner_y
  const R_arc2  = _dxA2 > 0 ? Math.round((_dxA2**2 + _dyA2**2) / (2*_dxA2)) : Math.round(Math.hypot(_dxA2, _dyA2))
  // Centre arc 2, puis intersection avec arc 1 (continu → pointillé au croisement)
  const _ell2_a2  = (_dxA2**2 + _dyA2**2) / 4
  const _sq_a2    = Math.sqrt(Math.max(0, R_arc2**2 - _ell2_a2) / _ell2_a2)
  const cx_a2     = -_sq_a2 * _dyA2 / 2 + (+tInner_xs + +htSE_x) / 2
  const cy_a2     = +_sq_a2 * _dxA2 / 2 + (+tInner_y  + +htSE_y) / 2
  const _th1_a2   = Math.atan2(+tInner_y - cy_a2, +tInner_xs - cx_a2)
  let   _th2_a2   = Math.atan2(+htSE_y   - cy_a2, +htSE_x    - cx_a2)
  if (_th2_a2 < _th1_a2) _th2_a2 += 2 * Math.PI
  // Centre arc 1 (mT1r → nw, sweep=1)
  const _ell2_a1  = (_dxA1**2 + _dyA1**2) / 4
  const _sq_a1    = Math.sqrt(Math.max(0, R_arc1**2 - _ell2_a1) / _ell2_a1)
  const cx_a1     = -_sq_a1 * _dyA1 / 2 + (+mT1r_xs + +nw_x) / 2
  const cy_a1     = +_sq_a1 * _dxA1 / 2 + (+mT1r_y  + +nw_y) / 2
  const _th1_a1   = Math.atan2(+mT1r_y - cy_a1, +mT1r_xs - cx_a1)
  let   _th2_a1   = Math.atan2(+nw_y   - cy_a1, +nw_x    - cx_a1)
  if (_th2_a1 < _th1_a1) _th2_a1 += 2 * Math.PI
  // Intersection des deux cercles
  const _d12  = Math.hypot(cx_a1 - cx_a2, cy_a1 - cy_a2)
  let cross2_x: number | null = null, cross2_y: number | null = null
  if (_d12 > 0 && _d12 < R_arc1 + R_arc2 && _d12 > Math.abs(R_arc1 - R_arc2)) {
    const _a12 = (R_arc2**2 - R_arc1**2 + _d12**2) / (2 * _d12)
    const _h12 = Math.sqrt(Math.max(0, R_arc2**2 - _a12**2))
    const _mx  = cx_a2 + _a12 * (cx_a1 - cx_a2) / _d12
    const _my  = cy_a2 + _a12 * (cy_a1 - cy_a2) / _d12
    for (const _s12 of [1, -1] as const) {
      const _px = _mx + _s12 * _h12 * (cy_a1 - cy_a2) / _d12
      const _py = _my - _s12 * _h12 * (cx_a1 - cx_a2) / _d12
      // Vérifie que le point est sur l'arc 2 (avant htSE) ET sur l'arc 1
      let _thP2 = Math.atan2(_py - cy_a2, _px - cx_a2)
      if (_thP2 < _th1_a2) _thP2 += 2 * Math.PI
      if (_thP2 <= _th1_a2 + 0.01 || _thP2 >= _th2_a2 - 0.01) continue
      let _thP1 = Math.atan2(_py - cy_a1, _px - cx_a1)
      if (_thP1 < _th1_a1) _thP1 += 2 * Math.PI
      if (_thP1 <= _th1_a1 + 0.01 || _thP1 >= _th2_a1 - 0.01) continue
      cross2_x = +_px.toFixed(1); cross2_y = +_py.toFixed(1); break
    }
  }
  // Arcs 3 & 4 : partent tous deux de tOuter (sommet gauche milieu-haut)
  // Tangente de départ horizontale → superposés au début, divergent ensuite
  // Formule R = (dx²+dy²)/(2·|dy|) → grand rayon = peu courbé à l'arrivée
  // À θ<90° le losange haut se rapproche de tOuter : dx chute et les arcs s'enroulent.
  // On relève le rayon proportionnellement à l'écart à 90° pour les garder plats.
  const _flatL  = 0.82 * (1 + 2 * (90 - θ_deg) / 90)
  const _dxA3   = +htAnc_x - +tOuter_xs
  const _dyA3   = +htAnc_y - +tOuter_y
  const R_arc3  = Math.abs(_dyA3) > 0 ? Math.round((_dxA3**2 + _dyA3**2) / (2 * Math.abs(_dyA3)) * _flatL) : Math.round(Math.hypot(_dxA3, _dyA3))
  const _dxA4   = +htNE_x  - +tOuter_xs
  const _dyA4   = +htNE_y  - +tOuter_y
  const R_arc4  = Math.abs(_dyA4) > 0 ? Math.round((_dxA4**2 + _dyA4**2) / (2 * Math.abs(_dyA4)) * _flatL) : Math.round(Math.hypot(_dxA4, _dyA4))
  // Centre de l'arc 4 (formule SVG générale — valide pour tout R_arc4)
  const _ell2_a4  = (_dxA4**2 + _dyA4**2) / 4
  const _sq_a4    = Math.sqrt(Math.max(0, R_arc4**2 - _ell2_a4) / _ell2_a4)
  const cx_a4     = -_sq_a4 * _dyA4 / 2 + (+tOuter_xs + +htNE_x) / 2
  const cy_a4     = +_sq_a4 * _dxA4 / 2 + (+tOuter_y  + +htNE_y) / 2
  const _th1_a4   = Math.atan2(+tOuter_y - cy_a4, +tOuter_xs - cx_a4)
  let   _th2_a4   = Math.atan2(+htNE_y   - cy_a4, +htNE_x    - cx_a4)
  if (_th2_a4 < _th1_a4) _th2_a4 += 2 * Math.PI
  // Centre arc 3 + 2e intersection des cercles arc3 & arc4 (après tOuter)
  const _ell2_a3  = (_dxA3**2 + _dyA3**2) / 4
  const _sq_a3    = Math.sqrt(Math.max(0, R_arc3**2 - _ell2_a3) / _ell2_a3)
  const cx_a3     = -_sq_a3 * _dyA3 / 2 + (+tOuter_xs + +htAnc_x) / 2
  const cy_a3     = +_sq_a3 * _dxA3 / 2 + (+tOuter_y  + +htAnc_y) / 2
  const _th1_a3   = Math.atan2(+tOuter_y - cy_a3, +tOuter_xs - cx_a3)
  let   _th2_a3   = Math.atan2(+htAnc_y  - cy_a3, +htAnc_x   - cx_a3)
  if (_th2_a3 < _th1_a3) _th2_a3 += 2 * Math.PI
  const _d34      = Math.hypot(cx_a4 - cx_a3, cy_a4 - cy_a3)
  let sep34_x: number | null = null, sep34_y: number | null = null
  if (_d34 > 0 && _d34 < R_arc3 + R_arc4 && _d34 > Math.abs(R_arc3 - R_arc4)) {
    const _a34  = (R_arc3**2 - R_arc4**2 + _d34**2) / (2 * _d34)
    const _h34  = Math.sqrt(Math.max(0, R_arc3**2 - _a34**2))
    const _mx34 = cx_a3 + _a34 * (cx_a4 - cx_a3) / _d34
    const _my34 = cy_a3 + _a34 * (cy_a4 - cy_a3) / _d34
    for (const _s34 of [1, -1] as const) {
      const _px = _mx34 + _s34 * _h34 * (cy_a4 - cy_a3) / _d34
      const _py = _my34 - _s34 * _h34 * (cx_a4 - cx_a3) / _d34
      if (Math.hypot(_px - +tOuter_xs, _py - +tOuter_y) < 5) continue  // skip tOuter
      let _thP3 = Math.atan2(_py - cy_a3, _px - cx_a3)
      if (_thP3 < _th1_a3) _thP3 += 2 * Math.PI
      if (_thP3 <= _th1_a3 + 0.01 || _thP3 >= _th2_a3 - 0.01) continue
      let _thP4 = Math.atan2(_py - cy_a4, _px - cx_a4)
      if (_thP4 < _th1_a4) _thP4 += 2 * Math.PI
      if (_thP4 <= _th1_a4 + 0.01 || _thP4 >= _th2_a4 - 0.01) continue
      sep34_x = +_px.toFixed(1); sep34_y = +_py.toFixed(1); break
    }
  }
  // Arc 5 (pointillé) : sommet nord milieu-haut → arc 4 à t=0.7
  const _t5       = 0.7
  const _th_j5    = _th1_a4 + _t5 * (_th2_a4 - _th1_a4)
  const jct5_x    = +(cx_a4 + R_arc4 * Math.cos(_th_j5)).toFixed(1)
  const jct5_y    = +(cy_a4 + R_arc4 * Math.sin(_th_j5)).toFixed(1)
  const _dxA5   = +jct5_x - +cx_ts
  const _dyA5   = +jct5_y - +tCenter_y
  const R_arc5  = Math.round(Math.hypot(_dxA5, _dyA5) * 1.0)
  const _sw5    = 1
  // Centre arc 5 (sweep=1) pour intersection avec arc 3
  const _ell2_a5  = (_dxA5**2 + _dyA5**2) / 4
  const _sq_a5    = Math.sqrt(Math.max(0, R_arc5**2 - _ell2_a5) / _ell2_a5)
  const cx_a5     = -_sq_a5 * _dyA5 / 2 + (+cx_ts + +jct5_x) / 2
  const cy_a5     = +_sq_a5 * _dxA5 / 2 + (+tCenter_y + +jct5_y) / 2
  const _th1_a5   = Math.atan2(+tCenter_y - cy_a5, +cx_ts - cx_a5)
  let   _th2_a5   = Math.atan2(+jct5_y - cy_a5, +jct5_x - cx_a5)
  if (_th2_a5 < _th1_a5) _th2_a5 += 2 * Math.PI
  // Intersection cercle arc5 ∩ cercle arc4 → endpoint de l'arc 5
  const _d54   = Math.hypot(cx_a4 - cx_a5, cy_a4 - cy_a5)
  let stop5_x  = +jct5_x, stop5_y = +jct5_y   // fallback
  if (_d54 > 0 && _d54 < R_arc5 + R_arc4 && _d54 > Math.abs(R_arc5 - R_arc4)) {
    const _a54 = (R_arc5**2 - R_arc4**2 + _d54**2) / (2 * _d54)
    const _h54 = Math.sqrt(Math.max(0, R_arc5**2 - _a54**2))
    const _mx5 = cx_a5 + _a54 * (cx_a4 - cx_a5) / _d54
    const _my5 = cy_a5 + _a54 * (cy_a4 - cy_a5) / _d54
    for (const _s54 of [1, -1] as const) {
      const _px = _mx5 + _s54 * _h54 * (cy_a4 - cy_a5) / _d54
      const _py = _my5 - _s54 * _h54 * (cx_a4 - cx_a5) / _d54
      let _thP5 = Math.atan2(_py - cy_a5, _px - cx_a5)
      if (_thP5 < _th1_a5) _thP5 += 2 * Math.PI
      if (_thP5 <= _th1_a5 + 0.01 || _thP5 >= _th2_a5 - 0.01) continue
      let _thP4 = Math.atan2(_py - cy_a4, _px - cx_a4)
      if (_thP4 < _th1_a4) _thP4 += 2 * Math.PI
      if (_thP4 <= _th1_a4 + 0.01 || _thP4 >= _th2_a4 - 0.01) continue
      stop5_x = +_px.toFixed(1); stop5_y = +_py.toFixed(1); break
    }
  }

  const _lMidX = (+bL_x + +bB_x) / 2, _lMidY = (+bL_y + +bB_y) / 2
  const _vAnnBotX = _lMidX + uTR_y * 30, _vAnnBotY = _lMidY + (-uTR_x) * 30

  // Cote sur le côté haut du losange haut (htAnc→htNE) — porte la dimension
  // complémentaire de celle cotée en bas : hauteur si « sur la largeur », et l'inverse
  const _hsX = +htNE_x - +htAnc_x, _hsY = +htNE_y - +htAnc_y
  const _hsL = Math.hypot(_hsX, _hsY) || 1
  const _hMidX = (+htAnc_x + +htNE_x) / 2, _hMidY = (+htAnc_y + +htNE_y) / 2
  let _hNx = _hsY / _hsL, _hNy = -_hsX / _hsL
  // Normale sortante : on garde le sens qui s'éloigne du centre du losange
  if (_hNx * (_hMidX - +arm2EndX) + _hNy * (_hMidY - +arm2EndY) < 0) { _hNx = -_hNx; _hNy = -_hNy }
  const _hAnnX = +(_hMidX + _hNx * 30).toFixed(1), _hAnnY = +(_hMidY + _hNy * 30).toFixed(1)

  // ── Annotations partie haute (perpendiculaire au bas, comme circulaire) ──
  // topAnnY est symétrique de dsy par rapport à cy1 (même distance en-dessous de cy1
  // que dsy est en-dessous de cy2) → les deux bras descendent dans des directions ⊥
  // Midpoint arc intérieur haut (arc1) + arc extérieur haut (arc4), comme rMidX/Y_B pour le bas
  const [_arc1Mx, _arc1My] = _arcMid(+mT1r_xs, mT1r_y, +nw_x, +nw_y, R_arc1)
  const [_arc4Mx, _arc4My] = _arcMid(+tOuter_xs, tOuter_y, +htNE_x, +htNE_y, R_arc4)
  const rMidX_T    = +((_arc1Mx + _arc4Mx) / 2).toFixed(1)
  const rMidY_T    = +((_arc1My + _arc4My) / 2).toFixed(1)
  const rLabelX_T  = +((+apexTopX + +rMidX_T) / 2).toFixed(1)
  const rLabelY_T  = +((+topAnnY + +rMidY_T) / 2).toFixed(1)
  // Arc angle haut : borné par les directions réelles des deux bras pointillés
  const _topAng1  = _arm2Dir                                            // suit la direction du bras 2
  const tax0_top  = +(+apexTopX + aR * Math.cos(_topAng0)).toFixed(1)
  const tay0_top  = +(+topAnnY  + aR * Math.sin(_topAng0)).toFixed(1)
  const tax1_top  = +(+apexTopX + aR * Math.cos(_topAng1)).toFixed(1)
  const tay1_top  = +(+topAnnY  + aR * Math.sin(_topAng1)).toFixed(1)

  const _allX = [+bR_x, +bL_x, +bB_x, +diT_x,
                 +mR2_x, +mL2_x, +mT2_x, mT1r_xs, cx, cx_ts,
                 tInner_xs, tOuter_xs,
                 +nw_x, +htAnc_x, +htNE_x, +htSE_x]
  const _allY = [+bR_y, +bL_y, +bB_y, +diT_y,
                 +mR2_y, +mL2_y, +mT2_y, mT1r_y, cy2+axC,
                 tInner_y, tOuter_y, tCenter_y,
                 +nw_y, +htAnc_y, +htNE_y, +htSE_y]

  // ── Emprise : géométrie + toutes les annotations ────────────────────────────
  // Chaque libellé est mesuré (~7 px par caractère en demi-largeur à fontSize 25)
  // et empilé ici, pour qu'aucune cote ne sorte du viewBox.
  const _thetaLbl  = `θ = ${θ_deg}°`
  const _cotBotLbl = orientation === 'vertical'
    ? (h_mm != null ? `H = ${h_mm} mm` : 'H')
    : (l_mm != null ? `L = ${l_mm} mm` : 'L')
  const _cotTopLbl = orientation === 'vertical'
    ? (l_mm != null ? `L = ${l_mm} mm` : 'L')
    : (h_mm != null ? `H = ${h_mm} mm` : 'H')
  const _tw = (s: string) => s.length * 7     // demi-largeur
  const _th = 14                              // demi-hauteur
  const _annX: number[] = [], _annY: number[] = []
  const _box = (x: number, y: number, hw: number, hh: number) => {
    _annX.push(x - hw, x + hw); _annY.push(y - hh, y + hh)
  }
  if (!mini) {
    // Arcs θ (rayon aR autour des sommets) et libellés θ (ancrés à 12 px, vers l'extérieur)
    _box(+apexBotX, +dsy, aR, aR)
    _box(+apexTopX, +topAnnY, aR, aR)
    _box(+apexBotX - 12 - _tw(_thetaLbl), +dsy, _tw(_thetaLbl), _th)
    _box(+apexTopX + 12 + _tw(_thetaLbl), +topAnnY, _tw(_thetaLbl), _th)
    // Lignes de rayon r et leurs libellés
    _box(+rMidX_B, +rMidY_B, 0, 0); _box(+rMidX_T, +rMidY_T, 0, 0)
    _box(+rLabelXc, +rLabelYc, _tw(rLabel), _th)
    _box(+rLabelX_T, +rLabelY_T, _tw(rLabel), _th)
    // Bras pointillés : centres des losanges milieu et de sortie
    _box(+cM1x, +cM1y, 0, 0); _box(+cM2x, +cM2y, 0, 0)
    _box(+cEx_x, +cEx_y, 0, 0); _box(+arm2EndX, +arm2EndY, 0, 0)
    // Cote l, à gauche de la gaine
    _box(lWall_x - 20, +mL1_y, 10, 0); _box(lWall_x - 20, +mL2_y, 10, 0)
    _box(lWall_x - 36 - _tw(lLabel), (+mL1_y + +mL2_y) / 2, _tw(lLabel), _th)
    // Cotes des losanges : traits d'attache (19 px) puis libellés (30 px, tournés →
    // on prend la demi-largeur comme rayon, l'inclinaison variant avec θ)
    _box(_lMidX - uTR_y * 19, _lMidY + uTR_x * 19, 0, 0)
    _box(_lMidX - uTR_y * 30, _lMidY + uTR_x * 30, _tw(_cotBotLbl), _tw(_cotBotLbl))
    _box(_hMidX + _hNx * 19, _hMidY + _hNy * 19, 0, 0)
    _box(+_hAnnX, +_hAnnY, _tw(_cotTopLbl), _tw(_cotTopLbl))
  }

  const _pad  = mini ? 8 : 15
  const _xMin = Math.floor(Math.min(..._allX, ..._annX) - _pad)
  const _xMax = Math.ceil(Math.max(..._allX, ..._annX) + _pad)
  const _yMin = Math.floor(Math.min(..._allY, ..._annY) - _pad)
  const _yMax = Math.ceil(Math.max(..._allY, ..._annY) + _pad)
  const _vW   = _xMax - _xMin
  const _vH   = _yMax - _yMin
  const sw    = +((mini ? 10 : 3.75) * _vW / 500).toFixed(1)
  const da    = mini ? `${+(sw * 3.5).toFixed(1)} ${+(sw * 3).toFixed(1)}` : "10 9"

  return (
    <svg viewBox={`${_xMin} ${_yMin} ${_vW} ${_vH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
      {/* ── Losange milieu haut ── */}
      {!mini && <polygon points={`${tOuter_xs},${tOuter_y} ${mT1r_xs},${mT1r_y} ${tInner_xs},${tInner_y} ${cx_ts},${tCenter_y}`}
        fill="#f1f5f9" stroke="none" />}
      {!mini && <polyline points={`${cx_ts},${tCenter_y} ${tOuter_xs},${tOuter_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 9" />}
      {!mini && <polyline points={`${tInner_xs},${tInner_y} ${cx_ts},${tCenter_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 9" />}
      {!mini && <polyline points={`${tOuter_xs},${tOuter_y} ${mT1r_xs},${mT1r_y} ${tInner_xs},${tInner_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />}
      {/* ── Losange milieu bas ── */}
      {!mini && <polygon points={`${mR2_x},${mR2_y} ${mT2_x},${mT2_y} ${mL2_x},${mL2_y} ${cx},${cy2+axC}`}
        fill="#f1f5f9" stroke="none" />}
      {!mini && <polyline points={`${cx},${cy2+axC} ${mR2_x},${mR2_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />}
      {!mini && <polyline points={`${mL2_x},${mL2_y} ${cx},${cy2+axC}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />}
      {!mini && <polyline points={`${mR2_x},${mR2_y} ${mT2_x},${mT2_y} ${mL2_x},${mL2_y}`}
        fill="none" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="10 9" />}
      {/* ── Parois du tronçon droit ── */}
      <line x1={tInner_xs} y1={tInner_y} x2={rWall_x} y2={rWall_y2} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      <line x1={tOuter_xs} y1={tOuter_y} x2={lWall_x} y2={lWall_y2} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      <line x1={mT1r_xs} y1={mT1r_y} x2={cx} y2={cy2+axC} stroke="#374151" strokeWidth={sw} strokeLinecap="round" />
      {/* ── Losange haut — fond d'abord pour que les arcs soient visibles par-dessus ── */}
      <polygon points={`${nw_x},${nw_y} ${htAnc_x},${htAnc_y} ${htNE_x},${htNE_y} ${htSE_x},${htSE_y}`}
        fill="#f1f5f9" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      {/* ── Arc 1 : sommet sud milieu-haut → sommet SW losange haut ── */}
      <path d={`M ${mT1r_xs} ${mT1r_y} A ${R_arc1} ${R_arc1} 0 0 1 ${nw_x} ${nw_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* ── Arc 2 : sommet est milieu-haut → sommet SE losange haut (pointillé après croisement) ── */}
      {cross2_x !== null
        ? <><path d={`M ${tInner_xs} ${tInner_y} A ${R_arc2} ${R_arc2} 0 0 1 ${cross2_x} ${cross2_y}`}
              stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
            <path d={`M ${cross2_x} ${cross2_y} A ${R_arc2} ${R_arc2} 0 0 1 ${htSE_x} ${htSE_y}`}
              stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={da} /></>
        : <path d={`M ${tInner_xs} ${tInner_y} A ${R_arc2} ${R_arc2} 0 0 1 ${htSE_x} ${htSE_y}`}
            stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      }
      {/* ── Arc 3 : démarre à la 2e intersection avec arc 4, → htAnc ── */}
      <path d={`M ${sep34_x ?? tOuter_xs} ${sep34_y ?? tOuter_y} A ${R_arc3} ${R_arc3} 0 0 1 ${htAnc_x} ${htAnc_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* ── Arc 4 : sommet gauche milieu-haut → htNE (losange haut) ── */}
      <path d={`M ${tOuter_xs} ${tOuter_y} A ${R_arc4} ${R_arc4} 0 0 1 ${htNE_x} ${htNE_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* ── Arc 5 : sommet nord milieu-haut → croisement arc 3 — pointillé ── */}
      <path d={`M ${cx_ts} ${tCenter_y} A ${R_arc5} ${R_arc5} 0 0 ${_sw5} ${stop5_x} ${stop5_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={da} />
      {/* ── Virage inférieur ── */}
      <polygon points={`${bR_x},${bR_y} ${diT_x},${diT_y} ${bL_x},${bL_y} ${bB_x},${bB_y}`}
        fill="#f1f5f9" stroke="#374151" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />
      <path d={`M ${lWall_x} ${lWall_y2} A ${Ri_bi} ${Ri_bi} 0 0 1 ${bL_x} ${bL_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      <path d={`M ${rWall_x} ${rWall_y2} A ${Ro_bo} ${Ro_bo} 0 0 1 ${bR_x} ${bR_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      <path d={`M ${cx} ${cy2+axC} A ${R_B} ${R_B} 0 0 1 ${diT_x} ${diT_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" />
      <path d={`M ${bB_x} ${bB_y} A ${R_back1} ${R_back1} 0 0 0 ${mT2_x} ${mT2_y} L ${cx_ts} ${tCenter_y}`}
        stroke="#374151" strokeWidth={sw} fill="none" strokeLinecap="round" strokeDasharray={da} />
      {/* Pointillés bas */}
      {!mini && <>
        <line x1={cM2x} y1={cM2y} x2={apexBotX} y2={dsy}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
        <line x1={apexBotX} y1={dsy} x2={cEx_x} y2={cEx_y}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
      </>}
      {/* Pointillés haut */}
      {!mini && <>
        <line x1={cM1x} y1={cM1y} x2={apexTopX} y2={topAnnY}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
        <line x1={apexTopX} y1={topAnnY} x2={arm2EndX} y2={arm2EndY}
          stroke="#64748b" strokeWidth={sw} strokeDasharray="12 8" strokeLinecap="round" />
      </>}
      {/* Annotations */}
      {!mini && <>
        {/* Arc θ bas + label */}
        <path d={`M ${ax0c} ${ay0c} A ${aR} ${aR} 0 0 1 ${ax1c} ${ay1c}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(+apexBotX - 12).toFixed(1)} y={dsy} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="end" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">θ = {θ_deg}°</text>
        <line x1={apexBotX} y1={dsy} x2={rMidX_B} y2={rMidY_B}
          stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <text x={rLabelXc} y={rLabelYc} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">{rLabel}</text>
        {/* Arc θ haut + label */}
        <path d={`M ${tax0_top} ${tay0_top} A ${aR} ${aR} 0 0 1 ${tax1_top} ${tay1_top}`}
          stroke="#374151" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        <text x={+(+apexTopX + 12).toFixed(1)} y={topAnnY} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="start" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">θ = {θ_deg}°</text>
        {/* Rayon r haut */}
        <line x1={apexTopX} y1={topAnnY} x2={rMidX_T} y2={rMidY_T}
          stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
        <text x={rLabelX_T} y={rLabelY_T} fontSize="25" fill="#374151" fontWeight="600"
          textAnchor="middle" dominantBaseline="middle"
          paintOrder="stroke" stroke="white" strokeWidth="6">{rLabel}</text>
        {(() => {
          const lx2 = lWall_x - 20
          const ym  = (lWall_y1 + lWall_y2) / 2
          return <>
            <line x1={lx2 - 10} y1={lWall_y1} x2={lx2 + 10} y2={lWall_y1} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={lx2 - 10} y1={lWall_y2} x2={lx2 + 10} y2={lWall_y2} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={lx2} y1={lWall_y1} x2={lx2} y2={lWall_y2} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
            <text x={lx2 - 16} y={ym} fontSize="25" fill="#64748b" textAnchor="end" dominantBaseline="middle" fontStyle="italic">{lLabel}</text>
          </>
        })()}
        {(() => {
          const sx = +bB_x - +bL_x, sy = +bB_y - +bL_y
          const sl = Math.hypot(sx, sy) || 1
          const epX = -uTR_y, epY = uTR_x   // normale sortante du côté coté en bas
          const a0x = +(+bL_x + 5*epX).toFixed(1), a0y = +(+bL_y + 5*epY).toFixed(1)
          const a2x = +(+bL_x + 19*epX).toFixed(1), a2y = +(+bL_y + 19*epY).toFixed(1)
          const b0x = +(+bB_x + 5*epX).toFixed(1),  b0y = +(+bB_y + 5*epY).toFixed(1)
          const b2x = +(+bB_x + 19*epX).toFixed(1), b2y = +(+bB_y + 19*epY).toFixed(1)
          const a1x = +(+bL_x + 12*epX).toFixed(1), a1y = +(+bL_y + 12*epY).toFixed(1)
          const b1x = +(+bB_x + 12*epX).toFixed(1), b1y = +(+bB_y + 12*epY).toFixed(1)
          const mx  = +((+bL_x + +bB_x) / 2 + 30*epX).toFixed(1)
          const my  = +((+bL_y + +bB_y) / 2 + 30*epY).toFixed(1)
          const lbl = _cotBotLbl
          let ang = Math.atan2(sy, sx) * 180 / Math.PI
          if (ang > 45) ang -= 180
          return <>
            <line x1={a0x} y1={a0y} x2={a2x} y2={a2y} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={b0x} y1={b0y} x2={b2x} y2={b2y} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={a1x} y1={a1y} x2={b1x} y2={b1y} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={mx} y={my} fontSize="25" fill="#64748b" fontStyle="italic"
              textAnchor="middle" dominantBaseline="middle"
              paintOrder="stroke" stroke="white" strokeWidth="6"
              transform={`rotate(${ang.toFixed(1)}, ${mx}, ${my})`}>{lbl}</text>
          </>
        })()}
        {/* Cote du côté haut du losange haut : dimension complémentaire de celle cotée en bas */}
        {(() => {
          const a0x = +(+htAnc_x +  5*_hNx).toFixed(1), a0y = +(+htAnc_y +  5*_hNy).toFixed(1)
          const a2x = +(+htAnc_x + 19*_hNx).toFixed(1), a2y = +(+htAnc_y + 19*_hNy).toFixed(1)
          const b0x = +(+htNE_x  +  5*_hNx).toFixed(1), b0y = +(+htNE_y  +  5*_hNy).toFixed(1)
          const b2x = +(+htNE_x  + 19*_hNx).toFixed(1), b2y = +(+htNE_y  + 19*_hNy).toFixed(1)
          const a1x = +(+htAnc_x + 12*_hNx).toFixed(1), a1y = +(+htAnc_y + 12*_hNy).toFixed(1)
          const b1x = +(+htNE_x  + 12*_hNx).toFixed(1), b1y = +(+htNE_y  + 12*_hNy).toFixed(1)
          const lbl = _cotTopLbl
          let ang = Math.atan2(_hsY, _hsX) * 180 / Math.PI
          if (ang >  90) ang -= 180
          if (ang < -90) ang += 180
          return <>
            <line x1={a0x} y1={a0y} x2={a2x} y2={a2y} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={b0x} y1={b0y} x2={b2x} y2={b2y} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={a1x} y1={a1y} x2={b1x} y2={b1y} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={_hAnnX} y={_hAnnY} fontSize="25" fill="#64748b" fontStyle="italic"
              textAnchor="middle" dominantBaseline="middle"
              paintOrder="stroke" stroke="white" strokeWidth="6"
              transform={`rotate(${ang.toFixed(1)}, ${_hAnnX}, ${_hAnnY})`}>{lbl}</text>
          </>
        })()}
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
  const vbL = 0, vbT = 0, vbR = 500, vbB = 420, M = 16
  const scl = Math.min((vbR - vbL - 2*M) / (xRight_w - 150), (vbB - vbT - 2*M) / (510 - yTop_w)) * (mini ? 1 : 0.88)
  const tx  = vbL + M + ((vbR - vbL - 2*M) - (xRight_w - 150) * scl) / 2 - 150 * scl
  const ty  = vbT + M + ((vbB - vbT - 2*M) - (500 - yTop_w) * scl) / 2 - yTop_w * scl
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
      <svg viewBox="0 0 500 420" width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
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
            textAnchor="middle" dominantBaseline="middle">θ = {angle}°</text>
          <line x1={vx(150)} y1={vy(478)} x2={vx(150)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(230)} y1={vy(478)} x2={vx(230)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(150)} y1={vy(484)} x2={vx(230)} y2={vy(484)} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
          <text x={vx(190)} y={+(vy(484) + 16).toFixed(1)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{dimLabel}</text>
        </>}
      </svg>
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
  const vbL = 0, vbT = 0, vbR = 500, vbB = 420, M = 16
  const scl = Math.min((vbR - vbL - 2*M) / (xRight_w - xO), (vbB - vbT - 2*M) / (510 - yTop_w)) * (mini ? 1 : 0.88)
  const tx  = vbL + M + ((vbR - vbL - 2*M) - (xRight_w - xO) * scl) / 2 - xO * scl
  const ty  = vbT + M + ((vbB - vbT - 2*M) - (500 - yTop_w) * scl) / 2 - yTop_w * scl
  const vx  = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy  = (wy: number) => +(ty + wy * scl).toFixed(1)

  const fill = '#f1f5f9', stroke = '#374151'
  const dimLabel = orientation === 'vertical'
    ? (h_mm != null ? `H = ${h_mm} mm` : 'H')
    : (l_mm != null ? `L = ${l_mm} mm` : 'L')

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* SVG principal — coude centré (preserveAspectRatio par défaut xMidYMid meet) */}
      <svg viewBox="0 0 500 420" width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
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
              textAnchor="middle" dominantBaseline="middle">θ = {angle}°</text>
            <line x1={vx(xO)} y1={vy(478)} x2={vx(xO)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(xI)} y1={vy(478)} x2={vx(xI)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(xO)} y1={vy(484)} x2={vx(xI)} y2={vy(484)} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={vx(xO + w / 2)} y={+(vy(484) + 16).toFixed(1)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{dimLabel}</text>
            <line x1={cx_vb} y1={cy_vb} x2={Px_vb} y2={Py_vb} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={Px_vb} y1={Py_vb} x2={arr1x} y2={arr1y} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={Px_vb} y1={Py_vb} x2={arr2x} y2={arr2y} stroke="#374151" strokeWidth="1.5" strokeLinecap="round" />
            <text x={midX_vb} y={midY_vb} fontSize="15" fill="#374151" fontWeight="600"
              textAnchor="middle" dominantBaseline="middle"
              paintOrder="stroke" stroke="white" strokeWidth="5">{rLbl}</text>
          </>
        })()}
      </svg>
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
  const vbL = 0, vbT = 0, vbR = 500, vbB = 420, M = 16
  const scl = Math.min((vbR - vbL - 2*M) / (xRight_w - xO), (vbB - vbT - 2*M) / (510 - yTop_w)) * (mini ? 1 : 0.88)
  const tx  = vbL + M + ((vbR - vbL - 2*M) - (xRight_w - xO) * scl) / 2 - xO * scl
  const ty  = vbT + M + ((vbB - vbT - 2*M) - (500 - yTop_w) * scl) / 2 - yTop_w * scl
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
  const vaneWMini = +(10 / scl).toFixed(2)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox="0 0 500 420" width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
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
              textAnchor="middle" dominantBaseline="middle">θ = {angle}°</text>
            <line x1={vx(xO)} y1={vy(478)} x2={vx(xO)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(xI)} y1={vy(478)} x2={vx(xI)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(xO)} y1={vy(484)} x2={vx(xI)} y2={vy(484)} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
            <text x={vx(xO + w / 2)} y={+(vy(484) + 16).toFixed(1)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{dimLabel}</text>
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
  const vbL = 0, vbT = 0, vbR = 500, vbB = 420, Mg = 16
  const scl = Math.min((vbR-vbL-2*Mg)/(xRight_w-150), (vbB-vbT-2*Mg)/(510-yTop_w)) * (mini ? 1 : 0.88)
  const tx   = vbL+Mg+((vbR-vbL-2*Mg)-(xRight_w-150)*scl)/2 - 150*scl
  const ty   = vbT+Mg+((vbB-vbT-2*Mg)-(500-yTop_w)*scl)/2  - yTop_w*scl
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
  const DESIGNS_38: Record<1|2|3, { r: number; s: number; L: number; label: string }> = {
    1: { r: 2.0, s: 1.5,  L: 0.75, label: 'r = 2,0" · s = 1,5" · L = 0,75"' },
    2: { r: 4.5, s: 2.25, L: 0,    label: 'r = 4,5" · s = 2,25"' },
    3: { r: 4.5, s: 3.25, L: 1.60, label: 'r = 4,5" · s = 3,25" · L = 1,60"' },
  }
  const DESIGNS_39: Record<1|2|3|4, { r: number; s: number; label: string }> = {
    1: { r: 2.0, s: 1.5,  label: 'r = 2,0" · s = 1,5" · Runner : Embossed' },
    2: { r: 2.0, s: 1.5,  label: 'r = 2,0" · s = 1,5" · Runner : Push-On' },
    3: { r: 2.0, s: 2.13, label: 'r = 2,0" · s = 2,13" · Runner : Embossed' },
    4: { r: 4.5, s: 3.25, label: 'r = 4,5" · s = 3,25" · Runner : Embossed' },
  }

  const isDouble = vaneThickness === 'double'
  const dp  = isDouble ? DESIGNS_39[design39 as 1|2|3|4] : DESIGNS_38[design38 as 1|2|3]
  const L_in = isDouble ? 0 : DESIGNS_38[design38 as 1|2|3].L
  const infoText = dp.label

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
      <svg viewBox="0 0 500 420" width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
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
            textAnchor="middle" dominantBaseline="middle">θ = 90°</text>
          <line x1={vx(150)} y1={vy(478)} x2={vx(150)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(230)} y1={vy(478)} x2={vx(230)} y2={vy(490)} stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(150)} y1={vy(484)} x2={vx(230)} y2={vy(484)} stroke="#64748b" strokeWidth="1"   strokeLinecap="round" />
          <text x={vx(190)} y={+(vy(484) + 16).toFixed(1)} fontSize="15" fill="#64748b" textAnchor="middle" fontStyle="italic">{dimLabel}</text>
          <text x="250" y="408" fontSize="11" fill="#64748b" textAnchor="middle" dominantBaseline="middle" fontStyle="italic">{infoText}</text>
          {/* Détail zoomé (zone libre à droite, sous la branche horizontale) : deux
              aubes consécutives pour définir r, s et — en simple épaisseur — L.
              s est le pas de translation entre aubes, donc coté entre deux points
              correspondants : ici les départs d'arc, visibles, plutôt qu'entre les
              centres, points de construction. */}
          {(() => {
            const Z   = 13.5                   // px par pouce
            const rv  = dp.r * Z
            const Lv  = L_in * Z               // nul en double épaisseur
            const dv  = dp.s * Z / Math.SQRT2  // décalage sur x et y (aubes à 45°)
            const ox  = 420, oy = 350          // centre d'arc de l'aube avant
            const inch = (v: number) => `${v.toFixed(2).replace(/0$/, '').replace('.', ',')}"`
            const rc  = Math.max(1, rv * 0.15) // petit arc de coin, comme dans le coude
            // Simple épaisseur : un seul trait (arc + prolongement éventuel).
            // Double épaisseur : arc extérieur + chemin intérieur, mêmes extrémités.
            const vaneD = (vcx: number, vcy: number) => {
              const outer = [`M ${f(vcx - rv)} ${f(vcy)}`,
                             `A ${ff(rv)} ${ff(rv)} 0 0 1 ${f(vcx)} ${f(vcy - rv)}`]
              if (!isDouble) {
                if (Lv > 0) outer.push(`L ${f(vcx + Lv)} ${f(vcy - rv)}`)
                return [outer.join(' ')]
              }
              return [outer.join(' '), [
                `M ${f(vcx - rv)} ${f(vcy)}`,
                `L ${f(vcx - rv)} ${f(vcy - rv + rc)}`,
                `A ${ff(rc)} ${ff(rc)} 0 0 1 ${f(vcx - rv + rc)} ${f(vcy - rv)}`,
                `L ${f(vcx)} ${f(vcy - rv)}`,
              ].join(' ')]
            }
            const cote = (ax: number, ay: number, bx: number, by: number,
                          nx: number, ny: number, txt: string, off = 25) => (<>
              <line x1={f(ax + 5*nx)} y1={f(ay + 5*ny)} x2={f(ax + 16*nx)} y2={f(ay + 16*ny)}
                stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
              <line x1={f(bx + 5*nx)} y1={f(by + 5*ny)} x2={f(bx + 16*nx)} y2={f(by + 16*ny)}
                stroke="#64748b" strokeWidth="1.2" strokeLinecap="round" />
              <line x1={f(ax + 11*nx)} y1={f(ay + 11*ny)} x2={f(bx + 11*nx)} y2={f(by + 11*ny)}
                stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
              <text x={f((ax + bx)/2 + off*nx)} y={f((ay + by)/2 + off*ny)}
                fontSize="12" fill="#64748b" fontStyle="italic"
                textAnchor="middle" dominantBaseline="middle"
                paintOrder="stroke" stroke="white" strokeWidth="4">{txt}</text>
            </>)
            const rmx = ox + rv * Math.cos(Math.PI * 1.25)   // milieu de l'arc (225°)
            const rmy = oy + rv * Math.sin(Math.PI * 1.25)
            const k = Math.SQRT1_2
            return (<>
              {[[ox - dv, oy - dv], [ox, oy]].flatMap(([vcx, vcy], i) =>
                vaneD(vcx, vcy).map((d, j) => (
                  <path key={`${i}-${j}`} d={d} fill="none" stroke={dkStroke}
                    strokeWidth="2.4" strokeLinecap="round" />
                )))}
              {/* r : du centre d'arc vers l'arc */}
              <circle cx={ox} cy={oy} r="1.8" fill="#64748b" />
              <line x1={ox} y1={oy} x2={f(rmx)} y2={f(rmy)} stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
              {/* Libellé r posé à droite du centre : la zone concave est bornée par
                  l'arc, un décalage perpendiculaire à la ligne de rayon le chevaucherait */}
              <text x={f(ox + 32)} y={f(oy - 4)} fontSize="12" fill="#64748b" fontStyle="italic"
                textAnchor="middle" dominantBaseline="middle"
                paintOrder="stroke" stroke="white" strokeWidth="4">r = {inch(dp.r)}</text>
              {/* s : entre les départs d'arc des deux aubes, normale vers l'extérieur */}
              {cote(ox - dv - rv, oy - dv, ox - rv, oy, -k, k, `s = ${inch(dp.s)}`)}
              {/* L : le long du prolongement droit, après l'arc */}
              {/* Libellé plus large que la cote → écarté davantage pour ne pas
                  chevaucher le prolongement de la seconde aube */}
              {Lv > 0 && cote(ox, oy - rv, ox + Lv, oy - rv, 0, -1, `L = ${inch(L_in)}`, 33)}
            </>)
          })()}
        </>}
      </svg>
    </div>
  )
}

// ── Schéma Z rectangulaire (ASHRAE 3-11) ──────────────────────────────────────

function SchemaRectZ({
  orientation = 'horizontal', l_mm, h_mm, lOverH = 1.0, mini,
}: {
  orientation?: 'horizontal' | 'vertical'
  l_mm?: number | null
  h_mm?: number | null
  lOverH?: number
  mini?: boolean
}) {
  const a0_mm = (orientation === 'vertical' ? h_mm : l_mm) ?? 300

  // Symmetric geometry: equal arm lengths on each side of the connecting section
  const w       = 80   // duct height in world units
  const arm     = 1.2 * w  // horizontal arm length = 1.2× la dimension de la gaine
  const x_b1    = 200  // inner corner x (entry meets connecting)
  const x_start = x_b1 - arm      // = 80
  const x_exit  = x_b1 + w + arm  // = 400
  const L_draw  = Math.min(lOverH * w, 400)  // cap display height (annotations stay visible)

  // Space outside the duct for annotations (left = entry, right = exit)
  const annLeft  = mini ? 0 : 52
  const annRight = mini ? 0 : 52
  const totalW   = annLeft + (x_exit - x_start) + annRight

  const VW = 500, VH = 420, M = 16
  const scl = Math.min((VW - 2*M) / totalW, (VH - 2*M) / (L_draw + w))
  const tx  = M + ((VW - 2*M) - totalW * scl) / 2 + annLeft * scl - x_start * scl
  const ty  = M + ((VH - 2*M) - (L_draw + w) * scl) / 2
  const vx  = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy  = (wy: number) => +(ty + wy * scl).toFixed(1)
  const sw  = mini ? +(10 / scl).toFixed(2) : '3'

  const fill = '#f1f5f9', stroke = '#374151'

  // Z-shape: union of 3 rectangles, 90° corners, straight ends
  const pathD = [
    `M ${vx(x_start)} ${vy(0)}`,
    `L ${vx(x_b1 + w)} ${vy(0)}`,       // top wall: entry + connecting combined
    `L ${vx(x_b1 + w)} ${vy(L_draw)}`,  // connecting right wall
    `L ${vx(x_exit)} ${vy(L_draw)}`,    // exit top (right of connecting)
    `L ${vx(x_exit)} ${vy(L_draw + w)}`,// exit right end (straight)
    `L ${vx(x_b1)} ${vy(L_draw + w)}`,  // exit bottom going LEFT
    `L ${vx(x_b1)} ${vy(w)}`,           // combined left wall going UP
    `L ${vx(x_start)} ${vy(w)}`,        // entry bottom
    'Z',                                 // entry left end (straight)
  ].join(' ')

  // a0 = dimension dans le plan de courbure : L (largeur) pour horizontal, H (hauteur) pour vertical
  const dimLbl = orientation === 'vertical'
    ? (h_mm != null ? `H = ${h_mm} mm` : 'H')
    : (l_mm != null ? `L = ${l_mm} mm` : 'L')
  const cx = x_b1 + w / 2  // centre horizontal de la gaine verticale

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
        <path d={pathD} fill={fill} stroke={stroke} strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round" />

        {!mini && <>
          {/* Annotation l — au centre de la gaine verticale, entre les axes des gaines horizontales */}
          {L_draw > 20 && (<>
            <line x1={vx(cx - 8)} y1={vy(w / 2)} x2={vx(cx + 8)} y2={vy(w / 2)}
              stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(cx - 8)} y1={vy(L_draw + w / 2)} x2={vx(cx + 8)} y2={vy(L_draw + w / 2)}
              stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
            <line x1={vx(cx)} y1={vy(w / 2)} x2={vx(cx)} y2={vy(L_draw + w / 2)}
              stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
          </>)}
          {L_draw > 5 && (
            <text x={+(vx(cx) + 16).toFixed(1)} y={vy((L_draw + w) / 2)} fontSize="13" fill="#64748b"
              textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
              paintOrder="stroke" stroke="white" strokeWidth="5"
              transform={`rotate(-90, ${+(vx(cx) + 16).toFixed(1)}, ${vy((L_draw + w) / 2)})`}>
              {`l = ${Math.round(lOverH * a0_mm)} mm`}
            </text>
          )}

          {/* Annotation L ou H — gaine d'entrée (haut), à gauche en dehors */}
          <line x1={vx(x_start - 8)}  y1={vy(0)} x2={vx(x_start - 20)} y2={vy(0)}
            stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(x_start - 8)}  y1={vy(w)} x2={vx(x_start - 20)} y2={vy(w)}
            stroke="#64748b" strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(x_start - 14)} y1={vy(0)} x2={vx(x_start - 14)} y2={vy(w)}
            stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
          <text x={+(vx(x_start - 14) - 16).toFixed(1)} y={vy(w / 2)} fontSize="13" fill="#64748b"
            textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
            paintOrder="stroke" stroke="white" strokeWidth="4"
            transform={`rotate(-90, ${+(vx(x_start - 14) - 16).toFixed(1)}, ${vy(w / 2)})`}>{dimLbl}</text>
        </>}
      </svg>
    </div>
  )
}

// ── Schéma ASHRAE 3-12 — Coudes 90° plans croisés (construction itérative) ───

function SchemaRect312({ mini, orientation = 'horizontal', l_mm, h_mm, lOverW = 1.0 }: {
  mini?: boolean
  orientation?: 'horizontal' | 'vertical'
  l_mm?: number | null
  h_mm?: number | null
  lOverW?: number
}) {
  // Profondeur proportionnelle à √(b0/a0) : visuellement cohérente sans distorsion
  // dep_ref=35 pour une gaine carrée (ratio=1), varie entre ~18 et ~70 pour ratio [0.25, 4]
  const a0    = orientation === 'vertical' ? (h_mm ?? 300) : (l_mm ?? 300)
  const b0    = orientation === 'vertical' ? (l_mm ?? 200) : (h_mm ?? 200)
  const ratio = a0 > 0 ? b0 / a0 : 1
  const w     = 75
  // dep tel que longueur visuelle diagonale = ratio × w × scl (proportionnel à b0/a0)
  const dep   = Math.max(12, Math.min(150, Math.round(ratio * w / Math.SQRT2)))

  const arm_h = w   // = L (ou H) : même longueur que la face
  const lOverW_vis = Math.min(lOverW, 3)  // plafond visuel à 3, texte garde la vraie valeur
  // arm_v = (lOverW_vis + ratio)*w : la paroi gauche visible (P6→P1e) vaut lOverW_vis*w ∝ l
  const arm_v = Math.max(w * 0.3, (lOverW_vis + ratio) * w)

  const VW = 500, VH = 420, M = 16
  const annRectRight = mini ? 0 : 36   // espace pour l'annotation à droite du rectangle
  const scl = Math.min((VW - 2*M - annRectRight) / (dep + arm_h + w + w / Math.SQRT2), (VH - 2*M) / (dep + arm_v + w))
  const tx  = M + ((VW - 2*M) - (dep + arm_h + w + w / Math.SQRT2) * scl) / 2 + dep * scl
  const ty  = M + ((VH - 2*M) - (dep + arm_v + w) * scl) / 2 + (dep + arm_v) * scl
  const vx  = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy  = (wy: number) => +(ty + wy * scl).toFixed(1)
  const sw  = mini ? +(10 / scl).toFixed(2) : '3'

  const dd = +(dep * scl).toFixed(1)

  const P1: [number, number] = [vx(arm_h),     vy(-arm_v)]
  const P2: [number, number] = [vx(arm_h + w), vy(-arm_v)]
  const P3: [number, number] = [vx(arm_h + w), vy(w)]
  const P4: [number, number] = [vx(0),         vy(w)]
  const P5: [number, number] = [vx(0),         vy(0)]
  const P6: [number, number] = [vx(arm_h),     vy(0)]

  const bk = ([x, y]: [number, number]): [number, number] => [+(x - dd).toFixed(1), +(y - dd).toFixed(1)]
  const P1b = bk(P1), P2b = bk(P2), P3b = bk(P3), P4b = bk(P4), P5b = bk(P5), P6b = bk(P6)

  // Deuxième tronçon : diagonale symétrique vers le bas-droite depuis P1/P2, puis verticales
  const diagLen = +(ratio * w * scl).toFixed(1)
  const fwdStep = +(w * scl / Math.SQRT2).toFixed(1)
  const P1c: [number, number] = [+(P1[0] + fwdStep).toFixed(1), +(P1[1] + fwdStep).toFixed(1)]
  const P2c: [number, number] = [+(P2[0] + fwdStep).toFixed(1), +(P2[1] + fwdStep).toFixed(1)]
  const P1cd: [number, number] = [P1c[0], +(P1c[1] + diagLen).toFixed(1)]
  const P2cd: [number, number] = [P2c[0], +(P2c[1] + diagLen).toFixed(1)]
  // Diagonale remontant vers la gauche depuis P1cd jusqu'à la paroi verticale gauche de la gaine
  const P1e: [number, number] = [P1[0], +(P1[1] + diagLen).toFixed(1)]
  // Intersection de l'horizontale P1c→P2c avec le mur droit de la gaine (x=P2[0])
  const P2x: [number, number] = [P2[0], P1c[1]]
  // Intersection de l'horizontale P1cd→P2cd avec le mur droit de la gaine (x=P2[0])
  const P2y: [number, number] = [P2[0], P1cd[1]]

  const pathD = [
    `M ${P1[0]} ${P1[1]}`,
    `L ${P2[0]} ${P2[1]}`,
    `L ${P3[0]} ${P3[1]}`,
    `L ${vx(0)} ${vy(w)}`,
    `L ${P5[0]} ${P5[1]}`,
    `L ${P6[0]} ${P6[1]}`,
    'Z',
  ].join(' ')

  const str = '#374151'
  const ann = '#64748b'
  const seg = (a: [number,number], b: [number,number]) =>
    <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={str} strokeWidth={sw} strokeLinecap="round" />

  // Labels : face (L ou H visible) et profondeur (H ou L en diagonal)
  const faceLbl  = orientation === 'horizontal'
    ? (l_mm != null ? `L = ${l_mm} mm` : 'L')
    : (h_mm != null ? `H = ${h_mm} mm` : 'H')
  const depthLbl = orientation === 'horizontal'
    ? (h_mm != null ? `H = ${h_mm} mm` : 'H')
    : (l_mm != null ? `L = ${l_mm} mm` : 'L')

  // — Annotation face — à droite du mur gauche (x = 0), même style que les autres coudes
  const xF0 = vx(6)    // tick intérieur
  const xF1 = vx(18)   // tick extérieur
  const xFL = vx(12)   // trait de cote vertical
  const xFT = +(xFL + 16).toFixed(1)   // texte à 14 px du trait de cote
  const yF0 = vy(0)
  const yFm = vy(w / 2)
  const yFw = vy(w)

  // — Annotation profondeur — à droite de la diagonale P4→P4b (coin bas-gauche)
  // Direction perpendiculaire vers le haut-droit : (+1/√2, −1/√2) en SVG
  const d45 = 1 / Math.SQRT2
  const dp = (pt: [number,number], o: number): [number,number] =>
    [+(pt[0] + o * d45).toFixed(1), +(pt[1] - o * d45).toFixed(1)]

  const dTi0 = dp(P5,  4);  const dTi1 = dp(P5b,  4)
  const dTo0 = dp(P5, 16);  const dTo1 = dp(P5b, 16)
  const dL0  = dp(P5, 10);  const dL1  = dp(P5b, 10)
  const dTmx = +((P5[0] + P5b[0]) / 2 + 26 * d45).toFixed(1)
  const dTmy = +((P5[1] + P5b[1]) / 2 - 26 * d45).toFixed(1)

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">

        {/* Remplissages gris des faces latérales visibles (avant tous les traits) */}
        <polygon points={`${P1[0]},${P1[1]} ${P2[0]},${P2[1]} ${P2b[0]},${P2b[1]} ${P1b[0]},${P1b[1]}`} fill="#f1f5f9" stroke="none" />
        <polygon points={`${P1b[0]},${P1b[1]} ${P2b[0]},${P2b[1]} ${P2c[0]},${P2c[1]} ${P1c[0]},${P1c[1]}`} fill="#f1f5f9" stroke="none" />
        <polygon points={`${P5[0]},${P5[1]} ${P6[0]},${P6[1]} ${P6b[0]},${P6b[1]} ${P5b[0]},${P5b[1]}`} fill="#f1f5f9" stroke="none" />
        <polygon points={`${P4[0]},${P4[1]} ${P5[0]},${P5[1]} ${P5b[0]},${P5b[1]} ${P4b[0]},${P4b[1]}`} fill="#f1f5f9" stroke="none" />
        <polygon points={`${P6[0]},${P6[1]} ${P1[0]},${P1[1]} ${P1b[0]},${P1b[1]} ${P6b[0]},${P6b[1]}`} fill="#f1f5f9" stroke="none" />

        {/* Segments obliques 45° haut-gauche depuis chaque coin */}
        {seg(P1, P1b)} {seg(P2, P2b)} {seg(P3, P3b)} {seg(P4, P4b)} {seg(P5, P5b)} {seg(P6, P6b)}

        {/* Arêtes arrière du tronçon principal */}
        {seg(P1b, P2b)}
        {seg(P5b, P6b)}
        {seg(P4b, P5b)}
        {seg(P1b, P6b)}

        {/* Forme L — fill seulement ; arêtes dessinées séparément sauf P1→P2 */}
        <path d={pathD} fill="#f1f5f9" stroke="none" />
        <line x1={P2y[0]} y1={P2y[1]} x2={P3[0]} y2={P3[1]} stroke={str} strokeWidth={sw} strokeLinecap="round" />
        <line x1={P3[0]} y1={P3[1]} x2={P4[0]} y2={P4[1]} stroke={str} strokeWidth={sw} strokeLinecap="round" />
        <line x1={P4[0]} y1={P4[1]} x2={P5[0]} y2={P5[1]} stroke={str} strokeWidth={sw} strokeLinecap="round" />
        <line x1={P5[0]} y1={P5[1]} x2={P6[0]} y2={P6[1]} stroke={str} strokeWidth={sw} strokeLinecap="round" />
        <line x1={P6[0]} y1={P6[1]} x2={P1e[0]} y2={P1e[1]} stroke={str} strokeWidth={sw} strokeLinecap="round" />

        {/* Remplissage gris du second tronçon (rectangle P1c→P2c→P2cd→P1cd) */}
        <polygon points={`${P1c[0]},${P1c[1]} ${P2c[0]},${P2c[1]} ${P2cd[0]},${P2cd[1]} ${P1cd[0]},${P1cd[1]}`} fill="#f1f5f9" stroke="none" />

        {/* Diagonales bas-droite depuis P1/P2 + horizontale du haut + verticales + horizontale du bas */}
        {seg(P1, P1c)}
        {seg(P2, P2c)}
        {seg(P1c, P2c)}
        {seg(P1c, P1cd)}
        {seg(P2c, P2cd)}
        {seg(P1cd, P2cd)}
        {seg(P1cd, P1e)}

        {!mini && <>
          {/* Annotation l — bas au milieu de P6→P6b (diagonale oblique au coin intérieur du coude) */}
          {lOverW > 0.05 && (() => {
            const annSpan = P6[1] - P1e[1]  // = lOverW*w*scl
            const annBot  = +((P6[1] + P6b[1]) / 2).toFixed(1)
            const annTop  = +(+annBot - annSpan).toFixed(1)
            const annMid  = +((+annTop + +annBot) / 2).toFixed(1)
            const ax      = +((P6[0] + P6b[0]) / 2).toFixed(1)  // milieu x de P6→P6b
            return (<>
              <line x1={+(ax - 8).toFixed(1)} y1={annTop} x2={+(ax + 8).toFixed(1)} y2={annTop} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
              <line x1={+(ax - 8).toFixed(1)} y1={annBot} x2={+(ax + 8).toFixed(1)} y2={annBot} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
              <line x1={ax}                   y1={annTop} x2={ax}                   y2={annBot} stroke={ann} strokeWidth="1"   strokeLinecap="round" />
              {annSpan > 20 && (
                <text x={+(ax - 14).toFixed(1)} y={annMid} fontSize="12" fill={ann} fontStyle="italic"
                  textAnchor="middle" dominantBaseline="middle"
                  paintOrder="stroke" stroke="white" strokeWidth="4"
                  transform={`rotate(-90, ${+(ax - 14).toFixed(1)}, ${annMid})`}>
                  {`l = ${Math.round(lOverW * a0)} mm`}
                </text>
              )}
            </>)
          })()}

          {/* Annotation face (L ou H) — à droite du mur gauche (x=0), hauteur y=0..w */}
          <line x1={xF0} y1={yF0} x2={xF1} y2={yF0} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={xF0} y1={yFw} x2={xF1} y2={yFw} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={xFL} y1={yF0} x2={xFL} y2={yFw} stroke={ann} strokeWidth="1"   strokeLinecap="round" />
          <text x={xFT} y={yFm} fontSize="12" fill={ann} fontStyle="italic"
            textAnchor="middle" dominantBaseline="middle"
            paintOrder="stroke" stroke="white" strokeWidth="4"
            transform={`rotate(-90, ${xFT}, ${yFm})`}>
            {faceLbl}
          </text>

          {/* Annotation profondeur (H ou L) — à droite de la diagonale P4→P4b */}
          <line x1={dTi0[0]} y1={dTi0[1]} x2={dTo0[0]} y2={dTo0[1]} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={dTi1[0]} y1={dTi1[1]} x2={dTo1[0]} y2={dTo1[1]} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={dL0[0]}  y1={dL0[1]}  x2={dL1[0]}  y2={dL1[1]}  stroke={ann} strokeWidth="1"   strokeLinecap="round" />
          <text x={dTmx} y={dTmy} fontSize="12" fill={ann} fontStyle="italic"
            textAnchor="middle" dominantBaseline="middle"
            paintOrder="stroke" stroke="white" strokeWidth="4"
            transform={`rotate(-45, ${dTmx}, ${dTmy})`}>
            {depthLbl}
          </text>

          {/* Annotation face (L ou H) — en haut du rectangle (P1c→P2c) */}
          <line x1={P1c[0]} y1={+(P1c[1]-6).toFixed(1)}  x2={P1c[0]} y2={+(P1c[1]-18).toFixed(1)} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={P2c[0]} y1={+(P1c[1]-6).toFixed(1)}  x2={P2c[0]} y2={+(P1c[1]-18).toFixed(1)} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={P1c[0]} y1={+(P1c[1]-12).toFixed(1)} x2={P2c[0]} y2={+(P1c[1]-12).toFixed(1)} stroke={ann} strokeWidth="1"   strokeLinecap="round" />
          <text x={+((P1c[0]+P2c[0])/2).toFixed(1)} y={+(P1c[1]-28).toFixed(1)}
            fontSize="12" fill={ann} fontStyle="italic"
            textAnchor="middle" dominantBaseline="middle"
            paintOrder="stroke" stroke="white" strokeWidth="4">
            {faceLbl}
          </text>

          {/* Annotation profondeur (H ou L) — à droite du rectangle (P2c→P2cd) */}
          {diagLen > 12 && (<>
            <line x1={+(P2c[0]+6).toFixed(1)}  y1={P2c[1]}  x2={+(P2c[0]+18).toFixed(1)} y2={P2c[1]}  stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
            <line x1={+(P2c[0]+6).toFixed(1)}  y1={P2cd[1]} x2={+(P2c[0]+18).toFixed(1)} y2={P2cd[1]} stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
            <line x1={+(P2c[0]+12).toFixed(1)} y1={P2c[1]}  x2={+(P2c[0]+12).toFixed(1)} y2={P2cd[1]} stroke={ann} strokeWidth="1"   strokeLinecap="round" />
            <text x={+(P2c[0]+28).toFixed(1)} y={+((P2c[1]+P2cd[1])/2).toFixed(1)}
              fontSize="12" fill={ann} fontStyle="italic"
              textAnchor="middle" dominantBaseline="middle"
              paintOrder="stroke" stroke="white" strokeWidth="4"
              transform={`rotate(-90, ${+(P2c[0]+28).toFixed(1)}, ${+((P2c[1]+P2cd[1])/2).toFixed(1)})`}>
              {depthLbl}
            </text>
          </>)}
        </>}
      </svg>
    </div>
  )
}

// ── Schéma ASHRAE 3-15 — 4 coudes 45° lisses, contournement d'obstacle ───────
// Vue de côté à plat (SMACNA 1981, Table 6-14K). Géométrie imposée : r/H = 1,5
// et L = 1,5·H, H étant la dimension de gaine dans le plan du dessin. Comme pour
// les autres schémas rectangulaires, le tracé est nominal : seules les cotes
// portent les valeurs réelles du tronçon.

function SchemaRect315({ mini, h_mm }: {
  mini?: boolean
  h_mm?: number | null
}) {
  const f = (v: number) => +v.toFixed(1)
  const k = Math.SQRT1_2                  // cos 45° = sin 45°

  // ── Géométrie en unités monde ──
  const H    = 80                         // gaine dans le plan du dessin
  const rc   = 1.5 * H                    // rayon d'axe (r/H = 1,5)
  const Ro   = rc + H / 2                 // paroi extérieure
  const Ri   = rc - H / 2                 // paroi intérieure
  const Loff = 1.5 * H                    // décalage (L = 1,5·H)
  // Deux coudes 45° accolés ne décalent que de 2·rc·(1−cos45°) ≈ 0,88·H : il faut
  // un droit incliné entre eux pour atteindre L = 1,5·H.
  const s    = (Loff - 2 * rc * (1 - k)) / k
  // Tronçon central : 12 in ramenés à l'échelle du dessin via la hauteur réelle,
  // pour que sa longueur reste proportionnelle au reste. Repli nominal sans cote.
  const IN12 = 304.8
  const L12  = h_mm != null && h_mm > 0 ? H * IN12 / h_mm : 1.25 * H
  const arm  = 1.0 * H                    // amorces entrée / sortie

  // Centres des quatre coudes : 1 et 4 en dessous (virage vers le bas puis
  // redressement), 2 et 3 au-dessus.
  const c1x = arm,                 c1y = rc
  const c2x = c1x + 2*rc*k + s*k,  c2y = Loff - rc
  const c3x = c2x + L12,           c3y = c2y
  const c4x = c3x + 2*rc*k + s*k,  c4y = rc
  const xEnd = c4x + arm

  // ── Cadrage ──
  // Le libellé H est décalé en unités viewBox (16 px + demi-corps) : cette réserve
  // doit être convertie en unités monde, sinon elle rétrécit avec l'échelle et le
  // texte mord sur la marge.
  const annL = mini ? 0 : 70, annR = mini ? 0 : 14, annB = mini ? 0 : 70
  const yTop = -H / 2, yBot = Loff + H / 2
  const contentW = annL + xEnd + annR
  const contentH = (yBot - yTop) + annB
  // Silhouette très plate (≈ 3,5:1) : dans un cadre presque carré elle n'occuperait
  // qu'un quart de la hauteur. Cadre raccourci, le cadrage reste limité par la largeur.
  const VW = 500, VH = 250, M = 16
  const scl = Math.min((VW - 2*M) / contentW, (VH - 2*M) / contentH)
  const tx  = M + ((VW - 2*M) - contentW * scl) / 2 + annL * scl
  const ty  = M + ((VH - 2*M) - contentH * scl) / 2 - yTop * scl
  const vx  = (wx: number) => +(tx + wx * scl).toFixed(1)
  const vy  = (wy: number) => +(ty + wy * scl).toFixed(1)
  const P   = (px: number, py: number) => `${vx(px)} ${vy(py)}`
  const RO  = f(Ro * scl), RI = f(Ri * scl)
  // Tracé en coordonnées finales → épaisseur proportionnelle à la gaine dessinée
  const sw  = mini ? f(0.13 * H * scl) : 3

  // Paroi supérieure, de gauche à droite. Aux coudes 1 et 4 (centre en dessous)
  // elle est extérieure ; aux coudes 2 et 3 (centre au-dessus) elle est intérieure.
  const up = [
    `M ${P(0, -H/2)}`,
    `L ${P(c1x, -H/2)}`,
    `A ${RO} ${RO} 0 0 1 ${P(c1x + Ro*k, c1y - Ro*k)}`,
    `L ${P(c1x + Ro*k + s*k, c1y - Ro*k + s*k)}`,
    `A ${RI} ${RI} 0 0 0 ${P(c2x, c2y + Ri)}`,
    `L ${P(c3x, c3y + Ri)}`,
    `A ${RI} ${RI} 0 0 0 ${P(c3x + Ri*k, c3y + Ri*k)}`,
    `L ${P(c3x + Ri*k + s*k, c3y + Ri*k - s*k)}`,
    `A ${RO} ${RO} 0 0 1 ${P(c4x, c4y - Ro)}`,
    `L ${P(xEnd, -H/2)}`,
  ]
  // Paroi inférieure, de droite à gauche (rôles intérieur / extérieur inversés)
  const dn = [
    `L ${P(xEnd, H/2)}`,
    `L ${P(c4x, c4y - Ri)}`,
    `A ${RI} ${RI} 0 0 0 ${P(c4x - Ri*k, c4y - Ri*k)}`,
    `L ${P(c4x - Ri*k - s*k, c4y - Ri*k + s*k)}`,
    `A ${RO} ${RO} 0 0 1 ${P(c3x, c3y + Ro)}`,
    `L ${P(c2x, c2y + Ro)}`,
    `A ${RO} ${RO} 0 0 1 ${P(c2x - Ro*k, c2y + Ro*k)}`,
    `L ${P(c2x - Ro*k - s*k, c2y + Ro*k - s*k)}`,
    `A ${RI} ${RI} 0 0 0 ${P(c1x, c1y - Ri)}`,
    `L ${P(0, H/2)}`,
    'Z',
  ]
  const pathD = [...up, ...dn].join(' ')

  // Le H d'ASHRAE est le petit côté : la configuration impose W = 4·H, donc avec
  // largeur = 4 × hauteur c'est la hauteur. r et le décalage en découlent tous deux
  // (r/H = 1,5 et L = 1,5·H) — ils ne se déduisent pas de la largeur.
  const dimLbl = h_mm != null ? `H = ${h_mm} mm` : 'H'
  const offLbl = h_mm != null ? `L = ${Math.round(1.5 * h_mm)} mm` : 'L'
  const rLbl   = h_mm != null ? `r = ${Math.round(1.5 * h_mm)} mm` : 'r'

  // Ligne de rayon : du centre du coude 1 vers le milieu de l'arc d'axe (22,5°)
  const a225 = Math.PI / 8
  const pmx  = c1x + rc * Math.sin(a225), pmy = c1y - rc * Math.cos(a225)
  // Libellé décalé perpendiculairement à la ligne de rayon, côté espace libre
  const rlx  = (c1x + pmx) / 2 - 20 * Math.cos(a225)
  const rly  = (c1y + pmy) / 2 - 20 * Math.sin(a225)
  // Flèche au bout du segment, comme sur le coude à aubes séparatrices : deux
  // barbes à ±30° du vecteur bout → centre. Longueur en unités du viewBox, donc
  // calculée après projection pour ne pas subir l'échelle du dessin.
  const gnx = -Math.sin(a225), gny = Math.cos(a225)
  const aa = Math.PI / 6, aw = 8
  const pmxV = vx(pmx), pmyV = vy(pmy)
  const arr1x = +(pmxV + aw * (gnx * Math.cos(aa)  - gny * Math.sin(aa))).toFixed(1)
  const arr1y = +(pmyV + aw * (gnx * Math.sin(aa)  + gny * Math.cos(aa))).toFixed(1)
  const arr2x = +(pmxV + aw * (gnx * Math.cos(-aa) - gny * Math.sin(-aa))).toFixed(1)
  const arr2y = +(pmyV + aw * (gnx * Math.sin(-aa) + gny * Math.cos(-aa))).toFixed(1)

  const ann = '#64748b'
  const yDim = yBot + 22                   // cote 12 in, sous le tronçon central
  const xDim = -14                         // cote de gaine, à gauche de l'entrée
  // Cote du décalage : entre la paroi haute de chaque gaine, au milieu du schéma.
  // L'écart y vaut L, les deux parois étant décalées de la même quantité.
  const xMid = xEnd / 2
  const yUp  = -H / 2                      // paroi haute de la gaine du haut
  const yLo  = Loff - H / 2                // paroi haute de la gaine du bas

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
        <path d={pathD} fill="#f1f5f9" stroke="#374151" strokeWidth={sw}
          strokeLinejoin="round" strokeLinecap="round" />

        {!mini && <>
          {/* Cote du décalage l — paroi haute de la gaine du haut → paroi haute de
              la gaine du bas, au milieu du schéma. Le niveau haut est prolongé en
              pointillé depuis le point où la paroi quitte l'horizontale. */}
          <line x1={vx(c1x)} y1={vy(yUp)} x2={vx(xMid + 30)} y2={vy(yUp)}
            stroke="#94a3b8" strokeWidth="1" strokeDasharray="6 4" strokeLinecap="round" />
          <line x1={vx(xMid)} y1={vy(yUp)} x2={vx(xMid)} y2={vy(yLo)}
            stroke={ann} strokeWidth="1" strokeLinecap="round" />
          <line x1={vx(xMid - 7)} y1={vy(yUp)} x2={vx(xMid + 7)} y2={vy(yUp)}
            stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(xMid - 7)} y1={vy(yLo)} x2={vx(xMid + 7)} y2={vy(yLo)}
            stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <text x={+(vx(xMid) + 15).toFixed(1)} y={vy((yUp + yLo) / 2)} fontSize="13" fill={ann}
            textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
            paintOrder="stroke" stroke="white" strokeWidth="4"
            transform={`rotate(-90, ${+(vx(xMid) + 15).toFixed(1)}, ${vy((yUp + yLo) / 2)})`}>{offLbl}</text>

          {/* Cote de gaine (L ou H) — à droite de la sortie */}
          <line x1={vx(-6)} y1={vy(-H/2)} x2={vx(-22)} y2={vy(-H/2)}
            stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(-6)} y1={vy(H/2)}  x2={vx(-22)} y2={vy(H/2)}
            stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(xDim)} y1={vy(-H/2)} x2={vx(xDim)} y2={vy(H/2)}
            stroke={ann} strokeWidth="1" strokeLinecap="round" />
          <text x={+(vx(xDim) - 16).toFixed(1)} y={vy(0)} fontSize="13" fill={ann}
            textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
            paintOrder="stroke" stroke="white" strokeWidth="4"
            transform={`rotate(-90, ${+(vx(xDim) - 16).toFixed(1)}, ${vy(0)})`}>{dimLbl}</text>

          {/* Rayon r — sur le premier coude */}
          <circle cx={vx(c1x)} cy={vy(c1y)} r="2" fill={ann} />
          <line x1={vx(c1x)} y1={vy(c1y)} x2={vx(pmx)} y2={vy(pmy)}
            stroke={ann} strokeWidth="1" strokeLinecap="round" />
          <line x1={pmxV} y1={pmyV} x2={arr1x} y2={arr1y}
            stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={pmxV} y1={pmyV} x2={arr2x} y2={arr2y}
            stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <text x={vx(rlx)} y={vy(rly)} fontSize="13" fill={ann}
            textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
            paintOrder="stroke" stroke="white" strokeWidth="4">{rLbl}</text>


          {/* Cote 12 in — tronçon central, sous la paroi inférieure */}
          <line x1={vx(c2x)} y1={vy(yBot + 6)} x2={vx(c2x)} y2={vy(yDim + 6)}
            stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(c3x)} y1={vy(yBot + 6)} x2={vx(c3x)} y2={vy(yDim + 6)}
            stroke={ann} strokeWidth="1.5" strokeLinecap="round" />
          <line x1={vx(c2x)} y1={vy(yDim)} x2={vx(c3x)} y2={vy(yDim)}
            stroke={ann} strokeWidth="1" strokeLinecap="round" />
          <text x={vx((c2x + c3x) / 2)} y={+(vy(yDim + 6) + 14).toFixed(1)} fontSize="13" fill={ann}
            textAnchor="middle" dominantBaseline="middle" fontStyle="italic"
            paintOrder="stroke" stroke="white" strokeWidth="4">{Math.round(IN12)} mm</text>

          {/* Relations imposées par la configuration ASHRAE */}
          <text x={VW / 2} y={VH - 12} fontSize="11" fill="#64748b"
            textAnchor="middle" dominantBaseline="middle" fontStyle="italic">W/H = 4 · r/H = 1,5 · L = 1,5·H</text>
        </>}
      </svg>
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
  'coude-z':          ['Dévoi. en Z', '(2×30°)'],
  'coude-s':          ['Dévoi. en S', '(col de cygne)'],
  'coude-3-14':       ['Dévoi. en S', '2 plans (3-14)'],
  'rect-rayon-lisse': ['Coude', 'rayon lisse'],
  'rect-onglet':      ['Coude', 'à onglet'],
  'rect-aubes':        ['Coude aubes', 'séparatrices'],
  'rect-onglet-aubes': ['Coude onglet', 'avec aubes'],
  'rect-z':            ['Dévoi. en Z', '(2×90°)'],
  'rect-3-12':         ['Coudes 90°', 'plans croisés'],
  'rect-s':            ['Dévoi. en S', '(col de cygne)'],
  'rect-3-14':         ['Dévoi. en S', '2 plans perp.'],
  'rect-3-15':         ['4 coudes 45°', 'contournement'],
}

function TypeCard({ type, selected, onClick, orientation = 'horizontal', l_mm, h_mm }: TypeCardProps) {
  const miniSchemas: Record<SingularityType, ReactElement> = {
    'coude-lisse':       <SchemaCoudeLisse angle={90} rOverD={1.5} mini />,
    'coude-segmente':   <SchemaCoudeSegmente angle={90} nPieces={3} mini />,
    'coude-onglet':     <SchemaCoudeOnglet angle={90} mini />,
    'coude-z':          <SchemaCoudeZ mini />,
    'coude-s':          <SchemaCoudeS mini lOverDs={1} rOverDs={1} />,
    'coude-3-14':       <SchemaCoude314 mini lOverDs={1} rOverDs={1} />,
    'rect-rayon-lisse': <SchemaRectRayonLisse angle={90} orientation="horizontal" mini />,
    'rect-onglet':      <SchemaRectOnglet angle={90} orientation="horizontal" mini />,
    'rect-aubes':        <SchemaRectAubes angle={90} orientation="horizontal" rOverB={1.0} nVanes={1} mini />,
    'rect-onglet-aubes': <SchemaRectOngletAubes angle={90} orientation="horizontal" l_mm={300} vaneThickness="simple" design38={2} mini />,
    'rect-z':            <SchemaRectZ orientation="horizontal" l_mm={300} h_mm={200} lOverH={1.0} mini />,
    'rect-3-12':         <SchemaRect312 mini orientation="horizontal" l_mm={300} h_mm={200} lOverW={2.0} />,
    'rect-s':            <SchemaCoudeRectS mini lOverDs={1} rOverWs={1.0} l_mm={400} h_mm={200} orientation="vertical" />,
    'rect-3-14':         <SchemaRect314 mini theta_s={90} lOverDs={1} rOverWs={1.0} l_mm={400} h_mm={250} orientation="horizontal" />,
    'rect-3-15':         <SchemaRect315 mini h_mm={250} />,
  }
  return (
    <button onClick={onClick} title={FULL_LABELS[type].join(' ')} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '7px 5px 7px',
      border: `1.5px solid ${selected ? '#2563eb' : '#e2e8f0'}`,
      borderRadius: 8,
      background: selected ? '#eff6ff' : '#f8fafc',
      cursor: 'pointer', transition: 'all 0.12s',
      boxShadow: selected ? '0 0 0 3px #2563eb22' : 'none',
    }}>
      <div style={{ width: '100%', height: 58 }}>
        {miniSchemas[type]}
      </div>
      <span style={{
        fontSize: 9, fontWeight: selected ? 700 : 500,
        color: selected ? '#1d4ed8' : '#64748b',
        textAlign: 'center', whiteSpace: 'nowrap', overflow: 'hidden',
        textOverflow: 'ellipsis', width: '100%', display: 'block',
      }}>
        {FULL_LABELS[type].join(' ')}
      </span>
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

const CIRC_SIMPLE:  SingularityType[] = ['coude-lisse', 'coude-segmente', 'coude-onglet']
const CIRC_COMPOSE: SingularityType[] = ['coude-z', 'coude-s', 'coude-3-14']
const CIRC_TYPES:   SingularityType[] = [...CIRC_SIMPLE, ...CIRC_COMPOSE]
const RECT_SIMPLE:  SingularityType[] = ['rect-rayon-lisse', 'rect-onglet', 'rect-aubes', 'rect-onglet-aubes']
const RECT_COMPOSE: SingularityType[] = ['rect-z', 'rect-3-12', 'rect-s', 'rect-3-14', 'rect-3-15']
const RECT_TYPES:   SingularityType[] = [...RECT_SIMPLE, ...RECT_COMPOSE]

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
  const [lOverH_ratio,  setLOverH_ratio]  = useState<number>(1.0)
  const [lOverW_ratio,  setLOverW_ratio]  = useState<number>(1.0)
  const [thetaS,        setThetaS]        = useState<number>(90)
  const [lOverDS,       setLOverDS]       = useState<number>(1)
  const [elbowTypeS,    setElbowTypeS]    = useState<'lisse' | 'segmente'>('lisse')
  const [rOverDs,       setROverDs]       = useState<number>(1.0)
  const [nPiecesS,      setNPiecesS]      = useState<3 | 4 | 5>(3)
  const [rOverWs,       setROverWs]       = useState<number>(1.0)
  const [lDistSmm,      setLDistSmm]      = useState<number>(500)
  const [coudeCategory, setCoudeCategory] = useState<'simple' | 'compose'>('simple')
  const [mounted,       setMounted]       = useState(false)

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => setMounted(true))
    else setMounted(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    if (editing) {
      const isCompose = CIRC_COMPOSE.includes(editing.type) || RECT_COMPOSE.includes(editing.type)
      setCoudeCategory(isCompose ? 'compose' : 'simple')
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
      setLOverH_ratio(editing.lOverH ?? (editing.offset_mm != null && (editing.l_mm ?? 300) > 0 ? editing.offset_mm / (editing.l_mm ?? 300) : 1.0))
      setLOverW_ratio(editing.lOverW ?? 1.0)
      setThetaS(editing.theta_s ?? 90)
      setLOverDS(editing.lOverD_s ?? (() => {
        if (editing.lDistS_mm != null && editing.l_mm != null && editing.h_mm != null) {
          const Dhyd = (2 * editing.l_mm * editing.h_mm) / (editing.l_mm + editing.h_mm)
          return Dhyd > 0 ? Math.round(editing.lDistS_mm / Dhyd * 100) / 100 : 1
        }
        return 1
      })())
      setElbowTypeS(editing.elbowTypeS ?? 'lisse')
      setROverDs(editing.rOverDs ?? 1.0)
      setNPiecesS((editing.nPiecesS ?? 3) as 3 | 4 | 5)
      setROverWs(editing.rOverWs ?? 1.0)
      setLDistSmm(editing.lDistS_mm ?? 500)
    } else {
      setCoudeCategory('simple')
      setSelType(null); setAngle(90); setROverD(1.5); setNPieces(3)
      setTypeAubes('simple'); setNVanes(1); setOrientation('horizontal'); setROverA(1.5); setROverB(0.70); setLOverD(1.5)
      setVaneThickness('simple'); setDesign38(1); setDesign39(1); setLOverH_ratio(1.0); setLOverW_ratio(1.0)
    }
  }, [isOpen, editing])

  if (!isOpen) return null

  const ANGLE_MAX_90: SingularityType[] = ['rect-onglet', 'coude-onglet']
  const ANGLE_MIN_20: SingularityType[] = ['rect-onglet', 'coude-onglet']
  const angleMax = selType && ANGLE_MAX_90.includes(selType) ? 90 : 180
  const angleMin = selType && ANGLE_MIN_20.includes(selType) ? 20 : 1

  const isRectMode = ductShape === 'rectangular'
  // ASHRAE 3-15 n'est tabulé que pour W/H = 4, soit largeur = 4 × hauteur : hors de
  // cette configuration le coefficient ne s'applique pas, on ne propose pas le type.
  // Tolérance d'un demi-millimètre, uniquement contre le bruit de représentation.
  const is4to1 = l_mm != null && h_mm != null && h_mm > 0 && Math.abs(l_mm - 4 * h_mm) < 0.5
  const activeTypes = (isRectMode
    ? (coudeCategory === 'simple' ? RECT_SIMPLE : RECT_COMPOSE)
    : (coudeCategory === 'simple' ? CIRC_SIMPLE : CIRC_COMPOSE)
  ).filter(t => t !== 'rect-3-15' || is4to1 || selType === 'rect-3-15')

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
    vaneThickness, design38, design39, lOverH: lOverH_ratio, lOverW: lOverW_ratio,
    theta_s: thetaS, lOverD_s: lOverDS,
    elbowTypeS, rOverDs, nPiecesS, rOverWs, lDistS_mm: lDistSmm,
  } : null
  const xiParts = singObj ? computeXiSingularityFull(singObj, lambda, Re_duct ?? undefined, di_mm ?? undefined, v_ms) : null
  const xi      = xiParts?.ksi_total ?? null
  const dp      = xi != null && dynPressure != null ? xi * dynPressure : null

  const handleSave = () => {
    if (!selType) return
    onSave({
      id: editing?.id ?? newSingId(), type: selType,
      angle: selType === 'coude-z' ? 30 : selType === 'rect-3-15' ? 45 : selType === 'rect-onglet-aubes' || selType === 'rect-z' || selType === 'rect-3-12' ? 90 : selType === 'coude-s' || selType === 'rect-s' || selType === 'coude-3-14' || selType === 'rect-3-14' ? thetaS : angle,
      ...(selType === 'coude-lisse'      ? { rOverD }           : {}),
      ...(selType === 'coude-segmente'   ? { nPieces, rOverD }  : {}),
      ...(selType === 'coude-z'          ? { lOverD }           : {}),
      ...(selType === 'rect-rayon-lisse' ? { orientation, rOverA, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-onglet'       ? { orientation, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-aubes'        ? { orientation, nVanes, rOverB, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-onglet-aubes' ? { orientation, vaneThickness, design38, design39, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-z'            ? { orientation, lOverH: lOverH_ratio, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-3-12'         ? { orientation, lOverW: lOverW_ratio, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'coude-s'           ? { theta_s: thetaS, lOverD_s: lOverDS, rOverDs, elbowTypeS, ...(elbowTypeS === 'segmente' ? { nPiecesS } : {}) } : {}),
      ...(selType === 'coude-3-14'        ? { theta_s: thetaS, lOverD_s: lOverDS, rOverDs, elbowTypeS, ...(elbowTypeS === 'segmente' ? { nPiecesS } : {}) } : {}),
      ...(selType === 'rect-s'            ? { orientation, theta_s: thetaS, rOverWs, lOverD_s: lOverDS, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-3-14'         ? { orientation, theta_s: thetaS, rOverWs, lOverD_s: lOverDS, l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
      ...(selType === 'rect-3-15'         ? { l_mm: l_mm ?? undefined, h_mm: h_mm ?? undefined } : {}),
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
      case 'rect-z':            return <SchemaRectZ orientation={orientation} l_mm={l_mm} h_mm={h_mm} lOverH={lOverH_ratio} />
      case 'rect-3-12':         return <SchemaRect312 orientation={orientation} l_mm={l_mm} h_mm={h_mm} lOverW={lOverW_ratio} />
      case 'coude-s':           return <SchemaCoudeS mini={false} theta_s={thetaS} di_mm={di_mm} rOverDs={rOverDs} lOverDs={lOverDS} elbowTypeS={elbowTypeS} nPiecesS={nPiecesS} />
      case 'coude-3-14':        return <SchemaCoude314 mini={false} theta_s={thetaS} di_mm={di_mm} rOverDs={rOverDs} lOverDs={lOverDS} elbowTypeS={elbowTypeS} nPiecesS={nPiecesS} />
      case 'rect-s':            return <SchemaCoudeRectS mini={false} theta_s={thetaS} l_mm={l_mm} h_mm={h_mm} orientation={orientation} rOverWs={rOverWs} lOverDs={lOverDS} />
      case 'rect-3-14':         return <SchemaRect314 mini={false} theta_s={thetaS} l_mm={l_mm} h_mm={h_mm} orientation={orientation} rOverWs={rOverWs} lOverDs={lOverDS} />
      case 'rect-3-15':         return <SchemaRect315 mini={false} h_mm={h_mm} />
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
            <div style={{ display: 'flex', borderRadius: 6, border: '1px solid #e2e8f0', overflow: 'hidden', marginLeft: 'auto', gap: 1, background: '#f1f5f9', padding: 2 }}>
              {(['simple', 'compose'] as const).map(cat => {
                const active = coudeCategory === cat
                return (
                  <button key={cat} onClick={() => {
                    if (active) return
                    const newActive = isRectMode
                      ? (cat === 'simple' ? RECT_SIMPLE : RECT_COMPOSE)
                      : (cat === 'simple' ? CIRC_SIMPLE : CIRC_COMPOSE)
                    setCoudeCategory(cat)
                    if (selType && !newActive.includes(selType)) setSelType(null)
                  }} style={{
                    background: active ? '#fff' : 'transparent',
                    color: active ? '#2563eb' : '#94a3b8',
                    border: active ? '1px solid #e2e8f0' : '1px solid transparent',
                    borderRadius: 4, cursor: 'pointer', padding: '2px 9px',
                    fontSize: 10.5, fontWeight: active ? 600 : 500,
                    boxShadow: active ? '0 1px 3px #0001' : 'none',
                    transition: 'all 0.12s',
                  }}>
                    {cat === 'simple' ? 'Simple' : 'Composé'}
                  </button>
                )
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'stretch' }}>
            {activeTypes.map(t => <TypeCard key={t} type={t} selected={selType === t} onClick={() => {
              setSelType(t)
              if (t === 'coude-z') { setAngle(30); return }
              if (t === 'coude-s' || t === 'rect-s' || t === 'coude-3-14' || t === 'rect-3-14' || t === 'rect-3-15') { return }
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
                {isRectMode && (selType === 'rect-rayon-lisse' || selType === 'rect-onglet' || selType === 'rect-aubes' || selType === 'rect-onglet-aubes' || selType === 'rect-z' || selType === 'rect-3-15') && (
                  <div style={{
                    position: 'absolute', top: 0, right: 0, zIndex: 2, pointerEvents: 'none',
                    background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', borderLeft: '1px solid #cbd5e1',
                    borderRadius: '0 0 0 4px',
                    width: 96, textAlign: 'center' as const, boxSizing: 'border-box' as const,
                    padding: '2px 8px', fontSize: 11, color: '#94a3b8', fontStyle: 'italic',
                  }}>
                    {selType === 'rect-3-15' || orientation === 'vertical' ? 'Vue de profil' : 'Vue de dessus'}
                  </div>
                )}
                <div style={{ flex: 1, padding: 0, minHeight: 0, overflow: 'hidden' }}>
                  <BigSchema />
                </div>
              </div>

              {/* ── Paramètres ── */}
              <div style={{
                flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0,
              }}>
                {/* Nom fixe — hors scroll */}
                <div style={{ padding: '12px 16px 0 16px', flexShrink: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 10 }}>
                    {SING_LABELS[selType]}
                  </div>
                  <div style={{ borderTop: '1px solid #f1f5f9', marginBottom: 0 }} />
                </div>
                {/* Zone scrollable */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 14px 16px' }}>

                {/* Orientation — rectangulaire uniquement */}
                {isRectMode && selType !== 'rect-3-15' && (
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
                  {selType !== 'coude-z' && selType !== 'rect-onglet-aubes' && selType !== 'rect-z' && selType !== 'rect-3-12' && selType !== 'coude-s' && selType !== 'rect-s' && selType !== 'coude-3-14' && selType !== 'rect-3-14' && selType !== 'rect-3-15' && <>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>Angle θ</span>
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

                  {/* Circulaire — dévoiement en S (ASHRAE 3-13) */}
                  {selType === 'coude-s' && (<>
                    <span style={lbl}>Angle θ</span>
                    <select value={thetaS} onChange={e => setThetaS(Number(e.target.value))}
                      style={{ ...inp, width: 74, cursor: 'pointer' }}>
                      {[15, 30, 45, 60, 75, 90].map(θ => <option key={θ} value={θ}>{θ}°</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>l/D</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>≥ 0</span>
                    </div>
                    <NumInput min={0} step={0.5} value={lOverDS}
                      onChange={v => setLOverDS(Math.max(0, v ?? 1))} style={inp} />
                    <div style={{ gridColumn: '1/-1', display: 'flex', gap: 6, marginTop: 2, marginBottom: 6 }}>
                      {(['lisse', 'segmente'] as const).map(t => (
                        <button key={t} onClick={() => {
                          setElbowTypeS(t)
                          if (t === 'segmente') setROverDs(v => Math.min(v, 2.0))
                        }} style={{
                          flex: 1, padding: '5px 0', borderRadius: 6,
                          fontSize: 11, fontWeight: elbowTypeS === t ? 700 : 500,
                          border: `1.5px solid ${elbowTypeS === t ? '#2563eb' : '#e2e8f0'}`,
                          background: elbowTypeS === t ? '#eff6ff' : '#f8fafc',
                          color: elbowTypeS === t ? '#1d4ed8' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.1s',
                        }}>
                          {t === 'lisse' ? 'Lisse à rayon' : 'Segmenté'}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>r/D</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>
                        {elbowTypeS === 'lisse' ? '1,0 – 2,50' : '1,0 – 2,00'}
                      </span>
                    </div>
                    <NumInput
                      min={1.0} max={elbowTypeS === 'lisse' ? 2.5 : 2.0} step={0.05}
                      value={rOverDs}
                      onChange={v => setROverDs(Math.max(1.0, Math.min(elbowTypeS === 'lisse' ? 2.5 : 2.0, v ?? 1.0)))}
                      style={{ ...inp, ...(elbowTypeS === 'lisse' ? { marginBottom: 10 } : {}) }} />
                    {elbowTypeS === 'segmente' && (<>
                      <label style={{ ...lbl, marginTop: 4 }}>Nb. d'éléments</label>
                      <div style={{ display: 'flex', gap: 5, marginTop: 4, marginBottom: 10 }}>
                        {([3, 4, 5] as const).map(n => (
                          <button key={n} onClick={() => setNPiecesS(n)} style={{
                            flex: 1, padding: '5px 0', borderRadius: 6,
                            fontSize: 12, fontWeight: 700,
                            border: `1.5px solid ${nPiecesS === n ? '#2563eb' : '#e2e8f0'}`,
                            background: nPiecesS === n ? '#eff6ff' : '#f8fafc',
                            color: nPiecesS === n ? '#1d4ed8' : '#64748b',
                            cursor: 'pointer', transition: 'all 0.1s',
                          }}>{n}</button>
                        ))}
                      </div>
                    </>)}
                  </>)}

                  {/* Circulaire — dévoiement en S, 2 plans (ASHRAE 3-14) */}
                  {selType === 'coude-3-14' && (<>
                    <span style={lbl}>Angle θ</span>
                    <select value={thetaS} onChange={e => setThetaS(Number(e.target.value))}
                      style={{ ...inp, width: 74, cursor: 'pointer' }}>
                      {[60, 90].map(θ => <option key={θ} value={θ}>{θ}°</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>L/D</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>≥ 0</span>
                    </div>
                    <NumInput min={0} step={0.5} value={lOverDS}
                      onChange={v => setLOverDS(Math.max(0, v ?? 1))} style={inp} />
                    <div style={{ gridColumn: '1/-1', display: 'flex', gap: 6, marginTop: 2, marginBottom: 6 }}>
                      {(['lisse', 'segmente'] as const).map(t => (
                        <button key={t} onClick={() => {
                          setElbowTypeS(t)
                          if (t === 'segmente') setROverDs(v => Math.min(v, 2.0))
                        }} style={{
                          flex: 1, padding: '5px 0', borderRadius: 6,
                          fontSize: 11, fontWeight: elbowTypeS === t ? 700 : 500,
                          border: `1.5px solid ${elbowTypeS === t ? '#2563eb' : '#e2e8f0'}`,
                          background: elbowTypeS === t ? '#eff6ff' : '#f8fafc',
                          color: elbowTypeS === t ? '#1d4ed8' : '#64748b',
                          cursor: 'pointer', transition: 'all 0.1s',
                        }}>
                          {t === 'lisse' ? 'Lisse à rayon' : 'Segmenté'}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>r/D</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>
                        {elbowTypeS === 'lisse' ? '1,0 – 2,50' : '1,0 – 2,00'}
                      </span>
                    </div>
                    <NumInput
                      min={1.0} max={elbowTypeS === 'lisse' ? 2.5 : 2.0} step={0.05}
                      value={rOverDs}
                      onChange={v => setROverDs(Math.max(1.0, Math.min(elbowTypeS === 'lisse' ? 2.5 : 2.0, v ?? 1.0)))}
                      style={{ ...inp, ...(elbowTypeS === 'lisse' ? { marginBottom: 10 } : {}) }} />
                    {elbowTypeS === 'segmente' && (<>
                      <label style={{ ...lbl, marginTop: 4 }}>Nb. d'éléments</label>
                      <div style={{ display: 'flex', gap: 5, marginTop: 4, marginBottom: 10 }}>
                        {([3, 4, 5] as const).map(n => (
                          <button key={n} onClick={() => setNPiecesS(n)} style={{
                            flex: 1, padding: '5px 0', borderRadius: 6,
                            fontSize: 12, fontWeight: 700,
                            border: `1.5px solid ${nPiecesS === n ? '#2563eb' : '#e2e8f0'}`,
                            background: nPiecesS === n ? '#eff6ff' : '#f8fafc',
                            color: nPiecesS === n ? '#1d4ed8' : '#64748b',
                            cursor: 'pointer', transition: 'all 0.1s',
                          }}>{n}</button>
                        ))}
                      </div>
                    </>)}
                  </>)}

                  {/* Rectangulaire — dévoiement en S (ASHRAE 3-13) */}
                  {selType === 'rect-s' && (<>
                    <span style={lbl}>Angle θ</span>
                    <select value={thetaS} onChange={e => setThetaS(Number(e.target.value))}
                      style={{ ...inp, width: 74, cursor: 'pointer' }}>
                      {[15, 30, 45, 60, 75, 90].map(θ => <option key={θ} value={θ}>{θ}°</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>l/D</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>≥ 0</span>
                    </div>
                    <NumInput min={0} step={0.5} value={lOverDS}
                      onChange={v => setLOverDS(Math.max(0, v ?? 1))} style={inp} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>{orientation === 'vertical' ? 'r/H' : 'r/L'}</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>1,0 – 2,0</span>
                    </div>
                    <NumInput min={1.0} max={2.0} step={0.05} value={rOverWs}
                      onChange={v => setROverWs(Math.max(1.0, Math.min(2.0, v ?? 1.0)))} style={inp} />
                  </>)}

                  {/* Rectangulaire — dévoiement en S, 2 plans perpendiculaires (ASHRAE 3-14) */}
                  {selType === 'rect-3-14' && (<>
                    <span style={lbl}>Angle θ</span>
                    <select value={thetaS} onChange={e => setThetaS(Number(e.target.value))}
                      style={{ ...inp, width: 74, cursor: 'pointer' }}>
                      {[60, 90].map(θ => <option key={θ} value={θ}>{θ}°</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>L/D</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>≥ 0</span>
                    </div>
                    <NumInput min={0} step={0.5} value={lOverDS}
                      onChange={v => setLOverDS(Math.max(0, v ?? 1))} style={inp} />
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={lbl}>{orientation === 'vertical' ? 'r/H' : 'r/L'}</span>
                      <span style={{ fontSize: 9, color: '#94a3b8' }}>≥ 1,0</span>
                    </div>
                    <NumInput min={1.0} max={2.0} step={0.05} value={rOverWs}
                      onChange={v => setROverWs(Math.max(1.0, Math.min(2.0, v ?? 1.0)))} style={inp} />
                  </>)}

                  {/* Rectangulaire — dévoiement Z (ASHRAE 3-11) */}
                  {selType === 'rect-z' && (<>
                    <span style={lbl}>{orientation === 'horizontal' ? 'l/L' : 'l/H'}</span>
                    <NumInput min={0} step={0.1} value={lOverH_ratio}
                      onChange={v => setLOverH_ratio(Math.max(0, v ?? 1.0))} style={inp} />
                  </>)}

                  {/* Rectangulaire — coudes 90° plans croisés (ASHRAE 3-12) */}
                  {selType === 'rect-3-12' && (<>
                    <span style={lbl}>{orientation === 'horizontal' ? 'l/L' : 'l/H'}</span>
                    <NumInput min={0} step={0.1} value={lOverW_ratio}
                      onChange={v => setLOverW_ratio(Math.max(0, v ?? 1.0))} style={inp} />
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
                </div>{/* fin zone scrollable */}
              </div>{/* fin panneau paramètres */}
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
