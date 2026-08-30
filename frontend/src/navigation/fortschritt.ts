import type { Schritt } from '../api/typen';
import { MINDEST_SCHRITT_MS } from './schwellen';

/** Auf [0, laenge-1] begrenzen; leere Liste ergibt 0. */
function begrenze(index: number, laenge: number): number {
  if (laenge === 0) return 0;
  return Math.min(Math.max(index, 0), laenge - 1);
}

/**
 * Welcher Schritt ist gerade dran?
 *
 * Rein: Die Zeit kommt als Parameter herein, damit die Logik ohne Fake-Timer
 * pruefbar ist – dieselbe Entscheidung wie bei pruefeAnkunft.
 *
 * `versatz` ist die Summe der Nutzerkorrekturen und wirkt DAUERHAFT: Die Uhr
 * schlaegt vor, der Mensch entscheidet, und seine Entscheidung wird nicht von
 * der naechsten Zeitschaetzung ueberstimmt.
 *
 * Fehlt auch nur einem Schritt `sekunden` (aeltere Backend-Version), wird gar
 * nicht geschaetzt – dann zaehlt allein der Versatz, also reines manuelles
 * Weiterschalten. Halbe Schaetzungen waeren schlimmer als keine.
 */
export function aktiverSchritt(
  schritte: Schritt[],
  startZeitMs: number,
  jetztMs: number,
  versatz: number,
): number {
  if (schritte.length === 0) return 0;

  const zeitgesteuert = schritte.every((s) => typeof s.sekunden === 'number');
  if (!zeitgesteuert) return begrenze(versatz, schritte.length);

  const verstrichen = Math.max(0, jetztMs - startZeitMs);
  let summe = 0;
  let ausZeit = schritte.length - 1;
  for (let i = 0; i < schritte.length; i++) {
    summe += Math.max((schritte[i].sekunden ?? 0) * 1000, MINDEST_SCHRITT_MS);
    if (verstrichen < summe) {
      ausZeit = i;
      break;
    }
  }
  return begrenze(ausZeit + versatz, schritte.length);
}
