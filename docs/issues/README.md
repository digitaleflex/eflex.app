# Feuille de route

Les issues de suite sont désormais **sur GitHub** (digitaleflex/eflex.app) : c'est la référence. Les fichiers `NN-*.md` de ce dossier sont les premiers brouillons, conservés pour l'historique.

## Backlog actuel (issues GitHub, groupées en milestones)

### M1 · Déploiement fiable
Prouver le déploiement sur un vrai serveur et poser les bases d'exploitation.

| Issue | Priorité | Sujet |
|---|---|---|
| [#2](https://github.com/digitaleflex/eflex.app/issues/2) | P0 | Valider le déploiement sur un vrai Coolify (test de fumée + runbook) |
| [#3](https://github.com/digitaleflex/eflex.app/issues/3) | P0 | Chiffrer les variables d'environnement au repos |
| [#4](https://github.com/digitaleflex/eflex.app/issues/4) | P1 | Redéployer, annuler et supprimer un projet |
| [#5](https://github.com/digitaleflex/eflex.app/issues/5) | P1 | Journaux de build et statut en arrière-plan |
| [#10](https://github.com/digitaleflex/eflex.app/issues/10) | P1 | CI du portail et du détecteur |

### M2 · SaaS multi-tenant
Socle déjà posé (organisations Better Auth, projets rattachés à une organisation) ; reste l'interface et les garde-fous.

| Issue | Priorité | Sujet |
|---|---|---|
| [#17](https://github.com/digitaleflex/eflex.app/issues/17) | P0 | Interface des organisations (sélecteur, membres, invitations, rôles) |
| [#9](https://github.com/digitaleflex/eflex.app/issues/9) | P1 | Authentification : e-mails (vérification, mot de passe oublié) et durcissement |
| [#20](https://github.com/digitaleflex/eflex.app/issues/20) | P1 | Profil utilisateur et paramètres du compte |
| [#21](https://github.com/digitaleflex/eflex.app/issues/21) | P1 | CRUD complet du projet (paramètres, variables, transfert, activité) |
| [#22](https://github.com/digitaleflex/eflex.app/issues/22) | P1 | Isolation des locataires : quotas, limites, audit de sécurité |

### M3 · Facturation et administration
Monétisation par organisation et back-office.

| Issue | Priorité | Sujet |
|---|---|---|
| [#18](https://github.com/digitaleflex/eflex.app/issues/18) | P0 | Facturation : abonnements par organisation, quotas, paiement, factures |
| [#19](https://github.com/digitaleflex/eflex.app/issues/19) | P1 | Espace d'administration de la plateforme |

### M4 · Capacités de déploiement
Ce qu'attendent les vrais projets clients.

| Issue | Priorité | Sujet |
|---|---|---|
| [#6](https://github.com/digitaleflex/eflex.app/issues/6) | P1 | Volumes persistants et monorepos avec dépendances de workspace |
| [#7](https://github.com/digitaleflex/eflex.app/issues/7) | P1 | Dépôts GitHub privés (GitHub App) |
| [#8](https://github.com/digitaleflex/eflex.app/issues/8) | P1 | Domaines personnalisés avec HTTPS |

### M5 · Moteur Axiom
Décider, puis prouver le moteur maison sur serveur réel.

| Issue | Priorité | Sujet |
|---|---|---|
| [#14](https://github.com/digitaleflex/eflex.app/issues/14) | P1 | Décision Coolify ou Axiom (ADR) |
| [#11](https://github.com/digitaleflex/eflex.app/issues/11) | P1 | Axiom : preset Laravel / PHP |
| [#12](https://github.com/digitaleflex/eflex.app/issues/12) | P1 | Axiom : Traefik, DNS et certificats sur un vrai serveur |
| [#13](https://github.com/digitaleflex/eflex.app/issues/13) | P1 | Axiom : agent distant réel |

### M6 · Finitions


| Issue | Priorité | Sujet |
|---|---|---|
| [#15](https://github.com/digitaleflex/eflex.app/issues/15) | P2 | Page d'accueil : promesses alignées sur le livré |
| [#16](https://github.com/digitaleflex/eflex.app/issues/16) | P2 | Nettoyage du dépôt fusionné |

Ordre conseillé : M1 d'abord (#2 et #3). M2 peut avancer en parallèle (#17 est la base de M3). #14 décide si M5 passe avant M4.

## État des premiers brouillons

| # | Sujet | État |
|---|---|---|
| 01 | [Intégrer le détecteur dans le portail](./01-integrer-detecteur-portail.md) | Fait |
| 02 | [Déployer à partir du BuildPlan](./02-deployer-depuis-buildplan.md) | Fait via Coolify ; reste : voir #2, #4, #5, #6 |
| 03 | [Renderer : couvrir tous les frameworks](./03-renderer-tous-frameworks.md) | Fait |
| 04 | [Chiffrer les variables d'environnement](./04-chiffrer-variables-env.md) | Repris par #3 |
| 05 | [Inscription et vérification d'e-mail](./05-inscription-verification-email.md) | Partiel (Better Auth + organisations en place) ; reste : #9 |
| 06 | [Déploiements asynchrones via Redis](./06-file-deploiement-redis.md) | Partiel ; repris par #5 |
| 07 | [GitHub App, dépôts privés, webhooks](./07-github-app-webhooks.md) | Repris par #7 |
| 08 | [Singleton Prisma, schéma unique, CI](./08-prisma-ci-qualite.md) | Remplacé par #10 et #16 |
| 09 | [Nettoyage du dépôt](./09-nettoyage-depot.md) | Repris par #16 |
