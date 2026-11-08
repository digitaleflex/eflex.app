import { createHmac, createVerify, generateKeyPairSync } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
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
}

beforeEach(() => {
  process.env.GITHUB_APP_ID = '123456'
  process.env.GITHUB_APP_PRIVATE_KEY = privateKey
  delete process.env.GITHUB_APP_SLUG
})

afterEach(() => {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe('githubAppJwt', () => {
  it('produit un JWT RS256 signé et vérifiable', () => {
    const jwt = githubAppJwt()
    const [header, payload, signature] = jwt.split('.')
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString())
    expect(claims.iss).toBe('123456')
    expect(claims.exp - claims.iat).toBe(600)
    const verify = createVerify('RSA-SHA256').update(`${header}.${payload}`)
    expect(verify.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
  })

  it('accepte une clé PEM avec des \\n échappés', () => {
    process.env.GITHUB_APP_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n')
    expect(githubAppJwt().split('.')).toHaveLength(3)
  })

  it('échoue explicitement sans configuration', () => {
    delete process.env.GITHUB_APP_ID
    expect(() => githubAppJwt()).toThrow(/GITHUB_APP_ID/)
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
  it('est null sans slug, correct sinon', () => {
    expect(installationUrl()).toBeNull()
    process.env.GITHUB_APP_SLUG = 'eflex-app'
    expect(installationUrl()).toBe('https://github.com/apps/eflex-app/installations/new')
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
    const fetchImpl = (async () => ({ ok: true, json: async () => ({ account: { login: 'acme' } }) })) as unknown as typeof fetch
    expect(await installationExists('42', fetchImpl)).toBe('acme')
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
})
