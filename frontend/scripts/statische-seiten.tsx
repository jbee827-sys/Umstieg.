// Schreibt nach `vite build` die vorgerenderten Seiten nach dist/ (Konzept
// Nutzergewinnung, 21.10.2026):
//
// - /impressum, /datenschutz (AP 3.4) - auf Grundlage der gebauten
//   index.html, mit JavaScript startet darauf die App
// - /bahnhof/<slug> je Bahnhof aus src/bahnhofsseiten/daten/ und die
//   Uebersicht /bahnhoefe (AP 5b) - eigenstaendig, ohne App
// - /sitemap.xml (AP 2, 5c)
// - dazu unter /assets/ mit Hash: die gemeinsame CSS-Datei (index.css +
//   bahnhofsseiten.css, Schriften auf die von Vite gelegten Dateien
//   umgeschrieben) und messung.js - die CSP erlaubt nichts Inline.
//
// Vercel liefert vorhandene Dateien vor der Umschreibung `/(.*) → /index.html`
// aus. /impressum trifft damit dist/impressum/index.html.
//
// Die Daten entstehen im Backend: `cd backend && npm run bahnhofsseiten`.
//
// Aufruf (Teil von `npm run build`):
//   tsx --tsconfig tsconfig.app.json scripts/statische-seiten.tsx
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bahnhofsseiteHtml, BAHNHOF_PFAD, sitemapXml, uebersichtHtml, type Bauteile } from '../src/bahnhofsseiten/seiten'
import type { Bahnhofsdaten } from '../src/bahnhofsseiten/typen'
import { rechtsseiteHtml } from '../src/statisch/rechtsseiten'

const DIST = fileURLToPath(new URL('../dist/', import.meta.url))
const SRC = fileURLToPath(new URL('../src/', import.meta.url))
const ASSETS = join(DIST, 'assets')

function schreibeSeite(pfad: string, html: string): void {
  const ordner = join(DIST, pfad)
  mkdirSync(ordner, { recursive: true })
  writeFileSync(join(ordner, 'index.html'), html, 'utf8')
}

/** Legt `inhalt` mit Inhalts-Hash unter /assets/ ab - wie Vite, damit es lange gecacht werden darf. */
function alsAsset(name: string, endung: string, inhalt: string | Buffer): string {
  const hash = createHash('sha256').update(inhalt).digest('base64url').slice(0, 8)
  const datei = `${name}-${hash}.${endung}`
  mkdirSync(ASSETS, { recursive: true })
  writeFileSync(join(ASSETS, datei), inhalt)
  return `/assets/${datei}`
}

/**
 * Die Schriftdatei, die Vite fuer die App schon gelegt hat - gefunden ueber
 * den Inhalt, nicht ueber den Namen. So laedt ein Besucher, der von einer
 * Bahnhofsseite in die App wechselt, die Schrift nicht zweimal. Fehlt sie,
 * wird sie selbst abgelegt.
 */
function schrift(datei: string): string {
  const inhalt = readFileSync(join(SRC, 'assets', 'fonts', datei))
  for (const kandidat of readdirSync(ASSETS)) {
    if (!kandidat.endsWith('.woff2')) continue
    if (readFileSync(join(ASSETS, kandidat)).equals(inhalt)) return `/assets/${kandidat}`
  }
  return alsAsset(datei.replace(/\.woff2$/, ''), 'woff2', inhalt)
}

function bauteile(): Bauteile {
  const basis = readFileSync(join(SRC, 'index.css'), 'utf8').replace(
    /url\('\.\/assets\/fonts\/([^']+)'\)/g,
    (_, datei: string) => `url('${schrift(datei)}')`,
  )
  const eigen = readFileSync(join(SRC, 'bahnhofsseiten', 'bahnhofsseiten.css'), 'utf8')
  return {
    css: alsAsset('bahnhofsseiten', 'css', `${basis}\n${eigen}`),
    messung: alsAsset('messung', 'js', readFileSync(join(SRC, 'bahnhofsseiten', 'messung.js'))),
  }
}

function ladeDaten(): Bahnhofsdaten[] {
  const ordner = join(SRC, 'bahnhofsseiten', 'daten')
  return readdirSync(ordner)
    .filter((d) => d.endsWith('.json'))
    .map((d) => JSON.parse(readFileSync(join(ordner, d), 'utf8')) as Bahnhofsdaten)
    // Stufe 3 hat keine Seite (Konzept 5a.2) - das Skript schreibt sie gar
    // nicht erst; doppelt haelt besser.
    .filter((d) => d.stufe !== 3)
}

const vorlage = readFileSync(join(DIST, 'index.html'), 'utf8')
for (const seite of ['impressum', 'datenschutz'] as const) {
  schreibeSeite(seite, rechtsseiteHtml(vorlage, seite))
}

const teile = bauteile()
const alle = ladeDaten()
for (const d of alle) schreibeSeite(BAHNHOF_PFAD(d.slug), bahnhofsseiteHtml(d, teile))
schreibeSeite('bahnhoefe', uebersichtHtml(alle, teile))
writeFileSync(join(DIST, 'sitemap.xml'), sitemapXml(alle, new Date().toISOString().slice(0, 10)), 'utf8')

console.log(
  `statische Seiten: impressum, datenschutz, bahnhoefe, ${alle.length} Bahnhofsseiten, sitemap.xml (${teile.css}, ${teile.messung})`,
)
