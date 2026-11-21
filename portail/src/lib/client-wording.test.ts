import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Vocabulaire côté client : Coolify est le moteur d'hébergement, pas un mot que les clients doivent connaître
 * (ni « one-click »). Il reste permis dans l'administration (`app/admin`, `components/admin`), dans les
 * identifiants de code et dans les commentaires. Revue d'interface du 21/11/2026.
 */
const SRC = path.resolve(__dirname, '..')

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    return full.endsWith('.tsx') ? [full] : []
  })
}

const CLIENT_FILES = [
  ...walk(path.join(SRC, 'app/dashboard')),
  ...walk(path.join(SRC, 'components')).filter((file) => !file.includes(`${path.sep}components${path.sep}admin${path.sep}`)),
  ...['services-hub.ts', 'managed-services-catalog.ts', 'database-capabilities.ts', 'project-coolify-services.ts'].map((name) =>
    path.join(SRC, 'lib', name),
  ),
]

/** Texte hors commentaires, imports et blocs de commentaires JSX. */
function visibleText(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(\/\/|import\s)/.test(line))
    .join('\n')
}

const FORBIDDEN: Array<[string, RegExp]> = [
  ['Coolify', /(?<![A-Za-z0-9_$.-])Coolify(?![A-Za-z0-9_])/],
  ['one-click', /one[- ]click/i],
]

describe('vocabulaire côté client', () => {
  it('couvre bien les fichiers visés', () => {
    expect(CLIENT_FILES.length).toBeGreaterThan(60)
  })

  it.each(FORBIDDEN)('aucun « %s » dans les textes visibles par les clients', (_name, pattern) => {
    const offenders = CLIENT_FILES.flatMap((file) =>
      visibleText(fs.readFileSync(file, 'utf8'))
        .split('\n')
        .map((line, index) => ({ line, index }))
        .filter(({ line }) => pattern.test(line))
        .map(({ line }) => `${path.relative(SRC, file)} : ${line.trim().slice(0, 100)}`),
    )
    expect(offenders).toEqual([])
  })
})
