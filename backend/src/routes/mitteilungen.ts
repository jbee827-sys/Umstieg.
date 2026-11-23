import type { FastifyInstance } from 'fastify';
import { istGueltigeEva } from '../clients/stations.js';
import { mitteilungsDaten, textGleis, type Mitteilung } from '../core/mitteilungstexte.js';
import type { Plattform, ReiseAnmeldung, WachOrt, ZugDerReise } from '../core/reisewache.js';
import type { Reisewachen, Versand } from '../core/reisewachen.js';
import { berlinUhrzeit } from '../core/zeit.js';

/**
 * Mitteilungen ueber Firebase (Konzept 6.1):
 *
 * - `PUT /api/mitteilungen/reise` `{ token, plattform, reise }` → 204 ·
 *   400 `{ fehler }` · 429 `{ fehler: 'zu-viele' }` ·
 *   503 `{ fehler: 'voll' | 'nicht-eingerichtet' }`
 * - `DELETE /api/mitteilungen/reise` `{ token }` → 204, auch ohne Wache
 * - `POST /api/mitteilungen/test` `{ token, plattform }` → 204 · 502 · 503 -
 *   VORUEBERGEHEND fuer TestFlight, vor der Einreichung entfernen.
 *
 * Die Routen nehmen nur Daten, nie Texte: Alle Mitteilungstexte entstehen im
 * Server (`core/mitteilungstexte.ts`). Sonst koennte jeder ueber diesen Server
 * beliebige Mitteilungen an ein Token schicken. `pruefeAnmeldung` baut die
 * Anmeldung deshalb Feld fuer Feld neu auf, statt den Body durchzureichen.
 */

const MAX_TOKEN = 4096;
const MAX_TEXT = 200;
const MAX_GEHZEIT_SEK = 7200;
/** ISO-Zeitpunkt mit Datum, Uhrzeit und Zone - "16:05" allein reicht nicht. */
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

type Pruefung<T> = { ok: true; wert: T } | { ok: false; fehler: string };
type Obj = Record<string, unknown>;

const istObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const istText = (x: unknown, min = 0, max = MAX_TEXT): x is string =>
  typeof x === 'string' && x.length >= min && x.length <= max;
const istIso = (x: unknown): x is string => typeof x === 'string' && ISO.test(x) && !Number.isNaN(Date.parse(x));
const istToken = (x: unknown): x is string => istText(x, 1, MAX_TOKEN);
const istPlattform = (x: unknown): x is Plattform => x === 'ios' || x === 'android';

function pruefeZug(x: unknown): Pruefung<ZugDerReise> {
  if (!istObj(x)) return { ok: false, fehler: 'zug-fehlt' };
  if (!istText(x.name, 1)) return { ok: false, fehler: 'zug-name' };
  if (x.anzeige !== undefined && !istText(x.anzeige, 1)) return { ok: false, fehler: 'zug-anzeige' };
  if (!istIso(x.soll)) return { ok: false, fehler: 'zeit-ungueltig' };
  if (x.ist !== undefined && !istIso(x.ist)) return { ok: false, fehler: 'zeit-ungueltig' };
  if (!istText(x.gleis) || !istText(x.richtung)) return { ok: false, fehler: 'zug-ungueltig' };
  return {
    ok: true,
    wert: {
      name: x.name,
      ...(x.anzeige !== undefined ? { anzeige: x.anzeige } : {}),
      soll: x.soll,
      ...(x.ist !== undefined ? { ist: x.ist } : {}),
      gleis: x.gleis,
      richtung: x.richtung,
    },
  };
}

function pruefeHalt(x: unknown): { id: string; lat: number; lon: number } | null {
  if (!istObj(x) || !istText(x.id, 1, 300)) return null;
  const { lat, lon } = x;
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { id: x.id, lat, lon };
}

function pruefeOrt(x: unknown): WachOrt | null {
  if (!istObj(x)) return null;
  if (x.pfad === 'bahnhof') {
    return typeof x.eva === 'string' && istGueltigeEva(x.eva) ? { pfad: 'bahnhof', eva: x.eva } : null;
  }
  if (x.pfad === 'haltestelle') {
    const an = pruefeHalt(x.an);
    const ab = pruefeHalt(x.ab);
    return an && ab ? { pfad: 'haltestelle', an, ab } : null;
  }
  return null;
}

export function pruefeAnmeldung(
  body: unknown,
): { ok: true; token: string; plattform: Plattform; reise: ReiseAnmeldung } | { ok: false; fehler: string } {
  if (!istObj(body)) return { ok: false, fehler: 'body-ungueltig' };
  if (!istToken(body.token)) return { ok: false, fehler: 'token-ungueltig' };
  if (!istPlattform(body.plattform)) return { ok: false, fehler: 'plattform-ungueltig' };
  const r = body.reise;
  if (!istObj(r)) return { ok: false, fehler: 'reise-fehlt' };
  const ort = pruefeOrt(r.ort);
  if (!ort) return { ok: false, fehler: 'ort-ungueltig' };
  if (!istText(r.bahnhofName, 1)) return { ok: false, fehler: 'bahnhof-ungueltig' };
  if (r.haltWort !== 'Gleis' && r.haltWort !== 'Steig') return { ok: false, fehler: 'haltwort-ungueltig' };
  const gehzeit = r.gehzeitSek;
  if (typeof gehzeit !== 'number' || !Number.isFinite(gehzeit) || gehzeit < 1 || gehzeit > MAX_GEHZEIT_SEK) {
    return { ok: false, fehler: 'gehzeit-ungueltig' };
  }
  const ab = pruefeZug(r.ab);
  if (!ab.ok) return ab;
  let an: ZugDerReise | undefined;
  if (r.an !== undefined) {
    const p = pruefeZug(r.an);
    if (!p.ok) return p;
    an = p.wert;
  }
  return {
    ok: true,
    token: body.token,
    plattform: body.plattform,
    reise: {
      ort,
      bahnhofName: r.bahnhofName,
      haltWort: r.haltWort,
      ...(an ? { an } : {}),
      ab: ab.wert,
      gehzeitSek: gehzeit,
    },
  };
}

/** Beispiel „Gleiswechsel“ aus Konzept 4a, mit denselben Daten wie eine echte Mitteilung. */
function testmitteilung(jetzt: Date): Mitteilung {
  const zug = { anzeige: 'RE 3', uhr: '16:23', gleis: '5', richtung: 'Schwedt (Oder)' };
  return {
    art: 'gleis-ab',
    ...textGleis(zug, 'ab', 'Gleis', '6', '5'),
    buendel: 'test|gleis-ab',
    // `test` laesst die App die Mitteilung nicht als echte Meldung nachtragen.
    daten: {
      ...mitteilungsDaten({
      art: 'gleis-ab',
      zug: 'RE 3352',
      anzeige: 'RE 3',
      seite: 'ab',
      alt: '6',
      neu: '5',
      restMin: 9,
      gehMin: 4,
      status: 'erreichbar',
      stand: berlinUhrzeit(jetzt.toISOString()),
      gleisAlt: '6',
      gleisNeu: '5',
      aktion: 'weg',
      aktionGleis: '5',
      }),
      test: '1',
    },
  };
}

export function registriereMitteilungsRouten(
  app: FastifyInstance,
  wachen: Reisewachen | null,
  versand: Versand | null,
): void {
  const optionen = { bodyLimit: 16_384 };

  app.put('/api/mitteilungen/reise', optionen, async (anfrage, antwort) => {
    const p = pruefeAnmeldung(anfrage.body);
    if (!p.ok) return antwort.code(400).send({ fehler: p.fehler });
    if (!wachen) return antwort.code(503).send({ fehler: 'nicht-eingerichtet' });
    switch (wachen.melde(p.token, p.plattform, p.reise, anfrage.ip)) {
      case 'ok':
        return antwort.code(204).send();
      case 'zu-viele':
        return antwort.code(429).send({ fehler: 'zu-viele' });
      case 'voll':
        return antwort.code(503).send({ fehler: 'voll' });
      case 'haltestellen-fehlen':
        return antwort.code(503).send({ fehler: 'nicht-eingerichtet' });
    }
  });

  app.delete('/api/mitteilungen/reise', optionen, async (anfrage, antwort) => {
    const body = anfrage.body;
    if (!istObj(body) || !istToken(body.token)) return antwort.code(400).send({ fehler: 'token-ungueltig' });
    wachen?.vergiss(body.token);
    return antwort.code(204).send();
  });

  // VORUEBERGEHEND (Konzept 9): Testmitteilung fuer TestFlight - vor der Einreichung entfernen.
  app.post('/api/mitteilungen/test', optionen, async (anfrage, antwort) => {
    const body = anfrage.body;
    if (!istObj(body) || !istToken(body.token)) return antwort.code(400).send({ fehler: 'token-ungueltig' });
    if (!istPlattform(body.plattform)) return antwort.code(400).send({ fehler: 'plattform-ungueltig' });
    if (!versand) return antwort.code(503).send({ fehler: 'nicht-eingerichtet' });
    const ergebnis = await versand(body.token, body.plattform, testmitteilung(new Date()));
    if (ergebnis !== 'ok') {
      app.log.warn({ ereignis: 'testmitteilung', ergebnis }, 'Testmitteilung nicht zugestellt');
      return antwort.code(502).send({ fehler: ergebnis });
    }
    return antwort.code(204).send();
  });
}
