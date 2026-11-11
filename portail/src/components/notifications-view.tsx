'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { BellOff, Inbox } from 'lucide-react'
import { useEvents } from '@/hooks/events-provider'
import { relativeTime } from '@/lib/relative-time'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/toast'
import { PageHeader } from '@/components/page-header'
import { cn } from '@/lib/utils'
import type { NotificationItem } from '@/components/notification-bell'

type Preference = { type: string; label: string; description: string; enabled: boolean; emailEnabled: boolean }
type Channel = 'app' | 'email'
type Filter = 'all' | 'unread'

type PrefsState = 'loading' | 'ready' | 'error'

const fullDate = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Europe/Paris',
})

export function NotificationsView() {
  const { toast } = useToast()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [unread, setUnread] = useState(0)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadingMore, setLoadingMore] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const [marking, setMarking] = useState<string | null>(null)
  const [prefs, setPrefs] = useState<Preference[]>([])
  const [prefsState, setPrefsState] = useState<PrefsState>('loading')
  const [prefNotice, setPrefNotice] = useState('')

  const load = useCallback(async (activeFilter: Filter) => {
    setStatus('loading')
    try {
      const params = new URLSearchParams({ limit: '20' })
      if (activeFilter === 'unread') params.set('unread', '1')
      const res = await fetch(`/api/notifications?${params.toString()}`)
      if (!res.ok) throw new Error()
      const data = (await res.json()) as {
        notifications: NotificationItem[]
        unreadCount: number
        nextCursor: string | null
      }
      setItems(data.notifications)
      setCursor(data.nextCursor)
      setUnread(data.unreadCount)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }, [])

  const loadPreferences = useCallback(async () => {
    setPrefsState('loading')
    try {
      const res = await fetch('/api/notifications/preferences')
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { preferences: Preference[] }
      setPrefs(data.preferences)
      setPrefsState('ready')
    } catch {
      setPrefsState('error')
    }
  }, [])

  useEffect(() => {
    void load(filter)
  }, [filter, load])

  useEffect(() => {
    void loadPreferences()
  }, [loadPreferences])

  useEffect(() => {
    if (!prefNotice) return
    const timer = window.setTimeout(() => setPrefNotice(''), 4000)
    return () => window.clearTimeout(timer)
  }, [prefNotice])

  useEvents(['notification.created'], () => void load(filter))

  const more = async () => {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const params = new URLSearchParams({ limit: '20', before: cursor })
      if (filter === 'unread') params.set('unread', '1')
      const res = await fetch(`/api/notifications?${params.toString()}`)
      if (!res.ok) throw new Error()
      const data = (await res.json()) as { notifications: NotificationItem[]; nextCursor: string | null }
      setItems((prev) => prev.concat(data.notifications))
      setCursor(data.nextCursor)
    } catch {
      toast({
        title: 'Chargement incomplet',
        description: 'Les notifications suivantes n’ont pas pu être chargées. Réessayez.',
        variant: 'error',
      })
    } finally {
      setLoadingMore(false)
    }
  }

  const markRead = async (body: { ids: string[] } | { all: true }) => {
    const key = 'all' in body ? 'all' : body.ids[0] ?? 'all'
    setMarking(key)
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        // Le clic « Ouvrir » navigue aussitôt : la requête doit survivre au changement de page.
        keepalive: true,
      })
      if (!res.ok) throw new Error()
      await load(filter)
      toast({
        title: 'all' in body ? 'Notifications marquées comme lues' : 'Notification marquée comme lue',
        description:
          'all' in body
            ? 'Toutes les notifications non lues sont désormais lues.'
            : 'Elle n’apparaît plus dans le filtre « Non lues ».',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Action impossible',
        description: 'La notification n’a pas pu être marquée comme lue. Réessayez dans un instant.',
        variant: 'error',
      })
    } finally {
      setMarking(null)
    }
  }

  const toggle = async (type: string, channel: Channel, enabled: boolean) => {
    // Le canal « application » est le commutateur principal : couper un type le retire
    // aussi des e-mails, pour ne jamais afficher un réglage e-mail sans effet.
    const cascade = channel === 'app' && !enabled
    setPrefs((all) =>
      all.map((p) => {
        if (p.type !== type) return p
        if (channel === 'app') return { ...p, enabled, ...(cascade ? { emailEnabled: false } : {}) }
        return { ...p, emailEnabled: enabled }
      }),
    )

    const updates: { channel: Channel; enabled: boolean }[] = [{ channel, enabled }]
    if (cascade) updates.push({ channel: 'email', enabled: false })

    try {
      const responses = await Promise.all(
        updates.map((update) =>
          fetch('/api/notifications/preferences', {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type, ...update }),
          }),
        ),
      )
      if (responses.every((res) => res.ok)) {
        setPrefNotice('Préférences enregistrées.')
        return
      }
    } catch {
      // Traité comme un échec d'enregistrement ci-dessous.
    }

    toast({
      title: 'Préférence non enregistrée',
      description: 'Votre choix n’a pas pu être enregistré. Réessayez dans un instant.',
      variant: 'error',
    })
    void loadPreferences()
  }

  const renderList = () => {
    if (status === 'loading') {
      return (
        <div aria-busy="true" className="space-y-3 py-2">
          <span className="sr-only">Chargement des notifications…</span>
          {[0, 1, 2].map((index) => (
            <div key={index} className="space-y-2 rounded-lg border border-border p-4">
              <span className="block h-3 w-1/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
              <span className="block h-3 w-2/3 animate-pulse rounded bg-muted motion-reduce:animate-none" />
            </div>
          ))}
        </div>
      )
    }

    if (status === 'error') {
      return (
        <div role="alert" className="space-y-3 py-8 text-center">
          <p className="font-medium">Impossible de charger les notifications</p>
          <p className="text-sm text-muted-foreground">
            La connexion au serveur a échoué. Vos notifications ne sont pas perdues.
          </p>
          <Button variant="outline" onClick={() => void load(filter)}>
            Réessayer
          </Button>
        </div>
      )
    }

    if (items.length === 0) {
      return filter === 'unread' ? (
        <EmptyState
          icon={BellOff}
          title="Aucune notification non lue"
          description="Vous êtes à jour. Les nouvelles notifications apparaîtront ici."
          action={<Button variant="outline" onClick={() => setFilter('all')}>Voir toutes les notifications</Button>}
        />
      ) : (
        <EmptyState
          icon={Inbox}
          title="Aucune notification"
          description="Vous serez prévenu ici quand un déploiement se termine ou échoue, quand on vous invite ou quand votre équipe change."
        />
      )
    }

    return (
      <>
        <ul className="divide-y divide-border" aria-label="Notifications, de la plus récente à la plus ancienne">
          {items.map((notification) => {
            const isUnread = !notification.readAt
            return (
              <li
                key={notification.id}
                className={cn(
                  'flex flex-col gap-2 rounded-lg px-3 py-4 sm:flex-row sm:items-start sm:justify-between',
                  isUnread ? 'bg-primary/5' : undefined,
                )}
              >
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    <Badge variant={isUnread ? 'info' : 'outline'}>{isUnread ? 'Non lue' : 'Lue'}</Badge>
                    <span>{notification.title}</span>
                  </p>
                  {notification.body ? (
                    <p className="text-sm text-muted-foreground">{notification.body}</p>
                  ) : null}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {notification.href ? (
                      <Link
                        href={notification.href}
                        onClick={() => {
                          if (isUnread) void markRead({ ids: [notification.id] })
                        }}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
                      >
                        Ouvrir
                      </Link>
                    ) : null}
                    {isUnread ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={marking === notification.id}
                        onClick={() => void markRead({ ids: [notification.id] })}
                      >
                        Marquer comme lue
                      </Button>
                    ) : null}
                  </div>
                </div>
                <time
                  dateTime={notification.createdAt}
                  className="shrink-0 text-xs text-muted-foreground"
                  title={fullDate.format(new Date(notification.createdAt))}
                >
                  {relativeTime(notification.createdAt)}
                </time>
              </li>
            )
          })}
        </ul>
        {cursor ? (
          <Button variant="ghost" className="mt-2 w-full" loading={loadingMore} onClick={() => void more()}>
            Afficher plus de notifications
          </Button>
        ) : null}
      </>
    )
  }

  return (
    <div className="max-w-3xl space-y-8">
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `${unread} notification${unread > 1 ? 's' : ''} non lue${unread > 1 ? 's' : ''}. Ouvrez une notification ou marquez-la comme lue pour la retirer du filtre.`
            : 'Tout est lu. Les nouvelles notifications de vos projets et de votre équipe apparaîtront ici.'
        }
        actions={
          <Button
            variant="outline"
            loading={marking === 'all'}
            onClick={() => void markRead({ all: true })}
            disabled={unread === 0}
          >
            Tout marquer comme lu
          </Button>
        }
      />

      <Card>
        <CardHeader className="space-y-1">
          <h2 className="font-semibold">Boîte de réception</h2>
          <p className="text-sm text-muted-foreground">
            Les plus récentes d’abord. Le filtre « Non lues » ne montre que ce qui reste à traiter.
          </p>
        </CardHeader>
        <CardContent>
          <Tabs
            label="Filtrer les notifications"
            value={filter}
            onValueChange={(id) => setFilter(id === 'unread' ? 'unread' : 'all')}
            items={[
              { id: 'all', label: 'Toutes', content: renderList() },
              {
                id: 'unread',
                label: unread > 0 ? `Non lues (${unread})` : 'Non lues',
                content: renderList(),
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="space-y-1">
          <h2 className="font-semibold">Préférences</h2>
          <p className="text-sm text-muted-foreground">
            Choisissez les types qui vous intéressent et les canaux utilisés. Sans préférence enregistrée,
            tout est activé.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Les e-mails ne partent que si l’envoi d’e-mails est activé sur la plateforme. Décocher
            « Dans l’application » désactive entièrement ce type, e-mail compris.
          </p>

          <p role="status" aria-live="polite" className="min-h-5 text-xs font-medium text-success">
            {prefNotice}
          </p>

          {prefsState === 'loading' ? (
            <p className="text-sm text-muted-foreground">Chargement des préférences…</p>
          ) : prefsState === 'error' ? (
            <div role="alert" className="space-y-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              <p>Impossible de charger vos préférences de notification.</p>
              <Button variant="outline" size="sm" onClick={() => void loadPreferences()}>
                Réessayer
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {prefs.map((preference) => {
                const descriptionId = `notification-preference-${preference.type}-description`
                return (
                  <li key={preference.type} className="py-3">
                    <fieldset className="min-w-0 border-0 p-0">
                      <legend className="text-sm font-medium">{preference.label}</legend>
                      <p id={descriptionId} className="mt-0.5 text-xs text-muted-foreground">
                        {preference.description}
                      </p>
                      <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:gap-6">
                        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm sm:min-h-0">
                          <input
                            type="checkbox"
                            checked={preference.enabled}
                            onChange={(e) => void toggle(preference.type, 'app', e.target.checked)}
                            aria-describedby={descriptionId}
                            className="h-5 w-5 shrink-0 rounded border-input accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          />
                          Dans l’application
                        </label>
                        <label
                          className={cn(
                            'flex min-h-11 items-center gap-2 text-sm sm:min-h-0',
                            preference.enabled ? 'cursor-pointer' : 'cursor-not-allowed text-muted-foreground',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={preference.emailEnabled}
                            disabled={!preference.enabled}
                            onChange={(e) => void toggle(preference.type, 'email', e.target.checked)}
                            aria-describedby={descriptionId}
                            className="h-5 w-5 shrink-0 rounded border-input accent-[hsl(var(--primary))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-60"
                          />
                          Par e-mail
                        </label>
                      </div>
                    </fieldset>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
