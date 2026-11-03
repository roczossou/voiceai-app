// ── Cache sémantique des réponses LLM ────────────────────
// Objectif (ROADMAP Phase 2) : si une question entrante est quasi identique
// (cosinus ≥ 0.95) à une question déjà répondue récemment POUR LE MÊME AGENT,
// on renvoie la réponse en cache sans appeler le LLM → latence ~5 ms au lieu
// de 1–3 s, et coût API économisé.
//
// Sécurité : on ne met en cache QUE les réponses qui n'ont PAS utilisé
// d'outil (pas de functionCall) — jamais de réponse contenant une action
// (réservation, etc.) qu'on rejouerait à tort.

import { GoogleGenAI } from '@google/genai'
import { cacheGetJson, cacheSet, cacheGet, isRedisEnabled } from './redis.js'
import { loadKeys } from './llm.service.js'

const EMBED_MODEL = 'text-embedding-004'
const SIMILARITY_THRESHOLD = 0.95
const MAX_ENTRIES_PER_AGENT = 200   // fenêtre glissante
const ENTRY_TTL_SEC = 10 * 60       // 10 min
const INDEX_TTL_SEC = 15 * 60

function cosine(a, b) {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  if (!na || !nb) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

let embedder = null
async function getEmbedder() {
  if (!embedder) {
    const keys = await loadKeys()
    embedder = new GoogleGenAI({ apiKey: keys[0] })
  }
  return embedder
}

export async function embedText(text) {
  const ai = await getEmbedder()
  const res = await ai.models.embedContent({
    model: EMBED_MODEL,
    contents: [{ role: 'user', parts: [{ text: text.slice(0, 2000) }] }],
  })
  const v = res.embeddings?.[0]?.values
  if (!v) throw new Error('Embedding vide')
  return v
}

function indexKey(agentId) { return `sem:index:${agentId}` }

/** Cherche une réponse en cache pour `question` sur cet agent. Retourne { text, tokens } ou null. */
export async function findCachedAnswer(agentId, question) {
  try {
    const qEmb = await embedText(question)
    const rawIndex = await cacheGet(indexKey(agentId))
    if (!rawIndex) return null
    const entries = JSON.parse(rawIndex) // [{ key, emb }]
    let best = null, bestSim = 0
    for (const e of entries) {
      const sim = cosine(qEmb, e.emb)
      if (sim > bestSim) { bestSim = sim; best = e }
    }
    if (!best || bestSim < SIMILARITY_THRESHOLD) return null
    const hit = await cacheGetJson(best.key)
    if (!hit) return null
    console.log(`[Cache] HIT sémantique agent=${agentId.slice(0, 8)} sim=${bestSim.toFixed(3)}`)
    return { text: hit.text, tokens: hit.tokens ?? 0, similarity: bestSim }
  } catch (err) {
    console.warn('[Cache] recherche ignorée :', err.message)
    return null
  }
}

/** Stocke une question→réponse (uniquement si `cacheable`, ex: pas de tool-call). */
export async function storeCachedAnswer(agentId, question, text, tokens) {
  try {
    const qEmb = await embedText(question)
    const entryKey = `sem:entry:${agentId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`
    await cacheSet(entryKey, { text, tokens, at: Date.now() }, ENTRY_TTL_SEC)

    const rawIndex = await cacheGet(indexKey(agentId))
    const entries = rawIndex ? JSON.parse(rawIndex) : []
    entries.push({ key: entryKey, emb: qEmb })
    while (entries.length > MAX_ENTRIES_PER_AGENT) {
      const removed = entries.shift()
      const { cacheDel } = await import('./redis.js')
      await cacheDel(removed.key).catch(() => {})
    }
    await cacheSet(indexKey(agentId), JSON.stringify(entries), INDEX_TTL_SEC)
  } catch (err) {
    console.warn('[Cache] stockage ignoré :', err.message)
  }
}

export function cacheStats() {
  return { redis: isRedisEnabled(), threshold: SIMILARITY_THRESHOLD, model: EMBED_MODEL }
}
