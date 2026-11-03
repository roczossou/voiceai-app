// Client de l'API publique. Auth par clé d'agent (X-Agent-Key), sessionId
// persistant côté navigateur. Pas d'EventSource : on a besoin d'un POST + header
// custom → on lit le flux SSE manuellement via fetch + ReadableStream.

export function getSessionId(agentKey) {
  const storageKey = `vai_session_${agentKey}`
  let id = null
  try { id = localStorage.getItem(storageKey) } catch { /* mode privé */ }
  if (!id) {
    id = `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    try { localStorage.setItem(storageKey, id) } catch { /* ignore */ }
  }
  return id
}

export async function fetchConfig(apiBase, agentKey) {
  // apiBase vide = même origine que la page hôte (proxy dev ou déploiement
  // derrière le même domaine en prod) → pas de CORS cross-origin.
  const res = await fetch(`${apiBase}/api/v1/public/agents/${agentKey}/config`)
  if (!res.ok) throw new Error(`config ${res.status}`)
  return res.json()
}
/**
 * Envoie un message et streame la réponse. Appelle onToken(text) au fil de l'eau,
 * onDone({messageId,tokens}) à la fin, onError(err) en cas d'échec.
 */
export async function streamChat({ apiBase, agentKey, sessionId, message, onToken, onDone, onError, onQueued }) {
  try {
    const res = await fetch(`${apiBase}/api/v1/public/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Key': agentKey },
      body: JSON.stringify({ message, sessionId }),
    })

    // 202 = message mis en file d'attente (un tour est en cours côté serveur).
    // Le widget ne streame pas tout de suite : on signale juste "queued" et le
    // composant appellant peut re-lire la conversation plus tard (le backend
    // persistera la réponse du tour batché en DB).
    if (res.status === 202) {
      onQueued?.()
      return
    }

    // Erreur AVANT l'ouverture du flux : le backend répond en JSON (RFC 9457)
    if (!res.ok || !res.body) {
      let title = `Erreur ${res.status}`
      try { const j = await res.json(); title = j.title || title } catch { /* pas de body JSON */ }
      throw new Error(title)
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // Un event SSE = bloc séparé par une ligne vide
      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const raw = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        handleEvent(raw, { onToken, onDone, onError })
      }
    }
  } catch (err) {
    onError?.(err)
  }
}

function handleEvent(raw, { onToken, onDone, onError }) {
  let event = 'message'
  let data = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!data) return
  let payload
  try { payload = JSON.parse(data) } catch { return }

  if (event === 'token') onToken?.(payload.text || '')
  else if (event === 'done') onDone?.(payload)
  else if (event === 'error') onError?.(new Error(payload.message || 'Erreur serveur'))
}
