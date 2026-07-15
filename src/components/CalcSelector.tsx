import React from 'react'
import type { CalcMode, FluidId } from '../types'

interface CalcEntry { id: CalcMode; label: string; available: boolean }
interface FluidEntry { id: FluidId; shortLabel: string; label: string; available: boolean; calculs: CalcEntry[] }

const FLUIDES: FluidEntry[] = [
  {
    id: 'ecs',
    shortLabel: 'ECS',
    label: 'ECS — Eau Chaude Sanitaire',
    available: true,
    calculs: [
      { id: 'bouclage-ecs',     label: 'Bouclage ECS',     available: true  },
      { id: 'alimentation-ecs', label: 'Alimentation ECS', available: true  },
    ],
  },
  {
    id: 'ef',
    shortLabel: 'EF',
    label: 'EF — Eau Froide',
    available: true,
    calculs: [
      { id: 'alimentation-ef', label: 'Alimentation EF', available: true },
    ],
  },
  {
    id: 'chauffage',
    shortLabel: 'Chauffage',
    label: 'Chauffage',
    available: true,
    calculs: [
      { id: 'distribution-chauffage', label: 'Distribution chauffage',       available: true  },
      { id: 'pdc-chauffage',          label: 'Pertes de charge — Chauffage', available: false },
    ],
  },
  {
    id: 'eauglacee',
    shortLabel: 'Eau glacée',
    label: 'Eau glacée',
    available: true,
    calculs: [
      { id: 'distribution-eauglacee', label: 'Distribution eau glacée', available: true },
    ],
  },
]

export function getAutoCalcId(fluidId) {
  const fluid = FLUIDES.find(f => f.id === fluidId)
  if (!fluid) return null
  const available = fluid.calculs.filter(c => c.available)
  return available.length === 1 ? available[0].id : null
}

const NETWORK_SHORT: Record<CalcMode, string> = {
  'bouclage-ecs':             'ECS',
  'alimentation-ecs':         'ECS',
  'alimentation-ef':          'EF',
  'distribution-chauffage':   'CH',
  'pdc-chauffage':            'CH',
  'distribution-eauglacee':   'EG',
}
export function getNetworkLabel(calcId: CalcMode): string {
  return NETWORK_SHORT[calcId] ?? ''
}

export function getCalcLabel(calcId: CalcMode): string | null {
  for (const fluid of FLUIDES) {
    const calc = fluid.calculs.find(c => c.id === calcId)
    if (calc) return calc.label
  }
  return null
}

export function getFluidLabel(fluidId) {
  return FLUIDES.find(f => f.id === fluidId)?.shortLabel ?? fluidId
}

export function CalcFluidTabs({ activeFluidId, activeCalcId, onFluidChange, onCalcChange, isFluidKnown }: {
  activeFluidId: FluidId | null
  activeCalcId: CalcMode | null
  onFluidChange: (fluidId: FluidId, calcId: CalcMode | null) => void
  onCalcChange: (calcId: CalcMode) => void
  isFluidKnown?: (fluidId: FluidId) => boolean
}) {
  const [pendingFluidId, setPendingFluidId] = React.useState<string | null>(null)

  // Quand le fluide actif change (suite à un vrai switch), on efface le pending
  React.useEffect(() => { setPendingFluidId(null) }, [activeFluidId])

  const handleFluidClick = (fluid) => {
    if (!fluid.available) return
    if (fluid.id === activeFluidId) { setPendingFluidId(null); return }

    const available = fluid.calculs.filter(c => c.available)
    if (available.length === 1) {
      // Un seul mode : activation immédiate
      setPendingFluidId(null)
      onFluidChange(fluid.id, available[0].id)
    } else if (isFluidKnown?.(fluid.id)) {
      // Plusieurs modes, mais déjà visité : activation immédiate (ancien comportement)
      setPendingFluidId(null)
      onFluidChange(fluid.id, null)
    } else {
      // Plusieurs modes, jamais visité : afficher les modes sans changer le fluide actif
      // Deuxième clic sur le même fluide pending → fermer
      setPendingFluidId(prev => prev === fluid.id ? null : fluid.id)
    }
  }

  // Construction d'une liste plate : bouton fluide + modes si fluide actif ou pending
  const items: React.ReactNode[] = []
  for (const f of FLUIDES) {
    items.push(
      <button
        key={f.id}
        className={[
          'calc-sel-tab',
          f.id === activeFluidId ? 'active' : '',
          f.id === pendingFluidId ? 'calc-sel-pending' : '',
          !f.available ? 'soon' : '',
        ].filter(Boolean).join(' ')}
        onClick={() => handleFluidClick(f)}
        title={!f.available ? `${f.label} — À venir` : f.label}>
        {f.shortLabel}
      </button>
    )

    const showModes = f.id === activeFluidId || f.id === pendingFluidId
    if (showModes) {
      for (const c of f.calculs.filter(cc => cc.available)) {
        const isPending = f.id === pendingFluidId
        items.push(
          <button
            key={c.id}
            className={[
              'calc-sel-tab',
              'calc-sel-mode',
              c.id === activeCalcId ? 'active' : '',
            ].filter(Boolean).join(' ')}
            onClick={() => {
              if (isPending) {
                // Première sélection d'un mode pour ce fluide
                setPendingFluidId(null)
                onFluidChange(f.id, c.id)
              } else if (c.id !== activeCalcId && onCalcChange) {
                onCalcChange(c.id)
              }
            }}>
            {c.label}
          </button>
        )
      }
    }
  }

  return <div className="calc-sel-tabs">{items}</div>
}
