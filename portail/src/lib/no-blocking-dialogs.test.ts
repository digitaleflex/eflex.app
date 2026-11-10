import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Critère d'acceptation de l'issue #32 : aucun `window.confirm` / `alert` bloquant.
// Les confirmations passent par `ConfirmDialog` (élément <dialog> natif, focus piégé
// et retour au déclencheur géré par le navigateur).
const SRC = new URL('../', import.meta.url).pathname

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return files(full)
    return /\.(ts|tsx|js|jsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry) ? [full] : []
  })
}

const BLOCKING_DIALOG = /(?<![\w.])(?:window\s*\.\s*)?(?:confirm|alert)\s*\(/

describe('dialogues bloquants', () => {
  it('aucun window.confirm/alert dans le code du portail', () => {
    const offenders = files(SRC).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, index) => ({ line: line.trim(), index: index + 1 }))
        .filter(({ line }) => BLOCKING_DIALOG.test(line) && !line.startsWith('//'))
        .map(({ line, index }) => `${file.replace(SRC, '')}:${index} — ${line}`),
    )
    expect(offenders).toEqual([])
  })
})
