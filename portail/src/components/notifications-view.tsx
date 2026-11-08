'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { useEvents } from '@/hooks/events-provider'
import { relativeTime } from '@/lib/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import type { NotificationItem } from '@/components/notification-bell'

type Preference = { type: string; label: string; description: string; enabled: boolean }

export function NotificationsView() {
  const { toast } = useToast()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [prefs, setPrefs] = useState<Preference[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=20')
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { notifications: NotificationItem[]; unreadCount: number; nextCursor: string | null }
      setItems(data.notifications)
      setCursor(data.nextCursor)
      setUnread(data.unreadCount)
      setError(false)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    void fetch('/api/notifications/preferences').then((r) => r.json()).then((d: { preferences: Preference[] }) => setPrefs(d.preferences)).catch(() => undefined)
  }, [load])
  useEvents(['notification.created'], () => void load())

  const more = async () => {
    if (!cursor) return
    const res = await fetch(`/api/notifications?limit=20&before=${encodeURIComponent(cursor)}`)
    if (!res.ok) return
    const data = (await res.json()) as { notifications: NotificationItem[]; nextCursor: string | null }
    setItems((prev) => prev.concat(data.notifications))
    setCursor(data.nextCursor)
  }

  const markAll = async () => {
    const res = await fetch('/api/notifications/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ all: true }) })
    if (res.ok) await load()
  }

  const toggle = async (type: string, enabled: boolean) => {
    setPrefs((all) => all.map((p) => (p.type === type ? { ...p, enabled } : p)))
    const res = await fetch('/api/notifications/preferences', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type, enabled }) })
    if (!res.ok) {
      setPrefs((all) => all.map((p) => (p.type === type ? { ...p, enabled: !enabled } : p)))
      toast({ title: 'Préférence non enregistrée', description: 'Votre choix n’a pas pu être enregistré. Réessayez dans un instant.', variant: 'error' })
    }
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Notifications</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {unread > 0 ? `${unread} non lue${unread > 1 ? 's' : ''}.` : 'Tout est lu.'}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Récentes</h2>
            <Button variant="outline" size="sm" onClick={markAll} disabled={unread === 0}>Tout marquer comme lu</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          ) : error ? (
            <p role="alert" className="text-sm text-destructive">Impossible de charger les notifications. Rechargez la page.</p>
          ) : items.length === 0 ? (
            <div className="py-6 text-center">
              <p className="font-medium">Aucune notification</p>
              <p className="mt-1 text-sm text-muted-foreground">Vous serez prévenu ici quand un déploiement se termine ou échoue, quand on vous invite, ou quand votre équipe change.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <li key={n.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {!n.readAt && <Badge className="mr-2">Nouveau</Badge>}
                      {n.title}
                    </p>
                    {n.body && <p className="mt-0.5 text-sm text-muted-foreground">{n.body}</p>}
                    {n.href && <Link href={n.href} className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline sm:min-h-0">Ouvrir</Link>}
                  </div>
                  <time dateTime={n.createdAt} className="shrink-0 text-xs text-muted-foreground">{relativeTime(n.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
          {cursor && <Button variant="ghost" className="mt-2 w-full" onClick={more}>Afficher plus</Button>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">Préférences</h2></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Choisissez ce qui s&apos;affiche dans l&apos;application. Les notifications par e-mail arriveront prochainement.</p>
          <ul className="divide-y divide-border">
            {prefs.map((p) => (
              <li key={p.type} className="py-3">
                <label className="flex min-h-11 cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    checked={p.enabled}
                    onChange={(e) => void toggle(p.type, e.target.checked)}
                    className="mt-1 h-5 w-5 shrink-0 rounded border-input accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  />
                  <span>
                    <span className="block text-sm font-medium">{p.label}</span>
                    <span className="block text-xs text-muted-foreground">{p.description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
