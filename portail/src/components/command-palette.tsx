'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Bell, CornerDownLeft, FolderKanban, Globe, Moon, Plus, Rocket, ScrollText, Search, UserPlus, Users } from 'lucide-react'
import { applyTheme, readTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

type Item = {
  id: string
  label: string
  hint?: string
  href?: string
  action?: 'theme' | 'redeploy'
  group: 'Actions' | 'Projets'
  icon?: React.ComponentType<{ className?: string }>
  projectId?: string
  projectName?: string
}

const ACTIONS: Item[] = [
  { id: 'new', label: 'Nouveau projet', hint: 'Importer un dépôt GitHub', href: '/dashboard/new', group: 'Actions', icon: Plus },
  { id: 'projects', label: 'Projets', href: '/dashboard', group: 'Actions', icon: FolderKanban },
  { id: 'activity', label: 'Activité', hint: 'Tous les déploiements', href: '/dashboard/activity', group: 'Actions', icon: Activity },
  { id: 'team', label: 'Équipe', hint: 'Membres et invitations', href: '/dashboard/organization', group: 'Actions', icon: Users },
  { id: 'invite', label: 'Inviter un membre', hint: 'Depuis la page Équipe', href: '/dashboard/organization', group: 'Actions', icon: UserPlus },
  { id: 'notifications', label: 'Notifications', hint: 'Et préférences', href: '/dashboard/notifications', group: 'Actions', icon: Bell },
  { id: 'theme', label: 'Changer de thème', hint: 'Clair / sombre', action: 'theme', group: 'Actions', icon: Moon },
]

/** Bouton de recherche + palette de commandes (⌘K / Ctrl+K). Motif combobox accessible. */
export function CommandPalette({ className, hotkey = true }: { className?: string; hotkey?: boolean }) {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [projectItems, setProjectItems] = useState<Item[]>([])
  const [pendingRedeploy, setPendingRedeploy] = useState<{ id: string; name: string } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [redeploying, setRedeploying] = useState(false)
  const listId = useId()
  const [isMac, setIsMac] = useState(true)

  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), [])

  const show = useCallback(() => {
    setOpen(true)
    setQuery('')
    setPendingRedeploy(null)
    setActionError(null)
  }, [])
  const hide = useCallback(() => {
    setOpen(false)
    setPendingRedeploy(null)
    setActionError(null)
  }, [])

  useEffect(() => {
    if (!hotkey) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => {
          const next = !o
          if (!next) {
            setPendingRedeploy(null)
            setActionError(null)
          } else {
            setQuery('')
          }
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hotkey])

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      setQuery('')
      setActive(0)
      setPendingRedeploy(null)
      setActionError(null)
      d.showModal()
      inputRef.current?.focus()
      fetch('/api/projects')
        .then((r) => (r.ok ? r.json() : { projects: [], canManage: false }))
        .then((data: {
          canManage?: boolean
          projects?: { id: string; name: string; domain: string | null; apps?: { id: string; name?: string; position: number; domain?: string | null }[] }[]
        }) => {
          const canManage = data.canManage === true
          const items: Item[] = []
          for (const p of data.projects ?? []) {
            const primary = p.apps?.slice().sort((a, b) => a.position - b.position || (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id))[0]
            const domain = primary?.domain ?? p.domain ?? null
            items.push({ id: `project:${p.id}`, label: p.name, hint: domain ?? undefined, href: `/dashboard/projects/${p.id}`, group: 'Projets', icon: FolderKanban })
            if (canManage) {
              items.push({
                id: `project:${p.id}:redeploy`,
                label: `Redéployer ${p.name}`,
                hint: p.name,
                action: 'redeploy',
                group: 'Projets',
                icon: Rocket,
                projectId: p.id,
                projectName: p.name,
              })
              items.push({
                id: `project:${p.id}:logs`,
                label: `Voir les journaux de ${p.name}`,
                hint: p.name,
                href: `/dashboard/projects/${p.id}?tab=deployments`,
                group: 'Projets',
                icon: ScrollText,
              })
              items.push({
                id: `project:${p.id}:domain`,
                label: `Ajouter un domaine à ${p.name}`,
                hint: p.name,
                href: `/dashboard/projects/${p.id}/settings#domaines`,
                group: 'Projets',
                icon: Globe,
              })
            }
          }
          setProjectItems(items)
        })
        .catch(() => undefined)
    }
    if (!open && d.open) d.close()
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (i: Item) => !q || i.label.toLowerCase().includes(q) || (i.hint ?? '').toLowerCase().includes(q) || (i.projectName ?? '').toLowerCase().includes(q)
    const matchedProjects = projectItems.filter(match)
    const matchedActions = ACTIONS.filter(match)
    return q ? [...matchedProjects, ...matchedActions] : [...matchedProjects.slice(0, 12), ...matchedActions]
  }, [query, projectItems])

  useEffect(() => setActive(0), [query])

  const confirmRedeploy = async () => {
    if (!pendingRedeploy) return
    setActionError(null)
    setRedeploying(true)
    try {
      const res = await fetch(`/api/projects/${pendingRedeploy.id}/redeploy`, { method: 'POST' })
      if (res.status === 202 || res.ok) {
        hide()
        router.push(`/dashboard/projects/${pendingRedeploy.id}?tab=deployments`)
        return
      }
      const data = await res.json().catch(() => ({} as { error?: string }))
      setActionError(data.error || 'Impossible de relancer le déploiement.')
    } catch {
      setActionError('Impossible de relancer le déploiement.')
    } finally {
      setRedeploying(false)
    }
  }

  const go = async (item: Item | undefined) => {
    if (!item) return
    if (item.action === 'theme') {
      hide()
      const current = readTheme()
      const resolved =
        current === 'dark'
          ? 'light'
          : current === 'light'
            ? 'dark'
            : window.matchMedia('(prefers-color-scheme: dark)').matches
              ? 'light'
              : 'dark'
      applyTheme(resolved)
      return
    }
    if (item.action === 'redeploy' && item.projectId) {
      const name = item.projectName ?? item.label
      setPendingRedeploy({ id: item.projectId, name })
      setActionError(null)
      return
    }
    if (item.href) {
      hide()
      router.push(item.href)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className={cn(
          'flex h-11 min-w-11 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          className ?? 'sm:w-56',
        )}
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Rechercher…</span>
        <span className="sr-only sm:hidden">Rechercher</span>
        <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 font-sans text-[11px] sm:inline">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Palette de commandes"
        onCancel={(e) => { e.preventDefault(); hide() }}
        onClick={(e) => { if (e.target === dialogRef.current) hide() }}
        className="m-auto mt-[12vh] w-[calc(100%-2rem)] max-w-xl overflow-hidden rounded-xl border border-border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-black/40"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${results[active]!.id}` : undefined}
            aria-label="Rechercher un projet ou une action"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPendingRedeploy(null); setActionError(null) }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              if (e.key === 'Enter') {
                e.preventDefault()
                if (pendingRedeploy) void confirmRedeploy()
                else void go(results[active])
              }
            }}
            placeholder="Rechercher un projet ou une action…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        </div>
        {pendingRedeploy && (
          <div className="border-b border-border bg-muted/40 px-4 py-3">
            <p className="text-sm font-medium">Relancer le déploiement de « {pendingRedeploy.name} » ?</p>
            <p className="mt-1 text-xs text-muted-foreground">Cette action crée un nouveau déploiement pour le projet.</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void confirmRedeploy()}
                disabled={redeploying}
                className="inline-flex h-9 items-center rounded-lg bg-foreground px-3 text-sm font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 [@media(pointer:coarse)]:h-11"
              >
                {redeploying ? 'Redéploiement…' : 'Confirmer'}
              </button>
              <button
                type="button"
                onClick={() => { setPendingRedeploy(null); setActionError(null); inputRef.current?.focus() }}
                disabled={redeploying}
                className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 [@media(pointer:coarse)]:h-11"
              >
                Annuler
              </button>
            </div>
            {actionError && (
              <p role="alert" className="mt-2 text-sm text-destructive">{actionError}</p>
            )}
          </div>
        )}
        <ul id={listId} role="listbox" aria-label="Résultats" className="max-h-80 overflow-auto p-2">
          {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun résultat pour « {query} »</li>}
          {results.map((item, i) => {
            const Icon = item.icon ?? FolderKanban
            const header = i === 0 || results[i - 1]!.group !== item.group
            return (
              <li key={`${item.group}-${item.id}`} role="presentation">
                {header && <p role="presentation" className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{item.group}</p>}
                <div
                  id={`${listId}-${item.id}`}
                  role="option"
                  aria-selected={i === active}
                  onMouseMove={() => setActive(i)}
                  onClick={() => void go(item)}
                  className={cn('flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm', i === active ? 'bg-muted text-foreground' : 'text-foreground/90')}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="truncate font-medium">{item.label}</span>
                  {item.hint && <span className="truncate text-xs text-muted-foreground">{item.hint}</span>}
                  {i === active && <CornerDownLeft className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                </div>
              </li>
            )
          })}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[11px] text-muted-foreground">↑ ↓ pour naviguer · Entrée pour ouvrir · Échap pour fermer</p>
      </dialog>
    </>
  )
}
