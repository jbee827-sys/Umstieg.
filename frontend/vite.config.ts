import { existsSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Geolocation braucht einen sicheren Kontext. Liegen lokale Zertifikate
// vor (mkcert, siehe README), laeuft der Dev-Server ueber HTTPS – nur so
// ist das Standort-Feature auf einem echten Mobilgeraet testbar.
const zertifikat = existsSync('.cert/key.pem')
  ? { key: readFileSync('.cert/key.pem'), cert: readFileSync('.cert/cert.pem') }
  : undefined

export default defineConfig({
  plugins: [react()],
  server: {
    https: zertifikat,
    host: true,
    // Alle API-Aufrufe gehen ans Fastify-Backend – das Frontend spricht nie
    // direkt mit Overpass/DB-APIs (Fairness- und Schlüsselschutz-Prinzip).
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
})
