import { describe, expect, it } from 'vitest'
import { relativeTime } from '@/lib/relative-time'

const now = new Date('2026-11-08T12:00:00Z')
const ago = (s: number) => new Date(now.getTime() - s * 1000)

describe('relativeTime', () => {
  it('formate en français', () => {
    expect(relativeTime(ago(10), now)).toBe("à l'instant")
    expect(relativeTime(ago(5 * 60), now)).toBe('il y a 5 minutes')
    expect(relativeTime(ago(3 * 3600), now)).toBe('il y a 3 heures')
    expect(relativeTime(ago(86_400), now)).toBe('hier')
    expect(relativeTime(ago(30 * 86_400), now)).toMatch(/2026/)
  })
})
