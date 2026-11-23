import {
  Database,
  FileKey2,
  Globe,
  HardDrive,
  Lock,
  Network,
  Server,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Availability = 'available' | 'conditional' | 'config'

type AvailabilityMeta = {
  label: string
  className: string
  dotClassName: string
}

const AVAILABILITY: Record<Availability, AvailabilityMeta> = {
  available: {
    label: 'Disponible',
    className: 'border-success/25 bg-success/10 text-success',
    dotClassName: 'bg-success',
  },
  conditional: {
    label: 'Conditionnel',
    className: 'border-warning/30 bg-warning/10 text-warning',
    dotClassName: 'bg-warning',
  },
  config: {
    label: 'Selon configuration',
    className: 'border-primary/20 bg-primary/10 text-primary',
    dotClassName: 'bg-primary',
  },
}

type Fact = {
  label: string
  value: string
  availability: Availability
  note?: string
}

type Zone = {
  id: string
  icon: LucideIcon
  title: string
  description: string
  facts: Fact[]
}

const ZONES: Zone[] = [
  {
    id: 'runtime',
    icon: Server,
    title: 'Runtime et hébergement',
    description: 'L’application s’exécute dans un environnement géré par la plateforme de déploiement.',
    facts: [
      {
        label: 'Exécution',
        value: 'Environnement conteneurisé',
        availability: 'available',
      },
      {
        label: 'Construction',
        value: 'Build puis déploiement du service',
        availability: 'available',
      },
      {
        label: 'Services multiples',
        value: 'Compose fourni par le dépôt requis',
        availability: 'conditional',
        note: 'Les projets multi-services sans fichier compose fourni ne sont pas pris en charge automatiquement.',
      },
    ],
  },
  {
    id: 'reseau',
    icon: Network,
    title: 'Réseau, domaines et TLS',
    description: 'L’accès réseau et les certificats dépendent du domaine configuré et de la vérification DNS.',
    facts: [
      {
        label: 'HTTPS',
        value: 'Certificat géré pour les domaines pris en charge',
        availability: 'available',
      },
      {
        label: 'Domaine personnalisé',
        value: 'Ajout possible après vérification DNS',
        availability: 'config',
        note: 'La configuration DNS n’est pas universelle : elle dépend du fournisseur de domaine.',
      },
      {
        label: 'Exposition',
        value: 'Règles de routage appliquées au service',
        availability: 'available',
      },
    ],
  },
  {
    id: 'persistance',
    icon: Database,
    title: 'Bases de données et persistance',
    description: 'Les données applicatives peuvent reposer sur des bases managées et des volumes, selon le besoin.',
    facts: [
      {
        label: 'Bases managées',
        value: 'PostgreSQL / Redis selon le projet',
        availability: 'conditional',
      },
      {
        label: 'Volumes',
        value: 'Persistance conditionnelle au service',
        availability: 'conditional',
        note: 'Un volume persistant ne constitue pas une garantie de sauvegarde.',
      },
      {
        label: 'Sauvegardes',
        value: 'Aucune garantie automatique implicite',
        availability: 'conditional',
        note: 'La stratégie de sauvegarde doit être vérifiée et configurée explicitement.',
      },
    ],
  },
  {
    id: 'protection',
    icon: ShieldCheck,
    title: 'Configuration et protection',
    description: 'Les paramètres sensibles sont gérés par configuration, avec des contrôles d’accès au niveau du projet.',
    facts: [
      {
        label: 'Variables d’environnement',
        value: 'Chiffrées au repos',
        availability: 'available',
      },
      {
        label: 'Secrets',
        value: 'Masqués dans les interfaces et journaux',
        availability: 'available',
      },
      {
        label: 'Contrôle d’accès',
        value: 'Rôles et périmètre organisation/projet',
        availability: 'available',
      },
    ],
  },
]

function AvailabilityBadge({ availability }: { availability: Availability }) {
  const meta = AVAILABILITY[availability]
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        meta.className,
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', meta.dotClassName)} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

function DiagramNode({
  icon: Icon,
  title,
  detail,
  className,
}: {
  icon: LucideIcon
  title: string
  detail: string
  className?: string
}) {
  return (
    <div className={cn('rounded-2xl border border-border bg-background p-4 shadow-sm', className)}>
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
    </div>
  )
}

function ZoneCard({ zone }: { zone: Zone }) {
  const Icon = zone.icon
  return (
    <article className="flex flex-col rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{zone.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{zone.description}</p>
        </div>
      </div>

      <ul className="mt-5 space-y-3" aria-label={`Détails : ${zone.title}`}>
        {zone.facts.map((fact) => (
          <li key={fact.label} className="rounded-2xl border border-border bg-background px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{fact.label}</p>
                <p className="text-sm text-muted-foreground">{fact.value}</p>
              </div>
              <AvailabilityBadge availability={fact.availability} />
            </div>
            {fact.note ? <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{fact.note}</p> : null}
          </li>
        ))}
      </ul>
    </article>
  )
}

function Legend() {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card/70 px-4 py-3 text-xs text-muted-foreground"
      aria-label="Légende de disponibilité"
    >
      <span className="font-medium text-foreground">Légende :</span>
      {(Object.keys(AVAILABILITY) as Availability[]).map((key) => (
        <AvailabilityBadge key={key} availability={key} />
      ))}
    </div>
  )
}

export function InfrastructureDiagram() {
  return (
    <section
      id="infrastructure"
      aria-labelledby="infrastructure-titre"
      className="scroll-mt-20 py-16 md:py-24"
    >
      <div className="container">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <h2
            id="infrastructure-titre"
            className="text-display-sm font-extrabold tracking-tight text-balance text-foreground"
          >
            Une vue claire de l’environnement de votre application.
          </h2>
          <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
            EFLEX rassemble runtime, réseau, persistance et configuration dans un même cadre. Chaque capacité est
            indiquée comme disponible, conditionnelle ou dépendante de votre configuration.
          </p>
        </div>

        <div className="mt-12 overflow-hidden rounded-3xl border border-border bg-muted/25 p-5 sm:p-6 lg:p-8">
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)_minmax(0,1fr)] lg:items-center">
            <div className="space-y-4">
              <DiagramNode icon={Globe} title="Accès utilisateur" detail="Navigateur, API ou client" />
              <DiagramNode icon={Lock} title="HTTPS / domaine" detail="Certificat et routage selon la configuration" />
            </div>

            <div
              className="rounded-3xl border border-primary/20 bg-card p-5 shadow-md sm:p-6"
              aria-label="Application au centre de l’infrastructure"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-primary">Application</p>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
                  Service déployé
                </span>
              </div>
              <div className="mt-4 flex items-center gap-4 rounded-2xl border border-border bg-background p-4">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-eflexnavy text-white">
                  <Server className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-foreground">Votre application EFLEX</p>
                  <p className="text-sm text-muted-foreground">Code source, build, configuration et runtime</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  { icon: FileKey2, label: 'Variables chiffrées' },
                  { icon: ShieldCheck, label: 'Secrets masqués' },
                  { icon: HardDrive, label: 'Volumes conditionnels' },
                  { icon: Network, label: 'Réseau contrôlé' },
                ].map(({ icon: ItemIcon, label }) => (
                  <div key={label} className="flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                    <ItemIcon className="h-4 w-4 text-primary" aria-hidden="true" />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-4">
              <DiagramNode icon={Database} title="Données" detail="Bases managées et persistance selon le projet" />
              <DiagramNode icon={ShieldCheck} title="Configuration" detail="Paramètres, accès et protection" />
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3" aria-label="Flux simplifié">
            {[
              { from: 'Dépôt / source', to: 'Build' },
              { from: 'Build', to: 'Service en ligne' },
              { from: 'Service en ligne', to: 'Domaine / TLS' },
            ].map((flow) => (
              <div key={flow.from} className="rounded-2xl border border-border bg-background px-4 py-3 text-sm">
                <p className="font-medium text-foreground">{flow.from}</p>
                <p className="mt-1 text-muted-foreground">→ {flow.to}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6">
          <Legend />
        </div>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {ZONES.map((zone) => (
            <ZoneCard key={zone.id} zone={zone} />
          ))}
        </div>

        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          Les capacités marquées « Conditionnel » ou « Selon configuration » dépendent du projet, du fournisseur DNS,
          de la présence d’un fichier compose fourni ou de la politique de persistance choisie. Un volume persistant
          n’implique pas de sauvegarde automatique.
        </p>
      </div>
    </section>
  )
}
