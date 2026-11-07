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

> Les domaines/URLs publics ne sont **pas** définis ici : leur source unique est
> `config/domains.sh` (`EFLEX_ROOT_DOMAIN`). En dev, les valeurs ci-dessous
> restent en `localhost` et surchargent ces exports.

| Variable | Exemple dev |
|---|---|
| `DATABASE_URL` | `postgresql://eflex:eflexpass@localhost:5432/eflex` |
| `REDIS_URL` | `redis://localhost:6379` |
| `MINIO_ENDPOINT` | `http://localhost:9000` |
| `COOLIFY_API_URL` | `https://coolify.tonserveur.com/api/v1` |
| `COOLIFY_API_TOKEN` | ton token API Coolify |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | facultatifs : sans eux, le bouton Google reste inactif ; en dev, déclarer l'URI de redirection `http://localhost:3000/api/auth/callback/google` |
| `GITHUB_TOKEN` | facultatif : relève la limite de l'analyse des dépôts (60 → 5 000 requêtes/heure) ; un jeton sans aucun droit suffit |
