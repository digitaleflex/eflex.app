# Schéma Eflex v1

Ce dossier contient le schéma JSON du **plan de déploiement** Eflex ([`v1.json`](./v1.json), draft 2020-12) et sa documentation.

Le plan est produit par le détecteur, puis consommé par le builder et le runtime. Il est **déterministe**, **validable** et **sans secrets**.

- `$id` : `https://eflex.dev/schema/v1.json`
- `$schema` : `https://json-schema.org/draft/2020-12/schema`
- Validation : `additionalProperties: false`, `required: ["version"]`

## Les trois niveaux

Eflex applique une hiérarchie stricte. Le premier niveau disponible gagne.

1. **Convention** — le détecteur inspecte les fichiers (`package.json`, `composer.json`, `pyproject.toml`, `artisan`, `index.html`, lockfiles, etc.) et produit un plan avec un score de confiance. C'est le comportement par défaut, sans configuration.
2. **`eflex.json`** — un fichier explicite à la racine du dépôt (ou de l'application) **remplace** la détection. Il est validé contre ce schéma, puis complété par des valeurs par défaut. Sa confiance vaut `1.0`. Les plans conventionnels restent visibles dans `alternatives`.
3. **`Dockerfile`** — un `Dockerfile` (ou `docker/Dockerfile`) désactive la détection de framework. Le plan reste minimal (`docker@1`, port `EXPOSE` ou `3000`) car vous contrôlez le build.

> Un `eflex.json` invalide ne retombe **pas** sur la convention : le détecteur renvoie `plan: null`, une confiance `0` et un avertissement nommant l'erreur d'analyse. Mieux vaut échouer explicitement que déployer autre chose que ce qui est demandé.

## Exemple minimal

```json
{
  "version": 1,
  "framework": "nextjs",
  "runtime": "node@22",
  "root": "",
  "install": "pnpm install --frozen-lockfile",
  "build": "pnpm build",
  "start": "pnpm start",
  "port": 3000,
  "healthcheck": "/api/health"
}
```

## Exemple multi-services

```json
{
  "version": 1,
  "framework": "laravel",
  "runtime": "php@8.3",
  "root": "apps/api",
  "repoRoot": "../..",
  "install": "composer install --no-dev --optimize-autoloader",
  "build": "npm ci && npm run build",
  "port": 80,
  "services": {
    "app": { "command": "php-fpm", "port": 9000 },
    "web": { "command": "nginx -g 'daemon off;'", "port": 80, "healthcheck": "/" },
    "queue": { "command": "php artisan queue:work --tries=3 --sleep=1", "replicas": 2 }
  },
  "volumes": ["storage"],
  "postDeploy": ["php artisan migrate --force"],
  "resources": { "cpu": 1, "memoryMb": 1024 }
}
```

## Référence des clés

### `version` (obligatoire)

`const: 1`. Version du schéma. Toute autre valeur est rejetée.

### `framework`

Enum : `docker`, `eflex-config`, `nextjs`, `nuxt`, `astro`, `vite`, `node`, `laravel`, `php`, `python`, `static`.

Indique le framework retenu. Dans un plan produit depuis `eflex.json`, cette valeur peut venir du fichier ; le `framework` du `DetectionResult` vaut alors `eflex-config`.

### `runtime`

Chaîne au format `<famille>@<version>` :

- `node@22`, `node@20.11`
- `php@8.3`
- `python@3.12`
- `static@1`
- `docker@1`

Expression régulière : `^(node|php|python|static|docker)@[0-9]+(\.[0-9]+)?$`.

### `root`

Répertoire de l'application, relatif à la racine du dépôt.

- `""` : l'application est à la racine.
- `"apps/web"` : l'application est dans un sous-répertoire.

Pas de slash initial ni final : `^(|[^/]+(/[^/]+)*)$`. Les segments `.` et `..` sont refusés par le détecteur.

### `repoRoot`

Présent uniquement quand `root` n'est pas vide. Chemin relatif permettant de remonter du répertoire de l'application à la racine du dépôt :

- application `apps/web` → `repoRoot: "../.."`
- application `web` → `repoRoot: ".."`

Il sert au builder pour localiser les fichiers partagés (lockfile, configuration, etc.).

### `install`

Commande d'installation des dépendances, 1 à 500 caractères. Exemples :

- `pnpm install --frozen-lockfile`
- `yarn install --frozen-lockfile`
- `npm ci`
- `bun install --frozen-lockfile`
- `composer install --no-dev --optimize-autoloader`
- `pip install -r requirements.txt`

### `build`

Commande de build, 1 à 500 caractères. Absente pour un site statique sans build ou une image Docker.

### `start`

Commande de démarrage du service principal, 1 à 500 caractères. Absente pour un site statique et pour `docker@1`.

### `port`

Entier entre `1` et `65535`. Port HTTP du service principal. Valeurs par défaut : `3000` pour Node/Next/Nuxt, `80` pour PHP/Laravel/statique, `8000` pour Python, `3000` (ou `EXPOSE`) pour Docker.

### `healthcheck`

Chemin HTTP commençant par `/`, par exemple `/health` ou `/api/health`. Le runtime l'utilise pour vérifier que le service répond.

### `buildEnv`

Objet de variables d'environnement **de build**, dont les valeurs sont des chaînes (maximum 50 propriétés).

> **Attention : `buildEnv` est PUBLIC.** Ces valeurs sont intégrées au bundle client (par exemple `NEXT_PUBLIC_*`, `VITE_*`). N'y mettez **jamais** de secret, de clé d'API, de mot de passe ou de jeton.

### `services`

Objet non vide de services supplémentaires. Chaque clé doit respecter `^[a-z][a-z0-9-]{0,30}$`. Chaque valeur est un `ServiceSpec` :

| Champ | Type | Contraintes |
| --- | --- | --- |
| `command` | string | **obligatoire**, 1 à 500 caractères |
| `replicas` | integer | 1 à 10 |
| `healthcheck` | string | commence par `/` |
| `port` | integer | 1 à 65535 |

`additionalProperties: false` : aucun autre champ n'est accepté.

Exemple :

```json
{
  "services": {
    "web": { "command": "nginx -g 'daemon off;'", "port": 80, "healthcheck": "/" },
    "queue": { "command": "php artisan queue:work --tries=3 --sleep=1", "replicas": 1 }
  }
}
```

### `volumes`

Tableau de chemins persistants, maximum 20, sans doublons. Exemple : `["storage"]`.

### `postDeploy`

Tableau de commandes exécutées une fois après le déploiement, maximum 20, 500 caractères par commande. Exemples : migrations, caches, redémarrage des workers.

### `resources`

Ressources du service principal :

- `cpu` : nombre entre `0.1` et `8`
- `memoryMb` : entier entre `128` et `16384`

Aucune autre clé n'est acceptée.

### Pas de clé `env`

Le schéma **interdit** explicitement toute clé `env` (`additionalProperties: false`). Les secrets ne doivent jamais être commités dans le dépôt. Ils sont fournis à la plateforme au moment du déploiement, injectés dans le runtime, et ne transitent ni par `eflex.json` ni par le plan de build.

## Valider un plan

```bash
pnpm test        # la suite valide tous les plans produits avec ajv
```

En JavaScript :

```ts
import Ajv2020 from 'ajv/dist/2020.js';
import schema from './v1.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validate = ajv.compile(schema);

if (!validate(plan)) {
  console.error(ajv.errorsText(validate.errors));
}
```
