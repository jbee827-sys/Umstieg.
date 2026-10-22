/**
 * Die Schritte der Einführungstour (Plan Einführungstour, Abschnitt 4 –
 * Texte abgestimmt mit Julian).
 *
 * Nur Daten: Reihenfolge, Ziel und Text lassen sich hier ändern, ohne einen
 * Bildschirm anzufassen. Ziele sind Werte von `data-tour`-Attributen an den
 * echten Elementen, keine CSS-Klassen – eine Klasse ändert sich mit der
 * Gestaltung, das Attribut nur mit Absicht. `ziele.test.tsx` prüft, dass
 * jedes Ziel auf seinem Bildschirm genau einmal steht.
 *
 * Die Texte gehen als HTML an driver.js (`innerHTML`). Deshalb stehen hier
 * ausschließlich feste, eigene Texte – nie etwas aus dem Netz oder aus einer
 * Eingabe.
 */

export type TourBildschirm = 'eingabe' | 'uebersicht' | 'weg'

export interface TourSchritt {
  bildschirm: TourBildschirm
  /** Wert von `data-tour`; ohne Ziel steht die Blase mittig. */
  ziel?: string
  titel: string
  text: string
  /**
   * Was „Weiter“ zusätzlich auslöst: den echten Knopf mit diesem
   * `data-tour`-Wert drücken und auf den nächsten Bildschirm warten.
   */
  aktion?: 'starten' | 'navigation-starten'
  /** Beschriftung des Weiter-Knopfs, wenn nicht „Weiter“. */
  weiterText?: string
}

export const SCHRITTE: TourSchritt[] = [
  {
    bildschirm: 'eingabe',
    titel: 'Was ist Umstieg?',
    text:
      'Umstieg zeigt dir beim Umsteigen den Weg vom Ankunftsgleis zu deinem Anschlusszug – Schritt für Schritt, über alle Ebenen des Bahnhofs. Dazu sagt dir die App laufend, ob du den Anschluss noch entspannt schaffst.' +
      '<br><br>Die Tour zeigt das an einem Beispiel in <strong>Berlin Hbf</strong>. Deine eigenen Eingaben bleiben unverändert.',
  },
  {
    bildschirm: 'eingabe',
    ziel: 'bahnhof',
    titel: 'Bahnhof wählen',
    text: 'Gib den Bahnhof ein, an dem du umsteigst. Erlaubst du den Standort, erkennt Umstieg den Bahnhof selbst.',
  },
  {
    bildschirm: 'eingabe',
    ziel: 'ankunft',
    titel: 'Ankunftszug wählen',
    text: 'Wähle deinen Zug aus der Ankunftstafel. Das Gleis übernimmt Umstieg automatisch – hier <strong>Gleis 14</strong>.',
  },
  {
    bildschirm: 'eingabe',
    ziel: 'anschluss',
    titel: 'Anschluss wählen',
    text: 'Genauso für den Anschluss: <strong>ICE 1007</strong> nach München, Gleis 6.',
  },
  {
    bildschirm: 'eingabe',
    ziel: 'starten',
    titel: 'Umstieg starten',
    text: 'Ein Tipp, und Umstieg berechnet deinen Weg durch den Bahnhof.',
    aktion: 'starten',
  },
  {
    bildschirm: 'uebersicht',
    ziel: 'ampel',
    titel: 'Die Ampel',
    text: '<strong>Grün</strong> heißt entspannt, <strong>Gelb</strong> knapp, <strong>Rot</strong> kaum zu schaffen. Daneben stehen die Restzeit bis zur Abfahrt und deine Gehzeit.',
  },
  {
    bildschirm: 'uebersicht',
    ziel: 'zuege',
    titel: 'Ankunft und Anschluss',
    text: 'Gleis, Ebene und Uhrzeit beider Züge auf einen Blick. Das Ziel ist rot hervorgehoben.',
  },
  {
    bildschirm: 'uebersicht',
    ziel: 'standort',
    titel: 'Wo steigst du aus?',
    // Zahlen aus der Aufzeichnung (Startbestand 13.10.2026): Westende 500 s,
    // Mitte 305 s - aufgerundet 9 und 6 Minuten. Nach `npm run
    // vorfuehrdaten` prüfen (README).
    text: 'Wähle, wo du am Bahnsteig stehst. Weg und Gehzeit passen sich an – vom Westende sind es hier 9 statt 6 Minuten.',
  },
  {
    bildschirm: 'uebersicht',
    ziel: 'route',
    titel: 'Route wählen',
    text: 'Die schnellste Route, barrierefrei mit Aufzug oder mit Stopp an WC und Kiosk.',
  },
  {
    bildschirm: 'uebersicht',
    ziel: 'navigation-starten',
    titel: 'Navigation starten',
    text: 'Jetzt geht es los: Umstieg führt dich Schritt für Schritt zum Anschlussgleis.',
    aktion: 'navigation-starten',
  },
  {
    bildschirm: 'weg',
    ziel: 'schema',
    titel: 'Das Ebenenschema',
    text: 'Alle Ebenen, die du durchquerst, von oben nach unten. Rot markiert ist die Ebene, auf der du gerade bist, mit der nächsten Rolltreppe.',
  },
  {
    bildschirm: 'weg',
    ziel: 'schritt',
    titel: 'Schritt für Schritt',
    text: 'Hier steht, was als Nächstes zu tun ist. Mit <strong>Weiter</strong> gehst du zum nächsten Schritt, unter „Alle Schritte“ siehst du den ganzen Weg.',
  },
  {
    bildschirm: 'weg',
    ziel: 'leiste',
    titel: 'Jederzeit wechseln',
    text: 'Über die Leiste springst du zwischen Eingabe, Übersicht und Weg. Unter <strong>Meldungen</strong> stehen Gleiswechsel und Verspätungen.',
  },
  {
    bildschirm: 'weg',
    titel: 'Fertig!',
    text: 'Das war der ideale Ablauf. Probier es jetzt mit deiner eigenen Verbindung.',
    weiterText: 'Eigene Reise eingeben',
  },
]
