# [P1] Déploiements asynchrones via une file Redis + suivi du statut et des logs

## Contexte

`POST /api/projects` (`portail/src/app/api/projects/route.ts`) fait **tout de façon synchrone dans la requête HTTP** : création en base, création de l'application Coolify, une requête Coolify **par** variable d'environnement (en série, erreurs ignorées), puis déclenchement du déploiement.

Problèmes :
- la requête est longue et sujette aux timeouts. Si elle échoue en cours de route, l'état devient incohérent (projet en base sans application Coolify, ou application Coolify orpheline) ;
- les erreurs de `setEnvironmentVariable()` sont **ignorées silencieusement** (le résultat n'est pas vérifié) ;
- le statut du `Deployment` est écrit une seule fois (`building`, `failed` ou `pending`) et **n'est jamais mis à jour** : il reste « building » indéfiniment ;
- `commitSha: 'pending'` n'est jamais renseigné ;
- `getDeploymentStatus()` et `getDeploymentLogs()` existent dans `coolify.ts` mais ne sont jamais appelés ;
- Redis est dans l'infra (`docker-compose.dev.yml`, `docker-compose.prod.yml`, `REDIS_URL`) mais n'est pas utilisé ;
- côté interface, un échec de déploiement est signalé par un simple `alert()`.

## Objectif

Un pipeline de déploiement asynchrone, observable et rejouable.

## Proposition technique

- File **BullMQ** sur Redis, avec un worker séparé : nouveau service `worker` dans `docker-compose.prod.yml`, même image que le portail mais commande différente.
- `POST /api/projects` crée le projet et un `Deployment` à l'état `queued`, met en file un job `deploy` `{ deploymentId }` et répond immédiatement (202).
- Le job `deploy` est idempotent, avec des étapes reprenables :
  1. `analyzing` : snapshot + `detect()` si aucun plan n'est figé ;
  2. `provisioning` : créer ou mettre à jour l'application Coolify, en stockant `coolifyAppId` dès sa création ;
  3. envoyer les variables d'environnement, en vérifiant chaque résultat (utiliser l'endpoint groupé de Coolify s'il existe) ;
  4. `building` : déclencher le déploiement, enregistrer `coolifyBuildId` et le vrai `commitSha` ;
  5. interroger `getDeploymentStatus()` avec un backoff jusqu'à `live` ou `failed`, puis stocker un résumé des logs.
- Machine à états explicite pour `Deployment.status`, avec un enum Prisma au lieu de `String` : `queued → analyzing → provisioning → building → deploying → live | failed | cancelled`.
- Nouvelles tentatives avec backoff exponentiel sur les erreurs réseau de Coolify, mais pas sur les erreurs 4xx.
- Interface : page `/dashboard/projects/[id]` avec le statut en temps réel (SSE ou polling) et les logs. Remplacer `alert()` par un toast ou un état de l'interface.
- Boutons « Redéployer » et « Annuler ».

## Critères d'acceptation
- [ ] `POST /api/projects` répond en moins de 500 ms.
- [ ] Le statut passe à `live` ou `failed` sans intervention.
- [ ] Une erreur sur une variable d'environnement fait échouer le déploiement avec un message clair.
- [ ] Si le worker est tué en plein job puis relancé, le déploiement se termine sans créer de doublon côté Coolify.
- [ ] Les logs de build sont consultables depuis le portail.

## Dépendances
- Lié à : #02 « Déployer à partir du BuildPlan ».
