---
title: Premier déploiement
description: Déployer une première application sur EFLEX depuis un dépôt GitHub.
sidebar:
  order: 1
---

Ce guide décrit le parcours standard pour mettre une application en ligne sur EFLEX.

## Avant de commencer

- Un compte EFLEX.
- Un dépôt GitHub contenant votre application.
- Un projet compatible avec la détection EFLEX, ou un `Dockerfile` / `docker-compose.yml` fourni par le dépôt.

## 1. Connecter votre dépôt

1. Connectez-vous à EFLEX.
2. Créez un projet.
3. Autorisez l’accès GitHub si nécessaire.
4. Sélectionnez le dépôt et la branche à déployer.

## 2. Vérifier l’analyse

EFLEX analyse le dépôt en lecture seule. Le détecteur identifie notamment :

- le framework ou le runtime ;
- les commandes d’installation, de build et de démarrage ;
- le port d’écoute ;
- les avertissements, questions ou alternatives éventuelles.

Vérifiez le plan proposé avant de lancer le déploiement.

## 3. Configurer les variables

Ajoutez les variables d’environnement nécessaires avant le premier déploiement. Les valeurs sont chiffrées côté EFLEX et ne sont pas réaffichées en clair après enregistrement.

Voir : [Variables d’environnement](/reference/variables-environnement/).

## 4. Lancer le déploiement

EFLEX met le déploiement en file, prépare l’environnement, construit l’application puis la déploie. Les états possibles incluent : en attente, analyse, provisionnement, construction, déploiement, en ligne, échec ou annulé.

## 5. Vérifier le résultat

Une fois le déploiement terminé :

- ouvrez l’URL fournie ;
- consultez les journaux de build et d’exécution ;
- vérifiez les variables ou la configuration en cas d’échec.

:::caution[Limites à connaître]
Un plan multi-services généré sans `docker-compose.yml` fourni par le dépôt est refusé. La compatibilité détectée ne garantit pas à elle seule qu’un projet particulier fonctionnera en production sans ajustement.
:::
