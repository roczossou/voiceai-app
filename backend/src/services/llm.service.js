import { GoogleGenAI } from '@google/genai'
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './db.js'
import { decrypt } from './crypto.js'
import { nowInTimeZone } from './timezone.util.js'
import { checkAvailability, bookAppointment } from './appointment.service.js'

// ── Clés API — chargées depuis la DB (table LlmApiKey, gérée par
// l'admin via /api/v1/llm-keys), cache 5 min. Générique par `provider` :
// gemini et anthropic partagent le même mécanisme de cache + repli sur
// variables d'env si la DB ne contient aucune clé active pour ce provider.
const KEY_CACHE_TTL = 5 * 60 * 1000

const _keyCache = new Map() // provider → { keys, expiry }
let keyIdx           = 0    // rotation Gemini (cascade modèles × clés)
let anthropicKeyIdx  = 0    // rotation Anthropic (round-robin simple)

export function invalidateKeyCache() {
  _keyCache.clear()
  keyIdx = 0
  anthropicKeyIdx = 0
}

async function loadKeysForProvider(provider, envFallbacks) {
  const cached = _keyCache.get(provider)
  if (cached && Date.now() < cached.expiry) return cached.keys

  const rows = await prisma.llmApiKey.findMany({
    where:   { provider, isActive: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })

  const keys = rows.length > 0
    ? rows.map(r => decrypt(r.key))
    : envFallbacks.filter(Boolean) // repli sur env vars si aucune clé en DB

  _keyCache.set(provider, { keys, expiry: Date.now() + KEY_CACHE_TTL })
  return keys
}

export async function loadKeys() {
  const keys = await loadKeysForProvider('gemini', [
    process.env.GEMINI_API_KEY,
    process.env.GEMINI_API_KEY_2,
    process.env.GEMINI_API_KEY_3,
  ])
  if (keys.length === 0) throw new Error('Aucune clé Gemini disponible (DB vide et env vars absentes)')
  keyIdx = Math.min(keyIdx, keys.length - 1) // garde l'index valide après rechargement
  return keys
}

async function loadAnthropicKeys() {
  return loadKeysForProvider('anthropic', [process.env.ANTHROPIC_API_KEY])
}

// ── Modèles par ordre de préférence ──────────────────────
const MODELS = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.1-flash-lite',
]

// ── Cooldown des modèles rate-limités ────────────────────
// Un appel à un modèle 429 met ~2 s à revenir. Sans mémoire, on repaie ce
// coût à CHAQUE requête pour chaque modèle saturé avant d'atteindre celui qui
// répond. On mémorise donc les modèles 429 et on les saute pendant un court
// cooldown : seule la 1ʳᵉ requête paie la découverte, les suivantes vont
// droit au modèle disponible. Le quota Gemini free-tier étant souvent par
// minute, 60 s est un bon défaut.
const MODEL_COOLDOWN_MS = 60_000
const _modelCooldownUntil = new Map() // model → timestamp d'expiration

function availableModels(models) {
  const now = Date.now()
  const ready = models.filter(m => (_modelCooldownUntil.get(m) ?? 0) <= now)
  // Si tous sont en cooldown, on retente quand même l'ordre complet (le
  // cooldown est une optimisation, pas un blocage dur).
  return ready.length > 0 ? ready : models
}

// ── Retry config ─────────────────────────────────────────
// 3 tentatives par modèle, puis modèle suivant.
// Quand tous les modèles sont épuisés → rotation de clé API, on recommence.
const ATTEMPTS_PER_MODEL = 3
const RETRY_DELAYS = [300, 600, 1200] // ms entre tentatives sur le même modèle

// ── Bascule Anthropic — dernier recours si Gemini est épuisé ─
// Utilisée uniquement quand toutes les clés/modèles Gemini ont échoué sur
// des erreurs récupérables (429/503) sur l'appel INITIAL du tour. Une fois
// la bascule déclenchée, tout le tour (y compris les rounds d'outils)
// continue sur Anthropic — on ne mélange jamais les deux fournisseurs dans
// une même boucle de function-calling.
//
// Les clés Anthropic viennent de la même table LlmApiKey (provider:
// 'anthropic'), gérable depuis l'admin. Rotation round-robin simple entre
// les clés actives à chaque nouvelle bascule — pas de retry multi-clé en
// cours de stream (contrairement à Gemini) : un 429 Anthropic ici propage
// l'erreur telle quelle, ce mécanisme est déjà un filet de secours.
const ANTHROPIC_FALLBACK_MODEL = 'claude-opus-4-8'

function nextAnthropicKey(keys) {
  const key = keys[anthropicKeyIdx % keys.length]
  anthropicKeyIdx = (anthropicKeyIdx + 1) % keys.length
  return key
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── SSE : ouverture + réglages anti-buffering ────────────
// Sans ça, les tokens peuvent arriver groupés à la fin plutôt qu'au fil de
// l'eau : Nagle (TCP) coalesce les petits paquets, et certains proxies
// bufferisent. setNoDelay + X-Accel-Buffering forcent l'envoi immédiat de
// chaque token → affichage live + TTS incrémental réellement incrémental.
function openSSE(res) {
  if (!res) return // tour "fantôme" (réponse persistée sans SSE, file d'attente)
  res.setHeader('Content-Type',      'text/event-stream')
  res.setHeader('Cache-Control',     'no-cache')
  res.setHeader('Connection',        'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // désactive le buffering proxy (nginx…)
  res.socket?.setNoDelay(true)             // désactive Nagle → chaque token part tout de suite
  res.flushHeaders()
}

function isRetryable(err) {
  return (
    Number(err.status) === 429 ||
    Number(err.status) === 503 ||
    /RESOURCE_EXHAUSTED|UNAVAILABLE|overloaded/i.test(err.message ?? '')
  )
}

// 429 = quota épuisé : réessayer le MÊME modèle 300 ms plus tard est inutile
// (le quota ne se libère pas si vite). On distingue donc le rate-limit (→ on
// passe vite au modèle/clé suivant) de la surcharge transitoire 503 (→ retry
// avec backoff sur le même modèle vaut le coup).
function isRateLimit(err) {
  return Number(err.status) === 429 || /RESOURCE_EXHAUSTED|\b429\b/.test(err.message ?? '')
}

// ── Blocs de prompt généraux ─────────────────────────────

const VOICE_RULES = `## Règles de format — synthèse vocale
Ce texte sera lu à voix haute. Ces règles sont absolues et non négociables.
- Texte brut uniquement : zéro markdown, zéro **, zéro *, zéro #, zéro tiret de liste, zéro numérotation.
- Phrases courtes et simples. Évite les subordonnées empilées.
- Pas de listes, pas d'énumérations, pas de tableaux.
- Jamais de formules creuses en début de réponse ("Bien sûr !", "Absolument !", "Certainement !", "Je comprends votre question...").
- Aller directement à l'essentiel dès le premier mot.
- Langage oral naturel : parle comme à quelqu'un face à face, pas comme un email.
- Si tu ne sais pas, dis-le simplement en une phrase. Ne fabrique pas d'information.

## Conduite face aux propos hostiles ou insultants
- Si le client est agressif, injurieux ou provocateur, garde un ton calme et professionnel, sans jamais répondre sur le même registre ni te justifier.
- Ne répète pas les insultes. Réponds en une phrase courte qui recentre sur l'aide possible, par exemple : "Je reste disponible si vous avez une question concrète." puis propose un sujet utile.
- Ne laisse jamais l'insulte faire dévier la conversation : reviens toujours à ce que tu peux faire pour l'entreprise.`

const CONDUCT_RULES = `## Conduite générale
- Si le client est agressif, injurieux ou provocateur : reste calme et professionnel, ne réponds jamais sur le même registre, ne répète pas les insultes.
- Recentre la conversation en une phrase courte sur l'aide concrète que tu peux apporter, puis reviens à un sujet utile pour l'entreprise.
- Ne te laisse jamais entraîner dans un échange conflictuel ; ta priorité est d'être utile, pas de "gagner" la discussion.`

const PERSONALITY_TONE = {
  professional: 'Ton professionnel, courtois et efficace. Vocabulaire précis et accessible. Vouvoiement.',
  friendly:     'Ton chaleureux et bienveillant. Langage naturel et proche. Tutoiement possible.',
  formal:       'Ton formel et rigoureux. Vouvoiement strict. Formulations soignées.',
  casual:       'Ton décontracté et direct. Langage simple, naturel, sans fioritures.',
}

const SENSITIVITY_LENGTH = {
  low:    'Longueur : développe naturellement, autant que le sujet l\'exige (plusieurs paragraphes si utile).',
  medium: 'Longueur : quelques phrases bien construites, ni télégraphique ni interminable.',
  high:   'Longueur : une à deux phrases, sois direct et immédiatement utile.',
}

// Règle de verbosité adaptative : une demande explicite du client ("explique en
// détail", "sois exhaustif", "donne-moi toutes les étapes"…) prime TOUJOURS sur
// le réglage de brièveté — sinon le modèle tronque à 2-3 phrases même quand on
// lui demande d'être complet.
const VERBOSITY_RULE = `## Verbosité adaptative
- Par défaut, adapte la longueur à la question : réponse courte si la question est simple.
- MAIS si le client demande explicitement d'être complet ("explique en détail", "sois exhaustif", "toutes les étapes", "ne laisse rien de côté", "détaille"…) : développe VRAIMENT, structure ta réponse en plusieurs points/paragraphes, donne les exemples et les nuances. La demande d'exhaustivité du client prime toujours sur ta tendance à être bref.`


/**
 * Le RDV n'est proposé par l'IA que si l'entreprise a réellement configuré
 * des horaires d'ouverture et au moins un service applicable — auto-activation,
 * pas de bascule séparée à gérer.
 */
function formatDurationLabel(totalMinutes) {
  if (totalMinutes % 10080 === 0) return `${totalMinutes / 10080} semaine(s)`
  if (totalMinutes % 1440 === 0) return `${totalMinutes / 1440} jour(s)`
  if (totalMinutes % 60 === 0) return `${totalMinutes / 60} heure(s)`
  return `${totalMinutes} min`
}

export function shouldEnableAppointmentTools(tenant, services) {
  return Boolean(tenant?.openingHours) && (services?.length ?? 0) > 0
}

/**
 * Construit le prompt système complet à partir du tenant, de l'agent et des
 * services applicables. Remplace l'ancien `agent.config.systemPrompt` rédigé
 * à la main : tout est assemblé automatiquement à partir des infos structurées.
 *
 * @param {object} params
 * @param {object} params.agent               - agent Prisma complet (avec remarks, config)
 * @param {object} params.tenant               - tenant Prisma complet (profil entreprise)
 * @param {Array}  params.services             - services applicables à cet agent
 * @param {string|null} params.conversationSummary - résumé compacté (optionnel)
 */
export function buildSystemPrompt({ agent = {}, tenant = {}, services = [], conversationSummary = null }) {
  const name        = agent.name ?? 'Assistant'
  const description = agent.description ?? ''
  const remarks     = agent.remarks ?? ''
  const {
    personality             = 'professional',
    interruptionSensitivity = 'medium',
    greetingMessage         = '',
  } = agent.config ?? {}
  const greeting = greetingMessage ?? ''

  const companyName = tenant.name ?? 'l\'entreprise'
  const identityLines = [
    `Tu es ${name}${description ? `, ${description}` : ''}, l'assistant virtuel de ${companyName}.`,
    `Tu représentes ${companyName} : tu parles AU NOM de l'entreprise, à la première personne du pluriel ("nous", "notre", "nos"). N'emploie jamais "je" pour désigner l'entreprise ou ses services. Exemples : "Nous proposons…", "Nos horaires sont…", "Nous pouvons vous recevoir…". Désigne l'entreprise par son nom (${companyName}) plutôt que par "l'entreprise" quand c'est naturel.`,
  ]
  if (greeting.trim()) {
    identityLines.push(`Ton message d'accueil est : "${greeting.trim()}"`)
  }
  const identityBlock = identityLines.join('\n')

  const companyLines = []
  if (tenant.description) companyLines.push(tenant.description)
  if (tenant.address) companyLines.push(`Adresse : ${tenant.address}`)
  if (tenant.contactPhone) companyLines.push(`Téléphone de l'entreprise : ${tenant.contactPhone}`)
  const companyBlock = companyLines.length
    ? ['## Informations sur l\'entreprise', ...companyLines].join('\n')
    : null

  const servicesBlock = services.length
    ? [
        '## Services proposés',
        'Utilise l\'id exact indiqué entre parenthèses comme valeur de serviceId dans les outils de rendez-vous.',
        ...services.map(s => `- ${s.name}${s.description ? ` : ${s.description}` : ''} (durée : ${formatDurationLabel(s.durationMinutes)}, id: ${s.id})`),
      ].join('\n')
    : null

  const remarksBlock = remarks.trim()
    ? ['## Remarques spécifiques à prendre en compte', remarks.trim()].join('\n')
    : null

  const toneBlock = [
    '## Ton et longueur de réponse',
    PERSONALITY_TONE[personality]               ?? PERSONALITY_TONE.professional,
    SENSITIVITY_LENGTH[interruptionSensitivity] ?? SENSITIVITY_LENGTH.medium,
  ].join('\n')

  const toolsEnabled = shouldEnableAppointmentTools(tenant, services)
  const appointmentBlock = toolsEnabled
    ? [
        '## Prise de rendez-vous',
        'Tu peux vérifier les disponibilités et prendre un rendez-vous directement grâce aux outils check_availability et book_appointment.',
        `Nous sommes actuellement le ${nowInTimeZone(tenant.timezone).label} (fuseau horaire ${tenant.timezone}).`,
        'Utilise check_availability avant de proposer un créneau. N\'appelle book_appointment que lorsque le client a confirmé un créneau précis et donné son nom et un moyen de le contacter (téléphone ou email).',
        'Si un créneau n\'est pas disponible, propose au client les alternatives renvoyées par l\'outil.',
      ].join('\n')
    : [
        '## Prise de rendez-vous',
        'Tu n\'as accès à aucun outil de réservation : la fonctionnalité n\'est pas encore configurée pour cette entreprise.',
        'Si un client demande un rendez-vous, ne prétends jamais avoir créé, confirmé ou transmis quoi que ce soit. Dis clairement que tu ne peux pas encore réserver directement, et invite-le à contacter l\'entreprise par un autre moyen.',
      ].join('\n')

  const summaryBlock = conversationSummary
    ? `## Contexte de la conversation précédente\n${conversationSummary}`
    : null

  return [identityBlock, companyBlock, servicesBlock, remarksBlock, toneBlock, appointmentBlock, summaryBlock, VERBOSITY_RULE, CONDUCT_RULES, VOICE_RULES]
    .filter(Boolean)
    .join('\n\n')
}

// ── Function-calling — prise de rendez-vous ──────────────

const MAX_TOOL_ROUNDS = 3

export const APPOINTMENT_TOOLS = [
  {
    name: 'check_availability',
    description: "Vérifie si un créneau de rendez-vous est disponible (horaires d'ouverture + absence de conflit), sans le réserver.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        serviceId: { type: 'string', description: 'Identifiant du service demandé, si applicable.' },
        date:      { type: 'string', description: 'Date demandée au format YYYY-MM-DD.' },
        time:      { type: 'string', description: 'Heure demandée au format HH:mm (24h).' },
      },
      required: ['date', 'time'],
    },
  },
  {
    name: 'book_appointment',
    description: "Réserve définitivement un rendez-vous dans le système, à n'appeler qu'après confirmation du client sur un créneau précis.",
    parametersJsonSchema: {
      type: 'object',
      properties: {
        serviceId:       { type: 'string', description: 'Identifiant du service demandé, si applicable.' },
        date:            { type: 'string', description: 'Date au format YYYY-MM-DD.' },
        time:            { type: 'string', description: 'Heure au format HH:mm (24h).' },
        customerName:    { type: 'string', description: 'Nom du client.' },
        customerContact: { type: 'string', description: 'Téléphone ou email du client.' },
        notes:           { type: 'string', description: 'Remarque optionnelle sur la demande.' },
      },
      required: ['date', 'time', 'customerName', 'customerContact'],
    },
  },
]

function formatDateTimeFR(date, timeZone) {
  return new Intl.DateTimeFormat('fr-FR', { timeZone, dateStyle: 'full', timeStyle: 'short' }).format(date)
}

export async function runToolCall(name, args, toolContext) {
  const { tenant, agentId, conversationId } = toolContext
  try {
    if (name === 'check_availability') {
      const result = await checkAvailability({ tenant, agentId, serviceId: args.serviceId, date: args.date, time: args.time })
      if (result.available) return { available: true }
      return {
        available: false,
        reason: result.reason,
        alternatives: (result.alternatives ?? []).map(s => formatDateTimeFR(s.startsAt, tenant.timezone)),
      }
    }

    if (name === 'book_appointment') {
      const result = await bookAppointment({
        tenant, agentId, conversationId,
        serviceId: args.serviceId, date: args.date, time: args.time,
        customerName: args.customerName, customerContact: args.customerContact, notes: args.notes,
      })
      if (result.booked) {
        return { booked: true, confirmedFor: formatDateTimeFR(result.appointment.startsAt, tenant.timezone) }
      }
      return {
        booked: false,
        reason: result.reason,
        alternatives: (result.alternatives ?? []).map(s => formatDateTimeFR(s.startsAt, tenant.timezone)),
      }
    }

    return { error: `Fonction inconnue : ${name}` }
  } catch (err) {
    console.error(`[Tool] Erreur ${name} :`, err.message)
    return { error: 'Une erreur technique est survenue, réessaie plus tard ou propose au client de rappeler directement.' }
  }
}

// ── Bascule Anthropic — schéma d'outils + conversion d'historique ─
// Même fonctions (check_availability / book_appointment) que côté Gemini,
// exposées au format tool use d'Anthropic (input_schema plutôt que
// parametersJsonSchema).
const ANTHROPIC_APPOINTMENT_TOOLS = APPOINTMENT_TOOLS.map(t => ({
  name: t.name,
  description: t.description,
  input_schema: t.parametersJsonSchema,
}))

function toAnthropicMessages(history, userMessage) {
  const messages = history.map(h => ({
    role: h.role === 'model' ? 'assistant' : 'user',
    content: h.parts.map(p => p.text).join(''),
  }))
  messages.push({ role: 'user', content: userMessage })
  return messages
}

// ── Stream Anthropic — dernier recours quand Gemini est épuisé ──
// Reproduit le contrat de streamGemini (mêmes événements SSE, même retour
// { fullText, inputTokens, outputTokens }) mais avec la boucle de
// function-calling au format Anthropic — les deux boucles ne peuvent pas
// être fusionnées, les schémas d'outils et le format des messages diffèrent.
async function streamAnthropicFallback({ systemPrompt, history, userMessage, res, toolContext }) {
  const anthropicKeys = await loadAnthropicKeys()
  if (anthropicKeys.length === 0) {
    throw new Error('Bascule Anthropic impossible : aucune clé Anthropic disponible (DB vide et ANTHROPIC_API_KEY absente)')
  }
  const anthropic = new Anthropic({ apiKey: nextAnthropicKey(anthropicKeys) })

  const messages = toAnthropicMessages(history, userMessage)
  const tools = toolContext ? ANTHROPIC_APPOINTMENT_TOOLS : undefined

  openSSE(res)

  let fullText     = ''
  let inputTokens  = 0
  let outputTokens = 0
  let round = 0

  while (true) {
    const stream = anthropic.messages.stream({
      model: ANTHROPIC_FALLBACK_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      tools,
    })

    stream.on('text', delta => {
      fullText += delta
      res?.write(`event: token\ndata: ${JSON.stringify({ text: delta })}\n\n`)
    })

    const message = await stream.finalMessage()
    inputTokens  += message.usage.input_tokens
    outputTokens += message.usage.output_tokens

    if (message.stop_reason !== 'tool_use') break

    if (!toolContext || round >= MAX_TOOL_ROUNDS) {
      const fallbackText = 'Désolé, je ne parviens pas à finaliser cette action pour le moment. Un membre de l\'équipe reviendra vers vous.'
      fullText += fallbackText
      res?.write(`event: token\ndata: ${JSON.stringify({ text: fallbackText })}\n\n`)
      console.warn(`[LLM] Plafond de ${MAX_TOOL_ROUNDS} rounds d'outils atteint (bascule Anthropic)`)
      break
    }
    round++

    messages.push({ role: 'assistant', content: message.content })

    const toolUseBlocks = message.content.filter(b => b.type === 'tool_use')
    const resultBlocks = []
    for (const block of toolUseBlocks) {
      const result = await runToolCall(block.name, block.input ?? {}, toolContext)
      resultBlocks.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(result) })
    }
    messages.push({ role: 'user', content: resultBlocks })
  }

  return { fullText, inputTokens, outputTokens, usedTools: true }
}

// ── Génération avec retry par modèle + rotation de clé ───
//
// Stratégie :
//   Pour chaque clé API :
//     Pour chaque modèle de `models` :
//       Jusqu'à ATTEMPTS_PER_MODEL tentatives (erreurs récupérables)
//     Si tous les modèles échouent → clé suivante
//   Si toutes les clés échouent → throw
//
// Factorisé pour être réutilisé à la fois pour l'appel initial (cascade sur
// tous les MODELS) et pour les relances après functionCall (cascade limitée
// au modèle déjà actif — voir l'appel dans streamGemini pour le pourquoi).
async function generateWithRetry({ contents, systemPrompt, tools, keys, models }) {
  let streamResult = null
  let lastError    = null
  let usedModel    = null

  outer:
  for (let k = 0; k < keys.length; k++) {
    const ai = new GoogleGenAI({ apiKey: keys[keyIdx] })

    for (const model of availableModels(models)) {
      for (let attempt = 0; attempt < ATTEMPTS_PER_MODEL; attempt++) {
        try {
          streamResult = await ai.models.generateContentStream({
            model,
            // thinkingBudget: 0 → désactive la phase de "réflexion" des
            // modèles Gemini 2.5/3 flash. Sinon le modèle réfléchit d'abord
            // (aucun token émis pendant 1-2 s) puis crache la réponse d'un
            // bloc → l'affichage et le TTS ne peuvent pas être incrémentaux.
            // Pour du vocal, la latence + le streaming priment sur le gain
            // marginal du thinking.
            config: { systemInstruction: systemPrompt, tools, thinkingConfig: { thinkingBudget: 0 } },
            contents,
          })
          usedModel = model
          break outer // succès
        } catch (err) {
          lastError = err

          if (!isRetryable(err)) throw err // auth, quota définitif, contenu refusé…

          // 429 → on ne s'acharne pas sur ce modèle : on le met en cooldown
          // et on passe au suivant tout de suite (les requêtes suivantes le
          // sauteront pendant MODEL_COOLDOWN_MS).
          if (isRateLimit(err)) {
            _modelCooldownUntil.set(model, Date.now() + MODEL_COOLDOWN_MS)
            console.warn(`[LLM] ${model} rate-limited (429, clé ${keyIdx + 1}) → cooldown ${MODEL_COOLDOWN_MS / 1000}s, modèle suivant`)
            break
          }

          console.warn(
            `[LLM] ${model} tentative ${attempt + 1}/${ATTEMPTS_PER_MODEL} (clé ${keyIdx + 1}) — ${String(err.message).slice(0, 80)}`
          )

          if (attempt < ATTEMPTS_PER_MODEL - 1) {
            await sleep(RETRY_DELAYS[attempt])
          }
        }
      }

      console.warn(`[LLM] ${model} abandonné → modèle suivant`)
    }

    // Tous les modèles ont échoué sur cette clé → rotation
    if (k < keys.length - 1) {
      keyIdx = (keyIdx + 1) % keys.length
      console.warn(`[LLM] Tous les modèles indisponibles → rotation vers clé ${keyIdx + 1}/${keys.length}`)
    }
  }

  if (!streamResult) throw lastError

  return { streamResult, model: usedModel }
}

// ── Stream Gemini ─────────────────────────────────────────
//
// Les retries de l'appel initial ont lieu AVANT l'ouverture du SSE pour
// éviter d'envoyer des headers HTTP prématurément.
//
// Si `toolContext` est fourni, les outils de prise de RDV sont attachés et,
// quand le modèle émet un functionCall, on l'exécute localement puis on
// relance generateContentStream avec la functionResponse injectée — jusqu'à
// MAX_TOOL_ROUNDS, pour éviter une boucle infinie. Ces relances passent par
// generateWithRetry elles aussi (protection contre les 429/503 en cours de
// conversation), mais restreintes au modèle qui a réussi le premier appel :
// un functionCall porte un thoughtSignature propre à ce modèle, le rejouer
// sur un modèle différent est rejeté par l'API (400 INVALID_ARGUMENT).
// La rotation de clé, elle, reste possible (une clé n'affecte pas le modèle).
//
// Si Gemini échoue sur l'appel INITIAL après épuisement de toutes les clés
// et tous les modèles pour des erreurs récupérables (429/503 en rafale),
// on bascule tout le tour sur Anthropic (streamAnthropicFallback) plutôt que
// de faire échouer la requête — voir ANTHROPIC_FALLBACK_MODEL plus haut.
export async function streamGemini({ systemPrompt, history, userMessage, res, toolContext = null }) {
  const contents = [
    ...history,
    { role: 'user', parts: [{ text: userMessage }] },
  ]

  const tools = toolContext ? [{ functionDeclarations: APPOINTMENT_TOOLS }] : undefined

  const KEYS = await loadKeys()

  let streamResult, activeModel
  try {
    ;({ streamResult, model: activeModel } = await generateWithRetry({
      contents, systemPrompt, tools, keys: KEYS, models: MODELS,
    }))
  } catch (geminiErr) {
    if (!isRetryable(geminiErr)) throw geminiErr // auth, quota définitif, contenu refusé… pas la peine de basculer

    console.warn(`[LLM] Gemini épuisé (clés + modèles) → bascule vers Anthropic (${ANTHROPIC_FALLBACK_MODEL})`)
    try {
      return await streamAnthropicFallback({ systemPrompt, history, userMessage, res, toolContext })
    } catch (fallbackErr) {
      console.error(`[LLM] Bascule Anthropic également en échec : ${fallbackErr.message}`)
      throw geminiErr
    }
  }

  // ── Ouvrir SSE seulement après avoir obtenu le stream ───
  openSSE(res)

  let fullText     = ''
  let inputTokens  = 0
  let outputTokens = 0
  let usedTools    = false
  let currentStream = streamResult
  let round = 0

  while (true) {
    // On garde les Part bruts (pas juste chunk.functionCalls) car un modèle
    // "thinking" attache un thoughtSignature au Part — le renvoyer tel quel
    // au tour suivant est obligatoire, sinon l'API rejette l'appel (400
    // INVALID_ARGUMENT: "missing a thought_signature").
    const pendingCallParts = []

    for await (const chunk of currentStream) {
      const text = chunk.text ?? ''
      if (text) {
        fullText += text
        res?.write(`event: token\ndata: ${JSON.stringify({ text })}\n\n`)
      }
      const parts = chunk.candidates?.[0]?.content?.parts ?? []
      for (const part of parts) {
        if (part.functionCall) pendingCallParts.push(part)
      }
      if (chunk.usageMetadata) {
        inputTokens  = chunk.usageMetadata.promptTokenCount     ?? inputTokens
        outputTokens = chunk.usageMetadata.candidatesTokenCount ?? outputTokens
      }
    }

    if (pendingCallParts.length === 0) break

    usedTools = true
    if (!toolContext || round >= MAX_TOOL_ROUNDS) {
      const fallback = 'Désolé, je ne parviens pas à finaliser cette action pour le moment. Un membre de l\'équipe reviendra vers vous.'
      fullText += fallback
      res?.write(`event: token\ndata: ${JSON.stringify({ text: fallback })}\n\n`)
      console.warn(`[LLM] Plafond de ${MAX_TOOL_ROUNDS} rounds d'outils atteint ou toolContext absent`)
      break
    }

    round++

    contents.push({ role: 'model', parts: pendingCallParts })

    const responseParts = []
    for (const part of pendingCallParts) {
      const result = await runToolCall(part.functionCall.name, part.functionCall.args ?? {}, toolContext)
      responseParts.push({ functionResponse: { name: part.functionCall.name, response: result } })
    }
    contents.push({ role: 'user', parts: responseParts })

    ;({ streamResult: currentStream } = await generateWithRetry({
      contents, systemPrompt, tools, keys: KEYS, models: [activeModel],
    }))
  }

  return { fullText, inputTokens, outputTokens, usedTools }
}
