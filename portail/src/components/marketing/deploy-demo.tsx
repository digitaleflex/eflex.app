import { Info } from 'lucide-react'

// Démonstration statique d'un déploiement. Les messages de détection reprennent
// ceux que produit réellement le détecteur Eflex (packages/detector) ; l'exemple
// reste volontairement mono-service, seule configuration que le portail déploie.
//
// Garantie « illustratif » : rien n'est exécuté. Aucun indicateur « live »,
// aucun état de succès opérationnel, aucun chronomètre, aucune adresse réelle.
// Les étapes décrivent un parcours type et le caractère fictif est explicite
// dans le badge d'en-tête et la légende (figcaption) en pied de carte.
const steps = [
  { label: 'Dépôt récupéré', detail: 'agence/mon-app · main' },
  { label: 'Stack Next.js identifiée.', detail: 'node@22 · pnpm' },
  { label: 'Script `build` trouvé : l\'application est compilée.', detail: 'pnpm install && pnpm run build' },
  { label: 'Image construite', detail: 'next start · port 3000' },
  { label: 'Certificat HTTPS vérifié', detail: "Let's Encrypt" },
]

export function DeployDemo() {
  return (
    <figure
      aria-label="Aperçu illustratif du parcours de déploiement d'une application Next.js avec Eflex"
      className="relative overflow-hidden rounded-2xl bg-eflexnavy text-white shadow-2xl shadow-black/40 ring-1 ring-white/15"
    >
      {/* Voile clair très léger : la carte se détache même posée sur un hero navy. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-white/[0.03]" />

      <div className="relative">
        {/* Barre de fenêtre : nom du projet + mention d'exemple, jamais un statut. */}
        <div className="flex items-center gap-3 border-b border-white/10 bg-white/[0.04] px-4 py-3 sm:px-5">
          <span aria-hidden="true" className="flex shrink-0 items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
            <span className="h-2.5 w-2.5 rounded-full bg-white/25" />
          </span>
          {/* Titre court pour rester entier à 360 px (sinon tronqué). */}
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-white/70">mon-app · aperçu</span>
          <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-white/80">
            Exemple
          </span>
        </div>

        {/* Numérotation plutôt que coches : on montre des étapes, pas des réussites. */}
        <ol className="space-y-4 px-4 py-5 sm:px-5">
          {steps.map((step, i) => (
            <li
              key={step.label}
              className="demo-step relative flex gap-3 sm:gap-4"
              style={{ '--d': `${0.15 + i * 0.18}s` } as React.CSSProperties}
            >
              {/* Ligne de liaison : `-bottom-4` rejoint exactement la puce suivante
                  (l'écart vertical entre deux étapes est `space-y-4`, soit 1rem). */}
              {i < steps.length - 1 && (
                <span aria-hidden="true" className="absolute left-[9.5px] top-6 -bottom-4 w-px bg-white/15" />
              )}
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 font-mono text-[11px] font-medium text-white/80"
              >
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="break-words font-mono text-[13px] leading-relaxed text-white">{step.label}</span>
                <span translate="no" className="break-words font-mono text-xs leading-relaxed text-white/70">
                  {step.detail}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* Légende obligatoire, enfant direct du `figure` : la carte ne doit
          jamais passer pour un déploiement réel. */}
      <figcaption className="relative flex items-start gap-2 border-t border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-relaxed text-white/75 sm:px-5">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-eflexsky" aria-hidden="true" />
        <span className="min-w-0">
          Démonstration illustrative : exemple de parcours de déploiement. Aucune exécution réelle sur cette page.
        </span>
      </figcaption>
    </figure>
  )
}
