import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

/**
 * P2 der Haertung: Content-Security-Policy in `vercel.json`.
 *
 * Vercel liefert nur den statischen Frontend-Build aus, `vercel.json` ist die
 * einzige Stelle, an der dieser Header gesetzt werden kann - es gibt keinen
 * eigenen Server, den ein Test wie beim Backend (`app.inject()`) befragen
 * koennte. Geprueft wird deshalb die Konfigurationsdatei selbst.
 *
 * Jede Quelle hier ist im Code belegt, nicht geraten - sonst zerschiesst eine
 * zu strenge Policy die Karte oder den Live-Strom in Produktion, was
 * schlimmer waere als gar keine CSP:
 *
 *   - Kartenkacheln: `frontend/src/components/Karte.tsx` (tile.openstreetmap.org)
 *   - SSE-Strom + API: `frontend/src/api/sse.ts`, `frontend/src/api/basis.ts`
 *     (VITE_API_BASE zeigt in Produktion auf https://umstieg-backend.fly.dev,
 *     siehe README "Deployment-Stand")
 *   - Vercel Web Analytics: `frontend/src/analytik/ereignis.ts` laedt per
 *     Default `/_vercel/insights/script.js` - SAME-ORIGIN, keine fremde
 *     Domain noetig (node_modules/@vercel/analytics/dist/index.js)
 *   - Schriften liegen lokal (`frontend/src/assets/fonts/`, `index.css`) -
 *     ausdruecklich KEIN Google Fonts
 */

const hier = dirname(fileURLToPath(import.meta.url))
const vercelJsonPfad = resolve(hier, '../../../vercel.json')

function csp(): string {
  const config = JSON.parse(readFileSync(vercelJsonPfad, 'utf-8')) as {
    headers: { source: string; headers: { key: string; value: string }[] }[]
  }
  const regel = config.headers.find((h) => h.source === '/(.*)')
  const eintrag = regel?.headers.find((h) => h.key === 'Content-Security-Policy')
  if (!eintrag) throw new Error('Content-Security-Policy-Header fehlt in vercel.json')
  return eintrag.value
}

describe('Content-Security-Policy in vercel.json (Haertung P2)', () => {
  it('setzt ein restriktives default-src als Grundlage', () => {
    expect(csp()).toMatch(/(?:^|;\s*)default-src 'self'/)
  })

  it('erlaubt die OSM-Kartenkacheln, die Karte.tsx tatsaechlich laedt', () => {
    expect(csp()).toMatch(/img-src[^;]*https:\/\/tile\.openstreetmap\.org/)
    // MapLibre holt Kacheln per fetch() und dekodiert sie selbst (siehe
    // Karte-Bundle: createImageBitmap) - das faellt unter connect-src, nicht
    // img-src.
    expect(csp()).toMatch(/connect-src[^;]*https:\/\/tile\.openstreetmap\.org/)
  })

  it('erlaubt den SSE-Strom und die API-Aufrufe zum Fly.io-Backend', () => {
    expect(csp()).toMatch(/connect-src[^;]*https:\/\/umstieg-backend\.fly\.dev/)
  })

  it('erlaubt MapLibres Web Worker (eigener Chunk, mit blob:-Fallback)', () => {
    expect(csp()).toMatch(/worker-src[^;]*'self'/)
    expect(csp()).toMatch(/worker-src[^;]*blob:/)
  })

  it('erlaubt Vercel Web Analytics ohne fremde Domain zuzulassen', () => {
    // Das Skript laedt same-origin (/_vercel/insights/script.js) - 'self'
    // in script-src reicht, es muss KEINE Analytics-Domain aufgenommen
    // werden.
    expect(csp()).toMatch(/script-src[^;]*'self'/)
  })

  it('laesst keine fremden Schriften zu - Schriften liegen lokal', () => {
    expect(csp()).not.toMatch(/fonts\.googleapis\.com/)
    expect(csp()).not.toMatch(/fonts\.gstatic\.com/)
    expect(csp()).toMatch(/font-src[^;]*'self'/)
  })

  it('untersagt eingebettete Plugins und das Einrahmen der Seite', () => {
    expect(csp()).toMatch(/object-src[^;]*'none'/)
    expect(csp()).toMatch(/frame-ancestors[^;]*'none'/)
  })
})
