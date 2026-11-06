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
└──────┬──────┘
       │
   ┌───┴───┐
   │       │
 PostgreSQL   Redis
 (5432)       (6379)
```

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
# Éditez .env.prod : mettez vos vrais mots de passe, domaine, token Coolify

# 2. Dossier Let's Encrypt
mkdir -p letsencrypt
chmod 700 letsencrypt

# 3. Lancement
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d

# 4. Vérification
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f portail
```

## Mise à jour du portail

```bash
docker compose -f docker-compose.prod.yml --env-file .env.prod pull # si image distante
# ou rebuild local :
docker compose -f docker-compose.prod.yml --env-file .env.prod build --no-cache portail
docker compose -f docker-compose.prod.yml --env-file .env.prod up -d portail
```

## Sécurité

- Ne commitez **jamais** `.env.prod` (ajoutez-le au `.gitignore`).
- Le dossier `letsencrypt/` contient vos clés privées TLS : sauvegardez-le hors du serveur.
- `traefik` écoute sur 80 et 443 uniquement. PostgreSQL et Redis ne sont **pas** exposés sur l'hôte (pas de `ports:`), ils sont seulement sur le réseau interne `eflex-internal`.

## Domaine

Le portail attend un domaine `PORTAL_DOMAIN` (ex: `portail.eflex.dev`). Ce domaine doit pointer vers l'IP publique du serveur avant le premier lancement, sinon Let's Encrypt ne pourra pas valider le certificat.
