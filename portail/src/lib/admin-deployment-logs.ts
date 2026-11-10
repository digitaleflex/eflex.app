/**
 * Journaux vus depuis la console d'administration (issue #28).
 *
 * Les valeurs des variables d'environnement sont déchiffrées **uniquement pour
 * être masquées** dans le texte affiché : elles ne quittent jamais le serveur.
 * Une variable illisible est ignorée (elle ne peut pas fuiter sous une forme
 * qu'on ne saurait pas reconnaître).
 */
import { decrypt } from './crypto'
import { maskSecrets } from './log-lines'

export interface EncryptedVariable {
  key: string
  value: string
}

/** Valeurs en clair des variables d'un projet, dans le seul but de les masquer. */
export function readableSecrets(projectId: string, variables: readonly EncryptedVariable[]): string[] {
  const secrets: string[] = []
  for (const variable of variables) {
    try {
      secrets.push(decrypt(variable.value, `${projectId}:${variable.key}`))
    } catch {
      // Variable illisible : ignorée.
    }
  }
  return secrets
}

/** Masque les valeurs connues du projet dans un extrait de journal. */
export function maskProjectLogs(
  projectId: string,
  variables: readonly EncryptedVariable[],
  logs: string | null | undefined,
): string {
  if (!logs) return ''
  return maskSecrets(logs, readableSecrets(projectId, variables))
}
