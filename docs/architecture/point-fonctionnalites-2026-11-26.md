# Point sur les fonctionnalités développées — 26 novembre 2026

> **Méthode et limites.** Relecture du code de `main`, de la matrice des capacités
> ([20-capability-matrix.md](eflex/20-capability-matrix.md)), des documents d'exploitation et des tests.
> **Aucun accès à la production, à Coolify ni aux serveurs** : « en production » signifie « documenté et
> intégré au parcours », jamais « vérifié sur le serveur ». Les chiffres : 247 modules `lib`, 119 routes API,
> 40 modèles Prisma, 131 fichiers de tests (dont 23 d'intégration qui exigent PostgreSQL).
>
> **Niveaux.** *Livré* = code + tests + intégré au parcours. *Partiel* = présent mais limité ou derrière un
> drapeau. *À construire* = pas de parcours complet. *Non vérifié ici* = je n'ai pas pu le constater.

## 1. Vue d'ensemble

| Domaine | Niveau | Preuve disponible | Reste à faire |
|---|---|---|---|
| Comptes et sécurité d'accès | Livré | Better Auth, code par e-mail, passkeys, 2FA, Google/GitHub, sessions révocables ; garde 2FA testée | 2FA **obligatoire** pour les admins non vérifiée (#234) |
| Organisations et rôles | Livré | Organisations, invitations, rôles owner/admin/member, isolation des routes testée en CI | Rôles admin plateforme séparés (#233) |
| Import GitHub et détection | Livré | GitHub App, jetons, dépôts privés, détecteur/renderer testés | Dépôts réels en test (#243) |
| Déploiement (Coolify) | Livré | File BullMQ, machine à états, annulation, redéploiement, retour arrière, watchdog, journaux en direct | Idempotence de création (#242), découpage du worker (#244) |
| Domaines et HTTPS | Livré | Domaines personnalisés vérifiés (DNS), labels Traefik, contrôle TLS | Parcours réel à confirmer sur serveur |
| Variables d'environnement | Livré | Chiffrement AES-256-GCM, import `.env` en lot, aucune route ne renvoie une valeur | Rotation de clé à exercer |
| Multi-applications / monorepo | Partiel | Code + tests ; drapeau `EFLEX_MULTI_APP` désactivé par défaut | Activation et cadrage production (#163) |
| Compose fourni / multi-services | Partiel | Compose client déployé avec garde-fous de sécurité ; plans générés multi-services refusés | Parcours guidé (#161) |
| Image Docker, sources alternatives | Partiel | Image Docker publique prise en charge | Dockerfile, Gitea/GitLab (#188) |
| Prévisualisations de PR | Partiel | Modèle et module présents | Parcours complet (#185) |
| Volumes persistants | Partiel | Testés sur staging ; drapeau `EFLEX_PERSISTENT_VOLUMES` **désactivé** en production | Activation et sauvegarde (#162, #175) |
| Bases clientes (PostgreSQL, Redis, autres) | Livré / Partiel | Création, URL chiffrée, actions, sauvegarde PostgreSQL planifiée ; restauration Coolify ≥ 4.7 | Moteurs hors PostgreSQL (#180, #184) |
| Sauvegardes | Partiel | Scripts, preuves de restauration consignées, hook hors site | **Aucune restauration éprouvée sur serveur** ; copie hors site (#174), fichiers/volumes (#175) |
| Métriques et journaux des applications | Partiel | Journaux d'exécution masqués, métriques via Coolify | Mesure stockage/trafic/historique (#119 à #121) |
| Surveillance des sites clients | Partiel | Sondes HTTP/DNS/TLS, incidents, rétablissement (code + 2 fichiers de tests) | Finaliser et brancher aux alertes (#177, #235) |
| Page de statut publique | Livré (à compléter) | Page `/status` existante, modèle d'incidents | Indicateurs de service chiffrés (#239) |
| Notifications | Livré | In-app + e-mail (Resend), préférences, anti-doublon | Canaux ntfy/webhook (#235) |
| Analytics d'audience | Livré | Agrégats respectueux de la vie privée, événements nommés | — |
| Support | Livré (à structurer) | Tickets utilisateur et admin | Pas de test dédié repéré (par nom de fichier) ; quotas et délais absents |
| Facturation et paiements | Livré | Plans en FCFA, Kkiapay, FedaPay, factures PDF, remboursements, relance/grâce | Facturation à l'usage (#143) ; **clés réelles à confirmer** |
| Administration plateforme | Livré | `/admin` : métriques, direct, déploiements, projets, organisations, paiements, support, audit, infrastructure, Coolify, supervision ; **bloc « État de la plateforme »** | Rôles séparés, 2FA obligatoire, alertes |
| Outils d'exploitation | Partiel | Installation d'Uptime Kuma, Beszel, Dozzle via le portail | Serveur de monitoring séparé (#260) |
| Interface (charte) | Livré | Thème clair unique, tokens, tests de charte et d'accessibilité en CI | Refonte de la vue d'ensemble (#269) |

## 2. Moteur de déploiement : état après l'audit du 24/11

| Constat | Correction | État |
|---|---|---|
| M1 écritures silencieuses de `coolifyAppId` | Réessai + compensation (#228) | **Fusionné** ; idempotence complète à faire (#242) |
| M4 file sur Redis sans persistance | Réconciliation base → file + AOF + colonne `rollback` (#229) | **Fusionné** — *migration à appliquer, Redis redémarre au déploiement* |
| M2 aucun retry Coolify | Retry borné des lectures (#230) | **Fusionné** |
| M3 `processDeployment` monolithique | — | À faire (#244) |
| M6 détecteur/renderer peu testés | — | À faire (#243) |
| M7 Axiom (≈ 61 000 lignes) gelé | — | Décision à prendre (#245) |

## 3. Hors du portail

- **Build Fleet** : début de phase 1, aucun build de bout en bout prouvé ; mise en veille propre proposée (décision attendue).
- **AURA** : pilote sur un VPS ; sa propre sauvegarde est différée ; ne pas compter dessus comme copie fiable.
- **Axiom (Go)** : gelé (ADR-0012), non utilisé par le portail.

## 4. Ce qui n'a jamais été prouvé sur un serveur

Rien de ce qui suit n'est démontré par mes vérifications ; chaque ligne est un essai à faire :
1. Un déploiement de bout en bout (dépôt → site en ligne avec HTTPS) sur une instance de test.
2. Une **restauration** complète d'une base cliente et du portail depuis une sauvegarde.
3. Un redémarrage de Redis pendant un déploiement (réconciliation) et un arrêt de Coolify pendant une lecture (retry).
4. La connexion en production sous Node 24 (régression #196 corrigée en CI, non constatée en production).
5. Un paiement réel Kkiapay/FedaPay et son webhook.
6. L'arrivée d'une alerte sur un canal humain (aucun canal sortant garanti aujourd'hui).

## 5. Écarts et corrections de ce document

- La page `/status` **existe déjà** : l'issue #239 (« page de statut publique ») doit se lire « compléter avec des indicateurs chiffrés ».
- La matrice des capacités doit rester la référence unique : toute issue qui livre une capacité la met à jour avec sa preuve.
- Les niveaux ci-dessus sont ma lecture du code ; un niveau « Livré » n'est pas une garantie de production.

## 6. Ordre recommandé pour la suite

1. **Prouver** : essai de bout en bout, restauration, panne simulée (section 4) — c'est ce qui vous permet d'« être sûr ».
2. **Sécuriser l'accès admin** : #233 puis #234.
3. **Faire arriver les alertes** : #235, #236, #260.
4. **Fiabiliser le moteur** : #242, #243, puis #244.
5. **Produit** : interface (#269), observabilité client (#238), facturation à l'usage (#143).
