import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  parseAuditPage,
  parseCleanup,
  parseCleanupExecutions,
  parseDeployments,
  parseImageScanning,
  parseProxy,
  parseS3Storages,
  parseVulnerabilities,
} from '@/lib/coolify-admin'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('lecteurs stricts des réponses Coolify', () => {
  it('ne garde jamais les clés d’un stockage S3', () => {
    const storages = parseS3Storages([
      { uuid: 's3-1', name: 'B2', endpoint: 'https://s3.eu.backblazeb2.com', bucket: 'b', region: 'eu', key: 'KEY', secret: 'SECRET' },
      { name: 'sans uuid' },
    ])
    expect(storages).toEqual([{ id: 's3-1', name: 'B2', endpoint: 'https://s3.eu.backblazeb2.com', bucket: 'b', region: 'eu' }])
    expect(JSON.stringify(storages)).not.toMatch(/KEY|SECRET/)
  })

  it('ne garde du proxy que son type et son état (pas sa configuration)', () => {
    expect(parseProxy({ proxy_type: 'TRAEFIK', status: 'running', configuration: 'secret: x' })).toEqual({ type: 'TRAEFIK', status: 'running' })
  })

  it('lit les réglages et l’historique du nettoyage Docker', () => {
    expect(parseCleanup({ docker_cleanup_frequency: '0 0 * * *', docker_cleanup_threshold: 80, force_docker_cleanup: 1, delete_unused_volumes: false })).toEqual({
      frequency: '0 0 * * *',
      threshold: 80,
      force: true,
      deleteUnusedVolumes: false,
      deleteUnusedNetworks: false,
    })
    const executions = parseCleanupExecutions([
      { uuid: 'a', status: 'success', created_at: '2026-11-15T00:00:00Z', message: 'x'.repeat(500) },
      { uuid: 'b', status: 'failed', created_at: '2026-11-16T00:00:00Z' },
      { status: 'oops' },
    ])
    expect(executions.map((item) => item.id)).toEqual(['b', 'a'])
    expect(executions[1]?.message).toHaveLength(300)
  })

  it('lit l’état de l’analyse d’images', () => {
    expect(parseImageScanning({ is_image_scan_enabled: true, scanner_state: 'ready', scanner_failed_step: null, scanner_disk_used_bytes: 1 })).toEqual({
      enabled: true,
      state: 'ready',
      failedStep: null,
    })
  })

  it('classe les failles : exploitées, puis critiques, puis élevées', () => {
    const rows = parseVulnerabilities({
      resources: [
        { uuid: 'a', name: 'app-a', type: 'application', security: { status: 'high', high_count: 3, critical_count: 0 } },
        { uuid: 'b', name: 'app-b', type: 'application', security: { status: 'critical', critical_count: 2, exploited_count: 0 } },
        { uuid: 'c', name: 'app-c', type: 'database', security: { status: 'high', exploited_count: 1, eol: true } },
      ],
    })
    expect(rows.map((row) => row.id)).toEqual(['c', 'b', 'a'])
    expect(rows[0]?.endOfLife).toBe(true)
  })

  it('lit une page du journal Coolify sans les données sensibles', () => {
    const page = parseAuditPage({
      current_page: 2,
      last_page: 5,
      total: 230,
      data: [{ id: 1, created_at: '2026-11-16T10:00:00Z', source: 'ui', action: 'application.deleted', level: 'warning', actor_name: 'Eurin', resource_name: 'boutique', ip_address: '1.2.3.4', token: 't' }],
    })
    expect(page).toMatchObject({ page: 2, lastPage: 5, total: 230 })
    expect(page.events[0]).toEqual({
      id: 1,
      createdAt: '2026-11-16T10:00:00Z',
      source: 'ui',
      action: 'application.deleted',
      level: 'warning',
      actor: 'Eurin',
      resource: 'boutique',
      description: null,
    })
    expect(JSON.stringify(page)).not.toContain('1.2.3.4')
  })

  it('résume les déploiements sans journaux ni configuration', () => {
    const rows = parseDeployments([
      { deployment_uuid: 'd1', application_name: 'boutique', status: 'in_progress', commit: 'abcdef1234567', is_webhook: true, logs: 'SECRET=1', configuration_snapshot: { a: 1 }, created_at: '2026-11-16T10:00:00Z' },
      { deployment_uuid: 'd2', application_name: 'blog', status: 'queued', commit: 'HEAD', is_api: true, created_at: '2026-11-16T11:00:00Z' },
    ])
    expect(rows).toEqual([
      { id: 'd2', application: 'blog', server: null, status: 'queued', commit: 'HEAD', origin: 'api', createdAt: '2026-11-16T11:00:00Z' },
      { id: 'd1', application: 'boutique', server: null, status: 'in_progress', commit: 'abcdef1', origin: 'webhook', createdAt: '2026-11-16T10:00:00Z' },
    ])
    expect(JSON.stringify(rows)).not.toContain('SECRET')
  })
})

describe('appels Coolify', () => {
  async function load(handler: (url: string, init?: RequestInit) => Response) {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, init })
      return handler(url, init)
    }))
    vi.stubEnv('COOLIFY_API_URL', 'https://coolify.test/api/v1')
    vi.stubEnv('COOLIFY_API_TOKEN', 'test')
    return { calls, mod: await import('@/lib/coolify-admin') }
  }
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

  it('envoie les bonnes requêtes pour chaque action de serveur', async () => {
    const { calls, mod } = await load(() => json({ message: 'ok' }))
    await mod.runServerAction('srv', { action: 'proxy-restart' })
    await mod.runServerAction('srv', { action: 'cleanup-run', deleteUnusedVolumes: false, deleteUnusedNetworks: true })
    await mod.runServerAction('srv', { action: 'validate' })
    await mod.runServerAction('srv', { action: 'image-scan', enabled: true })
    await mod.updateDockerCleanup('srv', { frequency: '0 3 * * *', threshold: 70 })
    expect(calls.map((call) => `${call.init?.method} ${call.url.replace('https://coolify.test/api/v1', '')} ${call.init?.body ?? ''}`)).toEqual([
      'POST /servers/srv/proxy/restart ',
      'POST /servers/srv/docker-cleanup/run {"delete_unused_volumes":false,"delete_unused_networks":true}',
      'POST /servers/srv/validate {"install":false}',
      'PATCH /servers/srv/image-scanning {"is_image_scan_enabled":true}',
      'PATCH /servers/srv/docker-cleanup {"docker_cleanup_frequency":"0 3 * * *","docker_cleanup_threshold":70}',
    ])
  })

  it('rassemble l’état d’un serveur, même si une partie échoue', async () => {
    const { mod } = await load((url) =>
      url.endsWith('/image-scanning') ? json({ message: 'Not found' }, 404) : url.endsWith('/executions') ? json([]) : json({ proxy_type: 'TRAEFIK', status: 'running' }),
    )
    const control = await mod.getServerControl('srv')
    expect(control.proxy).toEqual({ type: 'TRAEFIK', status: 'running' })
    expect('error' in control.imageScanning).toBe(true)
    expect(control.cleanupExecutions).toEqual([])
  })

  it('crée un stockage S3 de type s3 et filtre le journal par origine', async () => {
    const { calls, mod } = await load((url) => (url.includes('audit') ? json({ data: [], current_page: 1, last_page: 1, total: 0 }) : json({ uuid: 'new' }, 201)))
    expect(await mod.createS3Storage({ name: 'B2', endpoint: 'https://s3.test', bucket: 'b', region: 'eu', key: 'k', secret: 's' })).toEqual({ id: 'new' })
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({ type: 's3', bucket: 'b' })
    await mod.listCoolifyAudit({ page: 2, source: 'ui', search: 'delete' })
    expect(calls[1]?.url).toBe('https://coolify.test/api/v1/audit-events?per_page=50&page=2&search=delete&source=ui')
  })
})
