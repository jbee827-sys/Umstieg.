import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  ablageDatei,
  istErledigt,
  ladeAblage,
  mussHolen,
  schluesselAusBestandsdatei,
  serialisiere,
} from '../scripts/db-gleise-fuellen.js';
import type { StationsInfo } from '../src/core/typen.js';

const WURZEL = fileURLToPath(new URL('../.test-ablage/db-gleise/', import.meta.url));

const info: StationsInfo = {
  eva: '8000261',
  name: 'München Hbf',
  lat: 48.14,
  lon: 11.56,
  evas: ['8000261', '8098263'],
  sbahnEvas: ['8098263'],
  gleise: [{ gleis: '1', evas: ['8098263'], ris: { name: '1', ifopt: 'de:09162:6:40:81' } }],
};

describe('db-gleise-fuellen (ohne Netz)', () => {
  beforeAll(() => {
    rmSync(WURZEL, { recursive: true, force: true });
    mkdirSync(WURZEL, { recursive: true });
  });
  afterAll(() => rmSync(WURZEL, { recursive: true, force: true }));

  it('benennt die Ablagedatei nach dem Bestandsschluessel', () => {
    expect(schluesselAusBestandsdatei('8000261.json.gz')).toBe('8000261');
    expect(schluesselAusBestandsdatei('.gitkeep')).toBeNull();
    expect(schluesselAusBestandsdatei('8000261.json')).toBeNull();
    expect(ablageDatei('8000261', WURZEL)).toMatch(/8000261\.json$/);
  });

  it('serialisiert nur StationsInfo-Felder - nichts Fremdes, keine Schluessel', () => {
    const mitMuell = { ...info, authorization: 'Bearer geheim', 'DB-Api-Key': 'geheim', header: { a: 1 } } as StationsInfo;
    const text = serialisiere(mitMuell);
    expect(text).not.toContain('geheim');
    expect(text).not.toContain('authorization');
    expect(JSON.parse(text)).toEqual(info);
  });

  it('liest zurueck, was geschrieben wurde; ohne Datei undefined', () => {
    writeFileSync(ablageDatei('8000261', WURZEL), serialisiere(info));
    expect(ladeAblage('8000261', WURZEL)).toEqual(info);
    expect(ladeAblage('9999999', WURZEL)).toBeUndefined();
    writeFileSync(ablageDatei('kaputt', WURZEL), '{nicht json');
    expect(ladeAblage('kaputt', WURZEL)).toBeUndefined();
  });

  it('ueberspringt vorhandene vollstaendige Listen, holt unvollstaendige erneut', () => {
    writeFileSync(ablageDatei('vollstaendig', WURZEL), serialisiere(info));
    writeFileSync(ablageDatei('luecke', WURZEL), serialisiere({ ...info, gleisteileOhneAntwort: 1 }));
    writeFileSync(ablageDatei('gruppe', WURZEL), serialisiere({ ...info, gruppeUnvollstaendig: true }));
    expect(istErledigt('vollstaendig', WURZEL)).toBe(true);
    expect(istErledigt('luecke', WURZEL)).toBe(false);
    expect(istErledigt('gruppe', WURZEL)).toBe(false);
    expect(istErledigt('fehlt', WURZEL)).toBe(false);
  });

  // Schlussreview 04.11.2026: Die Ablage wurde vor der neuen sbahnEvas-Regel
  // geholt (ein Mitglied bekam keins). `--neu` holt auch vollstaendige Listen.
  it('mit --neu wird auch eine vollstaendige Liste neu geholt', () => {
    writeFileSync(ablageDatei('vollstaendig', WURZEL), serialisiere(info));
    expect(mussHolen('vollstaendig', [], WURZEL)).toBe(false);
    expect(mussHolen('vollstaendig', ['--neu'], WURZEL)).toBe(true);
    expect(mussHolen('fehlt', [], WURZEL)).toBe(true);
  });
});
