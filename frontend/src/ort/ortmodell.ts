import { haversineM } from '../standort/distanz';
import type { OrteErgebnis } from '../api/orte';
import type { BahnhofTreffer, Ort } from '../api/typen';

/**
 * Ein Ort ist ein DB-Bahnhof, eine Haltestelle oder beides (Umstieg 2.0).
 * Hier steht, wie die App zwischen den beiden Datenpfaden wählt.
 */
export type Pfad = 'bahnhof' | 'haltestelle';

export function ortAusBahnhof(b: BahnhofTreffer): Ort {
  return { name: b.name, eva: b.eva, lat: b.lat, lon: b.lon, verkehrsmittel: ['bahn'] };
}

/** Derselbe DB-Bahnhof – nur mit zwei gleichen EVA-Nummern, nie über den Namen. */
export function gleicherBahnhof(a: Ort, b: Ort): boolean {
  return Boolean(a.eva && b.eva && a.eva === b.eva);
}

/**
 * Weiche (Spec 4): Ohne Anschlussort oder im selben DB-Bahnhof läuft der
 * heutige Bahnhofspfad – sofern die Ankunft überhaupt ein Bahnhof ist. Alles
 * andere ist ein Umstieg zwischen Haltestellen.
 */
export function pfadFuer(ankunft: Ort | null, anschluss: Ort | null): Pfad | null {
  if (!ankunft) return null;
  if (anschluss === null || gleicherBahnhof(ankunft, anschluss)) {
    return ankunft.eva ? 'bahnhof' : 'haltestelle';
  }
  return 'haltestelle';
}

/** Weiter weg ist es nicht mehr derselbe Ort, auch bei gleichem Namen. */
const GLEICHER_ORT_M = 300;

/**
 * Haltestellen-IDs ändern sich mit den Datenwechseln (A5). Ein gespeicherter
 * Ort wird deshalb beim Laden neu gesucht: gleiche EVA oder gleicher Name in
 * der Nähe. Ebenso ein Bahnhof, der ohne Haltestellen-ID gewählt wurde. Findet sich nichts oder fällt die Suche aus, bleibt der alte Ort –
 * die Tafel findet ihn über die mitgeschickte Koordinate trotzdem.
 */
export async function frischeOrtAuf(
  ort: Ort,
  suche: (q: string) => Promise<OrteErgebnis>,
): Promise<Ort> {
  const treffer = await sucheHaltestelleZu(ort, suche);
  return treffer && treffer !== 'ausfall' ? treffer : ort;
}

/**
 * Wie `frischeOrtAuf`, aber mit Unterschied zwischen „nichts gefunden“
 * (`null`) und „Suche ausgefallen“ (`'ausfall'`). Wer den Ausfall wie ein
 * Nichtfinden behandelt, meldet nach einem kurzen Netzloch dauerhaft
 * fehlende Daten.
 */
export async function sucheHaltestelleZu(
  ort: Ort,
  suche: (q: string) => Promise<OrteErgebnis>,
): Promise<Ort | null | 'ausfall'> {
  // Auch ohne ID: Ein Bahnhof, zu dem die letzte Suche keine Haltestelle
  // kannte, bekommt hier seine (gleiche EVA).
  // Auch ein Wurf VOR dem Versprechen ist ein Ausfall, kein unbehandelter Fehler.
  const ergebnis = await Promise.resolve()
    .then(() => suche(ort.name))
    .catch(() => null);
  if (!ergebnis || !ergebnis.ok) return 'ausfall';
  const treffer = ergebnis.antwort.orte.find(
    (o) =>
      o.haltestelleId &&
      ((ort.eva && o.eva === ort.eva) ||
        (o.name === ort.name && haversineM(ort.lat, ort.lon, o.lat, o.lon) <= GLEICHER_ORT_M)),
  );
  return treffer ?? null;
}

/** Stabiler Schlüssel für Listen und Vergleiche. */
export function ortSchluessel(o: Ort): string {
  return o.eva ?? o.haltestelleId ?? `${o.name}@${o.lat},${o.lon}`;
}
