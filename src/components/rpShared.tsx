import { getNodeDefaultCote } from '../utils/coteCalc'
import { NumInput } from './NumInput'

export function tAvalStyle(T, T_depart) {
  if (T == null) return {}
  if (T < 50) return { background: '#dc2626', color: '#fff', fontWeight: 700, borderColor: '#b91c1c', labelColor: 'rgba(255,255,255,0.8)' }
  const ratio = Math.max(0, Math.min(1, (T - 50) / Math.max(T_depart - 50, 1)))
  const hue   = Math.round(120 * ratio)
  return { background: `hsl(${hue},58%,91%)`, borderColor: `hsl(${hue},50%,68%)`, labelColor: `hsl(${hue},40%,32%)` }
}

export function Field({ label, unit = null, children, labelFlex = null }: { label: any, unit?: any, children: any, labelFlex?: string | null }) {
  return (
    <div className="lp-field rp-field-row">
      <label className="lp-label" style={labelFlex ? { flex: `0 0 ${labelFlex}`, whiteSpace: 'normal' } : undefined}>{label}</label>
      <div className="rp-field-input-wrap">
        {children}
        {unit && <span className="rp-field-unit">{unit}</span>}
      </div>
    </div>
  )
}


// ── Calcul longueur + volume antenne ─────────────────────────────────────
export function _antenneDiMm(s: any, materials: any[]): number | null {
  if (s.di_override != null) return s.di_override
  const mat = materials.find((m: any) => m.id === s.materialId)
  return mat?.dns.find((d: any) => d.dn === s.dn)?.di ?? null
}

export function _segContrib(s: any, materials: any[]): { len: number; vol: number } {
  const len = s.length_override ?? 0
  const di  = _antenneDiMm(s, materials)
  const vol = di && len > 0 ? (Math.PI / 4) * (di / 1000) ** 2 * len * 1000 : 0
  return { len, vol }
}

/** Longueur + volume totaux depuis la racine aller ECS jusqu'à un groupe (marche amont). */
export function computeGroupePath(
  groupePtId: string,
  allSegs: any[],
  flowDirections: Map<string, { fromId: string; toId: string }> | undefined,
  materials: any[],
  roleMap: Map<string, string> | undefined
): { length: number; volume: number } {
  if (!flowDirections || !roleMap) return { length: 0, volume: 0 }
  let totalLen = 0, totalVol = 0
  let currentNodeId: string | undefined = groupePtId
  const visited = new Set<string>()
  while (currentNodeId) {
    if (visited.has(currentNodeId)) break
    visited.add(currentNodeId)
    const incoming = allSegs.find(
      (s: any) => flowDirections.get(s.id)?.toId === currentNodeId && roleMap.get(s.id) === 'antenne'
    )
    if (!incoming) break
    const { len, vol } = _segContrib(incoming, materials)
    totalLen += len; totalVol += vol
    currentNodeId = flowDirections.get(incoming.id)?.fromId
  }
  return { length: totalLen, volume: totalVol }
}

/**
 * Groupes de puisage en aval du tronçon `seg` (uniquement depuis son nœud aval),
 * avec longueur + volume totaux depuis la racine aller ECS.
 */
export function computeAntenneGroupePaths(
  seg: any,
  allSegs: any[],
  points: any[],
  flowDirections: Map<string, { fromId: string; toId: string }> | undefined,
  materials: any[],
  roleMap: Map<string, string> | undefined
): { groupeId: string; length: number; volume: number }[] {
  if (!flowDirections || !roleMap) return []

  // Cumul longueur/volume depuis la racine jusqu'à l'aval du tronçon sélectionné
  // = marche amont depuis dir.fromId + contribution du tronçon lui-même
  const dir = flowDirections.get(seg.id)
  if (!dir) return []

  const upstreamBase = computeGroupePath(dir.fromId, allSegs, flowDirections, materials, roleMap)
  const own          = _segContrib(seg, materials)
  const baseLen      = upstreamBase.length + own.len
  const baseVol      = upstreamBase.volume + own.vol

  // DFS depuis l'aval du tronçon sélectionné
  const results: { groupeId: string; length: number; volume: number }[] = []
  const visited = new Set<string>()

  function dfs(nodeId: string, cumulLen: number, cumulVol: number) {
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    const pt = points.find((p: any) => p.id === nodeId)
    if (pt?.type === 'groupe') {
      results.push({ groupeId: nodeId, length: cumulLen, volume: cumulVol })
      return
    }
    for (const s of allSegs.filter(
      (s: any) => flowDirections!.get(s.id)?.fromId === nodeId && roleMap!.get(s.id) === 'antenne'
    )) {
      const { len, vol } = _segContrib(s, materials)
      const toId = flowDirections!.get(s.id)?.toId
      if (toId) dfs(toId, cumulLen + len, cumulVol + vol)
    }
  }

  dfs(dir.toId, baseLen, baseVol)
  return results
}

export const MAX_ANTENNE_VOL_L = 3.0   // L  (DTU 60.11)
export const MAX_ANTENNE_LEN_M = 8.0   // m

export function AntenneGroupesAval({ seg, allSegs, points, flowDirections, materials, roleMap, groupDisplayNames }: {
  seg: any, allSegs: any[], points: any[]
  flowDirections: Map<string, { fromId: string; toId: string }> | undefined
  materials: any[], roleMap: Map<string, string> | undefined
  groupDisplayNames: Map<string, string> | null | undefined
}) {
  if (roleMap?.get(seg.id) !== 'antenne') return null
  const paths = computeAntenneGroupePaths(seg, allSegs, points, flowDirections, materials, roleMap)
  if (paths.length === 0) return null

  return (
    <>
      <hr className="rp-divider" />
      <SectionLabel>Groupes en aval</SectionLabel>
      {paths.map(({ groupeId, length, volume }) => {
        const lenOk  = length <= MAX_ANTENNE_LEN_M
        const volOk  = volume <= MAX_ANTENNE_VOL_L
        const ok     = lenOk && volOk
        const name   = groupDisplayNames?.get(groupeId)
                     ?? points.find((p: any) => p.id === groupeId)?.name
                     ?? 'Groupe de puisage'
        const bg     = ok ? '#f0fdf4' : '#fef2f2'
        const border = ok ? '#bbf7d0' : '#fca5a5'
        const lenCol = lenOk ? '#16a34a' : '#dc2626'
        const volCol = volOk ? '#16a34a' : '#dc2626'
        return (
          <div key={groupeId} style={{
            padding: '7px 10px', background: bg,
            border: `1px solid ${border}`, borderRadius: 6, marginBottom: 5,
          }}>
            <div style={{ fontSize: 10, fontWeight: 600, color: '#374151', marginBottom: 5, lineHeight: 1.3 }}>
              {name}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 9.5, color: '#6b7280' }}>Longueur antenne</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: lenCol, fontFamily: 'ui-monospace, monospace' }}>
                  {length.toFixed(1)} m {lenOk ? '✓' : `⚠ > ${MAX_ANTENNE_LEN_M} m`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 9.5, color: '#6b7280' }}>Volume antenne</span>
                <span style={{ fontSize: 10, fontWeight: 700, color: volCol, fontFamily: 'ui-monospace, monospace' }}>
                  {volume.toFixed(2)} L {volOk ? '✓' : `⚠ > ${MAX_ANTENNE_VOL_L} L`}
                </span>
              </div>
            </div>
          </div>
        )
      })}
      <div style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', marginTop: 2 }}>
        Depuis le tronçon aller ECS jusqu'au groupe — seuils : {MAX_ANTENNE_LEN_M} m / {MAX_ANTENNE_VOL_L} L (DTU 60.11)
      </div>
    </>
  )
}

export function CoteSection({ seg, points, levels, lineYs, onUpdate, flowDirections }: { seg: any, points: any[], levels: any[], lineYs: number[], onUpdate: any, flowDirections?: Map<string, { fromId: string; toId: string }> }) {
  const dir     = flowDirections?.get(seg.id)
  const amontId = dir?.fromId ?? seg.startPointId
  const avalId  = dir?.toId   ?? seg.endPointId
  const amontPt = points?.find(p => p.id === amontId) ?? null
  const avalPt  = points?.find(p => p.id === avalId)  ?? null
  if (!amontPt && !avalPt) return null
  const mkInput = (pt: any, label: string) => {
    if (!pt) return null
    const def = getNodeDefaultCote(pt, levels ?? [], lineYs ?? [])
    return (
      <Field label={label} unit="m">
        <NumInput step={0.01}
          value={pt.cote_override ?? null}
          placeholder={`${def.toFixed(2)} (par défaut)`}
          allowEmpty
          onChange={v => onUpdate(pt.id, 'point', { cote_override: v })} />
      </Field>
    )
  }
  return (
    <>
      <SectionLabel>Cote</SectionLabel>
      {mkInput(amontPt, 'Cote amont')}
      {mkInput(avalPt, 'Cote aval')}
    </>
  )
}

export function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase',
      letterSpacing: '0.05em', marginBottom: 5, marginTop: 2 }}>
      {children}
    </div>
  )
}

export function SegNameField({ displayName, isDefault, value, onChange, indent = false }) {
  const autoResize = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px' }
  return (
    <div className="lp-field">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
        <label className="lp-label" style={{ margin: 0 }}>Nom</label>
        {isDefault
          ? <span style={{ fontSize: 9, color: '#9ca3af', fontStyle: 'italic', letterSpacing: '0.02em' }}>par défaut</span>
          : <span style={{ fontSize: 9, color: '#6366f1', letterSpacing: '0.02em' }}>personnalisé</span>
        }
      </div>

      {isDefault && (
        <div style={{
          padding: '5px 8px', marginBottom: 5, marginLeft: indent ? 10 : 0,
          background: '#f8fafc', border: '1px solid #e5e7eb', borderRadius: 4,
          fontSize: 12, color: '#374151', lineHeight: 1.45, wordBreak: 'break-word',
        }}>
          {displayName}
        </div>
      )}

      <textarea
        value={value}
        placeholder={isDefault ? 'Renommer…' : ''}
        rows={1}
        onChange={e => onChange(e.target.value || null)}
        onInput={e => autoResize(e.currentTarget)}
        style={isDefault ? { color: '#6b7280' } : undefined}
      />

      {!isDefault && (
        <span style={{ fontSize: 10, color: '#9ca3af', marginTop: 3, display: 'block' }}>
          Effacez pour rétablir le nom par défaut
        </span>
      )}
    </div>
  )
}

export function TempBadge({ temp, T_depart }) {
  if (temp == null) return null
  const dT = T_depart != null ? temp - T_depart : null
  const ts = tAvalStyle(temp, T_depart ?? 60)

  // sf is inlined here to avoid a circular dep — just toFixed with fallback
  const sfLocal = (val: any, decimals = 2) => {
    if (typeof val !== 'number' || !Number.isFinite(val)) return '—'
    return val.toFixed(decimals)
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ padding: '7px 10px', background: ts.background,
        border: `1px solid ${ts.borderColor}`, borderRadius: 6 }}>
        <div style={{ fontSize: 9, color: ts.labelColor, fontWeight: 700, marginBottom: 3,
          textTransform: 'uppercase', letterSpacing: '0.05em' }}>Température au nœud</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 18, fontWeight: ts.fontWeight ?? 700, color: ts.color ?? '#111827' }}>{sfLocal(temp, 2)}</span>
          <span style={{ fontSize: 10, color: ts.color ? 'rgba(255,255,255,0.7)' : '#9ca3af' }}>°C</span>
        </div>
      </div>
      {dT != null && (
        <div style={{ marginTop: 2, textAlign: 'center', fontSize: 10, color: '#6b7280' }}>
          ΔT depuis départ : <span style={{ fontWeight: 700, color: '#374151' }}>{sfLocal(dT, 2)} K</span>
        </div>
      )}
    </div>
  )
}
