import type { Metadata } from 'next'
import { Inter, JetBrains_Mono, Manrope } from 'next/font/google'
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="fr" className={`${inter.variable} ${jetbrainsMono.variable} ${manrope.variable}`} suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  )
}