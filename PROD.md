# Moteur Eflex — notes de déploiement production

## Architecture visée (un serveur)

```
Internet
   │
   ▼
Cloudflare (DNS + DDoS + WAF)
   │
   ▼
┌─────────────┐
│ Traefik v3  │──► Portail Next.js (port 3000)
│ (80/443)    │──► TLS Let's Encrypt
└──────┬──────┘   (existant, hors compose Eflex)
       │
   ┌───┴───┐
   │       │
 PostgreSQL   Redis
 (5432)       (6379)
```

> `docker-compose.prod.yml` ne lance **pas** Traefik : il se rattache au Traefik
> déjà présent sur le réseau Docker externe `proxy`. C'est ce qui permet
> d'exporter la même config sur un VPS où Traefik tourne déjà.

## Hautes disponibilités (ce que ce compose NE fait pas seul)

Ce fichier lance **un seul serveur**. Si ce serveur meurt, tout s'arrête.

Pour de la vraie HA, il vous faut :

1. **Deux serveurs** identiques, chacun avec ce même `docker-compose.prod.yml`.
2. **Un load balancer** devant (Cloudflare Load Balancing, ou un petit VPS avec HAProxy/Traefik).
3. **PostgreSQL répliqué** : soit un service managé (Neon, Supabase, DigitalOcean Managed DB), soit une réplication maître-esclave entre les deux serveurs.
4. **Redis avec Sentinel** ou un service managé.
5. **Stockage partagé ou S3** (Backblaze B2, AWS S3) pour les logs de build et sauvegardes.

## Étapes de lancement

```bash
cd /home/fantome/eflex

# 1. Variables
cp .env.prod.example .env.prod
# Éditez .env.prod : mettez vos vrais secrets (les domaines sont dans config/domains.sh)

# 2. Réseau Traefik (doit déjà exister, fourni par le Traefik du serveur)
docker network inspect proxy

# 3. Lancement (Postgres/Redis → migrations Prisma → portail)
bash deploy.sh

# 4. Vérification (deploy.sh a déjà sourcé config/domains.sh ; pour un appel
#    direct à Compose, refaire `set -a; . ./config/domains.sh; set +a`)
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f portail
```

## Mise à jour du portail

```bash
bash deploy.sh
```

Ou manuellement :

```bash
set -a; . ./config/domains.sh; set +a
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d --build
```

## Pipeline de déploiement des projets clients

`POST /api/projects` ne déploie pas « un dépôt » mais **un BuildPlan** :

1. `packages/detector` analyse le dépôt (ou `eflex.json`) et produit le plan stocké dans `Project.plan` / `Project.detection`.
2. `packages/renderer.buildDeploymentArtifacts()` génère le `Dockerfile`, le `docker-compose.yml`, `nginx/default.conf` et le modèle `.env` ; le port exposé vient du plan, pas d'une valeur par défaut.
3. Le portail transmet à Coolify `build_pack` (`dockercompose` ou `dockerfile`), `ports_exposes`, le compose encodé en base64 (`docker_compose_raw`) et le Dockerfile généré.
4. Les variables d'environnement du client sont chiffrées (AES-256-GCM) en base et transmises séparément à Coolify ; elles n'apparaissent jamais dans les artefacts de build.

Les `postDeploy` (migrations Laravel, caches) sont exécutés par un service one-shot `migrate` du compose. Ce pipeline est couvert par `packages/renderer/test/deploy.test.ts` et `portail/src/lib/deploy-plan.test.ts`.

⚠️ Coolify est **volontairement distant** : `COOLIFY_API_URL` / `COOLIFY_API_TOKEN` doivent être renseignés dans `.env.prod`. Sans eux, la création de projet reste en base mais le déploiement est signalé en échec (`/api/status` affiche « non surveillé » si laissé vide).

## GitHub App (dépôts privés et redéploiement sur push)

Une fois l'App créée sur GitHub, déclarer l'URL du webhook :

```
https://eflex.app/api/webhooks/github
```

- **Permissions** : `contents: read`, `metadata: read`, `pull_requests: write`, `checks: write`.
- **Événements** : `push`, `pull_request`, `installation`, `installation_repositories`.
- **Variables** (`.env.prod`, jamais commitées) : `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY` (PEM, `\n` échappés acceptés), `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_SLUG`.
- Le secret du webhook sert à vérifier `X-Hub-Signature-256` ; une signature invalide renvoie **401** sans rien enfiler.
- `X-GitHub-Delivery` est stocké dans `WebhookDelivery` : une livraison rejouée ne crée pas de second déploiement.
- Un `push` sur la branche de production crée un `Deployment` `queued` avec le SHA reçu et l'enfile dans BullMQ.

Sans ces variables, `/api/github/config` annonce l'App non configurée et le sélecteur GitHub est masqué ; l'analyse des dépôts publics reste disponible.

## File de déploiement

`POST /api/projects` répond **202** avec un `Deployment` `queued` : le travail lourd (Coolify, variables chiffrées, build, statut, logs) est effectué par un **worker BullMQ** démarré dans le processus du portail via `src/instrumentation.ts`. Il se connecte à Redis avec `REDIS_URL` (`redis://eflex-redis:6379`, réseau interne — aucun port publié sur l'hôte).

- `jobId = deploymentId` : pas de doublon de job ; `coolifyAppId` est stocké dès sa création pour rendre chaque étape reprenable.
- BullMQ reprend automatiquement les jobs « stalled » après un redémarrage du portail.
- Suivi : `GET /api/deployments/[id]`, bouton « Redéployer » et panneau à polling 3 s sur `/dashboard/projects/[id]`.
- Sans `REDIS_URL`, le worker ne démarre pas et les créations de projet échouent explicitement (plutôt que de rester bloquées).

## Sécurité

- Ne commitez **jamais** `.env.prod` (déjà couvert par `.env.*` dans `.gitignore`).
- Les certificats TLS sont gérés par le Traefik existant (son `acme.json`), pas par ce compose.
- PostgreSQL et Redis ne sont **pas** exposés sur l'hôte (pas de `ports:`), ils sont seulement sur le réseau interne `eflex-internal`.

## Source unique des domaines

**`config/domains.sh` est la seule source de vérité** pour tous les domaines et URLs publics. Il ne contient aucun secret et n'expose qu'une variable à modifier : `EFLEX_ROOT_DOMAIN`. Toutes les autres valeurs en sont dérivées et exportées :

| Variable | Rôle |
|---|---|
| `PORTAL_DOMAIN` / `PORTAL_URL` / `BETTER_AUTH_URL` | console EFLEX (apex) |
| `GOOGLE_OAUTH_REDIRECT` | URI de redirection Google OAuth |
| `ENGINE_API_DOMAIN` / `ENGINE_API_URL` | API du moteur Axiom |
| `AXIOM_CONSOLE_DOMAIN` / `AXIOM_CONSOLE_URL` | console Axiom héritée |
| `WILDCARD_DOMAIN` | applications clientes déployées |
| `ACME_EMAIL` / `SCHEMA_ID` | email ACME / `$id` du schéma JSON |

Les fichiers Compose et `deploy.sh` consomment ces variables via `${VAR}` : **aucun domaine n'est codé en dur** dans la configuration. Deux fichiers statiques ne savent pas interpoler de variables (règles `Host()` de la config dynamique Traefik et `$id` du schéma JSON) ; ils sont régénérés depuis `axiom-console.yml.tpl` par :

```bash
bash scripts/sync-domains.sh
```

**Changer de domaine** : modifier `EFLEX_ROOT_DOMAIN` → `bash scripts/sync-domains.sh` → mettre à jour les enregistrements DNS → `bash deploy.sh`.

## Domaine et DNS

La zone est `$EFLEX_ROOT_DOMAIN`, avec des enregistrements **DNS direct** (`proxied: false` chez Cloudflare). Le certresolver `letsencrypt` du Traefik existant est en **HTTP-01** : il émet un certificat par hôte routé. Il **ne peut pas** émettre de certificat wildcard : `$WILDCARD_DOMAIN` sert au routage DNS, pas à un certificat. Pour un vrai wildcard, utiliser le résolveur `letsencrypt-dns` (DNS-01 / Cloudflare) déjà configuré sur le serveur.

| Variable | Usage | Enregistrement DNS |
|---|---|---|
| `$PORTAL_DOMAIN` | Console EFLEX (portail Next.js) | A / AAAA → IP publique du serveur |
| `$ENGINE_API_DOMAIN` | API du moteur Axiom | A / AAAA → IP publique du serveur |
| `$AXIOM_CONSOLE_DOMAIN` | Cloud Console Axiom héritée (transitoire) | A / AAAA → IP publique du serveur |
| `$WILDCARD_DOMAIN` | Applications clientes déployées | A / AAAA wildcard → IP publique du serveur |

L'apex (`$PORTAL_DOMAIN`) est réservé au portail : ne pas y exposer l'API du moteur, sinon la règle Traefik et les cookies d'authentification entrent en conflit.

Ces enregistrements doivent pointer vers l'IP publique **avant** le premier lancement, sinon Let's Encrypt ne pourra pas valider le certificat. En HTTP-01, laissez ces hôtes en DNS direct (pas de proxy Cloudflare orange), ou configurez DNS-01.

### Google OAuth

Better Auth dérive l'URI de redirection de `BETTER_AUTH_URL`. À déclarer dans Google Cloud Console :

- **URI de redirection autorisée** : `$GOOGLE_OAUTH_REDIRECT`
- **Origine JavaScript autorisée** : `$PORTAL_URL`

En développement local : `http://localhost:3000/api/auth/callback/google`.
