import type { CSSProperties, ReactNode } from 'react'
import {
  Activity,
  BarChart3,
  CheckCircle2,
  Clock3,
  Cpu,
  FileText,
  Globe,
  HeartPulse,
  LifeBuoy,
  Lock,
  type LucideIcon,
  MemoryStick,
  ScrollText,
  Server,
  ShieldCheck,
} from 'lucide-react'

function SectionHeading({
  id,
  title,
  lead,
}: {
  id: string
  title: string
  lead: string
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 text-center">
      <h2 id={id} className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
        {title}
      </h2>
      <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">{lead}</p>
    </div>
  )
}

function MiniWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
        </span>
        <span className="truncate text-xs font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

function CardFrame({
  icon: Icon,
  title,
  description,
  children,
  className = '',
  index = 0,
}: {
  icon: LucideIcon
  title: string
  description: string
  children: ReactNode
  className?: string
  index?: number
}) {
  return (
    <article
      className={`reveal-on-view group flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-[border-color,box-shadow,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md ${className}`}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="border-b border-border bg-muted/35 p-5 sm:p-6">{children}</div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
      </div>
    </article>
  )
}

function DeploymentLogsScene() {
  return (
    <MiniWindow title="Journaux de déploiement">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            Déploiement terminé
          </span>
          <span className="rounded-full bg-muted px-2.5 py-1 font-medium text-muted-foreground tabular-nums">01:24</span>
        </div>
        <div className="space-y-2 rounded-xl bg-eflexnavy p-3 font-mono text-xs leading-relaxed text-white/85" aria-hidden="true">
          <p><span className="text-eflexsky tabular-nums">00:08</span> Dépôt cloné</p>
          <p><span className="text-eflexsky tabular-nums">00:41</span> Build terminé</p>
          <p><span className="text-eflexsky tabular-nums">01:12</span> Service démarré</p>
          <p className="text-success"><span className="tabular-nums">01:24</span> Application disponible</p>
        </div>
        <p className="text-xs text-muted-foreground">Les journaux vous aident à suivre la construction et à diagnostiquer un échec.</p>
      </div>
    </MiniWindow>
  )
}

function HealthScene() {
  const metrics = [
    { icon: Cpu, label: 'CPU', value: '24 %', note: 'quand disponible' },
    { icon: MemoryStick, label: 'Mémoire', value: '1,2 Go', note: 'quand disponible' },
  ]

  return (
    <MiniWindow title="Santé du service">
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <HeartPulse className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              État plateforme
            </p>
            <p className="mt-1 text-sm font-semibold text-success">Opérationnelle</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
              Certificat TLS
            </p>
            <p className="mt-1 text-sm font-semibold text-success">Valide</p>
          </div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {metrics.map((metric) => (
            <div key={metric.label} className="rounded-xl border border-border px-3 py-2.5">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <metric.icon className="h-3.5 w-3.5" aria-hidden="true" />
                {metric.label}
              </p>
              <p className="mt-1 font-mono text-sm font-medium tabular-nums text-foreground">{metric.value}</p>
              <p className="text-xs text-muted-foreground">{metric.note}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-xs">
          <span className="inline-flex items-center gap-2 text-muted-foreground">
            <Server className="h-3.5 w-3.5" aria-hidden="true" />
            Runtime
          </span>
          <span className="font-medium text-foreground">Démarré</span>
        </div>
      </div>
    </MiniWindow>
  )
}

function AnalyticsScene() {
  const bars = [24, 38, 31, 52, 46, 63, 58]

  return (
    <MiniWindow title="Analytics (aperçu)">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-medium text-muted-foreground">Pages vues sur 7 jours</p>
          <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Option activable</span>
        </div>
        <div className="flex h-24 items-end gap-1.5" aria-hidden="true">
          {bars.map((value, index) => (
            <div key={index} className="flex-1 rounded-t-md bg-primary/20">
              <div className="rounded-t-md bg-primary/70" style={{ height: `${value}%` }} />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-border px-3 py-2">
            <p className="text-muted-foreground">Visiteurs</p>
            <p className="mt-1 font-mono font-medium tabular-nums text-foreground">128</p>
          </div>
          <div className="rounded-xl border border-border px-3 py-2">
            <p className="text-muted-foreground">Pages vues</p>
            <p className="mt-1 font-mono font-medium tabular-nums text-foreground">342</p>
          </div>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Mesure sans cookie, sans identifiant persistant et sans déduplication multi-jours. Pas de durée de session ni de taux de rebond.
        </p>
      </div>
    </MiniWindow>
  )
}

function SupportScene() {
  return (
    <MiniWindow title="Aide & assistance">
      <div className="space-y-3">
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            Documentation
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Guides de déploiement, configuration et dépannage.</p>
        </div>
        <div className="rounded-xl border border-border bg-muted/30 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <LifeBuoy className="h-4 w-4 text-primary" aria-hidden="true" />
            Contact support
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">Échange par e-mail avec l’équipe EFLEX selon votre besoin.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Les délais de réponse dépendent de la demande et de l’offre.</span>
        </div>
      </div>
    </MiniWindow>
  )
}

export function OperationsBento() {
  return (
    <section
      id="fonctionnalites"
      aria-labelledby="fonctionnalites-titre"
      className="scroll-mt-20 border-y border-border bg-muted/25 py-16 md:py-24"
    >
      <div className="container">
        <SectionHeading
          id="fonctionnalites-titre"
          title="Suivez, comprenez, exploitez."
          lead="Des outils concrets pour suivre vos déploiements, vérifier l’état de vos services et obtenir de l’aide quand vous en avez besoin."
        />

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12">
          <CardFrame
            icon={ScrollText}
            title="Déploiements et journaux"
            description="Suivez chaque étape de construction et consultez les journaux pour comprendre ce qui s’est passé, en cas de succès comme d’échec."
            className="xl:col-span-7"
            index={0}
          >
            <DeploymentLogsScene />
          </CardFrame>

          <CardFrame
            icon={Activity}
            title="Métriques et santé"
            description="Consultez l’état de la plateforme, la vérification TLS, le runtime et, quand elles sont disponibles, les métriques CPU et mémoire."
            className="xl:col-span-5"
            index={1}
          >
            <HealthScene />
          </CardFrame>

          <CardFrame
            icon={BarChart3}
            title="Analytics intégrées"
            description="Activez une mesure simple du trafic pour vos pages, sans cookies ni identifiant persistant. Vous voyez uniquement les indicateurs disponibles."
            className="xl:col-span-5"
            index={2}
          >
            <AnalyticsScene />
          </CardFrame>

          <CardFrame
            icon={ShieldCheck}
            title="Support et assistance"
            description="Accédez à la documentation et contactez l’équipe EFLEX par e-mail. Le support est traité selon la demande, sans promesse de disponibilité permanente."
            className="xl:col-span-7"
            index={3}
          >
            <SupportScene />
          </CardFrame>
        </div>

        <p className="mt-6 flex items-start gap-2 text-sm text-muted-foreground">
          <Globe className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>Les informations affichées dépendent des données effectivement disponibles pour votre projet et votre infrastructure.</span>
        </p>
      </div>
    </section>
  )
}
