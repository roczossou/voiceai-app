// ── File d'attente par conversation ──────────────────────
// Quand plusieurs messages arrivent pendant qu'un tour LLM est en cours sur
// la même conversation, on ne lance PAS de streams concurrents (l'historique
// serait incohérent et la persistance s'entremêlerait). À la place :
//
//   1. La 1ʳᵉ requête lance le tour et marque la conversation "inFlight".
//   2. Les requêtes suivantes recoivent 202 { queued: true } et leur message
//      part dans `pending`.
//   3. Quand le tour en cours se termine, les messages pending sont envoyés
//      AU MODÈLE ENSEMBLE dans un seul appel (batching → 1 round-trip LLM
//      au lieu de N, latence divisée par le nombre de messages).
//
// Si des messages arrivent entre le "drain" et la fin du tour, un tour
// "fantôme" (sans SSE, réponse juste persistée en DB) les vide ensuite.

const queues = new Map() // conversationId → { pending: string[], chain: Promise, inFlight: bool }

function getQ(id) {
  let q = queues.get(id)
  if (!q) {
    q = { pending: [], chain: Promise.resolve(), inFlight: false }
    queues.set(id, q)
  }
  return q
}

export function isInFlight(id) { return queues.get(id)?.inFlight === true }
export function markInFlight(id) { getQ(id).inFlight = true }
export function unmarkInFlight(id) { const q = queues.get(id); if (q) q.inFlight = false }

export function pushPendingMessage(id, msg) { getQ(id).pending.push(msg) }
export function hasPending(id) { return (queues.get(id)?.pending.length ?? 0) > 0 }
export function drainPendingMessages(id) {
  const q = queues.get(id)
  return q ? q.pending.splice(0, q.pending.length) : []
}

/** Exécute `job` strictement après tous les jobs précédents de cette conversation. */
export function queueChatTurn(id, job) {
  const q = getQ(id)
  q.chain = q.chain.then(() => job(), () => job())
  return q.chain
}
