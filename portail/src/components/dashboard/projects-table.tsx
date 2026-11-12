import Link from 'next/link'
import { ArrowUpRight, GitBranch, GitCommitHorizontal, ShieldAlert, ShieldCheck } from 'lucide-react'
import { GithubMark as Github } from '@/components/icons/github-mark'
import { FrameworkTile } from '@/components/dashboard/project-card'
import { StatusPill } from '@/components/dashboard/status-pill'
import { frameworkLabel } from '@/lib/frameworks'
import { relativeTime } from '@/lib/relative-time'
import { repoLabel } from '@/lib/repo'
import { tlsHealth } from '@/lib/project-health'
import type { DashboardProject } from '@/lib/dashboard-data'

export function ProjectsTable({ projects }: { projects: DashboardProject[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="min-w-full border-collapse text-left text-sm">
        <caption className="sr-only">Projets de l’organisation</caption>
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th scope="col" className="px-4 py-3 font-semibold">Application</th>
            <th scope="col" className="hidden px-4 py-3 font-semibold lg:table-cell">Framework</th>
            <th scope="col" className="px-4 py-3 font-semibold">Statut</th>
            <th scope="col" className="hidden px-4 py-3 font-semibold md:table-cell">Domaine</th>
            <th scope="col" className="hidden px-4 py-3 font-semibold sm:table-cell">Dernier déploiement</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {projects.map((project) => {
            const cert = tlsHealth(project.tlsValid, project.tlsExpiresAt ? new Date(project.tlsExpiresAt) : null, null)
            return (
              <tr key={project.id} className="group relative hover:bg-muted/40">
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <FrameworkTile framework={project.framework} name={project.name} size="sm" />
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/projects/${project.id}`}
                        className="flex min-w-0 items-center gap-2 font-semibold text-foreground after:absolute after:inset-x-0 after:inset-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="truncate">{project.name}</span>
                        {project.appCount > 1 && (
                          <span className="shrink-0 rounded-full border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {project.appCount} apps
                          </span>
                        )}
                      </Link>
                      <p className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <Github className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate">{repoLabel(project.repoUrl)}</span>
                      </p>
                    </div>
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                  {project.framework ? frameworkLabel(project.framework) : '—'}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={project.lastStatus} />
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  {project.domain ? (
                    <div className="flex items-center gap-1.5">
                      <a
                        href={`https://${project.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="relative z-10 inline-flex max-w-full items-center gap-0.5 text-muted-foreground hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        <span className="truncate max-w-[14rem]">{project.domain}</span>
                        <ArrowUpRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="sr-only">(nouvel onglet)</span>
                      </a>
                      {project.tlsValid !== null && (
                        <span title={cert.detail ?? cert.label} className="relative z-10 inline-flex shrink-0">
                          {cert.tone === 'success' ? (
                            <ShieldCheck className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                          ) : (
                            <ShieldAlert className="h-3.5 w-3.5 text-warning" aria-hidden="true" />
                          )}
                          <span className="sr-only">Certificat : {cert.label}</span>
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">
                  {project.lastAt ? (
                    <div className="space-y-0.5">
                      <div><time dateTime={project.lastAt} suppressHydrationWarning>{relativeTime(project.lastAt)}</time></div>
                      <div className="flex items-center gap-1.5 font-mono tabular-nums">
                        <GitBranch className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span className="truncate max-w-[8rem]">{project.branch}</span>
                        {project.lastCommit && (
                          <span className="inline-flex items-center gap-1">
                            <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{project.lastCommit}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  ) : (
                    <span>—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
