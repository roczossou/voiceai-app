import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss(), basicSsl()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    host: true, // écoute sur 0.0.0.0 → accessible depuis le réseau local (tél.)
    // allowedHosts: autorise l'accès via l'IP LAN (ex: https://192.168.1.42:5173).
    // Sans ça, Vite bloque la requête "Blocked request. This host is not allowed".
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        // ⚠️ indispensable pour la voix Live depuis le téléphone : le WS
        // /api/v1/live passe par le proxy Vite (même origine, même certificat
        // auto-signé accepté) au lieu d'un ws:// direct vers le backend.
        ws: true,
      },
    },
  },
})
