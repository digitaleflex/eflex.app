import type { Metadata, Viewport } from 'next'
import { JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google'
import { MaintenanceBanner } from '@/components/maintenance-banner'
import { ThemeSync } from '@/components/theme-sync'
import { themeBootScript } from '@/lib/theme'
import { getSiteUrl } from '@/lib/site-url'
import './globals.css'

// Police de la charte EFLEX (docs/brand/README.md) : texte courant ET titres.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

// Code, commits, journaux et valeurs techniques uniquement (hors charte, choisie pour la lisibilité).
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: 'EFLEX — Votre code en ligne, en quelques minutes',
    template: '%s — EFLEX',
  },
  description:
    "Indiquez votre dépôt GitHub : EFLEX reconnaît la stack (Next.js, Laravel, Python…), construit l'application et la publie en HTTPS. Sans serveur à configurer.",
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    url: '/',
    siteName: 'EFLEX',
    title: 'EFLEX — Votre code en ligne, en quelques minutes',
    description:
      'Déployez vos applications depuis GitHub en HTTPS, sans serveur à configurer. EFLEX analyse votre dépôt, propose un plan et publie.',
    images: [{ url: '/opengraph-image', width: 1200, height: 630, alt: 'EFLEX — Le déploiement depuis Git, sans DevOps' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'EFLEX — Votre code en ligne, en quelques minutes',
    description:
      'Déployez vos applications depuis GitHub en HTTPS, sans serveur à configurer.',
    images: ['/opengraph-image'],
  },
  robots: {
    index: true,
    follow: true,
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f9fc' },
    { media: '(prefers-color-scheme: dark)', color: '#0b111a' },
  ],
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`${jakarta.variable} ${jetbrainsMono.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {/* Avant tout contenu : applique le thème (cookie ou système) sans flash. */}
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        <ThemeSync />
        <a
          href="#contenu"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[70] focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:shadow-md focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Aller au contenu
        </a>
        <MaintenanceBanner />
        {children}
      </body>
    </html>
  )
}
