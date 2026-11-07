# Stack de développement Eflex

## 1. Lancer les services

```bash
cd /home/fantome/eflex
cp .env.example .env
# adapte COOLIFY_API_URL et COOLIFY_API_TOKEN si tu as un Coolify distant

docker compose -f docker-compose.dev.yml up -d
```

Services disponibles :
- **PostgreSQL** : `localhost:5432` (user `eflex`, db `eflex`)
- **Redis** : `localhost:6379`
- **MinIO** : `localhost:9000` (API), `localhost:9001` (console, `minioadmin` / `minioadmin`)

## 2. Initialiser la base

```bash
npx prisma migrate dev --name init
npx prisma db seed   # si tu crées un fichier seed
npx prisma studio    # interface graphique pour inspecter la BDD
```

## 3. Pourquoi Coolify n'est pas dans ce compose

Coolify prend le contrôle total de `docker.sock` et lance son propre reverse proxy (Traefik) sur les ports 80/443. Sur ton VPS actuel, ces ports sont déjà occupés par le Traefik qui gère `digitaleflex.com` et les 7 domaines en production.

**Options pour le développement :**

| Option | Quand l'utiliser |
|---|---|
| **Coolify distant** (recommandé) | Tu as déjà un serveur avec Coolify. Tu renseignes `COOLIFY_API_URL` + `COOLIFY_API_TOKEN` dans `.env`. Le portail dev communique avec l'API de ce serveur. |
| **Coolify sur une VM dédiée** | Tu loues un petit VPS uniquement pour le dev Coolify. |
| **Sans Coolify** | Tu développes le détecteur et le renderer (ce qu'on a fait), et tu connectes Coolify plus tard. |

## 4. Les variables d'environnement à remplir

| Variable | Exemple dev |
|---|---|
| `DATABASE_URL` | `postgresql://eflex:eflexpass@localhost:5432/eflex` |
| `REDIS_URL` | `redis://localhost:6379` |
| `MINIO_ENDPOINT` | `http://localhost:9000` |
| `COOLIFY_API_URL` | `https://coolify.tonserveur.com/api/v1` |
| `COOLIFY_API_TOKEN` | jeton API Coolify (Keys & Tokens → API tokens ; droits read, write, deploy) |
| `COOLIFY_SERVER_UUID` | UUID du serveur où déployer (voir ci-dessous) |
| `COOLIFY_PROJECT_UUID` | UUID du projet Coolify qui contiendra les applications |
| `COOLIFY_ENVIRONMENT_NAME` | environnement du projet, `production` par défaut |
| `COOLIFY_DESTINATION_UUID` | facultatif : réseau Docker si le serveur en a plusieurs |
| `COOLIFY_APPS_DOMAIN` | facultatif : `apps.exemple.fr` → chaque projet reçoit `https://<slug>.apps.exemple.fr` (DNS wildcard `*.apps.exemple.fr` vers le serveur) |

Retrouver les identifiants Coolify :

```bash
curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$COOLIFY_API_URL/servers"  | jq '.[] | {name, uuid}'
curl -s -H "Authorization: Bearer $COOLIFY_API_TOKEN" "$COOLIFY_API_URL/projects" | jq '.[] | {name, uuid}'
```

Chaque projet Eflex devient une ou plusieurs applications Coolify : la configuration vient du plan détecté (commandes, port, dossier, dossier publié, commandes après déploiement) ; les services annexes (queue, scheduler…) deviennent des applications du même dépôt.
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | facultatifs : sans eux, le bouton Google reste inactif |
| `GITHUB_TOKEN` | facultatif : relève la limite de l'analyse des dépôts (60 → 5 000 requêtes/heure) ; un jeton sans aucun droit suffit |
