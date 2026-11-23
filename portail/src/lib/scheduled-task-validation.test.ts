import { describe, expect, it } from 'vitest'
import {
  validateContainerName,
  validateCronExpression,
  validateTaskCommand,
  validateTaskName,
} from './scheduled-task-validation'

describe('validation des tâches planifiées', () => {
  it('accepte des expressions cron usuelles et les alias', () => {
    for (const ok of ['* * * * *', '*/5 * * * *', '0 2 * * 1-5', '30 4 1,15 * *', '0 0 * jan mon', 'daily', '@hourly']) {
      expect(validateCronExpression(ok), ok).toBe(true)
    }
  })

  it('refuse les expressions invalides ou détournées', () => {
    for (const bad of ['', '* * * *', '* * * * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '*/0 * * * *', '1-2-3 * * * *', '* * * * *; rm -rf /', 'whenever']) {
      expect(validateCronExpression(bad), bad).toBe(false)
    }
  })

  it('refuse les commandes multi-lignes ou avec caractères de contrôle', () => {
    expect(validateTaskCommand('php artisan schedule:run')).toBe(true)
    expect(validateTaskCommand('')).toBe(false)
    expect(validateTaskCommand('a\nb')).toBe(false)
    expect(validateTaskCommand('a\u0000b')).toBe(false)
    expect(validateTaskCommand('x'.repeat(4001))).toBe(false)
  })

  it('borne le nom de conteneur et le nom de tâche', () => {
    expect(validateContainerName('app-web_1')).toBe(true)
    expect(validateContainerName('../etc')).toBe(false)
    expect(validateContainerName('a b')).toBe(false)
    expect(validateTaskName('Sauvegarde nocturne')).toBe(true)
    expect(validateTaskName('x\ny')).toBe(false)
  })
})
