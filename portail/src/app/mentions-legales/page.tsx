import type { Metadata } from 'next'
import Link from 'next/link'
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
      <LegalSection title="Éditeur du service">
        <p className="text-muted-foreground">
          eflex.app est édité par {company.name}, {company.legalForm.toLowerCase()} de {company.publisher}.
        </p>
        <dl className="grid gap-2 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="font-medium text-muted-foreground">Nom commercial</dt>
          <dd>{company.name}</dd>
          <dt className="font-medium text-muted-foreground">Forme juridique</dt>
          <dd>{company.legalForm}</dd>
          <dt className="font-medium text-muted-foreground">Exploitant</dt>
          <dd>{company.publisher}</dd>
          <dt className="font-medium text-muted-foreground">Directeur de la publication</dt>
          <dd>{company.publicationDirector}</dd>
          <dt className="font-medium text-muted-foreground">RCCM</dt>
          <dd>{company.rccm}</dd>
          <dt className="font-medium text-muted-foreground">IFU</dt>
          <dd>{company.ifu}</dd>
          <dt className="font-medium text-muted-foreground">Adresse</dt>
          <dd>{company.address}</dd>
          <dt className="font-medium text-muted-foreground">E-mail</dt>
          <dd>
            <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
              {company.email}
            </a>
          </dd>
        </dl>
      </LegalSection>

      <LegalSection title="Hébergement">
        <p className="text-muted-foreground">
          Les informations ci-dessous correspondent à l’hébergeur du site et, le cas échéant, à l’infrastructure utilisée pour le service.
        </p>
        <dl className="grid gap-2 rounded-lg border border-border bg-card p-4 text-sm sm:grid-cols-[12rem_1fr]">
          <dt className="font-medium text-muted-foreground">Hébergeur</dt>
          <dd>Contabo GmbH</dd>
          <dt className="font-medium text-muted-foreground">Adresse</dt>
          <dd>Welfenstraße 22, 81541 Munich, Allemagne</dd>
          <dt className="font-medium text-muted-foreground">Pays</dt>
          <dd>Allemagne</dd>
          <dt className="font-medium text-muted-foreground">Région du serveur</dt>
          <dd>Union européenne</dd>
          <dt className="font-medium text-muted-foreground">Contact</dt>
          <dd>
            <a href="https://contabo.com" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
              contabo.com
            </a>
          </dd>
        </dl>
      </LegalSection>

      <LegalSection title="Propriété intellectuelle">
        <p className="text-muted-foreground">
          Le site EFLEX, sa marque, ses logos, ses éléments graphiques, textes, interfaces, composants visuels, documentation et contenus associés sont la propriété
          d’{company.name} ({company.legalForm.toLowerCase()} de {company.publisher}), sauf mention contraire. Toute reproduction, représentation, adaptation ou exploitation
          non autorisée, totale ou partielle, est interdite, sous réserve des exceptions prévues par la loi.
        </p>
      </LegalSection>

      <LegalSection title="Données personnelles">
        <p className="text-muted-foreground">
          Les informations relatives au traitement des données personnelles figurent dans la{' '}
          <Link href="/confidentialite" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            Politique de confidentialité
          </Link>. L’autorité de contrôle compétente est l’{company.dataAuthority}.
        </p>
      </LegalSection>

      <LegalSection title="Droit applicable et juridiction">
        <p className="text-muted-foreground">
          Les présentes mentions légales sont soumises au {company.applicableLaw}. Tout litige relève de la compétence des {company.jurisdiction}.
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
