'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'

export interface DeploymentView {
  id: string
  status: string
  label: string
  commitSha: string
  logsSummary: string | null
  createdAt: string
}

const TERMINAL = new Set(['live', 'failed', 'cancelled'])

const TONE: Record<string, 'success' | 'warning' | 'destructive' | 'outline'> = {
  live: 'success',
  failed: 'destructive',
  cancelled: 'outline',
  queued: 'outline',
  analyzing: 'warning',
  provisioning: 'warning',
  building: 'warning',
  deploying: 'warning',
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

export function DeploymentPanel({
  projectId,
  initial,
}: {
  projectId: string
  initial: DeploymentView[]
}) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const activeIds = items.filter((item) => !TERMINAL.has(item.status)).map((item) => item.id)

  useEffect(() => {
    if (activeIds.length === 0) return
    const timer = setInterval(async () => {
      const updated = await Promise.all(
        items.map(async (item) => {
          if (TERMINAL.has(item.status)) return item
          try {
            const response = await fetch(`/api/deployments/${item.id}`, { cache: 'no-store' })
            if (!response.ok) return item
            const data = await response.json()
            return {
              ...item,
              status: data.deployment.status,
              label: data.deployment.label,
              logsSummary: data.deployment.logsSummary,
            }
          } catch {
            return item
          }
        }),
      )
      setItems(updated)
    }, 3000)
    return () => clearInterval(timer)
    // Le tableau d'identifiants actifs suffit à réarmer le polling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIds.join(',')])

  const redeploy = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/projects/${projectId}/redeploy`, { method: 'POST' })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        setError(data.error || 'Impossible de relancer le déploiement.')
      } else {
        router.refresh()
      }
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Déploiements</h2>
          <Button variant="outline" size="sm" onClick={redeploy} loading={busy}>
            Redéployer
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">{error}</p>}

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun déploiement pour ce projet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <li key={item.id} className="py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium">{dateFormat.format(new Date(item.createdAt))}</p>
                  <p className="text-xs text-muted-foreground font-mono">
                    {item.commitSha === 'pending' ? 'Commit en attente' : item.commitSha.slice(0, 7)}
                  </p>
                  {item.logsSummary && (
                    <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 text-xs text-muted-foreground">{item.logsSummary}</pre>
                  )}
                </div>
                <div className="flex items-center gap-2 self-start sm:self-center">
                  {!TERMINAL.has(item.status) && (
                    <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
                  )}
                  <Badge variant={TONE[item.status] ?? 'outline'}>{item.label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
