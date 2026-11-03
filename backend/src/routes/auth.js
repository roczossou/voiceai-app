import { Router } from 'express'
import { registerHandler, loginHandler, meHandler } from '../controllers/auth.controller.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()

router.post('/register', registerHandler)
router.post('/login', loginHandler)
router.get('/me', requireAuth, meHandler)

export default router
