import Link from 'next/link'
import { requireAdminPage } from '@/lib/admin'
import { CoolifyControl } from '@/components/admin/coolify-control'

export const metadata = { title: 'Pilotage Coolify — Administration' }
export const dynamic = 'force-dynamic'

export default async function CoolifyAdminPage() {
  await requireAdminPage('admin.coolify.read')
  return (
    <div className="space-y-6">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-tight">Pilotage Coolify</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Serveurs, stockages de sauvegarde, sécurité des images, déploiements et journal de Coolify, sans ouvrir son
          interface. Chaque action est inscrite au{' '}
          <Link href="/admin/audit" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
            journal d’audit
          </Link>
          . L’état général de la plateforme reste dans{' '}
          <Link href="/admin/infrastructure" className="font-medium text-foreground underline underline-offset-2 hover:text-primary">
            Infrastructure
          </Link>
          .
        </p>
      </div>
      <CoolifyControl />
    </div>
  )
}
