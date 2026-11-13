import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, CalendarDays, FileText, Smartphone } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { PricingPlanCard } from '@/components/marketing/pricing-plan-card'
import { PricingComparison } from '@/components/marketing/pricing-comparison'
import { BILLING_TERMS, pricingPlans } from '@/lib/pricing-view'

export const metadata: Metadata = {
  title: 'Tarifs — Eflex',
  description:
    'Les plans Eflex en francs CFA : Découverte gratuit, puis Starter, Pro et Agence. Paiement par mobile money, période de 30 jours, sans prélèvement automatique.',
}

const { periodDays, graceDays } = BILLING_TERMS

const paymentFacts = [
  {
    icon: Smartphone,
    title: 'Mobile money',
    text: 'Le paiement se fait en ligne par mobile money, via nos prestataires Kkiapay et FedaPay. Les montants sont en francs CFA.',
  },
  {
    icon: CalendarDays,
    title: `Une période de ${periodDays} jours`,
    text: `Chaque paiement confirmé active votre plan pour ${periodDays} jours. Aucun prélèvement automatique : vous renouvelez quand vous le décidez.`,
  },
  {
    icon: FileText,
    title: 'Une facture par paiement',
    text: 'Chaque paiement est conservé dans l’historique de votre organisation, avec sa facture au format PDF.',
  },
]

const faqs = [
  {
    q: 'Faut-il un moyen de paiement pour commencer ?',
    a: 'Non. Le plan Découverte est gratuit : créez un compte et déployez sans rien payer. Vous choisissez un plan payant plus tard, depuis votre espace.',
  },
  {
    q: 'Comment fonctionne la période de facturation ?',
    a: `Un paiement confirmé active le plan choisi pour ${periodDays} jours. Si votre période en cours n’est pas terminée, les ${periodDays} jours s’ajoutent à sa date d’échéance. Eflex n’encaisse aucun paiement récurrent : chaque période se règle par un nouveau paiement.`,
  },
  {
    q: 'Que se passe-t-il si je ne renouvelle pas à temps ?',
    a: `À l’échéance, une période de grâce de ${graceDays} jours s’ouvre : votre plan et ses limites sont conservés, et les responsables de l’organisation sont prévenus. À la fin de la grâce, la création de projets et les nouveaux déploiements sont bloqués, mais vos applications en ligne et vos données restent intactes. Un paiement lève le blocage.`,
  },
  {
    q: 'Comment changer de plan ?',
    a: `Dans votre espace, rubrique Équipe puis Abonnement, le propriétaire, un administrateur ou un membre du rôle facturation choisit le nouveau plan et le paie en ligne. Il s’applique dès la confirmation du paiement, pour ${periodDays} jours.`,
  },
  {
    q: 'Que compte la limite d’applications ?',
    a: 'Chaque application déployable compte, y compris lorsqu’un même projet en regroupe plusieurs (monorepo). La limite de domaines personnalisés s’applique, elle, à chaque projet.',
  },
]

export default function PricingPage() {
  const plans = pricingPlans()

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1">
        {/* ─── Introduction ─── */}
        <section aria-labelledby="tarifs-titre" className="container pb-12 pt-14 md:pb-16 md:pt-20">
          <div className="max-w-3xl space-y-5">
            <h1 id="tarifs-titre" className="text-display font-bold text-balance">
              Des tarifs simples, en francs CFA.
            </h1>
            <p className="max-w-2xl text-lead-lg text-muted-foreground text-pretty">
              Commencez gratuitement avec le plan Découverte. Passez à un plan payant quand vos projets et votre
              équipe grandissent : seules les limites changent d’un plan à l’autre.
            </p>
          </div>
        </section>

        {/* ─── Plans ─── */}
        <section aria-labelledby="plans-titre" className="container pb-20 md:pb-24">
          <h2 id="plans-titre" className="sr-only">
            Plans disponibles
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <PricingPlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </section>

        {/* ─── Comparatif ─── */}
        <section aria-labelledby="comparatif-titre" className="border-y border-border bg-muted/40 py-16 md:py-20">
          <div className="container space-y-8">
            <div className="max-w-2xl space-y-3">
              <h2 id="comparatif-titre" className="text-display-sm font-bold text-balance">
                Comparer les plans
              </h2>
              <p className="text-muted-foreground text-pretty">
                Prix mensuel et limites de chaque plan, côte à côte.
              </p>
            </div>
            <PricingComparison plans={plans} />
          </div>
        </section>

        {/* ─── Paiement ─── */}
        <section aria-labelledby="paiement-titre" className="container py-16 md:py-20">
          <div className="max-w-2xl space-y-3">
            <h2 id="paiement-titre" className="text-display-sm font-bold text-balance">
              Payer en toute simplicité
            </h2>
            <p className="text-muted-foreground text-pretty">
              Le paiement se fait depuis votre espace, une fois votre compte créé.
            </p>
          </div>
          <ul className="mt-10 grid gap-6 md:grid-cols-3">
            {paymentFacts.map(({ icon: Icon, title, text }) => (
              <li key={title} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-muted-foreground text-pretty">{text}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* ─── Questions de facturation ─── */}
        <section aria-labelledby="faq-titre" className="container pb-20 md:pb-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_1.6fr] lg:gap-16">
            <div className="max-w-md space-y-3">
              <h2 id="faq-titre" className="text-display-sm font-bold text-balance">
                Questions sur la facturation
              </h2>
              <p className="text-muted-foreground text-pretty">
                Les règles appliquées à chaque abonnement.
              </p>
            </div>
            <div className="divide-y divide-border rounded-2xl border border-border bg-card shadow-sm">
              {faqs.map((item) => (
                <details key={item.q} className="group px-6 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <h3 className="text-base font-medium text-balance">{item.q}</h3>
                    <span
                      aria-hidden="true"
                      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-transform duration-200 ease-out-expo group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pb-5 text-muted-foreground text-pretty">{item.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* ─── Appel final : bande navy, couleurs fixes dans les deux thèmes ─── */}
        <section aria-labelledby="tarifs-appel-titre" className="container pb-20 md:pb-28">
          <div className="rounded-3xl bg-eflexnavy px-6 py-14 text-center text-white sm:px-12 md:py-16">
            <div className="mx-auto max-w-2xl space-y-6">
              <h2 id="tarifs-appel-titre" className="text-3xl font-bold tracking-tight text-balance text-white sm:text-4xl">
                Publiez votre premier projet gratuitement.
              </h2>
              <p className="text-lg text-white/85 text-pretty">
                Créez votre compte, connectez votre dépôt GitHub et changez de plan quand vous en avez besoin.
              </p>
              <Link
                href="/register"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-white px-6 text-base font-semibold text-eflexnavy shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-white/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-eflexnavy"
              >
                Créer un compte
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
