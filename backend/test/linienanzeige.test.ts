import { describe, it, expect } from 'vitest';
import { baueTafel, linienAnzeige } from '../src/clients/timetables.js';

/**
 * Die Tafel zeigt die Linie, nicht die Zugnummer (22.11.2026).
 *
 * IRIS fuehrt die Linie im Attribut `l` des Halts (`dp`/`ar`). Stichprobe
 * 22.11.2026 ueber neun grosse Bahnhoefe: S-Bahn `S15`, RE/RB auch privater
 * Bahnen `RE8`/`RB10`, Flixtrain nur Ziffern `10`; ICE, IC, EC, NJ, TGV, RJX
 * tragen KEIN `l` - dort bleibt die Zugnummer, wie im DB Navigator.
 */
describe('linienAnzeige', () => {
  it('trennt Gattung und Nummer der Linie: S15 -> S 15', () => {
    expect(linienAnzeige('S', 'S15')).toBe('S 15');
  });

  it('nimmt die Linie auch bei privaten Bahnen: ODEG mit RE8 -> RE 8', () => {
    expect(linienAnzeige('OE', 'RE8')).toBe('RE 8');
  });

  it('setzt bei reinen Ziffern die Gattung davor: FLX mit 10 -> FLX 10', () => {
    expect(linienAnzeige('FLX', '10')).toBe('FLX 10');
  });

  it('laesst eine schon getrennte Linie, wie sie ist', () => {
    expect(linienAnzeige('RE', 'RE 3')).toBe('RE 3');
  });

  it('liefert nichts ohne Linie - dann bleibt die Zugnummer', () => {
    expect(linienAnzeige('ICE', undefined)).toBeUndefined();
    expect(linienAnzeige('ICE', '')).toBeUndefined();
  });
});

const plan = `<?xml version="1.0" encoding="UTF-8"?>
<timetable station="Berlin Hbf">
  <s id="s15-1"><tl c="S" n="15632" f="S"/><dp pt="2611222107" pp="22" l="S15" ppth="Berlin-Wedding|Berlin Gesundbrunnen(S)"/></s>
  <s id="oe-1"><tl c="OE" n="62005" f="D"/><ar pt="2611222110" pp="3" l="RE8" ppth="Wismar"/><dp pt="2611222112" pp="3" l="RE8" ppth="Flughafen BER"/></s>
  <s id="ice-1"><tl c="ICE" n="904" f="F"/><dp pt="2611222115" pp="14" ppth="Hamburg Hbf"/></s>
</timetable>`;

describe('baueTafel mit Linie', () => {
  it('traegt die Linie als Anzeige, die Zugnummer bleibt der Schluessel', () => {
    const tafel = baueTafel([plan], '<timetable/>', 'dep');
    const s15 = tafel.find((e) => e.zug === 'S 15632');
    expect(s15?.anzeige).toBe('S 15');
    const oe = tafel.find((e) => e.zug === 'OE 62005');
    expect(oe?.anzeige).toBe('RE 8');
  });

  it('nimmt bei der Ankunft die Linie der Ankunft', () => {
    const tafel = baueTafel([plan], '<timetable/>', 'arr');
    expect(tafel.find((e) => e.zug === 'OE 62005')?.anzeige).toBe('RE 8');
  });

  it('setzt ohne Linie keine Anzeige', () => {
    const tafel = baueTafel([plan], '<timetable/>', 'dep');
    const ice = tafel.find((e) => e.zug === 'ICE 904');
    expect(ice).toBeDefined();
    expect(ice).not.toHaveProperty('anzeige');
  });
});
