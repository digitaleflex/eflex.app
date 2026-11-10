import type { HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

/**
 * Bloc de chargement purement décoratif : masqué aux lecteurs d'écran, l'état est annoncé
 * par le conteneur (`aria-busy`) ou un texte `sr-only`. Respecte `prefers-reduced-motion`.
 */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('animate-pulse rounded-control bg-muted motion-reduce:animate-none', className)}
      {...props}
    />
  )
}

/** Paragraphe factice de `lines` lignes, la dernière plus courte. */
export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn('space-y-2', className)}>
      {Array.from({ length: Math.max(1, lines) }, (_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  )
}
