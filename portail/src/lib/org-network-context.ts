import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Contexte de réseau (destination Coolify) de l'organisation en cours de provisionnement (S5, #171).
 * Fichier sans dépendance pour que `coolify.ts` puisse le lire sans import circulaire.
 */
const storage = new AsyncLocalStorage<{ destinationUuid: string }>()

export function runWithDestination<T>(destinationUuid: string, fn: () => Promise<T>): Promise<T> {
  return storage.run({ destinationUuid }, fn)
}

/** Champ `destination_uuid` à ajouter aux créations Coolify ; vide hors contexte (réseau partagé historique). */
export function destinationFields(): { destination_uuid?: string } {
  const store = storage.getStore()
  return store ? { destination_uuid: store.destinationUuid } : {}
}
