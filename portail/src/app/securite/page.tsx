import type { Metadata } from 'next'
import Link from 'next/link'
import { LegalPage, LegalSection } from '@/components/marketing/legal-page'
import { getLegalCompanyInfo } from '@/lib/legal-info'

export const metadata: Metadata = {
  title: 'Sécurité',
  description: 'Mesures de sécurité, responsabilités partagées et signalement des vulnérabilités EFLEX.',
}

export default function SecuritePage() {
  const { email } = getLegalCompanyInfo()

  return (
    <LegalPage
      title="Sécurité"
      description="Comment EFLEX protège la plateforme, quelles sont les responsabilités partagées, et comment signaler un problème de sécurité."
      updatedAt="28 novembre 2026"
    >
      <p className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
        <strong className="font-semibold">À valider par l’éditeur :</strong> cette page décrit les mesures connues à haut niveau. Elle ne constitue pas une certification,
        un audit externe, ni un engagement contractuel. Ne pas ajouter de détails sensibles d’implémentation.
      </p>

      <LegalSection title="1. Comptes et accès">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Accès par compte utilisateur, avec vérification e-mail et options de sécurité selon configuration (mot de passe, code e-mail, passkeys, 2FA).</li>
          <li>Gestion des accès par organisation et rôles pour limiter les actions sensibles.</li>
          <li>Sessions côté serveur, possibilité de révocation, et protections contre les abus/limitation de débit sur certaines routes.</li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Secrets et configuration">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Les variables d’environnement des projets sont chiffrées avant stockage en base.</li>
          <li>Les valeurs sensibles ne doivent pas être renvoyées en clair par les API client.</li>
          <li>Les journaux et diagnostics doivent masquer les secrets connus avant affichage.</li>
          <li>Les utilisateurs restent responsables des secrets qu’ils stockent, de leur rotation et de leur exposition dans leur propre code.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Isolation et déploiements">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li>Les projets sont rattachés à des organisations ; les accès doivent être vérifiés côté serveur.</li>
          <li>Les déploiements passent par une file et un worker, avec machine à états, journaux et garde-fous.</li>
          <li>Les configurations utilisateur (Compose, domaines, variables, paramètres) sont soumises à des validations avant exécution.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Sauvegardes et continuité">
        <p className="text-muted-foreground">
          Des sauvegardes peuvent exister pour certains services gérés, selon la configuration. Une sauvegarde ne signifie pas restauration garantie ou testée.
          L’utilisateur doit définir sa propre stratégie de continuité pour les données critiques (bases, volumes, fichiers, exports, procédures de reprise).
        </p>
      </LegalSection>

      <LegalSection title="5. Responsabilité partagée">
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li><span className="font-medium text-foreground">EFLEX</span> : sécurité de la plateforme, contrôle d’accès, garde-fous, exploitation, réponse aux incidents selon ses processus.</li>
          <li><span className="font-medium text-foreground">Client</span> : sécurité des comptes, qualité du code, dépendances, secrets, contenu déployé, conformité légale, sauvegardes métier et procédures internes.</li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Signaler une vulnérabilité">
        <p className="text-muted-foreground">
          Écrivez à{' '}
          <a href={`mailto:${email}?subject=Signalement%20sécurité%20EFLEX`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            {email}
          </a>{' '}
          avec : description, impact, étapes de reproduction, horodatage, et éléments non sensibles utiles. Ne publiez pas de preuve exploitable avant coordination.
        </p>
        <p className="text-muted-foreground">
          Pour le support standard, utilisez{' '}
          <Link href="/contact" className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            Contact
          </Link>.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
