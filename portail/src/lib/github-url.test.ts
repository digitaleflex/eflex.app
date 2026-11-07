import { describe, expect, it } from 'vitest'
import { canonicalRepoUrl, isValidBranch, parseGitHubUrl } from '@/lib/github-url'

describe('parseGitHubUrl', () => {
  it.each([
    ['https://github.com/laravel/laravel', 'laravel', 'laravel', null],
    ['https://github.com/laravel/laravel/', 'laravel', 'laravel', null],
    ['https://github.com/laravel/laravel.git', 'laravel', 'laravel', null],
    ['http://github.com/laravel/laravel', 'laravel', 'laravel', null],
    ['https://www.github.com/laravel/laravel', 'laravel', 'laravel', null],
    ['github.com/laravel/laravel', 'laravel', 'laravel', null],
    ['  https://github.com/laravel/laravel  ', 'laravel', 'laravel', null],
    ['git@github.com:laravel/laravel.git', 'laravel', 'laravel', null],
    ['https://github.com/laravel/laravel?tab=readme#install', 'laravel', 'laravel', null],
    ['https://github.com/vercel/next.js', 'vercel', 'next.js', null],
    ['https://github.com/org/my_repo-2.0', 'org', 'my_repo-2.0', null],
    ['https://github.com/o/r/tree/develop', 'o', 'r', 'develop'],
    ['https://github.com/o/r/tree/develop/apps/web', 'o', 'r', 'develop'],
    ['https://github.com/o/r/tree/v1.2.3', 'o', 'r', 'v1.2.3'],
  ])('accepte %s', (input, owner, repo, branch) => {
    expect(parseGitHubUrl(input)).toEqual({ owner, repo, branch })
  })

  it.each([
    '',
    '   ',
    'laravel/laravel',
    'https://gitlab.com/laravel/laravel',
    'https://github.com.evil.example/laravel/laravel',
    'https://evil.example/github.com/laravel/laravel',
    'https://github.com@evil.example/laravel/laravel',
    'https://user:pass@github.com/laravel/laravel',
    'https://github.com:8443/laravel/laravel',
    'ftp://github.com/laravel/laravel',
    'javascript:alert(1)',
    'https://github.com/laravel',
    'https://github.com/',
    'https://github.com/laravel/..',
    'https://github.com/-bad/repo',
    'https://github.com/bad-/repo',
    'https://github.com/own er/repo',
    'https://github.com/o/r%00',
    `https://github.com/o/${'r'.repeat(101)}`,
    `https://github.com/${'o'.repeat(40)}/r`,
    `https://github.com/o/r/${'x'.repeat(400)}`,
    'git@github.com:../etc/passwd',
    'git@gitlab.com:o/r.git',
  ])('refuse %j', (input) => {
    expect(parseGitHubUrl(input)).toBeNull()
  })

  it('ignore une branche invalide lue dans /tree/', () => {
    expect(parseGitHubUrl('https://github.com/o/r/tree/..%2F..')).toEqual({ owner: 'o', repo: 'r', branch: null })
  })
})

describe('isValidBranch', () => {
  it.each(['main', 'master', 'develop', 'feature/login', 'release-1.2', 'v1.0.0', 'fix_bug.2'])('accepte %s', (b) => {
    expect(isValidBranch(b)).toBe(true)
  })

  it.each(['', '-rf', '/main', 'main/', 'a..b', 'a//b', 'a/.hidden', 'x.lock', 'x.', 'a b', 'a;b', 'a$(id)', 'a\nb', 'é', 'x'.repeat(201)])(
    'refuse %j',
    (b) => {
      expect(isValidBranch(b)).toBe(false)
    },
  )
})

describe('canonicalRepoUrl', () => {
  it('reconstruit une URL normalisée', () => {
    expect(canonicalRepoUrl({ owner: 'laravel', repo: 'laravel' })).toBe('https://github.com/laravel/laravel')
  })
})
