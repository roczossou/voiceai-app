import { prisma } from './db.js'

export async function listAgents(tenantId) {
  return prisma.agent.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getAgent(id, tenantId) {
  // Cache Redis 5 min : lu à chaque tour de chat.
  const { cacheGetJson, cacheSet } = await import('./redis.js')
  const key = `agent:${id}:${tenantId}`
  const cached = await cacheGetJson(key)
  if (cached) return cached
  const agent = await prisma.agent.findFirst({ where: { id, tenantId } })
  if (!agent) notFound('Agent')
  await cacheSet(key, agent, 300).catch(() => {})
  return agent
}

/**
 * Résout un agent depuis sa clé publique (widget embarqué). Retourne aussi le
 * tenantId — c'est la seule source de vérité du tenant côté public, jamais le body.
 * Refuse les agents non publiés (status !== 'published').
 */
export async function getAgentByPublicKey(publicKey) {
  if (!publicKey) notFound('Agent')
  // Cache Redis 5 min : lu à chaque requête du widget (config + chat).
  const { cacheGetJson, cacheSet } = await import('./redis.js')
  const key = `agent:pk:${publicKey}`
  const cached = await cacheGetJson(key)
  if (cached) return cached
  const agent = await prisma.agent.findUnique({ where: { publicKey } })
  if (!agent) notFound('Agent')
  if (agent.status !== 'published') {
    const err = new Error('Agent not published')
    err.status = 403
    throw err
  }
  await cacheSet(key, agent, 300).catch(() => {})
  return agent
}

export async function createAgent(tenantId, data) {
  const { name, description, type = 'chat', config = {} } = data
  return prisma.agent.create({
    data: { name, description, type, config, tenantId },
  })
}

export async function updateAgent(id, tenantId, data) {
  await getAgent(id, tenantId)
  const { name, description, type, status, config, remarks, allowedOrigins } = data
  const updated = await prisma.agent.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(type !== undefined && { type }),
      ...(status !== undefined && { status }),
      ...(config !== undefined && { config }),
      ...(remarks !== undefined && { remarks }),
      ...(allowedOrigins !== undefined && { allowedOrigins }),
    },
  })
  await invalidateAgentCache(id, tenantId, updated.publicKey)
  return updated
}

export async function deleteAgent(id, tenantId) {
  const agent = await getAgent(id, tenantId)
  await prisma.agent.delete({ where: { id } })
  await invalidateAgentCache(id, tenantId, agent.publicKey)
}

async function invalidateAgentCache(id, tenantId, publicKey) {
  const { cacheDel } = await import('./redis.js')
  await cacheDel(`agent:${id}:${tenantId}`).catch(() => {})
  if (publicKey) await cacheDel(`agent:pk:${publicKey}`).catch(() => {})
}

function notFound(resource) {
  const err = new Error(`${resource} not found`)
  err.status = 404
  throw err
}
