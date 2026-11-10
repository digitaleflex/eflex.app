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
  coolifyApplicationSettings,
  nixpacksRuntimeVariable,
  persistentVolumesEnabled,
} from '@/lib/deploy-plan'
import { assertTransition, isTerminal, TERMINAL_STATUSES, type DeploymentStatus } from '@/lib/deployment-state'
import { expireStaleDeployments, WATCHDOG_INTERVAL_MS } from '@/lib/deployment-watchdog'
import { startBillingMaintenance } from '@/lib/billing-renewal'
import { DEPLOYMENT_QUEUE, redisConnection } from '@/lib/queue'
import { COOLIFY_FAILED, COOLIFY_LIVE } from '@/lib/coolify-status'
import { announceDeploymentStatus } from '@/lib/deployment-events'
import { resolveProjectToken } from '@/lib/git-credentials'
import { createDeployKey, deleteDeployKey } from '@/lib/github-app'
import { parseGitHubUrl } from '@/lib/github-url'
import { generateDeployKeyPair } from '@/lib/ssh-key'
import { waitForTls } from '@/lib/tls'
import {
  cancelDeployment as cancelCoolifyDeployment,
  createApplication,
  createPrivateKey,
  deployApplication,
  ensureApplicationStorages,
  getDeploymentLogs,
  getDeploymentStatus,
  setApplicationLabels,
  setEnvironmentVariable,
  updateApplication,
} from '@/lib/coolify'

const POLL_ATTEMPTS = 200
const POLL_DELAY_MS = 3_000
const MAX_LOGS = 4_000


function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Temps réel et notifications : prévient les membres de l'organisation (jamais bloquant). */
async function announce(deploymentId: string, status: string): Promise<void> {
  try {
    const d = await prisma.deployment.findUnique({
      where: { id: deploymentId },
      select: { project: { select: { id: true, name: true, organizationId: true } } },
    })
    if (!d) return
    await announceDeploymentStatus({
      organizationId: d.project.organizationId,
      projectId: d.project.id,
      projectName: d.project.name,
      deploymentId,
      status,
    })
  } catch (error) {
    console.error('[eflex/worker] annonce du statut impossible :', error instanceof Error ? error.message : error)
  }
}

async function setStatus(id: string, next: DeploymentStatus): Promise<boolean> {
  const current = await prisma.deployment.findUnique({ where: { id }, select: { status: true } })
  if (!current || isTerminal(current.status)) return false
  assertTransition(current.status, next)
  // Mise à jour conditionnelle : une annulation concurrente gagne et la
  // transition du worker est abandonnée (jamais d'écrasement de `cancelled`).
  const updated = await prisma.deployment.updateMany({
    where: { id, status: current.status },
    data: { status: next },
  })
  if (updated.count !== 1) return false
  await announce(id, next)
  return true
}

/** Statut courant en base (null si le déploiement a disparu). */
async function currentStatus(id: string): Promise<string | null> {
  const deployment = await prisma.deployment.findUnique({ where: { id }, select: { status: true } })
  return deployment?.status ?? null
}

async function fail(id: string, message: string): Promise<void> {
  const current = await prisma.deployment.findUnique({
    where: { id },
    select: { status: true, logsSummary: true },
  })
  // Un déploiement annulé (ou déjà terminé) ne doit jamais repasser en échec.
  if (!current || isTerminal(current.status)) return
  const updated = await prisma.deployment.updateMany({
    where: { id, status: { notIn: [...TERMINAL_STATUSES] } },
    data: {
      status: 'failed',
      logsSummary: [current.logsSummary, message]
        .filter((line): line is string => Boolean(line))
        .join('\n')
        .slice(-MAX_LOGS),
    },
  })
  if (updated.count !== 1) return
  await announce(id, 'failed')
  console.error(`[eflex/worker] déploiement ${id} en échec : ${message.slice(0, 200)}`)
}

async function storeLogs(id: string, status: 'live' | 'deploying'): Promise<void> {
  const deployment = await prisma.deployment.findUnique({
    where: { id },
    select: { status: true, coolifyBuildId: true },
  })
  if (!deployment?.coolifyBuildId) return
  if (isTerminal(deployment.status)) return
  const logs = await getDeploymentLogs(deployment.coolifyBuildId)
  const summary = 'error' in logs ? null : logs.logs.slice(-MAX_LOGS) || null
  const updated = await prisma.deployment.updateMany({
    where: { id, status: { notIn: [...TERMINAL_STATUSES] } },
    data: { status, logsSummary: summary },
  })
  if (status === 'live' && updated.count === 1) await announce(id, 'live')
}

/** Ajoute une ligne au journal du déploiement (sans écraser les logs Coolify). */
async function appendLogs(id: string, line: string): Promise<void> {
  const deployment = await prisma.deployment.findUnique({ where: { id }, select: { logsSummary: true } })
  const next = [deployment?.logsSummary, line].filter(Boolean).join('\n')
  await prisma.deployment.update({
    where: { id },
    data: { logsSummary: next.slice(-MAX_LOGS) },
  })
}

function isBuildPlan(value: unknown): value is BuildPlan {
  return typeof value === 'object' && value !== null && 'framework' in value && 'port' in value
}

export async function processDeployment(deploymentId: string): Promise<void> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { project: { include: { domains: true } } },
  })
  if (!deployment) return
  if (isTerminal(deployment.status)) return // idempotence

  const project = deployment.project
  // Annulé avant même le démarrage (job encore en file) : rien à faire.
  if (!(await setStatus(deploymentId, 'analyzing'))) return

  const plan = project.plan as unknown
  if (!isBuildPlan(plan)) {
    await fail(deploymentId, 'Plan de build absent ou invalide : relancez la création du projet.')
    return
  }

  if (!(await setStatus(deploymentId, 'provisioning'))) return
  const customHosts = project.domains
    .filter((item) => item.verifiedAt !== null)
    .map((item) => item.hostname)
  const hosts = [project.domain, ...customHosts].filter((host): host is string => Boolean(host))
  const domain = project.domain ?? hosts[0]
  const artifacts = buildProjectArtifacts(plan, project.slug, domain)
  const settings = coolifyApplicationSettings(plan)

  // Les plans multi-services nécessitent un fichier compose dans le dépôt.
  // On s'arrête ici avec un message explicite plutôt que de laisser le
  // constructeur échouer sans contexte.
  if (artifacts.services.length > 1) {
    await fail(
      deploymentId,
      `Ce plan nécessite plusieurs services (${artifacts.services.join(', ')}). ` +
        'La plateforme ne déploie pas encore un compose multi-services sans docker-compose.yaml dans le dépôt. ' +
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
  let privateKeyUuid = project.coolifyPrivateKeyUuid ?? undefined
  const repoRef = parseGitHubUrl(project.repoUrl)

  // Dépôt privé : Coolify a besoin d'une deploy key. On la crée à la première
  // création d'application, puis on réutilise la clé stockée sur le projet.
  if (!appId && project.repoPrivate && !privateKeyUuid) {
    const token = await resolveProjectToken({ userId: project.userId, installationId: project.installationId })
    if (!repoRef || !token) {
      await fail(
        deploymentId,
        'Ce dépôt est privé : connectez la GitHub App ou enregistrez un jeton personnel dans Paramètres → Connexion GitHub.',
      )
      return
    }
    const { privateKeyPem, publicKeyOpenSsh } = generateDeployKeyPair()
    let githubKeyId: number | null = null
    try {
      githubKeyId = await createDeployKey(token, repoRef.owner, repoRef.repo, publicKeyOpenSsh, `eflex-${project.slug}`)
      const coolifyKey = await createPrivateKey(privateKeyPem, `eflex-${project.slug}`)
      if ('error' in coolifyKey) throw new Error(coolifyKey.error)
      privateKeyUuid = coolifyKey.id
      await prisma.project.update({
        where: { id: project.id },
        data: { githubDeployKeyId: githubKeyId, coolifyPrivateKeyUuid: privateKeyUuid },
      })
    } catch (error) {
      if (githubKeyId !== null) {
        await deleteDeployKey(token, repoRef.owner, repoRef.repo, githubKeyId).catch(() => undefined)
      }
      await fail(
        deploymentId,
        `Accès au dépôt privé impossible : ${error instanceof Error ? error.message : 'erreur inconnue'}`,
      )
      return
    }
  }

  if (!appId) {
    const created = await createApplication({
      name: project.slug,
      // Une deploy key ne fonctionne qu'avec l'URL SSH.
      gitRepository:
        privateKeyUuid && repoRef
          ? `git@github.com:${repoRef.owner}/${repoRef.repo}.git`
          : project.repoUrl,
      gitBranch: project.branch,
      privateKeyUuid,
      buildPack: repoHasDockerfile ? 'dockerfile' : 'nixpacks',
      portsExposes: String(artifacts.portsExposes),
      // Monorepo : la racine du dépôt est le dossier de travail (les commandes
      // rejoignent elles-mêmes le dossier de l'application). `root` vide reste
      // inchangé : Coolify garde sa valeur par défaut `/`.
      baseDirectory: plan.root !== '' ? settings.baseDirectory : undefined,
      dockerfileLocation: repoHasDockerfile ? settings.dockerfileLocation : undefined,
      installCommand: repoHasDockerfile ? undefined : settings.installCommand,
      buildCommand: repoHasDockerfile ? undefined : settings.buildCommand,
      startCommand: repoHasDockerfile ? undefined : settings.startCommand,
      publishDirectory: repoHasDockerfile ? undefined : settings.publishDirectory,
      fqdn: domain,
      domains: hosts,
      customLabels: hosts.length > 0
        ? buildApplicationLabels(project.slug, hosts, artifacts.portsExposes)
        : undefined,
      postDeploymentCommand:
        artifacts.postDeploy.length > 0 ? artifacts.postDeploy.join(' && ') : undefined,
    })
    if ('error' in created) {
      await fail(deploymentId, `Préparation de l'hébergement impossible : ${created.error}`)
      return
    }
    appId = created.id
    await prisma.project.update({ where: { id: project.id }, data: { coolifyAppId: appId } })
  }

  // Le plan stocké peut évoluer (détection, correction de commande) alors que
  // l'application Coolify existe déjà : on réapplique les réglages à chaque
  // déploiement, sinon Coolify garde les anciens. Le dossier de travail est
  // toujours renvoyé : un plan revenu à la racine réinitialise `/`.
  const updated = await updateApplication(appId, {
    baseDirectory: plan.root !== '' ? settings.baseDirectory : '/',
    dockerfileLocation: repoHasDockerfile
      ? (settings.dockerfileLocation ?? '/Dockerfile')
      : undefined,
    installCommand: repoHasDockerfile ? undefined : (settings.installCommand ?? null),
    buildCommand: repoHasDockerfile ? undefined : (settings.buildCommand ?? null),
    startCommand: repoHasDockerfile ? undefined : (settings.startCommand ?? null),
    publishDirectory: repoHasDockerfile ? undefined : (settings.publishDirectory ?? null),
    portsExposes: String(artifacts.portsExposes),
  })
  if ('error' in updated) {
    await fail(deploymentId, `Commandes de déploiement non appliquées : ${updated.error}`)
    return
  }

  // Volumes persistants : désactivés par défaut, car tous les jetons Coolify ne
  // disposent pas des droits de stockage. Activés, un échec est explicite et
  // bloque le déploiement plutôt que de laisser croire à une persistance.
  if (artifacts.persistentVolumes.length > 0) {
    if (!persistentVolumesEnabled()) {
      await appendLogs(
        deploymentId,
        `[volumes] ${artifacts.persistentVolumes.map((volume) => volume.mountPath).join(', ')} non montés : EFLEX_PERSISTENT_VOLUMES n’est pas activé.`,
      )
    } else {
      const ensured = await ensureApplicationStorages(appId, artifacts.persistentVolumes)
      if ('error' in ensured) {
        await fail(deploymentId, `Volumes persistants non configurés : ${ensured.error}`)
        return
      }
      if (ensured.created > 0) {
        await appendLogs(
          deploymentId,
          `[volumes] ${ensured.created} stockage(s) persistant(s) créé(s) : ${artifacts.persistentVolumes.map((volume) => volume.mountPath).join(', ')}.`,
        )
      }
    }
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
        await fail(deploymentId, `Version du runtime non transmise au constructeur : ${result.error}`)
        return
      }
    }
  }

  // Les labels sont réappliqués à chaque déploiement, y compris pour une
  // application existante : ils contiennent tous les domaines vérifiés.
  if (hosts.length > 0) {
    const labels = buildApplicationLabels(project.slug, hosts, artifacts.portsExposes)
    const labeled = await setApplicationLabels(appId, labels, hosts)
    if ('error' in labeled) {
      await fail(deploymentId, `Configuration réseau non appliquée : ${labeled.error}`)
      return
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

  if (!(await setStatus(deploymentId, 'building'))) return
  const started = await deployApplication(appId)
  if ('error' in started) {
    await fail(deploymentId, `Déclenchement du déploiement impossible : ${started.error}`)
    return
  }
  await prisma.deployment.update({
    where: { id: deploymentId },
    data: { coolifyBuildId: started.deploymentId, commitSha: deployment.commitSha },
  })

  // L'utilisateur a pu annuler pendant l'appel à Coolify : l'identifiant de
  // build n'existait pas encore côté route d'annulation, on l'annule ici.
  if (!(await setStatus(deploymentId, 'deploying'))) {
    if ((await currentStatus(deploymentId)) === 'cancelled') {
      const cancelled = await cancelCoolifyDeployment(started.deploymentId)
      if ('error' in cancelled) {
        console.warn(`[eflex/worker] annulation distante impossible : ${cancelled.error}`)
      }
    }
    return
  }

  let outcome: 'live' | 'failed' | 'cancelled' | null = null
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
    await delay(POLL_DELAY_MS)
    // Annulation demandée : on arrête immédiatement le suivi et on ne touche
    // plus au statut (la route a déjà écrit `cancelled`).
    if ((await currentStatus(deploymentId)) === 'cancelled') {
      outcome = 'cancelled'
      break
    }
    const status = await getDeploymentStatus(started.deploymentId)
    if ('error' in status) continue
    const value = status.status.toLowerCase()
    if (COOLIFY_LIVE.has(value)) { outcome = 'live'; break }
    if (COOLIFY_FAILED.has(value)) { outcome = 'failed'; break }
    // Logs visibles pendant le build, pas seulement à la fin.
    if (attempt % 5 === 0) await storeLogs(deploymentId, 'deploying')
  }

  if (outcome === 'cancelled') {
    return
  } else if (outcome === 'failed') {
    await storeLogs(deploymentId, 'deploying')
    await fail(
      deploymentId,
      'La construction a échoué côté hébergement. Consultez les journaux du déploiement pour la cause exacte.',
    )
  } else if (outcome === 'live') {
    await storeLogs(deploymentId, 'live')

    // Vérification réelle du certificat : un déploiement « live » côté Coolify
    // ne garantit pas que Let's Encrypt a émis le certificat ni que le DNS
    // pointe encore vers le serveur. On l'ajoute au journal, sans rétrograder
    // un déploiement qui fonctionne déjà.
    if (hosts.length > 0) {
      const checks = await Promise.all(
        hosts.map((host) => waitForTls(host, { attempts: host === domain ? 12 : 6 })),
      )
      for (let index = 0; index < hosts.length; index += 1) {
        const host = hosts[index]!
        const tls = checks[index]!
        const line = tls.ok
          ? `[SSL] Certificat valide pour ${host}${tls.expiresAt ? ` (expire le ${new Date(tls.expiresAt).toLocaleDateString('fr-FR')})` : ''}.`
          : `[SSL] Certificat non valide pour ${host} : ${tls.reason ?? 'cause inconnue'}. Vérifiez le DNS (A/AAAA) et les logs Traefik.`
        await appendLogs(deploymentId, line)
        const data = {
          tlsValid: tls.ok,
          tlsExpiresAt: tls.expiresAt ? new Date(tls.expiresAt) : null,
          tlsCheckedAt: new Date(),
        }
        if (host === domain) {
          await prisma.project.update({ where: { id: project.id }, data })
        } else {
          await prisma.projectDomain.updateMany({
            where: { projectId: project.id, hostname: host },
            data,
          })
        }
        if (!tls.ok) console.warn(`[eflex/worker] ${line}`)
      }
    }
  } else {
    // Toujours en cours : on garde `deploying`, l'interface interroge l'API.
    await storeLogs(deploymentId, 'deploying')
  }
}

/**
 * Chien de garde : expire les déploiements bloqués (issue 05). Exécuté au
 * démarrage du worker, à chaque job et toutes les minutes. `cancelled` et les
 * autres états terminaux ne sont jamais touchés.
 */
let watchdogRunning = false

export async function runDeploymentWatchdog(): Promise<void> {
  if (watchdogRunning) return
  watchdogRunning = true
  try {
    const result = await expireStaleDeployments({
      findExpired: (createdBefore) =>
        prisma.deployment.findMany({
          where: { createdAt: { lte: createdBefore }, status: { notIn: [...TERMINAL_STATUSES] } },
          select: { id: true, status: true, createdAt: true },
        }),
      fail: async (id, message) => {
        const current = await prisma.deployment.findUnique({
          where: { id },
          select: { status: true, logsSummary: true },
        })
        if (!current || isTerminal(current.status)) return false
        const updated = await prisma.deployment.updateMany({
          where: { id, status: { notIn: [...TERMINAL_STATUSES] } },
          data: {
            status: 'failed',
            logsSummary: [current.logsSummary, message]
              .filter((line): line is string => Boolean(line))
              .join('\n')
              .slice(-MAX_LOGS),
          },
        })
        if (updated.count !== 1) return false
        await announce(id, 'failed')
        console.error(`[eflex/worker] déploiement ${id} expiré : ${message}`)
        return true
      },
    })
    if (result.expired > 0) {
      console.warn(`[eflex/worker] ${result.expired} déploiement(s) expiré(s) et passé(s) en échec.`)
    }
  } catch (error) {
    console.error(
      '[eflex/worker] chien de garde impossible :',
      error instanceof Error ? error.message : String(error),
    )
  } finally {
    watchdogRunning = false
  }
}

export function startDeploymentWorker(): Worker {
  const worker = new Worker(
    DEPLOYMENT_QUEUE,
    async (job: Job) => {
      // Un redémarrage peut avoir laissé des déploiements bloqués : on les
      // expire avant de traiter le job courant.
      await runDeploymentWatchdog()
      await processDeployment(String(job.data.deploymentId))
    },
    { connection: redisConnection(), concurrency: 2 },
  )

  // Filet de sécurité indépendant de l'arrivée de nouveaux jobs (le cas typique
  // est un déploiement bloqué sans aucun job en attente).
  const timer = setInterval(() => {
    void runDeploymentWatchdog()
  }, WATCHDOG_INTERVAL_MS)
  timer.unref()
  // Après un redémarrage, les déploiements bloqués doivent expirer sans attendre
  // la première minute ni l'arrivée d'un job.
  void runDeploymentWatchdog()

  // Maintenance des abonnements (relance de #18) : passe immédiate puis toutes
  // les 6 h. Aucun paiement n'est déclenché, seules les échéances sont
  // constatées. Voir `docs/operations/billing.md`.
  startBillingMaintenance()

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
