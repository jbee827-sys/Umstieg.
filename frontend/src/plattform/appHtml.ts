/**
 * Die index.html der iOS-App (Plan App Store, Paket 2).
 *
 * In der App liefert kein Vercel die Seite aus - die Dateien liegen im
 * App-Paket (Richtlinie 2.5.2), und die Kopfzeilen aus `vercel.json` gelten
 * nicht. Drei Änderungen gegenüber der Web-Fassung:
 *
 * - Die CSP steht als <meta>. Sie wird aus `vercel.json` abgeleitet, nicht
 *   abgeschrieben: Kommt dort eine Quelle hinzu (Kartenkacheln, Backend),
 *   gilt sie in der App von selbst.
 * - `viewport-fit=cover`: Erst damit reicht die Seite unter Statusleiste und
 *   Home-Balken, und `env(safe-area-inset-*)` liefert echte Werte (App.css).
 * - Der Vortext für Suchmaschinen fällt weg - in der App liest ihn niemand.
 *
 * Nur Zeichenketten, kein DOM: Die Funktion läuft im Vite-Build unter Node.
 */

interface Kopfzeile {
  key: string
  value: string
}

export interface VercelKonfiguration {
  headers?: { source: string; headers: Kopfzeile[] }[]
}

/**
 * Nur als HTTP-Kopfzeile wirksam; als <meta> verwirft der Browser sie mit
 * einer Fehlermeldung in der Konsole (CSP Level 3, Abschnitt 6.1).
 */
const NUR_KOPFZEILE = ['frame-ancestors', 'report-uri', 'sandbox']

export function cspAusVercel(vercel: VercelKonfiguration): string {
  const csp = vercel.headers
    ?.flatMap((regel) => regel.headers)
    .find((kopf) => kopf.key === 'Content-Security-Policy')?.value
  if (!csp) throw new Error('vercel.json: keine Content-Security-Policy gefunden')
  return csp
    .split(';')
    .map((anweisung) => anweisung.trim())
    .filter((anweisung) => anweisung && !NUR_KOPFZEILE.includes(anweisung.split(/\s+/)[0]))
    .join('; ')
}

/** Ersetzt genau einmal - fehlt die Stelle, bricht der Build ab statt still eine Web-Seite auszuliefern. */
function ersetze(html: string, suche: string | RegExp, durch: string, was: string): string {
  const neu = html.replace(suche, durch)
  if (neu === html) throw new Error(`index.html für die App: ${was} nicht gefunden`)
  return neu
}

export function appHtml(html: string, csp: string): string {
  let seite = ersetze(
    html,
    /<!-- vortext:anfang -->[\s\S]*<!-- vortext:ende -->/,
    '',
    'Vortext-Markierungen',
  )
  seite = ersetze(
    seite,
    /<meta name="viewport" content="([^"]*)" \/>/,
    '<meta name="viewport" content="$1, viewport-fit=cover" />',
    'Viewport-Angabe',
  )
  seite = ersetze(
    seite,
    '<meta charset="UTF-8" />',
    `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
    'Zeichensatz-Angabe',
  )
  return seite
}
