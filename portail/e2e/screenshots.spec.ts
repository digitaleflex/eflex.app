import { expect, test, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

/**
 * Captures visuelles reproductibles des pages clés (issue #80).
 *
 * Largeurs : 360, 768 et 1440 px. Thèmes : clair et sombre.
 * Les fichiers sont enregistrés dans `e2e/screenshots/<thème>/<largeur>/`.
 * Pour la console (tableau de bord), l’accueil est capturé avec la barre latérale
 * dépliée et repliée aux largeurs ≥ 768 px (issue #80).
 *
 * Parcours public toujours exécuté ; parcours authentifié si `PLAYWRIGHT_AUTH=1`
 * (mêmes prérequis que `a11y.spec.ts`, voir `e2e/seed-auth.mjs`).
 *
 * Lancer : `npx playwright test e2e/screenshots.spec.ts`
 *          `PLAYWRIGHT_AUTH=1 PLAYWRIGHT_ADMIN=1 npx playwright test e2e/screenshots.spec.ts`
 */

const THEMES = ['light', 'dark'] as const
const WIDTHS = [
  { label: '360', width: 360 },
  { label: '768', width: 768 },
  { label: '1440', width: 1440 },
] as const

const PUBLIC_PAGES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/status',
  '/maintenance',
  '/cette-page-nexiste-pas',
]

const AUTH_EMAIL = process.env.E2E_EMAIL ?? 'a11y-e2e@example.test'
const AUTH_PASSWORD = process.env.E2E_PASSWORD ?? 'E2e-Password-123!'
const AUTH = process.env.PLAYWRIGHT_AUTH === '1'
const ADMIN = process.env.PLAYWRIGHT_ADMIN === '1'

const DASHBOARD_PAGES = [
  '/dashboard',
  '/dashboard/new',
  '/dashboard/organization',
  '/dashboard/notifications',
  '/dashboard/settings',
  '/dashboard/activity',
]

const ADMIN_PAGES = [
  '/admin',
  '/admin/users',
  '/admin/projects',
  '/admin/deployments',
  '/admin/organizations',
  '/admin/payments',
  '/admin/audit',
]

function safeName(route: string) {
  if (route === '/') return 'accueil'
  return route.replace(/^\//, '').replace(/[/?=&]/g, '_').replace(/_+/g, '_').replace(/_$/, '')
}

async function setTheme(context: import('@playwright/test').BrowserContext, theme: string, baseURL: string) {
  await context.clearCookies({ name: 'eflex-theme' })
  await context.addCookies([{ name: 'eflex-theme', value: theme, domain: new URL(baseURL).hostname, path: '/' }])
}

/**
 * La barre latérale lit d'abord `localStorage` (`eflex:sidebar-collapsed`), écrit dès la première
 * visite : poser seulement le cookie laisserait donc l'état précédent. On pose les deux.
 */
async function setSidebar(
  context: import('@playwright/test').BrowserContext,
  page: Page,
  collapsed: boolean,
  baseURL: string,
) {
  await context.clearCookies({ name: 'eflex-sidebar' })
  await context.addCookies([
    { name: 'eflex-sidebar', value: collapsed ? 'collapsed' : 'expanded', domain: new URL(baseURL).hostname, path: '/' },
  ])
  await page.evaluate((value) => window.localStorage.setItem('eflex:sidebar-collapsed', value), collapsed ? '1' : '0')
}

async function capture(page: Page, route: string, theme: string, width: string, name?: string) {
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  const dir = path.join('e2e', 'screenshots', theme, width)
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, `${name ?? safeName(route)}.png`)
  await page.screenshot({ path: file, fullPage: true })
}

async function login(page: Page) {
  await page.goto('/login', { waitUntil: 'networkidle' })
  await page.getByLabel('Adresse e-mail').fill(AUTH_EMAIL)
  await page.getByLabel('Mot de passe').fill(AUTH_PASSWORD)
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await page.waitForURL('**/dashboard', { timeout: 120_000 })
}

async function projectId(page: Page): Promise<string | null> {
  const response = await page.request.get('/api/projects')
  if (!response.ok()) return null
  const data = (await response.json()) as { projects?: { id: string }[] }
  return data.projects?.[0]?.id ?? null
}

for (const theme of THEMES) {
  for (const viewport of WIDTHS) {
    test.describe(`captures publiques — ${theme} ${viewport.label} px`, () => {
      test.use({ hasTouch: viewport.width <= 480 })
      test.beforeEach(async ({ context, page, baseURL }) => {
        await page.setViewportSize({ width: viewport.width, height: 960 })
        await setTheme(context, theme, baseURL!)
      })

      for (const route of PUBLIC_PAGES) {
        test(`${route}`, async ({ page }) => {
          await capture(page, route, theme, viewport.label)
        })
      }
    })
  }
}

if (!AUTH) {
  test('captures authentifiées (non exécutées)', async () => {
    test.skip(true, 'Définir PLAYWRIGHT_AUTH=1 et une base de test (voir e2e/seed-auth.mjs).')
  })
} else {
  for (const theme of THEMES) {
    for (const viewport of WIDTHS) {
      test.describe(`captures authentifiées — ${theme} ${viewport.label} px`, () => {
        test.setTimeout(600_000)

        test('tableau de bord, projet, équipe et paramètres', async ({ browser, baseURL }) => {
          const context = await browser.newContext({
            viewport: { width: viewport.width, height: 960 },
            hasTouch: viewport.width <= 480,
            reducedMotion: 'reduce',
          })
          await setTheme(context, theme, baseURL!)
          const page = await context.newPage()
          await login(page)

          const id = await projectId(page)
          expect(id, 'Un projet de test doit exister (e2e/seed-auth.mjs).').not.toBeNull()

          const projectPages: Array<[string, string]> = [
            [`/dashboard/projects/${id}`, 'dashboard_projet_vue-ensemble'],
            [`/dashboard/projects/${id}?tab=deployments`, 'dashboard_projet_deploiements'],
            [`/dashboard/projects/${id}?tab=variables`, 'dashboard_projet_variables'],
            [`/dashboard/projects/${id}?tab=logs`, 'dashboard_projet_journaux'],
            [`/dashboard/projects/${id}/settings`, 'dashboard_projet_parametres'],
          ]

          for (const route of DASHBOARD_PAGES) {
            if (route === '/dashboard' && viewport.width >= 768) {
              await setSidebar(context, page, false, baseURL!)
              await capture(page, route, theme, viewport.label, 'dashboard_sidebar-depliee')
              await setSidebar(context, page, true, baseURL!)
              await capture(page, route, theme, viewport.label, 'dashboard_sidebar-repliee')
            } else {
              await capture(page, route, theme, viewport.label)
            }
          }
          for (const [route, name] of projectPages) {
            await capture(page, route, theme, viewport.label, name)
          }

          await context.close()
        })

        if (ADMIN) {
          test('administration', async ({ browser, baseURL }) => {
            const context = await browser.newContext({
              viewport: { width: viewport.width, height: 960 },
              hasTouch: viewport.width <= 480,
              reducedMotion: 'reduce',
            })
            await setTheme(context, theme, baseURL!)
            const page = await context.newPage()
            await login(page)
            for (const route of ADMIN_PAGES) {
              await capture(page, route, theme, viewport.label)
            }
            await context.close()
          })
        }
      })
    }
  }
}
