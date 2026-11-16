import { createHash } from 'node:crypto'
import { parse } from 'yaml'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OPS_TOOL_IDS,
  RESERVED_SUBDOMAINS,
  basicAuthEntry,
  generateOpsPassword,
  isIpOrCidr,
  opsAccess,
  opsToolCompose,
  opsToolHost,
} from '@/lib/ops-tools'
import { uniqueSlug } from '@/lib/project-slug'

type Compose = { services: Record<string, { image: string; labels?: string[]; networks?: string[]; environment?: string[]; volumes?: string[] }>; networks: Record<string, { external: boolean }> }

describe('outils d’exploitation : fichiers compose', () => {
  it.each(OPS_TOOL_IDS)('%s : routé en HTTPS sur son sous-domaine, protégé par une authentification', (id) => {
    const compose = parse(opsToolCompose(id, opsToolHost(id, 'eflex.app'), 'MotDePasse-Test-123456')) as Compose
    expect(compose.networks.proxy).toEqual({ external: true })
    const routed = Object.values(compose.services).find((service) => service.labels)!
    const labels = routed.labels!.join('\n')
    expect(labels).toContain(`Host(\`${id}.eflex.app\`)`)
    expect(labels).toContain('entrypoints=websecure')
    expect(labels).toContain('tls.certresolver=letsencrypt')
    expect(labels).toMatch(new RegExp(`routers\\.eflex-ops-${id}\\.middlewares=eflex-ops-${id}-auth`))
    expect(labels).toContain(`basicauth.users=admin:{SHA}${createHash('sha1').update('MotDePasse-Test-123456').digest('base64')}`)
    // Aucun « $ » : rien à échapper par Coolify ni par Compose.
    expect(routed.labels!.some((label) => label.includes('basicauth') && label.includes('$'))).toBe(false)
    expect(labels).not.toContain('MotDePasse-Test-123456')
  })

  it('Dozzle est en lecture seule et sans le compte « admin/test » du modèle Coolify', () => {
    const raw = opsToolCompose('logs', 'logs.eflex.app', 'x'.repeat(24))
    const dozzle = (parse(raw) as Compose).services.dozzle!
    expect(dozzle.volumes).toEqual(['/var/run/docker.sock:/var/run/docker.sock:ro'])
    expect(dozzle.environment).toEqual(expect.arrayContaining(['DOZZLE_ENABLE_ACTIONS=false', 'DOZZLE_ENABLE_SHELL=false']))
    expect(raw).not.toMatch(/users\.yml|password:/)
  })

  it('Beszel : l’agent lit Docker en lecture seule et attend sa clé', () => {
    const compose = parse(opsToolCompose('metrics', 'metrics.eflex.app', 'x'.repeat(24))) as Compose
    const agent = compose.services['beszel-agent']!
    expect(agent.volumes).toContain('/var/run/docker.sock:/var/run/docker.sock:ro')
    expect(agent.environment).toEqual(expect.arrayContaining(['HUB_URL=https://metrics.eflex.app', 'KEY=${KEY}', 'TOKEN=${TOKEN}']))
  })
})

describe('mots de passe', () => {
  it('sont longs, aléatoires et sans caractère ambigu', () => {
    const passwords = new Set(Array.from({ length: 50 }, generateOpsPassword))
    expect(passwords.size).toBe(50)
    for (const password of passwords) expect(password).toMatch(/^[A-HJ-NP-Za-km-np-z2-9]{24}$/)
  })

  it('basicAuthEntry suit le format {SHA} de Traefik', () => {
    expect(basicAuthEntry('admin', 'password')).toBe('admin:{SHA}W6ph5Mm5Pz8GgiULbPgzG37mj9g=')
  })
})

describe('sous-domaines réservés', () => {
  afterEach(() => vi.restoreAllMocks())

  it('contient les outils et les services de la plateforme', () => {
    for (const name of ['uptime', 'metrics', 'logs', 'api', 'axiom', 'coolify', 'www', 'admin']) expect(RESERVED_SUBDOMAINS.has(name)).toBe(true)
  })

  it('un projet nommé « API » ou « Uptime » ne prend jamais ce sous-domaine', async () => {
    const free = async () => false
    expect(await uniqueSlug('API', free)).toMatch(/^api-[0-9a-f]{4}$/)
    expect(await uniqueSlug('Uptime', free)).toMatch(/^uptime-[0-9a-f]{4}$/)
    expect(await uniqueSlug('Boutique', free)).toBe('boutique')
  })
})

describe('réglages d’accès', () => {
  it('par défaut : domaine de la plateforme, accessible depuis Internet derrière le mot de passe', () => {
    expect(opsAccess({}, 'eflex.app')).toEqual({ rootDomain: 'eflex.app', sourceRanges: [], privateNetwork: null, certResolver: 'letsencrypt', invalid: [] })
  })

  it('réseau privé Tailscale + adresses autorisées + domaine dédié + résolveur DNS-01', () => {
    const access = opsAccess(
      {
        OPS_PRIVATE_NETWORK: 'tailscale',
        OPS_ALLOWED_IPS: '203.0.113.7, 198.51.100.0/24, pas-une-ip, 10.0.0.0/99',
        OPS_ROOT_DOMAIN: 'OPS.eflex.app.',
        OPS_CERT_RESOLVER: 'letsencrypt-dns',
      },
      'eflex.app',
    )
    expect(access).toEqual({
      rootDomain: 'ops.eflex.app',
      privateNetwork: 'tailscale',
      sourceRanges: ['100.64.0.0/10', 'fd7a:115c:a1e0::/48', '203.0.113.7', '198.51.100.0/24'],
      certResolver: 'letsencrypt-dns',
      invalid: ['pas-une-ip', '10.0.0.0/99'],
    })
  })

  it('ignore un domaine ou un résolveur invalide', () => {
    const access = opsAccess({ OPS_ROOT_DOMAIN: 'evil.com/x', OPS_CERT_RESOLVER: 'a b' }, 'eflex.app')
    expect(access.rootDomain).toBe('eflex.app')
    expect(access.certResolver).toBe('letsencrypt')
  })

  it('valide les adresses et plages', () => {
    for (const ok of ['1.2.3.4', '10.0.0.0/8', '::1', 'fd7a:115c:a1e0::/48']) expect(isIpOrCidr(ok)).toBe(true)
    for (const ko of ['1.2.3', '1.2.3.4/33', '::/129', 'a.b.c.d', '1.2.3.4/8/1', '']) expect(isIpOrCidr(ko)).toBe(false)
  })

  it('pose le filtre d’adresses avant le mot de passe et le résolveur choisi', () => {
    const compose = parse(
      opsToolCompose('logs', 'logs.ops.eflex.app', 'x'.repeat(24), { sourceRanges: ['100.64.0.0/10'], certResolver: 'letsencrypt-dns' }),
    ) as Compose
    const labels = compose.services.dozzle!.labels!
    expect(labels).toContain('traefik.http.routers.eflex-ops-logs.middlewares=eflex-ops-logs-ip,eflex-ops-logs-auth')
    expect(labels).toContain('traefik.http.middlewares.eflex-ops-logs-ip.ipallowlist.sourcerange=100.64.0.0/10')
    expect(labels).toContain('traefik.http.routers.eflex-ops-logs.tls.certresolver=letsencrypt-dns')
  })
})
