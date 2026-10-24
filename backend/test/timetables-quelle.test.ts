import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { erzeugeTimetablesQuelle } from '../src/clients/timetables.js';
import { erzeugeTimetablesBudget, TimetablesAusgelastetError } from '../src/clients/timetables-budget.js';
import { FehlendeZugangsdatenError } from '../src/clients/stations.js';

function ladeFixture(name: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/db/${name}`, import.meta.url)), 'utf8');
}

function uhr(start = Date.parse('2026-10-24T12:10:00Z')) {
  let t = start;
  return { jetzt: () => new Date(t), vor: (ms: number) => void (t += ms) };
}

/**
 * fetch-Attrappe, die mitschreibt, was hinausging. `status` erlaubt, einzelne
 * Antworten scheitern zu lassen.
 */
function zaehlendesFetch(o: { status?: () => number } = {}) {
  const urls: string[] = [];
  const fetchFn = vi.fn(async (eingabe: RequestInfo | URL) => {
    const url = String(eingabe);
    urls.push(url);
    const status = o.status?.() ?? 200;
    if (status !== 200) return new Response('', { status });
    const body = url.includes('/plan/') ? ladeFixture('tafel-plan.xml') : ladeFixture('tafel-fchg.xml');
    return new Response(body, { status: 200, headers: { 'content-type': 'application/xml' } });
  }) as unknown as typeof fetch;
  return {
    fetchFn,
    urls,
    plan: () => urls.filter((u) => u.includes('/plan/')).length,
    fchg: () => urls.filter((u) => u.includes('/fchg/')).length,
  };
}

describe('Timetables-Quelle: Zwischenspeicher', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('Ankunft und Abfahrt derselben EVA teilen sich die drei Abrufe', async () => {
    const u = uhr();
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt });

    const ab = await quelle.tafel('8011160', 'dep');
    const an = await quelle.tafel('8011160', 'arr');

    expect(netz.urls).toHaveLength(3);
    // Inhalt unveraendert: Abfahrt mit Gleiswechsel, Ankunft mit Herkunft.
    expect(ab.find((e) => e.zug === 'ICE 1006')?.gleisIst).toBe('12');
    expect(an.find((e) => e.zug === 'RE 3')?.ziel).toBe('Stralsund Hbf');
  });

  it('der Sollplan bleibt liegen - nach Ablauf der Aenderungsfrist geht nur /fchg hinaus', async () => {
    const u = uhr();
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt });

    await quelle.tafel('8011160', 'dep');
    u.vor(10 * 60_000);
    await quelle.tafel('8011160', 'dep');

    expect(netz.plan()).toBe(2);
    expect(netz.fchg()).toBe(2);
  });

  it('innerhalb der Aenderungsfrist geht gar nichts hinaus', async () => {
    const u = uhr();
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt });

    await quelle.tafel('8011160', 'dep');
    u.vor(5_000);
    await quelle.tafel('8011160', 'dep');

    expect(netz.urls).toHaveLength(3);
  });

  it('zur naechsten Stunde wird nur die neue naechste Stunde geholt', async () => {
    // 12:10 UTC = 14:10 Berlin: Stunden 14 und 15. Eine Stunde spaeter
    // braucht es 15 (liegt schon) und 16.
    const u = uhr();
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt });

    await quelle.tafel('8011160', 'dep');
    u.vor(60 * 60_000);
    await quelle.tafel('8011160', 'dep');

    const plaene = netz.urls.filter((x) => x.includes('/plan/'));
    expect(plaene).toHaveLength(3);
    expect(plaene.map((x) => x.slice(-2))).toEqual(['14', '15', '16']);
  });

  it('der Live-Abruf holt /fchg immer frisch und liefert Ankunft UND Abfahrt', async () => {
    const u = uhr();
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt });

    await quelle.tafel('8011160', 'dep');
    u.vor(1_000);
    const live = await quelle.live('8011160');

    // Plan aus dem Speicher, Aenderungen trotz frischem Eintrag neu geholt:
    // Der Poller IST die Frischequelle.
    expect(netz.plan()).toBe(2);
    expect(netz.fchg()).toBe(2);
    expect(live.some((e) => e.zug === 'ICE 1006')).toBe(true);
    expect(live.some((e) => e.zug === 'RE 3')).toBe(true);
  });

  it('was der Live-Abruf geholt hat, bekommt die Tafel ohne eigenen Abruf', async () => {
    const u = uhr();
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt });

    await quelle.live('8011160');
    u.vor(5_000);
    await quelle.tafel('8011160', 'arr');
    await quelle.tafel('8011160', 'dep');

    expect(netz.urls).toHaveLength(3);
  });

  it('gleichzeitige Abrufe derselben Adresse gehen nur einmal hinaus', async () => {
    const u = uhr();
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt });

    await Promise.all([quelle.live('8011160'), quelle.live('8011160'), quelle.tafel('8011160', 'dep')]);

    expect(netz.urls).toHaveLength(3);
  });

  it('Fehler werden nicht gespeichert', async () => {
    const u = uhr();
    let status = 500;
    const netz = zaehlendesFetch({ status: () => status });
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt });

    await expect(quelle.tafel('8011160', 'dep')).rejects.toThrow(/HTTP 500/);
    status = 200;
    await expect(quelle.tafel('8011160', 'dep')).resolves.not.toHaveLength(0);
  });

  it('ohne Zugangsdaten FehlendeZugangsdatenError - und kein Budget verbraucht', async () => {
    vi.stubEnv('DB_CLIENT_ID', '');
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt, proMinute: 3, tafelAnteil: 3 });
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt, budget });

    await expect(quelle.tafel('8011160', 'dep')).rejects.toBeInstanceOf(FehlendeZugangsdatenError);
    expect(netz.urls).toHaveLength(0);
    expect(budget.nimm('tafel')).toBe(true);
  });
});

describe('Timetables-Quelle: Budget', () => {
  beforeEach(() => {
    vi.stubEnv('DB_CLIENT_ID', 'test-id');
    vi.stubEnv('DB_CLIENT_SECRET', 'test-secret');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('jeder Abruf zaehlt gegen das Budget, Treffer im Speicher nicht', async () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt, proMinute: 4, tafelAnteil: 4 });
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt, budget });

    await quelle.tafel('8011160', 'dep');
    await quelle.tafel('8011160', 'arr');

    expect(budget.nimm('tafel')).toBe(true);
    expect(budget.nimm('tafel')).toBe(false);
  });

  it('ohne Budget und ohne Stand: TimetablesAusgelastetError, kein Netzverkehr', async () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt, proMinute: 0, tafelAnteil: 0 });
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt, budget });

    await expect(quelle.tafel('8011160', 'dep')).rejects.toBeInstanceOf(TimetablesAusgelastetError);
    expect(netz.urls).toHaveLength(0);
  });

  it('ohne Budget liefert die Tafel den letzten Stand, wenn er hoechstens fuenf Minuten alt ist', async () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt, proMinute: 3, tafelAnteil: 3 });
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt, budget });

    await quelle.tafel('8011160', 'dep'); // verbraucht das ganze Budget
    u.vor(40_000); // Aenderungen abgelaufen, Minute aber noch nicht um
    const tafel = await quelle.tafel('8011160', 'dep');

    expect(netz.urls).toHaveLength(3);
    expect(tafel.find((e) => e.zug === 'ICE 1006')?.gleisIst).toBe('12');
  });

  it('ein aelterer Stand als fuenf Minuten wird nicht mehr ausgeliefert', async () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt, proMinute: 3, tafelAnteil: 3 });
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt, budget });

    await quelle.tafel('8011160', 'dep');
    u.vor(6 * 60_000);
    // Budget wieder frei - ausschoepfen, damit nur der Rueckfall bliebe.
    budget.nimm('tafel');
    budget.nimm('tafel');
    budget.nimm('tafel');

    await expect(quelle.tafel('8011160', 'dep')).rejects.toBeInstanceOf(TimetablesAusgelastetError);
  });

  it('der Live-Abruf bekommt keinen alten Stand, sondern den Fehler', async () => {
    // Ein Poller, der Altes als frisch meldet, verschwiege den Ausfall: Er
    // soll scheitern, damit `quelle-weg` beim Zuschauer ankommt.
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt, proMinute: 3, tafelAnteil: 3 });
    const netz = zaehlendesFetch();
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt, budget });

    await quelle.tafel('8011160', 'dep');
    await expect(quelle.live('8011160')).rejects.toBeInstanceOf(TimetablesAusgelastetError);
  });

  it('HTTP 429 von der DB pausiert alle weiteren Abrufe', async () => {
    const u = uhr();
    const budget = erzeugeTimetablesBudget({ jetzt: u.jetzt });
    let status = 429;
    const netz = zaehlendesFetch({ status: () => status });
    const quelle = erzeugeTimetablesQuelle({ fetchFn: netz.fetchFn, jetzt: u.jetzt, budget });

    await expect(quelle.tafel('8011160', 'dep')).rejects.toBeInstanceOf(TimetablesAusgelastetError);
    const nachErstem = netz.urls.length;
    status = 200;
    await expect(quelle.tafel('8000001', 'dep')).rejects.toBeInstanceOf(TimetablesAusgelastetError);
    expect(netz.urls).toHaveLength(nachErstem);

    u.vor(60_000);
    await expect(quelle.tafel('8000001', 'dep')).resolves.toBeDefined();
  });
});
