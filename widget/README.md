# Voice AI — Widget embarquable

Widget de chat autonome (Preact + Shadow DOM) que les clients collent sur leur
site via une seule balise `<script>`. Bundle **~9 KB gzip**, styles totalement
isolés de la page hôte (Shadow DOM).

## Dev

```bash
npm install
npm run dev      # http://localhost:5174 — page de test index.html
npm run build    # → dist/widget.js (IIFE, un seul fichier)
```

La page de test (`index.html`) pointe déjà sur l'API backend en `http://localhost:4000`.

## Installation chez le client

```html
<script src="https://api.votredomaine.app/widget.js"
        data-agent-key="pk_xxxxxxxx"></script>
```

| Attribut | Requis | Rôle |
|---|---|---|
| `data-agent-key` | oui | Clé publique de l'agent (`Agent.publicKey`). Alias : `data-key`. |
| `data-api` | non | Base de l'API. Par défaut = origine d'où `widget.js` est servi. |

## Fonctionnement

1. Le script crée un hôte `<div id="voice-ai-widget-host">` + Shadow DOM et monte l'UI.
2. À l'ouverture, `GET /api/v1/public/agents/:key/config` charge l'apparence
   (couleur, position, titre, avatar, message d'accueil) depuis `Agent.config.appearance`.
3. Chaque message part en `POST /api/v1/public/chat` (header `X-Agent-Key`,
   `sessionId` persistant en localStorage) et la réponse est **streamée en SSE**.

## Sécurité

- Auth par clé publique d'agent — jamais de JWT ni de cookie côté widget.
- L'agent doit avoir `status = "published"` (sinon 403).
- `Agent.allowedOrigins` : si non vide, seules ces origines sont acceptées
  (sinon 403). Vide = ouvert (pratique en dev). Le `tenantId` est toujours
  résolu côté serveur depuis la clé, jamais depuis la requête.

## Personnalisation (`Agent.config.appearance`)

```json
{
  "appearance": {
    "primaryColor": "#7c3aed",
    "position": "bottom-right",
    "title": "Assistant",
    "greeting": "Bonjour 👋 Comment puis-je vous aider ?",
    "avatarUrl": "https://…/avatar.png"
  }
}
```
