import { erzeugeAnfragezaehler, type Anfragezaehler, type ZaehlerProtokoll } from './anfragezaehler.js';
import type { Mitteilung } from './mitteilungstexte.js';
import {
  abgleich,
  beurteile,
  endeAm,
  erinnerung,
  neuerZustand,
  seiteVon,
  wachAb,
  type Plattform,
  type ReiseAnmeldung,
  type WachZustand,
} from './reisewache.js';
import type { LiveEreignis, Protokoll, Ueberwachung } from './ueberwachung.js';
import { haltestellenLiveSchluessel, type HaltestellenLive } from '../routes/live.js';

// Reisewachen (Konzept 6.1): der Lebenszyklus aller Wachen - Platz, Ruhe bis
// 90 Min. vor der Ankunft, Abos, Erinnerungs- und Endzeitgeber, Versand. WAS
// gemeldet wird, entscheidet allein `reisewache.ts`.
//
// Nur im Arbeitsspeicher. Ins Protokoll gehen Summen und Fehlerarten, nie
// Token, Zug, Bahnhof oder Adresse.

export type Versandergebnis = 'ok' | 'token-ungueltig' | 'fehler';
export type Versand = (token: string, plattform: Plattform, m: Mitteilung) => Promise<Versandergebnis>;
export type Meldeergebnis = 'ok' | 'voll' | 'zu-viele' | 'haltestellen-fehlen';

export interface WachQuellen {
  bahnhof: Ueberwachung;
  haltestellen: HaltestellenLive | null;
}

type Seite = 'an' | 'ab';

/** Ein Schluessel der Ueberwachung und was die Wache dort beobachtet. */
interface Beobachtung {
  schluessel: string;
  zuege: string[];
  /** Haltestellenpfad: aus welcher Tafel; Bahnhofspfad: beide in einer. */
  quelle?: 'arr' | 'dep';
  seiten: Seite[];
}

interface Wache {
  token: string;
  plattform: Plattform;
  aufrufer: string;
  angemeldet: Date;
  zustand: WachZustand;
  ueberwachung: Ueberwachung;
  beobachtungen: Beobachtung[];
  /** Seiten, deren Zug schon mit der Tafel abgeglichen ist. */
  abgeglichen: Set<Seite>;
  freigabe: () => void;
  abmeldungen: (() => void)[];
  wecker?: NodeJS.Timeout;
  erinnerer?: NodeJS.Timeout;
  ender?: NodeJS.Timeout;
}

/** Hoechstzahlen wie `SSE_GRENZEN_STANDARD` (Konzept 6.1, Grenzen). */
export const WACHEN_STANDARD = { max: 300, jeAufrufer: 10 };

function zeitgeber(f: () => void, ms: number): NodeJS.Timeout {
  const t = setTimeout(f, Math.max(0, ms));
  t.unref?.();
  return t;
}

export class Reisewachen {
  private readonly wachen = new Map<string, Wache>();
  private readonly max: number;
  private readonly jeAufrufer: number;
  private readonly jetzt: () => Date;
  private readonly log?: Protokoll & ZaehlerProtokoll;
  private readonly zaehler: Anfragezaehler;

  constructor(
    private readonly quellen: WachQuellen,
    private readonly versand: Versand,
    o: { max?: number; jeAufrufer?: number; log?: Protokoll & ZaehlerProtokoll; jetzt?: () => Date } = {},
  ) {
    this.max = o.max ?? WACHEN_STANDARD.max;
    this.jeAufrufer = o.jeAufrufer ?? WACHEN_STANDARD.jeAufrufer;
    this.jetzt = o.jetzt ?? (() => new Date());
    this.log = o.log;
    this.zaehler = erzeugeAnfragezaehler({
      log: o.log,
      jetzt: this.jetzt,
      ereignis: 'mitteilungen',
      nachricht: 'Reisewachen und Mitteilungen dieser Stunde',
    });
  }

  /**
   * Legt eine Wache an oder ersetzt die mit demselben Token (eine Reise je
   * Geraet). Die alte Wache endet in jedem Fall - auch wenn die neue abgewiesen
   * wird: Die App meldet nur die Reise an, die gerade laeuft.
   */
  melde(token: string, plattform: Plattform, reise: ReiseAnmeldung, aufrufer: string): Meldeergebnis {
    this.vergiss(token);

    const ort = reise.ort;
    let ueberwachung: Ueberwachung;
    let beobachtungen: Beobachtung[];
    if (ort.pfad === 'bahnhof') {
      ueberwachung = this.quellen.bahnhof;
      const zuege = [...new Set([reise.an?.name, reise.ab.name].filter((z): z is string => Boolean(z)))];
      beobachtungen = [{ schluessel: ort.eva, zuege, seiten: reise.an ? ['an', 'ab'] : ['ab'] }];
    } else {
      if (!this.quellen.haltestellen) return 'haltestellen-fehlen';
      ueberwachung = this.quellen.haltestellen.ueberwachung;
      beobachtungen = [
        ...(reise.an
          ? [{ schluessel: haltestellenLiveSchluessel(ort.an.id, 'arr'), zuege: [reise.an.name], quelle: 'arr' as const, seiten: ['an' as const] }]
          : []),
        { schluessel: haltestellenLiveSchluessel(ort.ab.id, 'dep'), zuege: [reise.ab.name], quelle: 'dep', seiten: ['ab'] },
      ];
    }

    if (this.wachen.size >= this.max) return 'voll';
    let vonDort = 0;
    for (const w of this.wachen.values()) if (w.aufrufer === aufrufer) vonDort++;
    if (vonDort >= this.jeAufrufer) return 'zu-viele';
    const schluessel = beobachtungen.map((b) => b.schluessel);
    if (!ueberwachung.hatKapazitaetFuerAlle(schluessel)) return 'voll';

    const angemeldet = this.jetzt();
    const wache: Wache = {
      token,
      plattform,
      aufrufer,
      angemeldet,
      zustand: neuerZustand(reise),
      ueberwachung,
      beobachtungen,
      abgeglichen: new Set(),
      freigabe: ueberwachung.reserviere(schluessel),
      abmeldungen: [],
    };
    this.wachen.set(token, wache);
    this.zaehler.zaehle('angelegt');

    wache.wecker = zeitgeber(() => this.wecke(wache), wachAb(wache.zustand).getTime() - angemeldet.getTime());
    this.planeZeitgeber(wache);
    return 'ok';
  }

  /** Beendet die Wache dieses Tokens; ohne Wache geschieht nichts. */
  vergiss(token: string): void {
    const w = this.wachen.get(token);
    if (!w) return;
    this.wachen.delete(token);
    clearTimeout(w.wecker);
    clearTimeout(w.erinnerer);
    clearTimeout(w.ender);
    for (const abmelden of w.abmeldungen) abmelden();
    w.abmeldungen = [];
    w.freigabe();
  }

  anzahl(): number {
    return this.wachen.size;
  }

  /** Beim Herunterfahren: alle Wachen weg, laufende Stunde ins Protokoll. */
  beende(): void {
    for (const token of [...this.wachen.keys()]) this.vergiss(token);
    this.zaehler.beende();
  }

  private aktiv(w: Wache): boolean {
    return this.wachen.get(w.token) === w;
  }

  /** 90 Min. vor der Ankunft: Abos anlegen. */
  private wecke(w: Wache): void {
    if (!this.aktiv(w)) return;
    const ort = w.zustand.reise.ort;
    if (ort.pfad === 'haltestelle') {
      // Erst jetzt: Die Ueberwachung findet die Haltestelle nur ueber diese
      // Koordinate, und der Zwischenspeicher dafuer haelt nicht ewig.
      this.quellen.haltestellen?.merkeOrt(ort.an.id, { lat: ort.an.lat, lon: ort.an.lon });
      this.quellen.haltestellen?.merkeOrt(ort.ab.id, { lat: ort.ab.lat, lon: ort.ab.lon });
    }
    for (const b of w.beobachtungen) {
      w.abmeldungen.push(w.ueberwachung.abonniere(b.schluessel, b.zuege, (e) => this.empfange(w, b, e)));
    }
  }

  private empfange(w: Wache, b: Beobachtung, e: LiveEreignis): void {
    if (!this.aktiv(w)) return;
    const jetzt = this.jetzt();
    let mitteilungen: Mitteilung[] = [];
    if (e.typ === 'heartbeat') {
      // Nach jedem Abruf: noch nicht abgeglichene Seiten mit der Tafel vergleichen.
      const offen = b.seiten.filter((s) => !w.abgeglichen.has(s));
      if (offen.length === 0) return;
      const r = abgleich(w.zustand, w.ueberwachung.stand(b.schluessel), offen, jetzt);
      for (const s of r.gefunden) w.abgeglichen.add(s);
      w.zustand = r.zustand;
      mitteilungen = r.mitteilungen;
    } else {
      const seite = seiteVon(w.zustand, e, b.quelle);
      if (!seite) return;
      const r = beurteile(w.zustand, e, seite, jetzt);
      if (r.zustand === w.zustand) return;
      w.zustand = r.zustand;
      mitteilungen = r.mitteilungen;
    }
    for (const m of mitteilungen) this.schicke(w, m);
    this.planeZeitgeber(w);
  }

  /** Erinnerung und Ende folgen dem aktuellen Stand - nach jeder Aenderung neu gestellt. */
  private planeZeitgeber(w: Wache): void {
    const jetztMs = this.jetzt().getTime();
    clearTimeout(w.erinnerer);
    w.erinnerer = undefined;
    const e = erinnerung(w.zustand, new Date(jetztMs));
    if (e) {
      w.erinnerer = zeitgeber(() => {
        if (this.aktiv(w)) this.schicke(w, e.mitteilung);
      }, e.am.getTime() - jetztMs);
    }
    clearTimeout(w.ender);
    w.ender = zeitgeber(() => {
      if (this.aktiv(w)) this.vergiss(w.token);
    }, endeAm(w.zustand, w.angemeldet).getTime() - jetztMs);
  }

  private schicke(w: Wache, m: Mitteilung): void {
    void this.verschicke(w, m);
  }

  /** Wirft nie: Ein Versandfehler darf weder die Wache noch den Poller mitreissen. */
  private async verschicke(w: Wache, m: Mitteilung): Promise<void> {
    let ergebnis: Versandergebnis;
    try {
      ergebnis = await this.versand(w.token, w.plattform, m);
    } catch {
      ergebnis = 'fehler';
    }
    if (ergebnis === 'ok') {
      this.zaehler.zaehle(`geschickt-${m.art}`);
    } else if (ergebnis === 'token-ungueltig') {
      this.zaehler.zaehle('token-ungueltig');
      if (this.aktiv(w)) this.vergiss(w.token);
    } else {
      this.zaehler.zaehle('fehler');
      this.log?.warn(
        { degradation: 'mitteilung-fehlgeschlagen', art: m.art },
        'Mitteilung konnte nicht verschickt werden',
      );
    }
  }
}
