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
      ? 'bg-green-400 animate-pulse motion-reduce:animate-none'
      : state === 'done'
        ? 'bg-slate-400'
        : state === 'error'
          ? 'bg-red-400'
          : 'bg-yellow-300'

  const serverDropped = typeof stats?.dropped === 'number' ? stats.dropped : 0
  const truncated = typeof stats?.truncatedLines === 'number' ? stats.truncatedLines : 0
  const suspicious = typeof stats?.suspiciousLines === 'number' ? stats.suspiciousLines : 0
  const windowRange =
    typeof stats?.windowStart === 'number' && typeof stats?.windowEnd === 'number'
      ? `${stats.windowStart + 1}–${stats.windowEnd + 1}`
      : null
  const degraded = state === 'reconnecting' || state === 'error' || !!notice

  return (
    <section aria-label={label} className={`overflow-hidden rounded-xl border border-slate-700 bg-[#0b1220] text-slate-100 ${className ?? ''}`}>
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-700 px-3 py-2">
        <span className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${dot}`} />
          {STATE_LABEL[state]}
        </span>
        <span className="text-xs text-slate-400">· {visible.length}{term ? ` / ${lines.length}` : ''} ligne{visible.length > 1 ? 's' : ''}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <label htmlFor={searchId} className="sr-only">Filtrer les lignes du journal</label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filtrer…"
            className="h-8 w-32 rounded-md border border-slate-600 bg-slate-900 px-2 text-xs text-slate-100 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 [@media(pointer:coarse)]:h-11"
          />
          <Button variant="ghost" size="sm" className="text-slate-200 hover:bg-slate-800 hover:text-white" onClick={() => setFollow((f) => !f)} aria-pressed={follow}>
            {follow ? <Pause className="h-3.5 w-3.5" aria-hidden="true" /> : <Play className="h-3.5 w-3.5" aria-hidden="true" />}
            {follow ? 'Suivi actif' : 'Suivi en pause'}
          </Button>
          <Button variant="ghost" size="sm" className="text-slate-200 hover:bg-slate-800 hover:text-white" onClick={copy} disabled={lines.length === 0}>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />{copied ? 'Copié' : 'Copier'}
          </Button>
          <Button variant="ghost" size="sm" className="text-slate-200 hover:bg-slate-800 hover:text-white" onClick={download} disabled={lines.length === 0} title="Télécharger les lignes actuellement affichées">
            <Download className="h-3.5 w-3.5" aria-hidden="true" />Visible
          </Button>
          {downloadUrl && (
            <a
              href={downloadUrl}
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 [@media(pointer:coarse)]:h-11"
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
        <div className="flex flex-wrap gap-x-3 gap-y-1 border-b border-slate-700 bg-slate-900/60 px-3 py-1.5 text-[11px] text-slate-300">
          {hint && <span>{hint}</span>}
          {windowRange && <span className="tabular-nums">Fenêtre serveur : lignes {windowRange}</span>}
          {serverDropped > 0 && <span className="tabular-nums text-yellow-200">Omises (débit) : {serverDropped}</span>}
          {truncated > 0 && <span className="tabular-nums text-yellow-200">Lignes tronquées : {truncated}</span>}
          {suspicious > 0 && (
            <span className="inline-flex items-center gap-1 text-yellow-200">
              <AlertTriangle className="h-3 w-3" aria-hidden="true" />
              <span className="tabular-nums">Motifs sensibles détectés : {suspicious}</span>
            </span>
          )}
        </div>
      )}
      {state === 'reconnecting' && (
        <p role="status" className="border-b border-slate-700 bg-yellow-950/40 px-3 py-1.5 text-xs text-yellow-200">
          Connexion interrompue : tentative de reconnexion automatique au flux de journaux…
        </p>
      )}
      {notice && <p role="alert" className="border-b border-slate-700 bg-yellow-950/60 px-3 py-1.5 text-xs text-yellow-200">{notice}</p>}
      {state === 'error' && (
        <p role="alert" className="border-b border-slate-700 bg-red-950/60 px-3 py-1.5 text-xs text-red-200">
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
        className="max-h-96 min-h-40 overflow-auto p-3 font-mono text-xs leading-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400"
      >
        {dropped > 0 && (
          <p className="mb-2 text-slate-400">
            … {dropped} ligne{dropped > 1 ? 's' : ''} plus ancienne{dropped > 1 ? 's' : ''} retirée{dropped > 1 ? 's' : ''} du tampon d&apos;affichage (limite {5_000} lignes). Utilisez le téléchargement pour conserver une fenêtre récente.
          </p>
        )}
        {lines.length === 0 ? (
          <p className="text-slate-400">
            {state === 'done'
              ? 'Aucune ligne de journal disponible.'
              : state === 'error'
                ? 'Flux indisponible.'
                : 'En attente des premières lignes…'}
          </p>
        ) : visible.length === 0 ? (
          <p className="text-slate-400">Aucune ligne ne contient « {query} ».</p>
        ) : (
          visible.map((l) => (
            <div key={l.n} className="flex gap-3 whitespace-pre-wrap break-all">
              <span aria-hidden="true" className="w-10 shrink-0 select-none text-right tabular-nums text-slate-500">{l.n + 1}</span>
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
          className="flex w-full items-center justify-center gap-2 border-t border-slate-700 bg-slate-900 px-3 py-2 text-xs font-medium text-sky-300 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sky-400 [@media(pointer:coarse)]:min-h-11"
        >
          <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden="true" />Reprendre le suivi en direct
        </button>
      )}
    </section>
  )
}
