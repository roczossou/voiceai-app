import { PrismaClient } from '@prisma/client'
import { PrismaNeon } from '@prisma/adapter-neon'
import { neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

// Node.js 24 undici and ws attempt IPv6 via Happy Eyeballs, but IPv6 is
// unreachable on this host (ENETUNREACH), causing connections to hang instead
// of falling back to IPv4. Force all WebSocket connections to use IPv4 only.
class WsIPv4 extends ws {
  constructor(url, protocols, options) {
    super(url, protocols, { ...options, family: 4 })
  }
}

neonConfig.webSocketConstructor = WsIPv4

// PrismaNeon creates its own Pool internally using the config object.
// Passing a raw string triggers a Prisma runtime TypeError; use an object.
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL })

export const prisma = new PrismaClient({ adapter })
