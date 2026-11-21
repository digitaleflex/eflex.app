'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, EyeOff, Globe, HardDrive, KeyRound, Plus, RefreshCw, Save, Settings2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

type EnvKey = { key: string; isBuildTime: boolean; isPreview: boolean }
type DomainTarget = { uuid: string; name: string; fqdn: string | null; domains: string[]; kind: 'application' | 'database' | 'service' }
type VolumeView = { name: string | null; mountPath: string | null; hostPath: string | null; source: string }
type Capabilities = {
  envRead: boolean
  envWrite: boolean | null
  domainsRead: boolean
  domainsWrite: boolean | null
  volumesRead: boolean
}
type ServiceConfig = {
  id: string
  name: string
  status: string | null
  type: string | null
  description: string | null
  envKeys: EnvKey[]
  domainTargets: DomainTarget[]
  volumes: VolumeView[]
  capabilities: Capabilities
  notes: string[]
}

type Feedback = { tone: 'success' | 'error'; message: string } | null

const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]{0,127}$/

function domainsToInput(domains: string[]): string {
  return domains
    .map((d) => d.replace(/^https?:\/\//i, '').replace(/\/$/, ''))
    .join('\n')
}

export function ActiveServiceManager({
  projectId,
  serviceId,
  serviceLabel,
  canManage,
  onChanged,
}: {
  projectId: string
  serviceId: string
  serviceLabel: string
  canManage: boolean
  onChanged?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [config, setConfig] = useState<ServiceConfig | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [envDrafts, setEnvDrafts] = useState<Record<string, string>>({})
  const [newEnvRows, setNewEnvRows] = useState<Array<{ key: string; value: string }>>([])
  const [reveal, setReveal] = useState<Record<string, boolean>>({})
  const [savingEnvs, setSavingEnvs] = useState(false)
  const [envFeedback, setEnvFeedback] = useState<Feedback>(null)

  const [domainDrafts, setDomainDrafts] = useState<Record<string, string>>({})
  const [savingDomain, setSavingDomain] = useState<string | null>(null)
  const [domainFeedback, setDomainFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/coolify-services/${serviceId}`, { cache: 'no-store' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(body.error ?? 'Impossible de charger la configuration du service.')
        return
      }
      const service = (body as { service?: ServiceConfig }).service ?? null
      setConfig(service)
      if (service) {
        setDomainDrafts((prev) => {
          const next = { ...prev }
          for (const t of service.domainTargets) {
            if (next[t.uuid] === undefined) next[t.uuid] = domainsToInput(t.domains)
          }
          return next
        })
      }
    } catch {
      setError('Impossible de contacter le serveur.')
    } finally {
      setLoading(false)
    }
  }, [projectId, serviceId])

  useEffect(() => {
    if (open) void load()
  }, [open, load])

  const envKeys = useMemo(() => config?.envKeys ?? [], [config])

  const pendingEnvCount = useMemo(() => {
    let n = 0
    for (const k of envKeys) if ((envDrafts[k.key] ?? '').length > 0) n++
    for (const r of newEnvRows) if (r.key.trim() && r.value.length > 0) n++
    return n
  }, [envDrafts, newEnvRows, envKeys])

  async function saveEnvs() {
    setEnvFeedback(null)
    const variables: Array<{ key: string; value: string }> = []
    for (const k of envKeys) {
      const value = envDrafts[k.key]
      if (value && value.length > 0) variables.push({ key: k.key, value })
    }
    for (const r of newEnvRows) {
      const key = r.key.trim()
      if (!key && !r.value) continue
      if (!ENV_NAME_RE.test(key)) {
        setEnvFeedback({ tone: 'error', message: `Nom de variable invalide : « ${key || '(vide)'} ».` })
        return
      }
      if (r.value.length === 0) {
        setEnvFeedback({ tone: 'error', message: `Saisissez une valeur pour « ${key} ».` })
        return
      }
      variables.push({ key, value: r.value })
    }
    if (variables.length === 0) {
      setEnvFeedback({ tone: 'error', message: 'Aucune valeur à enregistrer. Saisissez une nouvelle valeur pour au moins une variable.' })
      return
    }

    setSavingEnvs(true)
    try {
      const res = await fetch(`/api/projects/${projectId}/coolify-services/${serviceId}/envs`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setEnvFeedback({ tone: 'error', message: body.error ?? 'Enregistrement impossible.' })
        return
      }
      setEnvFeedback({ tone: 'success', message: body.message ?? 'Variables enregistrées.' })
      setEnvDrafts({})
      setNewEnvRows([])
      setReveal({})
      await load()
      onChanged?.()
    } catch {
      setEnvFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setSavingEnvs(false)
    }
  }

  async function saveDomains(targetUuid: string) {
    setDomainFeedback(null)
    setSavingDomain(targetUuid)
    try {
      const res = await fetch(`/api/projects/${projectId}/coolify-services/${serviceId}/domains`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUuid, domains: domainDrafts[targetUuid] ?? '' }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        setDomainFeedback({ tone: 'error', message: body.error ?? 'Mise à jour des domaines impossible.' })
        return
      }
      setDomainFeedback({ tone: 'success', message: body.message ?? 'Domaines mis à jour.' })
      await load()
      onChanged?.()
    } catch {
      setDomainFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setSavingDomain(null)
    }
  }

  if (!open) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
        Configurer
      </Button>
    )
  }

  return (
    <div className="mt-3 space-y-4 rounded-lg border border-border bg-muted/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">Configuration du service</h4>
          <p className="text-xs text-muted-foreground">{serviceLabel} · <span className="font-mono">{serviceId.slice(0, 8)}…</span></p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} aria-hidden="true" />
            Actualiser
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Fermer</Button>
        </div>
      </div>

      {loading && !config && <p className="text-sm text-muted-foreground">Chargement de la configuration…</p>}
      {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}

      {config && (
        <>
          {config.notes.length > 0 && (
            <ul className="space-y-1 rounded-md border border-border bg-background p-3 text-xs text-muted-foreground">
              {config.notes.map((note) => (
                <li key={note}>• {note}</li>
              ))}
            </ul>
          )}

          {/* Variables d’environnement */}
          <section aria-labelledby={`svc-env-${serviceId}`} className="space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h5 id={`svc-env-${serviceId}`} className="text-sm font-medium">Variables d’environnement</h5>
            </div>
            <p className="text-xs text-muted-foreground">
              Les valeurs existantes ne sont jamais affichées. Saisissez une nouvelle valeur pour définir ou remplacer une variable ; le service sera redémarré pour appliquer les changements.
              Pour connecter ce service à votre application, ajoutez les variables nécessaires dans les paramètres du projet, puis redéployez.
            </p>

            {envFeedback && (
              <p role={envFeedback.tone === 'error' ? 'alert' : 'status'} className={envFeedback.tone === 'error' ? 'rounded-md border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive' : 'rounded-md border border-success/20 bg-success/10 p-2 text-sm text-foreground'}>
                {envFeedback.message}
              </p>
            )}

            {!config.capabilities.envRead && (
              <p className="rounded-md border border-warning/30 bg-warning/10 p-2 text-xs">La lecture des variables n’est pas disponible sur cette instance.</p>
            )}

            {envKeys.length === 0 && config.capabilities.envRead && (
              <p className="text-xs text-muted-foreground">Aucune variable déclarée pour ce service.</p>
            )}

            {envKeys.length > 0 && (
              <ul className="space-y-2">
                {envKeys.map((k) => {
                  const shown = reveal[k.key] === true
                  return (
                    <li key={k.key} className="grid gap-2 rounded-md border border-border p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-xs text-foreground">{k.key}</p>
                        <p className="text-xs text-muted-foreground">
                          {k.isBuildTime ? 'build' : 'runtime'}{k.isPreview ? ' · preview' : ''}
                        </p>
                      </div>
                      <div className="relative">
                        <Input
                          aria-label={`Nouvelle valeur pour ${k.key}`}
                          type={shown ? 'text' : 'password'}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder="Nouvelle valeur (laisser vide pour ne pas modifier)"
                          value={envDrafts[k.key] ?? ''}
                          disabled={!canManage}
                          onChange={(e) => setEnvDrafts((d) => ({ ...d, [k.key]: e.target.value }))}
                          className="pr-10 font-mono text-xs"
                        />
                      </div>
                      <Button type="button" variant="ghost" size="sm" aria-pressed={shown} aria-label={shown ? `Masquer ${k.key}` : `Afficher ${k.key}`} onClick={() => setReveal((r) => ({ ...r, [k.key]: !r[k.key] }))}>
                        {shown ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            )}

            {canManage && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Ajouter une variable</p>
                {newEnvRows.map((row, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-center">
                    <Input aria-label={`Nom de la nouvelle variable ${i + 1}`} placeholder="NOM_DE_LA_VARIABLE" autoComplete="off" spellCheck={false} value={row.key} onChange={(e) => setNewEnvRows((rows) => rows.map((r, idx) => idx === i ? { ...r, key: e.target.value } : r))} className="font-mono text-xs" />
                    <Input aria-label={`Valeur de la nouvelle variable ${i + 1}`} type="password" autoComplete="off" spellCheck={false} placeholder="Valeur" value={row.value} onChange={(e) => setNewEnvRows((rows) => rows.map((r, idx) => idx === i ? { ...r, value: e.target.value } : r))} className="font-mono text-xs" />
                    <Button type="button" variant="ghost" size="sm" aria-label="Retirer cette ligne" onClick={() => setNewEnvRows((rows) => rows.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" aria-hidden="true" /></Button>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setNewEnvRows((rows) => [...rows, { key: '', value: '' }])}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />Ajouter une variable
                  </Button>
                  <Button type="button" size="sm" onClick={() => void saveEnvs()} loading={savingEnvs} disabled={pendingEnvCount === 0}>
                    <Save className="h-3.5 w-3.5" aria-hidden="true" />Enregistrer les variables ({pendingEnvCount})
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Domaines / FQDN */}
          <section aria-labelledby={`svc-domains-${serviceId}`} className="space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h5 id={`svc-domains-${serviceId}`} className="text-sm font-medium">Domaines / FQDN</h5>
            </div>

            {domainFeedback && (
              <p role={domainFeedback.tone === 'error' ? 'alert' : 'status'} className={domainFeedback.tone === 'error' ? 'rounded-md border border-destructive/20 bg-destructive/10 p-2 text-sm text-destructive' : 'rounded-md border border-success/20 bg-success/10 p-2 text-sm text-foreground'}>
                {domainFeedback.message}
              </p>
            )}

            {!config.capabilities.domainsRead && (
              <p className="rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">Aucun composant configurable en domaine n’est exposé par l’API pour ce service.</p>
            )}

            {config.domainTargets.length > 0 && (
              <ul className="space-y-3">
                {config.domainTargets.map((target) => (
                  <li key={target.uuid} className="space-y-2 rounded-md border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{target.name}</p>
                        <p className="text-xs text-muted-foreground">Composant {target.kind === 'application' ? 'applicatif' : target.kind === 'database' ? 'base de données' : 'service'} · <span className="font-mono">{target.uuid.slice(0, 8)}…</span></p>
                      </div>
                      {target.domains.length > 0 ? (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">{target.domains.length} domaine(s)</span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">Aucun domaine</span>
                      )}
                    </div>
                    <label className="block space-y-1">
                      <span className="text-xs text-muted-foreground">Domaines (un par ligne, sans http). Laisser vide pour retirer.</span>
                      <textarea
                        className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 font-mono text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={domainDrafts[target.uuid] ?? ''}
                        onChange={(e) => setDomainDrafts((d) => ({ ...d, [target.uuid]: e.target.value }))}
                        disabled={!canManage}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="exemple.domaine.com"
                      />
                    </label>
                    {canManage && (
                      <div className="flex justify-end">
                        <Button type="button" size="sm" variant="outline" loading={savingDomain === target.uuid} onClick={() => void saveDomains(target.uuid)}>
                          <Save className="h-3.5 w-3.5" aria-hidden="true" />Enregistrer les domaines
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {config.capabilities.domainsWrite === false && (
              <p className="text-xs text-muted-foreground">La modification des domaines n’est pas disponible pour ce service sur cette instance.</p>
            )}
          </section>

          {/* Configuration / volumes */}
          <section aria-labelledby={`svc-vol-${serviceId}`} className="space-y-3">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <h5 id={`svc-vol-${serviceId}`} className="text-sm font-medium">Configuration et volumes</h5>
            </div>

            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div><dt className="text-muted-foreground">Type</dt><dd className="font-mono text-foreground">{config.type ?? '—'}</dd></div>
              <div><dt className="text-muted-foreground">Statut</dt><dd className="text-foreground">{config.status ?? '—'}</dd></div>
            </dl>

            {config.volumes.length > 0 ? (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nom</th>
                      <th className="px-3 py-2 font-medium">Montage (conteneur)</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium">Composant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.volumes.map((v, i) => (
                      <tr key={`${v.source}-${v.name ?? i}-${v.mountPath ?? i}`} className="border-t border-border">
                        <td className="px-3 py-2 font-mono">{v.name ?? '—'}</td>
                        <td className="px-3 py-2 font-mono">{v.mountPath ?? '—'}</td>
                        <td className="px-3 py-2 font-mono">{v.hostPath ?? '—'}</td>
                        <td className="px-3 py-2">{v.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-md border border-border bg-background p-2 text-xs text-muted-foreground">
                Aucune information de volume exposée par l’API pour ce service. Selon le service, les volumes peuvent être gérés dans la configuration interne du service.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Vue en lecture seule : les informations de configuration/volumes affichées sont celles exposées par l’API, sans secrets.</p>
          </section>
        </>
      )}
    </div>
  )
}