'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { ServiceIcon } from '@/components/service-icon'

/**
 * Pilotage de Coolify depuis l'administration : serveurs, stockages S3, sécurité des images,
 * déploiements en cours et journal de Coolify. Chaque onglet charge ses données à l'ouverture
 * (`/api/admin/coolify/*`) ; les actions sont auditées côté serveur.
 */

type Feedback = { tone: 'success' | 'error'; message: string } | null

const API = '/api/admin/coolify'
const dateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

/** Libellés français des états renvoyés par Coolify ; un état inconnu reste affiché tel quel. */
const STATE_FR: Record<string, string> = {
  running: 'en marche',
  exited: 'arrêté',
  stopped: 'arrêté',
  success: 'réussi',
  failed: 'échec',
  queued: 'en file',
  in_progress: 'en cours',
  finished: 'terminé',
  cancelled: 'annulé',
  ready: 'prêt',
  building: 'installation',
  starting: 'démarrage',
  restarting: 'redémarrage',
}
const fr = (state: string | null | undefined) => (state ? (STATE_FR[state] ?? state) : 'état inconnu')

async function call<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const response = await fetch(`${API}${path}`, {
      cache: 'no-store',
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) return { ok: false, error: body.error ?? `Erreur ${response.status}` }
    return { ok: true, data: body as T }
  } catch {
    return { ok: false, error: 'Impossible de contacter le serveur.' }
  }
}

function useLoad<T>(path: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async () => {
    setLoading(true)
    const result = await call<T>(path)
    if (result.ok) {
      setData(result.data)
      setError(null)
    } else setError(result.error)
    setLoading(false)
  }, [path])
  useEffect(() => {
    void load()
  }, [load])
  return { data, error, loading, reload: load }
}

function Notice({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null
  return (
    <p
      role={feedback.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'rounded-lg border p-3 text-sm',
        feedback.tone === 'error'
          ? 'border-destructive/25 bg-destructive/10 text-destructive'
          : 'border-success/25 bg-success/10 text-foreground',
      )}
    >
      {feedback.message}
    </p>
  )
}

function LoadState({ loading, error, onRetry }: { loading: boolean; error: string | null; onRetry: () => void }) {
  if (loading) return <p className="text-sm text-muted-foreground">Chargement…</p>
  if (!error) return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-destructive/25 bg-destructive/10 p-3 text-sm text-destructive">
      {error}
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Réessayer
      </Button>
    </div>
  )
}

const Dot = ({ tone }: { tone: 'ok' | 'warn' | 'bad' | 'muted' }) => (
  <span
    aria-hidden="true"
    className={cn(
      'inline-block h-2 w-2 shrink-0 rounded-full',
      tone === 'ok' && 'bg-success',
      tone === 'warn' && 'bg-warning',
      tone === 'bad' && 'bg-destructive',
      tone === 'muted' && 'bg-muted-foreground/50',
    )}
  />
)

/* ------------------------------------------------------------------ */
/* Serveurs                                                            */
/* ------------------------------------------------------------------ */

interface ServerRow {
  id: string
  name: string
  ip: string | null
  reachable: boolean
  usable: boolean
  buildServer: boolean
  coolifyHost: boolean
}

type Res<T> = T | { error: string }
interface ServerControlData {
  proxy: Res<{ type: string | null; status: string | null }>
  cleanup: Res<{ frequency: string; threshold: number; deleteUnusedVolumes: boolean; deleteUnusedNetworks: boolean }>
  cleanupExecutions: Res<Array<{ id: string; status: string; createdAt: string; finishedAt: string | null; message: string | null }>>
  imageScanning: Res<{ enabled: boolean; state: string | null; failedStep: string | null }>
}

const isErr = <T,>(value: Res<T>): value is { error: string } =>
  Boolean(value) && typeof value === 'object' && 'error' in (value as object)

function ServerPanel({ server }: { server: ServerRow }) {
  const { data, error, loading, reload } = useLoad<ServerControlData>(`/servers/${server.id}`)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmProxy, setConfirmProxy] = useState(false)
  const [frequency, setFrequency] = useState('')
  const [threshold, setThreshold] = useState('')
  useEffect(() => {
    if (data && !isErr(data.cleanup)) {
      setFrequency(data.cleanup.frequency)
      setThreshold(String(data.cleanup.threshold))
    }
  }, [data])

  async function act(body: Record<string, unknown>, method: 'POST' | 'PATCH' = 'POST') {
    setBusy(String(body.action ?? 'settings'))
    setFeedback(null)
    const result = await call<{ message?: string }>(`/servers/${server.id}`, { method, body: JSON.stringify(body) })
    setBusy(null)
    setConfirmProxy(false)
    setFeedback(result.ok ? { tone: 'success', message: result.data.message ?? 'C’est fait.' } : { tone: 'error', message: result.error })
    if (result.ok) await reload()
  }

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Dot tone={server.reachable ? 'ok' : 'bad'} />
              {server.name}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground tabular-nums">
              {server.ip ?? 'adresse inconnue'} · {server.reachable ? 'joignable' : 'injoignable'}
              {server.coolifyHost && ' · héberge Coolify'}
              {server.buildServer && ' · serveur de build'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" loading={busy === 'validate'} onClick={() => void act({ action: 'validate' })}>
              Valider la connexion
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => void reload()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Actualiser
            </Button>
          </div>
        </div>

        <Notice feedback={feedback} />
        <LoadState loading={loading} error={error} onRetry={() => void reload()} />

        {data && (
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="space-y-2 rounded-lg border border-border p-3">
              <h3 className="text-sm font-medium">Proxy</h3>
              {isErr(data.proxy) ? (
                <p className="text-xs text-warning">Indisponible : {data.proxy.error}</p>
              ) : (
                <p className="flex items-center gap-2 text-sm">
                  <Dot tone={data.proxy.status === 'running' ? 'ok' : 'warn'} />
                  {data.proxy.type ?? 'Proxy'} · {fr(data.proxy.status)}
                </p>
              )}
              <Button type="button" variant="outline" size="sm" loading={busy === 'proxy-restart'} onClick={() => setConfirmProxy(true)}>
                Redémarrer le proxy
              </Button>
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3">
              <h3 className="text-sm font-medium">Analyse des failles des images</h3>
              {isErr(data.imageScanning) ? (
                <p className="text-xs text-warning">Indisponible : {data.imageScanning.error}</p>
              ) : (
                <>
                  <p className="flex items-center gap-2 text-sm">
                    <Dot tone={data.imageScanning.enabled ? (data.imageScanning.failedStep ? 'bad' : 'ok') : 'muted'} />
                    {data.imageScanning.enabled ? 'Activée' : 'Désactivée'}
                    {data.imageScanning.state && ` · ${fr(data.imageScanning.state)}`}
                  </p>
                  {data.imageScanning.failedStep && (
                    <p className="text-xs text-destructive">Échec à l’étape : {data.imageScanning.failedStep}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={busy === 'image-scan'}
                    onClick={() => !isErr(data.imageScanning) && void act({ action: 'image-scan', enabled: !data.imageScanning.enabled })}
                  >
                    {data.imageScanning.enabled ? 'Désactiver' : 'Activer l’analyse'}
                  </Button>
                </>
              )}
            </div>

            <div className="space-y-2 rounded-lg border border-border p-3 lg:row-span-2">
              <h3 className="text-sm font-medium">Nettoyage Docker</h3>
              {isErr(data.cleanup) ? (
                <p className="text-xs text-warning">Indisponible : {data.cleanup.error}</p>
              ) : (
                <form
                  className="space-y-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    void act({ frequency: frequency.trim(), threshold: Number(threshold) }, 'PATCH')
                  }}
                >
                  <Input label="Fréquence (cron)" value={frequency} onChange={(event) => setFrequency(event.target.value)} className="font-mono" />
                  <Input
                    label="Seuil de disque (%)"
                    inputMode="numeric"
                    value={threshold}
                    onChange={(event) => setThreshold(event.target.value.replace(/\D/g, '').slice(0, 2))}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button type="submit" variant="outline" size="sm" loading={busy === 'settings'}>
                      Enregistrer
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      loading={busy === 'cleanup-run'}
                      onClick={() => void act({ action: 'cleanup-run', deleteUnusedVolumes: false, deleteUnusedNetworks: false })}
                    >
                      Nettoyer maintenant
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Supprime les images et conteneurs inutilisés. Les volumes ne sont jamais supprimés depuis E-FLEX.
                  </p>
                </form>
              )}
              {!isErr(data.cleanupExecutions) && data.cleanupExecutions.length > 0 && (
                <ul className="space-y-1 border-t border-border pt-2 text-xs tabular-nums">
                  {data.cleanupExecutions.slice(0, 5).map((execution) => (
                    <li key={execution.id} className="flex items-center gap-2">
                      <Dot tone={execution.status === 'success' ? 'ok' : execution.status === 'failed' ? 'bad' : 'warn'} />
                      {dateTime(execution.createdAt)} · {fr(execution.status)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        <ConfirmDialog
          open={confirmProxy}
          title={`Redémarrer le proxy de ${server.name} ?`}
          description="Tous les sites de ce serveur seront indisponibles quelques secondes."
          confirmLabel="Redémarrer"
          destructive
          onConfirm={() => act({ action: 'proxy-restart' })}
          onCancel={() => setConfirmProxy(false)}
        />
      </CardContent>
    </Card>
  )
}

function ServersTab() {
  const { data, error, loading, reload } = useLoad<{ servers: ServerRow[] }>('/servers')
  return (
    <div className="space-y-4">
      <LoadState loading={loading} error={error} onRetry={() => void reload()} />
      {data?.servers.length === 0 && <p className="text-sm text-muted-foreground">Aucun serveur déclaré dans Coolify.</p>}
      {data?.servers.map((server) => <ServerPanel key={server.id} server={server} />)}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Stockages S3                                                        */
/* ------------------------------------------------------------------ */

interface StorageRow {
  id: string
  name: string
  endpoint: string
  bucket: string | null
  region: string | null
}

const EMPTY_STORAGE = { name: '', endpoint: '', bucket: '', region: '', key: '', secret: '' }

function StoragesTab() {
  const { data, error, loading, reload } = useLoad<{ storages: StorageRow[]; backupStorageId: string | null }>('/s3-storages')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState(EMPTY_STORAGE)
  const [open, setOpen] = useState(false)

  async function validate(id: string) {
    setBusy(id)
    setFeedback(null)
    const result = await call<{ valid: boolean; message: string | null }>(`/s3-storages/${id}/validate`, { method: 'POST' })
    setBusy(null)
    if (!result.ok) setFeedback({ tone: 'error', message: result.error })
    else
      setFeedback(
        result.data.valid
          ? { tone: 'success', message: 'Connexion au stockage valide.' }
          : { tone: 'error', message: `Connexion refusée${result.data.message ? ` : ${result.data.message}` : '.'}` },
      )
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setBusy('create')
    setFeedback(null)
    const result = await call<{ id: string }>('/s3-storages', { method: 'POST', body: JSON.stringify(form) })
    setBusy(null)
    if (!result.ok) {
      setFeedback({ tone: 'error', message: result.error })
      return
    }
    setForm(EMPTY_STORAGE)
    setOpen(false)
    setFeedback({
      tone: 'success',
      message: `Stockage créé (${result.data.id}). Pour l’utiliser pour les sauvegardes, mettez cet identifiant dans COOLIFY_BACKUP_S3_STORAGE_UUID puis redéployez ; E-FLEX tentera ensuite d’appliquer la copie S3 aux planifications existantes.`,
    })
    await reload()
  }

  const field = (key: keyof typeof EMPTY_STORAGE) => ({
    value: form[key],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value }),
  })

  return (
    <div className="space-y-4">
      <Notice feedback={feedback} />
      <LoadState loading={loading} error={error} onRetry={() => void reload()} />
      {data && (
        <>
          {!data.backupStorageId && (
            <p role="status" className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
              Aucun stockage n’est utilisé pour les sauvegardes des bases : elles restent sur le serveur de chaque base.
              Choisissez un stockage ci-dessous et renseignez COOLIFY_BACKUP_S3_STORAGE_UUID.
            </p>
          )}
          {data.storages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucun stockage S3 déclaré.</p>
          ) : (
            <ul className="space-y-2">
              {data.storages.map((storage) => (
                <li key={storage.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {storage.name}
                      {storage.id === data.backupStorageId && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">Sauvegardes</span>
                      )}
                    </p>
                    <p className="break-all text-xs text-muted-foreground">
                      {storage.endpoint} · {storage.bucket ?? '—'} · {storage.region ?? '—'} · <span className="font-mono">{storage.id}</span>
                    </p>
                  </div>
                  <Button type="button" variant="outline" size="sm" loading={busy === storage.id} onClick={() => void validate(storage.id)}>
                    Tester la connexion
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button type="button" variant="outline" size="sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
            {open ? 'Annuler' : 'Ajouter un stockage S3'}
          </Button>
          {open && (
            <form onSubmit={create} className="grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2">
              <Input label="Nom" required {...field('name')} placeholder="Backblaze — sauvegardes" />
              <Input label="Adresse S3 (https://…)" required {...field('endpoint')} placeholder="https://s3.eu-central-003.backblazeb2.com" />
              <Input label="Compartiment" required {...field('bucket')} placeholder="eflex-db-backups" />
              <Input label="Région" required {...field('region')} placeholder="eu-central-003" />
              <Input label="Clé d’accès" required autoComplete="off" {...field('key')} />
              <Input label="Clé secrète" required type="password" autoComplete="new-password" {...field('secret')} />
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Les clés sont envoyées à Coolify et ne sont ni conservées ni journalisées par E-FLEX. Utilisez une clé limitée à ce
                seul compartiment.
              </p>
              <div className="sm:col-span-2">
                <Button type="submit" loading={busy === 'create'}>
                  Créer le stockage
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Sécurité                                                            */
/* ------------------------------------------------------------------ */

interface VulnerabilityRow {
  id: string
  name: string
  type: string
  status: string
  label: string | null
  action: string | null
  critical: number
  high: number
  medium: number
  exploited: number
  endOfLife: boolean
  checkedAt: string | null
}

function SecurityTab() {
  const { data, error, loading, reload } = useLoad<{ resources: VulnerabilityRow[] }>('/vulnerabilities')
  return (
    <div className="space-y-4">
      <LoadState loading={loading} error={error} onRetry={() => void reload()} />
      {data && data.resources.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Aucun résultat d’analyse. Activez l’analyse des images sur un serveur (onglet Serveurs), puis redéployez.
        </p>
      )}
      {data && data.resources.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Failles connues par ressource</caption>
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Ressource</th>
                <th scope="col" className="py-2 pr-3 font-medium">État</th>
                <th scope="col" className="py-2 pr-3 font-medium">Exploitées</th>
                <th scope="col" className="py-2 pr-3 font-medium">Critiques</th>
                <th scope="col" className="py-2 pr-3 font-medium">Élevées</th>
                <th scope="col" className="py-2 font-medium">Que faire</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.resources.map((row) => (
                <tr key={row.id} className="border-t border-border align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {row.type}
                      {row.endOfLife && ' · version en fin de vie'} · vérifié {dateTime(row.checkedAt)}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{row.label ?? row.status}</td>
                  <td className={cn('py-2 pr-3', row.exploited > 0 && 'font-semibold text-destructive')}>{row.exploited}</td>
                  <td className={cn('py-2 pr-3', row.critical > 0 && 'text-destructive')}>{row.critical}</td>
                  <td className="py-2 pr-3">{row.high}</td>
                  <td className="py-2 text-xs">{row.action ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Déploiements Coolify                                                */
/* ------------------------------------------------------------------ */

interface CoolifyDeploymentRow {
  id: string
  application: string
  server: string | null
  status: string
  commit: string | null
  origin: 'webhook' | 'api' | 'interface'
  createdAt: string
  project: { id: string; name: string } | null
  eflexStatus: string | null
}

const ORIGIN: Record<CoolifyDeploymentRow['origin'], string> = { webhook: 'Webhook', api: 'API', interface: 'Interface Coolify' }

function DeploymentsTab() {
  const { data, error, loading, reload } = useLoad<{ deployments: CoolifyDeploymentRow[] }>('/deployments')
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={() => void reload()}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Actualiser
        </Button>
      </div>
      <LoadState loading={loading} error={error} onRetry={() => void reload()} />
      {data && data.deployments.length === 0 && <p className="text-sm text-muted-foreground">Aucun déploiement en file ou en cours dans Coolify.</p>}
      {data && data.deployments.length > 0 && (
        <ul className="space-y-2">
          {data.deployments.map((row) => (
            <li key={row.id} className="rounded-lg border border-border p-3 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                <Dot tone={row.status === 'failed' ? 'bad' : row.status === 'finished' ? 'ok' : 'warn'} />
                {row.application}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{fr(row.status)}</span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {dateTime(row.createdAt)} · {ORIGIN[row.origin]}
                {row.commit && ` · ${row.commit}`}
                {row.server && ` · ${row.server}`}
              </p>
              <p className="mt-1 text-xs">
                {row.project ? (
                  <a href={`/admin/projects/${row.project.id}`} className="font-medium text-primary hover:underline">
                    Projet E-FLEX : {row.project.name}
                    {row.eflexStatus && ` (${row.eflexStatus})`}
                  </a>
                ) : (
                  <span className="text-warning">Lancé hors d’E-FLEX (aucun déploiement E-FLEX correspondant)</span>
                )}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Journal de Coolify                                                  */
/* ------------------------------------------------------------------ */

interface AuditPage {
  events: Array<{
    id: number
    createdAt: string
    source: string
    action: string
    level: string
    actor: string | null
    resource: string | null
    description: string | null
  }>
  page: number
  lastPage: number
  total: number
}

const SOURCES: Array<[string, string]> = [
  ['all', 'Toutes les origines'],
  ['ui', 'Interface Coolify'],
  ['api', 'API (dont E-FLEX)'],
  ['webhook', 'Webhooks'],
  ['system', 'Système'],
  ['scheduler', 'Tâches planifiées'],
  ['mcp', 'MCP'],
]

function AuditTab() {
  const [source, setSource] = useState('ui')
  const [page, setPage] = useState(1)
  const { data, error, loading, reload } = useLoad<AuditPage>(`/audit?source=${source}&page=${page}`)
  const uid = useId()
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`${uid}-source`} className="block text-sm font-medium">
            Origine
          </label>
          <select
            id={`${uid}-source`}
            value={source}
            onChange={(event) => {
              setSource(event.target.value)
              setPage(1)
            }}
            className="mt-1 min-h-11 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {SOURCES.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-xs text-muted-foreground">
          « Interface Coolify » montre ce qui a été fait directement dans Coolify, hors E-FLEX.
        </p>
      </div>
      <LoadState loading={loading} error={error} onRetry={() => void reload()} />
      {data && data.events.length === 0 && <p className="text-sm text-muted-foreground">Aucun événement.</p>}
      {data && data.events.length > 0 && (
        <>
          <ul className="divide-y divide-border rounded-lg border border-border text-sm">
            {data.events.map((event) => (
              <li key={event.id} className="p-3">
                <p className="flex flex-wrap items-center gap-2">
                  <Dot tone={event.level === 'error' ? 'bad' : event.level === 'warning' ? 'warn' : 'muted'} />
                  <span className="font-medium">{event.action}</span>
                  {event.resource && <span className="text-muted-foreground">· {event.resource}</span>}
                </p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {dateTime(event.createdAt)} · {event.source}
                  {event.actor && ` · ${event.actor}`}
                </p>
                {event.description && <p className="mt-1 text-xs">{event.description}</p>}
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between gap-2 text-sm tabular-nums">
            <Button type="button" variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Précédent
            </Button>
            <span>
              Page {data.page} sur {data.lastPage} · {data.total} événements
            </span>
            <Button type="button" variant="outline" size="sm" disabled={page >= data.lastPage} onClick={() => setPage(page + 1)}>
              Suivant
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Supervision : outils d'exploitation                                  */
/* ------------------------------------------------------------------ */

interface OpsToolRow {
  id: 'uptime' | 'metrics' | 'logs'
  product: string
  title: string
  description: string
  url: string | null
  installed: boolean
  status: string | null
  needsAgentKey: boolean
}

type Credentials = { tool: string; url: string; user: string; password: string }

function CredentialsBox({ credentials, onClose }: { credentials: Credentials; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  return (
    <div role="status" className="space-y-2 rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm">
      <p className="font-semibold">Accès à {credentials.tool} : notez-le maintenant, il ne sera plus affiché.</p>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-xs">
        <dt className="font-sans text-muted-foreground">Adresse</dt>
        <dd className="break-all">{credentials.url}</dd>
        <dt className="font-sans text-muted-foreground">Utilisateur</dt>
        <dd>{credentials.user}</dd>
        <dt className="font-sans text-muted-foreground">Mot de passe</dt>
        <dd className="break-all">{credentials.password}</dd>
      </dl>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(credentials.password).then(() => setCopied(true))
          }}
        >
          {copied ? 'Mot de passe copié' : 'Copier le mot de passe'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          J’ai noté l’accès
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Cet accès protège l’outil avant même sa propre page de connexion. Le certificat HTTPS est émis à la première visite
        (quelques secondes).
      </p>
    </div>
  )
}

function BeszelKeyForm({ onDone }: { onDone: (feedback: Feedback) => void }) {
  const [key, setKey] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="space-y-2 border-t border-border pt-3"
      onSubmit={async (event) => {
        event.preventDefault()
        setBusy(true)
        const result = await call<{ ok: true }>('/ops-tools', {
          method: 'POST',
          body: JSON.stringify({ action: 'agent-key', tool: 'metrics', key: key.trim(), token: token.trim() }),
        })
        setBusy(false)
        if (result.ok) {
          setKey('')
          setToken('')
        }
        onDone(result.ok ? { tone: 'success', message: 'Agent relié : les mesures du serveur apparaissent dans Beszel d’ici une minute.' } : { tone: 'error', message: result.error })
      }}
    >
      <p className="text-xs text-muted-foreground">
        Dans Beszel, « Ajouter un système » (hôte : <span className="font-mono">/beszel_socket/beszel.sock</span>), puis copiez
        ici la clé publique et le jeton affichés.
      </p>
      <Input label="Clé publique (ssh-ed25519 …)" value={key} onChange={(event) => setKey(event.target.value)} className="font-mono" autoComplete="off" />
      <Input label="Jeton" value={token} onChange={(event) => setToken(event.target.value)} className="font-mono" autoComplete="off" />
      <Button type="submit" size="sm" variant="outline" loading={busy} disabled={!key.trim() || !token.trim()}>
        Relier l’agent
      </Button>
    </form>
  )
}

function OpsToolsTab() {
  const { data, error, loading, reload } = useLoad<{
    tools: OpsToolRow[]
    rootDomain: string | null
    access: { privateNetwork: 'tailscale' | null; allowedRanges: string[]; invalid: string[]; publicAccess: boolean }
  }>('/ops-tools')
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [confirmRotate, setConfirmRotate] = useState<OpsToolRow | null>(null)

  async function run(tool: OpsToolRow, action: 'install' | 'rotate') {
    setBusy(`${action}-${tool.id}`)
    setFeedback(null)
    setConfirmRotate(null)
    const result = await call<Omit<Credentials, 'tool'>>('/ops-tools', { method: 'POST', body: JSON.stringify({ action, tool: tool.id }) })
    setBusy(null)
    if (!result.ok) {
      setFeedback({ tone: 'error', message: result.error })
      return
    }
    setCredentials({ tool: tool.product, ...result.data })
    await reload()
  }

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Ce que Coolify ne fournit pas : surveillance de disponibilité, ressources des serveurs et journaux en direct. E-FLEX
        installe chaque outil sur un sous-domaine de {data?.rootDomain ?? 'la plateforme'}, protégé par un accès dédié.
      </p>
      {data && (
        <div
          role="status"
          className={cn(
            'space-y-1 rounded-lg border p-3 text-sm',
            data.access.publicAccess ? 'border-warning/30 bg-warning/10' : 'border-success/25 bg-success/10',
          )}
        >
          <p className="font-medium">
            {data.access.privateNetwork === 'tailscale'
              ? 'Accès : réseau privé Tailscale uniquement, puis mot de passe.'
              : data.access.publicAccess
                ? 'Accès : depuis Internet, protégé par mot de passe.'
                : 'Accès : adresses autorisées uniquement, puis mot de passe.'}
          </p>
          {data.access.allowedRanges.length > 0 && (
            <p className="break-words font-mono text-xs">{data.access.allowedRanges.join(', ')}</p>
          )}
          {data.access.invalid.length > 0 && (
            <p className="text-xs text-destructive">Ignoré dans OPS_ALLOWED_IPS (format invalide) : {data.access.invalid.join(', ')}</p>
          )}
          <p className="text-xs text-muted-foreground">
            Réglages : OPS_PRIVATE_NETWORK, OPS_ALLOWED_IPS, OPS_ROOT_DOMAIN, OPS_CERT_RESOLVER. Un changement s’applique à
            l’installation ou avec « Nouveau mot de passe ».
          </p>
        </div>
      )}
      {credentials && <CredentialsBox credentials={credentials} onClose={() => setCredentials(null)} />}
      <Notice feedback={feedback} />
      <LoadState loading={loading} error={error} onRetry={() => void reload()} />
      {data && (
        <div className="grid gap-4 lg:grid-cols-3">
          {data.tools.map((tool) => (
            <Card key={tool.id}>
              <CardContent className="flex h-full flex-col gap-3 p-4">
                <div>
                  <h2 className="font-semibold">{tool.title}</h2>
                  <p className="text-xs text-muted-foreground">{tool.product}</p>
                </div>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
                <p className="flex items-center gap-2 text-sm">
                  <Dot tone={tool.installed ? (tool.status?.startsWith('running') ? 'ok' : 'warn') : 'muted'} />
                  {tool.installed ? `Installé · ${fr(tool.status?.split(':')[0])}` : 'Non installé'}
                </p>
                {tool.url && (
                  <p className="break-all font-mono text-xs">
                    {tool.installed ? (
                      <a href={tool.url} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                        {tool.url}
                      </a>
                    ) : (
                      tool.url
                    )}
                  </p>
                )}
                <div className="mt-auto flex flex-wrap gap-2">
                  {tool.installed ? (
                    <Button type="button" variant="outline" size="sm" loading={busy === `rotate-${tool.id}`} onClick={() => setConfirmRotate(tool)}>
                      Nouveau mot de passe
                    </Button>
                  ) : (
                    <Button type="button" size="sm" loading={busy === `install-${tool.id}`} disabled={!data.rootDomain} onClick={() => void run(tool, 'install')}>
                      Installer
                    </Button>
                  )}
                </div>
                {tool.installed && tool.needsAgentKey && <BeszelKeyForm onDone={setFeedback} />}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={confirmRotate !== null}
        title={`Nouveau mot de passe pour ${confirmRotate?.product ?? 'l’outil'} ?`}
        description="L’ancien accès cesse de fonctionner et l’outil redémarre (quelques secondes d’indisponibilité). Ses données sont conservées."
        confirmLabel="Générer"
        onConfirm={() => (confirmRotate ? run(confirmRotate, 'rotate') : undefined)}
        onCancel={() => setConfirmRotate(null)}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Capacités                                                           */
/* ------------------------------------------------------------------ */

interface EngineCapabilityRow {
  kind: string
  label: string
  envKey: string
  provisionSupported: boolean
  lifecycleSupported: boolean
  backupSupported: boolean
  restoreSupported: boolean
  provider: string
  reason?: string
  notes: string[]
}

function CapabilitiesTab() {
  const [forceKey, setForceKey] = useState(0)
  const { data, error, loading, reload } = useLoad<{
    runtime: { version: string | null; reachable: boolean; databaseApiAvailable?: boolean | null; checkedAt: number }
    engines: EngineCapabilityRow[]
  }>(forceKey > 0 ? '/capabilities?force=1' : '/capabilities')

  const refresh = useCallback(
    async (force = false) => {
      if (force) setForceKey((value) => value + 1)
      await reload()
    },
    [reload],
  )

  useEffect(() => {
    if (forceKey > 0) void reload()
  }, [forceKey, reload])

  const dbApiTone =
    data?.runtime.databaseApiAvailable === true ? 'ok' : data?.runtime.databaseApiAvailable === false ? 'bad' : 'warn'
  const dbApiLabel =
    data?.runtime.databaseApiAvailable === true
      ? 'API bases managées : disponible'
      : data?.runtime.databaseApiAvailable === false
        ? 'API bases managées : indisponible'
        : 'API bases managées : non confirmée'

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-muted-foreground">
        Version et capacités détectées de l’instance Coolify, et support par moteur de base managée (provisionnement,
        cycle de vie, sauvegarde/restauration intégrés EFLEX). Ces informations pilotent ce qui est proposé aux projets.
      </p>
      <LoadState loading={loading} error={error} onRetry={() => void refresh(false)} />
      {data && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <h2 className="font-semibold">Instance Coolify</h2>
                <p className="mt-1 flex items-center gap-2 text-sm">
                  <Dot tone={data.runtime.reachable ? 'ok' : 'bad'} />
                  {data.runtime.reachable ? 'Joignable' : 'Injoignable'}
                  {data.runtime.version ? ` · version ${data.runtime.version}` : ' · version inconnue'}
                </p>
                <p className="mt-1 flex items-center gap-2 text-sm">
                  <Dot tone={dbApiTone} />
                  {dbApiLabel}
                </p>
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  Vérifié : {dateTime(new Date(data.runtime.checkedAt).toISOString())}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => void refresh(true)}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Re-sonder
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Moteur</th>
                  <th className="px-3 py-2 font-medium">Variable</th>
                  <th className="px-3 py-2 font-medium">Provision</th>
                  <th className="px-3 py-2 font-medium">Cycle de vie</th>
                  <th className="px-3 py-2 font-medium">Sauvegarde</th>
                  <th className="px-3 py-2 font-medium">Restauration</th>
                  <th className="px-3 py-2 font-medium">Provider</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.engines.map((engine) => (
                  <tr key={engine.kind} className="border-t border-border align-top">
                    <td className="px-3 py-2">
                      <div className="flex items-start gap-2">
                        <ServiceIcon kind={engine.kind} label={engine.label} className="h-7 w-7" />
                        <div className="min-w-0">
                          <p className="font-medium">{engine.label}</p>
                          <p className="font-mono text-xs text-muted-foreground">{engine.kind}</p>
                          {engine.reason && <p className="mt-1 text-xs text-warning">{engine.reason}</p>}
                          {engine.notes.length > 0 && (
                            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                              {engine.notes.map((note) => (
                                <li key={note}>• {note}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{engine.envKey}</td>
                    <td className="px-3 py-2">{engine.provisionSupported ? 'Oui' : 'Non'}</td>
                    <td className="px-3 py-2">{engine.lifecycleSupported ? 'Oui' : 'Non'}</td>
                    <td className="px-3 py-2">{engine.backupSupported ? 'Oui' : 'Non'}</td>
                    <td className="px-3 py-2">{engine.restoreSupported ? 'Oui' : 'Non'}</td>
                    <td className="px-3 py-2">{engine.provider === 'coolify' ? 'Coolify' : 'EFLEX'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            Les capacités « Sauvegarde/Restauration » indiquent le support intégré EFLEX. Un moteur peut être provisionnable
            sans parcours de sauvegarde/restauration géré par EFLEX.
          </p>
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Onglets                                                             */
/* ------------------------------------------------------------------ */

const TABS = [
  { id: 'servers', label: 'Serveurs', render: () => <ServersTab /> },
  { id: 'capabilities', label: 'Capacités', render: () => <CapabilitiesTab /> },
  { id: 'ops', label: 'Supervision', render: () => <OpsToolsTab /> },
  { id: 'storages', label: 'Stockages S3', render: () => <StoragesTab /> },
  { id: 'security', label: 'Sécurité des images', render: () => <SecurityTab /> },
  { id: 'deployments', label: 'Déploiements Coolify', render: () => <DeploymentsTab /> },
  { id: 'audit', label: 'Journal Coolify', render: () => <AuditTab /> },
] as const

export function CoolifyControl() {
  const [active, setActive] = useState<(typeof TABS)[number]['id']>('servers')
  const uid = useId()
  const current = TABS.find((tab) => tab.id === active) ?? TABS[0]
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Pilotage Coolify" className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${uid}-${tab.id}`}
            aria-selected={active === tab.id}
            aria-controls={`${uid}-panel`}
            onClick={() => setActive(tab.id)}
            className={cn(
              'min-h-11 shrink-0 border-b-2 px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active === tab.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-${current.id}`}>
        {current.render()}
      </div>
    </div>
  )
}
