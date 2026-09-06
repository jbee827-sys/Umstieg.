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

/*
 * EIN Satz Stoerwoerter, an BEIDEN Enden abgeschaelt.
 *
 * Bis zum 06.09.2026 standen hier zwei Listen, jede an ein Ende gebunden -
 * und ihre Mitgliedschaft war willkuerlich: "Bhf"/"Bf" in beiden, "Bahnhof"
 * nur hinten, "S"/"U" nur vorn, "Bus"/"Tram" in keiner. Jeder neue Verbund
 * brachte damit einen neuen Einzelfall. Gemessen an 21 echten Schreibweisen
 * fielen fuenf durch, und alle aus diesem einen Grund:
 *
 *   "Bahnhof Hockenheim"             -> "Bahnhof" kannte nur die Nachsilbe
 *   "Berlin Gesundbrunnen S+U"       -> "S+U" kannte nur die Vorsilbe
 *   "Tram Hackescher Markt (Berlin)" -> "Tram" kannte keine von beiden
 *
 * Die Klassen bleiben getrennt benannt, weil sie verschiedene Dinge sind -
 * abgeschaelt werden sie gleich.
 */
const VERKEHRSMITTEL = ['S+U', 'U+S', 'S+Bus', 'Bus', 'Tram', 'STR', 'S', 'U'];

/**
 * "Hauptbahnhof" steht bewusst NICHT dabei: Die Suche kommt damit klar
 * ("Eberswalde, Hauptbahnhof" -> Eberswalde Hbf). Weil vor dem Stoerwort ein
 * Trenner stehen muss, bleibt "Hauptbahnhof" ohnehin unangetastet - vor
 * seinem "bahnhof" steht ein "t", kein Komma und kein Leerzeichen. Dieselbe
 * Trennerpflicht unterscheidet "S Treptower Park" von "Sankt Goar".
 */
const BAHNHOFSWORT = ['Bahnhof', 'Bhf', 'Bf'];

/** Lang vor kurz - sonst frisst "S" das "S+U", bevor es drankommt. */
const STOERWORTE = [...VERKEHRSMITTEL, ...BAHNHOFSWORT].sort((a, b) => b.length - a.length);

function maskiere(wort: string): string {
  return wort.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const ALTERNATIVE = STOERWORTE.map(maskiere).join('|');

/**
 * Stoerwort am Anfang. Der Trenner dahinter ist Pflicht - er macht aus dem
 * "S" ein eigenes Wort und schuetzt "Sankt Goar". Das Komma gehoert dazu:
 * Die VMV schreibt "Bahnhof, Zuessow".
 */
const VORN = new RegExp(`^(?:${ALTERNATIVE})[,\\s]+`, 'i');

/**
 * Stoerwort am Ende - oder VOR einem Klammerzusatz.
 *
 * Die VBB schreibt die Stadt in runde Klammern dahinter: "S+U Gesundbrunnen
 * Bhf (Berlin)". Nur auf `$` verankert lief die Regel daran vorbei, und das
 * "Bhf" blieb stehen. Gemessen am 06.09.2026 gegen die echte Suche ist genau
 * das der Unterschied: "Gesundbrunnen Bhf (Berlin)" -> NICHTS,
 * "Gesundbrunnen (Berlin)" -> Berlin Gesundbrunnen.
 *
 * Der Zusatz wird dabei BEHALTEN (Gruppe 1) und nicht weggeworfen: Er
 * unterscheidet die Staedte. "Hauptbahnhof (Berlin)" trifft Berlin Hbf,
 * "Hauptbahnhof" allein liefert 24 Treffer, angefuehrt von Muenchen.
 */
const HINTEN = new RegExp(`[,\\s]+(?:${ALTERNATIVE})\\.?(\\s*\\([^)]*\\))?$`, 'i');

/**
 * Schaelt wiederholt, solange sich noch etwas aendert.
 *
 * Wiederholt, weil Stoerwoerter sich stapeln ("S+U Bahnhof Hockenheim").
 * Bricht ab, sobald nichts mehr faellt oder nichts mehr uebrig BLIEBE: Ein
 * Name, der nur aus Stoerwoertern besteht, wird nicht zu einer leeren
 * Zeichenkette abgeschliffen - dann ist der ganze Versuch wertlos, und der
 * unveraenderte Name bleibt die bessere Auskunft.
 */
function schaele(wert: string, regeln: [RegExp, string][]): string {
  let stand = wert.trim();
  for (let runde = 0; runde < STOERWORTE.length; runde++) {
    let naechster = stand;
    // VORN traegt keine Fanggruppe und ersetzt durch nichts; HINTEN behaelt
    // ueber `$1` den Klammerzusatz. Deshalb Paare statt nackter Ausdruecke -
    // mit einem gemeinsamen "$1" stuende in der Vorsilbenrunde das Zeichen
    // "$1" woertlich im Namen.
    for (const [regel, ersatz] of regeln) naechster = naechster.replace(regel, ersatz);
    naechster = naechster.replace(/\s+/g, ' ').trim();
    if (naechster === stand || naechster === '') return stand;
    stand = naechster;
  }
  return stand;
}

const NUR_VORN: [RegExp, string][] = [[VORN, '']];
const NUR_HINTEN: [RegExp, string][] = [[HINTEN, '$1']];
const BEIDE: [RegExp, string][] = [...NUR_VORN, ...NUR_HINTEN];
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

  // Reihenfolge: genau nach grob. Der erste Treffer gewinnt, also steht die
  // schonendste Fassung vorn und die am staerksten abgeschliffene hinten.
  const ohneKlammer = start.replace(KLAMMERZUSATZ, '');
  hinzu(ohneKlammer);
  hinzu(schaele(ohneKlammer, NUR_VORN));
  hinzu(schaele(ohneKlammer, NUR_HINTEN));
  hinzu(schaele(ohneKlammer, BEIDE));

  return varianten;
}
