# ADR-0014 — Build Plane séparé : Build Server Coolify d'abord, pipeline compose ensuite

- **Statut** : proposé (rédigé en autonomie le 2026-11-23, à valider)
- **Issue** : #176 · liés : ADR-0009 (Build Fleet gelé), ADR-0012 (Coolify en production)

## Contexte
Aujourd'hui le build et l'exécution se font sur le même serveur : un build gourmand (npm, Docker) peut ralentir ou faire tomber les sites clients (OOM, disque). Le Build Fleet maison (ADR-0009) est gelé : trop de code à maintenir pour une équipe d'une personne.

## Faits vérifiés (OpenAPI Coolify 4.7.5)
- Les routes de création d'application acceptent `use_build_server` : Coolify sait déléguer le build à un serveur dédié.
- Un Build Server Coolify **exige un registre d'images** pour que le serveur d'exécution récupère l'image construite.
- Les applications **Docker Compose** ne passent pas par le Build Server de Coolify.
- Le déploiement d'une image par digest est possible via `dockerimage` (déjà utilisé par EFLEX pour les images fournies).

## Décision
1. **Phase 1 — applications simples (Nixpacks/Dockerfile)** : un second petit serveur déclaré comme *Build Server* dans Coolify, avec `use_build_server=true` à la création, derrière un drapeau `EFLEX_BUILD_SERVER_UUID` (désactivé tant qu'il est vide). Aucun nouveau composant EFLEX.
2. **Registre** : un registre privé existant (GHCR ou registre Docker auto-hébergé sur le serveur de build), jeton de **poussée** limité au serveur de build, jeton de **lecture** limité au serveur d'exécution. Pas de Build Fleet.
3. **Phase 2 — Docker Compose** : pipeline séparé (runner CI/BuildKit sur le serveur de build) qui pousse les images ; le déploiement référence les images par digest. À ne lancer qu'après la phase 1 et un benchmark.
4. **Rollback** : par digest, déjà couvert par `rollback-images`.
5. **Sécurité** : aucun secret de production injecté au build par défaut ; limites CPU/mémoire/durée sur le serveur de build ; jamais d'accès au socket Docker de production depuis un build client.

## Conséquences
- Gain : un build lourd ne peut plus saturer les serveurs de production.
- Coût : un serveur supplémentaire (la taille minimale raisonnable dépend de vos builds : à mesurer), un registre à exploiter, deux jetons à gérer.
- Limite : les compose restent construits sur le serveur d'exécution jusqu'à la phase 2.

## À mesurer avant de coder (benchmark demandé par #176)
Durée, CPU/RAM/disque et taux d'échec de 3 à 5 applications représentatives sur le chemin actuel, puis avec Build Server. Je n'ai pas pu le faire sans serveur.

## Ce qui n'est pas décidé ici
Taille et fournisseur du serveur de build ; choix final du registre (coût du stockage vs GHCR).
