import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'

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

export function CalcFluidTabs({ activeFluidId, onFluidChange }) {
  const [dropdown, setDropdown] = useState(null) // { fluidId, top, left }
  const closeDropdown = () => setDropdown(null)

  useEffect(() => {
    if (!dropdown) return
    const handle = (e) => {
      if (!e.target.closest('.fluid-dropdown')) closeDropdown()
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [dropdown])

  const handleTabClick = (fluid, e) => {
    if (!fluid.available || fluid.id === activeFluidId) return
    const available = fluid.calculs.filter(c => c.available)
    if (available.length === 1) {
      onFluidChange(fluid.id, available[0].id)
    } else {
      if (dropdown?.fluidId === fluid.id) {
        closeDropdown()
      } else {
        const rect = e.currentTarget.getBoundingClientRect()
        setDropdown({ fluidId: fluid.id, top: rect.bottom + 4, left: rect.left })
      }
    }
  }

  const openFluid = dropdown ? FLUIDES.find(f => f.id === dropdown.fluidId) : null

  return (
    <>
      <div className="calc-sel-tabs">
        {FLUIDES.map(f => (
          <button
            key={f.id}
            className={`calc-sel-tab${f.id === activeFluidId ? ' active' : ''}${!f.available ? ' soon' : ''}${dropdown?.fluidId === f.id ? ' active' : ''}`}
            onClick={e => handleTabClick(f, e)}
            title={!f.available ? `${f.label} — À venir` : f.label}>
            {f.shortLabel}
          </button>
        ))}
      </div>

      {dropdown && openFluid && createPortal(
        <div
          className="fluid-dropdown"
          style={{ top: dropdown.top, left: dropdown.left }}>
          {openFluid.calculs.filter(c => c.available).map(c => (
            <button
              key={c.id}
              className="fluid-dropdown-item"
              onClick={() => { onFluidChange(openFluid.id, c.id); closeDropdown() }}>
              {c.label}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  )
}

export function CalcModePills({ activeFluidId, activeCalcId, onChange }) {
  if (!activeFluidId) return null
  const fluid = FLUIDES.find(f => f.id === activeFluidId)
  if (!fluid) return null
  return (
    <div className="calc-sel-tabs">
      {fluid.calculs.map(c => (
        <button
          key={c.id}
          className={[
            'calc-sel-tab',
            c.id === activeCalcId ? 'active' : '',
            !c.available ? 'soon' : '',
          ].filter(Boolean).join(' ')}
          onClick={() => { if (c.available) onChange(c.id) }}
          title={!c.available ? `${c.label} — À venir` : c.label}>
          {c.label}
        </button>
      ))}
    </div>
  )
}
