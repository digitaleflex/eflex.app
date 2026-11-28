import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, LifeBuoy, Mail, Shield, Activity } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { getLegalCompanyInfo } from '@/lib/legal-info'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Contacter l’équipe EFLEX pour le support, les questions commerciales ou les signalements de sécurité.',
}

export default function ContactPage() {
  const company = getLegalCompanyInfo()
  const { email } = company

  return (
    <div className="homepage-light flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="flex-1">
        <section className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-medium text-primary">Contact</p>
            <h1 className="mt-3 text-display-sm font-extrabold tracking-tight text-balance text-foreground sm:text-display">
              Nous contacter
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-lead-lg text-muted-foreground text-pretty">
              Pour une question produit, un besoin commercial ou un signalement lié à la sécurité, l’équipe EFLEX vous répond par e-mail.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
            <article className="rounded-2xl border border-border bg-card p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <LifeBuoy className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-foreground">Support</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Aide sur un déploiement, un compte, une organisation, un domaine ou une configuration.
              </p>
              <a
                href={`mailto:${email}?subject=Support%20EFLEX`}
                className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                {email}
              </a>
            </article>

            <article className="rounded-2xl border border-border bg-card p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Shield className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-foreground">Sécurité</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Pour signaler une vulnérabilité ou une question de sécurité, contactez-nous avec le maximum de détails utiles.
              </p>
              <a
                href={`mailto:${email}?subject=Signalement%20sécurité%20EFLEX`}
                className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                Signaler un problème
              </a>
            </article>

            <article className="rounded-2xl border border-border bg-card p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Activity className="h-5 w-5" aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-semibold text-foreground">Statut des services</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Avant de signaler un incident, vérifiez l’état observé des services EFLEX.
              </p>
              <Link
                href="/status"
                className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md"
              >
                Voir le statut
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </article>
          </div>

          <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-border bg-card p-6 text-sm">
            <p className="font-medium text-foreground">Éditeur</p>
            <dl className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-[12rem_1fr]">
              <dt className="font-medium text-foreground">Nom commercial</dt>
              <dd>{company.name}, {company.legalForm.toLowerCase()} de {company.publisher}</dd>
              <dt className="font-medium text-foreground">RCCM</dt>
              <dd>{company.rccm}</dd>
              <dt className="font-medium text-foreground">IFU</dt>
              <dd>{company.ifu}</dd>
              <dt className="font-medium text-foreground">Adresse</dt>
              <dd>{company.address}</dd>
              <dt className="font-medium text-foreground">E-mail</dt>
              <dd>
                <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
                  {company.email}
                </a>
              </dd>
            </dl>
          </div>

          <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Avant de nous écrire</p>
            <ul className="mt-3 list-disc space-y-2 pl-5">
              <li>Indiquez l’e-mail du compte concerné et, si possible, l’identifiant du projet ou du déploiement.</li>
              <li>Ne transmettez jamais de secrets en clair (mots de passe, clés API, tokens, variables sensibles).</li>
              <li>Pour un incident, précisez l’heure, l’action effectuée, le résultat attendu et le message d’erreur observé.</li>
            </ul>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
