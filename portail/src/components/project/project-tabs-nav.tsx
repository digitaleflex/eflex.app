import Link from 'next/link'
import { PROJECT_TABS, projectTabHref, type ProjectTab } from '@/lib/project-tabs'
import { cn } from '@/lib/utils'

export function ProjectTabsNav({
  projectId,
  activeTab,
  deploymentCount,
  variableCount,
}: {
  projectId: string
  activeTab: ProjectTab
  deploymentCount: number
  variableCount: number
}) {
  return (
    <nav
      aria-label="Sections du projet"
      className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-card p-1 sm:flex sm:gap-0 sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:p-0"
    >
      {PROJECT_TABS.map((item) => {
        const active = activeTab === item.id
        const count = item.id === 'deployments' ? deploymentCount : item.id === 'variables' ? variableCount : null
        return (
          <Link
            key={item.id}
            href={projectTabHref(projectId, item.id)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:-mb-px sm:justify-start sm:rounded-none sm:border-b-2',
              active
                ? 'bg-muted text-foreground sm:bg-transparent sm:border-foreground'
                : 'text-muted-foreground hover:text-foreground sm:border-transparent',
            )}
          >
            <span className="sm:hidden">{item.short}</span>
            <span className="hidden sm:inline">{item.label}</span>
            {count !== null && (
              <span className="rounded-full bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">
                {count}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
