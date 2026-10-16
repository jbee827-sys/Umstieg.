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
  /*
   * Beginn des gezählten Zeitraums. Beschriftet wird mit IHM, nicht mit dem
   * Schreibzeitpunkt: Der Takt läuft ab Prozessstart, nicht ab der vollen
   * Stunde, und um 15:20 geschrieben gehört die Summe zu 14:20–15:20.
   */
  let beginn = jetzt();
  const intervall = o.intervallMs ?? 60 * 60_000;

  const zaehler: Anfragezaehler = {
    zaehle(endpunkt) {
      je.set(endpunkt, (je.get(endpunkt) ?? 0) + 1);
    },
    schreibe() {
      const ende = jetzt();
      if (je.size > 0) {
        const stand = zaehler.stand();
        const summe = Object.values(stand).reduce((s, n) => s + n, 0);
        o.log?.info(
          {
            ereignis: 'motis-anfragen',
            stunde: beginn.toISOString().slice(0, 13),
            von: beginn.toISOString(),
            bis: ende.toISOString(),
            je: stand,
            summe,
          },
          'MOTIS-Anfragen der Stunde',
        );
        je = new Map();
      }
      beginn = ende;
    },
    stand: () => Object.fromEntries(je),
    beende() {
      if (timer) clearInterval(timer);
      // Die laufende Stunde gehört zum Nachweis: Ein Neustart um 14:50 ließe
      // sonst 50 Minuten verschwinden, und wer kürzer als eine Stunde läuft,
      // stünde nie im Protokoll.
      zaehler.schreibe();
    },
  };
  // Ohne `unref` hielte der Zähler einen sonst fertigen Prozess am Leben.
  const timer = intervall > 0 ? setInterval(() => zaehler.schreibe(), intervall) : undefined;
  timer?.unref?.();
  return zaehler;
}
