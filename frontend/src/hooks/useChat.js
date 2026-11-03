import { useState, useCallback, useRef } from 'react'
import { streamChat } from '../api/chat.js'
import { queryClient } from '../lib/query-client.js'

export function useChat(conversationId, { onToken: onTokenCallback, onDone: onDoneCallback, onError: onErrorCallback } = {}) {
  const [streaming, setStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [error, setError] = useState(null)
  const abortRef = useRef(false)
  const controllerRef = useRef(null)

  const sendMessage = useCallback(async (message) => {
    if (!message?.trim() || streaming) return
    setStreaming(true)
    setStreamingText('')
    setError(null)
    abortRef.current = false
    const controller = new AbortController()
    controllerRef.current = controller

    // Texte accumulé localement pour l'update optimiste
    let accumulated = ''

    // Ajouter le message utilisateur immédiatement dans le cache
    queryClient.setQueryData(['conversations', 'detail', conversationId], (old) => {
      if (!old) return old
      return {
        ...old,
        messages: [...old.messages, {
          id: `optimistic-${Date.now()}`,
          role: 'user',
          content: message.trim(),
          tokens: null,
          createdAt: new Date().toISOString(),
          conversationId,
        }],
      }
    })

    await streamChat({
      conversationId,
      message,
      signal: controller.signal,
      onQueued: () => {
        // Message mis en file côté serveur (tour en cours) : pas de SSE pour
        // celui-ci. On poll la conversation jusqu'à ce que la réponse du tour
        // batché apparaisse en DB, puis on la récupère comme un onDone normal.
        setStreaming(false)
        setStreamingText('')
        const startedAt = Date.now()
        const poll = async () => {
          if (abortRef.current) return
          try {
            const data = await queryClient.fetchQuery({
              queryKey: ['conversations', 'detail', conversationId],
              queryFn: async () => {
                const token = localStorage.getItem('access_token')
                const r = await fetch(`/api/v1/conversations/${conversationId}`, { headers: { Authorization: `Bearer ${token}` } })
                return r.json()
              },
              staleTime: 0,
            })
            const lastAssistant = [...(data.messages ?? [])].reverse().find(m => m.role === 'assistant')
            const lastUser = [...(data.messages ?? [])].reverse().find(m => m.role === 'user')
            // Réponse arrivée si un assistant existe APRÈS le dernier user persisté
            if (lastAssistant && lastUser && new Date(lastAssistant.createdAt) >= new Date(lastUser.createdAt)) {
              controllerRef.current = null
              onDoneCallback?.({ messageId: lastAssistant.id, tokens: lastAssistant.tokens })
              return
            }
          } catch { /* on retente */ }
          if (Date.now() - startedAt > 120_000) { setError('La réponse met trop de temps…'); return }
          setTimeout(poll, 1500)
        }
        poll()
      },
      onToken: (text) => {
        if (abortRef.current) return
        accumulated += text
        setStreamingText(prev => prev + text)
        onTokenCallback?.(text)
      },
      onDone: ({ messageId, tokens }) => {
        controllerRef.current = null
        // Injecter la réponse IA dans le cache AVANT de vider streamingText
        // → pas de flash blanc entre la bulle de streaming et les messages DB
        queryClient.setQueryData(['conversations', 'detail', conversationId], (old) => {
          if (!old) return old
          return {
            ...old,
            messages: [
              ...old.messages.filter(m => !String(m.id).startsWith('optimistic-')),
              { id: messageId, role: 'assistant', content: accumulated, tokens, createdAt: new Date().toISOString(), conversationId },
            ],
          }
        })
        setStreaming(false)
        setStreamingText('')
        // Refetch en arrière-plan pour avoir les vrais IDs (message user inclus)
        queryClient.invalidateQueries({ queryKey: ['conversations', 'detail', conversationId] })
        onDoneCallback?.({ messageId, tokens })
      },
      onError: (err) => {
        controllerRef.current = null
        // Rollback du message optimiste
        queryClient.invalidateQueries({ queryKey: ['conversations', 'detail', conversationId] })
        setStreaming(false)
        setStreamingText('')
        setError(err.message || 'Une erreur est survenue')
        onErrorCallback?.(err)
      },
    })
  }, [conversationId, streaming])

  // Barge-in : coupe le stream en cours (fetch + lecture SSE). Les callbacks
  // onToken/onError ignorent tout ce qui arrive après grâce à abortRef ; on
  // remet l'état à idle tout de suite sans attendre que la promesse fetch
  // se résolve (elle se terminera silencieusement en AbortError).
  const abort = useCallback(() => {
    if (!controllerRef.current) return
    abortRef.current = true
    controllerRef.current.abort()
    controllerRef.current = null
    setStreaming(false)
    setStreamingText('')
  }, [])

  return { sendMessage, streaming, streamingText, error, abort }
}
