/**
 * Backfill D2 (lot B) : règles de décision et exécution.
 *
 * Ce module ne contient aucune dépendance d'exécution à Prisma (seulement des
 * types) : les décisions sont pures et testables, l'écriture est faite par
 * `runBackfill` avec le client injecté. Le script CLI
 * `portail/scripts/backfill-project-apps.ts` n'est qu'un habillage.
 *
 * Principe : chaque projet reçoit **au plus une** application lors du backfill,
 * miroir exact de ses colonnes mono-application actuelles. Un projet qui a déjà
 * une `ProjectApp` n'est jamais modifié (idempotence). Les `Deployment`
 * historiques sont rattachés à cette application (`appId`), sans `groupId` :
 * leur statut, leurs logs et la machine à états ne changent pas.
 */

import type { Prisma, PrismaClient } from '@prisma/client'

/** Nom de repli quand le plan ne fournit aucun dossier exploitable. */
export const DEFAULT_APP_NAME = 'app'

/** Longueur maximale d'un nom d'application (`ProjectApp.name`). */
export const MAX_APP_NAME_LENGTH = 24

export interface BackfillProject {
  id: string
  name: string
  slug: string
  plan: unknown
  framework: string
  runtime: string | null
  port: number
  domain: string | null
  coolifyAppId: string | null
  tlsValid: boolean | null
  tlsExpiresAt: Date | null
  tlsCheckedAt: Date | null
}

export interface BackfillAppData {
  projectId: string
  name: string
  root: string
  position: number
  plan: unknown
  framework: string
  runtime: string | null
  port: number
  domain: string | null
  coolifyAppId: string | null
  tlsValid: boolean | null
  tlsExpiresAt: Date | null
  tlsCheckedAt: Date | null
}

export type BackfillDecision =
  | {
      action: 'skip'
      reason: 'app_already_exists' | 'plan_missing'
      warnings: string[]
    }
  | {
      action: 'create'
      data: BackfillAppData
      warnings: string[]
    }

/**
 * Nom court, stable et normalisé d'une application à partir de son dossier.
 *
 * `""` (racine du dépôt) et une valeur absente donnent `app`. Un chemin
 * `apps/web` donne `web` : le nom ne dépend ni du nom du projet, ni de l'ordre
 * d'exécution, donc deux backfills successifs produisent le même nom.
 */
export function stableAppName(root: string | null | undefined): string {
  const segment = (root ?? '')
    .split(/[\\/]+/)
    .filter(Boolean)
    .pop()
  const name = (segment ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, MAX_APP_NAME_LENGTH)
    .replace(/-$/g, '')
  return name || DEFAULT_APP_NAME
}

/**
 * Dossier racine lu dans un plan v1, ou `null` quand le plan n'est pas un objet
 * exploitable (`plan` absent, tableau, chaîne…). Un plan sans champ `root`
 * désigne la racine du dépôt (`""`).
 */
export function readPlanRoot(plan: unknown): string | null {
  if (typeof plan !== 'object' || plan === null || Array.isArray(plan)) return null
  const candidate = plan as { root?: unknown; framework?: unknown; port?: unknown }
  // Même exigence minimale que le worker (`isBuildPlan`) : sans framework ni
  // port, le plan n'est pas un BuildPlan v1 et l'application serait indéployable.
  if (typeof candidate.framework !== 'string' || typeof candidate.port !== 'number') return null
  const root = candidate.root
  if (root === undefined || root === null) return ''
  if (typeof root !== 'string') return null
  return root.trim().replace(/^\/+|\/+$/g, '')
}

/**
 * Décide de l'application à créer pour un projet, sans écrire.
 *
 * - un projet ayant déjà une application est ignoré (aucun doublon, aucune
 *   réécriture : les données du projet sont laissées telles quelles) ;
 * - un projet sans plan v1 exploitable est ignoré (le worker refuse déjà de le
 *   déployer, créer une application sans plan ne servirait à rien) ;
 * - un domaine déjà pris par une autre application est laissé `null` avec un
 *   avertissement : on ne casse ni l'unicité `ProjectApp.domain`, ni le routage
 *   de l'application qui le possède déjà.
 */
export function decideProjectApp(input: {
  project: BackfillProject
  hasApp: boolean
  takenDomains: ReadonlySet<string>
}): BackfillDecision {
  const { project } = input

  if (input.hasApp) {
    return { action: 'skip', reason: 'app_already_exists', warnings: [] }
  }

  const root = readPlanRoot(project.plan)
  if (root === null) {
    return { action: 'skip', reason: 'plan_missing', warnings: [] }
  }

  const warnings: string[] = []
  let domain = project.domain?.trim() || null
  if (domain && input.takenDomains.has(domain)) {
    warnings.push(
      `Domaine « ${domain} » déjà utilisé par une autre application : laissé non exposé.`,
    )
    domain = null
  }

  return {
    action: 'create',
    warnings,
    data: {
      projectId: project.id,
      name: stableAppName(root),
      root,
      position: 0,
      plan: project.plan,
      framework: project.framework,
      runtime: project.runtime,
      port: project.port,
      domain,
      coolifyAppId: project.coolifyAppId,
      tlsValid: project.tlsValid,
      tlsExpiresAt: project.tlsExpiresAt,
      tlsCheckedAt: project.tlsCheckedAt,
    },
  }
}

export interface BackfillOptions {
  /** `false` par défaut : aucune écriture. */
  apply: boolean
  /** Taille des pages de projets lues. */
  batchSize: number
  /**
   * Restreint le backfill à ces projets (tests d'intégration). Absent = tous.
   * Jamais exposé par le CLI : l'exploitation backfille l'ensemble de la base.
   */
  projectIds?: string[]
}

export interface BackfillTotals {
  projects: number
  created: number
  skippedExisting: number
  skippedNoPlan: number
  domainConflicts: number
  deploymentsAttached: number
  errors: number
}

export interface RunBackfillOptions extends BackfillOptions {
  prisma: PrismaClient
  /** Journalisation ; silencieux dans les tests. */
  log?: (line: string) => void
}

/**
 * Exécute le backfill, idempotent et reprenable. Une erreur sur un projet est
 * comptée et n'interrompt pas le lot (les autres projets restent traités).
 */
export async function runBackfill(options: RunBackfillOptions): Promise<BackfillTotals> {
  const { prisma } = options
  const log = options.log ?? ((line: string) => console.log(line))
  const totals: BackfillTotals = {
    projects: 0,
    created: 0,
    skippedExisting: 0,
    skippedNoPlan: 0,
    domainConflicts: 0,
    deploymentsAttached: 0,
    errors: 0,
  }

  const takenDomains = new Set(
    (
      await prisma.projectApp.findMany({
        where: { domain: { not: null } },
        select: { domain: true },
      })
    )
      .map((row) => row.domain)
      .filter((domain): domain is string => Boolean(domain)),
  )

  let cursor: string | undefined
  for (;;) {
    const where = options.projectIds ? { id: { in: options.projectIds } } : {}
    const projects = await prisma.project.findMany({
      where,
      orderBy: { id: 'asc' },
      take: options.batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        name: true,
        slug: true,
        plan: true,
        framework: true,
        runtime: true,
        port: true,
        domain: true,
        coolifyAppId: true,
        tlsValid: true,
        tlsExpiresAt: true,
        tlsCheckedAt: true,
        _count: { select: { apps: true } },
      },
    })
    if (projects.length === 0) break

    for (const project of projects) {
      totals.projects += 1
      const decision = decideProjectApp({
        project,
        hasApp: project._count.apps > 0,
        takenDomains,
      })

      if (decision.action === 'skip') {
        if (decision.reason === 'app_already_exists') totals.skippedExisting += 1
        else totals.skippedNoPlan += 1
        continue
      }
      if (decision.warnings.length > 0) {
        totals.domainConflicts += 1
        for (const warning of decision.warnings) log(`[avertissement] ${project.slug} : ${warning}`)
      }

      // Simule la réservation du domaine même en lecture seule, pour que deux
      // projets partageant le même domaine ne produisent pas deux créations.
      if (!options.apply) {
        if (decision.data.domain) takenDomains.add(decision.data.domain)
        const deployments = await prisma.deployment.count({
          where: { projectId: project.id, appId: null },
        })
        totals.created += 1
        totals.deploymentsAttached += deployments
        log(
          `[dry-run] ${project.slug} → app « ${decision.data.name} » (root « ${decision.data.root || '/'} », ` +
            `${deployments} déploiement(s) à rattacher)`,
        )
        continue
      }

      try {
        const attached = await prisma.$transaction(async (tx) => {
          const app = await tx.projectApp.create({
            data: {
              projectId: decision.data.projectId,
              name: decision.data.name,
              root: decision.data.root,
              position: decision.data.position,
              plan: decision.data.plan as Prisma.InputJsonValue,
              framework: decision.data.framework,
              runtime: decision.data.runtime,
              port: decision.data.port,
              domain: decision.data.domain,
              coolifyAppId: decision.data.coolifyAppId,
              tlsValid: decision.data.tlsValid,
              tlsExpiresAt: decision.data.tlsExpiresAt,
              tlsCheckedAt: decision.data.tlsCheckedAt,
            },
          })
          const result = await tx.deployment.updateMany({
            where: { projectId: project.id, appId: null },
            data: { appId: app.id },
          })
          return result.count
        })
        totals.created += 1
        totals.deploymentsAttached += attached
        if (decision.data.domain) takenDomains.add(decision.data.domain)
        log(`[créé] ${project.slug} → app « ${decision.data.name} » (${attached} déploiement(s) rattaché(s))`)
      } catch (error) {
        totals.errors += 1
        const message = error instanceof Error ? error.message : String(error)
        log(`[échec] ${project.slug} : ${message}`)
      }
    }

    cursor = projects[projects.length - 1]!.id
  }

  return totals
}

/** Options du CLI, avec `--dry-run` par défaut. */
export function parseBackfillArgs(argv: string[]): BackfillOptions {
  let apply = false
  let batchSize = 200

  for (const arg of argv) {
    if (arg === '--apply') {
      apply = true
    } else if (arg === '--dry-run') {
      apply = false
    } else if (arg.startsWith('--batch=')) {
      const parsed = Number.parseInt(arg.slice('--batch='.length), 10)
      if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`Valeur invalide pour --batch : « ${arg} ». Attendu un entier ≥ 1.`)
      }
      batchSize = parsed
    } else if (arg === '--help' || arg === '-h') {
      throw new HelpRequestedError()
    } else {
      throw new Error(`Option inconnue : « ${arg} ». Options : --apply, --dry-run, --batch=N.`)
    }
  }

  return { apply, batchSize }
}

export class HelpRequestedError extends Error {
  constructor() {
    super('help')
    this.name = 'HelpRequestedError'
  }
}
