// Alle Fahrplandaten der DB sind in DEUTSCHER Ortszeit definiert. Der Container
// laeuft in UTC, und Date#getHours() liefert Prozesszeit - im Sommer also zwei
// Stunden zu wenig. Live gemessen am 30.08.2026: echte Zeit 17:26, die Tafel
// lieferte Zuege von 15:04 bis 15:53, alle laengst abgefahren.
//
// Deshalb wird die Zone hier EXPLIZIT genannt, statt sie ueber die
// Umgebungsvariable TZ zu setzen: Die Zeitzone ist eine Eigenschaft der
// Datenquelle, keine des Servers. Ein Entwicklungsrechner in einer anderen
// Zone soll dieselben Anfragen stellen wie die Produktion.
const ZONE = 'Europe/Berlin';

const FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

export interface ZeitTeile {
  jahr: string;
  monat: string;
  tag: string;
  stunde: string;
}

/** Datum und Stunde in deutscher Ortszeit – Sommerzeit inbegriffen. */
export function berlinTeile(zeitpunkt: Date): ZeitTeile {
  const teile = FORMAT.formatToParts(zeitpunkt);
  const hole = (typ: Intl.DateTimeFormatPartTypes): string =>
    teile.find((t) => t.type === typ)?.value ?? '';
  return {
    jahr: hole('year'),
    monat: hole('month'),
    tag: hole('day'),
    stunde: hole('hour'),
  };
}

const UHRZEIT = new Intl.DateTimeFormat('de-DE', {
  timeZone: ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** ISO-Zeitstempel → „HH:MM“ deutscher Ortszeit – unabhängig von der Zone des Containers. */
export function berlinUhrzeit(iso: string): string {
  return UHRZEIT.format(new Date(iso));
}

/**
 * Der Zeitpunkt mit der Berliner Uhrzeit `hhmm`, der `bezug` am naechsten liegt
 * (also hoechstens 12 h daneben). Die Tafel nennt nur "HH:MM"; um Mitternacht
 * muss "00:10" zu 23:52 auf den FOLGENDEN Tag fallen, "23:40" auf den
 * gleichen. Gerechnet wird ohne Prozesszeitzone: Kandidaten gestern/heute/morgen
 * werden aus dem Berliner Datum gebaut, der UTC-Versatz (+1/+2 h) wird durch
 * Rueckpruefung mit berlinUhrzeit bestimmt - so stimmt es auch an Umstellungstagen.
 */
export function berlinZeitpunktNahe(hhmm: string, bezug: Date): Date {
  const [h, min] = hhmm.split(':').map(Number);
  const t = berlinTeile(bezug);
  const jahr = Number(t.jahr);
  const monat = Number(t.monat);
  const tag = Number(t.tag);
  let beste: Date | null = null;
  for (const tagVersatz of [-1, 0, 1]) {
    const lokalAlsUtc = Date.UTC(jahr, monat - 1, tag + tagVersatz, h, min);
    for (const versatzStunden of [1, 2]) {
      const kandidat = new Date(lokalAlsUtc - versatzStunden * 3600_000);
      if (berlinUhrzeit(kandidat.toISOString()) !== hhmm) continue; // falscher Versatz
      if (
        beste === null ||
        Math.abs(kandidat.getTime() - bezug.getTime()) < Math.abs(beste.getTime() - bezug.getTime())
      ) {
        beste = kandidat;
      }
    }
  }
  // Nur in der ausgefallenen Stunde der Umstellung (z. B. 02:30 im Maerz) gibt es keinen Treffer.
  return beste ?? new Date(Date.UTC(jahr, monat - 1, tag, h, min) - 3600_000);
}
