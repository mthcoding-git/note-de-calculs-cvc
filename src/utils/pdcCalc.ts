/**
 * Calcul des pertes de charge — Bouclage ECS (NF DTU 60.11 P1-2).
 * Méthodes : Darcy-Weisbach + Colebrook-White itératif, ou formule DTU approchée.
 */

export const FITTING_TYPES = [
  { id: 'coude90_court',  label: 'Coude 90° (court rayon, fileté)',        xi: 1.5  },
  { id: 'coude90_long',   label: 'Coude 90° (long rayon, R=1,5D)',          xi: 0.35 },
  { id: 'coude45',        label: 'Coude 45°',                               xi: 0.4  },
  { id: 'te_passage',     label: 'Té — passage direct',                     xi: 0.3  },
  { id: 'te_deviation',   label: 'Té — branchement/déviation',              xi: 1.3  },
  { id: 'clapet_battant', label: 'Clapet anti-retour à battant',             xi: 2.0  },
  { id: 'boisseaux',      label: 'Robinet à boisseau sphérique (ouvert)',    xi: 0.05 },
  { id: 'opercule',       label: 'Vanne à opercule (ouverte)',               xi: 0.15 },
]

export const EQUIPMENT_TYPES = [
  { id: 'filtre',        label: 'Filtre / débourbeur',             kvDefault: 10   },
  { id: 'clapet_cv',     label: 'Clapet anti-retour (complexe)',    kvDefault: 4    },
  { id: 'disconnecteur', label: 'Disconnecteur BA/CA',              kvDefault: 3    },
  { id: 'echangeur',     label: 'Échangeur ECS',                    kvDefault: null },
]

export const DEFAULT_PDC_PARAMS = {
  methodeReg:      'darcy-colebrook' as 'darcy-colebrook' | 'dtu-approche',
  roughnessMode:   'global'          as 'global' | 'par-materiau',
  roughnessGlobal: 0.0001,           // m — valeur DTU
  methodeSing:     'pourcentage'     as 'pourcentage' | 'accessoires',
  pourcentageSing: 10,               // %
  equipementsActifs: false,
}

/** Masse volumique de l'eau (kg/m³) — formule de Kell (0–100 °C). */
export function waterDensity(T: number): number {
  const num = 999.83952 + 16.945176 * T - 7.9870401e-3 * T ** 2
            - 46.170461e-6 * T ** 3 + 105.56302e-9 * T ** 4 - 280.54253e-12 * T ** 5
  return num / (1 + 16.89785e-3 * T)
}

/** Viscosité dynamique de l'eau (Pa·s) — formule de Vogel-Andrade (20–80 °C). */
export function waterViscosity(T: number): number {
  return 2.414e-5 * Math.pow(10, 247.8 / (T + 133.15))
}

export interface ColebrookIteration {
  i:      number   // numéro d'itération
  lambda: number   // valeur de λ à l'itération i
  delta:  number   // |λ_i - λ_{i-1}| — critère de convergence
}

/** Colebrook-White turbulent : retourne λ final + détail de chaque itération. */
function darcyLambdaTurbulentDetail(Re: number, relRough: number): {
  lambda:     number
  lambdaInit: number
  iterations: ColebrookIteration[]
} {
  const lnArg = relRough / 3.71 + 5.74 / Math.pow(Re, 0.9)
  const lambdaInit = 0.25 / Math.pow(Math.log10(lnArg), 2)
  let lambda = lambdaInit
  const iterations: ColebrookIteration[] = []
  for (let i = 0; i < 50; i++) {
    const rhs  = -2 * Math.log10(relRough / 3.71 + 2.51 / (Re * Math.sqrt(lambda)))
    const next = 1 / (rhs * rhs)
    const delta = Math.abs(next - lambda)
    iterations.push({ i: i + 1, lambda: next, delta })
    lambda = next
    if (delta < 1e-8) break
  }
  return { lambda, lambdaInit, iterations }
}

/**
 * Coefficient de frottement de Darcy λ (simple scalaire — usage externe).
 * Laminaire (Re < 2300) : 64/Re.
 * Transition (2300–4000) : interpolation linéaire.
 * Turbulent (> 4000) : Colebrook-White itératif.
 */
export function darcyLambda(Re: number, epsilon: number, D: number): number {
  if (Re <= 0) return 0
  const relRough = epsilon / D
  if (Re < 2300) return 64 / Re
  if (Re > 4000) return darcyLambdaTurbulentDetail(Re, relRough).lambda
  const lam  = 64 / 2300
  const turb = darcyLambdaTurbulentDetail(4000, relRough).lambda
  return lam + (turb - lam) * (Re - 2300) / (4000 - 2300)
}

/**
 * Gradient de pression linéaire (Pa/m) — formule approchée DTU 60.11.
 * J = 5,65 × V^1,896 / D^1,276  (V en m/s, D en m, eau chaude sanitaire).
 */
export function dtuJ(V: number, D: number): number {
  if (V <= 0 || D <= 0) return 0
  return 5.65 * Math.pow(V, 1.896) / Math.pow(D, 1.276)
}

export interface SegPdcResult {
  // ── Propriétés physiques de l'eau ──────────────────────────────────────
  T_used:       number              // température utilisée (°C)
  rho:          number              // masse volumique (kg/m³) — Kell
  mu:           number              // viscosité dynamique (Pa·s) — Vogel-Andrade
  nu:           number              // viscosité cinématique (m²/s)
  // ── Hydraulique ────────────────────────────────────────────────────────
  A:            number              // section transversale (m²)
  V:            number              // vitesse (m/s)
  // ── Régulières ─────────────────────────────────────────────────────────
  J:            number              // gradient linéaire (Pa/m)
  epsilon_used?: number             // rugosité utilisée (m) — Darcy-Colebrook uniquement
  Re?:          number              // Reynolds
  regime?:      'laminar' | 'transition' | 'turbulent'
  lambda?:      number              // coeff. de frottement de Darcy
  lambdaInit?:  number              // initialisation Swamee-Jain
  iterations?:  ColebrookIteration[] // détail des itérations Colebrook-White
  dpReg:        number              // ΔP régulières (Pa)
  // ── Singulières ────────────────────────────────────────────────────────
  dynPressure?: number              // ρV²/2 (Pa) — méthode accessoires
  dpSing:       number              // ΔP singulières (Pa)
  // ── Équipements ────────────────────────────────────────────────────────
  dpEquip:      number              // ΔP équipements (Pa)
  // ── Total ──────────────────────────────────────────────────────────────
  dpTotal:      number              // ΔP total (Pa)
}

/**
 * Calcule les pertes de charge d'un tronçon.
 *
 * @param seg        tronçon (avec length_override, fittings?, equipment?)
 * @param pdcParams  paramètres globaux PDC
 * @param flowRate   débit en m³/h (de networkFlows)
 * @param di_mm      diamètre intérieur en mm
 * @param T          température du fluide (°C)
 * @param material   matériau (pour ε par matériau si roughnessMode='par-materiau')
 */
export function computeSegPdc(
  seg:      any,
  pdcParams: any,
  flowRate:  number | null,
  di_mm:     number | null,
  T:         number,
  material:  any
): SegPdcResult | null {
  const L = seg.length_override
  if (!L || L <= 0)              return null
  if (!flowRate || flowRate <= 0) return null
  if (!di_mm   || di_mm   <= 0) return null

  const D   = di_mm / 1000
  const A   = Math.PI * D * D / 4
  const V   = (flowRate / 3600) / A
  const rho = waterDensity(T)
  const mu  = waterViscosity(T)
  const nu  = mu / rho

  // ── ΔP régulières ─────────────────────────────────────────────────────
  let J: number
  let lambda: number | undefined
  let lambdaInit: number | undefined
  let iterations: ColebrookIteration[] | undefined
  let Re: number | undefined
  let regime: 'laminar' | 'transition' | 'turbulent' | undefined
  let epsilon_used: number | undefined

  if (pdcParams.methodeReg === 'dtu-approche') {
    J = dtuJ(V, D)
  } else {
    Re = V * D / nu
    epsilon_used = pdcParams.roughnessMode === 'par-materiau'
      ? (material?.epsilon ?? 0.0001)
      : (pdcParams.roughnessGlobal ?? 0.0001)
    const relRough = epsilon_used / D

    if (Re < 2300) {
      regime = 'laminar'
      lambda = 64 / Re
    } else if (Re > 4000) {
      regime = 'turbulent'
      const detail = darcyLambdaTurbulentDetail(Re, relRough)
      lambda = detail.lambda
      lambdaInit = detail.lambdaInit
      iterations = detail.iterations
    } else {
      regime = 'transition'
      const lam  = 64 / 2300
      const turb = darcyLambdaTurbulentDetail(4000, relRough)
      lambda = lam + (turb.lambda - lam) * (Re - 2300) / (4000 - 2300)
    }
    J = (lambda! / D) * (rho * V * V / 2)
  }
  const dpReg = J * L

  // ── ΔP singulières ─────────────────────────────────────────────────────
  const dynPressure = rho * V * V / 2
  let dpSing: number
  if (pdcParams.methodeSing === 'pourcentage') {
    dpSing = dpReg * (pdcParams.pourcentageSing ?? 10) / 100
  } else {
    const fittings: any[] = seg.fittings ?? []
    dpSing = fittings.reduce((sum, f) => {
      const xi = f.xiOverride ?? FITTING_TYPES.find(t => t.id === f.type)?.xi ?? 0
      return sum + xi * (f.count ?? 1) * dynPressure
    }, 0)
  }

  // ── ΔP équipements ─────────────────────────────────────────────────────
  let dpEquip = 0
  if (pdcParams.equipementsActifs) {
    const equipment: any[] = seg.equipment ?? []
    for (const e of equipment) {
      const kv = e.kvOverride ?? EQUIPMENT_TYPES.find(t => t.id === e.type)?.kvDefault
      if (!kv || kv <= 0) continue
      dpEquip += Math.pow(flowRate / kv, 2) * 100000  // (Q/Kv)² × 10⁵ Pa
    }
  }

  return {
    T_used: T, rho, mu, nu,
    A, V,
    J, epsilon_used, Re, regime, lambda, lambdaInit, iterations,
    dpReg,
    dynPressure, dpSing,
    dpEquip,
    dpTotal: dpReg + dpSing + dpEquip,
  }
}
