import { Check } from 'lucide-react'

// Démonstration statique d'un déploiement. Les messages de détection reprennent
// ceux que produit réellement le détecteur Eflex (packages/detector).
const steps = [
  { label: 'Dépôt récupéré', detail: 'github.com/agence/mon-app · main' },
  { label: 'Stack Laravel identifiée.', detail: 'PHP 8.3 · Composer · npm' },
  { label: 'Planificateur Laravel détecté.', detail: 'service scheduler ajouté' },
  { label: 'Script `build` présent : les assets front sont compilés.', detail: 'npm ci && npm run build' },
  { label: 'Image construite', detail: 'php-fpm + nginx' },
  { label: 'Certificat HTTPS émis', detail: "Let's Encrypt" },
]

export function DeployDemo() {
  return (
    <figure
      aria-label="Exemple de déploiement d'une application Laravel avec Eflex"
      className="relative rounded-2xl bg-eflexnavy text-white shadow-2xl shadow-eflexnavy/30 ring-1 ring-white/10 overflow-hidden"
    >
      <div className="flex items-center justify-between gap-4 border-b border-white/10 px-5 py-3">
        <div className="flex items-center gap-2" aria-hidden="true">
          <span className="h-3 w-3 rounded-full bg-white/20" />
          <span className="h-3 w-3 rounded-full bg-white/20" />
          <span className="h-3 w-3 rounded-full bg-white/20" />
        </div>
        <span className="font-mono text-xs text-white/60 truncate">mon-app · déploiement</span>
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/70">Exemple</span>
      </div>

      <ol className="space-y-3 px-5 py-5 font-mono text-[13px] leading-snug">
        {steps.map((step, i) => (
          <li key={step.label} className="demo-step flex gap-3" style={{ '--d': `${0.3 + i * 0.45}s` } as React.CSSProperties}>
            <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-eflexsky/20 text-eflexsky">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-white/90">{step.label}</span>
              <span className="block text-white/50">{step.detail}</span>
            </span>
          </li>
        ))}
      </ol>

      <div
        className="demo-step mx-5 mb-5 flex items-center justify-between gap-3 rounded-xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10"
        style={{ '--d': `${0.3 + steps.length * 0.45}s` } as React.CSSProperties}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
            <span className="demo-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </span>
          En ligne
        </span>
        <span className="font-mono text-sm text-eflexsky truncate">https://mon-app.fr</span>
      </div>
    </figure>
  )
}
