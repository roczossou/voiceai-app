import { prisma } from './db.js'

const MIN_DURATION_MINUTES = 5
const MAX_DURATION_MINUTES = 365 * 24 * 60 // 1 an — couvre les engagements longs (semaines/mois) tout en bloquant les fautes de saisie

function notFound(resource) {
  const err = new Error(`${resource} not found`)
  err.status = 404
  throw err
}

function badRequest(message) {
  const err = new Error(message)
  err.status = 400
  throw err
}

function validateDuration(durationMinutes) {
  if (durationMinutes === undefined) return
  if (!Number.isInteger(durationMinutes) || durationMinutes < MIN_DURATION_MINUTES || durationMinutes > MAX_DURATION_MINUTES) {
    badRequest(`Durée invalide : doit être un entier entre ${MIN_DURATION_MINUTES} et ${MAX_DURATION_MINUTES} minutes.`)
  }
}

export async function listServices(tenantId) {
  return prisma.service.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
    include: { agent: { select: { id: true, name: true } } },
  })
}

export async function listApplicableServices(tenantId, agentId) {
  return prisma.service.findMany({
    where: { tenantId, isActive: true, OR: [{ isSharedToAll: true }, { agentId }] },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getService(id, tenantId) {
  const service = await prisma.service.findFirst({ where: { id, tenantId } })
  if (!service) notFound('Service')
  return service
}

export async function createService(tenantId, data) {
  const { name, description, durationMinutes, isSharedToAll, agentId } = data
  validateDuration(durationMinutes)
  return prisma.service.create({
    data: {
      tenantId,
      name,
      description,
      durationMinutes: durationMinutes ?? 30,
      isSharedToAll: Boolean(isSharedToAll),
      agentId: isSharedToAll ? null : (agentId ?? null),
    },
  })
}

export async function updateService(id, tenantId, data) {
  await getService(id, tenantId)
  const { name, description, durationMinutes, isActive, isSharedToAll, agentId } = data
  validateDuration(durationMinutes)
  return prisma.service.update({
    where: { id },
    data: {
      ...(name             !== undefined && { name }),
      ...(description      !== undefined && { description }),
      ...(durationMinutes   !== undefined && { durationMinutes }),
      ...(isActive          !== undefined && { isActive }),
      ...(isSharedToAll     !== undefined && { isSharedToAll, agentId: isSharedToAll ? null : agentId ?? null }),
      ...(isSharedToAll === undefined && agentId !== undefined && { agentId }),
    },
  })
}

export async function deleteService(id, tenantId) {
  await getService(id, tenantId)
  await prisma.service.delete({ where: { id } })
}
