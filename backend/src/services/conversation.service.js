import { prisma } from './db.js'
import { getAgent } from './agent.service.js'

export async function listConversations(agentId, tenantId) {
  await getAgent(agentId, tenantId)
  return prisma.conversation.findMany({
    where: { agentId },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      agentId: true,
      sessionId: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { messages: true } },
    },
  })
}

export async function getConversation(id, tenantId) {
  const conv = await prisma.conversation.findFirst({
    where: { id, agent: { tenantId } },
    include: { messages: { orderBy: { createdAt: 'asc' } } },
  })
  if (!conv) notFound('Conversation')
  return conv
}

export async function createConversation(agentId, tenantId, metadata = {}) {
  await getAgent(agentId, tenantId)
  const sessionId = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return prisma.conversation.create({
    data: { agentId, sessionId, metadata },
    include: { messages: true },
  })
}

/**
 * Widget public : retrouve la conversation par sessionId (fourni par le widget,
 * stocké côté navigateur) ou en crée une nouvelle. Aucune authentification user —
 * l'agent a déjà été résolu via sa clé publique en amont.
 */
export async function getOrCreatePublicConversation(agentId, sessionId) {
  if (sessionId) {
    const existing = await prisma.conversation.findFirst({
      where: { sessionId, agentId },
      select: { id: true, sessionId: true },
    })
    if (existing) return existing
  }
  const newSessionId = sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return prisma.conversation.create({
    data: { agentId, sessionId: newSessionId, metadata: { source: 'widget' } },
    select: { id: true, sessionId: true },
  })
}

export async function addMessage(conversationId, tenantId, { role, content, tokens }) {
  await getConversation(conversationId, tenantId)
  const message = await prisma.message.create({
    data: { conversationId, role, content, tokens },
  })
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  })
  return message
}

function notFound(resource) {
  const err = new Error(`${resource} not found`)
  err.status = 404
  throw err
}
