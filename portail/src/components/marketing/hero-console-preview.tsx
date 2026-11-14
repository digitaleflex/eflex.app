import { Activity, FolderKanban, Gauge, ScanSearch, Settings, Users, Check } from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'
import { GithubMark } from '@/components/icons/github-mark'

/**
 * Aperçu illustratif de la console EFLEX pour la hero de l'accueil.
 *
 * Règles (identiques à l'ancienne démonstration) : rien n'est exécuté, aucune donnée réelle, aucun
 * chiffre présenté comme une mesure. Les noms, domaines et valeurs sont fictifs et la légende le dit.
 * Le tout est une image pour les technologies d'assistance (`role="img"` + libellé), donc aucun
 * contrôle focalisable ne doit être ajouté à l'intérieur.
 */

const navigation = [
  { label: 'Projets', icon: FolderKanban, active: true },
  { label: 'Activité', icon: Activity },
  { label: 'Utilisation', icon: Gauge },
  { label: 'Équipe', icon: Users },
  { label: 'Paramètres', icon: Settings },
]

const tiles = [
  { label: 'En ligne', value: '3 / 3' },
  { label: 'Déploiements', value: '12' },
  { label: 'Réussite', value: '92 %' },
]

const projects = [
  { name: 'boutique', domain: 'boutique.exemple.app', framework: 'nextjs', label: 'Next.js' },
  { name: 'blog', domain: 'blog.exemple.app', framework: 'astro', label: 'Astro' },
  { name: 'api', domain: 'api.exemple.app', framework: 'node', label: 'Node.js' },
]

export function HeroConsolePreview() {
  return (
    <figure className="relative mx-auto w-full max-w-[36rem] lg:max-w-none">
      <div
        role="img"
        aria-label="Illustration : liste de projets dans la console EFLEX, avec des données fictives."
        className="relative sm:py-16"
      >
        {/* Halo : purement décoratif, derrière la fenêtre. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 inset-y-10 rounded-[3rem] bg-eflexblue/20 blur-3xl"
        />

        <div className="relative [perspective:1600px]">
          <div className="overflow-hidden rounded-2xl bg-eflexnavy shadow-2xl shadow-black/50 ring-1 ring-white/20 lg:[transform:rotateY(-10deg)_rotateX(4deg)]">
            <div aria-hidden="true" className="flex items-center gap-3 border-b border-white/10 bg-white/[0.05] px-4 py-3">
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/75">console · aperçu</span>
            </div>

            <div aria-hidden="true" className="grid grid-cols-1 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
              <div className="hidden flex-col justify-between gap-6 border-r border-white/10 bg-white/[0.03] p-3 sm:flex">
                <ul className="space-y-1">
                  {navigation.map((item) => (
                    <li
                      key={item.label}
                      className={
                        item.active
                          ? 'flex items-center gap-2 rounded-lg bg-primary px-2.5 py-2 text-xs font-medium text-primary-foreground'
                          : 'flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs text-white/75'
                      }
                    >
                      <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      {item.label}
                    </li>
                  ))}
                </ul>
                <div className="rounded-lg border border-white/10 bg-white/[0.05] p-2.5">
                  <p className="text-xs font-semibold text-white">Votre plan · Découverte</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                    <div className="h-full w-3/5 rounded-full bg-eflexblue" />
                  </div>
                </div>
              </div>

              <div className="min-w-0 space-y-4 p-4 sm:p-5">
                <p className="text-sm font-semibold text-white">Vos projets</p>

                <div className="grid grid-cols-3 gap-2">
                  {tiles.map((tile) => (
                    <div key={tile.label} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.05] p-2.5">
                      <p className="truncate text-xs text-white/75">{tile.label}</p>
                      <p className="mt-1 text-base font-semibold tabular-nums text-white">{tile.value}</p>
                    </div>
                  ))}
                </div>

                <ul className="divide-y divide-white/10 rounded-lg border border-white/10 bg-white/[0.04]">
                  {projects.map((project) => (
                    <li key={project.name} className="flex min-w-0 items-center gap-3 px-3 py-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white">
                        <FrameworkIcon framework={project.framework} alt="" className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold text-white">{project.name}</span>
                        <span className="block truncate font-mono text-xs text-white/75">{project.domain}</span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-white/75 md:block">{project.label}</span>
                      <span className="shrink-0 rounded-full bg-emerald-400/15 px-2 py-0.5 text-xs font-medium text-emerald-300 ring-1 ring-emerald-300/30">
                        En ligne
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Cartes flottantes : le parcours en trois idées, masquées sur petit écran. */}
        <div
          aria-hidden="true"
          className="absolute left-0 top-0 hidden items-center gap-3 rounded-xl border border-white/15 bg-eflexnavy px-3.5 py-2.5 shadow-xl shadow-black/40 sm:flex lg:left-2"
        >
          <GithubMark className="h-6 w-6 shrink-0 text-white" />
          <span>
            <span className="block text-xs font-semibold text-white">GitHub</span>
            <span className="block text-xs text-white/75">Connectez votre dépôt</span>
          </span>
        </div>

        <div
          aria-hidden="true"
          className="absolute right-0 top-2 hidden items-center gap-3 rounded-xl border border-white/15 bg-eflexnavy px-3.5 py-2.5 shadow-xl shadow-black/40 md:flex lg:right-2"
        >
          <ScanSearch className="h-6 w-6 shrink-0 text-eflexsky" aria-hidden="true" />
          <span>
            <span className="block text-xs font-semibold text-white">Stack reconnue</span>
            <span className="block text-xs text-white/75">Next.js · pnpm</span>
          </span>
        </div>

        <div
          aria-hidden="true"
          className="absolute bottom-0 right-2 hidden items-center gap-3 rounded-xl border border-emerald-300/30 bg-eflexnavy px-3.5 py-2.5 shadow-xl shadow-black/40 sm:flex lg:right-6"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
            <Check className="h-4 w-4" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-xs font-semibold text-white">En ligne</span>
            <span className="block font-mono text-xs text-white/75">https://mon-app.exemple.app</span>
          </span>
        </div>
      </div>

      <figcaption className="mt-4 text-center text-xs text-white/75 lg:text-left">
        Illustration : interface d’exemple, noms et valeurs fictifs.
      </figcaption>
    </figure>
  )
}
