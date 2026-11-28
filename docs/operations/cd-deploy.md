# Déploiement continu (CD) — GitHub Actions → serveur

Ce document décrit l'installation du workflow `.github/workflows/deploy.yml`,
qui déploie automatiquement le portail EFLEX sur le serveur de production à
chaque `push` sur `main` (et via un bouton manuel `workflow_dispatch`).

## Principe

Le runner est **GitHub-hosté** (`ubuntu-latest`) : aucun runner auto-hébergé ne
tourne sur le VPS de prod. Le job se connecte en SSH à un **utilisateur dédié**
(`deploy`) et exécute `scripts/deploy-prod.sh` sur le serveur. Ce script a déjà
ses propres garde-fous (`git fetch`, refus si divergence, vérification de
`/api/health`), on s'appuie dessus.

Pourquoi pas un runner sur le serveur de prod : voir `Layer 06 — Build Plane`
(« le worker n'a pas accès libre au Docker socket des serveurs de production »)
et le risque d'exécution de code arbitraire sur les workflows `pull_request`.

## État actuel (déjà en place)

Le serveur de production (`eflex.app`, `169.58.240.214`) est **déjà configuré** :

- utilisateur `deploy` créé (groupe `docker` + `eflex`) ;
- clé SSH dédiée `github-actions-deploy` installée en `authorized_keys` avec
  commande forcée `cd /home/lesaint/eflex && bash scripts/deploy-prod.sh` ;
- checkout partagé en groupe `eflex` (`/home/lesaint/eflex`, `.env.prod` en 640) ;
- secrets GitHub `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_USER`,
  `DEPLOY_HOST_KEY` et variable `DEPLOY_PATH` renseignés.

Les sections suivantes documentent la procédure pour reproduire cette
installation sur un autre serveur (ou après recréation).

## Prérequis

- Accès SSH (root ou sudo) au serveur de production.
- Le dépôt `digitaleflex/eflex.app` est déjà cloné sur le serveur (chemin
  `/home/lesaint/eflex` sur le serveur actuel ; ajuster `DEPLOY_PATH` sinon).
- Droits `maintain` sur le dépôt GitHub pour ajouter des secrets.

## Étape 1 — Utilisateur dédié et accès Docker

Sur le serveur :

```bash
# Utilisateur dédié, sans shell interactif libre (on n'autorise que la commande)
sudo useradd --create-home --shell /bin/bash deploy

# Accès au groupe docker (nécessaire à deploy.sh)
sudo usermod -aG docker deploy
```

## Étape 2 — Partage du checkout et de `.env.prod`

`deploy-prod.sh` doit pouvoir `git fetch` et lire `.env.prod` (qui contient les
secrets). On partage via un groupe commun :

```bash
sudo groupadd --force eflex
sudo usermod -aG eflex lesaint       # l'utilisateur propriétaire actuel
sudo usermod -aG eflex deploy

# Checkout partagé (git créera des fichiers accessibles au groupe)
sudo -u lesaint git -C /home/lesaint/eflex config core.sharedRepository group
sudo chgrp -R eflex /home/lesaint/eflex
sudo chmod -R g+rwX /home/lesaint/eflex

# .env.prod lisible par le groupe, jamais par les autres
sudo chgrp eflex /home/lesaint/eflex/.env.prod
sudo chmod 640 /home/lesaint/eflex/.env.prod

# Traversée du répertoire personnel (sinon `deploy` ne peut pas accéder au checkout)
sudo chgrp eflex /home/lesaint
sudo chmod g+x /home/lesaint
```

> Si `git` signale « dubious ownership » sous l'utilisateur `deploy` :
> `sudo -u deploy git config --global --add safe.directory /home/lesaint/eflex`.

## Étape 3 — Clé SSH du runner

Générer une paire de clés **dédiée** (sur ta machine de travail, pas sur le
serveur) :

```bash
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/eflex_cd -N ""
cat ~/.ssh/eflex_cd.pub
```

Ajouter la clé **publique** aux clés autorisées de l'utilisateur `deploy`, en la
restreignant à la commande de déploiement (le plus sûr) :

```bash
sudo -u deploy mkdir -p ~deploy/.ssh && chmod 700 ~deploy/.ssh
# Dans ~deploy/.ssh/authorized_keys (chmod 600), une seule ligne :
# command="cd /home/lesaint/eflex && bash scripts/deploy-prod.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... eflex_cd
```

> La commande forcée impose le chemin et l'ordre d'exécution : le job n'envoie
> aucune commande, le serveur exécute la sienne. C'est le mode le plus sûr
> (une clé volée ne peut que déployer, pas ouvrir un shell). Si tu as besoin de
> passer des arguments (ex. `--expect`), supprime le préfixe `command="…"` et
> laisse `deploy` exécuter la commande envoyée par le job — compromis : `deploy`
> garde un shell, limité par le groupe `eflex` et l'absence de privilèges root.

## Étape 4 — Secrets GitHub

Dans le dépôt, **Settings → Secrets and variables → Actions → New repository
secret** :

| Secret | Contenu |
| --- | --- |
| `DEPLOY_SSH_KEY` | contenu complet de `~/.ssh/eflex_cd` (la clé **privée**, avec ses retours à la ligne) |
| `DEPLOY_HOST` | IP ou hostname du serveur (ex. `eflex.app` ou l'IP) |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_HOST_KEY` | *(optionnel, recommandé)* clé d'hôte SSH : `ssh-keyscan -t ed25519 HOST` |

**Variable** (Settings → Secrets and variables → Actions → Variables) :

| Variable | Contenu |
| --- | --- |
| `DEPLOY_PATH` | chemin du checkout sur le serveur (défaut `/home/lesaint/eflex`) |

Pour obtenir `DEPLOY_HOST_KEY` :

```bash
ssh-keyscan -t ed25519 VOTRE_HOST
```

## Étape 5 — Vérification

1. Pousser un commit sur `main`, ou lancer manuellement depuis l'onglet
   **Actions → Déploiement production → Run workflow**.
2. Suivre le job : il affiche le commit ciblé, se connecte en SSH et affiche la
   sortie de `deploy-prod.sh` (migration, build, vérification `/api/health`).
3. En cas d'échec, le job est rouge et `deploy-prod.sh` affiche la commande de
   retour arrière (commit précédent + `bash deploy.sh`).

## Garde-fous et limites

- **Un seul déploiement à la fois** : `concurrency` bloque les déploiements
  concurrents, et `deploy-prod.sh` refuse un état divergent.
- **Pas de retour arrière automatique** : si le site ne répond pas, le job est
  rouge ; revenir en arrière à la main (`git checkout <sha> && bash deploy.sh`),
  ou suivre la commande affichée dans le journal.
- Le workflow déploie **tout** push sur `main`. Pour exiger que la CI passe
  avant le déploiement, protéger `main` (Settings → Branches → required checks :
  `Tests, schémas et typecheck`, `Go`, etc.) et n'autoriser la fusion que via PR.
- Si le repo est **public**, la clé SSH n'est jamais exposée (uniquement un
  secret côté serveur) ; aucun fork ne peut la récupérer.

## Pourquoi pas un runner auto-hébergé (rappel)

Un runner sur le serveur de prod exécuterait du code arbitraire sur la machine
qui détient `.env.prod`, la base PostgreSQL et le socket Docker. Si le besoin
est d'**accélérer la CI** (tests, `next build`), l'installer sur une **VM
séparée**, jamais sur le prod. Le présent workflow couvre uniquement le
déploiement, qui est le seul chaînon encore manuel.
