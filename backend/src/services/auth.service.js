import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { prisma } from './db.js'

const JWT_SECRET = process.env.JWT_SECRET
const JWT_EXPIRES_IN = '7d'

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN })
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET)
}

export async function register({ name, email, password, tenantName }) {
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    const err = new Error('Email already in use')
    err.status = 409
    throw err
  }

  const baseSlug = tenantName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '') || 'org'
  let slug = baseSlug
  for (let i = 2; await prisma.tenant.findUnique({ where: { slug } }); i++) {
    slug = `${baseSlug}-${i}`
  }
  const hash = await bcrypt.hash(password, 12)

  const tenant = await prisma.tenant.create({
    data: {
      name: tenantName,
      slug,
      users: {
        create: { name, email, password: hash, role: 'admin' },
      },
    },
    include: { users: true },
  })

  const user = tenant.users[0]
  const token = signToken({ userId: user.id, tenantId: tenant.id, email: user.email, role: user.role })

  return { token, user: safeUser(user), tenant: safeTenant(tenant) }
}

export async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } })
  if (!user) {
    const err = new Error('Invalid credentials')
    err.status = 401
    throw err
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    const err = new Error('Invalid credentials')
    err.status = 401
    throw err
  }

  const token = signToken({ userId: user.id, tenantId: user.tenantId, email: user.email, role: user.role })
  return { token, user: safeUser(user), tenant: safeTenant(user.tenant) }
}

export async function getMe(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { tenant: true },
  })
  if (!user) {
    const err = new Error('User not found')
    err.status = 404
    throw err
  }
  return { user: safeUser(user), tenant: safeTenant(user.tenant) }
}

function safeUser(user) {
  const { password, ...rest } = user
  return rest
}

function safeTenant(tenant) {
  const { users, ...rest } = tenant ?? {}
  return rest
}
