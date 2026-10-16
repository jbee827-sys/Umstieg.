import { mitCache } from '../cache/clients.js';
import type {
  Fahrtverlauf,
  HaltestellenTafelEintrag,
  Ort,
  RoutenPfad,
  Steigpunkt,
} from '../core/typen.js';
import { fahrtverlaufAusTrip, orteAusTreffern, tafelAusStoptimes } from './motis-abbildung.js';
import type { MotisKern } from './motis.js';
import { pfadAusPlan } from './motis-weg.js';

/**
 * Fristen des Haltestellenpfads (Spec 5.1). Was sich nie ändert, lange; was
 * live ist, kurz – gemessen an dem, was die Anzeige noch wahr sein lässt.
 */
export const HALTESTELLEN_SUCHE_TTL_MS = 24 * 60 * 60_000;
/**
 * Nur für die HTTP-Route. Länger als die 20 s der Bahnhofstafel, weil der
 * Live-Abstand hier 60 s ist (Transitous liest Echtzeit etwa minütlich).
 */
export const HALTESTELLEN_TAFEL_TTL_MS = 30_000;
export const FUSSWEG_TTL_MS = 24 * 60 * 60_000;
export const FAHRT_TTL_MS = 60_000;
/** Passt zu `FENSTER_VOR_MIN` im Frontend: Wer gerade weg ist, ist meist noch da. */
const TAFEL_VORLAUF_MS = 5 * 60_000;

export interface HaltestelleAnfrage {
  id: string;
  lat: number;
  lon: number;
}

/**
 * Der Haltestellenpfad, so wie Routen und Überwachung ihn sehen: nur eigene
 * Typen. Was MOTIS liefert, endet hier (Spec 5.1, F4).
 */
export interface HaltestellenClient {
  sucheOrte(text: string): Promise<Ort[]>;
  orteNahebei(lat: number, lon: number): Promise<Ort[]>;
  /** Für die HTTP-Route – 30 s zwischengespeichert. */
  tafel(h: HaltestelleAnfrage, typ: 'arr' | 'dep'): Promise<HaltestellenTafelEintrag[]>;
  /**
   * Für den Live-Poller – immer frisch. Er IST die Frischequelle; ein
   * Speicher in seinem Pfad verschluckte genau die Änderung, wegen der es den
   * Strom gibt (dieselbe Regel wie `tafelRoh` in `app.ts`).
   */
  tafelFrisch(h: HaltestelleAnfrage, typ: 'arr' | 'dep'): Promise<HaltestellenTafelEintrag[]>;
  /** `null` = kein Weg im Kartenmaterial (nicht: Fehler). */
  fussweg(von: Steigpunkt, nach: Steigpunkt, profil: 'FOOT' | 'WHEELCHAIR'): Promise<RoutenPfad | null>;
  fahrt(fahrtId: string): Promise<Fahrtverlauf>;
}

/** Fünf Stellen, rund 1 m: zwei Abfragen desselben Steigs treffen denselben Eintrag. */
const punktSchluessel = (p: Steigpunkt): string => `${p.lat.toFixed(5)},${p.lon.toFixed(5)},${p.level ?? ''}`;

export function erzeugeHaltestellenClient(kern: MotisKern, o: { jetzt?: () => Date } = {}): HaltestellenClient {
  const jetzt = o.jetzt ?? (() => new Date());

  const tafelFrisch = async (h: HaltestelleAnfrage, typ: 'arr' | 'dep'): Promise<HaltestellenTafelEintrag[]> =>
    tafelAusStoptimes(
      await kern.stoptimes({ stopId: h.id, lat: h.lat, lon: h.lon, typ, ab: new Date(jetzt().getTime() - TAFEL_VORLAUF_MS) }),
      typ,
    );

  return {
    sucheOrte: mitCache(
      async (text: string) => orteAusTreffern(await kern.geocode(text)),
      (text) => text.trim().toLowerCase(),
      HALTESTELLEN_SUCHE_TTL_MS,
      500,
    ),
    /*
     * BEWUSST OHNE Zwischenspeicher: Der Schlüssel wäre die Koordinate des
     * Nutzers – gleiche Begründung wie `sucheBahnhoefeNahebei` in `app.ts`.
     */
    orteNahebei: async (lat, lon) => orteAusTreffern(await kern.reverseGeocode(lat, lon)),
    tafel: mitCache(tafelFrisch, (h, typ) => `${h.id}|${typ}`, HALTESTELLEN_TAFEL_TTL_MS, 300),
    tafelFrisch,
    /*
     * Auch `null` wird gespeichert: Ein Steigpaar ohne Weg im Kartenmaterial
     * bleibt einen Tag ohne Weg. Fehler (Würfe) speichert `mitCache` nie.
     */
    fussweg: mitCache(
      async (von: Steigpunkt, nach: Steigpunkt, profil: 'FOOT' | 'WHEELCHAIR') =>
        pfadAusPlan(await kern.plan({ von, nach, profil })),
      (von, nach, profil) => `${punktSchluessel(von)}|${punktSchluessel(nach)}|${profil}`,
      FUSSWEG_TTL_MS,
      500,
    ),
    fahrt: mitCache(async (id: string) => fahrtverlaufAusTrip(await kern.trip(id)), (id) => id, FAHRT_TTL_MS, 200),
  };
}
