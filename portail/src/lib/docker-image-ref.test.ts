import { describe, expect, it } from 'vitest'
import { isPublicRegistryHost, isValidDockerImageRef } from '@/lib/docker-image-ref'

describe('isValidDockerImageRef', () => {
  it('accepte les images du Docker Hub et des registres publics', () => {
    for (const ok of [
      'nginx',
      'nginx:1.27',
      'library/postgres:16-alpine',
      'org/app:1.2.3',
      'ghcr.io/org/app:1.2.3',
      'registry.gitlab.com/groupe/projet/app:latest',
      'quay.io:443/org/app@sha256:' + 'a'.repeat(64),
      'app@sha256:' + 'b'.repeat(64),
    ]) {
      expect(isValidDockerImageRef(ok), ok).toBe(true)
    }
  })

  it('refuse les caractères shell, espaces et formes ambiguës', () => {
    for (const bad of ['', 'nginx latest', 'nginx;id', 'nginx$(id)', 'a`b', 'nginx:', 'NGINX', 'a@sha256:xyz', 'ghcr.io/', '../x']) {
      expect(isValidDockerImageRef(bad), bad).toBe(false)
    }
  })

  it('refuse les registres internes : localhost, noms sans point, adresses IP, suffixes internes', () => {
    for (const bad of [
      'localhost/app',
      'localhost:5000/tenant-b/app:1',
      'registry:5000/tenant-b/app',
      '127.0.0.1:5000/app',
      '10.0.0.5/app',
      '169.254.169.254/app',
      'registry.internal/tenant-b/app',
      'zot.local:5000/app',
      'build.lan/app',
    ]) {
      expect(isValidDockerImageRef(bad), bad).toBe(false)
    }
  })
})

describe('isPublicRegistryHost', () => {
  it('distingue hôte public et interne', () => {
    expect(isPublicRegistryHost('ghcr.io')).toBe(true)
    expect(isPublicRegistryHost('quay.io:443')).toBe(true)
    expect(isPublicRegistryHost('localhost')).toBe(false)
    expect(isPublicRegistryHost('registry')).toBe(false)
    expect(isPublicRegistryHost('192.168.1.10:5000')).toBe(false)
    expect(isPublicRegistryHost('mon-registre.corp')).toBe(false)
  })
})
