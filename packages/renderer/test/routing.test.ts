import { describe, expect, it } from 'vitest'
import { traefikLabels } from '../src/routing.js'

describe('traefikLabels', () => {
  it('route le domaine en HTTPS avec le résolveur Let’s Encrypt de l’hôte', () => {
    const labels = traefikLabels('blog', 'app', 'blog.eflex.app', 3000, 'proxy')

    expect(labels).toContain('traefik.enable=true')
    expect(labels).toContain('traefik.docker.network=proxy')
    expect(labels).toContain('traefik.http.routers.blog-app.rule=Host(`blog.eflex.app`)')
    expect(labels).toContain('traefik.http.routers.blog-app.entrypoints=websecure')
    expect(labels).toContain('traefik.http.routers.blog-app.tls=true')
    expect(labels).toContain('traefik.http.routers.blog-app.tls.certresolver=letsencrypt')
    expect(labels).toContain('traefik.http.services.blog-app.loadbalancer.server.port=3000')
  })

  it('permet de remplacer entrypoint et résolveur si le proxy change', () => {
    const labels = traefikLabels('site', 'web', 'site.eflex.app', 80, 'proxy', {
      entrypoint: 'web',
      certResolver: 'custom',
    })
    expect(labels).toContain('traefik.http.routers.site-web.entrypoints=web')
    expect(labels).toContain('traefik.http.routers.site-web.tls.certresolver=custom')
  })

  it('route plusieurs domaines (domaine Eflex + domaine personnalisé)', () => {
    const labels = traefikLabels('app', 'app', ['app.eflex.app', 'client.example.com'], 3000, 'proxy')
    expect(labels).toContain('traefik.http.routers.app-app.rule=Host(`app.eflex.app`) || Host(`client.example.com`)')
    expect(labels).toContain('traefik.http.routers.app-app.tls.certresolver=letsencrypt')
  })

  it('ajoute une redirection www → apex quand les deux variantes sont servies', () => {
    const labels = traefikLabels('site', 'app', ['example.com', 'www.example.com'], 3000, 'proxy')
    expect(labels).toContain('traefik.http.routers.site-app.rule=Host(`example.com`) || Host(`www.example.com`)')
    expect(labels).toContain('traefik.http.routers.site-app.middlewares=site-app-redir-example-com')
    expect(labels).toContain('traefik.http.middlewares.site-app-redir-example-com.redirectregex.regex=^https?://www\\.example\\.com/(.*)')
    expect(labels).toContain('traefik.http.middlewares.site-app-redir-example-com.redirectregex.replacement=https://example.com/${1}')
    expect(labels).toContain('traefik.http.middlewares.site-app-redir-example-com.redirectregex.permanent=true')
  })

  it("n'ajoute pas de redirection si seule la variante www est présente", () => {
    const labels = traefikLabels('site', 'app', ['www.example.com'], 3000, 'proxy')
    expect(labels.some((l) => l.includes('redirectregex'))).toBe(false)
    expect(labels.some((l) => l.includes('.middlewares='))).toBe(false)
  })
})
