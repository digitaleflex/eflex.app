'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { ChevronDown, ChevronRight, GitBranch } from 'lucide-react'
import { StatusPill } from '@/components/dashboard/status-pill'
import { DeploymentLogs } from '@/components/deployment-logs'
import { CancelDeploymentButton } from '@/components/cancel-deployment-button'
import { RollbackDeploymentButton } from '@/components/rollback-deployment-button'
import type { DeploymentItemData } from '@/lib/deployment-item-data'
import { isCommitSha } from '@/lib/deployment-rollback'
import { statusInfo } from '@/lib/project-status'

const dateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })

// Le diagnostic est calculé côté serveur : ce composant client ne reçoit jamais le journal brut.
export type { DeploymentItemData }

export function DeploymentItem({
  projectId,
  deployment,
  branch,
  canManage,
  inProgress,
  isLast,
  isProduction,
  defaultOpen,
}: {
  projectId: string
  deployment: DeploymentItemData
  branch: string
  canManage: boolean
  /** Un déploiement est en cours sur le projet (bloque le rollback). */
  inProgress: boolean
  isLast: boolean
  isProduction: boolean
  multiApp: boolean
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const detailsId = useId()
  const diagnosis = deployment.diagnosis
  const showRollback = canManage && !inProgress && deployment.status === 'live' && isCommitSha(deployment.commitSha)
  const showCancel = canManage && statusInfo(deployment.status).inProgress
  const commitLabel = deployment.commitSha === 'pending' ? 'commit en attente' : deployment.commitSha.slice(0, 7)

  return (
    <li className="px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={detailsId}
          onClick={() => setOpen((value) => !value)}
          className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {open ? <ChevronDown className="h-4 w-4" aria-hidden="true" /> : <ChevronRight className="h-4 w-4" aria-hidden="true" />}
          <span className="sr-only">{open ? 'Replier le déploiement' : 'Déplier le déploiement'}</span>
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <StatusPill status={deployment.status} />
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                <span className="font-mono">{commitLabel}</span>
                {deployment.app && (
                  <span className="rounded-full border border-border px-1.5 text-xs font-normal text-muted-foreground">
                    {deployment.app.name}
                  </span>
                )}
                <span className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                  {branch}
                </span>
                {isLast && (
                  <span className="rounded-full border border-border px-1.5 text-xs font-medium text-muted-foreground">
                    Dernier
                  </span>
                )}
                {isProduction && (
                  <span className="rounded-full bg-primary/10 px-1.5 text-xs font-semibold text-primary">
                    Production
                  </span>
                )}
              </p>
            </div>
            <time dateTime={deployment.createdAt.toISOString()} className="ml-auto text-xs text-muted-foreground">
              {dateFormat.format(deployment.createdAt)}
            </time>
          </div>

          {open && (
            <div id={detailsId} className="mt-3 space-y-3">
              {deployment.status === 'failed' &&
                (diagnosis ? (
                  <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2.5 text-xs">
                    <p className="font-medium text-foreground">{diagnosis.cause}</p>
                    <Link
                      href={diagnosis.action.href}
                      className="mt-1 inline-flex rounded-md font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {diagnosis.action.label}
                    </Link>
                  </div>
                ) : (
                  <p className="text-xs text-destructive">
                    Le déploiement a échoué. Ouvrez le journal pour identifier la cause ; les
                    valeurs connues des variables y sont masquées.
                  </p>
                ))}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <DeploymentLogs
                  projectId={projectId}
                  deploymentId={deployment.id}
                  status={deployment.status}
                  defaultOpen={deployment.id ? statusInfo(deployment.status).inProgress && isLast : false}
                />
                {(showRollback || showCancel) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {showRollback && (
                      <RollbackDeploymentButton
                        projectId={projectId}
                        deploymentId={deployment.id}
                        commitSha={deployment.commitSha}
                        createdAtLabel={dateFormat.format(deployment.createdAt)}
                      />
                    )}
                    {showCancel && <CancelDeploymentButton projectId={projectId} deploymentId={deployment.id} />}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
