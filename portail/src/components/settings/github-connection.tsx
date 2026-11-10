'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Check, ExternalLink, KeyRound, ListOrdered, Lock, Trash2, Unplug } from 'lucide-react'
import { GithubMark } from '@/components/icons/github-mark'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const avatarUrl = (login: string): string => `https://github.com/${encodeURIComponent(login)}.png?size=64`

interface Connection {
  app: { configured: boolean; oauthConfigured?: boolean; slug: string | null; installationUrl: string | null }
  installations: { installationId: string; accountLogin: string }[]
  pat: { login: string; scopes: string[]; updatedAt: string } | null
}

type Feedback = { tone: 'success' | 'error'; message: string } | null

interface GuideStep {
  title: string
  description: string
  done: boolean
  action?: React.ReactNode
}

/** Liste d'étapes avec état visuel : fait, étape courante, à venir. */
function Steps({ steps }: { steps: GuideStep[] }) {
  const current = steps.findIndex((step) => !step.done)
  return (
    <ol className="space-y-2.5">
      {steps.map((step, index) => {
        const state = step.done ? 'done' : index === current ? 'current' : 'todo'
        return (
          <li
            key={step.title}
            aria-current={state === 'current' ? 'step' : undefined}
            className={cn(
              'flex gap-3 rounded-xl border p-3 transition-[border-color,background-color] duration-200 ease-out-expo',
              state === 'current' ? 'border-primary/40 bg-primary/5' : 'border-border',
              // Pas d'opacité sur le texte : `text-muted-foreground` + opacité
              // passait sous 4,5:1. L'état « à venir » est porté par la bordure.
              state === 'todo' && 'border-dashed',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                step.done
                  ? 'bg-success text-success-foreground'
                  : state === 'current'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
              )}
            >
              {step.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : index + 1}
            </span>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium">{step.title}</p>
                {step.done && <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">Fait</span>}
                {state === 'current' && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">À faire</span>}
              </div>
              <p className="text-xs text-muted-foreground">{step.description}</p>
              {step.action && <div className="pt-1.5">{step.action}</div>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Connexion GitHub de l'utilisateur : GitHub App (recommandée) et jeton personnel
 * (repli). Aucun secret n'est renvoyé par l'API : seul le nom du compte est affiché.
 */
export function GitHubConnection({ isAdmin }: { isAdmin: boolean }) {
  const [connection, setConnection] = useState<Connection | null>(null)
  const [loading, setLoading] = useState(true)
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [removingInstallation, setRemovingInstallation] = useState<string | null>(null)
  const [repoCount, setRepoCount] = useState<number | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function load() {
    try {
      const response = await fetch('/api/github/connection', { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) {
        setFeedback({ tone: 'error', message: data.error ?? 'Connexion GitHub indisponible.' })
        return
      }
      setConnection(data as Connection)

      // Nombre de dépôts accessibles : affiché dans le bandeau « connecté ».
      try {
        const reposResponse = await fetch('/api/github/repositories', { cache: 'no-store' })
        const reposData = await reposResponse.json()
        setRepoCount(
          reposResponse.ok && Array.isArray(reposData.repositories) ? reposData.repositories.length : null,
        )
      } catch {
        setRepoCount(null)
      }
    } catch {
      setFeedback({ tone: 'error', message: 'Connexion GitHub indisponible.' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const outcome = new URLSearchParams(window.location.search).get('github')
    if (outcome === 'app-created') setFeedback({ tone: 'success', message: 'Étape 1 terminée : application GitHub créée. Passez à l’installation ci-dessous.' })
    else if (outcome === 'state-error') setFeedback({ tone: 'error', message: 'La vérification de sécurité a échoué. Relancez la création de l’application.' })
    else if (outcome === 'app-error') setFeedback({ tone: 'error', message: 'GitHub n’a pas pu créer l’application. Réessayez.' })
    else if (outcome === 'not-configured') setFeedback({ tone: 'error', message: 'La GitHub App n’est pas encore configurée. Commencez par l’étape 1.' })
    else if (outcome === 'install-error') setFeedback({ tone: 'error', message: 'Installation GitHub incomplète. Relancez « Connecter GitHub ».' })
    else if (outcome === 'oauth-error') setFeedback({ tone: 'error', message: 'L’autorisation GitHub a échoué. Réessayez « Connecter GitHub ».' })
    void load()
  }, [])

  async function saveToken(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/github/pat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setFeedback({ tone: 'error', message: data.error ?? 'Jeton GitHub refusé.' })
        return
      }
      setToken('')
      setFeedback({ tone: 'success', message: `Jeton enregistré pour ${data.pat.login}.` })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setSaving(false)
    }
  }

  async function removeToken() {
    setRemoving(true)
    setFeedback(null)
    try {
      const response = await fetch('/api/github/pat', { method: 'DELETE' })
      if (!response.ok) {
        setFeedback({ tone: 'error', message: 'Suppression du jeton impossible.' })
        return
      }
      setFeedback({ tone: 'success', message: 'Jeton personnel supprimé.' })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setRemoving(false)
    }
  }

  async function unlinkInstallation(installationId: string) {
    setRemovingInstallation(installationId)
    setFeedback(null)
    try {
      const response = await fetch(`/api/github/installations/${encodeURIComponent(installationId)}`, {
        method: 'DELETE',
      })
      if (!response.ok) {
        setFeedback({ tone: 'error', message: 'Impossible de retirer ce compte GitHub.' })
        return
      }
      setFeedback({ tone: 'success', message: 'Compte GitHub retiré de cette instance Eflex.' })
      await load()
    } catch {
      setFeedback({ tone: 'error', message: 'Impossible de contacter le serveur.' })
    } finally {
      setRemovingInstallation(null)
    }
  }

  const appReady = Boolean(connection?.app.configured)
  const installed = Boolean(connection?.installations.length)
  const patReady = Boolean(connection?.pat)
  const connected = installed || patReady

  return (
    <Card id="github" className="scroll-mt-24">
      <CardHeader>
        <h2 className="font-semibold flex items-center gap-2">
          <GithubMark className="w-4 h-4" aria-hidden="true" />
          Connexion GitHub
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connectez vos dépôts publics et privés. La GitHub App est recommandée ; le jeton personnel
          reste disponible pour les comptes ou organisations où elle ne peut pas être installée.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
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

        {!loading && connected && (
          <div role="status" className="rounded-xl border border-success/30 bg-success/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success text-success-foreground">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
              </span>
              GitHub connecté
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {connection?.installations.map((installation) => (
                <span key={installation.installationId} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-xs font-medium">
                  <Image src={avatarUrl(installation.accountLogin)} alt="" width={20} height={20} loading="lazy" unoptimized className="h-5 w-5 rounded-full" />
                  {installation.accountLogin}
                </span>
              ))}
              {connection?.pat && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-1 text-xs font-medium">
                  <KeyRound className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                  Jeton de {connection.pat.login}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {repoCount === null
                ? 'La liste des dépôts sera vérifiée à l’import.'
                : `${repoCount} dépôt${repoCount > 1 ? 's' : ''} accessible${repoCount > 1 ? 's' : ''} pour l’import.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link
                href="/dashboard/new"
                className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                Importer un dépôt
              </Link>
              <a
                href="https://github.com/settings/installations"
                target="_blank"
                rel="noreferrer"
                className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Gérer sur GitHub
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        )}

        <section aria-labelledby="github-guide-titre" className="space-y-4">
          <div className="flex items-start gap-2">
            <ListOrdered className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            <div>
              <h3 id="github-guide-titre" className="flex flex-wrap items-center gap-2 text-sm font-medium">
                Guide pas à pas
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Recommandé</span>
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Trois étapes pour connecter un compte GitHub et publier vos dépôts publics ou privés.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-xs text-muted-foreground">Vérification de la connexion…</p>
          ) : (
            <Steps
              steps={[
                {
                  title: 'Créer l’application GitHub',
                  description:
                    'Opération unique réservée aux administrateurs. GitHub génère la clé privée, le secret du webhook et l’identifiant OAuth.',
                  done: appReady,
                  action: !appReady ? (
                    isAdmin ? (
                      <a
                        href="/api/github/app-manifest/start"
                        className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        Créer l’application GitHub
                      </a>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        En attente d’un administrateur de la plateforme. Vous pouvez utiliser un jeton
                        personnel en attendant.
                      </p>
                    )
                  ) : undefined,
                },
                {
                  title: 'Installer et autoriser l’application',
                  description:
                    'Choisissez le compte ou l’organisation, puis les dépôts accessibles. GitHub vous demande ensuite d’autoriser l’application.',
                  done: installed,
                  action:
                    appReady && !installed ? (
                      <a
                        href="/api/github/install"
                        className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        Connecter GitHub
                      </a>
                    ) : undefined,
                },
                {
                  title: 'Choisir un dépôt',
                  description: installed
                    ? 'Votre compte est connecté : créez un projet depuis la liste des dépôts.'
                    : 'Disponible dès que l’étape 2 est terminée.',
                  done: false,
                  action: installed ? (
                    <Link
                      href="/dashboard/new"
                      className="inline-flex h-11 items-center rounded-lg border border-input bg-background px-4 text-sm font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Créer un projet
                    </Link>
                  ) : undefined,
                },
              ]}
            />
          )}

          {connection?.installations.length ? (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Comptes connectés</p>
              <ul className="space-y-2">
                {connection.installations.map((installation) => (
                  <li key={installation.installationId} className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <Image
                      src={avatarUrl(installation.accountLogin)}
                      alt=""
                      width={28}
                      height={28}
                      loading="lazy"
                      unoptimized
                      className="h-7 w-7 shrink-0 rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{installation.accountLogin}</p>
                      <p className="font-mono text-xs text-muted-foreground">installation {installation.installationId}</p>
                    </div>
                    <a
                      href="https://github.com/settings/installations"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-11 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Gérer
                      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      loading={removingInstallation === installation.installationId}
                      onClick={() => void unlinkInstallation(installation.installationId)}
                    >
                      <Unplug className="h-3.5 w-3.5" aria-hidden="true" />
                      Retirer
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {!appReady && patReady ? (
            <p className="text-xs text-muted-foreground">
              Votre jeton personnel est déjà actif : vous pouvez choisir un dépôt dans « Nouveau projet »
              sans attendre la création de l’application GitHub.
            </p>
          ) : null}
        </section>

        <section aria-labelledby="github-pat-titre" className="space-y-3 border-t border-border pt-5">
          <div>
            <h3 id="github-pat-titre" className="flex flex-wrap items-center gap-2 text-sm font-medium">
              <KeyRound className="h-4 w-4 text-primary" aria-hidden="true" />
              Jeton personnel GitHub
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Alternative</span>
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Utilisez cette méthode si vous ne pouvez pas installer la GitHub App. Pour lire et déployer
              des dépôts privés, un jeton classique avec la portée <code className="font-mono">repo</code>,
              ou un jeton fine-grained avec <em>Contents: Read</em> et <em>Administration: Read and write</em>.
            </p>
          </div>

          <ol className="space-y-1.5 text-sm text-muted-foreground">
            <li className="flex gap-2">
              <span aria-hidden="true" className="font-semibold text-foreground">1.</span>
              <span>
                Créez un jeton sur GitHub :{' '}
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  jeton fine-grained ↗
                </a>{' '}
                ou{' '}
                <a
                  href="https://github.com/settings/tokens/new"
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  jeton classique
                </a>
                .
              </span>
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="font-semibold text-foreground">2.</span>
              <span>Collez-le ci-dessous, puis cliquez sur « Enregistrer le jeton ». Il est chiffré au repos.</span>
            </li>
          </ol>

          {connection?.pat ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <div className="text-sm">
                <p className="font-medium">Jeton de {connection.pat.login}</p>
                <p className="text-xs text-muted-foreground">
                  {connection.pat.scopes.length > 0 ? `Portées : ${connection.pat.scopes.join(', ')}` : 'Jeton fine-grained'}
                </p>
              </div>
              <Button type="button" variant="outline" loading={removing} onClick={() => void removeToken()}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Supprimer
              </Button>
            </div>
          ) : (
            <form onSubmit={saveToken} className="space-y-3">
              <Input
                id="github-pat"
                label="Jeton GitHub"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                hint="Collez un jeton commençant par ghp_, github_pat_ ou gho_."
                required
              />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" loading={saving}>
                  Enregistrer le jeton
                </Button>
                <a
                  href="https://github.com/settings/personal-access-tokens/new"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-primary hover:underline"
                >
                  Créer un jeton fine-grained ↗
                </a>
              </div>
            </form>
          )}
        </section>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Les jetons servent uniquement à lister, analyser et cloner vos dépôts. Ils ne sont jamais
          envoyés au navigateur d’un autre utilisateur.
        </p>
      </CardContent>
    </Card>
  )
}
