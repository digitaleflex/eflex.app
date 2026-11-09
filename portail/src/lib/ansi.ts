export type AnsiSegment = { text: string; className: string }

// Palette lisible sur fond sombre (contraste ≥ 4,5:1 sur le fond du terminal).
const FG: Record<number, string> = {
  30: 'text-slate-400', 31: 'text-red-300', 32: 'text-green-300', 33: 'text-yellow-300',
  34: 'text-blue-300', 35: 'text-fuchsia-300', 36: 'text-cyan-300', 37: 'text-slate-100',
  90: 'text-slate-400', 91: 'text-red-300', 92: 'text-green-300', 93: 'text-yellow-300',
  94: 'text-blue-300', 95: 'text-fuchsia-300', 96: 'text-cyan-300', 97: 'text-white',
}

// eslint-disable-next-line no-control-regex
const ESC = /\u001b\[([0-9;]*)([A-Za-z])/g

/** Supprime toutes les séquences d'échappement (pour la copie, la recherche, le téléchargement). */
export function stripAnsi(text: string): string {
  return text.replace(ESC, '')
}

/** Découpe une ligne en segments colorés (couleurs SGR de base, gras, atténué). Le reste est ignoré. */
export function parseAnsi(line: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  let fg = ''
  let bold = false
  let dim = false
  let last = 0
  const push = (text: string) => {
    if (!text) return
    segments.push({ text, className: [fg, bold ? 'font-semibold' : '', dim ? 'opacity-70' : ''].filter(Boolean).join(' ') })
  }
  for (const m of line.matchAll(ESC)) {
    push(line.slice(last, m.index))
    last = m.index! + m[0].length
    if (m[2] !== 'm') continue // curseur, effacement… : ignorés
    for (const code of (m[1] === '' ? '0' : m[1]!).split(';').map(Number)) {
      if (code === 0) { fg = ''; bold = false; dim = false }
      else if (code === 1) bold = true
      else if (code === 2) dim = true
      else if (code === 22) { bold = false; dim = false }
      else if (code === 39) fg = ''
      else if (FG[code]) fg = FG[code]!
    }
  }
  push(line.slice(last))
  return segments.length ? segments : [{ text: '', className: '' }]
}
