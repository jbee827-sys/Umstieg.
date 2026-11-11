/**
 * „Etwas melden" (Spec docs/superpowers/specs/2026-11-10-etwas-melden-design.md).
 *
 * Wer die App benutzt, schreibt Julian einen Freitext, auf Wunsch mit einer
 * E-Mail-Adresse fuer die Antwort. Hier stehen nur die Regeln und die Form der
 * Mail - rein, ohne Netz, ohne Speicher.
 *
 * Bewusst NICHT hier und nirgends sonst im Backend: Text oder Adresse
 * aufbewahren, zwischenspeichern oder protokollieren. Die Datenschutzseite
 * sagt zu, dass der Server die Meldung nur weiterreicht; die Mail im Postfach
 * ist der einzige Ort, an dem sie liegt.
 *
 * Dieselben Regeln prueft das Frontend (frontend/src/meldung/regeln.ts) - das
 * Backend vertraut ihm aber nicht.
 */

/** Mindestens so viele Zeichen OHNE Leerraum (Julian: Leerzeichen zaehlen nicht). */
export const MIN_ZEICHEN = 5;
/** Hoechstens so viele Zeichen, gezaehlt wie im Feld - mit Leerraum. */
export const MAX_ZEICHEN = 2000;

export type MeldungFehler = 'form' | 'zu-kurz' | 'zu-lang' | 'adresse';

export interface Meldung {
  text: string;
  email?: string;
}

export interface MailInhalt {
  betreff: string;
  text: string;
  /** Wird Reply-To - nur wenn die Person eine Adresse angegeben hat. */
  antwortAn?: string;
}

/**
 * Bewusst schlicht: etwas @ etwas . etwas. Ausgeschlossen ist alles, was eine
 * zweite Adresse oder eine weitere Kopfzeile einschleusen koennte -
 * Leerraum (auch Zeilenumbrueche), Komma, Semikolon, spitze Klammern,
 * Anfuehrungszeichen.
 */
const ADRESSE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const MAX_ADRESSE = 254;

const zeichenOhneLeerraum = (text: string): number => text.replace(/\s/g, '').length;

export function pruefeMeldung(
  body: unknown,
): { ok: true; meldung: Meldung } | { ok: false; fehler: MeldungFehler } {
  if (typeof body !== 'object' || body === null) return { ok: false, fehler: 'form' };
  const { text, email } = body as { text?: unknown; email?: unknown };
  if (typeof text !== 'string') return { ok: false, fehler: 'form' };
  if (email !== undefined && typeof email !== 'string') return { ok: false, fehler: 'form' };

  if (zeichenOhneLeerraum(text) < MIN_ZEICHEN) return { ok: false, fehler: 'zu-kurz' };
  if (text.length > MAX_ZEICHEN) return { ok: false, fehler: 'zu-lang' };

  const adresse = email?.trim() ?? '';
  if (adresse === '') return { ok: true, meldung: { text } };
  if (adresse.length > MAX_ADRESSE || !ADRESSE.test(adresse)) return { ok: false, fehler: 'adresse' };
  return { ok: true, meldung: { text, email: adresse } };
}

const BERLINER_ZEIT = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** „10.11.2026, 21:58" - aus den Einzelteilen, nicht aus der Gesamtformatierung. */
function berlinerZeit(jetzt: Date): string {
  const teil = Object.fromEntries(BERLINER_ZEIT.formatToParts(jetzt).map((t) => [t.type, t.value]));
  return `${teil.day}.${teil.month}.${teil.year}, ${teil.hour}:${teil.minute}`;
}

export function baueMail(meldung: Meldung, jetzt: Date): MailInhalt {
  const betreff = `Meldung aus Umstieg. – ${berlinerZeit(jetzt)}`;
  if (!meldung.email) {
    return { betreff, text: `${meldung.text}\n\n—\nKeine Antwortadresse angegeben.` };
  }
  return {
    betreff,
    text: `${meldung.text}\n\n—\nAntwort an: ${meldung.email}`,
    antwortAn: meldung.email,
  };
}
