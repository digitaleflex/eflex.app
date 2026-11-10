# Sauvegardes, restauration et surveillance — Eflex

> Portée : base PostgreSQL du portail (`eflex-postgres`), test de restauration
> et healthcheck de production. Aucune dépendance à un service payant : tout
> tourne sur le VPS avec `pg_dump`, `openssl`, `curl` et systemd.
>
> Scripts : `scripts/backup-db.sh`, `scripts/restore-test.sh`,
> `scripts/healthcheck.sh`. Unités systemd d'exemple :
> `docs/operations/systemd/`.

## 1. Vue d'ensemble

| Composant | Rôle | Fréquence | État |
|---|---|---|---|
| `backup-db.sh` | `pg_dump` custom + gzip, vérifications, rétention | quotidien 03:30 | à installer (§5) |
| `restore-test.sh` | restaure la dernière sauvegarde dans `eflex_restore_test`, vérifie, supprime | dimanche 05:15 | à installer (§5) |
| `healthcheck.sh` | HTTP, TLS, Docker, PostgreSQL, Redis + alertes | toutes les 15 min | à installer (§5) |

Les scripts sont indépendants : ils peuvent être lancés à la main sans systemd.
Tous écrivent un journal lisible sur stdout (capturé par journald) **et** dans
`/home/fantome/backups/eflex/backup.log` ou `restore-test.log`.

Le healthcheck TLS couvre l'apex (`$PORTAL_DOMAIN`) et chaque `Project.domain`
non vide. Les alias `ProjectDomain` (domaines personnalisés vérifiés) ne sont
pas contrôlés ici : leur validité est suivie par le worker après déploiement
(`ProjectDomain.tlsValid` / `tlsExpiresAt`). Un domaine de projet créé mais pas
encore déployé (DNS absent) fait échouer le healthcheck : c'est volontaire,
utiliser `EFLEX_HEALTHCHECK_SKIP_PROJECT_DOMAINS=1` pour ne contrôler que
l'apex pendant la mise en place.

## 2. Emplacement, nommage, permissions

- Dossier par défaut : **`/home/fantome/backups/eflex`** (surchargeable par
  `EFLEX_BACKUP_DIR`). Le dossier est créé en **700**, les archives et journaux
  en **600** (`umask 077`).
- Quotidiennes : `eflex-db-daily-AAAAMMJJ.dump.gz`
- Hebdomadaires : `eflex-db-weekly-AAAA-Wss.dump.gz` (semaine ISO, créée le
  dimanche comme **lien dur** vers la quotidienne : aucun espace supplémentaire)
- Format : `pg_dump --format=custom --compress=0` puis `gzip -9`. Restauration :
  `gunzip -c fichier.dump.gz | pg_restore …`.
- Une exécution le même jour **remplace** la quotidienne du jour (pas de
  doublons).

Un dump contient des hachages de mots de passe, des adresses e-mail et des
variables d'environnement chiffrées : il ne doit jamais être copié dans le
dépôt ni rendu lisible par d'autres utilisateurs.

## 3. Rétention

| Type | Conservées | Purge |
|---|---|---|
| Quotidiennes | 7 | les plus anciennes au-delà de 7, tri par nom (dates ISO) |
| Hebdomadaires | 4 | idem, au-delà de 4 |

La purge ne considère **que** les fichiers commençant par `eflex-db-daily-` ou
`eflex-db-weekly-`. Tout autre fichier du dossier (sauvegardes manuelles,
archives d'incident, `.env`…) est laissé intact. Les paramètres
`EFLEX_DAILY_KEEP` / `EFLEX_WEEKLY_KEEP` permettent d'ajuster sans modifier le
script.

Le tri se fait sur le nom (date ISO), pas sur la date de modification : ne
renommez pas les archives si vous voulez qu'elles soient purgées normalement.

## 4. RPO / RTO

| Scénario | Perte de données maximale (RPO) | Temps de reprise visé (RTO) |
|---|---|---|
| Perte du conteneur / corruption logique | ≤ 24 h (dernière quotidienne) | 15–30 min |
| Perte du VPS entier | ≤ 24 h **si** une copie hors-site existe | dépend de la reconstruction du VPS |
| Quotidiennes indisponibles (panne sur plusieurs jours) | ≤ 7 j (dernière hebdomadaire) | 15–30 min |

Mesure réelle du 2026-11-10 : base de 9,5 Mo, dump de 29 Ko, sauvegarde en
**≈ 1 s**, restauration complète + vérifications + suppression en **≈ 3 s**.
Le RTO est donc dominé par l'arrêt/redémarrage du portail et la bascule, pas
par la restauration.

**Limites importantes**

- Pas d'archivage WAL : **pas de PITR** (restauration à la seconde). Le RPO est
  la dernière sauvegarde.
- Les sauvegardes sont sur le **même disque** que la production. Un disque
  perdu perd aussi les sauvegardes : une copie hors-site reste nécessaire (§10).
- Le dump ne contient **pas** les rôles PostgreSQL globaux
  (`pg_dumpall --globals-only`) ni `.env.prod`. Sur un cluster neuf, recréer le
  rôle applicatif (`POSTGRES_USER`) avant de restaurer ; sans
  `ENV_ENCRYPTION_KEY`, les variables d'environnement des projets restent
  chiffrées et illisibles.

## 5. Installation des timers systemd

Les unités fournies supposent l'utilisateur `fantome`, le dépôt
`/home/fantome/eflex` et le dossier de sauvegarde par défaut. Adaptez
`User=`, `WorkingDirectory=` et `Environment=EFLEX_BACKUP_DIR=` sinon.

```bash
cd /home/fantome/eflex

sudo install -m 644 docs/operations/systemd/eflex-backup.service \
  docs/operations/systemd/eflex-restore-test.service \
  docs/operations/systemd/eflex-healthcheck.service /etc/systemd/system/
sudo install -m 644 docs/operations/systemd/eflex-backup.timer \
  docs/operations/systemd/eflex-restore-test.timer \
  docs/operations/systemd/eflex-healthcheck.timer /etc/systemd/system/

sudo systemctl daemon-reload
sudo systemctl enable --now eflex-backup.timer eflex-restore-test.timer eflex-healthcheck.timer
```

Vérifications :

```bash
systemctl list-timers 'eflex-*'          # prochaines exécutions
systemctl status eflex-backup.timer
sudo systemctl start eflex-backup.service        # premier lancement immédiat
sudo systemctl start eflex-restore-test.service
sudo systemctl start eflex-healthcheck.service
```

L'utilisateur systemd doit pouvoir parler à Docker (`docker ps` sans `sudo`).
Les unités sont en `Type=oneshot` : un code de sortie non nul apparaît dans
`systemctl status` et dans journald. `Persistent=true` sur la sauvegarde et le
test de restauration rattrape une exécution manquée après un arrêt de la
machine ; le healthcheck ne le fait pas (pas de rafale d'alertes au démarrage).

Les logs sont dans journald (identifiants `eflex-backup`,
`eflex-restore-test`, `eflex-healthcheck`) :

```bash
journalctl -u eflex-backup.service -n 50 --no-pager
journalctl -u eflex-restore-test.service --since "14 days ago" --no-pager
journalctl -u eflex-healthcheck.service --since today --no-pager
```

Le healthcheck sort en code 1 dès la moindre anomalie (HTTP, TLS < 21 jours,
certificat invalide, conteneur non healthy, PostgreSQL/Redis injoignable), ce
qui suffit à `systemctl --failed`. Pour un envoi actif, configurez
`ALERT_WEBHOOK_URL` et/ou `ALERT_EMAIL` + `RESEND_API_KEY` dans `.env.prod`
(§7). Sans ces variables, la surveillance reste passive (journald).

## 6. Test de restauration

### Automatique (hebdomadaire)

`restore-test.sh` :

1. prend la sauvegarde la plus récente (quotidienne ou hebdomadaire) ;
2. refuse toute base cible dont le nom ne contient pas `test` et toute cible
   égale à la base de production ;
3. crée `eflex_restore_test`, restaure avec `pg_restore --exit-on-error` ;
4. vérifie : 5 tables essentielles (`User`, `Project`, `Deployment`,
   `Organization`, `_prisma_migrations`), ≥ 20 tables, ≥ 1 migration,
   0 migration non terminée, comptage utilisateurs/projets comparé à la
   production (simple avertissement si écart : écriture après le dump) ;
5. supprime la base de test, **même en cas d'échec** (sauf `--keep`).

```bash
bash scripts/restore-test.sh
bash scripts/restore-test.sh --file /home/fantome/backups/eflex/eflex-db-weekly-2026-W45.dump.gz
bash scripts/restore-test.sh --keep     # diagnostic : laisse eflex_restore_test
```

La base de production `eflex` n'est jamais modifiée : seuls des `SELECT count(*)`
y sont exécutés. La suppression manuelle d'une base laissée avec `--keep` :

```bash
docker exec eflex-postgres psql -U eflex -d postgres \
  -c 'DROP DATABASE IF EXISTS "eflex_restore_test" WITH (FORCE);'
```

### Mensuel (bonnes pratiques)

Une fois par mois, en plus du test automatique :

1. vérifier que `systemctl list-timers 'eflex-*'` montre les trois timers ;
2. lire `journalctl -u eflex-restore-test.service --since "35 days ago"` :
   aucune exécution en échec ;
3. restaurer **une sauvegarde hebdomadaire ancienne** avec `--file` et
   `--keep`, compter les tables/utilisateurs à la main, puis supprimer la base ;
4. vérifier l'espace libre (`df -h /`) et la taille du dossier ;
5. tester une copie hors-site si elle existe (fichier lisible, `gzip -t`).

## 7. Alerting

Le healthcheck n'envoie une alerte **que** s'il y a au moins une anomalie.

| Canal | Variables | Remarque |
|---|---|---|
| Webhook JSON | `ALERT_WEBHOOK_URL` | corps `{"text": "…"}` : Slack, Mattermost, Rocket.Chat. Discord attend `content` : adapter ou passer par un relais. |
| E-mail | `RESEND_API_KEY` + `ALERT_EMAIL` | expéditeur `EMAIL_FROM` (domaine vérifié dans Resend) ; ignoré sans clé. |

Aucune valeur secrète n'est journalisée : l'URL du webhook n'apparaît jamais,
et la clé Resend est passée à `curl` via un fichier de configuration temporaire
en 600 (jamais dans `argv`). Les échecs d'envoi sont signalés par leur code HTTP
uniquement.

Limite : l'alerting est **sans état**. Une anomalie persistante déclenche une
alerte à chaque exécution (toutes les 15 min) ; aucun rappel de rétablissement
n'est envoyé. Pour éviter le bruit, faire acquitter l'incident côté canal
(thread/mute) ou augmenter la période du timer.

Pour être alerté d'un **échec de sauvegarde**, `systemctl --failed` et journald
sont le signal par défaut. Pour un envoi actif, créer une unité dédiée (non
fournie) et l'accrocher avec `OnFailure=` dans `eflex-backup.service` ; ne pas
pointer vers `eflex-healthcheck.service`, qui n'alerte que sur ses propres
anomalies.

## 8. Restauration manuelle (incident réel)

> **Destructif.** À faire hors heures de pointe, après avoir prévenu. Le
> portail doit être arrêté pour éviter toute écriture pendant la bascule.

1. **Constater et geler** : passer le portail en maintenance ou l'arrêter.
   ```bash
   docker stop eflex-portail
   ```
2. **Préserver l'état courant** (même corrompu, pour analyse) :
   ```bash
   EFLEX_BACKUP_DIR=/home/fantome/backups/eflex-incident bash scripts/backup-db.sh
   ```
   Si `pg_dump` échoue, copier le volume avant toute suppression :
   ```bash
   docker run --rm -v eflex_postgres_data:/data:ro -v /home/fantome/backups:/out \
     alpine tar czf /out/eflex-incident-volume.tar.gz -C /data .
   ```
3. **Choisir et valider la sauvegarde** :
   ```bash
   ls -lh /home/fantome/backups/eflex/
   gzip -t /home/fantome/backups/eflex/eflex-db-daily-AAAAAMMJJ.dump.gz
   ```
   Au moindre doute, la tester d'abord avec `restore-test.sh --file … --keep`.
4. **Restaurer** (la base de production est recréée) :
   ```bash
   DUMP=/home/fantome/backups/eflex/eflex-db-daily-AAAAAMMJJ.dump.gz
   docker exec eflex-postgres psql -U eflex -d postgres \
     -c 'DROP DATABASE IF EXISTS eflex WITH (FORCE);'
   docker exec eflex-postgres psql -U eflex -d postgres \
     -c 'CREATE DATABASE eflex;'
   gunzip -c "$DUMP" | docker exec -i eflex-postgres pg_restore \
     -U eflex -d eflex --no-owner --no-privileges --exit-on-error
   ```
   > Adaptez `-U`/`-d` si `POSTGRES_USER`/`POSTGRES_DB` diffèrent. La commande
   > ci-dessus est celle du déploiement actuel (`eflex`).
5. **Migrations** (no-op si le dump est à jour, sécurité si le schéma a évolué) :
   ```bash
   set -a; . ./config/domains.sh; set +a
   docker compose -f docker-compose.prod.yml --env-file .env.prod \
     --profile tools build migrate
   docker compose -f docker-compose.prod.yml --env-file .env.prod \
     --profile tools run --rm migrate
   ```
6. **Redémarrer et vérifier** :
   ```bash
   docker start eflex-portail        # ou bash deploy.sh si un rebuild est nécessaire
   bash scripts/healthcheck.sh
   docker exec eflex-postgres psql -U eflex -d eflex -Atc \
     'SELECT count(*) FROM "User"; SELECT count(*) FROM "Project";'
   ```
   Se connecter à `https://eflex.app`, vérifier un projet et un déploiement.
7. **Après incident** : consigner l'heure, la sauvegarde utilisée, la perte de
   données estimée, la cause ; décider d'une copie hors-site ou d'un archivage
   WAL si le RPO doit baisser.

## 9. En cas de corruption ou d'échec

**Symptômes** : erreurs Prisma au démarrage, `pg_isready` OK mais requêtes en
échec, `pg_dump` qui sort en erreur, données incohérentes, disque plein.

1. **Arrêter les écritures** (portail stoppé ou maintenance) avant toute
   manipulation.
2. **Ne pas supprimer** la base ni les fichiers de sauvegarde : conserver une
   copie de l'état dégradé (§8.2).
3. **Identifier la dernière sauvegarde saine** (du plus récent au plus ancien) :
   ```bash
   for f in $(ls -1t /home/fantome/backups/eflex/eflex-db-*.dump.gz); do
     echo "== $f"
     bash scripts/restore-test.sh --file "$f" && break
   done
   ```
   S'arrêter à la première réussite, puis restaurer cette sauvegarde.
4. **Restaurer** cette sauvegarde (§8.4) et accepter la perte de données
   correspondant au RPO. Si le dump le plus récent est corrompu, remonter d'une
   quotidienne, puis d'une hebdomadaire.
5. **Si tous les dumps locaux sont inutilisables** : restaurer la copie
   hors-site, ou reconstruire depuis les dépôts Git et les variables d'environnement
   (dernier recours, perte des comptes et des déploiements).
6. **Si l'échec vient de la sauvegarde** (pas de la base) : vérifier
   `journalctl -u eflex-backup.service`, l'espace disque, les permissions du
   dossier, l'état de `eflex-postgres`, puis relancer à la main. Corriger la
   cause avant de considérer la protection rétablie.

## 10. Copie hors-site (recommandée, non automatisée)

Le dossier de sauvegarde est sur le même disque que la production. Pour couvrir
la perte du VPS, synchroniser les archives vers un autre hôte (NAS, autre VPS,
stockage objet compatible S3) — hors périmètre de ces scripts, car il dépend de
la destination :

```bash
# Exemple rsync (clé SSH sans passphrase dédiée, destination déjà chiffrée) :
rsync -a --delete /home/fantome/backups/eflex/ backup@autre-hote:/srv/eflex-backups/
```

À planifier **après** la sauvegarde (par exemple un timer à 04:15) et à
surveiller : une copie hors-site non testée n'est pas une sauvegarde. Vérifier
périodiquement `gzip -t` et un `restore-test.sh --file` sur la copie distante.

## 11. Sécurité

- `.env.prod` n'est **pas** inclus dans le dump : conserver
  `ENV_ENCRYPTION_KEY` (et les autres secrets) dans un coffre séparé. Sans elle,
  les variables d'environnement des projets restaurées restent chiffrées.
- Les archives sont en 600, le dossier en 700. Ne pas les copier dans le dépôt
  (`.gitignore` couvre déjà les artefacts locaux, pas `/home/fantome/backups`).
- Les scripts n'affichent jamais de mot de passe : `pg_dump`/`pg_restore`
  passent par la socket locale du conteneur (trust), sans `PGPASSWORD`.
- Pour un stockage hors-site, chiffrer au repos (disque chiffré, `age`/`gpg`,
  ou bucket privé avec chiffrement côté serveur).

## 12. Dépannage rapide

| Symptôme | Cause probable | Action |
|---|---|---|
| `conteneur PostgreSQL introuvable ou arrêté` | `eflex-postgres` arrêté | `docker start eflex-postgres`, puis relancer |
| `espace disque insuffisant` | disque plein (> 100 Mo requis) | purger Docker (`docker system df`, `docker builder prune`), libérer de la place, relancer |
| `pg_dump a échoué` | mot de passe/rôle, base absente, verrou | `journalctl -u eflex-backup.service`, `docker logs eflex-postgres` |
| `sauvegarde trop petite` | dump partiel, mauvaise base | vérifier `EFLEX_PG_DB`, relancer ; ne pas purger l'ancienne |
| TLS d'un domaine de projet en échec | domaine supprimé, DNS non configuré, app arrêtée | retirer le domaine en base ou `EFLEX_HEALTHCHECK_SKIP_PROJECT_DOMAINS=1` pour ne contrôler que l'apex |
| TLS apex en échec | renouvellement Traefik en cours | revérifier 5 min plus tard ; `docker logs traefik` |
| Alerte webhook `HTTP 000` | destination injoignable / DNS | tester `curl -X POST` manuellement vers la destination (sans journaliser l'URL) |
| Alerte e-mail ignorée | `RESEND_API_KEY` absente | la définir dans `.env.prod` puis relancer le healthcheck |
