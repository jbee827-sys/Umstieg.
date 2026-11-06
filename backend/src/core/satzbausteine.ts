import type { KantenLage, KantenTyp } from './typen.js';

/**
 * Satzbausteine des Wegtexts (Konzept 09, 6.1).
 *
 * Feste Vorlagen mit Platzhaltern, zur Laufzeit regelbasiert gefuellt - keine
 * KI, kein Zufall: Derselbe Weg ergibt immer denselben Text. Neue
 * Formulierungen kommen in diese Tabelle, die Logik in `textgen.ts` bleibt.
 *
 * Ton: knapp, ohne Anrede, wie ein Wegweiser. Keine Ebenennummern, kein
 * „hinunter zur Ebene −1“, sondern „runter in die Unterführung“.
 */
export const BAUSTEINE = {
  /** Der erste Schritt (Julian, 06.11.2026: „Vom Zug aus …“). */
  start: {
    richtungBis: 'Vom Zug aus {richtung} bis {zurAnlage}',
    bis: 'Vom Zug aus {zurAnlage}',
    /** Standardmodell: Die Lage ist geschaetzt, deshalb „ca.“. */
    meterBis: 'Vom Zug aus {meter} bis {zurAnlage}',
    richtungZiel: 'Vom Zug aus {richtung} {ziel}',
    /** Kopfbahnhof: zum Querbahnsteig. */
    richtungBisEnde: 'Vom Zug aus {richtung} bis zum Bahnsteigende',
    gegenueber: 'Vom Zug aus gegenüber {ziel}',
    weg: 'Vom Zug aus {weg}',
    nurZiel: 'Vom Zug aus {ziel}',
  },
  /** Ebenenwechsel. `{wohin}` darf leer sein. */
  wechsel: {
    standard: '{anlage} {hochRunter}{wohin}{danach}',
    aufzugOhneWechsel: 'Aufzug nehmen{wohin}',
    /** Geratene Naht zwischen zwei Ebenen - keine Anlage, nur der Weg geht weiter. */
    naht: 'weiter nach {obenUnten}{wohin}{danach}',
  },
  /** Ebene Wege, die keine Bahnsteige sind. */
  durchgang: {
    name: '{praeposition} {name}',
    lage: '{lageWeg}',
    meter: '{ungefaehr} {meter} m geradeaus',
    wenige: 'Wenige Meter weiter',
  },
  /** Ein Weg und der Aufgang an seinem Ende in einem Schritt. */
  aufgang: {
    gezaehlt: '{ordnung} Aufgang {seite}, {wechsel}',
    seite: '{Seite} {wechsel}',
    mitWeg: '{weg}, dann {wechsel}',
    /** Standardmodell: der Aufgang und das geschaetzte Stueck danach. */
    dannMeter: '{wechsel}, dann {meter} {ziel}',
  },
  /** Am Ziel-Bahnsteig. */
  bahnsteig: {
    richtung: 'Am Bahnsteig {richtung}{ziel}',
    /** Vom Querbahnsteig oder Gang auf den Zielbahnsteig. */
    abbiegenRichtung: '{Seite} auf den Bahnsteig, {richtung}{ziel}',
    abbiegen: '{Seite} auf den Bahnsteig{ziel}',
    ohne: 'Am Bahnsteig entlang{ziel}',
  },
  stopp: {
    text: '5 min Stopp: {was}',
    kurz: 'Stopp am {was}',
  },
  kurz: {
    gegenueber: 'Gleich am selben Bahnsteig gegenüber, {ziel}',
  },
} as const;

/** Setzt die Platzhalter `{name}` ein; fehlende Werte werden leer. */
export function fuelle(vorlage: string, werte: Record<string, string | undefined>): string {
  return vorlage.replace(/\{(\w+)\}/g, (_, schluessel: string) => werte[schluessel] ?? '').replace(/\s+/g, ' ').trim();
}

export function grossAnfang(text: string): string {
  return text.charAt(0).toLocaleUpperCase('de') + text.slice(1);
}

const ANLAGE: Record<KantenTyp, string> = {
  treppe: 'Treppe',
  rolltreppe: 'Rolltreppe',
  aufzug: 'Aufzug',
  rampe: 'Rampe',
  eben: 'Weg',
};

export function anlageName(typ: KantenTyp): string {
  return ANLAGE[typ];
}

/** „zur Treppe“, „zum Aufzug“. */
export function zurAnlage(typ: KantenTyp): string {
  return typ === 'aufzug' ? 'zum Aufzug' : `zur ${ANLAGE[typ]}`;
}

/** Wohin ein Wechsel fuehrt, aus der Lage der Etappe danach - nur, wenn sie belegt ist. */
export function wohinNachLage(lage: KantenLage | undefined): string | undefined {
  switch (lage) {
    case 'unterfuehrung':
      return 'in die Unterführung';
    case 'ueberfuehrung':
      return 'auf die Überführung';
    case 'halle':
      return 'in die Halle';
    case 'draussen':
      return 'nach draußen';
    case 'bahnsteig':
      return 'auf den Bahnsteig';
    default:
      return undefined;
  }
}

/** Der Weg durch eine Lage: „Durch die Unterführung“. */
export function wegNachLage(lage: KantenLage | undefined): string | undefined {
  switch (lage) {
    case 'unterfuehrung':
      return 'Durch die Unterführung';
    case 'ueberfuehrung':
      return 'Über die Überführung';
    case 'halle':
      return 'Durch die Halle';
    case 'gang':
      return 'Durch den Gang';
    case 'draussen':
      return 'Draußen weiter';
    case 'bahnsteig':
      return 'Über den Bahnsteig';
    default:
      return undefined;
  }
}

/**
 * „Durch die Nordpassage“, „Über den Sobek-Steg“ - Artikel und Praeposition
 * aus dem Grundwort. Ohne erkennbares Grundwort kein Satz: Ein Name, dessen
 * Geschlecht man raten muesste, kommt nicht in den Text.
 */
export function wegNachName(name: string): string | undefined {
  const n = name.toLocaleLowerCase('de');
  const endet = (wort: string): boolean => n.endsWith(wort) || n.includes(`${wort} `);
  if (endet('passage') || endet('halle') || endet('unterführung') || endet('unterfuehrung') || endet('ladenstraße')) {
    return `Durch die ${name}`;
  }
  if (endet('überführung') || endet('brücke') || endet('bruecke')) return `Über die ${name}`;
  if (endet('steg') || endet('querbahnsteig')) return `Über den ${name}`;
  if (endet('tunnel')) return `Durch den ${name}`;
  return undefined;
}

const ORDNUNG = ['Erster', 'Zweiter', 'Dritter', 'Vierter'];

export function ordnungswort(n: number): string | undefined {
  return ORDNUNG[n - 1];
}

/** Gerundet auf 10 m, mindestens 10. */
export function grobeMeter(m: number): number {
  return Math.max(10, Math.round(m / 10) * 10);
}
