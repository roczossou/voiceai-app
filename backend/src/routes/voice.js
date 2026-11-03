import { Router } from 'express'
import multer from 'multer'
import { requireAuth } from '../middleware/auth.js'
import { transcribeHandler } from '../controllers/voice.controller.js'
import { ttsHandler } from '../controllers/tts.controller.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB max (limite Groq)
})

const router = Router()

router.use(requireAuth)
router.post('/transcribe', upload.single('audio'), transcribeHandler)
router.post('/tts', ttsHandler)

export default router
