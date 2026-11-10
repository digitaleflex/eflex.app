import type { PlatformEvent } from '@/lib/event-bus'

/**
 * Logique pure du terminal d'exploitation (`/admin/live`) : classification, filtrage,
 * fusion et exports. Aucun accès base ni réseau, donc testable sans serveur.
 *
 * Les événements reçus ici ont déjà été assainis côté serveur (`lib/live-events-server.ts`) :
 * aucune valeur secrète ne doit arriver jusqu'à ce module.
 */

export type LiveEvent = PlatformEvent & { organizationName?: string | null }

export type LiveSeverity = 'info' | 'success' | 'warning' | 'error'
export type LiveCategory = 'deploiement' | 'projet' | 'compte' | 'administration' | 'facturation' | 'autre'

export const SEVERITIES: readonly LiveSeverity[] = ['error', 'warning', 'success', 'info']
export const CATEGORIES: readonly LiveCategory[] = ['deploiement', 'projet', 'compte', 'administration', 'facturation', 'autre']

export const SEVERITY_LABEL: Record<LiveSeverity, string> = {
  error: 'Erreur',
  warning: 'Avertissement',
  success: 'Succès',
  info: 'Information',
}

export const CATEGORY_LABEL: Record<LiveCategory, string> = {
  deploiement: 'Déploiement',
  projet: 'Projet',
  compte: 'Compte',
  administration: 'Administration',
  facturation: 'Facturation',
  autre: 'Autre',
}

/** Variantes du composant `Badge` (contrastes AA fournis par les tokens). */
export const SEVERITY_BADGE: Record<LiveSeverity, 'destructive' | 'warning' | 'success' | 'outline'> = {
  error: 'destructive',
  warning: 'warning',
  success: 'success',
  info: 'outline',
}

const AUDIT_LABEL: Record<string, string> = {
  'user.ban': 'Compte suspendu',
  'user.unban': 'Compte réactivé',
  'user.impersonate': 'Session usurpée',
  'user.stop_impersonate': 'Fin d’usurpation',
  'organization.subscription': 'Abonnement modifié',
  'payment.refund': 'Paiement remboursé',
  'project.redeploy': 'Projet redéployé',
  'project.transfer': 'Projet transféré',
  'project.runtime': 'Application pilotée',
  'project.infrastructure.delete': 'Infrastructure supprimée',
  'deployment.cancel': 'Déploiement annulé',
  'deployment.unblock': 'Déploiement débloqué',
  'deployment.logs.view': 'Journaux consultés',
  'metrics.export': 'Indicateurs exportés',
  'infrastructure.settings': 'Configuration modifiée',
  'infrastructure.check': 'Infrastructure vérifiée',
  'platform.settings.update': 'Configuration modifiée',
  'platform.infrastructure.check': 'Infrastructure vérifiée',
  'log.read': 'Journaux consultés',
}

const text = (value: unknown, max = 160): string | null => {
  if (typeof value === 'string' && value.trim()) {
    const trimmed = value.trim()
    return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

const statusOf = (event: Pick<LiveEvent, 'payload'>): string | null => text(event.payload.status, 40)

const DEPLOYMENT_TITLE: Record<string, string> = {
  queued: 'Déploiement en file d’attente',
  analyzing: 'Déploiement : analyse du dépôt',
  provisioning: 'Déploiement : provisionnement',
  building: 'Déploiement : construction de l’image',
  deploying: 'Déploiement : mise en ligne',
  live: 'Déploiement réussi',
  failed: 'Déploiement échoué',
  cancelled: 'Déploiement annulé',
  rollbacked: 'Déploiement annulé',
}

/** Libellé français d'une action du journal d'audit. */
export function auditActionLabel(action: string): string {
  return AUDIT_LABEL[action] ?? `Action d’administration (${action})`
}

/** Gravité affichée : elle dérive du type et, pour les déploiements, du statut porté. */
export function severityOf(event: Pick<LiveEvent, 'type' | 'payload'>): LiveSeverity {
  const type = event.type
  const status = statusOf(event)

  if (type === 'deployment.status') {
    if (status === 'live') return 'success'
    if (status === 'failed' || status === 'cancelled' || status === 'rollbacked') return 'error'
    return 'info'
  }
  if (type === 'deployment.created') return status === 'failed' ? 'error' : 'info'
  if (type === 'audit.entry') {
    const action = text(event.payload.action, 60)
    return action === 'user.ban' ? 'warning' : 'info'
  }
  if (type === 'subscription.updated') {
    const subscribed = text(event.payload.status, 20)
    return subscribed === 'cancelled' ? 'warning' : 'info'
  }
  if (/fail|error|exception|panic|crash/i.test(type)) return 'error'
  if (/warning|cancel|suspend|revok/i.test(type)) return 'warning'
  return 'info'
}

export function categoryOf(type: string): LiveCategory {
  if (type.startsWith('deployment.')) return 'deploiement'
  if (type.startsWith('project.')) return 'projet'
  if (type === 'audit.entry') return 'administration'
  if (type.startsWith('user.') || type.startsWith('member') || type.startsWith('invitation.') || type.startsWith('membership.')) return 'compte'
  if (type.startsWith('payment.') || type.startsWith('subscription.') || type.startsWith('billing.')) return 'facturation'
  return 'autre'
}

/** Description en français d'un événement : un titre court et un détail facultatif. */
export function describeEvent(event: Pick<LiveEvent, 'type' | 'payload'>): { title: string; detail: string | null } {
  const { type, payload } = event
  const status = statusOf(event)

  if (type === 'deployment.status') {
    return { title: DEPLOYMENT_TITLE[status ?? ''] ?? 'Déploiement mis à jour', detail: text(payload.name) ?? text(payload.projectId, 20) }
  }
  if (type === 'deployment.created') {
    return { title: 'Déploiement demandé', detail: text(payload.name) ?? text(payload.projectId, 20) }
  }
  if (type === 'project.created') return { title: 'Projet créé', detail: text(payload.name) }
  if (type === 'project.updated') return { title: 'Projet modifié', detail: text(payload.name) }
  if (type === 'project.deleted') return { title: 'Projet supprimé', detail: text(payload.name) }
  if (type === 'project.transferred') {
    const incoming = payload.direction === 'in'
    return {
      title: incoming ? 'Projet reçu' : 'Projet transféré',
      detail: text(incoming ? payload.fromOrganizationName : payload.toOrganizationName) ?? text(payload.name),
    }
  }
  if (type === 'user.registered') return { title: 'Nouvelle inscription', detail: text(payload.email) ?? text(payload.name) }
  if (type === 'audit.entry') {
    const action = text(payload.action, 60) ?? 'inconnue'
    return { title: auditActionLabel(action), detail: text(payload.targetType, 40) }
  }
  if (type === 'member.added') return { title: 'Membre ajouté', detail: text(payload.role, 40) }
  if (type === 'member.removed') return { title: 'Membre retiré', detail: null }
  if (type === 'member.updated') return { title: 'Rôle de membre modifié', detail: text(payload.role, 40) }
  if (type === 'invitation.created') return { title: 'Invitation envoyée', detail: null }
  if (type === 'invitation.updated') return { title: 'Invitation mise à jour', detail: text(payload.status, 40) }
  if (type === 'subscription.updated') {
    const plan = text(payload.plan, 40)
    return { title: 'Abonnement mis à jour', detail: plan ? `${plan} · ${status ?? 'actif'}` : status }
  }
  if (type === 'payment.succeeded') return { title: 'Paiement confirmé', detail: text(payload.provider, 40) }
  if (type === 'payment.failed') return { title: 'Paiement refusé', detail: text(payload.provider, 40) }
  if (type === 'notification.created') return { title: text(payload.title) ?? 'Notification envoyée', detail: text(payload.notificationType, 40) }
  return { title: type, detail: status }
}

export type LiveFilters = {
  category: LiveCategory | 'all'
  severity: LiveSeverity | 'all'
  query?: string
}

/** Texte indexé par la recherche : type, libellé, détail, organisation et charge utile assainie. */
export function searchableText(event: LiveEvent): string {
  const { title, detail } = describeEvent(event)
  return [
    event.type,
    title,
    detail ?? '',
    event.organizationName ?? '',
    event.organizationId ?? '',
    SEVERITY_LABEL[severityOf(event)],
    CATEGORY_LABEL[categoryOf(event.type)],
    JSON.stringify(event.payload),
  ]
    .join(' ')
    .toLowerCase()
}

export function matchesLiveFilters(event: LiveEvent, filters: LiveFilters): boolean {
  if (filters.category !== 'all' && categoryOf(event.type) !== filters.category) return false
  if (filters.severity !== 'all' && severityOf(event) !== filters.severity) return false
  const term = (filters.query ?? '').trim().toLowerCase()
  if (!term) return true
  return term.split(/\s+/).every((word) => searchableText(event).includes(word))
}

/**
 * Fusionne un lot d'événements avec l'historique : dédoublonnage par identifiant, ordre
 * croissant, borne du nombre de lignes conservées (les plus anciennes sortent en premier).
 */
export function mergeLiveEvents(
  previous: readonly LiveEvent[],
  incoming: readonly LiveEvent[],
  limit = 500,
): { events: LiveEvent[]; added: number; dropped: number } {
  const byId = new Map<number, LiveEvent>()
  for (const event of previous) byId.set(event.id, event)
  let added = 0
  for (const event of incoming) {
    const before = byId.get(event.id)
    if (!before) added += 1
    byId.set(event.id, {
      ...before,
      ...event,
      organizationName: event.organizationName ?? before?.organizationName ?? null,
    })
  }
  const all = [...byId.values()].sort((a, b) => a.id - b.id)
  const dropped = Math.max(0, all.length - limit)
  return { events: dropped > 0 ? all.slice(dropped) : all, added, dropped }
}

const clock = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  timeZone: 'Europe/Paris',
})

const longDate = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
})

/** Heure fixée sur Europe/Paris : le rendu serveur et le rendu client restent identiques. */
export function formatLiveClock(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : clock.format(date)
}

export function formatLiveDate(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? '—' : longDate.format(date)
}

const iso = (event: LiveEvent) => {
  const date = new Date(event.createdAt)
  return Number.isNaN(date.getTime()) ? event.createdAt : date.toISOString()
}

/** Export texte brut, une ligne par événement (le plus récent en dernier). */
export function toLiveText(events: readonly LiveEvent[]): string {
  return events
    .map((event) => {
      const { title, detail } = describeEvent(event)
      const org = event.organizationName ?? (event.organizationId ? `organisation ${event.organizationId.slice(0, 8)}` : 'Plateforme')
      return `${iso(event)}  ${SEVERITY_LABEL[severityOf(event)].toUpperCase().padEnd(13)} ${event.type.padEnd(22)} ${title}${detail ? ` — ${detail}` : ''} · ${org}`
    })
    .join('\n')
    .concat(events.length > 0 ? '\n' : '')
}

const CSV_HEADER = ['Horodatage', 'Gravité', 'Catégorie', 'Type', 'Description', 'Détail', 'Organisation', 'Identifiant'] as const

const csvCell = (value: string | number | null): string => {
  const raw = value === null ? '' : String(value)
  return /[";\n\r]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw
}

/** Export CSV (séparateur `;`, adapté aux tableurs français). */
export function toLiveCsv(events: readonly LiveEvent[]): string {
  const lines = events.map((event) => {
    const { title, detail } = describeEvent(event)
    return [
      iso(event),
      SEVERITY_LABEL[severityOf(event)],
      CATEGORY_LABEL[categoryOf(event.type)],
      event.type,
      title,
      detail,
      event.organizationName ?? event.organizationId ?? 'Plateforme',
      String(event.id),
    ]
      .map(csvCell)
      .join(';')
  })
  return [CSV_HEADER.join(';'), ...lines].join('\n').concat('\n')
}
