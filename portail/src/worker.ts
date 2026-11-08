/**
 * Worker de déploiement (issue 06). Tourne dans le processus du portail,
 * démarré par `src/instrumentation.ts`. BullMQ reprend automatiquement les
 * jobs « stalled » après un redémarrage, ce qui rend le pipeline résilient
 * sans second conteneur à maintenir.
 *
 * Chaque étape est **reprenable** : `coolifyAppId` est stocké dès sa création,
 * donc une reprise ne provoque jamais de doublon côté Coolify.
 */
import { Worker, type Job } from 'bullmq'
import type { BuildPlan } from '@eflex/detector'
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { buildProjectArtifacts } from '@/lib/deploy-plan'
import { assertTransition, isTerminal, type DeploymentStatus } from '@/lib/deployment-state'
import { DEPLOYMENT_QUEUE, redisConnection } from '@/lib/queue'
import {
  createApplication,
  deployApplication,
  getDeploymentLogs,
  getDeploymentStatus,
  setEnvironmentVariable,
} from '@/lib/coolify'

const POLL_ATTEMPTS = 10
const POLL_DELAY_MS = 3_000
const MAX_LOGS = 4_000

const LIVE = new Set(['finished', 'success', 'live', 'completed', 'running'])
const FAILED = new Set(['failed', 'error', 'cancelled'])

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function setStatus(id: string, next: DeploymentStatus): Promise<boolean> {
  const current = await prisma.deployment.findUnique({ where: { id }, select: { status: true } })
  if (!current || isTerminal(current.status)) return false
  assertTransition(current.status, next)
  await prisma.deployment.update({ where: { id }, data: { status: next } })
  return true
}

async function fail(id: string, message: string): Promise<void> {
  await prisma.deployment.update({
    where: { id },
    data: { status: 'failed', logsSummary: message.slice(0, MAX_LOGS) },
  })
  console.error(`[eflex/worker] déploiement ${id} en échec : ${message.slice(0, 200)}`)
}

async function storeLogs(id: string, status: 'live' | 'deploying'): Promise<void> {
  const deployment = await prisma.deployment.findUnique({ where: { id } })
  if (!deployment?.coolifyBuildId || !deployment.projectId) return
  const project = await prisma.project.findUnique({ where: { id: deployment.projectId } })
  if (!project?.coolifyAppId) return
  const logs = await getDeploymentLogs(project.coolifyAppId, deployment.coolifyBuildId)
  const summary = 'error' in logs ? null : logs.logs.slice(-MAX_LOGS) || null
  await prisma.deployment.update({
    where: { id },
    data: { status, logsSummary: summary },
  })
}

function isBuildPlan(value: unknown): value is BuildPlan {
  return typeof value === 'object' && value !== null && 'framework' in value && 'port' in value
}

export async function processDeployment(deploymentId: string): Promise<void> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { project: true },
  })
  if (!deployment) return
  if (isTerminal(deployment.status)) return // idempotence

  const project = deployment.project
  await setStatus(deploymentId, 'analyzing')

  const plan = project.plan as unknown
  if (!isBuildPlan(plan)) {
    await fail(deploymentId, 'Plan de build absent ou invalide : relancez la création du projet.')
    return
  }

  await setStatus(deploymentId, 'provisioning')
  const artifacts = buildProjectArtifacts(plan, project.slug)

  let appId = project.coolifyAppId
  if (!appId) {
    const created = await createApplication({
      name: project.slug,
      gitRepository: project.repoUrl,
      gitBranch: project.branch,
      buildPack: artifacts.buildPack,
      portsExposes: String(artifacts.portsExposes),
      dockerComposeRaw: artifacts.compose
        ? Buffer.from(artifacts.compose, 'utf8').toString('base64')
        : undefined,
      dockerfile: artifacts.dockerfile ?? undefined,
    })
    if ('error' in created) {
      await fail(deploymentId, `Création de l'application Coolify impossible : ${created.error}`)
      return
    }
    appId = created.id
    await prisma.project.update({ where: { id: project.id }, data: { coolifyAppId: appId } })
  }

  // Variables d'environnement : déchiffrées juste avant l'envoi, jamais en clair
  // dans un fichier ou un log. Chaque erreur est vérifiée.
  const envVars = await prisma.envVar.findMany({ where: { projectId: project.id } })
  for (const variable of envVars) {
    let value: string
    try {
      value = decrypt(variable.value, `${project.id}:${variable.key}`)
    } catch (error) {
      await fail(deploymentId, `Variable « ${variable.key} » illisible : ${error instanceof Error ? error.message : 'erreur inconnue'}`)
      return
    }
    const result = await setEnvironmentVariable(appId, variable.key, value)
    if ('error' in result) {
      await fail(deploymentId, `Variable « ${variable.key} » non transmise : ${result.error}`)
      return
    }
  }

  await setStatus(deploymentId, 'building')
  const started = await deployApplication(appId)
  if ('error' in started) {
    await fail(deploymentId, `Déclenchement du déploiement impossible : ${started.error}`)
    return
  }
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { coolifyBuildId: started.deploymentId, commitSha: deployment.commitSha },
  })

  await setStatus(deploymentId, 'deploying')
  let outcome: 'live' | 'failed' | null = null
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await delay(POLL_DELAY_MS)
    const status = await getDeploymentStatus(appId, started.deploymentId)
    if ('error' in status) continue
    const value = status.status.toLowerCase()
    if (LIVE.has(value)) { outcome = 'live'; break }
    if (FAILED.has(value)) { outcome = 'failed'; break }
  }

  if (outcome === 'failed') {
    await storeLogs(deploymentId, 'deploying')
    await prisma.deployment.update({ where: { id: deploymentId }, data: { status: 'failed' } })
  } else if (outcome === 'live') {
    await storeLogs(deploymentId, 'live')
  } else {
    // Toujours en cours : on garde `deploying`, l'interface interroge l'API.
    await storeLogs(deploymentId, 'deploying')
  }
}

export function startDeploymentWorker(): Worker {
  const worker = new Worker(
    DEPLOYMENT_QUEUE,
    async (job: Job) => {
      await processDeployment(String(job.data.deploymentId))
    },
    { connection: redisConnection(), concurrency: 2 },
  )

  worker.on('completed', (job) => {
    console.info(`[eflex/worker] déploiement ${job.id} traité`)
  })
  worker.on('failed', (job, error) => {
    console.error(`[eflex/worker] déploiement ${job?.id} en erreur : ${error.message}`)
  })
  worker.on('error', (error) => {
    console.error(`[eflex/worker] Redis indisponible : ${error.message}`)
  })
  return worker
}
