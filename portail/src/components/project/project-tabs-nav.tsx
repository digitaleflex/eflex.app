import Link from 'next/link'
import {
  PROJECT_ADVANCED_TABS,
  PROJECT_MAIN_TABS,
  isProjectAdvancedTab,
  projectTabHref,
  type ProjectTab,
} from '@/lib/project-tabs'
import { cn } from '@/lib/utils'

export function ProjectTabsNav({
  projectId,
  activeTab,
  deploymentCount,
  variableCount,
  previewCount = 0,
}: {
  projectId: string
  activeTab: ProjectTab
  deploymentCount: number
  variableCount: number
  previewCount?: number
}) {
  const advancedActive = isProjectAdvancedTab(activeTab)

  const countFor = (id: ProjectTab) => {
    if (id === 'deployments') return deploymentCount
    if (id === 'variables') return variableCount
    if (id === 'previews') return previewCount
    return null
  }

  const renderTab = (item: { id: ProjectTab; label: string; short: string }, muted = false) => {
    const active = activeTab === item.id
    const count = countFor(item.id)
    return (
      <Link
        key={item.id}
        href={projectTabHref(projectId, item.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:-mb-px sm:shrink sm:justify-start sm:rounded-none sm:border-b-2',
          active
            ? 'bg-muted text-foreground sm:bg-transparent sm:border-foreground'
            : muted
              ? 'text-muted-foreground/80 hover:text-foreground sm:border-transparent'
              : 'text-muted-foreground hover:text-foreground sm:border-transparent',
        )}
      >
        <span className="sm:hidden">{item.short}</span>
        <span className="hidden sm:inline">{item.label}</span>
        {count !== null && count > 0 && (
          <span className="rounded-full bg-muted px-1.5 text-xs font-normal tabular-nums text-muted-foreground">
            {count}
          </span>
        )}
      </Link>
    )
  }

  return (
    <nav
      aria-label="Sections du projet"
      className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1 [scrollbar-width:none] sm:flex-wrap sm:items-end sm:gap-0 sm:overflow-visible sm:rounded-none sm:border-0 sm:border-b sm:bg-transparent sm:p-0"
    >
      {PROJECT_MAIN_TABS.map((item) => renderTab(item))}

      <div
        className="ml-1 flex shrink-0 items-center gap-1 border-l border-border pl-2 sm:ml-2 sm:gap-0 sm:pl-2"
        role="group"
        aria-label="Sections avancées"
      >
        <span
          className={cn(
            'shrink-0 px-1 text-[10px] font-semibold uppercase tracking-wide sm:px-2 sm:text-[11px]',
            advancedActive ? 'text-foreground/70' : 'text-muted-foreground/70',
          )}
        >
          Avancé
        </span>
        {PROJECT_ADVANCED_TABS.map((item) => renderTab(item, !advancedActive))}
      </div>
    </nav>
  )
}
