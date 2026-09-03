import type { FastifyInstance } from 'fastify';
import type { Ueberwachung } from '../core/ueberwachung.js';
import type { Sicherheitsprotokoll } from '../core/sicherheitsprotokoll.js';

/**
 * SSE-Strom je EVA-Nummer. Die Ereignisse stammen aus der Überwachung, die
 * unabhängig von der Zahl der Zuschauer nur EINMAL je EVA pollt
 * (Konzeptkorrektur 1 – Ratenlimits).
 *
 * `zugAn`/`zugAb` schränken die Ereignisse auf die beiden Züge des Umstiegs
 * ein; ohne sie kommen alle Ereignisse des Bahnhofs an.
 *
 * `erlaubteHerkuenfte` ist dieselbe Liste, die `@fastify/cors` bekommt – siehe
 * den Kommentar am `writeHead` weiter unten, warum diese Route sie selbst
 * braucht.
 */
export interface SseGrenzen {
  /** Offene Stroeme insgesamt. */
  gesamt: number;
  /** Offene Stroeme je Aufrufer. */
  jeAufrufer: number;
}

/**
 * Bewusst niedrig. Ein Umstieg braucht EINEN Strom; zwei sind Reserve fuer den
 * Moment, in dem ein Reload den alten noch nicht abgeraeumt hat.
 */
export const SSE_GRENZEN_STANDARD: SseGrenzen = { gesamt: 140, jeAufrufer: 2 };

export function registriereLiveRouten(
  app: FastifyInstance,
  ueberwachung: Ueberwachung,
  erlaubteHerkuenfte: string[] = [],
  grenzen: SseGrenzen = SSE_GRENZEN_STANDARD,
  sicherheit?: Sicherheitsprotokoll,
): void {
  /**
   * Zaehler der offenen Stroeme - nur im Arbeitsspeicher, je App-Instanz.
   *
   * Eine Ratenbegrenzung je Anfrage hilft hier nicht: Ein Strom wird EINMAL
   * geoeffnet und bleibt dann stundenlang bestehen. Gezaehlt werden muss
   * deshalb, was offen ist, nicht was ankommt.
   *
   * `jeAufrufer` wird bei null wieder entfernt. Sonst waechst die Karte mit
   * jeder je gesehenen Adresse weiter - ein Speicherleck, das ausgerechnet
   * ueber die Adressen der Besucher liefe.
   */
  let offen = 0;
  const jeAufrufer = new Map<string, number>();

  app.get<{ Params: { eva: string }; Querystring: { zugAn?: string; zugAb?: string } }>(
    '/api/live/:eva',
    (req, reply) => {
      const zuege = [req.query.zugAn, req.query.zugAb].filter((z): z is string => Boolean(z));

      /*
       * Erst pruefen, dann uebernehmen: Nach `reply.hijack()` ist der Kopf
       * mit 200 schon auf der Leitung, eine Ablehnung waere dann nicht mehr
       * moeglich. Die Absage laeuft ueber die normale Fastify-Antwort und
       * traegt deshalb die CORS-Header von `@fastify/cors` ganz von selbst.
       */
      const aufrufer = req.ip;
      if (offen >= grenzen.gesamt || (jeAufrufer.get(aufrufer) ?? 0) >= grenzen.jeAufrufer) {
        sicherheit?.melde('sse-verbindungen', '/api/live/:eva');
        return reply.code(503).send({
          fehler: 'zu-viele-verbindungen',
          detail: 'Zu viele gleichzeitige Live-Verbindungen. Bitte spaeter erneut versuchen.',
        });
      }
      if (!ueberwachung.hatKapazitaetFuer(req.params.eva)) {
        sicherheit?.melde('sse-bahnhoefe', '/api/live/:eva');
        return reply.code(503).send({
          fehler: 'zu-viele-bahnhoefe',
          detail: 'Es werden derzeit zu viele Bahnhoefe live beobachtet.',
        });
      }

      const kopf: Record<string, string> = {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Verhindert Pufferung durch zwischengeschaltete Proxys (Caddy/nginx).
        'X-Accel-Buffering': 'no',
      };

      /**
       * CORS von Hand – und zwar zwingend.
       *
       * `reply.hijack()` schreibt die Header roh auf den Socket. Alles, was
       * `@fastify/cors` an die Fastify-Antwort gehängt hat, kommt dabei nie
       * auf die Leitung. In Produktion war der Strom damit für den Browser
       * unerreichbar: `EventSource` setzt CORS durch und verwirft eine Antwort
       * ohne Freigabe-Header – stillschweigend, ohne dass an der Oberfläche
       * etwas davon zu sehen wäre.
       *
       * Zwei Tage lang unbemerkt geblieben, weil die Prüfung mit `curl` lief.
       * `curl` schickt den Origin-Header mit, setzt CORS aber NICHT durch:
       * Der Strom sah dort einwandfrei aus. Gefunden am 03.09.2026 bei der
       * Abnahme im Browser gegen die Produktion.
       *
       * Gespiegelt wird, was `@fastify/cors` für eine einfache GET-Anfrage mit
       * Allowlist täte: die passende Herkunft zurückspiegeln, sonst nichts.
       *
       * `Vary: Origin` steht bewusst AUSSERHALB der Bedingung. Auch die
       * Ablehnung hängt an der Herkunft: Ohne `Vary` darf ein
       * Zwischenspeicher die kopflose Antwort einer fremden Herkunft an eine
       * erlaubte ausliefern – die scheiterte dann an einer Freigabe, die es
       * eigentlich gibt. `@fastify/cors` sendet den Header deshalb in beiden
       * Fällen. Hier stand er zuerst nur im erlaubten; aufgefallen beim
       * Nachprüfen der Ränder am 03.09.2026.
       */
      kopf['Vary'] = 'Origin';
      const herkunft = req.headers.origin;
      if (herkunft && erlaubteHerkuenfte.includes(herkunft)) {
        kopf['Access-Control-Allow-Origin'] = herkunft;
      }

      offen++;
      jeAufrufer.set(aufrufer, (jeAufrufer.get(aufrufer) ?? 0) + 1);

      // Fastify soll die Antwort nicht selbst abschließen – der Strom bleibt offen.
      reply.hijack();
      reply.raw.writeHead(200, kopf);

      const abmelden = ueberwachung.abonniere(req.params.eva, zuege, (ereignis) => {
        reply.raw.write(`event: ${ereignis.typ}\ndata: ${JSON.stringify(ereignis)}\n\n`);
      });

      // Erst nach der Anmeldung senden: Wer diesen Kommentar empfängt, ist
      // sicher abonniert – darauf verlassen sich die Tests.
      reply.raw.write(': verbunden\n\n');

      // Verbindungsabbruch (Tunnel, Tabwechsel, Reload) meldet ab. Ohne das
      // pollt die EVA weiter, obwohl niemand mehr zuhört.
      //
      // `beendet` schuetzt gegen ein doppeltes Herunterzaehlen: `close` kann
      // mehr als einmal feuern, und ein zu niedriger Zaehler waere schlimmer
      // als ein zu hoher - er gaebe Plaetze frei, die es nicht gibt.
      let beendet = false;
      req.raw.on('close', () => {
        if (beendet) return;
        beendet = true;
        abmelden();
        offen--;
        const rest = (jeAufrufer.get(aufrufer) ?? 1) - 1;
        if (rest > 0) jeAufrufer.set(aufrufer, rest);
        else jeAufrufer.delete(aufrufer);
      });
    },
  );
}
