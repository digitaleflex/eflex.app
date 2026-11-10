/**
 * Jeu de données minimal pour les tests d'accessibilité authentifiés (issue #32).
 *
 * Le script est idempotent : il met à jour le compte, l'organisation, le projet et
 * le déploiement de test s'ils existent déjà. Il ne tourne que sur une base de test ;
 * l'appel CI le lance après `prisma migrate deploy`.
 *
 * Variables :
 * - DATABASE_URL        base de test (obligatoire)
 * - E2E_EMAIL           adresse du compte (défaut : a11y-e2e@example.test)
 * - E2E_PASSWORD        mot de passe (défaut : E2e-Password-123!)
 * - E2E_ADMIN           « 1 » pour donner le rôle admin (pages /admin)
 */
import { PrismaClient } from '@prisma/client'
import { hash } from 'bcryptjs'

const prisma = new PrismaClient()

const email = (process.env.E2E_EMAIL ?? 'a11y-e2e@example.test').toLowerCase()
const password = process.env.E2E_PASSWORD ?? 'E2e-Password-123!'
const admin = process.env.E2E_ADMIN === '1'

async function main() {
  const passwordHash = await hash(password, 12)
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: 'Compte de test accessibilité', emailVerified: true, role: admin ? 'admin' : 'user', banned: false },
    create: {
      name: 'Compte de test accessibilité',
      email,
      emailVerified: true,
      role: admin ? 'admin' : 'user',
    },
  })

  const account = await prisma.account.findFirst({ where: { userId: user.id, providerId: 'credential' } })
  if (account) {
    await prisma.account.update({ where: { id: account.id }, data: { password: passwordHash, accountId: user.id } })
  } else {
    await prisma.account.create({
      data: { accountId: user.id, providerId: 'credential', userId: user.id, password: passwordHash },
    })
  }

  const organization = await prisma.organization.upsert({
    where: { slug: 'equipe-accessibilite' },
    update: { name: 'Équipe accessibilité' },
    create: { name: 'Équipe accessibilité', slug: 'equipe-accessibilite' },
  })

  await prisma.member.upsert({
    where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
    update: { role: 'owner' },
    create: { organizationId: organization.id, userId: user.id, role: 'owner' },
  })

  const project = await prisma.project.upsert({
    where: { slug: 'projet-accessibilite' },
    update: {},
    create: {
      organizationId: organization.id,
      userId: user.id,
      name: 'Projet accessibilité',
      slug: 'projet-accessibilite',
      repoUrl: 'https://github.com/exemple/projet-accessibilite',
      branch: 'main',
      productionBranch: 'main',
      framework: 'nextjs',
      runtime: 'node@22',
      domain: 'projet-accessibilite.eflex.test',
      detection: {
        confidence: 0.92,
        reasons: ['Fichier next.config.js détecté.', 'Script build trouvé dans package.json.'],
        warnings: ['Aucun fichier eflex.json : les valeurs par défaut sont utilisées.'],
        commitSha: 'abcdef1234567890',
      },
    },
  })

  const existingDeployment = await prisma.deployment.findFirst({ where: { projectId: project.id } })
  if (!existingDeployment) {
    await prisma.deployment.createMany({
      data: [
        { projectId: project.id, commitSha: 'abcdef1234567890', status: 'live' },
        { projectId: project.id, commitSha: '1234567890abcdef', status: 'failed', logsSummary: 'La commande build a échoué : module introuvable.' },
      ],
    })
  }

  console.log(`[e2e] compte ${email} prêt (${admin ? 'admin' : 'utilisateur'}), projet ${project.slug}.`)
}

main()
  .catch((error) => {
    console.error('[e2e] initialisation impossible', error)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
