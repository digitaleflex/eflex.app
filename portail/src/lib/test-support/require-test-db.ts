import { assertTestDatabase } from './test-database'

/**
 * Exécuté par Vitest avant chaque fichier de test. Empêche les tests
 * d'intégration de tourner sur la base de production (voir #production).
 */
assertTestDatabase(process.env.DATABASE_URL, {
  enabled: process.env.EFLEX_TEST_DB === '1',
  nodeEnv: process.env.NODE_ENV,
})
