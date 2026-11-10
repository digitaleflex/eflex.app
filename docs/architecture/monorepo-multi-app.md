# Monorepo multi-applications : 1 projet → N applications (D2, #6)

État au 10 novembre 2026. Décision d'architecture et plan d'implémentation pour
le lot **D2** annoncé dans `docs/architecture/multi-service-deployment.md`
(§ 5) : déployer **plusieurs applications** d'un même dépôt, chacune avec son
build, son port et son domaine, sans compose généré et sans nouvelle console.

**Méthode.** Étude en lecture seule. Les constats viennent du dépôt
(`portail/prisma/schema.prisma`, `portail/src/worker.ts`, `portail/src/app/api/**`,
`portail/src/app/dashboard/**`, `portail/src/lib/**`,
`packages/detector/src/**`). Aucun fichier applicatif n'a été modifié, aucune
migration lancée, aucune application créée ou déployée, aucun secret reproduit.

> **Statut au 10 novembre 2026 — lot A livré.** `detectApplications()` existe
> dans `packages/detector/src/applications.ts` (profondeur 3, noms stables,
> déduplication, ordre déterministe). `POST /api/projects/analyze` renvoie en
> plus un champ **additif** `apps` (même si un `root` a été choisi) et l'écran
> `/dashboard/new` affiche « N applications détectées » avec sélection de
> l'application. **Aucune écriture en base, aucun changement de schéma Prisma** :
> la création reste mono-application dans ce lot.


> ⚠️ `worker.ts`, `coolify.ts` et l'interface de déploiement viennent d'être
> réécrits par les lots D1 (#6, compose fourni par le dépôt) et retour arrière
> (#21). Les points d'insertion ci-dessous raisonnent en **fonctions**, pas en
> numéros de ligne, et devront être rebasés si un chantier touche encore ces
> fichiers.

## 1. Contexte

Aujourd'hui, un projet Eflex = **une** application :

- `Project.plan` contient **un** `BuildPlan` (détecteur) et `Project.port`,
  `Project.framework`, `Project.domain`, `Project.coolifyAppId` le décrivent ;
- le worker crée **une** Application Coolify, applique **un** port, **un jeu de
  labels Traefik**, **un** répertoire de travail, puis suit **un** build ;
- `Deployment` est rattaché au projet, sans notion d'application ;
- `EnvVar` et `ProjectDomain` sont rattachés au projet ;
- le détecteur, quand il trouve plusieurs applications candidates, ne renvoie
  **aucun plan** : il pose la question « Quelle application déployer ? » avec
  au plus deux alternatives (`DetectionResult.alternatives`), et
  `POST /api/projects` refuse tant que l'utilisateur n'a pas choisi un `root`.

Conséquence : un monorepo `apps/web` + `apps/api` + `apps/admin` se déploie en
**trois projets séparés**, créés à la main, sans lien entre eux (variables
dupliquées, domaines dispersés, quota consommé trois fois, aucun « redéployer
tout »).

Le besoin réel est donc une relation **1 projet → N applications**, pas un
fichier compose : chaque application a son propre build, son propre port, son
propre domaine (cf. `multi-service-deployment.md` § 3.2). D1 (compose fourni par
le dépôt) couvre le cas « plusieurs processus pour une même application » ;
D2 couvre « plusieurs applications dans un même dépôt ». Les deux ne se
remplacent pas.

**Ce que D2 ne doit pas faire.** Fabriquer un compose pour N applications :
Coolify recharge `docker_compose_raw` depuis le dépôt à chaque déploiement
(§ 2.2 du document D1) et `PATCH /applications/{uuid}` refuse ce champ. La seule
voie viable reste **N Applications Coolify**, chacune avec son `base_directory`,
ses commandes et son domaine.

## 2. Inventaire des couplages « une seule application »

Tout ce qui, dans le code actuel, suppose implicitement N = 1. La colonne
« D2 » indique la modification attendue.

### 2.1 Modèle de données

| Élément | Aujourd'hui | Suppose N = 1 parce que | D2 |
| --- | --- | --- | --- |
| `Project.plan` (`Json`) | un `BuildPlan` | un seul plan pilote le worker, les commandes et le port | devient le plan de l'**application principale** (miroir), puis supprimé en phase contract |
| `Project.framework` / `runtime` / `port` | valeurs dénormalisées | affichage liste + carte projet + `admin` | idem (dénormalisation de l'app principale, conservée pour l'affichage) |
| `Project.domain` | domaine public du projet | sert de domaine principal, de clé TLS, de contrôle `isReservedDomain` | conservé comme domaine de l'app principale |
| `Project.coolifyAppId` | une Application Coolify | worker, logs, runtime, suppression, réconciliation, garde de suppression de compte | déplacé sur `ProjectApp`, miroir transitoire |
| `Project.tlsValid/ExpiresAt/CheckedAt` | TLS du domaine principal | carte projet, santé | par application, miroir transitoire |
| `Deployment.projectId` | un déploiement = un build | machine à états, BullMQ (`jobId = deploymentId`), annulation, watchdog, logs SSE, rollback, admin | + `appId` (nullable) et + `groupId` |
| `EnvVar.projectId` | variables du projet | le worker pousse **toutes** les variables à l'unique application ; AAD `projectId:key` | `appId` nullable ; en v1 les variables projet sont diffusées à toutes les apps |
| `ProjectDomain.projectId` | alias DNS du projet | `hostname` unique global, labels Traefik du projet | `appId` nullable (domaine d'une application précise) |
| `ProjectDatabase.projectId` | une base PostgreSQL/Redis par projet | `DATABASE_URL`/`REDIS_URL` injectées dans l'unique app | inchangé (une base partagée par N apps est un cas normal) |
| `GitInstallation` / `GitPat` / deploy key | par projet | une deploy key par dépôt, réutilisée par toutes les apps | inchangé (la clé est au niveau projet) |

### 2.2 Worker et déploiement

| Endroit | Hypothèse | D2 |
| --- | --- | --- |
| `worker.ts` → `processDeployment` | un `Deployment` → une app | extractible en `deployProjectApp(project, app, deployment)` ; le worker reste **1 job = 1 app** (fan-out à l'enfilement, pas dans le worker) |
| `buildProjectArtifacts(plan, project.slug, domain)` | un slug, un domaine | par app : `buildProjectArtifacts(plan, `${slug}-${app.name}`, app.domain)` |
| `coolifyApplicationSettings(plan)` | un `root` | par app : `plan.root` = `app.root` |
| `deploymentKind(plan, artifacts)` | refus multi-services **par plan** | inchangé : chaque app a son propre plan (mono-service ou compose) |
| `createApplication` / `updateApplication` | `name`, `baseDirectory`, `domains`, labels | par app, avec `app.name` dans le nom Coolify (`<slug>-<app>`) |
| `ensureApplicationStorages` | volumes du plan | par app |
| `deployApplication` / `deployApplicationCommit` | un `appId` | par app |
| `getDeploymentLogs` / `getApplicationLogs` | un build, un conteneur | par app ; `service_name` reste réservé au compose |
| `waitForTls(host)` | domaines du projet | par app : les hôtes de chaque app |
| Verrou « un seul déploiement actif par projet » (`lib/project-deployments.ts`) | `activeProjectDeployment(projectId)` | par **app** ; un lot de N apps crée N `Deployment` dans une transaction et refuse si **une** app a déjà un déploiement actif |
| `lib/deployment-watchdog.ts` | expire par `Deployment` | inchangé (les N lignes expirent indépendamment) |
| `lib/deployment-cancel.ts` / route `cancel` | un build | inchangé par ligne ; annulation de groupe = annuler toutes les lignes du `groupId` |

### 2.3 Routes API (`portail/src/app/api/projects/**`)

| Route | Hypothèse | D2 |
| --- | --- | --- |
| `POST /api/projects/analyze` | renvoie un plan ou une question `app` | renvoie aussi la **liste complète** des applications détectées (nom, `root`, plan, confiance) |
| `POST /api/projects` | un `framework` + un `root` | accepte `apps: [{ root, framework }]` (1..N), re-analyse chaque app côté serveur, crée le projet + ses `ProjectApp` + un `Deployment` par app |
| `GET /api/projects` | `framework`, `domain`, `coolifyAppId` | + `apps: [{ id, name, domain, lastStatus }]` (sans `plan`) |
| `GET /api/projects/[id]` | un plan, un domaine, N déploiements | + `apps` complètes, `lastGroup` agrégé |
| `PATCH/DELETE /api/projects/[id]` | un `coolifyAppId` à supprimer | boucle sur les `apps` ; un échec Coolify annule la suppression locale (comportement actuel conservé) |
| `POST /api/projects/[id]/redeploy` | un déploiement | fan-out (toutes les apps) ou `?appId=` (une seule) |
| `GET /api/projects/[id]/deployments` | liste plate | + `appId`/`appName`, filtre `?appId=` |
| `.../deployments/[deploymentId]/logs`, `.../cancel`, `.../rollback` | déploiement | inchangés (chaque ligne porte déjà son app) |
| `GET /api/projects/[id]/logs` | `coolifyAppId` du projet | `?appId=` obligatoire si plusieurs apps, sinon app principale |
| `GET/POST /api/projects/[id]/runtime` | `coolifyAppId` du projet | `?appId=` ; sans `appId`, app principale |
| `GET/POST /api/projects/[id]/domains` | domaine principal + alias du projet | `appId` optionnel ; un domaine personnalisé appartient à une app |
| `POST /api/projects/[id]/env-vars` | clé unique par projet | `appId` optionnel (lot 4) |
| `GET/POST /api/projects/[id]/databases` | base du projet | inchangé |
| `POST /api/webhooks/github` | N projets par dépôt | **un** projet → fan-out de ses apps, `groupId` commun |

### 2.4 Interface (`portail/src/app/dashboard/**`, `components/**`)

| Écran | Hypothèse | D2 |
| --- | --- | --- |
| `/dashboard` (cartes projet) | une stack, un domaine, un statut | une carte par **projet**, avec `N apps` et un statut agrégé ; jamais N cartes par dépôt |
| `/dashboard/projects/[id]` | une « Production », un domaine, une stack | section « Applications » (nom, `root`, domaine, statut, lien), logs par app, redéployer tout / une app |
| `/dashboard/projects/[id]/settings` | un domaine, un jeu de variables | variables projet + onglet « Domaines par application » |
| `/dashboard/new` | question `app` avec au plus 2 options | tableau des apps détectées, cases à cocher, app principale, sous-domaines proposés |
| `components/project-domains.tsx`, `runtime-logs.tsx`, `project-runtime-controls.tsx`, `deployment-panel.tsx` | une app | sélecteur d'app (un seul app → comportement actuel, aucun changement visuel) |
| `admin/projects/**`, `admin/deployments/**`, `admin/infrastructure/collect.ts`, `lib/admin-projects.ts` (réconciliation) | 1 projet ↔ 1 `coolifyAppId` | 1 projet ↔ N `ProjectApp` ; la réconciliation compare l'ensemble des `app.coolifyAppId` |

### 2.5 Facturation, quotas, notifications, temps réel

| Endroit | Hypothèse | D2 |
| --- | --- | --- |
| `lib/billing.ts` → `assertProjectQuota` | compte `Project` | compte les **applications** (`ProjectApp`) ; vérifie N apps d'un coup à la création |
| `lib/plans.ts` → `projectLimit` | projets | même champ, sémantique « applications » ; documenté dans `docs/operations/billing.md` |
| `billingSummary.usage` | `projects`, `members` | + `apps` (et `projects` conservé) |
| `lib/deployment-events.ts` → `announceDeploymentStatus` | 1 déploiement = 1 notification | événement par app (payload + `appId`/`appName`) ; **une** notification par groupe (`dedupeKey: group:<groupId>`) |
| `lib/event-bus.ts` / `EventsProvider` / `LiveRefresh` | `projectId` | payload enrichi ; les filtres par `projectId` restent valides |
| Garde de suppression de compte (`lib/auth.ts`, `app/dashboard/settings`) | « un projet a un `coolifyAppId` » | « un projet a une app déployée » (`count apps where coolifyAppId != null`) |
| `lib/project-transfer.ts` | transfert d'un projet | inchangé (les apps suivent le projet, l'organisation est celle du projet) |

## 3. Options

Effort = développement + tests, hors validation staging.

| | Option | Ce que ça donne | Effort | Problèmes |
| --- | --- | --- | --- | --- |
| **L** | **D2-lite** : créer un `Project` par application, éventuellement liés par un `groupId` sur `Project` | aucun nouveau modèle lourd, réutilise tout | 1–2 j | **chaque app consomme un quota de projet** (un monorepo de 3 apps = 3 projets) ; variables dupliquées ; domaines dispersés ; webhook qui crée N projets ; métriques admin faussées ; aucune action « redéployer tout » ; `uniqueSlug` global → noms d'apps à rallonge |
| **F1** | **D2-full A** : `ProjectApp` + `Deployment` au niveau projet + table enfant `DeploymentApp` (statut/logs/build par app) | un seul « déploiement » visible, statut par app | 14–16 j | duplique la machine à états (7 états × 2 niveaux), le worker, l'annulation, le watchdog, les logs SSE, le rollback et l'admin ; casse les tests existants ; deux vérités sur « en cours » |
| **F2** | **D2-full B** : `ProjectApp` + **un `Deployment` par app** + `groupId` | réutilise intégralement la machine à états, BullMQ, l'annulation, le watchdog, les logs SSE, le rollback, l'admin ; le groupe est une vue agrégée calculée | **8–10 j** | « un déploiement à la fois » devient « par app » ; statut projet = agrégat à calculer (fonction pure testable) ; N builds concurrents à brasser |
| **C** | Garder un `Project` par app et améliorer l'UI (groupe visuel sans modèle) | cosmétique | 1 j | mêmes limites que L, plus une dette de modèle |

### 3.1 Pourquoi D2-lite est rejeté comme cible

- **Facturation** : `projectLimit` est le seul quota dur (`lib/plans.ts`). Un
  monorepo de 3 apps ferait passer un compte gratuit de 3 à 5 projets sur 5 avec
  un seul dépôt ; la promesse commerciale devient incohérente.
- **Variables et bases** : chaque `Project` a ses `EnvVar` chiffrées avec l'AAD
  `projectId:key` et ses `ProjectDatabase`. Rien ne se partage ; l'utilisateur
  ressaisit la même `DATABASE_URL` trois fois.
- **Webhook** : un `push` doit créer N projets, donc N slugs, N domaines, N
  verrous, et un échec partiel laisse des projets orphelins sans lien.
- **Ce n'est pas perdu pour autant** : c'est déjà ce qu'un utilisateur peut faire
  **manuellement** aujourd'hui (choisir un `root`, créer un projet, recommencer).
  D2-lite n'apporte donc aucune valeur produit : seulement un `groupId` sur
  `Project`. Il reste le **repli d'urgence** si D2-full doit être suspendu.

### 3.2 Pourquoi F2 plutôt que F1

`Deployment` est aujourd'hui l'unité **de build Coolify** : `jobId = deploymentId`,
`coolifyBuildId`, machine à états à 7 états, annulation, watchdog, flux SSE,
rollback, pages admin, notifications. Introduire un niveau `DeploymentApp`
obligerait à maintenir **deux** machines à états et à réécrire tous ces chemins,
sans bénéfice utilisateur : le besoin est « voir les N apps d'un déploiement »,
ce que calcule trivialement un `groupId` + une fonction d'agrégation.

F2 garde donc **un `Deployment` = une Application Coolify** et ajoute seulement :

- `Deployment.appId` (nullable, `null` = ancien déploiement mono-app) ;
- `Deployment.groupId` (nullable, commun aux N lignes d'un même lot).

## 4. Décision recommandée

**D2-full B (F2), livré derrière un drapeau `EFLEX_MULTI_APP`, en 6 lots de
1–2 jours, sans casser le chemin mono-application.**

Principes directeurs :

1. **Fan-out à l'enfilement, jamais dans le worker.** Le worker garde un contrat
   simple : `processDeployment(deploymentId)` traite **une** application. Les N
   lignes `Deployment` sont créées ensemble (même `groupId`) par
   `enqueueProjectDeployment`.
2. **Le `BuildPlan` ne change pas.** Chaque application porte son propre plan v1
   (racine, `workspace`, port, compose éventuel). `schema/v1.json` et
   `packages/detector/src/types.ts` restent intacts : D2 n'ajoute **aucun champ**
   au contrat de plan. Seule l'API de détection gagne une liste.
3. **Une application sans domaine est un cas normal.** Un worker interne, un
   service d'admin non exposé, une API privée : `ProjectApp.domain = null`,
   aucune route Traefik, aucun contrôle TLS. Le job se déploie et se vérifie
   comme les autres.
4. **Le dépôt n'est jamais modifié.** Pas de compose généré, pas de commit.
5. **Compatibilité descendante d'abord** : pendant les phases expand/dual,
   `Project.coolifyAppId`, `Project.plan`, `Project.domain` restent écrits en
   miroir de l'application principale. Le drapeau désactivé suffit à revenir au
   comportement actuel, sans migration inverse.

### 4.1 Détecteur : nouvelle API `detectApplications`

`discoverApps()` (`packages/detector/src/monorepo.ts`) énumère déjà les dossiers
profondeur 1–2 contenant un manifeste. Il manquait :

- une fonction **publique** qui renvoie **toutes** les applications, pas
  seulement deux alternatives ;
- un **nom stable** par application (aujourd'hui l'UI n'a que le chemin) ;
- la conservation du comportement actuel de `detect()` (plan `null` + question
  `app`), pour ne pas casser le flux existant ni les fixtures.

Contrat livré (`packages/detector/src/applications.ts`, exporté par `index.ts`) :

```ts
export interface DetectedApplication {
  /** Chemin relatif au dépôt, "" pour la racine. */
  root: string;
  /** Nom court et stable : "web", "api", "admin". */
  name: string;
  framework: Framework | null;
  plan: BuildPlan;          // plan v1, inchangé (aucun champ D2 ajouté)
  confidence: number;
  reasons: string[];        // français
  warnings: string[];       // français
}

export interface DetectApplicationsOptions {
  /** Profondeur maximale sous la racine (3 par défaut). */
  maxDepth?: number;
  /** Nom de repli de l'application racine (nom du dépôt côté portail). */
  rootName?: string;
}

/** Toutes les applications déployables, ordre déterministe (racine d'abord, puis `root`). */
export function detectApplications(
  snapshot: RepoSnapshot,
  options?: DetectApplicationsOptions,
): DetectedApplication[];
```

Règles effectives :

- un dépôt à une seule application → tableau d'un élément (`root: ""`) ; aucun
  dépôt reconnu → tableau vide ;
- `eflex.json`, compose ou Dockerfile à la racine → **une** application : même
  précédence que `detect()`, le contrat racine décrit le dépôt ;
- `name` = `package.json#name` sans scope (`@acme/web` → `web`), sinon dernier
  segment de `root` (nom du dépôt pour la racine, `app` en dernier recours),
  normalisé `[a-z0-9-]`, tronqué à 24 caractères, dédupliqué (`web`, `web-2`) ;
- profondeur de découverte **3** (`apps/packages/foo`), même liste
  `IGNORED_SEGMENTS` et même tri que `discoverApps()` ; `node_modules`, `.git`,
  `vendor`, `.next`, `dist`, `build`… sont retirés en amont par `createView()` ;
- un paquet Node sans script `start`, sans dépendance serveur connue et sans
  point d'entrée est **écarté** (bibliothèque type `packages/ui` ou
  `package.json` privé de workspace) : pas de faux positif `node` ;
- `detect()` et `detectApplication()` sont **inchangés** : `DetectionResult`
  n'a pas de nouveau champ, les fixtures existantes ne bougent pas.

Cas monorepo pnpm/Turborepo avec dépendances internes : le plan de chaque app
porte déjà `root`, `repoRoot` et `workspace` (`manager`, `name`, `buildScript`).
`coolifyApplicationSettings` construit depuis la racine avec
`pnpm --filter '<pkg>'... run '<script>'` et démarre dans `<root>`. **Rien à
changer** : chaque app réutilise ce mécanisme. Le coût à documenter est la
**duplication de build** : N Applications Coolify reconstruisent chacune tout le
workspace (pas de cache Turbo partagé entre applications).

## 5. Modèle Prisma proposé

Ajouts (`portail/prisma/schema.prisma`), compatibles avec l'existant :

```prisma
model Project {
  // … champs actuels conservés pendant expand/dual …
  apps ProjectApp[]
}

/**
 * Application déployable d'un projet : un dossier du dépôt, un build Coolify,
 * un port, éventuellement un domaine public. Un projet sans ligne ProjectApp
 * (données antérieures à D2) est traité comme une application implicite.
 */
model ProjectApp {
  id            String       @id @default(cuid())
  projectId     String
  project       Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  /** Nom court stable et unique dans le projet : "web", "api", "admin". */
  name          String
  /** Dossier de l'application dans le dépôt ("" = racine). */
  root          String       @default("")
  /** Ordre d'affichage déterministe (app principale = 0). */
  position      Int          @default(0)
  framework     String
  runtime       String?
  port          Int          @default(80)
  plan          Json?
  detection     Json?
  /** Domaine public de l'application. null = application non exposée. */
  domain        String?      @unique
  coolifyAppId  String?      @unique
  tlsValid      Boolean?
  tlsExpiresAt  DateTime?
  tlsCheckedAt  DateTime?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  envVars       EnvVar[]
  deployments   Deployment[]
  domains       ProjectDomain[]

  @@unique([projectId, name])
  @@unique([projectId, root])
  @@index([projectId])
}

model Deployment {
  // … champs actuels …
  appId     String?
  app       ProjectApp? @relation(fields: [appId], references: [id], onDelete: SetNull)
  /** Lot de déploiements créé par un même événement (push, redéploiement global). */
  groupId   String?

  @@index([appId])
  @@index([groupId])
}

model EnvVar {
  // … champs actuels …
  appId String?
  app   ProjectApp? @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@unique([projectId, appId, key])
  @@index([appId])
}

model ProjectDomain {
  // … champs actuels, hostname reste @unique globalement …
  appId String?
  app   ProjectApp? @relation(fields: [appId], references: [id], onDelete: Cascade)

  @@index([appId])
}
```

Points de vigilance **à ne pas rater** :

1. **Unicité avec `NULL` en PostgreSQL.** `@@unique([projectId, appId, key])`
   ne protège **pas** les variables de projet (`appId = NULL`) : PostgreSQL
   considère chaque `NULL` comme distinct. Il faut **en plus** un index partiel
   créé par SQL brut dans la migration :

   ```sql
   CREATE UNIQUE INDEX "EnvVar_project_scope_key"
     ON "EnvVar" ("projectId", "key") WHERE "appId" IS NULL;
   ```

   Même logique si un jour une contrainte l'exige sur `ProjectDomain` (inutile
   ici : `hostname` reste unique global). `prisma migrate dev` signale l'index
   brut comme dérive possible : relire `prisma migrate diff` avant de committer,
   et ne jamais laisser `migrate dev` le supprimer.
2. **AAD des secrets inchangée.** `EnvVar.value` est chiffré avec l'AAD
   `projectId:key` (`lib/crypto.ts`). On **ne change pas** l'AAD : cela
   éviterait de rechiffrer des milliers de lignes et garderait la propriété qui
   compte (une valeur ne peut pas migrer vers un autre **projet**). Le
   déplacement d'une valeur entre deux apps d'un même projet n'est pas une
   escalade de privilège (même organisation, même périmètre de confiance) ;
   c'est documenté dans `docs/architecture/secret-handling.md` à l'occasion.
3. **`domain` unique et slugs.** `Project.slug` est unique pour toute la
   plateforme ; `<slug>-<app>` l'est donc aussi. Le domaine par défaut d'une app
   secondaire doit rester sur **un seul label** :
   `<slug>-<app>.<PORTAL_DOMAIN>` (≤ 63 caractères par label, troncature). On
   **n'utilise pas** `<app>.<slug>.<PORTAL_DOMAIN>` : le certificat wildcard
   `*.eflex.app` et les enregistrements DNS wildcard ne couvrent pas de façon
   fiable un sous-domaine à deux niveaux selon le fournisseur DNS. L'application
   principale garde `<slug>.<PORTAL_DOMAIN>` (`Project.domain`).
4. **`@@unique([projectId, root])`.** Deux applications ne peuvent pas
   déployer le même dossier ; un `eflex.json` par sous-dossier reste la façon de
   distinguer deux stacks dans un même dossier (cas rare, refusé explicitement).
5. **`ProjectApp.domain @unique`.** Deux applications ne peuvent pas router le
   même hôte ; les domaines personnalisés gardent leur `hostname @unique` global.
6. **Suppression en cascade.** Supprimer un projet supprime ses apps, variables,
   domaines et déploiements. La suppression des **applications Coolify** reste
   explicite dans la route (jamais en cascade silencieuse).

## 6. Contrat API

### 6.1 Analyse

`POST /api/projects/analyze` — réponse enrichie (champs additifs, compatibles) :

```jsonc
{
  "repo": { "owner": "acme", "repo": "shop", "branch": "main", "commitSha": "…" },
  "detection": { "plan": { /* v1 */ }, "confidence": 0.9, "alternatives": [], "questions": [] },
  "apps": [
    { "root": "apps/web", "name": "web", "framework": "nextjs", "confidence": 0.86,
      "defaultDomain": "shop-web.eflex.app", "plan": { /* v1 */ } },
    { "root": "apps/api", "name": "api", "framework": "node", "confidence": 0.91,
      "defaultDomain": "shop-api.eflex.app", "plan": { /* v1 */ } },
    { "root": "apps/docs", "name": "docs", "framework": "astro", "confidence": 0.88,
      "defaultDomain": "shop-docs.eflex.app", "plan": { /* v1 */ } }
  ],
  "incomplete": false
}
```

`defaultDomain` est calculé côté serveur (`lib/project-slug.ts`) à partir du nom
de projet proposé : le client ne décide jamais du domaine.

> Lot A : `apps` est déjà renvoyé, avec `plan`, `confidence`, `reasons` et
> `warnings` par application. `defaultDomain` n'existe pas encore (lot C) et
> `detection` garde son contrat (plan de l'application choisie, ou question
> `app` quand aucun `root` n'est fourni).

### 6.2 Création

`POST /api/projects` — le client envoie des **choix**, jamais des plans :

```jsonc
{
  "name": "Boutique",
  "repoUrl": "https://github.com/acme/shop",
  "branch": "main",
  "commitSha": "…",
  "apps": [
    { "root": "apps/web", "framework": "nextjs", "primary": true },
    { "root": "apps/api", "framework": "node" }
  ],
  "envVars": [{ "key": "DATABASE_URL", "value": "…" }]
}
```

- `apps` absent ou de longueur 1 → comportement actuel (un `ProjectApp` créé,
  `Project.*` en miroir).
- Chaque entrée est **re-analysée** par le serveur sur le même `commitSha`
  (`analyzeGitHubRepo` avec `root`) ; un `framework` inconnu pour ce `root`
  renvoie **409** (« le dépôt a changé, relancez l'analyse »), jamais un plan
  fabriqué.
- Quota : `assertAppQuota(organizationId, apps.length)` avant toute écriture.
  Message explicite : « Cette création ajoute 3 applications ; le plan Pro en
  autorise 30 (28 utilisées). »
- Transaction : projet + apps + variables, puis N `Deployment` (`groupId`
  commun, `commitSha` du commit analysé) et N enfilements. Réponse **202** avec
  `{ project, apps: [{ id, name, domain, deploymentId }], groupId, warning }`.
- Un app dont le plan est multi-services **sans** compose dans le dépôt est
  refusée à la création (422, même message que D1), pas au milieu du build.

### 6.3 Lecture et actions

| Méthode | Route | Changement |
| --- | --- | --- |
| `GET` | `/api/projects/[id]` | + `apps: [{ id, name, root, framework, port, domain, coolifyAppId, tls, lastDeployment }]`, `primaryAppId`, `lastGroup` |
| `GET` | `/api/projects/[id]/apps` | nouveau : liste complète avec dernier déploiement et statut runtime (lecture courte) |
| `PATCH` | `/api/projects/[id]/apps/[appId]` | nouveau : nom d'affichage, `root` (refusé si l'app est déployée), `domain` (réservé `*.PORTAL_DOMAIN`) |
| `POST` | `/api/projects/[id]/apps` | nouveau : ajouter une app à un projet existant (même dépôt, nouveau `root`) ; quota vérifié |
| `DELETE` | `/api/projects/[id]/apps/[appId]` | nouveau : supprime l'application Coolify puis la ligne ; refus si une base du projet en dépend (jamais le cas aujourd'hui) |
| `POST` | `/api/projects/[id]/redeploy` | `{ appId?: string }` ; sans `appId` = toutes les apps (nouveau `groupId`) |
| `GET` | `/api/projects/[id]/logs` | `?appId=` (défaut : app principale) |
| `GET/POST` | `/api/projects/[id]/runtime` | `?appId=` / `{ appId, action }` |
| `GET/POST` | `/api/projects/[id]/domains` | `appId` optionnel dans le corps ; `GET` renvoie `apps` et leurs domaines |
| `POST` | `/api/projects/[id]/env-vars` | `appId` optionnel (lot 4) ; `GET` en liste les portées |
| `POST` | `/api/projects/[id]/deployments/[deploymentId]/cancel` | inchangé ; `?group=1` annule tout le lot |

Codes d'erreur ajoutés : `app_not_found` (404), `app_not_deployed` (409),
`plan_limit` avec `required`/`limit` (403), `app_root_conflict` (409).

### 6.4 Webhook GitHub

Un `push` sur la branche de production d'un dépôt :

1. trouve les projets du dépôt (inchangé) ;
2. pour chaque projet, construit la liste de ses apps (toutes, y compris celles
   sans domaine) ;
3. crée **un** `Deployment` par app, même `groupId`, même `commitSha` ;
4. vérifie le verrou **par app** : une app déjà en cours est `skipped`, les
   autres partent (le push n'échoue pas en bloc) ;
5. met à jour `installationId` si nécessaire (inchangé).

Filtrage par chemin (`apps/web/**` ne redéploie que `web`) : **hors périmètre
v1**. Coolify reconstruit de toute façon l'application complète ; le filtre
n'économiserait que des builds, à faire quand les coûts seront mesurés.

## 7. Interface

Objectif : **aucun changement visible** pour un projet mono-application.

- `/dashboard` : une carte par projet. Si `apps.length > 1`, une ligne
  « 3 applications · 2 en ligne » et le statut agrégé du dernier lot.
- `/dashboard/projects/[id]` :
  - section « Applications » (tableau : nom, `root`, domaine cliquable ou
    « non exposée », statut, dernier commit, actions `Redéployer` / `Journaux`) ;
  - l'en-tête garde le domaine de l'app principale et le bouton « Visiter » ;
  - le panneau de déploiement affiche le lot : une ligne par app, statut et logs
    de l'app sélectionnée (le flux SSE ne change pas, il est déjà par
    `deploymentId`) ;
  - « Redéployer » reste global par défaut, avec une action par app.
- `/dashboard/projects/[id]/settings` : variables projet (comportement actuel)
  + section « Domaines personnalisés » regroupée par app.
- `/dashboard/new` : quand `apps.length > 1`, tableau avec cases à cocher, une
  app désignée principale (radio), domaine proposé par app, avertissement sur
  le nombre d'applications facturées. Le flux mono-app actuel est conservé
  lorsque `apps.length === 1`.
- Accessibilité : le tableau est un vrai `<table>` avec en-têtes, les cibles
  tactiles restent ≥ 44 px, les statuts ne sont pas portés par la couleur seule
  (texte + pastille), libellés français.
- Admin : `/admin/projects` et `/admin/deployments` affichent l'app
  (`appName`), la réconciliation compare **toutes** les `coolifyAppId`, et
  `/admin/infrastructure` compte les applications (pas les projets).

## 8. Migration Prisma (expand / contract)

Aucune migration n'est jouée dans le cadre de cette étude. Ordre prévu :

### Phase E — expand (lot B)

```bash
cd portail
npx prisma migrate dev --name project_app
npx prisma validate && npx prisma generate
```

- création de `ProjectApp`, des colonnes `Deployment.appId|groupId`,
  `EnvVar.appId`, `ProjectDomain.appId` (toutes **nullables**) ;
- index partiel `EnvVar_project_scope_key` ajouté par SQL brut dans le même
  fichier de migration ;
- le code continue de lire `Project.*` : **aucun changement de comportement**.

### Phase B — backfill (lot B, après la migration)

`portail/scripts/backfill-project-apps.ts` (nouveau, idempotent, journalisé) :

- pour chaque `Project` sans `ProjectApp` : crée une app `name = 'app'`
  (ou dernier segment de `plan.root`), `position = 0`, en recopiant `plan`,
  `framework`, `runtime`, `port`, `domain`, `coolifyAppId`, `tls*` ;
- **ne touche pas** aux `Deployment` existants (`appId = null` = app
  principale à la lecture) ;
- `--dry-run` par défaut, `--batch=200`, compteur `created/skipped` ;
- testé avec `EFLEX_TEST_DB=1` (crée un projet, exécute le script, vérifie les
  champs recopiés, puis le relance et vérifie l'idempotence).

Commande d'exploitation (à ajouter au runbook `docs/operations/deployments.md`) :

```bash
cd portail
npx prisma migrate deploy
pnpm exec tsx scripts/backfill-project-apps.ts --dry-run
pnpm exec tsx scripts/backfill-project-apps.ts
```

### Phase D — dual (lots C, D, E)

- le worker écrit `ProjectApp.coolifyAppId` **et** le miroir `Project.coolifyAppId`
  de l'app principale ;
- les routes écrivent/lisent les apps, avec repli sur `Project.*` si
  `apps.length === 0` ;
- `EFLEX_MULTI_APP=1` active la création multi-apps ; à `0`, la création
  n'accepte qu'une app et le comportement est celui d'aujourd'hui.

### Phase C — contract (lot G, après un cycle de release)

- plus aucune lecture de `Project.coolifyAppId`, `Project.plan`, `Project.port`,
  `Project.tls*` (vérifié par `grep` et par les tests) ;
- migration de suppression de ces colonnes ;
- `Project.domain`, `Project.framework`, `Project.runtime` **conservés** comme
  dénormalisation d'affichage de l'app principale (documenté dans le schéma) ;
- rollback possible jusqu'à la phase C uniquement : ensuite, restaurer la
  version précédente du portail ne suffit plus.

## 9. Quotas et facturation

- L'unité facturée devient l'**application**. `projectLimit` garde son nom
  (compatibilité `Subscription.projectLimitOverride`) mais sa sémantique est
  documentée « applications ».
- `assertProjectQuota(organizationId)` → `assertAppQuota(organizationId, count)`
  qui compte `ProjectApp` (et, pour un projet sans apps — données non
  backfillées —, compte 1).
- `billingSummary.usage` expose `{ projects, apps, members }` ; l'UI affiche
  « applications ».
- Impact tarifaire explicite dans le message d'erreur et dans
  `docs/operations/billing.md` : un monorepo de 3 applications consomme 3 unités,
  comme trois projets aujourd'hui — mais avec un seul dépôt, un seul jeu de
  variables et une seule facture.
- La création vérifie **N** apps d'un coup : refus **avant** toute analyse
  supplémentaire et avant toute écriture. `projectLimitOverride` continue de
  déroger à la limite (aucun nouveau champ).

## 10. Tests

Unitaires (sans infrastructure, `pnpm test`) :

- **détecteur** : `detectApplications` sur `monorepoMultiple`,
  `monorepoWorkspace` (pnpm + Turborepo + `@acme/ui`), `monorepoSingle`,
  `composeMonorepoApp`, dépôt à la racine, dépôt sans app ; noms dédupliqués,
  ordre déterministe, profondeur 3 ; `detect()` et les fixtures existantes
  inchangées ;
- **domaines** : `appDomain('shop','web') === 'shop-web.<root>'`, troncature à
  63 caractères, collision avec un slug existant, app sans domaine ;
- **agrégation** : `aggregateGroupStatus([...])` → `in_progress`, `live`,
  `failed`, `cancelled`, `partial` ; lot vide refusé ;
- **quotas** : `assertAppQuota` avec 0/4/5 apps sur le plan gratuit, dérive
  `projectLimitOverride`, création de N apps refusée en bloc ;
- **fan-out** (avec `prisma` et `coolify` simulés, comme
  `deployments-route.test.ts`) : 3 apps → 3 `Deployment` avec le même
  `groupId` ; une app déjà active est ignorée sans bloquer les autres ; un
  échec d'enfilement marque **une** ligne `failed` ;
- **worker** : pour `app.root = 'apps/api'`, `baseDirectory`, domaine et labels
  attendus ; app sans domaine → aucun `setApplicationLabels`, aucun `waitForTls` ;
- **suppression** : 3 `coolifyAppId` → 3 `deleteApplication` ; un échec annule
  la suppression locale et renvoie 502 ;
- **réconciliation admin** : 1 projet / 3 apps, orphelins et manquants calculés
  sur l'ensemble.

Intégration (`EFLEX_TEST_DB=1 DATABASE_URL=… pnpm test`, CI PostgreSQL) :

- backfill idempotent, `Deployment.appId` restant `null` sur l'historique ;
- lecture d'un projet non backfillé (repli app implicite) ;
- création multi-apps transactionnelle (rollback complet si une app échoue).

Matrice staging (projet jetable, **jamais** sur `eflex.app`) :

| # | Cas | Attendu |
| --- | --- | --- |
| 1 | monorepo pnpm `apps/web` (Next) + `apps/api` (Node) + `@acme/ui` | 2 applications `live`, dépendance interne construite, domaines `shop-web` / `shop-api` |
| 2 | monorepo Turborepo, `turbo.json` | builds filtrés, aucune commande personnalisée remplacée |
| 3 | statique (`apps/docs`, Astro) + serveur (`apps/api`) | le statique sert `publish_directory`, le serveur répond sur son port |
| 4 | application sans domaine (worker interne) | déployée, aucun routeur Traefik, aucune erreur TLS |
| 5 | `compose.yml` dans `apps/api` uniquement | app compose + app Nixpacks dans le même projet |
| 6 | `push` sur la branche de production | un lot de 2 déploiements, `groupId` commun, une notification |
| 7 | annulation d'un lot | toutes les lignes non terminales passent `cancelled` |
| 8 | retour arrière sur une app | seul le commit de cette app est reconstruit ; l'autre reste en ligne |
| 9 | suppression du projet | les N applications Coolify sont supprimées, la base managée aussi |
| 10 | quota atteint à la création (3 apps pour 2 unités restantes) | refus 403 avant toute application créée |
| 11 | drapeau `EFLEX_MULTI_APP=0` | création mono-app, comportement identique à aujourd'hui |

## 11. Découpage en lots livrables

| Lot | Contenu | Durée | Livrable vérifiable |
| --- | --- | --- | --- |
| **A** | `detectApplications`, noms stables, profondeur 3, `apps` dans `analyze`, tests détecteur — **livré le 10/11/2026** | 1,5 j | l'analyse liste **toutes** les apps (aucune écriture en base) ; aucune régression des fixtures |
| **B** | `ProjectApp` + `Deployment.appId/groupId` + `EnvVar.appId` + `ProjectDomain.appId`, index partiel, script de backfill, dual-write miroir | 2 j | migration + backfill idempotents ; comportement inchangé, drapeau à 0 |
| **C** | Création multi-apps (`POST` avec `apps[]`), fan-out à l'enfilement, domaines par app, worker par app, logs/runtime `?appId=`, suppression en boucle | 2 j | un monorepo de 2 apps se déploie en un clic (staging #1, #3, #4) |
| **D** | UI projet (tableau des apps, sélecteur de logs, redéployer tout/une app), écran de création multi-sélection, paramètres | 2 j | parcours complet utilisable, mono-app inchangé |
| **E** | Webhook fan-out, rollback par app, statut agrégé, notifications par lot, admin + réconciliation | 1,5 j | staging #6, #7, #8 ; admin cohérent |
| **F** | Quotas par application, `billingSummary.usage.apps`, doc `docs/operations/billing.md`, matrice staging complète | 1 j | staging #10, #11 ; tests verts |
| **G** | Phase contract (suppression des colonnes miroir), nettoyage des lectures | 0,5–1 j | `grep` sans lecture legacy, `next build` vert |

**Total ≈ 10 jours** (hors D1 et hors contrat). Ordre imposé : A → B → C → D →
E → F, G après un cycle de release en production.

## 12. Risques et rollback

| Risque | Détail | Mitigation |
| --- | --- | --- |
| **DNS / TLS multi-niveaux** | `<app>.<slug>.<domaine>` peut ne pas être couvert par le wildcard selon le fournisseur DNS | domaine secondaire sur **un seul label** `<slug>-<app>.<domaine>` ; test staging #1 ; sinon domaine personnalisé |
| **Coût / temps de build** | N builds reconstruisent tout le workspace (pas de cache Turbo partagé entre Applications) | documenter, workers BullMQ à concurrence 2 (file naturelle), mesurer avant d'ajouter un filtre par chemin |
| **Quotas** | une création de 3 apps consomme 3 unités ; incompréhension client | message explicite avec `required`/`limit`, UI « applications », doc billing |
| **Verrou de déploiement** | N builds concurrents sur le même projet ; un push peut en ignorer un | verrou **par app** + `groupId` ; les apps en cours sont `skipped`, jamais corrompues |
| **Statut projet ambigu** | un lot peut être `partial` (2 live, 1 failed) | fonction pure `aggregateGroupStatus` + affichage par app ; la notification de lot dit « 2/3 applications en ligne » |
| **Rollback partiel** | revenir en arrière sur une app ne restaure pas les autres au même commit | rollback par app (v1) ; « revenir tout le lot » documenté comme non garanti (Coolify exige un commit déjà déployé **par application**) |
| **Secrets** | une variable projet est diffusée à toutes les apps (même périmètre que le .env Coolify actuel) | garder l'AAD `projectId:key`, documenter, livrer `EnvVar.appId` au lot 4 pour les cas sensibles |
| **Unicité `NULL`** | `@@unique([projectId, appId, key])` ne protège pas les variables projet | index partiel SQL `WHERE "appId" IS NULL` + test d'intégration |
| **Migration** | `migrate dev` peut vouloir supprimer l'index brut | relire `prisma migrate diff`, ne jamais accepter la suppression, CI `prisma validate` |
| **Réconciliation admin** | l'ancienne hypothèse 1 projet = 1 app crée de faux orphelins | comparer l'ensemble des `ProjectApp.coolifyAppId` ; test unitaire |
| **Drapeau** | deux chemins à maintenir pendant la transition | `EFLEX_MULTI_APP` lu uniquement à la création et à l'enfilement ; chemin mono-app couvert par les tests existants |

**Rollback par lot.** Le drapeau `EFLEX_MULTI_APP=0` suffit à revenir au
comportement mono-application (les colonnes restent nullables, les apps déjà
créées sont ignorées et le miroir `Project.*` reste à jour). Les migrations
Prisma étant ascendantes, la phase E n'est pas annulée en base : on redéploie la
version précédente du portail avec le drapeau à 0. Un script de nettoyage
(`scripts/prune-project-apps.ts`, `--dry-run`) permettra de supprimer les
`ProjectApp` créées pendant un pilote, après décision explicite.

## 13. Critères de sortie

- [ ] un monorepo pnpm/Turborepo avec dépendance interne se déploie en N
      applications, chacune `live`, avec ses logs et son domaine ;
- [ ] une application statique et une application serveur cohabitent dans le
      même projet, chacune routée correctement (ou non exposée) ;
- [ ] un `push` crée **un** lot, une notification, N déploiements avec un
      `groupId` commun ; une app en cours n'empêche pas les autres ;
- [ ] annuler un lot annule toutes ses lignes non terminales ; un retour
      arrière par app fonctionne ;
- [ ] la suppression d'un projet supprime ses N applications Coolify et sa base
      managée, ou échoue proprement sans laisser de projet fantôme ;
- [ ] les quotas comptent les applications ; les messages indiquent le nombre
      requis et la limite ;
- [ ] `pnpm test`, `pnpm typecheck:all`, `lint`, `prisma validate`,
      `next build` verts ; tests d'intégration avec `EFLEX_TEST_DB=1` verts ;
- [ ] avec `EFLEX_MULTI_APP=0`, le parcours mono-application est identique
      visuellement et fonctionnellement à aujourd'hui ;
- [ ] aucune nouvelle écriture de secret dans un log, un domaine ou une
      réponse API ; l'AAD `EnvVar` est inchangée.

## 14. Références

- `docs/architecture/multi-service-deployment.md` (D1/D2/D3, Coolify 4.7.3)
- `docs/architecture/deployment-monorepos-volumes.md` (monorepos, `base_directory`,
  `workspace`, volumes)
- `docs/adr/0011-coolify-then-axiom.md` (Coolify reste le backend)
- `portail/prisma/schema.prisma` (`Project`, `Deployment`, `EnvVar`,
  `ProjectDomain`, `ProjectDatabase`, `Subscription`)
- `portail/src/worker.ts` (`processDeployment`), `portail/src/lib/deploy-plan.ts`
  (`coolifyApplicationSettings`, `buildProjectArtifacts`, `deploymentKind`),
  `portail/src/lib/coolify.ts` (`createApplication`, `updateApplication`),
  `portail/src/lib/project-deployments.ts`, `portail/src/lib/billing.ts`,
  `portail/src/lib/plans.ts`, `portail/src/lib/project-slug.ts`,
  `portail/src/lib/deployment-state.ts`
- `portail/src/app/api/projects/**`, `portail/src/app/api/webhooks/github/route.ts`
- `portail/src/app/dashboard/projects/[id]/**`, `portail/src/components/**`
- `packages/detector/src/detect.ts`, `packages/detector/src/monorepo.ts`,
  `packages/detector/src/types.ts`, `schema/v1.json`
