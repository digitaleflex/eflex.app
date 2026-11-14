/**
 * Lecture d'un fichier `.env` collé ou importé, et fusion dans une liste de lignes d'édition.
 *
 * Module pur (aucune dépendance au navigateur) : partagé par l'éditeur de variables de la création de
 * projet et des paramètres, et testé directement. Les valeurs ne sortent jamais d'ici vers un journal.
 *
 * Formats pris en charge, comme les outils courants (dotenv, Vercel) :
 * - `NOM=valeur`, `export NOM=valeur`, espaces autour du `=` ;
 * - commentaires (`# …`) et commentaire de fin de ligne après une valeur non quotée (` # …`) ;
 * - valeurs entre guillemets simples (littérales) ou doubles (`\n`, `\r`, `\t`, `\"`, `\\` interprétés) ;
 * - valeurs entre guillemets sur plusieurs lignes (clé privée, certificat) ;
 * - BOM UTF-8 et fins de ligne Windows.
 * Les références `${AUTRE}` ne sont pas résolues : elles restent telles quelles dans la valeur.
 */

export const ENV_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

export interface ParsedEnvEntry {
  key: string
  value: string
  /** Numéro de la ligne (1-based) où la variable commence. */
  line: number
}

export interface InvalidEnvLine {
  line: number
  content: string
  reason: string
}

export interface ParsedEnv {
  /** Une entrée par nom ; en cas de doublon, la dernière valeur est conservée. */
  entries: ParsedEnvEntry[]
  invalid: InvalidEnvLine[]
  /** Nombre de noms apparus plusieurs fois dans le texte. */
  duplicates: number
}

const DOUBLE_QUOTE_ESCAPES: Record<string, string> = { n: '\n', r: '\r', t: '\t', '"': '"', '\\': '\\' }

function unescapeDouble(raw: string): string {
  return raw.replace(/\\([nrt"\\])/g, (_, char: string) => DOUBLE_QUOTE_ESCAPES[char] ?? char)
}

/** Tronque un commentaire de fin de ligne (` # …`) d'une valeur non quotée. */
function stripInlineComment(value: string): string {
  const match = /\s#/.exec(value)
  return (match ? value.slice(0, match.index) : value).trimEnd()
}

export function parseEnv(input: string): ParsedEnv {
  const text = input.replace(/^\uFEFF/, '')
  const lines = text.split(/\r?\n/)
  const byKey = new Map<string, ParsedEnvEntry>()
  const invalid: InvalidEnvLine[] = []
  let occurrences = 0

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    const raw = lines[i] ?? ''
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue

    const statement = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
    const eq = statement.indexOf('=')
    if (eq <= 0) {
      invalid.push({ line: lineNumber, content: trimmed.slice(0, 40), reason: 'format invalide (attendu NOM=valeur)' })
      continue
    }
    const key = statement.slice(0, eq).trim()
    if (!ENV_NAME_PATTERN.test(key)) {
      invalid.push({ line: lineNumber, content: key.slice(0, 40), reason: 'nom de variable invalide' })
      continue
    }

    const rest = statement.slice(eq + 1).trimStart()
    let value: string
    const quote = rest[0]
    if (quote === '"' || quote === "'") {
      // Valeur quotée : on cherche le guillemet fermant, éventuellement sur les lignes suivantes.
      let body = rest.slice(1)
      let closed = false
      let cursor = i
      for (;;) {
        let end = -1
        for (let p = 0; p < body.length; p++) {
          if (quote === '"' && body[p] === '\\') {
            p++ // caractère échappé : on saute le suivant
            continue
          }
          if (body[p] === quote) {
            end = p
            break
          }
        }
        if (end >= 0) {
          body = body.slice(0, end)
          closed = true
          break
        }
        cursor++
        if (cursor >= lines.length) break
        body += `\n${lines[cursor] ?? ''}`
      }
      if (!closed) {
        // Guillemet jamais fermé : on garde la ligne telle quelle plutôt que d'avaler tout le fichier.
        value = stripInlineComment(rest)
      } else {
        value = quote === '"' ? unescapeDouble(body) : body
        i = cursor
      }
    } else {
      value = stripInlineComment(rest)
    }

    occurrences++
    byKey.delete(key) // la dernière occurrence prend la place (et l'ordre) de la dernière
    byKey.set(key, { key, value, line: lineNumber })
  }

  return { entries: [...byKey.values()], invalid, duplicates: occurrences - byKey.size }
}

/**
 * Faut-il traiter un texte collé dans un champ « nom » comme un fichier .env ? Oui s'il contient
 * plusieurs lignes ou une affectation `NOM=…` : un simple nom de variable reste une saisie normale.
 */
export function looksLikeEnv(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  if (/\r?\n/.test(trimmed)) return parseEnv(trimmed).entries.length > 0
  return /^(export\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=/.test(trimmed)
}

export interface EnvRow {
  key: string
  value: string
}

/**
 * Fusionne des entrées lues dans les lignes d'édition : une variable déjà présente est mise à jour,
 * les nouvelles prennent d'abord les lignes vides puis s'ajoutent à la fin. Il reste toujours une ligne.
 */
export function mergeEnvRows(rows: readonly EnvRow[], entries: readonly Pick<ParsedEnvEntry, 'key' | 'value'>[]): EnvRow[] {
  const next = rows.map((row) => ({ ...row }))
  for (const entry of entries) {
    const existing = next.find((row) => row.key.trim() === entry.key)
    if (existing) {
      existing.value = entry.value
      continue
    }
    const empty = next.find((row) => row.key.trim() === '' && row.value === '')
    if (empty) {
      empty.key = entry.key
      empty.value = entry.value
    } else {
      next.push({ key: entry.key, value: entry.value })
    }
  }
  return next.length > 0 ? next : [{ key: '', value: '' }]
}

/** Lignes prêtes à enregistrer : noms non vides, sans doublon (la dernière valeur l'emporte). */
export function rowsToVars(rows: readonly EnvRow[]): EnvRow[] {
  const byKey = new Map<string, EnvRow>()
  for (const row of rows) {
    const key = row.key.trim()
    if (key === '') continue
    byKey.delete(key)
    byKey.set(key, { key, value: row.value })
  }
  return [...byKey.values()]
}
