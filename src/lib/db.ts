import { PrismaClient } from '@prisma/client'

// Bump this whenever the Prisma schema gains/loses models or fields to force
// the dev server to drop its cached singleton and pick up the regenerated client.
const SCHEMA_VERSION = 'v2-notes-starred'

const globalForPrisma = globalThis as unknown as {
  __prismaVersion?: string
  prisma: PrismaClient | undefined
}

// If the cached client was built from a different schema version, discard it
// so a fresh PrismaClient is constructed with the latest generated code.
if (globalForPrisma.__prismaVersion !== SCHEMA_VERSION) {
  if (globalForPrisma.prisma) {
    globalForPrisma.prisma.$disconnect().catch(() => {})
  }
  globalForPrisma.prisma = undefined
  globalForPrisma.__prismaVersion = SCHEMA_VERSION
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
