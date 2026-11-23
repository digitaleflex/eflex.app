---
title: Configurer un domaine
description: Utiliser le domaine EFLEX ou connecter un domaine personnalisé.
sidebar:
  order: 1
---

EFLEX attribue un domaine à votre application et permet de connecter des domaines personnalisés.

## Domaine EFLEX

Après déploiement, l’application peut être accessible via un sous-domaine EFLEX. Cette adresse est utile pour vérifier rapidement le résultat.

## Ajouter un domaine personnalisé

1. Ouvrez le projet dans EFLEX.
2. Accédez aux paramètres de domaine.
3. Ajoutez votre domaine, par exemple `app.votre-domaine.com`.
4. Créez l’enregistrement DNS demandé chez votre fournisseur DNS.
5. Lancez la vérification dans EFLEX.

EFLEX vérifie que le domaine pointe vers la cible attendue. Une fois le domaine validé, un déploiement peut être nécessaire pour appliquer la configuration de routage.

## Configuration DNS

La configuration exacte dépend du type de domaine :

- **Sous-domaine** — généralement un enregistrement `CNAME` vers le domaine de la plateforme indiqué par EFLEX.
- **Domaine racine** — souvent un enregistrement `A`/`AAAA` vers les adresses de la plateforme ; certains fournisseurs proposent `ALIAS`/`ANAME`.

:::caution[DNS chez votre fournisseur]
EFLEX ne gère pas la zone DNS de votre registrar. La création des enregistrements DNS se fait chez votre fournisseur (Cloudflare, OVH, Gandi, Route53, etc.).
:::

## Vérifications utiles

- Attendez la propagation DNS avant de conclure à une erreur.
- Vérifiez qu’aucun ancien enregistrement ne conflit avec la cible EFLEX.
- Après validation, contrôlez l’état HTTPS/TLS.
- Si vous utilisez un proxy DNS, assurez-vous que la configuration est compatible avec la vérification et le certificat.

## Limites et comportements

- Les domaines sous le domaine racine EFLEX sont réservés à la plateforme.
- Le nombre de domaines personnalisés par projet est limité selon la configuration du projet/forfait.
- Le certificat HTTPS est géré automatiquement pour les domaines pris en charge.

Si la vérification échoue, consultez [Dépannage](/guides/depannage/).
