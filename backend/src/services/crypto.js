import { createCipheriv, createDecipheriv, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getMasterKey() {
  const raw = process.env.LLM_KEY_SECRET
  if (!raw) throw new Error('LLM_KEY_SECRET manquant dans .env')
  const buf = Buffer.from(raw, 'hex')
  if (buf.length !== 32) throw new Error('LLM_KEY_SECRET doit être 32 octets en hex (64 caractères)')
  return buf
}

// Retourne "iv.authTag.ciphertext" en hex
export function encrypt(plaintext) {
  const key = getMasterKey()
  const iv  = randomBytes(12)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), encrypted.toString('hex')].join('.')
}

// Inverse de encrypt()
export function decrypt(stored) {
  const key = getMasterKey()
  const [ivHex, authTagHex, ciphertextHex] = stored.split('.')
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'))
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]).toString('utf8')
}

// Masque une clé API pour l'affichage : "AIza...XyZ"
export function maskKey(plaintext) {
  if (plaintext.length <= 8) return '****'
  return plaintext.slice(0, 4) + '...' + plaintext.slice(-4)
}
