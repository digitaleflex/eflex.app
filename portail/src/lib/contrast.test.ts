import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Vérifie les contrastes WCAG 2.1 AA de la charte à partir du CSS réel (src/app/globals.css) :
// toute modification d'un jeton qui ferait passer un couple sous le seuil casse ce test.
const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

function tokens(block: string): Record<string, [number, number, number]> {
  const out: Record<string, [number, number, number]> = {}
  for (const m of block.matchAll(/--([a-z-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g)) {
    out[m[1]!] = [Number(m[2]), Number(m[3]), Number(m[4])]
  }
  return out
}
const light = tokens(css.slice(css.indexOf(':root'), css.indexOf('.dark')))
const dark = tokens(css.slice(css.indexOf('.dark'), css.indexOf('@layer base')))

type RGB = [number, number, number]
function hsl([h, s, l]: [number, number, number]): RGB {
  const sat = s / 100
  const lig = l / 100
  const a = sat * Math.min(lig, 1 - lig)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return lig - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  return [f(0), f(8), f(4)]
}
const luminance = (c: RGB) => {
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)) as RGB
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: RGB, b: RGB) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}
const over = (fg: RGB, bg: RGB, alpha: number): RGB => fg.map((v, i) => alpha * v + (1 - alpha) * bg[i]!) as RGB

for (const [theme, t] of [['clair', light], ['sombre', dark]] as const) {
  const c = (name: string) => hsl(t[name] ?? (theme === 'sombre' ? light[name]! : [0, 0, 0]))
  describe(`contrastes du thème ${theme}`, () => {
    it.each([
      ['texte', 'foreground', 'background'],
      ['texte sur carte', 'card-foreground', 'card'],
      ['texte atténué sur fond', 'muted-foreground', 'background'],
      ['texte atténué sur carte', 'muted-foreground', 'card'],
      ['bouton principal', 'primary-foreground', 'primary'],
      ['lien (primary) sur carte', 'primary', 'card'],
      ['bouton destructif', 'destructive-foreground', 'destructive'],
      ['bouton succès', 'success-foreground', 'success'],
      ['bouton avertissement', 'warning-foreground', 'warning'],
    ])('%s ≥ 4,5:1', (_label, fg, bg) => {
      expect(ratio(c(fg), c(bg))).toBeGreaterThanOrEqual(4.5)
    })

    it.each(['destructive', 'success', 'warning'])('texte « %s » sur teinte à 10 % (badge, message) ≥ 4,5:1', (name) => {
      const tint = over(c(name), c('card'), 0.1)
      expect(ratio(c(name), tint)).toBeGreaterThanOrEqual(4.5)
      expect(ratio(c(name), over(c(name), c('background'), 0.1))).toBeGreaterThanOrEqual(4.5)
    })
  })
}
