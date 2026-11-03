import { getAgentByPublicKey } from '../services/agent.service.js'
import { getOrCreatePublicConversation } from '../services/conversation.service.js'
import { streamChatResponse } from './chat.controller.js'

/**
 * Vérifie que l'origine du navigateur est autorisée pour cet agent.
 * - allowedOrigins vide = aucune restriction (pratique en dev / test).
 * - En dev (NODE_ENV=development), les origines localhost/127.0.0.1 sur n'importe
 *   quel port sont toujours acceptées → la page de démo du widget (:5174), le
 *   dashboard (:5173) et le téléphone en https://<IP_LAN>:5174 fonctionnent sans
 *   renseigner chaque origine à la main.
 */
function isPrivateLanHost(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1') return true
  const m = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const [a, b] = [+m[1], +m[2]]
  return a === 10 || a === 192 && b === 168 || a === 172 && b >= 16 && b <= 31
}

export function assertOriginAllowed(agent, origin) {
  if (!agent.allowedOrigins?.length) return
  if (origin && agent.allowedOrigins.includes(origin)) return
  if (process.env.NODE_ENV !== 'production' && origin) {
    // Dev : localhost (tout port) + IP LAN privée (téléphone sur le même Wi-Fi)
    try {
      const u = new URL(origin)
      if ((u.protocol === 'http:' || u.protocol === 'https:') && isPrivateLanHost(u.hostname)) return
    } catch { /* ignore */ }
  }
  const err = new Error('Origin not allowed')
  err.status = 403
  throw err
}

/**
 * POST /api/v1/public/chat
 * Auth par clé d'agent (header X-Agent-Key). Le widget fournit un sessionId
 * persistant (localStorage) qui mappe vers une conversation anonyme.
 */
export async function publicChatHandler(req, res, next) {
  const agentKey = req.get('X-Agent-Key')
  const { message, sessionId } = req.body

  if (!message?.trim() || !sessionId) {
    return res.status(400).json({ title: 'message et sessionId sont requis', status: 400 })
  }

  let agent, conv
  try {
    agent = await getAgentByPublicKey(agentKey)        // 404 / 403 si non publié
    assertOriginAllowed(agent, req.get('Origin'))
    conv = await getOrCreatePublicConversation(agent.id, sessionId)
  } catch (err) {
    return next(err)                                    // avant tout header SSE
  }

  return streamChatResponse({
    tenantId: agent.tenantId,
    conversationId: conv.id,
    message,
    res,
  })
}

/**
 * GET /api/v1/public/agents/:key/config
 * Config d'apparence lue par le widget avant le premier message.
 * N'expose QUE ce qui est nécessaire au rendu — aucun secret tenant.
 */
export async function publicAgentConfigHandler(req, res, next) {
  try {
    const agent = await getAgentByPublicKey(req.params.key)
    assertOriginAllowed(agent, req.get('Origin'))
    const appearance = agent.config?.appearance ?? agent.config?.widget ?? {}
    res.json({
      name: agent.name,
      type: agent.type,
      appearance: {
        primaryColor: appearance.primaryColor ?? '#2563eb',
        position:     appearance.position ?? 'bottom-right',
        title:        appearance.title ?? agent.name,
        greeting:     appearance.greeting ?? 'Bonjour 👋 Comment puis-je vous aider ?',
        avatarUrl:    appearance.avatarUrl ?? null,
      },
      // Mode vocal exposé au widget : 'live' affiche le bouton d'appel audio natif.
      voiceMode: agent.config?.voiceMode ?? 'pipeline',
    })
  } catch (err) {
    next(err)
  }
}
