import { apiUrl } from './basis';
import type { LiveEreignis } from './typen';

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
 * Verbindet den SSE-Strom des Backends. EventSource verbindet nach einem
 * Abbruch selbsttätig neu – im Bahnhof ist das der Normalfall, nicht die
 * Ausnahme. Rückgabe ist die Trennfunktion.
 */
export function verbindeLive({
  eva,
  zugAn,
  zugAb,
  onEreignis,
  onWiederverbunden,
}: LiveOptionen): () => void {
  const parameter = new URLSearchParams();
  if (zugAn) parameter.set('zugAn', zugAn);
  if (zugAb) parameter.set('zugAb', zugAb);
  const anhang = parameter.toString() ? `?${parameter.toString()}` : '';
  const quelle = new EventSource(apiUrl(`/api/live/${encodeURIComponent(eva)}${anhang}`));

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

  return () => quelle.close();
}
