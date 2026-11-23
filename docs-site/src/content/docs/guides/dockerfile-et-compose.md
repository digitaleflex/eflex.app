---
title: Dockerfile et Compose
description: Utiliser un Dockerfile ou un fichier Compose fourni par le dépôt.
sidebar:
  order: 2
---

Lorsque la détection automatique ne suffit pas, vous pouvez fournir une configuration explicite dans le dépôt.

## Dockerfile

Si votre dépôt contient un `Dockerfile`, EFLEX peut l’utiliser comme contrat de build. C’est utile quand :

- le projet a des dépendances système spécifiques ;
- le build nécessite des étapes personnalisées ;
- le runtime n’est pas couvert simplement par la détection automatique.

Bonnes pratiques :

- placez le `Dockerfile` à la racine du projet à déployer, ou assurez-vous qu’EFLEX puisse le détecter ;
- exposez le port attendu ;
- évitez d’intégrer des secrets dans l’image ;
- utilisez des variables d’environnement pour la configuration sensible.

## Fichier Compose

EFLEX reconnaît les fichiers Compose fournis par le dépôt : `docker-compose.yml`, `docker-compose.yaml`, `compose.yml` ou `compose.yaml`.

Quand un Compose est détecté, il fait foi pour la description des services. EFLEX ne réécrit pas le Compose comme un plan généré classique.

:::caution[Comportement important]
Un Compose fourni par le dépôt est prioritaire sur un simple `Dockerfile` dans la détection. Si vous avez besoin d’un comportement différent, utilisez un `eflex.json` explicite.
:::

## `eflex.json`

`eflex.json` est le niveau de configuration le plus explicite. Lorsqu’il est valide, il remplace la détection automatique.

Utilisez-le quand vous voulez :

- forcer un framework ou un runtime ;
- définir explicitement les commandes ;
- fixer le port, le healthcheck ou la structure attendue.

Un `eflex.json` invalide n’est pas ignoré silencieusement : EFLEX refuse le plan pour éviter un déploiement inattendu.

## Quel choix faire ?

| Situation | Option recommandée |
|---|---|
| Projet standard détecté correctement | Détection automatique |
| Besoin d’ajuster explicitement la configuration | `eflex.json` |
| Build/runtime personnalisé | `Dockerfile` |
| Pile multi-services décrite par le dépôt | Fichier Compose |
