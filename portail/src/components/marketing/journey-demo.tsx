'use client'

import { useCallback, useEffect, useState } from 'react'
import { ArrowDown, ArrowRight, Check, FileCode2, Folder, Globe, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { LAST_STEP, nextStep, resultVisible, SEQUENCE_INTERVAL_MS, stepStatus, STEP_IDS, type StepId } from '@/lib/journey-demo'

const STEPS: Array<{ id: StepId; label: string; summary: string }> = [
  { id: 'analyse', label: 'Analyse du projet', summary: 'Structure, technologies détectées, configuration' },
  { id: 'build', label: 'Préparation du build', summary: 'Plan de construction et méthode retenue' },
  { id: 'orchestration', label: 'Orchestration', summary: 'Traitement de la tâche, étapes et statuts' },
  { id: 'production', label: 'Production', summary: 'Environnement, domaine, état et suivi' },
]

const FILES: Array<{ name: string; folder?: boolean }> = [
  { name: 'src/', folder: true },
  { name: 'public/', folder: true },
  { name: 'package.json' },
  { name: 'pnpm-lock.yaml' },
]

function Connector({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center text-muted-foreground lg:self-center', className)} aria-hidden="true">
      <ArrowDown className="h-5 w-5 lg:hidden" />
      <ArrowRight className="hidden h-5 w-5 lg:block" />
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[9rem_1fr] sm:gap-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{children}</dd>
    </div>
  )
}

function StepDetail({ id }: { id: StepId }) {
  if (id === 'analyse') {
    return (
      <div className="space-y-3">
        <dl className="space-y-3">
          <Row label="Structure">Application Node.js avec un fichier de dépendances verrouillé.</Row>
          <Row label="Technologies">Next.js · pnpm · port 3000</Row>
          <Row label="Configuration">Commande de build et de démarrage trouvées dans <code className="font-mono text-xs">package.json</code>.</Row>
          <Row label="À vérifier">
            <span className="inline-flex items-start gap-2 rounded-md bg-warning/10 px-2.5 py-1.5 text-warning">
              Variable <code className="font-mono text-xs">DATABASE_URL</code> non définie : à ajouter avant le déploiement.
            </span>
          </Row>
        </dl>
        <p className="text-xs text-muted-foreground">La détection n’est pas une certification du projet et ne garantit pas la réussite du déploiement.</p>
      </div>
    )
  }
  if (id === 'build') {
    return (
      <div className="space-y-3">
        <dl className="space-y-3">
          <Row label="Méthode">Construction automatique (Nixpacks), sans Dockerfile à écrire.</Row>
          <Row label="Installation"><code className="font-mono text-xs">pnpm install --frozen-lockfile</code></Row>
          <Row label="Build"><code className="font-mono text-xs">pnpm build</code></Row>
          <Row label="Démarrage"><code className="font-mono text-xs">pnpm start</code></Row>
        </dl>
        <p className="text-xs text-muted-foreground">C’est un plan : il décrit comment construire, pas encore une construction réalisée.</p>
      </div>
    )
  }
  if (id === 'orchestration') {
    return (
      <div className="space-y-3">
        <ul className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" aria-hidden="true" />Tâche créée et mise en file</li>
          <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" aria-hidden="true" />Dépôt récupéré au commit <code className="font-mono text-xs">a1b2c3d</code></li>
          <li className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />Build en cours</li>
        </ul>
        <pre className="overflow-x-auto rounded-lg bg-eflexnavy p-3 font-mono text-xs leading-relaxed text-white" aria-label="Extrait de journal illustratif"><code>{`[build] pnpm install --frozen-lockfile
[build] pnpm build
[build] compilation en cours…`}</code></pre>
      </div>
    )
  }
  return (
    <dl className="space-y-3">
      <Row label="Environnement">Production</Row>
      <Row label="Domaine"><code className="font-mono text-xs">mon-application.example</code> (exemple)</Row>
      <Row label="État"><span className="inline-flex items-center gap-1.5 font-medium text-success"><Check className="h-4 w-4" aria-hidden="true" />En ligne</span></Row>
      <Row label="Suivi">Statut et journaux du déploiement dans la console.</Row>
    </dl>
  )
}

function ResultPanel({ visible }: { visible: boolean }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Résultat en production</p>
      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-2 w-2 rounded-full bg-border" /><span className="h-2 w-2 rounded-full bg-border" /><span className="h-2 w-2 rounded-full bg-border" />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
            <Globe className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate font-mono">mon-application.example</span>
          </span>
        </div>
        <div className="space-y-3 p-4" aria-live="off">
          {visible ? (
            <>
              <p className="text-base font-semibold text-foreground">Mon application</p>
              <p className="text-sm text-muted-foreground">Votre application répond à son adresse.</p>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success"><Check className="h-3.5 w-3.5" aria-hidden="true" />En ligne</span>
            </>
          ) : (
            <>
              <div className="h-4 w-2/3 rounded-md bg-muted" aria-hidden="true" />
              <div className="h-3 w-full rounded-md bg-muted" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Pas encore en ligne : l’application apparaît ici une fois le déploiement terminé.</p>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Données et état illustratifs : aucun déploiement réel n’est effectué.</p>
    </div>
  )
}

export function JourneyDemo() {
  const [active, setActive] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [reduceMotion, setReduceMotion] = useState(true)

  // Séquence illustrative : une seule passe, jamais en boucle, jamais pour qui réduit les animations.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setReduceMotion(reduced)
    if (!reduced) setPlaying(true)
  }, [])

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      const next = nextStep(active)
      if (next === null) setPlaying(false)
      else setActive(next)
    }, SEQUENCE_INTERVAL_MS)
    return () => window.clearTimeout(timer)
  }, [playing, active])

  const select = useCallback((index: number) => {
    setPlaying(false)
    setActive(index)
  }, [])

  const replay = useCallback(() => {
    setActive(0)
    setPlaying(true)
  }, [])

  const current = STEPS[active]!

  return (
    <div className="mt-12 md:mt-14">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,0.8fr)_auto_minmax(0,1.6fr)_auto_minmax(0,0.9fr)] lg:items-start lg:gap-3">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Votre code</p>
          <p className="font-mono text-sm font-medium text-foreground">mon-application</p>
          <ul className="space-y-1.5 text-sm text-muted-foreground" aria-label="Contenu du dépôt d’exemple">
            {FILES.map((file) => (
              <li key={file.name} className="flex items-center gap-2">
                {file.folder ? <Folder className="h-4 w-4 shrink-0" aria-hidden="true" /> : <FileCode2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span className="truncate font-mono text-xs">{file.name}</span>
              </li>
            ))}
          </ul>
        </div>

        <Connector />

        <div className="flex flex-col gap-4 rounded-2xl border-2 border-primary/40 bg-card p-5 shadow-md">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Centre de coordination EFLEX</p>
            {!reduceMotion && (active === LAST_STEP || !playing) && (
              <button
                type="button"
                onClick={replay}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Rejouer
              </button>
            )}
          </div>

          <ol className="grid gap-2 sm:grid-cols-2">
            {STEPS.map((step, index) => {
              const status = stepStatus(index, active)
              return (
                <li key={step.id}>
                  <button
                    type="button"
                    aria-pressed={status === 'current'}
                    onClick={() => select(index)}
                    className={cn(
                      'flex min-h-11 w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      status === 'current' ? 'border-primary/40 bg-primary/5' : 'border-border bg-background hover:border-primary/30',
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                        status === 'done' && 'bg-success/15 text-success',
                        status === 'current' && 'bg-primary text-primary-foreground',
                        status === 'waiting' && 'bg-muted text-muted-foreground',
                      )}
                    >
                      {status === 'done' ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-foreground">{step.label}</span>
                      <span className="block text-xs text-muted-foreground">{step.summary}</span>
                      <span className="sr-only">
                        {status === 'done' ? ' (terminée)' : status === 'current' ? ' (étape affichée)' : ' (à venir)'}
                      </span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>

          <div className="rounded-xl border border-border bg-background p-4">
            <h3 className="mb-3 text-base font-semibold tracking-tight text-foreground">
              Étape {active + 1} sur {STEP_IDS.length} : {current.label}
            </h3>
            <StepDetail id={current.id} />
          </div>
        </div>

        <Connector />

        <ResultPanel visible={resultVisible(active)} />
      </div>

      <p className="mx-auto mt-6 max-w-3xl text-center text-sm text-muted-foreground text-pretty">
        Démonstration illustrative : le dépôt, le domaine et l’état affichés sont fictifs. Elle ne représente pas un déploiement réel.
      </p>
    </div>
  )
}
