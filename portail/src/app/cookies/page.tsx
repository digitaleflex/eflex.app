import type { Metadata } from 'next'
import { LegalPage, LegalSection } from '@/components/marketing/legal-page'

export const metadata: Metadata = {
  title: 'Cookies et traceurs',
  description: 'Informations sur les cookies et traceurs utilisés par EFLEX.',
}

export default function CookiesPage() {
  return (
    <LegalPage
      title="Cookies et traceurs"
      description="Informations sur les cookies techniques et, le cas échéant, les traceurs utilisés sur EFLEX."
      updatedAt="28 novembre 2026"
    >
      <p className="rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
        <strong className="font-semibold">À valider par l’éditeur :</strong> cette liste doit refléter les outils réellement actifs en production.
        Si un outil d’analyse, support, publicité ou traceur non essentiel est ajouté, mettre à jour cette page et mettre en place le consentement requis.
      </p>

      <LegalSection title="1. Cookies strictement nécessaires">
        <p className="text-muted-foreground">
          EFLEX utilise des cookies nécessaires au fonctionnement du service. Ils peuvent inclure :
        </p>
        <ul className="list-disc space-y-2 pl-5 text-muted-foreground">
          <li><span className="font-medium text-foreground">Session / authentification</span> : maintenir la connexion, sécuriser la session, protéger contre certains abus.</li>
          <li><span className="font-medium text-foreground">Sécurité / anti-abus</span> : cookies techniques liés à la protection des formulaires ou à la détection d’abus, selon la configuration.</li>
          <li><span className="font-medium text-foreground">Préférences d’interface</span> : par exemple le choix de thème (`eflex-theme`) pour afficher l’interface selon votre préférence.</li>
        </ul>
        <p className="text-muted-foreground">
          Ces cookies sont nécessaires au service. Leur blocage peut empêcher la connexion ou dégrader le fonctionnement du site.
        </p>
      </LegalSection>

      <LegalSection title="2. Traceurs non essentiels">
        <p className="text-muted-foreground">
          À ce stade, aucun traceur publicitaire ne doit être considéré comme actif sans validation explicite de l’éditeur. Si des outils de mesure d’audience,
          replay, chat ou marketing sont ajoutés, ils devront être listés ici avec : fournisseur, finalité, durée, type, et base légale/consentement.
        </p>
      </LegalSection>

      <LegalSection title="3. Cookies tiers">
        <p className="text-muted-foreground">
          Certains services tiers intégrés au parcours utilisateur (ex. paiement, vérification anti-abus) peuvent déposer leurs propres cookies lorsqu’ils sont utilisés.
          Ces traitements dépendent de la configuration active et des fournisseurs concernés. À compléter avec la liste définitive des fournisseurs.
        </p>
      </LegalSection>

      <LegalSection title="4. Gestion">
        <p className="text-muted-foreground">
          Vous pouvez configurer votre navigateur pour bloquer ou supprimer les cookies. La suppression des cookies de session vous déconnectera. Le blocage des cookies
          nécessaires peut rendre certaines fonctionnalités indisponibles.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
