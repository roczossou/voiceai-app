import { synthesizeSpeech } from '../services/tts.service.js'

export async function ttsHandler(req, res, next) {
  try {
    const { text, voice } = req.body
    if (!text?.trim()) {
      return res.status(400).json({ title: 'text est requis', status: 400 })
    }
    if (text.length > 5000) {
      return res.status(400).json({ title: 'Texte trop long (max 5000 chars)', status: 400 })
    }

    const audioBuffer = await synthesizeSpeech(text.trim(), voice)

    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader('Content-Length', audioBuffer.length)
    res.send(audioBuffer)
  } catch (err) {
    next(err)
  }
}
