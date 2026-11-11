'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, Bell, CornerDownLeft, FolderKanban, Plus, Search, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

type Item = { id: string; label: string; hint?: string; href: string; group: 'Actions' | 'Projets'; icon?: React.ComponentType<{ className?: string }> }

const ACTIONS: Item[] = [
  { id: 'new', label: 'Nouveau projet', hint: 'Importer un dépôt GitHub', href: '/dashboard/new', group: 'Actions', icon: Plus },
  { id: 'projects', label: 'Projets', href: '/dashboard', group: 'Actions', icon: FolderKanban },
  { id: 'activity', label: 'Activité', hint: 'Tous les déploiements', href: '/dashboard/activity', group: 'Actions', icon: Activity },
  { id: 'team', label: 'Équipe', hint: 'Membres et invitations', href: '/dashboard/organization', group: 'Actions', icon: Users },
  { id: 'notifications', label: 'Notifications', hint: 'Et préférences', href: '/dashboard/notifications', group: 'Actions', icon: Bell },
]

/** Bouton de recherche + palette de commandes (⌘K / Ctrl+K). Motif combobox accessible. */
export function CommandPalette() {
  const router = useRouter()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [projects, setProjects] = useState<Item[]>([])
  const listId = useId()
  const [isMac, setIsMac] = useState(true)

  useEffect(() => setIsMac(/Mac|iPhone|iPad/.test(navigator.platform)), [])

  const show = useCallback(() => setOpen(true), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      setQuery('')
      setActive(0)
      d.showModal()
      inputRef.current?.focus()
      fetch('/api/projects')
        .then((r) => (r.ok ? r.json() : { projects: [] }))
        .then((data: { projects?: { id: string; name: string; domain: string | null; apps?: { id: string; name?: string; position: number; domain?: string | null }[] }[] }) =>
          setProjects(
            (data.projects ?? []).map((p) => {
              const primary = p.apps?.slice().sort((a, b) => a.position - b.position || (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id))[0]
              const domain = primary?.domain ?? p.domain ?? null
              return { id: p.id, label: p.name, hint: domain ?? undefined, href: `/dashboard/projects/${p.id}`, group: 'Projets' }
            }),
          ),
        )
        .catch(() => undefined)
    }
    if (!open && d.open) d.close()
  }, [open])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (i: Item) => !q || i.label.toLowerCase().includes(q) || (i.hint ?? '').toLowerCase().includes(q)
    return [...projects.filter(match).slice(0, 8), ...ACTIONS.filter(match)]
  }, [query, projects])

  useEffect(() => setActive(0), [query])

  const go = (item: Item | undefined) => {
    if (!item) return
    setOpen(false)
    router.push(item.href)
  }

  return (
    <>
      <button
        type="button"
        onClick={show}
        className="flex h-11 min-w-11 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-56"
      >
        <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="hidden sm:inline">Rechercher…</span>
        <span className="sr-only sm:hidden">Rechercher</span>
        <kbd className="ml-auto hidden rounded border border-border bg-muted px-1.5 font-sans text-[11px] sm:inline">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <dialog
        ref={dialogRef}
        aria-label="Palette de commandes"
        onCancel={(e) => { e.preventDefault(); setOpen(false) }}
        onClick={(e) => { if (e.target === dialogRef.current) setOpen(false) }}
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
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
              if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
              if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
            }}
            placeholder="Rechercher un projet ou une action…"
            className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          />
        </div>
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
                  onClick={() => go(item)}
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
