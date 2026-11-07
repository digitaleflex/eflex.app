import { cn } from '@/lib/utils'
import { HTMLAttributes } from 'react'

type BadgeVariant = 'default' | 'success' | 'warning' | 'destructive' | 'outline'

const badgeVariants: Record<BadgeVariant, string> = {
  default: 'bg-primary/10 text-primary border-primary/20',
  success: 'bg-success/10 text-success border-success/25',
  warning: 'bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300',
  destructive: 'bg-destructive/10 text-destructive border-destructive/25',
  outline: 'bg-transparent text-muted-foreground border-border',
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium leading-relaxed',
        'transition-colors duration-200 ease-out-expo',
        badgeVariants[variant],
        className
      )}
      {...props}
    />
  )
}
