import type { ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  ArrowRight,
  Boxes,
  Check,
  FileCode2,
  GitBranch,
  KeyRound,
  Layers,
  Lock,
  Rocket,
  SearchCheck,
  ShieldCheck,
  SlidersHorizontal,
  Zap,
} from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { HeroConsolePreview } from '@/components/marketing/hero-console-preview'
import { StackShowcase } from '@/components/marketing/stack-showcase'
import { MigrationTeaser } from '@/components/marketing/migration-teaser'
import { GithubMark } from '@/components/icons/github-mark'
import { getLegalCompanyInfo } from '@/lib/legal-info'

const steps = [
  {
    icon: GitBranch,
    title: 'Connectez votre dépôt',
    text: "Collez l'URL de votre dépôt GitHub et choisissez la branche à publier.",
  },
  {
    icon: SearchCheck,
    title: "Vérifiez ce qu'Eflex a compris",
    text: 'Framework, version, commandes de build, port : chaque choix est expliqué. Vous corrigez si besoin.',
  },
  {
    icon: Rocket,
    title: 'Mettez en ligne',
    text: "Eflex construit l'application, la démarre et active HTTPS. Vous recevez l'adresse de votre site.",
  },
]

const faqs = [
  {
    q: 'Quelles technologies sont prises en charge ?',
    a: "Next.js, Nuxt, Astro, Vite, SvelteKit, Remix, SolidStart, RedwoodJS, Node.js (Express, Fastify, NestJS…), PHP, Python (Django, FastAPI, Flask) et les sites HTML statiques. Laravel est reconnu ; si votre application nécessite plusieurs services (par exemple web, file d’attente, planificateur), ajoutez un fichier `docker-compose.yml` ou `compose.yaml` à la racine de l’application. Un Dockerfile existant est aussi utilisé tel quel.",
  },
  {
    q: 'Dois-je écrire un Dockerfile ?',
    a: "Non. Eflex déduit la configuration de votre dépôt. Si vous en avez déjà un, il est utilisé tel quel : c'est vous qui gardez la main.",
  },
  {
    q: "Que se passe-t-il si Eflex se trompe de stack ?",
    a: "Vous pouvez choisir une autre stack parmi celles qu'Eflex a détectées à la création du projet, ou ajouter un fichier eflex.json à la racine du dépôt. Ce fichier a toujours priorité sur la détection automatique.",
  },
  {
    q: "Où sont stockées mes variables d'environnement ?",
    a: "Dans Eflex, jamais dans votre dépôt. Elles sont chiffrées en base (AES-256-GCM), transmises à l'application au démarrage et ne s'affichent plus une fois enregistrées.",
  },
  {
    q: 'Mes dépôts privés sont-ils compatibles ?',
    a: "Oui. Connectez la GitHub App (recommandée) ou ajoutez un jeton personnel dans Paramètres → Connexion GitHub. Eflex lit le dépôt avec un accès à durée limitée et crée une clé de déploiement en lecture seule.",
  },
  {
    q: 'Mon dépôt contient plusieurs applications. Ça marche ?',
    a: "Oui, pour en publier une. Eflex reconnaît les monorepos (pnpm, Turborepo, Nx, Lerna…) et vous demande laquelle déployer. Aujourd'hui, un seul service est publié par projet : les dépendances partagées et les applications annexes ne sont pas déployées automatiquement.",
  },
  {
    q: "Qu'est-ce qui n'est pas encore pris en charge ?",
    a: "Les applications qui nécessitent plusieurs services sans fichier `docker-compose.yml`/`compose.yaml` fourni ne peuvent pas encore être déployées automatiquement. La conservation garantie des données stockées sur disque entre déploiements (fichiers uploadés, certains stockages locaux) dépend de la configuration de l’infrastructure et peut ne pas être disponible. Les métriques détaillées (CPU/mémoire dans le temps, stockage, bande passante) ne sont pas toutes disponibles pour l’instant.",
  },
]



function SectionHeading({ id, title, lead }: { id?: string; title: ReactNode; lead?: string }) {
  return (
    <div className="max-w-2xl space-y-4">
      <h2 id={id} className="text-display-sm font-bold text-balance">
        {title}
      </h2>
      {lead && <p className="text-lead-lg text-muted-foreground text-pretty">{lead}</p>}
    </div>
  )
}

/** Mini-illustrations des trois étapes (décoratives ; l'adresse est un exemple, pas un vrai site). */
function StepVisual({ index }: { index: number }) {
  if (index === 0) {
    return (
      <div
        aria-hidden="true"
        className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-muted-foreground"
      >
        <GithubMark className="h-4 w-4 shrink-0 text-foreground" />
        <span className="truncate">github.com/votre-projet</span>
      </div>
    )
  }
  if (index === 1) {
    return (
      <ul aria-hidden="true" className="mt-5 space-y-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm">
        {['Stack détectée', 'Build proposé', 'Port identifié'].map((label) => (
          <li key={label} className="flex items-center gap-2 text-muted-foreground">
            <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div
      aria-hidden="true"
      className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2.5 text-sm text-muted-foreground"
    >
      <Lock className="h-4 w-4 shrink-0 text-primary" />
      <span className="truncate font-mono">https://mon-app.exemple.app</span>
    </div>
  )
}

const benefits = [
  { icon: Activity, title: 'Suivi en direct', text: 'Les journaux de build s’affichent en temps réel.' },
  { icon: ShieldCheck, title: 'Sécurisé', text: 'HTTPS et certificats automatiques.' },
  { icon: SlidersHorizontal, title: 'Automatique', text: 'Détection et configuration de la stack.' },
  { icon: Rocket, title: 'Sans complexité', text: 'Pas de Dockerfile obligatoire.' },
]

/** Carte de la grille « fonctionnalités » : structure identique pour les six cartes. */
function FeatureCard({
  icon: Icon,
  title,
  description,
  className = '',
  children,
}: {
  icon: LucideIcon
  title: string
  description?: string
  className?: string
  children?: ReactNode
}) {
  return (
    <article className={`flex flex-col rounded-2xl border border-border bg-card p-6 shadow-sm ${className}`}>
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 className="mt-5 text-lg font-semibold">{title}</h3>
      {description && <p className="mt-2 text-muted-foreground">{description}</p>}
      {children}
    </article>
  )
}

export default function HomePage() {
  // Même source que le pied de page : une seule adresse de contact à maintenir.
  const { email: contactEmail } = getLegalCompanyInfo()
  return (
    <div className="homepage-light flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1">
        {/* ─── Hero : surface pleine largeur navy, preuve produit intégrée ─── */}
        <section className="relative overflow-hidden bg-eflexnavy text-white">
          <div className="container relative grid grid-cols-1 items-center gap-12 py-16 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
            <div className="space-y-8 animate-reveal">
              <div className="space-y-5">
                <h1 className="text-display font-bold text-balance text-white">
                  Poussez votre code.{' '}
                  <span className="text-eflexblue">Eflex le met en ligne.</span>
                </h1>
                <p className="max-w-xl text-lead-lg text-white/80 text-pretty">
                  Indiquez votre dépôt GitHub : Eflex reconnaît la stack, construit l&apos;application et la publie
                  en HTTPS. Pas de serveur à configurer, pas de Dockerfile à écrire.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-eflexnavy transition-[background-color,transform] duration-200 ease-out-expo hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
                >
                  Déployer un projet
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <Link
                  href="#fonctionnement"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-white/40 px-6 text-base font-medium text-white transition-[background-color,border-color,transform] duration-200 ease-out-expo hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
                >
                  Voir comment ça marche
                </Link>
              </div>

              <ul className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm text-white/80 sm:grid-cols-2">
                {[
                  { label: 'HTTPS automatique', icon: ShieldCheck },
                  { label: 'Sans Dockerfile à écrire', icon: Layers },
                  { label: 'Dépôts privés pris en charge', icon: Lock },
                  { label: 'Secrets chiffrés hors de votre dépôt', icon: KeyRound },
                ].map((item) => (
                  <li key={item.label} className="flex items-center gap-2.5">
                    <item.icon className="h-5 w-5 shrink-0 text-eflexblue" aria-hidden="true" />
                    {item.label}
                  </li>
                ))}
              </ul>

              <p className="text-sm text-white/80">
                Le plan Découverte est gratuit : aucun paiement pour démarrer.
              </p>
            </div>

            {/* Aperçu illustratif de la console (données fictives, dit dans la légende). */}
            <div className="min-w-0">
              <HeroConsolePreview />
            </div>
          </div>
        </section>

        {/* ─── Fonctionnement ─── */}
        <section
          id="fonctionnement"
          aria-labelledby="fonctionnement-titre"
          className="scroll-mt-20 container space-y-12 py-20 md:py-28"
        >
          <SectionHeading
            id="fonctionnement-titre"
            title={
              <>
                Du dépôt à l&apos;URL, en <span className="text-primary">trois étapes</span>
              </>
            }
            lead="Vous connectez le dépôt, vous validez ce qu'Eflex a compris, puis l'application est mise en ligne."
          />
          <ol className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {steps.map((step, i) => {
              const Icon = step.icon
              return (
                <li key={step.title} className="relative rounded-2xl border border-border bg-card p-6 shadow-sm">
                  {/* Filet de séquence : visible uniquement dans les intervalles
                      entre cartes, pour lire l'ordre sans animation. */}
                  {i < steps.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-full top-[46px] hidden h-px w-6 bg-primary/30 md:block"
                    />
                  )}
                  <div className="flex items-center justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-base font-semibold text-primary" aria-hidden="true">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-muted-foreground">{step.text}</p>
                  <StepVisual index={i} />
                </li>
              )
            })}
          </ol>

          <ul className="grid grid-cols-1 gap-6 border-t border-border pt-8 sm:grid-cols-2 lg:grid-cols-4">
            {benefits.map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block text-base font-semibold">{item.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{item.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* ─── Technologies : bande navy, en alternance avec les sections claires ─── */}
        <section id="technologies" aria-labelledby="stacks-titre" className="scroll-mt-20 bg-eflexnavy text-white">
          <div className="container space-y-10 py-16 md:py-24">
            <div className="mx-auto max-w-3xl space-y-4 text-center">
              <h2 id="stacks-titre" className="text-3xl font-bold tracking-tight text-balance md:text-4xl">
                Déployez vos applications avec vos <span className="text-eflexblue">technologies préférées</span>
              </h2>
              <p className="text-lead-lg text-white/80 text-pretty">
                Eflex reconnaît la stack de votre dépôt et propose la commande de build, le démarrage et le port.
                Vous relisez et corrigez si besoin.
              </p>
            </div>

            <StackShowcase />

            <ul className="mx-auto grid grid-cols-1 max-w-5xl gap-6 border-t border-white/10 pt-8 md:grid-cols-3">
              {[
                {
                  icon: Zap,
                  title: 'Détection automatique',
                  text: 'La stack est identifiée dès l’import du dépôt.',
                },
                {
                  icon: SlidersHorizontal,
                  title: 'Configuration proposée',
                  text: 'Build, démarrage et port sont expliqués : vous les validez ou les corrigez.',
                },
                {
                  icon: FileCode2,
                  title: 'Une technologie manque ?',
                  text: 'Décrivez votre application avec un Dockerfile ou un fichier eflex.json.',
                },
              ].map((item) => (
                <li key={item.title} className="flex items-start gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                    <item.icon className="h-5 w-5 text-eflexsky" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-base font-semibold">{item.title}</span>
                    <span className="mt-1 block text-sm text-white/80">{item.text}</span>
                  </span>
                </li>
              ))}
            </ul>

            <p className="mx-auto max-w-2xl text-center text-xs text-white/75 text-pretty">
              Les dépôts GitHub, publics ou privés, sont pris en charge aujourd’hui ; les technologies marquées «&nbsp;Bientôt&nbsp;»
              arrivent prochainement. Si votre application repose sur plusieurs services, ajoutez un fichier{' '}
              <code className="font-mono">docker-compose.yml</code> ou <code className="font-mono">compose.yaml</code> à
              la racine pour les déployer ensemble.
            </p>
          </div>
        </section>

        {/* ─── Fonctionnalités ─── */}
        <section
          id="fonctionnalites"
          aria-labelledby="fonctionnalites-titre"
          className="scroll-mt-20 border-y border-border bg-muted/50"
        >
          <div className="container space-y-12 py-20 md:py-28">
            <SectionHeading
              id="fonctionnalites-titre"
              title="Pensé pour les vrais projets, pas seulement pour les démos"
              lead="Détection expliquée, dépôts privés, HTTPS automatique, variables chiffrées : ce que Eflex automatise pour vous."
            />

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {/* Carte principale : détection expliquée */}
              <FeatureCard
                icon={SearchCheck}
                title="Des choix expliqués, pas une boîte noire"
                description={
                  "Eflex vous montre ce qu'il a trouvé dans votre dépôt et pourquoi. En cas de doute, il vous pose la question au lieu de deviner."
                }
                className="sm:col-span-2 lg:row-span-2"
              >
                <div className="mt-6 flex-1 rounded-xl border border-border bg-muted/40 p-5 font-mono text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-sans font-semibold">
                      <FrameworkIcon framework="nextjs" alt="" className="h-5 w-5" />
                      Next.js · node@22
                    </span>
                    <span className="rounded-full bg-success/10 px-2.5 py-0.5 font-sans text-xs font-medium text-success tabular-nums">
                      Confiance 95 %
                    </span>
                  </div>
                  <ul className="mt-4 space-y-2 text-muted-foreground">
                    {[
                      'Dépendance `next` trouvée dans `package.json`.',
                      'Gestionnaire de paquets détecté : pnpm.',
                      'Fichier de configuration Next.js détecté.',
                    ].map((r) => (
                      <li key={r} className="flex gap-2">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                        <span>{r}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 font-sans text-xs text-warning">
                    Conseil : activez <code className="font-mono">output: &apos;standalone&apos;</code> dans
                    next.config pour un démarrage plus rapide.
                  </p>
                </div>
              </FeatureCard>

              <FeatureCard
                icon={Layers}
                title="Plusieurs services, un seul fichier"
                description={
                  'Serveur web, file d’attente, planificateur : décrivez vos services dans un fichier ' +
                  'docker-compose.yml ou compose.yaml à la racine de l’application, Eflex les déploie ensemble. ' +
                  'Laravel et PHP sont reconnus.'
                }
              />

              <FeatureCard
                icon={Lock}
                title="HTTPS sans y penser"
                description={
                  "Certificats Let's Encrypt émis automatiquement et vérifiés après chaque déploiement, sur " +
                  "l'adresse fournie par Eflex comme sur votre domaine après vérification DNS."
                }
              />

              <FeatureCard
                icon={KeyRound}
                title="Vos secrets restent hors de Git"
                description={
                  "Déclarez vos variables d'environnement dans Eflex : elles sont chiffrées (AES-256-GCM) et " +
                  'injectées au démarrage, jamais écrites dans le dépôt.'
                }
              />

              <FeatureCard
                icon={Boxes}
                title="Monorepos : une application à la fois"
                description={
                  'pnpm, Turborepo, Nx, Lerna : Eflex repère vos applications et vous demande laquelle publier. ' +
                  "Seule celle-ci est déployée : les dépendances de workspace partagées et les services annexes " +
                  'ne sont pas encore publiés.'
                }
              />

              <FeatureCard icon={FileCode2} title="Vous gardez la main" className="sm:col-span-2 lg:col-span-1">
                <p className="mt-2 text-muted-foreground">
                  Un Dockerfile est utilisé tel quel. Un besoin particulier ? Décrivez-le dans{' '}
                  <code className="font-mono text-sm text-foreground">eflex.json</code>.
                </p>
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* ─── Migration Center : annonce « Bientôt » (MIG-0, #148) ─── */}
        <MigrationTeaser contactEmail={contactEmail} />

        {/* ─── FAQ ─── */}
        <section id="questions" aria-labelledby="questions-titre" className="scroll-mt-20 container py-20 md:py-28">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.6fr]">
            <div className="space-y-8">
              <SectionHeading
                id="questions-titre"
                title="Questions fréquentes"
                lead="Tout ce qu'il faut savoir avant de déployer votre premier projet."
              />
              <div className="max-w-sm space-y-3 rounded-2xl border border-border bg-card p-5">
                <h3 className="text-lg font-semibold">Vous ne trouvez pas votre réponse ?</h3>
                <p className="text-sm text-muted-foreground">Écrivez-nous : nous vous aidons.</p>
                <a
                  href={`mailto:${contactEmail}?subject=Question%20sur%20Eflex`}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-input bg-background px-4 text-sm font-semibold transition-colors hover:bg-secondary hover:text-secondary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Contacter le support
                </a>
              </div>
            </div>
            <div className="divide-y divide-border rounded-2xl border border-border bg-card">
              {faqs.map((item) => (
                <details key={item.q} className="group px-6 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <h3 className="text-base font-medium text-balance">{item.q}</h3>
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pb-5 text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Appel final : bande bleu royal, distinct du hero navy ─── */}
        <section aria-labelledby="appel-titre" className="container pb-20 md:pb-28">
          <div className="grid grid-cols-1 items-center gap-10 rounded-3xl bg-primary px-6 py-12 text-white sm:px-12 md:py-16 lg:grid-cols-[1.2fr_1fr]">
            <div className="space-y-6">
              <h2 id="appel-titre" className="text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl">
                Publiez votre premier projet avec Eflex.
              </h2>
              <p className="text-lg text-white/90 text-pretty">
                Créez un compte, connectez votre dépôt GitHub et laissez Eflex se charger du build, du déploiement et du
                HTTPS. Vous voyez le plan avant la publication.
              </p>
              <div className="flex flex-col gap-4 pt-2 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-eflexnavy transition-[background-color,transform] duration-200 ease-out-expo hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                >
                  Créer mon compte
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-white/70 px-6 text-base font-medium text-white transition-[background-color,border-color,transform] duration-200 ease-out-expo hover:bg-white/15 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary"
                >
                  Se connecter
                </Link>
              </div>
              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">
                {['Gratuit pour commencer', 'Sans carte bancaire', 'Dépôts privés pris en charge'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Illustration du parcours : décorative, l'adresse est un exemple. */}
            <figure aria-hidden="true" className="mx-auto w-full max-w-sm">
              <div className="space-y-3 rounded-2xl bg-eflexnavy p-5 shadow-2xl shadow-black/30 ring-1 ring-white/20">
                <div className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
                </div>
                <ul className="space-y-2.5 text-sm">
                  {['Dépôt connecté', 'Stack détectée', 'Application en ligne'].map((label) => (
                    <li key={label} className="flex items-center gap-2.5 rounded-lg bg-white/[0.06] px-3 py-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-400/20 text-emerald-300">
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      {label}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 rounded-lg border border-emerald-300/30 bg-white/[0.04] px-3 py-2">
                  <Lock className="h-4 w-4 shrink-0 text-emerald-300" aria-hidden="true" />
                  <span className="truncate font-mono text-sm text-white">https://mon-app.exemple.app</span>
                </div>
              </div>
              <figcaption className="mt-3 text-center text-xs text-white">Illustration : parcours type.</figcaption>
            </figure>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
