import { connect } from 'node:tls'

export interface TlsCheck {
  ok: boolean
  /** Date d'expiration du certificat (ISO), si le certificat est lisible. */
  expiresAt: string | null
  /** Cause de l'échec (DNS, chaîne invalide, nom d'hôte, timeout…). */
  reason: string | null
}

const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i

function once(host: string, timeoutMs: number): Promise<TlsCheck> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (result: TlsCheck) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }

    const socket = connect(
      {
        host,
        port: 443,
        servername: host,
        rejectUnauthorized: true,
        timeout: timeoutMs,
      },
      () => {
        const certificate = socket.getPeerCertificate()
        finish({
          ok: socket.authorized,
          expiresAt: certificate?.valid_to ? new Date(certificate.valid_to).toISOString() : null,
          reason: socket.authorized ? null : String(socket.authorizationError ?? 'certificat refusé'),
        })
      },
    )

    socket.once('error', (error) => finish({ ok: false, expiresAt: null, reason: error.message }))
    socket.once('timeout', () => finish({ ok: false, expiresAt: null, reason: 'timeout TLS' }))
  })
}

/**
 * Attend qu'un certificat TLS valide soit servi pour `host`. Let's Encrypt peut
 * mettre quelques dizaines de secondes après la publication du conteneur.
 */
export async function waitForTls(
  host: string,
  options: { attempts?: number; delayMs?: number; timeoutMs?: number } = {},
): Promise<TlsCheck> {
  const { attempts = 12, delayMs = 5_000, timeoutMs = 8_000 } = options
  const clean = host.trim().toLowerCase()
  if (!HOST_RE.test(clean)) {
    return { ok: false, expiresAt: null, reason: 'nom d’hôte invalide' }
  }

  let last: TlsCheck = { ok: false, expiresAt: null, reason: 'aucune tentative' }
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    last = await once(clean, timeoutMs)
    if (last.ok) return last
    if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return last
}
