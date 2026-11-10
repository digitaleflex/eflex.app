'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check, Lock, Search, ShieldCheck, X } from 'lucide-react'
import { GithubMark } from '@/components/icons/github-mark'
import { cn } from '@/lib/utils'

interface RepoOption {
  fullName: string
  url: string
  defaultBranch: string
  private: boolean
  source: 'app' | 'pat'
  installationId?: string
  accountLogin?: string
  updatedAt?: string | null
}

interface Config {
  configured: boolean
  oauthConfigured: boolean
  installationUrl: string | null
}

interface Sources {
  app: boolean
  pat: boolean
}

export interface GitHubSelection {
  url: string
  branch: string
  installationId?: string
  usePat?: boolean
}

type Visibility = 'all' | 'private' | 'public'

const normalize = (value: string): string =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const ownerOf = (fullName: string): string => fullName.split('/')[0] ?? fullName

const avatarUrl = (login: string | undefined): string | null =>
  login ? `https://github.com/${encodeURIComponent(login)}.png?size=64` : null

function rank(repo: RepoOption, query: string): number {
  const name = normalize(repo.fullName)
  const owner = normalize(ownerOf(repo.fullName))
  const visibility = repo.private ? 'prive private' : 'public'
  if (name.startsWith(query) || owner.startsWith(query)) return 0
  if (name.includes(query)) return 1
  if (visibility.includes(query)) return 2
  return 3
}

/**
 * Connexion GitHub : GitHub App (recommandée) et jeton personnel (repli).
 * La sélection de dépôt est une recherche instantanée classée par pertinence
 * (nom, organisation, privé/public), avec les logos des comptes.
 */
export function GitHubPicker({ onSelect }: { onSelect: (selection: GitHubSelection) => void }) {
  const [config, setConfig] = useState<Config>({ configured: false, oauthConfigured: false, installationUrl: null })
  const [repos, setRepos] = useState<RepoOption[]>([])
  const [sources, setSources] = useState<Sources>({ app: false, pat: false })
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [query, setQuery] = useState('')
  const [visibility, setVisibility] = useState<Visibility>('all')
  const [selected, setSelected] = useState<RepoOption | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  async function loadRepos() {
    setLoading(true)
    try {
      const response = await fetch('/api/github/repositories', { cache: 'no-store' })
      const data = await response.json()
      setRepos(Array.isArray(data.repositories) ? data.repositories : [])
      if (data.sources) setSources({ app: Boolean(data.sources.app), pat: Boolean(data.sources.pat) })
      if (data.errors?.length) setMessage('Certains dépôts n’ont pas pu être listés.')
    } catch {
      setMessage('Impossible de charger les dépôts GitHub.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const configRes = await fetch('/api/github/config', { cache: 'no-store' })
        const cfg: Config = await configRes.json()
        if (cancelled) return
        setConfig(cfg)

        const params = new URLSearchParams(window.location.search)
        const installationId = params.get('installation_id')
        const state = params.get('state')
        const setupAction = params.get('setup_action')
        const outcome = params.get('github')
        if (outcome === 'connected') {
          if (!cancelled) setMessage('Compte GitHub connecté.')
          window.history.replaceState({}, '', '/dashboard/new')
        } else if (outcome === 'ownership-error') {
          if (!cancelled) setMessage('Cette installation GitHub n’est pas accessible à votre compte.')
          window.history.replaceState({}, '', '/dashboard/new')
        } else if (outcome === 'oauth-missing') {
          if (!cancelled) setMessage('Autorisation GitHub incomplète : un administrateur doit configurer les identifiants OAuth de l’App.')
          window.history.replaceState({}, '', '/dashboard/new')
        } else if (outcome) {
          if (!cancelled) setMessage('La connexion GitHub a échoué. Réessayez depuis Paramètres → Connexion GitHub.')
          window.history.replaceState({}, '', '/dashboard/new')
        } else if (installationId && setupAction !== 'update') {
          if (cfg.oauthConfigured) {
            // Vérification de propriété par autorisation utilisateur GitHub.
            window.location.assign(`/api/github/oauth/start?installation_id=${encodeURIComponent(installationId)}`)
            return
          }
          // Repli : App sans identifiants OAuth, on s'appuie sur le state et la date de création.
          if (state) {
            const link = await fetch('/api/github/installations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ installationId, state }),
            })
            const body = await link.json().catch(() => ({}))
            if (!cancelled) {
              setMessage(link.ok ? 'Compte GitHub connecté.' : body.error ?? 'La connexion GitHub a échoué.')
            }
          }
          window.history.replaceState({}, '', '/dashboard/new')
        } else if (installationId && setupAction === 'update') {
          if (!cancelled) setMessage('Accès GitHub mis à jour.')
          window.history.replaceState({}, '', '/dashboard/new')
        }
      } catch {
        if (!cancelled) setMessage('Connexion GitHub indisponible.')
      }
      if (!cancelled) await loadRepos()
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    const list = repos.filter((repo) =>
      visibility === 'all' ? true : visibility === 'private' ? repo.private : !repo.private,
    )
    if (q === '') {
      return [...list].sort((a, b) => a.fullName.localeCompare(b.fullName))
    }
    return list
      .map((repo) => ({ repo, score: rank(repo, q) }))
      .filter(({ score }) => score < 3)
      .sort((a, b) => {
        if (a.score !== b.score) return a.score - b.score
        const aDate = a.repo.updatedAt ? Date.parse(a.repo.updatedAt) : 0
        const bDate = b.repo.updatedAt ? Date.parse(b.repo.updatedAt) : 0
        if (aDate !== bDate) return bDate - aDate
        return a.repo.fullName.localeCompare(b.repo.fullName)
      })
      .map(({ repo }) => repo)
  }, [repos, query, visibility])

  const choose = (repo: RepoOption) => {
    setSelected(repo)
    onSelect({
      url: repo.url,
      branch: repo.defaultBranch,
      installationId: repo.source === 'app' ? repo.installationId : undefined,
      usePat: repo.source === 'pat',
    })
  }

  const change = () => {
    setSelected(null)
    setQuery('')
    requestAnimationFrame(() => searchRef.current?.focus())
  }

  const connected = sources.app || sources.pat
  const selectedAccount = selected ? selected.accountLogin ?? ownerOf(selected.fullName) : null
  const selectedAvatar = avatarUrl(selectedAccount ?? undefined)

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <GithubMark className="h-4 w-4" aria-hidden="true" />
          Connecter un dépôt GitHub
        </p>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/settings#github"
            className="inline-flex h-11 items-center rounded-lg px-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Paramètres de connexion
          </Link>
          {config.configured && (
            <a
              href="/api/github/install"
              className="inline-flex h-11 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {sources.app ? 'Gérer GitHub' : 'Connecter GitHub'}
            </a>
          )}
        </div>
      </div>

      {connected && !loading && (
        <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-success">
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
          GitHub connecté · {repos.length} dépôt{repos.length > 1 ? 's' : ''} accessible{repos.length > 1 ? 's' : ''}
        </p>
      )}

      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}

      {loading ? (
        <p className="text-xs text-muted-foreground">Chargement des dépôts…</p>
      ) : selected ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-background p-3">
          {selectedAvatar ? (
            <Image src={selectedAvatar} alt="" width={32} height={32} loading="lazy" unoptimized className="h-8 w-8 rounded-md" />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-muted text-xs font-semibold">
              {selected.fullName.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-mono text-sm font-medium">{selected.fullName}</p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>branche {selected.defaultBranch}</span>
              {selected.private ? (
                <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden="true" /> privé</span>
              ) : (
                <span>public</span>
              )}
              {selected.source === 'pat' && <span>jeton personnel</span>}
            </p>
          </div>
          <button
            type="button"
            onClick={change}
            className="inline-flex h-11 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Changer
          </button>
        </div>
      ) : repos.length > 0 ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un dépôt, une organisation, « privé »…"
              aria-label="Rechercher un dépôt GitHub"
              className="h-11 w-full rounded-lg border border-input bg-background pl-9 pr-11 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Effacer la recherche"
                className="absolute right-0 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div role="group" aria-label="Filtrer les dépôts" className="flex flex-wrap items-center gap-1.5">
            {(['all', 'private', 'public'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={visibility === value}
                onClick={() => setVisibility(value)}
                className={cn(
                  'h-9 rounded-full border px-3 text-xs font-medium transition-colors duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [@media(pointer:coarse)]:h-11',
                  visibility === value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {value === 'all' ? 'Tous' : value === 'private' ? 'Privés' : 'Publics'}
              </button>
            ))}
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} résultat{filtered.length > 1 ? 's' : ''}
            </span>
          </div>

          {filtered.length === 0 ? (
            <p className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
              Aucun dépôt ne correspond à « {query} ». Essayez un autre nom, une organisation, ou effacez les filtres.
            </p>
          ) : (
            <ul role="listbox" aria-label="Dépôts GitHub" className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-background p-1">
              {filtered.map((repo) => {
                const account = repo.accountLogin ?? ownerOf(repo.fullName)
                const avatar = avatarUrl(account)
                return (
                  <li key={`${repo.source}:${repo.fullName}`} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => choose(repo)}
                      className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {avatar ? (
                        <Image src={avatar} alt="" width={28} height={28} loading="lazy" unoptimized className="h-7 w-7 shrink-0 rounded-md" />
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold">
                          {repo.fullName.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-sm">{repo.fullName}</span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                          <span>{account}</span>
                          {repo.private ? (
                            <span className="inline-flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden="true" /> privé</span>
                          ) : (
                            <span>public</span>
                          )}
                          {repo.source === 'pat' && <span>jeton personnel</span>}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{repo.defaultBranch}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Aucun dépôt connecté</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            {config.configured ? (
              <>
                <li>Cliquez sur « Connecter GitHub » ci-dessus.</li>
                <li>Choisissez le compte ou l’organisation et les dépôts à autoriser.</li>
                <li>Autorisez l’accès, puis revenez ici : la liste se remplit automatiquement.</li>
              </>
            ) : (
              <>
                <li>
                  Ouvrez{' '}
                  <Link href="/dashboard/settings#github" className="font-medium text-primary hover:underline">
                    Paramètres → Connexion GitHub
                  </Link>
                  .
                </li>
                <li>Créez la GitHub App (administrateur) ou ajoutez un jeton personnel.</li>
                <li>Installez l’application, puis revenez ici pour choisir un dépôt.</li>
              </>
            )}
          </ol>
        </div>
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          GitHub App recommandée
        </span>
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          Dépôts privés pris en charge
        </span>
      </div>
    </div>
  )
}
