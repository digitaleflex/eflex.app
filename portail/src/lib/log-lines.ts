/** Une ligne de journal prête à être affichée. `n` est son rang (stable : sert de curseur de reprise). */
export type LogLine = { n: number; text: string; ts?: string }

type Json = Record<string, unknown>
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null

/**
 * Transforme le champ `logs` de Coolify (JSON d'entrées `{ output, timestamp, hidden }` ou texte
 * brut) en lignes ordonnées. Les entrées « hidden » (détails internes) sont écartées.
 * Le journal de Coolify est en ajout seul : le rang d'une ligne ne change pas d'un appel à l'autre.
 */
export function parseLogs(logs: string | undefined): LogLine[] {
  if (!logs) return []
  let entries: { text: string; ts?: string }[]
  try {
    const parsed: unknown = JSON.parse(logs)
    entries = Array.isArray(parsed)
      ? parsed
          .filter((e): e is Json => isRecord(e) && e.hidden !== true && typeof e.output === 'string')
          .map((e) => ({
              text: e.output as string,
              ts: typeof e.timestamp === 'string' ? e.timestamp : undefined,
            }))
      : [{ text: logs }]
  } catch {
    entries = [{ text: logs }]
  }
  const lines: LogLine[] = []
  for (const entry of entries) {
    for (const raw of entry.text.split('\n')) {
      const text = raw.trimEnd()
      if (text !== '') lines.push({ n: lines.length, text, ...(entry.ts ? { ts: entry.ts } : {}) })
    }
  }
  return lines
}

/** Remplace chaque secret connu (≥ 4 caractères) par `***`, les plus longs d'abord. */
export function maskSecrets(text: string, secrets: readonly string[]): string {
  let out = text
  for (const secret of [...new Set(secrets)].filter((s) => s.length >= 4).sort((a, b) => b.length - a.length)) {
    out = out.split(secret).join('***')
  }
  return out
}

// Motifs génériques (meilleur effort) : ne jamais renvoyer la valeur correspondante.
const SUSPICIOUS_SECRET_PATTERNS: RegExp[] = [
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/,
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9\-._~+/]{20,}={0,2}\b/i,
  /\b(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}/i,
]

/**
 * Indique si une ligne semble contenir un secret non connu (détection prudente).
 * Ne renvoie jamais la valeur suspecte : sert uniquement à afficher un avertissement.
 */
export function hasPossibleSecret(text: string): boolean {
  return SUSPICIOUS_SECRET_PATTERNS.some((pattern) => pattern.test(text))
}

export function collectProjectSecretValues(
  envVars: readonly { key: string; value: string; appId?: string | null }[],
  projectId: string,
  targetAppId: string | null,
  decryptFn: (value: string, aad: string) => string,
): string[] {
  const secrets: string[] = []
  for (const variable of envVars) {
    if (variable.appId && targetAppId && variable.appId !== targetAppId) continue
    try {
      secrets.push(decryptFn(variable.value, `${projectId}:${variable.key}`))
    } catch {
      /* valeur illisible */
    }
  }
  return secrets
}

