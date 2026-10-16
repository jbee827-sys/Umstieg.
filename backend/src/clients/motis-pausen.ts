/**
 * Pausenzustand der MOTIS-API (Spec 5.1, nach dem Muster `overpass-pausen.ts`).
 *
 * Transitous ist ein Gemeinschaftsdienst „best effort“. Wer ihn mit
 * Wiederholungen eindeckt, wird gesperrt – so kam es bei Overpass. Deshalb:
 * Wer 429 sagt, bekommt bis `Retry-After` keine Anfrage; wer gestört ist
 * (5xx, Zeitüberschreitung, Netz), eine kurze Pause. In der Pause gibt es
 * sofort die Degradation, keinen Netzverkehr. Der Zustand liegt nur im
 * Arbeitsspeicher.
 *
 * Ein Zustand für den ganzen Anbieter, nicht je Endpunkt: Es ist ein Host,
 * und ein 429 von der Suche gilt für die Tafel genauso.
 */
export const PAUSE_429_STANDARD_MS = 60_000;
export const PAUSE_STOERUNG_MS = 30_000;
/** Ein `Retry-After` von einem Tag schaltete den Pfad unbemerkt ab. */
export const PAUSE_HOECHSTENS_MS = 15 * 60_000;

/** Pause, Zeitüberschreitung, 5xx, Netz: Wiederkommen hilft. */
export class HaltestellenNichtVerfuegbarError extends Error {
  constructor(grund: string) {
    super(`Haltestellendaten nicht verfuegbar: ${grund}`);
    this.name = 'HaltestellenNichtVerfuegbarError';
  }
}

/** 4xx außer 429: Die Anfrage selbst passt nicht (unbekannte Fahrt, kaputte ID). */
export class HaltestellenAnfrageFehler extends Error {
  constructor(
    readonly status: number,
    detail: string,
  ) {
    super(`MOTIS HTTP ${status}: ${detail.slice(0, 160)}`);
    this.name = 'HaltestellenAnfrageFehler';
  }
}

/** `Retry-After` als Sekunden oder HTTP-Datum; `null`, wenn nicht lesbar. */
export function retryAfterMs(kopf: string | null | undefined, jetzt: Date): number | null {
  const roh = kopf?.trim();
  if (!roh) return null;
  if (/^\d+$/.test(roh)) return Number(roh) * 1000;
  const datum = Date.parse(roh);
  if (Number.isNaN(datum)) return null;
  return Math.max(0, datum - jetzt.getTime());
}

export interface MotisPausen {
  /** Bis wann keine Anfrage hinausgeht – `null`, wenn gefragt werden darf. */
  pausiertBis(): Date | null;
  /** Wertet eine Antwort oder einen Fehler aus; liefert die gesetzte Pause in ms (0 = keine). */
  merke(e: { status?: number; retryAfter?: string | null; fehler?: unknown }): number;
}

export function erzeugeMotisPausen(o: { jetzt?: () => Date } = {}): MotisPausen {
  const jetzt = o.jetzt ?? (() => new Date());
  let bis = 0;
  return {
    pausiertBis() {
      return bis > jetzt().getTime() ? new Date(bis) : null;
    },
    merke({ status, retryAfter, fehler }) {
      let ms = 0;
      if (status === 429) {
        // „Sofort wieder“ (0) wäre die Einladung zur Wiederholungsschleife,
        // vor der diese Datei schützen soll - dann gilt die Standardpause.
        const verlangt = retryAfterMs(retryAfter, jetzt());
        ms = Math.min(verlangt && verlangt > 0 ? verlangt : PAUSE_429_STANDARD_MS, PAUSE_HOECHSTENS_MS);
      } else if (status !== undefined ? status >= 500 : fehler !== undefined) {
        ms = PAUSE_STOERUNG_MS;
      }
      if (ms > 0) bis = Math.max(bis, jetzt().getTime() + ms);
      return ms;
    },
  };
}
