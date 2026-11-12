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

  it('accepte des valeurs mémoire en chaînes avec unités et un échantillon imbriqué', () => {
    const metrics = normalizeApplicationMetrics({
      latest: {
        cpu_percentage: 12.5,
        memory_usage: '512MiB',
        memory_limit: '1GiB',
        sampled_at: '2026-02-01T10:00:00Z',
      },
    })
    expect(metrics.available).toBe(true)
    expect(metrics.cpuPercent).toBe(12.5)
    expect(metrics.memoryUsedMb).toBe(512)
    expect(metrics.memoryLimitMb).toBe(1024)
    expect(metrics.memoryPercent).toBe(50)
    expect(metrics.sampledAt).toBe('2026-02-01T10:00:00Z')
  })

  it('accepte des métriques de type docker stats imbriquées', () => {
    const metrics = normalizeApplicationMetrics({
      cpu_stats: {
        cpu_usage: { total_usage: 200_000_000, percpu_usage: [1, 1] },
        system_cpu_usage: 1_000_000_000,
        online_cpus: 2,
      },
      precpu_stats: {
        cpu_usage: { total_usage: 100_000_000 },
        system_cpu_usage: 500_000_000,
      },
      memory_stats: { usage: 256 * 1024 * 1024, limit: 512 * 1024 * 1024 },
    })
    expect(metrics.available).toBe(true)
    expect(metrics.cpuPercent).toBe(40)
    expect(metrics.memoryUsedMb).toBe(256)
    expect(metrics.memoryLimitMb).toBe(512)
    expect(metrics.memoryPercent).toBe(50)
  })
})
