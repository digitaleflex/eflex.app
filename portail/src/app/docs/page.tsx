import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, BookOpen, GitBranch, Globe, KeyRound, LifeBuoy, Rocket, ShieldCheck, Terminal, TriangleAlert } from 'lucide-react'
import { SiteHeader } from '@/components/marketing/site-header'
import { SiteFooter } from '@/components/marketing/site-footer'

export const metadata: Metadata = {
  title: 'Documentation',
  description: 'Guides EFLEX : déploiement, variables, domaines, logs, diagnostics, bases managées et bonnes pratiques.',
}

const sections = [
  { id: 'demarrage', title: 'Démarrage rapide', icon: Rocket },
  { id: 'github', title: 'Dépôt GitHub', icon: GitBranch },
  { id: 'variables', title: 'Variables d’environnement', icon: KeyRound },
  { id: 'domaines', title: 'Domaines et HTTPS', icon: Globe },
  { id: 'logs', title: 'Logs et diagnostics', icon: Terminal },
  { id: 'bases', title: 'Bases managées et sauvegardes', icon: ShieldCheck },
  { id: 'limites', title: 'Limites et bonnes pratiques', icon: TriangleAlert },
]

function DocSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-titre`} className="scroll-mt-24 border-b border-border py-10 last:border-0">
      <h2 id={`${id}-titre`} className="text-2xl font-bold tracking-tight text-foreground">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-relaxed text-muted-foreground sm:text-base">{children}</div>
    </section>
  )
}

export default function DocsPage() {
  return (
    <div className="homepage-light flex min-h-screen flex-col bg-background text-foreground">
      <SiteHeader />
      <main id="contenu" tabIndex={-1} className="flex-1">
        <section className="border-b border-border/60 bg-muted/20 py-14 md:py-20">
          <div className="container">
            <div className="max-w-3xl">
              <p className="text-sm font-medium text-primary">Documentation</p>
              <h1 className="mt-3 text-display-sm font-extrabold tracking-tight text-balance text-foreground sm:text-display">
                Comprendre, déployer, corriger
              </h1>
              <p className="mt-4 max-w-2xl text-lead-lg text-muted-foreground text-pretty">
                Les guides essentiels pour mettre une application en production sur EFLEX, suivre son état et résoudre les problèmes courants.
              </p>
            </div>
            <nav aria-label="Sommaire de la documentation" className="mt-8">
              <ul className="flex flex-wrap gap-2">
                {sections.map((s) => (
                  <li key={s.id}>
                    <a
                      href={`#${s.id}`}
                      className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground transition-[border-color,background-color] duration-200 ease-out-expo hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <s.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </section>

        <div className="container py-6 md:py-10">
          <div className="mx-auto max-w-4xl">
            <DocSection id="demarrage" title="Démarrage rapide">
              <p>Pour déployer un premier projet :</p>
              <ol className="list-decimal space-y-2 pl-5">
                <li>Créez un compte EFLEX et accédez au tableau de bord.</li>
                <li>Cliquez sur <span className="font-medium text-foreground">Nouveau projet</span> et indiquez un dépôt GitHub.</li>
                <li>EFLEX analyse le dépôt et propose une configuration de déploiement.</li>
                <li>Vérifiez les variables d’environnement nécessaires avant le premier déploiement.</li>
                <li>Lancez le déploiement, puis suivez le statut et les journaux en temps réel.</li>
              </ol>
              <p>Une fois le déploiement réussi, l’application reçoit une adresse EFLEX en HTTPS. Vous pouvez ensuite configurer un domaine personnalisé.</p>
            </DocSection>

            <DocSection id="github" title="Dépôt GitHub">
              <p>EFLEX déploie à partir d’un dépôt Git. La branche suivie détermine la version déployée.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li><span className="font-medium text-foreground">Dépôts publics</span> : analyse possible via l’URL du dépôt.</li>
                <li><span className="font-medium text-foreground">Dépôts privés</span> : connectez l’intégration GitHub autorisée pour permettre l’analyse et le déploiement.</li>
                <li><span className="font-medium text-foreground">Push</span> : selon la configuration, un nouveau commit sur la branche suivie peut déclencher un déploiement.</li>
              </ul>
              <p>Si EFLEX ne peut pas accéder au dépôt, vérifiez les droits GitHub, la branche configurée et l’installation de l’application.</p>
            </DocSection>

            <DocSection id="variables" title="Variables d’environnement">
              <p>Les variables d’environnement permettent de configurer votre application sans modifier le code.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Ajoutez-les dans l’onglet <span className="font-medium text-foreground">Variables</span> du projet.</li>
                <li>Les valeurs sont chiffrées avant stockage et ne sont pas renvoyées en clair par les API client.</li>
                <li>Vous pouvez coller un bloc <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground">.env</code> pour remplir plusieurs variables d’un coup.</li>
                <li>Après modification, relancez un déploiement si l’application a besoin des nouvelles valeurs au démarrage/build.</li>
              </ul>
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
                <strong className="font-semibold">Important :</strong> ne placez jamais de secrets dans le code source ou dans un dépôt public. Utilisez les variables d’environnement EFLEX.
              </div>
            </DocSection>

            <DocSection id="domaines" title="Domaines et HTTPS">
              <p>Chaque projet peut disposer d’une adresse EFLEX. Vous pouvez aussi ajouter un domaine personnalisé.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Ajoutez le domaine dans les paramètres du projet.</li>
                <li>Configurez les enregistrements DNS demandés (CNAME/A/AAAA selon le cas).</li>
                <li>Lancez la vérification DNS depuis EFLEX.</li>
                <li>Une fois vérifié, le domaine est pris en compte lors du déploiement et le certificat TLS est géré automatiquement.</li>
              </ul>
              <p>Si le domaine ne se vérifie pas, contrôlez la propagation DNS, le type d’enregistrement et l’absence de conflit avec un autre enregistrement.</p>
            </DocSection>

            <DocSection id="logs" title="Logs et diagnostics">
              <p>En cas d’échec, commencez par les journaux de déploiement. EFLEX affiche le statut et, quand un motif est reconnu, un diagnostic actionnable.</p>
              <ul className="list-disc space-y-2 pl-5">
                <li><span className="font-medium text-foreground">Statut</span> : indique où le déploiement s’est arrêté (analyse, build, déploiement, etc.).</li>
                <li><span className="font-medium text-foreground">Journaux</span> : contiennent le détail technique du build ou du démarrage.</li>
                <li><span className="font-medium text-foreground">Diagnostic</span> : propose une cause probable et une action quand le signal est suffisamment clair.</li>
              </ul>
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Exemple</p>
                <p className="mt-1">“Variables d’environnement manquantes (AURA_API_TOKEN, JWT_SECRET). Ajoutez-les puis relancez le déploiement. La version en ligne n’a pas été modifiée.”</p>
              </div>
              <p>Un déploiement échoué ne remplace pas la version déjà en ligne tant qu’un nouveau déploiement réussi n’a pas abouti.</p>
            </DocSection>

            <DocSection id="bases" title="Bases managées et sauvegardes">
              <p>EFLEX peut provisionner certaines bases managées selon la configuration du projet (par exemple PostgreSQL ou Redis).</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Les identifiants de connexion sont injectés dans l’application via des variables d’environnement.</li>
                <li>Les sauvegardes peuvent être disponibles selon le type de base et la configuration de la plateforme.</li>
                <li>Une sauvegarde n’équivaut pas automatiquement à une restauration testée ou garantie.</li>
              </ul>
              <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
                <strong className="font-semibold">Bonnes pratiques :</strong> conservez votre propre stratégie de sauvegarde/restauration pour les données critiques, testez les restaurations, et ne considérez pas un volume comme une sauvegarde.
              </div>
            </DocSection>

            <DocSection id="limites" title="Limites et bonnes pratiques">
              <ul className="list-disc space-y-2 pl-5">
                <li><span className="font-medium text-foreground">Compatibilité</span> : la détection de stack aide au démarrage, mais ne garantit pas que tout projet est déployable sans ajustement.</li>
                <li><span className="font-medium text-foreground">Compose/Dockerfile</span> : un dépôt peut fournir son propre Dockerfile ou Docker Compose ; certaines configurations sont refusées pour des raisons de sécurité.</li>
                <li><span className="font-medium text-foreground">Rollback</span> : un retour arrière applicatif ne restaure pas automatiquement une base de données, des volumes ou des variables.</li>
                <li><span className="font-medium text-foreground">Secrets</span> : ne partagez jamais de secrets dans les captures, tickets ou logs publics.</li>
                <li><span className="font-medium text-foreground">Support</span> : en cas de blocage, fournissez l’ID projet/déploiement, l’heure, l’action effectuée et le message observé.</li>
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/contact"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <LifeBuoy className="h-4 w-4" aria-hidden="true" />
                  Contacter le support
                </Link>
                <Link
                  href="/status"
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-input bg-background px-5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <BookOpen className="h-4 w-4" aria-hidden="true" />
                  Voir le statut
                </Link>
              </div>
            </DocSection>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  )
}
