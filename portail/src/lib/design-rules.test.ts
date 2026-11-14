import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Garde-fous de la charte EFLEX (docs/brand/README.md, section « Fondations »).
 * Chaque règle a une liste d'exceptions NOMMÉES et justifiées : en ajouter une doit rester un choix.
 */
const SRC = new URL('..', import.meta.url).pathname

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const files = sources(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }))

function offenders(pattern: RegExp, allowed: readonly string[]) {
  return files
    .filter((file) => !allowed.includes(file.path))
    .flatMap((file) => [...file.text.matchAll(pattern)].map((match) => `${file.path} : ${match[0]}`))
}

describe('charte EFLEX : fondations', () => {
  it('les couleurs passent par les tokens, pas par la palette brute de Tailwind', () => {
    const raw =
      /(?<![\w-])(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g
    // Exceptions : rendu de terminal (couleurs ANSI des journaux, comme un vrai terminal).
    expect(offenders(raw, ['components/terminal.tsx', 'lib/ansi.ts'])).toEqual([])
  })

  it('aucun texte sous 12 px', () => {
    expect(offenders(/text-\[(?:[0-9]|1[01])(?:\.\d+)?px\]/g, [])).toEqual([])
  })

  it('les arrondis suivent l’échelle (md, lg, xl, 2xl, 3xl, full, none)', () => {
    // Hors échelle : `rounded` nu, `-sm`, un côté sans taille (`rounded-t`) et toute valeur arbitraire.
    const offScale =
      /(?<=[\s"'`])rounded(?:-(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?(?:-sm)?(?=[\s"'`])|rounded-\[[^\]]+\]/g
    expect(offenders(offScale, [])).toEqual([])
  })
})
