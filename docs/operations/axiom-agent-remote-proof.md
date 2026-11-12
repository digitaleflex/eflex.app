# Validation réelle de l'agent distant — issue #13

> **Statut : livrables code-side préparés, preuve sur infrastructure réelle non réalisée.**  
> Ce document ne rapporte **aucun** comportement observé entre un moteur et un agent installés sur des machines distinctes. Il décrit la procédure reproductible pour prouver l'enrôlement, la communication distante (y compris derrière NAT), la résilience aux coupures, et la rotation/révocation de clés, conformément à [#13](https://github.com/digitaleflex/eflex.app/issues/13).

## 1. Objectif et périmètre

Prouver, sur deux machines réelles (moteur d'un côté, agent sur un VPS derrière NAT ou équivalent), que :

1. Un agent peut être enrôlé avec un jeton bootstrap à usage unique, installer ses identifiants/clé, et s'enregistrer auprès du moteur.
2. L'agent distant exécute un déploiement complet commandé par le moteur.
3. Une commande/opération signée avec une clé révoquée ou invalide est rejetée.
4. Une coupure réseau de 60 s pendant un déploiement ne produit **ni double exécution ni état incohérent** (idempotence observée).
5. La rotation et la révocation de clé/credential fonctionnent comme attendu.

### Hors périmètre

- mTLS (#88) : absent, voir threat model (G6/T29) ; le listener direct n'est pas le transport distant prévu.
- Haute disponibilité du moteur, multi-agents à grande échelle.
- Preuve de performance/latence au-delà de ce qui est nécessaire aux scénarios ci-dessus.

## 2. Ce qui est prouvé aujourd'hui (faits observables dans le dépôt)

| Élément | Preuve observable | Limite |
|---|---|---|
| Identité, credentials, clé de signature d'opération, persistance locale | `services/agent/internal/identity`, `internal/security/auth`, `internal/security/operationkey`, `internal/bootstrap/*`, tests associés | Pas d'enrôlement observé contre un moteur distant réel. |
| Enrôlement côté moteur (bootstrap token, redeem, register/rotate/status) | `services/engine/internal/api/agent.go`, `internal/agentauth/*`, `internal/agentkey/*`, `migrations/009_agent_credentials.sql`, tests API/agentauth | Flux exercé en tests, pas sur réseau réel inter-machines. |
| Heartbeat signé agent→moteur | `services/agent/internal/heartbeat/*`, `services/engine/internal/api/agent_heartbeat.go`, tests | Pas de liveness/stale observé sur lien WAN/NAT réel sur longue durée. |
| Dispatch signé moteur→agent, idempotence/dédoublonnage côté agent | `services/agent/internal/protocol/*` (op IDs déterministes, `applicationId` obligatoire), `internal/dispatcher/*`, `internal/state/*`, `internal/recovery/*`, tests dont `services/agent/tests/*` | `agent-failure-matrix.md` note des gaps de câblage production (bridge adapter, codes d'erreur) et que le parcours complet contre un vrai moteur sur un vrai serveur reste à prouver. |
| Mode long-poll NAT (agent initie) | ADR-0008 ; agent `internal/security/transport/longpoll/*`, bootstrap démarre `LongPoll` après enregistrement ; moteur `internal/api/agent_poll_result.go`, `internal/agentpoll/*`, `internal/agentclient/nat.go` | **Non prouvé de bout en bout sur réseau réel.** L'implémentation NAT côté moteur/route présente des points à vérifier en conditions réelles (voir §6.6). |
| Transport direct Engine→Agent (`/api/v1/agent/operations`) | `services/engine/internal/agentclient/client.go`, listener agent `internal/bootstrap/listener.go` | Destiné au **loopback/self-hosted** ; listener sans TLS, refusé hors loopback sans opt-in, et authentification inbound fail-closed par défaut selon config/état. Ne pas utiliser comme transport distant exposé. |
| Scénarios d'intégration agent (fakes OS/réseau) | `services/agent/tests/*`, `docs/architecture/agent-failure-matrix.md` (14/14 scénarios #90) | Pas de Docker/daemon distant réel dans cette suite, pas de moteur réel, pas de WAN/NAT. |

**Conclusion factuelle :** le code implémente les briques d'enrôlement, signature, polling et exécution, mais **aucun déploiement complet commandé par un moteur à un agent distant réel, ni coupure 60 s observée, ni révocation observée en conditions réelles** n'est établi.

## 3. Ce qui reste à prouver sur infrastructure réelle

- [ ] Création d'un serveur en état `pending`, émission d'un jeton bootstrap à usage unique, consommation unique (refus à la réutilisation/expiration/mauvais serveur).
- [ ] Installation de l'agent sur le VPS distant, premier démarrage, enregistrement, persistance de l'identité, du credential et de la clé de signature d'opération (`DataRoot`).
- [ ] Heartbeat stable moteur↔agent sur une durée significative, statut serveur cohérent.
- [ ] En mode NAT : l'agent poll le moteur, reçoit et exécute une opération, renvoie ack/resultat signés ; le moteur observe la progression.
- [ ] Déploiement complet jusqu'à l'état terminal attendu sur l'application cible (en coordination avec #12 si routage/TLS réel requis).
- [ ] Coupure réseau de 60 s en cours de déploiement : reprise après reconnexion, **aucune double exécution** d'une opération déjà appliquée (preuve par IDs d'opération, journaux, état Docker/conteneurs), **aucun état incohérent** observé.
- [ ] Rotation du credential/clé : l'ancienne clé dans la fenêtre de grâce (si applicable) et la nouvelle clé fonctionnent comme prévu ; après rotation complète, l'ancien matérial ne doit plus être accepté selon la politique implémentée (à vérifier).
- [ ] Révocation : une identité/clé révoquée est refusée (heartbeat, poll, result, opérations) ; comportement observé consigné.
- [ ] Mise à jour de `docs/architecture/agent-failure-matrix.md` et `docs/security/threat-model.md` avec les comportements **observés** uniquement après exécution.

## 4. Prérequis

| Prérequis | Détail |
|---|---|
| Deux machines | Moteur + DB accessibles (directement ou via endpoint HTTPS selon config) ; agent sur VPS distinct, idéalement derrière NAT/pare-feu sortant uniquement. |
| Réseau | L'agent doit pouvoir joindre `AXIOM_ENGINE_URL` en HTTPS (recommandé/attendu en production). DNS/CA valides pour l'URL du moteur. |
| Docker sur l'hôte agent | Daemon fonctionnel, accès socket pour l'agent, espace disque. |
| Horloges synchronisées | NTP sur les deux machines (les signatures/anti-replay dépendent d'horodatages/fenêtres). |
| Accès API moteur | Compte/token pour créer le serveur et émettre le bootstrap token (endpoint user-authentifié). |
| Artefacts de déploiement | Application/plan déployable sur le serveur cible (peut dépendre de #12 pour la preuve HTTPS publique). |

## 5. Procédure d'enrôlement (reproductible)

### 5.1 Côté moteur (opérateur)

1. Créer/enregistrer un serveur en statut `pending` pour l'environnement cible (API serveurs). Noter `serverId`.
2. Émettre un jeton bootstrap à usage unique : `POST /api/v1/servers/{serverId}/bootstrap` (authentifié utilisateur, propriétaire du serveur).  
   - Réponse attendue : `token`, `expiresAt`. Le token **ne doit pas être loggé** ni commité.
   - Vérifications négatives utiles : serveur non pending → 409 ; serveur inconnu → 404.
3. Transmettre le token à l'hôte agent par un canal sûr (pas de ticket public, pas de dépôt git).

Références code : `services/engine/internal/api/agent.go` (`bootstrapServer`), `services/engine/internal/agentauth/service.go` (TTL 15 min, usage unique, liaison serveur).

### 5.2 Côté agent (VPS distant)

Variables minimales (voir `services/agent/internal/config/config.go`) :

- `AXIOM_ENV` (`production` recommandé sur vrai serveur)
- `AXIOM_SERVER_ID` (doit correspondre au serveur bootstrapé)
- `AXIOM_ENGINE_URL` (base URL HTTPS du moteur)
- `AXIOM_AGENT_TOKEN` (bootstrap token, **une seule fois** au premier enregistrement)
- `AXIOM_AGENT_DATA_DIR` (chemin absolu persistant, ex. `/var/lib/axiom-agent`)
- `AXIOM_AGENT_VERSION`, `AXIOM_DOCKER_BINARY`, `AXIOM_TRAEFIK_DYNAMIC_DIR`, `AXIOM_AGENT_HEARTBEAT_INTERVAL` selon besoin

Étapes :

1. Préparer l'hôte : Docker, répertoires (`DataRoot`, répertoire dynamique Traefik si utilisé), utilisateur de service, permissions.
2. Installer le binaire ou l'image agent (voir `services/agent/Dockerfile`, `cmd/agent`).
3. Démarrer l'agent avec `AXIOM_AGENT_TOKEN` défini. Au succès, l'agent persiste identité, credential et `operation-signing-key`, puis démarre heartbeat (et long-poll si clé/état disponibles).
4. **Retirer `AXIOM_AGENT_TOKEN`** des variables d'environnement/service après le premier démarrage réussi : les redémarrages doivent utiliser l'état persisté (`identity`, `credential`, `operation-key`).
5. Vérifier côté moteur : `GET /api/v1/agent/status?serverId=...` (user-auth), heartbeats reçus, statut serveur.

Gabarits : `scripts/axiom-proof/50-agent-enroll-remote.sh`, `scripts/axiom-proof/agent/axiom-agent.env.example`, `scripts/axiom-proof/agent/axiom-agent.service.example`.

### 5.3 Validation de l'unicité du jeton

Après un enrôlement réussi (ou un échec consommant le token selon le cas), tenter de réutiliser le même token doit échouer. Consigner la réponse HTTP/code d'erreur observé.

## 6. Scénarios de validation

### 6.1 Déploiement complet distant

1. S'assurer que le serveur est éligible (`ready`/selon politique) et que l'agent est vu vivant.
2. Déclencher un déploiement via l'API moteur vers ce serveur.
3. Collecter : IDs corrélés, transitions d'état, logs moteur, logs agent, opérations reçues/exécutées, état conteneurs.
4. Critère de succès : déploiement terminé dans l'état attendu **observé**, sans intervention manuelle cachée.

### 6.2 Coupure réseau 60 s (idempotence)

1. Identifier une opération longue ou insérer un point de pause contrôlé (à définir par l'opérateur ; ne pas inventer un mécanisme non présent).
2. Couper la connectivité agent↔moteur pendant **60 secondes** (iptables/nftables/tc selon l'hôte), puis rétablir.
3. Observer : reconnexion, reprise du poll/heartbeat, absence de ré-exécution destructrice, absence de doublons de ressources/conteneurs.
4. Preuves à collecter : horodatages de coupure/rétablissement, journaux des deux côtés, liste des opérations/IDs, `docker ps -a` avant/après.

Gabarit : `scripts/axiom-proof/60-agent-failure-drills.sh` (fonctions de coupure à adapter ; **dangereux si mal ciblé**).

### 6.3 Rotation de clé/credential

1. Déclencher la rotation via `POST /api/v1/agent/rotate` (authentifiée par le credential agent courant, avec en-têtes de protection attendus).
2. Vérifier que l'agent persiste les nouveaux matériels et continue de fonctionner.
3. Vérifier le comportement des anciens matériels selon la fenêtre de grâce implémentée (à observer, pas à supposer).

Références : `services/engine/internal/api/agent.go` (`agentRotate`), `services/engine/internal/agentauth/service.go` (grâce 5 min documentée dans threat model), `agentkey`.

### 6.4 Révocation

1. Révoquer l'agent/serveur selon le mécanisme supporté (API/admin/état serveur — à identifier précisément avant exécution).
2. Tenter heartbeat, poll, result ou nouvelle opération : doivent être refusés.
3. Consigner les codes/raisons retournés.

### 6.5 Rejet d'opérations non autorisées

- Opération pour un autre serveur/identité → refus (`FORBIDDEN`/binding).
- Signature invalide, horodatage hors fenêtre, nonce rejoué → refus.
- Type inconnu → `UNKNOWN_OPERATION`.
- `applicationId` manquant ou incohérent → refus de portée.

Ces cas sont couverts en tests ; la validation réelle doit confirmer le comportement **sur le transport utilisé** (poll/result ou direct loopback selon scénario).

### 6.6 Points d'attention spécifiques au mode NAT (à vérifier en réel)

Lors de la préparation de ces livrables, la lecture du code a mis en évidence des éléments à **valider explicitement** pendant l'exécution réelle (sans conclure à un bug sans reproduction) :

- `services/engine/internal/agentclient/nat.go` : la résolution d'identité/clé par serveur et le remplissage de certains champs (`applicationId`, type d'opération dans le chemin poll) doivent être confrontés au contrat `protocol.Operation` et au comportement observé.
- `services/engine/internal/api/agent_poll_result.go` : la construction de la signature/forme canonique côté poll/result, l'usage du nonce/horodatage, et la vérification côté result doivent correspondre exactement à ce que l'agent attend (`operationkey`/client long-poll).
- Gestion des résultats/ack en file (`agentpoll`) : sémantique de replay et corrélation ack↔result.

**Action requise :** pendant la preuve réelle, capturer les erreurs exactes (codes, messages, logs) et, si un écart est confirmé, ouvrir des correctifs séparés avant de déclarer #13 clos.

## 7. Rapport de preuve attendu

Créer un dossier `evidence/issue-13/YYYYMMDD-HHMMZ/` (non commité si sensible) :

- `metadata.txt` : versions, SHAs, topologie (IP/roles), URLs, horloges.
- `enrollment/` : requêtes bootstrap/register (tokens masqués), réponses, fichiers de preuve de persistance (noms/permissions, jamais le contenu secret).
- `heartbeat-poll/` : extraits de logs montrant activité stable.
- `deployment/` : corrélation déploiement↔opérations↔résultat.
- `network-cut/` : commande de coupure, durée mesurée, journaux, état avant/après.
- `rotation-revocation/` : requêtes/réponses et effets observés.
- `deviations.md` : écarts code/doc/comportement.

## 8. Mises à jour documentaires après preuve réelle (uniquement si observé)

1. `docs/architecture/agent-failure-matrix.md` : ajouter une colonne/section « Observé sur infra réelle » avec date et conditions ; corriger les gaps si résolus.
2. `docs/security/threat-model.md` : mettre à jour G7/T29 et les scénarios #13 avec preuves observées ; conserver les risques résiduels réels.
3. `docs/roadmap/parallel-plan.md` : retirer les éléments de « Still not proven » uniquement lorsqu'ils sont effectivement prouvés.
4. `docs/operations/runbook.md` : ajouter les procédures opérationnelles validées.

**Ne pas pré-remplir ces sections avec des résultats supposés.**
