/**
 * Décisions et formatage de la console d'administration « projets, déploiements
 * et opérations » (issue #28).
 *
 * Toutes les fonctions de ce module sont **pures** : aucun accès à la base, à
 * Redis ou à Coolify. Elles sont donc testables directement, et les pages et
 * routes se contentent de les brancher sur leurs dépendances réelles.
 */
import type { Prisma } from '@prisma/client'
import { ACTIVE_DEPLOYMENT_STATUSES, isTerminal } from './deployment-state'
import { planCancellation } from './deployment-cancel'

/** Un déploiement actif depuis plus de 30 minutes est considéré comme bloqué. */
export const STUCK_AFTER_MINUTES = 30

/** Nombre de lignes par page des listes d'administration. */
export const ADMIN_PAGE_SIZE = 20

/**
 * Nombre maximal de projets chargés avant filtrage en mémoire. Le filtre
 * « dernier déploiement en échec » porte sur la dernière ligne d'une relation :
 * il ne peut pas s'exprimer en Prisma. La console d'administration reste donc
 * bornée (au-delà, la liste est signalée comme tronquée).
 */
export const PROJECT_LIST_LIMIT = 500

/** Ligne ajoutée au journal d'un déploiement débloqué par un administrateur. */
export const UNBLOCK_NOTE = 'Déploiement interrompu par un administrateur.'

const MAX_REASON = 300

/* -------------------------------------------------------------------------- */
/* Liste des projets : filtres                                                */
/* -------------------------------------------------------------------------- */

export const PROJECT_FILTERS = ['all', 'failed', 'active', 'stuck', 'never'] as const
export type ProjectListFilter = (typeof PROJECT_FILTERS)[number]

export interface ProjectListQuery {
  filter: ProjectListFilter
  stack: string | null
  query: string
  page: number
}

export function isProjectListFilter(value: string | undefined): value is ProjectListFilter {
  return typeof value === 'string' && (PROJECT_FILTERS as readonly string[]).includes(value)
}

/** Normalise les paramètres d'URL de `/admin/projects` (valeurs invalides ignorées). */
export function parseProjectListQuery(input: {
  etat?: string
  stack?: string
  q?: string
  page?: string
}): ProjectListQuery {
  const filter = isProjectListFilter(input.etat) ? input.etat : 'all'
  const stack = input.stack?.trim() ?? ''
  const query = (input.q ?? '').trim().slice(0, 100)
  const page = Math.max(1, Number.parseInt(input.page ?? '1', 10) || 1)
  return {
    filter,
    stack: stack !== '' && /^[a-z0-9-]{1,40}$/i.test(stack) ? stack : null,
    query,
    page,
  }
}

/**
 * Restriction Prisma de premier niveau. Les filtres qui portent sur le
 * **dernier** déploiement sont complétés par `matchesProjectFilter`.
 */
export function projectListWhere(query: ProjectListQuery): Prisma.ProjectWhereInput {
  const where: Prisma.ProjectWhereInput = {}
  if (query.stack) where.framework = query.stack
  if (query.query) {
    where.OR = [
      { name: { contains: query.query, mode: 'insensitive' } },
      { slug: { contains: query.query, mode: 'insensitive' } },
      { repoUrl: { contains: query.query, mode: 'insensitive' } },
      { domain: { contains: query.query, mode: 'insensitive' } },
    ]
  }
  if (query.filter === 'never') where.deployments = { none: {} }
  if (query.filter === 'active' || query.filter === 'stuck') {
    where.deployments = { some: { status: { in: [...ACTIVE_DEPLOYMENT_STATUSES] } } }
  }
  return where
}

export type LastDeploymentRef = { id: string; status: string; createdAt: Date } | null

export function isActiveDeploymentStatus(status: string): boolean {
  return (ACTIVE_DEPLOYMENT_STATUSES as readonly string[]).includes(status)
}

/** Date avant laquelle un déploiement encore actif est considéré comme bloqué. */
export function stuckBefore(now: Date, timeoutMs = STUCK_AFTER_MINUTES * 60_000): Date {
  return new Date(now.getTime() - timeoutMs)
}

/** Le projet correspond-il au filtre choisi, d'après son dernier déploiement ? */
export function matchesProjectFilter(
  last: LastDeploymentRef,
  filter: ProjectListFilter,
  now: Date,
  timeoutMs = STUCK_AFTER_MINUTES * 60_000,
): boolean {
  switch (filter) {
    case 'all':
      return true
    case 'never':
      return last === null
    case 'failed':
      return last?.status === 'failed'
    case 'active':
      return last !== null && isActiveDeploymentStatus(last.status)
    case 'stuck':
      return (
        last !== null &&
        isActiveDeploymentStatus(last.status) &&
        last.createdAt.getTime() <= stuckBefore(now, timeoutMs).getTime()
      )
    default:
      return true
  }
}

/* -------------------------------------------------------------------------- */
/* Durées                                                                     */
/* -------------------------------------------------------------------------- */

/** « 12 s », « 4 min 05 s », « 2 h 10 ». */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  if (total < 60) return `${total} s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return seconds === 0 ? `${minutes} min` : `${minutes} min ${String(seconds).padStart(2, '0')} s`
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours} h` : `${hours} h ${String(rest).padStart(2, '0')}`
}

export interface DurationView {
  label: string
  detail: string | null
}

/**
 * Durée d'un déploiement. La base ne stocke pas la fin d'un déploiement : une
 * durée n'est donc affichée que pour un déploiement encore actif. Pour un
 * déploiement terminé, les horodatages des journaux Coolify donnent la durée
 * réelle (voir `parseLogTimes`).
 */
export function deploymentDuration(
  input: { status: string; createdAt: Date },
  now = new Date(),
): DurationView {
  const elapsed = Math.max(0, now.getTime() - input.createdAt.getTime())
  if (isTerminal(input.status)) {
    return {
      label: 'Non enregistrée',
      detail: `Fin non horodatée en base : durée à lire dans les journaux (créé il y a ${formatDuration(elapsed)}).`,
    }
  }
  return { label: `En cours · ${formatDuration(elapsed)}`, detail: null }
}

export interface LogTimeRange {
  first: Date
  last: Date
  durationMs: number
}

/**
 * Première et dernière date d'un journal Coolify brut (tableau JSON d'entrées
 * `{ output, timestamp }`). Permet d'afficher la durée réelle d'un déploiement
 * terminé sans modifier le schéma de la base.
 */
export function parseLogTimes(raw: string | null | undefined): LogTimeRange | null {
  if (!raw) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null

  let first = Number.POSITIVE_INFINITY
  let last = Number.NEGATIVE_INFINITY
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue
    const timestamp = (entry as Record<string, unknown>).timestamp
    if (typeof timestamp !== 'string') continue
    const value = Date.parse(timestamp)
    if (!Number.isFinite(value)) continue
    if (value < first) first = value
    if (value > last) last = value
  }
  if (!Number.isFinite(first) || !Number.isFinite(last)) return null
  return { first: new Date(first), last: new Date(last), durationMs: Math.max(0, last - first) }
}

/* -------------------------------------------------------------------------- */
/* Cause probable d'un échec                                                  */
/* -------------------------------------------------------------------------- */

export interface FailureCause {
  label: string
  detail: string
}

interface CauseRule extends FailureCause {
  pattern: RegExp
}

/** Motifs cherchés dans l'extrait de journal, du plus précis au plus générique. */
const CAUSE_RULES: readonly CauseRule[] = [
  { pattern: /interrompu par un administrateur/i, label: 'Déploiement débloqué par un administrateur', detail: 'Le déploiement a été arrêté manuellement depuis la console d’administration.' },
  { pattern: /délai dépassé|the deployment has timed out/i, label: 'Délai maximal dépassé', detail: 'Le déploiement est resté bloqué au-delà du délai autorisé et a été arrêté automatiquement.' },
  { pattern: /annulé à la demande|deployment cancelled|cancelled by user/i, label: 'Déploiement annulé', detail: 'Le déploiement a été annulé avant la fin de la construction.' },
  { pattern: /no space left on device|disk quota exceeded/i, label: 'Disque plein sur le serveur de construction', detail: 'Libérez de l’espace disque (images et volumes inutilisés) avant de relancer.' },
  { pattern: /out of memory|oomkilled|killed process|exit code 137/i, label: 'Mémoire insuffisante', detail: 'La construction ou le démarrage a été tué par manque de mémoire.' },
  { pattern: /module_not_found|cannot find module|module not found|err_module_not_found/i, label: 'Module introuvable', detail: 'Une dépendance ou un chemin d’import est absent : vérifiez les dépendances et le dossier de travail.' },
  { pattern: /npm err!|pnpm.*err_|yarn.*error|composer.*(error|failed)/i, label: 'Installation des dépendances en échec', detail: 'L’installation a échoué : consultez le gestionnaire de paquets et la version du runtime.' },
  { pattern: /port is already allocated|address already in use|bind.*in use/i, label: 'Port déjà utilisé', detail: 'Le port exposé est occupé par un autre conteneur : vérifiez le port du plan.' },
  { pattern: /certificate|x509|tls handshake|ssl_error/i, label: 'Certificat TLS refusé', detail: 'Une connexion TLS a échoué pendant la construction (dépôt, registre ou proxy).' },
  { pattern: /permission denied|eacces|operation not permitted/i, label: 'Permission refusée', detail: 'Un fichier ou une commande n’est pas accessible avec les droits du conteneur.' },
  { pattern: /timed out|timeout|etimedout|deadline exceeded/i, label: 'Délai réseau dépassé', detail: 'Une étape a dépassé son délai : réseau lent, registre indisponible ou build trop long.' },
  { pattern: /build failed|failed to build|exit code [1-9]/i, label: 'Construction de l’image en échec', detail: 'La construction s’est arrêtée sur une erreur : les dernières lignes du journal donnent la commande fautive.' },
]

/**
 * Cause probable d'un échec, déduite de l'extrait de journal (déjà masqué).
 * `null` quand aucune règle ne s'applique : l'interface l'indique explicitement
 * plutôt que d'inventer une cause.
 */
export function probableFailureCause(logs: string | null | undefined): FailureCause | null {
  if (!logs) return null
  for (const rule of CAUSE_RULES) {
    if (rule.pattern.test(logs)) return { label: rule.label, detail: rule.detail }
  }
  return null
}

/* -------------------------------------------------------------------------- */
/* Résumé du BuildPlan                                                        */
/* -------------------------------------------------------------------------- */

export interface PlanSummary {
  framework: string
  runtime: string | null
  root: string
  install: string | null
  build: string | null
  start: string | null
  port: number | null
  publish: string | null
  dockerfile: string | null
  healthcheck: string | null
  services: { name: string; command: string }[]
}

const text = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null)

/**
 * Lecture défensive de `Project.plan` (JSON libre en base). Ne lève jamais :
 * un plan absent ou mal formé reste affichable comme « non disponible ».
 */
export function summarizePlan(value: unknown): PlanSummary | null {
  if (typeof value !== 'object' || value === null) return null
  const plan = value as Record<string, unknown>
  const framework = text(plan.framework)
  if (!framework) return null

  const services: { name: string; command: string }[] = []
  if (typeof plan.services === 'object' && plan.services !== null) {
    for (const [name, spec] of Object.entries(plan.services as Record<string, unknown>)) {
      if (typeof spec !== 'object' || spec === null) continue
      const command = text((spec as Record<string, unknown>).command)
      if (command) services.push({ name, command })
    }
  }

  return {
    framework,
    runtime: text(plan.runtime),
    root: text(plan.root) ?? '',
    install: text(plan.install),
    build: text(plan.build),
    start: text(plan.start),
    port: typeof plan.port === 'number' && Number.isFinite(plan.port) ? plan.port : null,
    publish: text(plan.publish),
    dockerfile: text(plan.dockerfile),
    healthcheck: text(plan.healthcheck),
    services,
  }
}

/* -------------------------------------------------------------------------- */
/* Réconciliation (lecture seule)                                             */
/* -------------------------------------------------------------------------- */

/** Référence d'une application Coolify rattachée à un projet (app principale ou secondaire). */
export interface AdminProjectAppRef {
  /** Libellé lisible (nom de l'application, ou « Application principale » pour le miroir). */
  label: string
  /** Identifiant Coolify, ou null si l'application n'a pas encore été provisionnée. */
  coolifyAppId: string | null
}

export interface AdminProjectRef {
  id: string
  name: string
  slug: string
  /** Miroir de l'application principale (compatibilité mono-app / transition). */
  coolifyAppId: string | null
  organizationName: string
  /** Ensemble des références d'applications du projet. Dérivé de `coolifyAppId` si absent. */
  appRefs?: readonly AdminProjectAppRef[]
}

export interface AdminApplicationRef {
  id: string
  name: string
}

/** Référence d'application manquante côté hébergement, rattachée à son projet. */
export interface MissingApplicationRef extends AdminProjectRef {
  /** Application du projet concernée (utile en multi-app). */
  missingAppLabel: string
  /** Identifiant Coolify attendu mais absent côté hébergement. */
  missingCoolifyAppId: string
}

export interface ReconciliationResult {
  /** Applications présentes côté Coolify mais liées à aucun projet en base. */
  orphans: AdminApplicationRef[]
  /** Références d'applications de projets absentes côté hébergement (une entrée par app manquante). */
  missing: MissingApplicationRef[]
}

/** Références d'applications effectives d'un projet (ProjectApp + miroir pour compatibilité). */
export function projectAppRefs(project: AdminProjectRef): readonly AdminProjectAppRef[] {
  if (project.appRefs && project.appRefs.length > 0) return project.appRefs
  return [{ label: 'Application principale', coolifyAppId: project.coolifyAppId }]
}

/**
 * Compare les applications Coolify et les projets en base. **Aucune suppression** :
 * le résultat est seulement affiché pour une intervention manuelle.
 *
 * Un projet est « manquant » si **l'une** de ses références d'application (non
 * nulles) n'existe pas côté hébergement : chaque référence absente est rapportée.
 * Une application Coolify est « orpheline » si elle ne correspond à **aucune**
 * référence d'aucun projet.
 */
export function reconcileApplications(input: {
  projects: readonly AdminProjectRef[]
  applications: readonly AdminApplicationRef[]
}): ReconciliationResult {
  const applicationIds = new Set(input.applications.map((app) => app.id))
  const knownIds = new Set<string>()

  for (const project of input.projects) {
    for (const ref of projectAppRefs(project)) {
      if (typeof ref.coolifyAppId === 'string' && ref.coolifyAppId !== '') knownIds.add(ref.coolifyAppId)
    }
  }

  const orphans = input.applications
    .filter((app) => !knownIds.has(app.id))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'))

  const missing: MissingApplicationRef[] = []
  for (const project of input.projects) {
    for (const ref of projectAppRefs(project)) {
      if (typeof ref.coolifyAppId !== 'string' || ref.coolifyAppId === '') continue
      if (applicationIds.has(ref.coolifyAppId)) continue
      missing.push({
        ...project,
        missingAppLabel: ref.label,
        missingCoolifyAppId: ref.coolifyAppId,
      })
    }
  }
  missing.sort((a, b) => {
    const byProject = a.name.localeCompare(b.name, 'fr')
    if (byProject !== 0) return byProject
    return a.missingAppLabel.localeCompare(b.missingAppLabel, 'fr')
  })

  return { orphans, missing }
}

/* -------------------------------------------------------------------------- */
/* Déblocage d'un déploiement actif                                           */
/* -------------------------------------------------------------------------- */

export type UnblockPlan =
  | { kind: 'unblock'; removeQueuedJob: boolean; coolifyBuildId: string | null }
  | { kind: 'refuse'; code: 'terminal' | 'unknown'; message: string }

/** Décide ce qu'il faut faire pour débloquer un déploiement, sans effet de bord. */
export function planUnblock(target: { status: string; coolifyBuildId: string | null }): UnblockPlan {
  const plan = planCancellation(target)
  if (plan.kind === 'refuse') {
    return {
      kind: 'refuse',
      code: plan.code,
      message:
        plan.code === 'terminal'
          ? 'Ce déploiement est déjà terminé : il n’est pas bloqué.'
          : plan.message,
    }
  }
  return { kind: 'unblock', removeQueuedJob: plan.removeQueuedJob, coolifyBuildId: plan.coolifyBuildId }
}

export interface UnblockDeps {
  /** Retire le job BullMQ s'il attend encore. */
  removeQueuedJob: (deploymentId: string) => Promise<'removed' | 'active' | 'missing' | 'error'>
  /** Demande l'annulation du build distant (Coolify). */
  cancelCoolify: (coolifyBuildId: string) => Promise<{ ok: true; alreadyFinished?: boolean } | { error: string }>
  /** Passe l'état local à `failed`, **uniquement** s'il est encore actif. */
  markFailed: (deploymentId: string, note: string) => Promise<boolean>
}

export type UnblockOutcome =
  | { ok: true; warning?: string }
  | { ok: false; code: 'terminal' | 'unknown' | 'race'; message: string; warning?: string }

/**
 * Débloque un déploiement actif : le job en attente est retiré, le build distant
 * est annulé au mieux, puis l'état passe en `failed` avec le motif
 * « interrompu par un administrateur ». Une écriture conditionnelle évite
 * d'écraser un déploiement qui vient de se terminer.
 */
export async function unblockDeployment(
  target: { id: string; status: string; coolifyBuildId: string | null },
  deps: UnblockDeps,
): Promise<UnblockOutcome> {
  const plan = planUnblock(target)
  if (plan.kind === 'refuse') return { ok: false, code: plan.code, message: plan.message }

  const warnings: string[] = []

  if (plan.removeQueuedJob) {
    const removed = await deps.removeQueuedJob(target.id)
    if (removed === 'error') {
      warnings.push('La file de déploiement est injoignable : le job sera ignoré à son démarrage.')
    }
    if (removed === 'active' && !plan.coolifyBuildId) {
      warnings.push('Le worker a déjà pris ce déploiement ; l’hébergement ne peut pas confirmer l’arrêt.')
    }
  }

  if (plan.coolifyBuildId) {
    const remote = await deps.cancelCoolify(plan.coolifyBuildId)
    if ('error' in remote) {
      warnings.push(`L’hébergement n’a pas confirmé l’arrêt : ${remote.error}`)
    }
  }

  const failed = await deps.markFailed(target.id, UNBLOCK_NOTE)
  if (!failed) {
    return {
      ok: false,
      code: 'race',
      message: 'Ce déploiement s’est terminé avant le déblocage.',
      ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}),
    }
  }

  return { ok: true, ...(warnings.length > 0 ? { warning: warnings.join(' ') } : {}) }
}

/* -------------------------------------------------------------------------- */
/* Validation des motifs                                                      */
/* -------------------------------------------------------------------------- */

/** Motif obligatoire pour une action destructrice (suppression, arrêt, annulation). */
export const REASON_MIN = 5
export const REASON_MAX = MAX_REASON
