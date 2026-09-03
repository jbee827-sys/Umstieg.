import type { TafelEintrag } from './typen.js';

// Live-Überwachung (Konzeptkorrektur 1): gepollt wird EINMAL je EVA-Nummer,
// egal wie viele Clients zuschauen – die Ereignisse werden verteilt.

export interface LiveEreignis {
  typ: 'gleiswechsel' | 'verspaetung' | 'heartbeat';
  zug?: string;
  alt?: string;
  neu?: string;
  zeitstempel: string; // ISO – jede Live-Anzeige trägt Zeitstempel
}

export type TafelAbrufFn = (eva: string) => Promise<TafelEintrag[]>;

/**
 * Genau so viel Logger, wie hier gebraucht wird.
 *
 * `core` kennt Fastify nicht und soll es nicht kennen. Fastifys Logger passt
 * strukturell in diese Form, ohne dass die Abhaengigkeit hereinreicht.
 */
export interface Protokoll {
  warn(daten: Record<string, unknown>, nachricht: string): void;
}

interface Abonnent {
  zuege: Set<string>; // leer = alle Züge
  sende: (ereignis: LiveEreignis) => void;
}

interface EvaEintrag {
  abonnenten: Set<Abonnent>;
  letzterStand: Map<string, TafelEintrag>;
  timer?: NodeJS.Timeout;
}

export class Ueberwachung {
  private readonly jeEva = new Map<string, EvaEintrag>();

  constructor(
    private readonly tafelFn: TafelAbrufFn,
    private readonly intervallMs = 30_000,
    private readonly log?: Protokoll,
    /**
     * Wie viele EVA-Nummern hoechstens gleichzeitig ueberwacht werden.
     *
     * Nicht die Verbindung kostet, sondern der Poller dahinter: Jede neue EVA
     * startet eine eigene Abfrage gegen Timetables, alle 30 Sekunden,
     * dauerhaft. Wer viele verschiedene EVA-Nummern abonniert, vervielfacht
     * damit den Verbrauch - ohne dass mehr Verbindungen noetig waeren.
     */
    private readonly maxEvas = 35,
  ) {}

  /**
   * Ist Platz fuer diese EVA?
   *
   * Eine bereits ueberwachte EVA kostet nichts extra - gepollt wird ohnehin
   * nur einmal je EVA, unabhaengig von der Zahl der Zuschauer
   * (Konzeptkorrektur 1). Die Grenze gilt deshalb nur fuer NEUE Nummern.
   */
  hatKapazitaetFuer(eva: string): boolean {
    if (this.jeEva.has(eva)) return true;
    return this.jeEva.size < this.maxEvas;
  }

  /** Meldet einen Abonnenten an; Rückgabe ist die Abmeldefunktion. */
  abonniere(eva: string, zuege: string[], sende: (e: LiveEreignis) => void): () => void {
    let eintrag = this.jeEva.get(eva);
    if (!eintrag) {
      eintrag = { abonnenten: new Set(), letzterStand: new Map() };
      this.jeEva.set(eva, eintrag);
      eintrag.timer = setInterval(() => void this.pruefeJetzt(eva), this.intervallMs);
      eintrag.timer.unref?.();
    }
    const abonnent: Abonnent = { zuege: new Set(zuege), sende };
    eintrag.abonnenten.add(abonnent);
    return () => {
      const aktuell = this.jeEva.get(eva);
      if (!aktuell) return;
      aktuell.abonnenten.delete(abonnent);
      if (aktuell.abonnenten.size === 0) {
        clearInterval(aktuell.timer);
        this.jeEva.delete(eva);
      }
    };
  }

  /** Ein Poll-Durchlauf für eine EVA (vom Timer aufgerufen; Tests rufen direkt). */
  async pruefeJetzt(eva: string): Promise<void> {
    const eintrag = this.jeEva.get(eva);
    if (!eintrag || eintrag.abonnenten.size === 0) return;

    let tafel: TafelEintrag[];
    try {
      tafel = await this.tafelFn(eva);
    } catch (e) {
      // Timetables-Ausfall: kein Heartbeat mit veralteten Daten, Poller läuft
      // weiter. Der Strom bleibt offen und wird einfach stumm - vom Fall „es
      // ändert sich gerade nichts" ist das für den Zuschauer nicht zu
      // unterscheiden. Deshalb wenigstens hier eine Spur; ohne sie war ein
      // Ausfall der Live-Überwachung im Betrieb an gar nichts zu erkennen.
      this.log?.warn(
        { degradation: 'tafel-unerreichbar', eva, grund: String(e) },
        'Live-Ueberwachung ohne Tafeldaten - dieser Durchlauf faellt aus',
      );
      return;
    }

    const zeitstempel = new Date().toISOString();
    const ereignisse: LiveEreignis[] = [];
    for (const aktuell of tafel) {
      // Schluessel aus Zug UND Sollzeit: Ein durchfahrender Zug steht sowohl in
      // der Ankunfts- als auch in der Abfahrtstafel. Nur nach Zugnummer
      // geschluesselt wuerden sich beide Eintraege bei jedem Poll gegenseitig
      // ueberschreiben und eine Phantom-Verspaetung erzeugen. Die Sollzeit ist
      // stabil (nur zeitIst aendert sich) und trennt die beiden Haelften sauber.
      const schluessel = `${aktuell.zug}|${aktuell.zeitSoll}`;
      const vorher = eintrag.letzterStand.get(schluessel);
      if (vorher) {
        const gleisAlt = vorher.gleisIst ?? vorher.gleisSoll;
        const gleisNeu = aktuell.gleisIst ?? aktuell.gleisSoll;
        if (gleisAlt !== gleisNeu) {
          ereignisse.push({ typ: 'gleiswechsel', zug: aktuell.zug, alt: gleisAlt, neu: gleisNeu, zeitstempel });
        }
        const zeitAlt = vorher.zeitIst ?? vorher.zeitSoll;
        const zeitNeu = aktuell.zeitIst ?? aktuell.zeitSoll;
        if (zeitAlt !== zeitNeu) {
          ereignisse.push({ typ: 'verspaetung', zug: aktuell.zug, alt: zeitAlt, neu: zeitNeu, zeitstempel });
        }
      }
      eintrag.letzterStand.set(schluessel, aktuell);
    }

    for (const abonnent of eintrag.abonnenten) {
      abonnent.sende({ typ: 'heartbeat', zeitstempel });
      for (const ereignis of ereignisse) {
        if (abonnent.zuege.size === 0 || (ereignis.zug && abonnent.zuege.has(ereignis.zug))) {
          abonnent.sende(ereignis);
        }
      }
    }
  }
}
