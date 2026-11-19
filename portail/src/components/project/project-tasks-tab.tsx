import { Clock3 } from 'lucide-react'
import { SectionCard } from '@/components/dashboard/section'
import { ScheduledTasksPanel } from '@/components/project/scheduled-tasks-panel'

export function ProjectTasksTab({
  projectId,
  canManage,
  apps,
}: {
  projectId: string
  canManage: boolean
  apps: Array<{ id: string; name: string; deployed: boolean }>
}) {
  return (
    <SectionCard
      id="tasks"
      title="Tâches planifiées"
      icon={Clock3}
      description="Définissez des commandes récurrentes (cron) exécutées par l’hébergement pour cette application (ex. maintenance, nettoyage, jobs planifiés)."
    >
      <ScheduledTasksPanel projectId={projectId} canManage={canManage} apps={apps} />
    </SectionCard>
  )
}
