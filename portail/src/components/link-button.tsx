import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const variants = {
  primary: 'border border-transparent bg-primary text-primary-foreground shadow-sm hover:bg-primary/90',
  outline: 'border border-input bg-background text-foreground hover:bg-secondary hover:text-secondary-foreground',
} as const

type LinkButtonProps = Omit<ComponentProps<typeof Link>, 'href' | 'className'> & {
  href: string
  variant?: keyof typeof variants
  className?: string
  children: ReactNode
}

/**
 * Lien d'action qui reprend l'apparence d'un bouton, sans `asChild` :
 * la sémantique reste celle d'un lien (navigation), le clavier et le focus sont natifs.
 */
export function LinkButton({ href, variant = 'outline', className, children, ...props }: LinkButtonProps) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 text-sm font-medium',
        'transition-[background-color,color,border-color] duration-200 ease-out-expo',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        variants[variant],
        className,
      )}
      {...props}
    >
      {children}
    </Link>
  )
}
