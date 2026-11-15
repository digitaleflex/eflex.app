'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, DownloadCloud, ExternalLink, KeyRound, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface VercelProjectPrefill {
  name: string
  repoUrl?: string
  branch?: string
  root?: string
  framework?: string
  warnings: string[]
}

interface VercelInventoryRepo {
  provider?: string
  org?: string
  repo?: string
  gitHubUrl?: string
  productionBranch?: string
}

interface VercelInventoryProject {
  id: string
  name: string
  framework?: string
  buildCommand?: string | null
  installCommand?: string | null
  devCommand?: string | null
  outputDirectory?: string | null
  rootDirectory?: string | null
  repository: VercelInventoryRepo | null
  warnings: string[]
}

interface VercelInventory {
  projects: VercelInventoryProject[]
  truncated: boolean
  limitations: string[]
}

interface VercelImportProps {
  onPrefill: (prefill: VercelProjectPrefill) => void
  disabled?: boolean
}

const networkError = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

/**
 * Inventaire Vercel (MIG-1) : le jeton est envoyé une seule fois pour lire les projets,
 * puis oublié côté client. Rien n'est importé ni enregistré automatiquement.
 */
export function VercelImport({ onPrefill, disabled }: VercelImportProps) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inventory, setInventory] = useState<VercelInventory | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  async function loadInventory(e: React.FormEvent) {
    e.preventDefault()
    const value = token.trim()
    if (value === '') return

    setLoading(true)
    setError('')
    setInventory(null)
    setSelectedId(null)
    try {
      const res = await fetch('/api/migrations/vercel/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value }),
      })
      const data = (await res.json().catch(() => ({}))) as VercelInventory & { error?: string }
      if (!res.ok) {
        setError(data.error || 'Impossible de lire les projets Vercel.')
        return
      }
      // Le jeton n'est utile qu'à cette requête : on l'efface immédiatement de l'état.
      setToken('')
      setInventory(data)
    } catch {
      setError(networkError)
    } finally {
      setLoading(false)
    }
  }

  function prefill(project: VercelInventoryProject) {
    setSelectedId(project.id)
    onPrefill({
      name: project.name,
      repoUrl: project.repository?.gitHubUrl,
      branch: project.repository?.productionBranch,
      root: project.rootDirectory ?? undefined,
      framework: project.framework,
      warnings: project.warnings,
    })
  }

  return (
    <section className="rounded-lg border border-border bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-h-11 items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
      >
        <span className="flex items-center gap-2">
          <DownloadCloud className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className="text-sm font-medium">Importer depuis Vercel</span>
          <span className="rounded-md border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">
            Inventaire
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Lisez la liste de vos projets Vercel pour pré-remplir l&apos;import d&apos;un dépôt GitHub.
              Cet inventaire ne crée aucun projet et n&apos;importe rien automatiquement.
            </p>
            <ul className="space-y-1">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>
                  Le jeton d&apos;accès est utilisé <strong className="font-medium text-foreground">une seule fois</strong> pour cette
                  lecture, puis oublié. Il n&apos;est jamais enregistré, jamais renvoyé et jamais consigné dans les journaux.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  Les variables d&apos;environnement et secrets Vercel ne sont pas importés : les valeurs sensibles ne sont pas
                  relisibles et devront être ressaisies. Les domaines, bases de données et fonctions propres à Vercel demandent
                  une vérification manuelle.
                </span>
              </li>
            </ul>
            <p>
              Créez un jeton personnel dans{' '}
              <a
                href="https://vercel.com/account/settings/tokens"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
              >
                les réglages Vercel
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>{' '}
              (lecture des projets suffisante), puis collez-le ci-dessous. Vous pouvez le révoquer ensuite.
            </p>
          </div>

          <form onSubmit={loadInventory} className="space-y-3">
            <Input
              id="vercel-token"
              type="password"
              label="Jeton d'accès Vercel"
              placeholder="Collez votre jeton (utilisé une seule fois)"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(e) => {
                setToken(e.target.value)
                setError('')
              }}
              disabled={loading || disabled}
            />
            {error && (
              <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
            )}
            <Button type="submit" loading={loading} disabled={disabled || token.trim() === ''}>
              {!loading && <KeyRound className="h-4 w-4" aria-hidden="true" />}
              {loading ? 'Lecture des projets…' : 'Lire mes projets Vercel'}
            </Button>
          </form>

          {inventory && (
            <div className="space-y-3">
              <div className="rounded-lg border border-border bg-background p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Limites de cet inventaire</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {inventory.limitations.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>

              {inventory.truncated && (
                <p role="status" className="text-xs text-warning">
                  La liste est tronquée : seuls les premiers projets sont affichés. Affinez votre compte Vercel ou importez en plusieurs fois.
                </p>
              )}

              {inventory.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun projet accessible avec ce jeton.</p>
              ) : (
                <ul role="list" className="space-y-2">
                  {inventory.projects.map((project) => {
                    const canPrefillRepo = Boolean(project.repository?.gitHubUrl)
                    const selected = selectedId === project.id
                    return (
                      <li key={project.id} className={cn('rounded-lg border bg-background p-3', selected ? 'border-primary' : 'border-border')}>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 space-y-1">
                            <p className="truncate text-sm font-medium">{project.name}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                              {project.framework && <span>Framework : <span className="font-mono">{project.framework}</span></span>}
                              {project.repository?.productionBranch && <span>Branche : <span className="font-mono">{project.repository.productionBranch}</span></span>}
                              {project.rootDirectory && <span>Dossier : <span className="font-mono">{project.rootDirectory}</span></span>}
                            </div>
                            {project.repository?.gitHubUrl ? (
                              <p className="truncate font-mono text-xs text-foreground">{project.repository.gitHubUrl}</p>
                            ) : project.repository ? (
                              <p className="text-xs text-muted-foreground">
                                Dépôt {project.repository.provider ?? 'Git'}
                                {project.repository.org && project.repository.repo ? ` : ${project.repository.org}/${project.repository.repo}` : ''}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground">Aucun dépôt Git lié</p>
                            )}
                            {(project.buildCommand || project.installCommand || project.outputDirectory) && (
                              <p className="text-xs text-muted-foreground">
                                Commandes/dossier de sortie personnalisés détectés (à vérifier).
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                            <Button
                              type="button"
                              variant={selected ? 'secondary' : 'outline'}
                              size="sm"
                              onClick={() => prefill(project)}
                              disabled={disabled}
                            >
                              {selected ? 'Pré-rempli' : canPrefillRepo ? 'Pré-remplir le dépôt' : 'Pré-remplir le nom'}
                            </Button>
                            {!canPrefillRepo && (
                              <span className="text-[11px] text-muted-foreground">Import GitHub requis pour le déploiement</span>
                            )}
                          </div>
                        </div>
                        {project.warnings.length > 0 && (
                          <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-warning">
                            {project.warnings.map((w) => (
                              <li key={w} className="flex items-start gap-1.5">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                <span>{w}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
