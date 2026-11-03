import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { getProfileHandler, updateProfileHandler } from '../controllers/tenant.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/', getProfileHandler)
router.patch('/', requireRole('admin'), updateProfileHandler)

export default router
