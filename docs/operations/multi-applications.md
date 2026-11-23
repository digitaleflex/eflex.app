# Monorepos et multi-applications : activation en production (issue #163)

> Décision de cadrage rédigée le 2026-11-23 (à valider). Conception détaillée : `docs/architecture/monorepo-multi-app.md`.

## Ce qui est livré
Création d'un projet à plusieurs applications du même dépôt (1 à 10), une `ProjectApp` par dossier, un déploiement par application avec un `groupId` commun, verrous par application, quota compté en applications, domaines et variables par application. Tout est derrière `EFLEX_MULTI_APP`.

| Environnement | `EFLEX_MULTI_APP` |
|---|---|
| Production | `0` (désactivé) |
| Préproduction | `1` |

## Comportement selon le drapeau
- **Désactivé** : `POST /api/projects` refuse plus d'une application (`multi_app_disabled`, message « créez un projet par application ») ; un redéploiement cible l'application principale (ou celle déjà déployée), jamais un déploiement de portée projet.
- **Activé** : fan-out d'un déploiement par application ; une application déjà en cours est ignorée sans bloquer les autres.
- **Couvert par des tests** : refus quand désactivé, création multi-applications, fan-out, application déjà active, refus quand toutes sont actives, enfilement en portée projet (`create-route.test.ts`, `project-deployments.integration.test.ts` : tests d'intégration, exécutés avec PostgreSQL).

## Limites connues (à dire au client)
- **Au plus 10 applications par projet.**
- Les **dépendances entre dossiers du monorepo** (paquets partagés, workspaces) ne sont pas résolues par EFLEX : chaque application est construite depuis son dossier ; un paquet partagé hors de ce dossier peut manquer au build.
- **Pas de cache de build partagé** entre applications : chaque application reconstruit tout (temps et ressources multipliés par le nombre d'applications).
- **Filtrage par dossier sur les webhooks** : un push GitHub ne redéploie que les applications dont le dossier est touché ; si aucun dossier d'application n'est touché, rien n'est déployé (`webhooks/github`). Si la liste des fichiers modifiés est absente de la charge du webhook, le comportement par défaut s'applique. Le réglage « dossiers surveillés » de Coolify (configuration avancée, par application) est distinct de ce filtre.
- Une application = une application Coolify = ses propres limites de ressources.

## Stratégie d'activation en production (proposée)
Ne pas basculer d'un coup. Critères avant de passer `EFLEX_MULTI_APP=1` en production :
1. Un monorepo réel (2 à 3 applications) déployé sur la préproduction de bout en bout : build, domaines, variables par application, redéploiement, rollback.
2. Les limites ci-dessus affichées dans l'assistant de création (non fait à ce jour).
3. Un plan de retour arrière : repasser le drapeau à `0` ne supprime rien ; les projets multi-applications existants restent déployables, mais un redéploiement manuel ne cible alors que l'application principale (les autres ne se redéploient plus tant que le drapeau est désactivé). À communiquer avant tout retour arrière.
4. Les projets mono-application existants ne sont pas modifiés : une `ProjectApp` est déjà créée pour eux, sans changement de comportement.

## Ce qui reste (ne pas considérer #163 comme clos)
- Validation sur un monorepo réel en préproduction.
- Message d'avertissement sur les limites dans l'assistant de création.
- Test automatisé de la réponse « refus » pour un dossier indéployable dans un monorepo (422) côté interface.
