/**
 * Destination après connexion, lue dans `?next=`. Seuls les chemins internes sont acceptés
 * (pas de `//hôte` ni de `\`), pour éviter une redirection ouverte vers un site tiers.
 */
export function safeNext(value: string | null | undefined, fallback = '/dashboard'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback
  return value
}

/** Variante côté navigateur, à appeler au moment de la soumission. */
export function nextFromLocation(fallback = '/dashboard'): string {
  if (typeof window === 'undefined') return fallback
  return safeNext(new URLSearchParams(window.location.search).get('next'), fallback)
}

/** Conserve la destination quand on passe de la connexion à l'inscription et inversement. */
export function withNext(path: string): string {
  if (typeof window === 'undefined') return path
  const next = new URLSearchParams(window.location.search).get('next')
  return next ? `${path}?next=${encodeURIComponent(safeNext(next))}` : path
}
