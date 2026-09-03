import {
  epPlatforms,
  epStopPlace,
  epStopPlacesByName,
  epStopPlacesByPosition,
} from './db-endpunkte.js';
import type { BahnhofTreffer, StationsInfo } from '../core/typen.js';

/** DB-Zugangsdaten fehlen – Aufrufer degradiert transparent (Fixtures/Synthese). */
export class FehlendeZugangsdatenError extends Error {
  constructor() {
    super('DB_CLIENT_ID/DB_CLIENT_SECRET nicht gesetzt – DB-APIs nicht verfügbar');
    this.name = 'FehlendeZugangsdatenError';
  }
}

/** Marketplace-Auth-Header; wirft ohne Env-Schlüssel (auch von timetables.ts genutzt). */
export function dbAuthHeader(): { 'DB-Client-Id': string; 'DB-Api-Key': string } {
  const id = process.env.DB_CLIENT_ID;
  const secret = process.env.DB_CLIENT_SECRET;
  if (!id || !secret) throw new FehlendeZugangsdatenError();
  return { 'DB-Client-Id': id, 'DB-Api-Key': secret };
}

async function dbGet(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const antwort = await fetchFn(url, {
    headers: {
      ...dbAuthHeader(),
      // RIS::Stations verlangt den Vendor-Media-Type; 'application/json'
      // quittiert das Gateway mit 415 "No acceptable representation".
      Accept: 'application/vnd.de.db.ris+json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!antwort.ok) {
    throw new Error(`DB-API ${url}: HTTP ${antwort.status}`);
  }
  return antwort.json();
}

// Antwortschema, verifiziert gegen die echte API (31.08.2026).
interface StopPlace {
  evaNumber?: string;
  names?: { DE?: { nameLong?: string } };
  position?: { latitude?: number; longitude?: number };
  /**
   * Alle Verkehrsstellen des Bahnhofs. Steht NUR in den Suchantworten
   * (by-name/by-position) und dort nur beim führenden Eintrag – weder
   * `stop-places/{eva}` noch die Mitglieder tragen das Feld.
   */
  groupMembers?: string[];
  /** StaDa-Bahnhofsnummer; steht auf jedem Mitglied der Gruppe. */
  stationID?: string;
}

/**
 * Gueltige EVA-Nummer einer deutschen Eisenbahn-Verkehrsstelle:
 * genau sieben Ziffern, beginnend mit dem UIC-Laendercode 80.
 *
 * RIS::Stations liefert in derselben Antwort auch Kennungen aus anderen
 * Nummernraeumen - sechsstellige Nahverkehrs-IDs (z. B. 730749 fuer
 * "Berlin Hauptbahnhof (S+U)") und IFOPT-Kennungen der Form
 * "de:11000:900003201:1:50". Timetables und die Gleisliste kennen sie
 * nicht: /api/board quittiert sie mit HTTP 500, /api/route findet kein
 * Gleis. Sie gehoeren deshalb nicht in die Trefferliste, denn alles, was
 * dort steht, muss antippbar sein.
 *
 * Auslaendische Verkehrsstellen (81 Oesterreich, 85 Schweiz, ...) fallen
 * bewusst mit heraus - Timetables deckt nur Deutschland ab.
 *
 * ABSICHTLICH ENG: Umstiege zu Bus, Tram, S- und U-Bahn brauchen spaeter
 * genau diese anderen Nummernraeume. Dann wird hier nicht gelockert,
 * sondern der Treffer bekommt eine Verkehrsart, und die Route entscheidet
 * anhand dieser, welche Schnittstelle sie befragt.
 */
export function istGueltigeEva(eva: string): boolean {
  return /^80\d{5}$/.test(eva);
}

/** Beide Suchvarianten liefern dieselbe stopPlaces-Huelle. */
function zuTreffern(body: { stopPlaces?: StopPlace[] }): BahnhofTreffer[] {
  return (body.stopPlaces ?? [])
    .filter((sp) => sp.evaNumber && sp.names?.DE?.nameLong && istGueltigeEva(sp.evaNumber))
    .map((sp) => ({
      name: sp.names!.DE!.nameLong!,
      eva: sp.evaNumber!,
      lat: sp.position?.latitude ?? 0,
      lon: sp.position?.longitude ?? 0,
    }));
}

export async function sucheBahnhoefe(
  q: string,
  fetchFn: typeof fetch = fetch,
): Promise<BahnhofTreffer[]> {
  return zuTreffern((await dbGet(epStopPlacesByName(q), fetchFn)) as { stopPlaces?: StopPlace[] });
}

/** Bahnhöfe im Umkreis – Grundlage der Standorterkennung (P1). */
export async function sucheBahnhoefeNahebei(
  lat: number,
  lon: number,
  radiusM: number,
  fetchFn: typeof fetch = fetch,
): Promise<BahnhofTreffer[]> {
  const url = epStopPlacesByPosition(lat, lon, radiusM);
  return zuTreffern((await dbGet(url, fetchFn)) as { stopPlaces?: StopPlace[] });
}

/**
 * Die Verkehrsstellen des Bahnhofs, zu dem `eva` gehört.
 *
 * `stop-places/{eva}` trägt `groupMembers` NICHT – auch nicht für den
 * führenden Eintrag. Das Feld steht ausschliesslich in den Suchantworten.
 * Aufgelöst wird deshalb über den Namen und den Abgleich der
 * `stationID`, die auf jedem Mitglied steht: die Suche liefert immer den
 * führenden Eintrag, und dessen `groupMembers` ist die Gruppe.
 *
 * Fällt die Suche aus, WIRFT diese Funktion – der Rückfall auf die eine
 * Verkehrsstelle ist richtig, aber er gehört dem Aufrufer.
 *
 * Vorher wurde hier still `[eva]` zurückgegeben. Beide Aufrufer fielen damit
 * korrekt zurück, nur wusste es niemand: Der Logeintrag `gruppe-unbekannt` in
 * `api.ts` hängt an einem `catch`, das so nie erreicht wurde. Grün war sein
 * Test allein deshalb, weil das Mock warf – die echte Funktion tat es nie.
 * Wer zurückfällt, entscheidet der Aufrufer; er ist der Einzige mit Logger.
 */
async function ermittleGruppe(
  eva: string,
  name: string,
  stationID: string | undefined,
  fetchFn: typeof fetch,
): Promise<string[]> {
  // Kein Ausfall, sondern eine Auskunft: Ohne Bahnhofsnummer gibt es keine
  // Gruppe, nach der sich fragen liesse. Das bleibt still.
  if (!stationID) return [eva];
  const body = (await dbGet(epStopPlacesByName(name), fetchFn)) as { stopPlaces?: StopPlace[] };
  const treffer = body.stopPlaces ?? [];
  const fuehrend = treffer.find(
    (sp) => sp.stationID === stationID && (sp.groupMembers?.length ?? 0) > 0,
  );
  // istGueltigeEva schützt die Gruppe genauso wie die Trefferliste: Timetables
  // und die Gleisliste kennen fremde Nummernräume nicht.
  const mitglieder = (fuehrend?.groupMembers ?? []).filter(istGueltigeEva);
  return mitglieder.includes(eva) ? [...new Set(mitglieder)] : [eva];
}

async function ladeStopPlace(eva: string, fetchFn: typeof fetch): Promise<StopPlace> {
  const body = (await dbGet(epStopPlace(eva), fetchFn)) as StopPlace | { stopPlaces?: StopPlace[] };
  // defensiv: Endpunkt kann Einzelobjekt oder umschlossene Liste liefern
  return 'stopPlaces' in body && Array.isArray(body.stopPlaces)
    ? (body.stopPlaces[0] ?? {})
    : (body as StopPlace);
}

/**
 * Die Verkehrsstellen des Bahnhofs – ohne die Gleislisten zu holen.
 *
 * Für die Fahrplantafel: Sie braucht die EVAs, nicht die Gleise. Berlin Hbf
 * führt unter 8011160 KEINE Abfahrt; die Züge stehen unter 8098160 und
 * 8089021.
 */
export async function holeGruppe(eva: string, fetchFn: typeof fetch = fetch): Promise<string[]> {
  const stopPlace = await ladeStopPlace(eva, fetchFn);
  return ermittleGruppe(
    eva,
    stopPlace.names?.DE?.nameLong ?? `EVA ${eva}`,
    stopPlace.stationID,
    fetchFn,
  );
}

export async function holeStationsInfo(
  eva: string,
  fetchFn: typeof fetch = fetch,
): Promise<StationsInfo> {
  const stopPlace = await ladeStopPlace(eva, fetchFn);
  const name = stopPlace.names?.DE?.nameLong ?? `EVA ${eva}`;

  // Ohne Gruppe ist die Route immer noch besser als keine – aber sie steht
  // dann auf der Gleisliste EINER Verkehrsstelle, und das muss mitreisen.
  let evas: string[];
  let gruppeUnvollstaendig = false;
  try {
    evas = await ermittleGruppe(eva, name, stopPlace.stationID, fetchFn);
  } catch {
    evas = [eva];
    gruppeUnvollstaendig = true;
  }

  // Gleislisten aller Mitglieder, vereinigt nach Gleisnamen. Vereinigung statt
  // Verkettung, weil dieselbe Nummer unter mehreren Verkehrsstellen stehen
  // kann – München führt Gleis 13 unter dreien. Die Unterteilung ist
  // betrieblich, nicht physisch; Koordinaten trägt die Liste ohnehin nicht.
  let gleisteileOhneAntwort = 0;
  const listen = await Promise.all(
    evas.map(async (mitglied) => {
      try {
        const body = (await dbGet(epPlatforms(mitglied), fetchFn)) as {
          platforms?: { name?: string }[];
        };
        return body.platforms ?? [];
      } catch {
        // Ein ausgefallener Bahnhofsteil darf die übrigen nicht mitnehmen –
        // aber gezählt wird er. Eine unvollständige Liste, die sich für
        // vollständig ausgibt, ist schlimmer als eine kurze mit Vermerk.
        gleisteileOhneAntwort++;
        return [];
      }
    }),
  );
  const gesehen = new Set<string>();
  const gleise: { gleis: string }[] = [];
  for (const liste of listen) {
    for (const p of liste) {
      if (!p.name || gesehen.has(p.name)) continue;
      gesehen.add(p.name);
      gleise.push({ gleis: p.name });
    }
  }

  return {
    eva,
    name,
    lat: stopPlace.position?.latitude,
    lon: stopPlace.position?.longitude,
    evas,
    ...(stopPlace.stationID ? { stationID: stopPlace.stationID } : {}),
    gleise,
    gleisteileOhneAntwort,
    ...(gruppeUnvollstaendig ? { gruppeUnvollstaendig } : {}),
  };
}

/**
 * Ob dieser Gleisliste etwas fehlt, das eigentlich dazugehört.
 *
 * Die beiden Ausfälle unterscheiden sich in der Ursache, nicht in der Folge:
 * Die Liste ist kürzer, als der Bahnhof ist. Für jeden, der sie auswertet,
 * zählt nur diese eine Frage – deshalb hier gebündelt statt an jeder
 * Auswertungsstelle neu zusammengesetzt.
 */
export function gleislisteUnvollstaendig(info: StationsInfo): boolean {
  return (info.gleisteileOhneAntwort ?? 0) > 0 || info.gruppeUnvollstaendig === true;
}
