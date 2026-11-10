/**
 * Décisions du retour arrière vers un déploiement précédent (Lot A de #21).
 *
 * Le worker ne sait pas déployer un commit arbitraire : Coolify n'expose
 * `POST /deploy` que pour le dernier commit de la branche suivie. Un retour
 * arrière passe donc par `POST /applications/{uuid}/rollback`, qui n'accepte
 * qu'un commit **déjà déployé avec succès** pour cette application. Ces règles
 * sont purement déterministes pour être testables sans Coolify ni base.
 */

/** Un commit Git complet : seule cible acceptée (un SHA court n'est pas déployable). */
export const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/

export function isCommitSha(value: string | null | undefined): value is string {
  return typeof value === 'string' && COMMIT_SHA_PATTERN.test(value)
}

export type RollbackTarget = {
  status: string
  commitSha: string
}

export type RollbackRefusal = 'invalid_commit' | 'not_live'

/**
 * Renvoie la raison du refus, ou `null` si le déploiement peut servir de point
 * de retour. L'ordre compte : un identifiant inexploitable est signalé avant
 * l'état, sinon l'utilisateur chercherait pourquoi un déploiement réussi est
 * refusé alors que le problème est le SHA.
 */
export function rollbackRefusal(target: RollbackTarget): RollbackRefusal | null {
  if (!isCommitSha(target.commitSha)) return 'invalid_commit'
  if (target.status !== 'live') return 'not_live'
  return null
}

/** Messages prêts à afficher (français), partagés par la route et l'interface. */
export const ROLLBACK_REFUSAL_MESSAGES: Record<RollbackRefusal, string> = {
  invalid_commit:
    'Ce déploiement n’a pas d’identifiant de commit complet : il ne peut pas servir de point de retour.',
  not_live:
    'Seul un déploiement réussi (en ligne) peut servir de point de retour : l’hébergement reconstruit un commit déjà déployé avec succès pour cette application.',
}
