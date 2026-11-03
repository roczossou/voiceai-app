import {
  listAgents, getAgent, createAgent, updateAgent, deleteAgent,
} from '../services/agent.service.js'

export async function listHandler(req, res, next) {
  try {
    const agents = await listAgents(req.user.tenantId)
    res.json({ data: agents, total: agents.length })
  } catch (err) { next(err) }
}

export async function getHandler(req, res, next) {
  try {
    const agent = await getAgent(req.params.id, req.user.tenantId)
    res.json(agent)
  } catch (err) { next(err) }
}

export async function createHandler(req, res, next) {
  try {
    const { name, description, type, config } = req.body
    if (!name) return res.status(400).json({ title: 'name is required', status: 400 })
    const agent = await createAgent(req.user.tenantId, { name, description, type, config })
    res.status(201).json(agent)
  } catch (err) { next(err) }
}

export async function updateHandler(req, res, next) {
  try {
    const agent = await updateAgent(req.params.id, req.user.tenantId, req.body)
    res.json(agent)
  } catch (err) { next(err) }
}

export async function deleteHandler(req, res, next) {
  try {
    await deleteAgent(req.params.id, req.user.tenantId)
    res.status(204).end()
  } catch (err) { next(err) }
}
