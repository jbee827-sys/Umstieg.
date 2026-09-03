import { describe, expect, it, vi } from 'vitest';
import { Sicherheitsprotokoll } from '../src/core/sicherheitsprotokoll.js';

/**
 * Punkt 18 der Haerteliste - "Sicherheitsereignisse protokollieren" - stiess
 * hier auf eine Zusage, die seit dem 02.09.2026 im Code und auf der
 * Datenschutzseite steht: Die Anwendung fuehrt kein Zugriffsprotokoll.
 *
 * Aufgeloest wird das nicht durch einen Kompromiss, sondern durch eine
 * Unterscheidung: Protokolliert wird, DASS eine Grenze gegriffen hat und WO -
 * nie, WER sie ausgeloest hat. Der Eintrag traegt keinen Personenbezug; die
 * Adresse bleibt im Zaehlwerk der Begrenzung und wird nie geschrieben.
 *
 * Zweitens muss das Protokoll aggregieren. Ein Eintrag je abgewiesener
 * Anfrage waere selbst die Schwachstelle: Wer schnell genug anfragt, fuellt
 * damit die Platte - der Schutz waere der Angriff.
 */

function protokoll() {
  const eintraege: { daten: Record<string, unknown>; nachricht: string }[] = [];
  return {
    eintraege,
    log: { warn: (daten: Record<string, unknown>, nachricht: string) => eintraege.push({ daten, nachricht }) },
  };
}

describe('Sicherheitsprotokoll', () => {
  it('meldet den ersten Treffer sofort', () => {
    const p = protokoll();
    const uhr = vi.fn(() => 1_000);
    const sp = new Sicherheitsprotokoll(p.log, 60_000, uhr);

    sp.melde('ratelimit', '/api/stations');

    expect(p.eintraege).toHaveLength(1);
    expect(p.eintraege[0].daten).toMatchObject({
      ereignis: 'ratelimit',
      route: '/api/stations',
      treffer: 1,
    });
  });

  // Sonst waere der Schutz der Angriff.
  it('schreibt im selben Fenster keinen zweiten Eintrag', () => {
    const p = protokoll();
    let jetzt = 1_000;
    const sp = new Sicherheitsprotokoll(p.log, 60_000, () => jetzt);

    sp.melde('ratelimit', '/api/stations');
    for (let i = 0; i < 500; i++) {
      jetzt += 10;
      sp.melde('ratelimit', '/api/stations');
    }

    expect(p.eintraege).toHaveLength(1);
  });

  it('fasst das abgelaufene Fenster mit der Gesamtzahl zusammen', () => {
    const p = protokoll();
    let jetzt = 1_000;
    const sp = new Sicherheitsprotokoll(p.log, 60_000, () => jetzt);

    sp.melde('ratelimit', '/api/stations'); // sofort, treffer 1
    jetzt += 100;
    sp.melde('ratelimit', '/api/stations'); // still, Zaehler 2
    jetzt += 100;
    sp.melde('ratelimit', '/api/stations'); // still, Zaehler 3

    jetzt += 60_001; // Fenster abgelaufen
    sp.melde('ratelimit', '/api/stations');

    expect(p.eintraege).toHaveLength(2);
    expect(p.eintraege[1].daten).toMatchObject({ ereignis: 'ratelimit', treffer: 3 });
  });

  it('zaehlt Routen und Ereignisarten getrennt', () => {
    const p = protokoll();
    const sp = new Sicherheitsprotokoll(p.log, 60_000, () => 1_000);

    sp.melde('ratelimit', '/api/stations');
    sp.melde('ratelimit', '/api/route');
    sp.melde('sse-verbindungen', '/api/live/:eva');

    expect(p.eintraege).toHaveLength(3);
  });

  /**
   * Der Kern der ganzen Runde. Faellt dieser Test, ist die
   * Datenschutzerklaerung unwahr geworden.
   */
  it('schreibt keinen Personenbezug - keine Adresse, keine URL, keine Koordinate', () => {
    const p = protokoll();
    const sp = new Sicherheitsprotokoll(p.log, 60_000, () => 1_000);

    sp.melde('ratelimit', '/api/stations');

    const alles = JSON.stringify(p.eintraege);
    expect(alles).not.toContain('203.0.113');
    expect(alles).not.toContain('52.52');
    expect(alles).not.toContain('?');
    // Nur das Routen-MUSTER, nie die aufgerufene URL: Der Unterschied ist
    // genau die Abfragezeichenkette - und die traegt die Koordinate.
    expect(alles).toContain('/api/stations');
    expect(Object.keys(p.eintraege[0].daten).sort()).toEqual([
      'ereignis',
      'fenster',
      'route',
      'treffer',
    ]);
  });
});
