const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('access_token')}` })

export async function transcribeAudio(audioBlob) {
  const formData = new FormData()
  formData.append('audio', audioBlob, 'audio.webm')

  const response = await fetch('/api/v1/voice/transcribe', {
    method: 'POST',
    headers: authHeader(),
    body: formData,
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.title || 'Erreur transcription')
  }

  const data = await response.json()
  return data.text
}

/**
 * Synthétise le texte en audio MP3 via Google Cloud TTS.
 * Retourne un Blob audio prêt à jouer.
 */
export async function synthesizeSpeech(text, voice) {
  const response = await fetch('/api/v1/voice/tts', {
    method: 'POST',
    headers: { ...authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.title || 'Erreur TTS')
  }

  return response.blob()
}
