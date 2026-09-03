import type { FastifyInstance } from 'fastify';
import type { Ueberwachung } from '../core/ueberwachung.js';

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
export function registriereLiveRouten(
  app: FastifyInstance,
  ueberwachung: Ueberwachung,
  erlaubteHerkuenfte: string[] = [],
): void {
  app.get<{ Params: { eva: string }; Querystring: { zugAn?: string; zugAb?: string } }>(
    '/api/live/:eva',
    (req, reply) => {
      const zuege = [req.query.zugAn, req.query.zugAb].filter((z): z is string => Boolean(z));

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
       * `Vary: Origin` gehört dazu, sonst darf ein Zwischenspeicher die
       * Antwort für eine Herkunft an eine andere ausliefern.
       */
      const herkunft = req.headers.origin;
      if (herkunft && erlaubteHerkuenfte.includes(herkunft)) {
        kopf['Access-Control-Allow-Origin'] = herkunft;
        kopf['Vary'] = 'Origin';
      }

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
      req.raw.on('close', abmelden);
    },
  );
}
