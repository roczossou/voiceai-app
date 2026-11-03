import { Router } from 'express'
import { requireAuth, requireRole } from '../middleware/auth.js'
import { listHandler, createHandler, updateHandler, deleteHandler } from '../controllers/llm-key.controller.js'

const router = Router()

router.use(requireAuth, requireRole('admin'))

router.get('/',      listHandler)
router.post('/',     createHandler)
router.patch('/:id', updateHandler)
router.delete('/:id', deleteHandler)

export default router
