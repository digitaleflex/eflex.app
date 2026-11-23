import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpen, LifeBuoy, Activity } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { getLegalCompanyInfo } from '@/lib/legal-info'

export const metadata: Metadata = {
  title: 'Ressources',
  description: 'Documentation, statut des services et support EFLEX.',
}

const resources = [
  {
    title: 'Statut des services',
    description: 'Consultez l’état de la plateforme et des services EFLEX.',
    href: '/status',
    icon: Activity,
    cta: 'Voir le statut',
  },
  {
    title: 'Questions fréquentes',
    description: 'Retrouvez les réponses aux questions les plus courantes avant de déployer.',
    href: '/#questions',
    icon: BookOpen,
    cta: 'Voir la FAQ',
  },
  {
    title: 'Support',
    description: 'Une question précise ? L’équipe EFLEX vous répond par e-mail.',
    href: 'mailto:support@eflex.app',
    icon: LifeBuoy,
    cta: 'Contacter le support',
  },
]

export default function DocsPage() {
  const { email } = getLegalCompanyInfo()
  const items = resources.map((r) => (r.title === 'Support' ? { ...r, href: `mailto:${email}?subject=Support%20EFLEX` } : r))

  return (
    <div className="homepage-light flex min-h-screen flex-col">
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="flex-1">
        <section className="container py-16 md:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">Ressources EFLEX</h1>
            <p className="mt-4 text-lead-lg text-muted-foreground text-pretty">
              La documentation produit complète arrive bientôt. En attendant, vous pouvez consulter le statut des services, la FAQ et contacter le support.
            </p>
          </div>

          <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
            {items.map((item) => {
              const Icon = item.icon
              const external = item.href.startsWith('mailto:')
              const Comp = external ? 'a' : Link
              return (
                <Comp
                  key={item.title}
                  href={item.href}
                  className="group flex flex-col rounded-2xl border border-border bg-card p-6 transition-[border-color,box-shadow,transform] duration-200 ease-out-expo hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h2 className="mt-4 text-lg font-semibold text-foreground">{item.title}</h2>
                  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">{item.description}</p>
                  <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    {item.cta}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 ease-out-expo group-hover:translate-x-0.5" aria-hidden="true" />
                  </span>
                </Comp>
              )
            })}
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  )
}
