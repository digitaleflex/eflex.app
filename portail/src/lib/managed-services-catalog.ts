/**
 * Catalogue des services managés (bases + services complémentaires).
 * Sert à indexer sur l'interface ce qui est disponible, exposable via Coolify, ou ajoutable par EFLEX.
 */

export type ServiceCategory = 'database' | 'cache' | 'storage' | 'search' | 'messaging' | 'vector' | 'observability' | 'backend'
export type ServiceAvailability = 'available' | 'coolify-oneclick' | 'eflex-managed' | 'planned'

export interface ManagedServiceEntry {
  id: string
  label: string
  category: ServiceCategory
  description: string
  availability: ServiceAvailability
  /** Moteur/base déjà géré comme base managée EFLEX. */
  managedDatabaseKind?: string
  /** Icône (clé simple-icons / ServiceIcon). */
  icon: string
  notes?: string
}

export const MANAGED_SERVICES_CATALOG: readonly ManagedServiceEntry[] = [
  // Bases managées (indexées)
  { id: 'postgresql', label: 'PostgreSQL', category: 'database', description: 'Base relationnelle robuste (OLTP, extensions).', availability: 'available', managedDatabaseKind: 'postgresql', icon: 'postgresql' },
  { id: 'mysql', label: 'MySQL', category: 'database', description: 'Base relationnelle populaire (PHP/WordPress/Laravel).', availability: 'available', managedDatabaseKind: 'mysql', icon: 'mysql' },
  { id: 'mariadb', label: 'MariaDB', category: 'database', description: 'Base relationnelle compatible MySQL, open source.', availability: 'available', managedDatabaseKind: 'mariadb', icon: 'mariadb' },
  { id: 'mongodb', label: 'MongoDB', category: 'database', description: 'Base documentaire NoSQL (JSON flexible).', availability: 'available', managedDatabaseKind: 'mongodb', icon: 'mongodb' },
  { id: 'clickhouse', label: 'ClickHouse', category: 'database', description: 'Base analytique/OLAP orientée colonnes (logs, métriques).', availability: 'available', managedDatabaseKind: 'clickhouse', icon: 'clickhouse' },
  { id: 'sqlite', label: 'SQLite', category: 'database', description: 'Base embarquée légère (fichier), selon support instance.', availability: 'available', managedDatabaseKind: 'sqlite', icon: 'sqlite', notes: 'À valider sur l’instance Coolify.' },

  // Cache / données en mémoire
  { id: 'redis', label: 'Redis / Valkey', category: 'cache', description: 'Cache, sessions, files, pub/sub en mémoire.', availability: 'available', managedDatabaseKind: 'redis', icon: 'redis' },
  { id: 'dragonfly', label: 'Dragonfly', category: 'cache', description: 'Store en mémoire compatible Redis, haute performance.', availability: 'available', managedDatabaseKind: 'dragonfly', icon: 'dragonfly' },
  { id: 'keydb', label: 'KeyDB', category: 'cache', description: 'Alternative Redis multi-thread compatible.', availability: 'available', managedDatabaseKind: 'keydb', icon: 'keydb' },

  // Stockage objet
  { id: 'minio', label: 'MinIO (S3)', category: 'storage', description: 'Stockage objet compatible S3 pour fichiers, médias et backups.', availability: 'eflex-managed', icon: 'minio', notes: 'Ajoutable comme service EFLEX-géré (volume, réseau privé, credentials).' },

  // Recherche
  { id: 'meilisearch', label: 'Meilisearch', category: 'search', description: 'Moteur de recherche full-text rapide et tolérant aux fautes.', availability: 'eflex-managed', icon: 'meilisearch', notes: 'Exposable via Coolify one-click ou service EFLEX-géré.' },
  { id: 'typesense', label: 'Typesense', category: 'search', description: 'Recherche instantanée, typo-tolerante, facile à opérer.', availability: 'eflex-managed', icon: 'typesense' },
  { id: 'elasticsearch', label: 'Elasticsearch', category: 'search', description: 'Recherche et analytics distribués (ELK).', availability: 'coolify-oneclick', icon: 'elasticsearch', notes: 'Disponible comme service Coolify ; exposition dans EFLEX à venir.' },
  { id: 'opensearch', label: 'OpenSearch', category: 'search', description: 'Fork open source d’Elasticsearch pour recherche/observabilité.', availability: 'coolify-oneclick', icon: 'opensearch' },

  // Messagerie / streaming
  { id: 'rabbitmq', label: 'RabbitMQ', category: 'messaging', description: 'Broker de messages (AMQP), files fiables et routage.', availability: 'eflex-managed', icon: 'rabbitmq', notes: 'Exposable via Coolify one-click ou service EFLEX-géré.' },
  { id: 'nats', label: 'NATS', category: 'messaging', description: 'Messagerie légère, streaming et requête/réponse cloud-native.', availability: 'eflex-managed', icon: 'nats' },
  { id: 'kafka', label: 'Kafka', category: 'messaging', description: 'Streaming d’événements distribué haute capacité.', availability: 'coolify-oneclick', icon: 'kafka', notes: 'Disponible comme service Coolify ; intégration EFLEX à venir.' },

  // Vector / IA
  { id: 'qdrant', label: 'Qdrant', category: 'vector', description: 'Base vectorielle pour RAG, recherche sémantique et IA.', availability: 'eflex-managed', icon: 'qdrant', notes: 'Candidat prioritaire service EFLEX-géré (pointe IA).' },
  { id: 'pgvector', label: 'pgvector (PostgreSQL)', category: 'vector', description: 'Recherche vectorielle dans PostgreSQL (extension).', availability: 'planned', icon: 'postgresql', notes: 'Via PostgreSQL managé avec extension/config adaptée.' },

  // Observabilité
  { id: 'prometheus', label: 'Prometheus', category: 'observability', description: 'Collecte de métriques et alerting.', availability: 'coolify-oneclick', icon: 'prometheus', notes: 'Exposable comme service Coolify/stack.' },
  { id: 'grafana', label: 'Grafana', category: 'observability', description: 'Tableaux de bord et visualisation métriques/logs.', availability: 'coolify-oneclick', icon: 'grafana' },

  // Backend / plateformes
  { id: 'supabase', label: 'Supabase', category: 'backend', description: 'Backend open source (Postgres, auth, storage, realtime).', availability: 'coolify-oneclick', icon: 'supabase', notes: 'Stack one-click Coolify ; exposition/gestion EFLEX à cadrer.' },
  { id: 'appwrite', label: 'Appwrite', category: 'backend', description: 'Backend platform (auth, DB, fonctions, storage).', availability: 'coolify-oneclick', icon: 'appwrite' },
  { id: 'pocketbase', label: 'PocketBase', category: 'backend', description: 'Backend léger en un fichier (auth, DB, fichiers, realtime).', availability: 'coolify-oneclick', icon: 'pocketbase' },
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
  available: { label: 'Disponible', tone: 'success' },
  'coolify-oneclick': { label: 'Via Coolify (one-click)', tone: 'info' },
  'eflex-managed': { label: 'EFLEX-géré (planifié)', tone: 'warning' },
  planned: { label: 'À venir', tone: 'muted' },
}
