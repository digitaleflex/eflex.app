import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * #22 P0 — Isolation des locataires (portail).
 *
 * 1) Inventaire exhaustif : chaque `route.ts` sous `src/app/api` doit être classée dans le
 *    manifeste ci-dessous (une nouvelle route non classée fait échouer le test de complétude).
 * 2) Intégration (EFLEX_TEST_DB=1 + base migrée) : les routes tenant-scopées critiques
 *    (projets/déploiements et ressources filles) sont appelées avec la session d'une autre
 *    organisation et ne doivent ni renvoyer 200 avec des données cibles, ni divulguer l'existence
 *    de la ressource (attendu : 401/403/404 selon le cas, et jamais de fuite d'identifiants).
 */

type RouteClass =
  | 'public'          // accessible sans session (health, status, maintenance publique…)
  | 'webhook'         // signature/HMAC, pas de session org
  | 'auth'            // Better Auth (catch-all / config) gère sa propre frontière
  | 'admin'           // réservé à l'administrateur plateforme (404 pour les autres)
  | 'user'            // scopé à l'utilisateur authentifié (pas à l'organisation cible)
  | 'org'             // scopé à l'organisation résolue (lecture/mutation non-projet ou liste)
  | 'org-project'     // scopé org + accès à un projet / ressource fille d'un projet

/**
 * Manifeste de classification de toutes les routes API.
 * Clé = chemin de route relatif à `src/app/api` (forme dossier Next, sans `/route.ts`).
 */
const ROUTE_MANIFEST: Record<string, RouteClass> = {
  '/account/password': 'user',
  '/admin/impersonation/stop': 'admin',
  '/admin/infrastructure/check': 'admin',
  '/admin/infrastructure/settings': 'admin',
  '/admin/live': 'admin',
  '/admin/live/audit': 'admin',
  '/admin/live/stream': 'admin',
  '/admin/metrics/export': 'admin',
  '/admin/organizations/[id]/subscription': 'admin',
  '/admin/organizations/[id]/suspension': 'admin',
  '/admin/payments/[id]/refund': 'admin',
  '/admin/projects/[id]/deployments/[deploymentId]/cancel': 'admin',
  '/admin/projects/[id]/deployments/[deploymentId]/logs': 'admin',
  '/admin/projects/[id]/deployments/[deploymentId]/unblock': 'admin',
  '/admin/projects/[id]/infrastructure': 'admin',
  '/admin/projects/[id]/redeploy': 'admin',
  '/admin/projects/[id]/runtime': 'admin',
  '/admin/support/tickets': 'admin',
  '/admin/support/tickets/[id]': 'admin',
  '/admin/users/[id]/ban': 'admin',
  '/admin/users/[id]/impersonate': 'admin',
  '/auth/[...all]': 'auth',
  '/auth/config': 'auth',
  '/billing/checkout': 'org',
  '/billing/invoices/[paymentId]': 'org',
  '/billing/kkiapay/confirm': 'org',
  '/billing/payments': 'org',
  '/billing/request': 'org',
  '/billing/summary': 'org',
  '/deployments/[id]': 'org-project',
  '/events': 'org',
  '/github/app-manifest/callback': 'admin',
  '/github/app-manifest/start': 'admin',
  '/github/config': 'admin',
  '/github/connection': 'user',
  '/github/install': 'user',
  '/github/installations': 'user',
  '/github/installations/[installationId]': 'user',
  '/github/oauth/callback': 'user',
  '/github/oauth/start': 'user',
  '/github/pat': 'user',
  '/github/repositories': 'user',
  '/health': 'public',
  '/maintenance': 'public',
  '/notifications': 'user',
  '/notifications/preferences': 'user',
  '/notifications/read': 'user',
  '/projects': 'org',
  '/projects/analyze': 'org', // action authentifiée, limitée au locataire actif (quota/rate-limit org) — #22
  '/projects/[id]': 'org-project',
  '/projects/[id]/apps': 'org-project',
  '/projects/[id]/apps/[appId]': 'org-project',
  '/projects/[id]/databases': 'org-project',
  '/projects/[id]/databases/[databaseId]': 'org-project',
  '/projects/[id]/databases/[databaseId]/action': 'org-project',
  '/projects/[id]/deployments': 'org-project',
  '/projects/[id]/deployments/[deploymentId]/cancel': 'org-project',
  '/projects/[id]/deployments/[deploymentId]/logs': 'org-project',
  '/projects/[id]/deployments/[deploymentId]/rollback': 'org-project',
  '/projects/[id]/domains': 'org-project',
  '/projects/[id]/domains/[domainId]': 'org-project',
  '/projects/[id]/domains/[domainId]/verify': 'org-project',
  '/projects/[id]/env-vars': 'org-project',
  '/projects/[id]/env-vars/[key]': 'org-project',
  '/projects/[id]/logs': 'org-project',
  '/projects/[id]/logs/stream': 'org-project',
  '/projects/[id]/metrics': 'org-project',
  '/projects/[id]/redeploy': 'org-project',
  '/projects/[id]/runtime': 'org-project',
  '/projects/[id]/transfer': 'org-project',
  '/status': 'public',
  '/support/tickets': 'org',
  '/webhooks/fedapay': 'webhook',
  '/webhooks/github': 'webhook',
  '/webhooks/kkiapay': 'webhook',
  '/webhooks/resend': 'webhook',
  '/webhooks': 'webhook',
}

function discoverApiRoutes(): string[] {
  const root = path.join(process.cwd(), 'portail', 'src', 'app', 'api')
  const found: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && entry.name === 'route.ts') {
        const rel = full.slice(root.length).replace(/\/route\.ts$/, '') || '/'
        found.push(rel)
      }
    }
  }
  walk(root)
  return found.sort()
}

describe('inventaire des routes API (complétude du manifeste de tenant)', () => {
  it('classe toutes les routes découvertes', () => {
    const discovered = discoverApiRoutes()
    const known = Object.keys(ROUTE_MANIFEST).sort()
    const missing = discovered.filter((r) => !(r in ROUTE_MANIFEST))
    const stale = known.filter((r) => !discovered.includes(r))
    expect(missing, `Routes non classées (ajouter au manifeste ROUTE_MANIFEST) : ${missing.join(', ')}`).toEqual([])
    expect(stale, `Routes classées mais absentes du disque : ${stale.join(', ')}`).toEqual([])
    expect(new Set(Object.values(ROUTE_MANIFEST)).size).toBeGreaterThan(0)
  })
})

// --- Intégration : vérification cross-tenant sur les routes projet/déploiement ---

const run = process.env.EFLEX_TEST_DB === '1' ? describe : describe.skip

let currentSession: unknown = null
vi.mock('@/lib/session', () => ({ getSession: async () => currentSession }))

// Évite les effets de bord réseau (Coolify, file, DNS, TLS, GitHub, emails) pendant les appels.
vi.mock('@/lib/coolify', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/coolify')>()
  const ok = async () => ({ ok: true as const })
  return {
    ...actual,
    getApplicationLogs: async () => ({ logs: '' }),
    getApplicationMetrics: async () => ({ available: false, message: 'indisponible' }),
    getApplicationRuntime: async () => ({ status: 'running', healthCheckEnabled: false, healthCheckPath: null }),
    applicationAction: ok,
    deleteApplication: ok,
    deletePrivateKey: ok,
    deleteManagedDatabase: ok,
    managedDatabaseAction: ok,
    setComposeApplicationDomains: ok,
  }
})
vi.mock('@/lib/queue', () => ({
  enqueueDeployment: vi.fn(async () => undefined),
  removeQueuedDeployment: vi.fn(async () => 'removed' as const),
}))
vi.mock('@/lib/project-deployments', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/project-deployments')>()
  return {
    ...actual,
    enqueueProjectDeployment: vi.fn(async () => ({
      deploymentId: 'blocked', groupId: null, deployments: [], skipped: [],
      error: 'Accès refusé', code: 'deployment_in_progress',
    })),
  }
})
vi.mock('@/lib/project-transfer', () => ({
  transferProjectSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  transferProject: vi.fn(async () => ({
    ok: false as const,
    status: 404,
    error: 'Projet introuvable.',
    code: 'not_found',
  })),
}))
vi.mock('@/lib/custom-domain', () => ({
  normalizeHostname: (v: string) => v.trim().toLowerCase(),
  validateCustomHostname: () => ({ ok: true }),
  verifyDomainPointsToPortal: async () => ({ ok: true }),
}))
vi.mock('@/lib/tls', () => ({ waitForTls: async () => undefined }))

function expectNoLeak(res: Response, markers: string[]) {
  return (async () => {
    const text = await res.text().catch(() => '')
    for (const m of markers) {
      expect(text).not.toContain(m)
    }
  })()
}

run('isolation cross-tenant des routes projet/déploiement (#22)', () => {
  process.env.BETTER_AUTH_SECRET ??= 'test-secret-test-secret-test-secret-0123'
  process.env.BETTER_AUTH_URL ??= 'http://localhost:3000'
  process.env.ENV_ENCRYPTION_KEY ??= Buffer.alloc(32, 7).toString('base64')

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  let prisma: typeof import('@/lib/prisma').prisma

  const ids = {
    ownerUser: '', strangerUser: '',
    orgA: '', orgB: '',
    projectA: '', projectASlug: '',
    appA: '', deploymentA: '', domainA: '', domainAHost: '', databaseA: '', envKey: 'SECRET_TOKEN',
  }

  const as = (userId: string | null, activeOrgId?: string | null) => {
    currentSession = userId ? { user: { id: userId }, session: { activeOrganizationId: activeOrgId ?? null } } : null
  }

  beforeAll(async () => {
    prisma = (await import('@/lib/prisma')).prisma
    const { encrypt } = await import('@/lib/crypto')

    const owner = await prisma.user.create({ data: { name: 'OwnerA', email: `ownera-${stamp}@exemple.fr` } })
    const stranger = await prisma.user.create({ data: { name: 'StrangerB', email: `strangerb-${stamp}@exemple.fr` } })
    ids.ownerUser = owner.id
    ids.strangerUser = stranger.id

    const orgA = await prisma.organization.create({
      data: { name: 'OrgA', slug: `orga-${stamp}`, members: { create: { userId: owner.id, role: 'owner' } } },
    })
    const orgB = await prisma.organization.create({
      data: { name: 'OrgB', slug: `orgb-${stamp}`, members: { create: { userId: stranger.id, role: 'owner' } } },
    })
    ids.orgA = orgA.id
    ids.orgB = orgB.id

    const project = await prisma.project.create({
      data: {
        organizationId: orgA.id,
        userId: owner.id,
        name: `ProjetSecret-${stamp}`,
        slug: `projet-secret-${stamp}`,
        repoUrl: 'https://github.com/exemple/prive',
        framework: 'nextjs',
        plan: { framework: 'nextjs', runtime: 'node@22', root: '', port: 3000 },
        coolifyAppId: 'coolify-app-a',
        domain: `secret-${stamp}.eflex.app`,
      },
    })
    ids.projectA = project.id
    ids.projectASlug = project.slug

    const app = await prisma.projectApp.create({
      data: {
        projectId: project.id, name: 'web', root: '', position: 0,
        framework: 'nextjs', port: 3000, domain: `secret-${stamp}.eflex.app`,
        plan: { framework: 'nextjs', runtime: 'node@22', root: '', port: 3000 },
      },
    })
    ids.appA = app.id

    await prisma.envVar.create({
      data: { projectId: project.id, key: ids.envKey, value: encrypt('valeur-ultra-secrete', `${project.id}:${ids.envKey}`) },
    })

    const deployment = await prisma.deployment.create({
      data: { projectId: project.id, appId: app.id, commitSha: 'a'.repeat(40), status: 'live', logsSummary: 'build ok' },
    })
    ids.deploymentA = deployment.id

    const domain = await prisma.projectDomain.create({
      data: { projectId: project.id, hostname: `client-${stamp}.exemple.fr` },
    })
    ids.domainA = domain.id
    ids.domainAHost = domain.hostname

    const database = await prisma.projectDatabase.create({
      data: {
        projectId: project.id, kind: 'postgresql', name: 'db', coolifyId: 'db-a',
        internalUrl: encrypt('postgres://u:p@db/secret', `project-db:${project.id}:postgresql`),
        status: 'running',
      },
    })
    ids.databaseA = database.id
  })

  afterAll(async () => {
    await prisma.$disconnect()
  })

  const markers = () => [ids.projectA, ids.projectASlug, ids.appA, ids.deploymentA, ids.domainA, ids.domainAHost, ids.databaseA, 'valeur-ultra-secrete', 'ProjetSecret']

  type Case = { name: string; method: string; path: string; importPath: string; params: Record<string, string>; body?: unknown }

  const projectCases: Case[] = [
    { name: 'GET /api/projects/[id]', method: 'GET', path: '/api/projects/:id', importPath: '@/app/api/projects/[id]/route', params: { id: 'PROJECT' } },
    { name: 'PATCH /api/projects/[id]', method: 'PATCH', path: '/api/projects/:id', importPath: '@/app/api/projects/[id]/route', params: { id: 'PROJECT' }, body: { name: 'X' } },
    { name: 'DELETE /api/projects/[id]', method: 'DELETE', path: '/api/projects/:id', importPath: '@/app/api/projects/[id]/route', params: { id: 'PROJECT' } },
    { name: 'GET /api/projects/[id]/apps', method: 'GET', path: '/api/projects/:id/apps', importPath: '@/app/api/projects/[id]/apps/route', params: { id: 'PROJECT' } },
    { name: 'POST /api/projects/[id]/apps', method: 'POST', path: '/api/projects/:id/apps', importPath: '@/app/api/projects/[id]/apps/route', params: { id: 'PROJECT' }, body: { name: 'web2', root: '' } },
    { name: 'GET /api/projects/[id]/apps/[appId]', method: 'GET', path: '/api/projects/:id/apps/:appId', importPath: '@/app/api/projects/[id]/apps/[appId]/route', params: { id: 'PROJECT', appId: 'APP' } },
    { name: 'PATCH /api/projects/[id]/apps/[appId]', method: 'PATCH', path: '/api/projects/:id/apps/:appId', importPath: '@/app/api/projects/[id]/apps/[appId]/route', params: { id: 'PROJECT', appId: 'APP' }, body: { name: 'webx' } },
    { name: 'DELETE /api/projects/[id]/apps/[appId]', method: 'DELETE', path: '/api/projects/:id/apps/:appId', importPath: '@/app/api/projects/[id]/apps/[appId]/route', params: { id: 'PROJECT', appId: 'APP' } },
    { name: 'GET /api/projects/[id]/deployments', method: 'GET', path: '/api/projects/:id/deployments', importPath: '@/app/api/projects/[id]/deployments/route', params: { id: 'PROJECT' } },
    { name: 'POST /api/projects/[id]/deployments/[deploymentId]/cancel', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/deployments/[deploymentId]/cancel/route', params: { id: 'PROJECT', deploymentId: 'DEPLOYMENT' } },
    { name: 'GET /api/projects/[id]/deployments/[deploymentId]/logs', method: 'GET', path: '...', importPath: '@/app/api/projects/[id]/deployments/[deploymentId]/logs/route', params: { id: 'PROJECT', deploymentId: 'DEPLOYMENT' } },
    { name: 'POST /api/projects/[id]/deployments/[deploymentId]/rollback', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/deployments/[deploymentId]/rollback/route', params: { id: 'PROJECT', deploymentId: 'DEPLOYMENT' } },
    { name: 'GET /api/projects/[id]/domains', method: 'GET', path: '...', importPath: '@/app/api/projects/[id]/domains/route', params: { id: 'PROJECT' } },
    { name: 'POST /api/projects/[id]/domains', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/domains/route', params: { id: 'PROJECT' }, body: { hostname: 'x.exemple.fr' } },
    { name: 'DELETE /api/projects/[id]/domains/[domainId]', method: 'DELETE', path: '...', importPath: '@/app/api/projects/[id]/domains/[domainId]/route', params: { id: 'PROJECT', domainId: 'DOMAIN' } },
    { name: 'POST /api/projects/[id]/domains/[domainId]/verify', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/domains/[domainId]/verify/route', params: { id: 'PROJECT', domainId: 'DOMAIN' } },
    { name: 'POST /api/projects/[id]/env-vars', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/env-vars/route', params: { id: 'PROJECT' }, body: { key: 'X', value: 'y' } },
    { name: 'DELETE /api/projects/[id]/env-vars/[key]', method: 'DELETE', path: '...', importPath: '@/app/api/projects/[id]/env-vars/[key]/route', params: { id: 'PROJECT', key: 'SECRET_TOKEN' } },
    { name: 'GET /api/projects/[id]/logs', method: 'GET', path: '...', importPath: '@/app/api/projects/[id]/logs/route', params: { id: 'PROJECT' } },
    { name: 'GET /api/projects/[id]/logs/stream', method: 'GET', path: '...', importPath: '@/app/api/projects/[id]/logs/stream/route', params: { id: 'PROJECT' } },
    { name: 'GET /api/projects/[id]/metrics', method: 'GET', path: '...', importPath: '@/app/api/projects/[id]/metrics/route', params: { id: 'PROJECT' } },
    { name: 'POST /api/projects/[id]/redeploy', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/redeploy/route', params: { id: 'PROJECT' } },
    { name: 'GET /api/projects/[id]/runtime', method: 'GET', path: '...', importPath: '@/app/api/projects/[id]/runtime/route', params: { id: 'PROJECT' } },
    { name: 'POST /api/projects/[id]/runtime', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/runtime/route', params: { id: 'PROJECT' }, body: { action: 'restart' } },
    { name: 'POST /api/projects/[id]/transfer', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/transfer/route', params: { id: 'PROJECT' }, body: { organizationId: 'org-target' } },
    { name: 'GET /api/projects/[id]/databases', method: 'GET', path: '...', importPath: '@/app/api/projects/[id]/databases/route', params: { id: 'PROJECT' } },
    { name: 'POST /api/projects/[id]/databases', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/databases/route', params: { id: 'PROJECT' }, body: { kind: 'postgresql' } },
    { name: 'DELETE /api/projects/[id]/databases/[databaseId]', method: 'DELETE', path: '...', importPath: '@/app/api/projects/[id]/databases/[databaseId]/route', params: { id: 'PROJECT', databaseId: 'DATABASE' } },
    { name: 'POST /api/projects/[id]/databases/[databaseId]/action', method: 'POST', path: '...', importPath: '@/app/api/projects/[id]/databases/[databaseId]/action/route', params: { id: 'PROJECT', databaseId: 'DATABASE' }, body: { action: 'restart' } },
    { name: 'GET /api/deployments/[id]', method: 'GET', path: '/api/deployments/:id', importPath: '@/app/api/deployments/[id]/route', params: { id: 'DEPLOYMENT' } },
  ]

  function resolveParams(params: Record<string, string>) {
    const map: Record<string, string> = {
      PROJECT: ids.projectA,
      APP: ids.appA,
      DEPLOYMENT: ids.deploymentA,
      DOMAIN: ids.domainA,
      DATABASE: ids.databaseA,
      SECRET_TOKEN: ids.envKey,
    }
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(params)) out[k] = map[v] ?? v
    return out
  }

  it.each(projectCases)('$name → refuse l’accès cross-tenant sans fuite', async (c) => {
    as(ids.strangerUser, ids.orgB)
    const mod = await import(c.importPath)
    const handler = mod[c.method]
    expect(handler, `Méthode ${c.method} absente dans ${c.importPath}`).toBeTypeOf('function')

    const url = `http://localhost${c.path}`
    const init: RequestInit = { method: c.method }
    if (c.body !== undefined) {
      init.headers = { 'content-type': 'application/json' }
      init.body = JSON.stringify(c.body)
    }
    const req = new Request(url, init)
    const params = resolveParams(c.params)
    const res: Response = await handler(req, { params: Promise.resolve(params) })

    // Ne jamais renvoyer 200/201/202/204 sur une ressource d'une autre organisation.
    expect([401, 403, 404, 409, 429, 400].includes(res.status), `statut inattendu ${res.status} pour ${c.name}`).toBe(true)
    await expectNoLeak(res, markers())
  })

  it('GET /api/projects liste uniquement les projets de l’organisation active', async () => {
    as(ids.strangerUser, ids.orgB)
    const { GET } = await import('@/app/api/projects/route')
    const res = await GET(new Request('http://localhost/api/projects'))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).not.toContain(ids.projectA)
    expect(text).not.toContain(ids.projectASlug)
    expect(text).not.toContain('ProjetSecret')
  })
})
