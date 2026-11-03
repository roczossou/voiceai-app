import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/auth.store.js'
import { useAgents } from '../hooks/useAgents.js'
import { Button } from '../components/ui/Button.jsx'

const TABS = ['Vue générale', 'Agents', 'Activité']

export function Dashboard() {
  const user = useAuthStore(s => s.user)
  const { data: agents = [], isLoading } = useAgents()
  const [activeTab, setActiveTab] = useState('Vue générale')

  const total    = agents.length
  const active   = agents.filter(a => a.status === 'active').length
  const draft    = agents.filter(a => a.status === 'draft').length
  const archived = agents.filter(a => a.status === 'archived').length

  return (
    <div className="flex flex-col min-h-full">

      {/* ── Header blanc ──────────────────────────────────── */}
      <div className="bg-white" style={{ borderBottom: '1px solid #e2e8f0' }}>
        <div className="px-8 pt-6 pb-0">
          {/* Breadcrumb */}
          <p className="text-xs mb-3" style={{ color: '#94a3b8' }}>
            Accueil <span className="mx-1">›</span>
            <span style={{ color: '#64748b' }}>Tableau de bord</span>
          </p>

          {/* Titre */}
          <div className="flex items-end justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: '#0f172a', letterSpacing: '-0.3px' }}>
                Tableau de bord
              </h1>
              <p className="text-sm mt-1" style={{ color: '#94a3b8' }}>
                Supervision de vos agents conversationnels · {user?.name}
              </p>
            </div>
            <Link to="/agents/new">
              <Button size="sm">+ Nouvel agent</Button>
            </Link>
          </div>

          {/* Onglets */}
          <div className="flex gap-0">
            {TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="px-4 py-3 text-sm font-medium transition-all relative"
                style={{
                  color: activeTab === tab ? '#2563eb' : '#94a3b8',
                  borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                }}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Contenu ───────────────────────────────────────── */}
      <div className="flex-1 p-8">

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <KpiCard
            label="Agents total"
            value={isLoading ? '…' : total}
            sub="dans votre espace"
          />
          <KpiCard
            label="Agents actifs"
            value={isLoading ? '…' : active}
            sub="en production"
            valueColor="#16a34a"
          />
          <KpiCard
            label="En brouillon"
            value={isLoading ? '…' : draft}
            sub="à configurer"
            valueColor="#d97706"
          />
          <KpiCard
            label="Plan"
            value={user?.tenant?.plan ?? 'free'}
            sub="abonnement actuel"
            valueColor="#2563eb"
            capitalize
          />
        </div>

        {/* Section agents */}
        {(activeTab === 'Vue générale' || activeTab === 'Agents') && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-base font-semibold" style={{ color: '#0f172a' }}>
                  Agents récents
                </h2>
                <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                  {total} agent{total !== 1 ? 's' : ''} configuré{total !== 1 ? 's' : ''}
                </p>
              </div>
              <Link to="/agents">
                <Button variant="secondary" size="sm">Voir tous</Button>
              </Link>
            </div>

            {isLoading ? (
              <AgentTableSkeleton />
            ) : agents.length === 0 ? (
              <EmptyAgents />
            ) : (
              <AgentTable agents={agents.slice(0, 8)} />
            )}
          </section>
        )}

        {activeTab === 'Activité' && (
          <div
            className="rounded-xl flex items-center justify-center"
            style={{ height: 240, background: 'white', border: '1px solid #e2e8f0' }}
          >
            <p className="text-sm" style={{ color: '#94a3b8' }}>
              Historique d'activité — bientôt disponible
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── KPI Card ───────────────────────────────────────────── */
function KpiCard({ label, value, sub, valueColor = '#0f172a', capitalize = false }) {
  return (
    <div
      className="rounded-xl px-5 py-5"
      style={{ background: 'white', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
        {label}
      </p>
      <p
        className="text-3xl font-bold leading-none mb-1.5"
        style={{ color: valueColor, textTransform: capitalize ? 'capitalize' : 'none' }}
      >
        {value}
      </p>
      <p className="text-xs" style={{ color: '#cbd5e1' }}>{sub}</p>
    </div>
  )
}

/* ── Table agents ───────────────────────────────────────── */
function AgentTable({ agents }) {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid #e2e8f0', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}
    >
      {/* En-tête table */}
      <div
        className="grid grid-cols-12 px-5 py-3 text-xs font-semibold uppercase tracking-wider"
        style={{ color: '#94a3b8', borderBottom: '1px solid #f1f5f9', background: '#fafafa' }}
      >
        <span className="col-span-4">Nom</span>
        <span className="col-span-4">Description</span>
        <span className="col-span-2">Statut</span>
        <span className="col-span-2 text-right">Action</span>
      </div>

      {/* Lignes */}
      {agents.map((agent, i) => (
        <div
          key={agent.id}
          className="grid grid-cols-12 px-5 py-3.5 items-center transition-colors"
          style={{
            borderBottom: i < agents.length - 1 ? '1px solid #f8fafc' : 'none',
            color: '#334155',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          <div className="col-span-4 flex items-center gap-3">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: '#eff6ff', color: '#2563eb' }}
            >
              {agent.name[0]?.toUpperCase()}
            </div>
            <span className="text-sm font-medium truncate" style={{ color: '#0f172a' }}>
              {agent.name}
            </span>
          </div>

          <div className="col-span-4">
            <span className="text-sm truncate" style={{ color: '#64748b' }}>
              {agent.description || <span style={{ color: '#cbd5e1' }}>—</span>}
            </span>
          </div>

          <div className="col-span-2">
            <StatusBadge status={agent.status} />
          </div>

          <div className="col-span-2 flex justify-end">
            <Link
              to={`/agents/${agent.id}`}
              className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: '#2563eb', background: '#eff6ff' }}
              onMouseEnter={e => e.currentTarget.style.background = '#dbeafe'}
              onMouseLeave={e => e.currentTarget.style.background = '#eff6ff'}
            >
              Ouvrir →
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Skeleton ───────────────────────────────────────────── */
function AgentTableSkeleton() {
  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ border: '1px solid #e2e8f0', background: 'white' }}
    >
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="px-5 py-4 flex items-center gap-4"
          style={{ borderBottom: i < 3 ? '1px solid #f8fafc' : 'none' }}
        >
          <div className="w-7 h-7 rounded-lg animate-pulse" style={{ background: '#f1f5f9' }} />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 rounded animate-pulse w-1/3" style={{ background: '#f1f5f9' }} />
            <div className="h-2.5 rounded animate-pulse w-1/2" style={{ background: '#f8fafc' }} />
          </div>
          <div className="h-5 w-14 rounded-full animate-pulse" style={{ background: '#f1f5f9' }} />
        </div>
      ))}
    </div>
  )
}

/* ── Empty state ────────────────────────────────────────── */
function EmptyAgents() {
  return (
    <div
      className="rounded-xl flex flex-col items-center justify-center py-16 text-center"
      style={{ border: '2px dashed #e2e8f0', background: 'white' }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center mb-4"
        style={{ background: '#eff6ff' }}
      >
        <svg className="w-6 h-6" style={{ color: '#2563eb' }} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
        </svg>
      </div>
      <p className="text-sm font-medium mb-1" style={{ color: '#0f172a' }}>Aucun agent créé</p>
      <p className="text-xs mb-5" style={{ color: '#94a3b8' }}>
        Créez votre premier agent pour commencer
      </p>
      <Link to="/agents">
        <Button size="sm">Créer un agent</Button>
      </Link>
    </div>
  )
}

/* ── StatusBadge (exporté pour les autres pages) ────────── */
export function StatusBadge({ status }) {
  const styles = {
    active:   { background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0' },
    draft:    { background: '#fefce8', color: '#d97706', border: '1px solid #fde68a' },
    archived: { background: '#f8fafc', color: '#64748b', border: '1px solid #e2e8f0' },
  }
  const labels = { active: 'Actif', draft: 'Brouillon', archived: 'Archivé' }
  return (
    <span
      className="inline-flex items-center text-xs font-medium px-2.5 py-1 rounded-full"
      style={styles[status] ?? styles.draft}
    >
      <span
        className="w-1.5 h-1.5 rounded-full mr-1.5"
        style={{ background: (styles[status] ?? styles.draft).color }}
      />
      {labels[status] ?? status}
    </span>
  )
}
