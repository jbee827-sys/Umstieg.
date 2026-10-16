import { haversineM } from './graph.js';
import type { BahnhofTreffer, Ort } from './typen.js';

const UMLAUTE: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' };

/**
 * Vorsilben und Bahnhofswörter – dieselben Klassen wie in `bahnhofsname.ts`.
 * Dort werden sie abgeschält, um eine Suche zu treffen; hier, um zwei Namen
 * vergleichbar zu machen.
 */
const STOERWORTE = new Set(['s', 'u', 's+u', 'u+s', 's+bus', 'bus', 'tram', 'str', 'bahnhof', 'bhf', 'bf']);

/**
 * Vergleichbarer Name: klein, Umlaute ausgeschrieben, „Hauptbahnhof“ → „hbf“,
 * Klammerzusätze und Satzzeichen weg, Verkehrsmittel-Vorsilben („S+U“) weg.
 * „S+U Berlin Hauptbahnhof“ und „Berlin Hbf“ ergeben beide „berlin hbf“.
 *
 * Der Klammerzusatz fällt weg, obwohl er die Stadt nennt („(Berlin)“): Für
 * den Vergleich zweier Treffer am selben Ort sagt er nichts, und die Lage
 * prüft der Aufrufer ohnehin.
 */
export function namensSchluessel(name: string): string {
  const klein = name
    .toLowerCase()
    .replace(/[äöüß]/g, (z) => UMLAUTE[z])
    .replace(/\([^)]*\)/g, ' ')
    .replace(/hauptbahnhof/g, 'hbf');
  return klein
    .split(/[^a-z0-9+]+/)
    .filter((w) => w && !STOERWORTE.has(w))
    .join(' ');
}

/**
 * Bahnhof (RIS::Stations) und Haltestelle (MOTIS) sind derselbe Ort, wenn die
 * Haltestelle Bahnverkehr hat, höchstens so weit entfernt liegt und der Name
 * passt. 400 m wie der Overpass-Umkreis des Bahnhofspfads: So weit reicht ein
 * Bahnhof.
 */
export const GLEICHER_ORT_M = 400;

export function bahnhofAlsOrt(b: BahnhofTreffer): Ort {
  return { name: b.name, eva: b.eva, lat: b.lat, lon: b.lon, verkehrsmittel: ['bahn'] };
}

/** Die Wörter des kürzeren Namens stehen alle im längeren: „Köln Hbf“ passt zu „Köln Hauptbahnhof“. */
function namenPassen(a: string, b: string): boolean {
  const wa = new Set(namensSchluessel(a).split(' ').filter(Boolean));
  const wb = new Set(namensSchluessel(b).split(' ').filter(Boolean));
  if (wa.size === 0 || wb.size === 0) return false;
  const [klein, gross] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  return [...klein].every((w) => gross.has(w));
}

/**
 * Bahnhöfe und Haltestellen zu einer Trefferliste (Spec 5.2, `/api/orte`).
 *
 * Ein zugeordneter Bahnhof trägt beides, EVA und Haltestellen-ID: Die EVA
 * öffnet den Bahnhofspfad, die ID den Weg zu einer Haltestelle daneben
 * (Berlin Hbf Gleis 3 → ZOB). Die Bahnverkehr-Pflicht verhindert, dass die
 * Bushaltestelle vor dem Bahnhof die EVA erbt und damit in den Bahnhofspfad
 * fällt, der sie nicht kennt.
 *
 * Bahnhöfe zuerst: Für einen Bahnhofsnamen ist RIS::Stations die genauere
 * Quelle, und ihr Ablauf (Wagenposition, Ebenenschema) der reichere.
 */
export function fuehreOrteZusammen(bahnhoefe: BahnhofTreffer[], haltestellen: Ort[], max = 8): Ort[] {
  const vergeben = new Set<Ort>();
  const ergebnis: Ort[] = [];
  for (const b of bahnhoefe) {
    const passend = haltestellen.find(
      (h) =>
        !vergeben.has(h) &&
        (h.verkehrsmittel.includes('bahn') || h.verkehrsmittel.includes('sbahn')) &&
        haversineM(h.lat, h.lon, b.lat, b.lon) <= GLEICHER_ORT_M &&
        namenPassen(h.name, b.name),
    );
    if (passend) {
      vergeben.add(passend);
      ergebnis.push({ ...bahnhofAlsOrt(b), verkehrsmittel: passend.verkehrsmittel, haltestelleId: passend.haltestelleId });
    } else {
      ergebnis.push(bahnhofAlsOrt(b));
    }
  }
  for (const h of haltestellen) if (!vergeben.has(h)) ergebnis.push(h);
  return ergebnis.slice(0, max);
}
