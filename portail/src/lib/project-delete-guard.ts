/**
 * Garde-fou serveur de suppression d'un projet (#175) : si le projet porte des bases managées, le nom exact doit être
 * confirmé dans la requête, comme l'interface le demande déjà. Un appel d'API direct ne peut donc pas supprimer des données par erreur.
 */
export function projectDeleteBlockedReason(
  project: { name: string; databases: ReadonlyArray<unknown> },
  body: unknown,
): string | null {
  if (project.databases.length === 0) return null
  const confirmName = body && typeof body === 'object' ? (body as { confirmName?: unknown }).confirmName : undefined
  if (typeof confirmName === 'string' && confirmName === project.name) return null
  return `Ce projet contient ${project.databases.length} base(s) de données qui seront supprimées. Confirmez en envoyant le nom exact du projet (confirmName).`
}
