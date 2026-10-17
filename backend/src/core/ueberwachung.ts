import type { TafelEintrag } from './typen.js';

// Live-Überwachung (Konzeptkorrektur 1): gepollt wird EINMAL je EVA-Nummer,
// egal wie viele Clients zuschauen – die Ereignisse werden verteilt.

export interface LiveEreignis {
  /**
   * `quelle-weg`/`quelle-da` melden den Ausfall der Tafel und ihre Rueckkehr
   * (Degradationstabelle Zeile 2). Ohne sie blieb der Strom bei einem Ausfall
   * einfach stumm - und stumm ist vom Fall „es aendert sich gerade nichts“
   * nicht zu unterscheiden. Gesendet wird nur beim Zustandswechsel.
   *
   * `ausfall` gibt es nur im Haltestellenpfad (Umstieg 2.0): Dort fällt eine
   * Fahrt sichtbar aus, statt aus der Tafel zu verschwinden.
   */
  typ: 'gleiswechsel' | 'verspaetung' | 'heartbeat' | 'quelle-weg' | 'quelle-da' | 'ausfall';
  zug?: string;
  /** Linie zum Anzeigen, wenn `zug` nur ein Schlüssel ist (Haltestellenpfad: Fahrt-ID). */
  anzeige?: string;
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
  /** Ob der letzte Durchlauf ohne Tafeldaten endete - Kante fuer `quelle-weg`. */
  quelleWeg?: boolean;
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

  /**
   * Ist Platz fuer alle diese Schluessel zugleich?
   *
   * Ein Strom des Haltestellenpfads beobachtet Ankunfts- UND
   * Abfahrtshaltestelle. Einzeln geprueft haette jede den letzten freien Platz
   * fuer sich beansprucht - und die zweite die Grenze ueberschritten.
   */
  hatKapazitaetFuerAlle(schluessel: string[]): boolean {
    const neu = new Set(schluessel.filter((s) => !this.jeEva.has(s)));
    return this.jeEva.size + neu.size <= this.maxEvas;
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
      // Nur die Kante meldet, nicht jeder Durchlauf: Der Poller laeuft alle
      // paar Sekunden weiter, das Banner soll einmal erscheinen.
      if (!eintrag.quelleWeg) {
        eintrag.quelleWeg = true;
        this.anAlle(eintrag, eva, { typ: 'quelle-weg', zeitstempel: new Date().toISOString() });
      }
      return;
    }
    if (eintrag.quelleWeg) {
      eintrag.quelleWeg = false;
      this.anAlle(eintrag, eva, { typ: 'quelle-da', zeitstempel: new Date().toISOString() });
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
      const anzeige = aktuell.anzeige ? { anzeige: aktuell.anzeige } : {};
      if (vorher) {
        const gleisAlt = vorher.gleisIst ?? vorher.gleisSoll;
        const gleisNeu = aktuell.gleisIst ?? aktuell.gleisSoll;
        if (gleisAlt !== gleisNeu) {
          ereignisse.push({ typ: 'gleiswechsel', zug: aktuell.zug, alt: gleisAlt, neu: gleisNeu, zeitstempel, ...anzeige });
        }
        const zeitAlt = vorher.zeitIst ?? vorher.zeitSoll;
        const zeitNeu = aktuell.zeitIst ?? aktuell.zeitSoll;
        if (zeitAlt !== zeitNeu) {
          ereignisse.push({ typ: 'verspaetung', zug: aktuell.zug, alt: zeitAlt, neu: zeitNeu, zeitstempel, ...anzeige });
        }
        if (aktuell.ausfall && !vorher.ausfall) {
          ereignisse.push({ typ: 'ausfall', zug: aktuell.zug, zeitstempel, ...anzeige });
        }
      }
      eintrag.letzterStand.set(schluessel, aktuell);
    }

    for (const abonnent of eintrag.abonnenten) {
      this.zustellen(eva, abonnent, { typ: 'heartbeat', zeitstempel });
      for (const ereignis of ereignisse) {
        if (abonnent.zuege.size === 0 || (ereignis.zug && abonnent.zuege.has(ereignis.zug))) {
          this.zustellen(eva, abonnent, ereignis);
        }
      }
    }
  }

  /** Ein Ereignis an alle Zuschauer dieser EVA, ungefiltert. */
  private anAlle(eintrag: EvaEintrag, eva: string, ereignis: LiveEreignis): void {
    for (const abonnent of eintrag.abonnenten) this.zustellen(eva, abonnent, ereignis);
  }

  /**
   * Ein abgerissener Zuschauer darf die uebrigen nicht mitnehmen.
   *
   * Nach einem Verbindungsabbruch schreibt `sende` in eine tote Verbindung.
   * Ungefangen riss dieser Wurf den ganzen Durchlauf ab - und mit ihm die
   * Aktualisierung fuer JEDEN anderen Zuschauer derselben EVA. Ein einziges
   * totes Handy in der Bahnhofshalle haette gereicht (Degradationstabelle
   * Zeile 6).
   */
  private zustellen(eva: string, abonnent: Abonnent, ereignis: LiveEreignis): void {
    try {
      abonnent.sende(ereignis);
    } catch (e) {
      this.log?.warn(
        { degradation: 'abonnent-unerreichbar', eva, grund: String(e) },
        'Ereignis konnte einem Zuschauer nicht zugestellt werden - die uebrigen laufen weiter',
      );
    }
  }
}
