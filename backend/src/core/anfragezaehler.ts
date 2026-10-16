/**
 * Anfragen an die MOTIS-API je Endpunkt und Stunde (Spec 5.4, K7).
 *
 * Der Nachweis für die Absprache mit Transitous: nicht geschätzt, sondern
 * gezählt. Gezählt wird, was hinausgeht – keine Treffer aus dem
 * Zwischenspeicher, keine Anfragen, die die Pause abgefangen hat.
 * Protokolliert werden Summen, nie wer gefragt hat.
 */
export interface ZaehlerProtokoll {
  info(daten: Record<string, unknown>, nachricht: string): void;
}

export interface Anfragezaehler {
  zaehle(endpunkt: string): void;
  /** Schreibt die laufende Stunde ins Protokoll und beginnt neu. */
  schreibe(): void;
  stand(): Record<string, number>;
  beende(): void;
}

export function erzeugeAnfragezaehler(
  o: { log?: ZaehlerProtokoll; jetzt?: () => Date; intervallMs?: number } = {},
): Anfragezaehler {
  const jetzt = o.jetzt ?? (() => new Date());
  // Map statt Objekt: Der Endpunktname ist zwar intern, aber `stand()` gibt
  // ein frisches Objekt heraus, das niemand mit dem Inneren teilt.
  let je = new Map<string, number>();
  const intervall = o.intervallMs ?? 60 * 60_000;

  const zaehler: Anfragezaehler = {
    zaehle(endpunkt) {
      je.set(endpunkt, (je.get(endpunkt) ?? 0) + 1);
    },
    schreibe() {
      if (je.size === 0) return;
      const stand = zaehler.stand();
      const summe = Object.values(stand).reduce((s, n) => s + n, 0);
      o.log?.info(
        { ereignis: 'motis-anfragen', stunde: jetzt().toISOString().slice(0, 13), je: stand, summe },
        'MOTIS-Anfragen der Stunde',
      );
      je = new Map();
    },
    stand: () => Object.fromEntries(je),
    beende() {
      if (timer) clearInterval(timer);
    },
  };
  // Ohne `unref` hielte der Zähler einen sonst fertigen Prozess am Leben.
  const timer = intervall > 0 ? setInterval(() => zaehler.schreibe(), intervall) : undefined;
  timer?.unref?.();
  return zaehler;
}
