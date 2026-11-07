import { PrismaClient } from '@prisma/client'

// Un seul client Prisma par processus : en dev, le hot reload recrée les modules
// et ouvrirait sinon un nouveau pool de connexions à chaque rechargement.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
