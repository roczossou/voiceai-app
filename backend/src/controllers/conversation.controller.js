import {
  listConversations, getConversation, createConversation, addMessage,
} from '../services/conversation.service.js'

export async function listHandler(req, res, next) {
  try {
    const convs = await listConversations(req.params.agentId, req.user.tenantId)
    res.json({ data: convs, total: convs.length })
  } catch (err) { next(err) }
}

export async function getHandler(req, res, next) {
  try {
    const conv = await getConversation(req.params.id, req.user.tenantId)
    res.json(conv)
  } catch (err) { next(err) }
}

export async function createHandler(req, res, next) {
  try {
    const { agentId, metadata } = req.body
    if (!agentId) return res.status(400).json({ title: 'agentId is required', status: 400 })
    const conv = await createConversation(agentId, req.user.tenantId, metadata)
    res.status(201).json(conv)
  } catch (err) { next(err) }
}

export async function addMessageHandler(req, res, next) {
  try {
    const { role, content, tokens } = req.body
    if (!role || !content) return res.status(400).json({ title: 'role and content are required', status: 400 })
    if (!['user', 'assistant', 'system'].includes(role)) {
      return res.status(400).json({ title: 'role must be user, assistant or system', status: 400 })
    }
    const msg = await addMessage(req.params.id, req.user.tenantId, { role, content, tokens })
    res.status(201).json(msg)
  } catch (err) { next(err) }
}
