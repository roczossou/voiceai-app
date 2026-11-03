import { useState } from 'react'
import { useCompanyProfile, useUpdateCompanyProfile } from '../hooks/useCompanyProfile.js'
import { Button } from '../components/ui/Button.jsx'

const DAYS = [
  { key: 'mon', label: 'Lundi' },
  { key: 'tue', label: 'Mardi' },
  { key: 'wed', label: 'Mercredi' },
  { key: 'thu', label: 'Jeudi' },
  { key: 'fri', label: 'Vendredi' },
  { key: 'sat', label: 'Samedi' },
  { key: 'sun', label: 'Dimanche' },
]

const EMPTY_HOURS = Object.fromEntries(DAYS.map(d => [d.key, []]))

const TIMEZONES = typeof Intl.supportedValuesOf === 'function'
  ? Intl.supportedValuesOf('timeZone')
  : ['Europe/Paris', 'Africa/Porto-Novo', 'Africa/Abidjan', 'Africa/Dakar', 'America/Montreal', 'America/Guadeloupe']

export function CompanyProfile() {
  const { data: tenant, isLoading } = useCompanyProfile()
  const updateProfile = useUpdateCompanyProfile()
  const [form, setForm] = useState(null)
  const [saved, setSaved] = useState(false)

  if (isLoading || !tenant) return <div className="p-8 text-gray-500">Chargement…</div>

  const current = form ?? {
    description: tenant.description ?? '',
    address: tenant.address ?? '',
    contactEmail: tenant.contactEmail ?? '',
    contactPhone: tenant.contactPhone ?? '',
    timezone: tenant.timezone ?? 'Europe/Paris',
    openingHours: tenant.openingHours ?? EMPTY_HOURS,
  }

  const set = (key, value) => setForm({ ...current, [key]: value })

  const setDayRanges = (dayKey, ranges) =>
    setForm({ ...current, openingHours: { ...current.openingHours, [dayKey]: ranges } })

  const addRange = (dayKey) =>
    setDayRanges(dayKey, [...(current.openingHours[dayKey] ?? []), { start: '09:00', end: '18:00' }])

  const updateRange = (dayKey, idx, field, value) => {
    const ranges = [...(current.openingHours[dayKey] ?? [])]
    ranges[idx] = { ...ranges[idx], [field]: value }
    setDayRanges(dayKey, ranges)
  }

  const removeRange = (dayKey, idx) =>
    setDayRanges(dayKey, (current.openingHours[dayKey] ?? []).filter((_, i) => i !== idx))

  const handleSave = (e) => {
    e.preventDefault()
    updateProfile.mutate(current, {
      onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000) },
    })
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Profil entreprise</h1>
        <p className="text-gray-500 mt-1">
          Ces informations sont communes à tous vos agents et remplacent la rédaction manuelle du prompt système.
        </p>
      </div>

      <form onSubmit={handleSave} className="max-w-2xl space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-3">Informations générales</h3>
          <div className="space-y-4">
            <Field label="Description de l'entreprise" hint="Présentation générale utilisée par tous vos agents.">
              <textarea
                rows={3}
                className="input resize-none"
                value={current.description}
                onChange={e => set('description', e.target.value)}
                placeholder="Nous sommes une agence spécialisée dans…"
              />
            </Field>
            <Field label="Adresse">
              <input className="input" value={current.address} onChange={e => set('address', e.target.value)} placeholder="12 rue de l'Exemple, 75000 Paris" />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Email de contact" hint="Reçoit les notifications de rendez-vous.">
                <input type="email" className="input" value={current.contactEmail} onChange={e => set('contactEmail', e.target.value)} placeholder="contact@entreprise.fr" />
              </Field>
              <Field label="Téléphone de contact">
                <input className="input" value={current.contactPhone} onChange={e => set('contactPhone', e.target.value)} placeholder="01 23 45 67 89" />
              </Field>
            </div>
            <Field label="Fuseau horaire" hint="Identifiant IANA requis (pas un nom de pays), ex. Europe/Paris, Africa/Porto-Novo, America/Montreal.">
              <input
                className="input"
                list="timezone-options"
                value={current.timezone}
                onChange={e => set('timezone', e.target.value)}
                placeholder="Europe/Paris"
              />
              <datalist id="timezone-options">
                {TIMEZONES.map(tz => <option key={tz} value={tz} />)}
              </datalist>
            </Field>
          </div>
        </section>

        <hr className="border-gray-100" />

        <section>
          <h3 className="text-sm font-semibold text-gray-900 mb-1">Horaires d'ouverture</h3>
          <p className="text-xs text-gray-400 mb-3">
            Configurer des horaires active automatiquement la prise de rendez-vous par l'IA (si au moins un service existe).
          </p>
          <div className="space-y-2">
            {DAYS.map(day => {
              const ranges = current.openingHours[day.key] ?? []
              return (
                <div key={day.key} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="w-20 text-sm text-gray-700 pt-1.5 flex-shrink-0">{day.label}</span>
                  <div className="flex-1 space-y-2">
                    {ranges.length === 0 && <span className="text-xs text-gray-400 pt-1.5 inline-block mr-3">Fermé</span>}
                    {ranges.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input type="time" className="input w-28" value={r.start} onChange={e => updateRange(day.key, idx, 'start', e.target.value)} />
                        <span className="text-gray-400 text-xs">à</span>
                        <input type="time" className="input w-28" value={r.end} onChange={e => updateRange(day.key, idx, 'end', e.target.value)} />
                        <button type="button" onClick={() => removeRange(day.key, idx)} className="text-gray-400 hover:text-red-500 text-xs px-1">✕</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => addRange(day.key)} className="text-xs text-indigo-600 hover:text-indigo-700">
                      + Ajouter un créneau
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </section>

        {updateProfile.error && (
          <p className="text-sm text-red-600">{updateProfile.error.response?.data?.title || 'Erreur'}</p>
        )}

        <div className="flex items-center gap-3">
          <Button type="submit" loading={updateProfile.isPending}>Enregistrer</Button>
          {saved && <span className="text-sm text-green-600">✓ Sauvegardé</span>}
        </div>
      </form>

      <style>{`.input { width: 100%; padding: 8px 12px; font-size: 14px; border: 1px solid #d1d5db; border-radius: 8px; outline: none; } .input:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgb(99 102 241 / 0.2); }`}</style>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      {hint && <p className="text-xs text-gray-400">{hint}</p>}
      {children}
    </div>
  )
}
