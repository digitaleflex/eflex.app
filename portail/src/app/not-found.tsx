import type { Metadata } from 'next'
import Link from 'next/link'
import { SearchX } from 'lucide-react'
import { SystemLink, SystemScreen } from '@/components/system-screen'

export const metadata: Metadata = {
  title: 'Page introuvable — EFLEX',
  description: 'L’adresse demandée n’existe pas ou n’est plus disponible.',
}

export default function NotFound() {
  return (
    <SystemScreen
      icon={SearchX}
      tone="neutral"
      title="Cette page n’existe pas"
      description={
        <>
          <p>
            L’adresse est peut-être incomplète, ou le lien a changé depuis qu’il a été partagé.
          </p>
          <p>Vos projets et vos déploiements restent accessibles depuis la console.</p>
        </>
      }
      footer={
        <p>
          Vous cherchiez un état des services ?{' '}
          <Link href="/status" className="font-medium text-foreground underline underline-offset-2 hover:no-underline">
            Consulter le statut
          </Link>
        </p>
      }
    >
      <SystemLink href="/" variant="primary">
        Retour à l’accueil
      </SystemLink>
      <SystemLink href="/dashboard">Ouvrir la console</SystemLink>
    </SystemScreen>
  )
}
