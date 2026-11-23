---
title: Variables d’environnement
description: Référence sur la gestion des variables d’environnement dans EFLEX.
sidebar:
  order: 1
---

Les variables d’environnement permettent de configurer une application sans modifier le code source.

## Comportement

| Élément | Comportement |
|---|---|
| Stockage | Les valeurs sont enregistrées dans EFLEX, pas dans le dépôt Git. |
| Chiffrement | Les valeurs sont chiffrées côté EFLEX avant stockage. |
| Lecture | Les valeurs ne sont pas réaffichées en clair après enregistrement. |
| Injection | Les variables sont transmises à l’application au moment du déploiement/exécution. |
| Mise à jour | Modifier des variables peut nécessiter un nouveau déploiement pour être pris en compte. |

## Bonnes pratiques

- Utilisez un nom clair : `DATABASE_URL`, `API_KEY`, `NODE_ENV`.
- Ne commitez jamais de secret dans le dépôt.
- Vérifiez les variables requises avant le premier déploiement.
- Limitez les variables au strict nécessaire.

## Dépannage

Si une application échoue au démarrage :

1. Vérifiez les journaux de déploiement.
2. Confirmez la présence des variables requises.
3. Vérifiez les formats attendus (URL, booléen, nombre, clé).
4. Relancez un déploiement après correction.
