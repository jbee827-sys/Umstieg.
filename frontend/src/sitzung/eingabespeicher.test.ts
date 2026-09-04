import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { leere, lies, schreibe, SCHLUESSEL, type EingabeEntwurf } from './eingabespeicher';

/**
 * Der Speicher haelt die Eingabe ueber einen Neuladevorgang. Zwei Dinge
 * entscheiden hier ueber Absturz oder nicht:
 *
 * `sessionStorage` ist nicht garantiert. In Safaris privatem Modus und bei
 * blockierten Site-Daten WIRFT schon der Zugriff auf das Objekt - nicht erst
 * das Schreiben. Ein fehlender Speicher heisst "kein Gedaechtnis", niemals
 * "keine App".
 *
 * Und was dort steht, hat die App nicht in der Hand: ein alter Eintrag aus
 * einer frueheren Feldfassung, ein fremder Eintrag unter demselben
 * Schluessel, halb geschriebenes JSON. Ungeprueft uebernommen wuerde daraus
 * ein Formular mit `undefined` in Feldern, die eine Zeichenkette erwarten.
 */

const ENTWURF: EingabeEntwurf = {
  suchtext: 'Berlin Hbf',
  gewaehlt: { name: 'Berlin Hbf', eva: '8011160', lat: 52.52, lon: 13.37 },
  evaManuell: '',
  gleisAn: '14',
  gleisAb: '6',
  wagenAn: '26',
  wagenAb: '',
  profil: 'langsam',
  zugAnkunft: { zug: 'ICE 1006', zeitSoll: '14:26', gleisSoll: '14', ziel: 'Hamburg' },
  zugAbfahrt: null,
};

describe('Eingabespeicher', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('gibt zurueck, was hineingelegt wurde', () => {
    schreibe(ENTWURF);
    expect(lies()).toEqual(ENTWURF);
  });

  it('meldet nichts, solange nichts gespeichert wurde', () => {
    expect(lies()).toBeNull();
  });

  it('vergisst auf Verlangen', () => {
    schreibe(ENTWURF);
    leere();
    expect(lies()).toBeNull();
  });

  it('ueberschreibt den vorigen Entwurf', () => {
    schreibe(ENTWURF);
    schreibe({ ...ENTWURF, gleisAb: '7' });
    expect(lies()?.gleisAb).toBe('7');
  });

  it('verwirft beschaedigtes JSON, statt daran zu zerbrechen', () => {
    sessionStorage.setItem(SCHLUESSEL, '{ das ist kein JSON');
    expect(lies()).toBeNull();
  });

  it('verwirft einen Eintrag mit falschen Feldtypen', () => {
    // Genau der Fall nach einer Feldaenderung: Die Form stimmt nicht mehr.
    // Uebernommen landete `undefined` in einem Feld, das die Eingabemaske als
    // Zeichenkette an `value` reicht - React macht daraus ein unkontrolliertes
    // Feld und beschwert sich erst viel spaeter.
    sessionStorage.setItem(SCHLUESSEL, JSON.stringify({ suchtext: 42, gleisAn: null }));
    expect(lies()).toBeNull();
  });

  it('verwirft einen Eintrag aus einer aelteren Fassung', () => {
    sessionStorage.setItem(SCHLUESSEL, JSON.stringify({ fassung: 0, entwurf: ENTWURF }));
    expect(lies()).toBeNull();
  });

  it('haelt einen leeren Entwurf aus - nicht jedes Feld ist gefuellt', () => {
    const knapp: EingabeEntwurf = {
      suchtext: '',
      gewaehlt: null,
      evaManuell: '8011160',
      gleisAn: '1',
      gleisAb: '2',
      wagenAn: '',
      wagenAb: '',
      profil: 'normal',
      zugAnkunft: null,
      zugAbfahrt: null,
    };
    schreibe(knapp);
    expect(lies()).toEqual(knapp);
  });
});

describe('Eingabespeicher ohne nutzbaren Speicher', () => {
  const echt = Object.getOwnPropertyDescriptor(window, 'sessionStorage');

  function speicherWirft() {
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('Zugriff auf Site-Daten blockiert');
      },
    });
  }

  afterEach(() => {
    if (echt) Object.defineProperty(window, 'sessionStorage', echt);
  });

  it('liest ohne Speicher einfach nichts', () => {
    speicherWirft();
    expect(() => lies()).not.toThrow();
    expect(lies()).toBeNull();
  });

  it('schreibt ohne Speicher, ohne zu werfen', () => {
    speicherWirft();
    expect(() => schreibe(ENTWURF)).not.toThrow();
  });

  it('leert ohne Speicher, ohne zu werfen', () => {
    speicherWirft();
    expect(() => leere()).not.toThrow();
  });
});

describe('Eingabespeicher bleibt in der Sitzung', () => {
  it('fasst localStorage nicht an', () => {
    // Die Datenschutzerklaerung sagt zu, dass nichts ueber die Sitzung hinaus
    // gespeichert wird. `localStorage` ueberlebt das Schliessen des Tabs -
    // ein Schreibzugriff dorthin waere genau der Bruch dieser Zusage.
    const localSetzen = vi.spyOn(localStorage, 'setItem');
    schreibe(ENTWURF);
    leere();
    lies();

    expect(localSetzen).not.toHaveBeenCalled();
    localSetzen.mockRestore();
  });
});
