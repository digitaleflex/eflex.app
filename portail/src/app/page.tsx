import type { CSSProperties } from 'react'
import Link from 'next/link'
import { ArrowRight, GitBranch, Globe, Rocket, ShieldCheck } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { DeployDemo } from '@/components/marketing/deploy-demo'
import { HeroProof } from '@/components/marketing/hero-proof'
import { TechStack } from '@/components/marketing/tech-stack'
import { DetectionShowcase } from '@/components/marketing/detection-showcase'
import { DeploymentPipeline } from '@/components/marketing/deployment-pipeline'
import { InfrastructureDiagram } from '@/components/marketing/infrastructure-diagram'
import { OperationsBento } from '@/components/marketing/operations-bento'
import { MigrationTeaser } from '@/components/marketing/migration-teaser'
import { AgencyOverview } from '@/components/marketing/agency-overview'
import { FaqSection } from '@/components/marketing/faq-section'
import { FinalCta } from '@/components/marketing/final-cta'
import { getLegalCompanyInfo } from '@/lib/legal-info'

const heroProofItems = [
  { icon: GitBranch, label: 'Connexion GitHub' },
  { icon: ShieldCheck, label: 'Analyse automatisée des dépôts' },
  { icon: Rocket, label: 'Gestion des déploiements' },
  { icon: Globe, label: 'Domaines et HTTPS' },
]

export default function HomePage() {
  const { email: contactEmail } = getLegalCompanyInfo()

  return (
    <div className="homepage-light flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1">
        {/* ─── 01. Hero ─── */}
        <section className="surface-navy relative overflow-hidden bg-eflexnavy text-white">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,hsl(var(--eflex-royalblue)/0.35),transparent)]"
          />
          <div className="container relative pb-14 pt-14 sm:pb-18 sm:pt-18 md:pb-22 md:pt-20">
            <div className="mx-auto max-w-4xl text-center">
              <p className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-1.5 text-sm font-medium text-white/90">
                Déploiement continu simplifié
              </p>
              <h1 className="mt-6 animate-reveal text-display font-extrabold tracking-tight text-balance text-white">
                Du code à la production.
                <span className="block">Sans complexité.</span>
              </h1>
              <p
                className="mx-auto mt-6 max-w-2xl animate-reveal text-lead-lg text-white/75 text-pretty"
                style={{ '--d': '80ms' } as CSSProperties}
              >
                Connectez votre dépôt GitHub, laissez EFLEX analyser, construire et déployer votre application, puis suivez son
                exploitation depuis un même espace.
              </p>
              <div
                className="mt-9 flex animate-reveal flex-col justify-center gap-3 sm:flex-row"
                style={{ '--d': '160ms' } as CSSProperties}
              >
                <Link
                  href="/register"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 text-base font-semibold text-eflexnavy transition-[background-color,transform] duration-200 ease-out-expo hover:bg-white/92 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
                >
                  Déployer mon projet
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="#fonctionnement"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/30 px-6 text-base font-semibold text-white transition-[background-color,border-color,transform] duration-200 ease-out-expo hover:bg-white/10 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
                >
                  Découvrir la plateforme
                </Link>
              </div>

              <div className="mt-8 animate-reveal" style={{ '--d': '220ms' } as CSSProperties}>
                <HeroProof items={heroProofItems} className="text-white/75" iconClassName="text-eflexsky" />
              </div>
            </div>

            <div className="animate-reveal" style={{ '--d': '300ms' } as CSSProperties}>
              <DeployDemo />
            </div>
          </div>
        </section>

        {/* ─── 02. Technologies ─── */}
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
            <TechStack />
          </div>
        </section>

        {/* ─── 03. Intelligence ─── */}
        <DetectionShowcase />

        {/* ─── 04. Déploiement / Fonctionnement ─── */}
        <DeploymentPipeline />

        {/* ─── 05. Infrastructure ─── */}
        <InfrastructureDiagram />

        {/* ─── 06. Operations / Fonctionnalités ─── */}
        <OperationsBento />

        {/* ─── 07. Agences ─── */}
        <AgencyOverview />

        <MigrationTeaser contactEmail={contactEmail} />

        {/* ─── 08. FAQ ─── */}
        <FaqSection contactEmail={contactEmail} />

        {/* ─── 09. CTA final ─── */}
        <FinalCta />
      </main>

      <SiteFooter />
    </div>
  )
}
