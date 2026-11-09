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
          .map((e) => ({ text: e.output as string, ts: typeof e.timestamp === 'string' ? e.timestamp : undefined }))
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
