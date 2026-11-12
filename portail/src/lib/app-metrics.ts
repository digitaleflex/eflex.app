/**
 * Métriques CPU/RAM d'une application Coolify, normalisées pour le portail.
 * Contrat volontairement tolérant : l'API Coolify n'expose pas toujours ces
 * données selon la version, la configuration du serveur ou les droits du jeton.
 */
export interface ApplicationMetrics {
  available: boolean
  /** Utilisation CPU en pourcentage (0–n), quand connue. */
  cpuPercent: number | null
  /** Mémoire utilisée, en mébioctets. */
  memoryUsedMb: number | null
  /** Limite mémoire, en mébioctets. */
  memoryLimitMb: number | null
  /** Utilisation mémoire en pourcentage, quand connue. */
  memoryPercent: number | null
  /** Horodatage ISO de l'échantillon, si fourni par l'API. */
  sampledAt: string | null
  /** Message explicite quand les métriques ne sont pas disponibles. */
  message?: string
  /** Détails facultatifs si exposés par la même source que les métriques. */
  restartCount?: number | null
  restartReason?: string | null
  status?: string | null
}

export function unavailableMetrics(message = 'Métriques indisponibles.'): ApplicationMetrics {
  return {
    available: false,
    cpuPercent: null,
    memoryUsedMb: null,
    memoryLimitMb: null,
    memoryPercent: null,
    sampledAt: null,
    message,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseUnitString(value: string): number | null {
  const normalized = value.trim().toLowerCase().replace(',', '.')
  const match = normalized.match(/^([+-]?\d+(?:\.\d+)?)(?:\s*([a-z]+))?$/)
  if (!match) return null
  const amount = Number(match[1])
  if (!Number.isFinite(amount)) return null
  const unit = match[2] ?? ''
  if (!unit) return amount
  const factors: Record<string, number> = {
    b: 1,
    byte: 1,
    bytes: 1,
    kb: 1_000,
    k: 1_000,
    mb: 1_000_000,
    m: 1_000_000,
    gb: 1_000_000_000,
    g: 1_000_000_000,
    tb: 1_000_000_000_000,
    kib: 1024,
    ki: 1024,
    mib: 1024 ** 2,
    mi: 1024 ** 2,
    gib: 1024 ** 3,
    gi: 1024 ** 3,
    tib: 1024 ** 4,
    ti: 1024 ** 4,
  }
  const factor = factors[unit]
  return factor ? amount * factor : null
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const direct = Number(value)
    if (Number.isFinite(direct)) return direct
    return parseUnitString(value)
  }
  return null
}

function pickNumber(source: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = toFiniteNumber(source[key])
    if (value !== null) return value
  }
  return null
}

function bytesToMb(value: number | null): number | null {
  if (value === null) return null
  return value / (1024 * 1024)
}

function normalizePercent(value: number | null): number | null {
  if (value === null) return null
  // Certaines APIs renvoient un ratio 0–1, d'autres un pourcentage 0–100.
  if (value > 0 && value <= 1) return value * 100
  return value
}

function clampPercent(value: number | null): number | null {
  if (value === null) return null
  if (value < 0) return 0
  return value
}

function roundMetric(value: number | null, digits = 1): number | null {
  if (value === null) return null
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function extractSample(payload: unknown): Record<string, unknown> | null {
  if (Array.isArray(payload)) {
    const last = [...payload].reverse().find(isRecord)
    return last ?? null
  }
  if (!isRecord(payload)) return null

  // Formes possibles : { metrics: [...] }, { data: [...] }, { stats: {...} }, etc.
  for (const key of ['metrics', 'data', 'stats', 'usage', 'resources', 'current', 'latest', 'sample']) {
    const nested = payload[key]
    if (Array.isArray(nested)) {
      const last = [...nested].reverse().find(isRecord)
      if (last) return last
    }
    if (isRecord(nested)) return nested
  }
  return payload
}

function pickNestedNumber(source: Record<string, unknown>, paths: readonly (readonly string[])[]): number | null {
  for (const path of paths) {
    let current: unknown = source
    let ok = true
    for (const key of path) {
      if (!isRecord(current) || !(key in current)) {
        ok = false
        break
      }
      current = current[key]
    }
    if (!ok) continue
    const value = toFiniteNumber(current)
    if (value !== null) return value
  }
  return null
}

function dockerCpuPercent(sample: Record<string, unknown>): number | null {
  const cpuStats = isRecord(sample.cpu_stats) ? sample.cpu_stats : null
  const preCpuStats = isRecord(sample.precpu_stats) ? sample.precpu_stats : null
  if (!cpuStats || !preCpuStats) return null
  const cpuUsage = isRecord(cpuStats.cpu_usage) ? cpuStats.cpu_usage : null
  const preCpuUsage = isRecord(preCpuStats.cpu_usage) ? preCpuStats.cpu_usage : null
  if (!cpuUsage || !preCpuUsage) return null
  const total = toFiniteNumber(cpuUsage.total_usage)
  const preTotal = toFiniteNumber(preCpuUsage.total_usage)
  const system = toFiniteNumber(cpuStats.system_cpu_usage)
  const preSystem = toFiniteNumber(preCpuStats.system_cpu_usage)
  if (total === null || preTotal === null || system === null || preSystem === null) return null
  const cpuDelta = total - preTotal
  const systemDelta = system - preSystem
  if (cpuDelta <= 0 || systemDelta <= 0) return null
  const online = toFiniteNumber(cpuStats.online_cpus) ?? toFiniteNumber(cpuUsage.percpu_usage && Array.isArray(cpuUsage.percpu_usage) ? cpuUsage.percpu_usage.length : null) ?? 1
  return (cpuDelta / systemDelta) * Math.max(1, online) * 100
}

/**
 * Extrait des métriques CPU/RAM depuis une réponse Coolify inconnue.
 * Retourne `available: false` si aucune valeur exploitable n'est trouvée.
 */
export function normalizeApplicationMetrics(
  payload: unknown,
  fetchedAt = new Date().toISOString(),
): ApplicationMetrics {
  const sample = extractSample(payload)
  if (!sample) return unavailableMetrics()

  const cpuRaw =
    pickNumber(sample, [
      'cpu',
      'cpu_percent',
      'cpuPercent',
      'cpu_usage',
      'cpuUsage',
      'cpu_percentage',
      'cpuPercentage',
      'cpu_usage_percent',
      'cpuUsagePercent',
    ]) ?? pickNestedNumber(sample, [['cpu', 'usage'], ['cpu', 'percent'], ['cpu', 'percentage']])
  const cpuPercent = clampPercent(normalizePercent(cpuRaw ?? dockerCpuPercent(sample)))

  let memoryUsedMb = pickNumber(sample, [
    'memory_used_mb',
    'memoryUsedMb',
    'mem_used_mb',
    'memUsedMb',
    'used_memory_mb',
  ]) ?? (sample.memory_used_mb ? null : null)
  let memoryLimitMb = pickNumber(sample, [
    'memory_limit_mb',
    'memoryLimitMb',
    'mem_limit_mb',
    'memLimitMb',
    'limit_memory_mb',
  ])

  const usedBytes = pickNumber(sample, [
    'memory_usage',
    'memoryUsage',
    'memory_used',
    'memoryUsed',
    'mem_used',
    'memUsed',
    'used_memory',
    'usedMemory',
  ]) ?? pickNestedNumber(sample, [['memory', 'used'], ['memory', 'usage'], ['memory_stats', 'usage']])
  const limitBytes = pickNumber(sample, [
    'memory_limit',
    'memoryLimit',
    'mem_limit',
    'memLimit',
    'limit_memory',
    'limitMemory',
  ]) ?? pickNestedNumber(sample, [['memory', 'limit'], ['memory_stats', 'limit']])

  // Chaînes avec unités (ex. "512MiB", "1.5GiB") : valeurs en octets.
  if (memoryUsedMb === null) {
    const raw = sample.memory_usage ?? sample.memoryUsage ?? sample.used_memory
    if (typeof raw === 'string') memoryUsedMb = bytesToMb(parseUnitString(raw))
  }
  if (memoryLimitMb === null) {
    const raw = sample.memory_limit ?? sample.memoryLimit ?? sample.limit_memory
    if (typeof raw === 'string') memoryLimitMb = bytesToMb(parseUnitString(raw))
  }

  if (memoryUsedMb === null) memoryUsedMb = bytesToMb(usedBytes)
  if (memoryLimitMb === null) memoryLimitMb = bytesToMb(limitBytes)

  let memoryPercent = pickNumber(sample, [
    'memory_percent',
    'memoryPercent',
    'mem_percent',
    'memPercent',
    'memory_usage_percent',
  ])
  memoryPercent = clampPercent(normalizePercent(memoryPercent))
  if (
    memoryPercent === null &&
    memoryUsedMb !== null &&
    memoryLimitMb !== null &&
    memoryLimitMb > 0
  ) {
    memoryPercent = (memoryUsedMb / memoryLimitMb) * 100
  }

  const sampledAtValue = sample.sampled_at ?? sample.sampledAt ?? sample.timestamp ?? sample.time
  const sampledAt =
    typeof sampledAtValue === 'string' && sampledAtValue.trim() !== '' ? sampledAtValue : fetchedAt

  const restartCount = pickNumber(sample, ['restart_count', 'restartCount'])
  const restartReasonValue = sample.restart_reason ?? sample.restartReason ?? sample.last_restart_reason
  const restartReason = typeof restartReasonValue === 'string' && restartReasonValue.trim() ? restartReasonValue : null
  const statusValue = sample.status ?? sample.state
  const status = typeof statusValue === 'string' && statusValue.trim() ? statusValue : null

  const hasAny =
    cpuPercent !== null ||
    memoryUsedMb !== null ||
    memoryLimitMb !== null ||
    memoryPercent !== null ||
    restartCount !== null ||
    restartReason !== null ||
    status !== null
  if (!hasAny) return unavailableMetrics()

  return {
    available: true,
    cpuPercent: roundMetric(cpuPercent),
    memoryUsedMb: roundMetric(memoryUsedMb),
    memoryLimitMb: roundMetric(memoryLimitMb),
    memoryPercent: roundMetric(memoryPercent),
    sampledAt,
    restartCount: restartCount === null ? null : Math.max(0, Math.round(restartCount)),
    restartReason,
    status,
  }
}
