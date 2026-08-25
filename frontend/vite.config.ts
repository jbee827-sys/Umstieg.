import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  server: {
    // Alle API-Aufrufe gehen ans Fastify-Backend – das Frontend spricht nie
    // direkt mit Overpass/DB-APIs (Fairness- und Schlüsselschutz-Prinzip).
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
