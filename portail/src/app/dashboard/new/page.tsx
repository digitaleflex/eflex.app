'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Box, Check, ChevronDown, GitBranch, Search, TriangleAlert } from 'lucide-react'
import type { BuildPlan } from '@eflex/detector'
import type { RepoAnalysis } from '@/lib/repo-analysis'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FrameworkIcon } from '@/components/framework-icon'
import { DetectionCard } from '@/components/new-project/detection-card'
import { VercelCompatNote } from '@/components/new-project/vercel-compat-note'
import { ApplicationPicker } from '@/components/new-project/application-picker'
import { ApplicationMultiSelect } from '@/components/new-project/application-multi-select'
import { GitHubPicker } from '@/components/new-project/github-picker'
import { VercelImport } from '@/components/new-project/vercel-import'
import { EnvEditor } from '@/components/env/env-editor'
import { mergeEnvRows, rowsToVars } from '@/lib/env-parse'
import { frameworkLabel, runtimeLabel } from '@/lib/frameworks'
import {
  DOCKER_IMAGE_REF_HINT,
  PRIVATE_REGISTRY_LIMITATION,
  UNSUPPORTED_SOURCES_NOTE,
} from '@/lib/docker-image-ref'

interface EnvVar {
  key: string
  value: string
}

type SourceMode = 'git' | 'image'

const NETWORK_ERROR = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

const STEPS = [
  { id: 1, label: 'Source' },
  { id: 2, label: 'Analyse' },
  { id: 3, label: 'Configuration' },
  { id: 4, label: 'Déployer' },
] as const

function StepIndicator({
  current,
  sourceMode,
}: {
  current: 1 | 2 | 3 | 4
  sourceMode: SourceMode
}) {
  const labels = STEPS.map((step) =>
    step.id === 2 && sourceMode === 'image' ? { ...step, label: 'Image' } : step,
  )

  return (
    <ol aria-label="Étapes de création du projet" className="grid gap-2 sm:grid-cols-4">
      {labels.map((step) => {
        const done = step.id < current
        const active = step.id === current
        return (
          <li
            key={step.id}
            aria-current={active ? 'step' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors',
              done && 'border-primary/30 bg-primary/5 text-foreground',
              active && 'border-primary bg-primary/10 text-foreground',
              !done && !active && 'border-border bg-muted/20 text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done && 'bg-primary text-primary-foreground',
                active && 'bg-primary text-primary-foreground',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-4 w-4" /> : step.id}
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] uppercase tracking-wide text-muted-foreground">
                Étape {step.id}
              </span>
              <span className="block font-medium">{step.label}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm font-medium" title={value}>
        {value}
      </dd>
    </div>
  )
}

export default function NewProjectPage() {
  const router = useRouter()
  const resultHeading = useRef<HTMLHeadingElement>(null)
  const submitErrorRef = useRef<HTMLDivElement>(null)

  const [sourceMode, setSourceMode] = useState<SourceMode>('git')
  const [imageRef, setImageRef] = useState('')
  const [imagePort, setImagePort] = useState('80')

  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [installationId, setInstallationId] = useState('')
  const [usePat, setUsePat] = useState(false)
  const [name, setName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: '', value: '' }])
  const [importHints, setImportHints] = useState<string[]>([])

  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null)
  const [appOptions, setAppOptions] = useState<string[]>([])
  const [root, setRoot] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')

  // Drapeau serveur `EFLEX_MULTI_APP` (lot C de D2) et applications
  // supplémentaires cochées. Désactivé : l'écran reste mono-application.
  const [multiApp, setMultiApp] = useState(false)
  const [extraRoots, setExtraRoots] = useState<string[]>([])

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const detection = analysis?.detection ?? null
  const plans: BuildPlan[] = detection?.plan ? [detection.plan, ...detection.alternatives] : []
  const selectedPlan = plans.find((p) => p.framework === chosen) ?? plans[0] ?? null
  const applications = analysis?.apps ?? []

  // Capacités de l'instance : le drapeau multi-applications est lu côté serveur.
  useEffect(() => {
    let active = true
    fetch('/api/auth/config')
      .then((response) => response.json())
      .then((data: { multiApp?: boolean }) => {
        if (active) setMultiApp(data.multiApp === true)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])

  // Par défaut, toutes les autres applications détectées sont incluses : un
  // monorepo se déploie en un clic, chaque case reste décochable.
  useEffect(() => {
    if (!multiApp || !analysis) {
      setExtraRoots([])
      return
    }
    setExtraRoots(analysis.apps.filter((app) => app.root !== root).map((app) => app.root))
  }, [multiApp, analysis, root])

  // Place le focus sur le résultat dès qu'il arrive, pour les lecteurs d'écran et le clavier.
  useEffect(() => {
    if (analysis) resultHeading.current?.focus()
  }, [analysis])

  useEffect(() => {
    if (submitError) submitErrorRef.current?.focus()
  }, [submitError])

  const resetAnalysis = () => {
    setAnalysis(null)
    setAppOptions([])
    setRoot('')
    setChosen(null)
    setAnalyzeError('')
    setSubmitError('')
    setImportHints([])
  }

  const imageReady = imageRef.trim() !== '' && name.trim() !== '' && Number(imagePort) >= 1
  const gitConfigured = Boolean(analysis && selectedPlan && name.trim() !== '')
  const currentStep: 1 | 2 | 3 | 4 =
    sourceMode === 'image'
      ? imageReady
        ? 4
        : 2
      : !analysis
        ? 2
        : !selectedPlan
          ? 2
          : 3

  const summaryItems = [
    sourceMode === 'git'
      ? { label: 'Source', value: 'Dépôt GitHub' }
      : { label: 'Source', value: 'Image Docker' },
    sourceMode === 'git' && analysis
      ? { label: 'Dépôt', value: `${analysis.repo.owner}/${analysis.repo.repo}` }
      : sourceMode === 'image' && imageRef.trim()
        ? { label: 'Image', value: imageRef.trim() }
        : null,
    sourceMode === 'git' && analysis
      ? { label: 'Branche', value: analysis.repo.branch }
      : sourceMode === 'git' && branch.trim()
        ? { label: 'Branche', value: branch.trim() }
        : null,
    selectedPlan ? { label: 'Stack détectée', value: frameworkLabel(selectedPlan.framework) } : null,
  ].filter((item): item is { label: string; value: string } => item !== null)

  async function analyze(app?: string) {
    setAnalyzing(true)
    setAnalyzeError('')
    try {
      const res = await fetch('/api/projects/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoUrl,
          branch: branch || undefined,
          root: app || undefined,
          installationId: installationId || undefined,
          usePat: usePat || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAnalyzeError(data.error || "L'analyse a échoué. Réessayez dans un instant.")
        if (!app) setAnalysis(null)
        return
      }

      const result = data as RepoAnalysis
      const appQuestion = result.detection.questions.find((q) => q.id === 'app')
      if (appQuestion?.options) setAppOptions(appQuestion.options)
      else if (!app) setAppOptions([])

      setAnalysis(result)
      setRoot(app ?? '')
      setChosen(null)
      setSubmitError('')
      if (!nameEdited) setName(result.repo.repo)
    } catch {
      setAnalyzeError(NETWORK_ERROR)
    } finally {
      setAnalyzing(false)
    }
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault()
    if (!analysis || !selectedPlan) return
    setSubmitting(true)
    setSubmitError('')
    // Multi-applications : l'app analysée est principale, les autres sont
    // ajoutées au même projet (le serveur re-analyse chaque dossier).
    const extraApps = multiApp
      ? analysis.apps.filter((app) => extraRoots.includes(app.root))
      : []
    const appsPayload = [
      { root, framework: selectedPlan.framework, primary: true },
      ...extraApps.map((app) => ({
        root: app.root,
        framework: app.framework ?? undefined,
        primary: false,
      })),
    ]
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          repoUrl: analysis.repo.url,
          branch: analysis.repo.branch,
          commitSha: analysis.repo.commitSha,
          root: root || undefined,
          framework: selectedPlan.framework,
          ...(appsPayload.length > 1 ? { apps: appsPayload } : {}),
          installationId: installationId || undefined,
          usePat: usePat || undefined,
          envVars: rowsToVars(envVars),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        setSubmitError(data.error || "Le projet n'a pas pu être créé. Vérifiez les champs et réessayez.")
        return
      }
      // La page du projet affiche l'état du déploiement, y compris un éventuel échec.
      router.push(`/dashboard/projects/${data.project.id}`)
      router.refresh()
    } catch {
      setSubmitError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  async function createImageProject(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    try {
      const res = await fetch('/api/projects/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          image: imageRef,
          port: Number(imagePort) || 80,
          envVars: rowsToVars(envVars),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || data.error) {
        setSubmitError(data.error || "Le projet n'a pas pu être créé. Vérifiez les champs et réessayez.")
        return
      }
      router.push(`/dashboard/projects/${data.project.id}`)
      router.refresh()
    } catch {
      setSubmitError(NETWORK_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 animate-fade-in">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Nouveau projet</h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Suivez les étapes : choisissez une source, vérifiez la détection, puis configurez l’essentiel avant de déployer.
        </p>
      </div>

      <StepIndicator current={currentStep} sourceMode={sourceMode} />

      {summaryItems.length > 0 && (
        <div className="rounded-xl border border-border bg-muted/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Résumé</p>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {summaryItems.map((item) => (
              <SummaryRow key={item.label} label={item.label} value={item.value} />
            ))}
          </dl>
        </div>
      )}

      {/* Étape 1 — Source */}
      <Card>
        <CardHeader className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-primary">Étape 1</p>
          <h2 className="font-semibold">Choisir la source</h2>
          <p className="text-sm text-muted-foreground">
            Sélectionnez l’origine de votre application. Vous pourrez ajuster la configuration ensuite.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                setSourceMode('git')
                setSubmitError('')
              }}
              className={cn(
                'flex min-h-11 items-start gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                sourceMode === 'git' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
              aria-pressed={sourceMode === 'git'}
            >
              <GitBranch className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-medium">Dépôt GitHub</span>
                <span className="block text-muted-foreground">
                  EFLEX analyse le dépôt, détecte la stack et prépare le déploiement.
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSourceMode('image')
                setSubmitError('')
                resetAnalysis()
              }}
              className={cn(
                'flex min-h-11 items-start gap-3 rounded-lg border px-3 py-3 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                sourceMode === 'image' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
              )}
              aria-pressed={sourceMode === 'image'}
            >
              <Box className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <span className="block font-medium">Image Docker</span>
                <span className="block text-muted-foreground">
                  Déployez une image déjà construite depuis un registre public.
                </span>
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{UNSUPPORTED_SOURCES_NOTE}</p>
        </CardContent>
      </Card>

      {sourceMode === 'image' ? (
        <form onSubmit={createImageProject} className="space-y-6">
          {/* Étape 2 — Image */}
          <Card>
            <CardHeader className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Étape 2</p>
              <h2 className="font-semibold">Renseigner l’image</h2>
              <p className="text-sm text-muted-foreground">
                Indiquez l’image à déployer et le port exposé par le conteneur.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                id="image-ref"
                label="Référence de l'image"
                placeholder="ghcr.io/organisation/app:latest"
                hint={DOCKER_IMAGE_REF_HINT}
                autoComplete="off"
                spellCheck={false}
                value={imageRef}
                onChange={(e) => {
                  setImageRef(e.target.value)
                  setSubmitError('')
                  if (!nameEdited) {
                    const guess = e.target.value.split('/').pop()?.split(':')[0]?.split('@')[0]
                    if (guess) setName(guess)
                  }
                }}
                required
              />
              <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                <p>{PRIVATE_REGISTRY_LIMITATION}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="image-port"
                  label="Port exposé"
                  type="number"
                  min={1}
                  max={65535}
                  value={imagePort}
                  onChange={(e) => {
                    setImagePort(e.target.value)
                    setSubmitError('')
                  }}
                  hint="Port HTTP écouté par le conteneur (80 par défaut)."
                  required
                />
                <Input
                  id="image-name"
                  label="Nom du projet"
                  hint="Utilisé pour construire l’adresse de votre application."
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value)
                    setNameEdited(true)
                    setSubmitError('')
                  }}
                  required
                />
              </div>
            </CardContent>
          </Card>

          {/* Étape 3 — Configuration */}
          <Card>
            <CardHeader className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Étape 3</p>
              <h2 className="font-semibold">Configuration</h2>
              <p className="text-sm text-muted-foreground">
                Ajoutez les variables d’environnement nécessaires au démarrage du conteneur.
              </p>
            </CardHeader>
            <CardContent>
              <EnvEditor rows={envVars} onChange={setEnvVars} disabled={submitting} />
            </CardContent>
          </Card>

          {/* Étape 4 — Déployer */}
          <Card>
            <CardHeader className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-primary">Étape 4</p>
              <h2 className="font-semibold">Déployer</h2>
              <p className="text-sm text-muted-foreground">
                Vérifiez le résumé ci-dessus, puis lancez le déploiement.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {submitError && (
                <div
                  ref={submitErrorRef}
                  tabIndex={-1}
                  role="alert"
                  className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive focus:outline-none"
                >
                  {submitError}
                </div>
              )}
              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Button
                  type="submit"
                  size="lg"
                  loading={submitting}
                  disabled={name.trim() === '' || imageRef.trim() === ''}
                >
                  Démarrer le déploiement
                </Button>
                <Button variant="ghost" type="button" size="lg" onClick={() => router.push('/dashboard')}>
                  Annuler
                </Button>
              </div>
            </CardContent>
          </Card>
        </form>
      ) : (
        <>
          {/* Étape 2 — Dépôt & analyse */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void analyze()
            }}
          >
            <Card>
              <CardHeader className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-primary">Étape 2</p>
                <h2 className="font-semibold">Analyser le dépôt</h2>
                <p className="text-sm text-muted-foreground">
                  Connectez un dépôt, vérifiez l’adresse si besoin, puis lancez l’analyse.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <GitHubPicker
                  onSelect={({ url, branch: defaultBranch, installationId: linkedInstallationId, usePat: fromPat }) => {
                    setRepoUrl(url)
                    setBranch(defaultBranch)
                    setInstallationId(linkedInstallationId ?? '')
                    setUsePat(Boolean(fromPat))
                    resetAnalysis()
                  }}
                />

                <details className="rounded-lg border border-border bg-muted/20">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                    <span>
                      Importer depuis Vercel <span className="font-normal text-muted-foreground">(optionnel)</span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  </summary>
                  <div className="border-t border-border p-3">
                    <VercelImport
                      disabled={analyzing}
                      onPrefill={(prefill) => {
                        resetAnalysis()
                        if (prefill.repoUrl) setRepoUrl(prefill.repoUrl)
                        if (prefill.branch) setBranch(prefill.branch)
                        if (!nameEdited && prefill.name) setName(prefill.name)
                        setInstallationId('')
                        setUsePat(false)
                        const hints = [...prefill.warnings]
                        if (prefill.root) {
                          hints.unshift(
                            `Dossier racine indiqué sur Vercel : « ${prefill.root} ». Vérifiez et sélectionnez le bon dossier après l’analyse si nécessaire.`,
                          )
                        }
                        if (prefill.framework) {
                          hints.push(
                            `Framework déclaré sur Vercel : ${prefill.framework}. EFLEX le détectera depuis le dépôt lors de l’analyse.`,
                          )
                        }
                        if (prefill.envRows && prefill.envRows.length > 0) {
                          setEnvVars((current) => mergeEnvRows(current, prefill.envRows!))
                        }
                        setImportHints(hints)
                      }}
                    />
                  </div>
                </details>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Input
                      id="repo"
                      label="Adresse du dépôt GitHub"
                      placeholder="https://github.com/votre-compte/votre-depot"
                      hint="Dépôts publics, ou privés après connexion de l’application GitHub."
                      inputMode="url"
                      autoComplete="off"
                      spellCheck={false}
                      value={repoUrl}
                      onChange={(e) => {
                        setRepoUrl(e.target.value)
                        setUsePat(false)
                        setInstallationId('')
                        resetAnalysis()
                      }}
                      required
                    />
                  </div>
                  <Input
                    id="branch"
                    label="Branche (facultatif)"
                    placeholder="Branche par défaut du dépôt"
                    autoComplete="off"
                    spellCheck={false}
                    value={branch}
                    onChange={(e) => {
                      setBranch(e.target.value)
                      resetAnalysis()
                    }}
                  />
                </div>

                {importHints.length > 0 && (
                  <div role="status" className="rounded-lg border border-border bg-background p-3 text-sm">
                    <p className="font-medium">À vérifier avant l&apos;analyse</p>
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                      {importHints.map((hint) => (
                        <li key={hint}>{hint}</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Les variables d&apos;environnement importées depuis Vercel sont pré-remplies ci-dessous : vérifiez-les
                      avant de déployer. Les valeurs sensibles ou non relisibles doivent être ressaisies.
                    </p>
                  </div>
                )}

                {analyzeError && (
                  <div
                    role="alert"
                    className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive"
                  >
                    {analyzeError}
                  </div>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Button type="submit" size="lg" loading={analyzing} disabled={repoUrl.trim() === ''}>
                    {!analyzing && <Search className="h-4 w-4" aria-hidden="true" />}
                    {analyzing ? 'Analyse en cours…' : analysis ? "Relancer l'analyse" : 'Analyser le dépôt'}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    L’analyse détecte la stack et prépare la configuration proposée.
                  </p>
                </div>
              </CardContent>
            </Card>
          </form>

          {/* Annonce le résultat de l'analyse aux lecteurs d'écran, sans dupliquer le contenu visible. */}
          <p role="status" aria-live="polite" className="sr-only">
            {analyzing ? 'Analyse du dépôt en cours.' : analysis ? 'Analyse terminée. Le résultat est affiché ci-dessous.' : ''}
          </p>

          {/* Résultat d'analyse */}
          {analysis && (
            <div className="space-y-6">
              <Card className={selectedPlan ? 'border-primary/20' : undefined}>
                <CardHeader className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-primary">Résultat de l’analyse</p>
                  <h2
                    ref={!selectedPlan && applications.length <= 1 && appOptions.length === 0 ? resultHeading : undefined}
                    tabIndex={-1}
                    className="font-semibold focus:outline-none"
                  >
                    Détection
                  </h2>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {analysis.repo.owner}/{analysis.repo.repo}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <GitBranch className="h-4 w-4" aria-hidden="true" />
                      {analysis.repo.branch}
                    </span>
                    <span className="font-mono">{analysis.repo.commitSha.slice(0, 7)}</span>
                  </p>
                </CardHeader>
                {(applications.length <= 1 && appOptions.length > 0) ||
                (detection && !selectedPlan && appOptions.length === 0) ? (
                  <CardContent className="space-y-4">
                    {applications.length <= 1 && appOptions.length > 0 && (
                      <div className="space-y-3">
                        <div>
                          <h3
                            ref={!selectedPlan ? resultHeading : undefined}
                            tabIndex={-1}
                            className="font-semibold focus:outline-none"
                          >
                            Quelle application déployer ?
                          </h3>
                          <p className="text-sm text-muted-foreground">
                            Ce dépôt en contient plusieurs. EFLEX en déploie une à la fois.
                          </p>
                        </div>
                        <fieldset disabled={analyzing} className="grid gap-2 sm:grid-cols-2">
                          <legend className="sr-only">Application à déployer</legend>
                          {appOptions.map((option) => (
                            <label
                              key={option}
                              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                            >
                              <input
                                type="radio"
                                name="app"
                                value={option}
                                checked={root === option}
                                onChange={() => void analyze(option)}
                                className="accent-primary"
                              />
                              <span className="font-mono">{option}</span>
                            </label>
                          ))}
                        </fieldset>
                      </div>
                    )}

                    {detection && !selectedPlan && appOptions.length === 0 && (
                      <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
                        <h3
                          ref={resultHeading}
                          tabIndex={-1}
                          className="flex items-center gap-2 font-semibold focus:outline-none"
                        >
                          <TriangleAlert className="h-5 w-5 text-warning" aria-hidden="true" />
                          Stack non reconnue
                        </h3>
                        <ul className="space-y-1 text-sm text-muted-foreground">
                          {[...detection.reasons, ...detection.warnings].map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                        <p className="text-sm">
                          Ajoutez un <code className="font-mono">Dockerfile</code> ou un fichier{' '}
                          <code className="font-mono">eflex.json</code> à la racine du dépôt, puis relancez l&apos;analyse.
                        </p>
                      </div>
                    )}
                  </CardContent>
                ) : null}
              </Card>

              {applications.length > 1 && (
                <ApplicationPicker
                  apps={applications}
                  selectedRoot={root}
                  analyzing={analyzing}
                  multiApp={multiApp}
                  onSelect={(appRoot) => void analyze(appRoot)}
                  headingRef={selectedPlan ? undefined : resultHeading}
                />
              )}

              {detection && selectedPlan && (
                <>
                  <DetectionCard plan={selectedPlan} detection={detection} headingRef={resultHeading} />
                  <VercelCompatNote report={analysis?.vercelCompat} />

                  {plans.length > 1 && (
                    <details
                      open={chosen !== null}
                      className="rounded-xl border border-border bg-card px-4 py-3"
                    >
                      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                        Ce n&apos;est pas la bonne stack ?
                      </summary>
                      <fieldset className="mt-2 grid gap-2 pb-2">
                        <legend className="sr-only">Stack à utiliser</legend>
                        {plans.map((plan, index) => (
                          <label
                            key={`${plan.framework}-${index}`}
                            className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
                          >
                            <input
                              type="radio"
                              name="framework"
                              checked={selectedPlan.framework === plan.framework}
                              onChange={() => setChosen(index === 0 ? null : plan.framework)}
                              className="accent-primary"
                            />
                            <FrameworkIcon framework={plan.framework} alt="" className="h-5 w-5" />
                            <span className="font-medium">{frameworkLabel(plan.framework)}</span>
                            <span className="text-muted-foreground">
                              {runtimeLabel(plan.runtime)}
                              {index === 0 && ' · proposé par EFLEX'}
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    </details>
                  )}

                  {multiApp && applications.length > 1 && (
                    <details className="rounded-xl border border-border bg-card px-4 py-3">
                      <summary className="min-h-11 cursor-pointer py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                        Applications supplémentaires (avancé)
                      </summary>
                      <div className="mt-3">
                        <ApplicationMultiSelect
                          apps={applications}
                          primaryRoot={root}
                          selected={extraRoots}
                          onToggle={(appRoot, checked) =>
                            setExtraRoots((roots) =>
                              checked ? [...new Set([...roots, appRoot])] : roots.filter((item) => item !== appRoot),
                            )
                          }
                        />
                      </div>
                    </details>
                  )}
                </>
              )}

              {/* Étape 3 — Configuration */}
              {selectedPlan && (
                <form onSubmit={createProject} className="space-y-6">
                  <Card>
                    <CardHeader className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-primary">Étape 3</p>
                      <h2 className="font-semibold">Configuration</h2>
                      <p className="text-sm text-muted-foreground">
                        Vérifiez le nom du projet et ajoutez uniquement les variables nécessaires.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      <Input
                        id="name"
                        label="Nom du projet"
                        hint="Utilisé pour construire l’adresse de votre application."
                        autoComplete="off"
                        maxLength={60}
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value)
                          setNameEdited(true)
                          setSubmitError('')
                        }}
                        required
                      />

                      <div className="space-y-2">
                        <div>
                          <h3 className="text-sm font-medium">Variables d&apos;environnement</h3>
                          <p className="text-sm text-muted-foreground">
                            Optionnel. Elles sont injectées au déploiement et ne sont jamais écrites dans le dépôt.
                          </p>
                        </div>
                        <EnvEditor rows={envVars} onChange={setEnvVars} disabled={submitting} />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Étape 4 — Déployer */}
                  <Card>
                    <CardHeader className="space-y-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-primary">Étape 4</p>
                      <h2 className="font-semibold">Déployer</h2>
                      <p className="text-sm text-muted-foreground">
                        Tout est prêt ? Lancez le déploiement. Vous pourrez suivre l’avancement sur la page du projet.
                      </p>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {submitError && (
                        <div
                          ref={submitErrorRef}
                          tabIndex={-1}
                          role="alert"
                          className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive focus:outline-none"
                        >
                          {submitError}
                        </div>
                      )}
                      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:gap-4">
                        <Button type="submit" size="lg" loading={submitting} disabled={name.trim() === '' || !gitConfigured}>
                          Démarrer le déploiement
                        </Button>
                        <Button variant="ghost" type="button" size="lg" onClick={() => router.push('/dashboard')}>
                          Annuler
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </form>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
