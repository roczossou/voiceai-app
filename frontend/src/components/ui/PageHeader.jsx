// ── En-tête de page standard : grand titre + sous-titre + actions ──
// À utiliser en haut de chaque page pour une hiérarchie lisible
// (avant : titres petits noyés dans le contenu).

export function PageHeader({ title, subtitle, children, breadcrumb }) {
  return (
    <div className="bg-white border-b border-gray-200">
      <div className="px-4 sm:px-8 pt-6 pb-5">
        {breadcrumb && (
          <p className="text-xs text-gray-400 mb-2">{breadcrumb}</p>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight truncate">
              {title}
            </h1>
            {subtitle && (
              <p className="text-sm text-gray-500 mt-1.5">{subtitle}</p>
            )}
          </div>
          {children && <div className="flex items-center gap-2 flex-shrink-0">{children}</div>}
        </div>
      </div>
    </div>
  )
}
