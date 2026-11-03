import {
  listServices, listApplicableServices, getService, createService, updateService, deleteService,
} from '../services/service.service.js'

export async function listHandler(req, res, next) {
  try {
    const services = req.query.agentId
      ? await listApplicableServices(req.user.tenantId, req.query.agentId)
      : await listServices(req.user.tenantId)
    res.json({ data: services, total: services.length })
  } catch (err) { next(err) }
}

export async function getHandler(req, res, next) {
  try {
    const service = await getService(req.params.id, req.user.tenantId)
    res.json(service)
  } catch (err) { next(err) }
}

export async function createHandler(req, res, next) {
  try {
    const { name } = req.body
    if (!name) return res.status(400).json({ title: 'name is required', status: 400 })
    const service = await createService(req.user.tenantId, req.body)
    res.status(201).json(service)
  } catch (err) { next(err) }
}

export async function updateHandler(req, res, next) {
  try {
    const service = await updateService(req.params.id, req.user.tenantId, req.body)
    res.json(service)
  } catch (err) { next(err) }
}

export async function deleteHandler(req, res, next) {
  try {
    await deleteService(req.params.id, req.user.tenantId)
    res.status(204).end()
  } catch (err) { next(err) }
}
