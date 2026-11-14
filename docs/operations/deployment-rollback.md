# Déploiement du portail et retour à une version précédente

Ce document décrit comment le portail EFLEX est déployé en production et comment **revenir à une version antérieure** si la dernière version n’est pas satisfaisante. Il complète [`deployments.md`](deployments.md) (retour arrière des applications déployées par la plateforme) et [`runbook.md`](runbook.md).

> Le portail n’a pas de mécanisme de « rollback en un clic » façon Vercel (déploiements immuables avec bascule instantanée). Le retour arrière se fait en **redéployant une révision Git connue** (commit ou tag).

## Fonctionnement actuel du déploiement

- Script : `bash deploy.sh` (à la racine du dépôt).
- Compose : `docker-compose.prod.yml` avec `--env-file .env.prod`.
- Source des domaines/URLs : `config/domains.sh` (sourcé par `deploy.sh`).
- Étapes principales : démarrage PostgreSQL/Redis, rebuild + exécution du conteneur de migration Prisma (`prisma migrate deploy`), build de l’image portail, `up -d --build`, attente de `${PORTAL_URL}/api/health`, affichage de l’état.
- L’image portail est construite à partir du **contenu du dépôt présent sur le serveur** (contexte racine, `portail/Dockerfile`).

## Préparer les retours arrière (recommandé)

1. **Taguer chaque version mise en production** sur le commit déployé et pousser le tag :
   ```bash
   git tag -a vYYYY.MM.NN -m "Production: <résumé>"
   git push origin vYYYY.MM.NN
   ```
   Les tags permettent d’identifier rapidement un état stable connu.
2. **Noter le commit déployé** (ex. sortie de `git rev-parse --short HEAD` après déploiement) dans le suivi d’exploitation/changelog.
3. **Sauvegarder la base avant un déploiement comportant des migrations** ou des changements de schéma/données sensibles. Vérifier la procédure de restauration (voir [`backups.md`](backups.md)).
4. **Vérifier la compatibilité** : code cible ↔ schéma de base ↔ variables d’environnement ↔ intégrations (Coolify, GitHub App, paiements, e-mails, etc.).

## Revenir à une version précédente

### Procédure standard (serveur de production)

Depuis le répertoire du dépôt (ex. `/home/fantome/eflex`) :

```bash
# 1) Récupérer les références (tags/commits)
git fetch origin --tags

# 2) Se placer sur la version cible (tag ou commit)
git checkout <tag|commit>

# 3) Redéployer
bash deploy.sh
```

Après déploiement, vérifier :

```bash
set -a && . ./config/domains.sh && set +a
curl -f "${PORTAL_URL}/api/health"
docker compose -f docker-compose.prod.yml --env-file .env.prod ps
docker compose -f docker-compose.prod.yml --env-file .env.prod logs --tail=50 portail
```

Tester les parcours critiques (accueil, connexion, tableau de bord, déploiements) et, si un cache navigateur/CDN existe, purger ou valider en navigation privée.

### Revenir sur la dernière version (`main`)

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
bash deploy.sh
```

### Rejouer exactement un état (sans avancer une branche)

`git checkout <tag|commit>` place le dépôt en « detached HEAD », ce qui convient pour un déploiement ponctuel d’une révision précise. Éviter de modifier/committer directement dans cet état sur le serveur de production.

## Points d’attention

- **Migrations Prisma** : `deploy.sh` applique `prisma migrate deploy` (migrations **en avant**). Revenir à un ancien code **n’annule pas** les migrations déjà appliquées. Si une migration a modifié le schéma de façon incompatible, l’ancienne version peut échouer ; prévoir sauvegarde/restauration de la base et valider la compatibilité avant rollback.
- **Variables d’environnement et secrets** : `.env.prod`, clés de chiffrement (`ENV_ENCRYPTION_KEY`), intégrations et domaines doivent être compatibles avec la version cible.
- **Données et état** : Redis, volumes, files de jobs, formats de données et changements d’API peuvent affecter un retour arrière.
- **Images Docker** : le flux standard reconstruit depuis le code. Une ancienne image locale peut exister si elle n’a pas été nettoyée, mais le moyen le plus sûr et reproductible est de **rebuild depuis le tag/commit cible**.
- **Disponibilité** : le redéploiement recrée/redémarre le portail (interruption brève possible pendant le redémarrage ; Traefik/healthcheck réduisent l’impact).
- **Cache** : les pages publiques ont des en-têtes de cache ; après retour arrière, purger le cache CDN/navigateur si nécessaire.

## Comparaison avec Vercel (référence)

| Aspect | Vercel (typique) | EFLEX (actuel) |
| --- | --- | --- |
| Artefact | Build immuable par déploiement | Image reconstruite depuis une révision Git |
| Bascule | Promotion/rollback quasi instantané vers une build précédente | Redéploiement (rebuild + restart) de la révision cible |
| Historique | Liste de déploiements dans l’interface | Git (commits/tags/releases) + journaux/CI |
| Base de données | Gérée séparément selon l’app | Migrations Prisma en avant à gérer explicitement |

Pour se rapprocher d’un modèle Vercel, il faudrait versionner et publier les images (registry), pointer le compose vers une image taguée, et définir une stratégie de compatibilité/rollback des migrations de base de données.
