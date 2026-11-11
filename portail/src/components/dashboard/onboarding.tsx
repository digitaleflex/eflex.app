import Link from 'next/link'
import { ArrowRight, Database, FolderGit2, KeyRound, Plus, ShieldCheck } from 'lucide-react'

const STEPS = [
  {
    title: 'Choisissez le dépôt',
    description: 'Dépôt public ou privé via GitHub : la branche de production et la stack sont détectées à partir des fichiers.',
  },
  {
    title: 'Vérifiez la détection',
    description: 'Eflex propose un plan de build. Vous gardez la main sur le nom, la branche et les variables.',
  },
  {
    title: 'Publiez',
    description: 'Le déploiement attribue une adresse et prépare le certificat HTTPS. Les journaux restent consultables ensuite.',
  },
] as const

/**
 * Premier écran sans projet : une seule action principale, puis ce qui se
 * passera concrètement. Les capacités annoncées existent déjà dans le produit.
 */
export function DashboardOnboarding({
  organizationName,
  canManage,
}: {
  organizationName: string
  canManage: boolean
}) {
  return (
    <section
      aria-labelledby="onboarding-title"
      className="overflow-hidden rounded-xl border border-border bg-card"
    >
      <div className="grid gap-8 p-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:p-8">
        <div className="min-w-0">
          <h2 id="onboarding-title" className="font-display text-xl font-bold tracking-tight text-balance sm:text-2xl">
            Mettez votre premier projet en ligne
          </h2>
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">
            Indiquez l’adresse d’un dépôt GitHub : Eflex reconnaît la stack, construit l’application
            et la publie avec son adresse et son certificat.
          </p>

          {canManage ? (
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard/new"
                className="inline-flex h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Importer un dépôt
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <p className="mt-5 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              Votre rôle dans cette organisation permet de consulter les projets, pas d’en créer.
              Demandez à un propriétaire ou à un administrateur d’importer le premier dépôt.
            </p>
          )}

          <p className="mt-4 text-xs text-muted-foreground">
            Aucun projet pour l’instant dans {organizationName}. Vous pourrez ajouter un domaine
            personnalisé, des variables et une base de données après le premier déploiement.
          </p>
        </div>

        <div>
          <h3 className="text-sm font-semibold">Les trois étapes</h3>
          <ol className="mt-3 space-y-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-3 rounded-lg border border-border bg-background/60 p-3">
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted font-display text-xs font-bold tabular-nums text-foreground"
                >
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{step.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{step.description}</p>
                </div>
              </li>
            ))}
          </ol>
          <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <li className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
              HTTPS préparé au déploiement
            </li>
            <li className="inline-flex items-center gap-1.5">
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              Variables chiffrées
            </li>
            <li className="inline-flex items-center gap-1.5">
              <Database className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              Base privée à la demande
            </li>
            <li className="inline-flex items-center gap-1.5">
              <FolderGit2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              Dépôt public ou privé
            </li>
          </ul>
        </div>
      </div>
    </section>
  )
}
