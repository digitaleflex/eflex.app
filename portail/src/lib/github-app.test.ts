import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createDeployKey,
  deleteDeployKey,
  exchangeUserCode,
  fetchUserForToken,
  getInstallationToken,
  githubAppJwt,
  installationExists,
  installationUrl,
  listInstallationRepositories,
  verifyGitHubWebhook,
} from './github-app'

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
})

const saved = {
  appId: process.env.GITHUB_APP_ID,
  key: process.env.GITHUB_APP_PRIVATE_KEY,
  slug: process.env.GITHUB_APP_SLUG,
  clientId: process.env.GITHUB_APP_CLIENT_ID,
  clientSecret: process.env.GITHUB_APP_CLIENT_SECRET,
}

beforeEach(() => {
  process.env.GITHUB_APP_ID = '123456'
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey
  delete process.env.GITHUB_APP_SLUG
  delete process.env.GITHUB_APP_CLIENT_ID
  delete process.env.GITHUB_APP_CLIENT_SECRET
})

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('githubAppJwt', () => {
  it('produit un JWT RS256 signé et vérifiable', async () => {
    const jwt = await githubAppJwt()
    const [header, payload, signature] = jwt.split('.')
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    expect(claims.iss).toBe('123456')
    expect(claims.exp - claims.iat).toBe(600)
    const verify = createVerify('RSA-SHA256').update(`${header}.${payload}`)
    expect(verify.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
  })

  it('accepte une clé PEM avec des \\n échappés', async () => {
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n')
    expect((await githubAppJwt()).split('.')).toHaveLength(3)
  })

  it('échoue explicitement sans configuration', async () => {
    delete process.env.GITHUB_APP_ID
    await expect(githubAppJwt()).rejects.toThrow(/GITHUB_APP_ID/)
  })
})

describe('verifyGitHubWebhook', () => {
  const body = '{"action":"push"}'
  const good = `sha256=${createHmac('sha256', 'secret').update(body).digest('hex')}`

  it('accepte la signature calculée avec la clé', () => {
    expect(verifyGitHubWebhook(body, good, 'secret')).toBe(true)
  })

  it('refuse une signature modifiée, absente ou malformée', () => {
    expect(verifyGitHubWebhook(body, good.slice(0, -1) + '0', 'secret')).toBe(false)
    expect(verifyGitHubWebhook(body, null, 'secret')).toBe(false)
    expect(verifyGitHubWebhook(body, 'sha1=abc', 'secret')).toBe(false)
    expect(verifyGitHubWebhook(body, good, 'autre-secret')).toBe(false)
    expect(verifyGitHubWebhook(body, good, '')).toBe(false)
  })
})

describe('installationUrl', () => {
  it('est null sans slug, correct sinon', async () => {
    expect(await installationUrl()).toBeNull()
    process.env.GITHUB_APP_SLUG = 'eflex-app'
    expect(await installationUrl()).toBe('https://github.com/apps/eflex-app/installations/new')
  })
})

describe('appels API (fetch simulé)', () => {
  it('récupère un jeton d’installation', async () => {
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ token: 'ghs_test' }) })) as unknown as typeof fetch
    expect(await getInstallationToken('42', fetchImpl)).toBe('ghs_test')
  })

  it('refuse un identifiant d’installation non numérique', async () => {
    await expect(getInstallationToken('abc')).rejects.toThrow(/invalide/)
  })

  it('vérifie l’existence d’une installation', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ account: { login: 'acme' }, created_at: '2026-11-09T10:00:00Z' }),
    })) as unknown as typeof fetch
    const installation = await installationExists('42', fetchImpl)
    expect(installation?.login).toBe('acme')
    expect(installation?.createdAt?.toISOString()).toBe('2026-11-09T10:00:00.000Z')
    const ko = (async () => ({ ok: false })) as unknown as typeof fetch
    expect(await installationExists('42', ko)).toBeNull()
  })

  it('liste et trie les dépôts accessibles', async () => {
    let calls = 0
    const fetchImpl = (async () => {
      calls += 1
      if (calls === 1) return { ok: true, json: async () => ({ token: 'ghs_test' }) }
      return {
        ok: true,
        json: async () => ({
          repositories: [
            { id: 2, name: 'zeta', full_name: 'acme/zeta', private: true, default_branch: 'main', html_url: 'https://github.com/acme/zeta' },
            { id: 1, name: 'alpha', full_name: 'acme/alpha', private: false, default_branch: 'dev', html_url: 'https://github.com/acme/alpha' },
            { id: 3, name: 'sans-nom', private: false },
          ],
        }),
      }
    }) as unknown as typeof fetch
    const repos = await listInstallationRepositories('42', fetchImpl)
    expect(repos.map((r) => r.fullName)).toEqual(['acme/alpha', 'acme/zeta'])
    expect(repos[0].defaultBranch).toBe('dev')
    expect(repos[1].private).toBe(true)
  })

  it('valide un jeton personnel et lit les portées', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      json: async () => ({ login: 'octocat' }),
      headers: { get: () => 'repo, read:org' },
    })) as unknown as typeof fetch
    const user = await fetchUserForToken('ghp_test', fetchImpl)
    expect(user).toEqual({ login: 'octocat', scopes: 'repo, read:org' })
  })

  it('crée puis supprime une deploy key', async () => {
    let method = ''
    let body = ''
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      method = String(init.method)
      body = String(init.body ?? '')
      return { ok: true, status: 200, json: async () => ({ id: 77 }) }
    }) as unknown as typeof fetch
    expect(await createDeployKey('ghs_test', 'acme', 'zeta', 'ssh-rsa AAAA eflex', 'eflex-zeta', fetchImpl)).toBe(77)
    expect(method).toBe('POST')
    expect(JSON.parse(body)).toMatchObject({ key: 'ssh-rsa AAAA eflex', read_only: true })

    const deleted = (async () => ({ ok: true, status: 204 })) as unknown as typeof fetch
    await expect(deleteDeployKey('ghs_test', 'acme', 'zeta', 77, deleted)).resolves.toBeUndefined()
  })

  it('refuse une deploy key quand le jeton n’a pas la permission administration', async () => {
    const fetchImpl = (async () => ({ ok: false, status: 403 })) as unknown as typeof fetch
    await expect(createDeployKey('ghp_test', 'acme', 'zeta', 'ssh-rsa AAAA', 'eflex', fetchImpl)).rejects.toThrow(/Administration/)
  })

  it('échange un code OAuth avec un corps formulaire URL-encodé', async () => {
    process.env.GITHUB_APP_CLIENT_ID = 'client-id'
    process.env.GITHUB_APP_CLIENT_SECRET = 'client-secret'
    let captured: { url: string; init?: RequestInit } | undefined
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      captured = { url, init }
      return { ok: true, json: async () => ({ access_token: 'ghu_test' }) }
    })
    try {
      await expect(exchangeUserCode('code-123', 'https://eflex.app/api/github/oauth/callback')).resolves.toBe('ghu_test')
    } finally {
      vi.unstubAllGlobals()
    }
    expect(captured?.url).toBe('https://github.com/login/oauth/access_token')
    expect(captured?.init?.headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' })
    const body = String(captured?.init?.body)
    expect(body).toContain('client_id=client-id')
    expect(body).toContain('redirect_uri=https%3A%2F%2Feflex.app%2Fapi%2Fgithub%2Foauth%2Fcallback')
  })
})
