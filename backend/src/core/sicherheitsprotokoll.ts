import type { Protokoll } from './ueberwachung.js';

/** Was gemeldet werden kann. Bewusst eine kurze, feste Liste. */
export type Sicherheitsereignis = 'ratelimit' | 'sse-verbindungen' | 'sse-bahnhoefe';

interface Fenster {
  beginn: number;
  treffer: number;
}

/**
 * Sicherheitsereignisse protokollieren - ohne Personenbezug.
 *
 * Punkt 18 der Haerteliste stiess hier auf eine Zusage, die seit dem
 * 02.09.2026 im Code und auf der Datenschutzseite steht: Die Anwendung fuehrt
 * kein Zugriffsprotokoll. Aufgeloest wird das nicht durch einen Kompromiss,
 * sondern durch eine Unterscheidung:
 *
 *   Protokolliert wird, DASS eine Grenze gegriffen hat und WO.
 *   Nie, WER sie ausgeloest hat.
 *
 * Der Eintrag traegt deshalb nur Ereignisart, Routen-MUSTER, Trefferzahl und
 * Fensterlaenge. Die Adresse bleibt im Zaehlwerk der Ratenbegrenzung, im
 * Arbeitsspeicher, und wird nie geschrieben. Auch die aufgerufene URL bleibt
 * draussen - der Unterschied zum Muster ist genau die Abfragezeichenkette,
 * und die traegt bei der Bahnhofssuche die Koordinate.
 *
 * ZWEITENS wird aggregiert, und das ist keine Kosmetik: Ein Eintrag je
 * abgewiesener Anfrage waere selbst die Schwachstelle. Wer schnell genug
 * anfragt, fuellte damit die Platte - der Schutz waere dann der Angriff.
 * Deshalb ein Eintrag beim ersten Treffer (damit man es sofort sieht) und
 * danach hoechstens einer je Fenster mit der Gesamtzahl.
 */
export class Sicherheitsprotokoll {
  private readonly fenster = new Map<string, Fenster>();

  constructor(
    private readonly log: Protokoll,
    private readonly fensterMs = 60_000,
    /** Injizierbar, damit Tests die Zeit stellen koennen statt zu warten. */
    private readonly jetzt: () => number = () => Date.now(),
  ) {}

  melde(ereignis: Sicherheitsereignis, route: string): void {
    const schluessel = `${ereignis}|${route}`;
    const nun = this.jetzt();
    const laufend = this.fenster.get(schluessel);

    if (!laufend) {
      this.fenster.set(schluessel, { beginn: nun, treffer: 1 });
      this.schreibe(ereignis, route, 1);
      return;
    }

    if (nun - laufend.beginn < this.fensterMs) {
      laufend.treffer++;
      return;
    }

    // Fenster abgelaufen: erst zusammenfassen, was war, dann neu anfangen.
    this.schreibe(ereignis, route, laufend.treffer);
    this.fenster.set(schluessel, { beginn: nun, treffer: 1 });
  }

  private schreibe(ereignis: Sicherheitsereignis, route: string, treffer: number): void {
    this.log.warn(
      { ereignis, route, treffer, fenster: `${Math.round(this.fensterMs / 1000)}s` },
      'Sicherheitsgrenze gegriffen',
    );
  }
}
