import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { listHandler, getHandler, cancelHandler } from '../controllers/appointment.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/', listHandler)
router.get('/:id', getHandler)
router.patch('/:id/cancel', requireRole('admin'), cancelHandler)

export default router
