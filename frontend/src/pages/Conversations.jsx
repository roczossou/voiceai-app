import { Link } from 'react-router-dom'
import { useAgents } from '../hooks/useAgents.js'
import { useConversations } from '../hooks/useConversations.js'
import { Card, CardBody } from '../components/ui/Card.jsx'

export function Conversations() {
  const { data: agents = [] } = useAgents()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Conversations</h1>
        <p className="text-gray-500 mt-1">Toutes les conversations par agent.</p>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardBody className="text-center py-10 text-gray-500 text-sm">
            Aucun agent. <Link to="/agents" className="text-indigo-600 hover:underline">Créez-en un</Link> pour voir des conversations.
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-6">
          {agents.map(agent => (
            <AgentConversations key={agent.id} agent={agent} />
          ))}
        </div>
      )}
    </div>
  )
}

function AgentConversations({ agent }) {
  const { data: conversations = [] } = useConversations(agent.id)

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Link to={`/agents/${agent.id}`} className="font-medium text-gray-900 hover:text-indigo-600">
          {agent.name}
        </Link>
        <span className="text-xs text-gray-400">({conversations.length})</span>
      </div>

      {conversations.length === 0 ? (
        <p className="text-sm text-gray-400 pl-2">Aucune conversation.</p>
      ) : (
        <div className="space-y-1.5">
          {conversations.map(conv => (
            <Link key={conv.id} to={`/conversations/${conv.id}`}>
              <Card className="hover:border-indigo-200 cursor-pointer transition-all">
                <CardBody className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-mono text-gray-700">{conv.sessionId}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {conv._count?.messages ?? 0} messages · {new Date(conv.updatedAt).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
