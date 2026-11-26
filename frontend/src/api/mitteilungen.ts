import { apiUrl } from './basis'

/**
 * Mitteilungen ueber Firebase (Konzept Mitteilungen 6.1/6.2): meldet die
 * laufende Reise beim Server an und ab. Der Server haelt eine Reisewache je
 * Geraetetoken und schickt die Mitteilungen auch dann, wenn iOS die App
 * laengst angehalten hat.
 *
 * Bewusst `fetch` statt `holeApi`: Das kennt nur GET und den Vorschalter der
 * Einfuehrungstour - und eine Vorfuehrung darf keine Wache anlegen.
 */

/** Spiegel von `ReiseAnmeldung` in backend/src/core/reisewache.ts. */
export interface ZugDerReise {
  /** Tafelschluessel: DB `zug` („RE 3352“) bzw. Haltestellenpfad `fahrtId` */
  name: string
  /** Linie („RE 3“, „Bus 245“); fehlt beim Fernverkehr */
  anzeige?: string
  /** ISO */
  soll: string
  /** ISO, wenn bei der Anmeldung schon abweichend */
  ist?: string
  gleis: string
  /** Ziel (Anschluss) bzw. Herkunft (Ankunft) */
  richtung: string
}

export interface Halt {
  id: string
  lat: number
  lon: number
}

export type WachOrt = { pfad: 'bahnhof'; eva: string } | { pfad: 'haltestelle'; an: Halt; ab: Halt }

export interface ReiseAnmeldung {
  ort: WachOrt
  bahnhofName: string
  haltWort: 'Gleis' | 'Steig'
  an?: ZugDerReise
  ab: ZugDerReise
  gehzeitSek: number
}

/** 'abgelehnt' = jede Antwort ausser 204, auch kein Netz - die App bleibt dann lokal. */
export type Anmeldeergebnis = 'ok' | 'abgelehnt'

const REISE = '/api/mitteilungen/reise'
const JSON_KOPF = { 'content-type': 'application/json' }

export async function meldeReiseAn(token: string, plattform: 'ios', reise: ReiseAnmeldung): Promise<Anmeldeergebnis> {
  try {
    const antwort = await fetch(apiUrl(REISE), {
      method: 'PUT',
      headers: JSON_KOPF,
      body: JSON.stringify({ token, plattform, reise }),
    })
    return antwort.status === 204 ? 'ok' : 'abgelehnt'
  } catch {
    return 'abgelehnt'
  }
}

/** Wirft nie: Scheitert das Abmelden, endet die Wache spaetestens nach der Abfahrt von selbst. */
export async function meldeReiseAb(token: string): Promise<void> {
  try {
    await fetch(apiUrl(REISE), { method: 'DELETE', headers: JSON_KOPF, body: JSON.stringify({ token }) })
  } catch {
    // siehe oben
  }
}

/** VORUEBERGEHEND fuer TestFlight - vor der Einreichung entfernen (wie die Route im Backend). */
export async function schickeTestmitteilung(token: string): Promise<boolean> {
  try {
    const antwort = await fetch(apiUrl('/api/mitteilungen/test'), {
      method: 'POST',
      headers: JSON_KOPF,
      body: JSON.stringify({ token, plattform: 'ios' }),
    })
    return antwort.status === 204
  } catch {
    return false
  }
}
