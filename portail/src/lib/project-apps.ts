/**
 * Helpers purs du multi-applications (lot C de D2) : noms d'application stables,
 * domaines sur un seul label et identifiant de déploiement.
 *
 * Règles (voir `docs/architecture/monorepo-multi-app.md`, § 5) :
 * - nom court `[a-z0-9-]`, ≤ 24 caractères, unique dans le projet ;
 * - domaine secondaire sur **un seul label** `<slug>-<app>.<racine>` : le
 *   certificat wildcard et le DNS wildcard ne couvrent pas deux niveaux ;
 * - l'application principale garde `<slug>.<racine>` (`Project.domain`).
 */

/** Longueur maximale d'un label DNS (RFC 1035). */
export const MAX_DNS_LABEL = 63

/** Dossier d'application normalisé (sans slash initial ni final). */
export function normalizeAppRoot(root: string | null | undefined): string {
  return (root ?? '').trim().replace(/^\/+|\/+$/g, '')
}

function slugPart(value: string, max: number): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, max)
    .replace(/-$/, '')
}

/**
 * Nom d'application déduit d'un dossier : dernier segment (`apps/web` → `web`),
 * nom de repli pour la racine (nom du dépôt côté portail), `app` en dernier
 * recours. Le résultat est stable : il ne dépend ni du nom du projet ni de
 * l'ordre d'exécution.
 */
export function appNameFromRoot(root: string | null | undefined, fallback = 'app'): string {
  const normalized = normalizeAppRoot(root)
  const segment = normalized.split('/').filter(Boolean).pop()
  return slugPart(segment ?? '', 24) || slugPart(fallback, 24) || 'app'
}

/** Rend un nom unique dans le projet (`web`, `web-2`, `web-3`…). */
export function uniqueAppName(name: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(name)) return name
  const base = slugPart(name, 20) || 'app'
  for (let index = 2; index <= 99; index += 1) {
    const candidate = `${base}-${index}`.slice(0, 24).replace(/-$/, '')
    if (!used.has(candidate)) return candidate
  }
  // 99 applications du même nom dans un projet : impossible en pratique
  // (limite `MAX_PROJECT_APPS`), le suffixe aléatoire évite une erreur 500.
  return `${base}-${Math.random().toString(16).slice(2, 6)}`.slice(0, 24)
}

/** Label DNS d'une application secondaire, tronqué proprement. */
export function appDomainLabel(slug: string, name: string): string {
  return slugPart(`${slug}-${name}`, MAX_DNS_LABEL)
}

/** Racine DNS normalisée (sans schéma ni chemin). */
function rootDomainOf(rootDomain: string | null | undefined): string {
  return (rootDomain ?? '')
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/.*$/, '')
}

/**
 * Domaine proposé pour une application secondaire :
 * `<slug>-<app>.<racine>`, ou `null` si aucune racine n'est configurée.
 */
export function appDomain(
  slug: string,
  name: string,
  rootDomain: string | null | undefined,
): string | null {
  const root = rootDomainOf(rootDomain)
  const label = appDomainLabel(slug, name)
  return root && label ? `${label}.${root}` : null
}

/**
 * Domaine libre : le domaine d'une application est unique globalement
 * (`ProjectApp.domain @unique`). En cas de collision avec le slug d'un autre
 * projet, on suffixe le label (`-2`, `-3`…) en restant sous 63 caractères.
 */
export async function uniqueAppDomain(
  slug: string,
  name: string,
  rootDomain: string | null | undefined,
  exists: (domain: string) => Promise<boolean>,
): Promise<string | null> {
  const base = appDomain(slug, name, rootDomain)
  if (!base) return null
  if (!(await exists(base))) return base

  const root = rootDomainOf(rootDomain)
  const label = appDomainLabel(slug, name)
  for (let index = 2; index <= 50; index += 1) {
    const suffix = `-${index}`
    const candidateLabel = `${label.slice(0, MAX_DNS_LABEL - suffix.length).replace(/-$/, '')}${suffix}`
    const candidate = `${candidateLabel}.${root}`
    if (!(await exists(candidate))) return candidate
  }
  return null
}

/**
 * Identifiant de déploiement (nom Coolify, préfixe des labels Traefik, image) :
 * le slug du projet pour l'application implicite ou principale, `<slug>-<app>`
 * pour une application nommée.
 */
export function deploymentSlug(projectSlug: string, appName: string | null | undefined): string {
  const name = appName ? slugPart(appName, 32) : ''
  return name ? `${projectSlug}-${name}` : projectSlug
}


/** Application principale : position la plus basse (0), puis nom/id stables. */
export function getPrimaryApp<T extends { id: string; name?: string; position: number }>(
  apps: readonly T[] | null | undefined,
): T | null {
  if (!apps || apps.length === 0) return null
  return [...apps].sort(
    (a, b) => a.position - b.position || (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id),
  )[0] ?? null
}
