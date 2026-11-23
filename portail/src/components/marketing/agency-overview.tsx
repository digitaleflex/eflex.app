import type { CSSProperties, ReactNode } from 'react'
import {
  Building2,
  Check,
  CreditCard,
  FolderKanban,
  type LucideIcon,
  ShieldCheck,
  Users,
} from 'lucide-react'

function SectionHeading({
  id,
  title,
  lead,
}: {
  id: string
  title: string
  lead: string
}) {
  return (
    <div className="max-w-3xl space-y-4">
      <h2 id={id} className="text-display-sm font-extrabold tracking-tight text-balance text-foreground">
        {title}
      </h2>
      <p className="max-w-2xl text-lead-lg text-muted-foreground text-pretty">{lead}</p>
    </div>
  )
}

function CapabilityItem({
  icon: Icon,
  title,
  text,
}: {
  icon: LucideIcon
  title: string
  text: string
}) {
  return (
    <li className="flex gap-4 rounded-2xl border border-border bg-card p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="text-base font-semibold tracking-tight text-foreground">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{text}</p>
      </div>
    </li>
  )
}

function MiniWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span aria-hidden="true" className="flex gap-1.5">
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
          <span className="h-2 w-2 rounded-full bg-border" />
        </span>
        <span className="truncate text-xs font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}

const capabilities = [
  {
    icon: Building2,
    title: 'Organisations',
    text: 'Regroupez vos projets et vos équipes dans des organisations distinctes.',
  },
  {
    icon: Users,
    title: 'Membres et rôles',
    text: 'Invitez des membres et attribuez des rôles avec des permissions adaptées.',
  },
  {
    icon: FolderKanban,
    title: 'Projets par organisation',
    text: 'Gérez les projets rattachés à chaque organisation depuis un espace dédié.',
  },
  {
    icon: CreditCard,
    title: 'Abonnements rattachés',
    text: 'L’abonnement est porté par l’organisation, avec les limites et le suivi associés.',
  },
  {
    icon: ShieldCheck,
    title: 'Isolation des organisations',
    text: 'Les accès et les données sont limités au périmètre de l’organisation concernée.',
  },
]

const visionItems = [
  'Portefeuille clients complet',
  'Rapports mensuels',
  'Gestion consolidée avancée',
]

export function AgencyOverview() {
  return (
    <section
      id="agences"
      aria-labelledby="agences-titre"
      className="scroll-mt-20 py-16 md:py-24"
    >
      <div className="container">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-12">
          <div className="space-y-8">
            <SectionHeading
              id="agences-titre"
              title="Un espace adapté aux agences."
              lead="Gérez vos organisations, vos membres et vos projets dans un cadre clair, avec des accès contrôlés et un abonnement rattaché à l’organisation."
            />

            <ul className="space-y-3">
              {capabilities.map((item, index) => (
                <div key={item.title} className="reveal-on-view" style={{ '--i': index } as CSSProperties}>
                  <CapabilityItem icon={item.icon} title={item.title} text={item.text} />
                </div>
              ))}
            </ul>
          </div>

          <div className="space-y-5 lg:pt-4">
            <div className="reveal-on-view rounded-3xl border border-border bg-muted/35 p-5 sm:p-6" style={{ '--i': 1 } as CSSProperties}>
              <MiniWindow title="Organisation — Aperçu illustratif">
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/30 px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Agence Atlas</p>
                      <p className="text-xs text-muted-foreground">Organisation</p>
                    </div>
                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">Plan actif</span>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Membres</p>
                    <div className="space-y-2">
                      {[
                        { name: 'Nadia', role: 'Propriétaire' },
                        { name: 'Yanis', role: 'Admin' },
                        { name: 'Lina', role: 'Membre' },
                      ].map((member) => (
                        <div key={member.name} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                          <span className="font-medium text-foreground">{member.name}</span>
                          <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{member.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="mb-2 text-xs font-medium text-muted-foreground">Projets</p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {['site-client-a', 'app-interne'].map((project) => (
                        <div key={project} className="rounded-xl border border-border bg-muted/20 px-3 py-2">
                          <p className="truncate font-mono text-xs text-foreground">{project}</p>
                          <p className="mt-1 text-xs text-muted-foreground">Accès selon le rôle</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </MiniWindow>
              <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                Exemple fictif : les organisations, rôles, permissions, projets et abonnements montrés correspondent à des capacités existantes.
              </p>
            </div>

            <div className="reveal-on-view rounded-3xl border border-dashed border-border bg-card p-5 sm:p-6" style={{ '--i': 2 } as CSSProperties}>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold tracking-tight text-foreground">Vision agence</h3>
                <span className="inline-flex items-center rounded-full border border-primary/20 bg-primary/5 px-2.5 py-0.5 text-xs font-semibold text-primary">
                  À venir
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                Ces évolutions sont envisagées pour les agences, mais ne sont pas encore disponibles sur EFLEX.
              </p>
              <ul className="mt-4 space-y-2.5">
                {visionItems.map((item) => (
                  <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
