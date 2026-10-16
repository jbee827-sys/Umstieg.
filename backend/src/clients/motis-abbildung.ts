import { haversineM } from '../core/graph.js';
import { namensSchluessel } from '../core/orte.js';
import type { Fahrtverlauf, HaltestellenTafelEintrag, Ort, Verkehrsmittel } from '../core/typen.js';
import type {
  MotisItinerary,
  MotisMatch,
  MotisPlace,
  MotisStopTime,
  MotisStoptimesAntwort,
} from './motis-typen.js';

/**
 * MOTIS-Modus → eigenes Verkehrsmittel (Spec 5.3). Eine Tabelle statt einer
 * Verzweigung, damit ein neuer Wert eine Zeile ist. Unbekanntes fällt auf
 * `sonstiges`, nie auf einen Fehler: MOTIS hat schon drei Werte umbenannt
 * (METRO, AREAL_LIFT, REGIONAL_FAST_RAIL) und wird es wieder tun.
 *
 * Eine `Map` statt eines Objekts: Der Modus kommt von außen, und ein Wert wie
 * `constructor` träfe in einem Objekt auf eine geerbte Eigenschaft.
 */
const ZUORDNUNG = new Map<string, Verkehrsmittel>([
  ['BUS', 'bus'],
  ['COACH', 'bus'],
  ['TRAM', 'tram'],
  ['SUBWAY', 'ubahn'],
  ['METRO', 'ubahn'],
  ['SUBURBAN', 'sbahn'],
  ['RAIL', 'bahn'],
  ['HIGHSPEED_RAIL', 'bahn'],
  ['LONG_DISTANCE', 'bahn'],
  ['NIGHT_RAIL', 'bahn'],
  ['REGIONAL_RAIL', 'bahn'],
  ['REGIONAL_FAST_RAIL', 'bahn'],
  ['FERRY', 'faehre'],
]);

export function verkehrsmittelAus(mode: string): Verkehrsmittel {
  return ZUORDNUNG.get(mode) ?? 'sonstiges';
}

/**
 * Linienverkehr mit festen Halten. Mitfahrbänke (`RIDE_SHARING`), Rufbus-
 * Bereiche (`ODM`, `FLEX`) und Straßenmodi gehören nicht dazu (Spec 9:
 * „Rufbus-Bereiche ohne festen Halt nicht“).
 */
const OEV = new Set([
  ...ZUORDNUNG.keys(),
  'FUNICULAR',
  'AERIAL_LIFT',
  'AREAL_LIFT',
  'CABLE_CAR',
  'AIRPLANE',
  'OTHER',
]);

export function istOevModus(mode: string): boolean {
  return OEV.has(mode);
}

const REIHENFOLGE: Verkehrsmittel[] = ['bahn', 'sbahn', 'ubahn', 'tram', 'bus', 'faehre', 'sonstiges'];
/** Unter diesem Abstand ist derselbe Name derselbe Halt aus einer zweiten Quelle. */
const DOPPELT_M = 150;

export function abstandM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  return haversineM(a.lat, a.lon, b.lat, b.lon);
}

/** Verkehrsmittel eines Halts: nur Linienverkehr, jedes einmal, feste Reihenfolge. */
export function verkehrsmittelListe(modes: readonly string[] | undefined): Verkehrsmittel[] {
  const da = new Set((Array.isArray(modes) ? modes : []).filter(istOevModus).map(verkehrsmittelAus));
  return REIHENFOLGE.filter((v) => da.has(v));
}

/**
 * Suchtreffer → Orte. Gefiltert wird, was die Erkundung vom 16.10.2026
 * gefunden hat: Adressen, fremde Länder (Wien, New Hamburg), Mitfahrbänke und
 * Parkplätze ohne Linienverkehr, derselbe Halt aus zwei Quellen (DELFI und
 * VBB). Die Reihenfolge bleibt die von MOTIS – sie ist nach Relevanz.
 */
export function orteAusTreffern(treffer: MotisMatch[]): Ort[] {
  const orte: Ort[] = [];
  for (const t of Array.isArray(treffer) ? treffer : []) {
    if (t?.type !== 'STOP') continue;
    // Fehlt das Land, bleibt der Treffer: lieber ein Treffer zu viel als ein
    // deutscher Halt, dessen Quelle das Feld nicht füllt.
    if (t.country !== undefined && t.country !== 'DE') continue;
    const verkehrsmittel = verkehrsmittelListe(t.modes);
    if (verkehrsmittel.length === 0) continue;
    const schluessel = namensSchluessel(t.name);
    const doppelt = orte.find((o) => namensSchluessel(o.name) === schluessel && abstandM(o, t) <= DOPPELT_M);
    if (doppelt) {
      // Der erste Treffer bleibt (MOTIS sortiert nach Relevanz), aber er erbt
      // die Verkehrsmittel des zweiten: Kennt die eine Quelle nur den Bus und
      // die andere auch die Tram, fehlte sonst die Tram im Suchergebnis.
      doppelt.verkehrsmittel = REIHENFOLGE.filter((v) => doppelt.verkehrsmittel.includes(v) || verkehrsmittel.includes(v));
      continue;
    }
    orte.push({ name: t.name, lat: t.lat, lon: t.lon, verkehrsmittel, haltestelleId: t.id });
  }
  return orte;
}

/**
 * Steig aus einer DHID-Steigkennung (VDV 432): `de:<Kreis>:<Nr>:<Bereich>:<Steig>`,
 * hinter dem Quellpräfix von MOTIS (`de-DELFI_…`).
 *
 * Gelesen wird NUR zur Anzeige, nie als Schlüssel – die einzige Stelle, an der
 * Umstieg. in eine ID hineinschaut (Lockerung von Spec 5.1, begründet im
 * Erkundungsbericht A2: Kassel führt den Steig sonst nirgends). Alles, was
 * nicht genau diese Form hat, ergibt `undefined`.
 */
const DHID_STEIG = /(?:^|_)de:\d{5}:[^:_]+:[^:_]*:([^:_]+)$/;

export function steigAusDhid(stopId: string | undefined): string | undefined {
  if (!stopId) return undefined;
  return DHID_STEIG.exec(stopId)?.[1];
}

function eintragAus(s: MotisStopTime, typ: 'arr' | 'dep'): HaltestellenTafelEintrag | null {
  const p: MotisPlace | undefined = s?.place;
  if (!p) return null;
  const zeitSoll = typ === 'dep' ? p.scheduledDeparture : p.scheduledArrival;
  if (!zeitSoll) return null;
  const zeitIst = s.realTime ? (typ === 'dep' ? p.departure : p.arrival) : undefined;
  const dhid = steigAusDhid(p.stopId);
  // `||` statt `??`: Manche Quellen schicken ein leeres Gleis (''), und das
  // darf den Steig aus der DHID nicht verdrängen.
  const steigSoll = p.scheduledTrack || p.track || dhid;
  const steigIst = s.realTime && p.track && p.track !== steigSoll ? p.track : undefined;
  const ziel = typ === 'dep' ? s.headsign || s.tripTo?.name : s.tripFrom?.name;
  return {
    fahrtId: s.tripId,
    linie: s.displayName || s.routeShortName || s.tripShortName || '',
    verkehrsmittel: verkehrsmittelAus(s.mode),
    ziel: ziel ?? '',
    zeitSoll,
    ...(zeitIst ? { zeitIst } : {}),
    ...(steigSoll ? { steigSoll } : {}),
    ...(steigIst ? { steigIst } : {}),
    steigLat: p.lat,
    steigLon: p.lon,
    ...(typeof p.level === 'number' ? { steigLevel: p.level } : {}),
    steigGenau: Boolean(p.track || p.scheduledTrack || p.parentId || dhid),
    echtzeit: s.realTime === true,
    ausfall: s.cancelled === true || s.tripCancelled === true,
  };
}

/** Vorrang beim Entdoppeln: genauer Steig vor ungenauem, Echtzeit vor Fahrplan. */
function rang(e: HaltestellenTafelEintrag): number {
  return (e.steigGenau ? 2 : 0) + (e.echtzeit ? 1 : 0);
}

/**
 * Stoptimes → Tafel einer Haltestelle.
 *
 * Zwei Fallen aus der Erkundung (16.10.2026):
 *
 * - Eine AUSGEFALLENE Fahrt trägt `pickupDropoffType: NOT_ALLOWED`, genau wie
 *   ein Halt, an dem planmäßig niemand einsteigt. Wer nur nach dem Typ
 *   filtert, versteckt die Ausfälle – die wichtigste Nachricht der Tafel.
 * - Dieselbe Fahrt kommt aus zwei Quellen (DELFI und VBB, Wiesenburg) mit
 *   verschiedenen IDs. Sie erscheint einmal; meldet EINE Quelle einen Ausfall,
 *   wird gewarnt – lieber einmal zu vorsichtig als ein verpasster Hinweis.
 */
export function tafelAusStoptimes(antwort: MotisStoptimesAntwort, typ: 'arr' | 'dep'): HaltestellenTafelEintrag[] {
  const je = new Map<string, HaltestellenTafelEintrag>();
  for (const s of Array.isArray(antwort?.stopTimes) ? antwort.stopTimes : []) {
    if (!istOevModus(s?.mode)) continue;
    const ausfall = s.cancelled === true || s.tripCancelled === true;
    if (s.pickupDropoffType === 'NOT_ALLOWED' && !ausfall) continue;
    const e = eintragAus(s, typ);
    if (!e) continue;
    // Verglichen wird, was eine Fahrt ausmacht, nicht ihre Schreibweise: Die
    // Quellen schreiben „RE 7“ und „RE7“, „Brück, Bahnhof“ und „Brück (Bahnhof)“.
    const schluessel = `${e.linie.replace(/\s+/g, '').toLowerCase()}|${namensSchluessel(e.ziel)}|${e.zeitSoll}`;
    const vorher = je.get(schluessel);
    if (!vorher) {
      je.set(schluessel, e);
      continue;
    }
    const besser = rang(e) > rang(vorher) ? e : vorher;
    // Die ID muss von Abruf zu Abruf dieselbe bleiben: Die Live-Überwachung
    // filtert auf sie. Hinge sie am besseren Eintrag, wechselte sie, sobald
    // die andere Quelle Echtzeit bekommt oder MOTIS anders sortiert - und die
    // Meldungen zum Anschluss gingen still verloren.
    const fahrtId = vorher.fahrtId < e.fahrtId ? vorher.fahrtId : e.fahrtId;
    je.set(schluessel, { ...besser, fahrtId, ausfall: vorher.ausfall || e.ausfall });
  }
  return [...je.values()].sort((a, b) => (a.zeitIst ?? a.zeitSoll).localeCompare(b.zeitIst ?? b.zeitSoll));
}

/** Fahrtverlauf einer Fahrt (Spec 5.1). Die Oberfläche nutzt ihn in 2.0 noch nicht. */
export function fahrtverlaufAusTrip(it: MotisItinerary): Fahrtverlauf {
  const legs = Array.isArray(it?.legs) ? it.legs : [];
  const leg = legs.find((l) => istOevModus(l.mode)) ?? legs[0];
  if (!leg) return { linie: '', ziel: '', halte: [] };
  const halte = [leg.from, ...(leg.intermediateStops ?? []), leg.to].map((p) => {
    const zeitSoll = p.scheduledDeparture ?? p.scheduledArrival;
    // Ohne Echtzeit stehen in `departure` die Sollzeiten - als Ist-Zeit
    // ausgegeben, gaebe der Fahrplan sich als live aus (F5).
    const zeitIst = leg.realTime ? (p.departure ?? p.arrival) : undefined;
    const steig = p.track ?? steigAusDhid(p.stopId);
    return {
      name: p.name,
      ...(zeitSoll ? { zeitSoll } : {}),
      ...(zeitIst ? { zeitIst } : {}),
      ...(steig ? { steig } : {}),
    };
  });
  return { linie: leg.displayName || leg.routeShortName || '', ziel: leg.headsign || leg.to.name, halte };
}
