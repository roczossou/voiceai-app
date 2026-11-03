import { useState, useRef, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useConversation } from '../hooks/useConversations.js'
import { useChat } from '../hooks/useChat.js'
import { Button } from '../components/ui/Button.jsx'
import { Card, CardBody } from '../components/ui/Card.jsx'

export function ConversationDetail() {
  const { id } = useParams()
  const { data: conv, isLoading } = useConversation(id)
  const { sendMessage, streaming, streamingText, error } = useChat(id)
  const [input, setInput] = useState('')
  const bottomRef = useRef(null)

  // Auto-scroll à chaque nouveau token ou message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [conv?.messages, streamingText])

  if (isLoading) return <div className="p-8 text-gray-500">Chargement…</div>
  if (!conv) return <div className="p-8 text-gray-500">Conversation introuvable.</div>

  const send = async (e) => {
    e.preventDefault()
    if (!input.trim() || streaming) return
    const msg = input.trim()
    setInput('')
    await sendMessage(msg)
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(e)
    }
  }

  return (
    <div className="flex flex-col h-screen p-8">
      {/* Header */}
      <div className="mb-6 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
          <Link to="/conversations" className="hover:text-indigo-600">Conversations</Link>
          <span>/</span>
          <span className="text-gray-900 font-mono text-xs">{conv.sessionId}</span>
        </div>
        <p className="text-xs text-gray-400">{conv.messages.length} messages</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0">
        {conv.messages.length === 0 && !streaming ? (
          <Card>
            <CardBody className="text-center py-10 text-gray-500 text-sm">
              Conversation vide. Envoyez un message pour commencer.
            </CardBody>
          </Card>
        ) : (
          <>
            {conv.messages.map(msg => (
              <Message key={msg.id} msg={msg} />
            ))}

            {/* Bulle en cours de streaming */}
            {streaming && (
              <div className="flex justify-start">
                <div className="max-w-lg px-4 py-2.5 rounded-2xl rounded-bl-sm text-sm bg-white border border-gray-200 text-gray-900 shadow-sm">
                  {streamingText
                    ? streamingText
                    : <span className="flex gap-1 items-center text-gray-400">
                        <span className="animate-bounce" style={{ animationDelay: '0ms' }}>●</span>
                        <span className="animate-bounce" style={{ animationDelay: '150ms' }}>●</span>
                        <span className="animate-bounce" style={{ animationDelay: '300ms' }}>●</span>
                      </span>
                  }
                </div>
              </div>
            )}
          </>
        )}

        {error && (
          <div className="flex justify-center">
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-4 py-2 rounded-lg max-w-lg text-center">
              ⚠ {error}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form onSubmit={send} className="flex gap-2 flex-shrink-0">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Votre message… (Entrée pour envoyer)"
          rows={1}
          disabled={streaming}
          className="flex-1 px-4 py-2.5 text-sm border border-gray-300 rounded-xl outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none disabled:opacity-50"
        />
        <Button type="submit" disabled={streaming || !input.trim()}>
          {streaming ? 'En cours…' : 'Envoyer'}
        </Button>
      </form>
    </div>
  )
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-800 text-xs italic px-4 py-2 rounded-lg max-w-lg text-center">
          {msg.content}
        </div>
      </div>
    )
  }

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-lg px-4 py-2.5 rounded-2xl text-sm ${
        isUser
          ? 'bg-indigo-600 text-white rounded-br-sm'
          : 'bg-white border border-gray-200 text-gray-900 rounded-bl-sm shadow-sm'
      }`}>
        <p className="whitespace-pre-wrap">{msg.content}</p>
        {msg.tokens && (
          <span className="text-xs opacity-40 mt-1 block text-right">{msg.tokens} tokens</span>
        )}
      </div>
    </div>
  )
}
