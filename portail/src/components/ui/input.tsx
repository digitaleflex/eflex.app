import { cn } from '@/lib/utils'
import { InputHTMLAttributes, forwardRef, useId } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, hint, id, type, spellCheck, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id ?? `input-${generatedId}`
    const hintId = `${inputId}-hint`
    const errorId = `${inputId}-error`
    const describedBy = [error ? errorId : null, hint && !error ? hintId : null]
      .filter(Boolean)
      .join(' ') || undefined

    return (
      <div className="space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <input
          id={inputId}
          type={type}
          spellCheck={spellCheck ?? (type === 'email' ? false : undefined)}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            'flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm',
            'file:border-0 file:bg-transparent file:text-sm file:font-medium',
            'placeholder:text-muted-foreground placeholder:opacity-80',
            'hover:border-foreground/25',
            'transition-[border-color,box-shadow] duration-200 ease-out-expo',
            'focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive focus-visible:border-destructive focus-visible:ring-destructive',
            className
          )}
          ref={ref}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs font-medium text-destructive">
            {error}
          </p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
