/**
 * Contrat d'abstraction du backend de déploiement (ADR-0011, #14).
 *
 * Étape 1 (progressive, sans big bang) : l'interface couvre les capacités
 * réellement utilisées par le portail et l'implémentation `coolifyBackend`
 * délègue 1:1 à `@/lib/coolify` (aucun changement de comportement). Les
 * appelants sont migrés par lots dans des étapes suivantes.
 */
import type { ApplicationMetrics } from '@/lib/app-metrics'
import type {
  ApplicationAction,
  ApplicationRuntime,
  ComposeDomain,
  CreateApplicationParams,
  ManagedDatabaseInfo,
  ManagedDatabaseKind,
  PersistentStorageSpec,
} from '@/lib/coolify'
import { coolifyBackend } from '@/lib/backends/coolify-backend'

export type {
  ApplicationAction,
  ApplicationRuntime,
  ComposeDomain,
  CreateApplicationParams,
  ManagedDatabaseInfo,
  ManagedDatabaseKind,
  PersistentStorageSpec,
}
export type { ApplicationMetrics }

export type UpdateApplicationParams = {
  buildPack?: 'dockercompose' | 'dockerfile' | 'nixpacks'
  baseDirectory?: string | null
  dockerfileLocation?: string | null
  dockerComposeLocation?: string | null
  dockerComposeDomains?: readonly ComposeDomain[]
  installCommand?: string | null
  buildCommand?: string | null
  startCommand?: string | null
  publishDirectory?: string | null
  portsExposes?: string
}

export interface DeployBackend {
  readonly name: 'coolify'

  // Provisionnement / configuration d'application
  createApplication(params: CreateApplicationParams): Promise<{ id: string } | { error: string }>
  updateApplication(
    appId: string,
    params: UpdateApplicationParams,
  ): Promise<{ ok: true } | { error: string }>
  setApplicationLabels(
    appId: string,
    labels: string[],
    domains?: readonly string[],
  ): Promise<{ ok: true } | { error: string }>
  setComposeApplicationDomains(
    appId: string,
    domains: readonly ComposeDomain[],
  ): Promise<{ ok: true } | { error: string }>
  setEnvironmentVariable(
    appId: string,
    key: string,
    value: string,
    buildtime?: boolean,
  ): Promise<{ ok: boolean } | { error: string }>
  ensureApplicationStorages(
    appId: string,
    storages: readonly PersistentStorageSpec[],
  ): Promise<{ created: number; existing: number } | { error: string }>

  // Déploiement
  deployApplication(appId: string): Promise<{ deploymentId: string } | { error: string }>
  deployApplicationCommit(
    appId: string,
    commitSha: string,
  ): Promise<{ deploymentId: string } | { error: string }>

  // Statut et journaux de déploiement
  getDeploymentStatus(deploymentId: string): Promise<{ status: string } | { error: string }>
  getDeploymentLogs(deploymentId: string): Promise<{ logs: string } | { error: string }>
  getDeploymentDetails(
    deploymentId: string,
  ): Promise<{ status: string; logs: string } | { error: string }>
  decodeDeploymentLogs(raw: string | null | undefined): string
  cancelDeployment(
    deploymentId: string,
  ): Promise<{ ok: true; alreadyFinished?: boolean } | { error: string }>

  // Cycle de vie / exécution
  deleteApplication(
    appId: string,
    options?: { deleteVolumes?: boolean },
  ): Promise<{ ok: true } | { error: string }>
  getApplicationRuntime(
    appId: string,
    timeoutMs?: number,
  ): Promise<ApplicationRuntime | { error: string }>
  applicationAction(
    appId: string,
    action: ApplicationAction,
  ): Promise<{ ok: true } | { error: string }>
  getApplicationLogs(
    appId: string,
    lines?: number,
    serviceName?: string,
  ): Promise<{ logs: string } | { error: string }>
  getApplicationMetrics(appId: string, timeoutMs?: number): Promise<ApplicationMetrics>
  listApplications(
    timeoutMs?: number,
  ): Promise<{ applications: Array<Record<string, unknown>> } | { error: string }>
  checkConnection(): Promise<boolean>

  // Accès dépôt privé (clés)
  createPrivateKey(privateKey: string, name: string): Promise<{ id: string } | { error: string }>
  deletePrivateKey(uuid: string): Promise<{ ok: boolean } | { error: string }>

  // Bases managées
  createManagedDatabase(
    kind: ManagedDatabaseKind,
    name: string,
  ): Promise<ManagedDatabaseInfo | { error: string }>
  getManagedDatabase(
    id: string,
    timeoutMs?: number,
  ): Promise<ManagedDatabaseInfo | { error: string }>
  deleteManagedDatabase(id: string): Promise<{ ok: true } | { error: string }>
  managedDatabaseAction(
    id: string,
    action: 'start' | 'stop' | 'restart',
  ): Promise<{ ok: true } | { error: string }>
}

/** Point d'accès unique au backend de déploiement (Coolify par défaut, ADR-0011). */
export function getDeployBackend(): DeployBackend {
  return coolifyBackend
}

/** Instance par défaut pour migration progressive des appelants. */
export const deployBackend: DeployBackend = getDeployBackend()
