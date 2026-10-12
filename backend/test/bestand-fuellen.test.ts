import { describe, expect, it } from 'vitest';
import { hauptEva, gruppeVerlaesslich } from '../scripts/bestand-fuellen.js';
import { epStadaStationen } from '../src/clients/db-endpunkte.js';

describe('bestand-fuellen', () => {
  it('fragt StaDa nach den Preisklassen', () => {
    expect(epStadaStationen('1-3')).toBe(
      'https://apis.deutschebahn.com/db-api-marketplace/apis/station-data/v2/stations?category=1-3',
    );
  });

  it('nimmt die Haupt-EVA', () => {
    expect(
      hauptEva({ name: 'X', evaNumbers: [{ number: 8098160 }, { number: 8011160, isMain: true }] }),
    ).toBe('8011160');
  });

  it('nimmt sonst die erste EVA', () => {
    expect(hauptEva({ name: 'X', evaNumbers: [{ number: 8000105 }] })).toBe('8000105');
  });

  it('liefert null ohne EVA', () => {
    expect(hauptEva({ name: 'X', evaNumbers: [] })).toBeNull();
    expect(hauptEva({ name: 'X' })).toBeNull();
  });

  it('gruppeVerlaesslich: unvollstaendig bedeutet nein', () => {
    expect(gruppeVerlaesslich({ gruppeUnvollstaendig: true })).toBe(false);
  });

  it('gruppeVerlaesslich: kein Feld bedeutet ja', () => {
    expect(gruppeVerlaesslich({})).toBe(true);
  });

  it('gruppeVerlaesslich: explicit false bedeutet ja', () => {
    expect(gruppeVerlaesslich({ gruppeUnvollstaendig: false })).toBe(true);
  });
});
