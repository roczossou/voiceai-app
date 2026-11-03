import { defineConfig } from 'vite'

// Build autonome en un seul fichier IIFE (widget.js) que les clients collent
// via <script>. Preact + JSX automatique (preact/jsx-runtime), CSS inliné dans
// le Shadow DOM → aucun fichier .css séparé. Objectif : < 30 KB gzip.
export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  server: {
    port: 5174,
    host: true,          // accessible depuis le réseau local (tél.)
    allowedHosts: true,  // autorise l'accès via l'IP LAN (ex: 192.168.1.42:5174)
    // En dev, le widget passe par le proxy Vite (même origine) plutôt que
    // directement vers le backend : le WS Live (/api/v1/live) a besoin de
    // ws:true, et le micro a besoin d'un contexte sécurisé (https si la page
    // de démo est en https).
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    lib: {
      entry: 'src/main.jsx',
      name: 'VoiceAIWidget',
      fileName: () => 'widget.js',
      formats: ['iife'],
    },
    cssCodeSplit: false,
    // Un seul asset, pas de hash → URL stable pour le snippet client
    rollupOptions: {
      output: { assetFileNames: 'widget.[ext]', entryFileNames: 'widget.js' },
    },
  },
})
