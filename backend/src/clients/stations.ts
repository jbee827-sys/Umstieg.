import { epPlatforms, epStopPlace, epStopPlacesByName } from './db-endpunkte.js';
import type { BahnhofTreffer, StationsInfo } from '../core/typen.js';

/** DB-Zugangsdaten fehlen – Aufrufer degradiert transparent (Fixtures/Synthese). */
export class FehlendeZugangsdatenError extends Error {
  constructor() {
    super('DB_CLIENT_ID/DB_CLIENT_SECRET nicht gesetzt – DB-APIs nicht verfügbar');
    this.name = 'FehlendeZugangsdatenError';
  }
}

function zugangsdaten(): { id: string; secret: string } {
  const id = process.env.DB_CLIENT_ID;
  const secret = process.env.DB_CLIENT_SECRET;
  if (!id || !secret) throw new FehlendeZugangsdatenError();
  return { id, secret };
}

async function dbGet(url: string, fetchFn: typeof fetch): Promise<unknown> {
  const { id, secret } = zugangsdaten();
  const antwort = await fetchFn(url, {
    headers: {
      'DB-Client-Id': id,
      'DB-Api-Key': secret,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!antwort.ok) {
    throw new Error(`DB-API ${url}: HTTP ${antwort.status}`);
  }
  return antwort.json();
}

// Antwortschemata (handgebaut nach Doku – Verifikationspflicht, s. db-endpunkte.ts)
interface StopPlace {
  evaNumber?: string;
  names?: { DE?: { nameLong?: string } };
  position?: { latitude?: number; longitude?: number };
}

export async function sucheBahnhoefe(
  q: string,
  fetchFn: typeof fetch = fetch,
): Promise<BahnhofTreffer[]> {
  const body = (await dbGet(epStopPlacesByName(q), fetchFn)) as { stopPlaces?: StopPlace[] };
  return (body.stopPlaces ?? [])
    .filter((sp) => sp.evaNumber && sp.names?.DE?.nameLong)
    .map((sp) => ({
      name: sp.names!.DE!.nameLong!,
      eva: sp.evaNumber!,
      lat: sp.position?.latitude ?? 0,
      lon: sp.position?.longitude ?? 0,
    }));
}

export async function holeStationsInfo(
  eva: string,
  fetchFn: typeof fetch = fetch,
): Promise<StationsInfo> {
  const stopPlaceBody = (await dbGet(epStopPlace(eva), fetchFn)) as
    | StopPlace
    | { stopPlaces?: StopPlace[] };
  // defensiv: Endpunkt kann Einzelobjekt oder umschlossene Liste liefern
  const stopPlace: StopPlace =
    'stopPlaces' in stopPlaceBody && Array.isArray(stopPlaceBody.stopPlaces)
      ? (stopPlaceBody.stopPlaces[0] ?? {})
      : (stopPlaceBody as StopPlace);

  const platformsBody = (await dbGet(epPlatforms(eva), fetchFn)) as {
    platforms?: { name?: string }[];
  };
  const gleise = (platformsBody.platforms ?? [])
    .filter((p) => p.name)
    .map((p) => ({ gleis: p.name! }));

  return {
    eva,
    name: stopPlace.names?.DE?.nameLong ?? `EVA ${eva}`,
    gleise,
  };
}
