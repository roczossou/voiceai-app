import { useState } from 'react'
import { useAppointments, useCancelAppointment } from '../hooks/useAppointments.js'
import { useAgents } from '../hooks/useAgents.js'
import { Card, CardBody } from '../components/ui/Card.jsx'
import { ListSkeleton } from '../components/ui/Feedback.jsx'
import { PageHeader } from '../components/ui/PageHeader.jsx'

const STATUS_LABEL = {
  confirmed: { label: 'Confirmé', className: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Annulé', className: 'bg-gray-50 text-gray-500 border-gray-200' },
}

export function Appointments() {
  const [agentId, setAgentId] = useState('')
  const { data: appointments = [], isLoading } = useAppointments(agentId || undefined)
  const { data: agents = [] } = useAgents()
  const cancelAppointment = useCancelAppointment()

  return (
    <div>
      <PageHeader
        title="Rendez-vous"
        subtitle="Rendez-vous pris automatiquement par l'IA pendant les conversations vocales ou écrites."
        breadcrumb={<>Accueil <span className="mx-1">›</span> Rendez-vous</>}
      >
        <select
          className="input max-w-[220px]"
          value={agentId}
          onChange={e => setAgentId(e.target.value)}
        >
          <option value="">Tous les agents</option>
          {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </PageHeader>

      <div className="p-4 sm:p-8">
      {isLoading ? (
        <ListSkeleton rows={4} />
      ) : appointments.length === 0 ? (
        <Card>
          <CardBody className="text-center py-12">
            <p className="text-gray-500">Aucun rendez-vous pour l'instant.</p>
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-2">
          {appointments.map(appt => {
            const status = STATUS_LABEL[appt.status] ?? STATUS_LABEL.confirmed
            return (
              <Card key={appt.id}>
                <CardBody className="flex items-center justify-between py-3.5">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 text-sm">
                        {new Date(appt.startsAt).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded border ${status.className}`}>{status.label}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {appt.agent?.name} {appt.service?.name && `· ${appt.service.name}`}
                      {appt.customerName && ` · ${appt.customerName}`}
                      {appt.customerContact && ` · ${appt.customerContact}`}
                    </p>
                    {appt.notes && <p className="text-xs text-gray-400 mt-0.5">{appt.notes}</p>}
                  </div>
                  {appt.status === 'confirmed' && (
                    <button
                      onClick={() => confirm('Annuler ce rendez-vous ?') && cancelAppointment.mutate(appt.id)}
                      className="text-xs text-gray-500 hover:text-red-600 ml-4 flex-shrink-0"
                    >
                      Annuler
                    </button>
                  )}
                </CardBody>
              </Card>
            )
          })}
        </div>
      )}
      </div>
    </div>
  )
}
