import { useState, useRef, useCallback, useEffect } from 'react'
import { transcribeAudio } from '../api/voice.js'

// Écoute possible pendant que l'agent parle (barge-in) : l'echo cancellation
// du navigateur limite la repasse du haut-parleur dans le micro (jamais
// parfaite sans casque, mais réduit nettement les faux déclenchements du VAD).
const MIC_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }

const VAD = {
  baseSilenceThreshold: 0.015, // plancher du seuil "silence" (RMS)
  baseSpeechThreshold:  0.02,  // plancher du seuil "parole" (RMS)
  maxSpeechThreshold:   0.08,  // borne haute : un micro faible ne doit pas être ignoré
  pollMs:               100,   // fréquence d'analyse du niveau sonore
  // ── Calibration du bruit ambiant au démarrage ──
  calibMs:              350,   // fenêtre de mesure du bruit avant de détecter la parole
  noiseSpeechMult:      3,     // seuil parole  = bruit ambiant × 3
  noiseSilenceMult:     1.8,   // seuil silence = bruit ambiant × 1.8
}

// Le réglage "Sensibilité interruption" de l'agent pilote le timing de coupure
// auto : plus c'est réactif, plus on coupe vite après le silence.
const SENSITIVITY_PROFILES = {
  low:    { silenceMs: 2500, minSpeechMs: 400 }, // patient — laisse le temps de réfléchir
  medium: { silenceMs: 1500, minSpeechMs: 300 }, // équilibré (défaut)
  high:   { silenceMs: 800,  minSpeechMs: 250 }, // réactif — coupe vite
}

/**
 * États :
 *   idle → recording → transcribing → (retour idle via onTranscript)
 *   speaking → idle (géré par l'appelant via setSpeaking)
 *
 * Mode PTT  : startRecording / stopRecording
 * Mode Auto : startAutoRecording / stopAutoRecording
 *             hasSpeech = true dès qu'on détecte de la voix (reset à chaque session)
 *
 * `sensitivity` ('low'|'medium'|'high') vient de la config agent
 * (interruptionSensitivity) et règle la réactivité de la coupure auto.
 */
export function useVoice({ onTranscript, onError, sensitivity = 'medium' }) {
  const [status,   setStatus]   = useState('idle')
  const [hasSpeech, setHasSpeech] = useState(false)

  // Sensibilité lue au démarrage de l'enregistrement — ref pour toujours
  // avoir la valeur à jour même si l'agent change de config entre-temps.
  const sensitivityRef = useRef(sensitivity)
  useEffect(() => { sensitivityRef.current = sensitivity }, [sensitivity])

  const mediaRecorderRef = useRef(null)
  const chunksRef        = useRef([])
  const streamRef        = useRef(null)

  // Refs VAD
  const audioCtxRef    = useRef(null)
  const analyserRef    = useRef(null)
  const vadTimerRef    = useRef(null)
  const speechStartRef = useRef(null)
  const silenceStartRef = useRef(null)

  // ── Commun : traitement après stop ──────────────────────
  const processStop = useCallback(async (recorder) => {
    const mimeType = recorder.mimeType || 'audio/webm'
    const blob = new Blob(chunksRef.current, { type: mimeType })
    if (blob.size < 1000) { setStatus('idle'); return }
    setStatus('transcribing')
    try {
      const text = await transcribeAudio(blob)
      setStatus('idle')
      if (text) onTranscript(text)
    } catch (err) {
      setStatus('idle')
      onError?.(err.message)
    }
  }, [onTranscript, onError])

  // ── Mode PTT (maintenir) ─────────────────────────────────
  const startRecording = useCallback(async () => {
    if (status !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop())
        await processStop(recorder)
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setStatus('recording')
    } catch (err) {
      setStatus('idle')
      onError?.(err.name === 'NotAllowedError'
        ? 'Accès au microphone refusé. Autorisez-le dans les paramètres du navigateur.'
        : err.message)
    }
  }, [status, processStop, onError])

  const stopRecording = useCallback(() => {
    if (status !== 'recording') return
    mediaRecorderRef.current?.stop()
  }, [status])

  // ── Mode Auto (VAD) ──────────────────────────────────────
  const startAutoRecording = useCallback(async () => {
    if (status !== 'idle') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS })
      streamRef.current = stream

      // Web Audio API pour analyser le niveau sonore
      const ctx = new AudioContext()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      source.connect(analyser)
      analyserRef.current = analyser

      const recorder = new MediaRecorder(stream, { mimeType: getSupportedMimeType() })
      chunksRef.current = []
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data) }
      recorder.onstop = async () => {
        clearInterval(vadTimerRef.current)
        audioCtxRef.current?.close().catch(() => {})
        streamRef.current?.getTracks().forEach(t => t.stop())
        setHasSpeech(false)
        await processStop(recorder)
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      speechStartRef.current  = null
      silenceStartRef.current = null
      setHasSpeech(false)
      setStatus('recording')

      // Timing de coupure selon la sensibilité de l'agent
      const profile = SENSITIVITY_PROFILES[sensitivityRef.current] ?? SENSITIVITY_PROFILES.medium

      // Seuils dynamiques : calibrés sur le bruit ambiant des premières ms,
      // sinon on garde les planchers fixes en attendant.
      let speechThreshold  = VAD.baseSpeechThreshold
      let silenceThreshold = VAD.baseSilenceThreshold
      let calibrated       = false
      const noiseSamples   = []
      const calibTicks     = Math.max(1, Math.round(VAD.calibMs / VAD.pollMs))

      // Boucle VAD
      const buf = new Float32Array(analyser.fftSize)
      vadTimerRef.current = setInterval(() => {
        analyser.getFloatTimeDomainData(buf)
        const rms = Math.sqrt(buf.reduce((sum, v) => sum + v * v, 0) / buf.length)
        const now = Date.now()

        // ── Phase de calibration : on mesure le bruit ambiant avant de
        // détecter la parole (évite les faux positifs en milieu bruyant et
        // les non-détections avec un micro faible). On prend le MINIMUM des
        // échantillons comme plancher de bruit : robuste si l'utilisateur
        // parle déjà pendant la calibration (les creux restent proches du bruit).
        if (!calibrated) {
          noiseSamples.push(rms)
          if (noiseSamples.length >= calibTicks) {
            const noiseFloor = Math.min(...noiseSamples)
            speechThreshold  = Math.min(VAD.maxSpeechThreshold,
              Math.max(VAD.baseSpeechThreshold, noiseFloor * VAD.noiseSpeechMult))
            silenceThreshold = Math.min(speechThreshold * 0.8,
              Math.max(VAD.baseSilenceThreshold, noiseFloor * VAD.noiseSilenceMult))
            calibrated = true
          }
          return // pendant la calibration : ni parole ni silence
        }

        if (rms > speechThreshold) {
          // Parole détectée
          if (!speechStartRef.current) speechStartRef.current = now
          silenceStartRef.current = null
          setHasSpeech(true)
        } else if (rms < silenceThreshold) {
          // Silence franc (la zone morte entre les deux seuils = hystérésis,
          // on n'y change rien pour éviter les oscillations)
          const speechDuration = speechStartRef.current ? now - speechStartRef.current : 0
          if (speechDuration > profile.minSpeechMs) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = now
            } else if (now - silenceStartRef.current > profile.silenceMs) {
              // Silence assez long après parole → arrêt automatique
              clearInterval(vadTimerRef.current)
              mediaRecorderRef.current?.stop()
            }
          }
        }
      }, VAD.pollMs)

    } catch (err) {
      setStatus('idle')
      onError?.(err.name === 'NotAllowedError'
        ? 'Accès au microphone refusé. Autorisez-le dans les paramètres du navigateur.'
        : err.message)
    }
  }, [status, processStop, onError])

  const stopAutoRecording = useCallback(() => {
    clearInterval(vadTimerRef.current)
    mediaRecorderRef.current?.stop()
  }, [])

  const setSpeaking = useCallback((value) => {
    setStatus(value ? 'speaking' : 'idle')
  }, [])

  return {
    status,
    hasSpeech,
    startRecording,
    stopRecording,
    startAutoRecording,
    stopAutoRecording,
    setSpeaking,
  }
}

function getSupportedMimeType() {
  const types = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  return types.find(t => MediaRecorder.isTypeSupported(t)) || ''
}
