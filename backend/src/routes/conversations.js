import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { listHandler, getHandler, createHandler, addMessageHandler } from '../controllers/conversation.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/agent/:agentId', listHandler)
router.get('/:id', getHandler)
router.post('/', createHandler)
router.post('/:id/messages', addMessageHandler)

export default router
