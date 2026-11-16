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

describe('inspectCompose : contournements bloqués (audit de sécurité 2026-11)', () => {
  const refused = (yaml: string, hosts?: string[]) => {
    const result = inspectCompose(yaml, hosts)
    expect(result.ok).toBe(false)
    return result.ok ? '' : result.error
  }

  it('refuse un volume dont le pilote monte la racine de l’hôte', () => {
    const error = refused(`services:
  web:
    image: nginx
    volumes: ['racine:/host']
volumes:
  racine:
    driver: local
    driver_opts: { type: none, o: bind, device: / }
`)
    expect(error).toContain('driver_opts')
  })

  it.each([
    ['cap_add', 'cap_add: [SYS_ADMIN]'],
    ['devices', 'devices: ["/dev/sda:/dev/sda"]'],
    ['security_opt', 'security_opt: ["apparmor:unconfined"]'],
    ['volumes_from', 'volumes_from: ["autre-conteneur"]'],
    ['pid', 'pid: host'],
    ['ipc', 'ipc: "container:base-d-un-autre-client"'],
    ['userns_mode', 'userns_mode: host'],
    ['network_mode', 'network_mode: "container:base-d-un-autre-client"'],
  ])('refuse %s', (key, clause) => {
    expect(refused(`services:\n  web:\n    image: nginx\n    ${clause}\n`)).toContain(key)
  })

  it('refuse les volumes et réseaux externes, sauf le réseau du proxy', () => {
    expect(refused('services:\n  web:\n    image: nginx\nvolumes:\n  data:\n    external: true\n')).toContain('externe')
    expect(refused('services:\n  web:\n    image: nginx\nvolumes:\n  data:\n    name: volume-d-un-autre-projet\n')).toContain('name')
    expect(refused('services:\n  web:\n    image: nginx\nnetworks:\n  interne:\n    external: true\n    name: coolify\n')).toContain('coolify')
    const ok = inspectCompose('services:\n  web:\n    image: nginx\n    networks: [proxy]\nnetworks:\n  proxy:\n    external: true\n')
    expect(ok.ok).toBe(true)
  })

  it('refuse include et extends.file, qui chargeraient un fichier non vérifié', () => {
    expect(refused('include:\n  - autre.yml\nservices:\n  web:\n    image: nginx\n')).toContain('include')
    expect(refused('services:\n  web:\n    extends:\n      file: autre.yml\n      service: x\n')).toContain('extends')
  })

  it('borne les routeurs Traefik aux domaines du projet', () => {
    const compose = (rule: string) => `services:\n  web:\n    image: nginx\n    labels:\n      - "traefik.http.routers.web.rule=${rule}"\n`
    const hosts = ['boutique.eflex.app', 'boutique.fr']
    expect(inspectCompose(compose('Host(`boutique.eflex.app`) || Host(`boutique.fr`)'), hosts).ok).toBe(true)
    expect(refused(compose('Host(`eflex.app`)'), hosts)).toContain('eflex.app')
    expect(refused(compose('Host(`blog-d-un-autre-client.eflex.app`)'), hosts)).toContain('n’appartient pas')
    expect(refused(compose('PathPrefix(`/`)'), hosts)).toContain('Host(...)')
    expect(refused(compose('HostRegexp(`.+`)'), hosts)).toContain('Host(...)')
  })

  it('refuse les labels Traefik TCP/UDP, les plugins et les labels réservés à Coolify', () => {
    const compose = (label: string) => `services:\n  web:\n    image: nginx\n    labels:\n      ${label}\n`
    expect(refused(compose('traefik.tcp.routers.x.rule: "HostSNI(`*`)"'), [])).toContain('TCP/UDP')
    expect(refused(compose('traefik.http.middlewares.x.plugin.evil.a: "1"'), [])).toContain('plugin')
    expect(refused(compose('coolify.applicationId: "42"'), [])).toContain('réservé')
  })
})
