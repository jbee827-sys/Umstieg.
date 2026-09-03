import { describe, it, expect } from 'vitest';
import { schrittPosition } from './fortschritt';

/**
 * Bis zum 02.09.2026 schaetzte diese Datei aus den Gehzeiten, welcher Schritt
 * gerade dran sein duerfte, und rueckte die Anzeige alle zehn Sekunden von
 * selbst weiter. Der Versatz des Nutzers korrigierte diese Schaetzung nur.
 *
 * Das ist entfallen. Eine Uhr weiss nicht, ob jemand vor der Rolltreppe
 * wartet, sich verlaufen hat oder stehengeblieben ist, um zu lesen - sie
 * schaltet trotzdem weiter, und dann steht auf dem Bildschirm ein anderer
 * Schritt als der, den der Mensch gerade geht. Wer weiterkommt, sagt es jetzt
 * selbst.
 *
 * Uebrig bleibt das Begrenzen: Der Zaehler darf die Liste nach keiner Seite
 * verlassen.
 */
describe('schrittPosition', () => {
  it('startet beim ersten Schritt', () => {
    expect(schrittPosition(0, 3)).toBe(0);
  });

  it('folgt dem Weiterschalten des Nutzers', () => {
    expect(schrittPosition(1, 3)).toBe(1);
    expect(schrittPosition(2, 3)).toBe(2);
  });

  it('laeuft nicht ueber das Listenende hinaus', () => {
    expect(schrittPosition(99, 3)).toBe(2);
  });

  it('laeuft nicht vor den Anfang zurueck', () => {
    expect(schrittPosition(-5, 3)).toBe(0);
  });

  it('leere Schrittliste ergibt 0', () => {
    // Sonst waere die Position -1 und der Zugriff auf die Liste `undefined`.
    expect(schrittPosition(0, 0)).toBe(0);
    expect(schrittPosition(7, 0)).toBe(0);
  });

  it('haengt an nichts als Zaehler und Laenge', () => {
    // Die Gegenprobe zur alten Fassung: Es gibt kein Zeitargument mehr, an
    // dem sich das Ergebnis noch aendern koennte. Zweimal derselbe Aufruf,
    // zweimal dasselbe - egal, wie viel Zeit dazwischen vergeht.
    expect(schrittPosition(1, 3)).toBe(schrittPosition(1, 3));
  });
});
