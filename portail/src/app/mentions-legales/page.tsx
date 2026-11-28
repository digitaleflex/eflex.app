import type { Metadata } from 'next'
import { LegalPage, LegalSection } from '@/components/marketing/legal-page'
import { getLegalCompanyInfo } from '@/lib/legal-info'

export const metadata: Metadata = {
  title: 'Mentions légales',
  description: 'Informations sur l’éditeur et l’hébergement du service EFLEX.',
}

export default function MentionsLegalesPage() {
  const company = getLegalCompanyInfo()

  return (
    <LegalPage
      title="Mentions légales"
      description="Informations relatives à l’éditeur du service et aux conditions de publication du site."
      updatedAt="28 novembre 2026"
    >
      <p className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
        <strong className="font-semibold">À valider par l’éditeur :</strong> certaines informations légales dépendent de la structure de l’entreprise,
        du pays d’implantation et des contrats d’hébergement. Les champs « À renseigner » doivent être complétés avant publication définitive.
      </p>

      <LegalSection title="Éditeur du service">
        <dl className="grid gap-2 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="font-medium text-muted-foreground">Nom / raison sociale</dt>
          <dd>{company.name}</dd>
          <dt className="font-medium text-muted-foreground">Adresse</dt>
          <dd>{company.address || 'À renseigner'}</dd>
          <dt className="font-medium text-muted-foreground">E-mail de contact</dt>
          <dd>
            <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
              {company.email}
            </a>
          </dd>
          <dt className="font-medium text-muted-foreground">Identifiant fiscal / immatriculation</dt>
          <dd>{company.taxId || 'À renseigner'}</dd>
          <dt className="font-medium text-muted-foreground">Directeur de la publication</dt>
          <dd>À renseigner</dd>
          <dt className="font-medium text-muted-foreground">Forme juridique</dt>
          <dd>À renseigner</dd>
          <dt className="font-medium text-muted-foreground">Capital / RCCM / registre</dt>
          <dd>À renseigner selon les obligations locales</dd>
        </dl>
      </LegalSection>

      <LegalSection title="Hébergement">
        <p className="text-muted-foreground">
          Les informations ci-dessous doivent correspondre à l’hébergeur du site et, le cas échéant, à l’infrastructure utilisée pour le service.
        </p>
        <dl className="grid gap-2 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="font-medium text-muted-foreground">Hébergeur du site</dt>
          <dd>À renseigner</dd>
          <dt className="font-medium text-muted-foreground">Adresse</dt>
          <dd>À renseigner</dd>
          <dt className="font-medium text-muted-foreground">Téléphone / contact</dt>
          <dd>À renseigner</dd>
          <dt className="font-medium text-muted-foreground">Infrastructure applicative</dt>
          <dd>À renseigner (prestataire, région/pays, modalités contractuelles)</dd>
        </dl>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p className="text-muted-foreground">
          Le site EFLEX, sa marque, ses logos, ses éléments graphiques, textes, interfaces, composants visuels, documentation et contenus associés sont protégés
          par les règles applicables en matière de propriété intellectuelle, sauf mention contraire. Toute reproduction, représentation, adaptation ou exploitation
          non autorisée, totale ou partielle, est interdite, sous réserve des exceptions prévues par la loi.
        </p>
      </LegalSection>

      <LegalSection title="Responsabilité">
        <p className="text-muted-foreground">
          EFLEX s’efforce de fournir des informations exactes et un service accessible. Toutefois, l’éditeur ne peut garantir l’absence d’erreur, d’omission,
          d’indisponibilité ou d’interruption. L’utilisateur reste responsable de l’usage du service, de la configuration de ses projets, des secrets qu’il fournit,
          du code qu’il déploie et de la conformité légale des applications qu’il exploite.
        </p>
      </LegalSection>

      <LegalSection title="Contact">
        <p className="text-muted-foreground">
          Pour toute question relative au site, au service ou à ces mentions légales :{' '}
          <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            {company.email}
          </a>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
