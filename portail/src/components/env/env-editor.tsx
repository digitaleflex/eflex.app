'use client'

import { useId, useRef, useState } from 'react'
import { ClipboardPaste, Eye, EyeOff, FileUp, Plus, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ENV_NAME_PATTERN, looksLikeEnv, mergeEnvRows, parseEnv, rowsToVars, type EnvRow } from '@/lib/env-parse'
import { ENV_BULK_MAX } from '@/lib/project-settings'

const FILE_MAX_BYTES = 1_000_000

type Notice = { tone: 'success' | 'error'; message: string } | null

/**
 * Éditeur de variables d'environnement « collez tout ».
 *
 * - Coller un `.env` (ou une seule ligne `NOM=valeur`) dans n'importe quel champ « Nom » remplit tous
 *   les champs d'un coup ; « Coller un .env » ouvre une zone de texte pour les appareils où le collage
 *   direct est malaisé ; un fichier `.env` se dépose sur le cadre ou se choisit avec « Importer un fichier ».
 * - Les valeurs sont masquées (chiffrées côté serveur, jamais relues) ; « Afficher les valeurs » ne
 *   concerne que ce qui est en cours de saisie dans cette page.
 * - Contrôlé : la page garde les lignes (`rows`) et décide de les enregistrer.
 */
export function EnvEditor({
  rows,
  onChange,
  existingKeys,
  disabled,
}: {
  rows: EnvRow[]
  onChange: (rows: EnvRow[]) => void
  /** Noms déjà enregistrés dans la portée visée : leur ligne est marquée « remplacera la valeur ». */
  existingKeys?: ReadonlySet<string>
  disabled?: boolean
}) {
  const uid = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [revealed, setRevealed] = useState(false)
  const [pasteOpen, setPasteOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')
  const [notice, setNotice] = useState<Notice>(null)
  const [dragging, setDragging] = useState(false)

  const setRow = (index: number, patch: Partial<EnvRow>) =>
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  const apply = (text: string): boolean => {
    const parsed = parseEnv(text)
    if (parsed.entries.length === 0) {
      setNotice({
        tone: 'error',
        message: 'Aucune variable reconnue. Chaque ligne doit être de la forme NOM=valeur.',
      })
      return false
    }
    const merged = mergeEnvRows(rows, parsed.entries)
    if (rowsToVars(merged).length > ENV_BULK_MAX) {
      setNotice({ tone: 'error', message: `Trop de variables d’un coup (${ENV_BULK_MAX} maximum).` })
      return false
    }
    onChange(merged)
    const count = parsed.entries.length
    const ignored = parsed.invalid.length
    setNotice({
      tone: 'success',
      message:
        `${count} variable${count > 1 ? 's' : ''} reconnue${count > 1 ? 's' : ''}, à vérifier ci-dessous.` +
        (ignored > 0 ? ` ${ignored} ligne${ignored > 1 ? 's' : ''} ignorée${ignored > 1 ? 's' : ''} (format invalide).` : ''),
    })
    return true
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    if (file.size > FILE_MAX_BYTES) {
      setNotice({ tone: 'error', message: 'Ce fichier est trop volumineux pour un fichier .env (1 Mo maximum).' })
      return
    }
    try {
      apply(await file.text())
    } catch {
      setNotice({ tone: 'error', message: 'Impossible de lire ce fichier.' })
    }
  }

  const filled = rowsToVars(rows).length

  return (
    <div
      onDragOver={(event) => {
        if (disabled || !event.dataTransfer.types.includes('Files')) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        if (disabled || !event.dataTransfer.files.length) return
        event.preventDefault()
        setDragging(false)
        void readFile(event.dataTransfer.files[0])
      }}
      className={
        dragging
          ? 'space-y-3 rounded-xl border-2 border-dashed border-primary bg-primary/5 p-3 transition-colors'
          : 'space-y-3 rounded-xl border-2 border-dashed border-transparent p-3 transition-colors'
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => setPasteOpen((open) => !open)} aria-expanded={pasteOpen} disabled={disabled}>
          <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
          Coller un .env
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={disabled}>
          <FileUp className="h-4 w-4" aria-hidden="true" />
          Importer un fichier
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".env,text/plain,.txt"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choisir un fichier .env"
          onChange={(event) => {
            void readFile(event.target.files?.[0])
            event.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ml-auto"
          aria-pressed={revealed}
          onClick={() => setRevealed((value) => !value)}
        >
          {revealed ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
          {revealed ? 'Masquer les valeurs' : 'Afficher les valeurs'}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Astuce : collez directement tout votre <code className="font-mono">.env</code> dans un champ « Nom », ou
        déposez le fichier ici. Les champs se remplissent tout seuls.
      </p>

      {pasteOpen && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
          <label htmlFor={`${uid}-paste`} className="block text-sm font-medium">
            Contenu du .env
          </label>
          <textarea
            id={`${uid}-paste`}
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            autoFocus
            placeholder={'DATABASE_URL=postgres://…\nAPI_KEY="valeur"\n# les commentaires sont ignorés'}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setPasteOpen(false); setPasteText('') }}>
              Annuler
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pasteText.trim() === ''}
              onClick={() => {
                if (apply(pasteText)) {
                  setPasteOpen(false)
                  setPasteText('')
                }
              }}
            >
              Remplir les champs
            </Button>
          </div>
        </div>
      )}

      <div role="status" aria-live="polite" className="min-h-0">
        {notice && (
          <p
            className={
              notice.tone === 'success'
                ? 'rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm'
                : 'rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive'
            }
          >
            {notice.message}
          </p>
        )}
      </div>

      <ul className="space-y-2">
        {rows.map((row, index) => {
          const key = row.key.trim()
          const invalid = key !== '' && !ENV_NAME_PATTERN.test(key)
          const multiline = row.value.includes('\n')
          const replaces = key !== '' && !invalid && existingKeys?.has(key)
          return (
            <li key={index} className="space-y-1">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-start gap-2">
                <Input
                  aria-label={`Nom de la variable ${index + 1}`}
                  placeholder="NOM_DE_LA_VARIABLE"
                  autoComplete="off"
                  spellCheck={false}
                  value={row.key}
                  disabled={disabled}
                  error={invalid ? 'Lettres, chiffres et « _ », sans commencer par un chiffre.' : undefined}
                  onChange={(event) => setRow(index, { key: event.target.value })}
                  onPaste={(event) => {
                    const text = event.clipboardData.getData('text')
                    if (!looksLikeEnv(text)) return
                    event.preventDefault()
                    apply(text)
                  }}
                  className="font-mono"
                />
                {multiline ? (
                  <div className="flex h-11 min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-muted/40 px-3 text-sm text-muted-foreground">
                    <span>Valeur sur {row.value.split('\n').length} lignes</span>
                    <button
                      type="button"
                      onClick={() => setRow(index, { value: '' })}
                      className="min-h-11 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Effacer
                    </button>
                  </div>
                ) : (
                  <Input
                    aria-label={`Valeur de la variable ${index + 1}`}
                    placeholder="valeur"
                    type={revealed ? 'text' : 'password'}
                    autoComplete="new-password"
                    spellCheck={false}
                    value={row.value}
                    disabled={disabled}
                    onChange={(event) => setRow(index, { value: event.target.value })}
                    className="font-mono"
                  />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  type="button"
                  onClick={() => onChange(rows.length === 1 ? [{ key: '', value: '' }] : rows.filter((_, i) => i !== index))}
                  disabled={disabled || (rows.length === 1 && row.key === '' && row.value === '')}
                  aria-label={`Supprimer la ligne ${index + 1}`}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
              {replaces && (
                <p className="pl-1 text-xs text-muted-foreground">Existe déjà : cette valeur remplacera l’ancienne.</p>
              )}
            </li>
          )
        })}
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange([...rows, { key: '', value: '' }])} disabled={disabled}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Ajouter une variable
        </Button>
        <p className="text-xs text-muted-foreground tabular-nums">
          {filled} variable{filled > 1 ? 's' : ''} à enregistrer
        </p>
      </div>
    </div>
  )
}
