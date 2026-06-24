/**
 * Calcul des pertes de charge — Bouclage ECS (NF DTU 60.11 P1-2).
 * Méthodes : Darcy-Weisbach + Colebrook-White itératif, ou formule DTU approchée.
 */

export const FITTING_TYPES = [
  { id: 'coude90_long',   label: 'Coude 90° soudé (R=1,5D)',              xi: 0.35 },
  { id: 'coude90_soude',  label: 'Coude 90° soudé (R=1D)',                xi: 0.5  },
  { id: 'coude90_press',  label: 'Coude 90° à sertir / press',            xi: 1.0  },
  { id: 'coude90_court',  label: 'Coude 90° fileté (court rayon)',        xi: 1.5  },
  { id: 'coude45_soude',  label: 'Coude 45° soudé',                       xi: 0.2  },
  { id: 'coude45',        label: 'Coude 45° fileté / à raccord',          xi: 0.4  },
  { id: 'te_passage',     label: 'Té — passage direct',                    xi: 0.3  },
  { id: 'te_deviation',   label: 'Té — dérivation / branchement',         xi: 1.5  },
  { id: 'boisseaux',      label: 'Robinet à boisseau sphérique (ouvert)', xi: 0.05 },
  { id: 'clapet_ressort', label: 'Clapet anti-retour à ressort',           xi: 4.0  },
  { id: 'clapet_battant', label: 'Clapet anti-retour à battant',           xi: 2.0  },
]

export const EQUIPMENT_TYPES = [
  { id: 'filtre',            label: 'Filtre / débourbeur',              kvDefault: 8    },
  { id: 'disconnecteur',     label: 'Disconnecteur BA (EA)',             kvDefault: 3    },
  { id: 'reducteur_pression',label: 'Réducteur de pression',            kvDefault: 5    },
  { id: 'echangeur',         label: 'Échangeur ECS',                     kvDefault: null },
  { id: 'vanne_regulation',  label: 'Vanne de régulation',              kvDefault: null },
  { id: 'compteur_eau',      label: "Compteur d'eau",                    kvDefault: 5    },
]

export const DEFAULT_PDC_PARAMS = {
  methodeReg:        'darcy-colebrook' as 'darcy-colebrook' | 'dtu-approche',
  dtuUnite:          'Pa'             as 'Pa' | 'mCE',
  roughnessMode:     'global'          as 'global' | 'par-materiau',
  roughnessGlobal:   0.0001,
  methodeSing:       'pourcentage'     as 'pourcentage' | 'accessoires',
  pourcentageSing:   20,
  equipementsActifs: false,
  coefPompeActif:    false,
  coefPompe:         10,
  uniteAffichage:    'Pa'             as 'Pa' | 'mmCE' | 'both',
  fittingOverrides:  {} as Record<string, number>,   // ξ par défaut modifiés dans la bibliothèque
  equipmentOverrides:{} as Record<string, number>,   // Kv par défaut modifiés dans la bibliothèque
  customFittings:   [] as { id: string; label: string; xi: number }[],
  customEquipments: [] as { id: string; label: string; kvDefault: number | null }[],
}

export interface TronconAmontEF {
  id:              string
  length:          number | null   // m
  materialId:      string | null
  dn:              string | null
  di_override:     number | null   // di direct si pas de matériau/DN
  coteAmont:       number | null   // m (null = 0 par défaut)
  coteAval:        number | null   // m (null = 0 par défaut)
  pourcentageSing: number          // % (défaut 20)
  fittings?:       { type: string; count: number; xiOverride?: number }[]
  equipment?:      { type: string; count: number; kvOverride?: number }[]
}

export interface TronconAmontResult {
  di_mm:         number | null
  V:             number
  J:             number
  Re?:           number
  lambda?:       number
  regime?:       'laminar' | 'transition' | 'turbulent'
  dpFric:        number
  dpSing:        number
  dpEquip:       number
  dpStatic:      number
  dpTotal:       number
  presIn:        number
  presOut:       number
  rho:           number
  mu?:           number
  nu?:           number
  T_used:        number
  dynPressure?:  number
  epsilon_used?: number
}

export const DEFAULT_PDC_PARAMS_ALIM_ECS = {
  methodeReg:               'darcy-colebrook' as 'darcy-colebrook' | 'dtu-approche',
  dtuUnite:                 'Pa'             as 'Pa' | 'mCE',
  roughnessMode:            'global'          as 'global' | 'par-materiau',
  roughnessGlobal:          0.0001,
  methodeSing:              'pourcentage'     as 'pourcentage' | 'accessoires',
  pourcentageSing:          20,
  equipementsActifs:        false,
  coefPompeActif:           false,
  coefPompe:                10,
  uniteAffichage:           'Pa'             as 'Pa' | 'mmCE' | 'both',
  fittingOverrides:         {} as Record<string, number>,
  equipmentOverrides:       {} as Record<string, number>,
  customFittings:           [] as { id: string; label: string; xi: number }[],
  customEquipments:         [] as { id: string; label: string; kvDefault: number | null }[],
  pressionSourceDisponible: null             as number | null,   // null → 3 bar par défaut
  modePresSource:           'depart-ecs'     as 'depart-ecs' | 'arrivee-ef',
  pressionArriveeEF:        null             as number | null,   // null → 3 bar par défaut
  T_ef:                     null             as number | null,   // null → 10 °C par défaut
  tronçonsAmont:            [] as TronconAmontEF[],   // coteAmont/coteAval en m, length en m
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
 * ECS : J = 5,65 × V^1,896 / D^1,276 (Pa) | 3,80 × V^1,896 / D_mm^1,276 (mCE)
 * EF  : J = 6    × V^1,848 / D^1,279 (Pa) | 4,12 × V^1,848 / D_mm^1,279 (mCE)
 */
export function dtuJ(V: number, D: number, unite: 'Pa' | 'mCE' = 'Pa', fluid: 'ecs' | 'ef' = 'ecs'): number {
  if (V <= 0 || D <= 0) return 0
  if (fluid === 'ef') {
    if (unite === 'mCE') return 4.12 * Math.pow(V, 1.848) / Math.pow(D * 1000, 1.279) * 9810
    return 6 * Math.pow(V, 1.848) / Math.pow(D, 1.279)
  }
  if (unite === 'mCE') {
    const J_mCE = 3.80 * Math.pow(V, 1.896) / Math.pow(D * 1000, 1.276)
    return J_mCE * 9810
  }
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
  dpPompe?:     number              // ΔP majoré pour dimensionnement pompe (Pa)
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
    J = dtuJ(V, D, pdcParams.dtuUnite ?? 'Pa')
  } else {
    Re = V * D / nu
    epsilon_used = material?.epsilon ?? pdcParams.roughnessGlobal ?? 0.0001
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
      const xi = f.xiOverride
        ?? pdcParams.fittingOverrides?.[f.type]
        ?? FITTING_TYPES.find(t => t.id === f.type)?.xi
        ?? (pdcParams.customFittings ?? []).find((t: any) => t.id === f.type)?.xi
        ?? 0
      return sum + xi * (f.count ?? 1) * dynPressure
    }, 0)
  }

  // ── ΔP équipements ─────────────────────────────────────────────────────
  let dpEquip = 0
  if (pdcParams.equipementsActifs) {
    const equipment: any[] = seg.equipment ?? []
    for (const e of equipment) {
      const kv = e.kvOverride
        ?? pdcParams.equipmentOverrides?.[e.type]
        ?? EQUIPMENT_TYPES.find(t => t.id === e.type)?.kvDefault
        ?? (pdcParams.customEquipments ?? []).find((t: any) => t.id === e.type)?.kvDefault
      if (!kv || kv <= 0) continue
      dpEquip += Math.pow(flowRate / kv, 2) * 100000  // (Q/Kv)² × 10⁵ Pa
    }
  }

  const dpTotal = dpReg + dpSing + dpEquip
  const dpPompe = pdcParams.coefPompeActif
    ? dpTotal * (1 + (pdcParams.coefPompe ?? 10) / 100)
    : undefined

  return {
    T_used: T, rho, mu, nu,
    A, V,
    J, epsilon_used, Re, regime, lambda, lambdaInit, iterations,
    dpReg,
    dynPressure, dpSing,
    dpEquip,
    dpTotal,
    dpPompe,
  }
}

/**
 * Calcule les pertes de charge de chaque tronçon amont EF → Production ECS.
 * Retourne une Map<trId, TronconAmontResult> dans l'ordre amont → aval.
 */
export function computeAmontResults(
  params:      any,
  totalQpM3h:  number,
  materials:   any[] = []
): Map<string, TronconAmontResult> {
  const results = new Map<string, TronconAmontResult>()
  if ((params.modePresSource ?? 'depart-ecs') !== 'arrivee-ef') return results

  const T       = params.T_ef ?? 10
  const rho     = waterDensity(T)
  const mu      = waterViscosity(T)
  const nu      = mu / rho
  const epsilon = params.roughnessGlobal ?? 0.0001
  const isdc    = (params.methodeReg ?? 'darcy-colebrook') !== 'dtu-approche'
  let presIn    = params.pressionArriveeEF ?? 300000

  for (const tr of (params.tronçonsAmont ?? []) as TronconAmontEF[]) {
    const di_mm: number | null = tr.di_override != null
      ? tr.di_override
      : (tr.materialId && tr.dn
          ? (materials.find((m: any) => m.id === tr.materialId)
              ?.dns.find((d: any) => d.dn === tr.dn)?.di ?? null)
          : null)

    const deltaH   = (tr.coteAval ?? 0) - (tr.coteAmont ?? 0)
    const dpStatic = rho * 9.81 * deltaH
    let dpFric = 0, dpSing = 0, V = 0, J = 0
    let Re: number | undefined, lambda: number | undefined
    let regime: 'laminar' | 'transition' | 'turbulent' | undefined
    let dynPressure: number | undefined

    let dpEquip = 0
    if (di_mm && di_mm > 0 && tr.length && tr.length > 0 && totalQpM3h > 0) {
      const D = di_mm / 1000
      const A = Math.PI * D * D / 4
      V = (totalQpM3h / 3600) / A
      dynPressure = 0.5 * rho * V * V
      if (!isdc) {
        J = dtuJ(V, D, params.dtuUnite ?? 'Pa', 'ef')
      } else {
        Re = V * D / nu
        lambda = darcyLambda(Re, epsilon, D)
        J = (lambda / D) * dynPressure
        regime = Re < 2300 ? 'laminar' : Re > 4000 ? 'turbulent' : 'transition'
      }
      dpFric = J * tr.length
      if ((params.methodeSing ?? 'pourcentage') === 'accessoires') {
        const customFittings: any[] = params.customFittings ?? []
        const allFittings = [
          ...FITTING_TYPES,
          ...customFittings.map((t: any) => ({ id: t.id, xi: t.xi })),
        ]
        for (const f of (tr.fittings ?? [])) {
          const xi = f.xiOverride
            ?? params.fittingOverrides?.[f.type]
            ?? allFittings.find(t => t.id === f.type)?.xi
            ?? 0
          dpSing += xi * dynPressure * (f.count ?? 1)
        }
      } else {
        dpSing = dpFric * ((params.pourcentageSing ?? 20) / 100)
      }
    }

    if (params.equipementsActifs) {
      const customEquipments: any[] = params.customEquipments ?? []
      const allEquipments = [
        ...EQUIPMENT_TYPES,
        ...customEquipments.map((t: any) => ({ id: t.id, kvDefault: t.kvDefault })),
      ]
      for (const e of (tr.equipment ?? [])) {
        const kv = e.kvOverride
          ?? params.equipmentOverrides?.[e.type]
          ?? allEquipments.find(t => t.id === e.type)?.kvDefault
        if (!kv || kv <= 0) continue
        dpEquip += Math.pow((totalQpM3h / kv), 2) * 100000
      }
    }

    const dpTotal = dpFric + dpSing + dpEquip + dpStatic
    const presOut = presIn - dpTotal
    results.set(tr.id, {
      di_mm, V, J, Re, lambda, regime,
      dpFric, dpSing, dpEquip, dpStatic, dpTotal, presIn, presOut,
      rho, mu, nu, T_used: T, dynPressure,
      epsilon_used: isdc ? epsilon : undefined,
    })
    presIn = presOut
  }
  return results
}

/**
 * Pression statique (débit nul, frottements=0) au nœud Production ECS.
 * Uniquement la composante hydrostatique entre l'arrivée EF et la Production ECS.
 */
export function computePresSourceECSStatic(params: any, materials: any[] = []): number {
  if ((params.modePresSource ?? 'depart-ecs') !== 'arrivee-ef')
    return params.pressionSourceDisponible ?? 300000
  const T   = params.T_ef ?? 10
  const rho = waterDensity(T)
  const tronçons: TronconAmontEF[] = params.tronçonsAmont ?? []
  if (tronçons.length === 0) return params.pressionArriveeEF ?? 300000
  let pres = params.pressionArriveeEF ?? 300000
  for (const tr of tronçons) {
    const deltaH = (tr.coteAval ?? 0) - (tr.coteAmont ?? 0)
    pres -= rho * 9.81 * deltaH
  }
  return pres
}

/**
 * Pression disponible au nœud Production ECS après pertes de charge amont.
 */
export function computePresSourceECS(params: any, totalQpM3h: number, materials: any[] = []): number {
  if ((params.modePresSource ?? 'depart-ecs') !== 'arrivee-ef')
    return params.pressionSourceDisponible ?? 300000
  const tronçons: TronconAmontEF[] = params.tronçonsAmont ?? []
  if (tronçons.length === 0) return params.pressionArriveeEF ?? 300000
  const results = computeAmontResults(params, totalQpM3h, materials)
  return results.get(tronçons[tronçons.length - 1].id)?.presOut ?? (params.pressionArriveeEF ?? 300000)
}
