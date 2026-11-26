# Proposition — Modèle agence / client (#254-#257)

**Statut : proposition, décision produit requise.**

## Contexte

Les agences ont besoin de gérer plusieurs clients, avec isolation, facturation claire et délégation contrôlée.

## Recommandation

Adopter le modèle **organisation par client**, avec une relation agence explicite :

- Chaque client = une organisation EFLEX (isolation native existante : projets, membres, facturation, quotas).
- Une agence = organisation de type agence, avec des liens `AgencyClient` vers les organisations clientes qu’elle gère.
- Les accès agence sont des memberships explicites/audités dans l’organisation cliente, avec rôle limité (ex. `operator`) ; pas d’accès implicite global.
- La facturation peut rester par organisation cliente, ou être consolidée côté agence via un contrat de facturation séparé (à spécifier).

## Alternatives écartées

- **Table `Client` simple dans une org agence** : plus rapide, mais casse l’isolation native, complique permissions/facturation/audit et crée des cas particuliers partout.
- **Sous-rôle limité sans séparation org** : insuffisant pour la facturation, les quotas, les domaines et l’audit.

## Impacts à spécifier avant implémentation

- Modèle de données (`Organization.type`, `AgencyClient`, invitations/délégation).
- Qui paie : client, agence, ou mixte.
- Visibilité portefeuille agence (#178) et rapports.
- Droits d’usurpation/support inter-org.
- Migration des agences existantes.
