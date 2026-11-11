'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  ArrowRightLeft,
  Database,
  Globe,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Settings,
  Trash2,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ProjectRuntimeControls } from '@/components/project-runtime-controls'
import { ProjectDomains } from '@/components/project-domains'
import { ProjectDatabases } from '@/components/project-databases'
import { ProjectTransfer, type TransferTarget } from '@/components/project-transfer'

const NETWORK_ERROR = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

type Feedback = { tone: 'success' | 'error'; message: string } | null

interface EnvVarKey {
  key: string
  updatedAt: string
  appId?: string | null
}

interface SettingsApp {
  id: string
  name: string
  root: string
  domain: string | null
  framework: string
}

interface ProjectSettingsProps {
  project: {
    id: string
    name: string
    branch: string
    slug: string
    domain: string | null
    coolifyAppId: string | null
  }
  apps?: SettingsApp[]
  envVars: EnvVarKey[]
  transferTargets: TransferTarget[]
}

function FeedbackMessage({ feedback, id }: { feedback: Feedback; id: string }) {
  if (!feedback) return null
  if (feedback.tone === 'success') {
    return (
      <p id={id} role="status" className="rounded-lg bg-success/10 border border-success/20 p-3 text-sm text-foreground">
        {feedback.message}
      </p>
    )
  }
  return (
    <p id={id} role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
      {feedback.message}
    </p>
  )
}

/** Section de réglages : même en-tête, ancre stable pour les liens directs. */
function SettingsSection({
  id,
  title,
  icon: Icon,
  description,
  children,
}: {
  id: string
  title: string
  icon?: LucideIcon
  description: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
      <Card>
        <CardHeader>
          <h2 id={`${id}-title`} className="flex items-center gap-2 font-semibold">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            {title}
          </h2>
          <div className="mt-1 text-sm text-muted-foreground">{description}</div>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </section>
  )
}

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function envScopeId(appId: string | null | undefined): string {
  return appId ?? 'project'
}

function envItemId(item: Pick<EnvVarKey, 'key' | 'appId'>): string {
  return `${envScopeId(item.appId)}::${item.key}`
}

function scopeLabel(appId: string | null | undefined, appNameById: Map<string, string>): string {
  if (!appId) return 'Toutes les applications'
  return `Application : ${appNameById.get(appId) ?? 'inconnue'}`
}

export function ProjectSettings({ project, apps: initialApps = [], envVars: initialEnvVars, transferTargets }: ProjectSettingsProps) {
  const router = useRouter()
  const [apps, setApps] = useState<SettingsApp[]>(initialApps)
  const appNameById = new Map(apps.map((app) => [app.id, app.name]))
  const multiApp = apps.length > 1
  const showApplications = apps.length > 1

  const [name, setName] = useState(project.name)
  const [branch, setBranch] = useState(project.branch)
  const [savingGeneral, setSavingGeneral] = useState(false)
  const [generalFeedback, setGeneralFeedback] = useState<Feedback>(null)

  const [envVars, setEnvVars] = useState<EnvVarKey[]>(initialEnvVars)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [envScope, setEnvScope] = useState('')
  const [savingEnv, setSavingEnv] = useState(false)
  const [envFeedback, setEnvFeedback] = useState<Feedback>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)

  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({})
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [pendingAppDelete, setPendingAppDelete] = useState<string | null>(null)
  const [deletingAppId, setDeletingAppId] = useState<string | null>(null)
  const [appFeedback, setAppFeedback] = useState<Feedback>(null)
  const [newAppRoot, setNewAppRoot] = useState('')
  const [addingApp, setAddingApp] = useState(false)
  const [addAppFeedback, setAddAppFeedback] = useState<Feedback>(null)

  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault()
    setGeneralFeedback(null)
    if (name.trim() === '' || branch.trim() === '') {
      setGeneralFeedback({ tone: 'error', message: 'Le nom et la branche ne peuvent pas être vides.' })
      return
    }
    setSavingGeneral(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), branch: branch.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setGeneralFeedback({ tone: 'error', message: data.error || 'Les modifications n’ont pas pu être enregistrées.' })
        return
      }
      setName(data.project.name)
      setBranch(data.project.branch)
      setGeneralFeedback({ tone: 'success', message: 'Réglages mis à jour.' })
      router.refresh()
    } catch {
      setGeneralFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setSavingGeneral(false)
    }
  }

  async function saveEnvVar(e: React.FormEvent) {
    e.preventDefault()
    setEnvFeedback(null)
    const key = newKey.trim()
    if (key === '') {
      setEnvFeedback({ tone: 'error', message: 'Indiquez le nom de la variable.' })
      return
    }
    const appId = multiApp && envScope ? envScope : undefined
    setSavingEnv(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/env-vars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(appId ? { key, value: newValue, appId } : { key, value: newValue }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setEnvFeedback({ tone: 'error', message: data.error || 'La variable n’a pas pu être enregistrée.' })
        return
      }
      const saved = data.envVar as EnvVarKey
      const savedId = envItemId(saved)
      setEnvVars((current) => {
        const others = current.filter((item) => envItemId(item) !== savedId)
        return [...others, saved].sort((a, b) => {
          const k = a.key.localeCompare(b.key)
          return k !== 0 ? k : envScopeId(a.appId).localeCompare(envScopeId(b.appId))
        })
      })
      setNewKey('')
      setNewValue('')
      setEnvFeedback({
        tone: 'success',
        message: 'Variable enregistrée. Elle sera appliquée au prochain déploiement.',
      })
      router.refresh()
    } catch {
      setEnvFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setSavingEnv(false)
    }
  }

  async function removeEnvVar(item: EnvVarKey) {
    const itemId = envItemId(item)
    setEnvFeedback(null)
    setDeletingKey(itemId)
    try {
      const query = item.appId ? `?appId=${encodeURIComponent(item.appId)}` : ''
      const response = await fetch(
        `/api/projects/${project.id}/env-vars/${encodeURIComponent(item.key)}${query}`,
        { method: 'DELETE' },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setEnvFeedback({ tone: 'error', message: data.error || 'La variable n’a pas pu être supprimée.' })
        return
      }
      setEnvVars((current) => current.filter((entry) => envItemId(entry) !== itemId))
      setPendingDelete(null)
      setEnvFeedback({ tone: 'success', message: 'Variable supprimée. Le prochain déploiement en tiendra compte.' })
      router.refresh()
    } catch {
      setEnvFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setDeletingKey(null)
    }
  }

  async function renameApp(app: SettingsApp) {
    const nextName = (renameDrafts[app.id] ?? app.name).trim()
    setAppFeedback(null)
    if (nextName === '' || nextName === app.name) {
      setRenameDrafts((current) => ({ ...current, [app.id]: app.name }))
      return
    }
    setRenamingId(app.id)
    try {
      const response = await fetch(`/api/projects/${project.id}/apps/${app.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: nextName }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setAppFeedback({ tone: 'error', message: data.error || 'L’application n’a pas pu être renommée.' })
        return
      }
      const updated = data.app as { id: string; name: string }
      setApps((current) => current.map((item) => (item.id === updated.id ? { ...item, name: updated.name } : item)))
      setRenameDrafts((current) => ({ ...current, [app.id]: updated.name }))
      setAppFeedback({ tone: 'success', message: `Application renommée en « ${updated.name} ».` })
      router.refresh()
    } catch {
      setAppFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setRenamingId(null)
    }
  }

  async function removeApp(app: SettingsApp) {
    setAppFeedback(null)
    setDeletingAppId(app.id)
    try {
      const response = await fetch(`/api/projects/${project.id}/apps/${app.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setAppFeedback({ tone: 'error', message: data.error || 'L’application n’a pas pu être supprimée.' })
        return
      }
      setApps((current) => current.filter((item) => item.id !== app.id))
      setEnvVars((current) => current.filter((item) => item.appId !== app.id))
      setPendingAppDelete(null)
      setAppFeedback({ tone: 'success', message: `L’application « ${app.name} » a été supprimée.` })
      router.refresh()
    } catch {
      setAppFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setDeletingAppId(null)
    }
  }

  async function addApplication(e: React.FormEvent) {
    e.preventDefault()
    setAddAppFeedback(null)
    const root = newAppRoot.trim()
    if (root === '') {
      setAddAppFeedback({ tone: 'error', message: 'Indiquez le dossier de l’application (par exemple apps/web).' })
      return
    }
    setAddingApp(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/apps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setAddAppFeedback({ tone: 'error', message: data.error || 'L’application n’a pas pu être ajoutée.' })
        return
      }
      const created = data.app as SettingsApp | undefined
      if (created) {
        setApps((current) => [...current, { ...created, domain: created.domain ?? null }])
      }
      setNewAppRoot('')
      setAddAppFeedback({
        tone: 'success',
        message: data.deployment
          ? 'Application ajoutée. Son premier déploiement a été lancé.'
          : 'Application ajoutée.',
      })
      router.refresh()
    } catch {
      setAddAppFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setAddingApp(false)
    }
  }

  async function deleteProject(e: React.FormEvent) {
    e.preventDefault()
    setDeleteError('')
    if (deleteConfirm.trim() !== project.name) {
      setDeleteError('Saisissez le nom exact du projet pour confirmer.')
      return
    }
    setDeleting(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setDeleteError(data.error || 'Le projet n’a pas pu être supprimé.')
        return
      }
      router.push('/dashboard')
      router.refresh()
    } catch {
      setDeleteError(NETWORK_ERROR)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="inline-flex items-center gap-2 min-h-11 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Retour au projet
        </Link>
      </div>

      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Paramètres du projet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {project.name} · <span className="font-mono">{project.slug}</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ces réglages ne concernent que ce projet. Les valeurs des variables ne sont jamais
          réaffichées ; seuls leurs noms et leurs dates de mise à jour sont transmis à cette page.
        </p>
      </header>

      <SettingsSection
        id="general"
        title="Général"
        icon={Settings}
        description="Le nom est modifiable. Le domaine et l’identifiant technique restent stables pour ne pas casser les URLs ni les labels Traefik."
      >
        <div className="space-y-4">
          <FeedbackMessage feedback={generalFeedback} id="project-general-feedback" />
          <form onSubmit={saveGeneral} className="space-y-4">
            <Input
              id="project-name"
              label="Nom du projet"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={60}
              aria-invalid={generalFeedback?.tone === 'error' ? true : undefined}
              aria-describedby={generalFeedback?.tone === 'error' ? 'project-general-feedback' : undefined}
              required
            />
            <Input
              id="project-branch"
              label="Branche de production"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              hint="Les push sur cette branche déclenchent un déploiement."
              spellCheck={false}
              aria-invalid={generalFeedback?.tone === 'error' ? true : undefined}
              aria-describedby={generalFeedback?.tone === 'error' ? 'project-general-feedback' : undefined}
              required
            />
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground flex items-start gap-2">
              <Globe className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Domaine :{' '}
                {project.domain ? (
                  <a
                    href={`https://${project.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-primary hover:underline"
                  >
                    {project.domain}
                  </a>
                ) : (
                  'aucun domaine attribué'
                )}
              </span>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                loading={savingGeneral}
                disabled={name.trim() === project.name && branch.trim() === project.branch}
              >
                Enregistrer
              </Button>
            </div>
          </form>
        </div>
      </SettingsSection>

      <SettingsSection
        id="variables"
        title="Variables d’environnement"
        icon={KeyRound}
        description="Les valeurs sont chiffrées au repos et ne sont jamais réaffichées. Une modification s’applique au prochain déploiement."
      >
        <div className="space-y-5">
          <FeedbackMessage feedback={envFeedback} id="project-env-feedback" />

          {envVars.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune variable définie.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {envVars.length} variable{envVars.length > 1 ? 's' : ''} · valeurs masquées
              </p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {envVars.map((item) => {
                  const itemId = envItemId(item)
                  return (
                    <li key={itemId} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-mono text-sm break-all">{item.key}</p>
                          {multiApp && (
                            <span className="rounded-full border border-border px-1.5 text-[11px] text-muted-foreground">
                              {scopeLabel(item.appId, appNameById)}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Mise à jour le {dateFormat.format(new Date(item.updatedAt))}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                        <span className="inline-flex items-center gap-1.5 font-mono text-sm tracking-widest text-muted-foreground">
                          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                          <span aria-hidden="true">••••••••</span>
                          <span className="sr-only">Valeur masquée</span>
                        </span>
                        {pendingDelete === itemId ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="destructive"
                              loading={deletingKey === itemId}
                              onClick={() => removeEnvVar(item)}
                              aria-label={`Confirmer la suppression de la variable ${item.key}`}
                            >
                              Confirmer
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setPendingDelete(null)}
                              aria-label={`Annuler la suppression de la variable ${item.key}`}
                            >
                              Annuler
                            </Button>
                          </div>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="self-start text-muted-foreground hover:text-destructive"
                            onClick={() => setPendingDelete(itemId)}
                            aria-label={`Supprimer la variable ${item.key}`}
                          >
                            <Trash2 className="w-4 h-4" aria-hidden="true" />
                            Supprimer
                          </Button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          <form onSubmit={saveEnvVar} className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
            <p className="text-sm font-medium">Ajouter ou remplacer une variable</p>
            {multiApp && (
              <div>
                <label htmlFor="env-scope" className="mb-1.5 block text-sm font-medium">
                  Portée
                </label>
                <select
                  id="env-scope"
                  value={envScope}
                  onChange={(e) => setEnvScope(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Toutes les applications</option>
                  {apps.map((app) => (
                    <option key={app.id} value={app.id}>
                      Application : {app.name}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Choisissez « Toutes les applications » pour une variable partagée, ou une application pour une valeur spécifique.
                </p>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="env-key"
                label="Nom"
                placeholder="DATABASE_URL"
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={envFeedback?.tone === 'error' ? true : undefined}
                aria-describedby={envFeedback?.tone === 'error' ? 'project-env-feedback' : undefined}
                required
              />
              <Input
                id="env-value"
                label="Valeur"
                type="password"
                placeholder="valeur secrète"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                spellCheck={false}
                autoComplete="new-password"
                hint="La valeur est chiffrée et ne sera plus jamais affichée."
                aria-invalid={envFeedback?.tone === 'error' ? true : undefined}
                aria-describedby={envFeedback?.tone === 'error' ? 'project-env-feedback' : undefined}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Pour remplacer une valeur existante, saisissez-la à nouveau : l’ancienne ne peut pas
                être relue.
              </p>
              <Button type="submit" loading={savingEnv}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                Ajouter ou mettre à jour
              </Button>
            </div>
          </form>
        </div>
      </SettingsSection>

      {showApplications && (
        <SettingsSection
          id="applications"
          title="Applications"
          icon={Settings}
          description={`${apps.length} application${apps.length > 1 ? 's' : ''} dans ce projet. Vous pouvez les renommer ou les supprimer (la dernière ne peut pas être supprimée).`}
        >
          <div className="space-y-5">
            <FeedbackMessage feedback={appFeedback} id="project-apps-feedback" />
            {apps.length <= 1 && (
              <p className="text-sm text-muted-foreground">
                Il doit toujours rester au moins une application dans le projet.
              </p>
            )}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {apps.map((app) => {
                const draft = renameDrafts[app.id] ?? app.name
                const changed = draft.trim() !== '' && draft.trim() !== app.name
                return (
                  <li key={app.id} className="space-y-3 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium">{app.name}</p>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{app.root || '/'}</span> · {app.framework}
                        </p>
                        {app.domain ? (
                          <a
                            href={`https://${app.domain}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block truncate text-xs font-medium text-primary hover:underline"
                          >
                            {app.domain}
                          </a>
                        ) : (
                          <p className="mt-1 text-xs text-muted-foreground">Non exposée</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <label htmlFor={`rename-app-${app.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">
                          Renommer
                        </label>
                        <input
                          id={`rename-app-${app.id}`}
                          value={draft}
                          onChange={(e) => setRenameDrafts((current) => ({ ...current, [app.id]: e.target.value }))}
                          maxLength={24}
                          className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        loading={renamingId === app.id}
                        disabled={!changed}
                        onClick={() => renameApp(app)}
                        aria-label={`Renommer l’application ${app.name}`}
                      >
                        <Pencil className="h-4 w-4" aria-hidden="true" />
                        Renommer
                      </Button>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {apps.length <= 1 ? (
                        <span className="text-xs text-muted-foreground">
                          Impossible de supprimer la dernière application.
                        </span>
                      ) : pendingAppDelete === app.id ? (
                        <>
                          <p className="text-sm text-destructive">Supprimer « {app.name} » ? Cette action est définitive.</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            loading={deletingAppId === app.id}
                            onClick={() => removeApp(app)}
                          >
                            Confirmer la suppression
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setPendingAppDelete(null)}>
                            Annuler
                          </Button>
                        </>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setPendingAppDelete(app.id)}
                          aria-label={`Supprimer l’application ${app.name}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Supprimer l’application
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            <form onSubmit={addApplication} className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <p className="text-sm font-medium">Ajouter une application</p>
              <FeedbackMessage feedback={addAppFeedback} id="project-add-app-feedback" />
              <Input
                id="new-app-root"
                label="Dossier de l’application"
                placeholder="apps/web"
                value={newAppRoot}
                onChange={(e) => setNewAppRoot(e.target.value)}
                hint="Chemin du dossier dans le dépôt. L’analyse et le déploiement sont lancés automatiquement si le multi-app est activé."
                spellCheck={false}
                autoComplete="off"
                aria-describedby={addAppFeedback?.tone === 'error' ? 'project-add-app-feedback' : undefined}
              />
              <div className="flex justify-end">
                <Button type="submit" loading={addingApp}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Ajouter l’application
                </Button>
              </div>
            </form>
          </div>
        </SettingsSection>
      )}

      <SettingsSection
        id="domaines"
        title="Domaines"
        icon={Globe}
        description="Le domaine Eflex reste stable. Ajoutez vos propres domaines avec un CNAME ; le certificat SSL est émis automatiquement après vérification."
      >
        <ProjectDomains projectId={project.id} apps={apps.map((app) => ({ id: app.id, name: app.name }))} />
      </SettingsSection>

      <SettingsSection
        id="bases"
        title="Bases de données"
        icon={Database}
        description="Créez une base PostgreSQL ou un cache Redis privé sur l’infrastructure. La variable DATABASE_URL ou REDIS_URL est injectée automatiquement au déploiement."
      >
        <ProjectDatabases projectId={project.id} />
      </SettingsSection>

      <SettingsSection
        id="disponibilite"
        title="Disponibilité & actions"
        icon={Activity}
        description="Statut du conteneur sur la plateforme et actions immédiates. Le redéploiement complet reste disponible depuis la page du projet."
      >
        <ProjectRuntimeControls projectId={project.id} apps={apps.map((app) => ({ id: app.id, name: app.name }))} />
      </SettingsSection>

      <SettingsSection
        id="transfert"
        title="Transfert"
        icon={ArrowRightLeft}
        description="Déplacez le projet vers une autre organisation dont vous êtes propriétaire ou administrateur. Le transfert est immédiat et modifie l’accès, la facturation et les quotas."
      >
        <ProjectTransfer
          projectId={project.id}
          projectName={project.name}
          targets={transferTargets}
        />
      </SettingsSection>

      <SettingsSection
        id="suppression"
        title="Supprimer le projet"
        icon={TriangleAlert}
        description={
          <>
            Le projet, ses variables et son historique de déploiements sont supprimés.
            {project.coolifyAppId
              ? ' L’application et ses conteneurs sont arrêtés au passage.'
              : ' Aucune application n’a encore été déployée.'}
          </>
        }
      >
        <form onSubmit={deleteProject} className="space-y-4">
          {deleteError && (
            <p id="project-delete-feedback" role="alert" className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
              {deleteError}
            </p>
          )}
          <Input
            id="delete-project-confirm"
            label={`Saisissez « ${project.name} » pour confirmer`}
            value={deleteConfirm}
            onChange={(e) => setDeleteConfirm(e.target.value)}
            autoComplete="off"
            aria-invalid={deleteError ? true : undefined}
            aria-describedby={deleteError ? 'project-delete-feedback' : undefined}
            required
          />
          <div className="flex justify-end">
            <Button type="submit" variant="destructive" loading={deleting}>
              Supprimer définitivement
            </Button>
          </div>
        </form>
      </SettingsSection>
    </div>
  )
}
