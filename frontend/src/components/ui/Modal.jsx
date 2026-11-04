// ── Modale générique ──
// Overlay + carte centrée, fermable par Échap / clic overlay / bouton ×.
// Le focus est posé sur la modale à l'ouverture (accessibilité clavier).

import { useEffect, useRef } from 'react'

export function Modal({ open, onClose, title, subtitle, children, wide = false }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('keydown', onKey)
    // focus initial + blocage du scroll de la page derrière
    ref.current?.focus()
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Carte */}
      <div
        ref={ref}
        tabIndex={-1}
        className={`relative bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-lg'} sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92svh] flex flex-col outline-none animate-[modal-in_.18s_ease-out]`}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-gray-100">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer la fenêtre"
            className="w-9 h-9 flex-shrink-0 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeWidth={2} d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto min-h-0">
          {children}
        </div>
      </div>
      <style>{`@keyframes modal-in { from { opacity: 0; transform: translateY(12px) scale(.98); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  )
}
