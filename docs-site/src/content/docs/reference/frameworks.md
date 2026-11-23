---
title: Frameworks et types de projet
description: Types de projets détectés par EFLEX et comportement général associé.
sidebar:
  order: 2
---

EFLEX analyse un dépôt en lecture seule et propose un plan de build. La détection est déterministe : pour un même état de dépôt, le résultat est identique.

## Ordre de détection

EFLEX applique la première règle qui correspond :

1. **`eflex.json` valide** — configuration explicite, priorité maximale.
2. **Fichier Compose fourni** — `docker-compose.yml`, `docker-compose.yaml`, `compose.yml` ou `compose.yaml`.
3. **`Dockerfile`** — build contrôlé par le dépôt.
4. **Détection automatique** — manifeste et conventions du framework.
5. **Monorepo** — résolution d’une application candidate dans le dépôt.

:::note[Cas important]
Un `eflex.json` invalide ne bascule pas silencieusement vers une autre détection. Le plan est refusé afin d’éviter un déploiement inattendu.
:::

## Frameworks détectés

| Type | Framework | Runtime typique | Port par défaut | Remarques |
|---|---|---:|---:|---|
| Configuration explicite | `eflex-config` | déclaré ou déduit | déclaré ou `3000` | Remplace la détection automatique. |
| Compose fourni | `compose` | selon le compose | selon le service exposé | Le fichier Compose fait foi. |
| Docker | `docker` | `docker@1` | `3000` ou `EXPOSE` | Utilise le `Dockerfile` du dépôt. |
| Next.js | `nextjs` | Node.js | `3000` | Détecté via `next` ou `next.config.*`. |
| Nuxt | `nuxt` | Node.js | `3000` | Détecté via `nuxt`. |
| Astro | `astro` | statique | `80` | Sortie statique selon la configuration détectée. |
| Vite | `vite` | statique | `80` | Build frontend statique. |
| Svelte | `svelte` | selon projet | selon projet | Détecté selon les conventions Svelte/SvelteKit. |
| Remix | `remix` | Node.js | selon projet | Application Node détectée par manifeste. |
| SolidStart | `solidstart` | Node.js | selon projet | Application Node détectée par manifeste. |
| RedwoodJS | `redwoodjs` | Node.js | selon projet | Détecté selon les conventions Redwood. |
| Node.js | `node` | Node.js | `3000` | Serveurs Node, NestJS, Express, Fastify, etc. |
| Laravel | `laravel` | PHP | `80` | Détecté via `laravel/framework` et `artisan`. |
| PHP | `php` | PHP | `80` | Application PHP générique. |
| Python | `python` | Python | `8000` | FastAPI, Flask, Django/WSGI selon le projet. |
| Statique | `static` | statique | `80` | Fichiers HTML/CSS/JS servis directement. |

## Limites de la détection

- La détection ne garantit pas qu’un projet particulier est prêt pour la production.
- Les dépendances système natives peuvent exiger un `Dockerfile`.
- Les projets atypiques ou les builds custom peuvent nécessiter un `eflex.json` ou un `Dockerfile`.
- Un plan multi-services généré sans fichier Compose fourni par le dépôt peut être refusé au déploiement.

Pour les cas non couverts proprement par la détection, privilégiez une configuration explicite dans le dépôt.
