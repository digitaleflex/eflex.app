# 19 — Roadmap ordonnée E-FLEX App

## Règle

La roadmap privilégie la protection des clients existants, la réduction du travail manuel et la viabilité économique. Une phase ne se clôture qu'avec des preuves ; un écran terminé ne suffit pas.

## Phase 0 — Aligner la documentation et les preuves

- Utiliser ce dossier comme référence architecture courante.
- Maintenir ADR-0012 et les frontières Axiom/Coolify à jour.
- Inventorier les serveurs, projets, bases, volumes, domaines et coûts.
- Inventorier ce qui est réellement activé en production (notamment les flags).
- Ne pas lancer de réécriture.

**Sortie :** inventaire vérifié et responsabilités claires.

## Phase 1 — Backup & Recovery (P0)

- Externaliser la sauvegarde de la base E-FLEX ; vérifier les clés et la procédure de reconstruction.
- Bases clientes PostgreSQL (#130) : planification, UI, restauration assistée et alertes en place ; généraliser la copie hors site (S3) et les tests réguliers de restauration.
- Définir une stratégie distincte pour volumes/fichiers (et Redis si données durables).
- Ajouter statut, rétention et preuves de restauration par ressource.
- Protéger les suppressions d'applications/volumes/bases.

**Sortie :** sauvegarde hors site et restauration réellement testée pour les ressources annoncées.

## Phase 2 — Observability des sites clients (P0/P1)

- Probes HTTP externes par application.
- Vérifications DNS/TLS.
- Incidents persistés, déduplication et notifications de rétablissement.
- Agrégation avec tickets et rapports.
- Métriques de ressources et saturation.

**Sortie :** E-FLEX détecte un incident client avant que le client ne le signale, dans le périmètre de surveillance contractuel.

## Phase 3 — Build Plane séparé (P1)

- Benchmark de trois applications représentatives.
- Configurer un build worker dédié pour les parcours compatibles.
- Définir la voie Compose distincte via CI/BuildKit.
- Brancher un registre existant.
- Images immuables, cache, limites de ressources et nettoyage.
- Déploiement du digest d'image, rollback applicatif.
- Maintenir l'ancien chemin en mode contrôlé jusqu'à validation.

**Sortie :** les builds ne perturbent pas les applications de production et les temps/coûts sont mesurés.

## Phase 4 — Qualifier les stacks réellement utilisées (P1)

- Tester des dépôts clients réels : Next.js/NestJS, Laravel/Symfony, Python et Compose selon les usages observés.
- Ajouter fixtures et tests de régression au détecteur/renderer.
- Documenter les limites ; exiger Dockerfile/Compose/eflex.json lorsque nécessaire.
- Ne pas promettre « toutes les stacks » sans preuve.

**Sortie :** matrice de compatibilité basée sur des tests reproductibles.

## Phase 5 — Expérience agence (P1/P2)

- Vue agrégée des organisations/clientèles accessibles.
- Clarifier si l'organisation par client reste suffisante ou si un modèle Client dédié est nécessaire.
- Rapport d'exploitation par site.
- Client final en lecture seule.
- Tickets liés aux projets et incidents.
- Suivi manuel du temps d'intervention au départ.

**Sortie :** une agence peut gérer un portefeuille de clients sans intervention administrative manuelle répétée.

## Phase 6 — Resource Governance & Billing (P2)

- Livrer les limites réelles de ressources (#131).
- Mesurer CPU/RAM/disque/build/storage par projet.
- Définir quotas et alertes.
- Faire évoluer la facturation à partir des coûts réels (#143).
- Distinguer infrastructure, plateforme et interventions humaines.

**Sortie :** chaque offre a une marge connue et les limites annoncées sont appliquées.

## Phase 7 — Différenciation contrôlée (P3)

- Rapports marque blanche avancés.
- Analytics déjà intégrées : améliorer les vues sans réécrire un moteur.
- Assistant de diagnostic et de configuration.
- Migration depuis une plateforme (priorité éventuelle Vercel, #148) seulement après backup/restore et mesure des migrations réussies.
- API publique et intégrations additionnelles selon la demande.

**Sortie :** fonctionnalités adoptées et monétisées, pas uniquement ajoutées.

## Hors séquence

Axiom, Kubernetes, multi-cloud, multi-région, stockage propriétaire, moteur SEO et SLA entreprise restent différés. Les réouvrir exige un besoin démontré, un ADR et une capacité d'exploitation.
