import Link from 'next/link'
import { getLegalCompanyInfo } from '@/lib/legal-info'
import { BrandLogo } from '@/components/brand-logo'

const productLinks = [
  { href: '/#fonctionnement', label: 'Fonctionnement' },
  { href: '/#fonctionnalites', label: 'Fonctionnalités' },
  { href: '/tarifs', label: 'Tarifs' },
  { href: '/#questions', label: 'Questions' },
]

const resourceLinks = [
  { href: '/status', label: 'Statut des services' },
  { href: '/login', label: 'Connexion' },
  { href: '/register', label: 'Créer un compte' },
]

const legalLinks = [
  { href: '/mentions-legales', label: 'Mentions légales' },
  { href: '/conditions', label: 'Conditions d’utilisation' },
  { href: '/confidentialite', label: 'Confidentialité' },
]

function FooterColumn({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      <ul className="mt-3 space-y-1">
        {links.map((link) => (
          <li key={link.href}>
            <Link
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-lg text-sm text-muted-foreground transition-colors duration-200 ease-out-expo hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function SiteFooter() {
  const company = getLegalCompanyInfo()

  return (
    <footer className="border-t border-border bg-background">
      <div className="container grid gap-10 py-10 sm:grid-cols-2 sm:py-12 lg:grid-cols-5">
        <div className="space-y-3 lg:col-span-2">
          <BrandLogo className="h-6 w-auto" />
          <p className="max-w-sm text-sm text-muted-foreground">Le déploiement depuis Git, sans DevOps.</p>
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Contact / support</p>
            <a
              href={`mailto:${company.email}`}
              className="inline-flex min-h-11 items-center rounded-lg text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {company.email}
            </a>
          </div>
        </div>

        <nav aria-label="Produit">
          <FooterColumn title="Produit" links={productLinks} />
        </nav>
        <nav aria-label="Ressources">
          <FooterColumn title="Ressources" links={resourceLinks} />
        </nav>
        <nav aria-label="Légal">
          <FooterColumn title="Légal" links={legalLinks} />
        </nav>
      </div>
      <div className="container border-t border-border py-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} {company.name}. Tous droits réservés.
      </div>
    </footer>
  )
}
