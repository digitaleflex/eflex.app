# Audit du moteur et de l'architecture d'eflex.app — 24 novembre 2026

> Relecture statique du code de `main` (après la fusion de #225). Aucun serveur n'a été
> exécuté : tout ce qui touche à Coolify, Redis ou Docker réels est **non vérifié ici**.
> Cet audit remplace les constats « moteur » de `audit-2026-11-23.md`.

## 1. Périmètre et méthode

- Moteur : `packages/detector`, `packages/renderer`, `portail/src/worker.ts`,
  `portail/src/lib/queue.ts`, `portail/src/lib/coolify.ts`.
- Architecture : portail (plan de contrôle), Coolify (backend de déploiement unique,
  ADR-0012), Redis, PostgreSQL, Build Fleet, AURA, Axiom.
- Méthode : lecture du code, comptage des lignes et des tests, recherche des écritures
  silencieuses. Les affirmations sont limitées à ce qui est visible dans le dépôt.

## 2. Mesures

| Composant | Code | Tests | Cas de test |
|---|---|---|---|
| `packages/detector` | 3 352 lignes | 817 lignes | ≈ 75 |
| `packages/renderer` | 933 lignes | 536 lignes | ≈ 39 |
| `portail/src/worker.ts` | 972 lignes (`processDeployment` : lignes 184→764, ≈ 580 lignes) | tests de reprise/concurrence séparés | — |
| `portail/src/lib/coolify.ts` | 1 954 lignes | — | — |
| Axiom (Go, en pause) | ≈ 61 000 lignes | — | — |
| Build Fleet (Go) | ≈ 1 400 lignes | 6 fichiers | — |

Le détecteur et le renderer sont les parties les moins couvertes par rapport à leur
importance : une mauvaise détection produit un déploiement faux sans erreur visible.

## 3. Constats du moteur

### M1 — Écritures silencieuses de `coolifyAppId` (élevé)
`worker.ts` contient 7 `catch(() => undefined)`, dont 5 sur
`prisma.project.update({ data: { coolifyAppId } })`. Si l'écriture échoue après la création
de l'application Coolify, le projet n'enregistre pas son identifiant : au retry BullMQ, une
seconde application est créée (**doublon**) et la première reste **orpheline** chez Coolify.
Correctif : propager l'erreur (ou journaliser + réessayer), et rendre la création
idempotente (rechercher d'abord par nom/étiquette de projet).

### M2 — Aucun retry sur les appels Coolify (moyen)
`coolify.ts` définit des timeouts mais aucune nouvelle tentative interne. Une erreur
réseau transitoire fait échouer l'étape ; seul le retry global du job (3 tentatives,
backoff exponentiel de 2 s) rattrape, en rejouant tout `processDeployment`. Correctif :
retry borné avec gigue sur les appels idempotents (GET, statut, lecture de logs).

### M3 — `processDeployment` monolithique (moyen)
≈ 580 lignes en une fonction : difficile à tester par étape, difficile à reprendre
précisément. Les tests existants (watchdog, concurrence) couvrent la reprise, mais pas
chaque étape isolément. Correctif : découper en étapes pures avec état persistant
(machine à états), chaque étape idempotente.

### M4 — File BullMQ sur un Redis sans persistance (élevé)
Un redémarrage de Redis perd les jobs en attente. Le watchdog atténue pour les
déploiements déjà enregistrés en base, mais les jobs non encore repris ne sont pas
reconstruits de façon prouvée. Correctif : activer l'AOF ou une réconciliation
« base → file » au démarrage, avec test.

### M5 — Worker et sondes dans le processus web (moyen)
Le worker démarre via `instrumentation-node.ts` dans le processus du portail. Une charge
de déploiement (concurrence 2) partage CPU et mémoire avec les pages. Acceptable pour un
serveur unique ; à séparer dès qu'il y a plusieurs instances (risque de workers multiples).

### M6 — Détecteur et renderer : couverture insuffisante (moyen)
Peu de cas de test pour 4 285 lignes. Pas de jeu de dépôts réels en intégration (les
fixtures sont synthétiques). Le renderer injecte les commandes `install`/`build`/`start`
dans le Dockerfile via `shell()` ; ces commandes viennent du dépôt de l'utilisateur et
s'exécutent dans son propre conteneur, mais aucun test ne documente ce périmètre de confiance.

### M7 — Axiom en pause (faible)
≈ 61 000 lignes non utilisées en production. Coût de maintenance et de confusion : à
trancher (archiver ou réactiver), voir ADR-0012.

## 4. Constats d'architecture

- **Point de défaillance unique** : un serveur, un Redis, un PostgreSQL, un worker. Cohérent
  pour la phase actuelle, mais aucune bascule n'est prouvée.
- **Dépendance forte à Coolify 4.7.5** : le connecteur couvre beaucoup de surface
  (1 954 lignes) sans contrat vérifié automatiquement contre l'API OpenAPI.
- **Sauvegardes** : deux destinations imposent deux planifications par base (limite
  Coolify : un S3 par planification) ; `EFLEX_BACKUP_OFFSITE_CMD` existe côté script.
  Restauration non éprouvée dans cet audit.
- **Build Fleet / AURA** : plan de build séparé (ADR-0014) et stockage S3 (SeaweedFS) en
  pilote ; ne pas les compter comme « livrés ».
- **Isolation multi-tenant** : un manifeste de routes testé existe
  (`api-tenant-isolation.integration.test.ts`), point fort.

## 5. Points forts constatés

Charte et tests de structure en CI, thème unique, isolation des routes testée, watchdog et
concurrence de déploiement testés, ADR à jour, CI verte sur `main` (Node 24).

## 6. Priorités recommandées

1. **M1** : supprimer les `catch` silencieux sur `coolifyAppId` + création idempotente + test.
2. **M4** : persistance Redis ou réconciliation au démarrage + test.
3. **M2** : retry borné sur les appels Coolify idempotents.
4. **M6** : jeu de dépôts réels (Next.js, Node, Python, Docker, monorepo) en test de détection.
5. **M3** : découpage progressif de `processDeployment`.
6. Trancher le sort d'Axiom (M7).

## 7. Limites de cet audit

Relecture statique ; aucun déploiement réel, aucune panne simulée, pas de mesure de
performance. Les gravités sont un jugement, à confirmer par un essai sur serveur de test.
