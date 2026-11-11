import type { DeployBackend } from '@/lib/deploy-backend'
import {
  applicationAction,
  cancelDeployment,
  checkConnection,
  createApplication,
  createManagedDatabase,
  createPrivateKey,
  decodeDeploymentLogs,
  deleteApplication,
  deleteManagedDatabase,
  deletePrivateKey,
  deployApplication,
  deployApplicationCommit,
  ensureApplicationStorages,
  getApplicationLogs,
  getApplicationMetrics,
  getApplicationRuntime,
  getDeploymentDetails,
  getDeploymentLogs,
  getDeploymentStatus,
  getManagedDatabase,
  listApplications,
  managedDatabaseAction,
  setApplicationLabels,
  setComposeApplicationDomains,
  setEnvironmentVariable,
  updateApplication,
} from '@/lib/coolify'

/**
 * Implémentation `DeployBackend` pour Coolify (ADR-0011).
 * Délégation 1:1 vers `@/lib/coolify` afin de conserver strictement le
 * comportement existant (cache de cible, env, idempotences, contrats HTTP).
 */
export const coolifyBackend: DeployBackend = {
  name: 'coolify',

  createApplication,
  updateApplication,
  setApplicationLabels,
  setComposeApplicationDomains,
  setEnvironmentVariable,
  ensureApplicationStorages,

  deployApplication,
  deployApplicationCommit,

  getDeploymentStatus,
  getDeploymentLogs,
  getDeploymentDetails,
  decodeDeploymentLogs,
  cancelDeployment,

  deleteApplication,
  getApplicationRuntime,
  applicationAction,
  getApplicationLogs,
  getApplicationMetrics,
  listApplications,
  checkConnection,

  createPrivateKey,
  deletePrivateKey,

  createManagedDatabase,
  getManagedDatabase,
  deleteManagedDatabase,
  managedDatabaseAction,
}
