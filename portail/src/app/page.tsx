import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import type { LucideIcon } from 'lucide-react'
import {
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
} from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'
import { SiteHeader } from '@/components/marketing/site-header'
import { DeployDemo } from '@/components/marketing/deploy-demo'

const stacks = [
  { id: 'nextjs', name: 'Next.js' },
  { id: 'nuxt', name: 'Nuxt' },
  { id: 'astro', name: 'Astro' },
  { id: 'vite', name: 'Vite' },
  { id: 'svelte', name: 'SvelteKit' },
  { id: 'remix', name: 'Remix' },
  { id: 'solidstart', name: 'SolidStart' },
  { id: 'redwoodjs', name: 'RedwoodJS' },
  { id: 'node', name: 'Node.js' },
  { id: 'laravel', name: 'Laravel' },
  { id: 'php', name: 'PHP' },
  { id: 'python', name: 'Python' },
  { id: 'static', name: 'HTML' },
  { id: 'docker', name: 'Docker' },
]

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

const footerLinks = [
  { href: '#fonctionnement', label: 'Fonctionnement' },
  { href: '#fonctionnalites', label: 'Fonctionnalités' },
  { href: '#questions', label: 'Questions' },
  { href: '/status', label: 'Statut' },
  { href: '/login', label: 'Connexion' },
]

function SectionHeading({ id, title, lead }: { id?: string; title: string; lead?: string }) {
  return (
    <div className="max-w-2xl space-y-4">
      <h2 id={id} className="text-display-sm font-bold text-balance">
        {title}
      </h2>
      {lead && <p className="text-lead-lg text-muted-foreground text-pretty">{lead}</p>}
    </div>
  )
}

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
  return (
    <div className="homepage-light flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1">
        {/* ─── Hero : surface pleine largeur navy, preuve produit intégrée ─── */}
        <section className="relative overflow-hidden bg-eflexnavy text-white">
          <div className="container relative grid items-center gap-12 py-16 md:py-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:py-24">
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

              <ul className="flex flex-wrap gap-x-6 gap-y-3 text-sm text-white/80">
                {['HTTPS automatique', 'Dépôts privés pris en charge', 'Secrets chiffrés hors de votre dépôt'].map(
                  (item) => (
                    <li key={item} className="flex items-center gap-2">
                      <Check className="h-4 w-4 shrink-0 text-eflexblue" aria-hidden="true" />
                      {item}
                    </li>
                  ),
                )}
              </ul>
            </div>

            {/* Preuve produit : le démonstrateur de déploiement est logé dans le
                hero (panneau encadré), pas posé comme un widget détaché. */}
            <div className="min-w-0 rounded-3xl bg-white/5 p-3 ring-1 ring-white/10 sm:p-4">
              <DeployDemo />
            </div>
          </div>
        </section>

        {/* ─── Stacks ─── */}
        <section aria-labelledby="stacks-titre" className="border-y border-border bg-card">
          <div className="container py-10 md:py-12">
            <h2 id="stacks-titre" className="text-center text-sm font-semibold text-foreground">
              Les technologies reconnues sans configuration
            </h2>
            <ul className="stacks-grid mt-7 flex flex-wrap items-start justify-center gap-x-5 gap-y-6 sm:grid sm:grid-cols-7 sm:gap-x-4">
              {stacks.map((stack, i) => (
                <li
                  key={stack.id}
                  style={{ '--i': i } as CSSProperties}
                  className="group flex flex-col items-center gap-2 text-center"
                >
                  <FrameworkIcon framework={stack.id} alt="" className="h-8 w-8" />
                  <span className="text-xs text-muted-foreground transition-colors duration-200 ease-out-expo group-hover:text-foreground">
                    {stack.name}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mx-auto mt-7 max-w-2xl text-center text-xs text-muted-foreground text-pretty">
              Laravel est reconnu. Si votre application repose sur plusieurs services, ajoutez un fichier{' '}
              <code className="font-mono">docker-compose.yml</code> ou{' '}
              <code className="font-mono">compose.yaml</code> à la racine de l’application pour les déployer ensemble.
            </p>
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
            title="Du dépôt à l'URL, en trois étapes"
            lead="Vous connectez le dépôt, vous validez ce qu'Eflex a compris, puis l'application est mise en ligne."
          />
          <ol className="grid gap-6 md:grid-cols-3">
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
                </li>
              )
            })}
          </ol>
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

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
                title="Laravel détecté, PHP déployé"
                description={
                  "Laravel et PHP sont reconnus. Un plan Laravel multi-services généré sans compose fourni est refusé : " +
                  "ajoutez un fichier `docker-compose.yml`/`compose.yaml` au dépôt pour déployer vos services (files " +
                  "d'attente, planificateur, etc.) via compose fourni (D1). Les applications PHP simples passent en ligne " +
                  "dès aujourd'hui."
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

        {/* ─── FAQ ─── */}
        <section id="questions" aria-labelledby="questions-titre" className="scroll-mt-20 container py-20 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
            <SectionHeading
              id="questions-titre"
              title="Questions fréquentes"
              lead="Tout ce qu'il faut savoir avant de déployer votre premier projet."
            />
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
          <div className="rounded-3xl bg-primary px-6 py-14 text-center text-white sm:px-12 md:py-20">
            <div className="mx-auto max-w-2xl space-y-6">
              <h2 id="appel-titre" className="text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl">
                Publiez votre premier projet.
              </h2>
              <p className="text-lg text-white/90 text-pretty">
                Créez un compte, branchez votre dépôt GitHub : Eflex analyse la stack et vous montre le plan avant la
                publication.
              </p>
              <div className="flex flex-col items-center gap-4 pt-2 sm:flex-row sm:justify-center">
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
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="container flex flex-col gap-8 py-10 sm:flex-row sm:items-start sm:justify-between sm:py-12">
          <div className="max-w-xs space-y-3">
            <Image src="/logo-horizontal.webp" alt="Eflex" width={1200} height={312} className="h-6 w-auto" />
            <p className="text-sm text-muted-foreground">Le déploiement depuis Git, sans DevOps.</p>
          </div>
          <nav aria-label="Pied de page" className="flex flex-wrap gap-x-6 gap-y-1 sm:justify-end">
            {footerLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="inline-flex min-h-11 items-center rounded-lg text-sm text-muted-foreground transition-colors duration-200 ease-out-expo hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="container border-t border-border py-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Eflex. Tous droits réservés.
        </div>
      </footer>
    </div>
  )
}
