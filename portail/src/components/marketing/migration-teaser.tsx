import {
  ArrowRight,
  Boxes,
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
    title: 'Import depuis d’autres plateformes',
    text: 'Vercel d’abord, puis Railway, Netlify, Render et d’autres.',
  },
  {
    icon: Database,
    title: 'Vos données, avec méthode',
    text: 'Analyse de votre base et guide d’export et d’import. PostgreSQL d’abord.',
  },
  {
    icon: SearchCheck,
    title: 'Analyse de compatibilité',
    text: 'EFLEX repère votre stack, vos variables et les fonctions propres à la plateforme d’origine.',
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

export function MigrationTeaser({ contactEmail }: { contactEmail: string }) {
  return (
    <section id="migration" aria-labelledby="migration-titre" className="scroll-mt-20 bg-eflexnavy text-white">
      <div className="container space-y-12 py-16 md:py-24">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <h2 id="migration-titre" className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
            Migrez vos projets vers <span className="text-eflexblue">EFLEX</span>, étape par étape
          </h2>
          <p className="text-lead-lg text-white/80 text-pretty">
            <span className="mr-2 inline-block rounded-md border border-eflexsky/50 px-2 py-0.5 align-middle text-xs font-semibold text-eflexsky">
              Bientôt
            </span>
            Importez une application depuis votre plateforme actuelle et retrouvez ses variables, ses domaines et ses
            services.
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[1fr_1.1fr]">
          {/* Maquette du futur parcours : décorative, non disponible. */}
          <figure className="min-w-0">
            <div
              role="img"
              aria-label="Maquette du futur Migration Center : choix de la plateforme source, puis étapes de migration. Fonction non disponible."
              className="overflow-hidden rounded-2xl bg-white/[0.04] ring-1 ring-white/15"
            >
              <div aria-hidden="true" className="space-y-5 p-4 sm:p-5">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <DownloadCloud className="h-4 w-4 text-eflexsky" aria-hidden="true" />
                  Importer un projet
                </div>
                <p className="text-xs text-white/75">Choisissez votre plateforme source.</p>
                <div className="grid grid-cols-3 gap-2">
                  {platforms.map((platform, i) => (
                    <div
                      key={platform.id}
                      className={
                        i === 0
                          ? 'flex flex-col items-center gap-2 rounded-xl bg-primary/25 px-2 py-3 ring-2 ring-primary'
                          : 'flex flex-col items-center gap-2 rounded-xl bg-white/[0.05] px-2 py-3 ring-1 ring-white/10'
                      }
                    >
                      <FrameworkIcon framework={platform.id} alt="" className="h-7 w-7" />
                      <span className="text-xs font-medium">{platform.name}</span>
                    </div>
                  ))}
                  <div className="flex flex-col items-center gap-2 rounded-xl bg-white/[0.05] px-2 py-3 ring-1 ring-white/10">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-white text-eflexnavy">
                      <GitBranch className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <span className="text-xs font-medium">Autre (Git)</span>
                  </div>
                </div>
                <ol className="flex items-center justify-between gap-1 border-t border-white/10 pt-4">
                  {['Connexion', 'Sélection', 'Analyse', 'Configuration', 'Migration'].map((label, i) => (
                    <li key={label} className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center">
                      <span
                        className={
                          i < 2
                            ? 'flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground'
                            : 'flex h-5 w-5 items-center justify-center rounded-full border border-white/30 text-xs text-white/75'
                        }
                      >
                        {i + 1}
                      </span>
                      <span className="truncate text-xs text-white/75">{label}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <figcaption className="mt-3 text-xs text-white/75">
              Maquette du futur Migration Center : cette fonction n’est pas encore disponible.
            </figcaption>
          </figure>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {capabilities.map((item) => (
              <li key={item.title} className="flex gap-3 rounded-2xl bg-white/[0.05] p-4 ring-1 ring-white/10">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/25 ring-1 ring-primary/40">
                  <item.icon className="h-5 w-5 text-white" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base font-semibold">{item.title}</span>
                    <span className="rounded-md border border-eflexsky/50 px-1.5 py-0.5 text-xs font-medium text-eflexsky">
                      Bientôt
                    </span>
                  </span>
                  <span className="mt-1 block text-sm text-white/80">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <ol className="grid grid-cols-1 gap-4 border-t border-white/10 pt-8 sm:grid-cols-2 lg:grid-cols-5">
          {journey.map((step, i) => (
            <li key={step.label} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15">
                <step.icon className="h-5 w-5 text-eflexsky" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium">
                <span className="tabular-nums text-white/75">{i + 1}. </span>
                {step.label}
              </span>
            </li>
          ))}
        </ol>

        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 rounded-2xl bg-white p-6 text-center text-eflexnavy sm:flex-row sm:justify-between sm:text-left">
          <div className="space-y-1">
            <h3 className="text-xl font-bold">Prêt à migrer vos projets ?</h3>
            <p className="text-sm text-slate-700">
              Dites-nous ce que vous voulez migrer : nous vous prévenons au lancement.
            </p>
          </div>
          <a
            href={`mailto:${contactEmail}?subject=Migration%20Center%20%3A%20me%20pr%C3%A9venir%20du%20lancement`}
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            Être prévenu du lancement
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </div>
    </section>
  )
}
