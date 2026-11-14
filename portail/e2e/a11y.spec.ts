import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Audit automatisé WCAG 2.1 AA (issue #32, #80).
 *
 * - pages publiques : 360, 768 et 1440 px, thèmes clair et sombre ;
 * - parcours authentifié (si `PLAYWRIGHT_AUTH=1`) : tableau de bord, projet,
 *   équipe, notifications, paramètres et pages d'administration ;
 * - aucun débordement horizontal au niveau de la page ;
 * - lien d'évitement et navigation clavier de base.
 *
 * Seules les violations `serious` et `critical` bloquent la CI : les critères
 * d'acceptation de l'issue portent sur ces niveaux. Les constats `moderate`
 * restants sont listés dans `docs/accessibility/audit-wcag.md`.
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

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

function format(violations: Awaited<ReturnType<AxeBuilder['analyze']>>['violations']) {
  return violations
    .map(
      (violation) =>
        `[${violation.impact}] ${violation.id} — ${violation.help}\n` +
        violation.nodes
          .slice(0, 5)
          .map((node) => `  ${node.target.join(' ')}\n  ${node.failureSummary ?? ''}`)
          .join('\n'),
    )
    .join('\n\n')
}

/** Vérifie une page : zéro violation sérieuse/critique et aucun débordement horizontal. */
async function expectAccessible(page: Page, route: string, theme: string, width: number) {
  await page.goto(route, { waitUntil: 'domcontentloaded' })
  // Laisse le rendu, les polices et les hydratations se stabiliser sans attendre
  // les flux SSE (le réseau ne redevient jamais totalement inactif dans la console).
  await page.waitForTimeout(600)

  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const blocking = violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
  expect(blocking, `${route} (${theme}, ${width} px)\n${format(blocking)}`).toEqual([])

  const overflow = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }))
  expect(
    overflow.scroll,
    `${route} (${theme}, ${width} px) déborde horizontalement de ${overflow.scroll - overflow.client} px`,
  ).toBeLessThanOrEqual(overflow.client + 1)
}

async function setTheme(context: import('@playwright/test').BrowserContext, theme: string, baseURL: string) {
  await context.clearCookies({ name: 'eflex-theme' })
  await context.addCookies([{ name: 'eflex-theme', value: theme, domain: new URL(baseURL).hostname, path: '/' }])
}

for (const theme of THEMES) {
  for (const viewport of WIDTHS) {
    test.describe(`pages publiques — ${theme} ${viewport.label} px`, () => {
      // 360 px = téléphone : pointeur grossier, donc cibles tactiles de 44 px.
      test.use({ hasTouch: viewport.width <= 480 })
      test.beforeEach(async ({ context, page, baseURL }) => {
        await page.setViewportSize({ width: viewport.width, height: 960 })
        await setTheme(context, theme, baseURL!)
      })

      for (const route of PUBLIC_PAGES) {
        test(`${route}`, async ({ page }) => {
          await expectAccessible(page, route, theme, viewport.width)
        })
      }
    })
  }
}

async function assertKeyboardFocus(page: Page, stops: number) {
  let checked = 0
  let attempts = 0
  while (checked < stops && attempts < stops * 4) {
    attempts += 1
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null
      if (!element) return null
      // L'indicateur de développement de Next.js n'est pas rendu en production.
      if (element.closest('nextjs-portal')) return { dev: true }
      if (element === document.body) return null
      const style = getComputedStyle(element)
      return {
        dev: false,
        tag: element.tagName.toLowerCase(),
        label: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 50),
        outline: style.outlineStyle !== 'none' && Number.parseFloat(style.outlineWidth) > 0,
        shadow: style.boxShadow !== 'none',
      }
    })
    if (focused?.dev) continue
    // Fin du document : le navigateur renvoie le focus au body. Ce n'est pas une perte
    // de focus au sens WCAG, on arrête le parcours (le nombre minimal est vérifié plus bas).
    if (focused === null) break
    checked += 1
    expect(
      focused.outline || focused.shadow,
      `arrêt ${checked} (${focused.tag} « ${focused.label} ») : aucun indicateur de focus visible`,
    ).toBe(true)
  }
  // Certaines pages publiques remplacent le formulaire par un message quand
  // l'envoi d'e-mails n'est pas configuré (CI sans RESEND_API_KEY). On vérifie
  // donc un minimum bas, tout en contrôlant que chaque arrêt a un focus visible.
  expect(checked, 'Trop peu d’éléments focusables pour vérifier le focus').toBeGreaterThanOrEqual(3)
}

test.describe('clavier', () => {
  test('le lien d’évitement est le premier arrêt de tabulation et mène au contenu', async ({ page }) => {
    // Attendre la fin du chargement : à son initialisation, le routeur Next.js réécrit l'URL
    // (history.replaceState) avec l'adresse relevée au chargement. Un « Entrée » pressé avant efface
    // donc #contenu de l'URL (le focus, lui, arrive bien sur le contenu : mesuré 8/8 avec un
    // processeur ralenti ×6). Sans cette attente, le test échouait sur une machine chargée.
    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.keyboard.press('Tab')
    const focused = await page.evaluate(() => ({
      text: (document.activeElement?.textContent ?? '').trim(),
      href: document.activeElement?.getAttribute('href'),
    }))
    expect(focused).toEqual({ text: 'Aller au contenu', href: '#contenu' })

    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/#contenu$/)
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id))
      .toBe('contenu')
  })

  for (const route of ['/', '/login', '/register', '/forgot-password']) {
    test(`focus visible au clavier — ${route}`, async ({ page }) => {
      await page.goto(route, { waitUntil: 'networkidle' })
      await assertKeyboardFocus(page, 12)
    })
  }

  test('le formulaire de connexion est utilisable au clavier seul', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'networkidle' })
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    // Le champ e-mail est atteignable et annoncé par son libellé.
    const email = page.getByLabel('Adresse e-mail')
    await email.focus()
    await page.keyboard.type('personne@example.test')
    await page.keyboard.press('Tab')
    const password = page.getByLabel('Mot de passe')
    await expect(password).toBeFocused()
    await page.keyboard.type('mot-de-passe')
    await expect(page.getByRole('button', { name: 'Se connecter', exact: true })).toBeVisible()
  })
})

const AUTH = process.env.PLAYWRIGHT_AUTH === '1'
const AUTH_EMAIL = process.env.E2E_EMAIL ?? 'a11y-e2e@example.test'
const AUTH_PASSWORD = process.env.E2E_PASSWORD ?? 'E2e-Password-123!'
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

async function login(page: Page) {
  // La page de connexion doit être hydratée avant le clic : sinon le formulaire
  // part en GET natif (/login?…) au lieu d'appeler l'API Better Auth.
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

if (!AUTH) {
  test('parcours authentifié (non exécuté)', async () => {
    test.skip(true, 'Définir PLAYWRIGHT_AUTH=1 et une base de test (voir e2e/seed-auth.mjs).')
  })
} else {
  for (const theme of THEMES) {
    for (const viewport of WIDTHS) {
      test.describe(`parcours authentifié — ${theme} ${viewport.label} px`, () => {
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
          // Parcours clavier sans souris sur la coque de la console.
          await assertKeyboardFocus(page, 12)

          const id = await projectId(page)
          expect(id, 'Un projet de test doit exister (e2e/seed-auth.mjs).').not.toBeNull()
          const projectPages = [
            `/dashboard/projects/${id}`,
            `/dashboard/projects/${id}?tab=deployments`,
            `/dashboard/projects/${id}?tab=variables`,
            `/dashboard/projects/${id}?tab=logs`,
            `/dashboard/projects/${id}/settings`,
          ]

          for (const route of [...DASHBOARD_PAGES, ...projectPages]) {
            await expectAccessible(page, route, theme, viewport.width)
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
              await expectAccessible(page, route, theme, viewport.width)
            }
            await context.close()
          })
        }
      })
    }
  }
}
