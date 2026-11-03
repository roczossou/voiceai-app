// ── Middleware de rate-limiting par tenant (Redis/Upstash, repli mémoire) ──
// Fenêtre fixe par endpoint configurable. Au-delà de `limit` requêtes dans
// `windowSec`, on répond 429 (RFC 9457) avec Retry-After.
//
// En dev sans clés Redis, retombe sur un compteur en mémoire (mono-process).
// En prod multi-instance, Upstash rend le compteur partagé entre instances.

import { rateLimitHit } from '../services/redis.js'

const DEFAULTS = { windowSec: 60, limit: 60 }

export function rateLimit({ windowSec = DEFAULTS.windowSec, limit = DEFAULTS.limit, keyFn } = {}) {
  return async (req, res, next) => {
    try {
      const id = keyFn
        ? keyFn(req)
        : `${req.user?.tenantId ?? req.ip}:${req.method}:${req.path}`
      if (!id) return next()
      const key = `rl:${id}`
      const { count, resetIn } = await rateLimitHit(key, windowSec)
      res.setHeader('X-RateLimit-Limit', String(limit))
      res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit - count)))
      if (count > limit) {
        res.setHeader('Retry-After', String(resetIn))
        return res.status(429).json({
          type: 'https://httpstatuses.com/429',
          title: 'Trop de requêtes, réessaie dans quelques secondes',
          status: 429,
          detail: `Limite ${limit}/${windowSec}s atteinte`,
        })
      }
      next()
    } catch (err) {
      // fail-open : un souci Redis ne doit pas bloquer l'API
      console.warn('[RateLimit] erreur, fail-open :', err.message)
      next()
    }
  }
}
