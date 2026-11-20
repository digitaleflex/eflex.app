const NAME_RE = /^[a-z0-9]+(?:[._-][a-z0-9]+)*(?:\/[a-z0-9]+(?:[._-][a-z0-9]+)*)*$/
const TAG_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/
const DIGEST_RE = /^sha256:[a-f0-9]{64}$/
const HOST_RE = /^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?::[0-9]{2,5})?$/

/**
 * Valide une référence d'image Docker saisie par un utilisateur.
 * Accepte `nom[:tag][@digest]`, avec registre/hôte optionnel.
 * Refuse les espaces, caractères shell, et formes manifestement ambiguës.
 */
export function isValidDockerImageRef(value: string): boolean {
  const ref = value.trim()
  if (ref.length === 0 || ref.length > 255) return false
  if (/[\s"'`$\\<>|;&]/.test(ref)) return false

  let remainder = ref
  let digest = ''
  const digestIndex = remainder.indexOf('@')
  if (digestIndex !== -1) {
    digest = remainder.slice(digestIndex + 1)
    remainder = remainder.slice(0, digestIndex)
    if (!DIGEST_RE.test(digest)) return false
  }

  let tag = ''
  const lastSlash = remainder.lastIndexOf('/')
  const lastColon = remainder.lastIndexOf(':')
  if (lastColon > lastSlash) {
    tag = remainder.slice(lastColon + 1)
    remainder = remainder.slice(0, lastColon)
    if (!TAG_RE.test(tag)) return false
  }

  if (remainder.length === 0) return false

  const firstSlash = remainder.indexOf('/')
  if (firstSlash !== -1) {
    const first = remainder.slice(0, firstSlash)
    if (first === 'localhost' || first.includes('.') || first.includes(':')) {
      if (!HOST_RE.test(first)) return false
      const path = remainder.slice(firstSlash + 1)
      return path.length > 0 && NAME_RE.test(path)
    }
  }
  return NAME_RE.test(remainder)
}

export const DOCKER_IMAGE_REF_HINT =
  "Nom d'image, tag et/ou digest valides (ex. nginx:1.27, ghcr.io/org/app:1.2.3, image@sha256:…)."

export const DOCKER_IMAGE_REF_ERROR =
  "Référence d'image Docker invalide. Utilisez un nom d'image, un tag et/ou un digest valides (ex. nginx:1.27, ghcr.io/org/app:latest, image@sha256:…)."

export const PRIVATE_REGISTRY_LIMITATION =
  "Les registres privés nécessitent que les identifiants d'accès soient configurés sur le serveur d'hébergement (registre Docker du serveur) par un administrateur. EFLEX ne transmet pas d'identifiants de registre par application."

export const UNSUPPORTED_SOURCES_NOTE =
  "Sources actuellement prises en charge : dépôts GitHub et images Docker. Les autres sources (GitLab, Bitbucket, archives, etc.) ne sont pas encore disponibles."

export function dockerImageFromRepoUrl(repoUrl: string | null | undefined): string | null {
  if (typeof repoUrl !== 'string') return null
  return repoUrl.startsWith('docker-image://') ? repoUrl.slice('docker-image://'.length) : null
}
