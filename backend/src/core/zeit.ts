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
