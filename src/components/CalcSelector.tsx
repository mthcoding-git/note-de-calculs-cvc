import React from 'react'

const FLUIDES = [
  {
    id: 'ecs',
    shortLabel: 'ECS',
    label: 'ECS — Eau Chaude Sanitaire',
    available: true,
    calculs: [
      { id: 'bouclage-ecs',     label: 'Bouclage ECS',     available: true  },
      { id: 'alimentation-ecs', label: 'Alimentation ECS', available: true  },
      { id: 'pdc-bouclage-ecs', label: 'Pertes de charge', available: false },
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
    available: false,
    calculs: [
      { id: 'distribution-chauffage', label: 'Distribution chauffage',       available: false },
      { id: 'pdc-chauffage',          label: 'Pertes de charge — Chauffage', available: false },
    ],
  },
]

export function getAutoCalcId(fluidId) {
  const fluid = FLUIDES.find(f => f.id === fluidId)
  if (!fluid) return null
  const available = fluid.calculs.filter(c => c.available)
  return available.length === 1 ? available[0].id : null
}

const NETWORK_SHORT: Record<string, string> = {
  'bouclage-ecs':           'ECS',
  'alimentation-ecs':       'ECS',
  'pdc-bouclage-ecs':       'ECS',
  'alimentation-ef':        'EF',
  'distribution-chauffage': 'CH',
  'pdc-chauffage':          'CH',
}
export function getNetworkLabel(calcId: string): string {
  return NETWORK_SHORT[calcId] ?? ''
}

export function getCalcLabel(calcId) {
  for (const fluid of FLUIDES) {
    const calc = fluid.calculs.find(c => c.id === calcId)
    if (calc) return calc.label
  }
  return null
}

export function getFluidLabel(fluidId) {
  return FLUIDES.find(f => f.id === fluidId)?.shortLabel ?? fluidId
}

export function CalcFluidTabs({ activeFluidId, activeCalcId, onFluidChange, onCalcChange, isFluidKnown }) {
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
