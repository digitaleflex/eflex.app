---
title: Limites et capacités
description: Ce qu’EFLEX fait aujourd’hui, ce qui dépend de la configuration, et ce qui n’est pas promis.
sidebar:
  order: 2
---

Cette page résume les capacités et limites importantes à connaître avant de déployer.

## Capacités actuelles

- Connexion à un dépôt GitHub et sélection de branche.
- Analyse du dépôt en lecture seule et proposition de configuration.
- Déploiement avec suivi d’état et journaux de build/exécution.
- Variables d’environnement chiffrées, non réaffichées en clair après enregistrement.
- Domaines EFLEX et domaines personnalisés selon configuration DNS.
- Bases managées PostgreSQL/Redis selon le projet et l’infrastructure disponible.

## Points conditionnels

| Sujet | À savoir |
|---|---|
| Multi-services | Un plan multi-services généré sans `docker-compose.yml` fourni par le dépôt est refusé. |
| Volumes persistants | Un volume persistant ne constitue pas une garantie de sauvegarde. |
| Sauvegardes | Les sauvegardes PostgreSQL gérées dépendent de la configuration. Coolify ne sauvegarde pas Redis. |
| DNS | EFLEX ne gère pas universellement les DNS de tous les registrars. |
| Compatibilité | Une détection réussie ne garantit pas qu’un projet fonctionnera en production sans ajustement. |

## Ce qu’EFLEX ne promet pas

- Aucun délai de déploiement garanti.
- Aucun monitoring 24/7 complet comme capacité acquise par défaut.
- Aucune sauvegarde automatique implicite pour tous les types de données.
