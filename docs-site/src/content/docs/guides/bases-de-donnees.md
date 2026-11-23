---
title: Bases de données gérées
description: Créer et gérer une base PostgreSQL ou Redis pour un projet EFLEX.
sidebar:
  order: 3
---

EFLEX peut provisionner des bases de données gérées pour un projet. Les bases sont créées pour le projet et leurs identifiants sont injectés dans l’application.

## Types disponibles

| Type | Variable injectée | Sauvegardes gérées EFLEX |
|---|---|:---:|
| PostgreSQL | `DATABASE_URL` | Oui, selon configuration |
| Redis | `REDIS_URL` | Non |

Vous pouvez ajouter une base PostgreSQL et/ou une base Redis par projet.

## Créer une base

1. Ouvrez votre projet dans EFLEX.
2. Allez dans la section Bases de données.
3. Choisissez PostgreSQL ou Redis.
4. Créez la base.

Une fois la base provisionnée, EFLEX injecte l’URL interne correspondante dans les variables d’environnement de l’application.

## Sauvegardes PostgreSQL

Les sauvegardes PostgreSQL peuvent être planifiées par EFLEX lorsque la base est gérée. L’état de la sauvegarde est visible dans l’interface du projet.

:::caution[Redis]
Redis n’est pas couvert par les sauvegardes gérées EFLEX de la même manière que PostgreSQL. Ne l’utilisez pas comme seul stockage durable sans stratégie propre.
:::

## Restauration

La restauration d’une sauvegarde PostgreSQL est une opération sensible. Elle peut écraser des données. EFLEX limite cette action aux rôles autorisés et demande une confirmation explicite.

Avant une restauration, vérifiez :

- l’environnement cible ;
- la sauvegarde sélectionnée ;
- l’impact sur les données récentes.

## Suppression

La suppression d’une base gérée est destructive. Avant de supprimer un projet, vérifiez que les ressources associées peuvent être supprimées proprement.
