// Conversions fuseau horaire sans dépendance externe (date-fns-tz, luxon...).
// Astuce classique : formater la même date en UTC et dans le fuseau cible,
// la différence entre les deux lectures donne le décalage à ce moment précis
// (gère les changements heure été/hiver automatiquement).

export function zonedTimeToUtc(dateStr, timeStr, timeZone) {
  const asUTC = new Date(`${dateStr}T${timeStr}:00Z`)
  const tzReading = new Date(asUTC.toLocaleString('en-US', { timeZone }))
  const utcReading = new Date(asUTC.toLocaleString('en-US', { timeZone: 'UTC' }))
  return new Date(asUTC.getTime() + (utcReading.getTime() - tzReading.getTime()))
}

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

export function dayKeyInTimeZone(dateStr, timeZone) {
  // Midi pour éviter les cas limites autour des transitions DST à minuit.
  const noon = zonedTimeToUtc(dateStr, '12:00', timeZone)
  const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' })
    .format(noon)
    .toLowerCase()
  return DAY_KEYS.find(k => weekday.startsWith(k)) ?? weekday.slice(0, 3)
}

export function nowInTimeZone(timeZone) {
  const now = new Date()
  const fmt = new Intl.DateTimeFormat('fr-FR', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'long',
  })
  const parts = Object.fromEntries(fmt.formatToParts(now).map(p => [p.type, p.value]))
  return {
    date:  `${parts.year}-${parts.month}-${parts.day}`,
    time:  `${parts.hour}:${parts.minute}`,
    weekday: parts.weekday,
    label: `${parts.weekday} ${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`,
  }
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
