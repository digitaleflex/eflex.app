import type { CSSProperties } from 'react'
import Link from 'next/link'
import Image from 'next/image'
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
    a: 'Next.js, Nuxt, Astro, Vite, SvelteKit, Remix, SolidStart, RedwoodJS, Node.js (Express, Fastify, NestJS…), Laravel, PHP, Python (Django, FastAPI, Flask) et les sites HTML statiques. Pour tout le reste, un Dockerfile suffit.',
  },
  {
    q: 'Dois-je écrire un Dockerfile ?',
    a: "Non. Eflex déduit la configuration de votre dépôt. Si vous en avez déjà un, il est utilisé tel quel : c'est vous qui gardez la main.",
  },
  {
    q: "Que se passe-t-il si Eflex se trompe de stack ?",
    a: "Vous pouvez forcer le framework à la création du projet, ou ajouter un fichier eflex.json à la racine du dépôt. Ce fichier a toujours priorité sur la détection automatique.",
  },
  {
    q: "Où sont stockées mes variables d'environnement ?",
    a: "Dans Eflex, jamais dans votre dépôt. Elles sont transmises à l'application au moment du déploiement et ne s'affichent plus une fois enregistrées.",
  },
  {
    q: 'Mes dépôts privés sont-ils compatibles ?',
    a: 'Pas encore. Pour le moment, Eflex déploie les dépôts GitHub publics. La connexion à votre compte GitHub pour les dépôts privés est en préparation.',
  },
  {
    q: 'Mon dépôt contient plusieurs applications. Ça marche ?',
    a: "Oui. Eflex reconnaît les monorepos (pnpm, Turborepo, Nx, Lerna…). S'il trouve plusieurs applications, il vous demande laquelle publier.",
  },
]

function SectionHeading({ title, lead }: { title: string; lead?: string }) {
  return (
    <div className="max-w-2xl space-y-4">
      <h2 className="text-display-sm font-bold text-balance">{title}</h2>
      {lead && <p className="text-lead-lg text-muted-foreground text-pretty">{lead}</p>}
    </div>
  )
}

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenu" className="flex-1">
        {/* ─── Hero ─── */}
        <section className="relative overflow-hidden">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_70%_0%,hsl(var(--primary)/0.12),transparent),radial-gradient(40%_40%_at_0%_30%,hsl(var(--eflex-sky)/0.10),transparent)]"
          />
          <div className="container relative grid items-center gap-12 py-16 md:py-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
            <div className="space-y-9 animate-reveal">
              <div className="space-y-5">
                <h1 className="text-display font-bold text-balance">
                  Poussez votre code.{' '}
                  <span className="text-primary">Eflex le met en ligne.</span>
                </h1>
                <p className="max-w-xl text-lead-lg text-muted-foreground text-pretty">
                  Indiquez votre dépôt GitHub : Eflex reconnaît la stack, construit l&apos;application et la publie
                  en HTTPS. Pas de serveur à configurer, pas de Dockerfile à écrire.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-medium text-primary-foreground shadow-primary transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Déployer un projet
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
                <Link
                  href="#fonctionnement"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-input bg-background px-6 text-base font-medium transition-[background-color,border-color,transform] duration-200 ease-out-expo hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Voir comment ça marche
                </Link>
              </div>

              <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                {['HTTPS automatique', 'Dockerfile facultatif', 'Secrets hors de votre dépôt'].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="relative lg:pl-4">
              <DeployDemo />
            </div>
          </div>
        </section>

        {/* ─── Stacks ─── */}
        <section aria-labelledby="stacks-titre" className="border-y border-border bg-card">
          <div className="container py-10">
            <h2 id="stacks-titre" className="text-center text-sm font-medium text-muted-foreground">
              Les technologies reconnues sans configuration
            </h2>
            <ul className="stacks-grid mt-6 grid grid-cols-4 gap-x-4 gap-y-6 sm:grid-cols-7">
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
          </div>
        </section>

        {/* ─── Fonctionnement ─── */}
        <section id="fonctionnement" className="scroll-mt-20 container py-20 md:py-28 space-y-12">
          <SectionHeading
            title="Du dépôt à l'URL, en trois étapes"
            lead="Pas de serveur à préparer ni de pipeline à écrire. Vous gardez le contrôle à chaque étape."
          />
          <ol className="grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => {
              const Icon = step.icon
              return (
                <li key={step.title} className="relative rounded-2xl border border-border bg-card p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <span className="font-mono text-sm text-muted-foreground" aria-hidden="true">0{i + 1}</span>
                  </div>
                  <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
                  <p className="mt-2 text-muted-foreground">{step.text}</p>
                </li>
              )
            })}
          </ol>
        </section>

        {/* ─── Fonctionnalités ─── */}
        <section id="fonctionnalites" className="scroll-mt-20 bg-muted/50 border-y border-border">
          <div className="container py-20 md:py-28 space-y-12">
            <SectionHeading
              title="Pensé pour les vrais projets, pas seulement pour les démos"
              lead="Files d'attente, tâches planifiées, migrations, monorepos : Eflex gère ce que les autres plateformes vous laissent configurer."
            />

            <div className="grid gap-6 lg:grid-cols-3">
              {/* Carte principale : détection expliquée */}
              <article className="rounded-2xl border border-border bg-card p-6 shadow-sm lg:col-span-2 lg:row-span-2 flex flex-col">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <SearchCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-xl font-semibold">Des choix expliqués, pas une boîte noire</h3>
                <p className="mt-2 max-w-xl text-muted-foreground">
                  Eflex vous montre ce qu&apos;il a trouvé dans votre dépôt et pourquoi. En cas de doute, il vous pose la
                  question au lieu de deviner.
                </p>
                <div className="mt-6 flex-1 rounded-xl border border-border bg-muted/40 p-5 font-mono text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 font-sans font-semibold">
                      <FrameworkIcon framework="nextjs" alt="" className="h-5 w-5" />
                      Next.js · node@22
                    </span>
                    <span className="rounded-full bg-success/10 px-2.5 py-0.5 font-sans text-xs font-medium text-success">
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
                    Conseil : activez <code className="font-mono">output: &apos;standalone&apos;</code> dans next.config pour un démarrage plus rapide.
                  </p>
                </div>
              </article>

              <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Layers className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">Laravel, au complet</h3>
                <p className="mt-2 text-muted-foreground">
                  PHP-FPM et Nginx, files d&apos;attente, planificateur, migrations et mise en cache à chaque déploiement.
                </p>
              </article>

              <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Lock className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">HTTPS sans y penser</h3>
                <p className="mt-2 text-muted-foreground">
                  Certificats Let&apos;s Encrypt émis et renouvelés automatiquement, sur votre domaine.
                </p>
              </article>

              <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <KeyRound className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">Vos secrets restent hors de Git</h3>
                <p className="mt-2 text-muted-foreground">
                  Déclarez vos variables d&apos;environnement dans Eflex : elles sont injectées au démarrage, jamais écrites dans le dépôt.
                </p>
              </article>

              <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Boxes className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">Monorepos compris</h3>
                <p className="mt-2 text-muted-foreground">
                  pnpm, Turborepo, Nx, Lerna : Eflex repère vos applications et vous demande laquelle publier.
                </p>
              </article>

              <article className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <FileCode2 className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">Vous gardez la main</h3>
                <p className="mt-2 text-muted-foreground">
                  Un Dockerfile est utilisé tel quel. Un besoin particulier ? Décrivez-le dans <code className="font-mono text-sm text-foreground">eflex.json</code>.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section id="questions" className="scroll-mt-20 container py-20 md:py-28">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.6fr]">
            <SectionHeading
              title="Questions fréquentes"
              lead="Tout ce qu'il faut savoir avant de déployer votre premier projet."
            />
            <div className="divide-y divide-border rounded-2xl border border-border bg-card">
              {faqs.map((item) => (
                <details key={item.q} className="group px-6 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                    {item.q}
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

        {/* ─── Appel final ─── */}
        <section className="container pb-20 md:pb-28">
          <div className="relative overflow-hidden rounded-2xl bg-eflexnavy px-6 py-14 text-center text-white sm:px-12 md:py-20">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_80%_at_50%_120%,hsl(var(--primary)/0.55),transparent)]"
            />
            <div className="relative mx-auto max-w-2xl space-y-6">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl text-balance">
                Votre prochain projet mérite mieux qu&apos;un serveur à configurer.
              </h2>
              <p className="text-lg text-white/75">
                Créez un compte, collez l&apos;URL de votre dépôt : Eflex s&apos;occupe du reste.
              </p>
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-medium text-eflexnavy shadow-md transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
              >
                Créer mon compte
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="container flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-2">
            <Image src="/logo-horizontal.webp" alt="Eflex" width={1200} height={312} className="h-6 w-auto" />
            <p className="text-sm text-muted-foreground">Le déploiement depuis Git, sans DevOps.</p>
          </div>
          <nav aria-label="Pied de page" className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
            <Link href="#fonctionnement" className="hover:text-foreground">Fonctionnement</Link>
            <Link href="#fonctionnalites" className="hover:text-foreground">Fonctionnalités</Link>
            <Link href="#questions" className="hover:text-foreground">Questions</Link>
            <Link href="/status" className="hover:text-foreground">Statut</Link>
            <Link href="/login" className="hover:text-foreground">Connexion</Link>
          </nav>
        </div>
        <div className="container border-t border-border py-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Eflex. Tous droits réservés.
        </div>
      </footer>
    </div>
  )
}
