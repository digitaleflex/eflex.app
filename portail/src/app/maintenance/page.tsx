import type { Metadata } from 'next'
import { CircleCheck, Wrench } from 'lucide-react'
import { SystemLink, SystemScreen } from '@/components/system-screen'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Maintenance — Eflex',
  description: 'État de maintenance de la plateforme Eflex.',
}

export default function MaintenancePage() {
  const active = process.env.MAINTENANCE_MODE === 'true'
  const message = process.env.MAINTENANCE_MESSAGE

  // La page reste accessible par lien direct hors maintenance : elle ne doit pas
  // annoncer une opération qui n'a pas lieu.
  if (!active) {
    return (
      <SystemScreen
        icon={CircleCheck}
        tone="neutral"
        title="Aucune maintenance en cours"
        description={
          <>
            <p>La plateforme Eflex fonctionne normalement.</p>
            <p>
              Cette page reste disponible si vous avez suivi un ancien lien. Le statut des services
              donne l’état observé des composants.
            </p>
          </>
        }
        footer={<p>Cette page ne bloque pas l’accès à la plateforme tant que la maintenance n’est pas activée.</p>}
      >
        <SystemLink href="/status" variant="primary">
          Voir le statut des services
        </SystemLink>
        <SystemLink href="/">Aller à l’accueil</SystemLink>
      </SystemScreen>
    )
  }

  return (
    <SystemScreen
      icon={Wrench}
      tone="warning"
      title="La plateforme est en maintenance"
      description={
        <>
          <p>
            {message ||
              'Une opération de maintenance est en cours. Les services reviennent automatiquement dès qu’elle est terminée.'}
          </p>
          <p>
            La page de statut reste accessible pendant l’opération : elle indique l’état des composants
            et les incidents déclarés.
          </p>
        </>
      }
      footer={
        <p>
          Le service répond temporairement par le code HTTP 503. Inutile de recharger en boucle : l’accès
          est rétabli dès la fin de la maintenance.
        </p>
      }
    >
      <SystemLink href="/status" variant="primary">
        Voir le statut des services
      </SystemLink>
      <SystemLink href="/">Aller à l’accueil</SystemLink>
    </SystemScreen>
  )
}
