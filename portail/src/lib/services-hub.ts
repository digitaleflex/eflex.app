import {
  MANAGED_SERVICES_CATALOG,
  SERVICE_CATEGORIES,
  type ManagedServiceEntry,
  type ServiceActionKind,
  type ServiceAvailability,
  type ServiceCategory,
} from '@/lib/managed-services-catalog'

/**
 * Modèle UI unifié pour le hub « Bases de données & services » (#182).
 * Fusionne les capacités runtime des moteurs (#183) et le catalogue statique sans duplication :
 * une entrée canonique par service, avec disponibilité/capacités/prérequis/limites fidèles.
 */

export type ServiceDisplayState =
  | 'active'
  | 'creatable'
  | 'unavailable'
  | 'coolify-oneclick'
  | 'eflex-managed'
  | 'planned'

export type ServiceFilterState = 'provisionable' | 'added' | 'unavailable' | 'coolify-oneclick' | 'eflex-managed' | 'planned'

export interface EngineOperationView {
  operation: 'provision' | 'lifecycle' | 'backup' | 'restore'
  supported: boolean
  provider?: string | null
  reason?: string
}

export interface EngineSelectionPolicyView {
  preferred: string
  selected: string
  outcome: 'coolify' | 'eflex' | 'none'
  reason?: string
}

export interface EngineInfoView {
  kind: string
  label: string
  envKey: string
  envAliases?: string[]
  description: string
  backupSupported?: boolean
  restoreSupported?: boolean
  provider?: string
  provisionSupported?: boolean
  lifecycleSupported?: boolean
  notes?: string[]
  reason?: string
  created?: boolean
  maturity?: 'stable' | 'experimental' | 'unsupported' | 'planned'
  operations?: Record<string, EngineOperationView>
  selectionPolicy?: EngineSelectionPolicyView
}

export interface ManagedDatabaseView {
  id: string
  kind: string
  label: string
  envKey: string
  description: string | null
  status: string
  error: string | null
  createdAt: string
}

export interface RuntimeView {
  version: string | null
  reachable: boolean
  databaseApiAvailable?: boolean | null
  checkedAt?: number | null
}

export interface ActiveServiceView {
  id: string
  name: string
  status: string | null
  catalogId: string
  label: string
}

export interface UnifiedService {
  key: string
  id: string
  label: string
  description: string
  category: ServiceCategory
  icon: string
  envKey: string | null
  envAliases: string[]
  state: ServiceDisplayState
  filterTags: ServiceFilterState[]
  availability: ServiceAvailability | null
  managedDatabaseKind: string | null
  coolifyServiceType: string | null
  // runtime/capacités (moteurs)
  provisionSupported: boolean
  lifecycleSupported: boolean
  backupSupported: boolean
  restoreSupported: boolean
  provider: 'coolify' | 'eflex' | null
  reason: string | null
  notes: string[]
  created: boolean
  activeDatabase: ManagedDatabaseView | null
  activeService: ActiveServiceView | null
  /** Capacité ajustée (politique/apprentissage) détectée via notes/raison. */
  adjusted: boolean
  /** Métadonnées catalogue (#182) */
  prerequisites: string[]
  limits: string[]
  actionKind: ServiceActionKind | null
  maturity: 'stable' | 'experimental' | 'unsupported' | 'planned' | null
  operations: EngineOperationView[] | null
  selectionPolicy: EngineSelectionPolicyView | null
}

export interface CategoryAggregate {
  category: ServiceCategory
  label: string
  services: UnifiedService[]
  counts: {
    total: number
    active: number
    creatable: number
    unavailable: number
    coolifyOneclick: number
    eflexManaged: number
    planned: number
  }
  hasAttention: boolean
}

export interface ServicesHubModel {
  runtime: RuntimeView | null
  canManage: boolean
  activeDatabases: ManagedDatabaseView[]
  services: UnifiedService[]
  categories: CategoryAggregate[]
}

export const CATEGORY_ORDER: ServiceCategory[] = [
  'database',
  'cache',
  'storage',
  'search',
  'messaging',
  'vector',
  'observability',
  'backend',
]

export const STATE_LABELS: Record<ServiceDisplayState, string> = {
  active: 'Active',
  creatable: 'Provisionnable',
  unavailable: 'Indisponible sur cette instance',
  'coolify-oneclick': 'Via Coolify (one-click)',
  'eflex-managed': 'EFLEX-géré (candidat)',
  planned: 'À venir',
}

export const STATE_TONES: Record<ServiceDisplayState, 'success' | 'info' | 'warning' | 'muted'> = {
  active: 'success',
  creatable: 'success',
  unavailable: 'warning',
  'coolify-oneclick': 'info',
  'eflex-managed': 'warning',
  planned: 'muted',
}

export const FILTER_LABELS: Record<ServiceFilterState, string> = {
  provisionable: 'Provisionnable',
  added: 'Déjà ajouté',
  unavailable: 'Indisponible ici',
  'coolify-oneclick': 'Via Coolify',
  'eflex-managed': 'EFLEX-géré',
  planned: 'À venir',
}

export const MATURITY_LABELS: Record<string, string> = {
  stable: 'Support stable',
  experimental: 'Support expérimental',
  unsupported: 'Non supporté',
  planned: 'Planifié',
}

export const OPERATION_LABELS: Record<string, string> = {
  provision: 'Provisionnement',
  lifecycle: 'Cycle de vie',
  backup: 'Sauvegarde',
  restore: 'Restauration',
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
}

export function matchesServiceQuery(service: UnifiedService, query: string): boolean {
  const q = normalizeText(query.trim())
  if (!q) return true
  const haystack = normalizeText(
    [
      service.label,
      service.description,
      service.envKey ?? '',
      service.reason ?? '',
      service.category,
      SERVICE_CATEGORIES[service.category],
      ...service.notes,
    ].join(' '),
  )
  return haystack.includes(q)
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = normalizeText(trimmed)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
  }
  return out
}

function isAdjusted(reason: string | null, notes: string[], selectionPolicy?: EngineSelectionPolicyView | null): boolean {
  if (selectionPolicy?.reason) return true
  if (selectionPolicy && selectionPolicy.preferred !== selectionPolicy.selected) return true
  const text = [reason ?? '', ...notes].join(' ').toLowerCase()
  return (
    text.includes('ajustée') ||
    text.includes('ajustee') ||
    text.includes('politique') ||
    text.includes('apprentissage') ||
    text.includes('désactivé par la configuration') ||
    text.includes('desactive par la configuration') ||
    text.includes('expérimental') ||
    text.includes('experimental') ||
    text.includes('non activé par défaut') ||
    text.includes('repli')
  )
}

function categoryForUnknownEngine(kind: string): ServiceCategory {
  if (kind === 'redis' || kind === 'dragonfly' || kind === 'keydb') return 'cache'
  return 'database'
}

function toOperationViews(operations?: Record<string, EngineOperationView>): EngineOperationView[] | null {
  if (!operations) return null
  const order = ['provision', 'lifecycle', 'backup', 'restore']
  return order
    .map((key) => operations[key])
    .filter((op): op is EngineOperationView => Boolean(op))
}

export function buildServicesHubModel(input: {
  databases: ManagedDatabaseView[]
  engines: EngineInfoView[]
  runtime: RuntimeView | null
  canManage: boolean
  activeServices?: ActiveServiceView[]
  catalog?: readonly ManagedServiceEntry[]
}): ServicesHubModel {
  const catalog = input.catalog ?? MANAGED_SERVICES_CATALOG
  const dbByKind = new Map(input.databases.map((d) => [d.kind, d]))
  const engineByKind = new Map(input.engines.map((e) => [e.kind, e]))
  const serviceByCatalogId = new Map((input.activeServices ?? []).map((s) => [s.catalogId, s]))
  const services: UnifiedService[] = []
  const seen = new Set<string>()

  const pushService = (service: UnifiedService) => {
    if (seen.has(service.key)) return
    seen.add(service.key)
    services.push(service)
  }

  for (const entry of catalog) {
    const kind = entry.managedDatabaseKind ?? null
    const engine = kind ? engineByKind.get(kind) : undefined
    const active = kind ? dbByKind.get(kind) : undefined
    const activeService = serviceByCatalogId.get(entry.id) ?? null
    const prerequisites = uniqueStrings(entry.prerequisites ?? [])
    const limits = uniqueStrings(entry.limits ?? [])
    const notes = uniqueStrings([...(engine?.notes ?? []), ...(entry.notes ? [entry.notes] : [])])
    const reason = engine?.reason ?? null
    const provider = engine?.provider === 'eflex' ? 'eflex' : engine ? 'coolify' : entry.coolifyServiceType ? 'coolify' : null
    const coolifyServiceType = entry.coolifyServiceType ?? null
    const operations = toOperationViews(engine?.operations)
    const selectionPolicy = engine?.selectionPolicy ?? null
    const maturity = engine?.maturity ?? (entry.availability === 'planned' || entry.availability === 'eflex-managed' ? 'planned' : null)

    let state: ServiceDisplayState
    if (active || activeService) {
      state = 'active'
    } else if (engine) {
      // Base managée : l'état dépend strictement des capacités réelles (#183/#184).
      if (engine.provisionSupported && engine.lifecycleSupported) state = 'creatable'
      else state = 'unavailable'
    } else if (coolifyServiceType) {
      // Service provisionnable via template Coolify one-click (parcours câblé).
      state = 'creatable'
    } else if (entry.availability === 'coolify-oneclick') {
      state = 'coolify-oneclick'
    } else if (entry.availability === 'eflex-managed') {
      state = 'eflex-managed'
    } else if (entry.availability === 'planned') {
      state = 'planned'
    } else {
      state = 'unavailable'
    }

    const filterTags: ServiceFilterState[] = []
    if (state === 'active') filterTags.push('added')
    else if (state === 'creatable') filterTags.push('provisionable')
    else if (state === 'unavailable') filterTags.push('unavailable')
    else filterTags.push(state)

    // Pour les services one-click sans moteur DB, les capacités backup/restore intégrées EFLEX ne s'appliquent pas.
    const provisionSupported = engine?.provisionSupported ?? Boolean(coolifyServiceType)
    const lifecycleSupported = engine?.lifecycleSupported ?? Boolean(coolifyServiceType)

    pushService({
      key: kind ?? entry.id,
      id: entry.id,
      label: engine?.label ?? entry.label,
      description: engine?.description ?? entry.description,
      category: entry.category,
      icon: entry.icon || kind || entry.id,
      envKey: engine?.envKey ?? null,
      envAliases: engine?.envAliases ?? [],
      state,
      filterTags,
      availability: entry.availability,
      managedDatabaseKind: kind,
      coolifyServiceType,
      provisionSupported,
      lifecycleSupported,
      backupSupported: engine?.backupSupported ?? false,
      restoreSupported: engine?.restoreSupported ?? false,
      provider,
      reason,
      notes,
      created: Boolean(active || activeService || engine?.created),
      activeDatabase: active ?? null,
      activeService,
      adjusted: engine ? isAdjusted(reason, notes, selectionPolicy) : false,
      prerequisites,
      limits,
      actionKind: entry.action ?? (kind ? 'managed-database' : coolifyServiceType ? 'coolify-service' : 'planned'),
      maturity,
      operations,
      selectionPolicy,
    })
  }

  // Moteurs runtime absents du catalogue (défensif/futur)
  for (const engine of input.engines) {
    if (seen.has(engine.kind)) continue
    const active = dbByKind.get(engine.kind)
    let state: ServiceDisplayState
    if (active) state = 'active'
    else if (engine.provisionSupported && engine.lifecycleSupported) state = 'creatable'
    else state = 'unavailable'
    const reason = engine.reason ?? null
    const notes = uniqueStrings(engine.notes ?? [])
    const operations = toOperationViews(engine.operations)
    const selectionPolicy = engine.selectionPolicy ?? null
    pushService({
      key: engine.kind,
      id: engine.kind,
      label: engine.label,
      description: engine.description,
      category: categoryForUnknownEngine(engine.kind),
      icon: engine.kind,
      envKey: engine.envKey,
      envAliases: engine.envAliases ?? [],
      state,
      filterTags: [state === 'active' ? 'added' : state === 'creatable' ? 'provisionable' : 'unavailable'],
      availability: null,
      managedDatabaseKind: engine.kind,
      coolifyServiceType: null,
      provisionSupported: engine.provisionSupported ?? false,
      lifecycleSupported: engine.lifecycleSupported ?? false,
      backupSupported: engine.backupSupported ?? false,
      restoreSupported: engine.restoreSupported ?? false,
      provider: engine.provider === 'eflex' ? 'eflex' : 'coolify',
      reason,
      notes,
      created: Boolean(active || engine.created),
      activeDatabase: active ?? null,
      activeService: null,
      adjusted: isAdjusted(reason, notes, selectionPolicy),
      prerequisites: [],
      limits: [],
      actionKind: 'managed-database',
      maturity: engine.maturity ?? null,
      operations,
      selectionPolicy,
    })
  }

  const categoryRank = new Map(CATEGORY_ORDER.map((c, i) => [c, i]))
  const stateRank: Record<ServiceDisplayState, number> = {
    active: 0,
    creatable: 1,
    unavailable: 2,
    'coolify-oneclick': 3,
    'eflex-managed': 4,
    planned: 5,
  }
  services.sort((a, b) => {
    const ca = categoryRank.get(a.category) ?? 99
    const cb = categoryRank.get(b.category) ?? 99
    if (ca !== cb) return ca - cb
    if (stateRank[a.state] !== stateRank[b.state]) return stateRank[a.state] - stateRank[b.state]
    return a.label.localeCompare(b.label, 'fr')
  })

  const categories: CategoryAggregate[] = CATEGORY_ORDER.map((category) => {
    const items = services.filter((s) => s.category === category)
    const counts = {
      total: items.length,
      active: items.filter((s) => s.state === 'active').length,
      creatable: items.filter((s) => s.state === 'creatable').length,
      unavailable: items.filter((s) => s.state === 'unavailable').length,
      coolifyOneclick: items.filter((s) => s.state === 'coolify-oneclick').length,
      eflexManaged: items.filter((s) => s.state === 'eflex-managed').length,
      planned: items.filter((s) => s.state === 'planned').length,
    }
    const hasAttention = items.some((s) => s.state === 'unavailable' || s.adjusted || Boolean(s.reason))
    return { category, label: SERVICE_CATEGORIES[category], services: items, counts, hasAttention }
  }).filter((c) => c.services.length > 0)

  return {
    runtime: input.runtime,
    canManage: input.canManage,
    activeDatabases: input.databases,
    services,
    categories,
  }
}

export function runtimeDatabaseApiLabel(runtime: RuntimeView | null): { label: string; tone: 'ok' | 'warn' | 'bad' } {
  const available = runtime?.databaseApiAvailable
  if (available === true) return { label: 'disponible', tone: 'ok' }
  if (available === false) return { label: 'indisponible', tone: 'bad' }
  return { label: 'non confirmée', tone: 'warn' }
}
