import { describe, expect, it } from 'vitest'
import {
  HEALTH_HOST_PATTERN,
  HEALTH_PATH_PATTERN,
  HEALTH_TEXT_PATTERN,
  WATCH_PATH_PATTERN,
  checkLimit,
  parseMemoryMb,
  resourceCaps,
  validatePort,
} from '@/lib/app-config-validation'

const caps = { maxMemoryMb: 2048, maxCpus: 2 }

describe('plafonds de ressources', () => {
  it('valeurs par défaut prudentes, réglables par l’environnement et bornées', () => {
    expect(resourceCaps({})).toEqual({ maxMemoryMb: 2048, maxCpus: 2 })
    expect(resourceCaps({ APP_LIMIT_MAX_MEMORY_MB: '4096', APP_LIMIT_MAX_CPUS: '4' })).toEqual({ maxMemoryMb: 4096, maxCpus: 4 })
    expect(resourceCaps({ APP_LIMIT_MAX_MEMORY_MB: '1', APP_LIMIT_MAX_CPUS: 'abc' })).toEqual({ maxMemoryMb: 64, maxCpus: 2 })
  })

  it('convertit les tailles de mémoire en Mo', () => {
    expect(parseMemoryMb('512m')).toBe(512)
    expect(parseMemoryMb('1g')).toBe(1024)
    expect(parseMemoryMb('1.5G')).toBe(1536)
    expect(parseMemoryMb('1024k')).toBe(1)
    expect(parseMemoryMb('1048576')).toBe(1)
    for (const bad of ['', 'beaucoup', '-1m', '1tb', '1m; rm -rf /', '1 2']) expect(parseMemoryMb(bad)).toBeNull()
  })
})

describe('checkLimit', () => {
  it('écarte « sans limite » : vide ou zéro ne sont jamais envoyés', () => {
    for (const value of ['', ' ', '0', '0m', '0g', '0.0']) {
      expect(checkLimit('limitsMemory', value, caps)).toEqual({ kind: 'omit' })
      expect(checkLimit('limitsCpus', value, caps)).toEqual({ kind: 'omit' })
    }
  })

  it('accepte une limite dans le plafond et refuse au-delà', () => {
    expect(checkLimit('limitsMemory', '512m', caps)).toEqual({ kind: 'keep', value: '512m' })
    expect(checkLimit('limitsMemory', '2g', caps)).toEqual({ kind: 'keep', value: '2g' })
    expect(checkLimit('limitsMemory', '3g', caps)).toMatchObject({ kind: 'error' })
    expect(checkLimit('limitsMemoryReservation', '64g', caps)).toMatchObject({ kind: 'error' })
    expect(checkLimit('limitsCpus', '1.5', caps)).toEqual({ kind: 'keep', value: '1.5' })
    expect(checkLimit('limitsCpus', '8', caps)).toMatchObject({ kind: 'error' })
  })

  it('le swap Docker inclut la mémoire : plafond doublé', () => {
    expect(checkLimit('limitsMemorySwap', '4g', caps)).toEqual({ kind: 'keep', value: '4g' })
    expect(checkLimit('limitsMemorySwap', '5g', caps)).toMatchObject({ kind: 'error' })
  })

  it('refuse les formats invalides', () => {
    expect(checkLimit('limitsCpus', 'deux', caps)).toMatchObject({ kind: 'error' })
    expect(checkLimit('limitsCpus', '1.555', caps)).toMatchObject({ kind: 'error' })
    expect(checkLimit('limitsMemory', '1 giga', caps)).toMatchObject({ kind: 'error' })
  })
})

describe('contrôle de santé', () => {
  it('chemin : commence par « / », sans espace ni caractère shell', () => {
    for (const ok of ['/', '/health', '/api/v1/health?full=1', '/a-b_c.d~e']) expect(HEALTH_PATH_PATTERN.test(ok)).toBe(true)
    for (const bad of ['health', '/a b', '/a"b', '/a`b', '/a$(id)', '/a\nb', "/a'b", '/a|b']) expect(HEALTH_PATH_PATTERN.test(bad)).toBe(false)
  })

  it('hôte : nom ou adresse, sans schéma, port ni chemin', () => {
    for (const ok of ['localhost', 'app.exemple.fr', '127.0.0.1']) expect(HEALTH_HOST_PATTERN.test(ok)).toBe(true)
    for (const bad of ['http://x', 'x:80', 'x/y', 'x y', '-x', 'x;id']) expect(HEALTH_HOST_PATTERN.test(bad)).toBe(false)
  })

  it('port : entier de 1 à 65535', () => {
    expect(validatePort('80')).toBe(true)
    expect(validatePort('65535')).toBe(true)
    for (const bad of ['0', '65536', '8o', '', '-1', '80 ']) expect(validatePort(bad)).toBe(false)
  })

  it('texte attendu : sans guillemet, apostrophe, backtick, $ ni antislash', () => {
    expect(HEALTH_TEXT_PATTERN.test('ok')).toBe(true)
    expect(HEALTH_TEXT_PATTERN.test('{"status":"ok"}')).toBe(false)
    for (const bad of ["it's", 'a`b', 'a$b', 'a\\b', 'a\nb']) expect(HEALTH_TEXT_PATTERN.test(bad)).toBe(false)
  })

  it('chemins surveillés : motifs de dossiers uniquement', () => {
    expect(WATCH_PATH_PATTERN.test('apps/web/**,packages/*/src/**')).toBe(true)
    expect(WATCH_PATH_PATTERN.test('src/**\n!docs/**')).toBe(false) // retour à la ligne : séparer par des virgules
    for (const bad of ['a;b', 'a$(id)', 'a"b', 'a`b', 'a|b', 'a&b']) expect(WATCH_PATH_PATTERN.test(bad)).toBe(false)
  })
})

describe('plafonds par plan (#131)', () => {
  it('chaque plan a son plafond, croissant', async () => {
    const { resourceCapsForPlan } = await import('./app-config-validation')
    expect(resourceCapsForPlan('free', {})).toEqual({ maxMemoryMb: 512, maxCpus: 0.5 })
    expect(resourceCapsForPlan('agency', {})).toEqual({ maxMemoryMb: 4096, maxCpus: 4 })
    expect(resourceCapsForPlan('inconnu', {})).toEqual({ maxMemoryMb: 512, maxCpus: 0.5 })
  })
  it('le plafond global de l’opérateur reste prioritaire quand il est plus bas', async () => {
    const { resourceCapsForPlan } = await import('./app-config-validation')
    expect(resourceCapsForPlan('agency', { APP_LIMIT_MAX_MEMORY_MB: '1024', APP_LIMIT_MAX_CPUS: '1' })).toEqual({
      maxMemoryMb: 1024,
      maxCpus: 1,
    })
  })
  it('refuse une mémoire au-dessus du plan', async () => {
    const { resourceCapsForPlan, checkLimit } = await import('./app-config-validation')
    const caps = resourceCapsForPlan('free', {})
    expect(checkLimit('limitsMemory', '1g', caps).kind).toBe('error')
    expect(checkLimit('limitsMemory', '256m', caps).kind).toBe('keep')
  })
})
