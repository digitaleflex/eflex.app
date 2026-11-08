/**
 * Vérification des webhooks Resend (signature Svix, HMAC-SHA256).
 * En-têtes : `svix-id`, `svix-timestamp`, `svix-signature` (`v1,<base64>` …).
 * Le secret `RESEND_WEBHOOK_SECRET` (préfixe `whsec_`) reste côté serveur.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const TOLERANCE_SECONDS = 300

export interface SvixHeaders {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export function verifyResendWebhook(body: string, headers: SvixHeaders, secret: string): boolean {
  if (!secret || !headers.id || !headers.timestamp || !headers.signature) return false

  const timestamp = Number(headers.timestamp)
  if (!Number.isFinite(timestamp)) return false
  if (Math.abs(Date.now() / 1000 - timestamp) > TOLERANCE_SECONDS) return false

  const rawSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  const key = Buffer.from(rawSecret, 'base64')
  if (key.length === 0) return false

  const expected = createHmac('sha256', key)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest()

  for (const candidate of headers.signature.split(' ')) {
    const [version, encoded] = candidate.split(',')
    if (version !== 'v1' || !encoded) continue
    const provided = Buffer.from(encoded, 'base64')
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) return true
  }
  return false
}
