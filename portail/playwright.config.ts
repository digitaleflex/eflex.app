import { defineConfig, devices } from '@playwright/test'

/**
 * Tests d'accessibilité (issue #32) : Playwright + axe-core sur les pages publiques
 * et, si `PLAYWRIGHT_AUTH=1`, sur les parcours authentifiés (base de test requise).
 *
 * Vérifications :
 *   npx playwright install --with-deps chromium
 *   npx playwright test
 *
 * Le serveur est démarré automatiquement (`npm run dev` par défaut). En CI, le portail
 * est déjà construit : `PLAYWRIGHT_WEB_SERVER="npm run start -- --port 3000"`.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // Les animations de révélation sont neutralisées : axe ne doit pas mesurer
    // des éléments encore transparents.
    reducedMotion: 'reduce',
    launchOptions: { args: ['--no-sandbox'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? undefined
    : {
        command: process.env.PLAYWRIGHT_WEB_SERVER ?? `npm run dev -- --port ${new URL(baseURL).port || 3000}`,
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 240_000,
        // Le worker de déploiement n'a rien à faire dans une suite d'accessibilité.
        env: { REDIS_URL: '' },
      },
})
