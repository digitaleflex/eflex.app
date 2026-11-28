import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/marketing/legal-page'
import { getLegalCompanyInfo } from '@/lib/legal-info'
import { GRACE_PERIOD_DAYS, PERIOD_DAYS } from '@/lib/plans'

export const metadata: Metadata = {
  title: 'Conditions d’utilisation et de vente',
  description: 'Conditions générales d’utilisation et, le cas échéant, de vente du service EFLEX.',
}

export default function ConditionsPage() {
  const company = getLegalCompanyInfo()

  return (
    <LegalPage
      title="Conditions d’utilisation et de vente"
      description="Cadre contractuel applicable à l’utilisation du service EFLEX (CGU) et, le cas échéant, aux abonnements (CGV)."
      updatedAt="28 novembre 2026"
    >
      <LegalSection title="1. Éditeur">
        <p className="text-muted-foreground">
          Le service EFLEX est édité par <span className="font-medium text-foreground">{company.name}</span>, {company.legalForm.toLowerCase()} de {company.publisher}, RCCM {company.rccm}, IFU {company.ifu}, {company.address}.
          Contact :{' '}
          <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            {company.email}
          </a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Objet">
        <p className="text-muted-foreground">
          EFLEX fournit une plateforme permettant de connecter un dépôt source, analyser un projet compatible, configurer des variables d’environnement,
          déclencher des déploiements, suivre leur état et leurs journaux, et gérer certains services associés (domaines, bases managées, organisation, facturation)
          selon les fonctionnalités disponibles.
        </p>
      </LegalSection>

      <LegalSection title="3. Création de compte et sécurité">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>L’utilisateur fournit des informations exactes et maintient son compte à jour.</li>
          <li>Les identifiants et moyens d’authentification sont personnels et doivent être protégés.</li>
          <li>L’utilisateur est responsable des actions effectuées via son compte, sauf preuve contraire.</li>
          <li>EFLEX peut appliquer des mesures de sécurité : vérification e-mail, limitation de débit, authentification renforcée, suspension en cas d’abus.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Abonnements, facturation et paiement">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Les plans, limites et prix affichés ou communiqués par EFLEX s’appliquent selon le plan effectif de l’organisation.</li>
          <li>Sauf indication contraire, une période de facturation dure <span className="font-medium text-foreground">{PERIOD_DAYS} jours</span>.</li>
          <li>Les paiements peuvent être traités par des prestataires tiers (ex. mobile money/carte selon disponibilité).</li>
          <li>Les prix sont indiqués en FCFA, sans TVA facturée, au régime de la TPS. Une facture normalisée e-MECeF est émise pour chaque paiement.</li>
          <li>Pas de remboursement d’une période de 30 jours déjà commencée. Un remboursement peut être accordé au cas par cas en cas d’indisponibilité grave du service imputable à EFLEX.</li>
          <li>Le service est utilisable dès l’abonnement. L’utilisateur demande l’exécution immédiate du service et reconnaît qu’il ne peut pas se rétracter une fois le service activé. <span className="font-medium text-foreground">Point à faire valider :</span> il n’a pas été vérifié si le droit béninois prévoit un droit de rétractation pour ce type de service.</li>
          <li>En cas d’impayé, une période de grâce de <span className="font-medium text-foreground">{GRACE_PERIOD_DAYS} jours</span> peut s’appliquer. Pendant la grâce, les limites du plan souscrit peuvent être conservées.</li>
          <li>À l’issue de la grâce, les créations et nouveaux déploiements peuvent être bloqués jusqu’à régularisation. Les applications déjà en ligne et les données ne sont pas supprimées automatiquement du seul fait de l’impayé.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Utilisation acceptable">
        <p className="text-muted-foreground">L’utilisateur s’interdit notamment de :</p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>déployer ou héberger des contenus/applications illicites, frauduleux ou portant atteinte à des tiers ;</li>
          <li>tenter de contourner la sécurité, l’isolation, les limites ou les contrôles d’accès ;</li>
          <li>utiliser EFLEX pour du spam, malware, phishing, minage abusif, attaques ou trafic malveillant ;</li>
          <li>perturber la plateforme, ses infrastructures ou les autres utilisateurs.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Responsabilités">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>L’utilisateur reste responsable de son code, ses dépôts, ses dépendances, ses secrets, ses données, ses domaines et ses applications.</li>
          <li>EFLEX fournit un outil technique de déploiement/opération ; il ne garantit pas que toute application sera compatible, sécurisée, performante ou conforme.</li>
          <li>La détection de stack ou les diagnostics sont des aides opérationnelles ; ils ne constituent pas une certification.</li>
          <li>Sauf engagement contractuel distinct, EFLEX ne garantit pas une disponibilité continue, un temps de rétablissement ou une absence de perte de données.</li>
        </ul>
      </LegalSection>

      <LegalSection title="7. Sauvegardes et restauration">
        <p className="text-muted-foreground">
          Certaines fonctionnalités de sauvegarde peuvent être proposées selon les services. Sauf mention contractuelle explicite, une sauvegarde ne vaut pas garantie
          de restauration testée, complète ou immédiate. L’utilisateur doit mettre en place sa propre stratégie de continuité pour les données critiques.
        </p>
      </LegalSection>

      <LegalSection title="8. Suspension, résiliation et données">
        <p className="text-muted-foreground">
          L’utilisateur peut résilier à tout moment depuis son compte ; l’accès reste actif jusqu’à la fin de la période payée. EFLEX peut suspendre ou restreindre l’accès en cas d’impayé, d’abus, de risque de sécurité, de violation des conditions ou d’obligation légale, avec la période de grâce de {GRACE_PERIOD_DAYS} jours prévue en cas d’impayé.
        </p>
        <p className="text-muted-foreground">
          L’utilisateur peut exporter ses projets pendant 30 jours après la résiliation, puis ils sont supprimés définitivement.
        </p>
      </LegalSection>

      <LegalSection title="9. Droit applicable et juridiction">
        <p className="text-muted-foreground">
          Les présentes conditions sont soumises au {company.applicableLaw}. Tout litige relève de la compétence des {company.jurisdiction}.
        </p>
        <p className="text-muted-foreground">
          Contact :{' '}
          <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            {company.email}
          </a>. Voir aussi la{' '}
          <Link href="/confidentialite" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            Politique de confidentialité
          </Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
