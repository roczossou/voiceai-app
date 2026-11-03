import { verifyToken } from '../services/auth.service.js'

export function requireAuth(req, res, next) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ title: 'Unauthorized', status: 401 })
  }

  try {
    const payload = verifyToken(header.slice(7))
    req.user = payload
    next()
  } catch {
    res.status(401).json({ title: 'Invalid or expired token', status: 401 })
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({ title: 'Forbidden', status: 403 })
    }
    next()
  }
}
