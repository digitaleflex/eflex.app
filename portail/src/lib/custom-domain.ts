import { isIP } from 'node:net'
import { resolve4, resolve6, resolveCname } from 'node:dns/promises'

const HOSTNAME_RE = /^(?=.{1,253}$)(?!-)[a-z0-9-]{1,63}(?<!-)(?:\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/i

/** Domaine racine de la plateforme (`PORTAL_DOMAIN`, ex. `eflex.app`). */
export function platformDomain(): string | null {
  const raw = process.env.PORTAL_DOMAIN?.trim().toLowerCase()
  if (!raw) return null
  return raw.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/\.$/, '')
}

/**
 * Normalise un domaine saisi (URL complète, `www.`, casse, point final) en
 * hostname nu. Retourne `null` si la forme est inutilisable.
 */
export function normalizeDomainInput(input: string): string | null {
  const raw = input.trim()
  if (raw.length === 0 || raw.length > 300) return null
  let host: string
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname
  } catch {
    return null
  }
  const clean = host.toLowerCase().replace(/\.$/, '')
  if (!HOSTNAME_RE.test(clean) || isIP(clean) !== 0) return null
  return clean
}

/** Le domaine auto-généré et tout `*.eflex.app` restent réservés à la plateforme. */
export function isReservedDomain(hostname: string, portal = platformDomain()): boolean {
  if (!portal) return false
  return hostname === portal || hostname.endsWith(`.${portal}`)
}

export type CustomDomainValidation = { hostname: string } | { error: string }

export function validateCustomDomain(input: string): CustomDomainValidation {
  const hostname = normalizeDomainInput(input)
  if (!hostname) {
    return { error: 'Nom de domaine invalide. Exemple : app.mon-entreprise.com' }
  }
  if (isReservedDomain(hostname)) {
    return { error: `Les domaines en *.${platformDomain() ?? 'eflex.app'} sont réservés par la plateforme.` }
  }
  return { hostname }
}

export interface DnsCheck {
  ok: boolean
  target: string | null
  cname: string | null
  ips: string[]
  platformIps: string[]
  error: string | null
}

/**
 * Vérifie qu'un domaine pointe vers la plateforme : CNAME vers `PORTAL_DOMAIN`
 * ou adresse A/AAAA identique à celle du portail.
 */
export async function checkDomainDns(hostname: string): Promise<DnsCheck> {
  const target = platformDomain()
  const empty: DnsCheck = { ok: false, target, cname: null, ips: [], platformIps: [], error: null }
  if (!target) {
    return { ...empty, error: 'Domaine de la plateforme non configuré (PORTAL_DOMAIN).' }
  }

  const cnames = await resolveCname(hostname).catch(() => [] as string[])
  const cname = cnames.map((value) => value.toLowerCase().replace(/\.$/, '')).find((value) => value === target) ?? null
  if (cname) {
    return { ok: true, target, cname, ips: [], platformIps: [], error: null }
  }

  const [platform4, platform6, ips4, ips6] = await Promise.all([
    resolve4(target).catch(() => [] as string[]),
    resolve6(target).catch(() => [] as string[]),
    resolve4(hostname).catch(() => [] as string[]),
    resolve6(hostname).catch(() => [] as string[]),
  ])
  const platformIps = [...new Set([...platform4, ...platform6])]
  const ips = [...new Set([...ips4, ...ips6])]

  if (platformIps.length === 0) {
    return { ok: false, target, cname: null, ips, platformIps, error: `Impossible de résoudre ${target}.` }
  }
  if (ips.length === 0) {
    return {
      ok: false,
      target,
      cname: null,
      ips,
      platformIps,
      error: `Aucune adresse DNS pour ${hostname}. Créez un CNAME vers ${target}.`,
    }
  }

  const ok = ips.some((ip) => platformIps.includes(ip))
  return {
    ok,
    target,
    cname: null,
    ips,
    platformIps,
    error: ok ? null : `Le domaine ne pointe pas vers ${target}. Créez un CNAME vers ${target}.`,
  }
}
