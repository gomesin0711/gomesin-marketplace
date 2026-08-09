import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

let _db: PrismaClient | null | undefined = undefined

function getDb(): PrismaClient | null {
  if (_db !== undefined) return _db
  if (!process.env.DATABASE_URL) {
    _db = null
    return null
  }
  try {
    _db = globalForPrisma.prisma ?? new PrismaClient({
      log: ['error'],
    })
    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _db
  } catch {
    _db = null
  }
  return _db
}

// Lazy proxy — only instantiates PrismaClient on first actual query
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getDb()
    if (!client) throw new Error('Database not available')
    const value = (client as any)[prop]
    if (typeof value === 'function') return value.bind(client)
    return value
  },
})

export function isDbAvailable(): boolean {
  return getDb() !== null
}
