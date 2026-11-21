import { describe, expect, it, vi } from 'vitest';
import {
  MAX_KANDIDATEN,
  loeseBahnhofsnamen,
  normalisiereBahnhofsname,
} from '../src/core/namensaufloesung.js';
import { FehlendeZugangsdatenError } from '../src/clients/stations.js';
import type { BahnhofMitGruppe } from '../src/core/typen.js';

/**
 * Daten aus dem Befund der Spec: "Bernau (S)" steht in der Reisetext der Bahn,
 * die Suche kennt aber nur den fuehrenden Bahnhof "Bernau(b Berlin)"; der
 * Name "Bernau (S)" ist der amtliche Name eines Gruppenmitglieds.
 */
const BERNAU: BahnhofMitGruppe = {
  name: 'Bernau(b Berlin)',
  eva: '8013470',
  lat: 52.675,
  lon: 13.592,
  namen: ['Bernau(b Berlin)'],
  mitglieder: ['8013470', '8089205'],
};
const CHIEMSEE: BahnhofMitGruppe = {
  name: 'Bernau a Chiemsee',
  eva: '8000911',
  lat: 47.81,
  lon: 12.37,
  namen: ['Bernau a Chiemsee'],
  mitglieder: ['8000911'],
};
/**
 * Aus der Namenssimulation vom 21.11.2026 (einziger Falschfall von 1160
 * Namen): "Berlin Hbf (S-Bahn)" ist der amtliche Name ZWEIER EVAs - 8089021
 * gehoert zur Gruppe Berlin Hbf (stationID 1071), 8089522 steht allein und
 * hat keine stationID. Die Suche liefert beide Eintraege; Stufe 1 nahm den
 * Einzelgaenger, weil er den Namen selbst traegt.
 */
const BERLIN_HBF: BahnhofMitGruppe = {
  name: 'Berlin Hbf',
  eva: '8011160',
  lat: 52.525592,
  lon: 13.369545,
  namen: ['Berlin Hbf'],
  mitglieder: ['8011160', '8089021', '8098160'],
};
const S_BAHN_EINZELN: BahnhofMitGruppe = {
  name: 'Berlin Hbf (S-Bahn)',
  eva: '8089522',
  lat: 52.52543,
  lon: 13.37031,
  namen: ['Berlin Hbf (S-Bahn)'],
  mitglieder: ['8089522'],
};
const MITGLIEDSNAMEN: Record<string, string[]> = {
  '8089205': ['Bernau (S)'],
  '8089021': ['Berlin Hbf (S-Bahn)'],
  '8098160': ['Berlin Hbf'],
};

function quelle(kandidaten: BahnhofMitGruppe[]) {
  return {
    sucheMitGruppen: vi.fn(async (_q: string) => kandidaten),
    amtlicheNamen: vi.fn(async (eva: string) => MITGLIEDSNAMEN[eva] ?? []),
  };
}

describe('normalisiereBahnhofsname', () => {
  it('normalisiert Gross/klein, Leerraum und Klammern', () => {
    expect(normalisiereBahnhofsname(' Bernau  (S) ')).toBe(normalisiereBahnhofsname('bernau(s)'));
    expect(normalisiereBahnhofsname('Berlin Gesundbr. ( S )')).toBe('berlin gesundbr.(s)');
  });
});

describe('loeseBahnhofsnamen', () => {
  it('findet Bernau (S) ueber das Gruppenmitglied und liefert den fuehrenden Bahnhof', async () => {
    expect(await loeseBahnhofsnamen('Bernau (S)', quelle([BERNAU, CHIEMSEE]))).toEqual({
      name: 'Bernau(b Berlin)',
      eva: '8013470',
      lat: 52.675,
      lon: 13.592,
    });
  });

  it('fragt keine Mitglieder ab, wenn ein fuehrender Name schon genau passt', async () => {
    const q = quelle([BERNAU, CHIEMSEE]);
    expect((await loeseBahnhofsnamen('Bernau(b Berlin)', q))?.eva).toBe('8013470');
    expect(q.amtlicheNamen).not.toHaveBeenCalled();
  });

  it('waehlt nichts bei einem Namen, der zwei Gruppen trifft', async () => {
    const zweiter = { ...BERNAU, eva: '8099999', mitglieder: ['8099999'] };
    expect(await loeseBahnhofsnamen('Bernau(b Berlin)', quelle([BERNAU, zweiter]))).toBeNull();
  });

  it('waehlt nichts, wenn ein Treffer den Namen selbst und ein Gruppenmitglied eines anderen ihn auch traegt', async () => {
    const q = quelle([BERLIN_HBF, S_BAHN_EINZELN]);
    expect(await loeseBahnhofsnamen('Berlin Hbf (S-Bahn)', q)).toBeNull();
  });

  it('waehlt Berlin Hbf weiterhin ueber seinen eigenen Namen', async () => {
    const q = quelle([BERLIN_HBF, S_BAHN_EINZELN]);
    expect((await loeseBahnhofsnamen('Berlin Hbf', q))?.eva).toBe('8011160');
  });

  it('nimmt den direkten Treffer, wenn das gleichnamige Mitglied zu seiner eigenen Gruppe gehoert', async () => {
    // Berlin Hbf traegt "Berlin Hbf" selbst und ueber 8098160 - dieselbe Gruppe, nicht mehrdeutig.
    const q = quelle([BERLIN_HBF]);
    expect((await loeseBahnhofsnamen('Berlin Hbf', q))?.eva).toBe('8011160');
  });

  it('waehlt nichts bei bloss aehnlichem Namen', async () => {
    // 'Bernau' ist weder nameLong noch nameShort - auch nicht von Bernau a Chiemsee (dort nur nameLocal)
    expect(await loeseBahnhofsnamen('Bernau', quelle([BERNAU, CHIEMSEE]))).toBeNull();
  });

  it('zaehlt ein ausgefallenes Mitglied als namenlos und rechnet weiter', async () => {
    const q = quelle([BERNAU]);
    q.amtlicheNamen.mockRejectedValueOnce(new Error('503'));
    expect(await loeseBahnhofsnamen('Bernau (S)', q)).toBeNull();
  });

  it('betrachtet hoechstens MAX_KANDIDATEN Treffer', async () => {
    const fuell = Array.from({ length: MAX_KANDIDATEN }, (_, i) => ({
      ...CHIEMSEE,
      eva: `80009${i}0`,
      namen: [`Fuell ${i}`],
      mitglieder: [`80009${i}0`],
    }));
    const q = quelle([...fuell, BERNAU, CHIEMSEE]);
    expect(await loeseBahnhofsnamen('Bernau(b Berlin)', q)).toBeNull();
  });

  it('liefert null fuer leeren Namen ohne Abfrage', async () => {
    const q = quelle([BERNAU]);
    expect(await loeseBahnhofsnamen('   ', q)).toBeNull();
    expect(q.sucheMitGruppen).not.toHaveBeenCalled();
  });

  it('probiert die naechste Variante, wenn eine ausfaellt', async () => {
    const hockenheim = { ...CHIEMSEE, eva: '8000163', namen: ['Hockenheim, Bahnhof'] };
    const q = quelle([hockenheim]);
    q.sucheMitGruppen.mockRejectedValueOnce(new Error('503'));
    expect((await loeseBahnhofsnamen('Hockenheim, Bahnhof', q))?.eva).toBe('8000163');
    expect(q.sucheMitGruppen.mock.calls.length).toBeGreaterThan(1);
  });

  it('reicht fehlende Zugangsdaten sofort weiter', async () => {
    const q = quelle([BERNAU]);
    q.sucheMitGruppen.mockRejectedValue(new FehlendeZugangsdatenError());
    await expect(loeseBahnhofsnamen('Bernau (S)', q)).rejects.toBeInstanceOf(
      FehlendeZugangsdatenError,
    );
    expect(q.sucheMitGruppen).toHaveBeenCalledTimes(1);
  });

  it('wirft den ersten Fehler, wenn keine Variante durchkam', async () => {
    const q = quelle([BERNAU]);
    q.sucheMitGruppen.mockRejectedValue(new Error('503'));
    await expect(loeseBahnhofsnamen('Bernau (S)', q)).rejects.toThrow('503');
  });
});
