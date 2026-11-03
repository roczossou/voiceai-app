import { Router } from 'express'
import { requireAuth } from '../middleware/auth.js'
import { chatHandler } from '../controllers/chat.controller.js'

const router = Router()

router.use(requireAuth)
router.post('/', chatHandler)

export default router
