/**
 * Schreibvarianten eines Haltestellennamens - von genau nach grob.
 *
 * Verkehrsverbuende schreiben Haltestellennamen anders als die Bahn. Die
 * VBB-App nennt denselben Ort "S+U Berlin Gesundbrunnen Bhf", RIS::Stations
 * kennt ihn als "Berlin Gesundbrunnen". Gemessen am 03.09.2026 gegen die
 * echte Suche:
 *
 *   "Berlin Gesundbrunnen"      -> Berlin Gesundbrunnen (EVA 8011102)
 *   "S+U Berlin Gesundbrunnen"  -> NICHTS
 *   "Berlin Gesundbrunnen Bhf"  -> NICHTS
 *   "Hockenheim"                -> Hockenheim
 *   "Hockenheim, Bahnhof"       -> NICHTS
 *   "Eberswalde, Hauptbahnhof"  -> Eberswalde Hbf
 *   "S Potsdam Hauptbahnhof"    -> Potsdam Hbf
 *
 * WARUM NICHT UEBER DIE VERKEHRSSTELLENGRUPPE: Die Gruppe zu Gesundbrunnen
 * gibt es und sie enthaelt genau die gesuchte S-Bahn-Verkehrsstelle
 * (8011102 + 8089015 "Berlin Gesundbrunnen(S)"). Nur kommt man an die Gruppe
 * ausschliesslich ueber eine EVA - und an die EVA nur ueber einen Namen, den
 * die Suche annimmt. Fuer einen Namen, der ins Leere laeuft, gibt es also
 * keinen Einstieg. Die Aufloesung muss deshalb VOR der ersten Abfrage
 * passieren, nicht danach.
 *
 * Die Varianten werden der Reihe nach probiert, bis eine Treffer liefert.
 * Ein sauberer Name ergibt genau einen Versuch - sonst kostete jede
 * gewoehnliche Suche unnoetige Aufrufe gegen die Quote.
 */

/** Vorsilben der Verbuende: "S+U Berlin Gesundbrunnen". */
const PRAEFIXE = ['S+U', 'U+S', 'S+Bus', 'Bhf', 'Bf', 'S', 'U'];

/**
 * Nachsilben, die die Suche ins Leere laufen lassen.
 *
 * "Hauptbahnhof" steht bewusst NICHT dabei: Die Suche kommt damit klar
 * ("Eberswalde, Hauptbahnhof" -> Eberswalde Hbf). Weil vor der Nachsilbe ein
 * Trenner stehen muss, bleibt "Hauptbahnhof" ohnehin unangetastet - dort
 * steht keiner davor.
 */
const NACHSILBEN = ['Bahnhof', 'Bhf', 'Bf'];

function maskiere(wort: string): string {
  return wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PRAEFIX = new RegExp(`^(?:${PRAEFIXE.map(maskiere).join('|')})\\s+`, 'i');
const NACHSILBE = new RegExp(`[,\\s]+(?:${NACHSILBEN.map(maskiere).join('|')})\\.?$`, 'i');
/** Klammerzusatz der Verbuende: "… [Gleis 1-8]" - kein Gleis, sondern Name. */
const KLAMMERZUSATZ = /\s*\[[^\]]*\]/g;

export function namensvarianten(roh: string): string[] {
  const start = roh.trim();
  if (!start) return [];

  const varianten: string[] = [start];

  const hinzu = (wert: string) => {
    const sauber = wert.trim().replace(/\s+/g, ' ');
    if (sauber && !varianten.includes(sauber)) varianten.push(sauber);
  };

  const ohneKlammer = start.replace(KLAMMERZUSATZ, '');
  hinzu(ohneKlammer);
  hinzu(ohneKlammer.replace(PRAEFIX, ''));
  hinzu(ohneKlammer.replace(NACHSILBE, ''));
  hinzu(ohneKlammer.replace(PRAEFIX, '').replace(NACHSILBE, ''));

  return varianten;
}
