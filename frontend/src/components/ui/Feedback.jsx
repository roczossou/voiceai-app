// ── Composants de feedback visuel partagés (skeleton, spinner, vide) ──
// Utilisés par toutes les pages pour des états de chargement cohérents.

export function Skeleton({ className = '', style }) {
  return (
    <div
      className={`animate-pulse rounded ${className}`}
      style={{ background: '#eef1f5', ...style }}
      aria-hidden="true"
    />
  )
}

/** Bloc skeleton générique : hauteur + largeur optionnelles. */
export function SkeletonBlock({ lines = 3, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`} aria-label="Chargement en cours" role="status">
      {[...Array(lines)].map((_, i) => (
        <Skeleton key={i} className="h-3" style={{ width: `${90 - i * 18}%` }} />
      ))}
      <span className="sr-only">Chargement…</span>
    </div>
  )
}

/** Spinner fluide pour les boutons / actions async. */
export function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}

/** Carte skeleton pour une liste (agents, conversations, RDV…). */
export function ListSkeleton({ rows = 4, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`} role="status" aria-label="Chargement de la liste">
      {[...Array(rows)].map((_, i) => (
        <div
          key={i}
          className="bg-white rounded-xl border border-gray-200 px-5 py-4 flex items-center gap-4"
        >
          <Skeleton className="w-9 h-9 rounded-full flex-shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-2.5 w-1/2" />
          </div>
          <Skeleton className="h-5 w-16 rounded-full flex-shrink-0" />
        </div>
      ))}
      <span className="sr-only">Chargement…</span>
    </div>
  )
}

/** État vide avec CTA. */
export function EmptyState({ title, hint, action }) {
  return (
    <div className="bg-white rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center">
      <p className="text-sm font-medium text-gray-700">{title}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}
