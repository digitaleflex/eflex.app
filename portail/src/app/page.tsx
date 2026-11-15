import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { ArrowRight, Check, Database, GitBranch, Lock, ScrollText, ShieldCheck } from 'lucide-react'
import { FrameworkIcon } from '@/components/framework-icon'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { DeployDemo } from '@/components/marketing/deploy-demo'
import { TechMarquee } from '@/components/marketing/tech-marquee'
import { MigrationTeaser } from '@/components/marketing/migration-teaser'
import { GithubMark } from '@/components/icons/github-mark'
import { getLegalCompanyInfo } from '@/lib/legal-info'
import { LinkButton } from '@/components/link-button'

const faqs = [
  {
    q: 'Quelles technologies sont prises en charge ?',
    a: "Next.js, Nuxt, Astro, Vite, SvelteKit, Remix, SolidStart, RedwoodJS, Node.js (Express, Fastify, NestJS…), PHP, Python (Django, FastAPI, Flask) et les sites HTML statiques. Laravel est reconnu ; si votre application nécessite plusieurs services (par exemple web, file d’attente, planificateur), ajoutez un fichier `docker-compose.yml` ou `compose.yaml` à la racine de l’application. Un Dockerfile existant est aussi utilisé tel quel.",
  },
  {
    q: 'Dois-je écrire un Dockerfile ?',
    a: "Non. EFLEX déduit la configuration de votre dépôt. Si vous en avez déjà un, il est utilisé tel quel : c'est vous qui gardez la main.",
  },
  {
    q: "Où sont stockées mes variables d'environnement ?",
    a: "Dans EFLEX, jamais dans votre dépôt. Elles sont chiffrées en base (AES-256-GCM), transmises à l'application au démarrage et ne s'affichent plus une fois enregistrées.",
  },
  {
    q: 'Mes dépôts privés sont-ils compatibles ?',
    a: "Oui. Connectez la GitHub App (recommandée) ou ajoutez un jeton personnel dans Paramètres → Connexion GitHub. EFLEX lit le dépôt avec un accès à durée limitée et crée une clé de déploiement en lecture seule.",
  },
  {
    q: "Qu'est-ce qui n'est pas encore pris en charge ?",
    a: "Les applications qui nécessitent plusieurs services sans fichier `docker-compose.yml`/`compose.yaml` fourni ne peuvent pas encore être déployées automatiquement. La conservation garantie des données stockées sur disque entre déploiements (fichiers uploadés, certains stockages locaux) dépend de la configuration de l’infrastructure et peut ne pas être disponible. Les métriques détaillées (CPU/mémoire dans le temps, stockage, bande passante) ne sont pas toutes disponibles pour l’instant.",
  },
]



function SectionHeading({ id, title, lead }: { id?: string; title: ReactNode; lead?: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 text-center">
      <h2 id={id} className="text-display-sm font-extrabold tracking-tight text-balance">
        {title}
      </h2>
      {lead && <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">{lead}</p>}
    </div>
  )
}

/** Carte d'étape : une petite scène décorative en haut, le texte en bas. */
function StepCard({ index, title, text, children }: { index: number; title: string; text: string; children: ReactNode }) {
  return (
    <li
      className="reveal-on-view flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-[transform,box-shadow,border-color] duration-300 ease-out-expo hover:-translate-y-1 hover:border-primary/30 hover:shadow-lg"
      style={{ '--i': index } as CSSProperties}
    >
      <div aria-hidden="true" className="flex h-52 flex-col justify-center gap-2.5 border-b border-border bg-muted/60 p-6">
        {children}
      </div>
      <div className="p-6 pb-7">
        <span className="font-mono text-sm font-semibold text-primary" aria-hidden="true">
          0{index + 1}
        </span>
        <h3 className="mt-2.5 text-xl font-bold tracking-tight">{title}</h3>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </li>
  )
}

function RepoRow({ name, selected = false }: { name: string; selected?: boolean }) {
  return (
    <div
      className={
        selected
          ? 'flex items-center gap-2.5 rounded-xl border border-primary bg-card px-3 py-2.5 shadow-md'
          : 'flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 opacity-70'
      }
    >
      <GithubMark className="h-4 w-4 shrink-0 text-foreground" />
      <span className="min-w-0 flex-1 truncate font-mono text-sm">{name}</span>
      {selected && (
        <span className="rounded-md bg-primary px-2.5 py-1 text-xs font-bold text-primary-foreground">Importer</span>
      )}
    </div>
  )
}

function DetectedRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 text-sm">
      <Check className="h-4 w-4 shrink-0 text-success" strokeWidth={3} />
      <span className="w-24 text-muted-foreground">{label}</span>
      <span className="truncate font-mono">{value}</span>
    </div>
  )
}

const proofPoints = [
  'HTTPS et certificats automatiques',
  'Journaux de build et d’exécution en direct',
  'Variables chiffrées (AES-256-GCM)',
  'PostgreSQL et Redis en un clic',
]

const features: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: GitBranch,
    title: 'Déploiement à chaque push',
    text: 'Poussez sur votre branche de production : la nouvelle version est publiée automatiquement.',
  },
  {
    icon: Lock,
    title: 'HTTPS et domaines',
    text: 'Une adresse offerte par projet, vos domaines et des certificats émis automatiquement.',
  },
  {
    icon: ScrollText,
    title: 'Journaux en direct',
    text: 'Suivez le build et l’exécution en temps réel, avec les secrets masqués.',
  },
  {
    icon: Database,
    title: 'Bases de données',
    text: 'Une base PostgreSQL ou Redis par projet, créée et branchée à votre application.',
  },
]

export default function HomePage() {
  // Même source que le pied de page : une seule adresse de contact à maintenir.
  const { email: contactEmail } = getLegalCompanyInfo()
  return (
    <div className="homepage-light flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1">
        {/* ─── Hero : promesse forte, preuves concrètes, démonstration de la console ─── */}
        <section className="container pb-16 pt-14 text-center md:pb-24 md:pt-20">
          <h1 className="mx-auto max-w-4xl animate-reveal text-display font-extrabold tracking-tight text-balance">
            Déployez votre application depuis GitHub, sans gérer de serveur.
          </h1>
          <p
            className="mx-auto mt-6 max-w-2xl animate-reveal text-lead-lg text-muted-foreground text-pretty"
            style={{ '--d': '80ms' } as CSSProperties}
          >
            EFLEX détecte votre stack, construit votre projet et le met en ligne avec HTTPS. Vous suivez le build
            et l’exécution depuis la console.
          </p>
          <div
            className="mt-9 flex animate-reveal flex-col justify-center gap-3 sm:flex-row"
            style={{ '--d': '160ms' } as CSSProperties}
          >
            <LinkButton href="/register" size="lg" className="group gap-2 px-6 text-base font-semibold shadow-primary">
              Commencer gratuitement
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </LinkButton>
            <Link
              href="#fonctionnement"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card px-6 text-base font-semibold transition-[background-color,transform] duration-200 ease-out-expo hover:bg-secondary active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              Voir un déploiement
            </Link>
          </div>
          <ul
            className="mx-auto mt-7 flex max-w-4xl animate-reveal flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm text-muted-foreground"
            style={{ '--d': '220ms' } as CSSProperties}
            aria-label="Ce qu’EFLEX prend en charge"
          >
            {proofPoints.map((point) => (
              <li key={point} className="inline-flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 animate-reveal text-sm text-muted-foreground" style={{ '--d': '260ms' } as CSSProperties}>
            Gratuit pour commencer · Aucune carte demandée
          </p>

          <div className="animate-reveal" style={{ '--d': '320ms' } as CSSProperties}>
            <DeployDemo />
          </div>
        </section>

        {/* ─── Technologies : défilé continu ─── */}
        <section
          id="technologies"
          aria-labelledby="technologies-titre"
          className="scroll-mt-20 overflow-hidden border-y border-border bg-muted/50 py-16 md:py-24"
        >
          <div className="container mb-10">
            <SectionHeading
              id="technologies-titre"
              title="Votre stack est reconnue, sans configuration"
              lead="EFLEX lit votre dépôt et propose la commande de build, le démarrage et le port. Vous relisez, c’est tout."
            />
          </div>
          <TechMarquee />
          <p className="container mt-8 max-w-3xl text-center text-sm text-muted-foreground text-pretty">
            Un Dockerfile, un <code className="font-mono">docker-compose.yml</code> ou un{' '}
            <code className="font-mono">eflex.json</code> dans votre dépôt ? EFLEX l’utilise tel quel. Les technologies
            marquées « Bientôt » arrivent prochainement.
          </p>
        </section>

        {/* ─── Fonctionnement : trois cartes, chacune montre ce qui se passe ─── */}
        <section id="fonctionnement" aria-labelledby="fonctionnement-titre" className="scroll-mt-20 container py-20 md:py-28">
          <SectionHeading
            id="fonctionnement-titre"
            title="De votre dépôt à la production, sans friction."
            lead="Pas de serveur à configurer, pas de pipeline à écrire. Vous gardez votre code, EFLEX s’occupe de l’infrastructure."
          />
          <ol className="mt-14 grid grid-cols-1 gap-5 md:grid-cols-3">
            <StepCard
              index={0}
              title="Connectez votre dépôt"
              text="Autorisez GitHub une fois, puis choisissez le dépôt à mettre en ligne, public ou privé."
            >
              <RepoRow name="mon-equipe/boutique" selected />
              <RepoRow name="mon-equipe/api" />
              <RepoRow name="mon-equipe/blog" />
            </StepCard>
            <StepCard
              index={1}
              title="EFLEX configure pour vous"
              text="La stack, les commandes et le port sont reconnus automatiquement. Vous vérifiez, ajoutez vos variables, c’est prêt."
            >
              <span className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-3 py-1.5 text-sm font-bold">
                <FrameworkIcon framework="nextjs" alt="" className="h-5 w-5" />
                Next.js détecté
              </span>
              <DetectedRow label="Installation" value="pnpm install" />
              <DetectedRow label="Build" value="pnpm build" />
              <DetectedRow label="Démarrage" value="pnpm start · 3000" />
            </StepCard>
            <StepCard
              index={2}
              title="Votre application est en ligne"
              text="Une adresse sécurisée en HTTPS, prête à partager. Chaque push publie automatiquement la nouvelle version."
            >
              <span className="inline-flex items-center gap-2.5 self-start rounded-xl border border-border bg-card px-4 py-3 shadow-md">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="demo-ping absolute inline-flex h-full w-full rounded-full bg-success/60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                </span>
                <span className="font-mono text-sm">boutique.exemple.app</span>
              </span>
              <span className="flex flex-wrap gap-2 text-xs font-semibold">
                <span className="rounded-full bg-success/10 px-2.5 py-1 text-success">HTTPS actif</span>
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-primary">Mis à jour à chaque push</span>
              </span>
            </StepCard>
          </ol>
        </section>

        {/* ─── Fonctionnalités : points clés, visuellement plus légers que le parcours ─── */}
        <section
          id="fonctionnalites"
          aria-labelledby="fonctionnalites-titre"
          className="scroll-mt-20 border-y border-border bg-muted/50"
        >
          <div className="container py-16 md:py-24">
            <SectionHeading
              id="fonctionnalites-titre"
              title="L’essentiel pour la mise en production"
              lead="Le parcours de déploiement reste au centre ; ces capacités sont prêtes pour chaque projet."
            />
            <ul className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2">
              {features.map((item, i) => (
                <li
                  key={item.title}
                  className="reveal-on-view flex gap-4 rounded-2xl border border-border bg-card p-5"
                  style={{ '--i': i % 2 } as CSSProperties}
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                  </div>
                </li>
              ))}
            </ul>
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

        {/* ─── Appel final : bande navy ─── */}
        <section aria-labelledby="appel-titre" className="container pb-20 md:pb-28">
          <div className="surface-navy rounded-3xl bg-eflexnavy px-6 py-16 text-center text-white sm:px-12 md:py-20">
            <h2 id="appel-titre" className="mx-auto max-w-3xl text-display-sm font-extrabold tracking-tight text-balance text-white">
              Mettez votre projet en ligne aujourd’hui.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-white/80 text-pretty">
              Créez un compte, connectez GitHub et déployez votre premier projet. Gratuit pour commencer.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-eflexnavy transition-[background-color,transform] duration-200 ease-out-expo hover:bg-white/90 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
              >
                Créer mon compte
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-white/40 px-6 text-base font-semibold text-white transition-[background-color,transform] duration-200 ease-out-expo hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
              >
                Se connecter
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
