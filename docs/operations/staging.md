# Environnement de staging

> Périmètre : `docker-compose.staging.yml`, `.env.staging.example`,
> `deploy-staging.sh`. Ce document décrit un staging **isolé de la production**
> sur le même hôte Docker, sans partager ni base, ni Redis, ni volume, ni
> projet Coolify.

## 1. À quoi sert le staging

Le staging reproduit le portail de production (Next.js + PostgreSQL + Redis)
pour valider une version, une migration Prisma ou un parcours utilisateur
**avant** la mise en production. Il partage le serveur et le Traefik de l'hôte,
mais rien d'autre.

| Élément | Production | Staging |
|---|---|---|
| Fichier Compose | `docker-compose.prod.yml` | `docker-compose.staging.yml` |
| Projet Compose | défaut (`eflex`) | `eflex-staging` |
| Conteneurs | `eflex-portail`, `eflex-postgres`, `eflex-redis` | `eflex-staging-*` |
| Base PostgreSQL | `eflex` | `eflex_staging` |
| Volume PostgreSQL | `eflex_postgres_data` | `eflex-staging-postgres-data` |
| Redis | `eflex-redis`, sans mot de passe | `eflex-staging-redis`, **avec mot de passe** |
| Réseau interne | `eflex-internal` | `eflex-staging-internal` |
| Domaine | `eflex.app` (via `config/domains.sh`) | `staging.eflex.app` |
| Routeur Traefik | `portail` | `eflex-staging` |
| Accès local | non publié | `127.0.0.1:3001` (loopback uniquement) |
| Coolify | projet `Eflex` / `production` | projet `Eflex Staging` / `staging` |
| Paiements | réel | sandbox (`KKIAPAY_SANDBOX=true`, `FEDAPAY_SANDBOX=true`) |
| E-mails | Resend réel | clé absente ou clé de test |
| Sauvegardes | à définir côté exploitation | **aucune** |

## 2. Prérequis DNS

Le certificat est émis par HTTP-01 (Traefik de l'hôte, certresolver
`letsencrypt`). Il faut donc :

1. **Un enregistrement A/AAAA (ou CNAME) pour `staging.eflex.app`** vers l'IP
   publique du serveur Docker.
   ```bash
   dig +short staging.eflex.app
   ```
2. **DNS direct (non proxifié)** : chez Cloudflare, laisser la nuage **gris**
   (DNS only). En mode proxifié (orange), HTTP-01 peut échouer ou boucler selon
   la configuration TLS de la zone.
3. **Ports 80 et 443 joignables** depuis Internet sur cet hôte (Traefik les
   détient déjà pour la production).

Le certificat n'est émis qu'au premier routage réel : tant que le DNS ne
pointe pas vers le serveur, `https://staging.eflex.app` ne répondra pas. Le
staging reste alors utilisable via `http://127.0.0.1:3001`.

### Applications déployées depuis le staging

Avec `PORTAL_DOMAIN=staging.eflex.app`, chaque projet créé reçoit
`<slug>.staging.eflex.app`. Pour que ces applications soient joignables, il
faut **en plus** un enregistrement wildcard `*.staging.eflex.app` (A/AAAA vers
le même serveur). Sans ce wildcard, la création de projets fonctionne mais
leurs URLs ne résolvent pas. Ce n'est pas nécessaire pour tester le portail
lui-même.

### Action à valider (non faite ici)

`config/domains.sh` ne contient volontairement **aucune** variable staging :
il reste la source unique des domaines de **production**. `staging.eflex.app`
est donc écrit dans `docker-compose.staging.yml` / `.env.staging.example`,
avec la variable `STAGING_DOMAIN` comme point de surcharge.

Si l'équipe veut centraliser aussi le staging, il faudra ajouter à
`config/domains.sh` une variable du type `STAGING_DOMAIN`/`STAGING_PORTAL_URL`
et adapter `deploy-staging.sh` pour la sourcer. **Cette modification est à
valider avec le responsable infra** : elle touche un fichier partagé avec la
production et n'entre pas dans le périmètre de cette préparation.

## 3. Première installation

Depuis la racine du dépôt, sur le serveur :

```bash
# 1. Fichier de variables (ignoré par git, jamais commité)
cp .env.staging.example .env.staging
chmod 600 .env.staging

# 2. Secrets — ne JAMAIS copier ceux de .env.prod
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # ENV_ENCRYPTION_KEY
openssl rand -hex 24      # POSTGRES_PASSWORD
openssl rand -hex 24      # REDIS_PASSWORD
# Reporter ces valeurs dans .env.staging, y compris dans DATABASE_URL et REDIS_URL.

# 3. Vérifier AVANT tout démarrage (ne lance rien)
docker compose -p eflex-staging -f docker-compose.staging.yml \
  --env-file .env.staging config -q

# 3 bis. Rejouer tous les garde-fous du script sans démarrer de conteneur
CHECK_ONLY=1 bash deploy-staging.sh

# 4. Déployer (vérifications anti-prod, migrations, build, santé)
bash deploy-staging.sh
```

> La valeur `ENV_ENCRYPTION_KEY` de `.env.staging.example` n'est volontairement
> pas une clé valide : le portail refuse de démarrer tant qu'elle n'a pas été
> remplacée. C'est un garde-fou, pas un bug.

`deploy-staging.sh` effectue, dans l'ordre :

1. contrôle de `.env.staging` et des secrets obligatoires ;
2. **garde-fou anti-production** sur `DATABASE_URL` (`/eflex` interdit, base
   obligatoirement `eflex_staging`, hôte `eflex-postgres` interdit) et sur
   `REDIS_URL` (`eflex-redis` interdit) ;
3. avertissement si un secret est identique à celui de `.env.prod` ;
4. `docker compose config -q` ;
5. `up -d postgres redis` → build + `run --rm migrate` (`prisma migrate deploy`)
   → `up -d --build` ;
6. attente de `http://127.0.0.1:3001/api/health` (bloquant) puis de
   `https://staging.eflex.app/api/health` (non bloquant : DNS/certificat) ;
7. `ps` + 20 dernières lignes de logs.

En cas d'échec de santé, le script affiche `ps` et la commande de logs et
sort en code non nul.

### Vérification manuelle

```bash
curl -fsS http://127.0.0.1:3001/api/health          # {"status":"ok"}
curl -fsS https://staging.eflex.app/api/health      # si DNS + certificat prêts
docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging ps
docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging logs -f portail
```

## 4. Données de test

Le staging démarre avec une base **vide** (migrations appliquées, aucune
donnée). Pour tester :

1. Créer un compte via `/signup` avec une adresse de test.
2. Promouvoir ce compte administrateur si nécessaire. `ADMIN_EMAILS` ne suffit
   que pour un e-mail **vérifié** ; sans `RESEND_API_KEY`, la vérification
   n'est pas exigée mais le champ doit être marqué vrai :
   ```bash
   docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging \
     exec postgres psql -U eflex_staging -d eflex_staging \
     -c "UPDATE \"User\" SET role='admin', \"emailVerified\"=true WHERE email='admin-staging@example.com';"
   ```
3. Créer une organisation/projet de test. Laisser `COOLIFY_API_URL` et
   `COOLIFY_API_TOKEN` **vides** si l'on ne veut créer aucune application
   réelle : la création échoue proprement, sans effet distant.

Règles :

- aucune donnée personnelle réelle, aucun secret de production dans un projet
  de test : `ENV_ENCRYPTION_KEY` étant propre au staging, les valeurs chiffrées
  ne sont pas réutilisables en production (et inversement) ;
- paiements en sandbox uniquement ;
- ne pas brancher le webhook GitHub de production sur le staging (utiliser une
  App de test, ou aucune App).

## 5. Reset de la base staging

Deux niveaux, du plus doux au plus radical. **Toujours cibler le projet
`eflex-staging`** : un `down -v` sans `-p` sur le fichier prod détruirait les
volumes de production.

### Reset du schéma (conserve le conteneur et les rôles)

```bash
docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging \
  exec postgres psql -U eflex_staging -d eflex_staging \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'

# Réappliquer les migrations
docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging \
  --profile tools run --rm migrate
```

### Reset complet (volume recréé)

```bash
docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging down -v
bash deploy-staging.sh
```

Vérifier avant de valider la commande que la sortie de `docker compose ... ps`
ne mentionne que des conteneurs `eflex-staging-*`. Le volume supprimé doit être
`eflex-staging-postgres-data`.

## 6. Ne jamais pointer le staging vers la production

Le staging ne doit **jamais** utiliser :

- `postgresql://…@eflex-postgres:5432/eflex` (base de production) ;
- `redis://eflex-redis:6379` (Redis de production, sans mot de passe) ;
- un volume `eflex_postgres_data` ;
- le projet Coolify `Eflex` / l'environnement `production`.

Pourquoi c'est dangereux :

- Prisma et le worker écrivent en base (projets, déploiements, sessions,
  factures) : une base partagée rend les données incohérentes et peut déclencher
  de vrais déploiements via Coolify ;
- les secrets d'environnement sont chiffrés avec `ENV_ENCRYPTION_KEY` : une clé
  partagée permettrait de déchiffrer les variables de production depuis le
  staging ;
- une migration Prisma de test appliquée sur la base de production est
  irréversible sans restauration.

Garde-fous en place :

- `deploy-staging.sh` refuse `/eflex`, une base autre que `eflex_staging`,
  l'hôte `eflex-postgres` et l'hôte `eflex-redis` ;
- le fichier Compose force `name: eflex-staging`, des noms de conteneurs, de
  volumes et de réseaux `eflex-staging-*` ;
- `COOLIFY_PROJECT_NAME` vaut `Eflex Staging` par défaut.

Ce que les garde-fous **ne** couvrent pas : une copie manuelle de `.env.prod`
vers `.env.staging` après avoir contourné les contrôles, ou un `docker compose`
lancé avec le mauvais fichier. En cas de doute :

```bash
docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging config | grep -E 'DATABASE_URL|REDIS_URL'
```

## 7. Différences assumées avec la production

- **Un seul hôte, un seul worker BullMQ** : le staging n'est pas haute
  disponibilité et ne teste pas la montée en charge.
- **Pas de sauvegarde** : le volume staging peut être détruit sans préavis.
- **Traefik partagé** : une erreur de label dans le staging peut impacter le
  routage global ; les noms de routeur/service sont préfixés `eflex-staging`
  pour l'éviter.
- **Coolify partagé si branché** : même instance, projet/environnement
  distincts. La suppression accidentelle du projet `Eflex Staging` ne doit pas
  toucher `Eflex`, mais une erreur de jeton reste possible — d'où le choix par
  défaut de laisser `COOLIFY_API_URL`/`COOLIFY_API_TOKEN` vides en staging.
- **E-mails** : sans `RESEND_API_KEY`, aucun e-mail n'est envoyé (les liens
  restent dans les logs). Avec une clé de test, vérifier le domaine
  expéditeur.
- **Captcha / OAuth** : Turnstile et Google sont désactivés si les clés sont
  vides. Si Google OAuth est activé, déclarer
  `https://staging.eflex.app/api/auth/callback/google` (et l'origine
  `https://staging.eflex.app`) dans Google Cloud Console.
- **Domaine** : `staging.eflex.app` est codé dans le Compose staging
  (surchargeable par `STAGING_DOMAIN`), pas dans `config/domains.sh` (voir §2).

## 8. Rotation des secrets

Toujours modifier `.env.staging` puis relancer
`bash deploy-staging.sh` (ou `docker compose ... up -d portail` pour un simple
redémarrage). Ne jamais committer `.env.staging`.

### `BETTER_AUTH_SECRET`

```bash
openssl rand -base64 32   # nouvelle valeur dans .env.staging
bash deploy-staging.sh
```

Conséquence : toutes les sessions du staging sont invalidées. Sans impact sur
la production (secret distinct).

### `ENV_ENCRYPTION_KEY` (variables d'environnement des projets)

Rotation sans perte, en deux déploiements :

1. déplacer l'ancienne clé dans `ENV_ENCRYPTION_KEY_PREVIOUS`, mettre la
   nouvelle dans `ENV_ENCRYPTION_KEY`, redéployer (lecture des deux clés) ;
2. migrer les valeurs : `pnpm exec tsx portail/scripts/encrypt-existing-env-vars.ts`
   (avec `DATABASE_URL` du staging) ;
3. vider `ENV_ENCRYPTION_KEY_PREVIOUS` et redéployer.

Ne jamais réutiliser la clé de production : la rotation staging est
indépendante.

### `POSTGRES_PASSWORD`

```bash
# 1. Nouveau mot de passe dans .env.staging (POSTGRES_PASSWORD + DATABASE_URL)
docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging \
  exec postgres psql -U eflex_staging -d postgres \
  -c "ALTER USER eflex_staging WITH PASSWORD 'NOUVEAU_MOT_DE_PASSE';"
# 2. Redémarrer le portail pour qu'il prenne la nouvelle URL
docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging up -d portail
```

`POSTGRES_PASSWORD` n'est utilisé qu'à la création du volume : après un
changement, l'ancien mot de passe reste valide côté serveur jusqu'à l'`ALTER
USER` ci-dessus.

### `REDIS_PASSWORD`

1. changer `REDIS_PASSWORD` et `REDIS_URL` dans `.env.staging` ;
2. recréer le conteneur Redis (pas de persistance : `--save ""`,
   `--appendonly no`) :
   ```bash
   docker compose -p eflex-staging -f docker-compose.staging.yml --env-file .env.staging up -d --force-recreate redis portail
   ```
3. les jobs BullMQ en cours sont perdus : à faire hors test actif.

### Autres secrets

`COOLIFY_API_TOKEN`, `GITHUB_*`, `RESEND_API_KEY`, clés de paiement : remplacer
la valeur puis `up -d portail`. Utiliser des jetons/clés **dédiés au staging**
(sandbox, lecture seule quand c'est possible).

## 9. Dépannage rapide

| Symptôme | Piste |
|---|---|
| `network proxy not found` | Traefik n'est pas démarré ; le staging local seul exige de retirer le réseau `proxy` et les labels du Compose staging. |
| `https://staging.eflex.app` en 404 | Le routeur n'est pas chargé : `docker logs traefik --tail=50`, vérifier les labels du conteneur. |
| Certificat absent / erreur ACME | DNS non propagé, ou hôte proxifié chez Cloudflare ; HTTP-01 exige un DNS direct. |
| `DATABASE_URL ... /eflex` refusé | Comportement attendu : corriger `.env.staging` vers `eflex_staging`. |
| Le portail redémarre en boucle | `ENV_ENCRYPTION_KEY` absente/invalide (32 octets base64) : voir `docker logs eflex-staging-portail`. |
| Migrations non appliquées | Relancer `--profile tools build migrate` puis `run --rm migrate` (l'image migrator embarque `portail/prisma`). |
| `127.0.0.1:3001` occupé | Changer `STAGING_PORTAL_PORT` dans `.env.staging`. |

## 10. Limites connues

- Le staging n'est pas un environnement de production : pas de sauvegarde, pas
  de supervision dédiée, pas de HA, pas de garantie de disponibilité.
- Il consomme les ressources du même hôte que la production (CPU, RAM, disque,
  builds Docker). Vérifier l'espace disque avant un build :
  `df -h /` et `docker system df`.
- Les builds d'images partagent le cache Docker de l'hôte ; un build staging
  peut évincer du cache utilisé par la production (impact : rebuild plus lent,
  pas de panne).
- Le staging n'est pas exposé à un trafic public important : ne pas y pointer
  de campagne ou de webhook de production.
- Ce document ne couvre pas la création d'un second serveur dédié ; si le
  staging doit être totalement séparé (y compris Traefik et Coolify), utiliser
  un hôte distinct avec le même fichier Compose et son propre `.env.staging`.
