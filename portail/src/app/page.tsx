import type { CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight, PlayCircle } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { TechMarquee } from '@/components/marketing/tech-marquee'
import { DetectionShowcase } from '@/components/marketing/detection-showcase'
import { DeploymentPipeline } from '@/components/marketing/deployment-pipeline'
import { InfrastructureDiagram } from '@/components/marketing/infrastructure-diagram'
import { OperationsBento } from '@/components/marketing/operations-bento'
import { MigrationTeaser } from '@/components/marketing/migration-teaser'
import { AgencyOverview } from '@/components/marketing/agency-overview'
import { FaqSection } from '@/components/marketing/faq-section'
import { FinalCta } from '@/components/marketing/final-cta'
import { getLegalCompanyInfo } from '@/lib/legal-info'

export default function HomePage() {
  const { email: contactEmail } = getLegalCompanyInfo()

  return (
    <div className="homepage-light flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1">
        <section
          aria-labelledby="hero-titre"
          className="relative overflow-hidden border-b border-border/60 bg-background"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,hsl(var(--primary)/0.10),transparent_70%)]"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute left-1/2 top-0 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl"
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
            </div>
          </div>
        </section>

        {/* ─── Zones suivantes ─── */}
        <section id="technologies" aria-labelledby="technologies-titre" className="scroll-mt-20 py-16 md:py-24">
            <div className="container">
              <div className="mx-auto max-w-3xl space-y-4 text-center">
                <h2 id="technologies-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                  Votre stack. Votre workflow. EFLEX.
                </h2>
                <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                  EFLEX analyse vos projets et prépare leur déploiement selon leur configuration.
                </p>
              </div>
              <div className="mt-10 md:mt-12">
              <TechMarquee />
              <p className="mx-auto mt-6 max-w-3xl text-center text-sm leading-relaxed text-muted-foreground text-pretty">
                Un <code className="font-mono text-xs">Dockerfile</code>, un <code className="font-mono text-xs">docker-compose.yml</code> ou un{' '}
                <code className="font-mono text-xs">eflex.json</code> dans votre dépôt ? EFLEX l’utilise tel quel.
              </p>
            </div>
            </div>
          </section>

          <DetectionShowcase />
          <DeploymentPipeline />
          <InfrastructureDiagram />
          <OperationsBento />
          <AgencyOverview />
          <MigrationTeaser contactEmail={contactEmail} />
          <FaqSection contactEmail={contactEmail} />
        <FinalCta />

        <SiteFooter />
      </main>
    </div>
  )
}
