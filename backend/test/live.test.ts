import { describe, it, expect, vi } from 'vitest';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.js';
import { Ueberwachung, type LiveEreignis } from '../src/core/ueberwachung.js';
import type { TafelEintrag } from '../src/core/typen.js';

const basisEintrag: TafelEintrag = {
  zug: 'ICE 1006',
  zeitSoll: '14:26',
  gleisSoll: '14',
  ziel: 'Hamburg-Altona',
};

/**
 * Degradationstabelle Zeile 2: Timetables faellt aus.
 *
 * Bis zum 04.09.2026 blieb der Strom bei einem Tafelausfall einfach stumm -
 * und stumm ist vom Fall „es aendert sich gerade nichts“ nicht zu
 * unterscheiden. Sichtbar war der Ausfall nur im Serverprotokoll. Das Konzept
 * verlangt ein Banner; dafuer muss der Ausfall ueberhaupt erst beim Zuschauer
 * ankommen.
 */
describe('Ueberwachung: Tafelausfall wird gemeldet', () => {
  function machePruefstand(faelltAus: () => boolean) {
    const ueberwachung = new Ueberwachung(async () => {
      if (faelltAus()) throw new Error('Timetables nicht erreichbar (Test)');
      return [basisEintrag];
    });
    const empfangen: LiveEreignis[] = [];
    ueberwachung.abonniere('8011160', [], (e) => empfangen.push(e));
    return { ueberwachung, empfangen };
  }

  it('meldet den Ausfall als eigenes Ereignis', async () => {
    let aus = false;
    const { ueberwachung, empfangen } = machePruefstand(() => aus);

    await ueberwachung.pruefeJetzt('8011160');
    aus = true;
    await ueberwachung.pruefeJetzt('8011160');

    expect(empfangen.some((e) => e.typ === 'quelle-weg')).toBe(true);
  });

  it('meldet den Ausfall nur beim Zustandswechsel, nicht bei jedem Durchlauf', async () => {
    // Ein Banner, keine Flut: Der Poller laeuft alle paar Sekunden weiter.
    let aus = true;
    const { ueberwachung, empfangen } = machePruefstand(() => aus);

    await ueberwachung.pruefeJetzt('8011160');
    await ueberwachung.pruefeJetzt('8011160');
    await ueberwachung.pruefeJetzt('8011160');

    expect(empfangen.filter((e) => e.typ === 'quelle-weg')).toHaveLength(1);
  });

  it('meldet die Rueckkehr, wenn die Tafel wieder antwortet', async () => {
    let aus = true;
    const { ueberwachung, empfangen } = machePruefstand(() => aus);

    await ueberwachung.pruefeJetzt('8011160');
    aus = false;
    await ueberwachung.pruefeJetzt('8011160');

    expect(empfangen.some((e) => e.typ === 'quelle-da')).toBe(true);
  });

  it('meldet keine Rueckkehr, wenn nie etwas ausgefallen war', async () => {
    const { ueberwachung, empfangen } = machePruefstand(() => false);

    await ueberwachung.pruefeJetzt('8011160');
    await ueberwachung.pruefeJetzt('8011160');

    expect(empfangen.some((e) => e.typ === 'quelle-da')).toBe(false);
  });
});

describe('Ueberwachung', () => {
  it('erkennt einen Gleiswechsel und verteilt das Ereignis', async () => {
    let tafel: TafelEintrag[] = [basisEintrag];
    const tafelFn = vi.fn(async () => tafel);
    const ueberwachung = new Ueberwachung(tafelFn);
    const empfangen: LiveEreignis[] = [];
    ueberwachung.abonniere('8011160', ['ICE 1006'], (e) => empfangen.push(e));

    await ueberwachung.pruefeJetzt('8011160'); // Erstaufnahme, kein Ereignis außer heartbeat
    tafel = [{ ...basisEintrag, gleisIst: '12' }];
    await ueberwachung.pruefeJetzt('8011160');

    const wechsel = empfangen.find((e) => e.typ === 'gleiswechsel');
    expect(wechsel).toBeDefined();
    expect(wechsel!.zug).toBe('ICE 1006');
    expect(wechsel!.alt).toBe('14');
    expect(wechsel!.neu).toBe('12');
    expect(wechsel!.zeitstempel).toBeTruthy();
  });

  it('erkennt eine Verspätung', async () => {
    let tafel: TafelEintrag[] = [basisEintrag];
    const ueberwachung = new Ueberwachung(async () => tafel);
    const empfangen: LiveEreignis[] = [];
    ueberwachung.abonniere('8011160', ['ICE 1006'], (e) => empfangen.push(e));

    await ueberwachung.pruefeJetzt('8011160');
    tafel = [{ ...basisEintrag, zeitIst: '14:35' }];
    await ueberwachung.pruefeJetzt('8011160');

    const verspaetung = empfangen.find((e) => e.typ === 'verspaetung');
    expect(verspaetung).toBeDefined();
    expect(verspaetung!.alt).toBe('14:26');
    expect(verspaetung!.neu).toBe('14:35');
  });

  it('zwei Abonnenten derselben EVA → EIN Poll, beide erhalten Ereignisse', async () => {
    let tafel: TafelEintrag[] = [basisEintrag];
    const tafelFn = vi.fn(async () => tafel);
    const ueberwachung = new Ueberwachung(tafelFn);
    const a: LiveEreignis[] = [];
    const b: LiveEreignis[] = [];
    ueberwachung.abonniere('8011160', ['ICE 1006'], (e) => a.push(e));
    ueberwachung.abonniere('8011160', ['ICE 1006'], (e) => b.push(e));

    await ueberwachung.pruefeJetzt('8011160');
    expect(tafelFn).toHaveBeenCalledTimes(1);

    tafel = [{ ...basisEintrag, gleisIst: '12' }];
    await ueberwachung.pruefeJetzt('8011160');
    expect(tafelFn).toHaveBeenCalledTimes(2);
    expect(a.some((e) => e.typ === 'gleiswechsel')).toBe(true);
    expect(b.some((e) => e.typ === 'gleiswechsel')).toBe(true);
  });

  it('jeder Poll sendet einen Heartbeat mit Zeitstempel', async () => {
    const ueberwachung = new Ueberwachung(async () => [basisEintrag]);
    const empfangen: LiveEreignis[] = [];
    ueberwachung.abonniere('8011160', [], (e) => empfangen.push(e));
    await ueberwachung.pruefeJetzt('8011160');
    expect(empfangen.filter((e) => e.typ === 'heartbeat')).toHaveLength(1);
  });

  it('nach Abmeldung des letzten Abonnenten wird nicht mehr gepollt', async () => {
    const tafelFn = vi.fn(async () => [basisEintrag]);
    const ueberwachung = new Ueberwachung(tafelFn);
    const abmelden = ueberwachung.abonniere('8011160', [], () => {});
    abmelden();
    await ueberwachung.pruefeJetzt('8011160');
    expect(tafelFn).not.toHaveBeenCalled();
  });

  it('Tafel-Fehler bricht die Überwachung nicht ab', async () => {
    const ueberwachung = new Ueberwachung(async () => {
      throw new Error('Timetables down');
    });
    const empfangen: LiveEreignis[] = [];
    ueberwachung.abonniere('8011160', [], (e) => empfangen.push(e));
    await expect(ueberwachung.pruefeJetzt('8011160')).resolves.toBeUndefined();
    // Kein Heartbeat mit veralteten Daten - das war und bleibt der Punkt.
    // Seit dem 04.09.2026 geht stattdessen die Ausfallmeldung raus (Zeile 2
    // der Degradationstabelle): stumm bleiben hiesse, den Ausfall zu
    // verschweigen.
    expect(empfangen.some((e) => e.typ === 'heartbeat')).toBe(false);
    expect(empfangen.map((e) => e.typ)).toEqual(['quelle-weg']);
  });

  it('trennt Ankunft und Abfahrt desselben Zuges (keine Phantom-Verspätung)', async () => {
    // Ein durchfahrender Zug steht in beiden Tafeln – mit unterschiedlicher
    // Sollzeit. Ohne zusammengesetzten Schlüssel erzeugte jeder Poll ein Ereignis.
    const tafel: TafelEintrag[] = [
      { ...basisEintrag, zeitSoll: '14:26' },
      { ...basisEintrag, zeitSoll: '14:31' },
    ];
    const ueberwachung = new Ueberwachung(async () => tafel);
    const empfangen: LiveEreignis[] = [];
    ueberwachung.abonniere('8011160', [], (e) => empfangen.push(e));

    await ueberwachung.pruefeJetzt('8011160');
    await ueberwachung.pruefeJetzt('8011160');
    await ueberwachung.pruefeJetzt('8011160');

    expect(empfangen.filter((e) => e.typ === 'verspaetung')).toHaveLength(0);
    expect(empfangen.filter((e) => e.typ === 'gleiswechsel')).toHaveLength(0);
  });
});

/** Liest den SSE-Strom, bis der Text auftaucht oder die Frist abläuft. */
async function liesBis(
  leser: ReadableStreamDefaultReader<Uint8Array>,
  enthaelt: string,
  fristMs = 3000,
): Promise<string> {
  const dekoder = new TextDecoder();
  let text = '';
  const ende = Date.now() + fristMs;
  while (Date.now() < ende) {
    const naechstes = await Promise.race([
      leser.read(),
      new Promise<null>((auf) => setTimeout(() => auf(null), ende - Date.now())),
    ]);
    if (!naechstes || naechstes.done) break;
    text += dekoder.decode(naechstes.value, { stream: true });
    if (text.includes(enthaelt)) return text;
  }
  return text;
}

describe('GET /api/live/:eva (SSE)', () => {
  /** Startet die App auf einem freien Port; gibt Basis-URL und Aufräumfunktion. */
  async function starteApp(ueberwachung: Ueberwachung) {
    const app = buildApp({ ueberwachung });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const { port } = app.server.address() as AddressInfo;
    return { basis: `http://127.0.0.1:${port}`, schliesse: () => app.close() };
  }

  it('liefert einen Gleiswechsel als SSE-Ereignis beim Client aus', async () => {
    let tafel: TafelEintrag[] = [basisEintrag];
    const ueberwachung = new Ueberwachung(async () => tafel);
    const { basis, schliesse } = await starteApp(ueberwachung);
    const steuerung = new AbortController();
    try {
      const antwort = await fetch(`${basis}/api/live/8011160?zugAn=ICE+1006`, {
        signal: steuerung.signal,
      });
      expect(antwort.status).toBe(200);
      expect(antwort.headers.get('content-type')).toContain('text/event-stream');

      const leser = antwort.body!.getReader();
      // Der Begrüßungskommentar belegt, dass das Abonnement steht.
      expect(await liesBis(leser, ': verbunden')).toContain(': verbunden');

      await ueberwachung.pruefeJetzt('8011160'); // Erstaufnahme
      tafel = [{ ...basisEintrag, gleisIst: '12' }];
      await ueberwachung.pruefeJetzt('8011160');

      const text = await liesBis(leser, 'event: gleiswechsel');
      expect(text).toContain('event: gleiswechsel');
      expect(text).toContain('"neu":"12"');
      expect(text).toContain('"zeitstempel"');
    } finally {
      steuerung.abort();
      await schliesse();
    }
  });

  it('zwei Clients derselben EVA verursachen nur EINEN Poll', async () => {
    const tafelFn = vi.fn(async () => [basisEintrag]);
    const ueberwachung = new Ueberwachung(tafelFn);
    const { basis, schliesse } = await starteApp(ueberwachung);
    const steuerung = new AbortController();
    try {
      const beide = await Promise.all([
        fetch(`${basis}/api/live/8011160`, { signal: steuerung.signal }),
        fetch(`${basis}/api/live/8011160`, { signal: steuerung.signal }),
      ]);
      for (const antwort of beide) {
        await liesBis(antwort.body!.getReader(), ': verbunden');
      }

      await ueberwachung.pruefeJetzt('8011160');
      expect(tafelFn).toHaveBeenCalledTimes(1);
    } finally {
      steuerung.abort();
      await schliesse();
    }
  });

  it('Verbindungsabbruch meldet den Abonnenten ab', async () => {
    const tafelFn = vi.fn(async () => [basisEintrag]);
    const ueberwachung = new Ueberwachung(tafelFn);
    const { basis, schliesse } = await starteApp(ueberwachung);
    try {
      const steuerung = new AbortController();
      const antwort = await fetch(`${basis}/api/live/8011160`, { signal: steuerung.signal });
      await liesBis(antwort.body!.getReader(), ': verbunden');

      steuerung.abort();
      // Dem Server einen Moment geben, das close-Ereignis zu verarbeiten.
      await new Promise((auf) => setTimeout(auf, 150));

      await ueberwachung.pruefeJetzt('8011160');
      expect(tafelFn).not.toHaveBeenCalled();
    } finally {
      await schliesse();
    }
  });
});
