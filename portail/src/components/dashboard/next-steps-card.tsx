'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { CheckCircle2, Circle, X } from 'lucide-react'
import type { NextStep } from '@/lib/next-steps'
import { allStepsDone } from '@/lib/next-steps'
import { cn } from '@/lib/utils'

const KEY = 'eflex.next-steps.dismissed'

export function NextStepsCard({ steps }: { steps: NextStep[] }) {
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(KEY) === '1' || allStepsDone(steps))
    } catch {
      setDismissed(allStepsDone(steps))
    }
  }, [steps])

  if (dismissed || steps.length === 0 || allStepsDone(steps)) return null

  const dismiss = () => {
    try { localStorage.setItem(KEY, '1') } catch {}
    setDismissed(true)
  }

  const doneCount = steps.filter((s) => s.done).length
  return (
    <section aria-labelledby="next-steps-title" className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="next-steps-title" className="text-sm font-semibold">Prochaines étapes</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Finalisez la mise en route de votre projet ({doneCount}/{steps.length}).</p>
        </div>
        <button type="button" onClick={dismiss} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Masquer les prochaines étapes">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {steps.map((step) => (
          <li key={step.id}>
            <Link href={step.href} className={cn('flex items-center gap-2 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', step.done && 'text-muted-foreground')}>
              {step.done ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
              <span className={step.done ? 'line-through' : 'font-medium'}>{step.label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
