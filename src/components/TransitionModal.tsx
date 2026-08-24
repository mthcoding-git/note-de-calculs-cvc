import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { NumInput } from './NumInput'
import type {
  CircTransitionType, RectTransitionType, MixedTransitionType,
  VentNodeTransition, VentNodeTransitionRect, VentNodeTransitionMixed, TransitionKind,
} from '../utils/transitionCalc'
import {
  TRANSITION_LABELS, TRANSITION_NEEDS_ANGLE, ALPHA_RANGE, TRANSITION_NEEDS_LENGTH,
  computeXiTransition, TRANSITION_TYPES_FOR_KIND, newTransitionId,
  RECT_TRANSITION_LABELS, RECT_TRANSITION_NEEDS_ANGLE, RECT_ALPHA_RANGE, RECT_TRANSITION_NEEDS_LENGTH,
  computeXiTransitionRect, RECT_TRANSITION_TYPES_FOR_KIND,
  MIXED_TRANSITION_LABELS, MIXED_TRANSITION_NEEDS_ANGLE, MIXED_ALPHA_RANGE, MIXED_TRANSITION_NEEDS_LENGTH,
  computeXiTransitionMixed, MIXED_TRANSITION_TYPES_FOR_KIND,
} from '../utils/transitionCalc'

// ── Marques de section SVG ────────────────────────────────────────────────────

function waveC(ax: number, ay: number, bx: number, by: number, amp = 10): string {
  const f = (v: number) => +v.toFixed(1)
  const dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy) || 1
  const px = (-dy / len) * amp, py = (dx / len) * amp
  return `C ${f(ax+dx/3+px)} ${f(ay+dy/3+py)} ${f(ax+2*dx/3-px)} ${f(ay+2*dy/3-py)} ${bx} ${by}`
}

// ── SVG schéma de profil ──────────────────────────────────────────────────────
// prop1 / prop2 : dimension amont / aval (D pour circ, b_mm pour rect)
// flowIsLR      : true = flux L→R (soufflage / air-neuf), false = R→L (reprise / air-rejeté)
// amontIsCirc   : face amont circulaire → vague ; false → trait droit
// avalIsCirc    : face aval  circulaire → vague ; false → trait droit

function TransitionSvg({ type, prop1, prop2, alpha, mini, mode, a1_mm, b1_mm, a2_mm, b2_mm,
  labelOverride, flowIsLR, amontIsCirc, avalIsCirc }: {
  type: CircTransitionType; prop1: number; prop2: number
  alpha?: number; mini?: boolean
  mode?: 'circular' | 'rectangular' | 'mixed'
  a1_mm?: number; b1_mm?: number; a2_mm?: number; b2_mm?: number
  labelOverride?: [string, string]
  flowIsLR?:    boolean
  amontIsCirc?: boolean
  avalIsCirc?:  boolean
}) {
  const W = mini ? 140 : 250
  const H = mini ? 80  : 220
  const cy   = mini ? 40  : 108
  const maxH = mini ? 24  : 76

  const Dmax = Math.max(prop1, prop2)
  const h1 = Math.max(mini ? 3 : 6, (prop1 / Dmax) * maxH)
  const h2 = Math.max(mini ? 3 : 6, (prop2 / Dmax) * maxH)

  const isBrusque = type === 'agrandissement-brusque' || type === 'retrecissement-brusque'
  const mx  = W * 0.50
  let x1e = W * 0.75
  let x2e = W * 0.25

  if (!mini && !isBrusque && alpha != null) {
    const alphaRad = Math.max(1, Math.min(60, alpha)) * Math.PI / 180
    const deltaH   = Math.abs(h2 - h1)
    const maxL     = W * 0.7
    const L        = deltaH > 0 ? Math.min(deltaH / Math.tan(alphaRad), maxL) : maxL * 0.5
    x1e = W / 2 + L / 2
    x2e = W / 2 - L / 2
  }

  const xA = isBrusque ? mx : x1e
  const xB = isBrusque ? mx : x2e

  // Mini : toujours polygon illustratif R→L, pas de logique de direction
  const poly = `${W},${cy-h1} ${xA},${cy-h1} ${xB},${cy-h2} 0,${cy-h2} 0,${cy+h2} ${xB},${cy+h2} ${xA},${cy+h1} ${W},${cy+h1}`
  if (mini) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} width={88} height={50} style={{ display: 'block' }}>
        <rect width={W} height={H} fill="#f8fafd" />
        <polygon points={poly} fill="#dde3ec" stroke="#475569" strokeWidth={1.5} strokeLinejoin="round" />
      </svg>
    )
  }

  // ── Mode et labels ────────────────────────────────────────────────────────────
  const isRect = mode === 'rectangular'
  const label1 = labelOverride ? labelOverride[0] : isRect ? `${a1_mm}×${b1_mm} mm` : `Ø${prop1} mm`
  const label2 = labelOverride ? labelOverride[1] : isRect ? `${a2_mm}×${b2_mm} mm` : `Ø${prop2} mm`

  // ── Faces circulaires (vague) ou rectangulaires (trait droit) ─────────────────
  // Par défaut : vague si mode !== 'rectangular'
  const amtCirc = amontIsCirc ?? (mode !== 'rectangular')
  const avlCirc = avalIsCirc  ?? (mode !== 'rectangular')
  const isLR    = flowIsLR ?? false

  // ── Construction du path selon la direction d'écoulement ─────────────────────
  let mainPath: string
  if (isLR) {
    // Amont à GAUCHE (x=0), aval à DROITE (x=W)
    const xAf = W - xA   // épaulement amont (gauche)
    const xBf = W - xB   // épaulement aval  (droite)
    const rightFace = avlCirc ? waveC(W, cy-h2, W, cy+h2) : `L ${W} ${cy+h2}`
    const leftClose = amtCirc ? waveC(0, cy+h1, 0, cy-h1) : `L 0 ${cy-h1}`
    mainPath = [
      `M 0 ${cy-h1}`,
      `L ${xAf} ${cy-h1}`, `L ${xBf} ${cy-h2}`,
      `L ${W} ${cy-h2}`, rightFace,
      `L ${xBf} ${cy+h2}`, `L ${xAf} ${cy+h1}`, `L 0 ${cy+h1}`,
      leftClose,
    ].join(' ')
  } else {
    // Amont à DROITE (x=W), aval à GAUCHE (x=0)
    const leftFace   = avlCirc ? waveC(0, cy-h2, 0, cy+h2) : `L 0 ${cy+h2}`
    const rightClose = amtCirc ? waveC(W, cy+h1, W, cy-h1) : `L ${W} ${cy-h1}`
    mainPath = [
      `M ${W} ${cy-h1}`,
      `L ${xA} ${cy-h1}`, `L ${xB} ${cy-h2}`,
      `L 0 ${cy-h2}`, leftFace,
      `L ${xB} ${cy+h2}`, `L ${xA} ${cy+h1}`, `L ${W} ${cy+h1}`,
      rightClose,
    ].join(' ')
  }

  const topAtCenter = cy - (h1 + h2) / 2

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" style={{ display: 'block' }} overflow="visible">
      <rect width={W} height={H} fill="#f8fafd" />
      <path d={mainPath} fill="#dde3ec" stroke="#374151" strokeWidth={2}
        strokeLinejoin="round" strokeLinecap="round" />

      {/* Flèche de flux */}
      {isLR ? (
        <>
          <line x1={16} y1={cy} x2={W-28} y2={cy}
            stroke="#2563eb" strokeWidth={1.5} strokeDasharray="6 4" />
          <polygon points={`${W-28},${cy-5} ${W-28},${cy+5} ${W-16},${cy}`} fill="#2563eb" />
        </>
      ) : (
        <>
          <line x1={W-16} y1={cy} x2={28} y2={cy}
            stroke="#2563eb" strokeWidth={1.5} strokeDasharray="6 4" />
          <polygon points={`28,${cy-5} 28,${cy+5} 16,${cy}`} fill="#2563eb" />
        </>
      )}

      {/* Ligne de centre */}
      <line x1={0} y1={cy} x2={W} y2={cy}
        stroke="#94a3b8" strokeWidth={0.5} strokeDasharray="3 3" opacity={0.6} />

      {/* Angle α */}
      {!isBrusque && alpha != null && (
        <text x={W / 2} y={Math.max(14, topAtCenter - 6)}
          textAnchor="middle" fontSize={12} fontWeight="600" fill="#64748b">
          α = {alpha}°
        </text>
      )}

      {/* Cotes amont (A1) — barre à l'extérieur */}
      {((): React.ReactNode => {
        const bx    = isLR ? -14 : W + 14
        const onLeft = isLR                  // barre côté gauche ?
        const dimX  = bx                     // dim centrée sur la barre
        const aX    = onLeft ? bx - 7 : bx + 7
        const aAnchor = onLeft ? 'end' : 'start'
        return (
          <>
            <line x1={bx} y1={cy-h1} x2={bx} y2={cy+h1} stroke="#94a3b8" strokeWidth={1} />
            <line x1={bx-5} y1={cy-h1} x2={bx+5} y2={cy-h1} stroke="#94a3b8" strokeWidth={1} />
            <line x1={bx-5} y1={cy+h1} x2={bx+5} y2={cy+h1} stroke="#94a3b8" strokeWidth={1} />
            <text x={dimX} y={cy-h1-5} textAnchor="middle" fontSize={11} fontWeight="700" fill="#0f172a">{label1}</text>
            <text x={aX} y={cy+4} textAnchor={aAnchor} fontSize={10} fontWeight="700" fill="#94a3b8">A1</text>
            <text x={bx} y={cy+h1+13} textAnchor="middle" fontSize={9} fill="#94a3b8">amont</text>
          </>
        )
      })()}

      {/* Cotes aval (A2) — barre à l'extérieur */}
      {((): React.ReactNode => {
        const bx    = isLR ? W + 14 : -14
        const onLeft = !isLR                 // barre côté gauche ?
        const dimX  = bx
        const aX    = onLeft ? bx - 7 : bx + 7
        const aAnchor = onLeft ? 'end' : 'start'
        return (
          <>
            <line x1={bx} y1={cy-h2} x2={bx} y2={cy+h2} stroke="#94a3b8" strokeWidth={1} />
            <line x1={bx-5} y1={cy-h2} x2={bx+5} y2={cy-h2} stroke="#94a3b8" strokeWidth={1} />
            <line x1={bx-5} y1={cy+h2} x2={bx+5} y2={cy+h2} stroke="#94a3b8" strokeWidth={1} />
            <text x={dimX} y={cy-h2-5} textAnchor="middle" fontSize={11} fontWeight="700" fill="#0f172a">{label2}</text>
            <text x={aX} y={cy+4} textAnchor={aAnchor} fontSize={10} fontWeight="700" fill="#94a3b8">A2</text>
            <text x={bx} y={cy+h2+13} textAnchor="middle" fontSize={9} fill="#94a3b8">aval</text>
          </>
        )
      })()}
    </svg>
  )
}

// ── Cartes de type ────────────────────────────────────────────────────────────

const TRANS_FULL_LABELS: Record<CircTransitionType, [string, string]> = {
  'agrandissement-brusque': ['Agrandissement', 'brusque'],
  'diffuseur-conique':      ['Diffuseur conique', '(progressif)'],
  'retrecissement-brusque': ['Rétrécissement', 'brusque'],
  'convergent-conique':     ['Convergent conique', '(progressif)'],
}

const RECT_TRANS_FULL_LABELS: Record<RectTransitionType, [string, string]> = {
  'agrandissement-brusque-rect': ['Agrandissement', 'brusque'],
  'diffuseur-pyramidal':         ['Diffuseur pyramidal', '(progressif)'],
  'retrecissement-brusque-rect': ['Rétrécissement', 'brusque'],
  'convergent-pyramidal':        ['Convergent pyramidal', '(progressif)'],
}

const MIXED_TRANS_FULL_LABELS: Record<MixedTransitionType, [string, string]> = {
  'agrandissement-brusque-mixed': ['Agrandissement', 'brusque'],
  'diffuseur-mixed':              ['Diffuseur', '(progressif)'],
  'retrecissement-brusque-mixed': ['Rétrécissement', 'brusque'],
  'convergent-mixed':             ['Convergent', '(progressif)'],
}

// Forme équivalente circulaire pour le mini SVG illustratif
const RECT_TO_CIRC_SHAPE: Record<RectTransitionType, CircTransitionType> = {
  'agrandissement-brusque-rect': 'agrandissement-brusque',
  'diffuseur-pyramidal':         'diffuseur-conique',
  'retrecissement-brusque-rect': 'retrecissement-brusque',
  'convergent-pyramidal':        'convergent-conique',
}

const MIXED_TO_CIRC_SHAPE: Record<MixedTransitionType, CircTransitionType> = {
  'agrandissement-brusque-mixed': 'agrandissement-brusque',
  'diffuseur-mixed':              'diffuseur-conique',
  'retrecissement-brusque-mixed': 'retrecissement-brusque',
  'convergent-mixed':             'convergent-conique',
}

const KIND_DEMO: Record<TransitionKind, [number, number]> = {
  expansion:   [100, 170],
  contraction: [170, 100],
  none:        [100, 100],
}

function TypeCard({ circShape, label, selected, onClick, kind }: {
  circShape: CircTransitionType; label: [string, string]
  selected: boolean; onClick: () => void; kind: TransitionKind
}) {
  const [d1, d2] = KIND_DEMO[kind]
  const [line1, line2] = label
  return (
    <button onClick={onClick} style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '7px 5px 6px',
      border: `1.5px solid ${selected ? '#2563eb' : '#e2e8f0'}`,
      borderRadius: 8, background: selected ? '#eff6ff' : '#f8fafc',
      cursor: 'pointer', gap: 3, transition: 'all 0.12s',
      boxShadow: selected ? '0 0 0 3px #2563eb22' : 'none',
    }}>
      <div style={{ width: '100%', height: 58, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <TransitionSvg type={circShape} prop1={d1} prop2={d2} mini />
      </div>
      <div style={{ textAlign: 'center', lineHeight: 1.25 }}>
        <span style={{ fontSize: 9.5, fontWeight: selected ? 700 : 500,
          color: selected ? '#1d4ed8' : '#64748b', display: 'block' }}>{line1}</span>
        <span style={{ fontSize: 9.5, fontWeight: selected ? 700 : 500,
          color: selected ? '#1d4ed8' : '#64748b', display: 'block' }}>{line2}</span>
      </div>
    </button>
  )
}

// ── Formules ξ ────────────────────────────────────────────────────────────────

const XI_FORMULA: Record<CircTransitionType, string> = {
  'agrandissement-brusque': '(1 − A₁/A₂)²',
  'diffuseur-conique':      'f(α, A₂/A₁)  [Idelchik Chap. 5]',
  'retrecissement-brusque': '0,5 · (1 − A₂/A₁) · (A₁/A₂)',
  'convergent-conique':     '[K₀(L/D₂,θ)·(1−A₂/A₁) + K_fr] · (A₁/A₂)²  [Idelchik 3-6/3-7]',
}

const XI_FORMULA_RECT: Record<RectTransitionType, string> = {
  'agrandissement-brusque-rect': '(1 − A₁/A₂)²',
  'diffuseur-pyramidal':         'f(θ_max, A₂/A₁)  θ=max(θ_y,θ_z)  [Idelchik Chap. 5]',
  'retrecissement-brusque-rect': '0,5 · (1 − A₂/A₁) · (A₁/A₂)',
  'convergent-pyramidal':        '[K₀(L/Dh₂,θ)·(1−A₂/A₁) + K_fr] · (A₁/A₂)²  [Idelchik 3-6/3-7]',
}

const XI_FORMULA_MIXED: Record<MixedTransitionType, string> = {
  'agrandissement-brusque-mixed': '(1 − A₁/A₂)²',
  'diffuseur-mixed':              'f(θ, A₂/A₁) · τ(a/b)  [Idelchik Diag. 5-28]',
  'retrecissement-brusque-mixed': '0,5 · (1 − A₂/A₁) · (A₁/A₂)',
  'convergent-mixed':             '[K₀(L/Dh₂,θ)·(1−A₂/A₁) + K_fr] · (A₁/A₂)²  [Idelchik 3-6/3-7]',
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  isOpen:      boolean
  onClose:     () => void
  onSave:      (t: VentNodeTransition | VentNodeTransitionRect | VentNodeTransitionMixed) => void
  editing:     VentNodeTransition | VentNodeTransitionRect | VentNodeTransitionMixed | null
  kind:        TransitionKind
  dynPressure: number
  mode:        'circular' | 'rectangular' | 'mixed'
  // mode circulaire
  D1?:         number
  D2?:         number
  // mode rectangulaire
  a1_mm?:      number
  b1_mm?:      number
  a2_mm?:      number
  b2_mm?:      number
  // mode mixte (Groupe 3) — un côté circ, un côté rect
  amontShape?: 'circular' | 'rectangular'
  amontD_mm?:  number
  amontA_mm?:  number
  amontB_mm?:  number
  avalD_mm?:   number
  avalA_mm?:   number
  avalB_mm?:   number
  pipeSubType?: string
}

export default function TransitionModal({
  isOpen, onClose, onSave, editing, kind, dynPressure,
  mode, D1, D2, a1_mm, b1_mm, a2_mm, b2_mm,
  amontShape, amontD_mm, amontA_mm, amontB_mm, avalD_mm, avalA_mm, avalB_mm,
  pipeSubType,
}: Props) {
  const [selType, setSelType] = useState<CircTransitionType | RectTransitionType | MixedTransitionType | null>(null)
  const [alpha,   setAlpha]   = useState<number>(15)
  const [lenMm,   setLenMm]   = useState<number>(200)
  const [mounted, setMounted] = useState(false)
  const [view,    setView]    = useState<'profil' | 'dessus'>('profil')

  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => setMounted(true))
    else setMounted(false)
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setView('profil')
    if (editing) {
      setSelType(editing.type)
      setAlpha(editing.alpha_deg ?? 15)
      setLenMm(editing.L_mm ?? 200)
    } else {
      setSelType(null)
      setAlpha(15)
      setLenMm(200)
    }
  }, [isOpen, editing])

  if (!isOpen) return null

  const isRect  = mode === 'rectangular'
  const isMixed = mode === 'mixed'

  const availableCirc  = TRANSITION_TYPES_FOR_KIND[kind]
  const availableRect  = RECT_TRANSITION_TYPES_FOR_KIND[kind]
  const availableMixed = MIXED_TRANSITION_TYPES_FOR_KIND[kind]

  const needsAngle = selType
    ? (isMixed
        ? MIXED_TRANSITION_NEEDS_ANGLE[selType as MixedTransitionType]
        : isRect
          ? RECT_TRANSITION_NEEDS_ANGLE[selType as RectTransitionType]
          : TRANSITION_NEEDS_ANGLE[selType as CircTransitionType])
    : false

  const needsLength = selType
    ? (isMixed
        ? MIXED_TRANSITION_NEEDS_LENGTH[selType as MixedTransitionType]
        : isRect
          ? RECT_TRANSITION_NEEDS_LENGTH[selType as RectTransitionType]
          : TRANSITION_NEEDS_LENGTH[selType as CircTransitionType])
    : false

  const [alphaMin, alphaMax] = selType
    ? (isMixed
        ? MIXED_ALPHA_RANGE[selType as MixedTransitionType]
        : isRect
          ? RECT_ALPHA_RANGE[selType as RectTransitionType]
          : ALPHA_RANGE[selType as CircTransitionType])
    : [4, 60]

  // Calcul ξ et ΔP
  const A1_mm2_rect = (a1_mm ?? 0) * (b1_mm ?? 0)
  const A2_mm2_rect = (a2_mm ?? 0) * (b2_mm ?? 0)

  // Pour le mode mixte : sections amont/aval (circ ou rect)
  const mixedA1 = isMixed
    ? (amontShape === 'circular'
        ? Math.PI * ((amontD_mm ?? 0) / 2) ** 2
        : (amontA_mm ?? 0) * (amontB_mm ?? 0))
    : 0
  const mixedA2 = isMixed
    ? (amontShape === 'circular'
        ? (avalA_mm ?? 0) * (avalB_mm ?? 0)
        : Math.PI * ((avalD_mm ?? 0) / 2) ** 2)
    : 0
  const mixedAB = isMixed
    ? (() => {
        const a = amontShape === 'rectangular' ? (amontA_mm ?? 1) : (avalA_mm ?? 1)
        const b = amontShape === 'rectangular' ? (amontB_mm ?? 1) : (avalB_mm ?? 1)
        return Math.max(a, b) / Math.max(Math.min(a, b), 1)
      })()
    : 1

  // Dh effectifs pour mode mixte
  const mixedDh1 = isMixed
    ? (amontShape === 'circular'
        ? (amontD_mm ?? 0)
        : 2 * (amontA_mm ?? 0) * (amontB_mm ?? 0) / Math.max((amontA_mm ?? 0) + (amontB_mm ?? 0), 1))
    : 0
  const mixedDh2 = isMixed
    ? (amontShape === 'circular'
        ? 2 * (avalA_mm ?? 0) * (avalB_mm ?? 0) / Math.max((avalA_mm ?? 0) + (avalB_mm ?? 0), 1)
        : (avalD_mm ?? 0))
    : 0

  let xi: number | null = null
  if (selType) {
    if (isMixed) {
      const mockT: VentNodeTransitionMixed = {
        id: '', type: selType as MixedTransitionType, L_mm: lenMm,
        ...(needsAngle ? { alpha_deg: alpha } : {}),
      }
      xi = computeXiTransitionMixed(mockT, mixedA1, mixedA2, mixedAB, mixedDh1, mixedDh2)
    } else if (isRect) {
      const mockT: VentNodeTransitionRect = {
        id: '', type: selType as RectTransitionType, L_mm: lenMm,
        ...(needsAngle ? { alpha_deg: alpha } : {}),
      }
      xi = computeXiTransitionRect(mockT, A1_mm2_rect, A2_mm2_rect, a1_mm, b1_mm, a2_mm, b2_mm)
    } else {
      const mockT: VentNodeTransition = {
        id: '', type: selType as CircTransitionType, L_mm: lenMm,
        ...(needsAngle ? { alpha_deg: alpha } : {}),
      }
      xi = computeXiTransition(mockT, D1 ?? 0, D2 ?? 0)
    }
  }
  const dp = xi != null ? xi * dynPressure : null
  const isDessus = view === 'dessus'

  // Libellés amont / aval pour mode mixte
  const mixedLabel1 = isMixed
    ? (amontShape === 'circular'
        ? `Ø${amontD_mm} mm`
        : (isDessus ? `L = ${amontA_mm}` : `H = ${amontB_mm}`))
    : ''
  const mixedLabel2 = isMixed
    ? (amontShape === 'circular'
        ? (isDessus ? `L = ${avalA_mm}` : `H = ${avalB_mm}`)
        : `Ø${avalD_mm} mm`)
    : ''

  // Libellés
  const kindWord = kind === 'expansion' ? 'Agrandissement' : 'Rétrécissement'
  const kindLabel = isMixed
    ? `${kindWord} — ${mixedLabel1} → ${mixedLabel2}`
    : isRect
      ? `${kindWord} — ${a1_mm}×${b1_mm} → ${a2_mm}×${b2_mm} mm`
      : `${kindWord} — Ø${D1} → Ø${D2} mm`

  const flowIsLR    = pipeSubType === 'soufflage' || pipeSubType === 'air-neuf'
  const amontIsCirc = !isRect && (!isMixed || amontShape === 'circular')
  const avalIsCirc  = !isRect && (!isMixed || amontShape === 'rectangular')

  const shapeLabel = isMixed
    ? (amontShape === 'circular' ? 'circ. → rect.' : 'rect. → circ.')
    : isRect ? 'rectangulaire' : 'circulaire'

  const detailLabel = isMixed
    ? `${mixedLabel1} → ${mixedLabel2}`
    : isRect
      ? `${a1_mm}×${b1_mm} → ${a2_mm}×${b2_mm} mm`
      : `Ø${D1} → Ø${D2} mm`

  const selectedLabel = selType
    ? (isMixed
        ? MIXED_TRANSITION_LABELS[selType as MixedTransitionType]
        : isRect
          ? RECT_TRANSITION_LABELS[selType as RectTransitionType]
          : TRANSITION_LABELS[selType as CircTransitionType])
    : ''

  const xiFormula = selType
    ? (isMixed
        ? XI_FORMULA_MIXED[selType as MixedTransitionType]
        : isRect
          ? XI_FORMULA_RECT[selType as RectTransitionType]
          : XI_FORMULA[selType as CircTransitionType])
    : ''

  // prop1/prop2 pour la hauteur proportionnelle du grand SVG
  const svgProp1 = isMixed
    ? (amontShape === 'circular'
        ? (amontD_mm ?? 100)
        : (isDessus ? (amontA_mm ?? 100) : (amontB_mm ?? 100)))
    : isRect
      ? (isDessus ? (a1_mm ?? 100) : (b1_mm ?? 100))
      : (D1 ?? 100)
  const svgProp2 = isMixed
    ? (amontShape === 'circular'
        ? (isDessus ? (avalA_mm ?? 100) : (avalB_mm ?? 100))
        : (avalD_mm ?? 100))
    : isRect
      ? (isDessus ? (a2_mm ?? 100) : (b2_mm ?? 100))
      : (D2 ?? 100)

  // Angle effectif calculé depuis L (pour affichage SVG et info)
  const effectiveTheta: number | undefined = needsLength ? (() => {
    const L = lenMm
    if (!isRect && !isMixed) {
      // convergent-conique
      const d1 = D1 ?? 0; const d2 = D2 ?? 0
      if (d1 <= d2 || L <= 0) return undefined
      return Math.atan((d1 - d2) / (2 * L)) * 180 / Math.PI
    } else if (isRect) {
      // diffuseur-pyramidal ou convergent-pyramidal
      const a1 = a1_mm ?? 0; const b1 = b1_mm ?? 0
      const a2 = a2_mm ?? 0; const b2 = b2_mm ?? 0
      if (L <= 0) return undefined
      const da = Math.abs(a2 - a1); const db = Math.abs(b2 - b1)
      return Math.max(
        Math.atan(da / (2 * L)) * 180 / Math.PI,
        Math.atan(db / (2 * L)) * 180 / Math.PI,
      )
    } else {
      // diffuseur-mixed ou convergent-mixed
      if (L <= 0 || mixedDh1 <= 0 || mixedDh2 <= 0) return undefined
      return Math.atan(Math.abs(mixedDh2 - mixedDh1) / (2 * L)) * 180 / Math.PI
    }
  })() : undefined

  const handleSave = () => {
    if (!selType) return
    const base = {
      id: editing?.id ?? newTransitionId(),
      ...(needsAngle  ? { alpha_deg: alpha } : {}),
      ...(needsLength ? { L_mm: lenMm }      : {}),
    }
    if (isMixed) {
      onSave({ ...base, type: selType as MixedTransitionType })
    } else if (isRect) {
      onSave({ ...base, type: selType as RectTransitionType })
    } else {
      onSave({ ...base, type: selType as CircTransitionType })
    }
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
        zIndex: 1000, width: 640, height: 520, background: '#fff',
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
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginBottom: 3 }}>
              {editing ? 'Modifier la transition' : 'Ajouter une transition'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#64748b' }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%',
                background: '#6366f1', flexShrink: 0, display: 'inline-block' }} />
              {kindLabel}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 18, color: '#94a3b8', lineHeight: 1, padding: '2px 4px', marginTop: 1 }}>×</button>
        </div>

        {/* ── Sélecteur de type ── */}
        <div style={{ flexShrink: 0, padding: '10px 18px 9px', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#b0bec5',
            textTransform: 'uppercase' as const, letterSpacing: '0.07em', marginBottom: 7 }}>
            Type de transition — {shapeLabel}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            {isMixed
              ? availableMixed.map(t => (
                  <TypeCard
                    key={t}
                    circShape={MIXED_TO_CIRC_SHAPE[t]}
                    label={MIXED_TRANS_FULL_LABELS[t]}
                    selected={selType === t}
                    onClick={() => setSelType(t)}
                    kind={kind}
                  />
                ))
              : isRect
                ? availableRect.map(t => (
                    <TypeCard
                      key={t}
                      circShape={RECT_TO_CIRC_SHAPE[t]}
                      label={RECT_TRANS_FULL_LABELS[t]}
                      selected={selType === t}
                      onClick={() => setSelType(t)}
                      kind={kind}
                    />
                  ))
                : availableCirc.map(t => (
                    <TypeCard
                      key={t}
                      circShape={t}
                      label={TRANS_FULL_LABELS[t]}
                      selected={selType === t}
                      onClick={() => setSelType(t)}
                      kind={kind}
                    />
                  ))
            }
          </div>
        </div>

        {/* ── Zone de détail ── */}
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
              {/* ── Schéma SVG ── */}
              <div style={{ width: 400, flexShrink: 0, display: 'flex', flexDirection: 'column',
                borderRight: '1px solid #f1f5f9', background: '#f8fafd' }}>
                {(isRect || isMixed) && (
                  <div style={{ flexShrink: 0, padding: '7px 12px 0 12px', display: 'flex', gap: 4 }}>
                    {(['profil', 'dessus'] as const).map(v => (
                      <button key={v} onClick={() => setView(v)} style={{
                        padding: '2px 9px', fontSize: 10, fontWeight: 600, borderRadius: 4,
                        border: `1px solid ${view === v ? '#2563eb' : '#e2e8f0'}`,
                        background: view === v ? '#eff6ff' : '#f1f5f9',
                        color: view === v ? '#2563eb' : '#64748b',
                        cursor: 'pointer', letterSpacing: '0.02em',
                      }}>
                        {v === 'profil' ? 'Hauteur (b)' : 'Largeur (a)'}
                      </button>
                    ))}
                  </div>
                )}
                <div style={{ flex: 1, padding: '10px 14px 10px 18px', minHeight: 0 }}>
                  <TransitionSvg
                    type={
                      isMixed ? MIXED_TO_CIRC_SHAPE[selType as MixedTransitionType]
                      : isRect ? RECT_TO_CIRC_SHAPE[selType as RectTransitionType]
                      : selType as CircTransitionType
                    }
                    prop1={svgProp1} prop2={svgProp2}
                    alpha={needsAngle ? alpha : (needsLength && effectiveTheta != null ? Math.round(effectiveTheta * 10) / 10 : undefined)}
                    mode={isRect ? 'rectangular' : 'circular'}
                    a1_mm={a1_mm} b1_mm={b1_mm} a2_mm={a2_mm} b2_mm={b2_mm}
                    labelOverride={
                      isMixed ? [mixedLabel1, mixedLabel2]
                      : isRect ? [
                          isDessus ? `L = ${a1_mm}` : `H = ${b1_mm}`,
                          isDessus ? `L = ${a2_mm}` : `H = ${b2_mm}`,
                        ]
                      : undefined
                    }
                    flowIsLR={flowIsLR}
                    amontIsCirc={amontIsCirc}
                    avalIsCirc={avalIsCirc}
                  />
                </div>
              </div>

              {/* ── Paramètres ── */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column',
                padding: '16px 16px 14px 16px', overflowY: 'auto' }}>

                <div style={{ fontSize: 12, fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>
                  {selectedLabel}
                </div>
                <div style={{ fontSize: 10.5, color: '#94a3b8', marginBottom: 18, lineHeight: 1 }}>
                  {detailLabel}
                  <span style={{ margin: '0 5px' }}>·</span>
                  ρv²/2 = {dynPressure.toFixed(1)} Pa
                </div>

                {needsAngle && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 74px',
                    rowGap: 10, columnGap: 8, alignItems: 'center' }}>
                    <label style={lbl}>
                      {isMixed ? 'Demi-angle α (°)' : isRect ? 'Demi-angle équivalent α (°)' : 'Demi-angle α (°)'}
                    </label>
                    <NumInput min={alphaMin} max={alphaMax} step={1}
                      value={alpha} onChange={v => setAlpha(v ?? 15)} style={inp} />
                    <span style={{ gridColumn: '1 / -1', fontSize: 9.5, color: '#94a3b8', marginTop: -4 }}>
                      recommandé : 10–15° · limité à {alphaMax}°
                    </span>
                  </div>
                )}

                {needsLength && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 74px',
                    rowGap: 10, columnGap: 8, alignItems: 'center' }}>
                    <label style={lbl}>Longueur L (mm)</label>
                    <NumInput min={10} max={10000} step={10}
                      value={lenMm} onChange={v => setLenMm(v ?? 200)} style={inp} />
                    {effectiveTheta != null && (
                      <span style={{ gridColumn: '1 / -1', fontSize: 9.5, color: '#94a3b8', marginTop: -4 }}>
                        θ = {effectiveTheta.toFixed(1)}°  (demi-angle calculé)
                      </span>
                    )}
                  </div>
                )}

                {xi != null && (
                  <div style={{ marginTop: 'auto', paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <div style={{ flex: 1, padding: '9px 12px', borderRadius: 7,
                        background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: '#93c5fd',
                          letterSpacing: '0.04em', marginBottom: 4 }}>
                          Coefficient ξ
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: '#1d4ed8',
                          fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
                          {xi.toFixed(3)}
                        </div>
                        <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid #bfdbfe',
                          fontSize: 8, color: '#93c5fd', fontStyle: 'italic', lineHeight: 1.4 }}>
                          ξ = {xiFormula}
                        </div>
                      </div>
                      {dp != null && (
                        <div style={{ flex: 1, padding: '9px 12px', borderRadius: 7,
                          background: '#f0fdfa', border: '1px solid #99f6e4' }}>
                          <div style={{ fontSize: 9, fontWeight: 600, color: '#2dd4bf', marginBottom: 3 }}>
                            ΔP singulière
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#0f766e',
                            fontFamily: 'ui-monospace, monospace', lineHeight: 1 }}>
                            {dp.toFixed(2)}
                            <span style={{ fontSize: 11, fontWeight: 500, marginLeft: 3, color: '#0d9488' }}>Pa</span>
                          </div>
                          <div style={{ marginTop: 6, paddingTop: 5, borderTop: '1px solid #99f6e4',
                            fontSize: 8, color: '#2dd4bf', fontStyle: 'italic', lineHeight: 1.4 }}>
                            ΔP = ξ · ρv²/2
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
        <div style={{ flexShrink: 0, height: 52, display: 'flex', alignItems: 'center',
          justifyContent: 'flex-end', gap: 8, padding: '0 18px', borderTop: '1px solid #f1f5f9' }}>
          <button onClick={onClose} style={{ padding: '6px 16px', borderRadius: 6,
            border: '1px solid #e2e8f0', background: '#f8fafc',
            fontSize: 12, fontWeight: 500, color: '#374151', cursor: 'pointer' }}>
            Annuler
          </button>
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
