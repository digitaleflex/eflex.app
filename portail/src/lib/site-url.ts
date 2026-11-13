/** URL publique du site (sans domaine codé en dur côté source applicative quand l'env est fournie). */
export function getSiteUrl(): URL {
  const raw =
    process.env.BETTER_AUTH_URL ||
    process.env.PORTAL_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://eflex.app'
  try {
    return new URL(raw)
  } catch {
    return new URL('https://eflex.app')
  }
}
