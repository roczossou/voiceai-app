// ── Redis (Upstash REST) avec repli en mémoire ──────────
// Utilisations :
//   - cache sémantique des réponses LLM (cosine ≥ 0.95 → skip LLM)
//   - cache des profils tenant / agents (évite les allers-retours Neon)
//   - rate-limiting par tenant et par endpoint (compteur fenêtré)
//
// Sans clés UPSTASH_*, tout retombe sur un Map en mémoire (par process) :
// ça marche en dev mono-instance, mais en prod multi-instance il FAUT
// renseigner UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN pour partager
// l'état entre instances.

const URL_ = process.env.UPSTASH_REDIS_REST_URL
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN
const ENABLED = Boolean(URL_ && TOKEN)

// ── Repli mémoire (dev / tests) ─────────────────────────
const mem = new Map() // key → { value, expiresAt }
function memGet(key) {
  const e = mem.get(key)
  if (!e) return null
  if (e.expiresAt && e.expiresAt < Date.now()) { mem.delete(key); return null }
  return e.value
}
function memSet(key, value, ttlSec) {
  mem.set(key, { value, expiresAt: ttlSec ? Date.now() + ttlSec * 1000 : 0 })
  if (mem.size > 5000) { // borne simple anti-fuite mémoire
    const first = mem.keys().next().value
    mem.delete(first)
  }
}

async function redisCmd(...args) {
  const res = await fetch(`${URL_}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  if (!res.ok) throw new Error(`Redis ${res.status}`)
  const json = await res.json()
  return json.result
}

/** GET string. Retourne null si absent. */
export async function cacheGet(key) {
  try {
    if (ENABLED) {
      const v = await redisCmd('GET', key)
      return v == null ? null : (typeof v === 'string' ? v : JSON.stringify(v))
    }
    return memGet(key)
  } catch (err) {
    console.warn('[Redis] GET fallback mémoire :', err.message)
    return memGet(key)
  }
}

/** SET avec TTL en secondes (0 = pas d'expiration). */
export async function cacheSet(key, value, ttlSec = 0) {
  const v = typeof value === 'string' ? value : JSON.stringify(value)
  try {
    if (ENABLED) {
      const args = ['SET', key, v]
      if (ttlSec) args.push('EX', String(ttlSec))
      await redisCmd(...args)
    } else {
      memSet(key, v, ttlSec)
    }
  } catch (err) {
    console.warn('[Redis] SET ignoré :', err.message)
    memSet(key, v, ttlSec)
  }
}

export async function cacheDel(key) {
  try { if (ENABLED) await redisCmd('DEL', key); else mem.delete(key) } catch { /* ignore */ }
}

/**
 * Incrémente un compteur avec fenêtre glissante fixe (INCR + EXPIRE au 1ᵉʳ hit).
 * Retourne { count, ttl } — count = requêtes dans la fenêtre courante.
 */
export async function rateLimitHit(key, windowSec) {
  try {
    if (ENABLED) {
      const count = await redisCmd('INCR', key)
      if (count === 1) await redisCmd('EXPIRE', key, String(windowSec))
      const ttl = await redisCmd('TTL', key)
      return { count, resetIn: ttl > 0 ? ttl : windowSec }
    }
    // repli mémoire : fenêtre fixe par tranche
    const now = Date.now()
    const bucket = Math.floor(now / (windowSec * 1000))
    const k = `${key}:${bucket}`
    const e = memGet(k)
    const count = (e ? parseInt(e, 10) : 0) + 1
    memSet(k, String(count), windowSec * 2)
    return { count, resetIn: windowSec - Math.floor((now % (windowSec * 1000)) / 1000) }
  } catch (err) {
    console.warn('[Redis] rateLimit fallback :', err.message)
    return { count: 1, resetIn: windowSec } // fail-open
  }
}

/** Vecteur d'embedding stocké en JSON (pour le cache sémantique). */
export async function cacheGetJson(key) {
  const raw = await cacheGet(key)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export function isRedisEnabled() { return ENABLED }
