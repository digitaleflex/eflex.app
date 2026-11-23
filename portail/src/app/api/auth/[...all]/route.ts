import { toNextJsHandler } from 'better-auth/next-js'
import { auth } from '@/lib/auth'
import { withTrustedClientIp } from '@/lib/rate-limit'

const handler = toNextJsHandler(auth)

// Better Auth fait confiance à la première entrée de X-Forwarded-For (falsifiable par le client) pour ses
// limites de débit : on lui présente l'adresse ajoutée par le proxy de confiance (audit S6, issue #172).
export const GET = (request: Request) => handler.GET(withTrustedClientIp(request))
export const POST = (request: Request) => handler.POST(withTrustedClientIp(request))
