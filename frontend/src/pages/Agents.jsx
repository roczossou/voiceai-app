import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAgents, useCreateAgent, useDeleteAgent } from '../hooks/useAgents.js'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Card, CardBody, CardHeader } from '../components/ui/Card.jsx'
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

const DEFAULT_FORM = {
  name: '',
  description: '',
  type: 'chat',
  config: {
    voice: 'alloy-neutral',
    personality: 'professional',
    interruptionSensitivity: 'medium',
    greetingMessage: 'Bonjour ! Je suis votre assistant IA. Comment puis-je vous aider ?',
  },
}

export function Agents() {
  const { data: agents = [], isLoading } = useAgents()
  const createAgent = useCreateAgent()
  const deleteAgent = useDeleteAgent()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)

  const setConfig = (key, value) =>
    setForm(f => ({ ...f, config: { ...f.config, [key]: value } }))

  const handleCreate = (e) => {
    e.preventDefault()
    createAgent.mutate(form, {
      onSuccess: () => { setShowForm(false); setForm(DEFAULT_FORM) },
    })
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Agents</h1>
          <p className="text-gray-500 mt-1">Gérez vos agents conversationnels.</p>
        </div>
        <Button onClick={() => setShowForm(true)}>+ Nouvel agent</Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="font-medium text-gray-900">Nouvel agent</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleCreate} className="space-y-5">
              {/* Infos de base */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Nom de l'agent *"
                  placeholder="Réceptionniste IA"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Type</label>
                  <Select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
                    <option value="chat">Chat</option>
                    <option value="voice">Voice</option>
                  </Select>
                </div>
              </div>

              <Input
                label="Description (optionnel)"
                placeholder="Rôle et contexte de cet agent…"
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />

              {/* Config voix & personnalité */}
              <div className="grid grid-cols-3 gap-4">
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Voix</label>
                  <Select value={form.config.voice} onChange={e => setConfig('voice', e.target.value)}>
                    {VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Personnalité</label>
                  <Select value={form.config.personality} onChange={e => setConfig('personality', e.target.value)}>
                    {PERSONALITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Sensibilité interruption</label>
                  <Select value={form.config.interruptionSensitivity} onChange={e => setConfig('interruptionSensitivity', e.target.value)}>
                    {SENSITIVITIES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </Select>
                </div>
              </div>

              {/* Message d'accueil */}
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700">Message d'accueil</label>
                <textarea
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 resize-none"
                  placeholder="Bonjour ! Comment puis-je vous aider ?"
                  value={form.config.greetingMessage}
                  onChange={e => setConfig('greetingMessage', e.target.value)}
                />
              </div>

              <p className="text-xs text-gray-400">
                Le comportement de l'agent (profil entreprise, services, remarques) se configure après création, depuis la page de l'agent.
              </p>

              {createAgent.error && (
                <p className="text-sm text-red-600">{createAgent.error.response?.data?.title || 'Erreur lors de la création'}</p>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setForm(DEFAULT_FORM) }}>
                  Annuler
                </Button>
                <Button type="submit" loading={createAgent.isPending}>Créer l'agent</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : agents.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-gray-500">Aucun agent. Créez-en un pour commencer.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2">
          {agents.map(agent => (
            <Card key={agent.id} className="hover:border-indigo-200 transition-all">
              <CardBody className="flex items-center justify-between py-3.5">
                <Link to={`/agents/${agent.id}`} className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold flex-shrink-0">
                      {agent.name[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900 text-sm">{agent.name}</p>
                      {agent.description && <p className="text-xs text-gray-500 truncate max-w-xs">{agent.description}</p>}
                    </div>
                    <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded">{agent.type}</span>
                  </div>
                </Link>
                <div className="flex items-center gap-3 ml-4">
                  <StatusBadge status={agent.status} />
                  <button
                    onClick={() => confirm('Supprimer cet agent ?') && deleteAgent.mutate(agent.id)}
                    className="text-gray-400 hover:text-red-500 transition-colors p-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
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
