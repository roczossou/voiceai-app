import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts'

const VOICES = {
  'alloy-neutral':   'fr-FR-HenriNeural',   // masculin neutre
  'nova-feminine':   'fr-FR-DeniseNeural',  // féminin naturel (meilleure voix FR)
  'echo-masculine':  'fr-FR-HenriNeural',   // masculin
  'shimmer-soft':    'fr-FR-DeniseNeural',  // féminin doux
}

const DEFAULT_VOICE = 'fr-FR-DeniseNeural'

// ── Timeout + retry ──────────────────────────────────────
// Edge TTS passe par un WebSocket vers Microsoft (gratuit, sans clé). Sans
// timeout, un socket bloqué gèle indéfiniment l'appelant — et côté vocal, ça
// fige toute la file d'attente audio (le lecteur attend ce buffer). On borne
// donc chaque synthèse par un timeout qui ferme le WebSocket, et on retente
// sur les échecs transitoires (erreur WS, timeout, ou buffer vide/tronqué
// suite à une coupure en cours de stream).
const TTS_TIMEOUT_MS   = 10000
const TTS_MAX_ATTEMPTS = 3
const TTS_RETRY_DELAYS = [300, 800] // ms entre tentatives

const sleep = ms => new Promise(r => setTimeout(r, ms))

function isRetryableTts(err) {
  return /timeout|websocket|socket|disconnect|network|ECONNRESET|ETIMEDOUT|ENOTFOUND|EPIPE/i
    .test(err?.message ?? '')
}

/**
 * Une tentative de synthèse : connexion WS fraîche, bornée par un timeout qui
 * ferme le socket pour ne pas fuiter la connexion si Microsoft ne répond pas.
 */
function synthesizeOnce(voiceName, text) {
  const tts = new MsEdgeTTS()
  let closed = false
  const closeTts = () => { if (!closed) { closed = true; try { tts.close?.() } catch { /* ignore */ } } }

  const work = (async () => {
    await tts.setMetadata(voiceName, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3)
    const { audioStream } = await tts.toStream(text)
    return await new Promise((resolve, reject) => {
      const chunks = []
      audioStream.on('data', chunk => chunks.push(chunk))
      audioStream.on('end', () => resolve(Buffer.concat(chunks)))
      audioStream.on('error', reject)
    })
  })()

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      closeTts() // force la fermeture du WebSocket → libère la socket
      reject(new Error(`Edge TTS timeout (${TTS_TIMEOUT_MS}ms)`))
    }, TTS_TIMEOUT_MS)

    work.then(
      buf => { clearTimeout(timer); closeTts(); resolve(buf) },
      err => { clearTimeout(timer); closeTts(); reject(err) },
    )
  })
}

/**
 * Synthétise du texte en MP3 via Microsoft Edge Neural TTS (gratuit, sans clé).
 * @param {string} text
 * @param {string} voiceKey - clé config agent
 * @returns {Promise<Buffer>} buffer MP3
 */
export async function synthesizeSpeech(text, voiceKey = 'nova-feminine') {
  const voiceName = VOICES[voiceKey] ?? DEFAULT_VOICE

  let lastError = null

  for (let attempt = 0; attempt < TTS_MAX_ATTEMPTS; attempt++) {
    try {
      const buffer = await synthesizeOnce(voiceName, text)

      // Buffer vide = coupure WS en cours de stream (onclose termine le flux
      // sans erreur). On le traite comme un échec transitoire → retry.
      if (!buffer || buffer.length === 0) {
        throw new Error('Edge TTS: flux audio vide (WebSocket interrompu)')
      }

      return buffer
    } catch (err) {
      lastError = err

      if (!isRetryableTts(err)) throw err // erreur définitive (voix invalide, etc.)

      console.warn(
        `[TTS] Edge tentative ${attempt + 1}/${TTS_MAX_ATTEMPTS} échouée — ${String(err.message).slice(0, 80)}`
      )

      if (attempt < TTS_MAX_ATTEMPTS - 1) {
        await sleep(TTS_RETRY_DELAYS[attempt])
      }
    }
  }

  console.error(`[TTS] Edge abandonné après ${TTS_MAX_ATTEMPTS} tentatives`)
  throw lastError
}
