/**
 * Sous-domaines réservés à la plateforme : aucun projet client ne peut en prendre le nom (son domaine
 * par défaut `<slug>.<racine>` usurperait un service de la plateforme).
 */
export const RESERVED_SUBDOMAINS = new Set([
  // Outils d'exploitation (`lib/ops-tools.ts`).
  'uptime', 'metrics', 'logs',
  'www', 'api', 'app', 'admin', 'axiom', 'coolify', 'status', 'statut', 'dashboard', 'console', 'docs',
  'mail', 'smtp', 'imap', 'webmail', 'mx', 'ns1', 'ns2', 'cdn', 'static', 'assets', 'media', 'files',
  's3', 'storage', 'aura', 'backup', 'backups', 'build', 'builds', 'registry', 'monitor', 'monitoring',
  'grafana', 'traefik', 'proxy', 'auth', 'login', 'sso', 'support', 'help', 'billing', 'pay', 'paiement',
  'blog', 'eflex', 'staging', 'preview', 'test', 'dev',
])
