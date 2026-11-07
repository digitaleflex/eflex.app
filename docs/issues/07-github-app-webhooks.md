# [P1] GitHub App : dépôts privés, sélection de dépôt et redéploiement automatique à chaque push

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
- [ ] Un dépôt privé peut être importé et déployé.
- [ ] Un push sur `main` déclenche un nouveau déploiement, visible dans le portail avec le bon SHA.
- [ ] Un webhook à la signature invalide reçoit une 401 et ne met rien en file.
- [ ] La même livraison reçue deux fois ne crée qu'un seul déploiement.

## Dépendances
- Dépend de : #06 « Déploiements asynchrones via une file Redis ».
