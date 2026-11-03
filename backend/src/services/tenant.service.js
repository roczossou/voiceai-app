import { prisma } from './db.js'

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

function isValidTimeZone(tz) {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export async function getProfile(tenantId) {
  // Cache Redis 5 min : le profil tenant est lu à CHAQUE tour de chat.
  const { cacheGetJson, cacheSet } = await import('./redis.js')
  const key = `tenant:${tenantId}`
  const cached = await cacheGetJson(key)
  if (cached) return cached
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) notFound('Tenant')
  await cacheSet(key, tenant, 300).catch(() => {})
  return tenant
}

export async function updateProfile(tenantId, data) {
  const { description, address, contactEmail, contactPhone, timezone, openingHours } = data

  if (timezone !== undefined && !isValidTimeZone(timezone)) {
    badRequest(`Fuseau horaire invalide : "${timezone}". Utilise un identifiant IANA, ex. "Europe/Paris" ou "Africa/Porto-Novo".`)
  }

  const updated = await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      ...(description   !== undefined && { description }),
      ...(address       !== undefined && { address }),
      ...(contactEmail  !== undefined && { contactEmail }),
      ...(contactPhone  !== undefined && { contactPhone }),
      ...(timezone      !== undefined && { timezone }),
      ...(openingHours  !== undefined && { openingHours }),
    },
  })
  // Invalide le cache profil (sinon l'ancien profil serait servi 5 min)
  const { cacheDel } = await import('./redis.js')
  await cacheDel(`tenant:${tenantId}`).catch(() => {})
  return updated
}
