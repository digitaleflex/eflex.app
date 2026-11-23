---
title: Configurer un domaine
description: Utiliser le domaine EFLEX ou connecter un domaine personnalisé.
sidebar:
  order: 1
---

EFLEX permet d’exposer une application via un domaine géré ou un domaine personnalisé, selon la configuration du projet.

## Domaine EFLEX

À la création, un projet peut recevoir une adresse sous un domaine EFLEX. Cette adresse permet de tester l’application rapidement après déploiement.

## Domaine personnalisé

1. Ouvrez les paramètres du projet.
2. Ajoutez votre domaine.
3. Créez l’enregistrement DNS demandé chez votre fournisseur.
4. Lancez la vérification dans EFLEX.

EFLEX vérifie la configuration DNS attendue. Les certificats HTTPS sont gérés automatiquement pour les domaines pris en charge.

## Bonnes pratiques

- Vérifiez que le domaine pointe vers la cible indiquée par EFLEX.
- Attendez la propagation DNS avant de conclure à une erreur.
- Contrôlez l’état TLS après un déploiement réussi.

:::caution[Point important]
EFLEX ne gère pas universellement les DNS de tous les registrars. La configuration DNS reste effectuée chez votre fournisseur de domaine.
:::
