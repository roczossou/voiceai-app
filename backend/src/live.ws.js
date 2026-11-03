import { WebSocketServer } from 'ws'
import { verifyToken } from './services/auth.service.js'
import { resolveLiveContext, startLiveSession } from './services/live.service.js'
import { prisma } from './services/db.js'
import { assertOriginAllowed } from './controllers/public.controller.js'

/**
 * Protocole WebSocket /live (JSON texte) :
 *
 * Client → serveur :
 *   { type: 'audio', data: '<base64 PCM 16kHz>' }
 *   { type: 'text',  text: '...' }
 *   { type: 'end' }                  — ferme la session Live
 *
 * Serveur → client :
 *   { type: 'ready', model }
 *   { type: 'audio', data, mimeType }        — PCM 24 kHz à jouer
 *   { type: 'transcript', role, text, final }
 *   { type: 'interrupted' }                  — barge-in détecté
 *   { type: 'turn_complete' }
 *   { type: 'tool_call', name }
 *   { type: 'usage', inputTokens, outputTokens, total }
 *   { type: 'error', message }
 *   { type: 'closed' }
 *
 * Auth : query string — `?token=<JWT>&agentId=...&conversationId=...` (dashboard)
 * ou `?agentKey=<publicKey>&sessionId=...` (widget).
 */
export function attachLiveWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/v1/live' })

  wss.on('connection', async (ws, req) => {
    const url = new URL(req.url, 'http://localhost')
    const token = url.searchParams.get('token')
    const agentKey = url.searchParams.get('agentKey')
    const sessionId = url.searchParams.get('sessionId')
    const agentId = url.searchParams.get('agentId')
    const conversationId = url.searchParams.get('conversationId')

    let user = null
    if (token) {
      try { user = verifyToken(token) } catch { ws.close(4401, 'Invalid token'); return }
    }
    // En mode widget (agentKey), vérifier l'Origin comme pour l'API publique :
    // un WS n'a pas de preflight CORS, donc le check est ici, côté serveur.
    if (!token && agentKey) {
      try {
        const agent = await prisma.agent.findUnique({ where: { publicKey: agentKey } })
        if (agent) assertOriginAllowed(agent, req.headers.origin)
      } catch (err) {
        ws.close(4403, err.message || 'Origin not allowed')
        return
      }
    }

    const send = (type, payload = {}) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, ...payload }))
    }

    let live = null

    ws.on('message', async (raw) => {
      let msg
      try { msg = JSON.parse(raw.toString()) } catch { return }

      if (!live && msg.type !== 'start') return

      if (msg.type === 'start' || !live) {
        try {
          const ctx = await resolveLiveContext({ user, agentKey, sessionId, agentId, conversationId })
          send('starting', {})
          live = await startLiveSession({
            agent: ctx.agent,
            tenant: ctx.tenant,
            conversationId: ctx.conversationId,
            send,
            onEnd: () => send('closed', {}),
          })
          send('started', { conversationId: ctx.conversationId })
        } catch (err) {
          send('error', { message: err.message || 'Impossible de démarrer la session Live', status: err.status || 500 })
          ws.close(4000, err.message)
        }
        return
      }

      switch (msg.type) {
        case 'audio': live.sendAudio(msg.data); break
        case 'text':  live.sendText(msg.text); break
        case 'end':   live.close(); live = null; send('closed', {}); break
        default: break
      }
    })

    ws.on('close', () => { live?.close(); live = null })
    ws.on('error', () => { live?.close(); live = null })
  })

  return wss
}
