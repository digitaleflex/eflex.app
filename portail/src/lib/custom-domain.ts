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

const SECOND_LEVEL_LABELS = new Set(['co', 'com', 'org', 'net', 'gov', 'edu', 'ac', 'or', 'ne'])

/**
 * Le nom est-il un domaine racine (apex) ? Un CNAME y est interdit par le DNS chez la plupart des fournisseurs.
 * Approximation sans liste des suffixes publics : `exemple.com` et `exemple.co.uk` sont des racines, `app.exemple.com` non.
 */
export function isLikelyApexDomain(hostname: string): boolean {
  const labels = hostname.trim().toLowerCase().replace(/\.$/, '').split('.').filter(Boolean)
  if (labels.length <= 2) return true
  return labels.length === 3 && labels[2]!.length === 2 && SECOND_LEVEL_LABELS.has(labels[1]!)
}

/** Consigne DNS en français adaptée au nom : CNAME pour un sous-domaine, enregistrement A pour la racine. */
export function dnsInstruction(hostname: string, target: string, platformIps: string[] = []): string {
  const proxyNote = ' Si votre DNS passe par Cloudflare, laissez le proxy désactivé (nuage gris) jusqu’à la validation du domaine.'
  if (isLikelyApexDomain(hostname)) {
    const ips = platformIps.length > 0 ? ` vers ${platformIps.join(', ')}` : ' vers l’adresse de la plateforme affichée dans l’assistant DNS'
    return `« ${hostname} » est un domaine racine : un CNAME y est le plus souvent refusé. Créez un enregistrement A${ips} (et AAAA seulement si une adresse IPv6 est indiquée).${proxyNote} Si votre fournisseur propose un CNAME aplati ou ALIAS, vous pouvez le diriger vers ${target}.`
  }
  return `Créez un enregistrement CNAME « ${hostname} » vers « ${target} ». À défaut, un enregistrement A vers l’adresse de la plateforme fonctionne aussi, mais devra être mis à jour si elle change.${proxyNote}`
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
      error: `Aucune adresse DNS pour ${hostname}. ${dnsInstruction(hostname, target, platformIps)}`,
    }
  }

  const ok = ips.some((ip) => platformIps.includes(ip))
  return {
    ok,
    target,
    cname: null,
    ips,
    platformIps,
    error: ok ? null : `Le domaine ne pointe pas vers la plateforme. ${dnsInstruction(hostname, target, platformIps)}`,
  }
}
