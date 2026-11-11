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
import { prisma } from '@/lib/prisma'
import { decrypt } from '@/lib/crypto'
import { resolveDeploymentContext } from '@/lib/deployment-context'
import {
  buildProjectArtifacts,
  buildApplicationLabels,
  composeDomains,
  coolifyApplicationSettings,
  deploymentKind,
  nixpacksRuntimeVariable,
  persistentVolumesEnabled,
} from '@/lib/deploy-plan'
import { inspectCompose, type ComposeInspection } from '@/lib/compose-safety'
import { fetchRepositoryFile } from '@/lib/repo-file'
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
import { isCommitSha } from '@/lib/deployment-rollback'
import {
  cancelDeployment as cancelCoolifyDeployment,
  createApplication,
  createPrivateKey,
  deployApplication,
  deployApplicationCommit,
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

export async function processDeployment(
  deploymentId: string,
  options: { rollback?: boolean } = {},
): Promise<void> {
  const deployment = await prisma.deployment.findUnique({
    where: { id: deploymentId },
    include: { project: { include: { domains: true } }, app: true },
  })
  if (!deployment) return
  if (isTerminal(deployment.status)) return // idempotence

  const project = deployment.project
  const app = deployment.app

  // Retour arrière : la cible est le commit enregistré sur le déploiement. On
  // valide avant toute transition pour ne pas laisser un déploiement bloqué en
  // « analyse » si le SHA est inexploitable.
  const rollbackCommit = options.rollback ? deployment.commitSha : null
  if (options.rollback && !isCommitSha(rollbackCommit)) {
    await fail(
      deploymentId,
      'Retour arrière impossible : le commit cible est invalide (identifiant de 40 caractères hexadécimaux attendu).',
    )
    return
  }

  // Annulé avant même le démarrage (job encore en file) : rien à faire.
  if (!(await setStatus(deploymentId, 'analyzing'))) return

  // Résolution du contexte (lot C de D2) : plan, dossier, domaine et nom Coolify
  // viennent de `ProjectApp` quand `Deployment.appId` est renseigné ; sinon des
  // colonnes `Project.*` (chemin historique, strictement inchangé).
  const resolved = resolveDeploymentContext({ project, app })
  if ('error' in resolved) {
    await fail(deploymentId, resolved.error)
    return
  }
  const context = resolved.context
  const { plan, hosts, domain } = context
  const artifacts = buildProjectArtifacts(plan, context.deployKey, domain ?? undefined)
  const settings = coolifyApplicationSettings(plan)
  const composeSource = artifacts.repositoryCompose
  const kind = deploymentKind(plan, artifacts)

  // Aiguillage avant tout appel Coolify :
  //   - compose fourni par le dépôt → Application `dockercompose` ;
  //   - plan généré mono-service → chemin historique ;
  //   - plan généré multi-services → refus explicite, aucun faux espoir.
  if (kind === 'invalid-compose') {
    await fail(
      deploymentId,
      'Ce plan déclare un compose mais aucun fichier compose exploitable. ' +
        'Ajoutez `docker-compose.yml` (ou `compose.yaml`) à la racine du dépôt, puis relancez le déploiement.',
    )
    return
  }
  if (kind === 'multiple-without-compose') {
    await fail(
      deploymentId,
      `Ce plan nécessite plusieurs services (${artifacts.services.join(', ')}). ` +
        'La plateforme ne génère pas de compose multi-services : ajoutez un fichier `docker-compose.yml` (ou `compose.yaml`) au dépôt, puis relancez. ' +
        'Les services décrits par le plan restent disponibles comme référence, mais aucun compose n’est écrit dans le dépôt.',
    )
    return
  }

  // Compose : on relit le fichier que Coolify va déployer et on refuse les
  // clauses qui donneraient accès à l'hôte. Cette validation est refaite à
  // chaque déploiement (le dépôt peut avoir changé depuis l'analyse).
  let composeInspection: ComposeInspection | null = null
  let composeService: string | undefined
  let composeContent: string | null = null
  if (composeSource) {
    const fetched = await fetchRepositoryFile({
      repoUrl: project.repoUrl,
      branch: project.branch,
      repoPrivate: project.repoPrivate,
      userId: project.userId,
      installationId: project.installationId,
      path: composeSource.repoPath,
    })
    if ('error' in fetched) {
      await fail(deploymentId, `Compose non vérifié : ${fetched.error}`)
      return
    }
    const inspection = inspectCompose(fetched.content)
    if (!inspection.ok) {
      await fail(deploymentId, `Déploiement refusé : ${inspection.error}`)
      return
    }
    composeInspection = inspection
    composeContent = fetched.content
    composeService = inspection.primaryService ?? composeSource.service
    for (const warning of inspection.warnings) {
      await appendLogs(deploymentId, `[compose] ${warning}`)
    }
    if (!composeService) {
      await appendLogs(
        deploymentId,
        '[compose] Aucun service public identifié : le domaine du projet ne sera pas attaché. Déclarez `ports` ou les labels Traefik websecure dans le compose.',
      )
    }
  }

  if (!(await setStatus(deploymentId, 'provisioning'))) return

  // Dépôt avec son propre Dockerfile (framework `docker`) : Coolify clone le
  // dépôt et utilise ce Dockerfile. Sinon, Nixpacks construit l'image avec les
  // commandes du BuildPlan (le champ `dockerfile` de l'API ne clone pas le
  // dépôt, il ne peut donc pas transporter notre Dockerfile généré).
  const repoHasDockerfile =
    !composeSource && artifacts.buildPack === 'dockerfile' && artifacts.dockerfile === null
  const attachedDomains = composeDomains(hosts, composeService)

  let appId = app ? app.coolifyAppId : project.coolifyAppId
  let privateKeyUuid = project.coolifyPrivateKeyUuid ?? undefined
  const repoRef = parseGitHubUrl(project.repoUrl)

  /** Écrit l'identifiant Coolify sur l'application et, pour l'app principale, sur le miroir `Project.*`. */
  const saveCoolifyAppId = async (value: string): Promise<void> => {
    if (app) {
      await prisma.projectApp.update({ where: { id: app.id }, data: { coolifyAppId: value } })
      if (context.primary) {
        await prisma.project.update({ where: { id: project.id }, data: { coolifyAppId: value } })
      }
      return
    }
    await prisma.project.update({ where: { id: project.id }, data: { coolifyAppId: value } })
  }

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
      name: context.deployKey,
      // Une deploy key ne fonctionne qu'avec l'URL SSH.
      gitRepository:
        privateKeyUuid && repoRef
          ? `git@github.com:${repoRef.owner}/${repoRef.repo}.git`
          : project.repoUrl,
      gitBranch: project.branch,
      privateKeyUuid,
      buildPack: composeSource ? 'dockercompose' : repoHasDockerfile ? 'dockerfile' : 'nixpacks',
      // Monorepo/compose : `base_directory` est le dossier de l'application.
      // `root` vide reste inchangé : Coolify garde sa valeur par défaut `/`.
      baseDirectory: plan.root !== '' ? settings.baseDirectory : undefined,
      ...(composeSource
        ? {
            dockerComposeLocation: settings.dockerComposeLocation,
            dockerComposeDomains: attachedDomains,
            // Contenu initial : Coolify exige que le compose soit connu pour
            // accepter `docker_compose_domains`. Il relira le dépôt ensuite.
            dockerComposeRaw: composeContent ?? undefined,
          }
        : {
            portsExposes: String(artifacts.portsExposes),
            dockerfileLocation: repoHasDockerfile ? settings.dockerfileLocation : undefined,
            installCommand: repoHasDockerfile ? undefined : settings.installCommand,
            buildCommand: repoHasDockerfile ? undefined : settings.buildCommand,
            startCommand: repoHasDockerfile ? undefined : settings.startCommand,
            publishDirectory: repoHasDockerfile ? undefined : settings.publishDirectory,
            fqdn: domain ?? undefined,
            domains: hosts,
            customLabels:
              hosts.length > 0
                ? buildApplicationLabels(context.deployKey, hosts, artifacts.portsExposes)
                : undefined,
            postDeploymentCommand:
              artifacts.postDeploy.length > 0 ? artifacts.postDeploy.join(' && ') : undefined,
          }),
    })
    if ('error' in created) {
      await fail(deploymentId, `Préparation de l'hébergement impossible : ${created.error}`)
      return
    }
    appId = created.id
    await saveCoolifyAppId(appId)
  }

  // Miroir `Project.*` de l'application principale : même quand l'Application
  // Coolify existait déjà, l'identifiant doit rester lisible par les routes qui
  // n'ont pas encore été converties (logs, runtime, admin).
  if (app && context.primary && appId && project.coolifyAppId !== appId) {
    await prisma.project.update({ where: { id: project.id }, data: { coolifyAppId: appId } })
  }

  // Le plan stocké peut évoluer (détection, correction de commande) alors que
  // l'application Coolify existe déjà : on réapplique les réglages à chaque
  // déploiement, sinon Coolify garde les anciens. Le dossier de travail est
  // toujours renvoyé : un plan revenu à la racine réinitialise `/`.
  let updated = composeSource
    ? await updateApplication(appId, {
        buildPack: 'dockercompose',
        baseDirectory: plan.root !== '' ? settings.baseDirectory : '/',
        dockerComposeLocation: settings.dockerComposeLocation,
        dockerComposeDomains: attachedDomains.length > 0 ? attachedDomains : undefined,
      })
    : await updateApplication(appId, {
        buildPack: repoHasDockerfile ? 'dockerfile' : 'nixpacks',
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
  // Application compose créée avant ce correctif (sans `docker_compose_raw`) :
  // Coolify refuse encore le mapping de domaines. On réapplique le reste et on
  // s'appuie sur les labels Traefik du compose, plutôt que de bloquer le client.
  if (
    'error' in updated &&
    composeSource &&
    /docker_compose_(domains|raw)/i.test(updated.error)
  ) {
    await appendLogs(
      deploymentId,
      '[compose] mapping de domaine Coolify indisponible pour cette application existante ; ' +
        'le routage repose sur les labels Traefik déclarés dans le compose.',
    )
    updated = await updateApplication(appId, {
      buildPack: 'dockercompose',
      baseDirectory: plan.root !== '' ? settings.baseDirectory : '/',
      dockerComposeLocation: settings.dockerComposeLocation,
    })
  }
  if ('error' in updated) {
    await fail(deploymentId, `Commandes de déploiement non appliquées : ${updated.error}`)
    return
  }

  // Volumes persistants : désactivés par défaut, car tous les jetons Coolify ne
  // disposent pas des droits de stockage. Activés, un échec est explicite et
  // bloque le déploiement plutôt que de laisser croire à une persistance.
  if (composeSource) {
    await appendLogs(
      deploymentId,
      '[volumes] les volumes sont déclarés dans le compose du dépôt : aucun stockage Coolify n’est créé.',
    )
    if (artifacts.postDeploy.length > 0) {
      await appendLogs(
        deploymentId,
        '[post-deploy] commandes non exécutées automatiquement pour un compose : utilisez un service one-shot (`restart: no`) dans le fichier.',
      )
    }
  } else if (artifacts.persistentVolumes.length > 0) {
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
  if (!repoHasDockerfile && !composeSource) {
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
  // Pour un compose, ils appartiennent au fichier du dépôt : envoyer `domains`
  // ou `custom_labels` serait refusé (422) ou ignoré par Coolify.
  if (composeSource) {
    if (attachedDomains.length > 0) {
      await appendLogs(
        deploymentId,
        `[réseau] domaines ${hosts.join(', ')} attachés au service compose « ${composeService} ».`,
      )
    }
    if (composeInspection?.warnings.some((warning) => warning.includes('websecure'))) {
      // Déjà journalisé avant `provisioning`; on garde une trace au build.
      await appendLogs(
        deploymentId,
        '[compose] les labels Traefik du domaine doivent être déclarés dans le fichier compose (entrypoint `websecure`).',
      )
    }
  } else if (hosts.length > 0) {
    const labels = buildApplicationLabels(context.deployKey, hosts, artifacts.portsExposes)
    const labeled = await setApplicationLabels(appId, labels, hosts)
    if ('error' in labeled) {
      await fail(deploymentId, `Configuration réseau non appliquée : ${labeled.error}`)
      return
    }
  }

  // Variables d'environnement : déchiffrées juste avant l'envoi, jamais en clair
  // dans un fichier ou un log. Chaque erreur est vérifiée. Les variables de
  // portée projet sont diffusées à toutes les applications (lot C).
  const envVars = await prisma.envVar.findMany({
    where: {
      projectId: project.id,
      ...(app ? { OR: [{ appId: null }, { appId: app.id }] } : {}),
    },
  })
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
  if (composeSource && envVars.length > 0) {
    await appendLogs(
      deploymentId,
      `[env] ${envVars.length} variable(s) injectée(s) via le fichier .env commun : tous les services du compose les voient.`,
    )
  }

  if (!(await setStatus(deploymentId, 'building'))) return
  // Retour arrière : Coolify reconstruit exactement le commit cible via
  // `POST /applications/{uuid}/rollback` (endpoint non destructif : la branche
  // suivie n'est pas modifiée). Les déploiements normaux (webhook,
  // redéploiement) gardent `POST /deploy`, c'est-à-dire la tête de branche.
  const started = rollbackCommit
    ? await deployApplicationCommit(appId, rollbackCommit)
    : await deployApplication(appId)
  if ('error' in started) {
    await fail(
      deploymentId,
      rollbackCommit
        ? `Retour arrière impossible : ${started.error}`
        : `Déclenchement du déploiement impossible : ${started.error}`,
    )
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
        // Domaine principal de l'application : `ProjectApp` (lot C) et miroir
        // `Project.*` pour l'application principale. Les alias restent des
        // `ProjectDomain`, rattachés à l'application quand `appId` est renseigné.
        if (host === domain) {
          if (app) {
            await prisma.projectApp.update({ where: { id: app.id }, data })
            if (context.primary) {
              await prisma.project.update({ where: { id: project.id }, data })
            }
          } else {
            await prisma.project.update({ where: { id: project.id }, data })
          }
        } else {
          await prisma.projectDomain.updateMany({
            where: {
              projectId: project.id,
              hostname: host,
              ...(app
                ? { OR: [{ appId: app.id }, ...(context.primary ? [{ appId: null }] : [])] }
                : {}),
            },
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
      await processDeployment(String(job.data.deploymentId), {
        rollback: job.data.rollback === true,
      })
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
