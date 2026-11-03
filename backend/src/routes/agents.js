import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { listHandler, getHandler, createHandler, updateHandler, deleteHandler } from '../controllers/agent.controller.js'

const router = Router()

router.use(requireAuth)

router.get('/', listHandler)
router.get('/:id', getHandler)
router.post('/', requireRole('admin'), createHandler)
router.patch('/:id', requireRole('admin'), updateHandler)
router.delete('/:id', requireRole('admin'), deleteHandler)

export default router
