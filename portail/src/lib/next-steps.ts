/** Étapes suggérées après le premier déploiement réussi. */

export interface NextStepsInput {
  hasVerifiedDomain: boolean
  hasEnvVars: boolean
  memberCount: number
  hasSuccessfulDeploy: boolean
  canManage: boolean
}

export interface NextStep {
  id: 'domain' | 'env' | 'team'
  label: string
  href: string
  done: boolean
}

export function computeNextSteps(input: NextStepsInput, projectId?: string): NextStep[] {
  if (!input.canManage || !input.hasSuccessfulDeploy) return []
  const base = projectId ? `/dashboard/projects/${projectId}` : '/dashboard'
  return [
    { id: 'domain', label: 'Ajouter un domaine personnalisé', href: projectId ? `${base}?tab=domains` : '/dashboard', done: input.hasVerifiedDomain },
    { id: 'env', label: "Définir les variables d'environnement", href: projectId ? `${base}?tab=variables` : '/dashboard', done: input.hasEnvVars },
    { id: 'team', label: 'Inviter un collègue', href: '/dashboard/organization', done: input.memberCount > 1 },
  ]
}

export function allStepsDone(steps: readonly NextStep[]): boolean {
  return steps.length > 0 && steps.every((s) => s.done)
}
