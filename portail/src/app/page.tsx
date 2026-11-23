import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Check,
  Database,
  GitBranch,
  Globe,
  Lock,
  type LucideIcon,
  Rocket,
  ScrollText,
  Server,
  Settings2,
  ShieldCheck,
} from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { DeployDemo } from '@/components/marketing/deploy-demo'
import { HowItWorks } from '@/components/marketing/how-it-works'
import { TechStack } from '@/components/marketing/tech-stack'
import { MigrationTeaser } from '@/components/marketing/migration-teaser'
import { getLegalCompanyInfo } from '@/lib/legal-info'
import { LinkButton } from '@/components/link-button'

const reassurance = [
  { icon: GitBranch, label: 'Connexion GitHub' },
  { icon: Rocket, label: 'Déploiement automatisé' },
  { icon: Lock, label: 'HTTPS automatique' },
  { icon: ShieldCheck, label: 'Technologies compatibles prises en charge' },
]

const faqs = [
  {
    q: 'Quels frameworks et langages sont compatibles ?',
    a: "EFLEX prend en charge notamment Next.js, Nuxt, Astro, Vite, SvelteKit, Remix, SolidStart, RedwoodJS, Node.js, PHP, Python et les sites HTML statiques. Laravel est reconnu ; certains projets multi-services peuvent nécessiter un fichier docker-compose.yml. Un Dockerfile ou un docker-compose.yml existant peut aussi être utilisé tel quel.",
  },
  {
    q: 'Dois-je posséder un serveur ?',
    a: "Non. EFLEX se charge de la construction et de la mise en ligne de votre application. Vous n'avez pas besoin de configurer et d'administrer un serveur pour déployer un projet compatible.",
  },
  {
    q: 'Comment fonctionne le déploiement depuis GitHub ?',
    a: "Vous connectez votre compte GitHub, sélectionnez un dépôt et lancez un déploiement. EFLEX analyse le projet, propose une configuration, construit l'application puis la met en ligne. Les déploiements suivants peuvent être déclenchés depuis la console.",
  },
  {
    q: 'Puis-je connecter mon propre domaine ?',
    a: "Oui, selon la configuration de votre projet. Vous pouvez ajouter un domaine personnalisé depuis les paramètres du projet, puis vérifier la configuration DNS demandée par EFLEX.",
  },
  {
    q: 'Comment sont gérés les certificats HTTPS ?',
    a: "EFLEX gère automatiquement les certificats HTTPS pour les domaines pris en charge. Le certificat est émis et renouvelé sans que vous ayez à l'installer manuellement.",
  },
  {
    q: "Que se passe-t-il lorsqu'un déploiement échoue ?",
    a: "Le déploiement est marqué comme échoué et vous pouvez consulter les journaux de build et d'exécution pour identifier la cause. L'application déjà en ligne reste disponible tant qu'un nouveau déploiement réussi ne la remplace pas.",
  },
  {
    q: 'Comment fonctionne la tarification ?',
    a: "EFLEX propose une offre gratuite pour commencer, puis des offres adaptées à l'usage. Vous pouvez consulter le détail des offres sur la page Tarification.",
  },
  {
    q: 'Puis-je gérer plusieurs applications ?',
    a: "Oui. Vous pouvez regrouper vos projets dans un même espace et suivre leurs déploiements, domaines et paramètres depuis la console EFLEX, selon l'offre choisie.",
  },
]

function SectionHeading({
  id,
  title,
  lead,
  align = 'center',
}: {
  id?: string
  title: ReactNode
  lead?: string
  align?: 'center' | 'left'
}) {
  const centered = align === 'center'
  return (
    <div className={centered ? 'mx-auto max-w-3xl space-y-4 text-center' : 'max-w-3xl space-y-4'}>
      <h2 id={id} className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
        {title}
      </h2>
      {lead ? (
        <p className={`${centered ? 'mx-auto ' : ''}max-w-2xl text-lead-lg text-muted-foreground text-pretty`}>{lead}</p>
      ) : null}
    </div>
  )
}

function CapabilityCard({
  icon: Icon,
  title,
  text,
  className = '',
  children,
}: {
  icon: LucideIcon
  title: string
  text: string
  className?: string
  children: ReactNode
}) {
  return (
    <article
      className={`group flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-[border-color,box-shadow,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md ${className}`}
    >
      <div className="border-b border-border bg-muted/35 p-5 sm:p-6">{children}</div>
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="text-lg font-semibold tracking-tight text-foreground">{title}</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">{text}</p>
      </div>
    </article>
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

export default function HomePage() {
  const { email: contactEmail } = getLegalCompanyInfo()

  return (
    <div className="homepage-light flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1">
        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden border-b border-border bg-background">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_50%_-10%,hsl(var(--primary)/0.12),transparent)]"
          />
          <div className="container relative pb-14 pt-14 sm:pb-18 sm:pt-18 md:pb-22 md:pt-20">
            <div className="mx-auto max-w-4xl text-center">
              <p className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
                Déploiement continu simplifié
              </p>
              <h1 className="mt-6 animate-reveal text-display font-extrabold tracking-tight text-balance text-foreground">
                Du code à la production.
                <span className="block">Sans complexité.</span>
              </h1>
              <p
                className="mx-auto mt-6 max-w-2xl animate-reveal text-lead-lg text-muted-foreground text-pretty"
                style={{ '--d': '80ms' } as CSSProperties}
              >
                Connectez votre dépôt GitHub, laissez EFLEX construire votre application et mettez votre projet en ligne sans
                gérer toute l’infrastructure serveur.
              </p>
              <div
                className="mt-9 flex animate-reveal flex-col justify-center gap-3 sm:flex-row"
                style={{ '--d': '160ms' } as CSSProperties}
              >
                <LinkButton href="/register" size="lg" className="group gap-2 px-6 text-base font-semibold shadow-primary">
                  Déployer mon projet
                  <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5" aria-hidden="true" />
                </LinkButton>
                <Link
                  href="#fonctionnement"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-background px-6 text-base font-semibold text-foreground transition-[background-color,border-color,transform] duration-200 ease-out-expo hover:bg-secondary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  Découvrir EFLEX
                </Link>
              </div>

              <ul
                className="mx-auto mt-8 flex max-w-4xl animate-reveal flex-wrap items-center justify-center gap-x-5 gap-y-3 text-sm text-muted-foreground"
                style={{ '--d': '220ms' } as CSSProperties}
                aria-label="Points de réassurance"
              >
                {reassurance.map((item) => (
                  <li key={item.label} className="inline-flex items-center gap-2">
                    <item.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    <span>{item.label}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="animate-reveal" style={{ '--d': '300ms' } as CSSProperties}>
              <DeployDemo />
            </div>
          </div>
        </section>

        {/* ─── Technologies ─── */}
        <section id="technologies" aria-labelledby="technologies-titre" className="scroll-mt-20 py-16 md:py-24">
          <div className="container">
            <SectionHeading
              id="technologies-titre"
              title="Votre stack. Votre workflow. EFLEX."
              lead="Déployez vos projets avec les technologies que vous utilisez déjà."
            />
            <TechStack />
          </div>
        </section>

        {/* ─── Fonctionnement ─── */}
        <section
          id="fonctionnement"
          aria-labelledby="fonctionnement-titre"
          className="scroll-mt-20 border-y border-border bg-muted/35 py-16 md:py-24"
        >
          <div className="container">
            <SectionHeading
              id="fonctionnement-titre"
              title="Du dépôt à la production. En trois étapes."
              lead="Concentrez-vous sur votre code. EFLEX vous accompagne dans sa mise en ligne."
            />
            <HowItWorks />
          </div>
        </section>

        {/* ─── Capacités ─── */}
        <section id="fonctionnalites" aria-labelledby="fonctionnalites-titre" className="scroll-mt-20 py-16 md:py-24">
          <div className="container">
            <SectionHeading
              id="fonctionnalites-titre"
              title="Tout ce qu’il faut pour gérer vos déploiements."
              lead="Une expérience pensée pour simplifier le cycle de vie de vos applications."
            />

            <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-12">
              <CapabilityCard
                icon={Rocket}
                title="Déploiement automatisé"
                text="Automatisez la mise en ligne de vos applications à partir de vos dépôts compatibles."
                className="xl:col-span-7"
              >
                <MiniWindow title="Flux de déploiement">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm font-medium">GitHub</div>
                    <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
                    <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm font-medium text-primary">EFLEX</div>
                    <ArrowRight className="hidden h-4 w-4 text-muted-foreground sm:block" aria-hidden="true" />
                    <div className="rounded-xl border border-success/20 bg-success/10 px-4 py-3 text-sm font-medium text-success">Production</div>
                  </div>
                </MiniWindow>
              </CapabilityCard>

              <CapabilityCard
                icon={GitBranch}
                title="Gestion des versions"
                text="Visualisez les différentes versions déployées et suivez l’évolution de vos projets."
                className="xl:col-span-5"
              >
                <MiniWindow title="Historique des déploiements">
                  <div className="space-y-2.5 text-sm">
                    {['v12 · En ligne', 'v11 · Remplacée', 'v10 · Remplacée'].map((item, i) => (
                      <div key={item} className="flex items-center justify-between rounded-xl border border-border px-3 py-2">
                        <span className="font-mono text-xs text-foreground">{item}</span>
                        <span className={i === 0 ? 'text-xs font-medium text-success' : 'text-xs text-muted-foreground'}>
                          {i === 0 ? 'Actuelle' : 'Historique'}
                        </span>
                      </div>
                    ))}
                  </div>
                </MiniWindow>
              </CapabilityCard>

              <CapabilityCard
                icon={Lock}
                title="HTTPS et domaines"
                text="Gérez l’accès sécurisé à vos applications et les domaines personnalisés selon les options disponibles."
                className="xl:col-span-4"
              >
                <MiniWindow title="Domaines">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5">
                      <span className="font-mono text-xs">app.exemple.com</span>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-success"><Lock className="h-3.5 w-3.5" aria-hidden="true" />HTTPS</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Certificats émis et renouvelés automatiquement.</p>
                  </div>
                </MiniWindow>
              </CapabilityCard>

              <CapabilityCard
                icon={ScrollText}
                title="Suivi des déploiements"
                text="Suivez les étapes de construction et identifiez les éventuelles erreurs de déploiement."
                className="xl:col-span-4"
              >
                <MiniWindow title="Journaux">
                  <div className="space-y-2 font-mono text-xs text-muted-foreground">
                    <p><span className="text-primary">00:12</span> Installation des dépendances</p>
                    <p><span className="text-primary">00:48</span> Build terminé</p>
                    <p><span className="text-primary">01:02</span> Application démarrée</p>
                  </div>
                </MiniWindow>
              </CapabilityCard>

              <CapabilityCard
                icon={Settings2}
                title="Configuration"
                text="Gérez les paramètres nécessaires au fonctionnement de vos projets."
                className="xl:col-span-4"
              >
                <MiniWindow title="Paramètres">
                  <div className="space-y-2.5 text-sm">
                    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2"><span className="text-muted-foreground">Branche</span><span className="font-mono text-xs">main</span></div>
                    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2"><span className="text-muted-foreground">Variables</span><span className="text-xs font-medium">Chiffrées</span></div>
                    <div className="flex items-center justify-between rounded-xl border border-border px-3 py-2"><span className="text-muted-foreground">Runtime</span><span className="text-xs font-medium">Configuré</span></div>
                  </div>
                </MiniWindow>
              </CapabilityCard>

              <CapabilityCard
                icon={Database}
                title="Gestion centralisée"
                text="Retrouvez vos projets et leurs informations essentielles depuis un même espace."
                className="xl:col-span-12"
              >
                <MiniWindow title="Tableau de bord">
                  <div className="grid gap-3 sm:grid-cols-3">
                    {[
                      { name: 'boutique-web', status: 'En ligne', tone: 'text-success' },
                      { name: 'api-interne', status: 'En construction', tone: 'text-primary' },
                      { name: 'site-vitrine', status: 'En ligne', tone: 'text-success' },
                    ].map((project) => (
                      <div key={project.name} className="rounded-xl border border-border bg-muted/30 p-3">
                        <p className="truncate font-mono text-xs text-foreground">{project.name}</p>
                        <p className={`mt-1 text-xs font-medium ${project.tone}`}>{project.status}</p>
                      </div>
                    ))}
                  </div>
                </MiniWindow>
              </CapabilityCard>
            </div>
          </div>
        </section>

        <MigrationTeaser contactEmail={contactEmail} />

        {/* ─── FAQ ─── */}
        <section id="questions" aria-labelledby="questions-titre" className="scroll-mt-20 border-t border-border bg-muted/25 py-16 md:py-24">
          <div className="container">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-12">
              <div className="space-y-6">
                <SectionHeading
                  id="questions-titre"
                  title="Des questions avant de commencer ?"
                  lead="Retrouvez les réponses aux questions les plus fréquentes concernant EFLEX."
                  align="left"
                />
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="text-base font-semibold text-foreground">Besoin d’une réponse précise ?</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    Consultez la documentation ou contactez l’équipe EFLEX pour une question spécifique.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-3">
                    <a
                      href={`mailto:${contactEmail}?subject=Question%20sur%20EFLEX`}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-semibold transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Contacter le support
                    </a>
                    <Link
                      href="/docs"
                      className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      Voir la documentation
                    </Link>
                  </div>
                </div>
              </div>

              <div className="divide-y divide-border rounded-2xl border border-border bg-card">
                {faqs.map((item) => (
                  <details key={item.q} className="group px-5 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="text-base font-medium text-foreground text-balance">{item.q}</span>
                      <span
                        aria-hidden="true"
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-transform duration-200 ease-out-expo group-open:rotate-45"
                      >
                        +
                      </span>
                    </summary>
                    <p className="pb-5 text-sm leading-relaxed text-muted-foreground sm:text-base">{item.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── CTA final ─── */}
        <section aria-labelledby="appel-titre" className="py-16 md:py-24">
          <div className="container">
            <div className="surface-navy relative overflow-hidden rounded-3xl bg-eflexnavy px-6 py-12 text-white sm:px-10 md:px-12 md:py-16">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_70%_at_100%_0%,hsl(var(--eflex-royalblue)/0.35),transparent)]"
              />
              <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="max-w-3xl">
                  <h2 id="appel-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-white">
                    Votre prochain projet mérite d’être en ligne.
                  </h2>
                  <p className="mt-4 max-w-2xl text-base leading-relaxed text-white/80 text-pretty sm:text-lg">
                    Connectez votre dépôt GitHub et découvrez une nouvelle manière de déployer vos applications.
                  </p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                  <Link
                    href="/register"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-eflexnavy transition-[background-color,transform] duration-200 ease-out-expo hover:bg-white/92 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
                  >
                    Créer mon compte
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/35 px-6 text-base font-semibold text-white transition-[background-color,border-color,transform] duration-200 ease-out-expo hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
                  >
                    Se connecter
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
