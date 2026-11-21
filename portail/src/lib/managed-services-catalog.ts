/**
 * Catalogue unifié des services managés (#182).
 *
 * Indexe les bases managées, les services one-click Coolify et les candidats EFLEX-gérés
 * avec une présentation fidèle : disponibilité réelle/actionnable, capacités, prérequis,
 * limites et parcours associé. Les capacités des moteurs de base restent gouvernées par
 * `database-capabilities.ts` (#183) ; ce catalogue complète l'expérience et l'exposition.
 */

export type ServiceCategory = 'database' | 'cache' | 'storage' | 'search' | 'messaging' | 'vector' | 'observability' | 'backend'

/**
 * Disponibilité déclarée du service dans le catalogue :
 * - available : géré comme base managée EFLEX (selon capacités runtime).
 * - coolify-oneclick : provisionnable via modèle Coolify (si template/instance compatible).
 * - eflex-managed : parcours EFLEX-géré prévu (non provisionnable automatiquement sans adaptateur activé).
 * - planned : référencé, sans parcours de provisionnement actuel.
 */
export type ServiceAvailability = 'available' | 'coolify-oneclick' | 'eflex-managed' | 'planned'

export type ServiceActionKind = 'managed-database' | 'coolify-service' | 'planned'

export interface ManagedServiceEntry {
  id: string
  label: string
  category: ServiceCategory
  description: string
  availability: ServiceAvailability
  /** Moteur/base déjà géré comme base managée EFLEX. */
  managedDatabaseKind?: string
  /** Type de service one-click Coolify (`POST /services { type }`) quand provisionnable via Coolify. */
  coolifyServiceType?: string
  /** Icône (clé simple-icons / ServiceIcon). */
  icon: string
  notes?: string
  /** Prérequis (instance, configuration, validation) — informatifs et factuels. */
  prerequisites?: string[]
  /** Limites connues (sécurité, sauvegardes, maturité, exploitation). */
  limits?: string[]
  /** Parcours actionnable associé. */
  action?: ServiceActionKind
}

export const MANAGED_SERVICES_CATALOG: readonly ManagedServiceEntry[] = [
  // Bases managées (indexées) — capacités réelles gouvernées par database-capabilities.ts
  {
    id: 'postgresql',
    label: 'PostgreSQL',
    category: 'database',
    description: 'Base relationnelle robuste (OLTP, extensions).',
    availability: 'available',
    managedDatabaseKind: 'postgresql',
    icon: 'postgresql',
    action: 'managed-database',
    prerequisites: ['API des bases managées disponible sur l’hébergement.'],
    limits: ['Une instance par type de base et par projet.', 'Accès privé (réseau interne) ; URL chiffrée injectée.'],
  },
  {
    id: 'mysql',
    label: 'MySQL',
    category: 'database',
    description: 'Base relationnelle populaire (PHP/WordPress/Laravel).',
    availability: 'available',
    managedDatabaseKind: 'mysql',
    icon: 'mysql',
    action: 'managed-database',
    prerequisites: ['API des bases managées disponible sur l’hébergement.', 'Moteur supporté par la version/configuration de l’instance.'],
    limits: ['Sauvegarde/restauration intégrées EFLEX non disponibles (outils natifs requis).', 'Support dépendant de l’instance.'],
  },
  {
    id: 'mariadb',
    label: 'MariaDB',
    category: 'database',
    description: 'Base relationnelle compatible MySQL, open source.',
    availability: 'available',
    managedDatabaseKind: 'mariadb',
    icon: 'mariadb',
    action: 'managed-database',
    prerequisites: ['API des bases managées disponible sur l’hébergement.', 'Moteur supporté par la version/configuration de l’instance.'],
    limits: ['Sauvegarde/restauration intégrées EFLEX non disponibles (outils natifs requis).', 'Support dépendant de l’instance.'],
  },
  {
    id: 'mongodb',
    label: 'MongoDB',
    category: 'database',
    description: 'Base documentaire NoSQL (JSON flexible).',
    availability: 'available',
    managedDatabaseKind: 'mongodb',
    icon: 'mongodb',
    action: 'managed-database',
    prerequisites: ['API des bases managées disponible sur l’hébergement.', 'Moteur supporté par la version/configuration de l’instance.'],
    limits: ['Sauvegarde/restauration intégrées EFLEX non disponibles (outils natifs requis).', 'Support dépendant de l’instance.'],
  },
  {
    id: 'clickhouse',
    label: 'ClickHouse',
    category: 'database',
    description: 'Base analytique/OLAP orientée colonnes (logs, métriques).',
    availability: 'available',
    managedDatabaseKind: 'clickhouse',
    icon: 'clickhouse',
    action: 'managed-database',
    prerequisites: ['API des bases managées disponible sur l’hébergement.', 'Driver/protocole compatible côté application.'],
    limits: ['Sauvegarde/restauration intégrées EFLEX non disponibles.', 'Support dépendant de l’instance.'],
  },
  {
    id: 'sqlite',
    label: 'SQLite',
    category: 'database',
    description: 'Base embarquée légère (fichier), support expérimental.',
    availability: 'available',
    managedDatabaseKind: 'sqlite',
    icon: 'sqlite',
    action: 'managed-database',
    notes: 'Expérimental : non activé par défaut, validation instance requise.',
    prerequisites: ['Validation explicite du comportement sur l’instance (URL, persistance, cycle de vie).', 'Activation expérimentale requise par la plateforme si applicable.'],
    limits: ['Aucune sauvegarde/restauration intégrée EFLEX.', 'Ne pas utiliser comme base critique sans stratégie validée.', 'Format/chemin dépendant de l’hébergement.'],
  },

  // Cache / données en mémoire
  {
    id: 'redis',
    label: 'Redis / Valkey',
    category: 'cache',
    description: 'Cache, sessions, files, pub/sub en mémoire.',
    availability: 'available',
    managedDatabaseKind: 'redis',
    icon: 'redis',
    action: 'managed-database',
    limits: ['Aucune sauvegarde/restauration intégrée EFLEX : usage cache/file recommandé.', 'Accès privé (réseau interne).'],
  },
  {
    id: 'dragonfly',
    label: 'Dragonfly',
    category: 'cache',
    description: 'Store en mémoire compatible Redis, haute performance.',
    availability: 'available',
    managedDatabaseKind: 'dragonfly',
    icon: 'dragonfly',
    action: 'managed-database',
    prerequisites: ['Moteur supporté par l’hébergement.'],
    limits: ['Aucune sauvegarde/restauration intégrée EFLEX.', 'Support dépendant de l’instance.'],
  },
  {
    id: 'keydb',
    label: 'KeyDB',
    category: 'cache',
    description: 'Alternative Redis multi-thread compatible.',
    availability: 'available',
    managedDatabaseKind: 'keydb',
    icon: 'keydb',
    action: 'managed-database',
    prerequisites: ['Moteur supporté par l’hébergement.'],
    limits: ['Aucune sauvegarde/restauration intégrée EFLEX.', 'Support dépendant de l’instance.'],
  },

  // Stockage objet — provisionnable via template Coolify (one-click) quand disponible
  {
    id: 'minio',
    label: 'MinIO (S3)',
    category: 'storage',
    description: 'Stockage objet compatible S3 pour fichiers, médias et backups.',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'minio',
    icon: 'minio',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi « minio » disponible sur l’hébergement.', 'Configuration (clés, buckets, domaine) à valider après provisionnement.'],
    limits: ['Cycle de vie et variables gérés comme un service (configuration avancée hors parcours simplifié).', 'Sécuriser l’exposition réseau et les identifiants.'],
    notes: 'Création automatique. Un parcours EFLEX-géré dédié pourra compléter les garanties opérationnelles.',
  },

  // Recherche
  {
    id: 'meilisearch',
    label: 'Meilisearch',
    category: 'search',
    description: 'Moteur de recherche full-text rapide et tolérant aux fautes.',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'meilisearch',
    icon: 'meilisearch',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.'],
    limits: ['Variables/clés et exposition réseau à configurer selon les besoins.'],
  },
  {
    id: 'typesense',
    label: 'Typesense',
    category: 'search',
    description: 'Recherche instantanée, typo-tolerante, facile à opérer.',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'typesense',
    icon: 'typesense',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.'],
    limits: ['Configuration et clés API à valider après provisionnement.'],
  },
  {
    id: 'elasticsearch',
    label: 'Elasticsearch',
    category: 'search',
    description: 'Recherche et analytics distribués (ELK).',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'elasticsearch',
    icon: 'elasticsearch',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.', 'Ressources serveur suffisantes (mémoire/CPU).'],
    limits: ['Service consommateur de ressources ; sécuriser l’accès et les identifiants.'],
  },
  {
    id: 'opensearch',
    label: 'OpenSearch',
    category: 'search',
    description: 'Fork open source d’Elasticsearch pour recherche/observabilité.',
    availability: 'coolify-oneclick',
    icon: 'opensearch',
    action: 'planned',
    notes: 'Référencé ; pas encore disponible dans le portail. Installation manuelle possible selon l’hébergement.',
    limits: ['Non provisionnable automatiquement depuis EFLEX pour le moment.'],
  },

  // Messagerie / streaming
  {
    id: 'rabbitmq',
    label: 'RabbitMQ',
    category: 'messaging',
    description: 'Broker de messages (AMQP), files fiables et routage.',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'rabbitmq',
    icon: 'rabbitmq',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.'],
    limits: ['Identifiants et accès réseau à sécuriser.'],
  },
  {
    id: 'nats',
    label: 'NATS',
    category: 'messaging',
    description: 'Messagerie légère, streaming et requête/réponse cloud-native.',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'nats',
    icon: 'nats',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.'],
    limits: ['Configuration des sujets/authentification selon les besoins.'],
  },
  {
    id: 'kafka',
    label: 'Kafka',
    category: 'messaging',
    description: 'Streaming d’événements distribué haute capacité.',
    availability: 'coolify-oneclick',
    icon: 'kafka',
    action: 'planned',
    notes: 'Référencé ; pas encore disponible dans le portail.',
    limits: ['Non provisionnable automatiquement depuis EFLEX pour le moment.', 'Exige des ressources et une exploitation dédiées.'],
  },

  // Vector / IA — candidat EFLEX-géré (#181)
  {
    id: 'qdrant',
    label: 'Qdrant',
    category: 'vector',
    description: 'Base vectorielle pour RAG, recherche sémantique et IA.',
    availability: 'eflex-managed',
    icon: 'qdrant',
    action: 'planned',
    notes: 'Candidat prioritaire de provider EFLEX-géré (persistance, réseau privé, healthcheck, secrets, sauvegardes) — non activé sans adaptateur validé.',
    prerequisites: ['Adaptateur/provider EFLEX-géré validé et activé (non livré par défaut).'],
    limits: ['Aucun provisionnement automatique tant que l’adaptateur concret n’est pas activé.'],
  },
  {
    id: 'pgvector',
    label: 'pgvector (PostgreSQL)',
    category: 'vector',
    description: 'Recherche vectorielle dans PostgreSQL (extension).',
    availability: 'planned',
    icon: 'postgresql',
    action: 'planned',
    notes: 'Via PostgreSQL managé avec extension/configuration adaptée (à valider par projet).',
    limits: ['Extension et configuration non gérées automatiquement.'],
  },

  // Observabilité
  {
    id: 'prometheus',
    label: 'Prometheus',
    category: 'observability',
    description: 'Collecte de métriques et alerting.',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'prometheus',
    icon: 'prometheus',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.'],
    limits: ['Configuration des cibles/rétention à adapter.'],
  },
  {
    id: 'grafana',
    label: 'Grafana',
    category: 'observability',
    description: 'Tableaux de bord et visualisation métriques/logs.',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'grafana',
    icon: 'grafana',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.'],
    limits: ['Sécuriser l’accès et les comptes administrateurs.'],
  },

  // Backend / plateformes
  {
    id: 'supabase',
    label: 'Supabase',
    category: 'backend',
    description: 'Backend open source (Postgres, auth, storage, realtime).',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'supabase',
    icon: 'supabase',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.', 'Ressources serveur suffisantes.'],
    limits: ['Stack multi-composants : configuration et mises à jour à superviser.'],
  },
  {
    id: 'appwrite',
    label: 'Appwrite',
    category: 'backend',
    description: 'Backend platform (auth, DB, fonctions, storage).',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'appwrite',
    icon: 'appwrite',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.'],
    limits: ['Configuration initiale et sécurisation requises.'],
  },
  {
    id: 'pocketbase',
    label: 'PocketBase',
    category: 'backend',
    description: 'Backend léger en un fichier (auth, DB, fichiers, realtime).',
    availability: 'coolify-oneclick',
    coolifyServiceType: 'pocketbase',
    icon: 'pocketbase',
    action: 'coolify-service',
    prerequisites: ['Modèle prêt à l’emploi disponible sur l’hébergement.'],
    limits: ['Persistance et sauvegardes à valider selon le volume de données.'],
  },
] as const

export const SERVICE_CATEGORIES: Record<ServiceCategory, string> = {
  database: 'Bases de données',
  cache: 'Cache & mémoire',
  storage: 'Stockage objet',
  search: 'Recherche',
  messaging: 'Messagerie & streaming',
  vector: 'Vectoriel & IA',
  observability: 'Observabilité',
  backend: 'Backend & plateformes',
}

export const SERVICE_AVAILABILITY: Record<ServiceAvailability, { label: string; tone: 'success' | 'info' | 'warning' | 'muted' }> = {
  available: { label: 'Base managée', tone: 'success' },
  'coolify-oneclick': { label: 'Prêt à l’emploi', tone: 'info' },
  'eflex-managed': { label: 'Bientôt géré par EFLEX', tone: 'warning' },
  planned: { label: 'À venir', tone: 'muted' },
}
