import { prisma } from './db.js'
import { zonedTimeToUtc, dayKeyInTimeZone, addDays } from './timezone.util.js'

const DEFAULT_DURATION_MINUTES = 30
const SLOT_STEP_MINUTES = 30
const MAX_DAYS_AHEAD = 7
const MAX_SUGGESTIONS = 3
const ONE_DAY_MINUTES = 24 * 60

// Un engagement (ex : projet de plusieurs jours/semaines) ne peut pas se
// terminer "avant la fermeture" du jour de début — seul le créneau de
// démarrage doit tomber dans les horaires d'ouverture.
const isLongEngagement = (durationMinutes) => durationMinutes >= ONE_DAY_MINUTES

export async function resolveService(tenantId, agentId, serviceId) {
  if (!serviceId) return null
  return prisma.service.findFirst({
    where: {
      id: serviceId,
      tenantId,
      isActive: true,
      OR: [{ isSharedToAll: true }, { agentId }],
    },
  })
}

function openRangesForDay(tenant, dateStr) {
  const dayKey = dayKeyInTimeZone(dateStr, tenant.timezone)
  const ranges = tenant.openingHours?.[dayKey] ?? []
  return ranges.map(r => ({
    start: zonedTimeToUtc(dateStr, r.start, tenant.timezone),
    end:   zonedTimeToUtc(dateStr, r.end, tenant.timezone),
  }))
}

async function hasConflict(agentId, startsAt, endsAt) {
  const conflict = await prisma.appointment.findFirst({
    where: {
      agentId,
      status: 'confirmed',
      startsAt: { lt: endsAt },
      endsAt:   { gt: startsAt },
    },
  })
  return Boolean(conflict)
}

function isWithinOpeningHours(ranges, startsAt, endsAt, durationMinutes) {
  if (isLongEngagement(durationMinutes)) {
    return ranges.some(r => startsAt >= r.start && startsAt <= r.end)
  }
  return ranges.some(r => startsAt >= r.start && endsAt <= r.end)
}

/**
 * Vérifie si un créneau (date "YYYY-MM-DD" + heure "HH:mm", fuseau tenant)
 * est disponible : dans les horaires d'ouverture ET sans conflit existant.
 */
export async function checkSlot({ tenant, agentId, durationMinutes, date, time }) {
  const startsAt = zonedTimeToUtc(date, time, tenant.timezone)
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)

  if (startsAt.getTime() < Date.now()) {
    return { available: false, reason: 'date_passee', startsAt, endsAt }
  }

  const ranges = openRangesForDay(tenant, date)
  if (!isWithinOpeningHours(ranges, startsAt, endsAt, durationMinutes)) {
    return { available: false, reason: 'hors_horaires', startsAt, endsAt }
  }

  if (await hasConflict(agentId, startsAt, endsAt)) {
    return { available: false, reason: 'creneau_pris', startsAt, endsAt }
  }

  return { available: true, startsAt, endsAt }
}

/**
 * Cherche les prochains créneaux libres à partir de `date`, par pas de
 * SLOT_STEP_MINUTES, dans la limite de MAX_DAYS_AHEAD jours.
 */
export async function suggestSlots({ tenant, agentId, durationMinutes, fromDate }) {
  const suggestions = []

  for (let dayOffset = 0; dayOffset <= MAX_DAYS_AHEAD && suggestions.length < MAX_SUGGESTIONS; dayOffset++) {
    const date = addDays(fromDate, dayOffset)
    const ranges = openRangesForDay(tenant, date)

    const longEngagement = isLongEngagement(durationMinutes)

    for (const range of ranges) {
      let cursor = new Date(range.start)
      const fitsInRange = () => longEngagement
        ? cursor.getTime() <= range.end.getTime()
        : cursor.getTime() + durationMinutes * 60_000 <= range.end.getTime()

      while (fitsInRange() && suggestions.length < MAX_SUGGESTIONS) {
        const startsAt = new Date(cursor)
        const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000)

        if (startsAt.getTime() >= Date.now() && !(await hasConflict(agentId, startsAt, endsAt))) {
          suggestions.push({ date, startsAt, endsAt })
        }
        cursor = new Date(cursor.getTime() + SLOT_STEP_MINUTES * 60_000)
      }
    }
  }

  return suggestions
}

export { DEFAULT_DURATION_MINUTES }
