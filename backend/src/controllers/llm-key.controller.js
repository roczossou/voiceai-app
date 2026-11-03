import { prisma } from '../services/db.js'
import { encrypt, decrypt, maskKey } from '../services/crypto.js'
import { invalidateKeyCache } from '../services/llm.service.js'

function toPublic(row) {
  return {
    id:        row.id,
    provider:  row.provider,
    label:     row.label,
    keyMasked: maskKey(decrypt(row.key)),
    isActive:  row.isActive,
    priority:  row.priority,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

export async function listHandler(req, res, next) {
  try {
    const { provider = 'gemini' } = req.query
    const rows = await prisma.llmApiKey.findMany({
      where:   { provider },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    })
    res.json({ data: rows.map(toPublic), total: rows.length })
  } catch (err) { next(err) }
}

export async function createHandler(req, res, next) {
  try {
    const { provider = 'gemini', label, key, priority = 0 } = req.body
    if (!label || !key) {
      return res.status(400).json({ title: 'label et key sont requis', status: 400 })
    }
    const row = await prisma.llmApiKey.create({
      data: { provider, label, key: encrypt(key), priority },
    })
    invalidateKeyCache()
    res.status(201).json(toPublic(row))
  } catch (err) { next(err) }
}

export async function updateHandler(req, res, next) {
  try {
    const { label, key, isActive, priority } = req.body
    const data = {}
    if (label    !== undefined) data.label    = label
    if (isActive !== undefined) data.isActive = isActive
    if (priority !== undefined) data.priority = priority
    if (key      !== undefined) data.key      = encrypt(key)

    const row = await prisma.llmApiKey.update({
      where: { id: req.params.id },
      data,
    })
    invalidateKeyCache()
    res.json(toPublic(row))
  } catch (err) { next(err) }
}

export async function deleteHandler(req, res, next) {
  try {
    await prisma.llmApiKey.delete({ where: { id: req.params.id } })
    invalidateKeyCache()
    res.status(204).end()
  } catch (err) { next(err) }
}
