# Eflex

Eflex est une plateforme de déploiement inspirée de Vercel : vous poussez un dépôt, Eflex comprend la stack, construit l'application et la met en ligne.

Ce dépôt contient la **Stage 1** : un **détecteur de dépôt déterministe**. Il transforme un instantané de dépôt (liste de fichiers + lecteur de contenu) en un **plan de build** JSON. Aucun appel réseau, aucun modèle d'IA, aucune dépendance à l'exécution : la même entrée produit toujours exactement la même sortie.

## Le problème résolu

Déployer un dépôt demande aujourd'hui de répondre à beaucoup de questions implicites :

- Quel gestionnaire de paquets utiliser ?
- Quelle commande d'installation, de build et de démarrage ?
- Sur quel port exposer l'application ?
- Faut-il un worker de file d'attente, un planificateur, des migrations ?
- Où se trouve la véritable application dans un monorepo ?

Eflex répond à ces questions par convention, puis laisse l'utilisateur corriger explicitement quand la convention ne suffit pas. Le résultat est un `BuildPlan` : un objet JSON stable, validable et reproductible, que le builder et le runtime consomment.

## Les trois niveaux de configuration

La détection suit une hiérarchie stricte. **Le premier niveau qui s'applique gagne.**

1. **Convention** — Eflex inspecte les fichiers du dépôt : `package.json`, `composer.json`, `pyproject.toml`, `requirements.txt`, `next.config.*`, `artisan`, `index.html`, les lockfiles, etc. C'est le niveau zéro de friction : rien à écrire.
2. **`eflex.json`** — un fichier explicite à la racine du dépôt (ou de l'application) qui **remplace** la détection automatique. Il permet de fixer le framework, le runtime, les commandes, le port, les services, les volumes, etc. Sa confiance est de `1.0` et aucune question n'est posée. La détection conventionnelle reste disponible dans `alternatives`.
3. **`Dockerfile`** — si un `Dockerfile` (ou `docker/Dockerfile`) est présent, Eflex considère que vous contrôlez entièrement le build. Le plan est volontairement minimal : runtime `docker@1`, port lu depuis `EXPOSE` (sinon `3000`). Aucun autoscaling ni health check n'est deviné.

Le schéma du fichier de configuration est documenté dans [`schema/README.md`](../../schema/README.md) et implémenté dans [`schema/v1.json`](../../schema/v1.json) (JSON Schema draft 2020-12).

## Stacks supportées

| Détection | Framework retourné | Runtime | Port par défaut |
| --- | --- | --- | --- |
| `next` (dépendance ou `next.config.*`) | `nextjs` | `node@<engines.node>` | `3000` |
| `nuxt` | `nuxt` | `node@<engines.node>` | `3000` |
| `astro` | `astro` | `static@1` | `80` |
| `vite` | `vite` | `static@1` | `80` |
| `@nestjs/core` | `node` | `node@<engines.node>` | `3000` |
| `express`, `fastify`, `koa`, `hono` | `node` | `node@<engines.node>` | `3000` |
| `package.json` + script `build` + `index.html` | `static` | `static@1` | `80` |
| Laravel (`laravel/framework` + `artisan`) | `laravel` | `php@8.2/8.3/8.4` | `80` |
| Autre PHP (`composer.json` ou `index.php`) | `php` | `php@8.2/8.3/8.4` | `80` |
| FastAPI, Flask, Django, WSGI | `python` | `python@3.12` | `8000` |
| `index.html` seul | `static` | `static@1` | `80` |
| `Dockerfile` | `docker` | `docker@1` | `3000` (ou `EXPOSE`) |
| `eflex.json` valide | `eflex-config` | déclaré ou déduit | déclaré ou `3000` |

Monorepos : Eflex reconnaît `pnpm-workspace.yaml`, `turbo.json`, `nx.json`, `lerna.json` et le champ `workspaces` de `package.json`. Une seule application candidate est résolue automatiquement (confiance réduite de 5 %). Plusieurs applications produisent une question explicite et deux plans alternatifs.

## Commandes

```bash
pnpm install       # installe les dépendances de développement
pnpm test          # lance la suite Vitest
pnpm typecheck     # vérifie TypeScript en mode strict (tsc --noEmit)
pnpm detect ./mon-repo
```

La commande `detect` lit le répertoire local de façon récursive, ignore `node_modules`, `vendor`, `.git`, `dist`, `build`, etc., puis affiche le `DetectionResult` complet en JSON. Elle n'effectue aucun appel réseau.

## Format du build plan

Exemple pour une application Next.js avec `pnpm` :

```json
{
  "version": 1,
  "framework": "nextjs",
  "runtime": "node@22",
  "root": "",
  "install": "pnpm install --frozen-lockfile",
  "build": "next build",
  "start": "next start",
  "port": 3000,
  "buildEnv": {
    "NEXT_PUBLIC_SITE_URL": "https://exemple.fr"
  }
}
```

Le détecteur retourne aussi des métadonnées utiles au produit :

```json
{
  "plan": { "...": "BuildPlan ou null" },
  "confidence": 0.95,
  "framework": "nextjs",
  "reasons": ["Dépendance `next` trouvée dans `package.json`."],
  "warnings": ["Pour un démarrage optimisé, activez `output: 'standalone'` dans next.config."],
  "questions": [],
  "alternatives": []
}
```

Règles importantes :

- `confidence` est arrondie à deux décimales et bornée à `0.99` (sauf `eflex.json`, qui vaut `1.0`).
- `questions` n'est rempli que lorsque la confiance est inférieure à `0.7`. Chaque question est actionnable et rédigée en français.
- `alternatives` contient au plus deux autres plans plausibles.
- **Aucun secret dans le plan.** La clé `env` n'existe pas dans le schéma. `buildEnv` est public et ses valeurs finissent dans le bundle client.

Un exemple Laravel complet :

```json
{
  "version": 1,
  "framework": "laravel",
  "runtime": "php@8.3",
  "root": "",
  "install": "composer install --no-dev --optimize-autoloader",
  "build": "npm ci && npm run build",
  "port": 80,
  "services": {
    "app": { "command": "php-fpm", "port": 9000 },
    "web": { "command": "nginx -g 'daemon off;'", "port": 80, "healthcheck": "/" },
    "queue": { "command": "php artisan queue:work --tries=3 --sleep=1", "replicas": 1 },
    "scheduler": { "command": "php artisan schedule:work" }
  },
  "volumes": ["storage"],
  "postDeploy": [
    "php artisan migrate --force",
    "php artisan config:cache",
    "php artisan route:cache",
    "php artisan view:cache",
    "php artisan queue:restart"
  ]
}
```

## Limites connues

- **Monorepos** : seuls les répertoires à profondeur 1 ou 2 contenant un manifeste sont considérés. Les workspaces imbriqués plus profondément ou les applications sans manifeste à leur racine ne sont pas détectés. Les commandes d'installation ne sont pas encore filtrées par workspace (`--filter`).
- **Dépendances natives** : le détecteur ne compile rien. Les extensions PHP, les bibliothèques système et les binaires natifs doivent être fournis par l'image de runtime ou un `Dockerfile`.
- **Builds custom** : les scripts exotiques (Makefile, Bazel, tâches Gradle, etc.) ne sont pas reconnus. Utilisez `eflex.json` ou un `Dockerfile`.
- **Versions** : Eflex lit `engines.node`, `.python-version`, `runtime.txt`, `requires-python` et `require.php`. Les contraintes complexes sont ramenées à la version majeure (Node) ou à la version supportée la plus proche (PHP).
- **Pas de secrets** : le fichier `eflex.json` est versionné. Il ne doit jamais contenir de secret ; la plateforme injecte les variables sensibles au déploiement.
