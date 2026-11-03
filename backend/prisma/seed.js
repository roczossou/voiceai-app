import { PrismaClient } from '@prisma/client'
import { createCipheriv, randomBytes } from 'crypto'

const prisma = new PrismaClient()

// Dupliqué ici pour éviter d'importer src/ depuis prisma/ (chemins relatifs fragiles en seed)
function encrypt(plaintext) {
  const raw = process.env.LLM_KEY_SECRET
  if (!raw) throw new Error('LLM_KEY_SECRET manquant dans .env')
  const key = Buffer.from(raw, 'hex')
  if (key.length !== 32) throw new Error('LLM_KEY_SECRET doit être 32 octets hex (64 caractères)')

  const iv     = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc    = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), enc.toString('hex')].join('.')
}

async function seedKey({ provider = 'gemini', label, rawKey, priority }) {
  if (!rawKey) {
    console.log(`  — ${label} : variable absente, ignorée`)
    return
  }
  const exists = await prisma.llmApiKey.findFirst({ where: { provider, label } })
  if (exists) {
    console.log(`  — ${label} : déjà présente, ignorée`)
    return
  }
  await prisma.llmApiKey.create({
    data: { provider, label, key: encrypt(rawKey), priority, isActive: true },
  })
  console.log(`  ✓ ${label} ajoutée (priorité ${priority})`)
}

async function main() {
  console.log('🌱 Seed LlmApiKey — clés Gemini depuis .env\n')

  await seedKey({ label: 'Gemini clé 1', rawKey: process.env.GEMINI_API_KEY,   priority: 0 })
  await seedKey({ label: 'Gemini clé 2', rawKey: process.env.GEMINI_API_KEY_2,  priority: 1 })
  await seedKey({ label: 'Gemini clé 3', rawKey: process.env.GEMINI_API_KEY_3,  priority: 2 })

  console.log('\nDone.')
}

main()
  .catch(err => { console.error(err); process.exit(1) })
  .finally(() => prisma.$disconnect())
