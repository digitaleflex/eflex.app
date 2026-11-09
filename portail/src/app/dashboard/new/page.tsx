'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { GitBranch, Plus, Search, TriangleAlert, X } from 'lucide-react'
import type { BuildPlan } from '@eflex/detector'
import type { RepoAnalysis } from '@/lib/repo-analysis'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { FrameworkIcon } from '@/components/framework-icon'
import { DetectionCard } from '@/components/new-project/detection-card'
import { GitHubPicker } from '@/components/new-project/github-picker'
import { frameworkLabel, runtimeLabel } from '@/lib/frameworks'

interface EnvVar {
  key: string
  value: string
}

const NETWORK_ERROR = 'Impossible de contacter le serveur. Vérifiez votre connexion et réessayez.'

export default function NewProjectPage() {
  const router = useRouter()
  const resultHeading = useRef<HTMLHeadingElement>(null)

  const [repoUrl, setRepoUrl] = useState('')
  const [branch, setBranch] = useState('')
  const [installationId, setInstallationId] = useState('')
  const [name, setName] = useState('')
  const [nameEdited, setNameEdited] = useState(false)
  const [envVars, setEnvVars] = useState<EnvVar[]>([{ key: '', value: '' }])

  const [analysis, setAnalysis] = useState<RepoAnalysis | null>(null)
  const [appOptions, setAppOptions] = useState<string[]>([])
  const [root, setRoot] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  const detection = analysis?.detection ?? null
  const plans: BuildPlan[] = detection?.plan ? [detection.plan, ...detection.alternatives] : []
  const selectedPlan = plans.find((p) => p.framework === chosen) ?? plans[0] ?? null

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
          installationId: installationId || undefined,
          envVars: envVars.filter((v) => v.key.trim() !== ''),
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

  const updateEnvVar = (index: number, field: keyof EnvVar, value: string) =>
    setEnvVars((vars) => vars.map((v, i) => (i === index ? { ...v, [field]: value } : v)))

  return (
    <div className="max-w-3xl space-y-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Nouveau projet</h1>
        <p className="text-muted-foreground">
          Indiquez votre dépôt GitHub : Eflex reconnaît la stack et prépare le déploiement.
        </p>
      </div>

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
              onSelect={(url, defaultBranch, linkedInstallationId) => {
                setRepoUrl(url)
                setBranch(defaultBranch)
                setInstallationId(linkedInstallationId)
                resetAnalysis()
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

      {/* 2. Ce qu'Eflex a compris */}
      <div aria-live="polite" className="space-y-6">
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

        {appOptions.length > 0 && (
          <Card>
            <CardHeader>
              <h2 ref={selectedPlan ? undefined : resultHeading} tabIndex={-1} className="font-semibold focus:outline-none">
                Quelle application déployer ?
              </h2>
              <p className="text-sm text-muted-foreground">
                Ce dépôt en contient plusieurs. Eflex en déploie une à la fois.
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
                        {index === 0 && ' · proposé par Eflex'}
                      </span>
                    </label>
                  ))}
                </fieldset>
              </details>
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
                <CardContent className="space-y-3">
                  {envVars.map((env, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <Input
                        aria-label={`Nom de la variable ${idx + 1}`}
                        placeholder="NOM_DE_LA_VARIABLE"
                        autoComplete="off"
                        spellCheck={false}
                        value={env.key}
                        onChange={(e) => updateEnvVar(idx, 'key', e.target.value)}
                        className="flex-1"
                      />
                      <Input
                        aria-label={`Valeur de la variable ${idx + 1}`}
                        placeholder="valeur"
                        type="password"
                        autoComplete="off"
                        value={env.value}
                        onChange={(e) => updateEnvVar(idx, 'value', e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        type="button"
                        onClick={() => setEnvVars((vars) => vars.filter((_, i) => i !== idx))}
                        disabled={envVars.length === 1}
                        aria-label={`Supprimer la variable ${idx + 1}`}
                        className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  ))}
                  <Button variant="ghost" type="button" size="sm" onClick={() => setEnvVars((vars) => [...vars, { key: '', value: '' }])}>
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Ajouter une variable
                  </Button>
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
    </div>
  )
}
