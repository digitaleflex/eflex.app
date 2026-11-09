import Link from 'next/link'
import Image from 'next/image'

const links = [
  { href: '/#fonctionnement', label: 'Fonctionnement' },
  { href: '/#fonctionnalites', label: 'Fonctionnalités' },
  { href: '/#questions', label: 'Questions' },
  { href: '/status', label: 'Statut' },
]

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 glass">
      <nav aria-label="Navigation du site" className="container flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Image src="/logo-horizontal.webp" alt="Eflex — accueil" width={1200} height={312} className="h-7 sm:h-8 w-auto" priority />
        </Link>

        <ul className="hidden lg:flex items-center gap-1">
          {links.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-flex h-11 items-center rounded-lg px-3 text-sm font-medium text-muted-foreground transition-colors duration-200 ease-out-expo hover:text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1 sm:gap-2">
          <Link
            href="/login"
            className="inline-flex h-11 items-center whitespace-nowrap rounded-lg px-2.5 sm:px-3 text-sm font-medium transition-colors duration-200 ease-out-expo hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Connexion
          </Link>
          <Link
            href="/register"
            className="inline-flex h-11 items-center whitespace-nowrap rounded-lg bg-primary px-3 sm:px-4 text-sm font-medium text-primary-foreground shadow-sm transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Créer un compte
          </Link>
        </div>
      </nav>
    </header>
  )
}
