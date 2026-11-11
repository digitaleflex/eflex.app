import { deploymentSlug } from '@/lib/project-apps'

export interface AppLike {
  id: string
  name?: string
  root?: string
  position: number
  plan?: unknown
  framework?: string | null
  runtime?: string | null
  port?: number | null
  domain?: string | null
  coolifyAppId?: string | null
  tlsValid?: boolean | null
  tlsExpiresAt?: Date | string | null
  tlsCheckedAt?: Date | string | null
  [key: string]: unknown
}

export interface ProjectMirrorLike {
  slug?: string
  framework?: string | null
  runtime?: string | null
  domain?: string | null
  coolifyAppId?: string | null
  plan?: unknown
  port?: number | null
  tlsValid?: boolean | null
  tlsExpiresAt?: Date | string | null
  tlsCheckedAt?: Date | string | null
  apps?: readonly AppLike[]
}

/** Application principale : position la plus basse (0), puis nom/id stables. */
export function getPrimaryApp<T extends Pick<AppLike, 'position' | 'name' | 'id'>>(apps: readonly T[] | null | undefined): T | null {
  if (!apps || apps.length === 0) return null
  return [...apps].sort((a, b) => a.position - b.position || (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id))[0] ?? null
}

/** App effective : app demandée/principale, avec repli miroir projet pendant la transition Lot G. */
export function resolveEffectiveApp<T extends AppLike>(
  project: { apps?: readonly T[] } & ProjectMirrorLike,
  appId?: string | null,
): T | null {
  const apps = (project.apps ?? []) as readonly T[]
  if (appId) return (apps.find((a) => a.id === appId) ?? null) as T | null
  return getPrimaryApp(apps) as T | null
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : value
}

export function primaryView(project: ProjectMirrorLike & { apps?: readonly AppLike[] }) {
  const app = getPrimaryApp(project.apps)
  const domain = app?.domain ?? project.domain ?? null
  const framework = app?.framework ?? project.framework ?? null
  const runtime = app?.runtime ?? project.runtime ?? null
  const port = app && typeof app.port === 'number' ? app.port : project.port ?? null
  const coolifyAppId = app?.coolifyAppId ?? project.coolifyAppId ?? null
  const plan = app?.plan ?? project.plan ?? null
  const tlsValid = (app?.tlsValid as boolean | null | undefined) ?? project.tlsValid ?? null
  const tlsExpiresAt = iso((app?.tlsExpiresAt as Date | string | null | undefined) ?? project.tlsExpiresAt)
  const tlsCheckedAt = iso((app?.tlsCheckedAt as Date | string | null | undefined) ?? project.tlsCheckedAt)
  const apps = project.apps ?? []
  const deployed = apps.length > 0 ? apps.some((a) => Boolean(a.coolifyAppId)) : Boolean(project.coolifyAppId)
  return { app, domain, framework, runtime, port, coolifyAppId, plan, tlsValid, tlsExpiresAt, tlsCheckedAt, deployed }
}

export function deployKeyFor(projectSlug: string, app: Pick<AppLike, 'name' | 'position'> | null): string {
  if (!app) return projectSlug
  return app.position === 0 ? projectSlug : deploymentSlug(projectSlug, app.name ?? 'app')
}

/** Tous les IDs Coolify provisionnés (apps + repli miroir projet). */
export function collectCoolifyAppIds(project: { coolifyAppId?: string | null; apps?: readonly Pick<AppLike, 'coolifyAppId'>[] | null }): string[] {
  const ids = new Set<string>()
  if (project.coolifyAppId) ids.add(project.coolifyAppId)
  for (const app of project.apps ?? []) {
    if (app.coolifyAppId) ids.add(app.coolifyAppId)
  }
  return [...ids]
}

export function isAppDeployed(project: { coolifyAppId?: string | null; apps?: readonly Pick<AppLike, 'coolifyAppId'>[] | null }): boolean {
  return collectCoolifyAppIds(project).length > 0
}
