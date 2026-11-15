import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { buttonClasses, type ButtonSize, type ButtonVariant } from '@/components/ui/button'

type LinkButtonProps = Omit<ComponentProps<typeof Link>, 'href' | 'className'> & {
  href: string
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  children: ReactNode
}

/**
 * Lien d'action qui reprend l'apparence d'un bouton, sans `asChild` :
 * la sémantique reste celle d'un lien (navigation), le clavier et le focus sont natifs.
 */
export function LinkButton({
  href,
  variant = 'outline',
  size = 'md',
  className,
  children,
  ...props
}: LinkButtonProps) {
  return (
    <Link href={href} className={cn(buttonClasses({ variant, size }), className)} {...props}>
      {children}
    </Link>
  )
}
