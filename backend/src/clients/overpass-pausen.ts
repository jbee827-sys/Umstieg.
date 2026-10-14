/**
 * Sperrpause je Overpass-Server (Spec 2026-10-14, Abschnitt 4).
 *
 * `overpass-api.de` sperrt Adressen automatisch, die zu viel fragen oder ein
 * 429 missachten. Wer uns abweist, bekommt deshalb eine Weile gar keine
 * Anfrage – auch nicht von der naechsten Nutzeranfrage. Der Zustand liegt nur
 * im Arbeitsspeicher: Nach einem Neustart wird jeder Server einmal neu gefragt.
 */

/** „Zu viele Anfragen" – das OSM-Forum verlangt mindestens 30 s. */
export const PAUSE_429_MS = 60_000;
/** Verbindung abgewiesen: eine Adresssperre, die erst nach einer Weile auslaeuft. */
export const PAUSE_ABGEWIESEN_MS = 30 * 60_000;
/** Sperre nach User-Agent – wird nur von Hand aufgehoben. */
export const PAUSE_406_MS = 24 * 60 * 60_000;

export interface OverpassPausen {
  /** Bis wann der Server in Ruhe gelassen wird – `null`, wenn er gefragt werden darf. */
  pausiertBis(instanz: string): Date | null;
  /** Wertet eine Antwort oder einen Fehler aus; liefert die gesetzte Pause in ms (0 = keine). */
  merke(instanz: string, ergebnis: { status?: number; fehler?: unknown }): number;
}

interface MitCode {
  code?: unknown;
  errors?: unknown;
}

/**
 * Node meldet eine abgewiesene Verbindung als `TypeError('fetch failed')` mit
 * `cause.code === 'ECONNREFUSED'` – oder, wenn IPv4 und IPv6 beide abweisen,
 * mit einem `AggregateError`, dessen Einzelfehler den Code tragen.
 */
export function istAbgewiesen(e: unknown): boolean {
  const cause = (e as { cause?: unknown } | null | undefined)?.cause as MitCode | undefined;
  if (!cause) return false;
  if (cause.code === 'ECONNREFUSED') return true;
  const einzelne = Array.isArray(cause.errors) ? (cause.errors as MitCode[]) : [];
  return einzelne.length > 0 && einzelne.every((x) => x?.code === 'ECONNREFUSED');
}

export function pauseFuer(ergebnis: { status?: number; fehler?: unknown }): number {
  if (ergebnis.status === 429) return PAUSE_429_MS;
  if (ergebnis.status === 406) return PAUSE_406_MS;
  if (ergebnis.status === undefined && istAbgewiesen(ergebnis.fehler)) return PAUSE_ABGEWIESEN_MS;
  return 0;
}

export function erzeugeOverpassPausen(o: { jetzt?: () => Date } = {}): OverpassPausen {
  const jetzt = o.jetzt ?? (() => new Date());
  const bis = new Map<string, number>();
  return {
    pausiertBis(instanz) {
      const t = bis.get(instanz);
      if (t === undefined) return null;
      if (t <= jetzt().getTime()) {
        bis.delete(instanz);
        return null;
      }
      return new Date(t);
    },
    merke(instanz, ergebnis) {
      const ms = pauseFuer(ergebnis);
      if (ms > 0) bis.set(instanz, Math.max(bis.get(instanz) ?? 0, jetzt().getTime() + ms));
      return ms;
    },
  };
}
