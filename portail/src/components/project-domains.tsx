'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Globe, Loader2, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CopyButton } from '@/components/ui/copy-button'
import { Input } from '@/components/ui/input'
import { tlsHealth } from '@/lib/project-health'
import { cn } from '@/lib/utils'

interface ProjectDomain {
  id: string
  hostname: string
  appId: string | null
  verifiedAt: string | null
  tlsValid: boolean | null
  tlsExpiresAt: string | null
  tlsCheckedAt: string | null
  createdAt: string
}

type DomainApp = { id: string; name: string }

interface DomainsResponse {
  primary: string | null
  target: string | null
  max: number
  domains: ProjectDomain[]
}

type Feedback = { tone: 'success' | 'error'; message: string } | null

type DnsFailure = { message: string; values?: string[]; cname?: string | null; platformIps?: string[]; target?: string | null }

type VerifyResponse = {
  error?: string
  message?: string
  ok?: boolean
  verified?: boolean
  queued?: boolean
  dns?: { ok?: boolean; error?: string | null; cname?: string | null; ips?: string[]; platformIps?: string[]; target?: string | null }
}

const AUTO_INTERVAL_MS = 9_000
const AUTO_MAX_ATTEMPTS = 40
const AUTO_TIMEOUT_MS = 10 * 60_000

function describeDnsFailure(body: VerifyResponse): DnsFailure {
  const values = [...(body.dns?.cname ? [body.dns.cname] : []), ...(body.dns?.ips ?? [])].filter(Boolean)
  const parts = [body.error, body.dns?.error].filter((v): v is string => Boolean(v && v !== body.error))
  const platformIps = (body.dns?.platformIps ?? []).filter(Boolean)
  return {
    message: parts.length > 0 ? `${body.error ?? 'Le DNS n’est pas encore prêt.'} ${parts.join(' ')}`.trim() : (body.error ?? 'Le DNS n’est pas encore prêt.'),
    values: values.length > 0 ? values : undefined,
    cname: body.dns?.cname ?? null,
    platformIps: platformIps.length > 0 ? platformIps : undefined,
    target: body.dns?.target ?? null,
  }
}

function DnsGuide({
  hostname,
  target,
  platformIps,
  failure,
  compact = false,
}: {
  hostname: string
  target: string
  platformIps?: string[]
  failure?: DnsFailure
  compact?: boolean
}) {
  const host = hostname.trim() || 'votre-domaine.exemple.com'
  const cnameTarget = failure?.target || target
  const ips = (failure?.platformIps ?? platformIps ?? []).filter(Boolean)
  return (
    <div className={cn('space-y-3 rounded-md border border-border/70 bg-muted/20 p-3', compact ? 'text-xs' : 'text-sm')}>
      <div>
        <p className="font-medium text-foreground">Assistant DNS</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Ajoutez l’enregistrement chez votre fournisseur DNS. La propagation peut prendre quelques minutes (parfois jusqu’à 1 h selon le TTL).
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-medium text-foreground">Option recommandée · Sous-domaine (ex. <code className="font-mono">app.exemple.com</code>)</p>
        <dl className="space-y-1.5 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-foreground">Type</dt>
            <dd className="rounded-md bg-background px-1.5 py-0.5 font-mono text-foreground">CNAME</dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-foreground">Nom / hôte</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code className="break-all font-mono text-foreground">{host}</code>
              {hostname.trim() && <CopyButton value={hostname.trim()} label="Copier le nom" copiedLabel="Nom copié" size="sm" />}
            </dd>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <dt className="text-muted-foreground">Valeur / cible</dt>
            <dd className="flex flex-wrap items-center gap-2">
              <code className="break-all font-mono text-foreground">{cnameTarget}</code>
              <CopyButton value={cnameTarget} label="Copier la cible" copiedLabel="Cible copiée" size="sm" />
            </dd>
          </div>
        </dl>
      </div>

      <div className="space-y-2 border-t border-border/70 pt-3">
        <p className="text-xs font-medium text-foreground">Domaine racine / apex (ex. <code className="font-mono">exemple.com</code>)</p>
        <p className="text-xs text-muted-foreground">
          Un CNAME n’est pas autorisé à la racine chez la plupart des fournisseurs : créez un enregistrement <strong className="font-medium text-foreground">A</strong> (IPv4) et/ou <strong className="font-medium text-foreground">AAAA</strong> (IPv6) pointant vers la plateforme.
        </p>
        {ips.length > 0 ? (
          <div className="space-y-1.5 text-xs">
            <p className="text-muted-foreground">Adresses de la plateforme (détectées) :</p>
            <ul className="space-y-1">
              {ips.map((ip) => (
                <li key={ip} className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-muted-foreground">A/AAAA</span>
                  <span className="flex items-center gap-2">
                    <code className="break-all font-mono text-foreground">{ip}</code>
                    <CopyButton value={ip} label="Copier l’adresse" copiedLabel="Adresse copiée" size="sm" />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Les adresses IP de la plateforme seront indiquées ici après une tentative de vérification si nécessaire. Si votre fournisseur le permet, un enregistrement <span className="font-mono">ALIAS</span>/<span className="font-mono">ANAME</span> vers <code className="break-all font-mono text-foreground">{cnameTarget}</code> peut aussi convenir.
          </p>
        )}
      </div>

      <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
        <li>Les sous-domaines (ex. <code className="font-mono">app.exemple.com</code>) et domaines racine sont pris en charge, dans la limite de votre abonnement.</li>
        <li>Si vous ajoutez à la fois le domaine racine (<code className="font-mono">exemple.com</code>) et sa variante <code className="font-mono">www</code>, EFLEX redirige automatiquement <code className="font-mono">www</code> vers le domaine racine pour les applications gérées par la plateforme.</li>
        <li>Désactivez le proxy/CDN (ex. « nuage orange » Cloudflare) sur l’enregistrement pendant la vérification si elle échoue.</li>
        <li>Vérifiez qu’il n’existe pas d’enregistrement contradictoire (ancien A/CNAME) pour le même hôte.</li>
        <li>La propagation DNS et l’émission du certificat peuvent prendre un peu de temps après validation (selon le TTL).</li>
      </ul>

      <details className="rounded-md border border-border/70 bg-background/60 p-2">
        <summary className="cursor-pointer list-none text-xs font-medium text-foreground [&::-webkit-details-marker]:hidden">
          Aide selon l’hébergeur DNS (indications générales)
        </summary>
        <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
          <li><span className="font-medium text-foreground">Cloudflare</span> : DNS → Ajouter un enregistrement. Choisissez CNAME (ou A/AAAA à l’apex). Mettez le statut proxy sur « DNS uniquement » (gris) pendant la vérification.</li>
          <li><span className="font-medium text-foreground">OVHcloud</span> : Zone DNS → Ajouter une entrée. Type CNAME pour un sous-domaine, ou A/AAAA pour le domaine racine. Laissez le champ « Sous-domaine » cohérent avec l’hôte (ex. <code className="font-mono">app</code>).</li>
          <li><span className="font-medium text-foreground">Gandi / IONOS / Namecheap / autre</span> : Gestion DNS/Zone DNS → Ajouter un enregistrement. Renseignez type, nom/hôte et valeur/cible comme indiqué ci-dessus. Les libellés varient selon l’interface.</li>
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">En cas de doute, consultez la documentation de votre fournisseur DNS : les champs « Nom/Hôte » et « Cible/Valeur » peuvent avoir des noms différents.</p>
      </details>

      {failure && (
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-2 text-xs text-destructive" role="alert">
          <p className="font-medium text-foreground">Diagnostic de la dernière vérification</p>
          <p className="mt-1">{failure.message}</p>
          {failure.values && failure.values.length > 0 && (
            <p className="mt-1">Valeurs détectées : <code className="break-all font-mono">{failure.values.join(', ')}</code></p>
          )}
          {ips.length > 0 && (
            <p className="mt-1">Adresses attendues (plateforme) : <code className="break-all font-mono">{ips.join(', ')}</code></p>
          )}
        </div>
      )}
    </div>
  )
}

/** Assistant de configuration des domaines : enregistrement DNS, copie, vérification et auto-vérification. */
export function ProjectDomains({
  projectId,
  apps = [],
}: {
  projectId: string
  /** Applications du projet (multi-app) ; vide ou 1 élément = pas de sélecteur. */
  apps?: readonly DomainApp[]
}) {
  const [selectedAppId, setSelectedAppId] = useState<string>(apps[0]?.id ?? '')
  const [data, setData] = useState<DomainsResponse | null>(null)
  const [hostname, setHostname] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [dnsFailures, setDnsFailures] = useState<Record<string, DnsFailure>>({})
  const [autoActive, setAutoActive] = useState(false)
  const [autoStopReason, setAutoStopReason] = useState<'timeout' | 'limit' | null>(null)
  const [isVisible, setIsVisible] = useState(true)

  const dataRef = useRef<DomainsResponse | null>(null)
  const inFlightRef = useRef(false)
  const attemptsRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    const sync = () => setIsVisible(document.visibilityState === 'visible')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const load = useCallback(async () => {
    try {
      const query = apps.length > 1 && selectedAppId ? `?appId=${encodeURIComponent(selectedAppId)}` : ''
      const response = await fetch(`/api/projects/${projectId}/domains${query}`, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: (body as { error?: string }).error ?? 'Domaines indisponibles.' })
        return null
      }
      const next = body as DomainsResponse
      setData(next)
      dataRef.current = next
      setDnsFailures((current) => {
        let changed = false
        const copy = { ...current }
        for (const domain of next.domains) {
          if (domain.verifiedAt && copy[domain.id]) {
            delete copy[domain.id]
            changed = true
          }
        }
        return changed ? copy : current
      })
      return next
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
      return null
    } finally {
      setLoading(false)
    }
  }, [projectId, apps.length, selectedAppId])

  useEffect(() => {
    setLoading(true)
    setDnsFailures({})
    setAutoActive(false)
    setAutoStopReason(null)
    attemptsRef.current = 0
    startedAtRef.current = null
    void load()
  }, [load])

  const target = data?.target ?? 'eflex.app'
  const pendingDomains = useMemo(() => (data?.domains ?? []).filter((d) => !d.verifiedAt), [data])

  useEffect(() => {
    if (pendingDomains.length === 0) {
      setAutoActive(false)
      setAutoStopReason(null)
      attemptsRef.current = 0
      startedAtRef.current = null
    } else if (!startedAtRef.current && !autoStopReason) {
      startedAtRef.current = Date.now()
      setAutoActive(true)
    }
  }, [pendingDomains.length, autoStopReason])

  const verifyDomain = useCallback(
    async (domainId: string, mode: 'manual' | 'auto') => {
      setWorking(domainId)
      if (mode === 'manual') setFeedback(null)
      try {
        const response = await fetch(`/api/projects/${projectId}/domains/${domainId}/verify`, { method: 'POST' })
        const body = (await response.json().catch(() => ({}))) as VerifyResponse
        if (!response.ok) {
          const failure = describeDnsFailure(body)
          setDnsFailures((current) => ({ ...current, [domainId]: failure }))
          if (mode === 'manual') setFeedback({ tone: 'error', message: failure.message })
          return { verified: false }
        }
        // Conserver les infos DNS utiles (ex. IPs plateforme) pour guider un futur recontrôle.
        if (body.dns) {
          const info = describeDnsFailure(body)
          setDnsFailures((current) => ({ ...current, [domainId]: info }))
        } else {
          setDnsFailures((current) => {
            if (!current[domainId]) return current
            const copy = { ...current }
            delete copy[domainId]
            return copy
          })
        }
        if (mode === 'manual') {
          setFeedback({ tone: 'success', message: body.message ?? 'DNS vérifié. Le domaine sera actif après le déploiement.' })
        }
        await load()
        return { verified: true }
      } catch {
        const message = 'Impossible de contacter le serveur.'
        if (mode === 'manual') setFeedback({ tone: 'error', message })
        setDnsFailures((current) => ({ ...current, [domainId]: { message } }))
        return { verified: false }
      } finally {
        setWorking(null)
      }
    },
    [projectId, load],
  )

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (pendingDomains.length === 0 || autoStopReason) return

    const tick = async () => {
      if (document.visibilityState !== 'visible') return
      if (inFlightRef.current) return
      const currentData = dataRef.current
      const pending = (currentData?.domains ?? []).filter((d) => !d.verifiedAt)
      if (pending.length === 0) {
        setAutoActive(false)
        return
      }
      if (startedAtRef.current && Date.now() - startedAtRef.current > AUTO_TIMEOUT_MS) {
        setAutoStopReason('timeout')
        setAutoActive(false)
        return
      }
      if (attemptsRef.current >= AUTO_MAX_ATTEMPTS) {
        setAutoStopReason('limit')
        setAutoActive(false)
        return
      }

      inFlightRef.current = true
      try {
        for (const domain of pending) {
          if (document.visibilityState !== 'visible') break
          const latest = dataRef.current?.domains.find((d) => d.id === domain.id)
          if (!latest || latest.verifiedAt) continue
          if (attemptsRef.current >= AUTO_MAX_ATTEMPTS) {
            setAutoStopReason('limit')
            setAutoActive(false)
            break
          }
          if (startedAtRef.current && Date.now() - startedAtRef.current > AUTO_TIMEOUT_MS) {
            setAutoStopReason('timeout')
            setAutoActive(false)
            break
          }
          attemptsRef.current += 1
          const result = await verifyDomain(domain.id, 'auto')
          if (result.verified) break
        }
      } finally {
        inFlightRef.current = false
      }
    }

    timerRef.current = setInterval(() => {
      void tick()
    }, AUTO_INTERVAL_MS)

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [pendingDomains.length, autoStopReason, verifyDomain])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostname,
          ...(apps.length > 1 && selectedAppId ? { appId: selectedAppId } : {}),
        }),
      })
      const body = (await response.json().catch(() => ({}))) as { error?: string; instructions?: string }
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Domaine refusé.' })
        return
      }
      setHostname('')
      setAutoStopReason(null)
      attemptsRef.current = 0
      startedAtRef.current = Date.now()
      setAutoActive(true)
      setFeedback({ tone: 'success', message: body.instructions ?? 'Domaine ajouté. Configurez le DNS puis vérifiez.' })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setAdding(false)
    }
  }

  async function remove(domain: ProjectDomain) {
    setWorking(domain.id)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/domains/${domain.id}`, { method: 'DELETE' })
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: string }
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Retrait impossible.' })
        return
      }
      setDnsFailures((current) => {
        if (!current[domain.id]) return current
        const copy = { ...current }
        delete copy[domain.id]
        return copy
      })
      setFeedback({ tone: 'success', message: body.message ?? 'Domaine retiré.' })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setWorking(null)
    }
  }

  const autoStatusLabel = (() => {
    if (pendingDomains.length === 0) return null
    if (autoStopReason === 'timeout') return 'Vérification automatique arrêtée (délai dépassé). Utilisez « Vérifier maintenant ».'
    if (autoStopReason === 'limit') return 'Vérification automatique arrêtée (nombre maximal de tentatives atteint). Utilisez « Vérifier maintenant ».'
    if (!isVisible) return 'Vérification automatique en pause (onglet non visible).'
    if (autoActive) return 'Vérification automatique en cours toutes les 9 secondes.'
    return null
  })()

  return (
    <div className="space-y-4">
      {apps.length > 1 && (
        <label className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm [@media(pointer:coarse)]:min-h-11">
          <span className="text-muted-foreground">Application</span>
          <select
            value={selectedAppId}
            onChange={(e) => setSelectedAppId(e.target.value)}
            className="min-h-7 bg-transparent text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {apps.map((app) => (
              <option key={app.id} value={app.id}>
                {app.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {feedback && (
        <p
          role={feedback.tone === 'error' ? 'alert' : 'status'}
          className={
            feedback.tone === 'error'
              ? 'rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive'
              : 'rounded-lg border border-success/20 bg-success/10 p-3 text-sm text-foreground'
          }
        >
          {feedback.message}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement des domaines…</p>
      ) : (
        <>
          <div className="rounded-lg border border-border p-3">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Globe className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              Domaine EFLEX (principal)
            </p>
            {data?.primary ? (
              <a
                href={`https://${data.primary}`}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 font-mono text-sm text-primary hover:underline"
              >
                {data.primary}
              </a>
            ) : (
              <p className="mt-1 text-sm text-muted-foreground">Attribué au premier déploiement.</p>
            )}
          </div>

          <form onSubmit={add} className="space-y-3 rounded-lg border border-border p-3">
            <Input
              id="custom-domain"
              label="Domaine personnalisé"
              placeholder="app.mon-entreprise.com"
              autoComplete="off"
              spellCheck={false}
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              hint="Après l’ajout, créez l’enregistrement DNS indiqué ci-dessous. La propagation peut prendre quelques minutes."
              required
            />
            <DnsGuide hostname={hostname} target={target} />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={adding} disabled={(data?.domains.length ?? 0) >= (data?.max ?? 5)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter le domaine
              </Button>
              <span className="text-xs text-muted-foreground">
                {(data?.domains.length ?? 0)} / {data?.max ?? 5} domaines personnalisés utilisés (selon votre abonnement)
              </span>
            </div>
          </form>

          {autoStatusLabel && (
            <p
              role="status"
              aria-live="polite"
              className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground"
            >
              {autoActive && isVisible && !autoStopReason ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
              {autoStatusLabel}
            </p>
          )}

          {data && data.domains.length > 0 && (
            <ul className="space-y-3">
              {data.domains.map((domain) => {
                const certificate = tlsHealth(
                  domain.tlsValid,
                  domain.tlsExpiresAt ? new Date(domain.tlsExpiresAt) : null,
                  domain.tlsCheckedAt ? new Date(domain.tlsCheckedAt) : null,
                )
                const verified = Boolean(domain.verifiedAt)
                const dnsFailure = dnsFailures[domain.id]
                const certReady = verified && domain.tlsValid === true
                const certInProgress = verified && domain.tlsValid !== true
                return (
                  <li key={domain.id} className="rounded-lg border border-border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1 space-y-3">
                        <div>
                          <p className="truncate font-mono text-sm font-medium">{domain.hostname}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                            {verified ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 font-medium text-success">
                                <Check className="h-3.5 w-3.5" aria-hidden="true" /> Domaine actif · DNS vérifié
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-medium text-warning">
                                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> DNS en attente
                              </span>
                            )}
                            {certReady && (
                              <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium', certificate.tone === 'success' ? 'border-success/30 bg-success/10 text-success' : certificate.tone === 'danger' ? 'border-destructive/30 bg-destructive/10 text-destructive' : 'border-warning/30 bg-warning/10 text-warning')}>
                                <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                Certificat prêt · {certificate.label}
                              </span>
                            )}
                            {certInProgress && (
                              <span className="inline-flex items-center gap-1 rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 font-medium text-warning">
                                <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
                                Certificat en préparation
                              </span>
                            )}
                          </div>
                        </div>

                        {!verified ? (
                          <DnsGuide
                            hostname={domain.hostname}
                            target={target}
                            platformIps={dnsFailure?.platformIps}
                            failure={dnsFailure}
                            compact
                          />
                        ) : null}

                        {verified && (
                          <div className="space-y-2 rounded-md border border-border/70 bg-muted/20 p-3">
                            <p className="text-sm font-medium text-foreground">Certificat TLS</p>
                            <dl className="grid gap-1.5 text-xs sm:grid-cols-2">
                              <div>
                                <dt className="text-muted-foreground">État</dt>
                                <dd className={cn('font-medium', certificate.tone === 'success' ? 'text-success' : certificate.tone === 'danger' ? 'text-destructive' : certificate.tone === 'warning' ? 'text-warning' : 'text-foreground')}>
                                  {certificate.label}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Résultat du dernier contrôle</dt>
                                <dd className="text-foreground">
                                  {domain.tlsValid === true ? 'Valide' : domain.tlsValid === false ? 'Invalide / échec' : 'Non vérifié'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Expiration</dt>
                                <dd className="text-foreground tabular-nums">
                                  {domain.tlsExpiresAt ? new Date(domain.tlsExpiresAt).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : 'Non disponible'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Dernier contrôle</dt>
                                <dd className="text-foreground tabular-nums">
                                  {domain.tlsCheckedAt ? new Date(domain.tlsCheckedAt).toLocaleString('fr-FR') : 'Aucun contrôle enregistré'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Émetteur</dt>
                                <dd className="text-muted-foreground">Non disponible (source non collectée)</dd>
                              </div>
                              <div>
                                <dt className="text-muted-foreground">Date d’émission</dt>
                                <dd className="text-muted-foreground">Non disponible (source non collectée)</dd>
                              </div>
                            </dl>
                            {certificate.detail && <p className="text-xs text-muted-foreground">{certificate.detail}</p>}
                            {(certificate.tone === 'danger' || certificate.tone === 'warning' || domain.tlsValid === false || certInProgress) && (
                              <p className={cn('text-xs', certificate.tone === 'danger' || domain.tlsValid === false ? 'text-destructive' : 'text-warning')}>
                                {domain.tlsValid === false
                                  ? 'Le certificat n’est pas valide. Revérifiez le DNS, puis relancez un déploiement si nécessaire (onglet Déploiements).'
                                  : certInProgress
                                    ? 'Certificat en cours de préparation : la validation se fait après déploiement. Vous pouvez suivre l’état dans l’onglet Déploiements.'
                                    : certificate.tone === 'danger'
                                      ? 'Certificat expiré ou invalide : relancez une vérification et un déploiement pour renouveler/valider le certificat.'
                                      : 'Expiration proche : surveillez le renouvellement et relancez un déploiement en cas de besoin.'}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant={verified ? 'ghost' : 'outline'}
                          size="sm"
                          loading={working === domain.id}
                          onClick={() => void verifyDomain(domain.id, 'manual')}
                          aria-label={`${verified ? 'Revérifier' : 'Vérifier maintenant'} le domaine ${domain.hostname}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          {verified ? 'Revérifier' : 'Vérifier maintenant'}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          loading={working === domain.id}
                          onClick={() => void remove(domain)}
                          aria-label={`Retirer le domaine ${domain.hostname}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          Retirer
                        </Button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <p className="text-xs text-muted-foreground">
            La vérification DNS programme un déploiement qui applique le domaine et prépare le certificat SSL.
            Suivez-le dans{' '}
            <Link href={`/dashboard/projects/${projectId}?tab=deployments`} className="font-medium text-primary hover:underline">
              l’onglet Déploiements
            </Link>
            .
          </p>
        </>
      )}
    </div>
  )
}
