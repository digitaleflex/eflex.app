import type { Metadata } from 'next'
import { LegalPage, LegalSection, PlaceholderNotice } from '@/components/marketing/legal-page'
import { getLegalCompanyInfo } from '@/lib/legal-info'

export const metadata: Metadata = {
  title: 'Mentions légales — Eflex',
  description: 'Informations sur l’éditeur et l’hébergement du service Eflex.',
}

export default function MentionsLegalesPage() {
  const company = getLegalCompanyInfo()

  return (
    <LegalPage
      title="Mentions légales"
      description="Informations relatives à l’éditeur du service et aux conditions de publication du site."
      updatedAt="À compléter"
    >
      <LegalSection title="Éditeur du service">
        <dl className="grid gap-2 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="font-medium text-muted-foreground">Nom / raison sociale</dt>
          <dd>{company.name}</dd>
          <dt className="font-medium text-muted-foreground">Adresse</dt>
          <dd>{company.address || 'À renseigner (INVOICE_COMPANY_ADDRESS)'}</dd>
          <dt className="font-medium text-muted-foreground">Contact</dt>
          <dd>
            <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded">
              {company.email}
            </a>
          </dd>
          <dt className="font-medium text-muted-foreground">Identifiant fiscal / immatriculation</dt>
          <dd>{company.taxId || 'À renseigner (INVOICE_TAX_ID)'}</dd>
        </dl>
        <p className="text-muted-foreground">
          Ces informations proviennent de la configuration de l’éditeur (variables de facturation). Elles doivent être
          complétées et vérifiées par l’éditeur du service.
        </p>
      </LegalSection>

      <LegalSection title="Hébergement">
        <PlaceholderNotice />
        <p className="text-muted-foreground">
          Renseigner ici les informations relatives à l’hébergeur du site et de l’infrastructure (nom, adresse, contact),
          conformément aux obligations applicables.
        </p>
      </LegalSection>

      <LegalSection title="Directeur de la publication">
        <PlaceholderNotice />
      </LegalSection>

      <LegalSection title="Propriété intellectuelle et responsabilité">
        <PlaceholderNotice />
      </LegalSection>
    </LegalPage>
  )
}
