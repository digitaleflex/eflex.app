'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useEvents } from '@/hooks/events-provider'
import { relativeTime } from '@/lib/relative-time'
import { cn } from '@/lib/utils'

export type NotificationItem = { id: string; type: string; title: string; body: string | null; href: string | null; readAt: string | null; createdAt: string }

/** Cloche avec compteur de non-lues et panneau des dernières notifications. */
export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [failed, setFailed] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=8')
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { notifications: NotificationItem[]; unreadCount: number }
      setItems(data.notifications)
      setUnread(data.unreadCount)
      setFailed(false)
    } catch {
      setFailed(true)
    }
  }, [])

  useEffect(() => { void load() }, [load])
  useEvents(['notification.created'], () => void load())

  // Échap ferme et rend le focus au bouton ; un clic à l'extérieur ferme aussi.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  const markRead = async (body: { ids: string[] } | { all: true }) => {
    const res = await fetch('/api/notifications/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    if (res.ok) await load()
  }

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-input bg-background text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        <span className="sr-only">Notifications{unread > 0 ? `, ${unread} non lue${unread > 1 ? 's' : ''}` : ''}</span>
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-destructive-foreground">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Dernières notifications"
          className="fixed inset-x-4 top-16 z-50 max-h-[70vh] overflow-auto rounded-xl border border-border bg-card text-card-foreground shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            <button
              type="button"
              onClick={() => void markRead({ all: true })}
              disabled={unread === 0}
              className="min-h-11 text-xs font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline lg:min-h-0"
            >
              Tout marquer comme lu
            </button>
          </div>
          {failed ? (
            <p role="alert" className="p-4 text-sm text-destructive">Impossible de charger les notifications. Réessayez dans un instant.</p>
          ) : items.length === 0 ? (
            <div className="p-6 text-center">
              <p className="text-sm font-medium">Rien de nouveau</p>
              <p className="mt-1 text-xs text-muted-foreground">Vos déploiements, invitations et changements d&apos;équipe apparaîtront ici.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const content = (
                  <>
                    <span className="flex items-start gap-2">
                      {!n.readAt && <span aria-hidden="true" className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{!n.readAt && <span className="sr-only">Non lue : </span>}{n.title}</span>
                        {n.body && <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>}
                        <span className="mt-1 block text-xs text-muted-foreground">{relativeTime(n.createdAt)}</span>
                      </span>
                    </span>
                  </>
                )
                const cls = 'block min-h-11 w-full px-4 py-3 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'
                return (
                  <li key={n.id}>
                    {n.href ? (
                      <Link href={n.href} className={cls} onClick={() => { setOpen(false); if (!n.readAt) void markRead({ ids: [n.id] }) }}>{content}</Link>
                    ) : (
                      <button type="button" className={cls} onClick={() => { if (!n.readAt) void markRead({ ids: [n.id] }) }}>{content}</button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <Link href="/dashboard/notifications" onClick={() => setOpen(false)} className="flex min-h-11 items-center justify-center border-t border-border text-sm font-medium text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
            Tout voir et régler les préférences
          </Link>
        </div>
      )}
    </div>
  )
}
