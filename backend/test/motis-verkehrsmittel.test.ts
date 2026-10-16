import { describe, it, expect } from 'vitest';
import { istOevModus, verkehrsmittelAus } from '../src/clients/motis-abbildung.js';

describe('verkehrsmittelAus', () => {
  it.each([
    ['BUS', 'bus'],
    ['COACH', 'bus'],
    ['TRAM', 'tram'],
    ['SUBWAY', 'ubahn'],
    ['METRO', 'ubahn'],
    ['SUBURBAN', 'sbahn'],
    ['HIGHSPEED_RAIL', 'bahn'],
    ['LONG_DISTANCE', 'bahn'],
    ['NIGHT_RAIL', 'bahn'],
    ['REGIONAL_RAIL', 'bahn'],
    ['REGIONAL_FAST_RAIL', 'bahn'],
    ['RAIL', 'bahn'],
    ['FERRY', 'faehre'],
    ['FUNICULAR', 'sonstiges'],
    ['AERIAL_LIFT', 'sonstiges'],
    ['OTHER', 'sonstiges'],
    ['ODM', 'sonstiges'],
  ])('%s -> %s', (mode, erwartet) => {
    expect(verkehrsmittelAus(mode)).toBe(erwartet);
  });

  it('faellt bei unbekannten Werten auf sonstiges, nie auf einen Fehler', () => {
    expect(verkehrsmittelAus('HOVERCRAFT')).toBe('sonstiges');
    expect(verkehrsmittelAus('')).toBe('sonstiges');
    expect(verkehrsmittelAus(undefined as unknown as string)).toBe('sonstiges');
    // Ein Wert, der zufaellig ein Eigenschaftsname jedes Objekts ist, darf
    // nicht in die Zuordnung durchschlagen.
    expect(verkehrsmittelAus('constructor')).toBe('sonstiges');
  });
});

describe('istOevModus', () => {
  it('nimmt Linienverkehr', () => {
    for (const m of ['BUS', 'TRAM', 'SUBWAY', 'SUBURBAN', 'REGIONAL_RAIL', 'FERRY', 'FUNICULAR', 'AERIAL_LIFT', 'COACH', 'OTHER']) {
      expect(istOevModus(m)).toBe(true);
    }
  });

  it('verwirft Mitfahren, Rufbus-Bereiche und Strassenmodi', () => {
    for (const m of ['RIDE_SHARING', 'ODM', 'FLEX', 'WALK', 'CAR', 'BIKE', 'RENTAL', '', 'constructor']) {
      expect(istOevModus(m)).toBe(false);
    }
  });
});
