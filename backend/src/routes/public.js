import { Router } from 'express'
import cors from 'cors'
import { publicChatHandler, publicAgentConfigHandler } from '../controllers/public.controller.js'
import { rateLimit } from '../middleware/rate-limit.js'

const router = Router()

// CORS ouvert : le widget est embarqué sur des domaines tiers arbitraires.
// L'auth se fait par clé d'agent (X-Agent-Key), pas par cookie → pas de
// credentials, donc origin '*' est sûr. L'allowlist fine par agent
// (allowedOrigins) est appliquée dans les handlers.
const publicCors = cors({
  origin: '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'X-Agent-Key'],
})

router.use(publicCors)
router.options(/.*/, publicCors)

// Rate-limit du widget par clé d'agent : 60 messages/min par agent public
// (anti-abus / anti-fuite de quota LLM sur une clé exposée côté client).
router.use('/chat', rateLimit({ windowSec: 60, limit: 60, keyFn: (req) => `widget:${req.get('X-Agent-Key') ?? req.ip}` }))

router.get('/agents/:key/config', publicAgentConfigHandler)
router.post('/chat', publicChatHandler)

export default router
