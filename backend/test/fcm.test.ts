import { generateKeyPairSync, createVerify } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { erzeugeFcmVersand, fcmNachricht } from '../src/clients/fcm.js';
import type { Mitteilung } from '../src/core/mitteilungstexte.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KONTO = {
  type: 'service_account',
  project_id: 'umstieg-test',
  client_email: 'fcm@umstieg-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
};
const ENV = { FIREBASE_SERVICE_ACCOUNT: JSON.stringify(KONTO) };

const M: Mitteilung = {
  art: 'gleis-ab',
  titel: 'Gleis 5 statt 6',
  text: 'RE 3 nach Schwedt (Oder), ab 16:23',
  buendel: 'gleis-ab|RE 3352',
  daten: { art: 'gleis-ab', zug: 'RE 3352', restMin: '9' },
};

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Falsches `fetch`: Token-Tausch und Versand getrennt, Antworten je Versand vorgebbar. */
function falschesFetch(versandAntworten: (() => Response | Promise<Response>)[] = []) {
  const aufrufe: { url: string; init: RequestInit }[] = [];
  let n = 0;
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    aufrufe.push({ url: String(url), init: init ?? {} });
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return json(200, { access_token: `zugang-${aufrufe.length}`, expires_in: 3600, token_type: 'Bearer' });
    }
    const a = versandAntworten[n++];
    return a ? a() : json(200, { name: 'projects/umstieg-test/messages/1' });
  }) as unknown as typeof fetch;
  return { fetchFn, aufrufe };
}

describe('erzeugeFcmVersand', () => {
  it('liefert null ohne oder mit unlesbarem Dienstkonto', () => {
    expect(erzeugeFcmVersand({})).toBeNull();
    expect(erzeugeFcmVersand({ FIREBASE_SERVICE_ACCOUNT: '{kaputt' })).toBeNull();
    expect(erzeugeFcmVersand({ FIREBASE_SERVICE_ACCOUNT: JSON.stringify({ project_id: 'x' }) })).toBeNull();
  });

  it('nimmt das Dienstkonto auch Base64-kodiert an', () => {
    const b64 = Buffer.from(JSON.stringify(KONTO)).toString('base64');
    expect(erzeugeFcmVersand({ FIREBASE_SERVICE_ACCOUNT: b64 })).not.toBeNull();
  });

  it('holt ein Zugangstoken mit signiertem JWT und nutzt es bis kurz vor Ablauf wieder', async () => {
    const { fetchFn, aufrufe } = falschesFetch();
    let uhr = Date.parse('2026-11-23T15:00:00Z');
    const versand = erzeugeFcmVersand(ENV, fetchFn, () => uhr)!;

    expect(await versand('geraet-1', 'ios', M)).toBe('ok');
    expect(await versand('geraet-1', 'ios', M)).toBe('ok');
    expect(aufrufe.map((a) => a.url)).toEqual([
      'https://oauth2.googleapis.com/token',
      'https://fcm.googleapis.com/v1/projects/umstieg-test/messages:send',
      'https://fcm.googleapis.com/v1/projects/umstieg-test/messages:send',
    ]);

    // Das JWT ist mit dem Schluessel des Dienstkontos signiert und traegt den FCM-Bereich.
    const form = new URLSearchParams(String(aufrufe[0]!.init.body));
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    const [kopf, inhalt, signatur] = form.get('assertion')!.split('.');
    const pruefer = createVerify('RSA-SHA256');
    pruefer.update(`${kopf}.${inhalt}`);
    expect(pruefer.verify(publicKey, Buffer.from(signatur!, 'base64url'))).toBe(true);
    expect(JSON.parse(Buffer.from(inhalt!, 'base64url').toString())).toMatchObject({
      iss: KONTO.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: uhr / 1000,
      exp: uhr / 1000 + 3600,
    });
    expect((aufrufe[1]!.init.headers as Record<string, string>).Authorization).toBe('Bearer zugang-1');

    // 59 Min. spaeter (weniger als 60 s vor Ablauf): neues Zugangstoken.
    uhr += 59 * 60_000 + 1000;
    await versand('geraet-1', 'ios', M);
    expect(aufrufe.filter((a) => a.url.includes('oauth2'))).toHaveLength(2);
  });

  it('meldet token-ungueltig bei UNREGISTERED, 404 und einem ungueltigen Registrierungstoken', async () => {
    const fehler = (status: number, code: string, message = '') =>
      json(status, {
        error: {
          code: status,
          message,
          status: code === 'UNREGISTERED' ? 'NOT_FOUND' : code,
          details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: code }],
        },
      });
    const { fetchFn } = falschesFetch([
      () => fehler(404, 'UNREGISTERED', 'Requested entity was not found.'),
      () => json(404, {}),
      () => fehler(400, 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token'),
      () => fehler(400, 'INVALID_ARGUMENT', 'Invalid value at message.data'),
    ]);
    const versand = erzeugeFcmVersand(ENV, fetchFn)!;
    expect(await versand('alt', 'ios', M)).toBe('token-ungueltig');
    expect(await versand('alt', 'ios', M)).toBe('token-ungueltig');
    expect(await versand('alt', 'ios', M)).toBe('token-ungueltig');
    // Ein Fehler in UNSERER Nachricht darf nicht alle Wachen beenden.
    expect(await versand('alt', 'ios', M)).toBe('fehler');
  });

  it('meldet fehler bei 500, bei Netzfehler und wenn der Token-Tausch scheitert - ohne zu werfen', async () => {
    const { fetchFn } = falschesFetch([
      () => json(500, {}),
      () => Promise.reject(new Error('ECONNRESET')),
    ]);
    const versand = erzeugeFcmVersand(ENV, fetchFn)!;
    expect(await versand('g', 'ios', M)).toBe('fehler');
    expect(await versand('g', 'ios', M)).toBe('fehler');

    const ohneZugang = erzeugeFcmVersand(ENV, (async () => json(400, { error: 'invalid_grant' })) as unknown as typeof fetch)!;
    expect(await ohneZugang('g', 'ios', M)).toBe('fehler');
  });

  it('holt nach 401 beim naechsten Versand ein neues Zugangstoken', async () => {
    const { fetchFn, aufrufe } = falschesFetch([() => json(401, {})]);
    const versand = erzeugeFcmVersand(ENV, fetchFn)!;
    expect(await versand('g', 'ios', M)).toBe('fehler');
    expect(await versand('g', 'ios', M)).toBe('ok');
    expect(aufrufe.filter((a) => a.url.includes('oauth2'))).toHaveLength(2);
  });
});

describe('fcmNachricht', () => {
  it('baut die Nachricht mit Kategorie reise, collapse-id und data', () => {
    expect(fcmNachricht('geraet-1', 'ios', M)).toEqual({
      message: {
        token: 'geraet-1',
        notification: { title: 'Gleis 5 statt 6', body: 'RE 3 nach Schwedt (Oder), ab 16:23' },
        data: { art: 'gleis-ab', zug: 'RE 3352', restMin: '9' },
        apns: {
          headers: { 'apns-collapse-id': 'gleis-ab|RE 3352', 'apns-priority': '10', 'apns-push-type': 'alert' },
          payload: { aps: { sound: 'default', category: 'reise' } },
        },
        android: { collapse_key: 'gleis-ab|RE 3352', priority: 'high' },
      },
    });
  });

  it('kuerzt die collapse-id auf 64 Byte, ohne ein Zeichen zu zerschneiden', () => {
    const lang = { ...M, buendel: `gleis-ab|${'ä'.repeat(40)}` };
    const id = (fcmNachricht('g', 'ios', lang) as { message: { apns: { headers: Record<string, string> } } })
      .message.apns.headers['apns-collapse-id']!;
    expect(Buffer.byteLength(id)).toBeLessThanOrEqual(64);
    expect(id).toBe(`gleis-ab|${'ä'.repeat(27)}`);
  });
});
