import { describe, it, expect } from 'vitest';
import { istErsatzverkehr, istOevModus, verkehrsmittelAus } from '../src/clients/motis-abbildung.js';

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

describe('verkehrsmittelAus mit Linie (Spec 7.2)', () => {
  it('U-Linien, die als TRAM oder BUS gemeldet werden, sind U-Bahn (DELFI-Datenfehler)', () => {
    expect(verkehrsmittelAus('TRAM', 'U2')).toBe('ubahn');
    expect(verkehrsmittelAus('TRAM', 'U 3')).toBe('ubahn');
    expect(verkehrsmittelAus('BUS', 'U12')).toBe('ubahn');
  });

  it('echte Tram- und Buslinien bleiben, was sie sind', () => {
    expect(verkehrsmittelAus('TRAM', '11')).toBe('tram');
    expect(verkehrsmittelAus('TRAM')).toBe('tram');
    expect(verkehrsmittelAus('BUS', '36')).toBe('bus');
    expect(verkehrsmittelAus('BUS', 'U2 Express')).toBe('bus');
    expect(verkehrsmittelAus('RAIL', 'U2')).toBe('bahn');
  });
});

describe('istErsatzverkehr (Spec 7.2)', () => {
  it('Bus mit Zuglinie ist Schienenersatzverkehr', () => {
    for (const l of ['RB30', 'RE 1', 'RE32', 'IC 2012', 'ICE 1206', 'IRE6', 'S5']) {
      expect(istErsatzverkehr('BUS', l)).toBe(true);
      expect(istErsatzverkehr('COACH', l)).toBe(true);
    }
  });

  it('normale Buslinien und echte Züge nicht', () => {
    expect(istErsatzverkehr('BUS', '36')).toBe(false);
    expect(istErsatzverkehr('BUS', 'X36')).toBe(false);
    expect(istErsatzverkehr('BUS', '')).toBe(false);
    expect(istErsatzverkehr('RAIL', 'RB30')).toBe(false);
    expect(istErsatzverkehr('REGIONAL_RAIL', 'RE1')).toBe(false);
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
