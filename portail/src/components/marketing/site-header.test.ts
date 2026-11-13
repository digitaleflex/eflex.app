import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// En-tête marketing (`site-header.tsx`) : destinations conservées, cibles de 44 px,
// focus visible, menu mobile accessible (`mobile-menu.tsx`) — et lisibilité AA SUR le
// hero navy de la page d'accueil. La surface `glass` étant translucide
// (`bg-background/85`), les jetons de texte du composant sont mesurés sur un fond
// mélangé à `--eflex-navy`. Même méthode de calcul que `src/lib/contrast.test.ts`
// (WCAG 2.1 AA : texte ≥ 4,5:1, indicateur non textuel ≥ 3:1).

const css = readFileSync(new URL('../../app/globals.css', import.meta.url), 'utf8')
const header = readFileSync(new URL('./site-header.tsx', import.meta.url), 'utf8')
const menu = readFileSync(new URL('./mobile-menu.tsx', import.meta.url), 'utf8')

type Hsl = [number, number, number]
type Rgb = [number, number, number]

function tokens(block: string): Record<string, Hsl> {
  const out: Record<string, Hsl> = {}
  for (const m of block.matchAll(/--([a-z-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    out[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])]
  }
  return out
}

const darkStart = css.indexOf(':root.dark')
const light = tokens(css.slice(css.indexOf(':root'), darkStart))
const dark = tokens(css.slice(darkStart, css.indexOf('}', darkStart)))

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

/** Opacité du fond de `.glass` (globals.css) : c'est elle qui pilote le mélange. */
const glassAlpha = (() => {
  const rule = css.match(/\.glass\s*\{([^}]*)\}/)?.[1] ?? ''
  const bg = rule.match(/bg-background\/([\d.]+)/)
  if (!bg) throw new Error('`.glass` ne définit plus bg-background/<opacité> : mettre à jour ce test')
  return Number(bg[1]) / 100
})()

/** Couleur de repos des liens de navigation (`text-foreground/<alpha>`). */
const navAlpha = (() => {
  const m = header.match(/text-foreground\/([\d.]+)/)
  if (!m) throw new Error('couleur de repos des liens absente (text-foreground/<alpha>)')
  return Number(m[1]) / 100
})()

const token = (theme: Record<string, Hsl>, name: string): Hsl => {
  const value = theme[name] ?? light[name]
  if (!value) throw new Error(`Jeton « ${name} » introuvable dans globals.css`)
  return value
}

for (const [label, theme] of [['clair', light], ['sombre', dark]] as const) {
  const c = (name: string) => hsl(token(theme, name))
  // Verre posé sur le hero navy : --background (85 %) + --eflex-navy (15 %).
  const onHero = over(c('background'), c('eflex-navy'), glassAlpha)

  describe(`en-tête lisible — thème ${label}`, () => {
    it('liens de navigation sur le hero navy ≥ 4,5:1', () => {
      expect(ratio(over(c('foreground'), onHero, navAlpha), onHero)).toBeGreaterThanOrEqual(4.5)
    })

    it('texte plein (Connexion, page courante) sur le hero navy ≥ 4,5:1', () => {
      expect(ratio(c('foreground'), onHero)).toBeGreaterThanOrEqual(4.5)
    })

    it('anneau de focus sur le hero navy ≥ 3:1', () => {
      expect(ratio(c('ring'), onHero)).toBeGreaterThanOrEqual(3)
    })

    it('liens de navigation sur le fond de page ≥ 4,5:1 (sections claires, /status)', () => {
      expect(ratio(over(c('foreground'), c('background'), navAlpha), c('background'))).toBeGreaterThanOrEqual(
        4.5,
      )
    })
  })
}

describe('comportement conservé', () => {
  it('conserve toutes les destinations existantes', () => {
    for (const href of ['/#fonctionnement', '/#fonctionnalites', '/#questions', '/status', '/login', '/register']) {
      expect(header, `lien ${href}`).toContain(href)
    }
    expect(header).toContain('href="/"')
    expect(header).toContain('src="/logo-horizontal.webp"')
    expect(header).toContain('alt="Eflex — accueil"')
  })

  it('reste collant et identifié comme navigation de site', () => {
    expect(header).toContain('sticky top-0')
    expect(header).toContain('aria-label="Navigation du site"')
  })

  it('annonce la page courante aux technologies d’assistance', () => {
    expect(header).toContain('aria-current')
    expect(header).toContain('usePathname')
  })

  it('garde des cibles d’au moins 44 px (h-11 = 2,75 rem)', () => {
    expect(header).toContain('min-h-11') // lien du logo
    // logo, liens de navigation, « Connexion » et « Créer un compte »
    expect((header.match(/h-11/g) ?? []).length).toBeGreaterThanOrEqual(4)
    // Le bouton de thème suit la convention du dépôt : 44 px en pointeur
    // grossier, 36 px en pointeur fin (WCAG 2.5.8 AA : 24 px minimum).
    expect(header).toContain('<ThemeToggle')
  })

  it('garde un focus visible sur chaque lien du composant', () => {
    expect((header.match(/focus-visible:ring-2/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('sous lg, liens en ligne masqués et remplacés par le menu mobile', () => {
    expect(header).toContain('hidden lg:flex')
    // Un seul tableau `links` alimente l'en-tête large et le menu mobile.
    expect(header).toContain('<MobileMenu links={links}')
    expect((header.match(/const links\b/g) ?? []).length).toBe(1)
    expect(menu).not.toMatch(/href: '\/#/)
  })

  it('menu mobile : bouton de divulgation nommé, Connexion et Créer un compte', () => {
    expect(menu).toContain('aria-expanded={open}')
    expect(menu).toContain('aria-controls={panelId}')
    expect(menu).toContain('>Menu<')
    expect(menu).toContain('href="/login"')
    expect(menu).toContain('href="/register"')
    expect(menu).toContain('lg:hidden')
  })

  it('menu mobile : Échap, piège de Tab, verrou de défilement, fermeture ≥ 1024 px', () => {
    expect(menu).toContain("event.key === 'Escape'")
    expect(menu).toContain("event.key !== 'Tab'")
    expect(menu).toContain("style.overflow = 'hidden'")
    expect(menu).toContain('(min-width: 1024px)')
    // Chaque lien du panneau referme le menu (ancres `/#…` comprises).
    expect((menu.match(/onClick=\{\(\) => close\(false\)\}/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  it('menu mobile : cibles de 44 px, focus visible, mouvement sobre', () => {
    expect((menu.match(/h-11|min-h-11/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect((menu.match(/focus-visible:ring-2/g) ?? []).length).toBeGreaterThanOrEqual(4)
    expect(menu).toContain('transition-[opacity,transform,visibility]')
    expect(menu).toContain('motion-reduce:transition-none')
    expect(menu).not.toContain('transition-all')
  })

  it('reste sobre au plan des animations (pas de transition-all)', () => {
    expect(header).not.toContain('transition-all')
  })
})
