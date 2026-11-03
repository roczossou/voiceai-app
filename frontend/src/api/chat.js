/**
 * Stream un message vers /api/v1/chat et parse les événements SSE.
 * On utilise fetch + ReadableStream car EventSource ne supporte pas POST.
 */
export async function streamChat({ conversationId, message, signal, onToken, onDone, onError, onQueued }) {
  const token = localStorage.getItem('access_token')

  let response
  try {
    response = await fetch('/api/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ conversationId, message }),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') return // interruption volontaire (barge-in) : pas une erreur
    onError({ message: 'Erreur réseau' })
    return
  }

  if (!response.ok) {
    // 202 = message mis en file d'attente côté serveur (un tour est en cours) :
    // on ne stream pas tout de suite, on poll la conversation jusqu'à ce que la
    // réponse apparaisse en DB (le tour fantôme la persistera sans SSE).
    if (response.status === 202) {
      onQueued?.()
      return
    }
    const err = await response.json().catch(() => ({ message: 'Erreur serveur' }))
    onError(err)
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() // garde la ligne incomplète pour le prochain chunk

      let eventType = ''
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7).trim()
        } else if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6))
            if (eventType === 'token') onToken(data.text)
            else if (eventType === 'done') onDone(data)
            else if (eventType === 'error') onError(data)
          } catch {
            // ligne malformée, on ignore
          }
          eventType = ''
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return // barge-in : lecture interrompue volontairement
    onError({ message: 'Erreur réseau' })
  }
}
