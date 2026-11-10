import Link from 'next/link'
import { ArrowUpRight, GitBranch, GitCommitHorizontal, ShieldAlert, ShieldCheck } from 'lucide-react'
import { GithubMark as Github } from '@/components/icons/github-mark'
import { FrameworkIcon } from '@/components/framework-icon'
import { StatusPill } from '@/components/dashboard/status-pill'
import { frameworkLabel } from '@/lib/frameworks'
import { relativeTime } from '@/lib/relative-time'
import { repoLabel } from '@/lib/repo'
import type { DashboardProject } from '@/lib/dashboard-data'
import { statusInfo } from '@/lib/project-status'
import { tlsHealth } from '@/lib/project-health'
import { cn } from '@/lib/utils'

/** Vignette de framework : toujours le même carré bordé, centré, quelle que soit l'icône. */
export function FrameworkTile({ framework, name, size = 'md' }: { framework: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-12 w-12 rounded-xl' : size === 'sm' ? 'h-8 w-8 rounded-md' : 'h-10 w-10 rounded-lg'
  const icon = size === 'lg' ? 'h-7 w-7' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  return (
    <span className={cn('flex shrink-0 items-center justify-center border border-border bg-background dark:border-white/10 dark:bg-white', box)} aria-hidden="true">
      {framework ? <FrameworkIcon framework={framework} alt="" className={icon} /> : <span className="font-display text-sm font-bold text-primary">{name.charAt(0).toUpperCase()}</span>}
    </span>
  )
}

/** Frise des derniers déploiements : un trait par déploiement, couleur + libellé accessible. */
export function DeployHistory({ history, className }: { history: string[]; className?: string }) {
  if (history.length === 0) return null
  const live = history.filter((s) => s === 'live').length
  const failed = history.filter((s) => s === 'failed').length
  return (
    <span role="img" aria-label={`${history.length} derniers déploiements : ${live} réussis, ${failed} en échec`} className={cn('flex items-end gap-0.5', className)}>
      {history.map((s, i) => {
        const tone = statusInfo(s).tone
        return (
          <span
            key={i}
            className={cn('w-1 rounded-full', tone === 'success' ? 'h-3 bg-success/70' : tone === 'danger' ? 'h-3 bg-destructive' : tone === 'warning' ? 'h-2 bg-warning' : 'h-1.5 bg-muted-foreground/40')}
          />
        )
      })}
    </span>
  )
}

/**
 * Carte de projet (grille). Toute la carte mène au projet ; le lien vers le site en ligne
 * reste un lien distinct, au-dessus de la zone cliquable, pour ne pas imbriquer deux liens.
 */
export function ProjectCard({ project }: { project: DashboardProject }) {
  const certificate = tlsHealth(
    project.tlsValid,
    project.tlsExpiresAt ? new Date(project.tlsExpiresAt) : null,
    null,
  )

  return (
    <article className="group relative flex flex-col gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/25 focus-within:border-foreground/25">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
        <FrameworkTile framework={project.framework} name={project.name} />
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-5">
            <Link href={`/dashboard/projects/${project.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
              {project.name}
            </Link>
          </h3>
          {project.domain ? (
            <div className="flex items-center gap-1.5">
              <a
                href={`https://${project.domain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="relative z-10 inline-flex max-w-full items-center gap-0.5 text-[13px] leading-5 text-muted-foreground hover:text-foreground hover:underline"
              >
                <span className="truncate">{project.domain}</span>
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="sr-only">(ouvre le site dans un nouvel onglet)</span>
              </a>
              {project.tlsValid !== null && (
                <span
                  title={certificate.detail ?? certificate.label}
                  className="relative z-10 inline-flex shrink-0 items-center"
                >
                  {certificate.tone === 'success' ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                  )}
                  <span className="sr-only">Certificat HTTPS : {certificate.label}</span>
                </span>
              )}
            </div>
          ) : (
            <p className="text-[13px] leading-5 text-muted-foreground">Pas encore de domaine</p>
          )}
        </div>
      </div>

      <span className="inline-flex w-fit max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground/80">
        <Github className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{repoLabel(project.repoUrl)}</span>
      </span>

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        <StatusPill status={project.lastStatus} />
        <p className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground">
          {project.lastAt ? (
            <>
              <time dateTime={project.lastAt} suppressHydrationWarning className="shrink-0">{relativeTime(project.lastAt)}</time>
              <span aria-hidden="true">·</span>
              <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate font-mono">{project.branch}</span>
              {project.lastCommit && (
                <span className="hidden shrink-0 items-center gap-1 sm:inline-flex">
                  <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="font-mono">{project.lastCommit}</span>
                </span>
              )}
            </>
          ) : (
            <span className="truncate">{project.framework ? frameworkLabel(project.framework) : 'Stack inconnue'}</span>
          )}
        </p>
        <DeployHistory history={project.history} className="shrink-0" />
      </div>
    </article>
  )
}

/** Ligne de projet (vue liste) : mêmes informations, alignées en colonnes. */
export function ProjectRow({ project }: { project: DashboardProject }) {
  return (
    <li className="relative grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 hover:bg-muted/50 sm:grid-cols-[auto_minmax(0,2fr)_minmax(0,1.5fr)_8rem_auto]">
      <FrameworkTile framework={project.framework} name={project.name} size="sm" />
      <div className="min-w-0">
        <Link href={`/dashboard/projects/${project.id}`} className="block truncate text-sm font-semibold after:absolute after:inset-0 focus-visible:outline-none">
          {project.name}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{project.domain ?? 'Pas encore de domaine'}</p>
      </div>
      <p className="hidden min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:flex">
        <Github className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{repoLabel(project.repoUrl)}</span>
      </p>
      <p className="hidden text-xs text-muted-foreground sm:block">
        {project.lastAt ? <time dateTime={project.lastAt} suppressHydrationWarning>{relativeTime(project.lastAt)}</time> : '—'}
      </p>
      <StatusPill status={project.lastStatus} />
    </li>
  )
}
