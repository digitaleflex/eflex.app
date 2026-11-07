import { readFileSync } from 'node:fs'
import Ajv from 'ajv'

// Faux Coolify pour les tests : implémente les routes utilisées par le portail, avec les
// formes de réponse de la spécification officielle, et valide chaque corps de requête
// contre ses schémas (champs inconnus refusés comme le fait la vraie API).

const schemas = JSON.parse(
  readFileSync(new URL('./coolify-api-schemas.json', import.meta.url), 'utf8'),
) as Record<string, Record<string, unknown>>
const ajv = new Ajv({ strict: false, allErrors: true })
const strict = (s: Record<string, unknown>) => ({ ...s, additionalProperties: false })
const validateApp = ajv.compile(strict(schemas.createPublicApplication!))
const validateEnv = ajv.compile(strict(schemas.createEnv!))

export interface FakeApp {
  uuid: string
  payload: Record<string, unknown>
  envs: Array<Record<string, unknown>>
  deployments: string[]
  deleted: boolean
}

export interface FakeCall {
  method: string
  path: string
  search: string
  authorization: string | null
  body: Record<string, unknown> | null
}

export interface FakeCoolifyOptions {
  token?: string
  /** Statut renvoyé par GET /deployments/{uuid}. */
  deploymentStatus?: string
  deploymentCommit?: string
  deploymentLogs?: string
  /** Fait échouer la nième création d'application (à partir de 1) avec un 422. */
  failCreateAt?: number
  /** Fait échouer l'ajout de la variable portant ce nom avec un 422. */
  failEnvKey?: string
  /** Fait échouer tous les déploiements de l'application portant ce nom. */
  failDeployFor?: string
  /** Simule un Coolify éteint. */
  down?: boolean
}

export function fakeCoolify(options: FakeCoolifyOptions = {}) {
  const token = options.token ?? 'tok_test'
  const apps = new Map<string, FakeApp>()
  const deployments = new Map<string, string>() // deployment uuid -> app uuid
  const calls: FakeCall[] = []
  let created = 0

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (options.down) throw new TypeError('fetch failed')
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url)
    const method = (init?.method ?? 'GET').toUpperCase()
    const headers = (init?.headers ?? {}) as Record<string, string>
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null
    const path = url.pathname.replace(/^.*\/api\/v1/, '')
    calls.push({ method, path, search: url.search, authorization: headers.Authorization ?? null, body })

    if (headers.Authorization !== `Bearer ${token}`) return json({ message: 'Unauthenticated.' }, 401)

    if (method === 'GET' && path === '/health') return new Response('OK', { status: 200, headers: { 'content-type': 'text/html' } })

    if (method === 'POST' && path === '/applications/public') {
      created += 1
      if (!validateApp(body)) {
        const errors: Record<string, string[]> = {}
        for (const e of validateApp.errors ?? []) {
          const field = e.instancePath.replace(/^\//, '') || String(e.params.additionalProperty ?? e.params.missingProperty ?? 'body')
          ;(errors[field] ??= []).push(e.keyword === 'additionalProperties' ? 'This field is not allowed.' : e.message ?? 'invalid')
        }
        return json({ message: 'Validation failed.', errors }, 422)
      }
      if (options.failCreateAt === created) return json({ message: 'Validation failed.', errors: { domains: ['Domain already in use.'] } }, 422)
      const uuid = `app${String(created).padStart(5, '0')}`
      apps.set(uuid, { uuid, payload: body!, envs: [], deployments: [], deleted: false })
      return json({ uuid }, 201)
    }

    let m = /^\/applications\/([^/]+)\/envs$/.exec(path)
    if (method === 'POST' && m) {
      const app = apps.get(m[1]!)
      if (!app || app.deleted) return json({ message: 'Application not found.' }, 404)
      if (!validateEnv(body)) return json({ message: 'Validation failed.', errors: { env: ['invalid'] } }, 422)
      if (body!.key === options.failEnvKey) return json({ message: 'Validation failed.', errors: { key: ['Invalid key.'] } }, 422)
      if (app.envs.some((e) => e.key === body!.key)) return json({ message: 'Environment variable already exists. Use PATCH request to update it.' }, 409)
      app.envs.push(body!)
      return json({ uuid: `env_${app.envs.length}` }, 201)
    }

    if (method === 'POST' && path === '/deploy') {
      const uuid = url.searchParams.get('uuid') ?? ''
      const app = apps.get(uuid)
      if (!app || app.deleted) return json({ message: 'No resources found.' }, 404)
      if (options.failDeployFor && app.payload.name === options.failDeployFor) {
        return json({ message: 'Deployment request queued.', deployments: [{ message: 'Application is not ready.', resource_uuid: uuid }] }, 200)
      }
      const deploymentUuid = `dep${String(deployments.size + 1).padStart(5, '0')}`
      deployments.set(deploymentUuid, uuid)
      app.deployments.push(deploymentUuid)
      return json({ message: 'Deployment request queued.', deployments: [{ message: 'queued', resource_uuid: uuid, deployment_uuid: deploymentUuid }] })
    }

    m = /^\/deployments\/([^/]+)$/.exec(path)
    if (method === 'GET' && m) {
      if (!deployments.has(m[1]!)) return json({ message: 'Deployment not found.' }, 404)
      return json({
        deployment_uuid: m[1],
        status: options.deploymentStatus ?? 'in_progress',
        commit: options.deploymentCommit ?? 'HEAD',
        ...(options.deploymentLogs !== undefined ? { logs: options.deploymentLogs } : {}),
      })
    }

    m = /^\/applications\/([^/]+)$/.exec(path)
    if (method === 'DELETE' && m) {
      const app = apps.get(m[1]!)
      if (!app || app.deleted) return json({ message: 'Application not found.' }, 404)
      app.deleted = true
      return json({ message: 'Application deletion request queued.' })
    }

    return json({ message: 'Not found.' }, 404)
  }) as typeof fetch

  return { fetch: fetchImpl, apps, calls, deployments }
}
