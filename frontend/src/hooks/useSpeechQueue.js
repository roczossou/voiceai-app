import { useState, useRef, useCallback, useEffect } from 'react'
import { synthesizeSpeech } from '../api/voice.js'

/**
 * File d'attente audio pour lecture TTS incrémentale.
 *
 * On alimente le hook au fil du streaming LLM (`feed`), il découpe le texte
 * par phrase (. ! ? …), lance la synthèse de chaque phrase DÈS qu'elle est
 * complète (en parallèle de la lecture des précédentes), et joue les MP3 dans
 * l'ordre sans blanc entre eux. `finish` signale la fin du flux (vide le
 * reste du tampon), `reset` interrompt tout (barge-in / nouveau tour).
 *
 * Un compteur de "génération" invalide tout travail async en cours dès qu'un
 * reset survient — les blobs déjà en vol sont ignorés au lieu d'être joués.
 */
export function useSpeechQueue(voice, { onError } = {}) {
  const [speaking, setSpeaking] = useState(false)

  const voiceRef   = useRef(voice)
  const bufferRef  = useRef('')      // texte pas encore flushé en phrase
  const queueRef   = useRef([])      // promesses de Blob, dans l'ordre
  const pumpingRef = useRef(false)   // boucle de lecture active ?
  const finishedRef = useRef(false)  // plus aucune phrase à venir ?
  const genRef     = useRef(0)       // jeton d'invalidation (barge-in)
  const audioRef   = useRef(null)    // <audio> en cours (pour l'arrêter)
  const waiterRef  = useRef(null)    // réveille la boucle quand une phrase arrive

  useEffect(() => { voiceRef.current = voice }, [voice])

  const wake = () => {
    if (waiterRef.current) { waiterRef.current(); waiterRef.current = null }
  }

  const playTracked = (blob, gen) => new Promise((resolve) => {
    if (!blob || gen !== genRef.current) return resolve()
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audioRef.current = audio
    const done = () => {
      URL.revokeObjectURL(url)
      if (audioRef.current === audio) audioRef.current = null
      resolve()
    }
    audio.onended = done
    audio.onerror = done
    audio.play().catch(done)
  })

  const pump = useCallback(async (gen) => {
    pumpingRef.current = true
    while (gen === genRef.current) {
      if (queueRef.current.length === 0) {
        if (finishedRef.current) break
        // Rien à jouer mais le flux continue : on attend la prochaine phrase.
        await new Promise((res) => { waiterRef.current = res })
        continue
      }
      const item = queueRef.current.shift()
      let blob
      try { blob = await item } catch { blob = null }
      if (gen !== genRef.current) break
      await playTracked(blob, gen)
    }
    pumpingRef.current = false
    if (gen === genRef.current) setSpeaking(false)
  }, [])

  const enqueueSentence = useCallback((text) => {
    const clean = text.trim()
    if (!clean) return
    const gen = genRef.current
    const promise = synthesizeSpeech(clean, voiceRef.current).catch((err) => {
      console.error('[TTS]', err)
      onError?.('TTS : ' + (err.message || 'erreur inconnue'))
      return null
    })
    queueRef.current.push(promise)
    setSpeaking(true)
    wake()
    if (!pumpingRef.current) pump(gen)
  }, [onError, pump])

  // Extrait les phrases COMPLÈTES du tampon (ponctuation finale suivie d'un
  // espace) et les met en file. Le reliquat sans ponctuation finale attend
  // soit la suite du flux, soit `finish`.
  const flushCompleteSentences = useCallback(() => {
    const buf = bufferRef.current
    const re = /[^.!?…]*[.!?…]+["')\]»]*\s/g
    let lastIndex = 0
    let m
    while ((m = re.exec(buf)) !== null) {
      enqueueSentence(m[0])
      lastIndex = re.lastIndex
    }
    bufferRef.current = buf.slice(lastIndex)
  }, [enqueueSentence])

  const feed = useCallback((delta) => {
    if (!delta) return
    bufferRef.current += delta
    flushCompleteSentences()
  }, [flushCompleteSentences])

  const finish = useCallback(() => {
    const rest = bufferRef.current.trim()
    bufferRef.current = ''
    if (rest) enqueueSentence(rest)
    finishedRef.current = true
    wake()
    if (!pumpingRef.current && queueRef.current.length > 0) pump(genRef.current)
  }, [enqueueSentence, pump])

  const reset = useCallback(() => {
    genRef.current++            // invalide tout travail async en cours
    finishedRef.current = false
    bufferRef.current = ''
    queueRef.current = []
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    wake()                      // débloque une boucle en attente → elle sort
    setSpeaking(false)
  }, [])

  useEffect(() => reset, [reset]) // stop à l'unmount

  // Nouveau tour : on remet finishedRef à false pour la prochaine session.
  const begin = useCallback(() => {
    reset()
    finishedRef.current = false
  }, [reset])

  return { speaking, feed, finish, reset, begin }
}
