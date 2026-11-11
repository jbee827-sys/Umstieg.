import nodemailer from 'nodemailer';
import type { MailInhalt } from '../core/meldung.js';

/**
 * Versand der Meldungen aus „Etwas melden" (Spec 2026-11-10) per SMTP.
 *
 * Julians Postfach ist Absender UND Empfaenger (web.de, Port 587, STARTTLS).
 * Hat die Person eine Adresse angegeben, wird sie Reply-To - „Antworten" in
 * web.de geht dann direkt an sie.
 *
 * Die Zugangsdaten kommen nur aus der Umgebung (Fly-Secrets, lokal
 * E:\jbeer\.secrets\smtp-webde.env). Fehlt einer der fuenf Werte, gibt es
 * keinen Versand (`null`) - die Route antwortet dann 503, statt beim Start
 * abzustuerzen.
 */
export type Mailversand = (inhalt: MailInhalt) => Promise<void>;

const NOETIG = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'MELDUNG_AN'] as const;

export function erzeugeMailversand(env: NodeJS.ProcessEnv): Mailversand | null {
  const wert = Object.fromEntries(NOETIG.map((n) => [n, env[n]?.trim() ?? ''])) as Record<
    (typeof NOETIG)[number],
    string
  >;
  if (NOETIG.some((n) => wert[n] === '')) return null;

  const transport = nodemailer.createTransport({
    host: wert.SMTP_HOST,
    port: Number(wert.SMTP_PORT),
    // Port 587: unverschluesselt verbinden, dann STARTTLS - und zwar Pflicht.
    secure: false,
    requireTLS: true,
    auth: { user: wert.SMTP_USER, pass: wert.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });

  return async (inhalt) => {
    await transport.sendMail({
      from: wert.SMTP_USER,
      to: wert.MELDUNG_AN,
      ...(inhalt.antwortAn ? { replyTo: inhalt.antwortAn } : {}),
      subject: inhalt.betreff,
      text: inhalt.text,
    });
  };
}
