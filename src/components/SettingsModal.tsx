import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { DisplayPrefs } from '../types'
import { DEFAULT_DISPLAY_PREFS } from '../utils/projectBuilder'

const PT_R = 4

type Mode = 'ecs' | 'ef' | 'chauffage'

const COLOR_PALETTE = [
  '#dc2626', '#ef4444', '#f97316', '#fb923c', '#fbbf24',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#2563eb', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#64748b', '#374151', '#0f172a',
]

interface Props {
  displayPrefs: DisplayPrefs
  onChange: (prefs: DisplayPrefs) => void
  onClose: () => void
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9.5, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase',
      letterSpacing: '0.08em', marginTop: 14, marginBottom: 7,
    }}>
      {children}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
      <span style={{ fontSize: 12.5, color: '#374151', flex: 1 }}>{label}</span>
      {children}
    </div>
  )
}

function Sel({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{
      fontSize: 12, padding: '4px 10px', border: '1px solid #d1d5db', borderRadius: 5,
      background: '#f9fafb', color: '#374151', cursor: 'pointer', outline: 'none',
      fontFamily: 'inherit',
    }}>
      {children}
    </select>
  )
}

function ResetBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} title="Remettre par défaut" style={{
      background: 'none', border: '1px solid #e5e7eb', borderRadius: 5, cursor: 'pointer',
      padding: '3px 6px', fontSize: 13, color: '#cbd5e1', lineHeight: 1, flexShrink: 0,
      transition: 'color 0.15s, border-color 0.15s',
    }}
      onMouseEnter={e => { e.currentTarget.style.color = '#64748b'; e.currentTarget.style.borderColor = '#94a3b8' }}
      onMouseLeave={e => { e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.borderColor = '#e5e7eb' }}
    >
      ↺
    </button>
  )
}

function ColorSwatch({
  value, onChange, onReset,
}: {
  value: string; onChange: (c: string) => void; onReset: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handle = (e: MouseEvent) => {
      if (
        !btnRef.current?.contains(e.target as Node) &&
        !popoverRef.current?.contains(e.target as Node)
      ) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const handleOpen = () => {
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setPos({ top: rect.bottom + 7, left: rect.left })
    setOpen(o => !o)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        ref={btnRef}
        onClick={handleOpen}
        title="Choisir une couleur"
        style={{
          width: 48, height: 24, background: value, borderRadius: 6,
          border: open ? '2px solid #3b82f6' : '1.5px solid rgba(0,0,0,0.18)',
          cursor: 'pointer', padding: 0, flexShrink: 0,
          boxShadow: '0 1px 4px rgba(0,0,0,0.14)',
          transition: 'border 0.12s, box-shadow 0.12s',
        }}
      />
      <ResetBtn onClick={onReset} />

      {open && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
            background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
            boxShadow: '0 8px 32px rgba(15,23,42,0.14), 0 2px 8px rgba(15,23,42,0.08)',
            padding: 10,
            display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
          }}
        >
          {COLOR_PALETTE.map(color => {
            const selected = value.toLowerCase() === color.toLowerCase()
            return (
              <button
                key={color}
                onClick={() => { onChange(color); setOpen(false) }}
                style={{
                  width: 26, height: 26, background: color, borderRadius: 6,
                  border: 'none', cursor: 'pointer', padding: 0,
                  outline: selected ? '2.5px solid #1e293b' : 'none',
                  outlineOffset: 2,
                  boxShadow: '0 1px 3px rgba(0,0,0,0.18)',
                  transition: 'transform 0.1s',
                }}
                onMouseEnter={e => { if (!selected) e.currentTarget.style.transform = 'scale(1.15)' }}
                onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)' }}
              />
            )
          })}
        </div>,
        document.body
      )}
    </div>
  )
}

export function SettingsModal({ displayPrefs, onChange, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('ecs')

  const prefs = displayPrefs[mode]
  const def = DEFAULT_DISPLAY_PREFS[mode]

  const patch = (p: Partial<typeof prefs>) =>
    onChange({ ...displayPrefs, [mode]: { ...prefs, ...p } })

  return (
    <div
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.28)', zIndex: 1000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 10, boxShadow: '0 12px 40px rgba(15,23,42,0.18)',
        width: 330, maxHeight: '90vh', overflow: 'auto',
      }}>
        {/* En-tête */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '13px 16px 10px', borderBottom: '1px solid #f1f5f9',
        }}>
          <span style={{ fontWeight: 600, fontSize: 13.5, color: '#0f172a', letterSpacing: '-0.01em' }}>
            Paramètres d'affichage
          </span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 15, color: '#94a3b8', lineHeight: 1, padding: '2px 4px',
            borderRadius: 4, transition: 'color 0.12s',
          }}
            onMouseEnter={e => { e.currentTarget.style.color = '#374151' }}
            onMouseLeave={e => { e.currentTarget.style.color = '#94a3b8' }}
          >✕</button>
        </div>

        {/* Onglets */}
        <div style={{
          display: 'flex', padding: '0 16px', borderBottom: '1px solid #f1f5f9',
          background: '#fafafa',
        }}>
          {(['ecs', 'ef', 'chauffage'] as Mode[]).map(m => (
            <button key={m} onClick={() => setMode(m)} style={{
              padding: '8px 11px', fontSize: 12, fontWeight: mode === m ? 600 : 400,
              border: 'none', borderBottom: mode === m ? '2px solid #3b82f6' : '2px solid transparent',
              background: 'none', cursor: 'pointer',
              color: mode === m ? '#2563eb' : '#64748b',
              marginRight: 2, letterSpacing: mode === m ? '-0.01em' : 'normal',
              transition: 'color 0.12s',
            }}>
              {m === 'ecs' ? 'ECS' : m === 'ef' ? 'EF' : 'Chauffage'}
            </button>
          ))}
        </div>

        {/* Contenu */}
        <div style={{ padding: '2px 16px 16px' }}>

          <SectionLabel>Unités</SectionLabel>

          <Row label="Débit">
            <Sel value={prefs.unitDebit} onChange={v => patch({ unitDebit: v as any })}>
              <option value="L/h">L/h</option>
              <option value="m3/h">m³/h</option>
            </Sel>
          </Row>

          <Row label="Pertes de charge">
            <Sel value={prefs.unitDp} onChange={v => patch({ unitDp: v as any })}>
              <option value="Pa">Pa</option>
              <option value="mmCE">mmCE</option>
              <option value="both">Pa / mmCE</option>
            </Sel>
          </Row>

          {mode === 'chauffage' && (
            <Row label="Puissance">
              <Sel
                value={(prefs as any).unitPuissance ?? 'W'}
                onChange={v => patch({ unitPuissance: v } as any)}
              >
                <option value="W">W</option>
                <option value="kW">kW</option>
              </Sel>
            </Row>
          )}

          <SectionLabel>Couleurs des tronçons</SectionLabel>

          <Row label="Aller">
            <ColorSwatch
              value={prefs.colorAller}
              onChange={c => patch({ colorAller: c })}
              onReset={() => patch({ colorAller: def.colorAller })}
            />
          </Row>

          {mode !== 'ef' && (
            <Row label="Retour">
              <ColorSwatch
                value={prefs.colorRetour}
                onChange={c => patch({ colorRetour: c })}
                onReset={() => patch({ colorRetour: def.colorRetour })}
              />
            </Row>
          )}

          <SectionLabel>Trait</SectionLabel>

          <Row label="Épaisseur">
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <input
                type="range" min={0.5} max={2 * PT_R} step={0.5} value={prefs.strokeWidth}
                onChange={e => patch({ strokeWidth: parseFloat(e.target.value) })}
                style={{ width: 90, accentColor: '#3b82f6' }}
              />
              <span style={{ fontSize: 11.5, color: '#64748b', minWidth: 24, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {prefs.strokeWidth}
              </span>
              <ResetBtn onClick={() => patch({ strokeWidth: def.strokeWidth })} />
            </div>
          </Row>

        </div>
      </div>
    </div>
  )
}
