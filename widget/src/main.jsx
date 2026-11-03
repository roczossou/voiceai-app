import { render } from 'preact'
import { Widget } from './Widget.jsx'
import { css } from './styles.js'

// ── Configuration lue depuis la balise <script> d'installation ───────────────
// <script src="https://…/widget.js" data-agent-key="pk_…" [data-api="https://…"]></script>
function readConfig() {
  const el = document.currentScript
    || Array.from(document.getElementsByTagName('script')).find(s => /widget(\.\w+)?\.js/.test(s.src))

  const agentKey = el?.getAttribute('data-agent-key') || el?.getAttribute('data-key')
  // Base API : data-api explicite (backend exposé en public), sinon VIDE =
  // même origine que la page hôte (proxy dev, ou même domaine en prod).
  // Le WS Live dérivera wss://<hôte de la page> automatiquement.
  let apiBase = el?.getAttribute('data-api') || ''
  apiBase = apiBase.replace(/\/$/, '')

  return { agentKey, apiBase }
}

function mount() {
  const { agentKey, apiBase } = readConfig()
  if (!agentKey) {
    console.error('[VoiceAI Widget] data-agent-key manquant sur la balise <script>.')
    return
  }

  // Hôte + Shadow DOM : isolation totale des styles vis-à-vis de la page cliente
  const host = document.createElement('div')
  host.id = 'voice-ai-widget-host'
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })

  const style = document.createElement('style')
  style.textContent = css
  shadow.appendChild(style)

  const mountPoint = document.createElement('div')
  shadow.appendChild(mountPoint)

  render(<Widget apiBase={apiBase} agentKey={agentKey} host={host} />, mountPoint)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount)
} else {
  mount()
}
