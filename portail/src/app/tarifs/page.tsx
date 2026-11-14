import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, CreditCard, Smartphone } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { GRACE_PERIOD_DAYS, PERIOD_DAYS, PLAN_IDS, PLANS, formatFcfa, formatPrice } from '@/lib/plans'

export const metadata: Metadata = {
  title: 'Tarifs — EFLEX',
  description:
    'Plans EFLEX en FCFA : limites projets, membres et domaines personnalisés. Paiement mobile money et carte, période de 30 jours avec 7 jours de grâce en cas d’impayé.',
}

const billingFaq = [
  {
    q: 'Quelle est la durée d’une période de facturation ?',
    a: `Chaque période de facturation dure ${PERIOD_DAYS} jours à compter de l’activation ou du renouvellement de l’abonnement.`,
  },
  {
    q: 'Que se passe-t-il en cas de retard de paiement ?',
    a: `En cas d’impayé, une période de grâce de ${GRACE_PERIOD_DAYS} jours s’ouvre : les limites du plan souscrit sont conservées pendant cette période. À la fin de la grâce, les créations et nouveaux déploiements sont bloqués tant que le paiement n’est pas régularisé ; les applications déjà en ligne et les données restent intactes.`,
  },
  {
    q: 'Quels moyens de paiement sont disponibles ?',
    a: 'Le paiement peut se faire par mobile money et par carte via Kkiapay et FedaPay, selon les moyens activés au moment du règlement.',
  },
  {
    q: 'Puis-je changer de plan ?',
    a: 'Oui. Les demandes de changement de plan se font depuis l’espace Équipe → Abonnement. Les limites appliquées correspondent au plan effectif de votre organisation.',
  },
]

function LimitRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="flex items-start justify-between gap-4 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums text-foreground text-right">{value}</span>
    </li>
  )
}

export default function TarifsPage() {
  const plans = PLAN_IDS.map((id) => PLANS[id])

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground homepage-light">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-card focus:px-4 focus:py-2 focus:text-foreground focus:shadow-lg focus:ring-2 focus:ring-ring"
      >
        Aller au contenu
      </a>
      <SiteHeader />

      <main id="contenu" className="flex-1">
        <section className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-medium text-primary">Tarifs</p>
            <h1 className="mt-3 font-display text-display-sm font-bold tracking-tight text-balance sm:text-display">
              Des plans clairs, en FCFA
            </h1>
            <p className="mt-4 text-lg text-muted-foreground text-pretty">
              Choisissez le plan adapté à votre équipe. Les limites ci-dessous sont celles appliquées par la plateforme
              (applications déployables, membres, domaines personnalisés par projet). Prix affichés par période de {PERIOD_DAYS} jours.
            </p>
          </div>

          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
              <Card
                key={plan.id}
                className={cn(
                  'flex h-full flex-col',
                  plan.highlighted && 'border-primary shadow-lg ring-1 ring-primary/20',
                )}
              >
                <CardHeader className="space-y-3 pb-4">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold">{plan.label}</h2>
                    {plan.highlighted && <Badge>Recommandé</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                  <p className="text-2xl font-bold tracking-tight tabular-nums">
                    {formatPrice(plan.priceFcfa)}
                  </p>
                  {plan.priceFcfa > 0 ? (
                    <p className="text-xs text-muted-foreground">Soit {formatFcfa(plan.priceFcfa)} pour {PERIOD_DAYS} jours.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Aucun paiement requis pour démarrer.</p>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4 pt-0">
                  <ul className="divide-y divide-border">
                    <LimitRow label="Applications déployables" value={plan.projectLimit.toLocaleString('fr-FR')} />
                    <LimitRow label="Membres" value={plan.memberLimit.toLocaleString('fr-FR')} />
                    <LimitRow label="Domaines personnalisés / projet" value={plan.customDomainLimit.toLocaleString('fr-FR')} />
                  </ul>
                  <ul className="mt-1 space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>Déploiements depuis dépôt GitHub</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>Certificats HTTPS et domaines personnalisés (selon limite)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <span>Variables d’environnement chiffrées</span>
                    </li>
                  </ul>
                  <div className="mt-auto pt-2">
                    <Link
                      href="/register"
                      className={cn(
                        'inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        plan.highlighted
                          ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                          : 'border border-input bg-background hover:bg-secondary hover:text-secondary-foreground',
                      )}
                    >
                      Créer un compte
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold">Comparatif des limites</h2>
                <p className="text-sm text-muted-foreground">Valeurs issues de la configuration des plans de la plateforme.</p>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <caption className="sr-only">Comparatif des plans EFLEX</caption>
                  <thead>
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 pr-3 font-medium text-muted-foreground">Plan</th>
                      <th scope="col" className="py-2 pr-3 font-medium text-muted-foreground">Prix / {PERIOD_DAYS} jours</th>
                      <th scope="col" className="py-2 pr-3 font-medium text-muted-foreground">Applications</th>
                      <th scope="col" className="py-2 pr-3 font-medium text-muted-foreground">Membres</th>
                      <th scope="col" className="py-2 font-medium text-muted-foreground">Domaines / projet</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plans.map((plan) => (
                      <tr key={plan.id} className={cn('border-b border-border last:border-0', plan.highlighted && 'bg-primary/5')}>
                        <th scope="row" className="py-3 pr-3 font-medium">{plan.label}</th>
                        <td className="py-3 pr-3 tabular-nums">{formatPrice(plan.priceFcfa)}</td>
                        <td className="py-3 pr-3 tabular-nums">{plan.projectLimit.toLocaleString('fr-FR')}</td>
                        <td className="py-3 pr-3 tabular-nums">{plan.memberLimit.toLocaleString('fr-FR')}</td>
                        <td className="py-3 tabular-nums">{plan.customDomainLimit.toLocaleString('fr-FR')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold">Moyens de paiement</h2>
                <p className="text-sm text-muted-foreground">Paiements sécurisés pour activer ou renouveler un abonnement.</p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Mobile money</p>
                    <p className="text-sm text-muted-foreground">Disponible via Kkiapay et FedaPay, selon les moyens proposés lors du paiement.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-lg border border-border p-3">
                  <CreditCard className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <p className="font-medium">Carte bancaire</p>
                    <p className="text-sm text-muted-foreground">Disponible via Kkiapay et FedaPay lorsque ce moyen est proposé au moment du règlement.</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Les moyens effectivement disponibles peuvent varier selon le fournisseur et le contexte du paiement.
                </p>
              </CardContent>
            </Card>
          </div>

          <section aria-labelledby="faq-facturation" className="mt-14">
            <h2 id="faq-facturation" className="text-2xl font-bold tracking-tight">Questions sur la facturation</h2>
            <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
              {billingFaq.map((item) => (
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
                  <p className="pb-5 text-sm text-muted-foreground">{item.a}</p>
                </details>
              ))}
            </div>
          </section>

          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="text-muted-foreground">Prêt à déployer votre premier projet ?</p>
            <Link
              href="/register"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Créer un compte
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}
