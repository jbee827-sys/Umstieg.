// ANGABEN HIER EINTRAGEN – ohne sie ist das Impressum wertlos.
// § 5 DDG verlangt Name, ladungsfaehige Anschrift und einen zweiten
// Kontaktweg neben der E-Mail (in der Regel eine Telefonnummer).
// Ein Postfach genuegt nicht.
//
// Diese Datei ist die einzige Stelle mit personenbezogenen Angaben des
// Betreibers. Impressum und Datenschutzerklaerung lesen beide von hier.
export const BETREIBER = {
  name: '[BITTE AUSFÜLLEN: Vor- und Nachname]',
  strasse: '[BITTE AUSFÜLLEN: Straße und Hausnummer]',
  ort: '[BITTE AUSFÜLLEN: PLZ und Ort]',
  land: 'Deutschland',
  email: '[BITTE AUSFÜLLEN: E-Mail-Adresse]',
  telefon: '[BITTE AUSFÜLLEN: Telefonnummer]',
};

/** true, solange noch Platzhalter drinstehen – blendet die Warnung ein. */
export const ANGABEN_FEHLEN = Object.values(BETREIBER).some((w) => w.startsWith('[BITTE'));
