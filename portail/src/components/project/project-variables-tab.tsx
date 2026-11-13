import Link from 'next/link'
import { KeyRound, Lock } from 'lucide-react'
import { SectionCard } from '@/components/dashboard/section'
import { EmptyState } from '@/components/ui/empty-state'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const smallLinkClass =
  'inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9'

export type ProjectEnvVarRow = {
  key: string
  updatedAt: Date
  appId: string | null
}

export function ProjectVariablesTab({
  projectId,
  envVars,
  canManage,
  appNameById,
}: {
  projectId: string
  envVars: readonly ProjectEnvVarRow[]
  canManage: boolean
  appNameById: ReadonlyMap<string, string>
}) {
  return (
    <SectionCard
      id="variables"
      title="Variables d’environnement"
      icon={KeyRound}
      description="Les valeurs sont chiffrées au repos et ne sont jamais renvoyées par le serveur. Une modification s’applique au prochain déploiement."
      actions={
        canManage ? (
          <Link href={`/dashboard/projects/${projectId}/settings#variables`} className={smallLinkClass}>
            Modifier
          </Link>
        ) : undefined
      }
    >
      {envVars.length === 0 ? (
        <EmptyState
          title="Aucune variable définie"
          description={
            canManage
              ? 'Ajoutez des variables une par une ou importez un fichier .env depuis les paramètres. Les valeurs restent chiffrées et ne sont jamais réaffichées.'
              : 'Un propriétaire ou un administrateur peut ajouter des variables au projet.'
          }
          action={
            canManage ? (
              <Link href={`/dashboard/projects/${projectId}/settings#variables`} className={smallLinkClass}>
                Gérer les variables
              </Link>
            ) : undefined
          }
          className="py-8"
        />
      ) : (
        <ul className="divide-y divide-border">
          {envVars.map((envVar) => (
            <li
              key={envVar.key}
              className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="min-w-0">
                <code className="break-all font-mono text-sm">{envVar.key}</code>
                <p className="text-xs text-muted-foreground">
                  {envVar.appId
                    ? `Application : ${appNameById.get(envVar.appId) ?? 'inconnue'}`
                    : 'Toutes les applications'}{' '}
                  · Mise à jour le {dateFormat.format(envVar.updatedAt)}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1.5 font-mono text-sm tracking-widest text-muted-foreground">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                <span aria-hidden="true">••••••••</span>
                <span className="sr-only">Valeur masquée</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
        Les valeurs ne peuvent pas être relues : pour les remplacer, saisissez-les à nouveau dans les paramètres (ajout ou import .env). Les modifications s’appliquent au prochain déploiement et les journaux masquent les valeurs connues.
      </p>
    </SectionCard>
  )
}
