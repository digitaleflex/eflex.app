import { describe, expect, it } from 'vitest'
import type { BuildPlan } from '@eflex/detector'
import { INVALID_PLAN_MESSAGE, resolveDeploymentContext } from '@/lib/deployment-context'

const plan = (root: string, framework = 'nextjs') =>
  ({ framework, port: 3000, root }) as unknown as BuildPlan

const domain = (hostname: string, appId: string | null = null, verified = true) => ({
  hostname,
  verifiedAt: verified ? new Date('2026-01-01T00:00:00Z') : null,
  appId,
})

describe('résolution du contexte de déploiement (worker, lot C)', () => {
  const project = {
    slug: 'boutique',
    plan: plan(''),
    domain: 'boutique.eflex.app',
    domains: [domain('www.boutique.fr'), domain('non-verifie.fr', null, false)],
  }

  it('sans appId, conserve exactement le comportement mono-application', () => {
    const result = resolveDeploymentContext({ project, app: null })
    expect('context' in result).toBe(true)
    if (!('context' in result)) return
    expect(result.context).toMatchObject({
      appId: null,
      deployKey: 'boutique',
      domain: 'boutique.eflex.app',
      primary: true,
    })
    expect(result.context.hosts).toEqual(['boutique.eflex.app', 'www.boutique.fr'])
  })

  it('sélectionne le plan, le dossier et le domaine de l’application ciblée', () => {
    const result = resolveDeploymentContext({
      project,
      app: {
        id: 'app-api',
        name: 'api',
        root: 'apps/api',
        position: 1,
        plan: plan('apps/api', 'node'),
        domain: 'boutique-api.eflex.app',
      },
    })
    expect('context' in result).toBe(true)
    if (!('context' in result)) return
    expect(result.context.plan.framework).toBe('node')
    expect(result.context.plan.root).toBe('apps/api')
    expect(result.context.appId).toBe('app-api')
    expect(result.context.deployKey).toBe('boutique-api')
    expect(result.context.domain).toBe('boutique-api.eflex.app')
    expect(result.context.hosts).toEqual(['boutique-api.eflex.app'])
    expect(result.context.primary).toBe(false)
  })

  it('l’app principale garde le slug du projet et les alias de portée projet', () => {
    const result = resolveDeploymentContext({
      project: { ...project, domains: [...project.domains, domain('admin.boutique.fr', 'app-admin')] },
      app: {
        id: 'app-web',
        name: 'web',
        root: 'apps/web',
        position: 0,
        plan: plan('apps/web'),
        domain: 'boutique.eflex.app',
      },
    })
    if (!('context' in result)) throw new Error(result.error)
    expect(result.context.deployKey).toBe('boutique')
    expect(result.context.primary).toBe(true)
    expect(result.context.hosts).toEqual(['boutique.eflex.app', 'www.boutique.fr'])
  })

  it('une application sans domaine est un cas normal : aucun hôte, aucun TLS', () => {
    const result = resolveDeploymentContext({
      project,
      app: {
        id: 'app-worker',
        name: 'worker',
        root: 'apps/worker',
        position: 2,
        plan: plan('apps/worker', 'node'),
        domain: null,
      },
    })
    if (!('context' in result)) throw new Error(result.error)
    expect(result.context.domain).toBeNull()
    expect(result.context.hosts).toEqual([])
  })

  it('refuse un plan absent ou invalide', () => {
    expect(resolveDeploymentContext({ project: { ...project, plan: null }, app: null })).toEqual({
      error: INVALID_PLAN_MESSAGE,
    })
    expect(
      resolveDeploymentContext({
        project,
        app: {
          id: 'app-x',
          name: 'x',
          root: 'apps/x',
          position: 1,
          plan: null,
          domain: null,
        },
      }),
    ).toEqual({ error: INVALID_PLAN_MESSAGE })
  })
})
