# Coolify : tout ce que son API permet, et ce qu'E-FLEX en fait

> Référence : spécification OpenAPI de **Coolify v4.7.5** (dernière version publiée au
> 2026-11-16, identique à la branche de développement `v4.x` ce jour-là) :
> **330 opérations**. Fichier source :
> `https://raw.githubusercontent.com/coollabsio/coolify/v4.7.5/openapi.json`.
> Comparé au client E-FLEX `portail/src/lib/coolify.ts` (et `lib/status.ts`,
> `app/admin/infrastructure/collect.ts`).
>
> **À vérifier avant de s'appuyer sur une ligne** : la version réellement installée
> (`GET /version`). Une version plus ancienne peut ne pas avoir une route récente.
> Coolify évolue vite : refaire cet inventaire à chaque mise à jour majeure
> (§7).

Légende des colonnes « E-FLEX » :
**✅ utilisé** · **🟡 partiel** · **⬜ pas encore** · **⛔ à ne pas exposer**.
« Client » = console des développeurs et agences. « Admin » = pages `/admin`
réservées à l'exploitant.

## 1. Ce qu'E-FLEX utilise déjà (≈ 35 appels)

| Domaine | Routes Coolify | Où dans E-FLEX |
|---|---|---|
| Cible | `GET /servers`, `GET/POST /projects`, `GET /projects/{uuid}/environments` | découverte du serveur, projet `Eflex`, environnement `production` |
| Applications | `POST /applications/public`, `POST /applications/private-deploy-key`, `PATCH`, `GET`, `DELETE /applications/{uuid}`, `GET /applications` | création, labels Traefik, domaines, suppression |
| Déploiement | `POST /deploy`, `GET /deployments/{uuid}`, `POST /deployments/{uuid}/cancel`, `POST /applications/{uuid}/rollback` | worker, annulation, retour arrière |
| Exécution | `POST /applications/{uuid}/start\|stop\|restart`, `GET /applications/{uuid}/logs` | Disponibilité, onglet Logs |
| Variables, volumes | `POST /applications/{uuid}/envs`, `/storages` | injection des variables, volumes persistants |
| Bases | `POST /databases/postgresql\|redis`, `GET/DELETE /databases/{uuid}`, `start/stop/restart` | bases managées |
| Sauvegardes (PR #165) | `GET/POST /databases/{uuid}/backups`, `PATCH …/backups/{id}` | panneau Sauvegardes |
| Clés SSH | `POST/DELETE /security/keys` | dépôts privés (clé de déploiement) |

**Anomalie trouvée :** `getApplicationMetrics` essaie `/applications/{uuid}/metrics`,
`/stats` et `/resources`. **Aucune de ces routes n'existe** dans l'API 4.7.5 : les
métriques CPU/RAM restent donc « indisponibles ». Les métriques de Coolify
viennent de son agent **Sentinel**, dont l'API ne permet que de lire et modifier les
réglages, pas les mesures. Il faudra une autre source (§5, Exploitation).

## 2. Les possibilités à plus forte valeur, pas encore exploitées

Classées par intérêt pour vos clients et pour votre temps.

| Possibilité | Routes | Ce que ça apporte | Exposer où |
|---|---|---|---|
| **Restauration d'une base par l'API** | `POST /databases/{uuid}/imports` (source `upload`, `s3` ou `server`), `POST …/imports/uploads`, `GET …/imports/{activity_id}` | Bouton « Restaurer cette sauvegarde » et test de restauration automatique. **Corrige la PR #165**, qui dit que la restauration n'est pas automatisable. | Client (avec confirmation forte) + Admin |
| **Sauvegarde des volumes** (fichiers téléversés) | `PUT/DELETE /applications/{uuid}/storages/{storage_uuid}/backups`, `POST …/backups/run` (idem bases et services) | Sauvegarde des images, PDF, uploads des sites clients, pas seulement des bases | Client |
| **Serveur de build et registre** | champs `use_build_server`, `docker_registry_image_name`, `docker_registry_image_tag` de `PATCH /applications/{uuid}` ; `GET/POST/DELETE /servers/{uuid}/registries` | Le chantier « séparer les builds » se fait par l'API, sans bricolage | Admin |
| **Limites de ressources** | champs `limits_memory`, `limits_cpus`, `limits_memory_swap`… de `PATCH /applications/{uuid}` | Un client ne peut plus faire tomber les autres ; base de la facturation par taille | Admin (taille choisie par le plan du client) |
| **Contrôle de santé** | champs `health_check_*` | Coolify ne bascule sur la nouvelle version que si elle répond : moins de pannes au déploiement | Client (chemin de santé) |
| **Applications en un clic (354 modèles)** | `POST /services` avec `type` : `wordpress-with-mariadb`, `ghost`, `strapi`, `directus`, `n8n`, `umami`, `uptime-kuma`, `metabase`, `supabase`… | **WordPress en un clic**, le besoin probable des agences ouest-africaines | Client (liste choisie, pas les 354) |
| **Prévisualisation des pull requests (MVP #185)** | `GET/POST/PATCH/DELETE /applications/{uuid}/previews`, `is_preview_deployments_enabled` | Une URL par pull request (GitHub, opt-in projet, PR du même dépôt hors fork, bornes/fermeture). Socle portail : client API, webhook `pull_request`, suivi en base, onglet projet. Le routage/TLS des conteneurs de preview dépend de la configuration proxy/réseau de l’instance Coolify (voir limites #185). | Client (**🟡 MVP**) |
| **Images de retour arrière** | `GET /applications/{uuid}/rollback-images` | Liste des versions vraiment disponibles avant de proposer un retour arrière | Client |
| **Historique des déploiements Coolify** | `GET /deployments/applications/{uuid}`, `GET /deployments` | Réconciliation : retrouver un déploiement lancé hors d'E-FLEX | Admin |
| **Tâches planifiées (cron)** | `GET/POST/PATCH/DELETE /applications/{uuid}/scheduled-tasks`, `…/executions`, `…/execute` | `php artisan schedule:run`, nettoyages, envois d'e-mails : très demandé par Laravel et Symfony | Client |
| **Analyse de failles des images** | `GET /vulnerabilities`, `GET /applications/{uuid}/vulnerabilities`, `PATCH /servers/{uuid}/image-scanning` (Syft + Grype) | Votre « veille de sécurité » devient visible et automatique | Client (résumé) + Admin (détail) |
| **Autres moteurs de bases** | `POST /databases/mysql\|mariadb\|mongodb\|clickhouse\|dragonfly\|keydb\|sqlite` | MySQL/MariaDB pour WordPress et Laravel, MongoDB pour Node | Client |
| **DNS automatique** | `GET /dns/zones`, `POST/DELETE /applications/{uuid}/dns`, jetons `security/integration-tokens` (Cloudflare) | Création automatique des enregistrements DNS quand le domaine est chez Cloudflare | Client (option) |
| **Notifications Coolify** | `PATCH /notifications/webhook\|email\|telegram\|discord…` | Coolify prévient E-FLEX (webhook) d'un conteneur arrêté, d'une sauvegarde ratée, d'un disque plein | Admin (branché vers E-FLEX) |
| **Journal d'audit Coolify** | `GET /audit-events` | Voir ce qui a été fait directement dans Coolify, hors E-FLEX | Admin |

## 3. Inventaire complet, domaine par domaine

### Applications (43 routes)
- **Créer** : depuis un dépôt public, une GitHub App, une app Gitea, une clé de déploiement,
  un Dockerfile sans dépôt, ou une image Docker (`/applications/dockerimage`). ✅ public et
  clé de déploiement · ⬜ les autres. L'image Docker sans dépôt servira au **build hors
  Coolify** (GitHub Actions) et aux clients qui livrent une image.
- **Lire, modifier, supprimer** ✅. `PATCH` accepte **109 champs**, dont : build pack, commandes,
  dossier de base, `watch_paths` (ne redéployer que si certains dossiers changent),
  `is_auto_deploy_enabled`, santé, limites, labels, options `docker run`, cache de build,
  secrets de build, authentification HTTP basique, `custom_internal_name`.
- **Journaux** ✅ · **Variables** ✅ (création) ⬜ (`PATCH …/envs/bulk` en lot, liste, suppression).
- **Démarrer, arrêter, redémarrer** ✅ · **Déplacer** vers un autre projet, **migrer** vers un
  autre serveur, **cloner** ⬜.
- **Volumes** ✅ (création) · **sauvegarde des volumes** ⬜.
- **Étiquettes** (tags) ⬜ · **Destinations** (réseaux Docker) ⬜.
- **Prévisualisations** de pull request 🟡 (MVP #185 : client, webhook GitHub, suivi/UI, opt-in et garde-fous ; routage/TLS selon instance) · **retour arrière** ✅ · **images disponibles** ⬜.

### Bases de données (44 routes)
- **Moteurs** : PostgreSQL ✅, Redis/Valkey ✅, MySQL, MariaDB, MongoDB, ClickHouse,
  DragonFly, KeyDB, SQLite ⬜.
- **Cycle de vie** ✅ (créer, lire, démarrer, arrêter, supprimer) · `PATCH` (dont l'accès
  public à la base et ses limites) ⬜ · journaux ⬜ · cloner, déplacer, migrer ⬜.
- **Sauvegardes planifiées** ✅ (PR #165) · supprimer une planification ou une exécution ⬜.
- **Restauration** (`imports`) ⬜, voir §2.
- Variables, volumes, sauvegarde des volumes, étiquettes ⬜.

### Services « en un clic » (27 + 8 + 10 routes)
Un service est un `docker-compose` géré par Coolify, créé depuis l'un des **354 modèles**
(`templates/service-templates.json`) ou depuis un compose fourni (`docker_compose_raw`).
Cycle de vie, variables, volumes, sauvegardes des volumes, journaux, et pilotage
**conteneur par conteneur** (`/services/{uuid}/applications/…`, `/services/{uuid}/databases/…`,
y compris la restauration de la base du service). ⬜ entièrement.

### Déploiements (5)
`POST /deploy` ✅, détail ✅, annulation ✅, liste globale et par application ⬜.

### Serveurs (36) et infrastructure
- Créer, valider, supprimer, lister ressources et domaines d'un serveur ⬜ (E-FLEX ne fait
  que lister). **Admin uniquement.**
- **Proxy** (Traefik/Caddy) : lire, modifier, redémarrer, configuration ⬜.
- **Nettoyage Docker** : réglages, exécution, historique ⬜. Utile pour éviter les disques
  pleins par images accumulées.
- **Registres** : connexion d'un serveur à un registre d'images ⬜ (serveur de build).
- **Analyse d'images** (Syft/Grype) : activation, limites ⬜.
- **Sentinel** (agent de métriques) : réglages seulement ⬜.
- **Évacuation des journaux** (log drains) vers un service externe ⬜.
- **Tunnel Cloudflare** ⬜ · **migration d'un serveur vers une autre instance Coolify** ⬜.
- **Création de serveurs chez Hetzner, Vultr, DigitalOcean, Hostinger** (`/servers/hetzner`…),
  avec jetons fournisseurs (`/cloud-tokens`) et scripts de démarrage (`/cloud-init-scripts`) ⬜.
  Permettrait d'ajouter un serveur depuis l'admin E-FLEX.
- **Destinations** (réseaux Docker par serveur) ⬜.

### Sécurité, sources Git, secrets
- Clés SSH ✅ · GitHub Apps (lister les dépôts et branches d'une App déclarée dans
  Coolify), GitLab Apps, Gitea Apps ⬜. E-FLEX a sa propre GitHub App ; GitLab passerait
  par ici.
- **Gestionnaires de secrets externes** (`/{type}/{uuid}/secret-manager`) ⬜.
- **Jetons d'intégration** (Cloudflare DNS) ⬜.

### Organisation et réglages
- Équipes, membres (lecture), projets et environnements, **variables partagées** (équipe,
  projet, environnement, serveur), étiquettes, réglages e-mail de l'instance,
  notifications (e-mail, Discord, Slack, Telegram, Pushover, webhook), journal d'audit.
- `GET /version` et `GET /health` : à afficher dans `/admin/infrastructure`.
- `POST /disable` (coupe l'API) et `POST /mcp/enable|disable` : **⛔ jamais depuis E-FLEX.**

## 4. Ce qu'il faut exposer, et à qui

| Niveau | Fonctions |
|---|---|
| **Console client** | Déployer, redéployer, annuler, retour arrière (avec la liste des images disponibles) ; journaux ; variables ; domaines ; santé ; bases (PostgreSQL, MySQL/MariaDB, Redis, MongoDB) avec sauvegardes **et restauration** ; sauvegarde des volumes ; tâches planifiées ; prévisualisations de pull request (**MVP GitHub, opt-in, borné**) ; modèles en un clic sélectionnés (WordPress, Ghost, Strapi, Directus, n8n, Umami…) ; résumé des failles de sécurité. |
| **Admin E-FLEX** | Serveurs (santé, ressources, nettoyage Docker, proxy, registres, analyse d'images) ; serveur de build ; limites par plan ; journal d'audit Coolify ; webhook de notifications Coolify vers E-FLEX ; version de Coolify ; ajout de serveurs chez un fournisseur ; réconciliation des déploiements. |
| **⛔ Jamais exposé** | `POST /disable`, MCP, création de jetons Coolify, réglages e-mail de l'instance, accès public direct aux bases sans contrôle, `custom_docker_run_options` et labels bruts (permettraient à un client de s'échapper de son conteneur ou de détourner le trafic d'un autre). |

**Règle de sécurité** : E-FLEX ne transmet jamais un champ brut de Coolify choisi par le
client. Chaque option exposée passe par une liste blanche validée côté serveur (comme
aujourd'hui pour les labels Traefik).

## 5. Ce que Coolify ne fournit pas (à construire ou à brancher)

| Besoin | Pourquoi Coolify ne suffit pas | Piste |
|---|---|---|
| Métriques CPU, RAM, disque par application | Sentinel les collecte, mais l'API ne les renvoie pas | Beszel (modèle en un clic disponible) ou l'agent Go du dépôt (`services/agent`) |
| Surveillance de disponibilité des sites | Le contrôle de santé de Coolify agit au déploiement, il n'alerte pas sur une panne en cours | Uptime Kuma (modèle en un clic) ou une sonde E-FLEX |
| Statistiques de visite | Hors du périmètre de Coolify | Déjà dans E-FLEX (mesure d'audience) |
| Multi-organisation pour vos clients | Coolify a des « équipes », pas de facturation ni de rôles fins | E-FLEX (organisations, rôles, facturation) |
| Facturation, tickets, rapports clients | Hors périmètre | E-FLEX |

## 6. Priorités recommandées

1. **Restauration par l'API** (`imports`) : termine la promesse « sauvegardes vérifiées ».
2. **Serveur de build et registre** + **limites de ressources** : stabilité de vos serveurs.
3. **Sauvegarde des volumes** : protège les fichiers téléversés, pas seulement les bases.
4. **Tâches planifiées** et **MySQL/MariaDB** : débloquent Laravel, Symfony, WordPress.
5. **WordPress en un clic** et quelques modèles choisis.
6. **Notifications Coolify → E-FLEX** et **analyse de failles** : exploitation et veille.
7. **Prévisualisations de pull request** : socle MVP livré (#185, GitHub, opt-in et garde-fous) ; fiabiliser le routage/TLS des previews selon l’instance Coolify, étendre aux autres fournisseurs Git et affiner la gestion multi-app.

## 7. Garder cet inventaire à jour

```bash
curl -sSL https://raw.githubusercontent.com/coollabsio/coolify/<version>/openapi.json -o coolify-openapi.json
```

Comparer le nombre d'opérations et les routes ajoutées ou retirées avec cette page, et
vérifier la version installée avec `GET /version` avant toute mise à jour de Coolify.
