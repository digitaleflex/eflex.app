import { describe, expect, it } from 'vitest'
import * as coolify from '@/lib/coolify'
import { coolifyBackend } from '@/lib/backends/coolify-backend'
import { deployBackend, getDeployBackend } from '@/lib/deploy-backend'

describe('deploy-backend (ADR-0011, étape 1)', () => {
  it('expose le backend Coolify comme implémentation par défaut', () => {
    expect(getDeployBackend()).toBe(coolifyBackend)
    expect(deployBackend).toBe(coolifyBackend)
    expect(coolifyBackend.name).toBe('coolify')
  })

  it('délègue 1:1 au client Coolify existant (contrat de câblage)', () => {
    expect(coolifyBackend.createApplication).toBe(coolify.createApplication)
    expect(coolifyBackend.updateApplication).toBe(coolify.updateApplication)
    expect(coolifyBackend.setApplicationLabels).toBe(coolify.setApplicationLabels)
    expect(coolifyBackend.setComposeApplicationDomains).toBe(coolify.setComposeApplicationDomains)
    expect(coolifyBackend.setEnvironmentVariable).toBe(coolify.setEnvironmentVariable)
    expect(coolifyBackend.ensureApplicationStorages).toBe(coolify.ensureApplicationStorages)

    expect(coolifyBackend.deployApplication).toBe(coolify.deployApplication)
    expect(coolifyBackend.deployApplicationCommit).toBe(coolify.deployApplicationCommit)

    expect(coolifyBackend.getDeploymentStatus).toBe(coolify.getDeploymentStatus)
    expect(coolifyBackend.getDeploymentLogs).toBe(coolify.getDeploymentLogs)
    expect(coolifyBackend.getDeploymentDetails).toBe(coolify.getDeploymentDetails)
    expect(coolifyBackend.decodeDeploymentLogs).toBe(coolify.decodeDeploymentLogs)
    expect(coolifyBackend.cancelDeployment).toBe(coolify.cancelDeployment)

    expect(coolifyBackend.deleteApplication).toBe(coolify.deleteApplication)
    expect(coolifyBackend.getApplicationRuntime).toBe(coolify.getApplicationRuntime)
    expect(coolifyBackend.applicationAction).toBe(coolify.applicationAction)
    expect(coolifyBackend.getApplicationLogs).toBe(coolify.getApplicationLogs)
    expect(coolifyBackend.getApplicationMetrics).toBe(coolify.getApplicationMetrics)
    expect(coolifyBackend.listApplications).toBe(coolify.listApplications)
    expect(coolifyBackend.checkConnection).toBe(coolify.checkConnection)

    expect(coolifyBackend.createPrivateKey).toBe(coolify.createPrivateKey)
    expect(coolifyBackend.deletePrivateKey).toBe(coolify.deletePrivateKey)

    expect(coolifyBackend.createManagedDatabase).toBe(coolify.createManagedDatabase)
    expect(coolifyBackend.getManagedDatabase).toBe(coolify.getManagedDatabase)
    expect(coolifyBackend.deleteManagedDatabase).toBe(coolify.deleteManagedDatabase)
    expect(coolifyBackend.managedDatabaseAction).toBe(coolify.managedDatabaseAction)
  })
})
