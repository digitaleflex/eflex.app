'use client'

import { useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, TerminalSquare } from 'lucide-react'
import { Terminal } from '@/components/terminal'
import { statusInfo } from '@/lib/project-status'

/**
 * Bouton « Journaux » d'un déploiement : ouvre le terminal et le suit en direct.
 * Le libellé reflète l'état (en cours, échec, terminé) et le panneau est relié
 * au bouton pour les technologies d'assistance.
 */
export function DeploymentLogs({
  projectId,
  deploymentId,
  status,
  defaultOpen = false,
}: {
  projectId: string
  deploymentId: string
  status?: string | null
  defaultOpen?: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  const info = statusInfo(status)
  const label = info.inProgress ? 'Suivre les journaux' : info.tone === 'danger' ? 'Voir les journaux' : 'Journaux'

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        <TerminalSquare className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </button>
      {open && (
        <div id={panelId}>
          <Terminal
            className="mt-2"
            label="Journal de déploiement"
            url={`/api/projects/${projectId}/deployments/${deploymentId}/logs`}
            onFinished={() => router.refresh()}
          />
        </div>
      )}
    </div>
  )
}
