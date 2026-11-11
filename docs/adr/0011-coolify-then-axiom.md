# ADR-0011 — Coolify reste le moteur de déploiement, derrière une abstraction avant Axiom

- **Status:** Accepted
- **Date:** 2026-11-11
- **Issue:** #14
- **Supersedes:** —

## Context

Le portail déploie aujourd'hui en production via **Coolify 4.7.3** : applications, domaines, certificats Let's Encrypt, variables chiffrées, deploy keys, bases managées, journaux et opérations runtime sont prouvés sur le serveur réel (`eflex.app`, `blog-elfrida.eflex.app`, `blog-eurinhash.eflex.app`).

Le moteur maison **Axiom** est prouvé en tests locaux (Node, Go, statique, Python) mais :

- n'est pas déployé sur un serveur réel ;
- ne couvre pas encore Laravel/PHP et les plans multi-services ;
- n'a pas prouvé Traefik/DNS/certificats ni l'agent distant derrière NAT ;
- ne gère pas encore les dépôts privés de bout en bout côté portail.

Faire avancer les deux chemins en parallèle double le travail et retarde la monétisation. À l'inverse, migrer maintenant vers Axiom bloquerait les fonctionnalités déjà livrées (domaines, bases, facturation, administration).

## Decision

1. **Coolify reste le backend de déploiement du portail** pour les 3 à 6 prochains mois. C'est la seule voie qui permet de livrer les capacités attendues (Laravel, monorepos, domaines, bases, journaux) sans régression.
2. Le portail ne doit pas dépendre directement de Coolify à terme : introduire progressivement une interface **`DeployBackend`** (`provision`, `deploy`, `status`, `logs`, `cancel`, `delete`, `runtimeAction`) avec une implémentation `CoolifyBackend`. La migration se fait sans « big bang » : les appels actuels de `lib/coolify.ts` sont déplacés derrière l'interface au fur et à mesure, avec les tests existants comme filet.
3. **Axiom reste la cible stratégique du moteur**, mais sa bascule est conditionnée aux preuves suivantes :
   - **parité frameworks avec le détecteur/renderer** (Next.js, Nuxt, Astro, Vite, SvelteKit, Remix, SolidStart, RedwoodJS, Node générique, PHP, Laravel, Python, statique, Dockerfile/Compose), pas seulement Laravel ;
   - plans multi-services (queues/scheduler) et volumes persistants ;
   - Traefik, DNS et certificats Let's Encrypt prouvés sur un VPS réel ;
   - agent distant réel (enrôlement, signature, reconnexion NAT, idempotence) ;
   - redéploiement, retour arrière et dépôts privés ;
   - parité fonctionnelle vérifiée avec `DeployBackend`.
4. Les issues **#11, #12 et #13** restent ouvertes et deviennent les critères de sortie d'Axiom. **#14** est satisfaite par cet ADR une fois validé ; **#6** (volumes/monorepos) reste une capacité à livrer côté Coolify.

## Consequences

- Pas de double implémentation immédiate : une seule voie de production, les fonctionnalités continuent d'arriver.
- Une dette d'abstraction est acceptée : l'interface `DeployBackend` est introduite progressivement, sans réécrire tous les appels d'un coup.
- Axiom continue d'avancer sur ses propres issues, sans bloquer le portail.
- Les futures migrations (Coolify → Axiom) seront mesurées par les critères ci-dessus, pas par une préférence technologique.
- Les tests de contrat du backend devront couvrir les deux implémentations avant bascule.

## Alternatives considered

1. **Coolify uniquement, sans abstraction.** Simple à court terme, mais verrouille le portail et rend la migration Axiom plus coûteuse. Rejetée.
2. **Axiom uniquement, immédiatement.** Bloque Laravel, les domaines et les bases déjà livrées, et repose sur des preuves serveur inexistantes. Rejetée.
3. **Les deux backends en parallèle dès maintenant.** Double le travail et les tests, sans bénéfice utilisateur immédiat. Rejetée.
