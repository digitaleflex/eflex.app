'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronDown, ChevronRight, TerminalSquare } from 'lucide-react'
import { Terminal } from '@/components/terminal'

/** Bouton « Journaux » d'un déploiement : ouvre le terminal et le suit en direct. */
export function DeploymentLogs({ projectId, deploymentId, defaultOpen = false }: { projectId: string; deploymentId: string; defaultOpen?: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
        <TerminalSquare className="h-3.5 w-3.5" aria-hidden="true" />
        Journaux
      </button>
      {open && (
        <Terminal
          className="mt-2"
          label="Journal de déploiement"
          url={`/api/projects/${projectId}/deployments/${deploymentId}/logs`}
          onFinished={() => router.refresh()}
        />
      )}
    </div>
  )
}
