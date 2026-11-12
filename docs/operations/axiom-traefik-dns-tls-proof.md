# Validation réelle Traefik, DNS et certificats — issue #12

> **Statut : livrables code-side préparés, preuve sur infrastructure réelle non réalisée.**  
> Ce document ne rapporte **aucun** résultat observé sur un VPS réel, un DNS public ou un certificat Let's Encrypt émis en conditions réelles. Il décrit la procédure reproductible, les prérequis, les vérifications et la collecte de preuves nécessaires pour clore [#12](https://github.com/digitaleflex/eflex.app/issues/12).

## 1. Objectif et périmètre

Prouver, sur une infrastructure réelle contrôlée, que le moteur Axiom peut :

1. Déployer un projet Node et un projet Python jusqu'à l'état `LIVE`.
2. Exposer chaque application derrière Traefik sur un nom DNS public, en HTTPS, avec un certificat valide.
3. Supporter un redéploiement sans interruption perceptible (au sens mesuré par la procédure ci-dessous).
4. Revenir à un état cohérent après un échec de santé (rollback documenté et observé).
5. Mettre en évidence le comportement de renouvellement de certificat (preuve directe si la fenêtre le permet, sinon preuve indirecte documentée : configuration ACME, stockage, logs Traefik, et plan de validation différée).

### Hors périmètre de cette procédure

- Multi-région, haute disponibilité, ou montée en charge.
- Validation de stacks non listées comme supportées (voir `docs/roadmap/parallel-plan.md`).
- Déploiement de la console portail EFLEX/Coolify ; ce runbook cible le moteur/agent Axiom.

## 2. Ce qui est prouvé aujourd'hui (faits observables dans le dépôt)

| Élément | Preuve observable | Limite |
|---|---|---|
| Parcours build → runtime → health → `LIVE` en e2e moteur | `services/engine/internal/e2e` `TestGitHubToLive` passe avec PostgreSQL + Docker réel (voir `docs/roadmap/parallel-plan.md`, section « Verified status ») | Le test enregistre `https://e2e-test.local` : **aucun Traefik, DNS ni certificat**. Transport agent in-process. Source fixture, pas GitHub OAuth/archive de bout en bout. |
| Génération/usage des labels et config Traefik côté agent | `services/agent/internal/runtime/traefik/*`, tests unitaires/intégration du paquet (selon CI/environnement) | L'émission ACME réelle, la résolution DNS publique et le routage depuis Internet ne sont pas prouvés. |
| Adapter réseau/Docker et ownership | `services/agent/internal/runtime/docker/*`, `services/agent/internal/security/ownership/*`, matrice `docs/architecture/agent-failure-matrix.md` | Pas de validation sur hôte distant réel avec Traefik de production. |
| Politique de déploiement et contrats API | `docs/architecture/deployment-policy.md`, `docs/architecture/api-contract.md`, code `services/engine/internal/*` | Comportement opérationnel réseau/TLS réel non observé. |

**Conclusion factuelle :** le dépôt fournit le code et des tests qui exercent des sous-systèmes, mais **aucune preuve de service HTTPS public avec certificat valide émis par Axiom/Traefik sur un vrai VPS** n'existe à ce jour dans le dépôt.

## 3. Ce qui reste à prouver sur infrastructure réelle

À consigner dans un rapport de preuve (voir §8) avec horodatage, commandes, sorties et captures/logs :

- [ ] DNS wildcard (ou enregistrements dédiés) résolvant vers l'IP publique du VPS de test.
- [ ] Traefik opérationnel sur le VPS, chargeant la configuration dynamique produite par l'agent, avec ACME configuré.
- [ ] Déploiement Node (stack supportée) → `LIVE` → réponse HTTP(S) correcte sur l'URL publique, certificat TLS valide (chaîne, nom, date).
- [ ] Déploiement Python (stack supportée) → mêmes preuves.
- [ ] Redéploiement : mesure d'erreurs/latence pendant la bascule (script `scripts/axiom-proof/40-rollback-redploy-proof.sh` fournit un gabarit de mesure ; les seuils d'« interruption perceptible » doivent être définis et rapportés).
- [ ] Échec de santé volontaire → rollback/comportement effectivement observé, conforme ou écarts documentés par rapport à `docs/operations/runbook.md` et au code.
- [ ] Renouvellement de certificat : observation directe (si possible) ou preuve indirecte + plan de validation différée daté.
- [ ] Écarts documentation/code relevés et corrigés dans `docs/`.

## 4. Prérequis (action humaine / infrastructure)

| Prérequis | Détail |
|---|---|
| VPS Linux | Accès root/sudo, CPU/RAM/disque suffisants, ports 80/443 accessibles depuis Internet, horloge synchronisée (NTP). |
| Domaine de test | Zone DNS contrôlée. Recommandé : `<env>.example.tld` et wildcard `*.apps.<env>.example.tld` ou enregistrements par application. |
| DNS public | Propagation vérifiable (`dig`, `nslookup`). Pas de proxy qui casse le challenge HTTP-01 sauf adaptation explicite (DNS-01 hors périmètre par défaut). |
| Accès registre/images | Si images privées : credentials ; sinon accès Internet sortant pour pulls de base images (attention aux proxys/CA en environnement restreint). |
| Accès GitHub (si test avec dépôt réel) | App OAuth/credentials ou dépôt public/fixture selon le scénario choisi ; le parcours GitHub OAuth complet n'est pas prouvé aujourd'hui (voir parallel-plan). |
| PostgreSQL pour le moteur | `AXIOM_TEST_DATABASE_URL` en local CI-like, ou base dédiée en environnement réel ; migrations appliquées. |
| Secrets/variables | `AXIOM_SECRET_KEY`, `AXIOM_API_TOKEN` (ou auth choisie), config GitHub si utilisée — jamais commités. |

## 5. Topologie de référence (à adapter)

- **Hôte A (VPS)** : Docker daemon, Traefik (point d'entrée 80/443), agent Axiom, répertoire dynamique Traefik partagé avec l'agent.
- **Hôte B (peut être A pour un premier test)** : moteur Axiom + PostgreSQL (ou PostgreSQL managé). En mode NAT, l'agent initie les connexions vers le moteur ; en mode loopback/self-hosted, contraintes différentes (voir ADR-0008).
- **DNS** : `engine.<domaine>` (si exposé), `app1.apps.<domaine>`, `app2.apps.<domaine>` → IP publique de l'hôte Traefik/agent.

> Important : le listener d'opérations direct de l'agent est **loopback par défaut** et refuse le non-loopback sans opt-in explicite (`AXIOM_AGENT_LISTEN_ADDR`, `AXIOM_AGENT_ALLOW_PUBLIC_LISTENER`) ; il n'a pas de TLS (`docs/security/threat-model.md` T29/G6). Pour un agent distant derrière NAT, le chemin prévu est le **long-poll** (`/api/v1/agent/poll`, `/api/v1/agent/result`) initié par l'agent vers le moteur (ADR-0008) — ce chemin doit être validé en réel dans #13.

## 6. Procédure opératoire

### 6.1 Préparation du VPS et de Traefik

1. Préparer le système (paquets, Docker, utilisateur de service, pare-feu). Gabarit : `scripts/axiom-proof/10-provision-vps.sh` (à exécuter et adapter par un opérateur humain).
2. Déployer Traefik avec :
   - entrypoints `web` (80) et `websecure` (443),
   - provider file/dynamic pointant vers le répertoire écrit par l'agent,
   - résolveur ACME (HTTP-01) avec stockage persistant (`acme.json`, permissions strictes),
   - email ACME valide.
3. Valider Traefik **avant** tout déploiement applicatif : `curl -v http://127.0.0.1` (selon config), dashboard désactivé ou protégé en production.
4. Référence existante dans le dépôt : `TRAEFIK_SETUP.md` (stack dev/compose moteur) — **à confronter à la réalité VPS** ; tout écart doit être consigné.

Commande de collecte : `scripts/axiom-proof/20-traefik-tls-verify.sh` (pré-vols DNS/TLS/ports, collecte de logs Traefik et état des fichiers dynamiques).

### 6.2 Installation du moteur (si sur hôte séparé)

1. Configurer `DATABASE_URL`, `AXIOM_SECRET_KEY`, variables GitHub si nécessaires, URL publique du moteur.
2. Appliquer les migrations.
3. Démarrer le moteur et vérifier `GET /health` / `GET /ready` (selon exposition).
4. Enregistrer le serveur cible en état `pending` puis délivrer un jeton bootstrap (voir API agent, #13 pour la procédure détaillée d'enrôlement).

### 6.3 Déploiement Node

1. Créer l'application/profil/plan pour un dépôt Node supporté (fixture contrôlée ou dépôt de référence).
2. Lancer le déploiement et suivre les événements/étapes jusqu'à `LIVE` ou `FAILED`.
3. Vérifier :
   - résolution DNS du domaine applicatif,
   - `curl -Ik https://<domaine-app>` → 2xx/3xx attendu, certificat valide (`openssl s_client`, ou `curl -v`),
   - labels/conteneurs Docker cohérents (`axiom.*`), route Traefik présente.
4. Collecter : ID déploiement, horodatages, logs moteur/agent/Traefik, sortie `curl`/`openssl`.

Gabarit : `scripts/axiom-proof/30-deploy-node-python-proof.sh` (orchestration côté opérateur, appels API à adapter).

### 6.4 Déploiement Python

Répéter 6.3 avec un projet Python supporté (voir couverture déclarée dans `parallel-plan.md`). Consigner la version de runtime/image de base effectivement utilisée.

### 6.5 Redéploiement

1. Déclencher un nouveau déploiement de la même application (nouvelle révision).
2. Pendant la bascule, exécuter une sonde continue (`curl` en boucle avec mesure) depuis un point externe.
3. Rapporter : durée de la fenêtre, nombre d'échecs, codes HTTP, comportement observé. Ne pas conclure « sans interruption perceptible » sans mesures.

### 6.6 Échec de santé et rollback

1. Provoquer un échec de santé déterministe (ex. endpoint `/health` renvoyant 500, port incorrect, ou image cassée — méthode à documenter dans le rapport).
2. Observer la transition d'état, les opérations agent, et l'état final (rollback automatique, `FAILED`, ou autre).
3. Comparer au comportement attendu par `docs/operations/runbook.md` §8 et au code de l'executor/agent ; **documenter tout écart**.

Gabarit : `scripts/axiom-proof/40-rollback-redploy-proof.sh`.

### 6.7 Renouvellement de certificat

- **Preuve directe** (rare en test court) : observer un renouvellement ACME réussi dans les logs Traefik et la mise à jour du stockage ACME avant expiration.
- **Preuve indirecte minimale** (si pas de fenêtre) : montrer la configuration ACME active, le stockage persistant, l'absence d'erreur au démarrage, et planifier une vérification ultérieure avec date/certificat concerné. Ne pas présenter l'indirect comme une preuve de renouvellement effectif.

## 7. Scripts fournis (exécution humaine requise)

| Script | Rôle | Prérequis |
|---|---|---|
| `scripts/axiom-proof/00-preflight.sh` | Vérifications locales/pré-vol (outils, variables, DNS résolu, ports) | bash, curl, dig/host, openssl, jq (optionnel) |
| `scripts/axiom-proof/10-provision-vps.sh` | Gabarit de provisionnement VPS (Docker, Traefik, répertoires) | VPS Linux, sudo/root, accès Internet |
| `scripts/axiom-proof/20-traefik-tls-verify.sh` | Vérifications DNS/HTTP/HTTPS/certificat et collecte Traefik | Domaine pointant vers le VPS |
| `scripts/axiom-proof/30-deploy-node-python-proof.sh` | Gabarit d'appels API pour déployer Node/Python et sonder les URLs | Moteur accessible, token API, dépôts/fixtures |
| `scripts/axiom-proof/40-rollback-redploy-proof.sh` | Sondes de redéploiement et scénario d'échec santé | Application déjà déployée |
| `scripts/axiom-proof/collect-evidence.sh` | Rassemble les sorties dans un dossier horodaté | Droits d'écriture |

Tous les scripts sont des **gabarits** : ils doivent être relus, adaptés aux noms d'hôtes, IDs et méthode d'installation réelle, puis exécutés par un opérateur. Ils ne prouvent rien par eux-mêmes.

## 8. Rapport de preuve attendu (à produire lors de l'exécution réelle)

Créer un dossier `evidence/issue-12/YYYYMMDD-HHMMZ/` (non commité s'il contient des données sensibles) contenant :

- `metadata.txt` : date, opérateur, versions (git SHA, moteur, agent, Traefik, OS), domaine, IP VPS.
- `dns.txt` : sorties `dig`/résolution.
- `deploy-node.*` / `deploy-python.*` : requêtes/réponses API, états finaux, sondes HTTPS.
- `tls/*` : `openssl s_client -showcerts`, dates de validité.
- `redeploy-probe.csv` ou équivalent : mesures pendant redéploiement.
- `health-failure-rollback.*` : scénario, chronologie, état final.
- `renewal/*` : logs/config/preuve directe ou indirecte.
- `deviations.md` : écarts doc/code observés.

## 9. Mise à jour documentaire après preuve réelle

Une fois la preuve obtenue (et seulement à ce moment-là) :

1. Mettre à jour `docs/roadmap/parallel-plan.md` (« Verified status » / « Still not proven ») avec les faits observés, dates et limites restantes.
2. Corriger `docs/operations/runbook.md`, `TRAEFIK_SETUP.md` et ce document si des écarts sont constatés.
3. Fermer #12 avec lien vers le rapport de preuve (sans secrets).

**Aucune de ces mises à jour ne doit être faite de manière anticipée.**
