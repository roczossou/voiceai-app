#!/bin/sh
# ── Déploiement Render en UNE SEULE app (backend + frontend + widget) ──
# Usage : ./deploy-render.sh   (depuis la racine du repo, sur ta machine)
set -e

echo "==> Build frontend"
cd frontend && npm install && npm run build && cd ..

echo "==> Build widget"
cd widget && npm install && npm run build && cd ..

echo "==> Commit + push (Render déploie automatiquement au push sur main)"
git add -A
git commit -m "deploy: build frontend+widget pour Render

Co-Authored-By: Claude Code <noreply@anthropic.com>" || echo "(rien à committer)"
git push origin main

echo "==> OK. Sur Render :"
echo "    New Web Service → repo roczossou/voiceAI → Root Directory: backend"
echo "    Build: npm install && npm run build:all   Start: npm start"
echo "    Puis renseigne les variables d'env (voir backend/.env.example)"
