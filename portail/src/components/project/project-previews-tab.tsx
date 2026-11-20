'use client'

import { useCallback, useEffect, useState } from 'react'
import { ExternalLink, GitPullRequest, RefreshCw, ShieldAlert } from 'lucide-react'
import { SectionCard } from '@/components/dashboard/section'
import { EmptyState } from '@/components/ui/empty-state'
import { Notice } from '@/components/dashboard/notice'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Preview = {
  id: string
  appId: string
  appName: string
  prNumber: number
  prTitle: string | null
  prUrl: string | null
  headRef: string
  headSha: string | null
  baseRef: string | null
  authorLogin: string | null
  status: string
  previewUrl: string | null
  error: string | null
  lastDeployedAt: string | null
  closedAt: string | null
  updatedAt: string
}

type Payload = {
  enabled: boolean
  ready: boolean
  maxActive: number
  previews: Preview[]
  guards: {
    sameRepositoryOnly: boolean
    forksIgnored: boolean
    draftsIgnoredUntilReady: boolean
    secretsNote: string
  }
}

const STATUS_META: Record<string, { label: string; tone: string }> = {
  active: { label: 'Active', tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  updating: { label: 'Mise à jour', tone: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  closed: { label: 'Fermée', tone: 'bg-muted text-muted-foreground' },
  failed: { label: 'Échec', tone: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  unsupported: { label: 'Non prise en charge', tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
}

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, tone: 'bg-muted text-muted-foreground' }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium', meta.tone)}>
      {meta.label}
    </span>
  )
}

function shortSha(sha: string | null): string | null {
  return sha ? sha.slice(0, 7) : null
}

function formatDate(value: string | null): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
}

export function ProjectPreviewsTab({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/previews`, { cache: 'no-store' })
      const json = (await res.json().catch(() => ({}))) as Payload & { error?: string }
      if (!res.ok) throw new Error(json.error || 'Impossible de charger les prévisualisations.')
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue.')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function toggle(next: boolean) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/previews`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
      const json = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(json.error || 'Modification impossible.')
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur inconnue.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SectionCard
      id="previews"
      title="Prévisualisations de pull requests"
      icon={GitPullRequest}
      description="Environnements éphémères créés à partir des pull requests GitHub du dépôt lié. Flux MVP sécurisé et borné."
      actions={
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
            Actualiser
          </Button>
        </div>
      }
    >
      <div className="space-y-4 p-4 sm:p-5">
        {error && <Notice tone="error">{error}</Notice>}

        {loading && !data ? (
          <p className="text-sm text-muted-foreground">Chargement des prévisualisations…</p>
        ) : data ? (
          <>
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Prévisualisations {data.enabled ? 'activées' : 'désactivées'} pour ce projet
                </p>
                <p className="text-xs text-muted-foreground">
                  {data.maxActive} prévisualisation(s) active(s) maximum. Les PR issues d’un fork et les brouillons (avant passage en prêt) sont ignorés.
                </p>
                {!data.ready && data.enabled && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    L’application principale doit être déployée sur Coolify avant la création d’une prévisualisation.
                  </p>
                )}
              </div>
              {canManage && (
                <Button
                  type="button"
                  variant={data.enabled ? 'outline' : 'default'}
                  onClick={() => void toggle(!data.enabled)}
                  disabled={saving}
                >
                  {data.enabled ? 'Désactiver' : 'Activer'}
                </Button>
              )}
            </div>

            <Notice tone="warning">
              <span className="inline-flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {data.guards.secretsNote} Les PR de forks sont refusées. La disponibilité dépend du support des prévisualisations par l’instance Coolify et de sa configuration réseau/TLS.
                </span>
              </span>
            </Notice>

            {data.previews.length === 0 ? (
              <EmptyState
                title="Aucune prévisualisation"
                description={
                  data.enabled
                    ? 'Ouvrez ou mettez à jour une pull request sur le dépôt lié : une prévisualisation sera créée si le projet est éligible.'
                    : 'Activez les prévisualisations pour créer un environnement éphémère à chaque pull request éligible.'
                }
                icon={GitPullRequest}
                className="py-10"
              />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {data.previews.map((preview) => {
                  const commit = shortSha(preview.headSha)
                  return (
                    <li key={preview.id} className="space-y-2 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">
                              PR #{preview.prNumber}
                              {preview.prTitle ? <span className="font-normal text-muted-foreground"> — {preview.prTitle}</span> : null}
                            </p>
                            <StatusBadge status={preview.status} />
                          </div>
                          <p className="text-xs text-muted-foreground">
                            <span className="font-mono">{preview.headRef}</span>
                            {preview.baseRef ? <> → <span className="font-mono">{preview.baseRef}</span></> : null}
                            {commit ? <> · <span className="font-mono">{commit}</span></> : null}
                            {preview.authorLogin ? <> · @{preview.authorLogin}</> : null}
                            {preview.appName ? <> · app {preview.appName}</> : null}
                          </p>
                          {preview.lastDeployedAt && (
                            <p className="text-xs text-muted-foreground">Dernière mise à jour : {formatDate(preview.lastDeployedAt)}</p>
                          )}
                          {preview.closedAt && preview.status === 'closed' && (
                            <p className="text-xs text-muted-foreground">Fermée le {formatDate(preview.closedAt)}</p>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {preview.prUrl && (
                            <a
                              href={preview.prUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium hover:bg-muted"
                            >
                              Pull request <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only"> (nouvel onglet)</span>
                            </a>
                          )}
                          {preview.previewUrl && preview.status === 'active' && (
                            <a
                              href={preview.previewUrl.startsWith('http') ? preview.previewUrl : `https://${preview.previewUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 items-center gap-1 rounded-md bg-foreground px-2 text-xs font-medium text-background hover:bg-foreground/90"
                            >
                              Ouvrir la prévisualisation <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="sr-only"> (nouvel onglet)</span>
                            </a>
                          )}
                        </div>
                      </div>
                      {preview.error && (
                        <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground break-words">
                          {preview.error}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </>
        ) : null}
      </div>
    </SectionCard>
  )
}
