import { TerminalSquare } from 'lucide-react'
import { SectionCard } from '@/components/dashboard/section'
import { EmptyState } from '@/components/ui/empty-state'
import { RuntimeLogs, type RuntimeLogApp } from '@/components/runtime-logs'

export function ProjectRuntimeLogsTab({
  projectId,
  deployed,
  services,
  apps,
}: {
  projectId: string
  deployed: boolean
  services: readonly string[]
  apps: readonly RuntimeLogApp[]
}) {
  if (!deployed) {
    return (
      <SectionCard
        id="logs"
        title="Journaux d’exécution"
        icon={TerminalSquare}
        description="Les journaux seront disponibles après le premier déploiement du projet."
      >
        <EmptyState
          title="Rien à afficher pour l’instant"
          description="Après le premier déploiement, les dernières lignes du conteneur apparaîtront ici, avec les secrets connus masqués."
          className="py-8"
        />
      </SectionCard>
    )
  }

  return (
    <div className="space-y-3">
      <RuntimeLogs projectId={projectId} services={services} apps={apps} />
    </div>
  )
}
