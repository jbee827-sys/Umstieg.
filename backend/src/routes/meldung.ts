import type { FastifyInstance } from 'fastify';
import type { Mailversand } from '../clients/mailversand.js';
import { baueMail, pruefeMeldung } from '../core/meldung.js';

/**
 * POST /api/meldung - „Etwas melden" (Spec 2026-11-10).
 *
 * JSON `{ text, email? }` → 204 gesendet · 400 `{ fehler }` · 503 ohne
 * eingerichteten Versand · 502 wenn der Mailserver ablehnt.
 *
 * Nichts wird aufbewahrt. Scheitert der Versand, geht nur DASS es scheiterte
 * ins Protokoll, mit dem Fehlercode des Mailservers - nie das Fehlerobjekt
 * oder seine Nachricht: Die kann die Adresse enthalten („Absender … abgelehnt").
 */
export function registriereMeldungRoute(app: FastifyInstance, versand: Mailversand | null): void {
  // 2000 Zeichen zu je bis zu 4 Byte plus Adresse und JSON-Huelle.
  app.post('/api/meldung', { bodyLimit: 16_384 }, async (anfrage, antwort) => {
    const geprueft = pruefeMeldung(anfrage.body);
    if (!geprueft.ok) return antwort.code(400).send({ fehler: geprueft.fehler });
    if (versand === null) return antwort.code(503).send({ fehler: 'nicht-eingerichtet' });

    try {
      await versand(baueMail(geprueft.meldung, new Date()));
    } catch (fehler) {
      const code = (fehler as { code?: unknown } | null)?.code;
      app.log.warn(
        { ereignis: 'meldung-versand', code: typeof code === 'string' ? code : undefined },
        'Meldung konnte nicht verschickt werden',
      );
      return antwort.code(502).send({ fehler: 'versand' });
    }
    return antwort.code(204).send();
  });
}
