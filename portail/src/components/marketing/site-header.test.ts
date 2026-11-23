import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// En-tête marketing (`site-header.tsx`) : destinations, accessibilité clavier/mobile,
// cibles tactiles, focus visible et lisibilité AA sur fond clair (homepage forcée en clair).
// Méthode de contraste : WCAG 2.1 AA (texte ≥ 4,5:1, indicateur non textuel ≥ 3:1).

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

const light = tokens(css.slice(css.indexOf(':root'), css.indexOf(':root.dark')))

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

const over = (fg: Rgb, bg: Rgb, alpha: number): Rgb =>
  fg.map((v, i) => alpha * v + (1 - alpha) * bg[i]!) as Rgb

const bg = hsl(light.background)
const fg = hsl(light.foreground)
const ring = hsl(light.ring)

describe('en-tête lisible — fond clair', () => {
  it('texte plein sur fond ≥ 4,5:1', () => {
    expect(ratio(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('liens de navigation au repos (foreground/75) ≥ 4,5:1', () => {
    expect(ratio(over(fg, bg, 0.75), bg)).toBeGreaterThanOrEqual(4.5)
  })

  it('anneau de focus sur fond ≥ 3:1', () => {
    expect(ratio(ring, bg)).toBeGreaterThanOrEqual(3)
  })
})

describe('comportement conservé', () => {
  it('conserve les destinations de navigation', () => {
    for (const href of ['/#fonctionnement', '/#fonctionnalites', '/#technologies', '/docs', '/status', '/login', '/register']) {
      expect(header, `lien ${href}`).toContain(href)
    }
    expect(header).toContain('href="/"')
    expect(header).toContain('<BrandLogo')
    expect(header).not.toMatch(/variant="mark"/)
    expect(brandLogo).toContain("light: '/logo-horizontal.webp'")
    expect(brandLogo).toContain("dark: '/logo-horizontal-inverse.webp'")
    expect(header).toContain('alt="EFLEX — accueil"')
  })

  it('reste collant et identifié comme navigation de site', () => {
    expect(header).toContain('sticky top-0')
    expect(header).toContain('aria-label="Navigation du site"')
  })

  it('annonce la page courante aux technologies d’assistance', () => {
    expect(header).toContain('aria-current')
    expect(header).toContain('usePathname')
  })

  it('garde des cibles d’au moins 44 px', () => {
    expect(header).toContain('min-h-11')
    expect((header.match(/h-11/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('garde un focus visible sur chaque lien du composant', () => {
    expect((header.match(/focus-visible:ring-2/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('bureau : la liste de liens reste visible dès lg et masquée en dessous', () => {
    expect(header).toContain('hidden items-center gap-1 lg:flex')
  })

  it('mobile : un bouton de menu accessible, masqué dès lg, avec les mêmes destinations', () => {
    expect(header).toMatch(/<button/)
    expect(header).toContain('aria-expanded={open}')
    expect(header).toContain('aria-controls={panelId}')
    expect((header.match(/lg:hidden/g) ?? []).length).toBeGreaterThanOrEqual(2)
    expect((header.match(/links\.map\(/g) ?? []).length).toBeGreaterThanOrEqual(2)
  })

  it('menu mobile : boîte de dialogue modale, Échap, piège de focus et défilement bloqué', () => {
    expect(header).toContain('role="dialog"')
    expect(header).toContain('aria-modal="true"')
    expect(header).toContain("event.key === 'Escape'")
    expect(header).toContain("event.key === 'Tab'")
    expect(header).toContain('buttonRef.current?.focus()')
    expect(header).toContain("document.body.style.overflow = 'hidden'")
    expect(header).toContain('document.body.style.overflow = previousOverflow')
  })

  it('reste sobre au plan des animations (pas de transition-all)', () => {
    expect(header).not.toContain('transition-all')
  })
})
