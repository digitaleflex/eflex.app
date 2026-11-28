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
      <p className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
        <strong className="font-semibold">À valider par l’éditeur :</strong> ce document est un brouillon opérationnel basé sur le fonctionnement actuel d’EFLEX.
        Il doit être validé juridiquement (droit applicable, fiscalité, paiement, consommation/B2B, rétractation, responsabilité, résiliation).
      </p>

      <LegalSection title="1. Objet">
        <p className="text-muted-foreground">
          EFLEX fournit une plateforme permettant de connecter un dépôt source, analyser un projet compatible, configurer des variables d’environnement,
          déclencher des déploiements, suivre leur état et leurs journaux, et gérer certains services associés (domaines, bases managées, organisation, facturation)
          selon les fonctionnalités disponibles.
        </p>
      </LegalSection>

      <LegalSection title="2. Création de compte et sécurité">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>L’utilisateur fournit des informations exactes et maintient son compte à jour.</li>
          <li>Les identifiants et moyens d’authentification sont personnels et doivent être protégés.</li>
          <li>L’utilisateur est responsable des actions effectuées via son compte, sauf preuve contraire.</li>
          <li>EFLEX peut appliquer des mesures de sécurité : vérification e-mail, limitation de débit, authentification renforcée, suspension en cas d’abus.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Abonnements, facturation et paiement">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Les plans, limites et prix affichés ou communiqués par EFLEX s’appliquent selon le plan effectif de l’organisation.</li>
          <li>Sauf indication contraire, une période de facturation dure <span className="font-medium text-foreground">{PERIOD_DAYS} jours</span>.</li>
          <li>Les paiements peuvent être traités par des prestataires tiers (ex. mobile money/carte selon disponibilité).</li>
          <li>En cas d’impayé, une période de grâce de <span className="font-medium text-foreground">{GRACE_PERIOD_DAYS} jours</span> peut s’appliquer. Pendant la grâce, les limites du plan souscrit peuvent être conservées.</li>
          <li>À l’issue de la grâce, les créations et nouveaux déploiements peuvent être bloqués jusqu’à régularisation. Les applications déjà en ligne et les données ne sont pas supprimées automatiquement du seul fait de l’impayé.</li>
          <li>Les modalités de remboursement, annulation, rétractation, taxes et facturation définitive doivent être précisées par l’éditeur.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Utilisation acceptable">
        <p className="text-muted-foreground">L’utilisateur s’interdit notamment de :</p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>déployer ou héberger des contenus/applications illicites, frauduleux ou portant atteinte à des tiers ;</li>
          <li>tenter de contourner la sécurité, l’isolation, les limites ou les contrôles d’accès ;</li>
          <li>utiliser EFLEX pour du spam, malware, phishing, minage abusif, attaques ou trafic malveillant ;</li>
          <li>perturber la plateforme, ses infrastructures ou les autres utilisateurs.</li>
        </ul>
      </LegalSection>

      <LegalSection title="5. Responsabilités">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>L’utilisateur reste responsable de son code, ses dépôts, ses dépendances, ses secrets, ses données, ses domaines et ses applications.</li>
          <li>EFLEX fournit un outil technique de déploiement/opération ; il ne garantit pas que toute application sera compatible, sécurisée, performante ou conforme.</li>
          <li>La détection de stack ou les diagnostics sont des aides opérationnelles ; ils ne constituent pas une certification.</li>
          <li>Sauf engagement contractuel distinct, EFLEX ne garantit pas une disponibilité continue, un temps de rétablissement ou une absence de perte de données.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Sauvegardes et restauration">
        <p className="text-muted-foreground">
          Certaines fonctionnalités de sauvegarde peuvent être proposées selon les services. Sauf mention contractuelle explicite, une sauvegarde ne vaut pas garantie
          de restauration testée, complète ou immédiate. L’utilisateur doit mettre en place sa propre stratégie de continuité pour les données critiques.
        </p>
      </LegalSection>

      <LegalSection title="7. Suspension, résiliation et données">
        <p className="text-muted-foreground">
          EFLEX peut suspendre ou restreindre l’accès en cas de violation des conditions, risque sécurité, abus, impayé ou obligation légale. Les modalités de résiliation,
          d’export, de conservation et de suppression des données doivent être précisées par l’éditeur selon le contexte légal et contractuel.
        </p>
      </LegalSection>

      <LegalSection title="8. Droit applicable et contact">
        <p className="text-muted-foreground">
          À compléter : droit applicable, juridiction compétente, médiation/conciliation éventuelle. Contact :{' '}
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
