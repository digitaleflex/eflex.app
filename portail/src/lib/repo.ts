/** « https://github.com/awa/boutique(.git) » → { owner, name } ; null si l'URL n'a pas cette forme. */
export function parseRepo(url: string): { owner: string; name: string } | null {
  const m = /^https?:\/\/(?:www\.)?github\.com\/([^/\s]+)\/([^/\s#?]+?)(?:\.git)?\/?$/i.exec(url.trim())
  return m ? { owner: m[1]!, name: m[2]! } : null
}

/** Nom court affiché dans une carte : « awa/boutique », ou l'URL sans protocole. */
export function repoLabel(url: string): string {
  const repo = parseRepo(url)
  return repo ? `${repo.owner}/${repo.name}` : url.replace(/^https?:\/\//, '')
}
