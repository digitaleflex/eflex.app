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
import {
  buildProjectArtifacts,
  buildApplicationLabels,
  nixpacksRuntimeVariable,
  publishDirectoryForPlan,
} from '@/lib/deploy-plan'
import { assertTransition, isTerminal, type DeploymentStatus } from '@/lib/deployment-state'
import { DEPLOYMENT_QUEUE, redisConnection } from '@/lib/queue'
import {
  createApplication,
  deployApplication,
  getDeploymentLogs,
  getDeploymentStatus,
  setEnvironmentVariable,
} from '@/lib/coolify'

const POLL_ATTEMPTS = 200
const POLL_DELAY_MS = 3_000
const MAX_LOGS = 4_000

const LIVE = new Set(['finished', 'success', 'live', 'completed', 'running'])
const FAILED = new Set(['failed', 'error', 'cancelled', 'cancelled-by-user'])

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
  if (!deployment?.coolifyBuildId) return
  const logs = await getDeploymentLogs(deployment.coolifyBuildId)
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
  const domain = project.domain ?? undefined
  const artifacts = buildProjectArtifacts(plan, project.slug, domain)

  // Coolify 4.6 ne déploie pas un compose brut multi-services sans fichier
  // compose dans le dépôt. On s'arrête ici avec un message explicite plutôt
  // que de laisser Coolify échouer.
  if (artifacts.services.length > 1) {
    await fail(
      deploymentId,
      `Ce plan nécessite plusieurs services (${artifacts.services.join(', ')}). ` +
        'Coolify 4.6 ne déploie pas un compose brut sans docker-compose.yaml dans le dépôt. ' +
        'Ajoutez le compose au dépôt ou choisissez un plan mono-service.',
    )
    return
  }

  // Dépôt avec son propre Dockerfile (framework `docker`) : Coolify clone le
  // dépôt et utilise ce Dockerfile. Sinon, Nixpacks construit l'image avec les
  // commandes du BuildPlan (le champ `dockerfile` de l'API ne clone pas le
  // dépôt, il ne peut donc pas transporter notre Dockerfile généré).
  const repoHasDockerfile = artifacts.buildPack === 'dockerfile' && artifacts.dockerfile === null

  let appId = project.coolifyAppId
  if (!appId) {
    const created = await createApplication({
      name: project.slug,
      gitRepository: project.repoUrl,
      gitBranch: project.branch,
      buildPack: repoHasDockerfile ? 'dockerfile' : 'nixpacks',
      portsExposes: String(artifacts.portsExposes),
      installCommand: repoHasDockerfile ? undefined : plan.install,
      buildCommand: repoHasDockerfile ? undefined : plan.build,
      startCommand: repoHasDockerfile ? undefined : plan.start,
      publishDirectory: repoHasDockerfile ? undefined : publishDirectoryForPlan(plan),
      fqdn: domain,
      customLabels: domain
        ? buildApplicationLabels(project.slug, domain, artifacts.portsExposes)
        : undefined,
      postDeploymentCommand:
        artifacts.postDeploy.length > 0 ? artifacts.postDeploy.join(' && ') : undefined,
    })
    if ('error' in created) {
      await fail(deploymentId, `Création de l'application Coolify impossible : ${created.error}`)
      return
    }
    appId = created.id
    await prisma.project.update({ where: { id: project.id }, data: { coolifyAppId: appId } })
  }

  // Nixpacks : force la version du runtime connue du plan (variable de build).
  if (!repoHasDockerfile) {
    const runtimeVariable = nixpacksRuntimeVariable(plan.runtime)
    if (runtimeVariable) {
      const result = await setEnvironmentVariable(
        appId,
        runtimeVariable.key,
        runtimeVariable.value,
        true,
      )
      if ('error' in result) {
        await fail(deploymentId, `Version du runtime non transmise à Nixpacks : ${result.error}`)
        return
      }
    }
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
    const status = await getDeploymentStatus(started.deploymentId)
    if ('error' in status) continue
    const value = status.status.toLowerCase()
    if (LIVE.has(value)) { outcome = 'live'; break }
    if (FAILED.has(value)) { outcome = 'failed'; break }
    // Logs visibles pendant le build, pas seulement à la fin.
    if (attempt % 5 === 0) await storeLogs(deploymentId, 'deploying')
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
