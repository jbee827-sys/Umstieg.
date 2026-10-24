import type { FastifyInstance } from 'fastify';
import type { Anfragezaehler } from '../core/anfragezaehler.js';

/**
 * Nutzungszaehlung der iOS-App (Plan App Store, Paket 4; Julian, 24.10.2026).
 *
 * Die Website misst mit Vercel Web Analytics. In der App gibt es kein
 * Vercel, und Apple verlangt vor jeder Messung eine Einwilligung
 * (Richtlinie 5.1.1). Die App sendet deshalb - nur mit Zustimmung - den
 * NAMEN eines Ereignisses hierher, sonst nichts: keinen Bahnhof, kein Gleis,
 * keine Uhrzeit, keinen Standort, keine Kennung.
 *
 * Hier wird nur hochgezaehlt. Ins Protokoll geht je Stunde eine Summe je
 * Name (core/anfragezaehler.ts, Eintrag `app-nutzung`) - keine Adresse, keine
 * Uhrzeit des einzelnen Aufrufs. Die IP-Adresse sieht nur die
 * Ratenbegrenzung, im Arbeitsspeicher, wie bei jeder anderen Route.
 *
 * Ein Text statt JSON: `text/plain` ist fuer den Browser eine einfache
 * Anfrage ohne CORS-Vorabfrage - eine Anfrage je Ereignis statt zwei.
 */
export const APP_EREIGNISSE: ReadonlySet<string> = new Set([
  // Ein Start der App - die naechste Entsprechung zu „Besuchern".
  'start',
  // Die Bildschirme - was auf der Website die Seitenaufrufe sind.
  'bildschirm-eingabe',
  'bildschirm-uebersicht',
  'bildschirm-weg',
  'bildschirm-meldungen',
  'bildschirm-angekommen',
  // Die vier Messpunkte aus BRIEF.md 3 (frontend/src/analytik/ereignis.ts).
  'eingabe-fertig',
  'navigation-start',
  'schritt-1',
  'ziel',
]);

export function registriereZaehlerRoute(app: FastifyInstance, zaehler: Anfragezaehler): void {
  app.post('/api/zaehle', { bodyLimit: 64 }, async (anfrage, antwort) => {
    const name = typeof anfrage.body === 'string' ? anfrage.body.trim() : '';
    // Nur bekannte Namen: Was frei waere, koennte jemand mit Angaben fuellen,
    // die dann im Protokoll stuenden.
    if (!APP_EREIGNISSE.has(name)) {
      return antwort.code(400).send({ fehler: 'unbekanntes Ereignis' });
    }
    zaehler.zaehle(name);
    return antwort.code(204).send();
  });
}
