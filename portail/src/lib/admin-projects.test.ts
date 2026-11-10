import { describe, expect, it, vi } from 'vitest'
import {
  deploymentDuration,
  formatDuration,
  matchesProjectFilter,
  parseLogTimes,
  parseProjectListQuery,
  planUnblock,
  probableFailureCause,
  projectListWhere,
  reconcileApplications,
  summarizePlan,
  unblockDeployment,
  UNBLOCK_NOTE,
} from './admin-projects'

const NOW = new Date('2026-11-10T12:00:00.000Z')
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000)

describe('filtres de la liste des projets', () => {
  it('normalise les paramètres d’URL', () => {
    expect(parseProjectListQuery({})).toEqual({ filter: 'all', stack: null, query: '', page: 1 })
    expect(parseProjectListQuery({ etat: 'inconnu', page: '-3' })).toMatchObject({ filter: 'all', page: 1 })
    expect(parseProjectListQuery({ etat: 'failed', stack: 'Next.js!', q: '  boutique  ', page: '2' })).toEqual({
      filter: 'failed',
      stack: null,
      query: 'boutique',
      page: 2,
    })
    expect(parseProjectListQuery({ stack: 'nextjs', page: 'abc' })).toMatchObject({ stack: 'nextjs', page: 1 })
  })

  it('construit la restriction Prisma de premier niveau', () => {
    expect(projectListWhere(parseProjectListQuery({ etat: 'never' }))).toEqual({ deployments: { none: {} } })
    expect(projectListWhere(parseProjectListQuery({ etat: 'stuck', stack: 'node' }))).toMatchObject({
      framework: 'node',
      deployments: { some: { status: { in: ['queued', 'analyzing', 'provisioning', 'building', 'deploying'] } } },
    })
    const search = projectListWhere(parseProjectListQuery({ q: 'awa' }))
    expect(search.OR).toHaveLength(4)
  })

  it('décide le filtre à partir du dernier déploiement', () => {
    const failed = { id: 'd1', status: 'failed', createdAt: minutesAgo(5) }
    const running = { id: 'd2', status: 'building', createdAt: minutesAgo(10) }
    const stuck = { id: 'd3', status: 'queued', createdAt: minutesAgo(45) }
    const live = { id: 'd4', status: 'live', createdAt: minutesAgo(2) }

    expect(matchesProjectFilter(failed, 'failed', NOW)).toBe(true)
    expect(matchesProjectFilter(running, 'failed', NOW)).toBe(false)
    expect(matchesProjectFilter(running, 'active', NOW)).toBe(true)
    expect(matchesProjectFilter(stuck, 'stuck', NOW)).toBe(true)
    expect(matchesProjectFilter(running, 'stuck', NOW)).toBe(false)
    expect(matchesProjectFilter(live, 'active', NOW)).toBe(false)
    expect(matchesProjectFilter(null, 'never', NOW)).toBe(true)
    expect(matchesProjectFilter(failed, 'all', NOW)).toBe(true)
    // Seuil personnalisé (variable d'environnement DEPLOYMENT_TIMEOUT_MINUTES).
    expect(matchesProjectFilter(stuck, 'stuck', NOW, 60 * 60_000)).toBe(false)
  })
})

describe('durées', () => {
  it('formate en français, sans zéro inutile', () => {
    expect(formatDuration(0)).toBe('0 s')
    expect(formatDuration(12_400)).toBe('12 s')
    expect(formatDuration(4 * 60_000 + 5_000)).toBe('4 min 05 s')
    expect(formatDuration(5 * 60_000)).toBe('5 min')
    expect(formatDuration(2 * 3_600_000 + 10 * 60_000)).toBe('2 h 10')
    expect(formatDuration(3 * 3_600_000)).toBe('3 h')
  })

  it('n’invente pas de durée pour un déploiement terminé', () => {
    const active = deploymentDuration({ status: 'building', createdAt: minutesAgo(4) }, NOW)
    expect(active.label).toBe('En cours · 4 min')

    const done = deploymentDuration({ status: 'failed', createdAt: minutesAgo(90) }, NOW)
    expect(done.label).toBe('Non enregistrée')
    expect(done.detail).toContain('1 h 30')
  })

  it('extrait la durée réelle des horodatages du journal Coolify', () => {
    const raw = JSON.stringify([
      { output: 'starting', timestamp: '2026-11-10T10:00:00.000Z' },
      { output: 'hidden', hidden: true, timestamp: '2026-11-10T10:00:05.000Z' },
      { output: 'done', timestamp: '2026-11-10T10:02:30.000Z' },
      { output: 'sans date' },
      'texte',
    ])
    expect(parseLogTimes(raw)).toEqual({
      first: new Date('2026-11-10T10:00:00.000Z'),
      last: new Date('2026-11-10T10:02:30.000Z'),
      durationMs: 150_000,
    })
    expect(parseLogTimes('pas du JSON')).toBeNull()
    expect(parseLogTimes(JSON.stringify([{ output: 'x' }]))).toBeNull()
    expect(parseLogTimes(null)).toBeNull()
  })
})

describe('cause probable d’un échec', () => {
  it('reconnaît les erreurs fréquentes', () => {
    expect(probableFailureCause('write error: No space left on device')?.label).toContain('Disque plein')
    expect(probableFailureCause('Délai dépassé : le déploiement n’a pas abouti')?.label).toContain('Délai maximal')
    expect(probableFailureCause('ERROR: Cannot find module "next"')?.label).toContain('Module introuvable')
    expect(probableFailureCause('Déploiement interrompu par un administrateur.')?.label).toContain('administrateur')
  })

  it('reste honnête quand aucune règle ne s’applique', () => {
    expect(probableFailureCause('tout va bien')).toBeNull()
    expect(probableFailureCause('')).toBeNull()
    expect(probableFailureCause(null)).toBeNull()
  })
})

describe('résumé du BuildPlan', () => {
  it('lit les champs utiles sans lever sur un JSON incomplet', () => {
    const summary = summarizePlan({
      framework: 'nextjs',
      runtime: 'node@22',
      root: 'apps/web',
      install: 'pnpm install',
      build: 'pnpm build',
      start: 'pnpm start',
      port: 3000,
      publish: '.next',
      services: { app: { command: 'pnpm start' }, worker: { command: 'node worker.js' } },
    })
    expect(summary).toMatchObject({
      framework: 'nextjs',
      runtime: 'node@22',
      root: 'apps/web',
      port: 3000,
      publish: '.next',
    })
    expect(summary?.services).toHaveLength(2)

    expect(summarizePlan({ framework: 'static' })).toMatchObject({ framework: 'static', port: null })
    expect(summarizePlan(null)).toBeNull()
    expect(summarizePlan({ runtime: 'node@22' })).toBeNull()
    expect(summarizePlan('nextjs')).toBeNull()
  })
})

describe('réconciliation en lecture seule', () => {
  it('liste les applications orphelines et les références disparues', () => {
    const result = reconcileApplications({
      projects: [
        { id: 'p1', name: 'Boutique', slug: 'boutique', coolifyAppId: 'app-1', organizationName: 'Awa' },
        { id: 'p2', name: 'Admin', slug: 'admin', coolifyAppId: 'app-perdu', organizationName: 'Awa' },
        { id: 'p3', name: 'Jamais déployé', slug: 'neuf', coolifyAppId: null, organizationName: 'Beta' },
      ],
      applications: [
        { id: 'app-1', name: 'boutique' },
        { id: 'app-orpheline', name: 'zzz-outil' },
      ],
    })
    expect(result.orphans).toEqual([{ id: 'app-orpheline', name: 'zzz-outil' }])
    expect(result.missing.map((project) => project.id)).toEqual(['p2'])
  })

  it('ne signale rien quand tout est aligné', () => {
    const result = reconcileApplications({
      projects: [{ id: 'p1', name: 'A', slug: 'a', coolifyAppId: 'app-1', organizationName: 'O' }],
      applications: [{ id: 'app-1', name: 'a' }],
    })
    expect(result).toEqual({ orphans: [], missing: [] })
  })
})

describe('déblocage d’un déploiement', () => {
  it('refuse un déploiement déjà terminé', () => {
    expect(planUnblock({ status: 'live', coolifyBuildId: 'b1' })).toMatchObject({
      kind: 'refuse',
      code: 'terminal',
    })
  })

  it('retire le job en file puis passe en échec avec le motif imposé', async () => {
    const removeQueuedJob = vi.fn(async () => 'removed' as const)
    const cancelCoolify = vi.fn(async () => ({ ok: true as const }))
    const markFailed = vi.fn(async () => true)

    const result = await unblockDeployment(
      { id: 'd1', status: 'queued', coolifyBuildId: null },
      { removeQueuedJob, cancelCoolify, markFailed },
    )

    expect(result).toEqual({ ok: true })
    expect(removeQueuedJob).toHaveBeenCalledWith('d1')
    expect(cancelCoolify).not.toHaveBeenCalled()
    expect(markFailed).toHaveBeenCalledWith('d1', UNBLOCK_NOTE)
  })

  it('annule aussi le build distant quand il a démarré', async () => {
    const cancelCoolify = vi.fn(async () => ({ ok: true as const }))
    const markFailed = vi.fn(async () => true)
    const result = await unblockDeployment(
      { id: 'd2', status: 'building', coolifyBuildId: 'build-1' },
      { removeQueuedJob: vi.fn(async () => 'missing' as const), cancelCoolify, markFailed },
    )
    expect(result.ok).toBe(true)
    expect(cancelCoolify).toHaveBeenCalledWith('build-1')
  })

  it('signale une course perdue sans prétendre avoir débloqué', async () => {
    const result = await unblockDeployment(
      { id: 'd3', status: 'deploying', coolifyBuildId: null },
      {
        removeQueuedJob: vi.fn(async () => 'active' as const),
        cancelCoolify: vi.fn(async () => ({ ok: true as const })),
        markFailed: vi.fn(async () => false),
      },
    )
    expect(result).toMatchObject({ ok: false, code: 'race' })
  })

  it('remonte un avertissement quand l’hébergement ne confirme pas', async () => {
    const result = await unblockDeployment(
      { id: 'd4', status: 'building', coolifyBuildId: 'build-2' },
      {
        removeQueuedJob: vi.fn(async () => 'missing' as const),
        cancelCoolify: vi.fn(async () => ({ error: 'API hors ligne' })),
        markFailed: vi.fn(async () => true),
      },
    )
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.warning).toContain('API hors ligne')
  })
})
