import type { Metadata } from 'next'
import { LegalPage, LegalSection, PlaceholderNotice } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Politique de confidentialité — EFLEX',
  description: 'Informations sur les données traitées dans le cadre du service EFLEX.',
}

export default function ConfidentialitePage() {
  return (
    <LegalPage
      title="Politique de confidentialité"
      description="Informations sur les données personnelles traitées, leurs finalités, leurs durées de conservation et vos droits."
      updatedAt="À compléter"
    >
      <LegalSection title="Responsable du traitement">
        <PlaceholderNotice />
      </LegalSection>

      <LegalSection title="Données collectées et finalités">
        <PlaceholderNotice />
        <p className="text-muted-foreground">
          Décrire les catégories de données traitées (compte, connexion, facturation, journaux techniques, etc.) et les finalités associées.
        </p>
      </LegalSection>

      <LegalSection title="Base légale, destinataires et transferts">
        <PlaceholderNotice />
      </LegalSection>

      <LegalSection title="Durées de conservation et sécurité">
        <PlaceholderNotice />
      </LegalSection>

      <LegalSection title="Vos droits">
        <PlaceholderNotice />
        <p className="text-muted-foreground">
          Préciser les modalités d’exercice des droits (accès, rectification, effacement, opposition, portabilité, etc.) et le contact dédié.
        </p>
      </LegalSection>

      <LegalSection title="Cookies et traceurs">
        <PlaceholderNotice />
      </LegalSection>
    </LegalPage>
  )
}
