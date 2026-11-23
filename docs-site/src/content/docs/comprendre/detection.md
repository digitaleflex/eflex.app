---
title: Détection du dépôt
description: Comment EFLEX analyse un dépôt pour proposer un plan de déploiement.
sidebar:
  order: 2
---

EFLEX détecte la stack d’un projet à partir d’un instantané du dépôt. L’objectif est de proposer un plan de build reproductible, sans exécuter le code du dépôt pendant l’analyse.

## Entrées analysées

La détection se base sur des fichiers et des conventions, par exemple :

- `eflex.json` ;
- `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, `compose.yaml` ;
- `Dockerfile` ;
- `package.json`, lockfiles, scripts et dépendances ;
- `composer.json`, `artisan` ;
- fichiers Python (`pyproject.toml`, `requirements.txt`, etc.) ;
- `index.html` et artefacts statiques.

## Priorité

La règle la plus explicite l’emporte :

1. `eflex.json` valide
2. Compose fourni
3. `Dockerfile`
4. Détection automatique
5. Résolution monorepo

Cette priorité évite les ambiguïtés. Par exemple, un Compose fourni décrit souvent toute la pile et prime sur un simple `Dockerfile`.

## Résultat de détection

La détection produit un résultat comprenant :

- **plan** — configuration proposée ou `null` si non détectable ;
- **framework** — type identifié ;
- **confidence** — niveau de confiance ;
- **reasons** — raisons de la décision ;
- **warnings** — points d’attention ;
- **questions** — informations à confirmer quand la confiance est faible ;
- **alternatives** — autres plans plausibles.

## Monorepos

EFLEX peut détecter des applications dans un monorepo lorsque les marqueurs de workspace sont présents. Si plusieurs applications candidates sont possibles, EFLEX peut demander de préciser l’application à déployer.

## Ce que la détection ne fait pas

- Elle n’exécute pas l’application.
- Elle ne télécharge pas de dépendances.
- Elle ne devine pas de secrets.
- Elle ne garantit pas que l’application est prête pour la production.

Quand la détection automatique n’est pas suffisante, ajoutez un `Dockerfile` ou un `eflex.json` explicite.
