import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { erzeugeMailversand, type Mailversand } from '../src/clients/mailversand.js';
import type { MailInhalt } from '../src/core/meldung.js';

/**
 * POST /api/meldung (Spec 2026-11-10 „Etwas melden"): nimmt Text und
 * freiwillige Adresse an und reicht sie als Mail weiter - sonst nichts.
 */
function sammelVersand() {
  const gesendet: MailInhalt[] = [];
  const versand: Mailversand = async (inhalt) => {
    gesendet.push(inhalt);
  };
  return { gesendet, versand };
}

const melde = (app: ReturnType<typeof buildApp>, body: unknown, ip = '203.0.113.9') =>
  app.inject({
    method: 'POST',
    url: '/api/meldung',
    payload: body as object,
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  });

describe('POST /api/meldung', () => {
  it('schickt eine gueltige Meldung und antwortet 204', async () => {
    const { gesendet, versand } = sammelVersand();
    const app = buildApp({ mailversand: versand });
    const res = await melde(app, { text: 'Gleis 6 fehlt in Fulda.', email: 'anna@beispiel.de' });
    expect(res.statusCode).toBe(204);
    expect(gesendet).toHaveLength(1);
    expect(gesendet[0].antwortAn).toBe('anna@beispiel.de');
    expect(gesendet[0].text.startsWith('Gleis 6 fehlt in Fulda.')).toBe(true);
    await app.close();
  });

  it('weist zu kurzen Text mit 400 zu-kurz ab und schickt nichts', async () => {
    const { gesendet, versand } = sammelVersand();
    const app = buildApp({ mailversand: versand });
    const res = await melde(app, { text: 'a b c' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ fehler: 'zu-kurz' });
    expect(gesendet).toHaveLength(0);
    await app.close();
  });

  it('weist eine Adresse mit Zeilenumbruch mit 400 adresse ab (Review Focus 2)', async () => {
    const { gesendet, versand } = sammelVersand();
    const app = buildApp({ mailversand: versand });
    const res = await melde(app, { text: 'Gleis 6 fehlt.', email: 'a@b.de\nBcc: x@y.de' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ fehler: 'adresse' });
    expect(gesendet).toHaveLength(0);
    await app.close();
  });

  it('antwortet 503, wenn kein Versand eingerichtet ist (Review Focus 5)', async () => {
    const app = buildApp({ mailversand: null });
    const res = await melde(app, { text: 'Gleis 6 fehlt.' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ fehler: 'nicht-eingerichtet' });
    await app.close();
  });

  it('antwortet 502, wenn der Versand scheitert (Review Focus 3)', async () => {
    const app = buildApp({
      mailversand: async () => {
        throw Object.assign(new Error('x'), { code: 'EAUTH' });
      },
    });
    const res = await melde(app, { text: 'Gleis 6 fehlt.' });
    expect(res.statusCode).toBe(502);
    expect(res.json()).toEqual({ fehler: 'versand' });
    await app.close();
  });

  it('begrenzt auf 2 Meldungen je Minute und Aufrufer', async () => {
    const { versand } = sammelVersand();
    const app = buildApp({ mailversand: versand });
    const codes: number[] = [];
    for (let i = 0; i < 3; i++) codes.push((await melde(app, { text: `Meldung Nummer ${i}` }, '203.0.113.44')).statusCode);
    expect(codes).toEqual([204, 204, 429]);
    await app.close();
  });
});

describe('erzeugeMailversand', () => {
  const voll = {
    SMTP_HOST: 'smtp.web.de',
    SMTP_PORT: '587',
    SMTP_USER: 'absender@beispiel.de',
    SMTP_PASS: 'geheim',
    MELDUNG_AN: 'empfaenger@beispiel.de',
  };

  it('liefert einen Versand mit allen fuenf Werten', () => {
    expect(typeof erzeugeMailversand(voll)).toBe('function');
  });

  it.each(Object.keys(voll))('liefert null ohne vollstaendige SMTP-Werte: %s fehlt', (name) => {
    const env: Record<string, string> = { ...voll };
    delete env[name];
    expect(erzeugeMailversand(env)).toBeNull();
    expect(erzeugeMailversand({ ...voll, [name]: ' ' })).toBeNull();
  });
});
