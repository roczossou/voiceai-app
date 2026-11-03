import Groq, { toFile } from 'groq-sdk'

let _groq = null
function groq() {
  if (!_groq) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY manquante')
    _groq = new Groq({ apiKey: process.env.GROQ_API_KEY })
  }
  return _groq
}

// ── Timeout + retry ──────────────────────────────────────
// Whisper (Groq) n'a qu'un seul provider et une seule clé : pas de rotation
// possible comme pour le LLM. On se protège donc avec un timeout explicite
// par tentative + un petit retry sur erreurs transitoires (429/5xx/timeout).
// L'audio est déjà en mémoire (buffer), le rejouer ne coûte rien.
const STT_TIMEOUT_MS   = 15000
const STT_MAX_ATTEMPTS = 3
const STT_RETRY_DELAYS = [400, 1000] // ms entre tentatives

const sleep = ms => new Promise(r => setTimeout(r, ms))

function isRetryableStt(err) {
  const status = Number(err?.status)
  if (status === 429 || (status >= 500 && status <= 599)) return true
  // Timeout / coupure réseau : le SDK Groq lève une erreur sans status
  return /timeout|timed out|ECONNRESET|ETIMEDOUT|ENOTFOUND|network|connection/i
    .test(err?.message ?? '')
}

/**
 * Transcrit un buffer audio via Groq Whisper large-v3.
 * @param {Buffer} buffer - données audio (WebM/Opus, MP4, WAV…)
 * @param {string} mimetype - ex: 'audio/webm'
 * @returns {Promise<string>} texte transcrit
 */
export async function transcribeAudio(buffer, mimetype = 'audio/webm') {
  // Strip codec params (e.g. "audio/webm;codecs=opus" → "audio/webm")
  const baseType = mimetype.split(';')[0].trim()

  const ext = baseType.includes('mp4') ? 'mp4'
    : baseType.includes('wav') ? 'wav'
    : baseType.includes('ogg') ? 'ogg'
    : 'webm'

  let lastError = null

  for (let attempt = 0; attempt < STT_MAX_ATTEMPTS; attempt++) {
    try {
      // Recréé à chaque tentative : l'envoi consomme le flux du fichier.
      const blob = new Blob([buffer], { type: baseType })
      const file = await toFile(blob, `audio.${ext}`, { type: baseType })

      const result = await groq().audio.transcriptions.create(
        {
          file,
          model: 'whisper-large-v3',
          language: 'fr',
          response_format: 'json',
        },
        // maxRetries: 0 → on gère le retry nous-mêmes (observable), pas de
        // double-retry silencieux du SDK par-dessus notre boucle.
        { timeout: STT_TIMEOUT_MS, maxRetries: 0 },
      )

      return result.text?.trim() ?? ''
    } catch (err) {
      lastError = err

      if (!isRetryableStt(err)) throw err // erreur définitive (auth, 400, contenu refusé…)

      console.warn(
        `[STT] Whisper tentative ${attempt + 1}/${STT_MAX_ATTEMPTS} échouée — ${String(err.message).slice(0, 80)}`
      )

      if (attempt < STT_MAX_ATTEMPTS - 1) {
        await sleep(STT_RETRY_DELAYS[attempt])
      }
    }
  }

  console.error(`[STT] Whisper abandonné après ${STT_MAX_ATTEMPTS} tentatives`)
  throw lastError
}
