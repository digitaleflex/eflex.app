import { Info } from 'lucide-react'
import type { VercelCompatReport } from '@/lib/migrations/vercel-compat'

const LEVEL_LABEL = {
  unsupported: 'Non pris en charge',
  reconfigure: 'À reconfigurer',
  ok: 'À reporter',
} as const

/** Constats de compatibilité Vercel (#148, MIG-3) : seulement quand le dépôt porte des traces de Vercel. */
export function VercelCompatNote({ report }: { report: VercelCompatReport | undefined }) {
  if (!report || (report.findings.length === 0 && report.unknown.length === 0)) return null
  return (
    <div role="note" className="rounded-xl border border-border bg-card p-4 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Info className="h-4 w-4 text-primary" aria-hidden="true" />
        Ce projet vient de Vercel : ce qui change chez EFLEX
      </p>
      {report.findings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {report.findings.map((finding) => (
            <li key={finding.rule}>
              <span className="font-medium">{finding.title}</span>{' '}
              <span className="text-muted-foreground">· {LEVEL_LABEL[finding.level]}</span>
              <br />
              <span className="text-muted-foreground">{finding.action}</span>
            </li>
          ))}
        </ul>
      )}
      {report.unknown.length > 0 && (
        <p className="mt-3 text-muted-foreground">
          Réglages de <code className="font-mono">vercel.json</code> non analysés, à vérifier à la main : {report.unknown.join(', ')}.
        </p>
      )}
    </div>
  )
}
