# Build du frontend dashboard pour Render Static Site
# Dashboard Render → New → Static Site → repo github.com/roczossou/voiceAI
#   Root Directory: frontend
#   Build Command:  npm install && npm run build
#   Publish Directory: dist
#
# ⚠️ Le dashboard en https appelle l'API backend : définis VITE_API_URL dans les
#    env vars du static site Render, ex: VITE_API_URL=https://voiceai-backend.onrender.com/api/v1
#    Le WebSocket Live utilisera alors wss://voiceai-backend.onrender.com automatiquement.
#
# Alternative simple : servir le frontend buildé PAR le backend (voir ci-dessous),
# dans ce cas pas de static site séparé.
