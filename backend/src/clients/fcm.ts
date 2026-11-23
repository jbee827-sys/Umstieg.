import { createSign } from 'node:crypto';
import type { Mitteilung } from '../core/mitteilungstexte.js';
import type { Plattform } from '../core/reisewache.js';
import type { Versand, Versandergebnis } from '../core/reisewachen.js';

// Versand ueber Firebase Cloud Messaging, HTTP v1 (Konzept 6.1).
//
// Bewusst ohne `firebase-admin` und ohne `google-auth-library` (Konzept 10,
// Plan: keine neue Abhaengigkeit): Gebraucht wird nur ein signiertes JWT,
// einmal je Stunde gegen ein Zugangstoken getauscht, und ein POST je
// Mitteilung. Beides leisten `node:crypto` und `fetch`.
//
// Kein Wiederholen: Eine Mitteilung, die jetzt nicht ankommt, ist in ein paar
// Minuten ohnehin veraltet - die naechste Aenderung bringt die naechste.

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const BEREICH = 'https://www.googleapis.com/auth/firebase.messaging';
/** So lange vor Ablauf wird das Zugangstoken schon ersetzt. */
const VORLAUF_MS = 60_000;
/** APNs nimmt hoechstens 64 Byte als `apns-collapse-id`. */
const COLLAPSE_MAX_BYTE = 64;

interface Dienstkonto {
  project_id: string;
  client_email: string;
  private_key: string;
}

/**
 * `FIREBASE_SERVICE_ACCOUNT`: die JSON-Datei des Dienstkontos, roh oder
 * Base64-kodiert (Base64 uebersteht Shell und `flyctl secrets set` ohne
 * Streit um Zeilenumbrueche und Anfuehrungszeichen).
 */
function leseDienstkonto(wert: string | undefined): Dienstkonto | null {
  if (!wert?.trim()) return null;
  const roh = wert.trim();
  const text = roh.startsWith('{') ? roh : Buffer.from(roh, 'base64').toString('utf8');
  try {
    const k = JSON.parse(text) as Partial<Dienstkonto>;
    if (typeof k.project_id !== 'string' || typeof k.client_email !== 'string' || typeof k.private_key !== 'string') {
      return null;
    }
    return { project_id: k.project_id, client_email: k.client_email, private_key: k.private_key };
  } catch {
    return null;
  }
}

function b64url(daten: string | Buffer): string {
  return Buffer.from(daten).toString('base64url');
}

function signiertesJwt(konto: Dienstkonto, jetztMs: number): string {
  const iat = Math.floor(jetztMs / 1000);
  const kopf = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const inhalt = b64url(JSON.stringify({ iss: konto.client_email, scope: BEREICH, aud: TOKEN_URL, iat, exp: iat + 3600 }));
  const signierer = createSign('RSA-SHA256');
  signierer.update(`${kopf}.${inhalt}`);
  return `${kopf}.${inhalt}.${b64url(signierer.sign(konto.private_key))}`;
}

/** Kuerzt auf `max` Byte UTF-8, ohne ein Zeichen zu zerschneiden. */
function kuerzeAufByte(text: string, max: number): string {
  let aus = '';
  for (const zeichen of text) {
    if (Buffer.byteLength(aus + zeichen) > max) break;
    aus += zeichen;
  }
  return aus;
}

/** Body fuer `messages:send`. Kategorie `reise` oeffnet die aufgeklappte Ansicht (Content Extension). */
export function fcmNachricht(token: string, _plattform: Plattform, m: Mitteilung): object {
  return {
    message: {
      token,
      notification: { title: m.titel, body: m.text },
      data: m.daten,
      apns: {
        headers: {
          'apns-collapse-id': kuerzeAufByte(m.buendel, COLLAPSE_MAX_BYTE),
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
        payload: { aps: { sound: 'default', category: 'reise' } },
      },
      android: { collapse_key: m.buendel, priority: 'high' },
    },
  };
}

interface FcmFehler {
  error?: { message?: string; details?: { errorCode?: string }[] };
}

/**
 * Lehnt FCM das Geraet ab? `UNREGISTERED`/404: App geloescht oder Token
 * erneuert. `INVALID_ARGUMENT` nur, wenn es das Registrierungstoken meint -
 * derselbe Code steht auch fuer einen Fehler in UNSERER Nachricht, und der
 * darf nicht jede Wache beenden.
 */
function istTokenUngueltig(status: number, body: FcmFehler | null): boolean {
  if (status === 404) return true;
  const codes = body?.error?.details?.map((d) => d.errorCode) ?? [];
  if (codes.includes('UNREGISTERED')) return true;
  return codes.includes('INVALID_ARGUMENT') && /registration token/i.test(body?.error?.message ?? '');
}

export function erzeugeFcmVersand(
  env: NodeJS.ProcessEnv | Record<string, string | undefined>,
  fetchFn: typeof fetch = fetch,
  jetzt: () => number = Date.now,
): Versand | null {
  const konto = leseDienstkonto(env.FIREBASE_SERVICE_ACCOUNT);
  if (!konto) return null;
  const sendeUrl = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(konto.project_id)}/messages:send`;

  let zugang: { token: string; bisMs: number } | null = null;
  /** Ein Tausch fuer alle gleichzeitigen Sendungen, nicht einer je Mitteilung. */
  let laufenderTausch: Promise<string> | null = null;

  async function tausche(): Promise<string> {
    const start = jetzt();
    const antwort = await fetchFn(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: signiertesJwt(konto!, start),
      }).toString(),
    });
    if (!antwort.ok) throw new Error(`Zugangstoken: HTTP ${antwort.status}`);
    const daten = (await antwort.json()) as { access_token?: string; expires_in?: number };
    if (!daten.access_token) throw new Error('Zugangstoken fehlt in der Antwort');
    zugang = { token: daten.access_token, bisMs: start + (daten.expires_in ?? 3600) * 1000 };
    return daten.access_token;
  }

  async function zugangstoken(): Promise<string> {
    if (zugang && jetzt() < zugang.bisMs - VORLAUF_MS) return zugang.token;
    laufenderTausch ??= tausche().finally(() => {
      laufenderTausch = null;
    });
    return laufenderTausch;
  }

  return async (token, plattform, m): Promise<Versandergebnis> => {
    try {
      const zugangsToken = await zugangstoken();
      const antwort = await fetchFn(sendeUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${zugangsToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(fcmNachricht(token, plattform, m)),
      });
      if (antwort.ok) return 'ok';
      // Abgelaufen oder widerrufen: beim naechsten Mal neu tauschen.
      if (antwort.status === 401) zugang = null;
      const body = (await antwort.json().catch(() => null)) as FcmFehler | null;
      return istTokenUngueltig(antwort.status, body) ? 'token-ungueltig' : 'fehler';
    } catch {
      return 'fehler';
    }
  };
}
