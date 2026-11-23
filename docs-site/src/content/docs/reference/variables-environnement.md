---
title: Variables d’environnement
description: Référence sur la gestion des variables d’environnement dans EFLEX.
sidebar:
  order: 1
---

Les variables d’environnement permettent de configurer une application sans modifier le code source ni commiter de secrets.

## Comportement

| Élément | Comportement |
|---|---|
| Stockage | Les valeurs sont enregistrées dans EFLEX, pas dans le dépôt Git. |
| Chiffrement | Les valeurs sont chiffrées avant stockage. |
| Lecture | Les valeurs ne sont pas réaffichées en clair après enregistrement. |
| Injection | Les variables sont injectées dans l’environnement de l’application au déploiement/exécution. |
| Mise à jour | Une modification peut nécessiter un nouveau déploiement pour être prise en compte. |
| Import | L’interface permet d’ajouter plusieurs variables, notamment par collage d’un contenu `.env`. |

## Bonnes pratiques

- Utilisez des noms explicites : `DATABASE_URL`, `REDIS_URL`, `API_TOKEN`.
- Ne commitez jamais de fichier `.env` contenant des secrets.
- Ajoutez uniquement les variables nécessaires.
- Vérifiez les formats attendus : URL, booléen, nombre, JSON, clé multiligne.
- Faites tourner les secrets exposés par erreur.

## Variables courantes

| Variable | Usage typique |
|---|---|
| `DATABASE_URL` | Connexion à PostgreSQL. |
| `REDIS_URL` | Connexion à Redis. |
| `NODE_ENV` | Mode d’exécution Node.js. |
| `PORT` | Port d’écoute, selon le runtime/framework. |

:::caution[Secrets côté client]
N’exposez pas de secret dans des variables destinées au frontend ou intégrées au build client. Toute valeur embarquée dans un bundle frontend doit être considérée comme publique.
:::

## Dépannage

Si une application échoue après configuration :

1. Vérifiez que les variables requises existent.
2. Vérifiez les noms exacts, y compris la casse.
3. Vérifiez les valeurs et les espaces superflus.
4. Relancez un déploiement.
5. Consultez les [journaux](/guides/journaux-et-redeploiement/).
