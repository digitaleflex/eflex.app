import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Le gabarit de `app/layout.tsx` ajoute déjà « — EFLEX » : un titre de page qui
 * contient la marque s'afficherait deux fois dans l'onglet.
 */
const APP = path.join(__dirname, '..', 'app')

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name)
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [full] : []
  })
}

describe('titres de page', () => {
  const sources = files(APP).filter((file) => !/[\\/]layout\.tsx$/.test(file) || !file.endsWith(path.join('app', 'layout.tsx')))

  it('ne répètent pas la marque déjà ajoutée par le gabarit', () => {
    const offenders: string[] = []
    for (const file of sources) {
      if (file.endsWith('global-error.tsx')) continue
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/\btitle:\s*(['"`])((?:(?!\1).)*)\1/g)) {
        const value = match[2] ?? ''
        if (/EFLEX\s*$/.test(value)) offenders.push(`${path.relative(APP, file)} : « ${value} »`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('les pages de la console ont un titre propre', () => {
    for (const page of ['dashboard/new/layout.tsx', 'dashboard/settings/page.tsx', 'dashboard/projects/[id]/page.tsx']) {
      expect(readFileSync(path.join(APP, page), 'utf8')).toMatch(/export const metadata/)
    }
  })
})
