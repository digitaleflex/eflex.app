/**
 * Vrai pour un chemin interne au site (`/dashboard`, `/invitations/abc?x=1`), faux pour tout ce qui
 * pourrait mener ailleurs. Les navigateurs suppriment tabulations et sauts de ligne dans une URL :
 * `/\t/hôte` devient `//hôte` (protocole-relatif). On refuse donc tout caractère de contrôle et on
 * vérifie, avec l'analyseur d'URL lui-même, que le résultat reste sur la même origine.
 */
export function isInternalPath(value: string | null | undefined): value is string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return false
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(value)) return false
  try {
    const base = 'http://eflex.invalid'
    return new URL(value, base).origin === base
  } catch {
    return false
  }
}

/** Destination après connexion, lue dans `?next=` : un chemin interne, sinon le repli. */
export function safeNext(value: string | null | undefined, fallback = '/dashboard'): string {
  return isInternalPath(value) ? value : fallback
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
