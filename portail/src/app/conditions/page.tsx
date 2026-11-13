import type { Metadata } from 'next'
import { LegalPage, LegalSection, PlaceholderNotice } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Conditions d’utilisation et de vente — Eflex',
  description: 'Conditions générales d’utilisation et, le cas échéant, de vente du service Eflex.',
}

export default function ConditionsPage() {
  return (
    <LegalPage
      title="Conditions d’utilisation et de vente"
      description="Cadre contractuel applicable à l’utilisation du service Eflex (CGU) et, le cas échéant, aux abonnements (CGV)."
      updatedAt="À compléter"
    >
      <LegalSection title="Objet du service">
        <PlaceholderNotice />
        <p className="text-muted-foreground">
          Décrire le service fourni, son périmètre fonctionnel et les conditions d’accès.
        </p>
      </LegalSection>

      <LegalSection title="Création de compte et accès">
        <PlaceholderNotice />
      </LegalSection>

      <LegalSection title="Abonnements, paiements et facturation">
        <PlaceholderNotice />
        <p className="text-muted-foreground">
          Préciser les modalités de souscription, de renouvellement, de paiement (mobile money, carte selon moyens disponibles),
          les périodes de facturation, les conditions de rétractation/annulation et de remboursement le cas échéant.
        </p>
      </LegalSection>

      <LegalSection title="Utilisation acceptable et responsabilités">
        <PlaceholderNotice />
      </LegalSection>

      <LegalSection title="Disponibilité, support et limites">
        <PlaceholderNotice />
      </LegalSection>

      <LegalSection title="Résiliation et droit applicable">
        <PlaceholderNotice />
      </LegalSection>
    </LegalPage>
  )
}
