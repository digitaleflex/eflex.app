'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Activity, ArrowRightLeft, Database, Globe, KeyRound, Plus, Trash2, TriangleAlert } from 'lucide-react'
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

const dateFormat = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function ProjectSettings({ project, envVars: initialEnvVars, transferTargets }: ProjectSettingsProps) {
  const router = useRouter()

  const [name, setName] = useState(project.name)
  const [branch, setBranch] = useState(project.branch)
  const [savingGeneral, setSavingGeneral] = useState(false)
  const [generalFeedback, setGeneralFeedback] = useState<Feedback>(null)

  const [envVars, setEnvVars] = useState<EnvVarKey[]>(initialEnvVars)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [savingEnv, setSavingEnv] = useState(false)
  const [envFeedback, setEnvFeedback] = useState<Feedback>(null)
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [deletingKey, setDeletingKey] = useState<string | null>(null)

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
    if (newKey.trim() === '') {
      setEnvFeedback({ tone: 'error', message: 'Indiquez le nom de la variable.' })
      return
    }
    setSavingEnv(true)
    try {
      const response = await fetch(`/api/projects/${project.id}/env-vars`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: newKey.trim(), value: newValue }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setEnvFeedback({ tone: 'error', message: data.error || 'La variable n’a pas pu être enregistrée.' })
        return
      }
      const saved = data.envVar as EnvVarKey
      setEnvVars((current) => {
        const others = current.filter((item) => item.key !== saved.key)
        return [...others, saved].sort((a, b) => a.key.localeCompare(b.key))
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

  async function removeEnvVar(key: string) {
    setEnvFeedback(null)
    setDeletingKey(key)
    try {
      const response = await fetch(
        `/api/projects/${project.id}/env-vars/${encodeURIComponent(key)}`,
        { method: 'DELETE' },
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setEnvFeedback({ tone: 'error', message: data.error || 'La variable n’a pas pu être supprimée.' })
        return
      }
      setEnvVars((current) => current.filter((item) => item.key !== key))
      setPendingDelete(null)
      setEnvFeedback({ tone: 'success', message: 'Variable supprimée. Le prochain déploiement en tiendra compte.' })
      router.refresh()
    } catch {
      setEnvFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setDeletingKey(null)
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
    <div className="space-y-8 max-w-3xl">
      <Link
        href={`/dashboard/projects/${project.id}`}
        className="inline-flex items-center gap-2 min-h-11 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        Retour au projet
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paramètres du projet</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {project.name} · <span className="font-mono">{project.slug}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Général</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Le nom est modifiable. Le domaine et l’identifiant technique restent stables pour ne pas casser
            les URLs ni les labels Traefik.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <ArrowRightLeft className="w-4 h-4" aria-hidden="true" />
            Transfert
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Déplacez le projet vers une autre organisation dont vous êtes propriétaire ou administrateur.
            Le transfert est immédiat et modifie l’accès, la facturation et les quotas.
          </p>
        </CardHeader>
        <CardContent>
          <ProjectTransfer
            projectId={project.id}
            projectName={project.name}
            targets={transferTargets}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <Globe className="w-4 h-4" aria-hidden="true" />
            Domaines
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Le domaine Eflex reste stable. Ajoutez vos propres domaines avec un CNAME ; le certificat
            SSL est émis automatiquement après vérification.
          </p>
        </CardHeader>
        <CardContent>
          <ProjectDomains projectId={project.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <Database className="w-4 h-4" aria-hidden="true" />
            Bases de données
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Créez une base PostgreSQL ou un cache Redis privé sur l’infrastructure. La variable
            <code className="mx-1 font-mono">DATABASE_URL</code> ou
            <code className="mx-1 font-mono">REDIS_URL</code>
            est injectée automatiquement au déploiement.
          </p>
        </CardHeader>
        <CardContent>
          <ProjectDatabases projectId={project.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4" aria-hidden="true" />
            Disponibilité & actions
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Statut du conteneur sur la plateforme et actions immédiates. Le redéploiement complet reste
            disponible depuis la page du projet.
          </p>
        </CardHeader>
        <CardContent>
          <ProjectRuntimeControls projectId={project.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <KeyRound className="w-4 h-4" aria-hidden="true" />
            Variables d’environnement
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Les valeurs sont chiffrées au repos et ne sont jamais réaffichées. Une modification
            s’applique au prochain déploiement.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <FeedbackMessage feedback={envFeedback} id="project-env-feedback" />

          {envVars.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune variable définie.</p>
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {envVars.map((item) => (
                <li key={item.key} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-mono text-sm break-all">{item.key}</p>
                    <p className="text-xs text-muted-foreground">
                      Mise à jour le {dateFormat.format(new Date(item.updatedAt))}
                    </p>
                  </div>
                  {pendingDelete === item.key ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={deletingKey === item.key}
                        onClick={() => removeEnvVar(item.key)}
                      >
                        Confirmer
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setPendingDelete(null)}>
                        Annuler
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="self-start text-muted-foreground hover:text-destructive"
                      onClick={() => setPendingDelete(item.key)}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                      Supprimer
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={saveEnvVar} className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
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
                placeholder="valeur secrète"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                spellCheck={false}
                autoComplete="off"
                aria-invalid={envFeedback?.tone === 'error' ? true : undefined}
                aria-describedby={envFeedback?.tone === 'error' ? 'project-env-feedback' : undefined}
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={savingEnv}>
                <Plus className="w-4 h-4" aria-hidden="true" />
                Ajouter ou mettre à jour
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2 text-destructive">
            <TriangleAlert className="w-4 h-4" aria-hidden="true" />
            Supprimer le projet
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Le projet, ses variables et son historique de déploiements sont supprimés.
            {project.coolifyAppId
              ? ' L’application et ses conteneurs sont arrêtés au passage.'
              : ' Aucune application n’a encore été déployée.'}
          </p>
        </CardHeader>
        <CardContent>
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
        </CardContent>
      </Card>
    </div>
  )
}
