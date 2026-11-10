import { describe, expect, it } from 'vitest'
import {
  HelpRequestedError,
  decideProjectApp,
  parseBackfillArgs,
  readPlanRoot,
  stableAppName,
  type BackfillProject,
} from './project-app-backfill'

const plan = { root: 'apps/web', framework: 'nextjs', port: 3000 }

function project(overrides: Partial<BackfillProject> = {}): BackfillProject {
  return {
    id: 'prj_1',
    name: 'Boutique',
    slug: 'boutique',
    plan,
    framework: 'nextjs',
    runtime: 'node@22',
    port: 3000,
    domain: 'boutique.eflex.app',
    coolifyAppId: 'coolify-1',
    tlsValid: true,
    tlsExpiresAt: new Date('2027-01-01T00:00:00Z'),
    tlsCheckedAt: new Date('2026-11-01T00:00:00Z'),
    ...overrides,
  }
}

describe('stableAppName', () => {
  it('prend le dernier segment du dossier', () => {
    expect(stableAppName('apps/web')).toBe('web')
    expect(stableAppName('packages/api/')).toBe('api')
    expect(stableAppName('web')).toBe('web')
  })

  it('utilise « app » pour la racine ou une valeur absente', () => {
    expect(stableAppName('')).toBe('app')
    expect(stableAppName(null)).toBe('app')
    expect(stableAppName(undefined)).toBe('app')
  })

  it('normalise la casse, les accents et les séparateurs', () => {
    expect(stableAppName('apps/Web Éditorial')).toBe('web-editorial')
    expect(stableAppName('apps/web_store')).toBe('web-store')
    expect(stableAppName('apps/--web--')).toBe('web')
  })

  it('borne la longueur du nom', () => {
    expect(stableAppName(`apps/${'a'.repeat(60)}`)).toHaveLength(24)
  })

  it('est stable : deux appels donnent le même nom', () => {
    expect(stableAppName('apps/api')).toBe(stableAppName('apps/api'))
  })
})

describe('readPlanRoot', () => {
  it('lit et normalise plan.root', () => {
    expect(readPlanRoot({ root: 'apps/api/', framework: 'node', port: 3000 })).toBe('apps/api')
    expect(readPlanRoot({ framework: 'static', port: 80 })).toBe('')
    expect(readPlanRoot({ root: '/', framework: 'static', port: 80 })).toBe('')
  })

  it('refuse un plan absent ou non exploitable', () => {
    expect(readPlanRoot(null)).toBeNull()
    expect(readPlanRoot('apps/web')).toBeNull()
    expect(readPlanRoot([])).toBeNull()
    expect(readPlanRoot({ root: 'apps/web' })).toBeNull()
    expect(readPlanRoot({ root: 42, framework: 'node', port: 3000 })).toBeNull()
  })
})

describe('decideProjectApp', () => {
  it('recopie les colonnes mono-application dans l’application principale', () => {
    const decision = decideProjectApp({
      project: project(),
      hasApp: false,
      takenDomains: new Set(),
    })

    expect(decision.action).toBe('create')
    if (decision.action !== 'create') throw new Error('décision inattendue')
    expect(decision.data).toMatchObject({
      projectId: 'prj_1',
      name: 'web',
      root: 'apps/web',
      position: 0,
      framework: 'nextjs',
      runtime: 'node@22',
      port: 3000,
      domain: 'boutique.eflex.app',
      coolifyAppId: 'coolify-1',
      tlsValid: true,
    })
    expect(decision.data.plan).toEqual(plan)
    expect(decision.warnings).toEqual([])
  })

  it('nomme « app » une application déployée depuis la racine', () => {
    const decision = decideProjectApp({
      project: project({ plan: { framework: 'static', port: 80 } }),
      hasApp: false,
      takenDomains: new Set(),
    })

    expect(decision.action).toBe('create')
    if (decision.action !== 'create') throw new Error('décision inattendue')
    expect(decision.data.name).toBe('app')
    expect(decision.data.root).toBe('')
  })

  it('ignore un projet qui a déjà une application (idempotence)', () => {
    const decision = decideProjectApp({
      project: project(),
      hasApp: true,
      takenDomains: new Set(),
    })

    expect(decision).toEqual({ action: 'skip', reason: 'app_already_exists', warnings: [] })
  })

  it('ignore un projet sans plan v1 exploitable', () => {
    expect(
      decideProjectApp({ project: project({ plan: null }), hasApp: false, takenDomains: new Set() }),
    ).toEqual({ action: 'skip', reason: 'plan_missing', warnings: [] })

    expect(
      decideProjectApp({
        project: project({ plan: { framework: 'nextjs' } }),
        hasApp: false,
        takenDomains: new Set(),
      }),
    ).toEqual({ action: 'skip', reason: 'plan_missing', warnings: [] })
  })

  it('laisse le domaine libre quand il est déjà pris, avec un avertissement', () => {
    const decision = decideProjectApp({
      project: project(),
      hasApp: false,
      takenDomains: new Set(['boutique.eflex.app']),
    })

    expect(decision.action).toBe('create')
    if (decision.action !== 'create') throw new Error('décision inattendue')
    expect(decision.data.domain).toBeNull()
    expect(decision.warnings).toHaveLength(1)
    expect(decision.warnings[0]).toContain('boutique.eflex.app')
  })

  it('accepte une application sans domaine (worker interne)', () => {
    const decision = decideProjectApp({
      project: project({ domain: null }),
      hasApp: false,
      takenDomains: new Set(),
    })

    expect(decision.action).toBe('create')
    if (decision.action !== 'create') throw new Error('décision inattendue')
    expect(decision.data.domain).toBeNull()
  })

  it('produit la même décision à chaque exécution (aucune valeur aléatoire)', () => {
    const first = decideProjectApp({ project: project(), hasApp: false, takenDomains: new Set() })
    const second = decideProjectApp({ project: project(), hasApp: false, takenDomains: new Set() })
    expect(first).toEqual(second)
  })
})

describe('parseBackfillArgs', () => {
  it('est en lecture seule par défaut', () => {
    expect(parseBackfillArgs([])).toEqual({ apply: false, batchSize: 200 })
    expect(parseBackfillArgs(['--dry-run'])).toEqual({ apply: false, batchSize: 200 })
  })

  it('écrit seulement avec --apply', () => {
    expect(parseBackfillArgs(['--apply'])).toEqual({ apply: true, batchSize: 200 })
    expect(parseBackfillArgs(['--apply', '--batch=50'])).toEqual({ apply: true, batchSize: 50 })
  })

  it('refuse une option ou une pagination invalide', () => {
    expect(() => parseBackfillArgs(['--force'])).toThrow(/Option inconnue/)
    expect(() => parseBackfillArgs(['--batch=0'])).toThrow(/--batch/)
    expect(() => parseBackfillArgs(['--batch=abc'])).toThrow(/--batch/)
  })

  it('reconnaît --help', () => {
    expect(() => parseBackfillArgs(['--help'])).toThrow(HelpRequestedError)
  })
})
