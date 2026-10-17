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

/**
 * Öffnet einen SSE-Strom des Backends. EventSource verbindet nach einem
 * Abbruch selbsttätig neu – im Bahnhof ist das der Normalfall, nicht die
 * Ausnahme. Rückgabe ist die Trennfunktion.
 */
function oeffneStrom(
  pfad: string,
  onEreignis: (ereignis: LiveEreignis) => void,
  onWiederverbunden: () => void,
): () => void {
  const quelle = new EventSource(apiUrl(pfad));

  let warSchonOffen = false;
  quelle.onopen = () => {
    // Beim ZWEITEN Öffnen lag eine Unterbrechung dazwischen; in dieser Zeit
    // können Ereignisse verloren gegangen sein – deshalb Route neu anfordern.
    if (warSchonOffen) onWiederverbunden();
    warSchonOffen = true;
  };

  const nimm = (typ: LiveEreignis['typ']) => (nachricht: MessageEvent<string>) => {
    try {
      onEreignis({ ...(JSON.parse(nachricht.data) as LiveEreignis), typ });
    } catch {
      // Fehlerhafte Nachricht verwerfen – die Verbindung läuft weiter.
    }
  };

  quelle.addEventListener('gleiswechsel', nimm('gleiswechsel'));
  quelle.addEventListener('verspaetung', nimm('verspaetung'));
  quelle.addEventListener('heartbeat', nimm('heartbeat'));
  // Degradationstabelle Zeile 2: Ausfall der Tafel und ihre Rueckkehr.
  quelle.addEventListener('quelle-weg', nimm('quelle-weg'));
  quelle.addEventListener('quelle-da', nimm('quelle-da'));
  // Fahrt fällt aus – sendet heute nur der Haltestellenpfad.
  quelle.addEventListener('ausfall', nimm('ausfall'));

  return () => quelle.close();
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
