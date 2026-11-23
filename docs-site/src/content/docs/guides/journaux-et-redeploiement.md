---
title: Journaux et redéploiement
description: Consulter les journaux, diagnostiquer un échec et relancer un déploiement.
sidebar:
  order: 4
---

Les journaux sont la première source de diagnostic lorsqu’un déploiement échoue ou qu’une application ne se comporte pas comme prévu.

## Journaux de build

Les journaux de build sont associés à un déploiement. Ils montrent les étapes de préparation, construction et déploiement.

Utilisez-les pour vérifier :

- l’installation des dépendances ;
- la commande de build ;
- les erreurs de compilation ;
- les variables manquantes au build ;
- le démarrage du conteneur ou du processus.

## Journaux d’exécution

Lorsqu’ils sont disponibles, les journaux d’exécution permettent de diagnostiquer l’application après mise en ligne : crash au démarrage, erreur de connexion à une base, port incorrect, etc.

:::note[Secrets masqués]
EFLEX masque les valeurs sensibles dans les journaux lorsqu’elles sont identifiées comme telles. Évitez malgré tout d’imprimer des secrets dans votre application.
:::

## Redéployer

Un redéploiement relance le pipeline pour le projet. Il est utile après :

- une modification de variables d’environnement ;
- une correction dans le dépôt ;
- un changement de configuration ;
- un échec transitoire.

Le redéploiement crée un nouveau déploiement avec son propre statut et ses propres journaux.

## Annuler un déploiement

Si un déploiement est encore en cours, vous pouvez l’annuler depuis l’interface. L’état final passe à `cancelled` lorsque l’annulation est prise en compte.

## Vérifications rapides en cas d’échec

1. Le dépôt contient-il les fichiers attendus (`package.json`, `Dockerfile`, `compose`, etc.) ?
2. Les commandes d’installation/build/start sont-elles correctes ?
3. Le port d’écoute correspond-il à ce que l’application expose ?
4. Les variables d’environnement requises sont-elles présentes ?
5. L’application démarre-t-elle correctement en local avec la même configuration ?
