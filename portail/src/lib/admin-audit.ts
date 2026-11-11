import type { Prisma } from '@prisma/client'
import { auditActionLabel } from './live-events'

/**
 * Filtres, périodes et mise en forme du journal d'audit (#51).
 *
 * Module pur : la page et la route de suivi s'en servent pour construire la
 * restriction Prisma et les liens. Les valeurs affichées ont déjà été
 * assainies à l'écriture (`lib/audit.ts`) ; `auditDetailEntries` écarte en plus
 * les clés manifestement sensibles.
 */

export const AUDIT_PAGE_SIZE = 50

export const AUDIT_ACTIONS = [
  'user.ban',
  'user.unban',
  'user.impersonate',
  'user.stop_impersonate',
  'organization.suspend',
  'organization.reactivate',
  'organization.plan.change',
  'organization.period.extend',
  'organization.quota.override',
  'organization.override.clear',
  'organization.subscription',
  'payment.refund',
  'project.redeploy',
  'project.transfer',
  'project.runtime',
  'project.infrastructure.delete',
  'deployment.cancel',
  'deployment.rollback',
  'deployment.unblock',
  'deployment.logs.view',
  'metrics.export',
  'platform.settings.update',
  'platform.infrastructure.check',
  'infrastructure.settings',
  'infrastructure.check',
  'log.read',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/** Options du sélecteur : libellé français issu de la même table que le terminal d'exploitation. */
export const AUDIT_ACTION_OPTIONS = AUDIT_ACTIONS.map((action) => ({
  value: action,
  label: auditActionLabel(action),
}))

export const AUDIT_PERIOD_OPTIONS = [
  { value: '0', days: 0, label: 'Toute la période' },
  { value: '1', days: 1, label: 'Dernières 24 heures' },
  { value: '7', days: 7, label: '7 derniers jours' },
  { value: '30', days: 30, label: '30 derniers jours' },
  { value: '90', days: 90, label: '90 derniers jours' },
] as const

export type AuditCategory = 'compte' | 'facturation' | 'projet' | 'deploiement' | 'infrastructure' | 'consultation'

export const AUDIT_CATEGORY_LABEL: Record<AuditCategory, string> = {
  compte: 'Compte',
  facturation: 'Facturation',
  projet: 'Projet',
  deploiement: 'Déploiement',
  infrastructure: 'Infrastructure',
  consultation: 'Consultation',
}

export function auditActionCategory(action: string): AuditCategory {
  if (action === 'metrics.export' || action === 'log.read' || action === 'deployment.logs.view') return 'consultation'
  if (action.startsWith('user.')) return 'compte'
  if (action.startsWith('organization.') || action.startsWith('payment.')) return 'facturation'
  if (action.startsWith('project.')) return 'projet'
  if (action.startsWith('deployment.')) return 'deploiement'
  if (action.startsWith('infrastructure.') || action.startsWith('platform.')) return 'infrastructure'
  return 'consultation'
}

const TARGET_LABEL: Record<string, string> = {
  user: 'Compte',
  organization: 'Organisation',
  project: 'Projet',
  deployment: 'Déploiement',
  payment: 'Paiement',
  infrastructure: 'Infrastructure',
  platform: 'Plateforme',
}

export function auditTargetLabel(targetType: string): string {
  return TARGET_LABEL[targetType] ?? targetType
}

/**
 * Lien vers la fiche concernée, quand elle existe. Les identifiants restent
 * dans la zone d'administration ; aucune donnée sensible n'est ajoutée à l'URL.
 */
export function auditTargetHref(targetType: string, targetId: string): string | null {
  if (!targetId) return null
  if (targetType === 'project') return `/admin/projects/${encodeURIComponent(targetId)}`
  if (targetType === 'deployment') return `/admin/deployments/${encodeURIComponent(targetId)}`
  if (targetType === 'organization') return `/admin/organizations/${encodeURIComponent(targetId)}`
  if (targetType === 'payment') return '/admin/payments'
  if (targetType === 'infrastructure' || targetType === 'platform') return '/admin/infrastructure'
  return null
}

const MS_DAY = 86_400_000
const ACTION_PATTERN = /^[a-z0-9._-]{1,80}$/i
const SEARCH_MAX = 100

export type AuditQuery = {
  action: string | null
  /** Recherche sur l'adresse de l'acteur. */
  actor: string
  /** Recherche sur le type ou l'identifiant de la cible. */
  target: string
  /** Fenêtre glissante en jours ; 0 = aucune limite. */
  days: number
  page: number
}

const allowedDays: readonly number[] = AUDIT_PERIOD_OPTIONS.map((option) => option.days)

/** Normalise les paramètres d'URL de `/admin/audit` (valeurs inconnues ignorées). */
export function parseAuditQuery(input: {
  action?: string
  acteur?: string
  cible?: string
  jours?: string
  page?: string
}): AuditQuery {
  const action = (input.action ?? '').trim()
  const days = Number.parseInt(input.jours ?? '0', 10)
  return {
    action: ACTION_PATTERN.test(action) ? action.slice(0, 80) : null,
    actor: (input.acteur ?? '').trim().slice(0, SEARCH_MAX),
    target: (input.cible ?? '').trim().slice(0, SEARCH_MAX),
    days: allowedDays.includes(days) ? days : 0,
    page: Math.max(1, Number.parseInt(input.page ?? '1', 10) || 1),
  }
}

export function auditSince(days: number, now = new Date()): Date | null {
  if (!Number.isFinite(days) || days <= 0) return null
  return new Date(now.getTime() - Math.trunc(days) * MS_DAY)
}

/** Restriction Prisma, cumulée en `AND` pour ne jamais élargir la sélection. */
export function auditWhere(query: AuditQuery, now = new Date()): Prisma.AuditLogWhereInput {
  const filters: Prisma.AuditLogWhereInput[] = []

  if (query.action) filters.push({ action: query.action })
  if (query.actor) filters.push({ actorEmail: { contains: query.actor, mode: 'insensitive' } })
  if (query.target) {
    filters.push({
      OR: [
        { targetType: { contains: query.target, mode: 'insensitive' } },
        { targetId: { contains: query.target, mode: 'insensitive' } },
      ],
    })
  }
  const since = auditSince(query.days, now)
  if (since) filters.push({ createdAt: { gte: since } })

  if (filters.length === 0) return {}
  if (filters.length === 1) return filters[0]!
  return { AND: filters }
}

/** Vrai dès qu'un filtre restreint le journal. */
export function isAuditFiltered(query: AuditQuery): boolean {
  return query.action !== null || query.actor !== '' || query.target !== '' || query.days > 0
}

export type AuditEntryRef = {
  action: string
  targetType: string
  targetId: string
  actorEmail: string
  createdAt: string
}

/**
 * Vérification côté client des entrées reçues en direct : la route applique déjà
 * les filtres, ce contrôle évite d'afficher une entrée hors filtre si la réponse
 * arrive après un changement de filtre.
 */
export function matchesAuditFilters(entry: AuditEntryRef, query: AuditQuery, now = new Date()): boolean {
  if (query.action && entry.action !== query.action) return false
  if (query.actor && !entry.actorEmail.toLowerCase().includes(query.actor.toLowerCase())) return false
  if (query.target) {
    const target = query.target.toLowerCase()
    const type = entry.targetType.toLowerCase()
    const id = entry.targetId.toLowerCase()
    if (!type.includes(target) && !id.includes(target)) return false
  }
  const since = auditSince(query.days, now)
  if (since && new Date(entry.createdAt).getTime() < since.getTime()) return false
  return true
}

const appendFilters = (params: URLSearchParams, query: AuditQuery) => {
  if (query.action) params.set('action', query.action)
  if (query.actor) params.set('acteur', query.actor)
  if (query.target) params.set('cible', query.target)
  if (query.days > 0) params.set('jours', String(query.days))
}

export function auditHref(query: AuditQuery, overrides: Partial<AuditQuery> = {}): string {
  const merged = { ...query, ...overrides }
  const params = new URLSearchParams()
  appendFilters(params, merged)
  if (merged.page > 1) params.set('page', String(merged.page))
  const search = params.toString()
  return `/admin/audit${search ? `?${search}` : ''}`
}

/** Gabarit attendu par `Pagination` (chaîne sérialisable, page laissée vide). */
export function auditHrefTemplate(query: AuditQuery): string {
  const params = new URLSearchParams()
  appendFilters(params, query)
  params.set('page', '')
  return `/admin/audit?${params.toString()}`
}

/** Paramètres transmis au suivi en direct : identiques à ceux de la page. */
export function auditTailQuery(query: AuditQuery): string {
  const params = new URLSearchParams({ limit: '50' })
  appendFilters(params, query)
  return params.toString()
}

const SECRET_DETAIL_KEY =
  /pass(word)?|secret|token|cookie|authorization|api[-_]?key|credential|^ip$|useragent|user_agent/i

const DETAIL_LABEL: Record<string, string> = {
  reason: 'Motif',
  targetEmail: 'Adresse cible',
  email: 'Adresse e-mail',
  role: 'Rôle',
  previousRole: 'Rôle précédent',
  plan: 'Plan',
  previousPlan: 'Plan précédent',
  previousStatus: 'Statut précédent',
  status: 'Statut',
  amount: 'Montant (FCFA)',
  amountFcfa: 'Montant (FCFA)',
  days: 'Durée (jours)',
  until: 'Jusqu’au',
  organization: 'Organisation',
  project: 'Projet',
  deployment: 'Déploiement',
  provider: 'Fournisseur',
  invoiceNumber: 'Facture',
  runtimeAction: 'Action',
}

export type AuditDetailView = { key: string; label: string; value: string }

const formatDetailValue = (value: unknown): string => {
  if (typeof value === 'string') return value.length > 200 ? `${value.slice(0, 200)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    const parts = value.map((item) => (typeof item === 'object' ? '[objet]' : String(item)))
    const text = parts.join(', ')
    return text.length > 200 ? `${text.slice(0, 200)}…` : text
  }
  if (value && typeof value === 'object') {
    try {
      const text = JSON.stringify(value)
      return text.length > 200 ? `${text.slice(0, 200)}…` : text
    } catch {
      return '[objet]'
    }
  }
  return ''
}

/**
 * Détails affichables d'une entrée : libellés français pour les clés connues,
 * clés sensibles écartées, valeur bornée. Jamais d'objet brut rendu dans le DOM.
 */
export function auditDetailEntries(details: unknown, max = 12): AuditDetailView[] {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return []
  const entries: AuditDetailView[] = []
  for (const [key, raw] of Object.entries(details as Record<string, unknown>)) {
    if (SECRET_DETAIL_KEY.test(key)) continue
    if (raw === null || raw === undefined || raw === '') continue
    const value = formatDetailValue(raw)
    if (!value) continue
    entries.push({ key, label: DETAIL_LABEL[key] ?? key, value })
    if (entries.length >= max) break
  }
  return entries
}
