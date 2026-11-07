import { headers } from 'next/headers'
import { auth } from '@/lib/auth'

/** Session de la requête courante (Server Components et route handlers), ou null. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() })
}
