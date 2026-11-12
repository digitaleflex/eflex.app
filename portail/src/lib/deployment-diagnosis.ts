/**
 * Diagnostic heuristique des échecs de déploiement, en français.
 * Ne renvoie une cause que sur des motifs observables ; sinon null (aucune invention).
 */

export type DiagnosisAction = { label: string; href: string }

export interface Diagnosis {
  cause: string
  action: DiagnosisAction
}

type Rule = {
  id: string
  test: (text: string) => boolean
  cause: string
  action: (projectId: string) => DiagnosisAction
}

const RULES: Rule[] = [
  {
    id: 'missing-env',
    test: (t) => /\b(missing|undefined|not set|required)\b/i.test(t) && /\b(env|environment|variable|secret)\b/i.test(t) || /process\.env\.[A-Z0-9_]+/.test(t) && /(undefined|missing)/i.test(t),
    cause: "Une variable d'environnement semble manquante.",
    action: (id) => ({ label: 'Ouvrir les variables', href: `/dashboard/projects/${id}?tab=variables` }),
  },
  {
    id: 'port',
    test: (t) => /no (open )?ports? detected|port .*not (found|listening)|exposed port|health ?check.*(fail|timeout)/i.test(t),
    cause: "Le port d'écoute de l'application n'a pas été détecté.",
    action: (id) => ({ label: 'Corriger le port', href: `/dashboard/projects/${id}/settings` }),
  },
  {
    id: 'oom',
    test: (t) => /out of memory|oom|killed process|exit code 137|javascript heap out of memory/i.test(t),
    cause: "La construction ou l'exécution semble avoir manqué de mémoire.",
    action: () => ({ label: 'Voir le plan', href: '/dashboard/organization' }),
  },
  {
    id: 'build-failed',
    test: (t) => /build (failed|error)|command failed|npm (err|error)|pnpm .*err|yarn .*error|exit code [1-9]/i.test(t),
    cause: 'La commande de build a échoué.',
    action: (id) => ({ label: 'Voir les journaux', href: `/dashboard/projects/${id}?tab=logs` }),
  },
  {
    id: 'repo-private',
    test: (t) => /repository not found|authentication failed|permission denied \(publickey\)|could not read from remote repository|fatal: could not read/i.test(t),
    cause: "Le dépôt semble inaccessible (privé ou droits insuffisants).",
    action: (id) => ({ label: 'Vérifier la connexion Git', href: `/dashboard/projects/${id}/settings` }),
  },
]

/** Retourne un diagnostic uniquement si un motif reconnu est présent. */
export function diagnoseFailure(input: { status: string; logs?: string | null; projectId: string }): Diagnosis | null {
  if (input.status !== 'failed') return null
  const text = (input.logs ?? '').toString()
  if (!text.trim()) return null
  for (const rule of RULES) {
    try {
      if (rule.test(text)) return { cause: rule.cause, action: rule.action(input.projectId) }
    } catch {
      // Un motif défectueux ne doit jamais casser l'affichage.
    }
  }
  return null
}
