/**
 * Kopfdaten und Inhalt vorgerenderter Seiten (Konzept Nutzergewinnung,
 * AP 2/3/5).
 *
 * Gearbeitet wird auf dem Text von `index.html`, nicht auf einem DOM: Das
 * Build-Skript laeuft in Node, und dort gibt es keinen DOMParser. Jede
 * Ersetzung muss genau einmal greifen - sonst bricht der Build ab, statt
 * still eine Seite mit dem Titel der Startseite auszuliefern.
 */
export const BASIS_URL = 'https://www.umstieg.online'

export interface Kopfangaben {
  titel: string
  /** Fehlt sie, entfallen auch og:/twitter:description (Rechtsseiten). */
  beschreibung?: string
  /** Pfad ab `/`, ohne Schraegstrich am Ende. */
  pfad: string
}

/** Fuer Text zwischen Tags und in Attributwerten in doppelten Anfuehrungszeichen. */
export function maskiere(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function ersetzeGenauEinmal(html: string, muster: RegExp, ersatz: string, was: string): string {
  const treffer = html.match(new RegExp(muster.source, 'g'))
  if (treffer?.length !== 1) {
    throw new Error(`index.html: ${was} ${treffer ? `${treffer.length}-mal` : 'nicht'} gefunden`)
  }
  return html.replace(muster, () => ersatz)
}

const meta = (attribut: 'name' | 'property', schluessel: string) =>
  new RegExp(`<meta\\s+${attribut}="${schluessel}"\\s+content="[^"]*"\\s*/>`)

export function setzeKopf(html: string, k: Kopfangaben): string {
  const url = `${BASIS_URL}${k.pfad}`
  const titel = maskiere(k.titel)
  let neu = html
  neu = ersetzeGenauEinmal(neu, /<title>[^<]*<\/title>/, `<title>${titel}</title>`, 'title')
  neu = ersetzeGenauEinmal(
    neu,
    /<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/,
    `<link rel="canonical" href="${maskiere(url)}" />`,
    'canonical',
  )
  neu = ersetzeGenauEinmal(neu, meta('property', 'og:url'), `<meta property="og:url" content="${maskiere(url)}" />`, 'og:url')
  neu = ersetzeGenauEinmal(neu, meta('property', 'og:title'), `<meta property="og:title" content="${titel}" />`, 'og:title')
  neu = ersetzeGenauEinmal(neu, meta('name', 'twitter:title'), `<meta name="twitter:title" content="${titel}" />`, 'twitter:title')

  const beschreibungen: ['name' | 'property', string][] = [
    ['name', 'description'],
    ['property', 'og:description'],
    ['name', 'twitter:description'],
  ]
  for (const [attribut, schluessel] of beschreibungen) {
    const ersatz =
      k.beschreibung === undefined
        ? ''
        : `<meta ${attribut}="${schluessel}" content="${maskiere(k.beschreibung)}" />`
    neu = ersetzeGenauEinmal(neu, meta(attribut, schluessel), ersatz, schluessel)
  }

  // Der JSON-LD-Block beschreibt die App unter `/`. Unterseiten bringen bei
  // Bedarf ihren eigenen mit (Bahnhofsseiten: TrainStation).
  neu = ersetzeGenauEinmal(neu, /\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/, '', 'JSON-LD')
  return neu
}

/**
 * Ersetzt den Vortext im Wurzelelement durch `markup`. Die Markierungen
 * stehen in index.html; createRoot().render() raeumt beim Start alles
 * zwischen ihnen mit ab (statisch/rechtsseiten.test.tsx).
 */
export function setzeWurzel(html: string, markup: string): string {
  return ersetzeGenauEinmal(
    html,
    /<!-- vortext:anfang -->[\s\S]*<!-- vortext:ende -->/,
    `<!-- vortext:anfang -->${markup}<!-- vortext:ende -->`,
    'Vortext-Markierungen',
  )
}
