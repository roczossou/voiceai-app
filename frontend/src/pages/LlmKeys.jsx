import { useState } from 'react'
import { useLlmKeys, useCreateLlmKey, useUpdateLlmKey, useDeleteLlmKey } from '../hooks/useLlmKeys.js'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Card, CardBody, CardHeader } from '../components/ui/Card.jsx'

const PROVIDERS = [
  { id: 'gemini', label: 'Gemini' },
  { id: 'anthropic', label: 'Anthropic (bascule 429)' },
]

const DEFAULT_FORM = { label: '', key: '', priority: 0 }

function ProviderKeysSection({ provider, label }) {
  const { data: keys = [], isLoading } = useLlmKeys(provider)
  const createKey = useCreateLlmKey()
  const updateKey = useUpdateLlmKey()
  const deleteKey = useDeleteLlmKey()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(DEFAULT_FORM)

  const startCreate = () => { setEditingId(null); setForm(DEFAULT_FORM); setShowForm(true) }
  const startEdit = (row) => {
    setEditingId(row.id)
    setForm({ label: row.label, key: '', priority: row.priority })
    setShowForm(true)
  }
  const closeForm = () => { setShowForm(false); setEditingId(null); setForm(DEFAULT_FORM) }

  const handleSubmit = (e) => {
    e.preventDefault()
    const payload = { label: form.label, priority: Number(form.priority) }
    if (form.key.trim()) payload.key = form.key.trim() // vide en édition = clé inchangée

    if (editingId) {
      updateKey.mutate({ id: editingId, ...payload }, { onSuccess: closeForm })
    } else {
      createKey.mutate({ provider, ...payload }, { onSuccess: closeForm })
    }
  }

  const pending = createKey.isPending || updateKey.isPending
  const formError = createKey.error || updateKey.error

  return (
    <Card className="mb-6">
      <CardHeader className="flex items-center justify-between">
        <h2 className="font-medium text-gray-900">{label}</h2>
        <Button size="sm" onClick={startCreate}>+ Ajouter une clé</Button>
      </CardHeader>

      {showForm && (
        <CardBody className="border-b border-gray-100">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <Input
                label="Nom *"
                placeholder="Clé principale"
                value={form.label}
                onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                required
              />
              <Input
                label={editingId ? 'Clé (laisser vide pour ne pas changer)' : 'Clé API *'}
                type="password"
                placeholder={editingId ? '••••••••' : 'sk-...'}
                value={form.key}
                onChange={e => setForm(f => ({ ...f, key: e.target.value }))}
                required={!editingId}
              />
              <Input
                label="Priorité"
                type="number"
                min={0}
                step={1}
                value={form.priority}
                onChange={e => setForm(f => ({ ...f, priority: e.target.value }))}
              />
            </div>

            {formError && (
              <p className="text-sm text-red-600">{formError.response?.data?.title || 'Erreur'}</p>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" type="button" onClick={closeForm}>Annuler</Button>
              <Button type="submit" loading={pending}>{editingId ? 'Enregistrer' : 'Ajouter'}</Button>
            </div>
          </form>
        </CardBody>
      )}

      {isLoading ? (
        <CardBody><p className="text-sm text-gray-500">Chargement…</p></CardBody>
      ) : keys.length === 0 ? (
        <CardBody className="text-center py-8">
          <p className="text-sm text-gray-500">Aucune clé — repli sur la variable d'environnement tant qu'aucune n'est ajoutée ici.</p>
        </CardBody>
      ) : (
        <div className="divide-y divide-gray-100">
          {keys.map(row => (
            <div key={row.id} className={`flex items-center justify-between px-6 py-3.5 ${row.isActive ? '' : 'opacity-50'}`}>
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 text-sm">{row.label}</p>
                  <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded font-mono">{row.keyMasked}</span>
                  <span className="text-xs text-gray-400">priorité {row.priority}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 ml-4">
                <button onClick={() => startEdit(row)} className="text-xs text-gray-500 hover:text-indigo-600">Modifier</button>
                <button
                  onClick={() => updateKey.mutate({ id: row.id, isActive: !row.isActive })}
                  className="text-xs text-gray-500 hover:text-indigo-600"
                >
                  {row.isActive ? 'Désactiver' : 'Activer'}
                </button>
                <button
                  onClick={() => confirm('Supprimer cette clé ?') && deleteKey.mutate(row.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors p-1"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

export function LlmKeys() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Clés API</h1>
        <p className="text-gray-500 mt-1">
          Clés des fournisseurs LLM. Gemini est utilisé en priorité ; Anthropic ne sert que de repli en cas de 429 répétés sur toutes les clés Gemini.
          Sans clé ici, l'app utilise les variables d'environnement (GEMINI_API_KEY / ANTHROPIC_API_KEY).
        </p>
      </div>

      {PROVIDERS.map(p => (
        <ProviderKeysSection key={p.id} provider={p.id} label={p.label} />
      ))}
    </div>
  )
}
