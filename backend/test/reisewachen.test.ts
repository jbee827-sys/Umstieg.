import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reisewachen, type Versand, type Versandergebnis } from '../src/core/reisewachen.js';
import type { ReiseAnmeldung } from '../src/core/reisewache.js';
import type { Mitteilung } from '../src/core/mitteilungstexte.js';
import type { TafelEintrag } from '../src/core/typen.js';
import { Ueberwachung } from '../src/core/ueberwachung.js';
import type { HaltestellenLive } from '../src/routes/live.js';

// Beispielreise wie in reisewache.test.ts: ICE 1134 an 16:01 Gleis 8,
// RE 3352 ("RE 3") ab 16:23 Gleis 6, Berlin Hbf, MEZ.
const um = (hhmm: string): string => `2026-11-23T${hhmm}:00+01:00`;
const zeit = (hhmm: string): Date => new Date(um(hhmm));

const REISE: ReiseAnmeldung = {
  ort: { pfad: 'bahnhof', eva: '8011160' },
  bahnhofName: 'Berlin Hbf',
  haltWort: 'Gleis',
  an: { name: 'ICE 1134', soll: um('16:01'), gleis: '8', richtung: 'Frankfurt(Main)Hbf' },
  ab: { name: 'RE 3352', anzeige: 'RE 3', soll: um('16:23'), gleis: '6', richtung: 'Schwedt (Oder)' },
  gehzeitSek: 240,
};

const TOKEN = 'token-geheim-abc';
const STUNDE = 60 * 60_000;

/** Tafel, die der Test von aussen setzt; Abrufe loest der Test selbst aus. */
function bahnhof(maxEvas = 35) {
  let tafel: TafelEintrag[] = [];
  const u = new Ueberwachung(async () => tafel, 24 * STUNDE, undefined, maxEvas);
  return { u, setze: (t: TafelEintrag[]) => void (tafel = t) };
}

const ice = (zeitIst?: string, gleisIst?: string): TafelEintrag => ({
  zug: 'ICE 1134', zeitSoll: '16:01', gleisSoll: '8', ziel: 'Berlin Hbf',
  ...(zeitIst ? { zeitIst } : {}), ...(gleisIst ? { gleisIst } : {}),
});
const re = (zeitIst?: string, gleisIst?: string): TafelEintrag => ({
  zug: 'RE 3352', zeitSoll: '16:23', gleisSoll: '6', ziel: 'Schwedt (Oder)', anzeige: 'RE 3',
  ...(zeitIst ? { zeitIst } : {}), ...(gleisIst ? { gleisIst } : {}),
});

function versandMit(ergebnis: Versandergebnis = 'ok') {
  const gesendet: { token: string; m: Mitteilung }[] = [];
  const versand: Versand = vi.fn(async (token, _plattform, m) => {
    gesendet.push({ token, m });
    return ergebnis;
  });
  return { versand, gesendet, titel: () => gesendet.map((g) => g.m.titel) };
}

function protokoll() {
  return { warn: vi.fn(), info: vi.fn() };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(zeit('10:00'));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('Reisewachen', () => {
  it('reserviert beim Anmelden und abonniert erst 90 Min. vor der Ankunft', async () => {
    const { u, setze } = bahnhof(1);
    const { versand, titel } = versandMit();
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versand);

    expect(w.melde(TOKEN, 'ios', REISE, '1.2.3.4')).toBe('ok');
    expect(w.anzahl()).toBe(1);
    // Platz belegt, obwohl noch nicht gepollt wird.
    expect(u.hatKapazitaetFuer('8000105')).toBe(false);
    expect(u.stand('8011160')).toEqual([]);

    setze([ice(), re()]);
    await u.pruefeJetzt('8011160'); // ruht: kein Abo, kein Abruf
    expect(u.stand('8011160')).toEqual([]);

    await vi.advanceTimersByTimeAsync(zeit('14:31').getTime() - Date.now());
    await u.pruefeJetzt('8011160'); // erster Abruf: Grundstand
    expect(u.stand('8011160')).toHaveLength(2);
    setze([ice(), re(undefined, '5')]);
    await u.pruefeJetzt('8011160');
    expect(titel()).toEqual(['Gleis 5 statt 6']);
    w.beende();
  });

  it('meldet beim Aufwachen, was sich vorher schon geaendert hatte', async () => {
    const { u, setze } = bahnhof();
    const { versand, titel } = versandMit();
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versand);
    w.melde(TOKEN, 'ios', REISE, '1.2.3.4');
    await vi.advanceTimersByTimeAsync(zeit('14:31').getTime() - Date.now());
    setze([ice('16:09'), re()]);
    await u.pruefeJetzt('8011160');
    expect(titel()).toEqual(['ICE 1134: 16:09 statt 16:01']);
    // Derselbe Stand beim naechsten Abruf: nichts Neues.
    await u.pruefeJetzt('8011160');
    expect(titel()).toHaveLength(1);
    w.beende();
  });

  it('ersetzt die Wache bei erneuter Anmeldung mit demselben Token und gibt den alten Platz frei', () => {
    const { u } = bahnhof(1);
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versandMit().versand);
    w.melde(TOKEN, 'ios', REISE, '1.2.3.4');
    const andere: ReiseAnmeldung = { ...REISE, ort: { pfad: 'bahnhof', eva: '8000105' } };
    // Nur ein Platz: geht nur, weil die alte Reise ihren Platz freigibt.
    expect(w.melde(TOKEN, 'ios', andere, '1.2.3.4')).toBe('ok');
    expect(w.anzahl()).toBe(1);
    expect(u.hatKapazitaetFuer('8011160')).toBe(false);
    w.vergiss(TOKEN);
    expect(w.anzahl()).toBe(0);
    expect(u.hatKapazitaetFuer('8011160')).toBe(true);
    w.beende();
  });

  it('beendet die Wache 2 Min. nach der Abfahrt und gibt Abo und Reservierung frei', async () => {
    const { u, setze } = bahnhof(1);
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versandMit().versand);
    w.melde(TOKEN, 'ios', REISE, '1.2.3.4');
    await vi.advanceTimersByTimeAsync(zeit('15:00').getTime() - Date.now());
    setze([ice(), re()]);
    await u.pruefeJetzt('8011160');
    expect(u.stand('8011160')).toHaveLength(2);

    await vi.advanceTimersByTimeAsync(zeit('16:24').getTime() - Date.now());
    expect(w.anzahl()).toBe(1);
    await vi.advanceTimersByTimeAsync(zeit('16:25').getTime() - Date.now());
    expect(w.anzahl()).toBe(0);
    expect(u.stand('8011160')).toEqual([]); // kein Abo mehr
    expect(u.hatKapazitaetFuer('8000105')).toBe(true);
    w.beende();
  });

  it('verschiebt das Ende mit einer spaeteren Abfahrt', async () => {
    const { u, setze } = bahnhof();
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versandMit().versand);
    w.melde(TOKEN, 'ios', REISE, '1.2.3.4');
    await vi.advanceTimersByTimeAsync(zeit('15:00').getTime() - Date.now());
    setze([ice(), re()]);
    await u.pruefeJetzt('8011160');
    setze([ice(), re('16:31')]);
    await u.pruefeJetzt('8011160');
    await vi.advanceTimersByTimeAsync(zeit('16:30').getTime() - Date.now());
    expect(w.anzahl()).toBe(1);
    await vi.advanceTimersByTimeAsync(zeit('16:33').getTime() - Date.now());
    expect(w.anzahl()).toBe(0);
    w.beende();
  });

  it('beendet die Wache spaetestens 8 h nach der Anmeldung', async () => {
    const { u } = bahnhof();
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versandMit().versand);
    vi.setSystemTime(zeit('07:00'));
    w.melde(TOKEN, 'ios', REISE, '1.2.3.4');
    await vi.advanceTimersByTimeAsync(8 * STUNDE - 1000);
    expect(w.anzahl()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(w.anzahl()).toBe(0);
    w.beende();
  });

  it('antwortet voll, wenn die Ueberwachung keinen Platz hat oder die Hoechstzahl laeuft', () => {
    const { u } = bahnhof(1);
    u.reserviere(['8000105']);
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versandMit().versand);
    expect(w.melde(TOKEN, 'ios', REISE, '1.2.3.4')).toBe('voll');
    expect(w.anzahl()).toBe(0);

    const w2 = new Reisewachen({ bahnhof: bahnhof().u, haltestellen: null }, versandMit().versand, { max: 2 });
    expect(w2.melde('a', 'ios', REISE, '1.1.1.1')).toBe('ok');
    expect(w2.melde('b', 'ios', REISE, '2.2.2.2')).toBe('ok');
    expect(w2.melde('c', 'ios', REISE, '3.3.3.3')).toBe('voll');
    // Ersetzen der eigenen Wache geht auch an der Grenze.
    expect(w2.melde('a', 'ios', REISE, '1.1.1.1')).toBe('ok');
    w.beende();
    w2.beende();
  });

  it('antwortet zu-viele ab der 11. Wache derselben Adresse', () => {
    const w = new Reisewachen({ bahnhof: bahnhof().u, haltestellen: null }, versandMit().versand);
    for (let i = 0; i < 10; i++) expect(w.melde(`t${i}`, 'ios', REISE, '1.2.3.4')).toBe('ok');
    expect(w.melde('t10', 'ios', REISE, '1.2.3.4')).toBe('zu-viele');
    expect(w.melde('t10', 'ios', REISE, '5.6.7.8')).toBe('ok');
    w.beende();
  });

  it('antwortet haltestellen-fehlen fuer den Haltestellenpfad ohne Transitous', () => {
    const w = new Reisewachen({ bahnhof: bahnhof().u, haltestellen: null }, versandMit().versand);
    const bus: ReiseAnmeldung = {
      ...REISE,
      ort: {
        pfad: 'haltestelle',
        an: { id: 'h-an', lat: 52.5, lon: 13.4 },
        ab: { id: 'h-ab', lat: 52.5, lon: 13.4 },
      },
    };
    expect(w.melde(TOKEN, 'ios', bus, '1.2.3.4')).toBe('haltestellen-fehlen');
    w.beende();
  });

  it('beobachtet im Haltestellenpfad Ankunfts- und Abfahrtstafel getrennt', async () => {
    const tafeln = new Map<string, TafelEintrag[]>();
    const u = new Ueberwachung(async (s) => tafeln.get(s) ?? [], 24 * STUNDE);
    const orte: string[] = [];
    const halte: HaltestellenLive = { ueberwachung: u, merkeOrt: (id) => void orte.push(id) };
    const { versand, titel } = versandMit();
    const w = new Reisewachen({ bahnhof: bahnhof().u, haltestellen: halte }, versand);
    const bus: ReiseAnmeldung = {
      ort: {
        pfad: 'haltestelle',
        an: { id: 'h-an', lat: 52.5, lon: 13.4 },
        ab: { id: 'h-ab', lat: 52.5, lon: 13.4 },
      },
      bahnhofName: 'Alexanderplatz',
      haltWort: 'Steig',
      an: { name: 'f-1', anzeige: 'S 5', soll: um('16:01'), gleis: '1', richtung: 'Spandau' },
      ab: { name: 'f-2', anzeige: 'Bus 245', soll: um('16:23'), gleis: 'A', richtung: 'Zoo' },
      gehzeitSek: 240,
    };
    expect(w.melde(TOKEN, 'ios', bus, '1.2.3.4')).toBe('ok');
    expect(u.hatKapazitaetFuerAlle(['x'])).toBe(true);
    await vi.advanceTimersByTimeAsync(zeit('15:00').getTime() - Date.now());
    expect(orte.sort()).toEqual(['h-ab', 'h-an']);

    const f2 = { zug: 'f-2', zeitSoll: '16:23', gleisSoll: 'A', ziel: 'Zoo' };
    tafeln.set('arr|h-an', [{ zug: 'f-1', zeitSoll: '16:01', gleisSoll: '1', ziel: 'x' }]);
    tafeln.set('dep|h-ab', [f2]);
    await u.pruefeJetzt('arr|h-an');
    await u.pruefeJetzt('dep|h-ab');
    tafeln.set('dep|h-ab', [{ ...f2, ausfall: true }]);
    await u.pruefeJetzt('dep|h-ab');
    expect(titel()).toEqual(['Bus 245 fällt aus']);
    w.beende();
  });

  it('beendet die Wache, wenn FCM das Token ablehnt', async () => {
    const { u, setze } = bahnhof();
    const { versand } = versandMit('token-ungueltig');
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versand);
    w.melde(TOKEN, 'ios', REISE, '1.2.3.4');
    await vi.advanceTimersByTimeAsync(zeit('15:00').getTime() - Date.now());
    setze([ice(), re()]);
    await u.pruefeJetzt('8011160');
    setze([ice(), re(undefined, '5')]);
    await u.pruefeJetzt('8011160');
    await vi.advanceTimersByTimeAsync(0);
    expect(w.anzahl()).toBe(0);
    w.beende();
  });

  it('schickt die Erinnerung zur verschobenen Zeit', async () => {
    const { u, setze } = bahnhof();
    const { versand, gesendet } = versandMit();
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versand);
    w.melde(TOKEN, 'ios', REISE, '1.2.3.4');
    await vi.advanceTimersByTimeAsync(zeit('15:00').getTime() - Date.now());
    setze([ice(), re()]);
    await u.pruefeJetzt('8011160');
    setze([ice('16:09'), re()]);
    await u.pruefeJetzt('8011160');

    await vi.advanceTimersByTimeAsync(zeit('15:57').getTime() - Date.now());
    expect(gesendet.map((g) => g.m.art)).toEqual(['zeit-an']); // nicht um 15:56
    await vi.advanceTimersByTimeAsync(zeit('16:04').getTime() - Date.now());
    expect(gesendet.map((g) => [g.m.art, g.m.text])).toEqual([
      ['zeit-an', '14 Min. zum Umsteigen'],
      ['erinnerung', 'RE 3: 16:23 ab Gleis 6'],
    ]);
    w.beende();
  });

  it('protokolliert Fehlschlaege und Summen, aber nie Token, Zug oder Bahnhof', async () => {
    const { u, setze } = bahnhof();
    const log = protokoll();
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versandMit('fehler').versand, { log });
    w.melde(TOKEN, 'ios', REISE, '1.2.3.4');
    await vi.advanceTimersByTimeAsync(zeit('15:00').getTime() - Date.now());
    setze([ice(), re()]);
    await u.pruefeJetzt('8011160');
    setze([ice(), re(undefined, '5')]);
    await u.pruefeJetzt('8011160');
    await vi.advanceTimersByTimeAsync(0);
    expect(w.anzahl()).toBe(1); // ein Fehler beendet die Wache nicht
    w.beende();

    expect(log.warn).toHaveBeenCalledWith(
      expect.objectContaining({ degradation: 'mitteilung-fehlgeschlagen', art: 'gleis-ab' }),
      expect.any(String),
    );
    expect(log.info).toHaveBeenCalledWith(
      expect.objectContaining({ ereignis: 'mitteilungen', je: expect.objectContaining({ angelegt: 1 }) }),
      expect.any(String),
    );
    const alles = JSON.stringify([...log.warn.mock.calls, ...log.info.mock.calls]);
    for (const geheim of [TOKEN, 'RE 3352', 'ICE 1134', 'Berlin Hbf', '8011160', '1.2.3.4']) {
      expect(alles).not.toContain(geheim);
    }
  });

  it('raeumt beim Beenden alle Zeitgeber und Abos', async () => {
    const { u } = bahnhof();
    const { versand, gesendet } = versandMit();
    const w = new Reisewachen({ bahnhof: u, haltestellen: null }, versand);
    w.melde(TOKEN, 'ios', REISE, '1.2.3.4');
    w.beende();
    expect(w.anzahl()).toBe(0);
    expect(u.hatKapazitaetFuerAlle(Array.from({ length: 35 }, (_, i) => String(i)))).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * STUNDE);
    expect(gesendet).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
