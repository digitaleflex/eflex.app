import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/marketing/legal-page'
import { getLegalCompanyInfo } from '@/lib/legal-info'

export const metadata: Metadata = {
  title: 'Politique de confidentialité',
  description: 'Informations sur les données traitées dans le cadre du service EFLEX.',
}

export default function ConfidentialitePage() {
  const company = getLegalCompanyInfo()

  return (
    <LegalPage
      title="Politique de confidentialité"
      description="Informations sur les données personnelles traitées, leurs finalités, leurs durées de conservation et vos droits."
      updatedAt="28 novembre 2026"
    >
      <LegalSection title="1. Responsable du traitement">
        <p className="text-muted-foreground">
          Responsable du traitement : <span className="font-medium text-foreground">{company.name}</span>, {company.legalForm.toLowerCase()} de {company.publisher}, RCCM {company.rccm}, IFU {company.ifu}, {company.address}.
          Contact :{' '}
          <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            {company.email}
          </a>.
        </p>
        <p className="text-muted-foreground">
          Cadre applicable : {company.dataProtectionLaw}. Autorité de contrôle : {company.dataAuthority}.
        </p>
      </LegalSection>

      <LegalSection title="2. Données traitées">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li><span className="font-medium text-foreground">Compte</span> : nom, e-mail, identifiants techniques, préférences, état de vérification, méthodes d’authentification.</li>
          <li><span className="font-medium text-foreground">Organisation</span> : nom d’organisation, membres, rôles, invitations, informations de facturation liées à l’organisation.</li>
          <li><span className="font-medium text-foreground">Projets</span> : dépôt connecté, branche, configuration, domaines, variables d’environnement (stockées chiffrées), journaux de déploiement/exécution.</li>
          <li><span className="font-medium text-foreground">Facturation</span> : plan, statut d’abonnement, références de transaction/facture, montant, dates. Les données de paiement sensibles sont traitées par les prestataires de paiement.</li>
          <li><span className="font-medium text-foreground">Sécurité/support</span> : adresses IP, logs techniques, événements de sécurité, échanges avec le support.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Finalités">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Fournir, maintenir et sécuriser le service EFLEX.</li>
          <li>Authentifier les utilisateurs, gérer les organisations et les autorisations.</li>
          <li>Exécuter les déploiements, afficher les statuts, logs et diagnostics.</li>
          <li>Gérer les abonnements, paiements, factures et notifications liées au service.</li>
          <li>Prévenir les abus, incidents de sécurité et fraudes.</li>
          <li>Répondre aux demandes de support et obligations légales.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Bases légales">
        <p className="text-muted-foreground">
          Selon le traitement : exécution du contrat, intérêt légitime (sécurité, prévention abus, amélioration du service), obligation légale (facturation/comptabilité)
          et, le cas échéant, consentement (traceurs non essentiels). Les bases légales définitives doivent être validées par l’éditeur.
        </p>
      </LegalSection>

      <LegalSection title="5. Sous-traitants et transferts">
        <p className="text-muted-foreground">
          EFLEX peut recourir à des sous-traitants pour l’hébergement, l’e-mail transactionnel, le paiement et l’intégration dépôt source. La liste indicative est publiée sur{' '}
          <Link href="/sous-traitants" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            Sous-traitants
          </Link>.
        </p>
        <p className="text-muted-foreground">
          Les données sont hébergées dans l’Union européenne (Contabo). Cloudflare, Resend et GitHub peuvent les traiter aux États-Unis.
        </p>
      </LegalSection>

      <LegalSection title="6. Conservation">
        <p className="text-muted-foreground">
          Durées de conservation : [à valider par l’exploitant, par catégorie].
        </p>
      </LegalSection>

      <LegalSection title="7. Sécurité">
        <p className="text-muted-foreground">
          Mesures mises en œuvre selon l’état actuel du service : contrôle d’accès, isolation par organisation, chiffrement des variables d’environnement en base,
          journalisation, limitations de débit et protections applicatives. Voir{' '}
          <Link href="/securite" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            Sécurité
          </Link>.
        </p>
      </LegalSection>

      <LegalSection title="8. Vos droits">
        <p className="text-muted-foreground">
          Selon la réglementation applicable, vous pouvez demander l’accès, la rectification, l’effacement, la limitation, l’opposition ou la portabilité.
          Contact :{' '}
          <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            {company.email}
          </a>. Délai de réponse aux demandes de droits : 30 jours.
        </p>
        <p className="text-muted-foreground">
          Autorité de réclamation : vous pouvez adresser une réclamation à l’{company.dataAuthority}.
        </p>
      </LegalSection>

      <LegalSection title="9. Cookies">
        <p className="text-muted-foreground">
          Voir la page{' '}
          <Link href="/cookies" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            Cookies et traceurs
          </Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
