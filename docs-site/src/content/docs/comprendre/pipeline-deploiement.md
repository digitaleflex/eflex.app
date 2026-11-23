---
title: Pipeline de déploiement
description: Comprendre les étapes entre l’analyse du dépôt et la mise en ligne.
sidebar:
  order: 1
---

EFLEX transforme un dépôt en application déployée à travers un pipeline contrôlé. Chaque déploiement a un état visible et des journaux.

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

## Ce que EFLEX fait

- lit le dépôt en lecture seule lors de l’analyse ;
- détecte la stack et propose un plan ;
- chiffre et injecte les variables d’environnement configurées ;
- construit l’application dans l’environnement de déploiement ;
- expose les journaux utiles au diagnostic ;
- met à jour l’état du déploiement.

## Ce que EFLEX ne promet pas

- Aucun délai de déploiement garanti.
- Aucune compatibilité universelle pour tous les projets détectés.
- Aucune restauration automatique implicite pour tous les types de données.

Pour les comportements détaillés, voir [États de déploiement](/reference/etats-deploiement/) et [Détection du dépôt](/comprendre/detection/).
