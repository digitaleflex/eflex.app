import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// En-tête marketing Zone 1 : navigation, thème clair unique (issue #220), accessibilité.

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
const header = readFileSync(new URL('./site-header.tsx', import.meta.url), 'utf8')
const brandLogo = readFileSync(new URL('../brand-logo.tsx', import.meta.url), 'utf8')

type Hsl = [number, number, number]
type Rgb = [number, number, number]

function tokens(block: string): Record<string, Hsl> {
  const out: Record<string, Hsl> = {}
  for (const m of block.matchAll(/--([a-z-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    out[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])]
  }
  return out
}

// Bloc `:root` seul (jusqu'à son accolade fermante) : les portées locales ne doivent pas écraser les tokens.
const rootStart = css.indexOf(':root {')
let rootEnd = css.indexOf('{', rootStart)
for (let depth = 0; rootEnd < css.length; rootEnd += 1) {
  if (css[rootEnd] === '{') depth += 1
  else if (css[rootEnd] === '}' && --depth === 0) break
}
const light = tokens(css.slice(rootStart, rootEnd))

function hsl([h, s, l]: Hsl): Rgb {
  const sat = s / 100
  const lig = l / 100
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}

const luminance = (c: Rgb) => {
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

const ratio = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

describe('lisibilité AA des contrôles de navigation', () => {
  it('texte/fond en thème clair ≥ 4,5:1', () => {
    expect(ratio(hsl(light.foreground), hsl(light.background))).toBeGreaterThanOrEqual(4.5)
    expect(ratio(hsl(light['muted-foreground']), hsl(light.background))).toBeGreaterThanOrEqual(4.5)
  })

  it('anneau de focus visible ≥ 3:1', () => {
    expect(ratio(hsl(light.ring), hsl(light.background))).toBeGreaterThanOrEqual(3)
  })
})

describe('Zone 1 - navigation', () => {
  it('contient les destinations de la spec', () => {
    for (const href of ['href="/"', '/#fonctionnalites', '/tarifs', '/docs', '/login', '/register']) {
      expect(header, `lien ${href}`).toContain(href)
    }
    expect(header).toContain('Accueil')
    expect(header).toContain('Fonctionnalités')
    expect(header).toContain('Tarifs')
    expect(header).toContain('Ressources')
    expect(header).toContain('Se connecter')
    expect(header).toContain('Créer un compte')
  })

  it('utilise le logo officiel EFLEX', () => {
    expect(header).toContain('<BrandLogo')
    expect(header).toContain('alt="EFLEX — accueil"')
    expect(brandLogo).toContain("light: '/logo-horizontal.webp'")
    expect(brandLogo).toContain("dark: '/logo-horizontal-inverse.webp'")
  })

  it('n’affiche pas de sélecteur de thème (single theme EFLEX)', () => {
    expect(header).not.toContain('ThemeToggle')
  })

  it('reste collant et identifié comme navigation de site', () => {
    expect(header).toContain('sticky top-0')
    expect(header).toContain('aria-label="Navigation du site"')
  })

  it('annonce la page courante', () => {
    expect(header).toContain('aria-current')
    expect(header).toContain('usePathname')
  })

  it('garde des cibles tactiles >= 44px et focus visible', () => {
    expect(header).toContain('min-h-11')
    expect((header.match(/h-11/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect((header.match(/focus-visible:ring-2/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('desktop visible dès lg, menu mobile accessible', () => {
    expect(header).toContain('hidden items-center gap-1 lg:flex')
    expect(header).toContain('aria-expanded={open}')
    expect(header).toContain('aria-controls={panelId}')
    expect((header.match(/lg:hidden/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('menu mobile: dialog modale, Échap, piège de focus, défilement bloqué', () => {
    expect(header).toContain('role="dialog"')
    expect(header).toContain('aria-modal="true"')
    expect(header).toContain("event.key === 'Escape'")
    expect(header).toContain("event.key === 'Tab'")
    expect(header).toContain('buttonRef.current?.focus()')
    expect(header).toContain("document.body.style.overflow = 'hidden'")
  })

  it('pas de transition-all', () => {
    expect(header).not.toContain('transition-all')
  })
})
