# Plan d’orchestration d’agents OpenCode par vagues

> **Issue de suivi :** [#138](https://github.com/digitaleflex/eflex.app/issues/138) — `[P2] [OPS-0] Plan d’orchestration d’agents OpenCode par vagues sur les issues ouvertes`
>
> **Instantané :** 2026-11-15 (branche `main`, commit `e9bae6e`). Ce document est un plan opérationnel vivant : il doit être mis à jour à mesure que les issues avancent, se ferment ou changent de périmètre.

## 1. Contexte et règles d’exécution

- **But :** faire avancer les issues ouvertes avec des agents OpenCode en **séries contrôlées** (worktree/session par issue), en parallélisant uniquement les tâches à périmètres de fichiers disjoints, avec validation et revue avant fusion.
- **Prérequis dépôt :** respecter `AGENTS.md` (scoping tenant, secrets chiffrés/masqués, aucune valeur affichée sans source, français, validations adaptées à l’impact : `pnpm test`, `pnpm typecheck`, lint portail, `next build` selon le cas). Une issue = une branche/worktree, PR petite, revue avant merge.
- **Ressources OpenCode (référencées par #138) :** skills dans `.agents/skills/` et `.opencode/skills`, configuration `opencode.jsonc` ; subagents projet `.opencode/agents/reviewer.md`, `portail.md`, `engine.md`, `security.md`, `deploy.md` (à utiliser selon le domaine ; vérifier leur présence avant délégation).
- **Validation type portail :** `./portail/node_modules/.bin/tsc --noEmit --project portail/tsconfig.json && (cd portail && npm run lint) && pnpm vitest run <tests ciblés>` (+ build/Playwright si requis). Revue systématique `@reviewer` (correctness/régressions) et `@security` pour tenant, secrets, webhooks, paiement, données ou exports.

### Modes opératoires

| Mode | Quand l’utiliser | Exemple |
|---|---|---|
| Parallèle (même session) | Tâches indépendantes, fichiers/domaines disjoints, synthèse finale requise | Déléguer `@portail` sur #114 et `@security` sur #124 en parallèle, puis consolider |
| Série par worktree (recommandé) | Conflits probables, zone sensible, besoin d’isolation de contexte | `git worktree add ../eflex-wt-114 -b feat/domains-114-dns-assistant main` puis session dédiée |

## 2. État actuel des issues ouvertes (snapshot 2026-11-15)

Source : `gh issue list --state open` (30 issues). Les dépendances/prérequis ci-dessous reprennent les intitulés et descriptions d’issues ; ils doivent être confirmés au démarrage de chaque lot.

| # | Priorité / domaine | Titre (résumé) | Prérequis / dépendances notables | État d’avancement observé |
|---:|---|---|---|---|
| 148 | P1, migration | MIG-0 — assistant « Vercel → Eflex » | Liens #128, #130, #131, #143, #96 | Ouvert |
| 143 | P1, billing | BILL-1 — facturation à l’usage / crédit prépayé | #131, #119, #120, #121, #79, #22 | Ouvert |
| 138 | P2, dx/qualité | OPS-0 — ce plan d’orchestration | N/A | **En cours** (ce document = incrément concret) |
| 137 | P3, portail/infra | XP-5 — améliorations admin & exploitation | Actions admin auditées, réservées admin | Ouvert |
| 135 | P2, portail/ux | XP-3 — collaboration & permissions | Aligné #22/#125 | **Incrément livré** (`1a2bacf` : clarification rôles/activité équipe) ; périmètre complet à vérifier |
| 131 | P2, portail/billing/infra | OPS-4 — limites de ressources d’exécution | Infra, politique #22/facturation | **Incrément livré** (`3e49e33` : limites explicitées côté portail) ; application réelle des profils/limites reste à traiter |
| 130 | P2, portail/infra | OPS-3 — sauvegardes/restauration bases managées | Capacités infra/Coolify | Ouvert |
| 128 | P1, portail/infra | OPS-1 — fiabilité pipeline : idempotence, reprise, verrous | Worker/file/états sensibles | **Incrément livré** (`2548440` : fiabilité déploiement) ; clôture à confirmer contre critères d’acceptation |
| 127 | P2, portail/sécurité | SEC-4 — anti-abus & rate limiting distribué | S’appuie sur #124 ; Redis/endpoints sensibles | **Incrément livré** (`3e49e33`, `f52b50f` : durcissement/rate limiting + exposition du mode) ; couverture distribuée complète à vérifier |
| 122 | P2, portail | OBS-4 — alertes ressources & santé | Dépend métriques/sources (#35, #119–#121) | Ouvert |
| 121 | P2, portail/ui | OBS-3 — historique & graphiques métriques | Dépend #35 (collecte/stockage) | Ouvert |
| 120 | P1, portail/infra | OBS-2 — mesure bande passante | Source infra réelle ; débloque #79 | Ouvert |
| 119 | P1, portail/infra | OBS-1 — mesure stockage | Source infra réelle ; débloque #79 | Ouvert |
| 113 | P2, portail | ANALYTICS-6 — export, API & alertes activité | Dépend #108–#112 | Ouvert |
| 112 | P1, portail/sécurité | ANALYTICS-5 — confidentialité & consentement | À concevoir avec #109 ; contraint analytics | Ouvert |
| 111 | P2, portail | ANALYTICS-4 — événements & objectifs | Dépend #109/#112 | Ouvert |
| 110 | P2, portail/ui | ANALYTICS-3 — sources/référents/appareils/géo | Dépend #109/#112 | Ouvert |
| 109 | P1, portail | ANALYTICS-2 — collecte trafic (snippet/SDK, ingestion) | Prérequis #108/#110/#111/#113 ; contention schéma/migrations | Ouvert |
| 108 | P1, portail/ui | ANALYTICS-1 — tableau de bord visiteurs | Dépend #109 et #112 | Ouvert |
| 100 | P3, portail/ui/design | PUB-12 — couleurs hors tokens et textes < 12 px | Transversal UI | **Incrément livré** (`e9bae6e` : terminal migré vers tokens, exception `global-error` documentée) ; audit complet du dépôt à confirmer |
| 99 | P3, portail/ui/design | PUB-11 — pages d’authentification | Lié socle auth/public | **Incrément livré** (`1a2bacf` : socle auth amélioré) ; refonte visuelle/panneau identité à vérifier contre critères |
| 97 | P2, portail/ui/design | PUB-9 — arrondis & primitives de boutons | Fondations UI | **Incrément livré** (`760e3ad` : unification primitives boutons/échelle arrondis) ; recherche résiduelle de boutons faits main à vérifier |
| 96 | P2, portail/ui/design | PUB-8 — refonte visuelle accueil | Dépend PUB-1/fondations selon issue | **Incréments livrés** (`45781f3`, `22524b1`, lot accueil V2) ; clôture à valider contre critères d’acceptation |
| 80 | P1, portail/ui/qualité | UI-I — tests visuels et accessibilité | Env seedé/CI, `portail/e2e/README.md` | **Incrément livré** (`2548440` : tests e2e/a11y) ; couverture/CI/garde-fou complet à confirmer |
| 22 | P1 | Isolation locataires, quotas, limites, audit | Conditionne #123, #125, #131, #117, clôture #79 | **Incrément livré** (`2548440` : isolation tenant) ; revue systématique routes/tests cross-tenant/audit formel restants |
| 13 | P1, backend:axiom | Axiom — agent distant réel | Serveur de test, réseau/NAT, #12 utile | Ouvert (**bloqué humain/infra**) |
| 12 | P1, backend:axiom | Axiom — Traefik, DNS, certificats réels | VPS + domaine + DNS wildcard | Ouvert (**bloqué humain/infra**) |
| 11 | P1, backend:axiom | Axiom — preset Laravel/PHP | Planner multi-processus/volumes selon périmètre | Ouvert |
| 6 | P1, backend:coolify | Volumes persistants & monorepos workspace | Validation sur vrai Coolify ; API stockage variable | Ouvert |

> **Note :** des commits récents référencent aussi #84, #85, #86, #83, #87, #103, #125, #126, #129, #132, #136 etc. dans d’autres branches/historiques de travail ; ils ne figurent pas dans la liste des issues ouvertes au snapshot ci-dessus. Ne pas les rouvrir dans ce plan sans vérifier leur état réel sur GitHub.

## 3. Incréments récents observés sur `main` (pertinents pour la priorisation)

| Commit | Résumé | Impact sur le plan |
|---|---|---|
| `e9bae6e` | Tokens terminal, exception `global-error` documentée (#100) | Réduit le reste de #100 à un audit/transversal résiduel |
| `1a2bacf` | Rôles/activité équipe (#135), socle auth (#99) | Avance XP-3 et PUB-11 sans les clôturer formellement |
| `3e49e33` | Limites d’exécution explicitées, mode rate limiting exposé (#127, #131) | Avance visibilité/contrat ; pas une implémentation infra complète |
| `760e3ad` | Primitives boutons et échelle arrondis (#97) | Fondations UI en partie traitées |
| `45781f3`, `22524b1` | Accueil V2 / clarification & démo déploiement (#96) | Avance majeure PUB-8, validation critères requise |
| `f52b50f` | Durcissement rate limiting portail et preset Laravel Axiom (#127, #11) | Incrément sécurité portail + avancement Axiom Laravel (à confronter aux critères #11) |
| `2548440` | Fiabilité déploiement, tests e2e/a11y, isolation tenant (#128, #80, #22) | Incréments sur socles critiques ; issues probablement encore ouvertes sur critères complets |

## 4. Vagues recommandées (état réel)

Les vagues ci-dessous réordonnent la proposition initiale de #138 en tenant compte des incréments déjà livrés et des blocages externes.

### Vague A — Consolidation des incréments partiels (faible risque de conflit si sérialisé par sujet)

| Issue | Objectif | Agent(s) | Pré-requis | Remarque |
|---|---|---|---|---|
| #100 | Clôturer l’audit tokens/couleurs/textes < 12 px | `portail`, `reviewer` | Aucun | Vérifier recherche résiduelle et contrastes AA clair/sombre |
| #97 | Clôturer fondations arrondis/boutons | `portail`, `reviewer` | Aucun | Confirmer absence de boutons faits main hors primitives |
| #96 | Valider/terminer refonte accueil selon critères | `portail`, `reviewer` | #97 souhaitable | Captures 390/1440, a11y, aucune promesse non livrée |
| #99 | Finaliser pages auth (panneau/hierarchie/mobile) | `portail`, `reviewer` | Aucun | Vérifier 390/1440 clair/sombre, accessibilité |
| #135 | Compléter collaboration/permissions si reste | `portail`, `security` | #22/#125 contexte | Contrôles UI/API cohérents, messages clairs |

### Vague B — Socles fiabilité, sécurité, isolation (priorité haute, zones sensibles)

| Issue | Objectif | Agent(s) | Pré-requis | Remarque |
|---|---|---|---|---|
| #128 | Finaliser idempotence/reprise/verrous déploiement | `deploy`, `portail` | Vérifier état après `2548440` | **Contention** worker/file/états ; sérialiser |
| #80 | Finaliser suite a11y/visuelle seedée/CI | `portail`, `reviewer` | Env seedé/CI | Garde-fou pour futures vagues UI |
| #22 | Compléter isolation/quotas/limites/audit | `security`, `portail` | Revue transversale routes | Conditionne #131 (enforcement), #143, #117, #125 |
| #127 | Étendre rate limiting distribué (Redis) aux endpoints sensibles | `security`, `portail` | Contexte #124 souhaitable | Attention UX/usages légitimes ; endpoints auth/webhooks/ingest/exports |
| #131 | Passer des limites explicitées à des limites appliquées/documentées | `deploy`, `security`, `portail` | #22, capacités infra | Dépend support réel hébergement/Coolify |

### Vague C — Observabilité mesurée (données réelles uniquement)

| Issue | Objectif | Agent(s) | Pré-requis | Remarque |
|---|---|---|---|---|
| #119 | Mesure stockage avec source/unité/période | `deploy`, `portail` | Source infra réelle | Débloque partiellement #79/#122/#143 |
| #120 | Mesure bande passante avec source/unité/période | `deploy`, `portail` | Source infra réelle | Débloque partiellement #79/#122/#143 |
| #121 | Historique/graphiques métriques | `portail`, `deploy` | #35 et collecte | Mode dégradé si source indisponible |
| #122 | Alertes ressources/santé | `portail`, `deploy` | #35, #119–#121 | Seuils configurables, déduplication |

### Vague D — Analytics (forte contention schéma/ingestion)

| Issue | Objectif | Agent(s) | Pré-requis | Remarque |
|---|---|---|---|---|
| #109 | Collecte trafic (snippet/SDK, ingestion) | `portail`, `security` | Cadrage schéma/stockage avant code | **Prérequis** de #108/#110/#111/#113 ; contention `schema.prisma`/migrations |
| #112 | Confidentialité, consentement, conformité | `security`, `portail` | Concevoir avec #109 | Contraint toute la chaîne analytics |
| #108 | Tableau de bord visiteurs | `portail` | #109, #112 | Affichage dégradé si collecte inactive |
| #110 | Sources/référents/appareils/géo agrégés | `portail`, `security` | #109, #112 | Seuils anti-réidentification |
| #111 | Événements personnalisés & objectifs | `portail`, `security` | #109, #112 | Validation/quotas/volume |
| #113 | Export, API & alertes activité | `portail`, `security` | #108–#112 | Scoping tenant, quotas, audit |

### Vague E — Capacités produit & infra complémentaires

| Issue | Objectif | Agent(s) | Pré-requis | Remarque |
|---|---|---|---|---|
| #130 | Sauvegardes/restauration bases managées | `deploy`, `portail` | Capacités infra/Coolify | Procédure testée et documentée |
| #6 | Volumes persistants et monorepos workspace (Coolify) | `deploy`, `portail` | Validation sur vrai Coolify | API stockage/version à confirmer |
| #143 | Facturation à l’usage / crédit prépayé | `portail`, `security`, `deploy` | #131, #119, #120, #121, #79, #22 | Découpage en lots recommandé (cf. issue) |
| #148 | Assistant migration « Vercel → Eflex » | `portail` | Selon lots ; liens #128/#130/#131/#143/#96 | Gros périmètre : planifier par sous-lots MIG-1..5 |
| #137 | Améliorations admin & exploitation | `portail`, `deploy` | Admin/audit existants | Réservé admin, journalisé |

### Vague F — Axiom / moteur (parallélisable côté Go, **fortement dépendant d’infra réelle**)

| Issue | Objectif | Agent(s) | Pré-requis | Remarque |
|---|---|---|---|---|
| #11 | Preset Laravel/PHP | `engine` | Selon planner/services | Confronter l’incrément `f52b50f` aux critères d’acceptation complets |
| #12 | Traefik/DNS/certificats réels | `deploy`, `engine` | VPS, domaine, DNS wildcard | **Bloqué humain/infra** ; preuves observées requises |
| #13 | Agent distant réel (enrôlement, NAT, panne) | `engine`, `deploy`, `security` | Serveur(s), réseau réel, souvent après #12 | **Bloqué humain/infra** ; preuves observées requises |
| — | Suivi moteur | `engine` | — | Voir `docs/roadmap/parallel-plan.md` (« Verified status », éléments non prouvés) |

## 5. Dépendances structurantes (synthèse)

- **#22** (isolation/quotas/limites/audit) conditionne l’enforcement de limites, la facturation à l’usage (#143), les quotas domaine/analytics et les revues cross-tenant.
- **#119 / #120** (mesures réelles) débloquent les affichages de stockage/bande passante (#79 historique, #122, #143) ; aucune valeur sans source/unité/période.
- **#109 + #112** forment le socle analytics : ne pas lancer #108/#110/#111/#113 sans contrat de collecte et cadre confidentialité.
- **`schema.prisma`, migrations, `billing.ts`, `coolify.ts`, `deploy-plan.ts`, routes partagées** : points de contention à sérialiser.
- **#12 / #13** : ne peuvent être clôturés sans exécution et preuves sur infrastructure réelle (voir `docs/roadmap/parallel-plan.md`).

## 6. Prochaines exécutions recommandées (ordre pratique)

1. **Clore/valider les incréments UI/qualité déjà livrés** (#100, #97, #96, #99, puis #80) — PRs petites, vérifications ciblées, faible risque fonctionnel.
2. **Sécuriser les socles sensibles** (#128, #22, #127, #131) en série par zone de contention, avec revue `@security`/`@reviewer`.
3. **Lancer l’observabilité mesurée** (#119, #120, puis #121/#122) uniquement quand une source réelle est disponible.
4. **Cadrer analytics** (#109/#112 design + schéma) avant toute implémentation UI/export (#108/#110/#111/#113).
5. **Traiter les chantiers infra/produit lourds** (#130, #6, #143, #148) par lots explicitement bornés.
6. **Axiom** : avancer #11 côté code/tests ; planifier #12/#13 comme sessions outillées sur infra réelle (preuves, pas seulement scripts/runbooks).

## 7. Limites restantes pour clore #138

- **Inventaire GitHub non figé dans le dépôt :** ce document est un snapshot daté ; la clôture de #138 suppose soit un processus de mise à jour régulier, soit un lien explicite vers l’issue comme source de vérité des changements ultérieurs.
- **Statut réel des issues “partiellement incrémentées” non vérifié finement :** les commits indiquent des avancées (#22, #80, #96, #97, #99, #100, #127, #128, #131, #135, partiellement #11), mais la correspondance exacte aux critères d’acceptation de chaque issue doit être confirmée (revue issue + tests/preuves).
- **Issues absentes du snapshot mais historiquement liées** (#35, #79, #114–#118, #123–#126, #129, #132–#134, #136, etc.) : non listées comme ouvertes au 2026-11-15 ; si elles sont rouvertes ou encore ouvertes ailleurs, le plan doit être complété.
- **Dépendances humaines/infra non levées :** #12, #13, mesures réelles #119/#120, capacités sauvegarde/limites (#130/#131/#6) ne peuvent pas être “terminées” uniquement par modification de code dans ce dépôt.
- **Validation automatique de ce document :** cohérence vérifiée manuellement (structure Markdown, tableaux, références d’issues/chemins cités) ; aucun test applicatif n’est requis car aucun code applicatif n’est modifié.

## 8. Références

- Issue : <https://github.com/digitaleflex/eflex.app/issues/138>
- Règles dépôt : `AGENTS.md`
- État moteur Axiom : `docs/roadmap/parallel-plan.md`
- Runbooks/opérations : `docs/operations/`
