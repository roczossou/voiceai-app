import { transcribeAudio } from '../services/stt.service.js'

export async function transcribeHandler(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ title: 'Fichier audio manquant', status: 400 })
    }

    const text = await transcribeAudio(req.file.buffer, req.file.mimetype)

    if (!text) {
      return res.status(422).json({ title: 'Aucun texte détecté dans l\'audio', status: 422 })
    }

    res.json({ text })
  } catch (err) {
    next(err)
  }
}
