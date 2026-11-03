import { GoogleGenAI, Modality } from '@google/genai'
import { prisma } from './db.js'
import {
  loadKeys,
  buildSystemPrompt,
  shouldEnableAppointmentTools,
  APPOINTMENT_TOOLS,
  runToolCall,
} from './llm.service.js'
import { getProfile } from './tenant.service.js'
import { listApplicableServices } from './service.service.js'
import { getOrCreatePublicConversation, addMessage } from './conversation.service.js'

// ── Modèles Live (API Live, WebSocket bidirectionnel audio natif) ──
// Noms d'API réels vérifiés via GET /v1beta/models?…supportedGenerationMethods=bidiGenerateContent
// (les libellés AI Studio comme "Gemini 2.5 Flash Native Audio Dialog" ne sont PAS des noms d'API).
// Surchageable par agent via `agent.config.liveModel`.
export const LIVE_MODELS = [
  'gemini-2.5-flash-native-audio-latest',
  'gemini-2.5-flash-native-audio-preview-12-2025',
  'gemini-3.1-flash-live-preview',
  'gemini-3.5-live-translate-preview',
  'gemini-3.5-transcribe-live',
  'gemini-3.8-live',
  'gemini-3.8-live-extended-thinking',
]

const DEFAULT_LIVE_MODEL = 'gemini-2.5-flash-native-audio-latest'

// Voix de sortie Live (PrebuiltVoiceConfig). Ce sont les voix natives du
// modèle Live (Aoede, Kore, Charon, Fenrir, Leda, Orus, Puck, Zephyr…),
// PAS les voix Edge TTS — un nom Edge (ex: fr-FR-DeniseNeural) est rejeté
// par l'API Live (erreur 1007). Aoede est multilingue et bonne en français.
// Surchageable par agent via `agent.config.liveVoice`.
const LIVE_VOICE = 'Aoede'

const MIME_IN  = 'audio/pcm;rate=16000'  // entrée : micro navigateur, PCM 16 kHz
const MIME_OUT = 'audio/pcm;rate=24000'  // sortie : modèle Live renvoie du PCM 24 kHz

function resolveLiveModel(agent) {
  const configured = agent?.config?.liveModel
  return LIVE_MODELS.includes(configured) ? configured : DEFAULT_LIVE_MODEL
}

/**
 * Ouvre une session Live avec Gemini et branche le pont client ↔ session.
 *
 * @param {object} ctx — { agent, tenant, conversationId, send, onEnd }
 *   - send(type, payload) : envoie un message JSON au client WebSocket
 *   - onEnd()            : appelé à la fermeture (pour persister la fin du tour)
 */
export async function startLiveSession({ agent, tenant, conversationId, send, onEnd }) {
  const keys = await loadKeys()
  const model = resolveLiveModel(agent)
  const services = await listApplicableServices(tenant.id, agent.id).catch(() => [])
  const systemPrompt = buildSystemPrompt({ agent, tenant, services })

  // ── Outils Live ──
  // ⚠️ L'API Live attend Tool.functionDeclarations[].parameters (champ `parameters`
  // du SDK), PAS `parametersJsonSchema` (champ de l'API generateContent classique).
  // Un schéma au mauvais champ = les outils sont silently ignorés par le modèle.
  const toolsEnabled = shouldEnableAppointmentTools(tenant, services)
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[Live] tools ${toolsEnabled ? 'ACTIVÉS' : 'DÉSACTIVÉS'} (openingHours=${Boolean(tenant?.openingHours)}, services=${services.length})`)
  }
  const tools = toolsEnabled
    ? [{
        functionDeclarations: APPOINTMENT_TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          parameters: t.parametersJsonSchema,
        })),
      }]
    : undefined

  // Historique récent pour amorcer le contexte (la session Live démarre vide).
  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'asc' },
    take: 20,
  })
  const historyText = history
    .map(m => `${m.role === 'user' ? 'Client' : 'Assistant'} : ${m.content}`)
    .join('\n')
  const systemInstruction = {
    role: 'user',
    parts: [{ text: `${systemPrompt}\n\n## Historique récent de la conversation\n${historyText || '(aucun)'}` }],
  }

  const ai = new GoogleGenAI({ apiKey: keys[0] })

  let userTranscript = ''
  let assistantTranscript = ''
  let closed = false

  const persistTurn = async () => {
    if (closed) return
    closed = true
    try {
      if (userTranscript.trim()) {
        await addMessage(conversationId, tenant.id, { role: 'user', content: userTranscript.trim() })
      }
      if (assistantTranscript.trim()) {
        await addMessage(conversationId, tenant.id, { role: 'assistant', content: assistantTranscript.trim() })
      }
    } catch (err) {
      console.error('[Live] persist erreur :', err.message)
    }
    onEnd?.()
  }

  const session = await ai.live.connect({
    model,
    config: {
      responseModalities: [Modality.AUDIO],
      systemInstruction,
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: agent.config?.liveVoice || LIVE_VOICE } },
      },
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      tools,
    },
    callbacks: {
      onopen: () => send('ready', { model }),
      onmessage: async (msg) => {
        // Log debug (désactiver en prod si trop verbeux)
        if (process.env.NODE_ENV !== 'production') {
          const keys = Object.keys(msg).filter(k => msg[k] !== undefined)
          console.log('[Live] ←', keys.join(','), msg.serverContent ? JSON.stringify(Object.keys(msg.serverContent)) : '')
        }
        const sc = msg.serverContent
        if (sc?.inputTranscription?.text) {
          userTranscript += sc.inputTranscription.text
          send('transcript', { role: 'user', text: sc.inputTranscription.text, final: false })
        }
        if (sc?.outputTranscription?.text) {
          assistantTranscript += sc.outputTranscription.text
          send('transcript', { role: 'assistant', text: sc.outputTranscription.text, final: false })
        }
        const parts = sc?.modelTurn?.parts ?? []
        for (const part of parts) {
          // ⚠️ Les modèles à reasoning (ex: 3.8-live-extended-thinking) émettent
          // leurs "thoughts" comme des parts textuelles marquées thought:true.
          // On ne les forward JAMAIS au client (ni audio ni transcript) : ce
          // n'est pas de la parole, juste de la pensée interne.
          if (part.thought) continue
          if (part.inlineData?.data) {
            // Audio PCM 24 kHz renvoyé par le modèle → on le redirige tel quel.
            send('audio', { mimeType: part.inlineData.mimeType || MIME_OUT, data: part.inlineData.data })
          }
          if (part.text) {
            assistantTranscript += part.text
            send('transcript', { role: 'assistant', text: part.text, final: false })
          }
        }
        if (sc?.interrupted) send('interrupted', {})
        if (sc?.turnComplete) {
          send('transcript', { role: 'assistant', final: true })
          send('turn_complete', {})
        }
        if (msg.toolCall?.functionCalls?.length) {
          for (const fc of msg.toolCall.functionCalls) {
            send('tool_call', { name: fc.name, args: fc.args ?? {} })
            const result = await runToolCall(fc.name, fc.args ?? {}, {
              tenant, agentId: agent.id, conversationId,
            })
            console.log(`[Live] tool ${fc.name} →`, JSON.stringify(result).slice(0, 200))
            session.sendToolResponse({
              functionResponses: [{
                id: fc.id,
                name: fc.name,
                response: { output: result },
              }],
            })
          }
        }
        if (msg.usageMetadata) {
          send('usage', {
            inputTokens: msg.usageMetadata.promptTokenCount,
            outputTokens: msg.usageMetadata.responseTokenCount,
            total: msg.usageMetadata.totalTokenCount,
          })
        }
      },
      onerror: (e) => {
        console.error('[Live] erreur session :', e?.error?.message || e?.message || e)
        send('error', { message: e?.error?.message || 'Erreur session Live' })
      },
      onclose: (e) => {
        console.log('[Live] session fermée', e?.code, e?.reason || '')
        void persistTurn()
      },
    },
  })

  return {
    /** Reçoit un chunk audio PCM 16 kHz (base64) du client et le pousse vers Live. */
    sendAudio: (base64) => {
      if (!base64) return
      session.sendRealtimeInput({ audio: { data: base64, mimeType: MIME_IN } })
    },
    /** Reçoit du texte du client (alternative au micro). */
    sendText: (text) => {
      if (!text?.trim()) return
      session.sendClientContent({
        turns: [{ role: 'user', parts: [{ text: text.trim() }] }],
        turnComplete: true,
      })
    },
    close: () => { try { session.close() } catch { /* ignore */ } void persistTurn() },
  }
}

/**
 * Résout le contexte (agent + tenant + conversation) pour une connexion WS.
 * Deux modes :
 *  - dashboard : JWT Bearer (user) + agentId + conversationId optionnel
 *  - widget    : agentKey (clé publique) + sessionId
 */
export async function resolveLiveContext({ user, agentKey, sessionId, agentId, conversationId }) {
  if (agentKey) {
    const agent = await prisma.agent.findUnique({ where: { publicKey: agentKey } })
    if (!agent || agent.status !== 'published') {
      const err = new Error('Agent not found or not published'); err.status = 404; throw err
    }
    const tenant = await getProfile(agent.tenantId)
    const conv = await getOrCreatePublicConversation(agent.id, sessionId)
    return { agent, tenant, conversationId: conv.id }
  }
  if (user?.tenantId && (agentId || conversationId)) {
    // Dashboard : l'agent peut être résolu via l'agentId… ou via la conversation
    // (cas du chat de test : on a un conversationId, pas forcément l'agentId).
    let agent = null
    if (agentId) {
      agent = await prisma.agent.findUnique({ where: { id: agentId, tenantId: user.tenantId } })
    } else {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: { agent: true },
      })
      if (conv?.agent?.tenantId === user.tenantId) agent = conv.agent
    }
    if (!agent) { const err = new Error('Agent not found'); err.status = 404; throw err }
    const tenant = await getProfile(user.tenantId)
    let convId = conversationId
    if (!convId) {
      const conv = await prisma.conversation.create({
        data: { agentId: agent.id, sessionId: `live_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, metadata: { source: 'dashboard-live' } },
        select: { id: true },
      })
      convId = conv.id
    }
    return { agent, tenant, conversationId: convId }
  }
  const err = new Error('Unauthorized'); err.status = 401; throw err
}
