import { apiUrl } from './basis';
import type { LiveEreignis, Ort } from './typen';

export interface LiveOptionen {
  eva: string;
  /** Volle Zugbezeichnungen wie in der Tafel ("ICE 1006") – der Server filtert darauf. */
  zugAn?: string;
  zugAb?: string;
  onEreignis: (ereignis: LiveEreignis) => void;
  /** Nach einem Verbindungsabbruch: Route neu anfordern (Konzeptkorrektur 3). */
  onWiederverbunden: () => void;
}

/** Erste Pause vor einem eigenen neuen Versuch; sie verdoppelt sich bis zur Obergrenze. */
const ERSTE_PAUSE_MS = 5_000;
const LAENGSTE_PAUSE_MS = 60_000;

/**
 * Öffnet einen SSE-Strom des Backends. EventSource verbindet nach einem
 * Abbruch selbsttätig neu – im Bahnhof ist das der Normalfall, nicht die
 * Ausnahme. Rückgabe ist die Trennfunktion.
 *
 * Nach einer Antwort außer 200 dagegen gibt EventSource endgültig auf
 * (Browserprüfung 19.10.2026: 503, zu viele Verbindungen). Der Umstieg lief
 * dann ohne Live-Daten weiter, und nichts sagte es. Diesen Fall übernimmt die
 * Funktion selbst: neuer Strom nach 5 s, danach doppelt so lange, höchstens
 * eine Minute – ein abweisender Server soll nicht im Sekundentakt getroffen
 * werden.
 */
function oeffneStrom(
  pfad: string,
  onEreignis: (ereignis: LiveEreignis) => void,
  onWiederverbunden: () => void,
): () => void {
  const nimm = (typ: LiveEreignis['typ']) => (nachricht: MessageEvent<string>) => {
    try {
      onEreignis({ ...(JSON.parse(nachricht.data) as LiveEreignis), typ });
    } catch {
      // Fehlerhafte Nachricht verwerfen – die Verbindung läuft weiter.
    }
  };

  let quelle: EventSource;
  let neuerVersuch: ReturnType<typeof setTimeout> | undefined;
  let abweisungen = 0;
  // Nach einer Unterbrechung oder Abweisung können Ereignisse verloren
  // gegangen sein – beim nächsten Öffnen deshalb Route neu anfordern.
  let nachLuecke = false;

  const verbinde = () => {
    quelle = new EventSource(apiUrl(pfad));
    quelle.onopen = () => {
      if (nachLuecke) onWiederverbunden();
      nachLuecke = true;
      abweisungen = 0;
    };
    quelle.onerror = () => {
      // CONNECTING heißt: EventSource versucht es selbst wieder.
      if (quelle.readyState !== EventSource.CLOSED) return;
      nachLuecke = true;
      const pause = Math.min(ERSTE_PAUSE_MS * 2 ** abweisungen, LAENGSTE_PAUSE_MS);
      abweisungen++;
      neuerVersuch = setTimeout(verbinde, pause);
    };

    quelle.addEventListener('gleiswechsel', nimm('gleiswechsel'));
    quelle.addEventListener('verspaetung', nimm('verspaetung'));
    quelle.addEventListener('heartbeat', nimm('heartbeat'));
    // Degradationstabelle Zeile 2: Ausfall der Tafel und ihre Rueckkehr.
    quelle.addEventListener('quelle-weg', nimm('quelle-weg'));
    quelle.addEventListener('quelle-da', nimm('quelle-da'));
    // Fahrt fällt aus – sendet heute nur der Haltestellenpfad.
    quelle.addEventListener('ausfall', nimm('ausfall'));
  };
  verbinde();

  return () => {
    clearTimeout(neuerVersuch);
    quelle.close();
  };
}

/** Live-Strom eines DB-Bahnhofs (Bahnhofspfad). */
export function verbindeLive({ eva, zugAn, zugAb, onEreignis, onWiederverbunden }: LiveOptionen): () => void {
  const parameter = new URLSearchParams();
  if (zugAn) parameter.set('zugAn', zugAn);
  if (zugAb) parameter.set('zugAb', zugAb);
  const anhang = parameter.toString() ? `?${parameter.toString()}` : '';
  return oeffneStrom(`/api/live/${encodeURIComponent(eva)}${anhang}`, onEreignis, onWiederverbunden);
}

export interface HaltestelleLiveOptionen {
  /** Ankunftshaltestelle – beobachtet werden ihre Ankünfte. */
  an?: Ort;
  /** Anschlusshaltestelle – beobachtet werden ihre Abfahrten. */
  ab?: Ort;
  /** Fahrt-IDs aus der Haltestellentafel – der Server filtert darauf. */
  fahrtAn?: string;
  fahrtAb?: string;
  onEreignis: (ereignis: LiveEreignis) => void;
  onWiederverbunden: () => void;
}

/**
 * EIN Strom für Ankunfts- und Anschlusshaltestelle (Umstieg 2.0). Die
 * Koordinate geht mit, weil der Server die Haltestelle sonst nach einem
 * Datenwechsel nicht wiederfindet (A5).
 */
export function verbindeHaltestelleLive({
  an,
  ab,
  fahrtAn,
  fahrtAb,
  onEreignis,
  onWiederverbunden,
}: HaltestelleLiveOptionen): () => void {
  const parameter = new URLSearchParams();
  for (const [s, ort] of [['an', an], ['ab', ab]] as const) {
    if (!ort?.haltestelleId) continue;
    parameter.set(s, ort.haltestelleId);
    parameter.set(`${s}Lat`, String(ort.lat));
    parameter.set(`${s}Lon`, String(ort.lon));
  }
  // Ohne Haltestelle antwortete der Server 400 – und EventSource versuchte
  // es endlos weiter.
  if (!parameter.has('an') && !parameter.has('ab')) return () => {};
  if (fahrtAn) parameter.set('fahrtAn', fahrtAn);
  if (fahrtAb) parameter.set('fahrtAb', fahrtAb);
  return oeffneStrom(`/api/live/haltestelle?${parameter.toString()}`, onEreignis, onWiederverbunden);
}
