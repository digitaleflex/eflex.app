---
title: Connecter GitHub
description: Autoriser EFLEX à accéder à vos dépôts et déclencher des déploiements.
sidebar:
  order: 2
---

EFLEX se connecte à GitHub pour lire vos dépôts, analyser le code et déployer les changements.

## Ce que la connexion permet

- Lister les dépôts auxquels vous avez donné accès.
- Analyser un dépôt en lecture seule avant déploiement.
- Déployer des dépôts privés lorsque l’accès est configuré.
- Recevoir les mises à jour push sur la branche de production configurée, lorsque le webhook GitHub est actif.

## Connecter un dépôt

1. Connectez-vous à EFLEX.
2. Créez un projet ou ouvrez un projet existant.
3. Choisissez la source GitHub.
4. Autorisez l’application GitHub EFLEX ou fournissez l’accès demandé.
5. Sélectionnez le dépôt et la branche.

## Dépôts privés

Les dépôts privés peuvent être déployés lorsque EFLEX dispose d’un accès valide. Selon la configuration, cet accès peut passer par l’application GitHub ou un jeton d’accès personnel configuré côté plateforme.

EFLEX utilise cet accès pour lire le dépôt et préparer le déploiement. Les informations d’identification ne doivent pas être placées dans le dépôt.

## Mises à jour automatiques

Lorsqu’un projet est lié à un dépôt GitHub et qu’un webhook est configuré, un push sur la branche de production peut créer un nouveau déploiement en file d’attente.

:::caution[Selon la configuration]
La disponibilité de la connexion GitHub dépend de la configuration de l’instance EFLEX. Si GitHub n’est pas disponible, l’interface l’indique.
:::