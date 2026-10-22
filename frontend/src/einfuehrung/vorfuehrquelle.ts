import { setzeVorschalter } from '../api/basis'
import type { BahnhofTreffer, Ort, RouteErgebnis, TafelEintrag } from '../api/typen'

/**
 * Die Datenquelle der Einführungstour (Plan Einführungstour, Paket 2).
 *
 * Solange sie aktiv ist, beantwortet sie jeden Abruf unter `/api/` aus der
 * Aufzeichnung (`daten/`, erzeugt von `backend/scripts/vorfuehrdaten.ts`) -
 * nach dem Muster des Abzugs (`scripts/app-abzug.ts`): Die Bildschirme
 * bleiben die echten, nur die Quelle ist eine andere. Kein Netz, kein Backend.
 */

/** Antwort, wie /api/route sie gäbe - Form aus backend/scripts/vorfuehrdaten.ts. */
export type Aufzeichnung =
  | { status: 200; antwort: RouteErgebnis }
  | { status: 404; antwort: { fehler: string; detail: string; hinweise: string[] } }

export interface Vorfuehrdaten {
  eva: string
  gleisAn: string
  gleisAb: string
  startbestandVom: string
  /** Schlüssel `variante|abschnitt`. */
  routen: Record<string, Aufzeichnung>
}

const BAHNHOF: BahnhofTreffer = { name: 'Berlin Hbf', eva: '8011160', lat: 52.5251, lon: 13.3694 }

/**
 * Berlin Hbf als Ort. Bewusst ohne Haltestellen-ID: So bleibt die Tour im
 * Bahnhofspfad, und die Eingabe fragt keine Haltestellentafel ab, die es in
 * der Aufzeichnung nicht gibt.
 */
export const BEISPIEL_ORT: Ort = { ...BAHNHOF, verkehrsmittel: ['bahn'] }

/**
 * „HH:MM“ in `minuten` ab jetzt - nach der LOKALEN Uhr. Die Tafelauswahl
 * (api/tafelauswahl.ts) und die Restzeit der Ampel (`heuteUm` in App.tsx)
 * lesen die Zeichenkette ebenfalls mit `getHours()`; mit einer anderen Zone
 * hier stünde der Anschluss neben der Ampel um Stunden verschoben.
 */
function inMinuten(jetzt: Date, minuten: number): string {
  const d = new Date(jetzt.getTime() + minuten * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Die beiden Züge der Beispielreise, mit Zeiten relativ zu `jetzt`. */
export function beispielZuege(jetzt: Date): { ankunft: TafelEintrag; abfahrt: TafelEintrag } {
  return {
    ankunft: { zug: 'ICE 945', zeitSoll: inMinuten(jetzt, 2), gleisSoll: '14', ziel: 'Köln Hbf' },
    abfahrt: { zug: 'ICE 1007', zeitSoll: inMinuten(jetzt, 13), gleisSoll: '6', ziel: 'München Hbf' },
  }
}

/** Die Tafeln: die beiden Beispielzüge und je drei weitere, damit sie wie Tafeln aussehen. */
export function vorfuehrTafel(typ: 'arr' | 'dep', jetzt: Date): TafelEintrag[] {
  const { ankunft, abfahrt } = beispielZuege(jetzt)
  if (typ === 'arr') {
    return [
      { zug: 'RE 1', zeitSoll: inMinuten(jetzt, -4), gleisSoll: '13', ziel: 'Magdeburg Hbf' },
      ankunft,
      { zug: 'RB 23', zeitSoll: inMinuten(jetzt, 6), gleisSoll: '15', ziel: 'Golm' },
      { zug: 'ICE 1702', zeitSoll: inMinuten(jetzt, 9), gleisSoll: '2', ziel: 'München Hbf' },
    ]
  }
  return [
    { zug: 'RE 2', zeitSoll: inMinuten(jetzt, 4), gleisSoll: '12', ziel: 'Cottbus Hbf' },
    abfahrt,
    { zug: 'RE 3', zeitSoll: inMinuten(jetzt, 16), gleisSoll: '1', ziel: 'Stralsund Hbf' },
    { zug: 'IC 2075', zeitSoll: inMinuten(jetzt, 21), gleisSoll: '14', ziel: 'Dresden Hbf' },
  ]
}

function antwort(koerper: unknown, status = 200): Response {
  return new Response(JSON.stringify(koerper), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function passt(name: string, suche: string): boolean {
  const s = suche.trim().toLowerCase()
  return s !== '' && name.toLowerCase().includes(s)
}

/** Eine Antwort auf `pfad`, so wie das Backend sie für die Beispielreise gäbe. */
function beantworte(pfad: string, daten: Vorfuehrdaten): Response {
  const url = new URL(pfad, 'http://vorfuehrung.invalid')
  const p = url.pathname
  const q = url.searchParams

  if (p === '/api/health') return antwort({ status: 'ok' })

  if (p === '/api/orte') {
    // Die Umkreissuche (lat/lon) findet nichts: Während der Tour soll ein
    // echter Standort keinen Bahnhof vorschlagen.
    const orte = passt(BEISPIEL_ORT.name, q.get('q') ?? '') ? [BEISPIEL_ORT] : []
    return antwort({ orte, quellen: { bahnhoefe: 'ok', haltestellen: 'ok' } })
  }

  if (p === '/api/stations') {
    return antwort(passt(BAHNHOF.name, q.get('q') ?? '') ? [BAHNHOF] : [])
  }

  if (p.startsWith('/api/board/')) {
    const eva = decodeURIComponent(p.slice('/api/board/'.length))
    const typ = q.get('type') === 'arr' ? 'arr' : 'dep'
    return antwort(eva === daten.eva ? vorfuehrTafel(typ, new Date()) : [])
  }

  if (p === '/api/route') {
    const reise = q.get('eva') === daten.eva && q.get('gleisAn') === daten.gleisAn && q.get('gleisAb') === daten.gleisAb
    const schluessel = `${q.get('variante') ?? 'schnellste'}|${q.get('abschnitt') ?? 'mitte'}`
    const treffer = reise ? daten.routen[schluessel] : undefined
    if (treffer) return antwort(treffer.antwort, treffer.status)
    return antwort(
      { fehler: 'keine-route', detail: 'Für diese Kombination ist in der Einführung keine Route aufgezeichnet.', hinweise: [] },
      404,
    )
  }

  // Hilft beim Finden fehlender Aufzeichnungen: Fragt die App etwas Neues,
  // steht es hier, statt dass die Tour still ins Leere läuft.
  console.warn(`Einführung: nicht aufgezeichnet – ${p}`)
  return antwort({ fehler: 'nicht-aufgezeichnet' }, 404)
}

export function aktiviereVorfuehrquelle(daten: Vorfuehrdaten): void {
  setzeVorschalter((pfad) => Promise.resolve(beantworte(pfad, daten)))
}

export function deaktiviereVorfuehrquelle(): void {
  setzeVorschalter(null)
}
