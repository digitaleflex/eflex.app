import type { CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight, Database, GitBranch, Lock, PlayCircle, ScrollText } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { TechMarquee } from '@/components/marketing/tech-marquee'
import { JourneyDemo } from '@/components/marketing/journey-demo'
import { FinalCta } from '@/components/marketing/final-cta'
import { getLegalCompanyInfo } from '@/lib/legal-info'

const capabilities = [
  {
    icon: GitBranch,
    title: 'Déploiement depuis GitHub',
    text: 'Connectez un dépôt, lancez un déploiement et suivez l’évolution de votre application.',
  },
  {
    icon: Lock,
    title: 'HTTPS et domaines',
    text: 'Adresse EFLEX fournie et domaines personnalisés selon la configuration de votre projet.',
  },
  {
    icon: ScrollText,
    title: 'Journaux de build et d’exécution',
    text: 'Consultez les logs pour comprendre un déploiement ou diagnostiquer une erreur.',
  },
  {
    icon: Database,
    title: 'Configuration et données',
    text: 'Variables chiffrées et bases managées PostgreSQL/Redis selon les besoins du projet.',
  },
]

const faqs = [
  {
    q: 'Dois-je configurer un serveur ?',
    a: 'Non. EFLEX prend en charge la construction et la mise en ligne des projets compatibles. Vous gardez le contrôle sur la configuration de votre application.',
  },
  {
    q: 'Quelles technologies sont prises en charge ?',
    a: 'EFLEX détecte notamment Next.js, Nuxt, Astro, Vite, SvelteKit, Remix, SolidStart, RedwoodJS, Node.js, PHP, Python et les sites statiques. Un Dockerfile ou un docker-compose.yml peut aussi être utilisé tel quel.',
  },
  {
    q: 'Que se passe-t-il si un déploiement échoue ?',
    a: 'Le déploiement est marqué en échec et les journaux restent disponibles pour identifier la cause. L’application déjà en ligne reste en place tant qu’un nouveau déploiement réussi ne la remplace pas.',
  },
]

export default function HomePage() {
  const { email: contactEmail } = getLegalCompanyInfo()

  return (
    <div className="homepage-light flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1">
        {/* ─── Hero ─── */}
        <section
          aria-labelledby="hero-titre"
          className="hero-surface relative overflow-hidden border-b border-border/60 bg-background"
        >
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid opacity-60" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_50%_-10%,hsl(var(--primary)/0.14),transparent_68%)]"
          />
          <div aria-hidden="true" className="hero-orb hero-orb-a" />
          <div aria-hidden="true" className="hero-orb hero-orb-b" />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent"
          />

          <div className="container relative py-16 sm:py-20 md:py-24 lg:py-28">
            <div className="mx-auto w-full max-w-[980px] text-center">
              <p className="animate-reveal inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary sm:text-[13px]">
                <span aria-hidden="true" className="h-px w-6 bg-primary/60 sm:w-8" />
                Plateforme de déploiement et d’exploitation
                <span aria-hidden="true" className="h-px w-6 bg-primary/60 sm:w-8" />
              </p>

              <h1
                id="hero-titre"
                className="mt-7 animate-reveal text-balance font-extrabold tracking-tight text-foreground [font-size:clamp(2.75rem,7vw,5.5rem)] [line-height:1.02]"
                style={{ '--d': '70ms' } as CSSProperties}
              >
                <span className="block">Concentrez-vous sur votre code.</span>
                <span className="mt-1 block sm:mt-2">
                  <span className="text-primary">EFLEX</span> simplifie le reste.
                </span>
              </h1>

              <p
                className="mx-auto mt-7 max-w-2xl animate-reveal text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl"
                style={{ '--d': '140ms' } as CSSProperties}
              >
                Déployez vos applications et centralisez leur gestion depuis une seule plateforme.
              </p>

              <div
                className="mt-10 flex animate-reveal flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4"
                style={{ '--d': '210ms' } as CSSProperties}
              >
                <Link
                  href="/register"
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-7 text-base font-semibold text-primary-foreground shadow-primary transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
                >
                  Découvrir EFLEX
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="#fonctionnement"
                  className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-input bg-background/60 px-7 text-base font-semibold text-foreground transition-[background-color,border-color,color,transform] duration-200 ease-out-expo hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background sm:w-auto"
                >
                  <PlayCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Voir comment ça fonctionne
                </Link>
              </div>

              <p className="mt-8 text-sm text-muted-foreground">
                Analyse en lecture seule · HTTPS automatique · Journaux et configuration centralisés
              </p>
            </div>
          </div>
        </section>

        {/* ─── Technologies ─── */}
        <section id="technologies" aria-labelledby="technologies-titre" className="scroll-mt-20 py-16 md:py-20">
          <div className="container">
            <div className="mx-auto max-w-3xl space-y-4 text-center">
              <h2 id="technologies-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                Compatible avec votre stack
              </h2>
              <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                EFLEX détecte votre projet et vous aide à le mettre en ligne rapidement.
              </p>
            </div>
            <div className="mt-10">
              <TechMarquee />
            </div>
          </div>
        </section>

        {/* ─── Fonctionnement ─── */}
        <section id="fonctionnement" aria-labelledby="fonctionnement-titre" className="scroll-mt-20 border-y border-border bg-muted/30 py-16 md:py-24">
          <div className="container">
            <div className="mx-auto max-w-3xl space-y-4 text-center">
              <h2 id="fonctionnement-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                Du dépôt à la production, sans complexité inutile.
              </h2>
              <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                Connectez votre dépôt. EFLEX analyse votre projet, prépare son déploiement et vous permet d’en suivre les étapes depuis un seul espace.
              </p>
            </div>
            <JourneyDemo />
          </div>
        </section>

        {/* ─── Fonctionnalités ─── */}
        <section id="fonctionnalites" aria-labelledby="fonctionnalites-titre" className="scroll-mt-20 py-16 md:py-24">
          <div className="container">
            <div className="mx-auto max-w-3xl space-y-4 text-center">
              <h2 id="fonctionnalites-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                L’essentiel pour déployer sereinement
              </h2>
              <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                Les fonctionnalités clés pour mettre en ligne, sécuriser et suivre vos applications.
              </p>
            </div>

            <ul className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
              {capabilities.map((item) => (
                <li key={item.title} className="rounded-2xl border border-border bg-card p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                </li>
              ))}
            </ul>

            <div className="mt-10 flex justify-center">
              <Link
                href="/docs"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Voir la documentation
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        {/* ─── Questions ─── */}
        <section id="questions" aria-labelledby="questions-titre" className="scroll-mt-20 border-t border-border bg-muted/20 py-16 md:py-24">
          <div className="container">
            <div className="mx-auto max-w-3xl space-y-4 text-center">
              <h2 id="questions-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                Questions fréquentes
              </h2>
              <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                L’essentiel avant de commencer. Les détails techniques sont dans la documentation.
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card">
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

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Besoin d’aide ?{' '}
              <a href={`mailto:${contactEmail}?subject=Question%20sur%20EFLEX`} className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                Contacter le support
              </a>
            </p>
          </div>
        </section>

        {/* ─── Appel final ─── */}
        <FinalCta />
        <SiteFooter />
      </main>
    </div>
  )
}
