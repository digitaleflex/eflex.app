import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useState, useEffect } from 'react'
import { Zap, Atom, Snake, File, Server, Package, Launch, CircleCheck, Globe, Star, Heart, TrendingUp } from 'lucide-react'

const frameworkLogos: Record<string, React.ComponentType> = {
  nextjs: Zap,
  nuxt: Heart,
  astro: Star,
  vite: Zap,
  svelte: Snake,
  remix: TrendingUp,
  solidstart: TrendingUp,
  redwoodjs: Package,
  node: Atom,
  laravel: Zap,
  php: Atom,
  python: Snake,
  static: File,
  docker: Server,
  eflexConfig: Package,
}

const allFrameworks = [
  'nextjs',
  'nuxt',
  'astro',
  'vite',
  'svelte',
  'remix',
  'solidstart',
  'redwoodjs',
  'node',
  'laravel',
  'php',
  'python',
  'static',
  'docker',
  'eflex-config',
]

function TechnologyCarousel({ frameworks }: { frameworks: string[] }) {
  const [index, setIndex] = useState(0)
  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % frameworks.length)
    }, 3000)
    return () => clearInterval(id)
  }, [frameworks])

  const Logo = frameworkLogos[frameworks[index]]

  return (
    <div className="carousel rounded-xl bg-primary/5 p-4 mb-8">
      <Logo className="w-12 h-12 mx-auto mb-2" />
      <p className="text-center text-sm">{frameworks[index]}</p>
      <button
        onClick={() => setIndex((i) => (i - 1 + frameworks.length) % frameworks.length)}
        className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/70 rounded-lg p-1 hover:bg-white"
        aria-label="Précédent"
      >
        ←
      </button>
      <button
        onClick={() => setIndex((i) => (i + 1) % frameworks.length)}
        className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/70 rounded-lg p-1 hover:bg-white"
        aria-label="Suivant"
      >
        →
      </button>
    </div>
  )
}

const features = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
      </svg>
    ),
    title: 'Déploiement en 1 clic',
    description: 'Connectez votre repo GitHub, choisissez votre branche, et nous nous occupons du build et du déploiement. Aucune configuration manuelle.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
      </svg>
    ),
    title: 'Variables d\'environnement sécurisées',
    description: 'Ajoutez, modifiez et chiffrez vos variables d\'environnement directement depuis l\'interface. Redéploiement automatique après chaque changement.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418" />
      </svg>
    ),
    title: 'Domaines personnalisés',
    description: 'Associez gratuitement vos propres noms de domaine à chaque projet. Certificats SSL Let\'s Encrypt inclus et renouvelés automatiquement.',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
      </svg>
    ),
    title: 'Zéro SSH, zéro Docker',
    description: 'Tout se fait depuis l\'interface web. Builds, déploiements, rollbacks : aucune ligne de commande, aucun fichier Docker — sauf si vous le voulez.',
  },
]

const stacks = [
  { name: 'Next.js', icon: <Zap />, color: 'text-foreground' },
  { name: 'Laravel', icon: <Zap />, color: 'text-red-500' },
  { name: 'Node.js', icon: <Atom />, color: 'text-green-500' },
  { name: 'Python', icon: <Snake />, color: 'text-blue-400' },
  { name: 'Vite', icon: <Zap />, color: 'text-purple-400' },
  { name: 'Statique', icon: <File />, color: 'text-muted-foreground' },
]

export default function HomePage() {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navigation */}
      <header className="sticky top-0 z-50 glass">
        <nav className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-xl tracking-tight">
            <span className="bg-primary text-primary-foreground rounded-lg w-8 h-8 flex items-center justify-center text-sm">E</span>
            <span>Eflex</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login" className="inline-flex items-center justify-center h-8 px-3 text-xs rounded-md font-medium hover:bg-muted transition-colors">Connexion</Link>
            <Link href="/login" className="inline-flex items-center justify-center h-8 px-3 text-xs rounded-lg font-medium bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors">Créer un compte</Link>
          </div>
        </nav>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-grid opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
          <div className="container relative py-24 md:py-36 space-y-12 text-center">
            <div className="space-y-6 max-w-3xl mx-auto animate-fade-in">
              <Badge variant="outline" className="mb-4">Plateforme d&apos;hébergement pour développeurs</Badge>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl text-balance">
                Déployez vos applications{' '}
                <span className="gradient-text">sans jamais toucher au DevOps</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
                Connectez votre repo GitHub, ajoutez vos variables d&apos;environnement, et déployez en un clic.
                Zéro SSH. Zéro fichier Docker obligatoire. Zéro friction.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up">
              <Link href="/login" className="inline-flex items-center justify-center h-14 px-8 text-base font-medium rounded-xl bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">Commencer gratuitement</Link>
            <Link href="#features" className="inline-flex items-center justify-center h-14 px-8 text-base font-medium rounded-xl border border-input bg-background hover:bg-accent hover:text-accent-foreground transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Découvrir</Link>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="container py-24 md:py-32 space-y-16">
          <div className="text-center space-y-4">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Pourquoi <span className="gradient-text">Eflex</span> ?
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Construit pour les développeurs et les agences qui veulent héberger leurs projets
              sans perdre de temps sur l&apos;infrastructure.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature, i) => (
              <Card key={i} variant="elevated" className="p-6 space-y-4 hover:shadow-md transition-shadow duration-300">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                  {feature.icon}
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-foreground">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Stacks */}
        <section className="bg-muted/50 border-y border-border">
          <div className="container py-24 md:py-32 space-y-16">
            <div className="text-center space-y-4">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Nous détectons <span className="gradient-text">votre stack automatiquement</span>
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Pas besoin de configurer quoi que ce soit. Notre moteur reconnaît votre projet
                et génère le déploiement optimal.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              {stacks.map((stack) => (
                <Card key={stack.name} variant="elevated" className="p-6 flex flex-col items-center gap-3 hover:scale-105 transition-transform duration-200">
                  <span className={`text-3xl ${stack.color}`}>{stack.icon}</span>
                  <span className="text-sm font-medium">{stack.name}</span>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container py-24 md:py-32">
          <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-primary via-primary to-accent text-primary-foreground p-12 md:p-16 text-center space-y-8">
            <div className="absolute inset-0 bg-grid opacity-10" />
            <div className="relative space-y-4">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Prêt à déployer votre premier projet ?
              </h2>
              <p className="text-primary-foreground/80 text-lg max-w-xl mx-auto">
                Rejoignez les développeurs qui déploient leurs applications sans jamais ouvrir un terminal.
              </p>
            </div>
            <div className="relative">
              <Link href="/login" className="inline-flex items-center justify-center h-14 px-8 text-base font-medium rounded-xl bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">Créer mon compte gratuitement</Link>
            </div>
          </Card>
        </section>
      </main>

      <TechnologyCarousel frameworks={allFrameworks} />

      {/* Footer */}
      <footer className="border-t border-border">
        <div className="container py-12 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="bg-primary text-primary-foreground rounded-lg w-6 h-6 flex items-center justify-center text-xs font-bold">E</span>
            <span className="text-sm text-muted-foreground">© {new Date().getFullYear()} Eflex</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="#" className="hover:text-foreground transition-colors">Documentation</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Statut</Link>
            <Link href="#" className="hover:text-foreground transition-colors">CGU</Link>
            <Link href="#" className="hover:text-foreground transition-colors">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}