import { prisma } from '@/lib/prisma'
import { createServerDestination, listServerDestinations } from '@/lib/coolify'
import { runWithDestination } from '@/lib/org-network-context'

/**
 * Un réseau Docker par organisation (audit S5, issue #171).
 * Désactivé par défaut (`EFLEX_ORG_NETWORKS=1` pour l'activer) : il n'a été validé que contre le contrat OpenAPI
 * de Coolify 4.7.5, pas sur un vrai serveur (voir docs/operations/reseau-par-organisation.md).
 */
export function orgNetworksEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.EFLEX_ORG_NETWORKS === '1' || env.EFLEX_ORG_NETWORKS === 'true'
}

/** Nom de réseau Docker valide (`^[a-zA-Z0-9][a-zA-Z0-9._-]*$`), dérivé de l'identifiant interne, jamais du nom saisi. */
export function orgNetworkName(organizationId: string): string {
  const safe = organizationId.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32)
  return `eflex-net-${safe || 'org'}`
}

export class OrgNetworkError extends Error {}

/** Retourne l'uuid de la destination de l'organisation, en la créant au besoin (idempotent, tolérant aux courses). */
export async function ensureOrganizationDestination(organizationId: string): Promise<string> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { coolifyDestinationUuid: true },
  })
  if (!org) throw new OrgNetworkError('Organisation introuvable.')
  if (org.coolifyDestinationUuid) return org.coolifyDestinationUuid

  const network = orgNetworkName(organizationId)
  let uuid: string | null = null
  const created = await createServerDestination(network, network)
  if ('uuid' in created) {
    uuid = created.uuid
  } else if (created.conflict) {
    // Créé en parallèle ou lors d'un essai précédent : on reprend le réseau existant du même nom.
    const existing = await listServerDestinations()
    if (!('error' in existing)) uuid = existing.find((d) => d.network === network)?.uuid ?? null
  }
  if (!uuid) throw new OrgNetworkError(`Réseau de l’organisation indisponible : ${'error' in created ? created.error : 'inconnu'}`)

  await prisma.organization.update({ where: { id: organizationId }, data: { coolifyDestinationUuid: uuid } })
  return uuid
}

/**
 * Exécute un provisionnement dans le réseau de l'organisation quand le drapeau est actif.
 * Échoue **fermé** : si le réseau ne peut pas être préparé, rien n'est créé dans le réseau partagé.
 */
export async function inOrganizationNetwork<T>(organizationId: string, fn: () => Promise<T>): Promise<T> {
  if (!orgNetworksEnabled()) return fn()
  const uuid = await ensureOrganizationDestination(organizationId)
  return runWithDestination(uuid, fn)
}
