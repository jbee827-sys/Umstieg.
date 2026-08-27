import type { FastifyInstance } from 'fastify';
import type { Ueberwachung } from '../core/ueberwachung.js';

/**
 * SSE-Strom je EVA-Nummer. Die Ereignisse stammen aus der Überwachung, die
 * unabhängig von der Zahl der Zuschauer nur EINMAL je EVA pollt
 * (Konzeptkorrektur 1 – Ratenlimits).
 *
 * `zugAn`/`zugAb` schränken die Ereignisse auf die beiden Züge des Umstiegs
 * ein; ohne sie kommen alle Ereignisse des Bahnhofs an.
 */
export function registriereLiveRouten(app: FastifyInstance, ueberwachung: Ueberwachung): void {
  app.get<{ Params: { eva: string }; Querystring: { zugAn?: string; zugAb?: string } }>(
    '/api/live/:eva',
    (req, reply) => {
      const zuege = [req.query.zugAn, req.query.zugAb].filter((z): z is string => Boolean(z));

      // Fastify soll die Antwort nicht selbst abschließen – der Strom bleibt offen.
      reply.hijack();
      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        // Verhindert Pufferung durch zwischengeschaltete Proxys (Caddy/nginx).
        'X-Accel-Buffering': 'no',
      });

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
