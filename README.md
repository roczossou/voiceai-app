# voiceAI — SaaS d'agents conversationnels (chat + voix) avec widget embarquable

Monorepo : `backend/` (Express 5 + Prisma 7 + Neon + WebSocket Live), `frontend/` (React 19 + Vite, dashboard), `widget/` (Preact, build IIFE ~11 Ko gzip).

## Démarrer en local (Windows)

```bat
cd backend  && npm install && npm run db:generate && npm run dev   :: API sur :4000 (copier .env.example -> .env)
cd frontend && npm install && npm run dev                           :: dashboard https://localhost:5173
cd widget   && npm install && npm run dev                           :: démo widget http://localhost:5174
```

Téléphone sur le même Wi-Fi : `https://<IP_LAN>:5173` (accepter le certificat auto-signé).

## Déployer sur Render

Voir `render.yaml` / `deploy-render.sh` : un seul Web Service sert l'API, le dashboard buildé et `widget.js`.

- **Root Directory** : `backend`
- **Build** : `npm install && npm run build:all`
- **Start** : `npm start`
- Env vars : voir `backend/.env.example` (jamais de secrets commités).

## Widget chez un client

```html
<script src="https://<ton-app>.onrender.com/widget.js" data-agent-key="pk_..."></script>
```

## Voice Live

WebSocket `wss://<hôte>/api/v1/live` (modèles Gemini Live natifs, voix PrebuiltVoice, barge-in, tool-calls RDV). Configurable par agent dans le dashboard (mode vocal = Live, modèle, voix).
