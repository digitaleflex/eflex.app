'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, Globe, Plus, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { tlsHealth } from '@/lib/project-health'
import { cn } from '@/lib/utils'

interface ProjectDomain {
  id: string
  hostname: string
  verifiedAt: string | null
  tlsValid: boolean | null
  tlsExpiresAt: string | null
  tlsCheckedAt: string | null
  createdAt: string
}

interface DomainsResponse {
  primary: string | null
  target: string | null
  max: number
  domains: ProjectDomain[]
}

type Feedback = { tone: 'success' | 'error'; message: string } | null

/** Gestion des domaines personnalisés : ajout, vérification DNS, état SSL, retrait. */
export function ProjectDomains({ projectId }: { projectId: string }) {
  const [data, setData] = useState<DomainsResponse | null>(null)
  const [hostname, setHostname] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [working, setWorking] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/domains`, { cache: 'no-store' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Domaines indisponibles.' })
        return
      }
      setData(body as DomainsResponse)
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  async function add(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hostname }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Domaine refusé.' })
        return
      }
      setHostname('')
      setFeedback({ tone: 'success', message: body.instructions ?? 'Domaine ajouté. Configurez le DNS puis vérifiez.' })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setAdding(false)
    }
  }

  async function verify(domain: ProjectDomain) {
    setWorking(domain.id)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/domains/${domain.id}/verify`, { method: 'POST' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Le DNS n’est pas encore prêt.' })
        return
      }
      setFeedback({ tone: 'success', message: body.message ?? 'DNS vérifié.' })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setWorking(null)
    }
  }

  async function remove(domain: ProjectDomain) {
    setWorking(domain.id)
    setFeedback(null)
    try {
      const response = await fetch(`/api/projects/${projectId}/domains/${domain.id}`, { method: 'DELETE' })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: body.error ?? 'Retrait impossible.' })
        return
      }
      setFeedback({ tone: 'success', message: body.message ?? 'Domaine retiré.' })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setWorking(null)
    }
  }

  const target = data?.target ?? 'eflex.app'

  return (
    <div className="space-y-4">
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
              Domaine Eflex (principal)
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

          <form onSubmit={add} className="space-y-3">
            <Input
              id="custom-domain"
              label="Domaine personnalisé"
              placeholder="app.mon-entreprise.com"
              autoComplete="off"
              spellCheck={false}
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              hint={`Créez ensuite un CNAME vers « ${target} ».`}
              required
            />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" loading={adding} disabled={(data?.domains.length ?? 0) >= (data?.max ?? 5)}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Ajouter le domaine
              </Button>
              <span className="text-xs text-muted-foreground">
                {(data?.domains.length ?? 0)} / {data?.max ?? 5} domaines personnalisés
              </span>
            </div>
          </form>

          {data && data.domains.length > 0 && (
            <ul className="space-y-2">
              {data.domains.map((domain) => {
                const certificate = tlsHealth(
                  domain.tlsValid,
                  domain.tlsExpiresAt ? new Date(domain.tlsExpiresAt) : null,
                  domain.tlsCheckedAt ? new Date(domain.tlsCheckedAt) : null,
                )
                const verified = Boolean(domain.verifiedAt)
                return (
                  <li key={domain.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono text-sm font-medium">{domain.hostname}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {verified ? (
                            <span className="inline-flex items-center gap-1 font-medium text-success">
                              <Check className="h-3.5 w-3.5" aria-hidden="true" /> DNS vérifié
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-medium text-warning">
                              <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" /> DNS en attente
                            </span>
                          )}
                          {verified && (
                            <span className={cn('inline-flex items-center gap-1', certificate.tone === 'success' ? 'text-success' : certificate.tone === 'danger' ? 'text-destructive' : 'text-warning')}>
                              {certificate.tone === 'success' ? <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> : <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                              {certificate.label}
                            </span>
                          )}
                        </p>
                        {!verified && (
                          <p className="mt-2 text-xs text-muted-foreground">
                            Créez un CNAME <code className="font-mono">{domain.hostname}</code> →{' '}
                            <code className="font-mono">{target}</code>, puis cliquez sur « Vérifier ».
                          </p>
                        )}
                        {verified && certificate.detail && <p className="mt-1 text-xs text-muted-foreground">{certificate.detail}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          loading={working === domain.id}
                          onClick={() => void verify(domain)}
                          aria-label={`${verified ? 'Revérifier' : 'Vérifier'} le domaine ${domain.hostname}`}
                        >
                          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                          {verified ? 'Revérifier' : 'Vérifier'}
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
