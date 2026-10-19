// Die Werte stehen bewusst nebenan in betreiber.json, nicht hier: Unter
// Windows ist die Endung .ts als MPEG-Transportstrom registriert, eine
// .ts-Datei oeffnet also im Videoplayer statt im Editor. Die Angaben soll
// aber ein Mensch pflegen koennen, ohne Werkzeuge zu wechseln.
//
// Diese Datei bleibt der typisierte Zugang dazu.
import daten from './betreiber.json';

export interface Betreiber {
  name: string;
  strasse: string;
  ort: string;
  land: string;
  email: string;
  /** Optional; die Telefonnummer ist im Impressum nicht Pflicht. */
  telefon?: string;
}

export const BETREIBER: Betreiber = daten;

/** true, solange noch Platzhalter drinstehen – blendet die Warnung ein. */
export const ANGABEN_FEHLEN: boolean = (
  [daten.name, daten.strasse, daten.ort, daten.land, daten.email] as string[]
).some((wert) => wert.startsWith('[BITTE'));
