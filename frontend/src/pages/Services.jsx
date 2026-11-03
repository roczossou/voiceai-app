import { useState } from 'react'
import { useServices, useCreateService, useUpdateService, useDeleteService } from '../hooks/useServices.js'
import { useAgents } from '../hooks/useAgents.js'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Card, CardBody, CardHeader } from '../components/ui/Card.jsx'

const UNIT_MINUTES = { minutes: 1, hours: 60, days: 1440, weeks: 10080 }
const UNIT_LABELS = { minutes: 'minutes', hours: 'heures', days: 'jours', weeks: 'semaines' }

function minutesToDuration(totalMinutes) {
  if (totalMinutes % UNIT_MINUTES.weeks === 0) return { durationValue: totalMinutes / UNIT_MINUTES.weeks, durationUnit: 'weeks' }
  if (totalMinutes % UNIT_MINUTES.days === 0) return { durationValue: totalMinutes / UNIT_MINUTES.days, durationUnit: 'days' }
  if (totalMinutes % UNIT_MINUTES.hours === 0) return { durationValue: totalMinutes / UNIT_MINUTES.hours, durationUnit: 'hours' }
  return { durationValue: totalMinutes, durationUnit: 'minutes' }
}

function formatDuration(totalMinutes) {
  const { durationValue, durationUnit } = minutesToDuration(totalMinutes)
  return `${durationValue} ${UNIT_LABELS[durationUnit]}`
}

const DEFAULT_FORM = {
  name: '',
  description: '',
  durationValue: 30,
  durationUnit: 'minutes',
  isSharedToAll: true,
  agentId: '',
}

export function Services() {
  const { data: services = [], isLoading } = useServices()
  const { data: agents = [] } = useAgents()
  const createService = useCreateService()
  const updateService = useUpdateService()
  const deleteService = useDeleteService()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(DEFAULT_FORM)

  const startCreate = () => { setEditingId(null); setForm(DEFAULT_FORM); setShowForm(true) }
  const startEdit = (service) => {
    setEditingId(service.id)
    setForm({
      name: service.name,
      description: service.description ?? '',
      ...minutesToDuration(service.durationMinutes),
      isSharedToAll: service.isSharedToAll,
      agentId: service.agentId ?? '',
    })
    setShowForm(true)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const { durationValue, durationUnit, ...rest } = form
    const durationMinutes = Math.round(durationValue * UNIT_MINUTES[durationUnit])
    const mutation = editingId ? updateService : createService
    const payload = editingId ? { id: editingId, ...rest, durationMinutes } : { ...rest, durationMinutes }
    mutation.mutate(payload, {
      onSuccess: () => { setShowForm(false); setForm(DEFAULT_FORM); setEditingId(null) },
    })
  }

  const pending = createService.isPending || updateService.isPending
  const formError = createService.error || updateService.error

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Services</h1>
          <p className="text-gray-500 mt-1">Prestations proposées par l'entreprise, utilisées par l'IA pour les rendez-vous.</p>
        </div>
        <Button onClick={startCreate}>+ Nouveau service</Button>
      </div>

      {showForm && (
        <Card className="mb-6">
          <CardHeader>
            <h2 className="font-medium text-gray-900">{editingId ? 'Modifier le service' : 'Nouveau service'}</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Nom du service *"
                  placeholder="Coupe homme"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  required
                />
                <div className="flex flex-col gap-1">
                  <label className="text-sm font-medium text-gray-700">Durée *</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      step={1}
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                      value={form.durationValue}
                      onChange={e => setForm(f => ({ ...f, durationValue: Number(e.target.value) }))}
                      required
                    />
                    <select
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 bg-white"
                      value={form.durationUnit}
                      onChange={e => setForm(f => ({ ...f, durationUnit: e.target.value }))}
                    >
                      {Object.entries(UNIT_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <Input
                label="Description (optionnel)"
                placeholder="Décrit ce service, l'IA s'en sert pour répondre au client."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={form.isSharedToAll}
                    onChange={e => setForm(f => ({ ...f, isSharedToAll: e.target.checked, agentId: e.target.checked ? '' : f.agentId }))}
                  />
                  Partagé à tous les agents de l'entreprise
                </label>

                {!form.isSharedToAll && (
                  <div className="flex flex-col gap-1">
                    <label className="text-sm font-medium text-gray-700">Agent spécifique</label>
                    <select
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 bg-white"
                      value={form.agentId}
                      onChange={e => setForm(f => ({ ...f, agentId: e.target.value }))}
                      required
                    >
                      <option value="">Sélectionner un agent…</option>
                      {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {formError && (
                <p className="text-sm text-red-600">{formError.response?.data?.title || 'Erreur'}</p>
              )}

              <div className="flex gap-2 justify-end">
                <Button variant="secondary" type="button" onClick={() => { setShowForm(false); setEditingId(null) }}>
                  Annuler
                </Button>
                <Button type="submit" loading={pending}>{editingId ? 'Enregistrer' : 'Créer le service'}</Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-500">Chargement…</p>
      ) : services.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-gray-500">Aucun service. Créez-en un pour permettre à l'IA de prendre des rendez-vous.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2">
          {services.map(service => (
            <Card key={service.id} className={service.isActive ? '' : 'opacity-50'}>
              <CardBody className="flex items-center justify-between py-3.5">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm">{service.name}</p>
                    <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded">{formatDuration(service.durationMinutes)}</span>
                    <span className="text-xs text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                      {service.isSharedToAll ? 'Tous les agents' : service.agent?.name ?? 'Agent supprimé'}
                    </span>
                  </div>
                  {service.description && <p className="text-xs text-gray-500 mt-0.5">{service.description}</p>}
                </div>
                <div className="flex items-center gap-3 ml-4">
                  <button onClick={() => startEdit(service)} className="text-xs text-gray-500 hover:text-indigo-600">Modifier</button>
                  <button
                    onClick={() => updateService.mutate({ id: service.id, isActive: !service.isActive })}
                    className="text-xs text-gray-500 hover:text-indigo-600"
                  >
                    {service.isActive ? 'Désactiver' : 'Activer'}
                  </button>
                  <button
                    onClick={() => confirm('Supprimer ce service ?') && deleteService.mutate(service.id)}
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
