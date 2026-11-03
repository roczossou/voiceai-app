// ── Client WebSocket Live pour le widget (Gemini Live via backend) ──
// Le widget connaît apiBase (http(s)://host:port) → on en déduit ws(s)://.
// Auth publique : agentKey + sessionId (même mécanisme que le chat SSE).

export function wsBaseFromApiBase(apiBase) {
  // Par défaut : même origine que la page qui héberge le widget → le WS passe
  // par le serveur de la page (proxy avec ws:true côté dev), ce qui marche sur
  // téléphone en https. Si data-api pointe vers un backend exposé en wss://
  // public, on dérive ws(s):// depuis cette URL.
  if (!apiBase) {
    return `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`
  }
  return apiBase.replace(/^http/, 'ws') // http→ws, https→wss
}

/**
 * Ouvre une session Live avec le backend.
 * Retourne { send, sendText, close, on } où `on(type, cb)` enregistre un handler
 * pour : ready, audio, transcript, interrupted, turn_complete, error, closed.
 */
export function openLiveSocket({ apiBase, agentKey, sessionId, handlers = {} }) {
  const ws = new WebSocket(`${wsBaseFromApiBase(apiBase)}/api/v1/live?agentKey=${encodeURIComponent(agentKey)}&sessionId=${encodeURIComponent(sessionId)}`)
  const subs = {}
  const on = (type, cb) => { (subs[type] ??= []).push(cb) }
  Object.entries(handlers).forEach(([t, cb]) => on(t, cb))

  ws.onopen = () => ws.send(JSON.stringify({ type: 'start' }))
  ws.onmessage = (e) => {
    let msg
    try { msg = JSON.parse(e.data) } catch { return }
    ;(subs[msg.type] || []).forEach(cb => cb(msg))
    ;(subs['*'] || []).forEach(cb => cb(msg))
  }
  ws.onclose = () => (subs.closed || []).forEach(cb => cb())
  ws.onerror = () => (subs.error || []).forEach(cb => cb({ message: 'WebSocket error' }))

  return {
    on,
    sendAudio: (base64) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'audio', data: base64 })),
    sendText: (text) => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'text', text })),
    close: () => { try { ws.readyState === 1 && ws.send(JSON.stringify({ type: 'end' })) } catch {} ws.close() },
  }
}

/**
 * Capture le micro en PCM 16 kHz mono et appelle onChunk(base64) en continu.
 * Retourne une fonction stop(). Nécessite un AudioWorklet inline.
 */
export async function startPcmCapture(onChunk) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
  })
  const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
  const source = ctx.createMediaStreamSource(stream)
  const workletCode = `
    const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    function toB64(bytes) {
      let out = ''
      for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2]
        out += B64[b0 >> 2]
        out += B64[((b0 & 3) << 4) | (b1 !== undefined ? b1 >> 4 : 0)]
        out += b1 !== undefined ? B64[((b1 & 15) << 2) | (b2 !== undefined ? b2 >> 6 : 0)] : '='
        out += b2 !== undefined ? B64[b2 & 63] : '='
      }
      return out
    }
    class PcmProcessor extends AudioWorkletProcessor {
      constructor() {
        super()
        this._acc = []
        this._accLen = 0
      }
      process(inputs) {
        const input = inputs[0]
        if (input && input[0]) {
          const f = input[0]
          const int16 = new Int16Array(f.length)
          for (let i = 0; i < f.length; i++) {
            const s = Math.max(-1, Math.min(1, f[i]))
            int16[i] = s < 0 ? s * 32768 : s * 32767
          }
          for (let i = 0; i < int16.length; i++) { this._acc.push(int16[i]); this._accLen++ }
          if (this._accLen >= 1600) { // ~100 ms à 16 kHz → 10 msg/s au lieu de 125
            this.port.postMessage(toB64(new Uint8Array(new Int16Array(this._acc).buffer)))
            this._acc = []; this._accLen = 0
          }
        }
        return true
      }
    }
    registerProcessor('vai-pcm', PcmProcessor)
  `
  const blobUrl = URL.createObjectURL(new Blob([workletCode], { type: 'application/javascript' }))
  await ctx.audioWorklet.addModule(blobUrl)
  URL.revokeObjectURL(blobUrl)
  const node = new AudioWorkletNode(ctx, 'vai-pcm')
  node.port.onmessage = (e) => onChunk(e.data)
  source.connect(node)
  return () => {
    try { node.disconnect() } catch {}
    stream.getTracks().forEach(t => t.stop())
    ctx.close().catch(() => {})
  }
}

/** Joue un chunk PCM 24 kHz (base64) reçu du modèle, en file ordonnée. */
export function createPcmPlayer() {
  let ctx = null
  let queue = []
  let nextAt = 0

  const ensureCtx = () => {
    if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 }); nextAt = 0 }
    return ctx
  }
  const pump = () => {
    // ⚠️ Ne PAS await chaque buffer : on programme tout de suite sur l'horloge
    // du contexte (pas de trous audibles entre chunks si le réseau est en retard).
    const c = ensureCtx()
    if (c.state === 'suspended') void c.resume()
    while (queue.length) {
      const buf = queue.shift()
      const src = c.createBufferSource()
      src.buffer = buf
      src.connect(c.destination)
      const startAt = Math.max(c.currentTime + 0.03, nextAt)
      src.start(startAt)
      nextAt = startAt + buf.duration
    }
  }
  return {
      play(base64) {
      try {
        const bin = atob(base64)
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const int16 = new Int16Array(bytes.buffer)
        const f32 = new Float32Array(int16.length)
        for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768
        const c = ensureCtx()
        const buf = c.createBuffer(1, f32.length, 24000)
        buf.getChannelData(0).set(f32)
        queue.push(buf)
        pump()
      } catch { /* ignore */ }
    },
    clear() { queue = []; nextAt = 0 },
    close() { queue = []; ctx?.close().catch(() => {}); ctx = null },
  }
}
