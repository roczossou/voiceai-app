import { prisma } from './db.js'
import { getAgent } from './agent.service.js'
import { checkSlot, resolveService, suggestSlots, DEFAULT_DURATION_MINUTES } from './availability.service.js'
import { sendAppointmentNotification } from './email.service.js'

function notFound(resource) {
  const err = new Error(`${resource} not found`)
  err.status = 404
  throw err
}

export async function listAppointments(tenantId, { agentId } = {}) {
  return prisma.appointment.findMany({
    where: { tenantId, ...(agentId && { agentId }) },
    orderBy: { startsAt: 'asc' },
    include: { service: { select: { name: true } }, agent: { select: { name: true } } },
  })
}

export async function getAppointment(id, tenantId) {
  const appt = await prisma.appointment.findFirst({ where: { id, tenantId } })
  if (!appt) notFound('Appointment')
  return appt
}

export async function cancelAppointment(id, tenantId) {
  await getAppointment(id, tenantId)
  return prisma.appointment.update({ where: { id }, data: { status: 'cancelled' } })
}

/**
 * Vérifie la disponibilité d'un créneau — utilisé par l'outil IA `check_availability`.
 * Ne réserve rien, renvoie juste le verdict + des alternatives si indisponible.
 */
export async function checkAvailability({ tenant, agentId, serviceId, date, time }) {
  const service = await resolveService(tenant.id, agentId, serviceId)
  const durationMinutes = service?.durationMinutes ?? DEFAULT_DURATION_MINUTES

  const result = await checkSlot({ tenant, agentId, durationMinutes, date, time })
  if (result.available) return { available: true }

  const alternatives = await suggestSlots({ tenant, agentId, durationMinutes, fromDate: date })
  return { available: false, reason: result.reason, alternatives }
}

/**
 * Réserve un rendez-vous — utilisé par l'outil IA `book_appointment`.
 * Re-vérifie la disponibilité DANS la transaction pour éviter une double
 * réservation si deux conversations tentent le même créneau en parallèle.
 */
export async function bookAppointment({ tenant, agentId, conversationId, serviceId, date, time, customerName, customerContact, notes }) {
  await getAgent(agentId, tenant.id)
  const service = await resolveService(tenant.id, agentId, serviceId)
  const durationMinutes = service?.durationMinutes ?? DEFAULT_DURATION_MINUTES

  const result = await checkSlot({ tenant, agentId, durationMinutes, date, time })
  if (!result.available) {
    const alternatives = await suggestSlots({ tenant, agentId, durationMinutes, fromDate: date })
    return { booked: false, reason: result.reason, alternatives }
  }

  let appointment
  try {
    appointment = await prisma.$transaction(async (tx) => {
      const conflict = await tx.appointment.findFirst({
        where: {
          agentId,
          status: 'confirmed',
          startsAt: { lt: result.endsAt },
          endsAt:   { gt: result.startsAt },
        },
      })
      if (conflict) {
        const err = new Error('slot_taken')
        err.code = 'SLOT_TAKEN'
        throw err
      }

      return tx.appointment.create({
        data: {
          tenantId: tenant.id,
          agentId,
          serviceId: service?.id ?? null,
          conversationId: conversationId ?? null,
          customerName: customerName ?? null,
          customerContact: customerContact ?? null,
          startsAt: result.startsAt,
          endsAt: result.endsAt,
          notes: notes ?? null,
        },
      })
    })
  } catch (err) {
    if (err.code === 'SLOT_TAKEN') {
      const alternatives = await suggestSlots({ tenant, agentId, durationMinutes, fromDate: date })
      return { booked: false, reason: 'creneau_pris', alternatives }
    }
    throw err
  }

  const agent = await getAgent(agentId, tenant.id)
  sendAppointmentNotification({ tenant, agent, appointment, service }).catch(err =>
    console.error('[Email] Notification RDV non envoyée :', err.message)
  )

  return { booked: true, appointment }
}
