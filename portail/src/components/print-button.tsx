'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/** Ouvre la boîte d'impression du navigateur (« Enregistrer en PDF » incluse). */
export function PrintButton({ label = 'Imprimer / PDF' }: { label?: string }) {
  return (
    <Button type="button" variant="secondary" size="sm" onClick={() => window.print()} className="print:hidden">
      <Printer className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  )
}
