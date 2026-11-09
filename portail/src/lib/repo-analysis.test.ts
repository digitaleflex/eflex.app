import { describe, expect, it } from 'vitest'
import { AnalysisError, analyzeGitHubRepo } from '@/lib/repo-analysis'
import { fakeGitHub, fakeSha } from '@/lib/test-support/fake-github'

const json = (value: unknown) => JSON.stringify(value)
const ref = (owner = 'acme', repo = 'app', branch: string | null = null) => ({ owner, repo, branch })

const nextApp = {
  'package.json': json({
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0', react: '18.3.0' },
  }),
  'pnpm-lock.yaml': 'lockfileVersion: 9\n',
  'next.config.js': 'module.exports = {}\n',
  'README.md': '# app\n'.repeat(50),
  'src/app/page.tsx': 'export default function Page() { return null }\n',
}

const laravelWithVite = {
  'artisan': '#!/usr/bin/env php\n',
  'composer.json': json({ require: { php: '^8.3', 'laravel/framework': '^11.0' } }),
  'composer.lock': '{}',
  'public/index.php': '<?php\n',
  'package.json': json({
    scripts: { dev: 'vite', build: 'vite build' },
    devDependencies: { vite: '^5.0.0', 'laravel-vite-plugin': '^1.0.0' },
  }),
  'package-lock.json': '{}',
  'vite.config.js': 'export default {}\n',
  'routes/console.php': '<?php\n',
}

const monorepo = {
  'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n',
  'apps/web/package.json': json({
    scripts: { build: 'next build', start: 'next start' },
    dependencies: { next: '14.2.0' },
  }),
  'apps/api/package.json': json({ scripts: { start: 'node server.js' }, dependencies: { express: '^4.19.0' } }),
  'apps/api/server.js': 'console.log("api")\n',
}

describe('dépôts privés (issue 07)', () => {
  it('analyse un dépôt privé avec un jeton d’installation via l’API Contents', async () => {
    const gh = fakeGitHub({ 'acme/private': { files: nextApp, private: true } })
    const analysis = await analyzeGitHubRepo(ref('acme', 'private'), {
      fetchImpl: gh.fetch,
      installationToken: 'ghs_test',
    })

    expect(analysis.detection.framework).toBe('nextjs')
    const apiCalls = gh.calls.filter((c) => c.host === 'api.github.com')
    expect(apiCalls.some((c) => c.url.includes('/contents/'))).toBe(true)
    expect(apiCalls.every((c) => c.headers.Authorization === 'Bearer ghs_test')).toBe(true)
    // Le jeton ne doit jamais être envoyé au CDN public.
    expect(gh.calls.some((c) => c.host === 'raw.githubusercontent.com')).toBe(false)
  })

  it('refuse un dépôt privé sans jeton d’installation', async () => {
    const gh = fakeGitHub({ 'acme/private': { files: nextApp, private: true } })
    await expect(analyzeGitHubRepo(ref('acme', 'private'), { fetchImpl: gh.fetch })).rejects.toMatchObject({
      status: 422,
      message: expect.stringContaining('privé'),
    })
  })
})

describe('analyzeGitHubRepo', () => {
  it('détecte une application Next.js et épingle le commit', async () => {
    const gh = fakeGitHub({ 'acme/app': { files: nextApp } })
    const analysis = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })

    expect(analysis.detection.framework).toBe('nextjs')
    expect(analysis.detection.plan?.port).toBe(3000)
    expect(analysis.repo).toMatchObject({
      owner: 'acme',
      repo: 'app',
      url: 'https://github.com/acme/app',
      branch: 'main',
      defaultBranch: 'main',
      commitSha: fakeSha('acme/app@main'),
    })
    expect(analysis.incomplete).toBe(false)
  })

  it('ne télécharge que les fichiers que le détecteur demande', async () => {
    const gh = fakeGitHub({ 'acme/app': { files: nextApp } })
    await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })

    const raw = gh.calls.filter((c) => c.host === 'raw.githubusercontent.com').map((c) => new URL(c.url).pathname.split('/').slice(4).join('/'))
    expect(raw).toContain('package.json')
    expect(raw).not.toContain('README.md')
    expect(raw).not.toContain('src/app/page.tsx')
    expect(new Set(raw).size).toBe(raw.length) // aucun fichier téléchargé deux fois
  })

  it('fait seulement trois appels à api.github.com', async () => {
    const gh = fakeGitHub({ 'acme/app': { files: nextApp } })
    await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })
    expect(gh.calls.filter((c) => c.host === 'api.github.com')).toHaveLength(3)
  })

  it('reconnaît Laravel même quand Vite compile les assets (non-régression)', async () => {
    const gh = fakeGitHub({ 'acme/app': { files: laravelWithVite } })
    const { detection } = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })

    expect(detection.framework).toBe('laravel')
    expect(Object.keys(detection.plan?.services ?? {})).toEqual(expect.arrayContaining(['app', 'web']))
    expect(detection.alternatives.map((p) => p.framework)).toContain('vite')
  })

  it('utilise la branche par défaut du dépôt quand aucune n’est donnée', async () => {
    const gh = fakeGitHub({ 'acme/app': { files: nextApp, defaultBranch: 'master' } })
    const { repo } = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })
    expect(repo.branch).toBe('master')
    expect(repo.commitSha).toBe(fakeSha('acme/app@master'))
  })

  it('accepte une branche avec des « / »', async () => {
    const gh = fakeGitHub({ 'acme/app': { files: nextApp, branches: ['main', 'feature/login'] } })
    const { repo } = await analyzeGitHubRepo(ref('acme', 'app', 'feature/login'), { fetchImpl: gh.fetch })
    expect(repo.branch).toBe('feature/login')
    expect(repo.commitSha).toBe(fakeSha('acme/app@feature/login'))
  })

  it('analyse le commit demandé sans résoudre la branche', async () => {
    const sha = fakeSha('un-commit-precis')
    const gh = fakeGitHub({ 'acme/app': { files: nextApp } })
    const { repo } = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch, commitSha: sha })

    expect(repo.commitSha).toBe(sha)
    expect(gh.calls.some((c) => c.url.includes('/git/ref/'))).toBe(false)
    expect(gh.calls.filter((c) => c.host === 'raw.githubusercontent.com').every((c) => c.url.includes(`/${sha}/`))).toBe(true)
  })

  describe('monorepo', () => {
    it('pose la question de l’application à déployer', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: monorepo } })
      const { detection } = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })

      expect(detection.plan).toBeNull()
      expect(detection.questions[0]?.options).toEqual(['apps/api', 'apps/web'])
    })

    it('analyse l’application choisie', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: monorepo } })
      const { detection } = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch, root: 'apps/web' })

      expect(detection.framework).toBe('nextjs')
      expect(detection.plan?.root).toBe('apps/web')
    })

    it('refuse un dossier qui n’est pas une application du dépôt', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: monorepo } })
      const { detection } = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch, root: 'apps/ghost' })
      expect(detection.plan).toBeNull()
    })
  })

  describe('erreurs', () => {
    const fail = (promise: Promise<unknown>) => promise.then(() => null, (e: unknown) => e as AnalysisError)

    it('dépôt introuvable', async () => {
      const gh = fakeGitHub({})
      const err = await fail(analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch }))
      expect(err).toBeInstanceOf(AnalysisError)
      expect(err?.status).toBe(404)
      expect(err?.message).toMatch(/introuvable/i)
    })

    it('dépôt privé : refusé, sans lire l’arborescence ni les fichiers', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: nextApp, private: true } })
      const err = await fail(analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch, token: 'ghp_secret' }))

      expect(err?.status).toBe(422)
      expect(err?.message).toMatch(/privé/i)
      expect(gh.calls).toHaveLength(1)
    })

    it('branche introuvable', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: nextApp } })
      const err = await fail(analyzeGitHubRepo(ref('acme', 'app', 'nope'), { fetchImpl: gh.fetch }))
      expect(err?.status).toBe(404)
      expect(err?.message).toContain('nope')
    })

    it('limite de requêtes GitHub : indique le temps d’attente', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: nextApp } }, { rateLimited: true })
      const err = await fail(analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch }))
      expect(err?.status).toBe(429)
      expect(err?.message).toMatch(/dans environ 1[12] minutes/)
    })

    it('GitHub injoignable', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: nextApp } }, { failHost: 'api.github.com' })
      const err = await fail(analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch }))
      expect(err?.status).toBe(502)
    })

    it('identifiant de commit invalide', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: nextApp } })
      const err = await fail(analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch, commitSha: '../../etc/passwd' }))
      expect(err?.status).toBe(400)
    })

    it('dépôt sans fichier analysable', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: { 'node_modules/x/package.json': '{}' } } })
      const err = await fail(analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch }))
      expect(err?.status).toBe(422)
    })
  })

  describe('sécurité', () => {
    it('n’envoie le jeton qu’à api.github.com, jamais à raw.githubusercontent.com', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: nextApp } })
      await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch, token: 'ghp_secret' })

      const api = gh.calls.filter((c) => c.host === 'api.github.com')
      const raw = gh.calls.filter((c) => c.host === 'raw.githubusercontent.com')
      expect(api.length).toBeGreaterThan(0)
      expect(raw.length).toBeGreaterThan(0)
      expect(api.every((c) => c.headers.Authorization === 'Bearer ghp_secret')).toBe(true)
      expect(raw.every((c) => c.headers.Authorization === undefined)).toBe(true)
    })

    it('ne contacte que les deux hôtes GitHub prévus', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: laravelWithVite } })
      await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })
      expect(new Set(gh.calls.map((c) => c.host))).toEqual(new Set(['api.github.com', 'raw.githubusercontent.com']))
    })

    it('ignore les chemins contenant « .. » dans l’arborescence', async () => {
      const gh = fakeGitHub({
        'acme/app': { files: nextApp, extraTreePaths: ['../../etc/passwd', 'a/../../b/package.json', './package.json'] },
      })
      await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })
      expect(gh.calls.some((c) => c.url.includes('passwd') || c.url.includes('..'))).toBe(false)
    })

    it('n’envoie pas au serveur de composants d’URL non encodés', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: { ...nextApp, 'docs/a b#c?d.md': 'x' } } })
      await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })
      for (const call of gh.calls) expect(new URL(call.url).search === '' || call.url.includes('?recursive=1')).toBe(true)
    })

    it('ne télécharge pas un fichier trop volumineux', async () => {
      // package.json est ici le seul indice : s'il n'est pas lu, la stack n'est pas reconnue.
      const files = { 'package.json': nextApp['package.json'], 'pnpm-lock.yaml': nextApp['pnpm-lock.yaml'] }
      const gh = fakeGitHub({ 'acme/app': { files, sizes: { 'package.json': 5 * 1024 * 1024 } } })
      const { detection } = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })

      expect(gh.calls.some((c) => c.url.endsWith('/package.json'))).toBe(false)
      expect(detection.framework).not.toBe('nextjs')

      // Contre-épreuve : même dépôt avec un package.json de taille normale.
      const ok = fakeGitHub({ 'acme/app': { files } })
      expect((await analyzeGitHubRepo(ref(), { fetchImpl: ok.fetch })).detection.framework).toBe('nextjs')
    })
  })

  describe('limites', () => {
    it('signale une arborescence tronquée par GitHub', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: nextApp, truncated: true } })
      const analysis = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })

      expect(analysis.incomplete).toBe(true)
      expect(analysis.detection.warnings.join(' ')).toMatch(/volumineux/)
    })

    it('plafonne le nombre de fichiers téléchargés', async () => {
      const files: Record<string, string> = { 'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n' }
      for (let i = 0; i < 30; i += 1) files[`apps/app${i}/package.json`] = json({ dependencies: { express: '^4' } })
      const gh = fakeGitHub({ 'acme/app': { files } })

      const analysis = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch, limits: { maxFilesRead: 10 } })
      expect(gh.calls.filter((c) => c.host === 'raw.githubusercontent.com').length).toBeLessThanOrEqual(10)
      expect(analysis.incomplete).toBe(true)
    })

    it('signale les fichiers illisibles (erreur réseau sur raw.githubusercontent.com)', async () => {
      const gh = fakeGitHub({ 'acme/app': { files: nextApp } }, { failHost: 'raw.githubusercontent.com' })
      const analysis = await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })

      expect(analysis.incomplete).toBe(true)
      expect(analysis.detection.warnings.join(' ')).toMatch(/n'ont pas pu être lus/)
    })
  })

  it('donne le même résultat que le détecteur sur le dépôt complet (déterminisme)', async () => {
    const { detect } = await import('@eflex/detector')
    const gh = fakeGitHub({ 'acme/app': { files: laravelWithVite } })
    const viaNetwork = (await analyzeGitHubRepo(ref(), { fetchImpl: gh.fetch })).detection

    const direct = detect({ files: Object.keys(laravelWithVite), read: (p) => (laravelWithVite as Record<string, string>)[p] ?? null })
    expect(viaNetwork).toEqual(direct)
  })
})
