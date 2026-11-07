// Limiteur de débit en mémoire (fenêtre glissante). Suffisant pour une seule instance ;
// à remplacer par Redis si le portail tourne sur plusieurs instances.
const hits = new Map<string, number[]>()

/** Retourne true si l'appel est autorisé, et le comptabilise. */
export function allow(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) {
    hits.set(key, recent)
    return false
  }
  recent.push(now)
  hits.set(key, recent)

  // Évite que la table grossisse indéfiniment.
  if (hits.size > 5_000) {
    for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k)
  }
  return true
}
