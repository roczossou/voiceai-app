import { prisma } from '../services/db.js'
import { getConversation } from '../services/conversation.service.js'
import { getAgent } from '../services/agent.service.js'
import { getProfile } from '../services/tenant.service.js'
import { listApplicableServices } from '../services/service.service.js'
import { streamGemini, buildSystemPrompt, shouldEnableAppointmentTools } from '../services/llm.service.js'
import { maybeCompact, extractSummary } from '../services/conversation.compact.js'
import { queueChatTurn, pushPendingMessage, drainPendingMessages, isInFlight, markInFlight, unmarkInFlight, hasPending } from '../services/chat.queue.js'
import { findCachedAnswer, storeCachedAnswer } from '../services/semantic-cache.js'

export async function chatHandler(req, res, next) {
  const { conversationId, message } = req.body

  if (!conversationId || !message?.trim()) {
    return res.status(400).json({ title: 'conversationId et message sont requis', status: 400 })
  }

  return streamChatResponse({ tenantId: req.user.tenantId, conversationId, message, res })
}

/**
 * Cœur du chat SSE, partagé entre le dashboard authentifié (chatHandler) et
 * le widget public (public.controller). Le tenantId est TOUJOURS fourni par
 * l'appelant (jamais depuis le body) — il vient du JWT ou de la clé d'agent.
 *
 * File d'attente : si un tour est déjà en cours pour cette conversation, le
 * message est mis en attente et sera envoyé AU MODÈLE ENSEMBLE avec les
 * suivants au prochain tour (un seul appel LLM au lieu de N) — voir runTurn.
 */
export async function streamChatResponse({ tenantId, conversationId, message, res }) {
  // Persiste le message user immédiatement (même s'il part en file d'attente).
  await prisma.message.create({
    data: { conversationId, role: 'user', content: message.trim() },
  })

  // ── Batching : si un tour LLM tourne déjà sur cette conversation, on ne
  //    répond PAS tout de suite par un stream : on accuse réception (202) et
  //    le message sera envoyé AU MODÈLE ENSEMBLE avec les suivants au
  //    prochain tour → 1 appel LLM au lieu de N, latence divisée.
  if (isInFlight(conversationId)) {
    pushPendingMessage(conversationId, message.trim())
    return res.status(202).json({ queued: true, reason: 'turn_in_progress' })
  }

  return queueChatTurn(conversationId, async () => {
    // Un seul tour à la fois grâce à la chaîne ; on marque inFlight pour que
    // les requêtes suivantes (hors file) sachent qu'il faut attendre.
    markInFlight(conversationId)
    try {
      // Messages arrivés pendant le tour précédent → fondus dans CET appel.
      const extra = drainPendingMessages(conversationId)
      const combined = extra.length ? `${message.trim()}\n\n${extra.join('\n\n')}` : message.trim()
      await runTurn({ tenantId, conversationId, message: combined, res })
    } finally {
      unmarkInFlight(conversationId)
      // Des messages sont arrivés entre le drain et la fin du tour ?
      // → tour "fantôme" sans SSE : le client a déjà reçu 202, on persiste
      //   juste la réponse en DB (il verra les nouveaux messages au refetch).
      if (hasPending(conversationId)) {
        queueChatTurn(conversationId, async () => {
          const more = drainPendingMessages(conversationId)
          if (more.length) {
            await runTurn({ tenantId, conversationId, message: more.join('\n\n'), res: null })
          }
        })
      }
    }
  })
}

async function openSSEHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.socket?.setNoDelay(true)
  res.flushHeaders()
}

async function runTurn({ tenantId, conversationId, message, res }) {
  // ⚠️ Le message user a DÉJÀ été persisté dans streamChatResponse (avant la
  // file d'attente) — on ne le recrée PAS ici, sinon doublon dans l'historique.
  try {
    // Neon fait ~300 ms par requête : on parallélise les lectures indépendantes
    // (5 requêtes en série ≈ 1,5 s → 2 vagues ≈ 0,6 s). La 1ʳᵉ vague ne dépend
    // que de conversationId/tenantId ; la 2ᵉ a besoin de conv.agentId.
    const [conv, tenant] = await Promise.all([
      getConversation(conversationId, tenantId),
      getProfile(tenantId),
    ])

    // message.create est mis dans la 2ᵉ vague (donc APRÈS getConversation) pour
    // que le message user ne se retrouve pas déjà dans conv.messages — sinon il
    // serait dupliqué (une fois dans l'historique, une fois comme userMessage).
    const [agent, services] = await Promise.all([
      getAgent(conv.agentId, tenantId),
      listApplicableServices(tenantId, conv.agentId),
    ])

    // ── Extraire le résumé compacté s'il existe ──────────
    const conversationSummary = extractSummary(conv.messages)

    // ── Historique Gemini : exclure les messages système [Résumé]
    // (le résumé est injecté dans systemInstruction, pas dans contents)
    const history = conv.messages
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({
        role:  m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }))

    // ── Prompt système : profil entreprise + services + remarques + ton + règles voix
    const systemPrompt = buildSystemPrompt({ agent, tenant, services, conversationSummary })

    // Outils de prise de RDV activés seulement si horaires + services configurés
    const toolContext = shouldEnableAppointmentTools(tenant, services)
      ? { tenant, agentId: agent.id, conversationId }
      : null

    // ── Cache sémantique (Redis) : question quasi identique déjà répondue
    // pour cet agent → on renvoie la réponse en cache SANS appeler le LLM.
    // ⚠️ Uniquement hors file d'attente et si aucun outil RDV n'est actif
    // (on ne cache jamais une réponse produite via function-call).
    const cacheAllowed = !toolContext
    if (cacheAllowed && res) {
      const hit = await findCachedAnswer(agent.id, message.trim())
      if (hit) {
        const saved = await prisma.message.create({
          data: { conversationId, role: 'assistant', content: hit.text, tokens: 0 },
        })
        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } })
        // On streame la réponse cachée token par token pour garder le même UX
        openSSEHeaders(res)
        for (const word of hit.text.split(/(\s+)/)) {
          if (!word) continue
          res.write(`event: token\ndata: ${JSON.stringify({ text: word })}\n\n`)
        }
        res.write(`event: done\ndata: ${JSON.stringify({ messageId: saved.id, tokens: 0, cached: true, similarity: hit.similarity })}\n\n`)
        res.end()
        return
      }
    }

    // streamGemini ouvre le SSE après avoir obtenu le stream (permet les retries)
    const { fullText, inputTokens, outputTokens, usedTools } = await streamGemini({
      systemPrompt,
      history,
      userMessage: message.trim(),
      res,
      toolContext,
    })

    // ── Mise en cache sémantique : uniquement si la réponse n'a pas utilisé d'outil
    if (cacheAllowed && !usedTools) {
      storeCachedAnswer(agent.id, message.trim(), fullText, inputTokens + outputTokens).catch(() => {})
    }

    // Sauvegarder la réponse complète
    const saved = await prisma.message.create({
      data: {
        conversationId,
        role:    'assistant',
        content: fullText,
        tokens:  inputTokens + outputTokens,
      },
    })

    await prisma.conversation.update({
      where: { id: conversationId },
      data:  { updatedAt: new Date() },
    })

    if (res) {
      res.write(`event: done\ndata: ${JSON.stringify({ messageId: saved.id, tokens: inputTokens + outputTokens })}\n\n`)
      res.end()
    }

    // ── Compactage fire-and-forget (après la réponse) ────
    maybeCompact(conversationId).catch(err =>
      console.error('[Compact] Erreur non bloquante :', err.message)
    )
  } catch (err) {
    let msg = err.message ?? 'Erreur LLM'
    try {
      const jsonMatch = msg.match(/\{[\s\S]*\}/)
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : msg)
      msg = parsed?.error?.message ?? msg
    } catch { /* message brut */ }

    if (!res) return // tour fantôme (réponse déjà persistée, pas de SSE)
    if (!res.headersSent) {
      return res.status(502).json({ title: msg, status: 502 })
    }
    res.write(`event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`)
    res.end()
  }
}
