---
title: Premier déploiement
description: Déployer une première application sur EFLEX depuis un dépôt GitHub.
sidebar:
  order: 1
---

Ce guide décrit le parcours standard pour mettre une application en ligne sur EFLEX.

## Avant de commencer

- Un compte EFLEX.
- Un dépôt Git contenant votre application.
- Un projet détectable par EFLEX, ou un `Dockerfile` / un fichier Compose fourni par le dépôt.

Si votre dépôt est sur GitHub, commencez par [Connecter GitHub](/demarrer/connecter-github/).

## 1. Créer le projet

1. Connectez-vous à [EFLEX](https://eflex.app).
2. Créez un nouveau projet.
3. Sélectionnez le dépôt et la branche à déployer.
4. Vérifiez les informations détectées.

## 2. Vérifier l’analyse

EFLEX analyse le dépôt en lecture seule. Le résultat peut inclure :

- le framework ou le type de projet ;
- le runtime ;
- les commandes d’installation, de build et de démarrage ;
- le port d’écoute ;
- des avertissements, questions ou alternatives.

Prenez le temps de vérifier ce plan avant de lancer le déploiement, surtout si le projet a une configuration atypique.

## 3. Configurer les variables d’environnement

Ajoutez les variables nécessaires avant le premier déploiement : clés API, URL de base, secrets applicatifs, etc.

- Les valeurs sont chiffrées par EFLEX.
- Elles ne sont pas réaffichées en clair après enregistrement.
- Elles ne doivent pas être commitées dans le dépôt.

Voir [Variables d’environnement](/reference/variables-environnement/).

## 4. Lancer le déploiement

Le déploiement passe par plusieurs états :

```text
queued → analyzing → provisioning → building → deploying → live
```

En cas de problème, l’état passe à `failed`. Vous pouvez aussi annuler un déploiement en cours.

Voir [États de déploiement](/reference/etats-deploiement/).

## 5. Vérifier l’application

Une fois l’application en ligne :

- ouvrez l’URL fournie ;
- vérifiez les journaux de build et d’exécution ;
- testez les fonctionnalités critiques ;
- ajoutez un domaine personnalisé si nécessaire.

## Si le déploiement échoue

Consultez d’abord les [journaux et le redéploiement](/guides/journaux-et-redeploiement/), puis le guide [Dépannage](/guides/depannage/).

:::caution[Compatibilité]
La détection automatique aide à démarrer rapidement, mais elle ne garantit pas que tous les projets fonctionnent sans ajustement. Pour les cas complexes, utilisez un `Dockerfile`, un fichier Compose ou un `eflex.json`.
:::