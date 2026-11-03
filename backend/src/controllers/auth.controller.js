import { register, login, getMe } from '../services/auth.service.js'

export async function registerHandler(req, res, next) {
  try {
    const { name, email, password, tenantName } = req.body
    if (!name || !email || !password || !tenantName) {
      return res.status(400).json({ title: 'Missing required fields', status: 400 })
    }
    if (password.length < 8) {
      return res.status(400).json({ title: 'Password must be at least 8 characters', status: 400 })
    }

    const data = await register({ name, email, password, tenantName })
    res.status(201).json(data)
  } catch (err) {
    next(err)
  }
}

export async function loginHandler(req, res, next) {
  try {
    const { email, password } = req.body
    if (!email || !password) {
      return res.status(400).json({ title: 'Email and password required', status: 400 })
    }

    const data = await login({ email, password })
    res.json(data)
  } catch (err) {
    next(err)
  }
}

export async function meHandler(req, res, next) {
  try {
    const data = await getMe(req.user.userId)
    res.json(data)
  } catch (err) {
    next(err)
  }
}
