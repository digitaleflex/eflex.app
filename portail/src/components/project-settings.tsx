'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Activity,
  ArrowLeft,
  ArrowRightLeft,
  ChevronDown,
  Database,
  Download,
  FileUp,
  GitBranch,
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
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { ProjectRuntimeControls } from '@/components/project-runtime-controls'
import { ProjectDomains } from '@/components/project-domains'
import { ProjectDatabases } from '@/components/project-databases'
import { ProjectTransfer, type TransferTarget } from '@/components/project-transfer'

const NETWORK_ERROR = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'
const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

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
    /** Domaine de l’application principale. */
    domain: string | null
    /** Au moins une application est provisionnée sur l’hébergement. */
    hasHostedApp: boolean
  }
  apps?: SettingsApp[]
  envVars: EnvVarKey[]
  transferTargets: TransferTarget[]
}

interface ParsedEnvEntry {
  key: string
  value: string
  line: number
}

interface EnvParseResult {
  entries: ParsedEnvEntry[]
  invalid: { line: number; content: string; reason: string }[]
}

function FeedbackMessage({ feedback, id }: { feedback: Feedback; id: string }) {
  if (!feedback) return null
  if (feedback.tone === 'success') {
    return (
      <p id={id} role="status" className="rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-foreground">
        {feedback.message}
      </p>
    )
  }
  return (
    <p id={id} role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
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

function sortEnvVars(list: EnvVarKey[]): EnvVarKey[] {
  return [...list].sort((a, b) => {
    const k = a.key.localeCompare(b.key)
    return k !== 0 ? k : envScopeId(a.appId).localeCompare(envScopeId(b.appId))
  })
}

function parseEnvText(text: string): EnvParseResult {
  const entries: ParsedEnvEntry[] = []
  const invalid: EnvParseResult['invalid'] = []
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    const raw = lines[i]
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const normalized = trimmed.startsWith('export ') ? trimmed.slice(7).trim() : trimmed
    const eq = normalized.indexOf('=')
    if (eq <= 0) {
      invalid.push({ line: lineNumber, content: raw.trim(), reason: 'format invalide (attendu NOM=valeur)' })
      continue
    }
    const key = normalized.slice(0, eq).trim()
    let value = normalized.slice(eq + 1)
    if (!ENV_KEY_RE.test(key)) {
      invalid.push({ line: lineNumber, content: key || raw.trim(), reason: 'nom de variable invalide' })
      continue
    }
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1)
    }
    entries.push({ key, value, line: lineNumber })
  }
  return { entries, invalid }
}

function dedupeParsedEntries(entries: ParsedEnvEntry[]): ParsedEnvEntry[] {
  const byKey = new Map<string, ParsedEnvEntry>()
  for (const entry of entries) byKey.set(entry.key, entry)
  return Array.from(byKey.values())
}

export function ProjectSettings({ project, apps: initialApps = [], envVars: initialEnvVars, transferTargets }: ProjectSettingsProps) {
  const router = useRouter()
  const [apps, setApps] = useState<SettingsApp[]>(initialApps)
  const appNameById = new Map(apps.map((app) => [app.id, app.name]))
  const multiApp = apps.length > 1
  const showApplications = apps.length > 0

  const [name, setName] = useState(project.name)
  const [branch, setBranch] = useState(project.branch)
  const [savingGeneral, setSavingGeneral] = useState(false)
  const [generalFeedback, setGeneralFeedback] = useState<Feedback>(null)
  const [savingBranch, setSavingBranch] = useState(false)
  const [branchFeedback, setBranchFeedback] = useState<Feedback>(null)

  const [envVars, setEnvVars] = useState<EnvVarKey[]>(initialEnvVars)
  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')
  const [envScope, setEnvScope] = useState('')
  const [savingEnv, setSavingEnv] = useState(false)
  const [envFeedback, setEnvFeedback] = useState<Feedback>(null)
  const [confirmEnvDelete, setConfirmEnvDelete] = useState<EnvVarKey | null>(null)

  const [envImportText, setEnvImportText] = useState('')
  const [envImportScope, setEnvImportScope] = useState('')
  const [envImporting, setEnvImporting] = useState(false)
  const [envImportFeedback, setEnvImportFeedback] = useState<Feedback>(null)

  const [renameDrafts, setRenameDrafts] = useState<Record<string, string>>({})
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmAppDelete, setConfirmAppDelete] = useState<SettingsApp | null>(null)
  const [appFeedback, setAppFeedback] = useState<Feedback>(null)
  const [newAppRoot, setNewAppRoot] = useState('')
  const [addingApp, setAddingApp] = useState(false)
  const [addAppFeedback, setAddAppFeedback] = useState<Feedback>(null)

  const [confirmProjectDelete, setConfirmProjectDelete] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const envImportTargetAppId = multiApp && envImportScope ? envImportScope : null
  const envImportParsed = useMemo(() => parseEnvText(envImportText), [envImportText])
  const envImportPreview = useMemo(() => {
    const unique = dedupeParsedEntries(envImportParsed.entries)
    return unique.map((entry) => ({
      ...entry,
      conflict: envVars.some((v) => v.key === entry.key && envScopeId(v.appId) === envScopeId(envImportTargetAppId)),
    }))
  }, [envImportParsed.entries, envImportTargetAppId, envVars])

  async function saveGeneral(e: React.FormEvent) {
    e.preventDefault()
    setGeneralFeedback(null)
    if (name.trim() === '') {
      setGeneralFeedback({ tone: 'error', message: 'Le nom ne peut pas être vide.' })
      return
    }
    setSavingGeneral(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), branch: branch.trim() || project.branch }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setGeneralFeedback({ tone: 'error', message: data.error || 'Les modifications n’ont pas pu être enregistrées.' })
        return
      }
      setName(data.project.name)
      setBranch(data.project.branch)
      setGeneralFeedback({ tone: 'success', message: 'Nom du projet mis à jour.' })
      router.refresh()
    } catch {
      setGeneralFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setSavingGeneral(false)
    }
  }

  async function saveBranch(e: React.FormEvent) {
    e.preventDefault()
    setBranchFeedback(null)
    if (branch.trim() === '') {
      setBranchFeedback({ tone: 'error', message: 'La branche ne peut pas être vide.' })
      return
    }
    setSavingBranch(true)
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || project.name, branch: branch.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setBranchFeedback({ tone: 'error', message: data.error || 'La branche n’a pas pu être enregistrée.' })
        return
      }
      setName(data.project.name)
      setBranch(data.project.branch)
      setBranchFeedback({ tone: 'success', message: 'Branche de production mise à jour.' })
      router.refresh()
    } catch {
      setBranchFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setSavingBranch(false)
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
      setEnvVars((current) => sortEnvVars([...current.filter((item) => envItemId(item) !== savedId), saved]))
      setNewKey('')
      setNewValue('')
      setEnvFeedback({ tone: 'success', message: 'Variable enregistrée. Elle sera appliquée au prochain déploiement.' })
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
      setConfirmEnvDelete(null)
      setEnvFeedback({ tone: 'success', message: 'Variable supprimée. Le prochain déploiement en tiendra compte.' })
      router.refresh()
    } catch {
      setEnvFeedback({ tone: 'error', message: NETWORK_ERROR })
    }
  }

  async function importEnvVars() {
    setEnvImportFeedback(null)
    if (envImportPreview.length === 0) {
      setEnvImportFeedback({ tone: 'error', message: 'Aucune variable valide à importer.' })
      return
    }
    setEnvImporting(true)
    const imported: EnvVarKey[] = []
    const errors: string[] = []
    const appId = envImportTargetAppId ?? undefined
    try {
      for (const entry of envImportPreview) {
        const response = await fetch(`/api/projects/${project.id}/env-vars`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(appId ? { key: entry.key, value: entry.value, appId } : { key: entry.key, value: entry.value }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          errors.push(`${entry.key} : ${data.error || 'échec'}`)
          continue
        }
        if (data.envVar) imported.push(data.envVar as EnvVarKey)
      }
      if (imported.length > 0) {
        setEnvVars((current) => {
          const importedIds = new Set(imported.map((item) => envItemId(item)))
          return sortEnvVars([...current.filter((item) => !importedIds.has(envItemId(item))), ...imported])
        })
        router.refresh()
      }
      if (errors.length === 0) {
        setEnvImportText('')
        setEnvImportFeedback({ tone: 'success', message: `${imported.length} variable${imported.length > 1 ? 's' : ''} importée${imported.length > 1 ? 's' : ''}. Elles seront appliquées au prochain déploiement.` })
      } else {
        setEnvImportFeedback({
          tone: 'error',
          message: `${imported.length} variable${imported.length > 1 ? 's' : ''} importée${imported.length > 1 ? 's' : ''}, ${errors.length} en échec : ${errors.slice(0, 3).join(' ; ')}${errors.length > 3 ? '…' : ''}`,
        })
      }
    } catch {
      setEnvImportFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setEnvImporting(false)
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
    try {
      const response = await fetch(`/api/projects/${project.id}/apps/${app.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setAppFeedback({ tone: 'error', message: data.error || 'L’application n’a pas pu être supprimée.' })
        return
      }
      setApps((current) => current.filter((item) => item.id !== app.id))
      setEnvVars((current) => current.filter((item) => item.appId !== app.id))
      setConfirmAppDelete(null)
      setAppFeedback({ tone: 'success', message: `L’application « ${app.name} » a été supprimée.` })
      router.refresh()
    } catch {
      setAppFeedback({ tone: 'error', message: NETWORK_ERROR })
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
        message: data.deployment ? 'Application ajoutée. Son premier déploiement a été lancé.' : 'Application ajoutée.',
      })
      router.refresh()
    } catch {
      setAddAppFeedback({ tone: 'error', message: NETWORK_ERROR })
    } finally {
      setAddingApp(false)
    }
  }

  async function deleteProject() {
    setDeleteError('')
    try {
      const response = await fetch(`/api/projects/${project.id}`, { method: 'DELETE' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setDeleteError(data.error || 'Le projet n’a pas pu être supprimé.')
        return
      }
      setConfirmProjectDelete(false)
      router.push('/dashboard')
      router.refresh()
    } catch {
      setDeleteError(NETWORK_ERROR)
    }
  }

  const nav = [
    { href: '#general', label: 'Général' },
    { href: '#branche-deploiement', label: 'Branche et déploiement' },
    { href: '#domaines', label: 'Domaines' },
    { href: '#bases', label: 'Bases de données' },
    { href: '#disponibilite', label: 'Disponibilité' },
    { href: '#variables', label: 'Variables' },
    ...(showApplications ? [{ href: '#applications', label: 'Applications' }] : []),
    { href: '#support', label: 'Support' },
    { href: '#zone-dangereuse', label: 'Zone dangereuse' },
  ]

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link
          href={`/dashboard/projects/${project.id}`}
          className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour au projet
        </Link>
      </div>

      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight">Paramètres du projet</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {project.name} · <span className="font-mono">{project.slug}</span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Ces réglages ne concernent que ce projet. Les valeurs des variables ne sont jamais
          réaffichées ; seuls leurs noms et leurs dates de mise à jour sont transmis à cette page.
        </p>
      </header>

      <nav aria-label="Sections des paramètres" className="sticky top-0 z-10 -mx-1 rounded-lg border border-border bg-background/95 p-2 backdrop-blur">
        <ul className="flex flex-wrap gap-1">
          {nav.map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                className="inline-flex min-h-9 items-center rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground [@media(pointer:coarse)]:min-h-11"
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <SettingsSection
        id="general"
        title="Général"
        icon={Settings}
        description="Le nom est modifiable. Les identifiants techniques restent stables pour ne pas casser les URLs ni les labels."
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
            <div className="flex justify-end">
              <Button type="submit" loading={savingGeneral} disabled={name.trim() === project.name}>
                Enregistrer le nom
              </Button>
            </div>
          </form>

          <details className="rounded-lg border border-border bg-muted/30 p-3">
            <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between gap-2 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
              Détails techniques
              <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            </summary>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <dt className="text-muted-foreground">Identifiant (slug)</dt>
                <dd className="font-mono text-foreground">{project.slug}</dd>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <dt className="text-muted-foreground">Domaine principal</dt>
                <dd className="text-foreground">
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
                </dd>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <dt className="text-muted-foreground">Identifiant interne</dt>
                <dd className="break-all font-mono text-xs text-foreground">{project.id}</dd>
              </div>
            </dl>
          </details>
        </div>
      </SettingsSection>

      <SettingsSection
        id="branche-deploiement"
        title="Branche et déploiement"
        icon={GitBranch}
        description="Les push sur la branche de production déclenchent un déploiement automatique."
      >
        <div className="space-y-4">
          <FeedbackMessage feedback={branchFeedback} id="project-branch-feedback" />
          <form onSubmit={saveBranch} className="space-y-4">
            <Input
              id="project-branch"
              label="Branche de production"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              hint="Utilisée pour les déploiements automatiques déclenchés par les push."
              spellCheck={false}
              aria-invalid={branchFeedback?.tone === 'error' ? true : undefined}
              aria-describedby={branchFeedback?.tone === 'error' ? 'project-branch-feedback' : undefined}
              required
            />
            <div className="flex justify-end">
              <Button type="submit" loading={savingBranch} disabled={branch.trim() === project.branch}>
                Enregistrer la branche
              </Button>
            </div>
          </form>
        </div>
      </SettingsSection>

      <section id="execution" aria-labelledby="execution-title" className="scroll-mt-28 space-y-4">
        <header className="space-y-1">
          <h2 id="execution-title" className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            Exécution
          </h2>
          <p className="text-sm text-muted-foreground">
            Domaines, bases de données et disponibilité de l’application hébergée.
          </p>
        </header>
        <div className="space-y-6">
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
        </div>
      </section>

      <SettingsSection
        id="variables"
        title="Variables d’environnement"
        icon={KeyRound}
        description="Les valeurs sont chiffrées au repos et ne sont jamais réaffichées. Une modification s’applique au prochain déploiement."
      >
        <div className="space-y-6">
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
                          <p className="break-all font-mono text-sm">{item.key}</p>
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
                        <Button
                          size="sm"
                          variant="ghost"
                          className="self-start text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmEnvDelete(item)}
                          aria-label={`Supprimer la variable ${item.key}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                          Supprimer
                        </Button>
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
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Pour remplacer une valeur existante, saisissez-la à nouveau : l’ancienne ne peut pas être relue.
              </p>
              <Button type="submit" loading={savingEnv}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter ou mettre à jour
              </Button>
            </div>
          </form>

          <section aria-labelledby="env-import-title" className="space-y-4 rounded-lg border border-border p-4">
            <div>
              <h3 id="env-import-title" className="flex items-center gap-2 text-sm font-medium">
                <FileUp className="h-4 w-4 text-primary" aria-hidden="true" />
                Importer depuis un fichier .env
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Collez le contenu ou importez un fichier texte. Les valeurs ne sont jamais affichées ; seules les clés sont prévisualisées. En cas de clé en double, la dernière valeur fournie est conservée.
              </p>
            </div>
            <FeedbackMessage feedback={envImportFeedback} id="project-env-import-feedback" />
            {multiApp && (
              <div>
                <label htmlFor="env-import-scope" className="mb-1.5 block text-sm font-medium">
                  Portée de l’import
                </label>
                <select
                  id="env-import-scope"
                  value={envImportScope}
                  onChange={(e) => setEnvImportScope(e.target.value)}
                  className="min-h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">Toutes les applications</option>
                  {apps.map((app) => (
                    <option key={app.id} value={app.id}>
                      Application : {app.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <label htmlFor="env-import-file" className="block text-sm font-medium">
                Fichier texte (optionnel)
              </label>
              <input
                id="env-import-file"
                type="file"
                accept=".env,text/plain"
                className="block w-full text-sm text-muted-foreground file:mr-3 file:min-h-9 file:rounded-md file:border file:border-input file:bg-background file:px-3 file:text-sm file:font-medium file:text-foreground"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  try {
                    setEnvImportText(await file.text())
                    setEnvImportFeedback(null)
                  } catch {
                    setEnvImportFeedback({ tone: 'error', message: 'Impossible de lire le fichier.' })
                  }
                  e.target.value = ''
                }}
              />
            </div>
            <div>
              <label htmlFor="env-import-text" className="mb-1.5 block text-sm font-medium">
                Contenu .env
              </label>
              <textarea
                id="env-import-text"
                value={envImportText}
                onChange={(e) => {
                  setEnvImportText(e.target.value)
                  setEnvImportFeedback(null)
                }}
                rows={6}
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                placeholder={'API_KEY=...\n# commentaire ignoré\nexport TOKEN=...'}
              />
            </div>

            {(envImportPreview.length > 0 || envImportParsed.invalid.length > 0) && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                {envImportPreview.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">
                      Prévisualisation ({envImportPreview.length} clé{envImportPreview.length > 1 ? 's' : ''})
                    </p>
                    <ul className="space-y-1">
                      {envImportPreview.map((entry) => (
                        <li key={entry.key} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="font-mono">{entry.key}</span>
                          <span
                            className={
                              entry.conflict
                                ? 'rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-xs text-foreground'
                                : 'rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-xs text-foreground'
                            }
                          >
                            {entry.conflict ? 'Existante (sera remplacée)' : 'Nouvelle'}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-muted-foreground">
                      {envImportPreview.filter((e) => e.conflict).length} conflit{envImportPreview.filter((e) => e.conflict).length > 1 ? 's' : ''} · les valeurs ne sont pas affichées.
                    </p>
                  </div>
                )}
                {envImportParsed.invalid.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-destructive">Lignes invalides</p>
                    <ul className="space-y-1 text-xs text-destructive">
                      {envImportParsed.invalid.map((item, idx) => (
                        <li key={`${item.line}-${idx}`}>
                          Ligne {item.line} : {item.reason}
                          {item.content ? ` (« ${item.content} »)` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end">
              <Button
                type="button"
                loading={envImporting}
                disabled={envImportPreview.length === 0}
                onClick={() => void importEnvVars()}
              >
                Importer {envImportPreview.length > 0 ? `(${envImportPreview.length})` : ''}
              </Button>
            </div>
          </section>
        </div>
      </SettingsSection>

      {showApplications && (
        <SettingsSection
          id="applications"
          title="Applications"
          icon={Settings}
          description={`${apps.length} application${apps.length > 1 ? 's' : ''} dans ce projet. Vous pouvez les renommer ou les supprimer.`}
        >
          <div className="space-y-5">
            <FeedbackMessage feedback={appFeedback} id="project-apps-feedback" />
            {apps.length <= 1 && (
              <p className="text-sm text-muted-foreground">Il doit toujours rester au moins une application dans le projet.</p>
            )}
            <ul className="divide-y divide-border rounded-lg border border-border">
              {apps.map((app) => {
                const draft = renameDrafts[app.id] ?? app.name
                const changed = draft.trim() !== '' && draft.trim() !== app.name
                return (
                  <li key={app.id} className="space-y-3 p-4">
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
                        <span className="text-xs text-muted-foreground">Impossible de supprimer la dernière application.</span>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmAppDelete(app)}
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

      <section id="support" aria-labelledby="support-title" className="scroll-mt-28">
        <Card>
          <CardHeader>
            <h2 id="support-title" className="flex items-center gap-2 text-base font-semibold">
              <Download className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              Support et diagnostic
            </h2>
            <p className="text-sm text-muted-foreground">
              Exportez un bundle de diagnostic à partager avec le support. Il contient uniquement des métadonnées,
              statuts et diagnostics interprétés des déploiements récents : <strong className="font-medium text-foreground">aucune variable d’environnement, aucun jeton et aucun journal brut</strong> n’est inclus.
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              Fichier JSON (20 derniers déploiements) · accès limité aux membres de l’organisation.
            </p>
            <a
              href={`/api/projects/${project.id}/diagnostic`}
              download
              className="inline-flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium transition-[background-color,color,box-shadow,border-color,transform] duration-200 ease-out-expo hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [@media(pointer:coarse)]:h-11"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              Télécharger le bundle
            </a>
          </CardContent>
        </Card>
      </section>


      <section id="zone-dangereuse" aria-labelledby="zone-dangereuse-title" className="scroll-mt-28">
        <details className="group rounded-xl border border-destructive/30 bg-destructive/5">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
            <div>
              <h2 id="zone-dangereuse-title" className="flex items-center gap-2 font-semibold text-destructive">
                <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                Zone dangereuse
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Actions irréversibles ou à fort impact. Elles sont isolées et nécessitent une confirmation explicite.
              </p>
            </div>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>

          <div className="space-y-6 border-t border-destructive/20 p-4 pt-5">
            <section id="transfert" aria-labelledby="transfert-title" className="scroll-mt-28 space-y-3 rounded-lg border border-border bg-card p-4">
              <div>
                <h3 id="transfert-title" className="flex items-center gap-2 font-semibold">
                  <ArrowRightLeft className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  Transfert
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Déplacez le projet vers une autre organisation dont vous êtes propriétaire ou administrateur. Le transfert est immédiat et modifie l’accès, la facturation et les quotas.
                </p>
              </div>
              <ProjectTransfer projectId={project.id} projectName={project.name} targets={transferTargets} />
            </section>

            <section id="suppression" aria-labelledby="suppression-title" className="scroll-mt-28 space-y-4 rounded-lg border border-destructive/30 bg-card p-4">
              <div>
                <h3 id="suppression-title" className="flex items-center gap-2 font-semibold text-destructive">
                  <Trash2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  Supprimer le projet
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Le projet, ses variables chiffrées et son historique de déploiements seront supprimés définitivement.
                  {project.hasHostedApp
                    ? ' L’application hébergée et ses conteneurs seront arrêtés au passage.'
                    : ' Aucune application n’a encore été déployée.'}
                </p>
              </div>
              {deleteError && (
                <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {deleteError}
                </p>
              )}
              <div className="flex justify-end">
                <Button type="button" variant="destructive" onClick={() => setConfirmProjectDelete(true)}>
                  Supprimer définitivement
                </Button>
              </div>
            </section>
          </div>
        </details>
      </section>

      <ConfirmDialog
        open={confirmEnvDelete !== null}
        title="Supprimer la variable ?"
        description={
          confirmEnvDelete ? (
            <>
              La variable <span className="font-mono font-medium text-foreground">{confirmEnvDelete.key}</span>
              {multiApp ? <> ({scopeLabel(confirmEnvDelete.appId, appNameById)})</> : null} sera supprimée.
              Sa valeur n’est pas affichée et ne pourra pas être récupérée. Le changement sera appliqué au prochain déploiement.
            </>
          ) : null
        }
        confirmLabel="Supprimer la variable"
        destructive
        onConfirm={() => (confirmEnvDelete ? removeEnvVar(confirmEnvDelete) : undefined)}
        onCancel={() => setConfirmEnvDelete(null)}
      />

      <ConfirmDialog
        open={confirmAppDelete !== null}
        title="Supprimer l’application ?"
        description={
          confirmAppDelete ? (
            <>
              L’application <span className="font-medium text-foreground">« {confirmAppDelete.name} »</span> ({' '}
              <span className="font-mono">{confirmAppDelete.root || '/'}</span> ) sera supprimée définitivement, ainsi que ses ressources associées.
            </>
          ) : null
        }
        confirmLabel="Supprimer l’application"
        destructive
        onConfirm={() => (confirmAppDelete ? removeApp(confirmAppDelete) : undefined)}
        onCancel={() => setConfirmAppDelete(null)}
      />

      <ConfirmDialog
        open={confirmProjectDelete}
        title="Supprimer définitivement le projet ?"
        description={
          <>
            Le projet <span className="font-medium text-foreground">« {project.name} »</span>, ses variables chiffrées et son historique de déploiements seront supprimés.
            {project.hasHostedApp ? ' L’application hébergée et ses conteneurs seront arrêtés.' : ''} Cette action est irréversible.
          </>
        }
        confirmLabel="Supprimer le projet"
        destructive
        requireText={project.name}
        onConfirm={deleteProject}
        onCancel={() => {
          setConfirmProjectDelete(false)
          setDeleteError('')
        }}
      />
    </div>
  )
}
