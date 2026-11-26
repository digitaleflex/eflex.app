# Migration E-FLEX + Coolify vers `lesaint` (2026-11-25)

## Périmètre

Migré :
- **E-FLEX** (portail, docs, postgres, redis) — base restaurée depuis l’ancien serveur.
- **Coolify** (control plane : `coolify`, `coolify-db`, `coolify-redis`, `coolify-proxy`, `/data/coolify`).

Non migré (volontairement laissé sur l’ancien serveur) :
- Applications clientes WordPress/Laravel/autres gérées par l’ancien Coolify.
- Ancien Traefik/proxy de l’ancien serveur.

## Serveurs

| Rôle | Hôte Tailscale | IP publique | Notes |
|---|---|---|---|
| Nouveau (E-FLEX + Coolify) | `lesaint@100.119.132.45` (`vmi3782410`) | `169.58.240.214` | Ubuntu, Docker 28.1.1, Compose v2.35.1 |
| Ancien (apps clientes) | machine locale/fantome | `72.61.90.216` | Coolify arrêté; apps + Traefik toujours actifs |

Accès SSH nouveau serveur : clé `~/.ssh/lesaint_100_119_132_45` (utilisateur `lesaint`, sudo).

## DNS Cloudflare (`eflex.app`)

| Enregistrement | Type | Cible | Rôle |
|---|---|---|---|
| `eflex.app` | A | `169.58.240.214` | Portail E-FLEX |
| `coolify.eflex.app` | A | `169.58.240.214` | Coolify |
| `docs.eflex.app` | A | `169.58.240.214` | Documentation |
| `api.eflex.app` | A | `169.58.240.214` | API (réservé) |
| `axiom.eflex.app` | A | `169.58.240.214` | Console Axiom (réservé) |
| `uptime.eflex.app` | A | `169.58.240.214` | Uptime Kuma |
| `metrics.eflex.app` | A | `169.58.240.214` | Beszel (DNS prêt, non déployé) |
| `logs.eflex.app` | A | `169.58.240.214` | Dozzle |
| `*.eflex.app` | A | `72.61.90.216` | Apps clientes existantes (ancien serveur) |

> Le wildcard pointe vers l’ancien serveur pour ne pas casser les apps clientes. Les sous-domaines E-FLEX/Coolify explicites prennent le dessus.

## Services déployés sur le nouveau serveur

### E-FLEX (`/home/lesaint/eflex`)
- `docker-compose.prod.yml` déployé avec `deploy.sh`.
- `.env.prod` : fusionné depuis la prod locale ; credentials DB/Redis locaux conservés car la base a été initialisée avec eux.
- Sauvegarde avant fusion : `/home/lesaint/eflex/.env.prod.bak.before_merge`.

### Coolify (`/data/coolify`)
- Source : `/data/coolify/source` (compose `docker-compose.yml` + `docker-compose.prod.yml` + `docker-compose.custom.yml`).
- DB : dump restauré dans `coolify-db`.
- Proxy : `/data/coolify/proxy/docker-compose.yml` (Coolify Proxy Traefik).

### Supervision (`/home/lesaint/ops`)
- **Uptime Kuma** : `/home/lesaint/ops/uptime-kuma/docker-compose.yml`, URL `https://uptime.eflex.app`.
- **Dozzle** : `/home/lesaint/ops/dozzle/docker-compose.yml`, URL `https://logs.eflex.app`, protégé par Basic Auth Traefik.

## Identifiants

Les identifiants ne sont **pas** dans ce document. Ils sont stockés dans :
- Local (gitignored) : `.env.ops`
- Serveur nouveau : `/home/lesaint/ops/.env.ops` (chmod 600)

Changer les mots de passe après première connexion.

## Points d’attention

- **Traefik consolidé** : le Traefik standalone E-FLEX a été remplacé par Coolify Proxy sur 80/443. Le proxy Coolify a été rattaché au réseau Docker `proxy`.
- **Entrypoints** : le proxy Coolify a été aligné sur `web/websecure`. Les labels E-FLEX utilisent `websecure`.
- **Fichier généré par Coolify** : `/data/coolify/proxy/dynamic/coolify.yaml` a été patché (`http/https` → `web/websecure`). Coolify peut le régénérer ; vérifier après mise à jour Coolify.
- **Ancien serveur** : Coolify control plane arrêté, mais apps clientes et proxy toujours actifs. Ne pas arrêter l’ancien proxy tant que les apps clientes y sont routées.
- **Secrets** : ne jamais commiter `.env.prod`, `.env.ops`, tokens Cloudflare, clés SSH privées.

## Vérifications rapides

```bash
# Nouveau serveur
ssh -i ~/.ssh/lesaint_100_119_132_45 lesaint@100.119.132.45 'sudo docker ps --format "table {{.Names}}\t{{.Status}}"'

# Santé E-FLEX
curl -fsS https://eflex.app/api/health

# Coolify
curl -I https://coolify.eflex.app
```
