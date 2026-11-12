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

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
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
  for (const key of ['metrics', 'data', 'stats', 'usage', 'resources', 'current']) {
    const nested = payload[key]
    if (Array.isArray(nested)) {
      const last = [...nested].reverse().find(isRecord)
      if (last) return last
    }
    if (isRecord(nested)) return nested
  }
  return payload
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
    pickNumber(sample, ['cpu', 'cpu_percent', 'cpuPercent', 'cpu_usage', 'cpuUsage', 'cpu_percentage'])
  const cpuPercent = clampPercent(normalizePercent(cpuRaw))

  let memoryUsedMb = pickNumber(sample, [
    'memory_used_mb',
    'memoryUsedMb',
    'mem_used_mb',
    'memUsedMb',
    'used_memory_mb',
  ])
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
  ])
  const limitBytes = pickNumber(sample, [
    'memory_limit',
    'memoryLimit',
    'mem_limit',
    'memLimit',
    'limit_memory',
    'limitMemory',
  ])

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
