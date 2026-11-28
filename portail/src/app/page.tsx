import type { CSSProperties } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  FileSearch,
  GitBranch,
  Globe,
  Lock,
  PlayCircle,
  ShieldCheck,
  Terminal,
  TriangleAlert,
} from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'
import { TechMarquee } from '@/components/marketing/tech-marquee'
import { JourneyDemo } from '@/components/marketing/journey-demo'
import { FinalCta } from '@/components/marketing/final-cta'

const facts = [
  { icon: GitBranch, label: 'Déploiements depuis Git', detail: 'Branche suivie, statuts, historique.' },
  { icon: Globe, label: 'HTTPS et domaines', detail: 'Adresse EFLEX et domaines personnalisés.' },
  { icon: Terminal, label: 'Logs centralisés', detail: 'Build et exécution au même endroit.' },
  { icon: Building2, label: 'Organisations et rôles', detail: 'Projets et accès gérés par équipe.' },
]

const steps = [
  {
    number: '01',
    title: 'Connecter le dépôt',
    text: 'Liez un dépôt GitHub et choisissez le projet à mettre en ligne.',
  },
  {
    number: '02',
    title: 'Déployer avec visibilité',
    text: 'EFLEX analyse le projet, lance le déploiement et affiche chaque état en temps réel.',
  },
  {
    number: '03',
    title: 'Suivre la production',
    text: 'Consultez les logs, les domaines, la configuration et l’état de vos applications depuis la console.',
  },
]

const agencyPoints = [
  {
    icon: Building2,
    title: 'Plusieurs projets, un seul espace',
    text: 'Regroupez les applications clients dans une organisation, avec des membres et des rôles adaptés.',
  },
  {
    icon: FileSearch,
    title: 'Contexte clair en cas d’incident',
    text: 'Statut, journaux et diagnostic permettent de comprendre ce qui s’est passé sans fouiller dans plusieurs outils.',
  },
  {
    icon: ShieldCheck,
    title: 'Contrôle avant promesse',
    text: 'Variables chiffrées, domaines, paramètres et suivi de production : l’essentiel pour opérer proprement.',
  },
]

const reliability = [
  {
    icon: Lock,
    title: 'Variables chiffrées',
    text: 'Les variables d’environnement sont stockées chiffrées et ne doivent pas être exposées en clair côté client.',
  },
  {
    icon: ShieldCheck,
    title: 'Isolation par organisation',
    text: 'Les projets, accès et actions sont rattachés à une organisation avec contrôle côté serveur.',
  },
  {
    icon: Globe,
    title: 'HTTPS et domaines',
    text: 'Certificats TLS et domaines personnalisés gérés dans le flux de déploiement, selon la configuration du projet.',
  },
]

const faqs = [
  {
    q: 'À qui s’adresse EFLEX ?',
    a: 'Aux développeurs, studios et agences qui livrent des applications en production et veulent un cadre clair pour déployer, suivre et opérer.',
  },
  {
    q: 'Que se passe-t-il si un déploiement échoue ?',
    a: 'Le déploiement est marqué en échec, les journaux restent accessibles et la version déjà en ligne n’est pas remplacée tant qu’un nouveau déploiement réussi n’a pas abouti.',
  },
  {
    q: 'Dois-je configurer un serveur ?',
    a: 'Non pour les projets compatibles. EFLEX prend en charge l’analyse, la construction et la mise en ligne. Vous gardez le contrôle sur la configuration applicative.',
  },
  {
    q: 'Puis-je gérer plusieurs applications clients ?',
    a: 'Oui. Les projets peuvent être regroupés dans une organisation, avec des membres, des rôles et un suivi centralisé.',
  },
]

export default function HomePage() {
  return (
    <div className="homepage-light flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />

      <main id="contenu" tabIndex={-1} className="flex-1">
        {/* ─── Hero ─── */}
        <section aria-labelledby="hero-titre" className="relative overflow-hidden border-b border-border/60 bg-background">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-grid opacity-50" />
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,hsl(var(--primary)/0.12),transparent_70%)]" />
          <div aria-hidden="true" className="hero-flow" />
          <div aria-hidden="true" className="hero-orb hero-orb-a" />
          <div aria-hidden="true" className="hero-orb hero-orb-b" />
          <div className="container relative py-16 sm:py-20 md:py-24 lg:py-28">
            <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="min-w-0 max-w-2xl">
                <p className="animate-reveal inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary sm:text-[13px]">
                  <span aria-hidden="true" className="h-px w-6 bg-primary/60 sm:w-8" />
                  Pour les développeurs, studios et agences
                </p>

                <h1
                  id="hero-titre"
                  className="mt-7 animate-reveal text-balance font-extrabold tracking-tight text-foreground [font-size:clamp(2.7rem,6.5vw,5.2rem)] [line-height:1.02]"
                  style={{ '--d': '70ms' } as CSSProperties}
                >
                  La production de vos clients,
                  <span className="block text-primary">sous contrôle.</span>
                </h1>

                <p
                  className="mt-7 max-w-xl animate-reveal text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg md:text-xl"
                  style={{ '--d': '140ms' } as CSSProperties}
                >
                  Déployez, suivez et opérez vos applications depuis un seul espace. Gardez une vue claire sur chaque mise en production, sans complexité inutile.
                </p>

                <div
                  className="mt-10 flex animate-reveal flex-col gap-3 sm:flex-row sm:gap-4"
                  style={{ '--d': '210ms' } as CSSProperties}
                >
                  <Link
                    href="/register"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary px-7 text-base font-semibold text-primary-foreground shadow-primary transition-[background-color,box-shadow,transform] duration-200 ease-out-expo hover:bg-primary/90 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    Créer un compte
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <Link
                    href="#fonctionnement"
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-input bg-background/70 px-7 text-base font-semibold text-foreground transition-[background-color,border-color,color,transform] duration-200 ease-out-expo hover:bg-muted active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <PlayCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Voir le fonctionnement
                  </Link>
                </div>

                <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  {['Déploiements Git', 'HTTPS & domaines', 'Logs & diagnostic'].map((item) => (
                    <li key={item} className="inline-flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Product proof */}
              <div className="min-w-0 animate-reveal lg:justify-self-end" style={{ '--d': '180ms' } as CSSProperties}>
                <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-lg">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">app-client</p>
                      <p className="truncate text-xs text-muted-foreground">Branche <span className="font-mono">main</span> · commit <span className="font-mono">a1b2c3d</span></p>
                    </div>
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
                      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                      En ligne
                    </span>
                  </div>

                  <div className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {[
                        { label: 'Domaine', value: 'app.client.fr' },
                        { label: 'HTTPS', value: 'Certificat actif' },
                        { label: 'Dernier déploiement', value: 'Réussi' },
                        { label: 'Environnement', value: 'Production' },
                      ].map((row) => (
                        <div key={row.label} className="rounded-xl bg-muted/35 px-3.5 py-3">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{row.label}</p>
                          <p className="mt-1 text-sm font-medium text-foreground">{row.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="rounded-xl border border-border bg-background">
                      <div className="flex items-center justify-between border-b border-border px-3.5 py-2.5">
                        <p className="text-xs font-medium text-foreground">Journaux de déploiement</p>
                        <span className="text-[11px] text-muted-foreground tabular-nums">14:32:08</span>
                      </div>
                      <div className="space-y-1.5 px-3.5 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                        <p><span className="text-success">✓</span> Build terminé</p>
                        <p><span className="text-success">✓</span> Image publiée</p>
                        <p><span className="text-success">✓</span> Domaine et TLS vérifiés</p>
                        <p className="text-foreground"><span className="text-success">✓</span> Application en ligne</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3 rounded-xl border border-primary/15 bg-primary/5 px-3.5 py-3">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                      <p className="text-sm text-foreground">
                        <span className="font-medium">Version en ligne conservée.</span>{' '}
                        <span className="text-muted-foreground">En cas d’échec, EFLEX affiche la cause probable et l’action à effectuer.</span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Faits ─── */}
        <section id="capacites" aria-labelledby="faits-titre" className="scroll-mt-20 py-14 md:py-16">
          <div className="container">
            <h2 id="faits-titre" className="sr-only">Capacités principales</h2>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {facts.map((item) => (
                <li key={item.label} className="rounded-2xl border border-border bg-card p-5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-4 text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── Parcours ─── */}
        <section id="fonctionnement" aria-labelledby="fonctionnement-titre" className="scroll-mt-20 border-y border-border bg-muted/25 py-16 md:py-24">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="fonctionnement-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                Un parcours clair, du dépôt à la production
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                Connectez votre dépôt, déployez, puis suivez l’état réel de votre application depuis un seul espace.
              </p>
            </div>

            <ol className="mt-10 grid gap-4 md:grid-cols-3">
              {steps.map((step) => (
                <li key={step.number} className="rounded-2xl border border-border bg-card p-6">
                  <p className="font-mono text-xs font-semibold tracking-[0.18em] text-primary">{step.number}</p>
                  <h3 className="mt-3 text-lg font-semibold text-foreground">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
                </li>
              ))}
            </ol>

            <JourneyDemo />
          </div>
        </section>

        {/* ─── Diagnostic ─── */}
        <section id="diagnostic" aria-labelledby="diagnostic-titre" className="scroll-mt-20 py-16 md:py-24">
          <div className="container">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:items-center">
              <div className="max-w-xl">
                <h2 id="diagnostic-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                  Quand ça échoue, vous savez quoi faire
                </h2>
                <p className="mt-4 text-lead-lg text-muted-foreground text-pretty">
                  Un déploiement échoué ne doit pas devenir une chasse aux logs. EFLEX affiche l’état, la cause probable et l’action à effectuer, pour corriger rapidement.
                </p>
                <ul className="mt-8 space-y-3 text-sm text-muted-foreground">
                  <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />Cause probable identifiée à partir des signaux observables.</li>
                  <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />Action recommandée, avec lien vers le bon réglage.</li>
                  <li className="flex gap-3"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />Impact explicite : la version en ligne n’est pas remplacée tant que le déploiement n’a pas réussi.</li>
                </ul>
              </div>

              <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
                <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">app-client</p>
                    <p className="text-xs text-muted-foreground">Déploiement <span className="font-mono">#184</span> · il y a 2 min</p>
                  </div>
                  <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />
                    Échec
                  </span>
                </div>

                <div className="border-b border-border bg-success/5 px-5 py-3 sm:px-6">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
                    Version en ligne conservée — aucune interruption pour vos utilisateurs.
                  </p>
                </div>

                <div className="space-y-4 px-5 py-4 sm:px-6 sm:py-5">
                  <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
                    <div className="flex items-start gap-3">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">Variables d’environnement manquantes</p>
                        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                          Ajoutez les variables manquantes puis relancez le déploiement.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {['AURA_API_TOKEN', 'AURA_API_URL', 'JWT_SECRET'].map((v) => (
                            <code key={v} className="rounded-md bg-background/80 px-2 py-1 font-mono text-[11px] text-foreground border border-warning/20">
                              {v}
                            </code>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <span className="inline-flex min-h-10 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background">
                        Ouvrir les variables
                      </span>
                      <span className="text-xs text-muted-foreground">Puis relancer le déploiement</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-muted/20">
                    <div className="flex items-center gap-4 border-b border-border px-4 py-2.5 text-xs font-medium">
                      <span className="text-foreground">Diagnostic</span>
                      <span className="text-muted-foreground">Journaux</span>
                    </div>
                    <div className="space-y-1.5 px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground sm:text-xs">
                      <p>[14:32:01] Vérification de la configuration…</p>
                      <p className="text-warning">[14:32:02] Variables requises manquantes détectées.</p>
                      <p>[14:32:02] Déploiement interrompu avant mise en production.</p>
                      <p className="text-success">[14:32:02] Version en ligne conservée.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ─── Agences / équipes ─── */}
        <section id="equipes" aria-labelledby="equipes-titre" className="scroll-mt-20 border-y border-border bg-muted/20 py-16 md:py-24">
          <div className="container">
            <div className="mx-auto max-w-3xl text-center">
              <h2 id="equipes-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                Pensé pour les équipes qui gèrent plusieurs applications
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                EFLEX aide les agences et studios à garder la main sur les projets qu’ils livrent, avec un contexte clair quand un incident survient.
              </p>
            </div>

            <ul className="mt-12 grid gap-5 md:grid-cols-3">
              {agencyPoints.map((item) => (
                <li key={item.title} className="rounded-2xl border border-border bg-card p-6">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <item.icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="mt-4 text-base font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ─── Technologies ─── */}
        <section id="technologies" aria-labelledby="technologies-titre" className="scroll-mt-20 py-16 md:py-20">
          <div className="container">
            <div className="mx-auto max-w-3xl space-y-4 text-center">
              <h2 id="technologies-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                Compatible avec les stacks que vous livrez déjà
              </h2>
              <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                EFLEX détecte les projets courants et prend aussi en charge les dépôts fournissant leur propre Dockerfile ou Docker Compose.
              </p>
            </div>
            <div className="mt-10">
              <TechMarquee />
            </div>
          </div>
        </section>

        {/* ─── Fiabilité / sécurité ─── */}
        <section id="fiabilite" aria-labelledby="fiabilite-titre" className="scroll-mt-20 border-y border-border bg-muted/20 py-16 md:py-20">
          <div className="container">
            <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:items-start">
              <div className="max-w-xl">
                <h2 id="fiabilite-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                  Des bases solides, sans promesses inutiles
                </h2>
                <p className="mt-4 text-lead-lg text-muted-foreground text-pretty">
                  EFLEX met l’accent sur les contrôles essentiels : accès, configuration, déploiement et visibilité. Les engagements doivent rester clairs et vérifiables.
                </p>
                <Link
                  href="/securite"
                  className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Voir la page Sécurité
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>

              <ul className="grid gap-4">
                {reliability.map((item) => (
                  <li key={item.title} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-start gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <item.icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
                        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ─── FAQ ─── */}
        <section id="questions" aria-labelledby="questions-titre" className="scroll-mt-20 py-16 md:py-24">
          <div className="container">
            <div className="mx-auto max-w-3xl space-y-4 text-center">
              <h2 id="questions-titre" className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
                Questions fréquentes
              </h2>
              <p className="mx-auto max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                Les réponses essentielles avant de mettre un premier projet en production.
              </p>
            </div>

            <div className="mx-auto mt-10 max-w-3xl divide-y divide-border rounded-2xl border border-border bg-card">
              {faqs.map((item) => (
                <details key={item.q} className="group px-5 sm:px-6 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-md py-4 text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <span className="text-base font-medium text-foreground text-balance">{item.q}</span>
                    <span
                      aria-hidden="true"
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-transform duration-200 ease-out-expo group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pb-5 text-sm leading-relaxed text-muted-foreground sm:text-base">{item.a}</p>
                </details>
              ))}
            </div>

            <div className="mt-8 flex justify-center">
              <Link
                href="/docs"
                className="inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Voir les ressources
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>

        <FinalCta />
        <SiteFooter />
      </main>
    </div>
  )
}
