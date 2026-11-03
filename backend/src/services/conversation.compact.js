import { GoogleGenAI } from '@google/genai'
import { prisma } from './db.js'

const COMPACT_THRESHOLD = 15_000  // tokens cumulés avant compactage
const KEEP_RECENT       = 6       // nb de messages récents à toujours conserver intacts
const SUMMARY_MARKER    = '[Résumé]'

// Utiliser le modèle léger pour le compactage (économise les tokens)
function getAI() {
  return new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
}

/**
 * Vérifie si la conversation dépasse le seuil de tokens et,
 * si oui, résume les anciens messages et les remplace par un message [Résumé].
 * Appelé en fire-and-forget depuis le controller.
 *
 * @param {string} conversationId
 */
export async function maybeCompact(conversationId) {
  // ── 1. Vérifier le total de tokens ──────────────────────
  const agg = await prisma.message.aggregate({
    where: { conversationId },
    _sum:  { tokens: true },
    _count: true,
  })

  const totalTokens = agg._sum.tokens ?? 0
  const totalMsgs   = agg._count

  if (totalTokens < COMPACT_THRESHOLD) return
  if (totalMsgs <= KEEP_RECENT + 1)   return // pas assez de messages à compacter

  // ── 2. Récupérer tous les messages ──────────────────────
  const messages = await prisma.message.findMany({
    where:   { conversationId },
    orderBy: { createdAt: 'asc' },
  })

  // Séparer : à compacter / à conserver
  const toSummarize = messages.slice(0, -KEEP_RECENT).filter(m => m.role !== 'system')
  const toKeep      = messages.slice(-KEEP_RECENT)

  if (toSummarize.length < 2) return

  // ── 3. Construire le texte à résumer ────────────────────
  const historyText = toSummarize
    .map(m => `${m.role === 'user' ? 'Utilisateur' : 'Assistant'} : ${m.content}`)
    .join('\n\n')

  const summarizePrompt =
    `Tu es chargé de résumer une conversation entre un utilisateur et un assistant vocal. ` +
    `Produis un résumé factuel en texte brut, sans liste ni markdown, en français. ` +
    `Conserve les faits importants, les décisions prises et le contexte nécessaire ` +
    `pour poursuivre la conversation de façon cohérente. Sois concis.\n\n` +
    `Conversation à résumer :\n${historyText}`

  // ── 4. Appel Gemini (non-streaming, modèle léger) ───────
  let summaryText = ''
  try {
    const result = await getAI().models.generateContent({
      model:    'gemini-2.5-flash-lite',  // modèle léger pour le compactage
      contents: [{ role: 'user', parts: [{ text: summarizePrompt }] }],
    })
    summaryText = result.text?.trim() ?? ''
  } catch (err) {
    console.error('[Compact] Erreur lors de la génération du résumé :', err.message)
    return
  }

  if (!summaryText) return

  // ── 5. Transaction : supprimer les anciens + insérer le résumé ──
  const summaryContent = `${SUMMARY_MARKER}\n${summaryText}`
  const oldIds = toSummarize.map(m => m.id)

  // Insérer avant le premier message conservé pour respecter l'ordre chronologique
  const insertBefore = toKeep[0]?.createdAt ?? new Date()
  const summaryCreatedAt = new Date(insertBefore.getTime() - 1)

  await prisma.$transaction([
    prisma.message.deleteMany({ where: { id: { in: oldIds } } }),
    prisma.message.create({
      data: {
        conversationId,
        role:      'system',
        content:   summaryContent,
        tokens:    0,
        createdAt: summaryCreatedAt,
      },
    }),
  ])

  console.info(
    `[Compact] conv ${conversationId} : ${toSummarize.length} messages → 1 résumé` +
    ` (${totalTokens} tokens → reset)`
  )
}

/**
 * Extrait le texte du résumé d'une liste de messages (si présent).
 * Retourne null si aucun résumé n'existe.
 *
 * @param {Array} messages - liste de messages Prisma
 * @returns {string|null}
 */
export function extractSummary(messages) {
  const summaryMsg = messages.find(
    m => m.role === 'system' && m.content.startsWith(SUMMARY_MARKER)
  )
  if (!summaryMsg) return null
  return summaryMsg.content.slice(SUMMARY_MARKER.length).trim()
}
