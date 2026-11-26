import type { ReiseAnmeldung, ZugDerReise } from '../api/mitteilungen'
import type { RouteErgebnis } from '../api/typen'
import type { EingabeWerte } from '../components/Eingabe'
import { abfahrtUm, ankunftUm } from '../navigation/ampel'

/** So viel nimmt der Server an (`MAX_GEHZEIT_SEK` in routes/mitteilungen.ts). */
const MAX_GEHZEIT_SEK = 7200

/**
 * Die laufende Reise in der Form, die der Server fuer seine Reisewache
 * braucht (Konzept Mitteilungen 6.2). `null`, wenn sie sich nicht anmelden
 * laesst - dann bleibt die App bei ihren lokalen Mitteilungen.
 *
 * Angemeldet wird mit den Tafelnamen: Stammt ein Zug noch aus einem
 * Reisetext (`zugAbAusText`/`zugAnAusText`), erkennt die Wache ihn nicht. Der
 * Anschluss fehlt dann ganz (`null`), die Ankunft faellt weg - bis
 * `useZugabgleich` den Zug in der Tafel gefunden hat und die Werte sich
 * aendern.
 */
export function reiseFuerWache(werte: EingabeWerte, route: RouteErgebnis, jetzt: Date): ReiseAnmeldung | null {
  if (!Number.isFinite(route.gehzeitSek) || route.gehzeitSek < 0) return null
  const gehzeitSek = Math.min(MAX_GEHZEIT_SEK, Math.round(route.gehzeitSek))
  return werte.haltestellen ? haltestellenReise(werte, gehzeitSek) : bahnhofsReise(werte, gehzeitSek, jetzt)
}

function bahnhofsReise(werte: EingabeWerte, gehzeitSek: number, jetzt: Date): ReiseAnmeldung | null {
  if (!werte.eva || !werte.zugAbName || !werte.abfahrtZeit || werte.zugAbAusText) return null
  // Dieselbe Tagesregel wie die Ampel: Die Abfahrt bestimmt den Tag, die
  // Ankunft liegt am selben oder am Nachbartag (23:58 → 00:10).
  const abfahrt = abfahrtUm(werte.abfahrtZeit, jetzt.getTime())
  const ab: ZugDerReise = {
    name: werte.zugAbName,
    ...(werte.zugAbAnzeige ? { anzeige: werte.zugAbAnzeige } : {}),
    soll: abfahrt.toISOString(),
    gleis: werte.gleisAb,
    richtung: werte.zugAbNach ?? '',
  }
  const an: ZugDerReise | undefined =
    werte.zugAnName && werte.ankunftZeit && !werte.zugAnAusText
      ? {
          name: werte.zugAnName,
          ...(werte.zugAnAnzeige ? { anzeige: werte.zugAnAnzeige } : {}),
          soll: ankunftUm(werte.ankunftZeit, abfahrt).toISOString(),
          gleis: werte.gleisAn,
          richtung: werte.zugAnVon ?? '',
        }
      : undefined
  return {
    ort: { pfad: 'bahnhof', eva: werte.eva },
    bahnhofName: werte.bahnhofName,
    haltWort: 'Gleis',
    ...(an ? { an } : {}),
    ab,
    gehzeitSek,
  }
}

function haltestellenReise(werte: EingabeWerte, gehzeitSek: number): ReiseAnmeldung | null {
  const { ankunft, anschluss } = werte.haltestellen!
  const idAn = ankunft.ort.haltestelleId
  const idAb = anschluss.ort.haltestelleId
  // Ohne Haltestellen-ID weiss die Ueberwachung nicht, welche Tafel sie
  // abfragen soll - wie beim Live-Strom (api/sse.ts).
  if (!idAn || !idAb) return null
  const zug = (fahrt: typeof ankunft.fahrt, gleis: string): ZugDerReise => ({
    name: fahrt.fahrtId,
    anzeige: fahrt.linie,
    soll: fahrt.zeitSoll,
    ...(fahrt.zeitIst ? { ist: fahrt.zeitIst } : {}),
    gleis,
    richtung: fahrt.ziel,
  })
  return {
    ort: {
      pfad: 'haltestelle',
      an: { id: idAn, lat: ankunft.ort.lat, lon: ankunft.ort.lon },
      ab: { id: idAb, lat: anschluss.ort.lat, lon: anschluss.ort.lon },
    },
    bahnhofName: werte.bahnhofName,
    haltWort: 'Steig',
    an: zug(ankunft.fahrt, werte.gleisAn),
    ab: zug(anschluss.fahrt, werte.gleisAb),
    gehzeitSek,
  }
}
