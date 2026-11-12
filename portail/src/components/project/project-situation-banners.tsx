import Link from 'next/link'
import { CircleAlert, Loader2, Rocket, TerminalSquare } from 'lucide-react'
import { Notice } from '@/components/dashboard/notice'
import { RedeployButton } from '@/components/redeploy-button'
import { projectTabHref } from '@/lib/project-tabs'
import { statusInfo } from '@/lib/project-status'
import type { ProjectSituation } from '@/lib/project-actions'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

const primaryLinkClass =
  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-sm font-semibold text-background hover:bg-foreground/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [@media(pointer:coarse)]:h-11'

export function ProjectSituationBanners({
  projectId,
  situation,
  lastStatus,
  productionCreatedAt,
  canManage,
  multiApp,
}: {
  projectId: string
  situation: ProjectSituation
  lastStatus?: string | null
  productionCreatedAt?: Date | null
  canManage: boolean
  multiApp: boolean
}) {
  const deploymentsHref = projectTabHref(projectId, 'deployments')

  return (
    <>
      {situation === 'failed' && (
        <Notice
          tone="danger"
          icon={CircleAlert}
          title="Le dernier déploiement a échoué"
          actions={
            <>
              <Link href={deploymentsHref} className={primaryLinkClass}>
                <TerminalSquare className="h-4 w-4" aria-hidden="true" />
                Voir les journaux
              </Link>
              {canManage && <RedeployButton projectId={projectId} label={multiApp ? 'Tout redéployer' : 'Redéployer'} />}
            </>
          }
        >
          {productionCreatedAt
            ? `La version du ${dateFormat.format(productionCreatedAt)} reste en ligne. Consultez le journal du dernier déploiement pour identifier la cause, puis relancez.`
            : 'Aucune version n’est en ligne pour l’instant. Consultez le journal du dernier déploiement, corrigez le dépôt, puis relancez.'}
        </Notice>
      )}

      {situation === 'in-progress' && lastStatus && (
        <Notice
          tone="warning"
          icon={Loader2}
          title="Déploiement en cours"
          actions={
            <Link href={deploymentsHref} className={primaryLinkClass}>
              <TerminalSquare className="h-4 w-4" aria-hidden="true" />
              Suivre les journaux
            </Link>
          }
        >
          {statusInfo(lastStatus).label}. La page se met à jour automatiquement ; le journal est
          disponible sans attendre la fin.
        </Notice>
      )}

      {situation === 'never' && (
        <Notice tone="info" icon={Rocket} title="Ce projet n’a pas encore été déployé">
          Le premier déploiement crée l’application, attribue un domaine et prépare le certificat HTTPS.
          {canManage
            ? ' Lancez-le depuis l’action principale en haut de page.'
            : ' Un propriétaire ou un administrateur peut lancer ce premier déploiement.'}
        </Notice>
      )}

      {situation === 'idle' && (
        <Notice tone="info" icon={Rocket} title="Dernier déploiement annulé">
          {productionCreatedAt
            ? `La version du ${dateFormat.format(productionCreatedAt)} reste en ligne. Vous pouvez relancer un déploiement quand vous le souhaitez.`
            : 'Le dernier déploiement a été annulé. Vous pouvez le relancer quand vous le souhaitez.'}
        </Notice>
      )}
    </>
  )
}
