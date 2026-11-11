'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ExternalLink, Layers, Pencil, Trash2 } from 'lucide-react'
import { RedeployButton } from '@/components/redeploy-button'
import { StatusPill } from '@/components/dashboard/status-pill'
import { SectionCard } from '@/components/dashboard/section'
import { Button } from '@/components/ui/button'
import { frameworkLabel } from '@/lib/frameworks'
import { relativeTime } from '@/lib/relative-time'

const NETWORK_ERROR = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

type Feedback = { tone: 'success' | 'error'; message: string } | null

interface AppDomain {
  id: string
  hostname: string
  appId: string | null
  verifiedAt: string | Date | null
}

interface AppDeployment {
  status: string
  commitSha: string
  createdAt: string | Date
}

export interface ProjectAppItem {
  id: string
  name: string
  root: string
  framework: string
  domain: string | null
  position: number
  deployments: AppDeployment[]
}

interface ProjectAppsSectionProps {
  projectId: string
  apps: ProjectAppItem[]
  domains: AppDomain[]
  canManage: boolean
}

function dateValue(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value)
}

export function ProjectAppsSection({ projectId, apps: initialApps, domains, canManage }: ProjectAppsSectionProps) {
  const router = useRouter()
  const [apps, setApps] = useState(initialApps)
  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({})
  const [editingId, setEditingId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const multiApp = apps.length > 1

  async function renameApp(app: ProjectAppItem) {
    const nextName = (renameDrafts[app.id] ?? app.name).trim()
    setFeedback(null)
    if (nextName === '' || nextName === app.name) {
      setEditingId(null)
      setRenameDrafts((current) => ({ ...current, [app.id]: app.name }))
      return
    }
    setRenamingId(app.id)
    try {
      const response = await fetch(`/api/projects/${projectId}/apps/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: data.error || 'L’application n’a pas pu être renommée.' })
        return
      }
      const updated = data.app as { id: string; name: string }
      setApps((current) => current.map((item) => (item.id === updated.id ? { ...item, name: updated.name } : item)))
      setEditingId(null)
      setFeedback({ tone: 'success', message: `Application renommée en « ${updated.name} ».` })
      router.refresh()
    } catch {
      setFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setRenamingId(null)
    }
  }

  async function removeApp(app: ProjectAppItem) {
    setFeedback(null)
    setDeletingId(app.id)
    try {
      const response = await fetch(`/api/projects/${projectId}/apps/${app.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: data.error || 'L’application n’a pas pu être supprimée.' })
        return
      }
      setApps((current) => current.filter((item) => item.id !== app.id))
      setPendingDelete(null)
      setEditingId(null)
      setFeedback({ tone: 'success', message: `L’application « ${app.name} » a été supprimée.` })
      router.refresh()
    } catch {
      setFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setDeletingId(null)
    }
  }

  if (apps.length <= 1) return null

  return (
    <SectionCard
      id="apps"
      title={
        <>
          Applications
          <span className="rounded-full bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">
            {apps.length}
          </span>
        </>
      }
      icon={Layers}
      description="Chaque application a son propre build, son dossier et son domaine. Elle peut être relancée séparément."
    >
      {feedback && (
        <p
          id="project-apps-feedback"
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={
            feedback.tone === 'error'
              ? 'mx-4 mt-4 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive sm:mx-5'
              : 'mx-4 mt-4 rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-foreground sm:mx-5'
          }
        >
          {feedback.message}
        </p>
      )}
      <ul className="divide-y divide-border">
        {apps.map((app) => {
          const appLast = app.deployments[0]
          const appDomains = domains.filter((domain) => domain.verifiedAt && domain.appId === app.id)
          const appPendingDomains = domains.filter((domain) => !domain.verifiedAt && domain.appId === app.id)
          const editing = editingId === app.id
          const draft = renameDrafts[app.id] ?? app.name
          return (
            <li key={app.id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start sm:px-5">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                  {app.name}
                  {app.position === 0 && (
                    <span className="rounded-full border border-border px-1.5 text-[11px] font-normal text-muted-foreground">
                      Principale
                    </span>
                  )}
                  <span className="text-xs font-normal text-muted-foreground">{frameworkLabel(app.framework)}</span>
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {app.root === '' ? 'Racine du dépôt' : app.root}
                </p>

                {canManage && multiApp && (
                  <div className="mt-2 space-y-2">
                    {editing ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <label htmlFor={`rename-${app.id}`} className="sr-only">
                          Nouveau nom pour {app.name}
                        </label>
                        <input
                          id={`rename-${app.id}`}
                          value={draft}
                          onChange={(e) => setRenameDrafts((current) => ({ ...current, [app.id]: e.target.value }))}
                          maxLength={24}
                          className="min-h-11 w-full max-w-xs rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            loading={renamingId === app.id}
                            onClick={() => renameApp(app)}
                          >
                            Enregistrer
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingId(null)
                              setRenameDrafts((current) => ({ ...current, [app.id]: app.name }))
                            }}
                          >
                            Annuler
                          </Button>
                        </div>
                      </div>
                    ) : pendingDelete === app.id ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-xs text-destructive">Supprimer « {app.name} » ?</p>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          loading={deletingId === app.id}
                          onClick={() => removeApp(app)}
                        >
                          Confirmer
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
                          Annuler
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-h-11 text-muted-foreground hover:text-foreground [@media(pointer:coarse)]:min-h-11 sm:min-h-9"
                          onClick={() => {
                            setRenameDrafts((current) => ({ ...current, [app.id]: app.name }))
                            setEditingId(app.id)
                            setPendingDelete(null)
                          }}
                          aria-label={`Renommer l’application ${app.name}`}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                          Renommer
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="min-h-11 text-muted-foreground hover:text-destructive [@media(pointer:coarse)]:min-h-11 sm:min-h-9"
                          onClick={() => {
                            setPendingDelete(app.id)
                            setEditingId(null)
                          }}
                          aria-label={`Supprimer l’application ${app.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Supprimer
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="min-w-0 space-y-1">
                {app.domain ? (
                  <a
                    href={`https://${app.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 break-all text-sm text-primary hover:underline"
                  >
                    {app.domain}
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span className="sr-only"> (nouvel onglet)</span>
                  </a>
                ) : (
                  <p className="text-xs text-muted-foreground">Non exposée</p>
                )}
                {appDomains.length > 0 && (
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>Aussi :</span>
                    {appDomains.map((domain) => (
                      <a
                        key={domain.id}
                        href={`https://${domain.hostname}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-primary hover:underline"
                      >
                        {domain.hostname}
                      </a>
                    ))}
                  </p>
                )}
                {appPendingDomains.length > 0 && (
                  <p className="text-xs text-warning">
                    {appPendingDomains.length} domaine{appPendingDomains.length > 1 ? 's' : ''} en attente de vérification
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                <StatusPill status={appLast?.status} />
                {appLast && (
                  <time dateTime={dateValue(appLast.createdAt).toISOString()} className="text-xs text-muted-foreground" suppressHydrationWarning>
                    {relativeTime(dateValue(appLast.createdAt))}
                  </time>
                )}
                {canManage && (
                  <RedeployButton
                    projectId={projectId}
                    appId={app.id}
                    srLabel={`l’application ${app.name}`}
                  />
                )}
              </div>
            </li>
          )
        })}
      </ul>
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
        La suppression d’une application retire aussi ses déploiements et son hébergement associé. Il doit toujours rester au moins une application.
      </p>
    </SectionCard>
  )
}