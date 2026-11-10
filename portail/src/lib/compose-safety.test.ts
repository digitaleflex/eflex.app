import { describe, expect, it } from 'vitest'
import { inspectCompose } from './compose-safety'

const validCompose = `
services:
  app:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./storage:/app/storage
  web:
    image: nginx:1.27-alpine
    ports:
      - "80:80"
    labels:
      - "traefik.http.routers.demo.entrypoints=websecure"
  queue:
    build: .
    command: php artisan queue:work
`

describe('inspectCompose', () => {
  it('décrit les services et choisit le service au port HTTP', () => {
    const result = inspectCompose(validCompose)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.services).toEqual(['app', 'web', 'queue'])
    expect(result.primaryService).toBe('web')
    expect(result.ports.web).toEqual([80])
    expect(result.warnings).toEqual([])
  })

  it('avertit quand le compose ne déclare pas de labels websecure', () => {
    const result = inspectCompose('services:\n  app:\n    image: nginx\n    ports: ["80:80"]\n')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.warnings.join(' ')).toContain('websecure')
  })

  it('refuse privileged: true', () => {
    const result = inspectCompose('services:\n  app:\n    privileged: true\n    image: nginx\n')

    expect(result).toEqual({
      ok: false,
      error: expect.stringContaining('privileged: true'),
    })
  })

  it('refuse network_mode: host', () => {
    const result = inspectCompose('services:\n  app:\n    network_mode: host\n    image: nginx\n')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('network_mode: host')
  })

  it('refuse le montage de la socket Docker', () => {
    const result = inspectCompose(
      'services:\n  app:\n    image: nginx\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n',
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('socket Docker')
  })

  it('refuse un montage absolu de l’hôte (syntaxe courte)', () => {
    const result = inspectCompose(
      'services:\n  app:\n    image: nginx\n    volumes:\n      - /etc/passwd:/data/passwd:ro\n',
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('/etc/passwd')
  })

  it('refuse une remontée relative hors du dépôt', () => {
    const result = inspectCompose(
      'services:\n  app:\n    image: nginx\n    volumes:\n      - ../etc:/data/etc\n',
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('../etc')
  })

  it('refuse un montage absolu de l’hôte (syntaxe longue)', () => {
    const result = inspectCompose(
      [
        'services:',
        '  app:',
        '    image: nginx',
        '    volumes:',
        '      - type: bind',
        '        source: /home/app',
        '        target: /data',
        '',
      ].join('\n'),
    )

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('/home/app')
  })

  it('accepte un bind relatif au dépôt', () => {
    const result = inspectCompose(
      [
        'services:',
        '  app:',
        '    image: nginx',
        '    ports: ["80:80"]',
        '    labels:',
        '      - "traefik.http.routers.x.entrypoints=websecure"',
        '    volumes:',
        '      - ./data:/data',
        '',
      ].join('\n'),
    )

    expect(result.ok).toBe(true)
  })

  it('refuse un YAML invalide sans recopier son contenu', () => {
    const result = inspectCompose('services: [unclosed\npassword: supersecret\n')

    expect(result).toEqual({
      ok: false,
      error: 'Le fichier compose n’est pas un YAML valide.',
    })
  })

  it('refuse un compose sans service', () => {
    const result = inspectCompose('services: {}\n')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toContain('aucun service')
  })
})
