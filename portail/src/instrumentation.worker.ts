import { startDeploymentWorker } from './worker'

export function ensureDeploymentWorker(): void {
  const globalForWorker = globalThis as unknown as { __eflexWorker?: unknown }
  if (!globalForWorker.__eflexWorker) {
    globalForWorker.__eflexWorker = startDeploymentWorker()
    console.info('[eflex/worker] file de déploiement démarrée')
  }
}
