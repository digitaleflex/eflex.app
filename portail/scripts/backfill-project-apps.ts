/**
 * Backfill D2 (lot B) : crée l'application principale de chaque projet
 * existant et rattache ses déploiements historiques.
 *
 * Depuis la RACINE du dépôt :
 *   pnpm exec tsx portail/scripts/backfill-project-apps.ts                 # simulation
 *   pnpm exec tsx portail/scripts/backfill-project-apps.ts --dry-run        # idem
 *   pnpm exec tsx portail/scripts/backfill-project-apps.ts --apply          # écrit
 *   pnpm exec tsx portail/scripts/backfill-project-apps.ts --batch=500      # pagination
 *
 * Aucune écriture sans `--apply`. Idempotent : un projet qui possède déjà une
 * `ProjectApp` est ignoré, jamais dupliqué. Les variables (`EnvVar.appId`) et
 * les alias DNS (`ProjectDomain.appId`) restent de portée projet (`null`) : le
 * worker actuel les diffuse à l'unique application, et le backfill ne doit pas
 * changer ce comportement. Le script n'affiche jamais de secret : uniquement des
 * slugs de projet, des noms d'application et des compteurs.
 *
 * Prérequis : migration `20261110170000_project_apps` appliquée
 * (`npx prisma migrate deploy` depuis `portail/`).
 */
import { PrismaClient } from '@prisma/client'
import {
  HelpRequestedError,
  parseBackfillArgs,
  runBackfill,
} from '../src/lib/project-app-backfill'

const USAGE = `Backfill D2 : une application par projet existant.

Usage : pnpm exec tsx portail/scripts/backfill-project-apps.ts [options]

Options :
  --dry-run       Simule sans écrire (défaut).
  --apply         Écrit en base : crée les ProjectApp et rattache les Deployment.
  --batch=N       Projets lus par page (défaut 200).
  -h, --help      Affiche cette aide.
`

/** Nom de la base ciblée, sans identifiants ni hôte (journalisation sûre). */
function databaseLabel(url: string | undefined): string {
  if (!url) return '(DATABASE_URL absente)'
  try {
    return new URL(url).pathname.replace(/^\/+/, '') || '(sans nom)'
  } catch {
    return '(URL illisible)'
  }
}

async function main(): Promise<void> {
  let options
  try {
    options = parseBackfillArgs(process.argv.slice(2))
  } catch (error) {
    if (error instanceof HelpRequestedError) {
      console.log(USAGE)
      return
    }
    console.error(error instanceof Error ? error.message : String(error))
    console.error(USAGE)
    process.exitCode = 2
    return
  }

  const prisma = new PrismaClient()
  try {
    const mode = options.apply ? 'écriture' : 'lecture seule (--dry-run)'
    console.log(`Backfill ProjectApp — mode ${mode}`)
    console.log(`Base ciblée : ${databaseLabel(process.env.DATABASE_URL)}`)
    console.log(`Pagination : ${options.batchSize} projet(s) par page`)

    const totals = await runBackfill({ ...options, prisma })

    console.log('')
    console.log(`Projets examinés             : ${totals.projects}`)
    console.log(`Applications créées          : ${totals.created}`)
    console.log(`Projets déjà backfillés      : ${totals.skippedExisting}`)
    console.log(`Projets sans plan exploitable: ${totals.skippedNoPlan}`)
    console.log(`Domaines en conflit          : ${totals.domainConflicts}`)
    console.log(`Déploiements rattachés       : ${totals.deploymentsAttached}`)
    console.log(`Erreurs                      : ${totals.errors}`)
    if (!options.apply) {
      console.log('')
      console.log('Aucune écriture effectuée. Relancez avec --apply pour appliquer.')
    }
    if (totals.errors > 0) process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error('Backfill échoué :', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
