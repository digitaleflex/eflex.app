# Facturation : cycle de vie et règles retenues (#18 / #27)

Ce document fixe les règles **simples** appliquées par `portail/src/lib/billing.ts`,
`portail/src/lib/payments.ts` et les actions d'administration. Aucune donnée de
carte ne transite ni n'est stockée par Eflex : seuls les prestataires (Kkiapay,
FedaPay) manipulent les moyens de paiement.

## Période, échéance et grâce

- Une période payante dure **30 jours** (`PERIOD_DAYS`).
- `active` / `trialing` **sans échéance** reste actif ; avec une échéance
  dépassée, la période est considérée **échue** : le plan gratuit s'applique.
  Les nouveaux déploiements restent autorisés (le plan gratuit suffit) mais la
  création de projets est soumise aux quotas gratuits.
- Un impayé sur le **renouvellement du plan courant** passe l'abonnement en
  `past_due` et ouvre une grâce de **7 jours** (`GRACE_PERIOD_DAYS`) calculée
  depuis l'échéance. Un échec de premier paiement ou de changement de plan ne
  dégrade pas un abonnement existant.
- Pendant la grâce, les limites du plan payant restent actives. Après la grâce :
  - **création de projets** et **nouveaux déploiements** refusés (402) ;
  - **aucune suppression** : projets, bases, variables et applications en ligne
    continuent de fonctionner ;
  - un paiement de renouvellement repasse l'abonnement en `active` et efface la
    grâce (idempotent, y compris webhook rejoué ou désordonné).

## Suspension administrative

`Organization.suspendedAt` gèle la création de projets et les nouveaux
déploiements (403). Rien n'est supprimé. La réactivation remet les compteurs à
zéro côté blocage ; les quotas du plan restent applicables.

## Changement de plan et prorata

- Les changements manuels d'administrateur exigent un **motif**, sont **audités**
  et posent `manualOverride = true`.
- Un webhook de paiement portant sur un **autre plan** ne remplace jamais le plan
  manuel : le plan payé est enregistré dans `pendingPlan`, le montant reçu devient
  un crédit, et un administrateur arbitre.
- Un paiement pour le **plan déjà appliqué** confirme le geste : la période est
  prolongée de 30 jours, la grâce est levée, le verrou manuel est retiré.
- Changement de plan en cours de période : la période en cours est **conservée**
  et la valeur non consommée de l'ancien plan est créditée au prorata
  `prix × jours restants / 30` (plafonné à une période). Le crédit est stocké sur
  l'abonnement et **déduit du prochain paiement** ; jamais de remboursement en
  numéraire. S'il couvre tout le prix, le paiement est tracé avec le prestataire
  `credit` et le plan est activé immédiatement.

## Quotas

- Projets, membres et domaines personnalisés par projet viennent du plan.
- Les quotas peuvent être relevés **temporairement** par un administrateur
  (`projectLimitOverride`, `memberLimitOverride`, `quotaOverrideUntil`).
- Membres : contrôle à l'**invitation** (membres + invitations en attente) et à
  l'**acceptation** (membres réels), avec message d'incitation au plan supérieur.
- Projets : contrôle avant création ; domaines : contrôle par projet.

## Rôles et confidentialité

- `owner`, `admin` et le rôle personnalisé `billing` accèdent à la facturation.
- Un `member` n'y accède pas.
- Le rôle `billing` n'accède **jamais** aux variables d'environnement (valeurs) ni
  aux journaux de build/exécution.
