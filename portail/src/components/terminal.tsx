'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowDownToLine, Copy, Download, FileDown, Pause, Play } from 'lucide-react'
import { parseAnsi, stripAnsi } from '@/lib/ansi'
import { useLogStream, type StreamState } from '@/hooks/use-log-stream'
import { Button } from '@/components/ui/button'

const STATE_LABEL: Record<StreamState, string> = {
  connecting: 'Connexion…',
  live: 'En direct',
  reconnecting: 'Reconnexion…',
  done: 'Terminé',
  error: 'Flux indisponible',
}
const STATUS_LABEL: Record<string, string> = {
  live: 'Déploiement terminé : en ligne.',
  failed: 'Le déploiement a échoué.',
  rollbacked: 'Le déploiement a été annulé.',
}

type TerminalProps = {
  /** URL du flux SSE. `null` : rien n'est ouvert. */
  url: string | null
  /** Nom accessible du journal. */
  label: string
  /** URL de téléchargement d'une fenêtre récente masquée (optionnel, plus complet que le tampon affiché). */
  downloadUrl?: string | null
  /** Aide contextuelle affichée sous la barre d'outils. */
  hint?: string
  /** Appelé quand le flux annonce un état final (pour rafraîchir la page). */
  onFinished?: (status: string) => void
  className?: string
}

export function Terminal({ url, label, downloadUrl, hint, onFinished, className }: TerminalProps) {
  const { lines, state, status, notice, dropped, stats } = useLogStream(url)
  const [follow, setFollow] = useState(true)
  const [query, setQuery] = useState('')
  const [copied, setCopied] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const searchId = useId()

  const term = query.trim().toLowerCase()
  const visible = useMemo(() => (term ? lines.filter((l) => stripAnsi(l.text).toLowerCase().includes(term)) : lines), [lines, term])

  // Suivi automatique du bas ; il s'arrête dès que l'utilisateur remonte lui-même.
  useEffect(() => {
    const el = bodyRef.current
    if (follow && el) el.scrollTop = el.scrollHeight
  }, [visible, follow])

  useEffect(() => {
    if (status && status in STATUS_LABEL) onFinished?.(status)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const onScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24
    setFollow(atBottom)
  }
  const plain = () => lines.map((l) => stripAnsi(l.text)).join('\n')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plain())
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* presse-papiers refusé : le téléchargement reste possible */
    }
  }
  const download = () => {
    const blob = new Blob([plain() + '\n'], { type: 'text/plain;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.log`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const dot =
    state === 'live'
      ? 'bg-terminal-live animate-pulse motion-reduce:animate-none'
      : state === 'done'
        ? 'bg-terminal-done'
        : state === 'error'
          ? 'bg-terminal-error'
          : 'bg-terminal-warn'

  const serverDropped = typeof stats?.dropped === 'number' ? stats.dropped : 0
  const truncated = typeof stats?.truncatedLines === 'number' ? stats.truncatedLines : 0
  const suspicious = typeof stats?.suspiciousLines === 'number' ? stats.suspiciousLines : 0
  const windowRange =
    typeof stats?.windowStart === 'number' && typeof stats?.windowEnd === 'number'
      ? `${stats.windowStart + 1}–${stats.windowEnd + 1}`
      : null
  const degraded = state === 'reconnecting' || state === 'error' || !!notice

  return (
    <section aria-label={label} className={`overflow-hidden rounded-xl border border-terminal-border bg-terminal text-terminal-foreground ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-terminal-border px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-medium text-terminal-muted-foreground">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
          {STATE_LABEL[state]}
        </span>
        <span className="text-xs text-terminal-muted-foreground">· {visible.length}{term ? ` / ${lines.length}` : ''} ligne{visible.length > 1 ? 's' : ''}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <label htmlFor={searchId} className="sr-only">Filtrer les lignes du journal</label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer…"
            className="h-8 w-32 rounded-md border border-terminal-border bg-terminal-muted px-2 text-xs text-terminal-foreground placeholder:text-terminal-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent [@media(pointer:coarse)]:h-11"
          />
          <Button variant="ghost" size="sm" className="text-terminal-foreground hover:bg-terminal-muted hover:text-terminal-foreground" onClick={() => setFollow((f) => !f)} aria-pressed={follow}>
            {follow ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
            {follow ? 'Suivi actif' : 'Suivi en pause'}
          </Button>
          <Button variant="ghost" size="sm" className="text-terminal-foreground hover:bg-terminal-muted hover:text-terminal-foreground" onClick={copy} disabled={lines.length === 0}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />{copied ? 'Copié' : 'Copier'}
          </Button>
          <Button variant="ghost" size="sm" className="text-terminal-foreground hover:bg-terminal-muted hover:text-terminal-foreground" onClick={download} disabled={lines.length === 0} title="Télécharger les lignes actuellement affichées">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />Visible
          </Button>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-terminal-foreground hover:bg-terminal-muted hover:text-terminal-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-terminal-accent [@media(pointer:coarse)]:h-11"
              title="Télécharger la fenêtre récente masquée depuis le serveur"
            >
              <FileDown className="h-3.5 w-3.5" aria-hidden="true" />Fenêtre
            </a>
          )}
        </div>
      </div>

      {/* Annonces pour lecteur d'écran : l'état, jamais chaque ligne. */}
      <p className="sr-only" role="status">{status && STATUS_LABEL[status] ? STATUS_LABEL[status] : STATE_LABEL[state]}</p>
      {(hint || windowRange || serverDropped > 0 || truncated > 0 || suspicious > 0) && (
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-terminal-border bg-terminal-muted/60 px-3 py-1.5 text-xs text-terminal-muted-foreground">
          {hint && <span>{hint}</span>}
          {windowRange && <span className="tabular-nums">Fenêtre serveur : lignes {windowRange}</span>}
          {serverDropped > 0 && <span className="tabular-nums text-terminal-warn">Omises (débit) : {serverDropped}</span>}
          {truncated > 0 && <span className="tabular-nums text-terminal-warn">Lignes tronquées : {truncated}</span>}
          {suspicious > 0 && (
            <span className="inline-flex items-center gap-1 text-terminal-warn">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              <span className="tabular-nums">Motifs sensibles détectés : {suspicious}</span>
            </span>
          )}
        </div>
      )}
      {state === 'reconnecting' && (
        <p role="status" className="border-b border-terminal-border bg-terminal-warn-surface/40 px-3 py-1.5 text-xs text-terminal-warn">
          Connexion interrompue : tentative de reconnexion automatique au flux de journaux…
        </p>
      )}
      {notice && <p role="alert" className="border-b border-terminal-border bg-terminal-warn-surface/60 px-3 py-1.5 text-xs text-terminal-warn">{notice}</p>}
      {state === 'error' && (
        <p role="alert" className="border-b border-terminal-border bg-terminal-error-surface/60 px-3 py-1.5 text-xs text-terminal-error">
          Impossible d&apos;ouvrir les journaux. Rechargez la page ; si le problème persiste, vérifiez que vous avez encore accès à ce projet ou que le flux est disponible.
        </p>
      )}
      {state === 'live' && degraded && <span className="sr-only">Flux dégradé : certaines informations peuvent manquer.</span>}

      <div
        ref={bodyRef}
        onScroll={onScroll}
        role="log"
        aria-live="off"
        aria-relevant="additions"
        aria-label={`${label} (${lines.length} lignes affichées${dropped > 0 ? `, ${dropped} retirées du tampon` : ''})`}
        tabIndex={0}
        className="max-h-96 min-h-40 overflow-auto p-3 font-mono text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-terminal-accent"
      >
        {dropped > 0 && (
          <p className="mb-2 text-terminal-muted-foreground">
            … {dropped} ligne{dropped > 1 ? 's' : ''} plus ancienne{dropped > 1 ? 's' : ''} retirée{dropped > 1 ? 's' : ''} du tampon d&apos;affichage (limite {5_000} lignes). Utilisez le téléchargement pour conserver une fenêtre récente.
          </p>
        )}
        {lines.length === 0 ? (
          <p className="text-terminal-muted-foreground">
            {state === 'done'
              ? 'Aucune ligne de journal disponible.'
              : state === 'error'
                ? 'Flux indisponible.'
                : 'En attente des premières lignes…'}
          </p>
        ) : visible.length === 0 ? (
          <p className="text-terminal-muted-foreground">Aucune ligne ne contient « {query} ».</p>
        ) : (
          visible.map((l) => (
            <div key={l.n} className="flex gap-3 whitespace-pre-wrap break-all">
              <span aria-hidden="true" className="w-10 shrink-0 select-none text-right tabular-nums text-terminal-line-number">{l.n + 1}</span>
              <span className="min-w-0 flex-1">
                {parseAnsi(l.text).map((s, i) => (
                  <span key={i} className={s.className}>{s.text}</span>
                ))}
              </span>
            </div>
          ))
        )}
      </div>
      {!follow && lines.length > 0 && (
        <button
          type="button"
          onClick={() => setFollow(true)}
          className="flex w-full items-center justify-center gap-2 border-t border-terminal-border bg-terminal-muted px-3 py-2 text-xs font-medium text-terminal-accent hover:bg-terminal-muted/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-terminal-accent [@media(pointer:coarse)]:min-h-11"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />Reprendre le suivi en direct
        </button>
      )}
    </section>
  )
}
