import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useAgent, useUpdateAgent } from '../hooks/useAgents.js'
import { useServices } from '../hooks/useServices.js'
import { useConversation, useCreateConversation } from '../hooks/useConversations.js'
import { useChat } from '../hooks/useChat.js'
import { useVoice } from '../hooks/useVoice.js'
import { useLiveVoice } from '../hooks/useLiveVoice.js'
import { useSpeechQueue } from '../hooks/useSpeechQueue.js'
import { Button } from '../components/ui/Button.jsx'
import { StatusBadge } from './Dashboard.jsx'

const VOICES = [
  { value: 'alloy-neutral', label: 'Alloy — Neutre' },
  { value: 'nova-feminine', label: 'Nova — Féminine' },
  { value: 'echo-masculine', label: 'Echo — Masculine' },
  { value: 'shimmer-soft', label: 'Shimmer — Douce' },
]
const PERSONALITIES = [
  { value: 'professional', label: 'Professionnel' },
  { value: 'friendly', label: 'Amical' },
  { value: 'formal', label: 'Formel' },
  { value: 'casual', label: 'Décontracté' },
]
const SENSITIVITIES = [
  { value: 'low', label: 'Faible — Patient' },
  { value: 'medium', label: 'Moyen — Équilibré' },
  { value: 'high', label: 'Élevé — Réactif' },
]
// Voix natives des modèles Gemini Live (PrebuiltVoiceConfig) — PAS les voix Edge TTS.
const LIVE_VOICES = [
  { value: 'Aoede', label: 'Aoede — Féminine chaude (recommandée FR)' },
  { value: 'Kore', label: 'Kore — Féminine ferme' },
  { value: 'Charon', label: 'Charon — Masculine profonde' },
  { value: 'Fenrir', label: 'Fenrir — Masculine énergique' },
  { value: 'Leda', label: 'Leda — Féminine jeune' },
  { value: 'Orus', label: 'Orus — Masculine' },
  { value: 'Puck', label: 'Puck — Masculine ludique' },
  { value: 'Zephyr', label: 'Zephyr — Féminine claire' },
]
// Modèles Live réels (API bidiGenerateContent) — voir backend live.service.js
export const LIVE_MODELS_UI = [
  { value: 'gemini-2.5-flash-native-audio-latest', label: '2.5 Flash Native Audio (recommandé)' },
  { value: 'gemini-2.5-flash-native-audio-preview-12-2025', label: '2.5 Flash Native Audio (preview 12-2025)' },
  { value: 'gemini-3.1-flash-live-preview', label: '3.1 Flash Live (preview)' },
  { value: 'gemini-3.5-live-translate-preview', label: '3.5 Live Translate (traduction temps réel)' },
  { value: 'gemini-3.5-transcribe-live', label: '3.5 Transcribe Live (transcription seule)' },
  { value: 'gemini-3.8-live', label: '3.8 Live' },
  { value: 'gemini-3.8-live-extended-thinking', label: '3.8 Live Extended Thinking' },
]

export function AgentDetail() {
  const { id } = useParams()
  const { data: agent, isLoading } = useAgent(id)
  const [tab, setTab] = useState('configure') // 'configure' | 'test'

  if (isLoading) return <div className="p-8 text-gray-500">Chargement…</div>
  if (!agent) return <div className="p-8 text-gray-500">Agent introuvable.</div>

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-8 py-5 border-b border-gray-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/agents" className="hover:text-indigo-600">Agents</Link>
          <span>/</span>
          <span className="text-gray-900 font-medium">{agent.name}</span>
        </div>
        <div className="flex items-center justify-between mt-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-sm font-bold">
              {agent.name[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-gray-900">{agent.name}</p>
              {agent.description && <p className="text-xs text-gray-500">{agent.description}</p>}
            </div>
            <StatusBadge status={agent.status} />
          </div>
          <div className="flex gap-2">
            <TabButton active={tab === 'configure'} onClick={() => setTab('configure')}>
              Configure
            </TabButton>
            <TabButton active={tab === 'test'} onClick={() => setTab('test')}>
              ▶ Test Live
            </TabButton>
          </div>
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-hidden">
        {tab === 'configure' ? (
          <ConfigurePanel agent={agent} />
        ) : (
          <TestLivePanel agent={agent} />
        )}
      </div>
    </div>
  )
}

/* ── Onglet Configure ─────────────────────────────────── */
function ConfigurePanel({ agent }) {
  const updateAgent = useUpdateAgent()
  const { data: services = [] } = useServices(agent.id)
  const [form, setForm] = useState({
    name: agent.name,
    description: agent.description ?? '',
    status: agent.status,
    remarks: agent.remarks ?? '',
    config: {
      voice: agent.config?.voice ?? 'alloy-neutral',
      personality: agent.config?.personality ?? 'professional',
      interruptionSensitivity: agent.config?.interruptionSensitivity ?? 'medium',
      greetingMessage: agent.config?.greetingMessage ?? '',
      voiceMode: agent.config?.voiceMode ?? 'pipeline', // 'pipeline' (STT+TTS) | 'live' (Gemini Live natif)
      liveModel: agent.config?.liveModel ?? 'gemini-2.5-flash-native-audio-latest',
      liveVoice: agent.config?.liveVoice ?? 'Aoede',
    },
  })
  const [saved, setSaved] = useState(false)

  const setConfig = (key, value) =>
    setForm(f => ({ ...f, config: { ...f.config, [key]: value } }))

  const handleSave = (e) => {
    e.preventDefault()
    updateAgent.mutate({ id: agent.id, ...form }, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) },
    })
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        {/* Infos générales */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Informations générales</h3>
          <div className="space-y-4">
            <Field label="Nom de l'agent">
              <input
                className="input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                required
              />
            </Field>
            <Field label="Description">
              <input
                className="input"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Rôle et contexte de cet agent…"
              />
            </Field>
            <Field label="Statut">
              <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="draft">Draft</option>
                <option value="active">Actif</option>
                <option value="archived">Archivé</option>
              </Select>
            </Field>
          </div>
        </section>

        <hr className="border-gray-100" />

        {/* Voix & personnalité */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Voix & Personnalité</h3>
          <div className="grid grid-cols-3 gap-4">
            <Field label="Voix">
              <Select value={form.config.voice} onChange={e => setConfig('voice', e.target.value)}>
                {VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label="Personnalité">
              <Select value={form.config.personality} onChange={e => setConfig('personality', e.target.value)}>
                {PERSONALITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </Select>
            </Field>
            <Field label="Sensibilité interruption">
              <Select value={form.config.interruptionSensitivity} onChange={e => setConfig('interruptionSensitivity', e.target.value)}>
                {SENSITIVITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-4">
            <Field label="Mode vocal">
              <Select value={form.config.voiceMode} onChange={e => setConfig('voiceMode', e.target.value)}>
                <option value="pipeline">Pipeline (STT + TTS séparés)</option>
                <option value="live">Live — audio natif Gemini (recommandé)</option>
              </Select>
            </Field>
            {form.config.voiceMode === 'live' && (
              <>
                <Field label="Modèle Live">
                  <Select value={form.config.liveModel} onChange={e => setConfig('liveModel', e.target.value)}>
                    {LIVE_MODELS_UI.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </Select>
                </Field>
                <Field label="Voix Live">
                  <Select value={form.config.liveVoice} onChange={e => setConfig('liveVoice', e.target.value)}>
                    {LIVE_VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </Select>
                </Field>
              </>
            )}
          </div>
        </section>

        <hr className="border-gray-100" />

        {/* Prompts */}
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Messages & Instructions</h3>
          <div className="space-y-4">
            <Field label="Message d'accueil">
              <textarea
                rows={2}
                className="input resize-none"
                value={form.config.greetingMessage}
                onChange={e => setConfig('greetingMessage', e.target.value)}
                placeholder="Bonjour ! Comment puis-je vous aider ?"
              />
            </Field>
            <Field label="Remarques spécifiques" hint="Instructions propres à cet agent uniquement (le reste du prompt — profil entreprise, services — est généré automatiquement).">
              <textarea
                rows={6}
                className="input resize-none text-xs"
                value={form.remarks}
                onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                placeholder="Ex : insiste sur la prise de rendez-vous rapide, ne propose jamais de remise…"
              />
            </Field>
          </div>
        </section>

        <hr className="border-gray-100" />

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Services applicables</h3>
          {services.length === 0 ? (
            <p className="text-xs text-gray-400">
              Aucun service applicable à cet agent. Gérez-les depuis la page{' '}
              <Link to="/services" className="text-indigo-600 hover:underline">Services</Link>.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                {services.map(s => (
                  <span key={s.id} className="text-xs bg-gray-50 border border-gray-200 text-gray-700 px-2.5 py-1 rounded-lg">
                    {s.name} · {s.durationMinutes} min
                  </span>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Gérer la liste depuis <Link to="/services" className="text-indigo-600 hover:underline">Services</Link>.
              </p>
            </>
          )}
        </section>

        {updateAgent.error && (
          <p className="text-sm text-red-600">{updateAgent.error.response?.data?.title || 'Erreur'}</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={updateAgent.isPending}>
            Enregistrer
          </Button>
          {saved && <span className="text-sm text-green-600">✓ Sauvegardé</span>}
        </div>
      </form>

      <style>{`.input { width: 100%; padding: 8px 12px; font-size: 14px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; } .input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgb(99 102 241 / 0.2); }`}</style>
    </div>
  )
}

/* ── Onglet Test Live ──────────────────────────────────── */
function TestLivePanel({ agent }) {
  const createConversation = useCreateConversation()
  const [convId, setConvId] = useState(null)

  useEffect(() => {
    // Crée automatiquement une conversation de test
    createConversation.mutate(
      { agentId: agent.id, metadata: { source: 'test-live' } },
      { onSuccess: (data) => setConvId(data.id) },
    )
  }, [agent.id])

  if (!convId) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Initialisation…
      </div>
    )
  }

  return (
    <LiveChat
      conversationId={convId}
      greetingMessage={agent.config?.greetingMessage}
      agentVoice={agent.config?.voice}
      agentSensitivity={agent.config?.interruptionSensitivity}
      voiceMode={agent.config?.voiceMode ?? 'pipeline'}
      liveModel={agent.config?.liveModel}
      liveVoice={agent.config?.liveVoice}
    />
  )
}

/* ── Chat en direct ───────────────────────────────────── */
function LiveChat({ conversationId, greetingMessage, agentVoice, agentSensitivity, voiceMode = 'pipeline', liveModel, liveVoice }) {
  const { data: conv } = useConversation(conversationId)
  const [input, setInput] = useState('')
  const [ttsError, setTtsError] = useState(null)
  const [mode, setMode] = useState('ptt') // 'ptt' | 'auto'
  // Boucle mains-libres : true tant que le mode Auto doit relancer l'écoute
  // tout seul après chaque réponse de l'agent (conversation continue).
  const [autoConversation, setAutoConversation] = useState(false)
  const bottomRef = useRef(null)
  const audioUnlocked = useRef(false)

  // TTS incrémental : le texte est lu phrase par phrase pendant le streaming
  // LLM (file d'attente audio), au lieu d'attendre la réponse complète.
  const speak = useSpeechQueue(agentVoice, { onError: setTtsError })
  const speaking = speak.speaking

  const { sendMessage, streaming, streamingText, error, abort: abortChat } = useChat(conversationId, {
    onToken: speak.feed,
    onDone:  speak.finish,
    onError: speak.reset,
  })

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conv?.messages, streamingText])

  const messages = conv?.messages ?? []

  const { status: voiceStatus, hasSpeech, startRecording, stopRecording, startAutoRecording, stopAutoRecording } = useVoice({
    sensitivity: agentSensitivity,
    onTranscript: async (text) => {
      setTtsError(null)
      speak.begin() // coupe l'audio en cours + démarre une session propre
      setInput(text)
      sendMessage(text) // pas de await : on réécoute tout de suite (barge-in pendant la réponse)
      setInput('')
      if (mode === 'auto' && autoConversation) startAutoRecording()
    },
    onError: setTtsError,
  })

  // ── Mode Live natif (Gemini Live API via WebSocket) ──────
  // Remplace le pipeline STT→LLM→TTS par une seule session audio bidir.
  const liveEnabled = voiceMode === 'live'
  const [liveTranscripts, setLiveTranscripts] = useState([]) // [{role, text}] cumulés pour la session en cours
  const live = useLiveVoice({
    token: localStorage.getItem('access_token'),
    agentId: undefined, // résolu côté WS via conversationId + token
    conversationId,
    onTranscript: (m) => {
      // Agrège les morceaux de transcription dans la DERNIÈRE bulle du même
      // rôle au lieu d'en créer une nouvelle à chaque chunk (lisibilité).
      if (m.text) setLiveTranscripts(t => {
        const copy = t.slice()
        const last = copy[copy.length - 1]
        if (last && last.role === m.role) copy[copy.length - 1] = { role: m.role, text: last.text + m.text }
        else copy.push({ role: m.role, text: m.text })
        return copy
      })
    },
    onError: setTtsError,
  })
  const liveActive = live.status === 'live'

  const ensureAudioUnlocked = async () => {
    if (!audioUnlocked.current) {
      await unlockAudio()
      audioUnlocked.current = true
    }
  }

  // ── Handlers selon mode ──────────────────────────────────
  // En PTT, appuyer sur le micro pendant que l'agent parle/répond = barge-in
  // explicite : on coupe le tour en cours avant de démarrer l'enregistrement.
  const handleMicDown = async () => {
    if (mode !== 'ptt') return
    await ensureAudioUnlocked()
    if (liveEnabled) {
      if (liveActive) { live.disconnect(); setLiveTranscripts([]) }
      else { setLiveTranscripts([]); live.connect() }
      return
    }
    if (turnActive) {
      abortChat()
      speak.reset()
    }
    startRecording()
  }

  // Le bouton micro en mode Auto est un interrupteur de la boucle mains-libres :
  // 1er clic = active la conversation continue (écoute → réponse → réécoute…),
  // 2e clic = coupe tout (audio en cours + écoute) et arrête la boucle.
  const handleMicClickAuto = async () => {
    if (mode !== 'auto') return
    await ensureAudioUnlocked()
    if (liveEnabled) {
      if (liveActive) { live.disconnect(); setLiveTranscripts([]) }
      else { setLiveTranscripts([]); live.connect() }
      return
    }
    if (autoConversation) {
      setAutoConversation(false)
      abortChat()   // coupe le stream LLM en cours s'il y en a un
      speak.reset() // coupe l'audio de l'agent en cours
      if (voiceStatus === 'recording') stopAutoRecording()
    } else {
      setAutoConversation(true)
      if (voiceStatus === 'idle' && !speaking) startAutoRecording()
    }
  }

  // ── Boucle mains-libres (mode Auto) ──────────────────────
  // Après chaque tour, quand l'agent a fini de parler (fin du streaming ET de
  // la lecture TTS), on rouvre le micro automatiquement — pas besoin de
  // recliquer à chaque fois. On détecte le FRONT DESCENDANT de l'activité du
  // tour (streaming || speaking) pour ne relancer qu'une fois, à la vraie fin,
  // et jamais pendant le bref passage à 'idle' entre transcription et envoi.
  const turnActive = streaming || speaking
  const prevTurnActiveRef = useRef(false)
  useEffect(() => {
    if (mode === 'auto' && autoConversation &&
        prevTurnActiveRef.current && !turnActive && voiceStatus === 'idle') {
      startAutoRecording()
    }
    prevTurnActiveRef.current = turnActive
  }, [turnActive, voiceStatus, mode, autoConversation, startAutoRecording])

  // ── Barge-in (mode Auto) ───────────────────────────────
  // Le micro écoute déjà pendant que l'agent répond/parle (redémarré juste
  // après la transcription, sans attendre la fin du tour). Dès que le VAD
  // détecte une vraie prise de parole PENDANT ce tour, on coupe l'agent
  // (stream LLM + lecture TTS) pour rendre la main à l'utilisateur — le VAD
  // continue de capter sa phrase normalement jusqu'au silence suivant.
  useEffect(() => {
    if (mode === 'auto' && autoConversation && turnActive && hasSpeech) {
      abortChat()
      speak.reset()
    }
  }, [hasSpeech, turnActive, mode, autoConversation])

  const switchMode = (newMode) => {
    if (newMode === mode) return // reclic sur l'onglet déjà actif : rien à faire
    // Changer de mode reprend la main sur l'agent : on coupe un tour en cours
    // (stream + TTS) et tout enregistrement actif avant de basculer.
    abortChat()
    speak.reset()
    if (voiceStatus === 'recording') {
      mode === 'auto' ? stopAutoRecording() : stopRecording()
    }
    setAutoConversation(false)
    setMode(newMode)
  }

  const send = async (e) => {
    e?.preventDefault()
    const msg = input.trim()
    if (!msg || streaming) return
    setInput('')
    setTtsError(null)
    if (liveEnabled) {
      if (liveActive) live.sendText(msg)
      else { setLiveTranscripts([{ role: 'user', text: msg }]); live.sendText(msg) }
      return
    }
    speak.begin() // coupe l'audio en cours + démarre une session propre
    sendMessage(msg)
    if (mode === 'auto' && autoConversation) startAutoRecording()
  }

  const isBusy = liveEnabled
    ? (live.status === 'connecting')
    : (streaming || voiceStatus === 'transcribing' || speaking)

  // ── Styles bouton micro ──────────────────────────────────
  const micBtnClass = (() => {
    const base = 'w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-lg select-none'
    if (liveEnabled) {
      if (live.status === 'connecting') return `${base} bg-yellow-400 cursor-wait`
      if (liveActive) return `${base} bg-red-500 scale-110 shadow-red-200 ring-4 ring-red-300 animate-pulse`
      return `${base} bg-indigo-600 hover:bg-indigo-700 hover:scale-105 cursor-pointer`
    }
    if (voiceStatus === 'transcribing') return `${base} bg-yellow-400 cursor-wait`
    if (voiceStatus === 'recording') {
      if (mode === 'auto' && hasSpeech) return `${base} bg-red-500 scale-110 shadow-red-200 ring-4 ring-red-300 animate-pulse`
      return `${base} bg-red-500 scale-110 shadow-red-200`
    }
    // PTT : le bouton reste pressable pendant que l'agent parle/répond (barge-in).
    if ((speaking || streaming) && mode === 'ptt') return `${base} bg-indigo-500 hover:bg-indigo-600 ring-4 ring-indigo-200 cursor-pointer`
    if (speaking) return `${base} bg-indigo-400 cursor-default`
    if (isBusy)   return `${base} bg-gray-300 cursor-not-allowed`
    return `${base} bg-indigo-600 hover:bg-indigo-700 hover:scale-105 cursor-pointer`
  })()

  const micLabel = (() => {
    if (liveEnabled) {
      if (live.status === 'connecting') return 'Connexion Live…'
      if (liveActive) return mode === 'ptt' ? 'Relâchez pour terminer l\'appel' : 'Cliquez pour raccrocher — conversation Live en cours'
      return mode === 'ptt' ? 'Maintenez pour appeler (Live)' : 'Cliquez pour démarrer l\'appel (Live)'
    }
    if (voiceStatus === 'transcribing') return 'Transcription…'
    if (voiceStatus === 'recording') {
      if (mode === 'auto') {
        if (turnActive) return hasSpeech ? "Vous interrompez l'agent…" : "L'agent parle… parlez pour l'interrompre"
        return hasSpeech ? 'Parole détectée — silence pour envoyer…' : 'En écoute… parlez'
      }
      return 'Relâchez pour envoyer…'
    }
    if (speaking)  return mode === 'ptt' ? "L'agent parle… maintenez pour l'interrompre" : "L'agent parle… (écoute juste après)"
    if (streaming) return mode === 'ptt' ? "L'agent répond… maintenez pour l'interrompre" : "L'agent répond…"
    if (mode === 'auto') return autoConversation ? 'Cliquez pour arrêter la conversation' : "Cliquez pour démarrer la conversation mains-libres"
    return 'Maintenez pour parler'
  })()

  return (
    <div className="flex h-full">
      {/* Zone chat */}
      <div className="flex-1 flex flex-col p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <StatusDot voiceStatus={liveEnabled ? (liveActive ? 'recording' : 'idle') : voiceStatus} streaming={streaming} speaking={speaking} hasSpeech={hasSpeech} />
            <span className="text-sm font-medium text-gray-700">
              {liveEnabled
                ? (liveActive ? `Appel Live en cours${live.model ? ` · ${live.model.replace('gemini-', 'G').replace('-latest', '')}` : ''}` : live.status === 'connecting' ? 'Connexion…' : 'Mode Live — cliquez pour appeler')
                : statusLabel(voiceStatus, streaming, speaking, mode, hasSpeech)}
            </span>
          </div>
          {/* Toggle PTT / Auto */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <ModeButton active={mode === 'ptt'} onClick={() => switchMode('ptt')}>
              Maintenir
            </ModeButton>
            <ModeButton active={mode === 'auto'} onClick={() => switchMode('auto')}>
              Auto
            </ModeButton>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 min-h-0">
          {greetingMessage && messages.length === 0 && (
            <BubbleAI text={greetingMessage} isGreeting />
          )}
          {messages.map(msg =>
            msg.role === 'user'
              ? <BubbleUser key={msg.id} text={msg.content} />
              : <BubbleAI key={msg.id} text={msg.content} tokens={msg.tokens} />
          )}
          {liveEnabled && liveTranscripts.length > 0 && (
            <div className="text-left">
              {liveTranscripts.slice(-6).map((t, i) => (
                <div key={i} className={t.role === 'user' ? 'text-right' : 'text-left'}>
                  <span className={`inline-block px-3 py-1.5 rounded-lg max-w-full break-words text-xs ${
                    t.role === 'user' ? 'bg-indigo-100 text-indigo-800' : 'bg-white border border-gray-200 text-gray-700'
                  }`}>
                    {t.text}
                  </span>
                </div>
              ))}
            </div>
          )}
          {streaming && <BubbleAI text={streamingText} streaming />}
          {(error || ttsError) && (
            <div className="flex justify-center">
              <span className="bg-red-50 border border-red-200 text-red-600 text-xs px-3 py-1.5 rounded-lg">
                ⚠ {error || ttsError}
              </span>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-4 space-y-3">
          {/* Bouton micro */}
          <div className="flex justify-center">
            {mode === 'ptt' ? (
              <button
                onMouseDown={handleMicDown}
                onMouseUp={liveEnabled ? undefined : stopRecording}
                onTouchStart={e => { e.preventDefault(); handleMicDown() }}
                onTouchEnd={e => { e.preventDefault(); if (!liveEnabled) stopRecording() }}
                disabled={liveEnabled ? live.status === 'connecting' : voiceStatus === 'transcribing'}
                className={micBtnClass}
              >
                <MicIcon voiceStatus={liveEnabled ? (liveActive ? 'recording' : 'idle') : voiceStatus} streaming={streaming} speaking={speaking} />
              </button>
            ) : (
              <button
                onClick={handleMicClickAuto}
                disabled={!liveEnabled && isBusy && voiceStatus !== 'recording'}
                className={micBtnClass}
              >
                <MicIcon voiceStatus={liveEnabled ? (liveActive ? 'recording' : 'idle') : voiceStatus} streaming={streaming} speaking={speaking} />
              </button>
            )}
          </div>
          <p className="text-center text-xs text-gray-400">{micLabel}</p>

          <form onSubmit={send} className="flex gap-2">
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={liveEnabled ? 'Ou tapez votre message… (envoyé en texte à la session Live)' : 'Ou tapez votre message…'}
              disabled={isBusy}
              className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
            />
            <Button type="submit" disabled={isBusy || !input.trim()}>
              {streaming ? '…' : 'Envoyer'}
            </Button>
          </form>
        </div>
      </div>

      {/* Transcript */}
      <div className="w-80 border-l border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-900">Transcript</span>
          <span className="text-xs text-gray-400">{messages.length} messages</span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
          {messages.map(msg => (
            <div key={msg.id} className={msg.role === 'user' ? 'text-right' : 'text-left'}>
              <span className={`inline-block px-3 py-1.5 rounded-lg max-w-full break-words ${
                msg.role === 'user' ? 'bg-indigo-100 text-indigo-800' : 'bg-white border border-gray-200 text-gray-700'
              }`}>
                {msg.content}
              </span>
              <p className="text-gray-400 mt-0.5">
                {msg.role === 'user' ? 'Vous' : 'Agent'}
                {msg.tokens ? ` · ${msg.tokens}t` : ''}
              </p>
            </div>
          ))}
          {streaming && streamingText && (
            <div className="text-left">
              <span className="inline-block px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 break-words">
                {streamingText}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* Déverrouille l'autoplay navigateur avec un son silencieux */
async function unlockAudio() {
  try {
    const ctx = new AudioContext()
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    await ctx.close()
  } catch { /* silencieux */ }
}

/* ── Helpers UI ────────────────────────────────────────── */
function StatusDot({ voiceStatus, streaming, speaking, hasSpeech }) {
  const color = voiceStatus === 'recording' && hasSpeech ? 'bg-red-500'
    : voiceStatus === 'recording'    ? 'bg-orange-400'
    : voiceStatus === 'transcribing' ? 'bg-yellow-400'
    : speaking                       ? 'bg-indigo-400'
    : streaming                      ? 'bg-yellow-400'
    : 'bg-green-400'
  return <span className={`w-2 h-2 rounded-full ${color} animate-pulse`} />
}

function statusLabel(voiceStatus, streaming, speaking, mode, hasSpeech) {
  if (voiceStatus === 'recording' && mode === 'auto') {
    return hasSpeech ? 'Parole détectée…' : 'En écoute auto…'
  }
  if (voiceStatus === 'recording')    return 'Enregistrement…'
  if (voiceStatus === 'transcribing') return 'Transcription…'
  if (speaking)                       return "L'agent parle…"
  if (streaming)                      return "L'agent répond…"
  return 'En écoute — Parlez ou tapez'
}

function ModeButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
        active
          ? 'bg-white text-indigo-700 shadow-sm'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}

function MicIcon({ voiceStatus, streaming, speaking }) {
  if (voiceStatus === 'transcribing' || streaming) {
    return (
      <svg className="w-6 h-6 text-white animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
      </svg>
    )
  }
  if (speaking) {
    return (
      <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
      </svg>
    )
  }
  return (
    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
    </svg>
  )
}

/* ── Composants bulles ─────────────────────────────────── */
function BubbleAI({ text, tokens, streaming, isGreeting }) {
  return (
    <div className="flex justify-start">
      <div className={`max-w-lg px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm shadow-sm ${
        isGreeting
          ? 'bg-indigo-50 border border-indigo-100 text-indigo-800 italic'
          : 'bg-white border border-gray-200 text-gray-900'
      }`}>
        {text
          ? <p className="whitespace-pre-wrap">{text}</p>
          : <span className="flex gap-1 items-center text-gray-300">
              <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
              <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
            </span>
        }
        {tokens && !streaming && (
          <span className="text-xs text-gray-300 mt-1 block text-right">{tokens} tokens</span>
        )}
      </div>
    </div>
  )
}

function BubbleUser({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-lg px-4 py-2.5 rounded-2xl rounded-br-sm text-sm bg-indigo-600 text-white">
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  )
}

/* ── Helpers ───────────────────────────────────────────── */
function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
        active
          ? 'bg-indigo-600 text-white'
          : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {children}
    </div>
  )
}

function Select({ children, ...props }) {
  return (
    <select
      {...props}
      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 bg-white"
    >
      {children}
    </select>
  )
}
