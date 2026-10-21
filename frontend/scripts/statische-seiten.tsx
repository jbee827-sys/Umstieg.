// Schreibt nach `vite build` die vorgerenderten Seiten nach dist/ (Konzept
// Nutzergewinnung, 21.10.2026): Impressum und Datenschutz (AP 3.4).
//
// Vercel liefert vorhandene Dateien vor der Umschreibung `/(.*) → /index.html`
// aus. /impressum trifft damit dist/impressum/index.html - lesbar ohne
// JavaScript, mit eigenem Titel und eigener kanonischer Adresse. Mit
// JavaScript startet darauf die App und zeigt dieselbe Seite.
//
// Aufruf (Teil von `npm run build`):
//   tsx --tsconfig tsconfig.app.json scripts/statische-seiten.tsx
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rechtsseiteHtml } from '../src/statisch/rechtsseiten'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))

function schreibe(pfad: string, html: string): void {
  const ordner = join(DIST, pfad)
  mkdirSync(ordner, { recursive: true })
  writeFileSync(join(ordner, 'index.html'), html, 'utf8')
}

const vorlage = readFileSync(join(DIST, 'index.html'), 'utf8')
for (const seite of ['impressum', 'datenschutz'] as const) {
  schreibe(seite, rechtsseiteHtml(vorlage, seite))
}
console.log('statische Seiten: impressum, datenschutz')
