/**
 * Migration / rotation des variables d'environnement (issue 04).
 *
 * Depuis la RACINE du dépôt :
 *   pnpm exec tsx portail/scripts/encrypt-existing-env-vars.ts
 *
 * Variables requises : DATABASE_URL, ENV_ENCRYPTION_KEY.
 * Pour une rotation : renseigner aussi ENV_ENCRYPTION_KEY_PREVIOUS (ancienne
 * clé) ; toutes les valeurs sont alors rechiffrées avec la clé courante.
 *
 * Le script n'affiche jamais les valeurs, seulement des compteurs.
 */
import { PrismaClient } from '@prisma/client'
import { decrypt, encrypt, isEncrypted } from '../src/lib/crypto'

const prisma = new PrismaClient()

async function main() {
  const rotation = Boolean(process.env.ENV_ENCRYPTION_KEY_PREVIOUS)
  const rows = await prisma.envVar.findMany({
    select: { projectId: true, key: true, value: true },
  })

  let migrated = 0
  let rotated = 0
  for (const row of rows) {
    const aad = `${row.projectId}:${row.key}`
    const plaintext = decrypt(row.value, aad)
    if (!isEncrypted(row.value) || rotation) {
      await prisma.envVar.update({
        where: { projectId_key: { projectId: row.projectId, key: row.key } },
        data: { value: encrypt(plaintext, aad) },
      })
      if (isEncrypted(row.value)) rotated += 1
      else migrated += 1
    }
  }

  console.log(`Variables examinées : ${rows.length}`)
  console.log(`Valeurs en clair chiffrées : ${migrated}`)
  console.log(`Valeurs rechiffrées (rotation) : ${rotated}`)
}

main()
  .catch((error) => {
    console.error('Migration échouée :', error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
