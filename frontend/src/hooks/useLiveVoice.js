import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * Hook voix "Live" : conversation audio bidirectionnelle native avec un modèle
 * Gemini Live via le WebSocket backend /api/v1/live.
 *
 * Le micro est capturé en PCM 16 kHz (AudioWorklet), envoyé en base64 au WS ;
 * l'audio reçu du modèle (PCM 24 kHz) est joué via un AudioContext dédié.
 * Les transcriptions (in/out) remontent via onTranscript pour l'affichage.
 *
 * Auth : `token` (JWT dashboard) ou `agentKey` + `sessionId` (widget public).
 */
export function useLiveVoice({ token, agentKey, sessionId, agentId, conversationId, onTranscript, onError, onStatus }) {
  const [status, setStatus] = useState('idle') // idle | connecting | live | closed
  const [model, setModel] = useState(null)

  const wsRef = useRef(null)
  const mediaStreamRef = useRef(null)
  const audioCtxRef = useRef(null)      // contexte d'entrée (capture micro)
  const workletRef = useRef(null)
  const playCtxRef = useRef(null)       // contexte de sortie (lecture réponse)
  const playQueueRef = useRef([])       // buffers PCM 24 kHz en attente de lecture
  const nextPlayTimeRef = useRef(0)
  const statusRef = useRef('idle')

  const setStatusBoth = useCallback((s) => {
    statusRef.current = s
    setStatus(s)
    onStatus?.(s)
  }, [onStatus])

  // ── Lecture audio PCM 24 kHz reçu du modèle ─────────────
  const playPcm24 = useCallback((base64) => {
    try {
      const bin = atob(base64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const int16 = new Int16Array(bytes.buffer)
      const float32 = new Float32Array(int16.length)
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768

      if (!playCtxRef.current) {
        playCtxRef.current = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 })
        nextPlayTimeRef.current = 0
      }
      const ctx = playCtxRef.current
      const buf = ctx.createBuffer(1, float32.length, 24000)
      buf.getChannelData(0).set(float32)
      playQueueRef.current.push(buf)
      void pumpPlayQueue()
    } catch { /* ignore */ }
  }, [])

  const pumpPlayQueue = useCallback(() => {
    // ⚠️ Ne PAS await chaque buffer : avec await, on attend la fin de lecture d'un
    // chunk avant de programmer le suivant → trous audibles entre les chunks.
    // On programme tout de suite sur l'horloge du contexte (nextPlayTime) :
    // les buffers s'enchaînent sans silence, même si le réseau est en retard.
    if (!playCtxRef.current) return
    const ctx = playCtxRef.current
    if (ctx.state === 'suspended') void ctx.resume()
    while (playQueueRef.current.length) {
      const buf = playQueueRef.current.shift()
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      const startAt = Math.max(ctx.currentTime + 0.03, nextPlayTimeRef.current) // petit tampon anti-gigue
      src.start(startAt)
      nextPlayTimeRef.current = startAt + buf.duration
    }
  }, [])

  // ── Capture micro → PCM 16 kHz → WS ──────────────────────
  const startCapture = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    })
    mediaStreamRef.current = stream
    const ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
    audioCtxRef.current = ctx
    const source = ctx.createMediaStreamSource(stream)

    // AudioWorklet inline (évite un fichier séparé).
    // ⚠️ Dans un AudioWorklet, `btoa` n'existe pas (scope worker sans window) :
    // on encode en base64 manuellement avec un alphabet embarqué.
    // ⚠️ On bufferise ~100 ms de PCM avant d'envoyer (accumule 4 blocs de 128
    // échantillons) : sinon on spamme le WS avec ~125 petits messages/s, ce qui
    // augmente la latence perçue et la charge réseau/proxy.
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
          this._acc = []       // Int16 accumulés (~100 ms à 16 kHz = 1600 samples)
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
            if (this._accLen >= 1600) { // ~100 ms
              this.port.postMessage(toB64(new Uint8Array(new Int16Array(this._acc).buffer)))
              this._acc = []; this._accLen = 0
            }
          }
          return true
        }
      }
      registerProcessor('pcm-processor', PcmProcessor)
    `
    const blobUrl = URL.createObjectURL(new Blob([workletCode], { type: 'application/javascript' }))
    await ctx.audioWorklet.addModule(blobUrl)
    URL.revokeObjectURL(blobUrl)

    const worklet = new AudioWorkletNode(ctx, 'pcm-processor')
    worklet.port.onmessage = (e) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'audio', data: e.data }))
      }
    }
    source.connect(worklet)
    workletRef.current = worklet
  }, [])

  const stopCapture = useCallback(() => {
    workletRef.current?.disconnect()
    workletRef.current = null
    mediaStreamRef.current?.getTracks().forEach(t => t.stop())
    mediaStreamRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
  }, [])

  // ── Connexion WS ─────────────────────────────────────────
  const connect = useCallback(async () => {
    if (statusRef.current !== 'idle') return
    setStatusBoth('connecting')
    try {
      const params = new URLSearchParams()
      if (token) { params.set('token', token); if (agentId) params.set('agentId', agentId); if (conversationId) params.set('conversationId', conversationId) }
      else { params.set('agentKey', agentKey); if (sessionId) params.set('sessionId', sessionId) }
      // ⚠️ Par défaut on passe par la MÊME origine que la page (proxy Vite avec ws:true),
      // pas directement vers le backend : depuis un téléphone en https://IP:5173, un
      // ws://IP:4000 serait bloqué (mixed content) et le micro exige un contexte
      // sécurisé de toute façon. VITE_WS_URL ne sert que si le backend est exposé
      // lui-même en wss:// public.
      const base = import.meta.env.VITE_WS_URL
        || (import.meta.env.VITE_API_URL
            ? import.meta.env.VITE_API_URL.replace(/^http/, 'ws').replace(/\/api\/v1\/?$/, '')
            : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`)
      const ws = new WebSocket(`${base}/api/v1/live?${params}`)
      wsRef.current = ws

      ws.onopen = () => ws.send(JSON.stringify({ type: 'start' }))
      ws.onmessage = (e) => {
        let msg
        try { msg = JSON.parse(e.data) } catch { return }
        switch (msg.type) {
          case 'ready': setModel(msg.model); break
          case 'started': break
          case 'audio': playPcm24(msg.data); break
          case 'transcript': onTranscript?.(msg); break
          case 'interrupted':
            // barge-in : on vide la file de lecture
            playQueueRef.current = []
            nextPlayTimeRef.current = 0
            break
          case 'turn_complete': break
          case 'error': onError?.(msg.message); break
          case 'closed': setStatusBoth('closed'); break
          default: break
        }
      }
      ws.onerror = () => { onError?.('Erreur de connexion Live'); setStatusBoth('idle') }
      ws.onclose = () => {
        stopCapture()
        if (statusRef.current !== 'closed') setStatusBoth('idle')
        wsRef.current = null
      }

      await startCapture()
      setStatusBoth('live')
    } catch (err) {
      onError?.(err.message || 'Impossible de démarrer la session vocale')
      setStatusBoth('idle')
    }
  }, [token, agentKey, sessionId, agentId, conversationId, onTranscript, onError, playPcm24, startCapture, stopCapture, setStatusBoth])

  const disconnect = useCallback(() => {
    try {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'end' }))
      }
    } catch { /* ignore */ }
    stopCapture()
    playQueueRef.current = []
    wsRef.current?.close()
    wsRef.current = null
    playCtxRef.current?.close().catch(() => {})
    playCtxRef.current = null
    setStatusBoth('idle')
  }, [stopCapture, setStatusBoth])

  // Nettoyage au démontage du composant
  useEffect(() => () => disconnect(), [disconnect])

  /** Envoi texte (alternative micro) */
  const sendText = useCallback((text) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && text?.trim()) {
      wsRef.current.send(JSON.stringify({ type: 'text', text }))
    }
  }, [])

  return { status, model, connect, disconnect, sendText }
}
