/**
 * Garde-fou des tests d'intégration du portail.
 *
 * Les tests détruisent et créent des comptes/organisations : ils ne doivent
 * jamais toucher la base de production. On exige donc une base dont le nom
 * contient « test » quand `EFLEX_TEST_DB=1`.
 *
 * Ce module est pur et testé ; le fichier `require-test-db.ts` l'appelle au
 * démarrage de Vitest.
 */

export const TEST_DB_FLAG = 'EFLEX_TEST_DB'

export class UnsafeTestDatabaseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnsafeTestDatabaseError'
  }
}

/** Nom de base extrait d'une URL PostgreSQL (sans le paramètre `schema`). */
export function databaseName(databaseUrl: string | undefined): string | null {
  if (!databaseUrl) return null
  try {
    const parsed = new URL(databaseUrl)
    const name = parsed.pathname.replace(/^\/+/, '').trim()
    return name || null
  } catch {
    return null
  }
}

/**
 * Vérifie que la base est sûre pour les tests d'intégration.
 * Sans `EFLEX_TEST_DB=1`, les tests d'intégration sont ignorés : aucune erreur.
 */
export function assertTestDatabase(
  databaseUrl: string | undefined,
  options: { enabled: boolean; nodeEnv?: string | undefined },
): void {
  if (!options.enabled) return

  if (options.nodeEnv === 'production') {
    throw new UnsafeTestDatabaseError(
      'Refus de lancer les tests d’intégration avec NODE_ENV=production.',
    )
  }

  const name = databaseName(databaseUrl)
  if (!name) {
    throw new UnsafeTestDatabaseError(
      `${TEST_DB_FLAG}=1 exige une DATABASE_URL PostgreSQL valide.`,
    )
  }

  if (!/test/i.test(name)) {
    throw new UnsafeTestDatabaseError(
      `Refus de lancer les tests d’intégration sur la base « ${name} » : son nom doit contenir « test ». ` +
        'Utilisez une base dédiée (ex. eflex_test) et jamais la base de production.',
    )
  }
}
