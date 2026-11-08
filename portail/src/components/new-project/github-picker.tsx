'use client'

import { useEffect, useState } from 'react'

interface RepoOption {
  fullName: string
  url: string
  defaultBranch: string
  private: boolean
  installationId: string
}

interface Config {
  configured: boolean
  installationUrl: string | null
}

/**
 * Connexion GitHub App (issue 07) : installe l'App, relie l'installation au
 * compte, puis propose la liste des dépôts (publics ET privés autorisés).
 * La saisie manuelle de l'URL reste possible.
 */
export function GitHubPicker({
  onSelect,
}: {
  onSelect: (url: string, branch: string, installationId: string) => void
}) {
  const [config, setConfig] = useState<Config>({ configured: false, installationUrl: null })
  const [repos, setRepos] = useState<RepoOption[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function loadRepos() {
    setLoading(true)
    try {
      const response = await fetch('/api/github/repositories', { cache: 'no-store' })
      const data = await response.json()
      setRepos(Array.isArray(data.repositories) ? data.repositories : [])
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

        // Retour du flux d'installation GitHub : ?installation_id=…
        const installationId = new URLSearchParams(window.location.search).get('installation_id')
        if (installationId && cfg.configured) {
          const link = await fetch('/api/github/installations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ installationId }),
          })
          if (!cancelled) {
            setMessage(link.ok ? 'Compte GitHub connecté.' : 'La connexion GitHub a échoué.')
          }
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

  if (!config.configured) return null

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">Ou choisissez un dépôt GitHub</p>
        {config.installationUrl && (
          <a
            href={config.installationUrl}
            className="inline-flex h-9 items-center rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Connecter GitHub
          </a>
        )}
      </div>

      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}

      {loading ? (
        <p className="text-xs text-muted-foreground">Chargement des dépôts…</p>
      ) : repos.length > 0 ? (
        <select
          aria-label="Dépôt GitHub"
          className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          defaultValue=""
          onChange={(e) => {
            const repo = repos.find((r) => r.fullName === e.target.value)
            if (repo) onSelect(repo.url, repo.defaultBranch, repo.installationId)
          }}
        >
          <option value="" disabled>Sélectionner un dépôt…</option>
          {repos.map((repo) => (
            <option key={`${repo.installationId}:${repo.fullName}`} value={repo.fullName}>
              {repo.fullName}{repo.private ? ' (privé)' : ''}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aucun dépôt lié. Installez l’application GitHub sur votre compte pour lister vos dépôts, y compris privés.
        </p>
      )}
    </div>
  )
}
