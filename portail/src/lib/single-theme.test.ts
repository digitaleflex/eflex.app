import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Thème clair unique et permanent (issue #220) : garde-fous contre le retour d'un thème sombre global.
 * Les surfaces sombres LOCALES (terminal, journaux, bandes navy) restent autorisées : elles passent par
 * `bg-eflexnavy`, `--terminal-*` ou `surface-navy`, jamais par `dark:`, `.dark` ni `prefers-color-scheme`.
 */
const SRC = new URL('..', import.meta.url).pathname

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const files = sources(SRC).map((path) => ({ path: relative(SRC, path), text: readFileSync(path, 'utf8') }))

function offenders(pattern: RegExp) {
  return files.flatMap((file) => [...file.text.matchAll(pattern)].map((m) => `${file.path} : ${m[0]}`))
}

describe('thème clair unique', () => {
  it('aucune variante Tailwind `dark:`', () => {
    expect(offenders(/(?<![\w-])dark:[\w[\]/.%-]+/g)).toEqual([])
  })

  it('aucune règle `.dark` ni `prefers-color-scheme: dark`', () => {
    expect(offenders(/:root\.dark|\.dark\s*[.{ ]|prefers-color-scheme:\s*dark/g)).toEqual([])
  })

  it('plus de cookie ni de script de thème, hors purge de l’ancien cookie', () => {
    const hits = offenders(/themeBootScript|ThemeSync|ThemeSwitcher|ThemeToggle|applyTheme|readTheme/g)
    expect(hits).toEqual([])
    const cookie = offenders(/eflex-theme/g).filter((hit) => !hit.startsWith('middleware.ts'))
    expect(cookie).toEqual([])
  })

  it('la mise en page déclare le schéma de couleur clair', () => {
    const layout = files.find((f) => f.path === 'app/layout.tsx')!.text
    expect(layout).toContain("colorScheme: 'light'")
  })
})
