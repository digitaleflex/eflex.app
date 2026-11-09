# [P1] GitHub App : dépôts privés, sélection de dépôt et redéploiement automatique à chaque push

> **Mise à jour :** réalisé sur `feat/07-github-app` (plomberie complète). `lib/github-app.ts` (JWT RS256, jetons d'installation, liste des dépôts, vérification `X-Hub-Signature-256`), modèles `GitInstallation` / `WebhookDelivery` + champs `Project`, webhook `/api/webhooks/github` (signature, idempotence par `X-GitHub-Delivery`, `push` → file Redis avec le vrai SHA), routes `/api/github/{config,installations,repositories}`, sélecteur dans « Nouveau projet », et analyse des dépôts privés via l'API Contents avec jeton court. **Reste humain :** créer l'App sur GitHub, renseigner les 4 variables et déclarer l'URL du webhook. Les previews de PR et le check run restent en phase 2 ; le déploiement Coolify d'un dépôt privé nécessitera de transmettre le jeton court à Coolify.

## Contexte

- `createApplication()` dans `portail/src/lib/coolify.ts` appelle `POST /applications/public` : **seuls les dépôts publics** fonctionnent.
- L'utilisateur colle l'URL du dépôt à la main, sans liste de ses dépôts.
- **Aucun webhook** : un `git push` ne redéploie rien, alors que c'est le cœur de l'expérience « à la Vercel ».
- Aucune preview par branche ou par PR.

## Objectif

Connecter GitHub proprement pour que « push → déploiement » fonctionne, y compris sur les dépôts privés.

## Proposition technique

1. **GitHub App Eflex**, plutôt qu'un jeton OAuth utilisateur :
   - permissions minimales : `contents: read`, `metadata: read`, `pull_requests: write` (commentaires de preview), `checks: write` (statut de déploiement) ;
   - événements : `push`, `pull_request`, `installation`, `installation_repositories` ;
   - variables : `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_WEBHOOK_SECRET` (dans `.env.prod.example`, jamais commitées avec des valeurs).
2. Modèle Prisma `GitInstallation` (`userId`, `installationId`, `accountLogin`), et sur `Project` : `repoFullName`, `installationId`, `productionBranch`.
3. Interface « Nouveau projet » : bouton « Installer l'app GitHub », puis liste des dépôts accessibles à sélectionner. La saisie d'une URL reste possible pour les dépôts publics.
4. Le snapshot du détecteur utilise un **jeton d'installation** à courte durée de vie, ce qui fonctionne aussi sur les dépôts privés.
5. Coolify : utiliser l'endpoint dédié aux dépôts privés via GitHub App, ou fournir le code source déjà récupéré, selon l'option retenue dans #02.
6. Route `POST /api/webhooks/github` :
   - vérifier la signature `X-Hub-Signature-256` (comparaison en temps constant) avant tout traitement ;
   - garantir l'idempotence grâce à `X-GitHub-Delivery` ;
   - un `push` sur la branche de production met en file un déploiement (file Redis) avec le `commitSha` ;
   - une `pull_request` ouverte ou mise à jour déclenche un déploiement preview (optionnel, phase 2) et un commentaire avec l'URL.
7. Publier un **check run** ou un commit status GitHub qui reflète l'état du déploiement.

## Critères d'acceptation
- [x] Un dépôt privé peut être **importé et analysé** (jeton d'installation, API Contents). Le déploiement effectif via Coolify reste à brancher (voir la mise à jour).
- [x] Un `push` sur la branche de production met en file un `Deployment` `queued` avec le SHA du webhook.
- [x] Un webhook à la signature invalide reçoit **401** et ne crée aucune livraison.
- [x] La même livraison (`X-GitHub-Delivery`) reçue deux fois ne crée qu'un seul déploiement (table `WebhookDelivery`).

## Dépendances
- Dépend de : #06 « Déploiements asynchrones via une file Redis ».
