import type { Metadata, Viewport } from 'next'
import { Inter, JetBrains_Mono, Manrope } from 'next/font/google'
import { MaintenanceBanner } from '@/components/maintenance-banner'
import { ThemeSync } from '@/components/theme-sync'
import { themeBootScript } from '@/lib/theme'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
})

// Chiffres et titres de la console : géométrique, chiffres tabulaires, plus de caractère qu'Inter.
const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-display',
})

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'Eflex — Poussez votre code, Eflex le met en ligne',
  description: 'Indiquez votre dépôt GitHub : Eflex reconnaît la stack (Next.js, Laravel, Python…), construit l\'application et la publie en HTTPS. Sans serveur à configurer.',
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
    <html lang="fr" className={`${inter.variable} ${jetbrainsMono.variable} ${manrope.variable}`} suppressHydrationWarning>
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
