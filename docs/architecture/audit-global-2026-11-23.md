# Audit global — E-FLEX et dépôts associés (23 novembre 2026)

> **But** : faire le point sur l'ensemble du système avant de dessiner l'architecture globale.
> **Périmètre** : `eflex.app` (portail + moteur Axiom en pause), `eflex-build-fleet`, `aura-storage`, et l'infrastructure qu'ils supposent (Coolify, Traefik, serveurs, Backblaze B2).
> **Méthode** : lecture des dépôts à jour au 23 novembre, tests lancés en local pour `eflex.app` et `eflex-build-fleet`. **Aucun accès aux serveurs**, à Coolify ni aux comptes de stockage : tout constat sur la production est déduit du code et de la documentation. Détail du portail : `audit-2026-11-23.md`.

## 1. Carte d'ensemble

```
                     Clients (développeurs, agences)
                                  │ HTTPS
                ┌─────────── Traefik (bord) ───────────┐
                ▼                                      ▼
   E-FLEX App (portail Next.js)                 Sites des clients
   plan de contrôle : comptes, projets,         (conteneurs Coolify)
   déploiements, facturation, supervision              ▲
        │ API              │ (futur)                   │ exécution
        ▼                  ▼                           │
     Coolify ──────► Build Fleet (Go, en dev)          │
  build + runtime     plan de build cible    ──images──┘
        │
        │ sauvegardes (S3)
        ▼
   AURA Storage (SeaweedFS + API Python)  ◄── produit autonome aussi (fichiers, partages, audio)
   Backblaze B2 (copie externe)

   Outils d'exploitation : Uptime Kuma, Beszel, Dozzle (réseau privé Tailscale)
   Services tiers : GitHub (App, webhooks), Kkiapay, FedaPay, Resend, Google (connexion)
```

## 2. État de chaque dépôt

| | **eflex.app** | **eflex-build-fleet** | **aura-storage** |
|---|---|---|---|
| Rôle | Plan de contrôle + interface client | Plan de build (cible) | Stockage objet + produit de fichiers |
| Stack | Next.js 15, React 19, Prisma, BullMQ, Better Auth ; Go (Axiom, en pause) | Go, PostgreSQL | API FastAPI (Python), interface React (Vite, TanStack), SeaweedFS, PostgreSQL, Traefik |
| Taille | ≈ 90 000 lignes TS + ≈ 61 000 lignes Go en pause | ≈ 1 400 lignes Go, 6 fichiers de tests | ≈ 15 000 lignes Python + ≈ 35 000 lignes interface, 709 commits |
| Stade | **En production** (5 clients) | **Début de la phase 1** ; aucun build de bout en bout prouvé | **Pilote** sur un VPS InterServer, preuves partielles datées |
| CI de `main` le 23/11 | **Rouge** (3 tests de garde-fou après la refonte de l'accueil) → corrigé par #222 | **Rouge** (test de l'exécuteur écrit pour Windows) → corrigé par digitaleflex/eflex-build-fleet#27 | Non vérifiée (accès API GitHub non activé pour ce dépôt dans la session) |
| Ouvert | 41 issues, 4 PR | 16 issues, 7 PR | 28 issues, 10 PR |
| Documentation | Riche (ADR, audits, exploitation) ; documentation publique Starlight démarrée | Riche (10 ADR, modèle de menaces, feuille de route) | Très riche (architecture, journaux de vérification, runbooks) |
| Sauvegarde propre | Script + preuve de restauration à faire | Plan documenté, rien en place | **Différée** (décision du 2026-10-21, issue #9) |

## 3. Constats transverses

### Critiques
**G1. AURA n'est pas encore une destination de sauvegarde fiable.** Il est prévu comme l'une des deux copies des sauvegardes d'E-FLEX, mais : (a) sa propre sauvegarde indépendante est **différée** par décision écrite, « avant toute mise en production avec des données réelles » ; (b) il tourne sur **un seul VPS** ; (c) je n'ai pas trouvé de réplication SeaweedFS configurée dans `docker-compose.yml`. Aujourd'hui, la seule copie externe robuste serait **Backblaze B2**. *À faire avant de compter sur AURA* : lever la décision différée (issue #9), tester une restauration complète d'AURA, confirmer qu'AURA n'est pas sur la même machine que le portail.

**G2. CI de `main` rouge dans deux dépôts sur trois aujourd'hui**, et des fusions possibles malgré une CI rouge (déjà constaté du 19 au 23 novembre sur `eflex.app`). Aucune protection de branche observée. *À faire* : exiger les vérifications avant toute fusion, dans les trois dépôts.

**G3. Points de défaillance uniques partout** : un serveur pour E-FLEX (portail, base, Redis, Coolify et sites clients), un VPS pour AURA, rien encore pour le build. Une panne de l'un arrête la fonction entière.

### Importants
**G4. Quatre bases de code pour une personne** : portail (TypeScript), Axiom (Go, en pause), Build Fleet (Go), AURA (Python + React). Trois langages, trois chaînes de déploiement, trois CI. La règle « un seul moteur Go à terme » (ADR-0009 de Build Fleet) n'est pas tenue.

**G5. Trois systèmes d'identité séparés** : Better Auth (portail), authentification propre d'AURA (avec connexion Google), jeton et mTLS prévu (Build Fleet). Aucun contrat d'identité de service à service n'est écrit (qui appelle qui, avec quel jeton, comment on le révoque).

**G6. Décisions d'architecture dispersées** : chaque dépôt numérote ses ADR ; des décisions croisées vivent dans deux dépôts (ADR-0010 de Build Fleet et ADR-0014 du portail). Aucun registre global.

**G7. Pas d'observabilité commune** : pas de source de mesures pour les ressources (portail), outils de supervision installables mais non branchés, journaux dispersés entre Docker, Coolify et chaque service.

**G8. AURA mélange deux produits** : une brique de stockage (S3, sauvegardes) et un produit grand public (partages, portail audio, audiobook en préparation). Si AURA devient une brique d'E-FLEX, ce mélange élargit sa surface d'attaque et ses raisons de tomber en panne.

### À surveiller
- **Build Fleet** : la plupart des fichiers Go ne sont pas au format `gofmt` (probablement des fins de ligne Windows) ; à normaliser avant que le code grossisse.
- **Portail** : Redis sans persistance pour la file des déploiements, web + worker + sondes dans un même processus (voir audit du portail).
- **Documentation publique** : `docs.eflex.app` (Starlight) vient d'être créée ; garder séparés documents internes et publics.

## 4. Décisions à prendre pour l'architecture globale

| # | Question | Options | Ce qui en dépend |
|---|---|---|---|
| D1 | **Rôle d'AURA** | (a) brique de stockage d'E-FLEX (sauvegardes, stockage objet vendu aux clients) ; (b) produit séparé qui n'est qu'un client de B2 ; (c) les deux, mais avec un déploiement séparé pour la partie brique | Plan de sauvegarde, sécurité, priorités d'AURA |
| D2 | **Moteur Go unique** | Build Fleet reprend les agents d'Axiom, ou Axiom est archivé hors du dépôt | Charge de maintenance, CI |
| D3 | **Topologie des serveurs** | Combien de machines, quel rôle (contrôle, runtime, build, stockage, sauvegardes), quels fournisseurs, quels domaines de panne | Tout le reste |
| D4 | **Réseau privé** | Tailscale entre tous les composants (prévu pour les outils et Build Fleet) | Sécurité, accès aux outils |
| D5 | **Identité de service à service** | Jetons par service avec rotation, ou mTLS partout | Sécurité, révocation |
| D6 | **Règle de sauvegarde** | 3-2-1 : 3 copies, 2 supports, 1 hors site, + restauration testée périodiquement | Confiance des clients |
| D7 | **Organisation des dépôts et décisions** | Un registre global d'ADR (dans `eflex.app` ou un dépôt d'architecture) | Lisibilité, cohérence |

## 5. Esquisse d'architecture cible (à discuter, non décidée)

| Plan | Composant | Aujourd'hui | Cible |
|---|---|---|---|
| Contrôle | E-FLEX App | Portail + worker dans un processus | Portail et worker séparés, Redis persistant |
| Exécution | Coolify | Un serveur partagé avec tout le reste | Un ou plusieurs serveurs dédiés aux sites clients, réseau par organisation |
| Build | Coolify Build Server → Build Fleet | Builds sur le serveur de production | Serveur de build dédié, puis Build Fleet après sa phase 2 |
| Stockage | AURA + Backblaze B2 | AURA pilote, sans sauvegarde propre | AURA (brique) sauvegardé + B2, règle 3-2-1 |
| Exploitation | Uptime Kuma, Beszel, Dozzle | Installables, pas branchés | Sur réseau privé, alimentant les mesures du portail |
| Bord | Traefik, DNS | Par serveur | Inchangé, nom stable pour le CNAME des clients |

## 6. Corrigé pendant cet audit
- `eflex.app` : CI de `main` (#222).
- `eflex-build-fleet` : CI de `main` (digitaleflex/eflex-build-fleet#27).

## 7. Limites
Pas de vérification sur les serveurs, pas d'exécution des tests d'AURA, CI d'AURA non consultée, aucune mesure de performance. Les tailles de code sont des comptages de lignes, pas une mesure de complexité. Les décisions du §4 et l'esquisse du §5 sont des propositions.
