import React, { useState, useRef, useEffect } from 'react'
import { ACCESSORY_TYPES } from '../data/accessories'
import { AccessorySymbol } from './AccessorySymbol'
import type { CalcMode, DisplayPrefs } from '../types'
import { getModeFlags } from '../utils/calcModeFlags'
import { EMETTEUR_TYPES } from '../data/emetteurs'
import type { CustomEmetteurDef } from '../data/emetteurs'
import { TERMINAL_FROID_TYPES } from '../data/terminauxFroids'
import type { CustomTerminalFroidDef } from '../data/terminauxFroids'
import { DEFAULT_DISPLAY_PREFS } from '../utils/projectBuilder'

const ACC_IDS_BY_CALCID: Partial<Record<CalcMode, string[]>> = {
  'alimentation-ecs':      ['vanne_arret', 'clapet_anti_retour', 'filtre_y', 'manometre', 'thermometre', 'vase_expansion', 'purgeur_air', 'robinet_vidange'],
  'bouclage-ecs':          ['vanne_arret', 'clapet_anti_retour', 'filtre_y', 'manometre', 'thermometre', 'vase_expansion', 'purgeur_air', 'robinet_vidange'],
  'alimentation-ef':       ['vanne_arret', 'disconnecteur', 'reducteur_pression', 'filtre_y', 'compteur_eau', 'clapet_anti_retour', 'manometre', 'ballon_anti_belier', 'robinet_vidange'],
  'distribution-chauffage':['vanne_arret', 'clapet_anti_retour', 'soupape_securite', 'pot_boues', 'filtre_y', 'manometre', 'thermometre', 'compteur_energie', 'vase_expansion', 'purgeur_air', 'robinet_vidange'],
}

// Cursor SVG icon for "select" mode
function CursorIcon() {
  return (
    <svg width={12} height={14} viewBox="0 0 10 13" style={{ display: 'block', flexShrink: 0 }}>
      <polygon points="1,1 1,10 3.2,7.8 5,12 6.5,11.4 4.7,7.2 8.5,7.2"
        fill="currentColor" />
    </svg>
  )
}

// Properties icon for "Attribuer" mode
function PropsIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 13 13" style={{ display: 'block', flexShrink: 0 }}>
      <rect x={1} y={1} width={11} height={11} rx={1.5} fill="none" stroke="currentColor" strokeWidth={1.2} />
      <line x1={3.5} y1={4}   x2={9.5} y2={4}   stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
      <line x1={3.5} y1={6.5} x2={9.5} y2={6.5} stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
      <line x1={3.5} y1={9}   x2={7}   y2={9}   stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" />
    </svg>
  )
}

// Square node icon — matches the node symbol drawn on canvas
function NodeSquareIcon() {
  return (
    <svg width={10} height={10} viewBox="0 0 10 10" style={{ display: 'block', flexShrink: 0 }}>
      <rect x={1} y={1} width={8} height={8} fill="currentColor" />
    </svg>
  )
}

// Balancing valve symbol: two triangles tip-to-tip (bowtie) + T mark perpendicular
function VanneIcon({ active = false }) {
  const col = active ? '#1d4ed8' : '#000'
  return (
    <svg width={14} height={18} viewBox="-7 -12 14 18" style={{ display: 'block', flexShrink: 0 }}>
      <polygon points="-6,-5 -6,5 0,0" fill={col} />
      <polygon points="6,-5 6,5 0,0" fill={col} />
      <line x1="0" y1="0" x2="0" y2="-9" stroke={col} strokeWidth="1.5" strokeLinecap="round" />
      <line x1="-3.6" y1="-9" x2="3.6" y2="-9" stroke={col} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// Pump symbol: circle + directional triangle, same geometry as on canvas
function PumpSymbol({ rotation = 0, size = 14, color = '#000', bg = '#fff' }) {
  const r  = size / 2
  const ts = r / 11
  const cx = r + 1, cy = r + 1
  return (
    <svg width={size + 2} height={size + 2} style={{ display: 'block', flexShrink: 0 }}>
      <g transform={`translate(${cx},${cy}) rotate(${rotation})`}>
        <circle r={r} fill={bg} stroke={color} strokeWidth={1.5} />
        <polygon
          points={`${-5*ts},${-6*ts} ${-5*ts},${6*ts} ${7*ts},0`}
          fill={color} />
      </g>
    </svg>
  )
}

const DISPLAY_OPTIONS = [
  { key: 'nomTroncon',        label: 'Nom du tronçon',           calcIds: null },
  { key: 'material',          label: 'Matériau',                 calcIds: null },
  { key: 'dn',                label: 'DN',                       calcIds: null },
  { key: 'length',            label: 'Longueur',                 calcIds: ['bouclage-ecs', 'alimentation-ecs', 'alimentation-ef', 'distribution-chauffage', 'distribution-eauglacee'] },
  { key: 'insulation',        label: 'Isolant & épaisseur',      calcIds: ['bouclage-ecs'] },
  { key: 'debit',             label: 'Débit',                    calcIds: ['bouclage-ecs', 'alimentation-ecs', 'alimentation-ef', 'distribution-chauffage', 'distribution-eauglacee'] },
  { key: 'vitesse',           label: 'Vitesse',                  calcIds: ['bouclage-ecs', 'alimentation-ecs', 'alimentation-ef', 'distribution-chauffage', 'distribution-eauglacee'] },
  { key: 'temperatureNoeud',  label: 'T° nœuds',                calcIds: ['bouclage-ecs'] },
  { key: 'deltaT',            label: 'ΔT tronçon',              calcIds: ['bouclage-ecs'] },
  { key: 'dpTroncon',         label: 'ΔP tronçon',              calcIds: ['bouclage-ecs', 'distribution-chauffage', 'distribution-eauglacee'] },
  { key: 'dpNoeud',           label: 'ΔP cumulée',              calcIds: ['bouclage-ecs', 'distribution-chauffage', 'distribution-eauglacee'] },
  { key: 'rLinear',           label: 'R (Pa/m)',                 calcIds: ['distribution-chauffage', 'distribution-eauglacee'] },
  { key: 'puissanceTroncon',  label: 'Puissances transportées',  calcIds: ['distribution-chauffage', 'distribution-eauglacee'] },
  { key: 'puissanceEmetteur', label: 'Puissances terminal',      calcIds: ['distribution-chauffage', 'distribution-eauglacee'] },
  { key: 'dpEmetteur',        label: 'ΔP terminal',             calcIds: ['distribution-chauffage', 'distribution-eauglacee'] },
  { key: 'pressionDispo',     label: 'Pression disponible',     calcIds: ['alimentation-ecs', 'alimentation-ef'] },
  { key: 'pressionStat',      label: 'Pression statique',       calcIds: ['alimentation-ecs', 'alimentation-ef'] },
  { key: 'equipment',         label: 'Équipements (groupes PP)', calcIds: ['alimentation-ecs', 'alimentation-ef', 'bouclage-ecs'] },
]

export default function Toolbar({
  drawMode, setDrawMode,
  pipeType, setPipeType,
  panelOpen, onTogglePanel,
  errorCount, onShowErrors,
  placingEquipment, onCancelPlacingEquipment,
  onAddProductionECS, onAddPump, hasProductionECS,
  onAddArriveeEF,
  onAddProductionChauffage, hasProductionChauffage, onAddPumpChauffage,
  onAddEmetteur,
  onAddProductionEauGlacee, hasProductionEauGlacee, onAddTerminalFroid,
  canvasDisplay, onCanvasDisplayToggle,
  activeFluidId, activeCalcId,
  pdcParams,
  displayPrefs,
  placingAccessoryType, onPlacingAccessoryTypeChange,
  customEmetteurTypes = [],
  onAddCustomEmetteurType,
  onRemoveCustomEmetteurType,
  customTerminalFroidTypes = [],
  onAddCustomTerminalFroidType,
  onRemoveCustomTerminalFroidType,
}: {
  drawMode: string; setDrawMode: any; pipeType: string; setPipeType: any
  panelOpen: boolean; onTogglePanel: any
  errorCount: number; onShowErrors: any
  placingEquipment: any; onCancelPlacingEquipment: any
  onAddProductionECS: any; onAddPump: any; hasProductionECS: boolean
  onAddArriveeEF: any
  onAddProductionChauffage: any; hasProductionChauffage: boolean; onAddPumpChauffage: any
  onAddEmetteur: any
  onAddProductionEauGlacee: any; hasProductionEauGlacee: boolean; onAddTerminalFroid: any
  canvasDisplay: any; onCanvasDisplayToggle: any
  activeFluidId: string | null; activeCalcId: CalcMode | null
  pdcParams: any
  displayPrefs?: DisplayPrefs
  placingAccessoryType: string | null; onPlacingAccessoryTypeChange: any
  customEmetteurTypes?: CustomEmetteurDef[]
  onAddCustomEmetteurType?: (def: CustomEmetteurDef) => void
  onRemoveCustomEmetteurType?: (id: string) => void
  customTerminalFroidTypes?: CustomTerminalFroidDef[]
  onAddCustomTerminalFroidType?: (def: CustomTerminalFroidDef) => void
  onRemoveCustomTerminalFroidType?: (id: string) => void
}) {
  const [displayOpen, setDisplayOpen] = useState(false)
  const displayRef = useRef(null)
  const [accOpen, setAccOpen] = useState(false)
  const [emetteurOpen, setEmetteurOpen] = useState(false)
  const emetteurRef = useRef(null)
  const [emetteurParams, setEmetteurParams] = useState<Record<string, { T_entree: number | null; T_sortie: number | null; puissance: number | null }>>(() =>
    Object.fromEntries(EMETTEUR_TYPES.map(em => [em.id, { T_entree: em.T_entreeDefault, T_sortie: em.T_sortieDefault, puissance: null }]))
  )
  const [terminalFroidOpen, setTerminalFroidOpen] = useState(false)
  const terminalFroidRef = useRef(null)
  const [terminalFroidParams, setTerminalFroidParams] = useState<Record<string, { T_entree: number | null; T_sortie: number | null; puissance: number | null }>>(() =>
    Object.fromEntries(TERMINAL_FROID_TYPES.map(tf => [tf.id, { T_entree: tf.T_entreeDefault, T_sortie: tf.T_sortieDefault, puissance: null }]))
  )
  const [showNewEmForm, setShowNewEmForm] = useState(false)
  const [newEmLabel, setNewEmLabel] = useState('')
  const [newEmTe, setNewEmTe] = useState<number | null>(null)
  const [newEmTs, setNewEmTs] = useState<number | null>(null)
  const [newEmPuissance, setNewEmPuissance] = useState<number | null>(null)
  const [showNewTfForm, setShowNewTfForm] = useState(false)
  const [newTfLabel, setNewTfLabel] = useState('')
  const [newTfTe, setNewTfTe] = useState<number | null>(null)
  const [newTfTs, setNewTfTs] = useState<number | null>(null)
  const [newTfPuissance, setNewTfPuissance] = useState<number | null>(null)
  const { isAlimEF, isChauffage, isEauGlacee } = getModeFlags(activeCalcId)

  useEffect(() => {
    setEmetteurParams(prev => {
      const next = { ...prev }
      for (const em of customEmetteurTypes) {
        if (!next[em.id]) next[em.id] = { T_entree: em.T_entreeDefault, T_sortie: em.T_sortieDefault, puissance: null }
      }
      return next
    })
  }, [customEmetteurTypes])

  useEffect(() => {
    setTerminalFroidParams(prev => {
      const next = { ...prev }
      for (const tf of customTerminalFroidTypes) {
        if (!next[tf.id]) next[tf.id] = { T_entree: tf.T_entreeDefault, T_sortie: tf.T_sortieDefault, puissance: null }
      }
      return next
    })
  }, [customTerminalFroidTypes])
  const [accPos, setAccPos] = useState({ top: 0, left: 0 })
  const accRef = useRef(null)

  useEffect(() => {
    if (!displayOpen) return
    const handle = (e) => { if (!displayRef.current?.contains(e.target)) setDisplayOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [displayOpen])

  useEffect(() => {
    if (!emetteurOpen) return
    const handle = (e) => { if (!emetteurRef.current?.contains(e.target)) setEmetteurOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [emetteurOpen])

  useEffect(() => {
    if (!terminalFroidOpen) return
    const handle = (e) => { if (!terminalFroidRef.current?.contains(e.target)) setTerminalFroidOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [terminalFroidOpen])

  useEffect(() => {
    if (!accOpen) return
    const handle = (e) => { if (!accRef.current?.contains(e.target) && !placingAccessoryType) setAccOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [accOpen, placingAccessoryType])

  const cancelVanne = () => {
    if (drawMode === 'draw' && pipeType === 'vanne') setDrawMode('select')
  }

  const cancelEquipment = () => {
    if (placingEquipment) onCancelPlacingEquipment?.()
  }

  const openAcc = () => {
    cancelVanne()
    cancelEquipment()
    if (accOpen) { setAccOpen(false); return }
    if (accRef.current) {
      const rect   = accRef.current.getBoundingClientRect()
      const ids    = ACC_IDS_BY_CALCID[activeCalcId] ?? []
      const popW   = Math.min(ids.length * 36 - 2 + 16, window.innerWidth - 24)
      const left   = Math.max(12, Math.min(rect.left, window.innerWidth - popW - 12))
      setAccPos({ top: rect.bottom + 6, left })
    }
    setAccOpen(true)
  }

  const closeAcc = () => {
    setAccOpen(false)
    onPlacingAccessoryTypeChange?.(null)
  }

  const activateDraw = (type) => {
    closeAcc()
    cancelEquipment()
    if (drawMode === 'draw' && pipeType === type) {
      setDrawMode('select')
    } else {
      setDrawMode('draw')
      setPipeType(type)
    }
  }

  const isSelect = drawMode === 'select'

  const isEditParams = drawMode === 'editParams'

  // ── État 1 : aucun fluide sélectionné ───────────────
  if (!activeFluidId) {
    return <div className="toolbar" />
  }

  // ── État 2 : fluide choisi, sous-mode non encore sélectionné ─
  if (!activeCalcId) {
    return <div className="toolbar" />
  }

  // ── État 3 : sous-mode sélectionné — toolbar complète ────────
  return (
    <div className="toolbar">

      <div className="toolbar-sep" />

      {/* Select mode */}
      <button
        className={`tb-btn ${isSelect ? 'active' : ''}`}
        onClick={() => { closeAcc(); cancelEquipment(); setDrawMode('select') }}
>
        <CursorIcon /> Sélectionner
      </button>

      {/* Attribuer params — right after Sélectionner */}
      <button
        className={`tb-btn ${isEditParams ? 'active' : ''}`}
        onClick={() => { closeAcc(); cancelEquipment(); setDrawMode(isEditParams ? 'select' : 'editParams') }}
        >
        <PropsIcon /> Attribuer
      </button>

      {/* Afficher — options d'étiquettes sur le schéma */}
      <div ref={displayRef} style={{ position: 'relative' }}>
        <button
          className={`tb-btn ${displayOpen ? 'active' : ''}`}
          onClick={() => { closeAcc(); cancelVanne(); cancelEquipment(); setDisplayOpen(o => !o) }}
          >
          Afficher ▾
        </button>
        {displayOpen && (
          <div className="tb-display-popover">
            {DISPLAY_OPTIONS
              .filter(o => !o.calcIds || o.calcIds.includes(activeCalcId))
              .map(({ key, label }) => {
                const active = !!canvasDisplay?.[key]
                return (
                  <label key={key} className="tb-display-item">
                    <input type="checkbox" checked={active}
                      onChange={() => onCanvasDisplayToggle?.(key)} />
                    <span>{label}</span>
                  </label>
                )
              })}
          </div>
        )}
      </div>

      <div className="toolbar-sep" />

      {/* Draw tools */}
      <div className="toolbar-group">
        <span className="toolbar-label">Tracé :</span>
        {isAlimEF ? (() => {
          const c = (displayPrefs ?? DEFAULT_DISPLAY_PREFS).ef.colorAller
          const sw = Math.max(2, (displayPrefs ?? DEFAULT_DISPLAY_PREFS).ef.strokeWidth)
          return (
            <button
              className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'aller' ? 'active-aller-ef' : ''}`}
              onClick={() => activateDraw('aller')}
            >
              <span style={{ display: 'inline-block', width: 22, height: sw, background: c, borderRadius: 1 }} />
              Aller EF
            </button>
          )
        })() : isChauffage ? (() => {
          const p = (displayPrefs ?? DEFAULT_DISPLAY_PREFS).chauffage
          const sw = Math.max(2, p.strokeWidth)
          return (
            <>
              <button
                className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'aller' ? 'active-aller' : ''}`}
                onClick={() => activateDraw('aller')}
              >
                <span style={{ display: 'inline-block', width: 22, height: sw, background: p.colorAller, borderRadius: 1 }} />
                Aller CH
              </button>
              <button
                className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'retour' ? 'active-retour' : ''}`}
                onClick={() => activateDraw('retour')}
              >
                <span style={{ display: 'inline-block', width: 22, height: 0, borderTop: `${sw}px dashed ${p.colorRetour}` }} />
                Retour CH
              </button>
            </>
          )
        })() : isEauGlacee ? (() => {
          const p = (displayPrefs ?? DEFAULT_DISPLAY_PREFS).eauglacee
          const sw = Math.max(2, p.strokeWidth)
          return (
            <>
              <button
                className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'aller' ? 'active-aller-eg' : ''}`}
                onClick={() => activateDraw('aller')}
              >
                <span style={{ display: 'inline-block', width: 22, height: sw, background: p.colorAller, borderRadius: 1 }} />
                Aller EG
              </button>
              <button
                className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'retour' ? 'active-retour-eg' : ''}`}
                onClick={() => activateDraw('retour')}
              >
                <span style={{ display: 'inline-block', width: 22, height: 0, borderTop: `${sw}px dashed ${p.colorRetour}` }} />
                Retour EG
              </button>
            </>
          )
        })() : (() => {
          const p = (displayPrefs ?? DEFAULT_DISPLAY_PREFS).ecs
          const sw = Math.max(2, p.strokeWidth)
          return (
            <>
              <button
                className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'aller' ? 'active-aller' : ''}`}
                onClick={() => activateDraw('aller')}
              >
                <span style={{ display: 'inline-block', width: 22, height: sw, background: p.colorAller, borderRadius: 1 }} />
                Aller ECS
              </button>
              <button
                className={`tb-btn pipe-btn ${drawMode === 'draw' && pipeType === 'retour' ? 'active-retour' : ''}`}
                onClick={() => activateDraw('retour')}
              >
                <span style={{ display: 'inline-block', width: 22, height: 0, borderTop: `${sw}px dashed ${p.colorRetour}` }} />
                Retour ECS
              </button>
            </>
          )
        })()}
        <button
          className={`tb-btn ${drawMode === 'draw' && pipeType === 'point' ? 'active' : ''}`}
          onClick={() => activateDraw('point')}
          >
          <NodeSquareIcon /> Nœud
        </button>
      </div>

      <div className="toolbar-sep" />

      {/* Equipment */}
      <div className="toolbar-group">
        <span className="toolbar-label">Équipements :</span>

        {/* Arrivée EF — alimentation-ef uniquement */}
        {isAlimEF && (
          <button
            className={`tb-btn ${placingEquipment?.type === 'arriveeEF' ? 'active' : ''}`}
            onClick={() => { closeAcc(); onAddArriveeEF?.() }}
          >
            Arrivée EF
          </button>
        )}

        {/* Équipements Chauffage */}
        {isChauffage && (
          <>
            <button
              className={`tb-btn ${placingEquipment?.type === 'productionChauffage' ? 'active' : ''}`}
              onClick={() => { closeAcc(); cancelVanne(); onAddProductionChauffage?.() }}
              disabled={hasProductionChauffage}
            >
              Prod. Chauffage
            </button>
            {/* Émetteurs dropdown */}
            <div ref={emetteurRef} style={{ position: 'relative' }}>
              <button
                className={`tb-btn ${emetteurOpen || placingEquipment?.type === 'emetteur' ? 'active' : ''}`}
                onClick={() => { closeAcc(); cancelVanne(); setEmetteurOpen(o => !o) }}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <svg width={18} height={12} viewBox="0 0 18 12" style={{ display: 'block', flexShrink: 0 }}>
                  <rect x={0.6} y={0.6} width={16.8} height={10.8} fill="none" stroke="currentColor" strokeWidth={1.2} rx={1} />
                  {[4.5, 9, 13.5].map((x, i) => (
                    <line key={i} x1={x} y1={2} x2={x} y2={10} stroke="currentColor" strokeWidth={0.9} />
                  ))}
                </svg>
                Émetteur {emetteurOpen ? '▲' : '▾'}
              </button>
              {emetteurOpen && (
                <div className="tb-display-popover" style={{ padding: '6px 8px 8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'max-content 44px 44px 50px', columnGap: 6, rowGap: 1, alignItems: 'center' }}>
                    {/* En-tête */}
                    <span />
                    <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 2 }}>T entrée</span>
                    <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 2 }}>T sortie</span>
                    <span style={{ fontSize: 9, color: '#9ca3af', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 2 }}>P W</span>
                    {/* Séparateur */}
                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', margin: '2px 0 3px' }} />
                    {/* Lignes */}
                    {[...EMETTEUR_TYPES, ...customEmetteurTypes].map(em => {
                      const p = emetteurParams[em.id] ?? { T_entree: em.T_entreeDefault, T_sortie: em.T_sortieDefault, puissance: null }
                      const setP = (patch: Partial<typeof p>) =>
                        setEmetteurParams(prev => ({ ...prev, [em.id]: { ...prev[em.id], ...patch } }))
                      const T_e = p.T_entree ?? em.T_entreeDefault
                      const T_s = p.T_sortie ?? em.T_sortieDefault
                      const doPlace = () => { setEmetteurOpen(false); onAddEmetteur?.(em.id, T_e, T_s, p.puissance) }
                      const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') doPlace() }
                      const commitT = (field: 'T_entree' | 'T_sortie', raw: string, def: number) => {
                        const v = parseFloat(raw)
                        setP({ [field]: (isNaN(v) || v < 1) ? def : Math.min(150, Math.round(v)) } as any)
                      }
                      const isCustom = !EMETTEUR_TYPES.some(b => b.id === em.id)
                      return (
                        <React.Fragment key={em.id}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <button onClick={doPlace} className="tb-display-item"
                              style={{ flex: 1, padding: '4px 4px 4px 4px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 11, color: '#1e293b', borderRadius: 4, whiteSpace: 'nowrap' }}>
                              {em.label}
                            </button>
                            {isCustom && (
                              <button onClick={e => { e.stopPropagation(); onRemoveCustomEmetteurType?.(em.id) }}
                                style={{ flexShrink: 0, width: 16, height: 16, padding: 0, border: '1px solid #fca5a5', borderRadius: 3, background: '#fff7f7', color: '#dc2626', fontSize: 9, cursor: 'pointer', lineHeight: 1 }}>
                                ✕
                              </button>
                            )}
                          </div>
                          <input type="number" min={1} max={150} step={1}
                            value={p.T_entree ?? ''}
                            onChange={e => setP({ T_entree: e.target.value === '' ? null : Number(e.target.value) })}
                            onBlur={e => commitT('T_entree', e.target.value, em.T_entreeDefault)}
                            onKeyDown={onKey} onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textAlign: 'right', fontWeight: 600, color: '#1e293b', background: '#f8fafc' }} />
                          <input type="number" min={1} max={150} step={1}
                            value={p.T_sortie ?? ''}
                            onChange={e => setP({ T_sortie: e.target.value === '' ? null : Number(e.target.value) })}
                            onBlur={e => commitT('T_sortie', e.target.value, em.T_sortieDefault)}
                            onKeyDown={onKey} onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textAlign: 'right', fontWeight: 600, color: '#1e293b', background: '#f8fafc' }} />
                          <input type="number" min={1} step={100}
                            value={p.puissance ?? ''}
                            placeholder="—"
                            onChange={e => setP({ puissance: e.target.value === '' ? null : Math.max(1, Number(e.target.value)) })}
                            onKeyDown={onKey} onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textAlign: 'right', background: '#f8fafc', color: p.puissance != null ? '#1e293b' : '#9ca3af' }} />
                        </React.Fragment>
                      )
                    })}
                    {/* Séparateur + formulaire de création dans la même grille */}
                    {showNewEmForm && <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', margin: '4px 0 2px' }} />}
                    {!showNewEmForm ? (
                      <button
                        onClick={e => { e.stopPropagation(); setShowNewEmForm(true) }}
                        style={{ gridColumn: '1 / -1', marginTop: 5, padding: '3px 6px', fontSize: 11, border: '1px dashed #d1d5db', borderRadius: 4, background: 'none', color: '#6b7280', cursor: 'pointer', textAlign: 'left' }}
                      >
                        + Ajouter un émetteur
                      </button>
                    ) : (
                      <>
                        <input
                          type="text" placeholder="Nom" size={1}
                          value={newEmLabel}
                          onChange={e => setNewEmLabel(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          autoFocus
                          style={{ width: '100%', padding: '3px 5px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11 }}
                        />
                        <input type="number" min={1} max={150} step={1}
                          value={newEmTe ?? ''}
                          placeholder="°C"
                          onChange={e => setNewEmTe(e.target.value === '' ? null : Number(e.target.value))}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '3px 4px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11, textAlign: 'right' }} />
                        <input type="number" min={1} max={150} step={1}
                          value={newEmTs ?? ''}
                          placeholder="°C"
                          onChange={e => setNewEmTs(e.target.value === '' ? null : Number(e.target.value))}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '3px 4px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11, textAlign: 'right' }} />
                        <input type="number" min={1} step={100}
                          value={newEmPuissance ?? ''}
                          placeholder="—"
                          onChange={e => setNewEmPuissance(e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '3px 4px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11, textAlign: 'right', color: newEmPuissance != null ? '#1e293b' : '#9ca3af' }} />
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 4, marginTop: 2 }}>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              const label = newEmLabel.trim()
                              if (!label) return
                              const id = `custom-em-${Date.now()}`
                              const Te = newEmTe ?? 70; const Ts = newEmTs ?? 50
                              onAddCustomEmetteurType?.({ id, label, deltaTDefault: Math.abs(Te - Ts), T_entreeDefault: Te, T_sortieDefault: Ts })
                              setNewEmLabel(''); setNewEmTe(null); setNewEmTs(null); setNewEmPuissance(null); setShowNewEmForm(false)
                            }}
                            disabled={!newEmLabel.trim()}
                            style={{ flex: 1, padding: '4px 6px', fontSize: 11, fontWeight: 600, border: '1px solid #86efac', borderRadius: 4, background: '#f0fdf4', color: '#15803d', cursor: newEmLabel.trim() ? 'pointer' : 'not-allowed', opacity: newEmLabel.trim() ? 1 : 0.5 }}
                          >
                            Créer
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setShowNewEmForm(false); setNewEmLabel(''); setNewEmTe(null); setNewEmTs(null); setNewEmPuissance(null) }}
                            style={{ padding: '4px 8px', fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 4, background: '#f8fafc', color: '#6b7280', cursor: 'pointer' }}
                          >
                            Annuler
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              className={`tb-btn ${placingEquipment?.type === 'pump' ? 'active' : ''}`}
              onClick={() => { closeAcc(); cancelVanne(); onAddPumpChauffage?.() }}
            >
              <PumpSymbol
                rotation={180}
                color={placingEquipment?.type === 'pump' ? '#1d4ed8' : '#000'}
                bg={placingEquipment?.type === 'pump' ? '#dbeafe' : '#fff'}
              />
              Pompe
            </button>
            <button
              className={`tb-btn ${drawMode === 'draw' && pipeType === 'vanne' ? 'active' : ''}`}
              onClick={() => activateDraw('vanne')}
            >
              <VanneIcon active={drawMode === 'draw' && pipeType === 'vanne'} />
              Vanne équilib.
            </button>
          </>
        )}

        {/* Équipements Eau Glacée */}
        {isEauGlacee && (
          <>
            <button
              className={`tb-btn ${placingEquipment?.type === 'productionEauGlacee' ? 'active' : ''}`}
              onClick={() => { closeAcc(); cancelVanne(); onAddProductionEauGlacee?.() }}
              disabled={hasProductionEauGlacee}
            >
              Groupe froid
            </button>
            {/* Terminaux froids dropdown */}
            <div ref={terminalFroidRef} style={{ position: 'relative' }}>
              <button
                className={`tb-btn ${terminalFroidOpen || placingEquipment?.type === 'terminalFroid' ? 'active' : ''}`}
                onClick={() => { closeAcc(); cancelVanne(); setTerminalFroidOpen(o => !o) }}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
              >
                <svg width={20} height={13} viewBox="0 0 20 13" style={{ display: 'block', flexShrink: 0 }}>
                  <rect x={0.6} y={0.6} width={18.8} height={11.8} fill="none" stroke="currentColor" strokeWidth={1.2} rx={1.5} />
                  {[5, 10, 15].map((x, i) => (
                    <line key={i} x1={x} y1={1.75} x2={x} y2={12.25} stroke="currentColor" strokeWidth={1} strokeDasharray="2,1.5" />
                  ))}
                </svg>
                Terminal froid {terminalFroidOpen ? '▲' : '▾'}
              </button>
              {terminalFroidOpen && (
                <div className="tb-display-popover" style={{ padding: '6px 8px 8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'max-content 44px 44px 50px', columnGap: 6, rowGap: 1, alignItems: 'center' }}>
                    <span />
                    <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 2 }}>T entrée</span>
                    <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 2 }}>T sortie</span>
                    <span style={{ fontSize: 9, color: '#6b7280', fontWeight: 700, textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: 2 }}>P W</span>
                    <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #f1f5f9', margin: '2px 0 3px' }} />
                    {[...TERMINAL_FROID_TYPES, ...customTerminalFroidTypes].map(tf => {
                      const p = terminalFroidParams[tf.id] ?? { T_entree: tf.T_entreeDefault, T_sortie: tf.T_sortieDefault, puissance: null }
                      const setP = (patch: Partial<typeof p>) =>
                        setTerminalFroidParams(prev => ({ ...prev, [tf.id]: { ...prev[tf.id], ...patch } }))
                      const T_e = p.T_entree ?? tf.T_entreeDefault
                      const T_s = p.T_sortie ?? tf.T_sortieDefault
                      const doPlace = () => { setTerminalFroidOpen(false); onAddTerminalFroid?.(tf.id, T_e, T_s, p.puissance) }
                      const onKey = (e: React.KeyboardEvent) => { if (e.key === 'Enter') doPlace() }
                      const commitT = (field: 'T_entree' | 'T_sortie', raw: string, def: number) => {
                        const v = parseFloat(raw)
                        setP({ [field]: (isNaN(v) || v < 0) ? def : Math.min(30, Math.round(v)) } as any)
                      }
                      const isCustom = !TERMINAL_FROID_TYPES.some(b => b.id === tf.id)
                      return (
                        <React.Fragment key={tf.id}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <button onClick={doPlace} className="tb-display-item"
                              style={{ flex: 1, padding: '4px 4px 4px 4px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer', fontSize: 11, color: '#1e293b', borderRadius: 4, whiteSpace: 'nowrap' }}>
                              {tf.label}
                            </button>
                            {isCustom && (
                              <button onClick={e => { e.stopPropagation(); onRemoveCustomTerminalFroidType?.(tf.id) }}
                                style={{ flexShrink: 0, width: 16, height: 16, padding: 0, border: '1px solid #fca5a5', borderRadius: 3, background: '#fff7f7', color: '#dc2626', fontSize: 9, cursor: 'pointer', lineHeight: 1 }}>
                                ✕
                              </button>
                            )}
                          </div>
                          <input type="number" min={0} max={30} step={1}
                            value={p.T_entree ?? ''}
                            onChange={e => setP({ T_entree: e.target.value === '' ? null : Number(e.target.value) })}
                            onBlur={e => commitT('T_entree', e.target.value, tf.T_entreeDefault)}
                            onKeyDown={onKey} onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textAlign: 'right', fontWeight: 600, color: '#1e293b', background: '#f8fafc' }} />
                          <input type="number" min={0} max={30} step={1}
                            value={p.T_sortie ?? ''}
                            onChange={e => setP({ T_sortie: e.target.value === '' ? null : Number(e.target.value) })}
                            onBlur={e => commitT('T_sortie', e.target.value, tf.T_sortieDefault)}
                            onKeyDown={onKey} onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textAlign: 'right', fontWeight: 600, color: '#1e293b', background: '#f8fafc' }} />
                          <input type="number" min={1} step={100}
                            value={p.puissance ?? ''}
                            placeholder="—"
                            onChange={e => setP({ puissance: e.target.value === '' ? null : Math.max(1, Number(e.target.value)) })}
                            onKeyDown={onKey} onClick={e => e.stopPropagation()}
                            style={{ width: '100%', padding: '3px 4px', border: '1px solid #e2e8f0', borderRadius: 4, fontSize: 11, textAlign: 'right', background: '#f8fafc', color: p.puissance != null ? '#1e293b' : '#9ca3af' }} />
                        </React.Fragment>
                      )
                    })}
                    {/* Séparateur + formulaire de création dans la même grille */}
                    {showNewTfForm && <div style={{ gridColumn: '1 / -1', borderTop: '1px solid #e2e8f0', margin: '4px 0 2px' }} />}
                    {!showNewTfForm ? (
                      <button
                        onClick={e => { e.stopPropagation(); setShowNewTfForm(true) }}
                        style={{ gridColumn: '1 / -1', marginTop: 5, padding: '3px 6px', fontSize: 11, border: '1px dashed #d1d5db', borderRadius: 4, background: 'none', color: '#6b7280', cursor: 'pointer', textAlign: 'left' }}
                      >
                        + Ajouter un terminal froid
                      </button>
                    ) : (
                      <>
                        <input
                          type="text" placeholder="Nom" size={1}
                          value={newTfLabel}
                          onChange={e => setNewTfLabel(e.target.value)}
                          onClick={e => e.stopPropagation()}
                          autoFocus
                          style={{ width: '100%', padding: '3px 5px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11 }}
                        />
                        <input type="number" min={0} max={30} step={1}
                          value={newTfTe ?? ''}
                          placeholder="°C"
                          onChange={e => setNewTfTe(e.target.value === '' ? null : Number(e.target.value))}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '3px 4px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11, textAlign: 'right' }} />
                        <input type="number" min={0} max={30} step={1}
                          value={newTfTs ?? ''}
                          placeholder="°C"
                          onChange={e => setNewTfTs(e.target.value === '' ? null : Number(e.target.value))}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '3px 4px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11, textAlign: 'right' }} />
                        <input type="number" min={1} step={100}
                          value={newTfPuissance ?? ''}
                          placeholder="—"
                          onChange={e => setNewTfPuissance(e.target.value === '' ? null : Math.max(1, Number(e.target.value)))}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '3px 4px', border: '1px solid #93c5fd', borderRadius: 4, fontSize: 11, textAlign: 'right', color: newTfPuissance != null ? '#1e293b' : '#9ca3af' }} />
                        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 4, marginTop: 2 }}>
                          <button
                            onClick={e => {
                              e.stopPropagation()
                              const label = newTfLabel.trim()
                              if (!label) return
                              const id = `custom-tf-${Date.now()}`
                              const Te = newTfTe ?? 7; const Ts = newTfTs ?? 12
                              onAddCustomTerminalFroidType?.({ id, label, deltaTDefault: Math.abs(Ts - Te), T_entreeDefault: Te, T_sortieDefault: Ts })
                              setNewTfLabel(''); setNewTfTe(null); setNewTfTs(null); setNewTfPuissance(null); setShowNewTfForm(false)
                            }}
                            disabled={!newTfLabel.trim()}
                            style={{ flex: 1, padding: '4px 6px', fontSize: 11, fontWeight: 600, border: '1px solid #86efac', borderRadius: 4, background: '#f0fdf4', color: '#15803d', cursor: newTfLabel.trim() ? 'pointer' : 'not-allowed', opacity: newTfLabel.trim() ? 1 : 0.5 }}
                          >
                            Créer
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setShowNewTfForm(false); setNewTfLabel(''); setNewTfTe(null); setNewTfTs(null); setNewTfPuissance(null) }}
                            style={{ padding: '4px 8px', fontSize: 11, border: '1px solid #e2e8f0', borderRadius: 4, background: '#f8fafc', color: '#6b7280', cursor: 'pointer' }}
                          >
                            Annuler
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button
              className={`tb-btn ${placingEquipment?.type === 'pump' ? 'active' : ''}`}
              onClick={() => { closeAcc(); cancelVanne(); onAddPumpChauffage?.() }}
            >
              <PumpSymbol
                rotation={180}
                color={placingEquipment?.type === 'pump' ? '#1d4ed8' : '#000'}
                bg={placingEquipment?.type === 'pump' ? '#dbeafe' : '#fff'}
              />
              Pompe
            </button>
            <button
              className={`tb-btn ${drawMode === 'draw' && pipeType === 'vanne' ? 'active' : ''}`}
              onClick={() => activateDraw('vanne')}
            >
              <VanneIcon active={drawMode === 'draw' && pipeType === 'vanne'} />
              Vanne équilib.
            </button>
          </>
        )}

        {/* Équipements ECS — hors alimentation-ef et hors chauffage */}
        {!isAlimEF && !isChauffage && !isEauGlacee && (
          <>
            <button
              className={`tb-btn ${placingEquipment?.type === 'productionECS' ? 'active' : ''}`}
              onClick={() => { closeAcc(); cancelVanne(); onAddProductionECS?.() }}
              disabled={hasProductionECS}
            >
              Prod. ECS
            </button>
            <button
              className={`tb-btn ${placingEquipment?.type === 'pump' ? 'active' : ''}`}
              onClick={() => { closeAcc(); cancelVanne(); onAddPump?.() }}
            >
              <PumpSymbol
                rotation={180}
                color={placingEquipment?.type === 'pump' ? '#1d4ed8' : '#000'}
                bg={placingEquipment?.type === 'pump' ? '#dbeafe' : '#fff'}
              />
              Pompe
            </button>
            <button
              className={`tb-btn ${drawMode === 'draw' && pipeType === 'vanne' ? 'active' : ''}`}
              onClick={() => activateDraw('vanne')}
            >
              <VanneIcon active={drawMode === 'draw' && pipeType === 'vanne'} />
              Vanne équilib.
            </button>
          </>
        )}

        {/* Popover accessoires — toujours visible */}
        <div ref={accRef}>
          <button
            className={`tb-btn ${accOpen || placingAccessoryType ? 'active' : ''}`}
            onClick={openAcc}
          >
            Accessoires {accOpen ? '▲' : '▾'}
          </button>
          {accOpen && (
            <div className="tb-acc-popover" style={{ top: accPos.top, left: accPos.left }}>
              <div className="tb-acc-grid">
                {(ACC_IDS_BY_CALCID[activeCalcId] ?? []).map(accId => {
                  const acc = ACCESSORY_TYPES.find(a => a.id === accId)
                  if (!acc) return null
                  const isActive = placingAccessoryType === accId
                  return (
                    <button
                      key={accId}
                      className={`tb-acc-item${isActive ? ' tb-acc-item-active' : ''}`}
                      data-tooltip={acc.label}
                      onClick={() => onPlacingAccessoryTypeChange?.(isActive ? null : accId)}
                    >
                      <svg width={18} height={18} viewBox="-11 -11 22 22">
                        <AccessorySymbol type={accId} />
                      </svg>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Errors */}
      {(errorCount > 0 || drawMode === 'errors') && (
        <>
          <div className="toolbar-sep" />
          <button
            className={`tb-btn${drawMode === 'errors' ? ' active' : ''}`}
            onClick={() => drawMode === 'errors' ? setDrawMode('select') : onShowErrors()}
            style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', fontWeight: 700 }}>
            ⚠ {errorCount} erreur{errorCount > 1 ? 's' : ''}
          </button>
        </>
      )}

      {/* Contextual hints */}

    </div>
  )
}
