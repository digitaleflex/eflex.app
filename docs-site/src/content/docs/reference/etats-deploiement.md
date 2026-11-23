---
title: États de déploiement
description: Signification des états affichés pendant et après un déploiement EFLEX.
sidebar:
  order: 3
---

Chaque déploiement EFLEX suit une machine à états. L’état affiché indique où se situe le déploiement dans le pipeline.

## États

| État | Signification | État terminal |
|---|---|:---:|
| `queued` | Le déploiement est en file d’attente. | Non |
| `analyzing` | EFLEX analyse le dépôt et prépare le plan. | Non |
| `provisioning` | Les ressources et la configuration sont préparées. | Non |
| `building` | L’image ou l’artefact applicatif est en cours de construction. | Non |
| `deploying` | La nouvelle version est en cours de démarrage ou de mise à jour. | Non |
| `live` | Le déploiement est terminé et l’application est en ligne. | Oui |
| `failed` | Le déploiement a échoué. Consultez les journaux. | Oui |
| `cancelled` | Le déploiement a été annulé avant la fin. | Oui |

## Progression normale

```text
queued → analyzing → provisioning → building → deploying → live
```

Un déploiement peut passer à `failed` ou `cancelled` depuis un état non terminal.

## Que faire en cas d’échec

1. Ouvrez les journaux de build du déploiement.
2. Vérifiez les variables d’environnement requises.
3. Vérifiez les commandes de build, le port d’écoute et les dépendances.
4. Corrigez le dépôt ou la configuration.
5. Relancez un déploiement.

## Annulation

Un déploiement en cours peut être annulé lorsqu’il n’est pas encore dans un état terminal. L’annulation arrête le traitement du déploiement concerné ; elle ne supprime pas le projet ni l’historique.
