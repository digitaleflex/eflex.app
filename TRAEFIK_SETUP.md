# Axiom + Traefik + Domain Setup Guide

> **Source unique des domaines : `config/domains.sh`** (une seule variable `EFLEX_ROOT_DOMAIN`). Avant les exemples ci-dessous : `set -a; . ./config/domains.sh; set +a`. Aucun domaine n'est codé en dur dans ce guide ; après un changement, lancer `bash scripts/sync-domains.sh`.

## 🎯 Objectif
Connecter `${AXIOM_CONSOLE_DOMAIN}` (et `${ENGINE_API_DOMAIN}`) au stack Axiom via Traefik avec SSL Let's Encrypt automatique.

---

## 📋 Prérequis

| Élément | Valeur |
|---------|--------|
| **Domaine** | `${AXIOM_CONSOLE_DOMAIN}` |
| **DNS A record** | Doit pointer vers **l'IP publique de votre serveur** |
| **Ports ouverts** | 80 (HTTP), 443 (HTTPS), 8080 (Engine API), 8081 (Traefik dashboard) |
| **Email Let's Encrypt** | `${ACME_EMAIL}` (défini dans `config/domains.sh`) |

### Zone DNS unique `${EFLEX_ROOT_DOMAIN}`

Tous les hôtes sont centralisés sur `${EFLEX_ROOT_DOMAIN}`. `${WILDCARD_DOMAIN}` est un enregistrement de **routage DNS** : le résolveur `le`/HTTP-01 émet un certificat par hôte et ne peut pas délivrer de wildcard (utiliser `letsencrypt-dns`/DNS-01 pour cela). Les anciens hôtes `*.eurinhash.com` sont abandonnés.

| Hôte | Rôle | Enregistrement |
|------|------|----------------|
| `${EFLEX_ROOT_DOMAIN}` | Console EFLEX / portail (hors de ce stack) | A/AAAA → IP du serveur |
| `${ENGINE_API_DOMAIN}` | API REST du moteur Axiom | A/AAAA → IP du serveur |
| `${AXIOM_CONSOLE_DOMAIN}` | Cloud Console Axiom héritée | A/AAAA → IP du serveur |
| `${WILDCARD_DOMAIN}` | Applications clientes déployées | A/AAAA wildcard → IP du serveur |

Pour HTTP-01, ces enregistrements doivent pointer en direct sur l'IP du serveur (pas de proxy Cloudflare orange), sinon utilisez DNS-01.

### Vérifier le DNS
```bash
# Doit retourner VOTRE IP serveur (pas Cloudflare)
dig +short ${AXIOM_CONSOLE_DOMAIN} A
```

---

## 🚀 Démarrage Rapide

### 1. Démarrer le stack
```bash
cd services/engine

# Construire les images
docker compose -f docker-compose.dev.yml build

# Démarrer
docker compose -f docker-compose.dev.yml up -d

# Voir les logs
docker compose -f docker-compose.dev.yml logs -f
```

### 2. Vérifier les services
| Service | URL | Description |
|---------|-----|-------------|
| **Engine API** | ${ENGINE_API_URL} | API REST Axiom |
| **Cloud Console** | ${AXIOM_CONSOLE_URL} | Interface web (à déployer séparément) |
| **Traefik Dashboard** | http://localhost:8081 | Dashboard Traefik (dev only) |
| **PostgreSQL** | localhost:5432 | DB (user: axiom, pass: axiom) |

### 3. Tester l'API
```bash
# Health check
curl ${ENGINE_API_URL}/api/v1/health

# Auth (avec token .env)
curl -H "Authorization: Bearer dev-token-12345" \
  ${ENGINE_API_URL}/api/v1/auth/me
```

---

## 🔧 Configuration Traefik

### Fichiers importants
```
services/engine/
├── docker-compose.dev.yml          # Stack complet
├── Dockerfile                      # Engine image
├── traefik/
│   └── dynamic/
│       ├── axiom-console.yml.tpl   # SOURCE (règles Host en ${VAR})
│       └── axiom-console.yml       # GÉNÉRÉ par scripts/sync-domains.sh
└── .env                            # Variables d'environnement
```

### Certificats Let's Encrypt
- Stockés dans volume `traefik-letsencrypt` → `/letsencrypt/acme.json`
- Renouvellement automatique par Traefik
- Challenge HTTP-01 sur port 80

### Config dynamique (gérée par l'Agent)
L'Agent écrit dans `/etc/traefik/dynamic/` (partagé via volume) :
- `axiom-<deploymentID>.yml` par déploiement
- L'agent gère : routage, TLS, redirection HTTP→HTTPS

---

## 🌐 Déployer une Application (GitHub → LIVE)

### Via API
```bash
# 1. Connecter GitHub (si configuré)
curl -X POST -H "Authorization: Bearer dev-token-12345" \
  ${ENGINE_API_URL}/api/v1/github/connections \
  -d '{"clientId": "...", "clientSecret": "..."}'

# 2. Lister repos
curl -H "Authorization: Bearer dev-token-12345" \
  ${ENGINE_API_URL}/api/v1/github/connections/ghc_xxx/repositories

# 3. Créer application
curl -X POST -H "Authorization: Bearer dev-token-12345" \
  ${ENGINE_API_URL}/api/v1/applications \
  -d '{"repositoryId": "repo_xxx", "name": "mon-app"}'

# 4. Analyser
curl -X POST -H "Authorization: Bearer dev-token-12345" \
  ${ENGINE_API_URL}/api/v1/applications/app_xxx/analysis \
  -d '{"ref": "main"}'

# 5. Voir profil détecté
curl -H "Authorization: Bearer dev-token-12345" \
  ${ENGINE_API_URL}/api/v1/applications/app_xxx/profile

# 6. Créer plan de déploiement
curl -X POST -H "Authorization: Bearer dev-token-12345" \
  ${ENGINE_API_URL}/api/v1/applications/app_xxx/deployment-plans \
  -d "{\"serverId\": \"srv_local\", \"environment\": \"production\", \"domain\": \"mon-app.${EFLEX_ROOT_DOMAIN}\"}"

# 7. Déployer
curl -X POST -H "Authorization: Bearer dev-token-12345" \
  ${ENGINE_API_URL}/api/v1/applications/app_xxx/deployments \
  -d '{"planId": "plan_xxx"}'

# 8. Suivre progression (SSE)
curl -H "Authorization: Bearer dev-token-12345" \
  ${ENGINE_API_URL}/api/v1/deployments/dep_xxx/events/stream
```

### Résultat
- L'application sera accessible à `https://mon-app.${EFLEX_ROOT_DOMAIN}`
- Traefik gère automatiquement : SSL, routage, health checks
- L'agent gère : Docker, logs, recovery

---

## 🛠️ Commandes Utiles

### Logs
```bash
# Tous les services
docker compose -f docker-compose.dev.yml logs -f

# Service spécifique
docker compose -f docker-compose.dev.yml logs -f engine
docker compose -f docker-compose.dev.yml logs -f agent
docker compose -f docker-compose.dev.yml logs -f traefik
```

### Redémarrer
```bash
docker compose -f docker-compose.dev.yml restart engine
docker compose -f docker-compose.dev.yml restart agent
```

### Shell dans conteneur
```bash
docker exec -it axiom-engine sh
docker exec -it axiom-agent sh
docker exec -it axiom-traefik sh
```

### Certificats Let's Encrypt
```bash
# Voir les certificats
docker exec axiom-traefik cat /letsencrypt/acme.json | jq '.le.Certificates[] | {domain: .domain.main, expiry: .certificate.expires}'

# Forcer renouvellement (supprimer acme.json et restart traefik)
docker compose -f docker-compose.dev.yml stop traefik
docker volume rm axiom-engine_traefik-letsencrypt
docker compose -f docker-compose.dev.yml up -d traefik
```

---

## ⚠️ Points d'Attention

| Sujet | Note |
|-------|------|
| **DNS** | Doit pointer vers l'IP du serveur (pas Cloudflare proxy orange) pour Let's Encrypt HTTP-01 |
| **Email Let's Encrypt** | Modifier `EFLEX_ROOT_DOMAIN` dans `config/domains.sh` puis `bash scripts/sync-domains.sh` |
| **Traefik Dashboard** | Accessible sur port 8081 (localhost seulement), `--api.insecure=true` = dev only |
| **Agent Data** | Persisté dans volume `agent-data` → `/data` |
| **Dynamic Config** | Partagé via `./traefik/dynamic:/etc/traefik/dynamic` (Engine host ↔ Traefik ↔ Agent) |
| **Docker Socket** | Monté pour builds (Engine) et runtime (Agent) - **risque sécurité en prod** |

---

## 🔐 Sécurité Production (TODO)

- [ ] Désactiver `--api.insecure=true`
- [ ] Protéger dashboard Traefik par auth (basic auth ou OAuth)
- [ ] Utiliser Docker socket proxy (Technology: `tecnativa/docker-socket-proxy`)
- [ ] Séparer réseaux : `traefik-public`, `axiom-internal`
- [ ] Configurer rate limiting, WAF basique
- [ ] Monitoring : Prometheus + Grafana (Traefik expose `/metrics`)

---

## 📁 Structure des Volumes

```
axiom-postgres-data     → /var/lib/postgresql/data  (PostgreSQL)
traefik-letsencrypt     → /letsencrypt              (ACME certificates)
agent-data              → /data                     (Agent identity, credentials, state)
./traefik/dynamic       → /etc/traefik/dynamic      (Dynamic config, shared)
```

---

## 🎯 Prochaines Étapes

1. **Configurer DNS** : `${AXIOM_CONSOLE_DOMAIN}` A → votre IP serveur
2. **Lancer stack** : `docker compose -f docker-compose.dev.yml up -d`
3. **Attendre certificats** : ~30-60s pour Let's Encrypt
4. **Tester API** : `curl ${ENGINE_API_URL}/api/v1/health`
5. **Déployer Cloud Console** : Build React app → servir via Traefik
6. **Premier déploiement** : Suivre guide "Déployer une Application" ci-dessus