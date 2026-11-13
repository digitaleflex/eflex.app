import Image from 'next/image'
import Link from 'next/link'

const footerLinks = [
  { href: '/#fonctionnement', label: 'Fonctionnement' },
  { href: '/#fonctionnalites', label: 'Fonctionnalités' },
  { href: '/#questions', label: 'Questions' },
  { href: '/status', label: 'Statut' },
  { href: '/login', label: 'Connexion' },
]

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="container flex flex-col gap-8 py-10 sm:flex-row sm:items-start sm:justify-between sm:py-12">
        <div className="max-w-xs space-y-3">
          <Image src="/logo-horizontal.webp" alt="Eflex" width={1200} height={312} className="h-6 w-auto" />
          <p className="text-sm text-muted-foreground">Le déploiement depuis Git, sans DevOps.</p>
        </div>
        <nav aria-label="Pied de page" className="flex flex-wrap gap-x-6 gap-y-1 sm:justify-end">
          {footerLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="inline-flex min-h-11 items-center rounded-lg text-sm text-muted-foreground transition-colors duration-200 ease-out-expo hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <div className="container border-t border-border py-6 text-xs text-muted-foreground">
        © {new Date().getFullYear()} Eflex. Tous droits réservés.
      </div>
    </footer>
  )
}
