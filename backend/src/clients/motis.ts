import type { Anfragezaehler } from '../core/anfragezaehler.js';
import type { Steigpunkt } from '../core/typen.js';
import { APP_VERSION } from '../version.js';
import {
  HaltestellenAnfrageFehler,
  HaltestellenNichtVerfuegbarError,
  type MotisPausen,
} from './motis-pausen.js';
import type {
  MotisItinerary,
  MotisMatch,
  MotisPlanAntwort,
  MotisStoptimesAntwort,
} from './motis-typen.js';

/**
 * Endpunkte der MOTIS-API. MOTIS versioniert je Endpunkt (heute v1 und v6);
 * ein Versionswechsel betrifft genau diese Stelle (Spec 5.1).
 *
 * Bewusst „MOTIS“ und nicht „Transitous“ (F4): Die Basis-URL ist
 * Konfiguration. Ein eigener MOTIS-Server (Spec Abschnitt 10) ist damit ein
 * Wechsel von `MOTIS_BASIS_URL`, keine Neuentwicklung.
 */
export const MOTIS_PFADE = {
  geocode: '/api/v1/geocode',
  reverseGeocode: '/api/v1/reverse-geocode',
  stoptimes: '/api/v6/stoptimes',
  trip: '/api/v6/trip',
  plan: '/api/v6/plan',
} as const;

/** Gemessen am 16.10.2026: Maximum 299 ms. Die Grenzen sind Schutz, kein Ziel. */
export const MOTIS_ZEITGRENZEN_MS = { suche: 4000, tafel: 4000, fussweg: 8000, fahrt: 4000 } as const;

/**
 * Zwei Stunden ab JETZT. Der Client fragt ab jetzt − 5 min, das Fenster
 * zählt ab dort – deshalb die fünf Minuten obendrauf.
 * Das breite Layout zeigt bis zum Ende der nächsten vollen Stunde – das sind
 * höchstens zwei Stunden.
 */
const TAFEL_FENSTER_S = 2 * 60 * 60 + 5 * 60; // + Vorlauf: sonst endet sie bei +1:55

/**
 * Umkreis für den Rückfall über die Koordinate (A5): Ist die ID nach einem
 * Datenwechsel unbekannt, findet MOTIS die Haltestelle über `center`. Mit
 * gültiger ID ändert der Umkreis das Ergebnis nicht (geprüft 16.10.2026).
 */
const RUECKFALL_RADIUS_M = 30;

export function motisUserAgent(kontakt: string | undefined): string {
  const zusatz = kontakt?.trim() ? `; ${kontakt.trim()}` : '';
  return `Umstieg/${APP_VERSION} (+https://www.umstieg.online${zusatz})`;
}

/** Drei Nachkommastellen, rund 100 m (Spec 6, Datenschutz). */
export function rundeKoordinate(wert: number): number {
  return Math.round(wert * 1000) / 1000;
}

function punkt(p: Steigpunkt): string {
  return p.level === undefined ? `${p.lat},${p.lon}` : `${p.lat},${p.lon},${p.level}`;
}

export interface MotisKern {
  geocode(text: string): Promise<MotisMatch[]>;
  reverseGeocode(lat: number, lon: number): Promise<MotisMatch[]>;
  stoptimes(a: {
    stopId: string;
    lat: number;
    lon: number;
    typ: 'arr' | 'dep';
    ab: Date;
  }): Promise<MotisStoptimesAntwort>;
  trip(tripId: string): Promise<MotisItinerary>;
  plan(a: { von: Steigpunkt; nach: Steigpunkt; profil: 'FOOT' | 'WHEELCHAIR' }): Promise<MotisPlanAntwort>;
}

export function erzeugeMotisKern(o: {
  basisUrl: string;
  kontakt?: string;
  fetchFn?: typeof fetch;
  pausen?: MotisPausen;
  zaehler?: Anfragezaehler;
}): MotisKern {
  const basis = o.basisUrl.replace(/\/+$/, '');
  const fetchFn = o.fetchFn ?? fetch;
  const userAgent = motisUserAgent(o.kontakt);

  /**
   * Genau EIN Versuch je Aufruf (Spec 5.1). Kein zweiter Versuch in derselben
   * Nutzeranfrage – bei Overpass führte genau das zur Sperre.
   */
  async function hole<T>(
    name: keyof typeof MOTIS_PFADE,
    parameter: Record<string, string>,
    zeitgrenzeMs: number,
  ): Promise<T> {
    const pause = o.pausen?.pausiertBis();
    if (pause) throw new HaltestellenNichtVerfuegbarError(`pausiert bis ${pause.toISOString()}`);

    const url = `${basis}${MOTIS_PFADE[name]}?${new URLSearchParams(parameter).toString()}`;
    o.zaehler?.zaehle(name);
    let antwort: Response;
    try {
      antwort = await fetchFn(url, {
        headers: { 'User-Agent': userAgent, Accept: 'application/json' },
        signal: AbortSignal.timeout(zeitgrenzeMs),
      });
    } catch (fehler) {
      o.pausen?.merke({ fehler });
      throw new HaltestellenNichtVerfuegbarError(String(fehler).slice(0, 160));
    }
    if (!antwort.ok) {
      const text = await antwort.text().catch(() => '');
      o.pausen?.merke({ status: antwort.status, retryAfter: antwort.headers.get('retry-after') });
      if (antwort.status === 429 || antwort.status >= 500) {
        throw new HaltestellenNichtVerfuegbarError(`HTTP ${antwort.status}`);
      }
      throw new HaltestellenAnfrageFehler(antwort.status, text);
    }
    try {
      return (await antwort.json()) as T;
    } catch (fehler) {
      o.pausen?.merke({ fehler });
      throw new HaltestellenNichtVerfuegbarError('Antwort nicht lesbar');
    }
  }

  return {
    geocode: (text) =>
      hole<MotisMatch[]>('geocode', { text, type: 'STOP', language: 'de' }, MOTIS_ZEITGRENZEN_MS.suche),
    reverseGeocode: (lat, lon) =>
      hole<MotisMatch[]>(
        'reverseGeocode',
        { place: `${rundeKoordinate(lat)},${rundeKoordinate(lon)}`, type: 'STOP', numResults: '10' },
        MOTIS_ZEITGRENZEN_MS.suche,
      ),
    stoptimes: ({ stopId, lat, lon, typ, ab }) =>
      hole<MotisStoptimesAntwort>(
        'stoptimes',
        {
          stopId,
          center: `${lat},${lon}`,
          radius: String(RUECKFALL_RADIUS_M),
          time: ab.toISOString(),
          arriveBy: typ === 'arr' ? 'true' : 'false',
          // Ohne das zählt MOTIS bei arriveBy=true RÜCKWÄRTS (OpenAPI:
          // Vorgabe EARLIER) – die Ankunftstafel zeigte nur Vergangenes.
          direction: 'LATER',
          window: String(TAFEL_FENSTER_S),
          n: '10',
          withAlerts: 'false',
          language: 'de',
        },
        MOTIS_ZEITGRENZEN_MS.tafel,
      ),
    trip: (tripId) =>
      hole<MotisItinerary>('trip', { tripId, language: 'de' }, MOTIS_ZEITGRENZEN_MS.fahrt),
    plan: ({ von, nach, profil }) =>
      hole<MotisPlanAntwort>(
        'plan',
        {
          fromPlace: punkt(von),
          toPlace: punkt(nach),
          // Leer = keine Fahrten (F2: Umstiegs-Navigator, kein Reiseplaner).
          transitModes: '',
          directModes: 'WALK',
          pedestrianProfile: profil,
          // Eine Stunde: 2 km Luftlinie (HOECHSTABSTAND_M in routes/haltestellen.ts)
          // mal Umweg im Rollstuhltempo. Mit 30 min fanden weite Paare nie
          // einen Weg und fielen auf die Luftlinie zurueck - 24 h lang.
          maxDirectTime: '3600',
          detailedLegs: 'true',
          language: 'de',
        },
        MOTIS_ZEITGRENZEN_MS.fussweg,
      ),
  };
}
