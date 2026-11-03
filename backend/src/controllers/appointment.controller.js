import { listAppointments, getAppointment, cancelAppointment } from '../services/appointment.service.js'

export async function listHandler(req, res, next) {
  try {
    const appointments = await listAppointments(req.user.tenantId, { agentId: req.query.agentId })
    res.json({ data: appointments, total: appointments.length })
  } catch (err) { next(err) }
}

export async function getHandler(req, res, next) {
  try {
    const appointment = await getAppointment(req.params.id, req.user.tenantId)
    res.json(appointment)
  } catch (err) { next(err) }
}

export async function cancelHandler(req, res, next) {
  try {
    const appointment = await cancelAppointment(req.params.id, req.user.tenantId)
    res.json(appointment)
  } catch (err) { next(err) }
}
