---
title: Dépannage
description: Diagnostiquer les problèmes courants de déploiement sur EFLEX.
sidebar:
  order: 5
---

Cette page regroupe les vérifications utiles quand un déploiement échoue ou qu’une application ne répond pas correctement.

## Le déploiement échoue pendant le build

Vérifiez les journaux de build :

- dépendance manquante ou version incompatible ;
- commande de build incorrecte ;
- variable d’environnement requise au build ;
- erreur TypeScript, lint, compilation ou asset ;
- mémoire/temps de build insuffisant pour le projet.

Actions utiles :

1. Reproduire le build en local.
2. Vérifier la commande détectée par EFLEX.
3. Ajouter un `Dockerfile` ou un `eflex.json` si la détection n’est pas adaptée.

## L’application démarre puis se ferme

Causes fréquentes :

- le processus écoute sur le mauvais port ;
- la variable `PORT` n’est pas prise en compte ;
- une variable d’environnement manque ;
- la connexion à la base de données échoue.

Vérifiez le port exposé par l’application et les journaux d’exécution.

## Le domaine personnalisé ne fonctionne pas

- Vérifiez l’enregistrement DNS chez votre fournisseur.
- Attendez la propagation DNS.
- Confirmez que le domaine pointe vers la cible indiquée par EFLEX.
- Relancez la vérification dans l’interface.
- Vérifiez qu’aucun autre enregistrement ne crée un conflit.

## Les variables ne semblent pas prises en compte

- Vérifiez le nom exact de la variable.
- Vérifiez que la valeur a bien été enregistrée.
- Relancez un déploiement après modification.
- Vérifiez si la variable est lue au build ou au runtime.

## Le dépôt n’est pas détecté correctement

- Vérifiez que le dépôt contient les fichiers attendus à la racine ou dans le bon dossier.
- Pour un monorepo, vérifiez que l’application sélectionnée est la bonne.
- Ajoutez un `Dockerfile`, un fichier Compose ou un `eflex.json` pour rendre la configuration explicite.

## Besoin d’un diagnostic plus précis

Rassemblez ces éléments avant de demander de l’aide :

- identifiant du projet ;
- identifiant ou date du déploiement ;
- état final (`failed`, `cancelled`, etc.) ;
- extrait pertinent des journaux sans secrets ;
- changements récents dans le dépôt ou la configuration.
