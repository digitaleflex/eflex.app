import { describe, expect, it } from 'vitest'
import { normalizeApplicationMetrics, unavailableMetrics } from './app-metrics'

describe('normalizeApplicationMetrics', () => {
  it('retourne indisponible sans données exploitables', () => {
    expect(normalizeApplicationMetrics(null).available).toBe(false)
    expect(normalizeApplicationMetrics({}).available).toBe(false)
    expect(unavailableMetrics('x').message).toBe('x')
  })

  it('normalise un échantillon en pourcentages et mégaoctets', () => {
    const metrics = normalizeApplicationMetrics({
      cpu: 12.34,
      memory_usage: 512 * 1024 * 1024,
      memory_limit: 1024 * 1024 * 1024,
    })
    expect(metrics.available).toBe(true)
    expect(metrics.cpuPercent).toBe(12.3)
    expect(metrics.memoryUsedMb).toBe(512)
    expect(metrics.memoryLimitMb).toBe(1024)
    expect(metrics.memoryPercent).toBe(50)
  })

  it('accepte un ratio CPU 0–1 et une série de métriques', () => {
    const metrics = normalizeApplicationMetrics([
      { cpu_percent: 0.2, mem_used_mb: 100, mem_limit_mb: 200, sampled_at: '2026-01-01T00:00:00Z' },
      { cpu_percent: 0.5, mem_used_mb: 120, mem_limit_mb: 200, sampled_at: '2026-01-01T00:01:00Z' },
    ])
    expect(metrics.available).toBe(true)
    expect(metrics.cpuPercent).toBe(50)
    expect(metrics.memoryUsedMb).toBe(120)
    expect(metrics.memoryPercent).toBe(60)
    expect(metrics.sampledAt).toBe('2026-01-01T00:01:00Z')
  })

  it('reste défensif sur des types inattendus', () => {
    expect(normalizeApplicationMetrics({ cpu: 'not-a-number', memory_usage: {} }).available).toBe(false)
  })
})
