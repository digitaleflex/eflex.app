import { NextRequest, NextResponse } from 'next/server'
import { getWebhookSecret, verifyGitHubWebhook } from '@/lib/github-app'
import { prisma } from '@/lib/prisma'
import { enqueueProjectDeployment } from '@/lib/project-deployments'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

interface GitHubPushPayload {
  ref?: string
  after?: string
  repository?: { full_name?: string; default_branch?: string }
  installation?: { id?: number }
}

interface InstallationPayload {
  action?: string
  installation?: { id?: number; account?: { login?: string } }
}

const SHA_RE = /^[0-9a-f]{40}$/

/**
 * Webhook GitHub App (issue 07). La signature `X-Hub-Signature-256` est
 * vérifiée avant toute lecture, et `X-GitHub-Delivery` garantit qu'une
 * livraison rejouée ne crée qu'un seul déploiement.
 */
export async function POST(request: NextRequest) {
  const body = await request.text()
  const secret = await getWebhookSecret()
  if (!verifyGitHubWebhook(body, request.headers.get('x-hub-signature-256'), secret)) {
    return NextResponse.json({ error: 'Signature invalide.' }, { status: 401 })
  }

  const deliveryId = request.headers.get('x-github-delivery')
  if (!deliveryId) return NextResponse.json({ error: 'Livraison non identifiée.' }, { status: 400 })

  try {
    await prisma.webhookDelivery.create({ data: { id: deliveryId } })
  } catch {
    // Même livraison reçue deux fois : on ne refait rien.
    return NextResponse.json({ received: true, duplicate: true })
  }

  let payload: GitHubPushPayload & InstallationPayload
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Corps invalide.' }, { status: 400 })
  }

  const event = request.headers.get('x-github-event')

  if (event === 'installation' && payload.action === 'deleted') {
    const installationId = String(payload.installation?.id ?? '')
    if (installationId) {
      await prisma.gitInstallation.deleteMany({ where: { installationId } })
      console.info('[eflex/webhook/github] installation supprimée')
    }
    return NextResponse.json({ received: true })
  }

  if (event === 'push') {
    const fullName = payload.repository?.full_name
    const branch = payload.ref?.startsWith('refs/heads/') ? payload.ref.slice('refs/heads/'.length) : null
    const sha = payload.after
    if (!fullName || !branch || !sha || !SHA_RE.test(sha)) {
      return NextResponse.json({ received: true, ignored: true })
    }

    const projects = await prisma.project.findMany({
      where: {
        OR: [
          { repoFullName: fullName },
          { repoUrl: { endsWith: `github.com/${fullName}` } },
        ],
      },
      select: { id: true, name: true, organizationId: true, branch: true, productionBranch: true, installationId: true },
    })

    const installationId = payload.installation?.id ? String(payload.installation.id) : null
    let queued = 0
    let skipped = 0
    for (const project of projects) {
      if ((project.productionBranch ?? project.branch) !== branch) continue
      // Même verrou que le redéploiement manuel : un push pendant un build ne
      // crée pas un second déploiement concurrent.
      const result = await enqueueProjectDeployment(project, { exclusive: true, commitSha: sha })
      if ('error' in result) {
        skipped += 1
        continue
      }
      if (installationId && !project.installationId) {
        await prisma.project.update({ where: { id: project.id }, data: { installationId } })
      }
      queued += 1
    }
    console.info(`[eflex/webhook/github] push ${fullName}@${branch} -> ${queued} déploiement(s), ${skipped} ignoré(s)`)
    return NextResponse.json({ received: true, queued, skipped })
  }

  // pull_request / installation_repositories : enregistrés pour l'idempotence,
  // traités en phase 2 (previews).
  return NextResponse.json({ received: true, ignored: true })
}
