'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DownloadCloud,
  ExternalLink,
  KeyRound,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

export interface VercelEnvPrefillRow {
  key: string
  value: string
}

export interface VercelProjectPrefill {
  name: string
  repoUrl?: string
  branch?: string
  root?: string
  framework?: string
  warnings: string[]
  /** Variables d'environnement lisibles à pré-remplir (valeurs masquées dans l'éditeur). */
  envRows?: VercelEnvPrefillRow[]
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

type VercelEnvTarget = 'development' | 'preview' | 'production'

interface VercelEnvVar {
  key: string
  targets: VercelEnvTarget[]
  value?: string
  readable: boolean
  requiresReentry: boolean
  vercelType?: string
  note?: string
  reasons: string[]
}

interface VercelEnvOverlap {
  key: string
  target: VercelEnvTarget
  count: number
}

interface VercelEnvReview {
  projectId: string
  variables: VercelEnvVar[]
  overlaps: VercelEnvOverlap[]
  warnings: string[]
  limitations: string[]
  stats: {
    total: number
    readable: number
    requiresReentry: number
    overlaps: number
  }
  truncated: boolean
}

interface VercelImportProps {
  onPrefill: (prefill: VercelProjectPrefill) => void
  disabled?: boolean
}

const networkError = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

const TARGET_LABELS: Record<VercelEnvTarget, string> = {
  development: 'Development',
  preview: 'Preview',
  production: 'Production',
}

const ALL_TARGETS: VercelEnvTarget[] = ['development', 'preview', 'production']

function targetLabel(target: VercelEnvTarget): string {
  return TARGET_LABELS[target]
}

/** Masque une valeur lisible pour l'aperçu : la valeur réelle n'est jamais affichée en clair. */
function maskedPreview(value: string): string {
  if (value.length === 0) return '(valeur vide)'
  const len = Math.min(value.length, 24)
  return '•'.repeat(len) + (value.length > 24 ? '…' : '')
}

/**
 * Import Vercel (MIG-1 inventaire, MIG-2 variables d'environnement).
 * Les jetons sont utilisés une seule fois par appel API puis oubliés côté client.
 * Rien n'est persisté ni consigné ; les valeurs non relisibles ne sont jamais devinées.
 */
export function VercelImport({ onPrefill, disabled }: VercelImportProps) {
  const [open, setOpen] = useState(false)
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [inventory, setInventory] = useState<VercelInventory | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [envToken, setEnvToken] = useState('')
  const [envTargets, setEnvTargets] = useState<VercelEnvTarget[]>([...ALL_TARGETS])
  const [envLoadingId, setEnvLoadingId] = useState<string | null>(null)
  const [envError, setEnvError] = useState('')
  const [envReview, setEnvReview] = useState<VercelEnvReview | null>(null)
  const [envApplied, setEnvApplied] = useState(false)

  async function loadInventory(e: React.FormEvent) {
    e.preventDefault()
    const value = token.trim()
    if (value === '') return

    setLoading(true)
    setError('')
    setInventory(null)
    setSelectedId(null)
    setEnvReview(null)
    setEnvError('')
    setEnvApplied(false)
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

  function prefillProject(project: VercelInventoryProject) {
    setSelectedId(project.id)
    setEnvReview(null)
    setEnvError('')
    setEnvApplied(false)
    onPrefill({
      name: project.name,
      repoUrl: project.repository?.gitHubUrl,
      branch: project.repository?.productionBranch,
      root: project.rootDirectory ?? undefined,
      framework: project.framework,
      warnings: project.warnings,
    })
  }

  function toggleTarget(target: VercelEnvTarget) {
    setEnvTargets((current) => {
      if (current.includes(target)) {
        const next = current.filter((t) => t !== target)
        return next.length === 0 ? current : next
      }
      return ALL_TARGETS.filter((t) => current.includes(t) || t === target)
    })
  }

  async function loadEnv(projectId: string) {
    const value = envToken.trim()
    if (value === '') return

    setEnvLoadingId(projectId)
    setEnvError('')
    setEnvReview(null)
    setEnvApplied(false)
    try {
      const res = await fetch('/api/migrations/vercel/env', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: value, projectId, targets: envTargets }),
      })
      const data = (await res.json().catch(() => ({}))) as VercelEnvReview & { error?: string }
      if (!res.ok) {
        setEnvError(data.error || "Impossible de lire les variables d'environnement Vercel.")
        return
      }
      // Le jeton n'est utile qu'à cette requête : on l'efface immédiatement de l'état.
      setEnvToken('')
      setEnvReview(data)
    } catch {
      setEnvError(networkError)
    } finally {
      setEnvLoadingId(null)
    }
  }

  function applyEnv(project: VercelInventoryProject) {
    if (!envReview || envReview.projectId !== project.id) return
    // Les valeurs lisibles sont pré-remplies ; les variables non relisibles sont ajoutées
    // avec une valeur vide pour être ressaisies (jamais devinées).
    const envRows: VercelEnvPrefillRow[] = envReview.variables.map((v) => ({
      key: v.key,
      value: v.readable && typeof v.value === 'string' ? v.value : '',
    }))
    const extraWarnings = [...envReview.warnings]
    if (envReview.stats.requiresReentry > 0) {
      extraWarnings.push(
        `${envReview.stats.requiresReentry} variable(s) doivent être ressaisies : leur valeur n'est pas relisible sur Vercel (elles sont ajoutées sans valeur).`,
      )
    }
    if (envReview.overlaps.length > 0) {
      extraWarnings.push(
        'Des chevauchements de cibles ont été détectés : vérifiez les valeurs retenues pour chaque environnement.',
      )
    }
    setEnvApplied(true)
    onPrefill({
      name: project.name,
      repoUrl: project.repository?.gitHubUrl,
      branch: project.repository?.productionBranch,
      root: project.rootDirectory ?? undefined,
      framework: project.framework,
      warnings: [...project.warnings, ...extraWarnings],
      envRows,
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
            Inventaire &amp; variables
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" aria-hidden="true" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
      </button>

      {open && (
        <div className="space-y-4 border-t border-border px-4 py-4">
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Lisez vos projets Vercel pour pré-remplir un dépôt GitHub et, si vous le souhaitez, préparer les variables
              d&apos;environnement. Rien n&apos;est créé ni importé automatiquement.
            </p>
            <ul className="space-y-1">
              <li className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>
                  Chaque lecture utilise le jeton <strong className="font-medium text-foreground">une seule fois</strong>, puis
                  l&apos;oublie. Il n&apos;est jamais enregistré, jamais renvoyé et jamais consigné dans les journaux.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                <span>
                  Les valeurs <strong className="font-medium text-foreground">sensibles ou non relisibles</strong> sur Vercel ne
                  sont jamais devinées : elles sont signalées « à ressaisir ». Les valeurs lisibles sont proposées masquées et
                  modifiables avant l&apos;import. Domaines, bases de données et fonctions propres à Vercel restent à vérifier.
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
              (lecture des projets et des variables), puis collez-le ci-dessous. Vous pouvez le révoquer ensuite.
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
                  La liste est tronquée : seuls les premiers projets sont affichés.
                </p>
              )}

              {inventory.projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun projet accessible avec ce jeton.</p>
              ) : (
                <ul role="list" className="space-y-2">
                  {inventory.projects.map((project) => {
                    const canPrefillRepo = Boolean(project.repository?.gitHubUrl)
                    const selected = selectedId === project.id
                    const envForProject = envReview?.projectId === project.id ? envReview : null
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
                          </div>
                          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                            <Button
                              type="button"
                              variant={selected ? 'secondary' : 'outline'}
                              size="sm"
                              onClick={() => prefillProject(project)}
                              disabled={disabled}
                            >
                              {selected ? 'Dépôt pré-rempli' : canPrefillRepo ? 'Pré-remplir le dépôt' : 'Pré-remplir le nom'}
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

                        {selected && (
                          <div className="mt-3 space-y-3 border-t border-border pt-3">
                            <p className="flex items-center gap-2 text-sm font-medium">
                              <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
                              Variables d&apos;environnement (lecture Vercel, usage unique)
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Collez à nouveau votre jeton pour lire les variables de ce projet (il sera oublié après cette lecture).
                              Les valeurs lisibles sont proposées masquées ; les valeurs sensibles ou non relisibles doivent être ressaisies.
                            </p>
                            <fieldset className="space-y-1">
                              <legend className="text-xs font-medium text-foreground">Environnements à lire</legend>
                              <div className="flex flex-wrap gap-3">
                                {ALL_TARGETS.map((target) => (
                                  <label key={target} className="flex min-h-11 items-center gap-2 text-sm">
                                    <input
                                      type="checkbox"
                                      className="accent-primary"
                                      checked={envTargets.includes(target)}
                                      onChange={() => toggleTarget(target)}
                                      disabled={envLoadingId === project.id || disabled}
                                    />
                                    {targetLabel(target)}
                                  </label>
                                ))}
                              </div>
                            </fieldset>
                            <Input
                              id={`vercel-env-token-${project.id}`}
                              type="password"
                              label="Jeton d'accès Vercel (pour les variables)"
                              placeholder="Collez votre jeton (utilisé une seule fois)"
                              autoComplete="off"
                              spellCheck={false}
                              value={envToken}
                              onChange={(e) => {
                                setEnvToken(e.target.value)
                                setEnvError('')
                              }}
                              disabled={envLoadingId === project.id || disabled}
                            />
                            {envError && (
                              <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                                {envError}
                              </div>
                            )}
                            <Button
                              type="button"
                              variant="outline"
                              loading={envLoadingId === project.id}
                              disabled={disabled || envToken.trim() === '' || envLoadingId === project.id}
                              onClick={() => void loadEnv(project.id)}
                            >
                              {envLoadingId !== project.id && <KeyRound className="h-4 w-4" aria-hidden="true" />}
                              {envLoadingId === project.id ? 'Lecture des variables…' : 'Lire les variables d\'environnement'}
                            </Button>

                            {envForProject && (
                              <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                                <div className="flex flex-wrap gap-2 text-xs">
                                  <span className="rounded-md border border-border bg-background px-2 py-1">
                                    {envForProject.stats.total} variable(s) lue(s)
                                  </span>
                                  <span className="rounded-md border border-success/30 bg-success/10 px-2 py-1 text-foreground">
                                    {envForProject.stats.readable} lisible(s) (masquées)
                                  </span>
                                  <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-foreground">
                                    {envForProject.stats.requiresReentry} à ressaisir
                                  </span>
                                  {envForProject.stats.overlaps > 0 && (
                                    <span className="rounded-md border border-warning/30 bg-warning/10 px-2 py-1 text-foreground">
                                      {envForProject.stats.overlaps} chevauchement(s)
                                    </span>
                                  )}
                                </div>

                                {envForProject.truncated && (
                                  <p role="status" className="text-xs text-warning">La liste des variables est tronquée.</p>
                                )}

                                {envForProject.warnings.length > 0 && (
                                  <ul className="space-y-1 text-xs text-warning">
                                    {envForProject.warnings.map((w) => (
                                      <li key={w} className="flex items-start gap-1.5">
                                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                        <span>{w}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}

                                {envForProject.limitations.length > 0 && (
                                  <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                                    {envForProject.limitations.map((l) => (
                                      <li key={l}>{l}</li>
                                    ))}
                                  </ul>
                                )}

                                {envForProject.variables.length > 0 ? (
                                  <ul role="list" className="max-h-80 space-y-2 overflow-auto pr-1">
                                    {envForProject.variables.map((v, idx) => (
                                      <li key={`${v.key}-${v.targets.join(',')}-${idx}`} className="rounded-md border border-border bg-background p-2 text-xs">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="font-mono font-medium text-foreground">{v.key}</span>
                                          {v.targets.length > 0 ? (
                                            <span className="text-muted-foreground">[{v.targets.map(targetLabel).join(', ')}]</span>
                                          ) : (
                                            <span className="text-warning">[cible à vérifier]</span>
                                          )}
                                          {v.vercelType && <span className="text-muted-foreground">type : {v.vercelType}</span>}
                                        </div>
                                        <div className="mt-1">
                                          {v.readable && typeof v.value === 'string' ? (
                                            <p className="font-mono text-muted-foreground" aria-label="Valeur lisible, masquée">
                                              {maskedPreview(v.value)}
                                            </p>
                                          ) : (
                                            <p className="font-medium text-warning">À ressaisir (valeur non relisible)</p>
                                          )}
                                        </div>
                                        {v.note && <p className="mt-1 text-muted-foreground">{v.note}</p>}
                                        {v.reasons.length > 0 && (
                                          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted-foreground">
                                            {v.reasons.map((r) => (
                                              <li key={r}>{r}</li>
                                            ))}
                                          </ul>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                ) : (
                                  <p className="text-sm text-muted-foreground">Aucune variable à afficher.</p>
                                )}

                                <div className="flex flex-wrap items-center gap-2">
                                  <Button type="button" size="sm" onClick={() => applyEnv(project)} disabled={disabled}>
                                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                                    Appliquer au formulaire du projet
                                  </Button>
                                  {envApplied && (
                                    <span role="status" className="text-xs text-success">
                                      Variables pré-remplies ci-dessous (à vérifier et compléter).
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                  Seules les valeurs lisibles sont pré-remplies (masquées dans l&apos;éditeur). Les variables à ressaisir
                                  ne sont pas devinées : complétez-les manuellement avant le déploiement.
                                </p>
                              </div>
                            )}
                          </div>
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

