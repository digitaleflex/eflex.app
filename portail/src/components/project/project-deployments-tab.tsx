import { SectionCard } from '@/components/dashboard/section'
import { EmptyState } from '@/components/ui/empty-state'
import { RedeployButton } from '@/components/redeploy-button'
import { DeploymentItem, type DeploymentItemData } from '@/components/project/deployment-item'
import { statusInfo } from '@/lib/project-status'

export function ProjectDeploymentsTab({
  projectId,
  deployments,
  branch,
  canManage,
  inProgress,
  multiApp,
  productionId,
}: {
  projectId: string
  deployments: readonly DeploymentItemData[]
  branch: string
  canManage: boolean
  inProgress: boolean
  multiApp: boolean
  productionId?: string | null
}) {
  return (
    <SectionCard
      id="deployments"
      title="Historique des déploiements"
      description={`${deployments.length} déploiement${deployments.length > 1 ? 's' : ''}, du plus récent au plus ancien. Les journaux sont en lecture seule et les secrets connus y sont masqués.`}
      actions={
        canManage && deployments.length > 0 ? (
          <RedeployButton
            projectId={projectId}
            variant={multiApp ? 'primary' : 'outline'}
            label={multiApp ? 'Redéployer toutes les applications' : 'Nouveau déploiement'}
          />
        ) : undefined
      }
    >
      {deployments.length === 0 ? (
        <EmptyState
          title="Aucun déploiement pour ce projet"
          description="Lancez un premier déploiement : son statut et ses journaux s’afficheront ici."
          action={
            canManage ? (
              <RedeployButton
                projectId={projectId}
                variant="primary"
                label={multiApp ? 'Déployer toutes les applications' : 'Lancer le déploiement'}
              />
            ) : undefined
          }
          className="py-10"
        />
      ) : (
        <>
          {multiApp && (
            <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
              Un déploiement par application : le nom de l’application est indiqué à côté du commit.
            </p>
          )}
          {canManage && (
            <p className="border-b border-border px-4 py-3 text-xs text-muted-foreground sm:px-5">
              « Redéployer cette version » reconstruit un déploiement réussi avec les variables
              d’environnement actuelles. Les migrations de base de données ne sont pas annulées.
            </p>
          )}
          <ul className="divide-y divide-border">
            {deployments.map((deployment, index) => {
              const isLast = index === 0
              const deploymentInProgress = statusInfo(deployment.status).inProgress
              return (
                <DeploymentItem
                  key={deployment.id}
                  projectId={projectId}
                  deployment={deployment}
                  branch={branch}
                  canManage={canManage}
                  inProgress={inProgress}
                  isLast={isLast}
                  isProduction={productionId === deployment.id}
                  multiApp={multiApp}
                  defaultOpen={isLast || deploymentInProgress}
                />
              )
            })}
          </ul>
        </>
      )}
    </SectionCard>
  )
}
