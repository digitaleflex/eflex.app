import { cn } from '@/lib/utils'
import { ButtonHTMLAttributes, forwardRef } from 'react'

const variants = {
  primary:
    'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md focus-visible:ring-primary disabled:bg-muted disabled:text-muted-foreground',
  secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80 disabled:text-muted-foreground',
  outline:
    'border border-input bg-background hover:bg-secondary hover:text-secondary-foreground disabled:border-border disabled:text-muted-foreground',
  ghost: 'hover:bg-muted hover:text-foreground disabled:text-muted-foreground',
  destructive:
    'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 disabled:bg-muted disabled:text-muted-foreground',
  accent: 'bg-accent text-accent-foreground shadow-sm hover:bg-accent/90 disabled:bg-muted disabled:text-muted-foreground',
  link: 'text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline',
} as const

const sizes = {
  sm: 'h-9 px-3 text-xs rounded-md gap-1.5 [@media(pointer:coarse)]:h-11',
  md: 'h-11 px-4 text-sm rounded-lg gap-2',
  lg: 'h-12 px-6 text-base rounded-lg gap-2.5',
  xl: 'h-14 px-8 text-base rounded-xl gap-3',
  icon: 'h-11 w-11',
} as const

type ButtonVariant = keyof typeof variants
type ButtonSize = keyof typeof sizes

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  /**
   * Pourquoi le bouton est inactif (« Aucune modification à enregistrer »…). Affiché au survol et lu par
   * les lecteurs d'écran : un bouton inactif doit dire pourquoi (skill fixing-accessibility).
   */
  disabledReason?: string
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, children, disabled, disabledReason, title, ...props }, ref) => {
    const showReason = Boolean(disabled && !loading && disabledReason)
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center whitespace-nowrap font-medium',
          'transition-[background-color,color,box-shadow,border-color,transform] duration-200 ease-out-expo',
          'active:scale-[0.98]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          // Inactif : couleurs « muted » propres à chaque variante, sans opacité (un bleu délavé se lisait mal
          // et ressemblait à une panne). Le curseur et le titre restent disponibles pour expliquer pourquoi.
          'disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100',
          variants[variant],
          sizes[size],
          className
        )}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        title={showReason ? disabledReason : title}
        {...props}
      >
        {loading && (
          <svg
            className="-ml-1 h-4 w-4 animate-spin"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
        {showReason && <span className="sr-only"> ({disabledReason})</span>}
      </button>
    )
  }
)

Button.displayName = 'Button'
