'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Box, GitBranch, Search, TriangleAlert } from 'lucide-react'
import type { BuildPlan } from '@eflex/detector'
import type { RepoAnalysis } from '@/lib/repo-analysis'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FrameworkIcon } from '@/components/framework-icon'
import { DetectionCard } from '@/components/new-project/detection-card'
import { ApplicationPicker } from '@/components/new-project/application-picker'
import { ApplicationMultiSelect } from '@/components/new-project/application-multi-select'
import { GitHubPicker } from '@/components/new-project/github-picker'
import { VercelImport } from '@/components/new-project/vercel-import'
import { EnvEditor } from '@/components/env/env-editor'
import { mergeEnvRows, rowsToVars } from '@/lib/env-parse'
import { frameworkLabel, runtimeLabel } from '@/lib/frameworks'
import { DOCKER_IMAGE_REF_HINT, PRIVATE_REGISTRY_LIMITATION, UNSUPPORTED_SOURCES_NOTE } from '@/lib/docker-image-ref'

interface EnvVar {
  key: string
  value: string
}

const NETWORK_ERROR = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

export default function NewProjectPage() {
  const router = useRouter()
  const resultHeading = useRef<HTMLHeadingElement>(null)

  const [sourceMode, setSourceMode] = useState<'git' | 'image'>('git')
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

  const resetAnalysis = () => {
    setAnalysis(null)
    setAppOptions([])
    setRoot('')
    setChosen(null)
    setAnalyzeError('')
    setSubmitError('')
    setImportHints([])
  }

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
    <div className="max-w-3xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nouveau projet</h1>
        <p className="text-muted-foreground">
          Déployez depuis un dépôt GitHub (détection automatique) ou depuis une image Docker.
        </p>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">Source du déploiement</h2>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => { setSourceMode('git'); setSubmitError('') }}
              className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sourceMode === 'git' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
              aria-pressed={sourceMode === 'git'}
            >
              <GitBranch className="h-4 w-4" aria-hidden="true" />
              <span>
                <span className="block font-medium">Dépôt GitHub</span>
                <span className="block text-muted-foreground">Analyse du dépôt, build et déploiement automatiques</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setSourceMode('image'); setSubmitError(''); resetAnalysis() }}
              className={`flex min-h-11 items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sourceMode === 'image' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50'}`}
              aria-pressed={sourceMode === 'image'}
            >
              <Box className="h-4 w-4" aria-hidden="true" />
              <span>
                <span className="block font-medium">Image Docker</span>
                <span className="block text-muted-foreground">Déployer une image de registre (tag ou digest)</span>
              </span>
            </button>
          </div>
          <p className="text-xs text-muted-foreground">{UNSUPPORTED_SOURCES_NOTE}</p>
        </CardContent>
      </Card>

      {sourceMode === 'image' ? (
        <form onSubmit={createImageProject} className="space-y-6">
          <Card>
            <CardHeader>
              <h2 className="font-semibold">Image à déployer</h2>
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
                onChange={(e) => { setImageRef(e.target.value); if (!nameEdited) { const guess = e.target.value.split('/').pop()?.split(':')[0]?.split('@')[0]; if (guess) setName(guess); } }}
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
                  onChange={(e) => setImagePort(e.target.value)}
                  hint="Port HTTP écouté par le conteneur (80 par défaut)."
                  required
                />
                <Input
                  id="image-name"
                  label="Nom du projet"
                  hint="Il sert à construire l'adresse de votre application."
                  value={name}
                  onChange={(e) => { setName(e.target.value); setNameEdited(true) }}
                  required
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="font-semibold">Variables d&apos;environnement</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Injectées au conteneur au déploiement. Elles ne sont jamais écrites dans un dépôt.
              </p>
            </CardHeader>
            <CardContent>
              <EnvEditor rows={envVars} onChange={setEnvVars} disabled={submitting} />
            </CardContent>
          </Card>

          {submitError && (
            <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
              {submitError}
            </div>
          )}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:gap-4">
            <Button type="submit" size="lg" loading={submitting} disabled={name.trim() === '' || imageRef.trim() === ''}>
              Démarrer le déploiement
            </Button>
            <Button variant="ghost" type="button" size="lg" onClick={() => router.push('/dashboard')}>
              Annuler
            </Button>
          </div>
        </form>
      ) : (
      <>
      {/* 1. Le dépôt */}
      <form
        onSubmit={(e) => {
          e.preventDefault()
          void analyze()
        }}
      >
        <Card>
          <CardHeader>
            <h2 className="font-semibold">1. Votre dépôt</h2>
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
                    `Dossier racine indiqué sur Vercel : « ${prefill.root} ». Vérifiez et sélectionnez le bon dossier après l'analyse si nécessaire.`,
                  )
                }
                if (prefill.framework) {
                  hints.push(
                    `Framework déclaré sur Vercel : ${prefill.framework}. EFLEX le détectera depuis le dépôt lors de l'analyse.`,
                  )
                }
                if (prefill.envRows && prefill.envRows.length > 0) {
                  setEnvVars((current) => mergeEnvRows(current, prefill.envRows!))
                }
                setImportHints(hints)
              }}
            />
            <Input
              id="repo"
              label="Adresse du dépôt GitHub"
              placeholder="https://github.com/votre-compte/votre-depot"
              hint="Dépôts publics, ou privés après connexion de l'application GitHub."
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
            {importHints.length > 0 && (
              <div role="status" className="rounded-lg border border-border bg-background p-3 text-sm">
                <p className="font-medium">À vérifier avant l&apos;import</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-muted-foreground">
                  {importHints.map((hint) => (
                    <li key={hint}>{hint}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-muted-foreground">
                  Les variables d&apos;environnement peuvent être préparées depuis Vercel (lecture à usage unique) : les valeurs
                  réellement lisibles sont proposées masquées et modifiables, les valeurs sensibles ou non relisibles doivent être
                  ressaisies. Aucune valeur n&apos;est devinée.
                </p>
              </div>
            )}
            {analyzeError && (
              <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                {analyzeError}
              </div>
            )}
            <Button type="submit" size="lg" loading={analyzing} disabled={repoUrl.trim() === ''}>
              {!analyzing && <Search className="h-4 w-4" aria-hidden="true" />}
              {analyzing ? 'Analyse en cours…' : analysis ? "Relancer l'analyse" : 'Analyser le dépôt'}
            </Button>
          </CardContent>
        </Card>
      </form>

      {/* Annonce le résultat de l'analyse aux lecteurs d'écran, sans dupliquer le contenu visible. */}
      <p role="status" aria-live="polite" className="sr-only">
        {analyzing
          ? 'Analyse du dépôt en cours.'
          : analysis
            ? 'Analyse terminée. Le résultat est affiché ci-dessous.'
            : ''}
      </p>

      {/* 2. Ce qu'EFLEX a compris (le statut ci-dessus annonce le résultat ; pas de double annonce). */}
      <div className="space-y-6">
        {analysis && (
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
        )}

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

        {applications.length <= 1 && appOptions.length > 0 && (
          <Card>
            <CardHeader>
              <h2 ref={selectedPlan ? undefined : resultHeading} tabIndex={-1} className="font-semibold focus:outline-none">
                Quelle application déployer ?
              </h2>
              <p className="text-sm text-muted-foreground">
                Ce dépôt en contient plusieurs. EFLEX en déploie une à la fois.
              </p>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        )}

        {detection && !selectedPlan && appOptions.length === 0 && (
          <Card>
            <CardContent className="space-y-3 p-6">
              <h2 ref={resultHeading} tabIndex={-1} className="flex items-center gap-2 font-semibold focus:outline-none">
                <TriangleAlert className="h-5 w-5 text-warning" aria-hidden="true" />
                Stack non reconnue
              </h2>
              <ul className="space-y-1 text-sm text-muted-foreground">
                {[...detection.reasons, ...detection.warnings].map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
              <p className="text-sm">
                Ajoutez un <code className="font-mono">Dockerfile</code> ou un fichier{' '}
                <code className="font-mono">eflex.json</code> à la racine du dépôt, puis relancez l&apos;analyse.
              </p>
            </CardContent>
          </Card>
        )}

        {detection && selectedPlan && (
          <>
            <DetectionCard plan={selectedPlan} detection={detection} headingRef={resultHeading} />

            {plans.length > 1 && (
              <details open={chosen !== null} className="rounded-xl border border-border bg-card px-4 py-3">
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
            )}

            {/* 3. Création */}
            <form onSubmit={createProject} className="space-y-8">
              <Card>
                <CardHeader>
                  <h2 className="font-semibold">2. Votre projet</h2>
                </CardHeader>
                <CardContent>
                  <Input
                    id="name"
                    label="Nom du projet"
                    hint="Il sert à construire l'adresse de votre application."
                    autoComplete="off"
                    maxLength={60}
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value)
                      setNameEdited(true)
                    }}
                    required
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-semibold">Variables d&apos;environnement</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Injectées au moment du déploiement. Elles ne sont jamais écrites dans votre dépôt.
                  </p>
                </CardHeader>
                <CardContent>
                  <EnvEditor rows={envVars} onChange={setEnvVars} disabled={submitting} />
                </CardContent>
              </Card>

              {submitError && (
                <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                  {submitError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:gap-4">
                <Button type="submit" size="lg" loading={submitting} disabled={name.trim() === ''}>
                  Démarrer le déploiement
                </Button>
                <Button variant="ghost" type="button" size="lg" onClick={() => router.push('/dashboard')}>
                  Annuler
                </Button>
              </div>
            </form>
          </>
        )}
          </div>
          </>
        )}
      </div>
  )
}
