import { useState, useRef, useEffect } from 'react'
import { FITTING_TYPES, EQUIPMENT_TYPES, getEquipmentForMode } from '../utils/pdcCalc'
import { NumInput } from './NumInput'

export function SegFittingsPanel({ seg, set, pdcParams }) {
  const [addOpen, setAddOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!addOpen) return
    const h = (e: MouseEvent) => { if (!dropRef.current?.contains(e.target as Node)) setAddOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [addOpen])

  const fittings: any[]  = seg.fittings ?? []
  const libOverrides     = pdcParams?.fittingOverrides ?? {}

  const setCount = (typeId: string, n: number) => {
    if (n <= 0) set('fittings', fittings.filter(f => f.type !== typeId))
    else set('fittings', fittings.map(f => f.type === typeId ? { ...f, count: n } : f))
  }
  const setXi = (typeId: string, val: number | null) => {
    set('fittings', fittings.map(f => f.type === typeId ? { ...f, xiOverride: val ?? undefined } : f))
  }
  const del = (typeId: string) => set('fittings', fittings.filter(f => f.type !== typeId))
  const add = (typeId: string) => {
    setAddOpen(false)
    if (!fittings.find(f => f.type === typeId)) {
      set('fittings', [...fittings, { type: typeId, count: 1 }])
    }
  }

  const customLibF: any[] = pdcParams?.customFittings ?? []
  const allStdF = [
    ...FITTING_TYPES,
    ...customLibF.map(t => ({ id: t.id, label: t.label || 'Personnalisé', xi: t.xi })),
  ]
  const available = allStdF.filter(t => !fittings.find(f => f.type === t.id))

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4,
    padding: '5px 8px', background: '#fef7f4', border: '1px solid #fbd5c5', borderRadius: 5,
  }
  const inp = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid #e5e7eb',
    textAlign: 'center' as const, ...extra,
  })

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#c2562d', marginBottom: 5, letterSpacing: '0.03em' }}>
        Accessoires
      </div>

      {fittings.length === 0 && (
        <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginBottom: 6 }}>
          Aucun accessoire sur ce tronçon
        </div>
      )}

      {fittings.map(f => {
        const def       = allStdF.find(t => t.id === f.type)
        const libXi     = def ? (libOverrides[f.type] ?? def.xi) : null
        const xi        = f.xiOverride ?? libXi
        const overridden = f.xiOverride != null
        return (
          <div key={f.type} style={row}>
            <span style={{ flex: 1, fontSize: 10, color: '#374151', lineHeight: 1.3 }}>
              {def?.label ?? f.type}
            </span>
            <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>n</span>
            <NumInput min={1} step={1} value={f.count ?? 1}
              onChange={v => setCount(f.type, Math.max(1, Math.round(v ?? 1)))}
              style={{ ...inp(), width: 32 }} />
            <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>ξ</span>
            <NumInput min={0} step={0.01} value={xi ?? null} allowEmpty
              placeholder={libXi != null ? `${libXi} (par défaut)` : ''}
              onChange={v => setXi(f.type, v)}
              style={{ ...inp({ width: 44, color: overridden ? '#c2562d' : '#374151',
                                border: `1px solid ${overridden ? '#fbd5c5' : '#e5e7eb'}` }) }} />
            {overridden && (
              <button onClick={() => setXi(f.type, null)} title={`Rétablir (ξ = ${libXi})`}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 11, padding: 0, lineHeight: 1 }}>
                ↺
              </button>
            )}
            <button onClick={() => del(f.type)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>
              ×
            </button>
          </div>
        )
      })}

      <div ref={dropRef} style={{ position: 'relative' }}>
        <button onClick={() => setAddOpen(a => !a)}
          style={{ fontSize: 10, padding: '3px 10px', border: '1px dashed #c2562d', borderRadius: 5,
                   color: '#c2562d', background: addOpen ? '#fff7ed' : 'transparent', cursor: 'pointer', fontWeight: 600 }}>
          + Ajouter
        </button>
        {addOpen && (
          <div style={{ position: 'absolute', left: 0, top: '110%', zIndex: 300, background: '#fff',
                        border: '1px solid #e5e7eb', borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 250, padding: 6 }}>
            {available.length === 0 ? (
              <div style={{ padding: '6px 10px', fontSize: 10, color: '#9ca3af' }}>
                Tous les accessoires sont déjà ajoutés
              </div>
            ) : available.map(t => {
              const libXi = libOverrides[t.id] ?? t.xi
              const long = t.label.length > 32
              return (
                <div key={t.id} onClick={() => add(t.id)}
                  style={{ padding: '5px 10px', fontSize: 10.5, cursor: 'pointer', borderRadius: 5,
                           display: 'flex', flexDirection: long ? 'column' : 'row',
                           alignItems: long ? 'flex-start' : 'baseline', gap: long ? 1 : 6 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#fef0ea')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{t.label}</span>
                  <span style={{ fontSize: 9.5, color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>ξ = {libXi}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export function SegEquipPanel({ seg, set, pdcParams, mode = null }: { seg: any; set: any; pdcParams: any; mode?: string | null }) {
  const [addOpen, setAddOpen] = useState(false)
  const dropRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!addOpen) return
    const h = (e: MouseEvent) => { if (!dropRef.current?.contains(e.target as Node)) setAddOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [addOpen])

  const equipment: any[]  = seg.equipment ?? []
  const libOverrides       = pdcParams?.equipmentOverrides ?? {}

  const setKv = (typeId: string, val: number | null) => {
    set('equipment', equipment.map(e => e.type === typeId ? { ...e, kvOverride: val ?? undefined } : e))
  }
  const del = (typeId: string) => set('equipment', equipment.filter(e => e.type !== typeId))
  const add = (typeId: string) => {
    setAddOpen(false)
    if (!equipment.find(e => e.type === typeId)) {
      set('equipment', [...equipment, { type: typeId }])
    }
  }

  const customLibE: any[] = pdcParams?.customEquipments ?? []
  const allStdE = [
    ...EQUIPMENT_TYPES,
    ...customLibE.map(t => ({ id: t.id, label: t.label || 'Personnalisé', kvDefault: t.kvDefault })),
  ]
  const availableStdE = [
    ...getEquipmentForMode(mode),
    ...customLibE.map(t => ({ id: t.id, label: t.label || 'Personnalisé', kvDefault: t.kvDefault })),
  ]
  const available = availableStdE.filter(t => !equipment.find(e => e.type === t.id))

  const row: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4,
    padding: '5px 8px', background: '#faf8ff', border: '1px solid #ddd6fe', borderRadius: 5,
  }
  const inp = (extra: React.CSSProperties = {}): React.CSSProperties => ({
    fontSize: 10, padding: '2px 4px', borderRadius: 4, border: '1px solid #e5e7eb',
    textAlign: 'center' as const, ...extra,
  })

  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: '#7c3aed', marginBottom: 5, letterSpacing: '0.03em' }}>
        Équipements
      </div>

      {equipment.length === 0 && (
        <div style={{ fontSize: 10, color: '#9ca3af', fontStyle: 'italic', marginBottom: 6 }}>
          Aucun équipement sur ce tronçon
        </div>
      )}

      {equipment.map(e => {
        const def       = allStdE.find(t => t.id === e.type)
        const libKv     = def ? (libOverrides[e.type] ?? def.kvDefault) : null
        const kv        = e.kvOverride ?? libKv
        const overridden = e.kvOverride != null
        const needsKv   = kv == null
        return (
          <div key={e.type} style={row}>
            <span style={{ flex: 1, fontSize: 10, color: '#374151', lineHeight: 1.3 }}>
              {def?.label ?? e.type}
            </span>
            <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0 }}>Kv</span>
            <NumInput min={0} step={0.1} value={kv ?? null} allowEmpty
              placeholder={libKv != null ? `${libKv} (par défaut)` : 'requis'}
              onChange={val => setKv(e.type, val)}
              style={{ ...inp({ width: 50,
                                color: needsKv ? '#f97316' : overridden ? '#7c3aed' : '#374151',
                                border: `1px solid ${needsKv ? '#fed7aa' : overridden ? '#ddd6fe' : '#e5e7eb'}` }) }} />
            <span style={{ fontSize: 8, color: '#9ca3af', flexShrink: 0, lineHeight: 1 }}>m³/h<br/>√bar</span>
            {overridden && libKv != null && (
              <button onClick={() => setKv(e.type, null)} title={`Rétablir (Kv = ${libKv})`}
                style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 11, padding: 0 }}>
                ↺
              </button>
            )}
            <button onClick={() => del(e.type)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 15, padding: '0 2px', lineHeight: 1 }}>
              ×
            </button>
          </div>
        )
      })}

      <div ref={dropRef} style={{ position: 'relative' }}>
        <button onClick={() => setAddOpen(a => !a)}
          style={{ fontSize: 10, padding: '3px 10px', border: '1px dashed #7c3aed', borderRadius: 5,
                   color: '#7c3aed', background: addOpen ? '#faf8ff' : 'transparent', cursor: 'pointer', fontWeight: 600 }}>
          + Ajouter
        </button>
        {addOpen && (
          <div style={{ position: 'absolute', left: 0, top: '110%', zIndex: 300, background: '#fff',
                        border: '1px solid #e5e7eb', borderRadius: 8,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.12)', minWidth: 250, padding: 6 }}>
            {available.length === 0 ? (
              <div style={{ padding: '6px 10px', fontSize: 10, color: '#9ca3af' }}>
                Tous les équipements sont déjà ajoutés
              </div>
            ) : available.map(t => {
              const libKv = libOverrides[t.id] ?? t.kvDefault
              const long = t.label.length > 32
              return (
                <div key={t.id} onClick={() => add(t.id)}
                  style={{ padding: '5px 10px', fontSize: 10.5, cursor: 'pointer', borderRadius: 5,
                           display: 'flex', flexDirection: long ? 'column' : 'row',
                           alignItems: long ? 'flex-start' : 'baseline', gap: long ? 1 : 6 }}
                  onMouseEnter={e => (e.currentTarget.style.background = '#faf8ff')}
                  onMouseLeave={e => (e.currentTarget.style.background = '')}>
                  <span>{t.label}</span>
                  <span style={{ fontSize: 9.5, color: '#9ca3af', fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                    Kv = {libKv ?? '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
