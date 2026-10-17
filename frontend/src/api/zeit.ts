const UHRZEIT = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * ISO-Zeitstempel → „HH:MM“. Die Fahrplanzeit gilt in Deutschland – auch für
 * ein Handy, das noch auf Lissabon steht.
 */
export function uhrzeit(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : UHRZEIT.format(d);
}
