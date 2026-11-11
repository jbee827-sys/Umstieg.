import { describe, expect, it } from 'vitest';
import { baueMail, pruefeMeldung } from '../src/core/meldung.js';

/**
 * „Etwas melden" (Spec 2026-11-10): Regeln fuer den Text und die freiwillige
 * Adresse, dazu die Form der Mail an Julians Postfach.
 */
describe('pruefeMeldung', () => {
  it('nimmt 5 Zeichen ohne Leerraum an', () => {
    expect(pruefeMeldung({ text: 'a b c d e' }).ok).toBe(true);
  });

  it('zaehlt Leerraum nirgends mit', () => {
    expect(pruefeMeldung({ text: ' a b c d ' })).toEqual({ ok: false, fehler: 'zu-kurz' });
  });

  it('weist reinen Leerraum ab (Review Focus 1)', () => {
    expect(pruefeMeldung({ text: ' '.repeat(20) + '\n\n' })).toEqual({ ok: false, fehler: 'zu-kurz' });
  });

  it('erlaubt genau 2000 Zeichen', () => {
    expect(pruefeMeldung({ text: 'x'.repeat(2000) }).ok).toBe(true);
  });

  it('weist 2001 Zeichen ab', () => {
    expect(pruefeMeldung({ text: 'x'.repeat(2001) })).toEqual({ ok: false, fehler: 'zu-lang' });
  });

  it.each([null, 'text', { text: 5 }, { text: 'hallo welt', email: 7 }])('weist falsche Form ab: %j', (b) => {
    expect(pruefeMeldung(b)).toEqual({ ok: false, fehler: 'form' });
  });

  it('behandelt leere Adresse wie keine', () => {
    expect(pruefeMeldung({ text: 'hallo welt', email: '  ' })).toEqual({ ok: true, meldung: { text: 'hallo welt' } });
  });

  it('schneidet Leerraum um die Adresse ab', () => {
    expect(pruefeMeldung({ text: 'hallo welt', email: ' anna@beispiel.de ' })).toEqual({
      ok: true,
      meldung: { text: 'hallo welt', email: 'anna@beispiel.de' },
    });
  });

  it.each(['anna', 'anna@', 'anna@beispiel', 'a b@beispiel.de', 'a@b.de\nBcc: x@y.de', 'a@b.de,c@d.de'])(
    'weist unbrauchbare Adresse ab: %j (Review Focus 2)',
    (email) => {
      expect(pruefeMeldung({ text: 'hallo welt', email })).toEqual({ ok: false, fehler: 'adresse' });
    },
  );
});

describe('baueMail', () => {
  const jetzt = new Date('2026-11-10T20:58:00Z'); // 21:58 in Berlin

  it('setzt Betreff mit Berliner Zeit', () => {
    expect(baueMail({ text: 'Gleis 6 fehlt.' }, jetzt).betreff).toBe('Meldung aus Umstieg. – 10.11.2026, 21:58');
  });

  it('ohne Adresse: kein Reply-To, Hinweis am Ende', () => {
    expect(baueMail({ text: 'Gleis 6 fehlt.' }, jetzt)).toEqual({
      betreff: 'Meldung aus Umstieg. – 10.11.2026, 21:58',
      text: 'Gleis 6 fehlt.\n\n—\nKeine Antwortadresse angegeben.',
    });
  });

  it('mit Adresse: Reply-To und Angabe am Ende', () => {
    expect(baueMail({ text: 'Gleis 6 fehlt.', email: 'anna@beispiel.de' }, jetzt)).toEqual({
      betreff: 'Meldung aus Umstieg. – 10.11.2026, 21:58',
      text: 'Gleis 6 fehlt.\n\n—\nAntwort an: anna@beispiel.de',
      antwortAn: 'anna@beispiel.de',
    });
  });
});
