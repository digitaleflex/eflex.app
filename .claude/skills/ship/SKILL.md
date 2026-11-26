---
name: ship
description: Prépare une mise en production d'EFLEX sans rien déployer. À utiliser quand on dit « ship », « on livre », « prêt pour la prod ? » ou qu'on veut la liste de contrôle avant `scripts/deploy-prod.sh`. Vérifie la CI de `main`, les PR ouvertes, les migrations et les changements d'infrastructure, puis rend un verdict et les commandes à lancer sur le serveur.
---

# /ship — vérifier qu'on peut livrer (lecture seule)

**Cette commande ne déploie rien, ne fusionne rien, ne pousse rien et ne modifie aucun serveur.** Elle
rassemble des faits et rend un verdict. Répondre toujours en français.

## 1. Constater l'état du dépôt

1. `git fetch origin` puis noter le commit de `origin/main` (SHA court et titre).
2. CI de ce commit : vérifications `Tests`, `axe + Playwright` et `schémas` (API GitHub `check-runs`).
   Une vérification manquante ou en cours n'est **pas** un succès : le dire.
3. PR ouvertes (`gh api repos/<owner>/<repo>/pulls?state=open` ou l'outil GitHub) : numéro, titre, CI, état de fusion.
4. Si une PR prête n'est pas fusionnée, le signaler **sans la fusionner** (la fusion exige la demande du propriétaire).

## 2. Repérer ce qui change pour le serveur

Comparer avec le dernier commit connu comme déployé (le demander s'il n'est pas indiqué ; ne pas le deviner) :

- `git diff --stat <déployé> origin/main -- portail/prisma docker-compose.prod.yml config scripts`
- **Migrations Prisma** : lister les dossiers de `portail/prisma/migrations` ajoutés ; pour chacune, dire si
  elle est additive (colonne avec défaut, nouvelle table) ou destructive (suppression, renommage, type).
- **Infrastructure** : changements de `docker-compose.prod.yml` (redémarrage d'un service ? volume ? commande ?).
- **Variables d'environnement** nouvelles ou rendues obligatoires (chercher dans le diff `process.env.`).
- **Drapeaux** (`EFLEX_*`) : rappeler leur valeur par défaut en production.

## 3. Verdict

- **Prêt** : CI verte sur le commit exact, aucune PR bloquante, migrations additives ou absentes.
- **À corriger d'abord** : CI rouge ou incomplète, migration destructive, variable manquante.
- **Inconnu** : tout ce qui dépend du serveur (je n'y ai pas accès) — le dire, ne pas supposer.

## 4. Liste de contrôle à donner à l'utilisateur

À exécuter **sur le serveur, par lui** (ou avec son accord explicite) :

1. `bash scripts/backup-db.sh` et vérifier que le fichier existe.
2. `bash scripts/deploy-prod.sh --dry-run` : compare le serveur au dépôt sans déployer.
3. Éviter de déployer pendant qu'un déploiement client est en cours (surtout si Redis ou le worker changent).
4. `bash scripts/deploy-prod.sh` (ajouter `--expect "<texte visible>"` pour confirmer le nouveau contenu).
5. Après coup : `/api/health`, une connexion, `/admin`, un déploiement de test.
6. Retour arrière : le script affiche le commit précédent ; migrations additives = pas de retour arrière de données nécessaire.

## Règles

- Ne jamais lancer `deploy.sh`, `deploy-prod.sh` sans `--dry-run`, ni aucune commande qui agit sur la production.
- Ne jamais fusionner, pousser, ni commenter une PR sans demande explicite.
- Ne pas prétendre qu'un essai a réussi : citer la source (CI, commande, sortie) ou écrire « non vérifié ».
- Signaler les corrections faites directement sur le serveur qui ne sont pas dans le dépôt (un déploiement peut les écraser).
