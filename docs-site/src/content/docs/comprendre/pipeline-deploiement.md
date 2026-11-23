---
title: Pipeline de déploiement
description: Comprendre les étapes entre l’analyse du dépôt et la mise en ligne.
sidebar:
  order: 1
---

EFLEX transforme un dépôt en application déployée à travers un pipeline contrôlé.

## États principaux

| État | Signification |
|---|---|
| `queued` | Le déploiement est en attente de traitement. |
| `analyzing` | EFLEX analyse le dépôt et prépare la configuration. |
| `provisioning` | Les ressources nécessaires sont préparées. |
| `building` | L’application est construite. |
| `deploying` | L’application est démarrée ou mise à jour. |
| `live` | Le déploiement est terminé et l’application est en ligne. |
| `failed` | Le déploiement a échoué ; les journaux permettent le diagnostic. |
| `cancelled` | Le déploiement a été annulé. |

## Ce qu’EFLEX fait

- lit le dépôt en lecture seule lors de l’analyse ;
- détecte la stack et propose un plan de build ;
- exécute le build dans l’environnement de déploiement ;
- expose les journaux utiles au diagnostic ;
- met à jour l’état visible du déploiement.

## Ce qu’EFLEX ne promet pas

- Aucun délai de déploiement garanti.
- Aucune compatibilité certifiée pour tous les projets détectés.
- Aucune sauvegarde automatique implicite pour tous les types de données.
