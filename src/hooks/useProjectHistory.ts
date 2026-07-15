import { useState, useRef, useCallback, useEffect } from 'react'
import { uid } from '../utils/idGen'
import { buildFluidSetupProject, initProject } from '../utils/projectBuilder'
import { DEFAULT_MATERIALS } from '../data/materials'
import { DEFAULT_INSULATIONS } from '../data/insulations'

export function useVariantHistory() {
  const INIT_ID = 'v0'
  // Per-variant undo stacks — never serialized, reset on load
  const histRef = useRef<Record<string, { stack: any[], idx: number }>>({ [INIT_ID]: { stack: [buildFluidSetupProject(1, 3, 3)], idx: 0 } })

  const [meta,        setMeta]        = useState([{ id: INIT_ID, name: '', isBase: true }])
  const [activeId,    setActiveId]    = useState(INIT_ID)
  const [projectName, setProjectName] = useState('')
  const [, bump] = useState(0)

  // Refs so save callbacks never capture stale state
  const metaRef        = useRef(meta)
  const activeIdRef    = useRef(activeId)
  const projectNameRef = useRef(projectName)
  useEffect(() => { metaRef.current = meta },             [meta])
  useEffect(() => { activeIdRef.current = activeId },     [activeId])
  useEffect(() => { projectNameRef.current = projectName }, [projectName])

  // Sync new DEFAULT_MATERIALS entries into all in-memory variants on mount
  useEffect(() => {
    let changed = false
    Object.values(histRef.current).forEach(hist => {
      const data = hist.stack[hist.idx]
      let next = data
      if (Array.isArray(data?.materials)) {
        const existingIds = new Set(data.materials.map(m => m.id))
        const missing = DEFAULT_MATERIALS.filter(m => !existingIds.has(m.id))
        if (missing.length > 0) next = { ...next, materials: [...next.materials, ...missing] }
      }
      // Resync built-in insulations (name/λ/épaisseurs) avec le catalogue courant,
      // en conservant l'état "enabled" et les isolants personnalisés
      if (Array.isArray(data?.insulations)) {
        const byId = new Map<string, any>(data.insulations.map((i: any) => [i.id, i]))
        const synced = DEFAULT_INSULATIONS.map(def => {
          const cur = byId.get(def.id)
          return cur ? { ...def, enabled: cur.enabled } : def
        })
        const customOnes = data.insulations.filter((i: any) => i.custom)
        next = { ...next, insulations: [...synced, ...customOnes] }
      }
      // Normalize bad segment types: 'aller-ch'/'retour-ch' → 'aller'/'retour'
      if (Array.isArray(next?.segments)) {
        const hasWrong = next.segments.some((s: any) => s.type === 'aller-ch' || s.type === 'retour-ch')
        if (hasWrong) {
          next = {
            ...next,
            segments: next.segments.map((s: any) =>
              s.type === 'aller-ch' ? { ...s, type: 'aller' }
              : s.type === 'retour-ch' ? { ...s, type: 'retour' }
              : s
            )
          }
        }
      }
      if (next !== data) {
        hist.stack[hist.idx] = next
        changed = true
      }
    })
    if (changed) bump(b => b + 1)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const activeHist = () => histRef.current[activeId]
  const project = activeHist()?.stack[activeHist().idx] ?? initProject()

  const setProject = useCallback((updater) => {
    const h = histRef.current[activeId]
    if (!h) return
    const next = typeof updater === 'function' ? updater(h.stack[h.idx]) : updater
    const stack = [...h.stack.slice(0, h.idx + 1), next]
    h.stack = stack.length > 60 ? stack.slice(-60) : stack
    h.idx   = h.stack.length - 1
    bump(n => n + 1)
  }, [activeId])

  // Patches current history entry in-place — does NOT push a new undo step.
  // Used by auto-corrections (frontier splits, productionECS snap) so they
  // don't pollute the undo stack and don't fight with Ctrl+Z.
  const patchProject = useCallback((updater) => {
    const h = histRef.current[activeId]
    if (!h) return
    const next = typeof updater === 'function' ? updater(h.stack[h.idx]) : updater
    h.stack[h.idx] = next
    bump(n => n + 1)
  }, [activeId])

  // Replaces active variant data entirely and clears its undo stack
  const resetProject = useCallback((data) => {
    const h = histRef.current[activeId]
    if (!h) return
    h.stack = [data]; h.idx = 0
    bump(n => n + 1)
  }, [activeId])

  const undo = useCallback(() => {
    const h = histRef.current[activeId]
    if (h && h.idx > 0) { h.idx--; bump(n => n + 1) }
  }, [activeId])

  const redo = useCallback(() => {
    const h = histRef.current[activeId]
    if (h && h.idx < h.stack.length - 1) { h.idx++; bump(n => n + 1) }
  }, [activeId])

  const canUndo = (activeHist()?.idx ?? 0) > 0
  const canRedo = (activeHist()?.idx ?? 0) < (activeHist()?.stack.length ?? 1) - 1

  const switchVariant = useCallback((id) => { setActiveId(id) }, [])

  const duplicateVariant = useCallback((sourceId) => {
    const sourceH = histRef.current[sourceId]
    if (!sourceH) return
    const copy  = JSON.parse(JSON.stringify(sourceH.stack[sourceH.idx]))
    const newId = uid('v')
    histRef.current[newId] = { stack: [copy], idx: 0 }
    setMeta(prev => {
      setActiveId(newId)
      bump(b => b + 1)
      return [...prev, { id: newId, name: '', isBase: false }]
    })
  }, [])

  const deleteVariant = useCallback((id) => {
    setMeta(prev => {
      if (prev.length <= 1) return prev
      const v = prev.find(m => m.id === id)
      if (!v || v.isBase) return prev
      delete histRef.current[id]
      const remaining = prev.filter(m => m.id !== id)
      setActiveId(cur => {
        if (cur !== id) return cur
        return remaining.find(m => m.isBase)?.id ?? remaining[0]?.id ?? cur
      })
      bump(b => b + 1)
      return remaining
    })
  }, [])

  // Suppression de l'état de référence.
  // Retourne 'promoted' si la variante 1 a été promue, 'last' si c'était le seul état.
  const deleteBaseVariant = useCallback((): 'promoted' | 'last' => {
    const currentMeta = metaRef.current
    const base = currentMeta.find(m => m.isBase)
    if (!base) return 'last'
    if (currentMeta.length <= 1) return 'last'
    // Promouvoir la première variante non-base
    delete histRef.current[base.id]
    const remaining = currentMeta.filter(m => !m.isBase)
    const [newBase, ...rest] = remaining
    const next = [{ ...newBase, isBase: true }, ...rest]
    setMeta(next)
    setActiveId(newBase.id)
    bump(b => b + 1)
    return 'promoted'
  }, [])

  const renameVariant  = useCallback((id, name) => setMeta(prev => prev.map(m => m.id === id ? { ...m, name } : m)), [])
  const setBaseVariant = useCallback((id) => {
    setMeta(prev => {
      const v = prev.find(m => m.id === id)
      if (!v) return prev
      const others = prev.filter(m => m.id !== id).map(m => ({ ...m, isBase: false }))
      return [{ ...v, isBase: true }, ...others]
    })
  }, [])
  const reorderVariant = useCallback((fromIdx, toIdx) => {
    if (fromIdx === toIdx || fromIdx === 0 || toIdx === 0) return
    setMeta(prev => {
      const next = [...prev]
      const [item] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, item)
      return next
    })
  }, [])

  const getFullState = useCallback(() => ({
    version: 2,
    projectName:     projectNameRef.current,
    activeVariantId: activeIdRef.current,
    variants: metaRef.current.map(m => ({
      id: m.id, name: m.name, isBase: m.isBase,
      data: histRef.current[m.id]?.stack[histRef.current[m.id].idx] ?? initProject()
    }))
  }), [])

  const loadState = useCallback((state) => {
    let variants = state.version === 2 && Array.isArray(state.variants)
      ? state.variants
      : [{ id: 'v0', name: '', isBase: true, data: state }]
    if (!variants.some(v => v.isBase)) variants[0] = { ...variants[0], isBase: true }
    // Migrate old projects: convert ppZoneWidth columns to the PP zone gap column architecture
    variants = variants.map(v => {
      const data = v.data
      if (!data?.columns) return v
      const hasPPZone = data.columns.some(c => c.isPPZone)
      if (hasPPZone) return v  // already migrated
      let newColumns = []
      let newColumnXs = [...(data.columnXs ?? [])]
      let insertOffset = 0
      ;(data.columns ?? []).forEach((col, origIdx) => {
        const adjIdx = origIdx + insertOffset
        const ppW = col.ppZoneWidth ?? 0
        newColumns.push({ ...col, ppZoneWidth: undefined })
        if (!col.isGap && ppW > 0) {
          const hasGroupe = (data.points ?? []).some(p => p.type === 'groupe' && p.colId === col.id)
          if (hasGroupe) {
            const x2 = newColumnXs[adjIdx + 1]
            const ppLeft = x2 - ppW
            newColumnXs.splice(adjIdx + 1, 0, ppLeft)
            newColumns.push({ id: uid('ppz'), isGap: true, isPPZone: true, colId: col.id, levelIds: 'all' })
            insertOffset++
          }
        }
      })
      return { ...v, data: { ...data, columns: newColumns, columnXs: newColumnXs } }
    })
    // Migrate materials: add any new DEFAULT_MATERIALS entries missing from saved state
    variants = variants.map(v => {
      const data = v.data
      if (!Array.isArray(data?.materialsECS)) return v
      const existingIds = new Set(data.materialsECS.map(m => m.id))
      const missing = DEFAULT_MATERIALS.filter(m => !existingIds.has(m.id))
      if (missing.length === 0) return v
      return { ...v, data: { ...data, materialsECS: [...data.materialsECS, ...missing] } }
    })
    // Migrate insulations: resync built-in entries (name/λ/épaisseurs) avec le
    // catalogue courant, en conservant l'état "enabled" et les isolants personnalisés
    variants = variants.map(v => {
      const data = v.data
      if (!Array.isArray(data?.insulations)) return v
      const byId = new Map<string, any>(data.insulations.map((i: any) => [i.id, i]))
      const synced = DEFAULT_INSULATIONS.map(def => {
        const cur = byId.get(def.id)
        return cur ? { ...def, enabled: cur.enabled } : def
      })
      const customOnes = data.insulations.filter((i: any) => i.custom)
      return { ...v, data: { ...data, insulations: [...synced, ...customOnes] } }
    })
    // Migrate accessories: ensure the field exists on projects saved before this feature
    variants = variants.map(v => {
      const data = v.data
      if (Array.isArray(data?.accessories)) return v
      return { ...v, data: { ...data, accessories: [] } }
    })
    // Migrate segment types: 'aller-ch'/'retour-ch' were incorrectly stored; normalize to 'aller'/'retour'
    variants = variants.map(v => {
      const data = v.data
      if (!Array.isArray(data?.segments)) return v
      const hasWrong = data.segments.some((s: any) => s.type === 'aller-ch' || s.type === 'retour-ch')
      if (!hasWrong) return v
      return {
        ...v,
        data: {
          ...data,
          segments: data.segments.map((s: any) =>
            s.type === 'aller-ch' ? { ...s, type: 'aller' }
            : s.type === 'retour-ch' ? { ...s, type: 'retour' }
            : s
          )
        }
      }
    })
    histRef.current = Object.fromEntries(variants.map(v => [v.id, { stack: [v.data], idx: 0 }])) as Record<string, { stack: any[], idx: number }>
    setMeta(variants.map(({ id, name, isBase }) => ({ id, name, isBase: !!isBase })))
    setActiveId(state.activeVariantId ?? variants[0].id)
    setProjectName(state.projectName ?? 'Projet ECS')
    bump(b => b + 1)
  }, [])

  return {
    project, setProject, patchProject, resetProject, undo, redo, canUndo, canRedo,
    meta, activeId, projectName, setProjectName,
    switchVariant, duplicateVariant, deleteVariant, deleteBaseVariant, renameVariant, setBaseVariant, reorderVariant,
    getFullState, loadState,
  }
}
