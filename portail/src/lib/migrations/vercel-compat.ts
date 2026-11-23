/**
 * Rapport de compatibilité Vercel → EFLEX (issue #148, MIG-3) — analyse PURE, sans appel réseau.
 * Entrées : le contenu de `vercel.json` (fichier public et documenté) et les dépendances du `package.json`.
 * Règles explicites et documentées ici : aucun « score » n'est calculé, seulement des constats justifiés.
 * Rien n'est ignoré en silence : ce qui n'est pas reconnu est listé dans `unknown`.
 */
export type CompatLevel = 'ok' | 'reconfigure' | 'unsupported'

export interface CompatFinding {
  level: CompatLevel
  /** Identifiant stable de la règle. */
  rule: string
  title: string
  /** Action concrète pour l'utilisateur, en français. */
  action: string
}

export interface VercelCompatReport {
  findings: CompatFinding[]
  /** Clés de `vercel.json` non analysées : à vérifier à la main. */
  unknown: string[]
  counts: Record<CompatLevel, number>
}

const KNOWN_KEYS = new Set([
  '$schema', 'buildCommand', 'installCommand', 'outputDirectory', 'framework', 'devCommand', 'ignoreCommand',
  'crons', 'rewrites', 'redirects', 'headers', 'functions', 'regions', 'cleanUrls', 'trailingSlash', 'images',
  'git', 'github', 'public', 'version', 'builds', 'routes', 'env', 'build', 'projectSettings',
])

/** Dépendances Vercel : service géré qui n'existe pas chez nous (jamais ignoré). */
const VERCEL_SERVICES: Array<{ pkg: string; rule: string; title: string; action: string }> = [
  { pkg: '@vercel/kv', rule: 'dep-kv', title: 'Vercel KV', action: 'Remplacez par une base Redis (service EFLEX) et adaptez la connexion.' },
  { pkg: '@vercel/postgres', rule: 'dep-postgres', title: 'Vercel Postgres', action: 'Utilisez une base PostgreSQL EFLEX ; exportez les données avec pg_dump (transfert non automatique).' },
  { pkg: '@vercel/blob', rule: 'dep-blob', title: 'Vercel Blob', action: 'Prévoyez un stockage compatible S3 et adaptez le code d’envoi de fichiers.' },
  { pkg: '@vercel/edge-config', rule: 'dep-edge-config', title: 'Edge Config', action: 'Stockez cette configuration dans des variables d’environnement ou une base.' },
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

export function analyzeVercelCompat(vercelJson: unknown, dependencies: string[] = []): VercelCompatReport {
  const config = asRecord(vercelJson)
  const findings: CompatFinding[] = []
  const add = (f: CompatFinding) => findings.push(f)

  if (Array.isArray(config.crons) && config.crons.length > 0) {
    add({
      level: 'reconfigure',
      rule: 'crons',
      title: `${config.crons.length} tâche(s) planifiée(s) (crons Vercel)`,
      action: 'Recréez-les dans « Tâches planifiées » du projet (expression cron + commande). Les appels HTTP Vercel ne sont pas repris tels quels.',
    })
  }
  if (Array.isArray(config.regions) && config.regions.length > 0) {
    add({ level: 'reconfigure', rule: 'regions', title: 'Régions de déploiement', action: 'Le choix de région n’est pas repris : l’application tourne sur le serveur EFLEX.' })
  }
  const functions = asRecord(config.functions)
  if (Object.keys(functions).length > 0) {
    add({ level: 'reconfigure', rule: 'functions', title: 'Réglages de fonctions (durée, mémoire)', action: 'Appliquez les limites de mémoire dans la configuration applicative ; la durée maximale n’existe pas à l’identique.' })
  }
  for (const key of ['rewrites', 'redirects', 'headers'] as const) {
    if (Array.isArray(config[key]) && (config[key] as unknown[]).length > 0) {
      add({
        level: 'reconfigure',
        rule: key,
        title: `Règles « ${key} » de vercel.json`,
        action: 'Reprises par Next.js si elles sont aussi dans next.config ; sinon à reproduire dans votre serveur ou votre application.',
      })
    }
  }
  if (Array.isArray(config.builds) || Array.isArray(config.routes)) {
    add({ level: 'unsupported', rule: 'legacy-builds', title: 'Configuration Vercel v2 (builds/routes)', action: 'Ce format propre à Vercel n’est pas interprété : décrivez le build avec un Dockerfile ou les commandes standard.' })
  }
  if (typeof config.buildCommand === 'string' || typeof config.installCommand === 'string') {
    add({ level: 'ok', rule: 'commands', title: 'Commandes de build et d’installation', action: 'À reporter dans le plan du projet (étape « Nouveau projet »).' })
  }

  const deps = new Set(dependencies)
  for (const service of VERCEL_SERVICES) {
    if (deps.has(service.pkg)) add({ level: 'unsupported', rule: service.rule, title: service.title, action: service.action })
  }
  if (deps.has('@vercel/analytics') || deps.has('@vercel/speed-insights')) {
    add({ level: 'reconfigure', rule: 'dep-analytics', title: 'Vercel Analytics / Speed Insights', action: 'Ces mesures cessent de fonctionner hors Vercel ; utilisez l’analytique EFLEX ou retirez le composant.' })
  }
  if (deps.has('@vercel/og')) {
    add({ level: 'ok', rule: 'dep-og', title: '@vercel/og', action: 'Fonctionne en Node.js ; vérifiez le runtime Edge s’il est utilisé.' })
  }

  const unknown = Object.keys(config).filter((key) => !KNOWN_KEYS.has(key))
  const counts: Record<CompatLevel, number> = { ok: 0, reconfigure: 0, unsupported: 0 }
  for (const finding of findings) counts[finding.level] += 1
  return { findings, unknown, counts }
}
