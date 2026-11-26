# ADR-0016 — Axiom maintenu gelé (lecture seule)

- **Statut** : Accepté
- **Date** : 2026-11-26
- **Lié** : ADR-0012, #245

## Contexte

Le dépôt contient un sous-système Axiom Go (`services/engine`, `services/agent`, `services/orchestrator`) important, mais le chemin de production EFLEX utilise le portail Next.js + Coolify.

## Décision

- Axiom reste **gelé** et hors chemin de production.
- Aucun nouvel investissement fonctionnel, pas de connexion au portail, pas de dépendance runtime.
- Le code est conservé en lecture seule pour référence/archéologie technique.
- Toute réactivation exige une nouvelle ADR avec : objectif produit, périmètre, propriétaire, budget, plan de migration, critères de preuve.

## Conséquences

- Les efforts produit se concentrent sur le portail EFLEX/Coolify.
- Les issues Axiom historiques restent documentées mais non prioritaires sauf décision explicite.
