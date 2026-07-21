/**
 * Calcul du risque de condensation sur les canalisations d'eau glacée.
 * Référence : NF EN ISO 12241 — géométrie cylindrique.
 * Méthode : comparaison T_surface_isolant vs T_rosée (Magnus).
 *
 * Circuit thermique complet :
 *   T_fluide → [R_si] → [R_tube] → [R_ins] → T_surf → [R_ext] → T_ambiante
 */

import { findMidpointLevelIndexAt } from './levelUtils'

export const H_EXT_DEFAULT = 10    // W/(m²·K) — convection extérieure air calme (valeur normalisée)
export const H_INT_DEFAULT = 3000  // W/(m²·K) — convection intérieure eau (valeur conservative)
const HR_DEFAULT    = 60    // % — HR par défaut si non renseignée
const MARGIN_DEG    = 1     // °C — marge de sécurité sur T_surf > T_rosée

/**
 * Température de rosée — formule d'August-Roche-Magnus.
 * Valide de 0 à 60 °C, précision ±0,35 °C.
 */
export function getDewPoint(T_amb: number, HR: number): number {
  const b = (17.625 * T_amb) / (243.04 + T_amb) + Math.log(Math.max(HR, 0.01) / 100)
  return (243.04 * b) / (17.625 - b)
}

/**
 * Résistance thermique linéique de convection intérieure (K·m/W).
 * R_si = 1 / (2π × r_int × h_int)
 */
export function getInternalResistance(di_mm: number, h_int = H_INT_DEFAULT): number {
  if (di_mm <= 0 || h_int <= 0) return 0
  const r_int = di_mm / 2000 // m
  return 1 / (2 * Math.PI * r_int * h_int)
}

/**
 * Résistance thermique linéique de la paroi de canalisation (K·m/W) — géométrie cylindrique.
 * R_tube = ln(de / di) / (2π × λ_tube)
 */
export function getPipeWallResistance(di_mm: number, de_mm: number, lambda_tube: number): number {
  if (di_mm <= 0 || de_mm <= di_mm || lambda_tube <= 0) return 0
  return Math.log(de_mm / di_mm) / (2 * Math.PI * lambda_tube)
}

/**
 * Résistance thermique linéique de l'isolant (K·m/W) — géométrie cylindrique.
 * R_ins = ln(r_ext / r_int) / (2π × λ_ins)
 */
export function getInsulationResistance(de_mm: number, e_mm: number, lambda_ins: number): number {
  if (de_mm <= 0 || e_mm <= 0 || lambda_ins <= 0) return 0
  const r_int = de_mm / 2000        // m — rayon extérieur du tuyau = rayon intérieur de l'isolant
  const r_ext = r_int + e_mm / 1000 // m — rayon extérieur de l'isolant
  return Math.log(r_ext / r_int) / (2 * Math.PI * lambda_ins)
}

/**
 * Résistance thermique linéique de convection extérieure (K·m/W).
 * R_ext = 1 / (2π × r_surf × h_ext)
 * r_surf = rayon extérieur de l'isolant (ou du tuyau nu si e_mm = 0).
 */
export function getExteriorResistance(de_mm: number, e_mm: number, h_ext = H_EXT_DEFAULT): number {
  if (de_mm <= 0 || h_ext <= 0) return 0
  const r_surf = (de_mm / 2 + Math.max(e_mm, 0)) / 1000 // m
  return 1 / (2 * Math.PI * r_surf * h_ext)
}

/**
 * Température de surface extérieure de l'isolant (°C).
 *
 * Circuit : T_fluid → [R_inner] → T_surf → [R_ext] → T_amb
 * où R_inner = R_si + R_tube + R_ins (résistances côté fluide)
 *
 * T_surf = T_amb − (T_amb − T_fluid) × R_ext / (R_inner + R_ext)
 */
export function getSurfaceTemp(
  T_amb: number, T_fluid: number,
  R_inner: number, R_ext: number
): number {
  const denom = R_inner + R_ext
  if (denom <= 0) return T_amb
  return T_amb - (T_amb - T_fluid) * R_ext / denom
}

/**
 * Résistance thermique d'isolant minimale nécessaire pour éviter la condensation (K·m/W).
 * Condition : T_surf ≥ T_rosée + marge
 *
 * Dérivation : alpha = R_ext / R_total = (T_amb − T_cible) / (T_amb − T_fluid)
 *   R_ins_néc = R_ext_bare × (1 − alpha) / alpha − R_si − R_tube
 *
 * R_ext_bare : approximation conservative avec le rayon nu du tuyau (légèrement surestimé,
 * donc R_ins_néc est légèrement surestimé → sûr côté ingénierie).
 */
export function getRequiredResistance(
  T_amb: number, T_fluid: number, T_rosee: number,
  de_mm: number,
  di_mm: number | null      = null,
  lambda_tube: number | null = null,
  h_ext = H_EXT_DEFAULT,
  marge = MARGIN_DEG
): number {
  const T_cible = T_rosee + marge
  if (T_amb <= T_fluid) return 0
  const alpha = (T_amb - T_cible) / (T_amb - T_fluid)
  if (alpha <= 0) return 0
  if (alpha >= 1) return Infinity

  const r_bare   = de_mm / 2000
  const R_ext_bare = 1 / (2 * Math.PI * r_bare * h_ext)

  const R_si   = (di_mm != null && di_mm > 0)
    ? getInternalResistance(di_mm, H_INT_DEFAULT)
    : 0
  const R_tube = (di_mm != null && di_mm > 0 && lambda_tube != null && lambda_tube > 0)
    ? getPipeWallResistance(di_mm, de_mm, lambda_tube)
    : 0

  return Math.max(0, R_ext_bare * (1 - alpha) / alpha - R_si - R_tube)
}

/**
 * HR du tronçon : override → niveau → défaut 60 %.
 */
export function getSegHR(seg: any, levels: any[], lineYs: number[]): number {
  if (seg.hr_override != null) return seg.hr_override
  if (!seg.vertices?.length) return HR_DEFAULT
  const midY = seg.vertices.reduce((s: number, v: any) => s + v.y, 0) / seg.vertices.length
  const li = findMidpointLevelIndexAt(midY, lineYs)
  if (li >= 0 && levels[li]?.hr_eg_default != null) return levels[li].hr_eg_default!
  return HR_DEFAULT
}

export interface CondensationResult {
  T_rosee:  number         // °C — température de rosée
  T_surf:   number         // °C — température de surface extérieure de l'isolant
  marge:    number         // °C — T_surf − T_rosée (>0 = ok)
  R_ins:    number         // K·m/W — résistance isolant réel
  R_nec:    number | null  // K·m/W — résistance isolant nécessaire (null si pas de risque)
  risque:   boolean
  hasInsul: boolean
}

/**
 * Calcul condensation depuis les paramètres résolus.
 *
 * di_mm et lambda_tube sont optionnels : s'ils sont fournis, R_si et R_tube
 * sont inclus dans le calcul pour plus de précision.
 */
export function computeCondensationFromParams(
  T_fluid: number,
  T_amb: number,
  HR: number,
  de_mm: number,
  e_mm: number,
  lambda_ins: number,
  di_mm: number | null       = null,
  lambda_tube: number | null = null,
  h_ext = H_EXT_DEFAULT,
): CondensationResult {
  const T_rosee = getDewPoint(T_amb, HR)

  const R_si   = (di_mm != null && di_mm > 0)
    ? getInternalResistance(di_mm, H_INT_DEFAULT)
    : 0
  const R_tube = (di_mm != null && di_mm > 0 && lambda_tube != null && lambda_tube > 0)
    ? getPipeWallResistance(di_mm, de_mm, lambda_tube)
    : 0
  const R_ins  = getInsulationResistance(de_mm, e_mm, lambda_ins)
  const R_ext  = getExteriorResistance(de_mm, e_mm, h_ext)

  const R_inner = R_si + R_tube + R_ins
  const T_surf  = getSurfaceTemp(T_amb, T_fluid, R_inner, R_ext)
  const marge   = T_surf - T_rosee
  const R_nec   = marge < 0
    ? getRequiredResistance(T_amb, T_fluid, T_rosee, de_mm, di_mm, lambda_tube, h_ext)
    : null

  return { T_rosee, T_surf, marge, R_ins, R_nec, risque: marge < 0, hasInsul: true }
}

/**
 * Calcule le résultat condensation complet pour un tronçon depuis l'objet segment.
 * NOTE : de_mm doit être passé résolu (seg ne porte pas de_mm directement).
 */
export function computeSegCondensation(
  seg: any,
  insulations: any[],
  T_fluid: number,
  T_amb: number,
  HR: number,
  de_mm: number,
  di_mm: number | null       = null,
  lambda_tube: number | null = null,
  h_ext = H_EXT_DEFAULT
): CondensationResult | null {
  const ins  = insulations.find((i: any) => i.id === seg.insulationId)
  const e_mm = typeof seg.thickness === 'number' ? seg.thickness : null

  const T_rosee = getDewPoint(T_amb, HR)

  if (!ins || e_mm == null || e_mm <= 0) {
    const R_si   = (di_mm != null && di_mm > 0) ? getInternalResistance(di_mm)   : 0
    const R_tube = (di_mm != null && di_mm > 0 && lambda_tube != null && lambda_tube > 0)
      ? getPipeWallResistance(di_mm, de_mm, lambda_tube) : 0
    const R_ext  = getExteriorResistance(de_mm, 0, h_ext)
    const T_surf = getSurfaceTemp(T_amb, T_fluid, R_si + R_tube, R_ext)
    return {
      T_rosee,
      T_surf,
      marge:    T_surf - T_rosee,
      R_ins:    0,
      R_nec:    null,
      risque:   T_surf < T_rosee,
      hasInsul: false,
    }
  }

  const lambda_ins = seg.lambda_insul_override ?? ins.lambda
  return computeCondensationFromParams(T_fluid, T_amb, HR, de_mm, e_mm, lambda_ins, di_mm, lambda_tube, h_ext)
}
