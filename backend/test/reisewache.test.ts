import { describe, expect, it } from 'vitest';
import {
  beurteile,
  endeAm,
  erinnerung,
  neuerZustand,
  seiteVon,
  wachAb,
  type ReiseAnmeldung,
  type WachZustand,
} from '../src/core/reisewache.js';
import type { LiveEreignis } from '../src/core/ueberwachung.js';
import type { Mitteilung } from '../src/core/mitteilungstexte.js';

// Beispielreise (Konzept 4a): ICE 1134 an 16:01 Gleis 8, RE 3352 ("RE 3") ab
// 16:23 Gleis 6, Gehzeit 240 s, Berlin Hbf. Am 23.11. gilt MEZ (+01:00).
const um = (hhmm: string, tag = '2026-11-23'): string => `${tag}T${hhmm}:00+01:00`;
const zeit = (hhmmss: string, tag = '2026-11-23'): Date => new Date(`${tag}T${hhmmss}+01:00`);

const REISE: ReiseAnmeldung = {
  ort: { pfad: 'bahnhof', eva: '8011160' },
  bahnhofName: 'Berlin Hbf',
  haltWort: 'Gleis',
  an: { name: 'ICE 1134', soll: um('16:01'), gleis: '8', richtung: 'Frankfurt(Main)Hbf' },
  ab: { name: 'RE 3352', anzeige: 'RE 3', soll: um('16:23'), gleis: '6', richtung: 'Schwedt (Oder)' },
  gehzeitSek: 240,
};

const ev = (typ: LiveEreignis['typ'], zug?: string, alt?: string, neu?: string): LiveEreignis => ({
  typ,
  ...(zug ? { zug } : {}),
  ...(alt ? { alt } : {}),
  ...(neu ? { neu } : {}),
  zeitstempel: '2026-11-23T14:30:00.000Z',
});

type Schritt = [LiveEreignis, 'an' | 'ab', Date];
const kurz = (ms: Mitteilung[]) => ms.map((m) => [m.art, m.titel, m.text]);

/** Spielt Ereignisse nacheinander ein; je Ereignis die Mitteilungen als [art, titel, text]. */
function lauf(z: WachZustand, schritte: Schritt[]): { zustand: WachZustand; je: string[][][] } {
  const je: string[][][] = [];
  for (const [e, seite, jetzt] of schritte) {
    const r = beurteile(z, e, seite, jetzt);
    z = r.zustand;
    je.push(kurz(r.mitteilungen));
  }
  return { zustand: z, je };
}

const VORHER = zeit('15:30:00');

describe('beurteile – Verspaetungen', () => {
  it('drosselt Verspaetungen ab 2 Min.: 3 → 4 → 5 → 8 Min. ergeben drei Mitteilungen', () => {
    const { je } = lauf(neuerZustand(REISE), [
      [ev('verspaetung', 'RE 3352', '16:23', '16:26'), 'ab', VORHER],
      [ev('verspaetung', 'RE 3352', '16:26', '16:27'), 'ab', VORHER],
      [ev('verspaetung', 'RE 3352', '16:27', '16:28'), 'ab', VORHER],
      [ev('verspaetung', 'RE 3352', '16:28', '16:31'), 'ab', VORHER],
    ]);
    expect(je).toEqual([
      [['zeit-ab', 'RE 3: 16:26 statt 16:23', 'Anschluss erreichbar']],
      [],
      // 16:28 liegt genau 2 Min. nach der zuletzt geschickten 16:26 (Julian, 23.11.2026: "ab 2 Minuten")
      [['zeit-ab', 'RE 3: 16:28 statt 16:23', 'Anschluss erreichbar']],
      [['zeit-ab', 'RE 3: 16:31 statt 16:23', 'Anschluss erreichbar']],
    ]);
  });

  it('schickt eine Verspaetung unter 2 Min., wenn die Ampel die Farbe wechselt', () => {
    // 16:15 → 16:23 sind 8 Min. = 2x Gehzeit: gruen. 16:16 → 7 Min.: gelb.
    const { je } = lauf(neuerZustand(REISE), [
      [ev('verspaetung', 'ICE 1134', '16:01', '16:15'), 'an', VORHER],
      [ev('verspaetung', 'ICE 1134', '16:15', '16:16'), 'an', VORHER],
      [ev('verspaetung', 'ICE 1134', '16:16', '16:17'), 'an', VORHER], // bleibt gelb, 1 Min.
    ]);
    expect(je).toEqual([
      [['zeit-an', 'ICE 1134: 16:15 statt 16:01', '8 Min. zum Umsteigen']],
      [['zeit-an', 'ICE 1134: 16:16 statt 16:01', '7 Min. zum Umsteigen']],
      [],
    ]);
  });

  it('meldet Rot nur beim Wechsel von gruen/gelb auf rot, nicht wenn es rot bleibt', () => {
    const gelb = neuerZustand({ ...REISE, an: { ...REISE.an!, ist: um('16:16') } });
    const { je } = lauf(gelb, [
      [ev('verspaetung', 'ICE 1134', '16:16', '16:20'), 'an', VORHER], // gelb → rot
      [ev('verspaetung', 'ICE 1134', '16:20', '16:21'), 'an', VORHER], // bleibt rot
      [ev('verspaetung', 'RE 3352', '16:23', '16:24'), 'ab', VORHER], // bleibt rot
      [ev('verspaetung', 'RE 3352', '16:24', '16:28'), 'ab', VORHER], // rot → gelb (7 Min.)
      [ev('verspaetung', 'ICE 1134', '16:21', '16:25'), 'an', VORHER], // gelb → rot, wieder ein Rot
    ]);
    expect(je).toEqual([
      [['rot', 'Anschluss knapp', 'RE 3 in 3 Min. ab Gleis 6']],
      [],
      [],
      [['zeit-ab', 'RE 3: 16:28 statt 16:23', 'Anschluss erreichbar']],
      [['rot', 'Anschluss knapp', 'RE 3 in 3 Min. ab Gleis 6']],
    ]);
  });

  it('sagt "Anschluss knapp", wenn die Abfahrt spaeter wird und die Ampel rot bleibt', () => {
    const gelb = neuerZustand({ ...REISE, an: { ...REISE.an!, ist: um('16:16') } });
    const { je, zustand } = lauf(gelb, [
      [ev('verspaetung', 'ICE 1134', '16:16', '16:23'), 'an', VORHER], // gelb → rot
    ]);
    expect(je).toEqual([[['rot', 'Anschluss knapp', 'RE 3 in 0 Min. ab Gleis 6']]]);
    // 16:26 - 16:23 = 3 Min. Umstieg < 4 Min. Gehzeit: bleibt rot, aber 3 Min. neue Abfahrt.
    const r = beurteile(zustand, ev('verspaetung', 'RE 3352', '16:23', '16:26'), 'ab', VORHER);
    expect(kurz(r.mitteilungen)).toEqual([['zeit-ab', 'RE 3: 16:26 statt 16:23', 'Anschluss knapp']]);
    expect(r.mitteilungen[0].daten).toMatchObject({ status: 'knapp' });
  });

  it('schickt bei einer Verspaetung, die Rot ausloest, nur die Rot-Mitteilung', () => {
    // Nach der Ankunft zaehlt die Restzeit ab jetzt: 16:23:00 - 16:20:20 = 2:40 → aufgerundet 3.
    const r = beurteile(neuerZustand(REISE), ev('verspaetung', 'ICE 1134', '16:01', '16:20'), 'an', zeit('16:20:20'));
    expect(kurz(r.mitteilungen)).toEqual([['rot', 'Anschluss knapp', 'RE 3 in 3 Min. ab Gleis 6']]);
    const [rot] = r.mitteilungen;
    expect(rot.buendel).toBe('rot|RE 3352');
    expect(rot.daten).toMatchObject({
      art: 'rot', zug: 'RE 3352', anzeige: 'RE 3', seite: 'ab', restMin: '3', gehMin: '4',
      status: 'knapp', stand: '16:20', aktion: 'weg', aktionGleis: '6',
    });
    // Die neue Zeit gilt als geschickt: Ein Nachzuegler um 1 Min. bleibt still.
    const danach = beurteile(r.zustand, ev('verspaetung', 'ICE 1134', '16:20', '16:21'), 'an', zeit('16:20:40'));
    expect(danach.mitteilungen).toEqual([]);
  });
});

describe('beurteile – Gleiswechsel und Ausfall', () => {
  it('meldet nach einem Gleiswechsel kein Rot mehr (Gehzeit veraltet)', () => {
    const { je, zustand } = lauf(neuerZustand(REISE), [
      [ev('gleiswechsel', 'RE 3352', '6', '5'), 'ab', VORHER],
      [ev('verspaetung', 'ICE 1134', '16:01', '16:20'), 'an', VORHER], // waere Rot
    ]);
    expect(je).toEqual([
      [['gleis-ab', 'Gleis 5 statt 6', 'RE 3 nach Schwedt (Oder), ab 16:23']],
      [['zeit-an', 'ICE 1134: 16:20 statt 16:01', '3 Min. zum Umsteigen']],
    ]);
    const zeitAn = beurteile(zustand, ev('verspaetung', 'ICE 1134', '16:20', '16:24'), 'an', VORHER);
    expect(zeitAn.mitteilungen[0].daten).toMatchObject({ status: 'erreichbar', aktion: 'weg', aktionGleis: '5' });
  });

  it('meldet jeden Gleiswechsel und jeden Ausfall, ungedrosselt', () => {
    const { je } = lauf(neuerZustand(REISE), [
      [ev('gleiswechsel', 'ICE 1134', '8', '9'), 'an', VORHER],
      [ev('gleiswechsel', 'RE 3352', '6', '5'), 'ab', VORHER],
      [ev('gleiswechsel', 'RE 3352', '5', '6'), 'ab', VORHER],
      [ev('ausfall', 'RE 3352'), 'ab', VORHER],
      [ev('ausfall', 'RE 3352'), 'ab', VORHER], // einmal je Seite
      [ev('ausfall', 'ICE 1134'), 'an', VORHER],
    ]);
    expect(je).toEqual([
      [['gleis-an', 'Gleis 9 statt 8', 'ICE 1134 aus Frankfurt(Main)Hbf, an 16:01']],
      [['gleis-ab', 'Gleis 5 statt 6', 'RE 3 nach Schwedt (Oder), ab 16:23']],
      [['gleis-ab', 'Gleis 6 statt 5', 'RE 3 nach Schwedt (Oder), ab 16:23']],
      [['ausfall-ab', 'RE 3 fällt aus', 'Andere Verbindung wählen']],
      [],
      [['ausfall-an', 'ICE 1134 fällt aus', 'Andere Verbindung wählen']],
    ]);
  });

  it('fuellt die Daten: Gleis alt/neu, Ausfall mit anderer Verbindung', () => {
    const gleis = beurteile(neuerZustand(REISE), ev('gleiswechsel', 'RE 3352', '6', '5'), 'ab', zeit('15:56:00'));
    expect(gleis.mitteilungen[0].buendel).toBe('gleis-ab|RE 3352');
    expect(gleis.mitteilungen[0].daten).toEqual({
      art: 'gleis-ab', zug: 'RE 3352', anzeige: 'RE 3', seite: 'ab', alt: '6', neu: '5',
      restMin: '22', gehMin: '4', status: 'erreichbar', stand: '15:56', gleisAlt: '6', gleisNeu: '5',
      aktion: 'weg', aktionGleis: '5',
    });
    const aus = beurteile(gleis.zustand, ev('ausfall', 'RE 3352'), 'ab', zeit('15:57:00'));
    expect(aus.mitteilungen[0].daten).toMatchObject({ art: 'ausfall-ab', status: 'faellt-aus', aktion: 'verbindung' });
    expect(aus.mitteilungen[0].daten).not.toHaveProperty('aktionGleis');
  });

  it('laesst Heartbeat und Quellenwechsel ohne Mitteilung und ohne Aenderung', () => {
    const z = neuerZustand(REISE);
    for (const typ of ['heartbeat', 'quelle-weg', 'quelle-da'] as const) {
      const r = beurteile(z, ev(typ), 'ab', VORHER);
      expect(r.mitteilungen).toEqual([]);
      expect(r.zustand).toBe(z);
    }
  });

  it('veraendert den alten Zustand nicht', () => {
    const z = neuerZustand(REISE);
    const vorher = JSON.stringify(z);
    beurteile(z, ev('gleiswechsel', 'RE 3352', '6', '5'), 'ab', VORHER);
    beurteile(z, ev('verspaetung', 'ICE 1134', '16:01', '16:20'), 'an', VORHER);
    beurteile(z, ev('ausfall', 'RE 3352'), 'ab', VORHER);
    expect(JSON.stringify(z)).toBe(vorher);
  });
});

describe('erinnerung', () => {
  it('verschiebt die Erinnerung mit der Ankunft und laesst eine vergangene weg', () => {
    let z = neuerZustand(REISE);
    const e1 = erinnerung(z, VORHER)!;
    expect(e1.am).toEqual(zeit('15:56:00'));
    expect([e1.mitteilung.art, e1.mitteilung.titel, e1.mitteilung.text]).toEqual([
      'erinnerung', 'Gleich in Berlin Hbf', 'RE 3: 16:23 ab Gleis 6',
    ]);
    expect(e1.mitteilung.buendel).toBe('erinnerung|RE 3352');
    expect(e1.mitteilung.daten).toMatchObject({ restMin: '22', stand: '15:56', aktionGleis: '6' });

    z = lauf(z, [
      [ev('verspaetung', 'ICE 1134', '16:01', '16:09'), 'an', VORHER],
      [ev('gleiswechsel', 'RE 3352', '6', '5'), 'ab', VORHER],
      [ev('verspaetung', 'RE 3352', '16:23', '16:25'), 'ab', VORHER],
    ]).zustand;
    const e2 = erinnerung(z, VORHER)!;
    expect(e2.am).toEqual(zeit('16:04:00'));
    expect(e2.mitteilung.text).toBe('RE 3: 16:25 ab Gleis 5');

    // Weniger als 30 s Vorlauf: entfaellt.
    expect(erinnerung(z, zeit('16:03:40'))).toBeNull();
    expect(erinnerung(z, zeit('16:03:20'))).not.toBeNull();
  });

  it('entfaellt ohne Ankunftszug und nach einem Ausfall', () => {
    const { an: _an, ...ohneAn } = REISE;
    expect(erinnerung(neuerZustand(ohneAn), VORHER)).toBeNull();
    const aus = beurteile(neuerZustand(REISE), ev('ausfall', 'RE 3352'), 'ab', VORHER).zustand;
    expect(erinnerung(aus, VORHER)).toBeNull();
  });
});

describe('seiteVon', () => {
  it('ordnet nach dem Zugnamen zu und laesst fremde Zuege weg', () => {
    const z = neuerZustand(REISE);
    expect(seiteVon(z, ev('verspaetung', 'ICE 1134', '16:01', '16:05'))).toBe('an');
    expect(seiteVon(z, ev('gleiswechsel', 'RE 3352', '6', '5'))).toBe('ab');
    expect(seiteVon(z, ev('verspaetung', 'S 5', '16:10', '16:12'))).toBeNull();
    expect(seiteVon(z, ev('heartbeat'))).toBeNull();
  });

  it('ordnet ein Ereignis ueber die Sollzeit zu, wenn Ankunft und Anschluss derselbe Zug sind', () => {
    const durch = neuerZustand({
      ...REISE,
      an: { ...REISE.an!, name: 'RE 3352', anzeige: 'RE 3', gleis: '6' },
    });
    // Verspaetung: die Seite, deren Zeit dem `alt` des Ereignisses am naechsten liegt.
    expect(seiteVon(durch, ev('verspaetung', 'RE 3352', '16:01', '16:04'))).toBe('an');
    expect(seiteVon(durch, ev('verspaetung', 'RE 3352', '16:23', '16:26'))).toBe('ab');
    // Nach einer Verspaetung zaehlt die aktuelle Zeit der Seite.
    const spaeter = beurteile(durch, ev('verspaetung', 'RE 3352', '16:01', '16:04'), 'an', VORHER).zustand;
    expect(seiteVon(spaeter, ev('verspaetung', 'RE 3352', '16:04', '16:06'))).toBe('an');
    // Gleiswechsel: die Seite, deren Gleis `alt` ist; sonst (beide gleich) der Anschluss.
    const getrennt = neuerZustand({ ...REISE, an: { ...REISE.an!, name: 'RE 3352' } });
    expect(seiteVon(getrennt, ev('gleiswechsel', 'RE 3352', '8', '9'))).toBe('an');
    expect(seiteVon(getrennt, ev('gleiswechsel', 'RE 3352', '6', '5'))).toBe('ab');
    expect(seiteVon(durch, ev('gleiswechsel', 'RE 3352', '6', '5'))).toBe('ab');
    expect(seiteVon(durch, ev('ausfall', 'RE 3352'))).toBe('ab');
  });

  it('folgt im Haltestellenpfad der Quelle und nennt den Steig', () => {
    const bus = neuerZustand({
      ort: {
        pfad: 'haltestelle',
        an: { id: 'de:11000:900100003', lat: 52.52, lon: 13.41 },
        ab: { id: 'de:11000:900100026', lat: 52.52, lon: 13.42 },
      },
      bahnhofName: 'Alexanderplatz',
      haltWort: 'Steig',
      an: { name: 'f-1', anzeige: 'S 5', soll: um('16:01'), gleis: '1', richtung: 'Spandau' },
      ab: { name: 'f-2', anzeige: 'Bus 245', soll: um('16:23'), gleis: 'A', richtung: 'Zoo' },
      gehzeitSek: 240,
    });
    expect(seiteVon(bus, ev('verspaetung', 'f-1', '16:01', '16:05'), 'arr')).toBe('an');
    expect(seiteVon(bus, ev('verspaetung', 'f-2', '16:23', '16:25'), 'dep')).toBe('ab');
    expect(seiteVon(bus, ev('verspaetung', 'f-2', '16:23', '16:25'), 'arr')).toBeNull();
    const r = beurteile(bus, ev('verspaetung', 'f-1', '16:01', '16:20'), 'an', VORHER);
    expect(kurz(r.mitteilungen)).toEqual([['rot', 'Anschluss knapp', 'Bus 245 in 3 Min. ab Steig A']]);
    expect(erinnerung(bus, VORHER)!.mitteilung.text).toBe('Bus 245: 16:23 ab Steig A');
  });
});

describe('Zeiten der Wache', () => {
  it('rechnet ueber Mitternacht: Ankunft 23:52, Anschluss 00:10', () => {
    const nacht = neuerZustand({
      ...REISE,
      an: { ...REISE.an!, soll: um('23:52') },
      ab: { ...REISE.ab, soll: um('00:10', '2026-11-24') },
    });
    const spaet = zeit('23:30:00');
    const { je, zustand } = lauf(nacht, [
      [ev('verspaetung', 'ICE 1134', '23:52', '00:05'), 'an', spaet], // 5 Min. Umstieg: gelb
      [ev('verspaetung', 'ICE 1134', '00:05', '00:08'), 'an', spaet], // 2 Min.: rot
    ]);
    expect(je).toEqual([
      [['zeit-an', 'ICE 1134: 00:05 statt 23:52', '5 Min. zum Umsteigen']],
      [['rot', 'Anschluss knapp', 'RE 3 in 2 Min. ab Gleis 6']],
    ]);
    expect(erinnerung(zustand, spaet)!.am.toISOString()).toBe('2026-11-23T23:03:00.000Z'); // 00:03 Berlin
    expect(wachAb(nacht).toISOString()).toBe('2026-11-23T21:22:00.000Z'); // 22:22 Berlin
    expect(endeAm(zustand, spaet).toISOString()).toBe('2026-11-23T23:12:00.000Z'); // 00:12 Berlin
    // Die Abfahrt wird spaeter: 00:10 → 00:15 bleibt am 24.
    const ab = beurteile(zustand, ev('verspaetung', 'RE 3352', '00:10', '00:15'), 'ab', spaet).zustand;
    expect(endeAm(ab, spaet).toISOString()).toBe('2026-11-23T23:17:00.000Z');
  });

  it('endet 2 Min. nach der aktuellen Abfahrt, spaetestens 8 h nach der Anmeldung', () => {
    const z = neuerZustand(REISE);
    expect(endeAm(z, zeit('10:00:00'))).toEqual(zeit('16:25:00'));
    const spaeter = beurteile(z, ev('verspaetung', 'RE 3352', '16:23', '16:31'), 'ab', VORHER).zustand;
    expect(endeAm(spaeter, zeit('10:00:00'))).toEqual(zeit('16:33:00'));
    expect(endeAm(spaeter, zeit('08:00:00'))).toEqual(zeit('16:00:00'));
  });

  it('wacht 90 Min. vor der Ankunft auf', () => {
    expect(wachAb(neuerZustand(REISE))).toEqual(zeit('14:31:00'));
    expect(wachAb(neuerZustand({ ...REISE, an: { ...REISE.an!, ist: um('16:10') } }))).toEqual(zeit('14:40:00'));
    const { an: _an, ...ohneAn } = REISE;
    expect(wachAb(neuerZustand(ohneAn))).toEqual(zeit('14:53:00'));
  });
});
