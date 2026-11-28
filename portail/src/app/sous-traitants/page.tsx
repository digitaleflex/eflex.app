import type { Metadata } from 'next'
import { LegalPage, LegalSection } from '@/components/marketing/legal-page'
import { getLegalCompanyInfo } from '@/lib/legal-info'

export const metadata: Metadata = {
  title: 'Sous-traitants et données',
  description: 'Liste des catégories de sous-traitants et flux de données utilisés par EFLEX.',
}

const rows = [
  {
    service: 'Hébergement (serveur)',
    provider: 'Contabo GmbH',
    purpose: 'Hébergement de la plateforme, base de données, cache, stockage, exécution des services.',
    data: 'Données de compte, projets, logs, métadonnées techniques, selon configuration.',
    location: 'Société allemande ; serveur en Union européenne',
  },
  {
    service: 'Domaines, DNS, anti-abus',
    provider: 'Cloudflare, Inc.',
    purpose: 'Gestion DNS/domaines et protection anti-abus (Turnstile) selon la configuration active.',
    data: 'Données techniques de résolution/accès et de vérification anti-abus selon le fournisseur.',
    location: 'États-Unis',
  },
  {
    service: 'E-mail transactionnel',
    provider: 'Resend (Plus Five Five, Inc.)',
    purpose: 'Envoi d’e-mails de vérification, réinitialisation, notifications.',
    data: 'Adresse e-mail, contenu du message, métadonnées techniques d’envoi.',
    location: 'États-Unis',
  },
  {
    service: 'Paiement',
    provider: 'Kkiapay (Open-Si) / FedaPay SAS',
    purpose: 'Encaissement, vérification de transaction, webhooks de paiement, remboursement selon support.',
    data: 'Références transaction, montant, statut, identifiants nécessaires au traitement. Les données de carte/mobile money sont traitées par le prestataire.',
    location: 'Bénin',
  },
  {
    service: 'Dépôt source / Git',
    provider: 'GitHub, Inc. / GitHub B.V.',
    purpose: 'Connexion de dépôt, webhooks, accès aux sources autorisées pour analyse/déploiement.',
    data: 'Métadonnées dépôt, commits, webhooks, accès autorisé selon intégration.',
    location: 'États-Unis',
  },
]

export default function SousTraitantsPage() {
  const company = getLegalCompanyInfo()

  return (
    <LegalPage
      title="Sous-traitants et données"
      description="Informations sur les sous-traitants susceptibles de traiter des données dans le cadre du service EFLEX."
      updatedAt="28 novembre 2026"
    >
      <LegalSection title="Éditeur">
        <p className="text-muted-foreground">
          <span className="font-medium text-foreground">{company.name}</span>, {company.legalForm.toLowerCase()} de {company.publisher}, RCCM {company.rccm}, IFU {company.ifu}, {company.address}. Contact :{' '}
          <a href={`mailto:${company.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md">
            {company.email}
          </a>.
        </p>
      </LegalSection>

      <LegalSection title="Sous-traitants principaux">
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">Service</th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">Fournisseur</th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">Finalité</th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">Données concernées</th>
                <th scope="col" className="px-4 py-3 font-medium text-muted-foreground">Localisation</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.service} className="border-b border-border align-top last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{row.service}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.provider}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.purpose}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.data}</td>
                  <td className="px-4 py-3 text-muted-foreground">{row.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </LegalSection>

      <LegalSection title="Mise à jour">
        <p className="text-muted-foreground">
          L’éditeur doit maintenir cette page à jour lors de l’ajout, du remplacement ou de la désactivation d’un sous-traitant. Les clients B2B peuvent demander
          les informations contractuelles et de sécurité associées selon les modalités convenues.
        </p>
      </LegalSection>
    </LegalPage>
  )
}
