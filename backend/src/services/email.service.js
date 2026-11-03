import { Resend } from 'resend'

// Expéditeur "sandbox" Resend — fonctionne sans domaine vérifié.
// À remplacer par une adresse sur un domaine vérifié avant une mise en prod réelle.
const FROM_ADDRESS = 'Rendez-vous <onboarding@resend.dev>'

let _resend = null
function getResend() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY)
  return _resend
}

export async function sendAppointmentNotification({ tenant, agent, appointment, service }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[Email] RESEND_API_KEY absente — notification RDV non envoyée')
    return
  }
  if (!tenant.contactEmail) {
    console.warn(`[Email] Tenant ${tenant.id} sans contactEmail — notification RDV non envoyée`)
    return
  }

  const dateLabel = new Intl.DateTimeFormat('fr-FR', {
    timeZone: tenant.timezone, dateStyle: 'full', timeStyle: 'short',
  }).format(appointment.startsAt)

  const subject = `Nouveau rendez-vous — ${agent.name}`
  const html = `
    <h2>Nouveau rendez-vous pris via ${agent.name}</h2>
    <p><strong>Date :</strong> ${dateLabel}</p>
    ${service ? `<p><strong>Service :</strong> ${service.name}</p>` : ''}
    <p><strong>Client :</strong> ${appointment.customerName ?? 'Non renseigné'}</p>
    <p><strong>Contact :</strong> ${appointment.customerContact ?? 'Non renseigné'}</p>
    ${appointment.notes ? `<p><strong>Notes :</strong> ${appointment.notes}</p>` : ''}
  `

  await getResend().emails.send({
    from: FROM_ADDRESS,
    to: tenant.contactEmail,
    subject,
    html,
  })
}
