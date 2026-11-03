import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { errorHandler } from './middleware/error.js'
import healthRouter from './routes/health.js'
import authRouter from './routes/auth.js'
import agentsRouter from './routes/agents.js'
import conversationsRouter from './routes/conversations.js'
import chatRouter from './routes/chat.js'
import voiceRouter from './routes/voice.js'
import llmKeysRouter from './routes/llm-keys.js'
import tenantProfileRouter from './routes/tenant-profile.js'
import servicesRouter from './routes/services.js'
import appointmentsRouter from './routes/appointments.js'
import publicRouter from './routes/public.js'

const app = express()

// CORS dashboard : accepte FRONTEND_URL (une origine) + FRONTEND_URLS (liste
// séparée par virgules, ex: "https://localhost:5173,https://192.168.1.42:5173")
// → permet d'ouvrir le dashboard depuis un téléphone sur le même réseau local.
function allowedOrigins() {
  const list = (process.env.FRONTEND_URLS || process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
  return list
}

function isDevLocalOrigin(origin) {
  // En dev, on autorise localhost/127.0.0.1 sur N'IMPORTE quel port (5173 dashboard,
  // 5174 page de démo widget…) et les IP LAN privées (téléphone sur le même Wi-Fi).
  if (process.env.NODE_ENV === 'production') return false
  try {
    const u = new URL(origin)
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const h = u.hostname
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return true
    const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
    if (!m) return false
    const [a, b] = [+m[1], +m[2]]
    return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)
  } catch {
    return false
  }
}

const corsOptions = {
  origin: (origin, cb) => {
    // requêtes sans Origin (curl, server-to-server, WS upgrade) → OK
    if (!origin) return cb(null, true)
    if (allowedOrigins().includes(origin)) return cb(null, true)
    if (isDevLocalOrigin(origin)) return cb(null, true)
    return cb(new Error(`Origin ${origin} not allowed`))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
}))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Routes publiques du widget : CORS OUVERT (origines tierces arbitraires),
// géré dans le routeur. Montées AVANT le CORS global du dashboard — sinon leur
// preflight hériterait de l'origine frontend-only + Allow-Headers sans X-Agent-Key,
// et le navigateur rejetterait la requête du widget.
app.use('/api/v1/public', publicRouter)

// CORS global du dashboard authentifié : origine frontend + credentials.
// (Express 5 : regex au lieu de '*' pour le preflight.)
app.options(/.*/, cors(corsOptions))
app.use(cors(corsOptions))

app.use('/api/v1/health', healthRouter)
// Rate-limiting : chat (le plus coûteux en LLM) 30 req/min/tenant,
// le reste de l'API authentifiée 120 req/min/tenant. Auth non limitée pour
// ne pas bloquer le login en rafale. Le widget public est limité par clé d'agent.
import { rateLimit } from './middleware/rate-limit.js'
app.use('/api/v1/chat', rateLimit({ windowSec: 60, limit: 30, keyFn: (req) => `chat:${req.user?.tenantId ?? req.ip}` }))
app.use('/api/v1/voice', rateLimit({ windowSec: 60, limit: 30, keyFn: (req) => `voice:${req.user?.tenantId ?? req.ip}` }))
app.use('/api/v1/agents', rateLimit({ windowSec: 60, limit: 120, keyFn: (req) => `api:${req.user?.tenantId ?? req.ip}` }))
app.use('/api/v1/conversations', rateLimit({ windowSec: 60, limit: 120, keyFn: (req) => `api:${req.user?.tenantId ?? req.ip}` }))
app.use('/api/v1/llm-keys', rateLimit({ windowSec: 60, limit: 30, keyFn: (req) => `api:${req.user?.tenantId ?? req.ip}` }))
app.use('/api/v1/tenant/profile', rateLimit({ windowSec: 60, limit: 60, keyFn: (req) => `api:${req.user?.tenantId ?? req.ip}` }))
app.use('/api/v1/services', rateLimit({ windowSec: 60, limit: 120, keyFn: (req) => `api:${req.user?.tenantId ?? req.ip}` }))
app.use('/api/v1/appointments', rateLimit({ windowSec: 60, limit: 120, keyFn: (req) => `api:${req.user?.tenantId ?? req.ip}` }))
app.use('/api/v1/auth', authRouter)
app.use('/api/v1/agents', agentsRouter)
app.use('/api/v1/conversations', conversationsRouter)
app.use('/api/v1/chat', chatRouter)
app.use('/api/v1/voice', voiceRouter)
app.use('/api/v1/llm-keys', llmKeysRouter)
app.use('/api/v1/tenant/profile', tenantProfileRouter)
app.use('/api/v1/services', servicesRouter)
app.use('/api/v1/appointments', appointmentsRouter)

app.use(errorHandler)

export default app
