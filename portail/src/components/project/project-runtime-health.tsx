'use client'

import { useEffect, useState } from 'react'
import { runtimeHealth, type RuntimeHealthInput } from '@/lib/project-health'
import { cn } from '@/lib/utils'

type RuntimeState =
  | { kind: 'loading' }
  | { kind: 'unavailable'; detail: string }
  | { kind: 'ready'; health: ReturnType<typeof runtimeHealth>; error: string | null }

type RuntimeApiResponse = {
  deployed?: boolean
  app?: RuntimeHealthInput & { status?: string | null } | null
  error?: string
}

export function ProjectRuntimeHealth({
  projectId,
  deployed,
}: {
  projectId: string
  deployed: boolean
}) {
  const [state, setState] = useState<RuntimeState>(
    deployed ? { kind: 'loading' } : { kind: 'ready', health: runtimeHealth({ status: null }), error: null },
  )

  useEffect(() => {
    if (!deployed) {
      setState({
        kind: 'ready',
        health: {
          label: 'Pas encore déployé',
          detail: 'Le statut sera disponible après le premier déploiement.',
          tone: 'muted',
        },
        error: null,
      })
      return
    }

    let cancelled = false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 8000)

    async function load() {
      setState({ kind: 'loading' })
      try {
        const res = await fetch(`/api/projects/${projectId}/runtime`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const data = (await res.json().catch(() => null)) as RuntimeApiResponse | null
        if (cancelled) return
        if (!res.ok || !data) {
          setState({ kind: 'unavailable', detail: 'Indisponible pour le moment.' })
          return
        }
        if (data.deployed === false) {
          setState({
            kind: 'ready',
            health: {
              label: 'Pas encore déployé',
              detail: 'Le statut sera disponible après le premier déploiement.',
              tone: 'muted',
            },
            error: null,
          })
          return
        }
        if (data.error || !data.app) {
          setState({ kind: 'unavailable', detail: data?.error ?? 'Indisponible pour le moment.' })
          return
        }
        setState({ kind: 'ready', health: runtimeHealth(data.app), error: null })
      } catch {
        if (!cancelled) setState({ kind: 'unavailable', detail: 'Indisponible pour le moment.' })
      } finally {
        clearTimeout(timeout)
      }
    }

    void load()
    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [projectId, deployed])

  const tone =
    state.kind === 'ready'
      ? state.health.tone
      : state.kind === 'unavailable'
        ? 'muted'
        : 'muted'
  const label =
    state.kind === 'ready'
      ? state.health.label
      : state.kind === 'unavailable'
        ? 'Statut indisponible'
        : 'Chargement…'
  const detail =
    state.kind === 'ready'
      ? state.health.detail
      : state.kind === 'unavailable'
        ? state.detail
        : null

  return (
    <div className="p-4">
      <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span
          aria-hidden="true"
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            state.kind === 'loading' && 'animate-pulse bg-muted-foreground/50',
            state.kind !== 'loading' && tone === 'success' && 'bg-success',
            state.kind !== 'loading' && tone === 'warning' && 'bg-warning',
            state.kind !== 'loading' && tone === 'danger' && 'bg-destructive',
            state.kind !== 'loading' && tone === 'muted' && 'bg-muted-foreground/50',
          )}
        />
        Application
      </dt>
      <dd className="mt-1 text-sm font-medium">
        {label}
        {detail ? <span className="mt-0.5 block text-xs font-normal text-muted-foreground">{detail}</span> : null}
        {state.kind === 'unavailable' ? (
          <span className="mt-1 block text-xs font-normal text-warning">Hébergement : indisponible pour le moment.</span>
        ) : null}
      </dd>
    </div>
  )
}
