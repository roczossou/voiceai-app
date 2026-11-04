import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useServices, useCreateService, useUpdateService, useDeleteService } from '../hooks/useServices.js'
import { useAgents } from '../hooks/useAgents.js'
import { Button } from '../components/ui/Button.jsx'
import { Input } from '../components/ui/Input.jsx'
import { Card, CardBody } from '../components/ui/Card.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'
import { Modal } from '../components/ui/Modal.jsx'
import { ListSkeleton, EmptyState } from '../components/ui/Feedback.jsx'

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

  // Modale : null = fermée, 'new' = création, sinon id du service édité
  const [modal, setModal] = useState(null) // null | 'new' | serviceId
  const editing = modal && modal !== 'new' ? services.find(s => s.id === modal) : null
  const [form, setForm] = useState(DEFAULT_FORM)

  const startCreate = () => { setForm(DEFAULT_FORM); setModal('new') }
  const startEdit = (service) => {
    setForm({
      name: service.name,
      description: service.description ?? '',
      ...minutesToDuration(service.durationMinutes),
      isSharedToAll: service.isSharedToAll,
      agentId: service.agentId ?? '',
    })
    setModal(service.id)
  }
  const closeModal = () => { setModal(null); setForm(DEFAULT_FORM) }

  const handleSubmit = (e) => {
    e.preventDefault()
    const { durationValue, durationUnit, ...rest } = form
    const durationMinutes = Math.round(Number(durationValue) * UNIT_MINUTES[durationUnit])
    const mutation = editing ? updateService : createService
    const payload = editing ? { id: editing.id, ...rest, durationMinutes } : { ...rest, durationMinutes }
    mutation.mutate(payload, { onSuccess: closeModal })
  }

  const pending = createService.isPending || updateService.isPending
  const formError = createService.error || updateService.error

  return (
    <div className="min-w-0">
      <PageHeader
        title="Services"
        subtitle="Prestations proposées par l'entreprise — l'IA les utilise pour calculer les créneaux de rendez-vous."
        breadcrumb={<>Accueil <span className="mx-1">›</span> Services</>}
      >
        <Button onClick={startCreate}>+ Nouveau service</Button>
      </PageHeader>

      <div className="p-4 sm:p-8">
        {isLoading ? (
          <ListSkeleton rows={4} />
        ) : services.length === 0 ? (
          <EmptyState
            title="Aucun service pour le moment"
            hint="Créez un service pour permettre à l'IA de prendre des rendez-vous."
            action={<Button size="sm" onClick={startCreate}>+ Nouveau service</Button>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {services.map(service => (
              <Card key={service.id} className={`flex flex-col ${service.isActive ? '' : 'opacity-60'}`}>
                <CardBody className="flex-1 flex flex-col gap-2 py-4 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-gray-900 text-sm truncate" title={service.name}>{service.name}</p>
                    <span className="text-xs text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full flex-shrink-0">
                      {formatDuration(service.durationMinutes)}
                    </span>
                  </div>
                  <span className="text-xs text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full self-start max-w-full truncate">
                    {service.isSharedToAll ? 'Tous les agents' : (service.agent?.name ?? 'Agent supprimé')}
                  </span>
                  {service.description && (
                    <p className="text-xs text-gray-500 line-clamp-2 break-words">{service.description}</p>
                  )}
                </CardBody>
                <div className="flex items-center justify-end gap-1 px-4 py-2 border-t border-gray-100 bg-gray-50/60 rounded-b-xl">
                  <button
                    onClick={() => startEdit(service)}
                    className="text-xs font-medium text-gray-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    Modifier
                  </button>
                  <button
                    onClick={() => updateService.mutate({ id: service.id, isActive: !service.isActive })}
                    className="text-xs font-medium text-gray-600 hover:text-indigo-600 px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    {service.isActive ? 'Désactiver' : 'Activer'}
                  </button>
                  <button
                    onClick={() => confirm('Supprimer ce service ?') && deleteService.mutate(service.id)}
                    className="text-gray-400 hover:text-red-600 p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg transition-colors"
                    aria-label={`Supprimer le service ${service.name}`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ── Modale création / édition ── */}
      <Modal
        open={modal !== null}
        onClose={closeModal}
        title={editing ? 'Modifier le service' : 'Nouveau service'}
        subtitle={editing ? `"${editing.name}" — les rendez-vous existants ne sont pas modifiés.` : 'Ce service servira à calculer les créneaux proposés par l’IA.'}
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          <Input
            label="Nom du service *"
            placeholder="Coupe homme"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            required
            autoFocus
          />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="svc-duration">Durée *</label>
            <div className="flex gap-2">
              <input
                id="svc-duration"
                type="number"
                min={1}
                step={1}
                className="input w-28 flex-shrink-0"
                value={form.durationValue}
                onChange={e => setForm(f => ({ ...f, durationValue: e.target.value }))}
                required
              />
              <select
                className="input flex-1 min-w-0 text-gray-900"
                value={form.durationUnit}
                onChange={e => setForm(f => ({ ...f, durationUnit: e.target.value }))}
              >
                {Object.entries(UNIT_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Description (optionnel)"
            placeholder="Décrit ce service, l'IA s'en sert pour répondre au client."
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-indigo-600"
                checked={form.isSharedToAll}
                onChange={e => setForm(f => ({ ...f, isSharedToAll: e.target.checked, agentId: e.target.checked ? '' : f.agentId }))}
              />
              Partagé à tous les agents de l'entreprise
            </label>

            {!form.isSharedToAll && (
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-gray-700" htmlFor="svc-agent">Agent spécifique</label>
                <select
                  id="svc-agent"
                  className="input text-gray-900"
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
            <p role="alert" className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
              {formError.response?.data?.title || 'Erreur lors de l’enregistrement'}
            </p>
          )}

          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <Button variant="secondary" type="button" onClick={closeModal}>Annuler</Button>
            <Button type="submit" loading={pending}>{editing ? 'Enregistrer' : 'Créer le service'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
