import { existsSync, readFileSync } from 'node:fs'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { appHtml, cspAusVercel } from './src/plattform/appHtml.ts'

// Geolocation braucht einen sicheren Kontext. Liegen lokale Zertifikate
// vor (mkcert, siehe README), laeuft der Dev-Server ueber HTTPS – nur so
// ist das Standort-Feature auf einem echten Mobilgeraet testbar.
const zertifikat = existsSync('.cert/key.pem')
  ? { key: readFileSync('.cert/key.pem'), cert: readFileSync('.cert/cert.pem') }
  : undefined

/**
 * Die iOS-App (`npm run build:app`, Modus `app`) spricht immer mit dem
 * Backend auf Fly: Sie hat keinen Vite-Proxy und kein Vercel davor. Fest
 * eingetragen, nicht aus der Umgebung - ein App-Build ohne Backend-Adresse
 * waere eine App, die nichts findet.
 */
const APP_API_BASIS = 'https://umstieg-backend.fly.dev'

/** CSP als <meta>, sichere Raender, kein Vortext - siehe src/plattform/appHtml.ts. */
function appSeite(): Plugin {
  const csp = cspAusVercel(JSON.parse(readFileSync('../vercel.json', 'utf8')))
  return {
    name: 'umstieg-app-seite',
    transformIndexHtml: { order: 'pre', handler: (html) => appHtml(html, csp) },
  }
}

export default defineConfig(({ mode }) => {
  const app = mode === 'app'
  return {
    plugins: app ? [react(), appSeite()] : [react()],
    // Eigenes Ausgabeverzeichnis: Ein Web-Build (`dist`, mit vorgerenderten
    // Seiten und Vercel-Messung) soll nie versehentlich ins App-Paket geraten.
    ...(app && {
      define: { 'import.meta.env.VITE_API_BASE': JSON.stringify(APP_API_BASIS) },
      build: { outDir: 'dist-app' },
    }),
    server: {
      https: zertifikat,
      host: true,
      // Alle API-Aufrufe gehen ans Fastify-Backend – das Frontend spricht nie
      // direkt mit Overpass/DB-APIs (Fairness- und Schlüsselschutz-Prinzip).
      proxy: {
        '/api': 'http://localhost:3001',
      },
    },
  }
})
