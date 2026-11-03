import { useState, useRef, useEffect, useCallback } from 'preact/hooks'
import { streamChat, fetchConfig, getSessionId } from './api.js'
import { openLiveSocket, startPcmCapture, createPcmPlayer } from './live.js'

const ChatIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)
const SendIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
)
const MicIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" />
  </svg>
)

export function Widget({ apiBase, agentKey, host }) {
  const [open, setOpen] = useState(false)
  const [appearance, setAppearance] = useState({ primaryColor: '#2563eb', position: 'bottom-right', title: 'Assistant', greeting: '', avatarUrl: null, voiceMode: 'pipeline' })
  const [messages, setMessages] = useState([])   // { role, content }
  const [streaming, setStreaming] = useState(false)
  const [input, setInput] = useState('')
  const sessionId = useRef(getSessionId(agentKey))
  const scroller = useRef(null)

  // ── Mode Live (audio natif) ──
  const [liveOn, setLiveOn] = useState(false)
  const liveSockRef = useRef(null)
  const stopCaptureRef = useRef(null)
  const playerRef = useRef(null)

  // Config chargée une fois (à l'ouverture) pour l'apparence + le message d'accueil
  useEffect(() => {
    if (!open || messages.length) return
    fetchConfig(apiBase, agentKey)
      .then(cfg => {
        if (cfg.appearance) setAppearance(a => ({ ...a, ...cfg.appearance }))
        if (cfg.voiceMode) setAppearance(a => ({ ...a, voiceMode: cfg.voiceMode }))
        if (cfg.appearance?.greeting) setMessages([{ role: 'assistant', content: cfg.appearance.greeting }])
      })
      .catch(() => setMessages([{ role: 'assistant', content: 'Bonjour 👋' }]))
  }, [open])

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight
  }, [messages, streaming])

  // Applique la couleur de l'agent à tout le Shadow DOM via la variable CSS
  useEffect(() => {
    if (host && appearance.primaryColor) host.style.setProperty('--vai-primary', appearance.primaryColor)
  }, [appearance.primaryColor, host])

  const send = useCallback(() => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setMessages(m => [...m, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setStreaming(true)

    streamChat({
      apiBase, agentKey, sessionId: sessionId.current, message: text,
      onToken: (t) => setMessages(m => {
        const copy = m.slice()
        copy[copy.length - 1] = { role: 'assistant', content: copy[copy.length - 1].content + t }
        return copy
      }),
      onDone: () => setStreaming(false),
      onQueued: () => {
        // Réponse différée (batchée côté serveur) : on garde la bulle user et
        // on arrête le "typing" ; la réponse arrivera au prochain fetch de
        // l'historique (le backend la persiste en DB à la fin du tour).
        setStreaming(false)
        setMessages(m => {
          const copy = m.slice()
          if (copy[copy.length - 1]?.role === 'assistant' && !copy[copy.length - 1].content) copy.pop()
          return copy
        })
      },
      onError: (err) => {
        setStreaming(false)
        setMessages(m => {
          const copy = m.slice()
          // Remplace la bulle assistant vide par un message d'erreur
          if (copy[copy.length - 1]?.role === 'assistant' && !copy[copy.length - 1].content) copy.pop()
          copy.push({ role: 'error', content: err.message || 'Une erreur est survenue.' })
          return copy
        })
      },
    })
  }, [input, streaming, apiBase, agentKey])

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  // ── Appel Live (audio natif Gemini via WS) ──────────────
  const toggleLive = useCallback(async () => {
    if (liveOn) {
      stopCaptureRef.current?.()
      stopCaptureRef.current = null
      liveSockRef.current?.close()
      liveSockRef.current = null
      playerRef.current?.close()
      playerRef.current = null
      setLiveOn(false)
      return
    }
    try {
      const sock = openLiveSocket({
        apiBase, agentKey, sessionId: sessionId.current,
        handlers: {
          audio: (m) => playerRef.current?.play(m.data),
          transcript: (m) => {
            if (!m.text) return
            // Agrège dans la dernière bulle du même rôle (évite un mur de mini-bulles).
            setMessages(ms => {
              const copy = ms.slice()
              const last = copy[copy.length - 1]
              if (last && last.role === m.role && !last.closed) {
                copy[copy.length - 1] = { role: m.role, content: last.content + m.text, closed: m.final }
              } else {
                if (last && !last.closed) copy[copy.length - 1] = { ...last, closed: true }
                copy.push({ role: m.role, content: m.text, closed: m.final })
              }
              return copy
            })
          },
          interrupted: () => playerRef.current?.clear(),
          error: (m) => setMessages(ms => [...ms, { role: 'error', content: m.message || 'Erreur Live' }]),
        },
      })
      liveSockRef.current = sock
      playerRef.current = createPcmPlayer()
      const stop = await startPcmCapture((b64) => sock.sendAudio(b64))
      stopCaptureRef.current = stop
      setLiveOn(true)
    } catch (err) {
      setMessages(ms => [...ms, { role: 'error', content: 'Micro indisponible : ' + (err.message || err) }])
    }
  }, [liveOn, apiBase, agentKey])

  // Nettoyage à la fermeture du panneau
  useEffect(() => {
    if (!open && liveOn) { void toggleLive() }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const posClass = appearance.position === 'bottom-left' ? 'pos-left' : 'pos-right'
  const lastEmpty = streaming && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1].content

  return (
    <>
      {open && (
        <div class={`panel ${posClass}`}>
          <div class="header">
            <div class="avatar">
              {appearance.avatarUrl ? <img src={appearance.avatarUrl} alt="" /> : (appearance.title || 'A').charAt(0).toUpperCase()}
            </div>
            <div class="title">{appearance.title}</div>
            <button class="close" onClick={() => setOpen(false)} aria-label="Fermer">×</button>
          </div>

          <div class="messages" ref={scroller}>
            {messages.map((m, i) => (
              <div key={i} class={`msg ${m.role}`}>
                {lastEmpty && i === messages.length - 1
                  ? <span class="typing"><span></span><span></span><span></span></span>
                  : m.content}
              </div>
            ))}
          </div>

          <div class="composer">
            <textarea
              rows="1" placeholder="Écrivez votre message…"
              value={input}
              onInput={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
            />
            {appearance.voiceMode === 'live' && (
              <button
                onClick={toggleLive}
                class={liveOn ? 'mic live-on' : 'mic'}
                aria-label={liveOn ? 'Raccrocher' : 'Appel vocal Live'}
                title={liveOn ? 'Raccrocher' : 'Appel vocal (Live)'}
              ><MicIcon /></button>
            )}
            <button onClick={send} disabled={!input.trim() || streaming} aria-label="Envoyer"><SendIcon /></button>
          </div>
        </div>
      )}

      <button class={`launcher ${posClass}`} onClick={() => setOpen(o => !o)} aria-label="Ouvrir le chat">
        <ChatIcon />
      </button>
    </>
  )
}
