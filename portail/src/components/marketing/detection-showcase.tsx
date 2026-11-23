'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  FileCode2,
  FolderTree,
  MessageSquareMore,
  Search,
  ShieldCheck,
} from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'

type TabId = 'structure' | 'detection' | 'buildplan' | 'diagnostics'

type Tab = {
  id: TabId
  label: string
  icon: typeof FolderTree
}

const TABS: Tab[] = [
  { id: 'structure', label: 'Structure', icon: FolderTree },
  { id: 'detection', label: 'Détection', icon: Search },
  { id: 'buildplan', label: 'BuildPlan', icon: FileCode2 },
  { id: 'diagnostics', label: 'Diagnostics', icon: MessageSquareMore },
]

const REPO_FILES = [
  'mon-equipe/boutique/',
  '├── app/',
  '│   ├── layout.tsx',
  '│   └── page.tsx',
  '├── public/',
  '├── next.config.ts',
  '├── package.json',
  '├── pnpm-lock.yaml',
  '└── tsconfig.json',
]

const DETECTION_ITEMS = [
  { label: 'Framework', value: 'Next.js', detail: 'Détecté depuis package.json et next.config.ts' },
  { label: 'Runtime', value: 'Node.js 22', detail: 'Compatible avec l’application détectée' },
  { label: 'Gestionnaire', value: 'pnpm', detail: 'Détecté depuis pnpm-lock.yaml' },
  { label: 'Port', value: '3000', detail: 'Port applicatif par défaut pour ce profil', mono: true },
]

const BUILDPLAN_LINES = [
  '{',
  '  "version": 1,',
  '  "framework": "nextjs",',
  '  "runtime": "node@22",',
  '  "packageManager": "pnpm",',
  '  "install": "pnpm install --frozen-lockfile",',
  '  "build": "pnpm build",',
  '  "start": "pnpm start",',
  '  "port": 3000',
  '}',
]

const REASONS = [
  'Fichier next.config.ts détecté à la racine du projet.',
  'Dépendance next présente dans package.json.',
  'Verrou pnpm-lock.yaml détecté : commandes pnpm sélectionnées.',
]

const WARNINGS = [
  'Aucune variable d’environnement n’a été déclarée dans cet exemple ; ajoutez celles dont l’application a besoin avant le déploiement.',
]

const QUESTIONS = [
  {
    prompt: 'La commande de démarrage doit-elle utiliser le mode standalone Next.js ?',
    defaultAnswer: 'Non, utiliser la commande de démarrage standard (par défaut).',
  },
]

const ALTERNATIVES = [
  {
    title: 'Alternative : Node.js générique',
    detail: 'Moins précis si les conventions Next.js ne sont pas retenues.',
  },
]

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-foreground">Confiance de détection</span>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">{pct}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Score illustratif calculé à partir des signaux détectés dans le dépôt fictif.
      </p>
    </div>
  )
}

export function DetectionShowcase() {
  const [active, setActive] = useState<TabId>('structure')
  const baseId = useId()

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const nextIndex =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? TABS.length - 1
          : event.key === 'ArrowRight'
            ? (index + 1) % TABS.length
            : (index - 1 + TABS.length) % TABS.length
    const next = TABS[nextIndex]
    if (!next) return
    setActive(next.id)
    document.getElementById(`${baseId}-tab-${next.id}`)?.focus()
  }

  return (
    <section aria-labelledby={`${baseId}-title`} className="scroll-mt-20 py-16 md:py-24">
      <div className="container">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <h2 id={`${baseId}-title`} className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
            Comprendre ce qu’EFLEX détecte avant de déployer.
          </h2>
          <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
            EFLEX analyse la structure du dépôt, propose un BuildPlan et signale les points à vérifier. L’analyse est en lecture seule.
          </p>
        </div>

        <div className="mx-auto mt-12 max-w-6xl overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Analyse en lecture seule
              </span>
              <span className="text-sm text-muted-foreground">Exemple fictif basé sur un dépôt Next.js</span>
            </div>
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-success" aria-hidden="true" />
              Aucune modification du dépôt
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
            <div className="border-b border-border p-4 sm:p-5 lg:border-b-0 lg:border-r">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Vue d’intelligence</p>
              <div role="tablist" aria-label="Sections de l’analyse EFLEX" className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {TABS.map((tab, index) => {
                  const Icon = tab.icon
                  const selected = active === tab.id
                  return (
                    <button
                      key={tab.id}
                      id={`${baseId}-tab-${tab.id}`}
                      role="tab"
                      type="button"
                      aria-selected={selected}
                      aria-controls={`${baseId}-panel-${tab.id}`}
                      tabIndex={selected ? 0 : -1}
                      onClick={() => setActive(tab.id)}
                      onKeyDown={(event) => onTabKeyDown(event, index)}
                      className={`flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-[background-color,border-color,color] duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected
                          ? 'border-primary/25 bg-primary/5 text-primary'
                          : 'border-border bg-background text-foreground hover:bg-muted/50'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{tab.label}</span>
                    </button>
                  )
                })}
              </div>

              <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Dépôt fictif</p>
                <div className="mt-3 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-background">
                    <FrameworkIcon framework="nextjs" alt="" className="h-6 w-6" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-sm text-foreground">mon-equipe/boutique</p>
                    <p className="text-xs text-muted-foreground">Branche main</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 sm:p-6">
              {TABS.map((tab) => {
                const activePanel = active === tab.id
                return (
                  <div
                    key={tab.id}
                    id={`${baseId}-panel-${tab.id}`}
                    role="tabpanel"
                    aria-labelledby={`${baseId}-tab-${tab.id}`}
                    hidden={!activePanel}
                    className="min-h-[320px]"
                  >
                    {tab.id === 'structure' ? (
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="rounded-2xl border border-border bg-background p-4">
                          <p className="text-sm font-semibold text-foreground">Arborescence observée</p>
                          <pre className="mt-3 overflow-x-auto rounded-xl bg-muted/40 p-4 font-mono text-xs leading-relaxed text-foreground sm:text-sm">
                            <code>{REPO_FILES.join('\n')}</code>
                          </pre>
                        </div>
                        <div className="rounded-2xl border border-border bg-background p-4">
                          <p className="text-sm font-semibold text-foreground">Ce que l’analyse lit</p>
                          <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                            <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /><span>Fichiers et manifestes utiles à la détection.</span></li>
                            <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /><span>Commandes, runtime et port déductibles du projet.</span></li>
                            <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" /><span>Signaux d’ambiguïté pour générer des avertissements ou questions.</span></li>
                          </ul>
                          <div className="mt-4 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-foreground">
                            <p className="font-medium">Lecture seule</p>
                            <p className="mt-1 text-muted-foreground">EFLEX n’écrit pas dans le dépôt pendant cette analyse.</p>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {tab.id === 'detection' ? (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {DETECTION_ITEMS.map((item) => (
                          <div key={item.label} className="rounded-2xl border border-border bg-background p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{item.label}</p>
                            <p className={`mt-2 text-lg font-semibold text-foreground ${item.mono ? 'font-mono tabular-nums' : ''}`}>{item.value}</p>
                            <p className="mt-2 text-sm text-muted-foreground">{item.detail}</p>
                          </div>
                        ))}
                        <div className="rounded-2xl border border-border bg-muted/30 p-4 sm:col-span-2">
                          <p className="text-sm font-semibold text-foreground">Résumé</p>
                          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            L’analyse identifie un projet Next.js utilisant Node.js 22, pnpm et un port applicatif 3000. Ces valeurs sont présentées comme un plan proposé, à valider avant déploiement.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    {tab.id === 'buildplan' ? (
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
                        <div className="rounded-2xl border border-border bg-terminal p-4 text-terminal-foreground">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold">Extrait de BuildPlan</p>
                            <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-terminal-foreground/80">Exemple fictif</span>
                          </div>
                          <pre className="mt-3 overflow-x-auto font-mono text-xs leading-relaxed sm:text-sm">
                            <code>{BUILDPLAN_LINES.join('\n')}</code>
                          </pre>
                        </div>
                        <div className="rounded-2xl border border-border bg-background p-4">
                          <p className="text-sm font-semibold text-foreground">Rôle du BuildPlan</p>
                          <ul className="mt-3 space-y-3 text-sm text-muted-foreground">
                            <li className="flex gap-3"><FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Décrit les commandes de build, le runtime et le port détectés.</span></li>
                            <li className="flex gap-3"><FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Sert de base au déploiement lorsque la configuration est validée.</span></li>
                            <li className="flex gap-3"><FileCode2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" /><span>Peut être accompagné d’avertissements, questions ou alternatives.</span></li>
                          </ul>
                        </div>
                      </div>
                    ) : null}

                    {tab.id === 'diagnostics' ? (
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                        <div className="rounded-2xl border border-border bg-background p-4">
                          <ConfidenceBar value={0.94} />
                          <div className="mt-5">
                            <p className="text-sm font-semibold text-foreground">Raisons</p>
                            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                              {REASONS.map((reason) => (
                                <li key={reason} className="flex gap-3">
                                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                                  <span>{reason}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <div className="rounded-2xl border border-warning/30 bg-warning-surface p-4">
                            <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                              <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
                              Avertissements
                            </p>
                            <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                              {WARNINGS.map((warning) => (
                                <li key={warning}>{warning}</li>
                              ))}
                            </ul>
                          </div>
                          <div className="rounded-2xl border border-border bg-background p-4">
                            <p className="text-sm font-semibold text-foreground">Question</p>
                            {QUESTIONS.map((question) => (
                              <div key={question.prompt} className="mt-2 text-sm text-muted-foreground">
                                <p>{question.prompt}</p>
                                <p className="mt-2 rounded-lg bg-muted/40 px-3 py-2 text-foreground">
                                  <span className="font-medium">Réponse par défaut : </span>
                                  {question.defaultAnswer}
                                </p>
                              </div>
                            ))}
                          </div>
                          <div className="rounded-2xl border border-border bg-background p-4">
                            <p className="text-sm font-semibold text-foreground">Alternative</p>
                            {ALTERNATIVES.map((alt) => (
                              <div key={alt.title} className="mt-2 text-sm text-muted-foreground">
                                <p className="font-medium text-foreground">{alt.title}</p>
                                <p className="mt-1">{alt.detail}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
