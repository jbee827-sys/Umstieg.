import type { Bahnsteigabschnitt, RouteErgebnis, RoutenVariante } from '../api/typen'
import type { EingabeWerte } from '../components/Eingabe'
import type { Meldung } from '../meldungen/modell'

/**
 * Die laufende Reise, gesichert im Sitzungsspeicher dieses Tabs (Spec
 * 2026-10-11 Seitenuebergaenge, §4).
 *
 * Bis dahin lebte die Route nur im Arbeitsspeicher - bewusst, damit die
 * Anzeige ohne Netz weiterlaeuft. Ein Neuladen aber, versehentlich oder vom
 * Browser im Hintergrund erzwungen, verlor sie, und neu rechnen geht im
 * Bahnhof ohne Netz gerade nicht. Der Sitzungsspeicher ueberlebt das Neuladen
 * und endet mit dem Tab.
 */
export interface Reise {
  werte: EingabeWerte
  route: RouteErgebnis
  variante: RoutenVariante
  standort: Bahnsteigabschnitt
  gehzeiten: Record<string, number>
  meldungen: Meldung[]
  /** Schritt auf der Wegseite. */
  versatz: number
}

export const REISE_SCHLUESSEL = 'umstieg.reise'

/**
 * Hochzaehlen, sobald sich `Reise` aendert - wie im Eingabespeicher.
 *
 * Fassung 2 (Umstieg 2.0) kam mit `werte.haltestellen` hinzu. Eine Reise der
 * Fassung 1 ist ein Bahnhofspfad und in Fassung 2 unveraendert gueltig.
 */
const FASSUNG = 2
const LESBARE_FASSUNGEN = new Set([1, 2])

/** Aelter wird verworfen: sonst landete man am naechsten Morgen auf der gestrigen Route. */
export const REISE_HOECHSTALTER_MS = 6 * 3600 * 1000

interface Ablage {
  fassung: number
  gespeichertUm: number
  reise: Reise
}

// Wie im Eingabespeicher: Schon der Zugriff kann werfen (Safari privat,
// gesperrte Site-Daten). Ohne Speicher laeuft die App weiter, nur ohne
// Gedaechtnis ueber das Neuladen hinaus.
function speicher(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const VARIANTEN = new Set(['schnellste', 'einfachste', 'barrierefrei', 'mit-stopp'])
const STANDORTE = new Set(['anfang', 'mitte', 'ende'])

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === 'object' && wert !== null
}

/**
 * Prueft die Form, nicht den Inhalt - aus demselben Grund wie `istEntwurf`:
 * Was im Speicher steht, hat die App nicht in der Hand, und ein halb
 * passender Eintrag fiele erst viel spaeter an einer fremden Stelle auf.
 */
function istReise(wert: unknown): wert is Reise {
  if (!istObjekt(wert)) return false
  const { werte, route } = wert
  return (
    istObjekt(werte) &&
    typeof werte.eva === 'string' &&
    typeof werte.gleisAn === 'string' &&
    typeof werte.gleisAb === 'string' &&
    istObjekt(route) &&
    Array.isArray(route.schritte) &&
    typeof route.gehzeitSek === 'number' &&
    VARIANTEN.has(wert.variante as string) &&
    STANDORTE.has(wert.standort as string) &&
    istObjekt(wert.gehzeiten) &&
    Array.isArray(wert.meldungen) &&
    typeof wert.versatz === 'number' &&
    (werte.haltestellen === undefined || istHaltestellenWahl(werte.haltestellen))
  )
}

/** Beide Seiten mit Ort und Fahrt - eine halbe Wahl laesst sich nicht anzeigen. */
function istHaltestellenWahl(wert: unknown): boolean {
  if (!istObjekt(wert)) return false
  return [wert.ankunft, wert.anschluss].every(
    (seite) => istObjekt(seite) && istObjekt(seite.ort) && istObjekt(seite.fahrt),
  )
}

/** Die gesicherte Reise, oder `null`, wenn keine brauchbare da ist. */
export function liesReise(jetzt: number = Date.now()): Reise | null {
  const s = speicher()
  if (!s) return null
  try {
    const roh = s.getItem(REISE_SCHLUESSEL)
    if (!roh) return null
    const abgelegt = JSON.parse(roh) as unknown
    if (!istObjekt(abgelegt)) return null
    const { fassung, gespeichertUm, reise } = abgelegt as Partial<Ablage>
    if (!LESBARE_FASSUNGEN.has(fassung as number) || typeof gespeichertUm !== 'number') return null
    if (jetzt - gespeichertUm > REISE_HOECHSTALTER_MS) return null
    return istReise(reise) ? reise : null
  } catch {
    // Beschaedigter Eintrag: verwerfen. Die Eingabe ist unangenehmer als
    // die gesicherte Route, ein Absturz beim Start waere schlimmer.
    return null
  }
}

export function schreibeReise(reise: Reise, jetzt: number = Date.now()): void {
  const s = speicher()
  if (!s) return
  try {
    s.setItem(
      REISE_SCHLUESSEL,
      JSON.stringify({ fassung: FASSUNG, gespeichertUm: jetzt, reise } satisfies Ablage),
    )
  } catch {
    // Voll oder gesperrt: Die Reise laeuft weiter, sie ueberlebt nur kein
    // Neuladen.
  }
}

export function leereReise(): void {
  try {
    speicher()?.removeItem(REISE_SCHLUESSEL)
  } catch {
    // Ohne Speicher gibt es auch nichts zu loeschen.
  }
}
