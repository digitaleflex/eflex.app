import type { CSSProperties } from 'react'
import {
  AlertCircle,
  ArrowRight,
  Boxes,
  Check,
  Database,
  DownloadCloud,
  GitBranch,
  Link2,
  Rocket,
  ScanSearch,
  SearchCheck,
  SlidersHorizontal,
  Layers,
  Repeat,
} from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'

/**
 * Annonce du futur « Migration Center » (voir l'issue de pilotage MIG-0, #148).
 *
 * RIEN de cette section n'existe encore : chaque carte porte « Bientôt » et l'aperçu est une
 * maquette, dite comme telle. Les formulations suivent la feuille de route : Vercel d'abord,
 * bases de données en analyse et guide (pas de transfert automatique), bascule guidée (pas de
 * « zéro interruption » promis). Retirer « Bientôt » d'une carte seulement quand la fonction est livrée.
 */

const platforms = [
  { id: 'vercel', name: 'Vercel' },
  { id: 'railway', name: 'Railway' },
  { id: 'netlify', name: 'Netlify' },
  { id: 'render', name: 'Render' },
  { id: 'flyio', name: 'Fly.io' },
] as const

const capabilities = [
  {
    icon: DownloadCloud,
    title: 'Import depuis Vercel, puis d’autres plateformes',
    text: 'Connectez la plateforme source et sélectionnez le projet à migrer, sans repartir de zéro.',
    featured: true,
  },
  {
    icon: SearchCheck,
    title: 'Analyse de compatibilité avant migration',
    text: 'EFLEX repère la stack, les variables, les domaines et les points propres à la plateforme d’origine, pour savoir ce qui sera repris automatiquement.',
    featured: true,
  },
  {
    icon: Database,
    title: 'Vos données, avec méthode',
    text: 'Analyse de votre base et guide d’export et d’import. PostgreSQL d’abord (pas de transfert automatique).',
  },
  {
    icon: SlidersHorizontal,
    title: 'Configuration reprise',
    text: 'Builds, variables et domaines repris quand c’est possible ; le reste est listé clairement.',
  },
  {
    icon: Layers,
    title: 'Migration assistée',
    text: 'Un parcours guidé avec des vérifications à chaque étape.',
  },
  {
    icon: Repeat,
    title: 'Bascule guidée',
    text: 'Testez sur EFLEX, validez, puis changez vos DNS. L’ancien hébergement reste en place jusque-là.',
  },
]

const journey = [
  { icon: Link2, label: 'Connectez votre plateforme' },
  { icon: Boxes, label: 'Sélectionnez vos projets' },
  { icon: ScanSearch, label: 'Analysez la compatibilité' },
  { icon: SlidersHorizontal, label: 'Configurez et testez' },
  { icon: Rocket, label: 'Migrez vers EFLEX' },
]

const launchScope = [
  'Import depuis Vercel (projets web)',
  'Analyse de compatibilité : stack, variables et domaines',
  'Parcours guidé avec aperçu avant migration',
]

const laterScope = [
  'Railway, Netlify, Render, Fly.io et autres plateformes',
  'Bases de données PostgreSQL : analyse et guide d’export/import',
  'Élargissement progressif du parcours de migration',
]

function SoonBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-eflexsky/40 bg-eflexsky/10 px-2.5 py-0.5 text-xs font-semibold text-eflexsky ${className}`}
    >
      Bientôt
    </span>
  )
}

function ScopeList({
  title,
  items,
  tone,
}: {
  title: string
  items: string[]
  tone: 'launch' | 'later'
}) {
  return (
    <div
      className={
        tone === 'launch'
          ? 'rounded-2xl border border-eflexsky/30 bg-eflexsky/10 p-5'
          : 'rounded-2xl border border-white/10 bg-white/[0.03] p-5'
      }
    >
      <h3 className="text-sm font-semibold text-white">{title}</h3>
      <ul className="mt-3 space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-white/80">
            <Check
              className={`mt-0.5 h-4 w-4 shrink-0 ${tone === 'launch' ? 'text-eflexsky' : 'text-white/50'}`}
              aria-hidden="true"
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AnalysisRow({
  label,
  value,
  status,
}: {
  label: string
  value: string
  status: 'ok' | 'warn'
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <span className="text-xs text-white/70">{label}</span>
      <span className="flex items-center gap-2 text-xs font-medium text-white">
        {status === 'ok' ? (
          <Check className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
        )}
        <span className="tabular-nums">{value}</span>
      </span>
    </div>
  )
}

export function MigrationTeaser({ contactEmail }: { contactEmail: string }) {
  return (
    <section
      id="migration"
      aria-labelledby="migration-titre"
      className="surface-navy relative scroll-mt-20 overflow-hidden bg-eflexnavy text-white"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_-20%,hsl(var(--eflex-royalblue)/0.35),transparent)]"
      />
      <div className="container relative space-y-14 py-20 md:space-y-16 md:py-28">
        <div className="mx-auto max-w-3xl space-y-5 text-center">
          <h2
            id="migration-titre"
            className="text-display-sm font-extrabold tracking-tight text-balance text-white md:text-4xl"
          >
            Migrez vos projets vers <span className="text-eflexblue">EFLEX</span>, étape par étape
          </h2>
          <p className="mx-auto max-w-2xl text-lead-lg text-white/75 text-pretty">
            <SoonBadge className="mr-2 align-middle" />
            Importez une application depuis votre plateforme actuelle, voyez ce qui sera repris automatiquement, puis
            migrez dans un parcours guidé.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[1.05fr_1fr]">
          {/* Maquette du futur parcours : décorative, non disponible. */}
          <figure className="reveal-on-view min-w-0 lg:sticky lg:top-28" style={{ '--i': 0 } as CSSProperties}>
            <div
              role="img"
              aria-label="Maquette illustrative du futur Migration Center : sélection de la source, analyse de compatibilité et aperçu d’un résultat d’exemple. Fonction non disponible."
              className="migration-demo overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-1 shadow-2xl shadow-black/30 backdrop-blur-sm"
            >
              <div className="overflow-hidden rounded-[1.35rem] bg-eflexnavy/60 ring-1 ring-white/10">
                <div
                  aria-hidden="true"
                  className="flex items-center gap-2 border-b border-white/10 px-4 py-3 text-white/60"
                >
                  <span className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                    <span className="h-2.5 w-2.5 rounded-full bg-white/20" />
                  </span>
                  <span className="ml-2 flex-1 truncate rounded-md bg-white/5 px-3 py-1 text-center text-xs text-white/50">
                    Migration Center
                  </span>
                  <SoonBadge />
                </div>
                <div aria-hidden="true" className="relative min-h-[23rem] p-5 sm:min-h-[24rem] sm:p-6">
                  {/* État 1 : source */}
                  <div className="mig-state mig-1 space-y-5">
                    <div>
                      <div className="flex items-center gap-2 text-base font-semibold">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/25 ring-1 ring-primary/40">
                          <DownloadCloud className="h-4 w-4 text-eflexsky" />
                        </span>
                        1. Choisir la source
                      </div>
                      <p className="mt-2 text-sm text-white/70">Sélectionnez la plateforme d’origine.</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                      {platforms.map((platform, i) => (
                        <div
                          key={platform.id}
                          className={
                            i === 0
                              ? 'flex flex-col items-center gap-2 rounded-2xl border border-primary/60 bg-primary/20 px-2 py-3.5'
                              : 'flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-2 py-3.5'
                          }
                        >
                          <FrameworkIcon framework={platform.id} alt="" className="h-7 w-7" />
                          <span className="text-xs font-medium text-white/90">{platform.name}</span>
                        </div>
                      ))}
                      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-2 py-3.5">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-eflexnavy">
                          <GitBranch className="h-4 w-4" />
                        </span>
                        <span className="text-xs font-medium text-white/80">Autre (Git)</span>
                      </div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs text-white/70">
                      Projet sélectionné : <span className="font-mono text-white/90">mon-equipe/boutique</span>
                    </div>
                  </div>

                  {/* État 2 : analyse */}
                  <div className="mig-state mig-2 space-y-5">
                    <div>
                      <div className="flex items-center gap-2 text-base font-semibold">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/25 ring-1 ring-primary/40">
                          <ScanSearch className="h-4 w-4 text-eflexsky" />
                        </span>
                        2. Analyse de compatibilité
                      </div>
                      <p className="mt-2 text-sm text-white/70">Inspection de la stack, des variables et des domaines…</p>
                    </div>
                    <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                      <div className="flex items-center gap-3 text-sm text-white/80">
                        <span className="h-2 w-2 rounded-full bg-success" />
                        Stack et commandes détectées
                      </div>
                      <div className="flex items-center gap-3 text-sm text-white/80">
                        <span className="h-2 w-2 rounded-full bg-success" />
                        Variables d’environnement repérées
                      </div>
                      <div className="flex items-center gap-3 text-sm text-white/70">
                        <span className="h-2 w-2 rounded-full bg-eflexsky" />
                        Vérification des domaines et points spécifiques…
                      </div>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                      <div className="mig-progress h-full w-full origin-left rounded-full bg-primary" />
                    </div>
                  </div>

                  {/* État 3 : résultat illustratif */}
                  <div className="mig-state mig-3 space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 text-base font-semibold">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/20 ring-1 ring-success/40">
                            <SearchCheck className="h-4 w-4 text-success" />
                          </span>
                          3. Aperçu de l’analyse
                        </div>
                        <p className="mt-2 text-sm text-white/70">Exemple illustratif pour un projet Next.js.</p>
                      </div>
                      <span className="rounded-md border border-white/20 bg-white/5 px-2 py-1 text-xs font-medium text-white/70">
                        Exemple
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <AnalysisRow label="Stack" value="Next.js" status="ok" />
                      <AnalysisRow label="Variables" value="12 repérées" status="ok" />
                      <AnalysisRow label="Domaines" value="2 repérés" status="ok" />
                      <AnalysisRow label="À vérifier" value="1 point" status="warn" />
                    </div>
                    <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs leading-relaxed text-white/85">
                      <span className="font-semibold text-warning">À vérifier :</span> une fonction propre à la plateforme
                      source devra être adaptée avant la bascule.
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <figcaption className="mt-3 text-center text-xs text-white/60">
              Maquette illustrative du futur Migration Center (exemple fictif) : cette fonction n’est pas encore
              disponible.
            </figcaption>
          </figure>

          <div className="space-y-5">
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {capabilities.map((item, i) => (
                <li
                  key={item.title}
                  className={`reveal-on-view group flex gap-4 rounded-2xl border p-5 transition-[transform,border-color,background-color] duration-300 ease-out-expo hover:-translate-y-0.5 ${
                    item.featured
                      ? 'border-eflexsky/25 bg-white/[0.07] hover:border-eflexsky/40 hover:bg-white/[0.1] sm:col-span-2 xl:col-span-1'
                      : 'border-white/10 bg-white/[0.04] hover:border-white/20 hover:bg-white/[0.07]'
                  }`}
                  style={{ '--i': (i % 3) + 1 } as CSSProperties}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-eflexsky ring-1 ring-inset transition-colors duration-300 ease-out-expo ${
                      item.featured
                        ? 'bg-primary/30 ring-primary/40 group-hover:bg-primary/40'
                        : 'bg-primary/20 ring-primary/30 group-hover:bg-primary/30'
                    }`}
                  >
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                      <span className="text-base font-semibold leading-snug text-white">{item.title}</span>
                      <SoonBadge />
                    </span>
                    <span className="mt-1.5 block text-sm leading-relaxed text-white/75">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
              <h3 className="text-base font-semibold text-white">Périmètre prévu</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <ScopeList title="Au lancement" items={launchScope} tone="launch" />
                <ScopeList title="Ensuite" items={laterScope} tone="later" />
              </div>
              <p className="mt-4 text-xs leading-relaxed text-white/60">
                Le transfert automatique des bases de données n’est pas prévu au lancement : EFLEX proposera d’abord une
                analyse et un guide.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
          <h3 className="text-center text-sm font-semibold uppercase tracking-wider text-white/60">Parcours prévu</h3>
          <ol className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-4">
            {journey.map((step, i) => (
              <li key={step.label} className="relative flex items-start gap-3 lg:flex-col lg:items-center lg:text-center">
                {i < journey.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="absolute left-[1.375rem] top-11 hidden h-[calc(100%-0.5rem)] w-px bg-white/15 sm:block lg:left-[calc(50%+1.75rem)] lg:top-[1.375rem] lg:h-px lg:w-[calc(100%-1rem)]"
                  />
                )}
                <span className="relative z-10 flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-eflexnavy text-eflexsky shadow-sm">
                  <step.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="pt-1 text-sm font-medium text-white/90 lg:pt-0">
                  <span className="tabular-nums text-white/50">0{i + 1}</span>
                  <span className="mt-0.5 block leading-snug">{step.label}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mx-auto flex max-w-4xl flex-col items-center gap-5 rounded-3xl bg-white p-6 text-center text-eflexnavy shadow-lg sm:flex-row sm:justify-between sm:p-8 sm:text-left">
          <div className="space-y-1.5">
            <h3 className="text-xl font-bold tracking-tight">Prêt à migrer vos projets ?</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Dites-nous ce que vous voulez migrer : nous vous prévenons par e-mail le jour du lancement.
            </p>
          </div>
          <a
            href={`mailto:${contactEmail}?subject=Migration%20Center%20%3A%20me%20pr%C3%A9venir%20du%20lancement`}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground shadow-primary transition-[background-color,transform,box-shadow] duration-200 ease-out-expo hover:bg-primary/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            Être prévenu du lancement
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}
