/**
 * Suivi d'erreurs applicatives optionnel, compatible Sentry (Bugsink/GlitchTip).
 *
 * Inerte si `SENTRY_DSN` (ou `ERROR_TRACKING_DSN`) est absent. Ne jamais envoyer
 * de secrets, variables d'environnement, jetons ni corps de requête d'authentification.
 */

type CaptureContext = {
  route?: string
  organizationId?: string | null
  tags?: Record<string, string | undefined>
  extra?: Record<string, unknown>
}

const SENSITIVE_KEY = /pass(word)?|secret|token|cookie|authorization|api[-_]?key|credential|session|dsn|private|bearer/i
const AUTH_ROUTE = /\/api\/auth\b/

export function errorTrackingEnabled(dsn = process.env.SENTRY_DSN ?? process.env.ERROR_TRACKING_DSN): boolean {
  return Boolean(dsn && dsn.trim())
}

function scrubSensitiveString(value: string): string {
  const trimmed = value.length > 500 ? `${value.slice(0, 500)}…` : value
  return trimmed
    .replace(/(bearer\s+)[a-z0-9._\-]+/gi, '$1[masqué]')
    .replace(/((?:password|passwd|secret|token|api[-_]?key|authorization|cookie|credential|private[-_]?key)\s*[=:]\s*)([^\s,;]+)/gi, '$1[masqué]')
}

export function scrubErrorData(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return input
  if (typeof input === 'string') return scrubSensitiveString(input)
  if (typeof input === 'number' || typeof input === 'boolean') return input
  if (depth > 4) return '[profondeur max]'
  if (input instanceof Error) {
    return {
      name: input.name,
      message: scrubSensitiveString(input.message),
      stack: scrubStack(input.stack),
    }
  }
  if (Array.isArray(input)) return input.slice(0, 20).map((value) => scrubErrorData(value, depth + 1))
  if (typeof input === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[masqué]' : scrubErrorData(value, depth + 1)
    }
    return out
  }
  return scrubSensitiveString(String(input))
}

function scrubStack(stack: string | undefined): string | undefined {
  if (!stack) return undefined
  return stack
    .split('\n')
    .slice(0, 30)
    .map((line) => line.replace(/(token|secret|password|key)=([^\s&]+)/gi, '$1=[masqué]'))
    .join('\n')
}

function parseSentryDsn(dsn: string): { envelopeUrl: string; key: string } | null {
  try {
    const url = new URL(dsn)
    const key = url.username
    const projectId = url.pathname.replace(/^\//, '')
    if (!key || !projectId) return null
    url.username = ''
    url.password = ''
    url.pathname = `/api/${projectId}/envelope/`
    return { envelopeUrl: url.toString(), key }
  } catch {
    return null
  }
}

function cleanTags(tags: Record<string, string | undefined> | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags ?? {})) {
    if (typeof value === 'string' && value && !SENSITIVE_KEY.test(key)) out[key] = value.slice(0, 200)
  }
  return out
}

export async function captureServerError(error: unknown, context: CaptureContext = {}): Promise<void> {
  const dsn = process.env.SENTRY_DSN ?? process.env.ERROR_TRACKING_DSN
  if (!dsn) return
  const parsed = parseSentryDsn(dsn)
  if (!parsed) return

  const route = context.route
  const extra = AUTH_ROUTE.test(route ?? '') ? undefined : (scrubErrorData(context.extra) as Record<string, unknown> | undefined)
  const err = error instanceof Error ? error : new Error(String(error))
  const event = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    platform: 'javascript',
    level: 'error',
    timestamp: Date.now() / 1000,
    environment: process.env.NODE_ENV ?? 'development',
    server_name: process.env.HOSTNAME ?? 'eflex-portail',
    release: process.env.APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA,
    tags: cleanTags({
      route,
      organizationId: context.organizationId ?? undefined,
      service: 'portail',
      ...context.tags,
    }),
    exception: {
      values: [
        {
          type: err.name || 'Error',
          value: String(scrubErrorData(err.message) ?? 'Erreur inconnue').slice(0, 1000),
          stacktrace: err.stack
            ? {
                frames: err.stack
                  .split('\n')
                  .slice(1, 30)
                  .map((line) => ({ filename: line.trim().slice(0, 300) }))
                  .reverse(),
              }
            : undefined,
        },
      ],
    },
    extra,
  }

  const envelope = `${JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn })}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}`
  try {
    await fetch(parsed.envelopeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${parsed.key}, sentry_client=eflex-error-tracking/1.0`,
      },
      body: envelope,
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // Jamais bloquant : le suivi d'erreurs ne doit pas impacter l'application.
  }
}
