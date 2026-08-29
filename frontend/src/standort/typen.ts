export type StandortStatus =
  | 'unbekannt'
  | 'frage-laeuft'
  | 'erteilt'
  | 'verweigert'
  | 'nicht-verfuegbar'
  | 'fehler';

export interface Standort {
  lat: number;
  lon: number;
  genauigkeitM: number;
  /** ms seit Epoch – jede Live-Anzeige traegt einen Zeitstempel (Konzept 3). */
  zeitstempel: number;
}

export interface AnkunftZustand {
  /** Zeitpunkt des Eintritts in den Zielradius, null = ausserhalb. */
  seit: number | null;
  /** Der Nutzer hat die Ankunft bestaetigt – kein weiterer Vorschlag. */
  bestaetigt: boolean;
}
