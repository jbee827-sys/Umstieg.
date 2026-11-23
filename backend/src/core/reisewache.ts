import { ampel } from './gehzeit.js';
import {
  mitteilungsDaten,
  textAusfall,
  textErinnerung,
  textGleis,
  textRot,
  textZeitAb,
  textZeitAn,
  type Mitteilung,
  type MitteilungsArt,
  type Status,
  type TextZug,
} from './mitteilungstexte.js';
import type { LiveEreignis } from './ueberwachung.js';
import { berlinUhrzeit, berlinZeitpunktNahe } from './zeit.js';

// Reisewache (Konzept 6.1): entscheidet fuer EINE Reise, welche Mitteilung
// ein Live-Ereignis ausloest. Rein - ohne Zeitgeber, ohne Versand, ohne
// Fastify. Zeitgeber, Abos und Versand haelt `reisewachen.ts`; hier steht nur,
// WAS faellig ist und WANN. Der Zustand wird nie veraendert, jede Beurteilung
// liefert einen neuen.

export type Plattform = 'ios' | 'android';

export interface ZugDerReise {
  /** Tafelschlüssel: DB `zug` („RE 3352“) bzw. Haltestellenpfad `fahrtId` */
  name: string;
  /** Linie („RE 3“, „Bus 245“); fehlt beim Fernverkehr */
  anzeige?: string;
  soll: string; // ISO
  ist?: string; // ISO, wenn bei der Anmeldung schon abweichend
  gleis: string;
  richtung: string; // Ziel (Anschluss) bzw. Herkunft (Ankunft)
}

export type WachOrt =
  | { pfad: 'bahnhof'; eva: string }
  | { pfad: 'haltestelle'; an: { id: string; lat: number; lon: number }; ab: { id: string; lat: number; lon: number } };

export interface ReiseAnmeldung {
  ort: WachOrt;
  bahnhofName: string;
  haltWort: 'Gleis' | 'Steig';
  an?: ZugDerReise;
  ab: ZugDerReise;
  gehzeitSek: number;
}

type Seite = 'an' | 'ab';
type Farbe = 'gruen' | 'gelb' | 'rot';

interface ZugStand {
  readonly zug: ZugDerReise;
  /** Zuletzt BEKANNTE Zeit (fuer Ampel, Erinnerung, Ende) */
  readonly aktuellMs: number;
  /** Zuletzt GESCHICKTE Zeit (fuer die Drosselung); anfangs die bei der Anmeldung bekannte */
  readonly geschicktMs: number;
  readonly gleis: string;
  readonly ausgefallen: boolean;
}

export interface WachZustand {
  readonly reise: ReiseAnmeldung;
  readonly an?: ZugStand;
  readonly ab: ZugStand;
  /**
   * Nach einem Gleiswechsel passt die gemeldete Gehzeit nicht mehr zum Weg.
   * Die Wache rechnet den Weg nicht neu (Konzept 6.1) und schweigt deshalb
   * zur Ampel, bis die App die Reise neu anmeldet.
   */
  readonly gehzeitVeraltet: boolean;
}

type Beurteilung = { zustand: WachZustand; mitteilungen: Mitteilung[] };

const MINUTE_MS = 60_000;

/**
 * Drosselung: Eine neue Zeit geht hinaus, wenn sie MINDESTENS 2 Min. von der
 * zuletzt geschickten abweicht (Julian, 23.11.2026: "ab 2 Minuten"). Das
 * Beispiel im Konzept (3 → 4 → 5 → 8 = zwei Mitteilungen) passte nicht zu
 * dieser Regel; es gilt die Regel: 3, 5 und 8 gehen hinaus.
 */
const DROSSEL_MS = 2 * MINUTE_MS;
const ERINNERUNG_VOR_MS = 5 * MINUTE_MS;
/** Weniger Vorlauf lohnt keinen Zeitgeber: Die Erinnerung kaeme mit der Ankunft. */
const ERINNERUNG_MIN_VORLAUF_MS = 30_000;
const WACH_VORLAUF_MS = 90 * MINUTE_MS;
const KULANZ_NACH_ABFAHRT_MS = 2 * MINUTE_MS;
const HOECHSTDAUER_MS = 8 * 60 * MINUTE_MS;

function stand(zug: ZugDerReise): ZugStand {
  const aktuellMs = Date.parse(zug.ist ?? zug.soll);
  return { zug, aktuellMs, geschicktMs: aktuellMs, gleis: zug.gleis, ausgefallen: false };
}

export function neuerZustand(reise: ReiseAnmeldung): WachZustand {
  return {
    reise,
    ...(reise.an ? { an: stand(reise.an) } : {}),
    ab: stand(reise.ab),
    gehzeitVeraltet: false,
  };
}

function mitSeite(z: WachZustand, seite: Seite, s: ZugStand, aenderung: Partial<WachZustand> = {}): WachZustand {
  return { ...z, [seite]: s, ...aenderung };
}

/**
 * Ampel aus Ankunft, Abfahrt und Gehzeit - bewusst OHNE die Uhr (Konzept 6.1):
 * Der Server weiss nicht, ob der Reisende schon zum Gleis unterwegs ist; ein
 * Rot nur wegen der ablaufenden Zeit waere oft falsch. `null` = keine
 * Aussage: ohne Ankunftszug kein Umstieg, nach einem Gleiswechsel veraltete
 * Gehzeit, nach einem Ausfall kein Anschluss mehr.
 */
function farbe(z: WachZustand): Farbe | null {
  if (!z.an || z.gehzeitVeraltet || z.an.ausgefallen || z.ab.ausgefallen) return null;
  return ampel((z.ab.aktuellMs - z.an.aktuellMs) / 1000, z.reise.gehzeitSek);
}

function status(z: WachZustand): Status {
  if (z.an?.ausgefallen || z.ab.ausgefallen) return 'faellt-aus';
  return farbe(z) === 'rot' ? 'knapp' : 'erreichbar';
}

/** Minuten bis zur Abfahrt, gezaehlt ab der Ankunft bzw. ab jetzt, wenn die vorbei ist; aufgerundet. */
function restMin(z: WachZustand, jetztMs: number): number {
  const startMs = Math.max(jetztMs, z.an?.aktuellMs ?? jetztMs);
  return Math.max(0, Math.ceil((z.ab.aktuellMs - startMs) / MINUTE_MS));
}

function uhr(ms: number): string {
  return berlinUhrzeit(new Date(ms).toISOString());
}

function textZug(s: ZugStand): TextZug {
  return {
    anzeige: s.zug.anzeige ?? s.zug.name,
    uhr: uhr(s.aktuellMs),
    gleis: s.gleis,
    richtung: s.zug.richtung,
  };
}

/** Baut die Mitteilung samt `daten` fuer die aufgeklappte Ansicht (Konzept 4a). */
function mitteilung(
  z: WachZustand,
  art: MitteilungsArt,
  seite: Seite,
  text: { titel: string; text: string },
  jetztMs: number,
  ereignis: { alt?: string; neu?: string; gleisAlt?: string; gleisNeu?: string } = {},
): Mitteilung {
  const zug = z[seite]!.zug;
  const st = status(z);
  return {
    art,
    ...text,
    buendel: `${art}|${zug.name}`,
    daten: mitteilungsDaten({
      art,
      zug: zug.name,
      anzeige: zug.anzeige ?? zug.name,
      seite,
      ...ereignis,
      restMin: restMin(z, jetztMs),
      gehMin: Math.ceil(z.reise.gehzeitSek / 60),
      status: st,
      stand: uhr(jetztMs),
      ...(st === 'faellt-aus' ? { aktion: 'verbindung' as const } : { aktion: 'weg' as const, aktionGleis: z.ab.gleis }),
    }),
  };
}

function rot(z: WachZustand, jetztMs: number, ereignis: { alt?: string; neu?: string } = {}): Mitteilung {
  return mitteilung(
    z,
    'rot',
    'ab',
    textRot(textZug(z.ab), restMin(z, jetztMs), z.reise.haltWort),
    jetztMs,
    ereignis,
  );
}

function verspaetung(z: WachZustand, e: LiveEreignis, seite: Seite, jetztMs: number): Beurteilung {
  const s = z[seite];
  if (!s || !e.neu) return { zustand: z, mitteilungen: [] };
  // Die Tafel nennt nur "HH:MM": an die Sollzeit DIESER Seite gelegt, damit
  // 00:05 nach einer Ankunft um 23:52 auf den Folgetag faellt.
  const neuMs = berlinZeitpunktNahe(e.neu, new Date(s.zug.soll)).getTime();
  if (neuMs === s.aktuellMs) return { zustand: z, mitteilungen: [] };

  const vorher = farbe(z);
  const bekannt = mitSeite(z, seite, { ...s, aktuellMs: neuMs });
  const nachher = farbe(bekannt);
  // "statt" nennt die Sollzeit: Die steht im Ticket, und eine spaetere
  // Mitteilung ersetzt die fruehere (gleiches Buendel) - "statt 16:26" stuende
  // dann ohne Bezug da.
  const zeiten = { alt: uhr(Date.parse(s.zug.soll)), neu: uhr(neuMs) };
  const geschickt = mitSeite(z, seite, { ...s, aktuellMs: neuMs, geschicktMs: neuMs });

  // Kippt die Ampel auf Rot, sagt die Rot-Mitteilung alles: eine statt zwei.
  if (nachher === 'rot' && vorher !== 'rot' && vorher !== null) {
    return { zustand: geschickt, mitteilungen: [rot(geschickt, jetztMs, zeiten)] };
  }
  if (Math.abs(neuMs - s.geschicktMs) < DROSSEL_MS && vorher === nachher) {
    return { zustand: bekannt, mitteilungen: [] };
  }
  const text =
    seite === 'an'
      ? textZeitAn(
          textZug(s),
          zeiten.alt,
          zeiten.neu,
          Math.max(0, Math.round((geschickt.ab.aktuellMs - neuMs) / MINUTE_MS)),
        )
      : textZeitAb(textZug(s), zeiten.alt, zeiten.neu, nachher === 'rot');
  return {
    zustand: geschickt,
    mitteilungen: [mitteilung(geschickt, seite === 'an' ? 'zeit-an' : 'zeit-ab', seite, text, jetztMs, zeiten)],
  };
}

function gleiswechsel(z: WachZustand, e: LiveEreignis, seite: Seite, jetztMs: number): Beurteilung {
  const s = z[seite];
  if (!s || !e.neu) return { zustand: z, mitteilungen: [] };
  const alt = e.alt ?? s.gleis;
  const neu = mitSeite(z, seite, { ...s, gleis: e.neu }, { gehzeitVeraltet: true });
  const text = textGleis(textZug(neu[seite]!), seite, z.reise.haltWort, alt, e.neu);
  const art = seite === 'an' ? 'gleis-an' : 'gleis-ab';
  const daten = { alt, neu: e.neu, gleisAlt: alt, gleisNeu: e.neu };
  return { zustand: neu, mitteilungen: [mitteilung(neu, art, seite, text, jetztMs, daten)] };
}

function ausfall(z: WachZustand, seite: Seite, jetztMs: number): Beurteilung {
  const s = z[seite];
  if (!s || s.ausgefallen) return { zustand: z, mitteilungen: [] };
  const neu = mitSeite(z, seite, { ...s, ausgefallen: true });
  const art = seite === 'an' ? 'ausfall-an' : 'ausfall-ab';
  return { zustand: neu, mitteilungen: [mitteilung(neu, art, seite, textAusfall(textZug(s)), jetztMs)] };
}

/**
 * Ein Live-Ereignis fuer die Seite `seite` (aus `seiteVon`). Regeln (Konzept 4):
 * - Verspaetung: gedrosselt (siehe DROSSEL_MS) ausser bei Farbwechsel; kippt
 *   sie die Ampel von Gruen/Gelb auf Rot, geht NUR die Rot-Mitteilung hinaus.
 * - Gleiswechsel: immer; danach gilt die Gehzeit als veraltet, kein Rot mehr.
 * - Ausfall: immer, einmal je Seite.
 * - Heartbeat und Quellenwechsel: nichts, Zustand unveraendert.
 */
export function beurteile(z: WachZustand, e: LiveEreignis, seite: Seite, jetzt: Date): Beurteilung {
  const jetztMs = jetzt.getTime();
  switch (e.typ) {
    case 'verspaetung':
      return verspaetung(z, e, seite, jetztMs);
    case 'gleiswechsel':
      return gleiswechsel(z, e, seite, jetztMs);
    case 'ausfall':
      return ausfall(z, seite, jetztMs);
    default:
      return { zustand: z, mitteilungen: [] };
  }
}

/**
 * Erinnerung 5 Min. vor der aktuellen Ankunft. Nach jeder Aenderung des
 * Zustands neu abfragen (auch nach Gleiswechsel oder neuer Abfahrt: der Text
 * nennt Gleis und Uhrzeit des Anschlusses). Die Mitteilung ist auf `am`
 * berechnet - "Stand" ist der Zeitpunkt, zu dem sie hinausgeht.
 * `null`: kein Ankunftszug, ein Zug faellt aus, oder es bleiben weniger als
 * 30 s bis `am`.
 */
export function erinnerung(z: WachZustand, jetzt: Date): { am: Date; mitteilung: Mitteilung } | null {
  if (!z.an || z.an.ausgefallen || z.ab.ausgefallen) return null;
  const amMs = z.an.aktuellMs - ERINNERUNG_VOR_MS;
  if (amMs < jetzt.getTime() + ERINNERUNG_MIN_VORLAUF_MS) return null;
  const text = textErinnerung(z.reise.bahnhofName, textZug(z.ab), z.reise.haltWort);
  return { am: new Date(amMs), mitteilung: mitteilung(z, 'erinnerung', 'ab', text, amMs) };
}

/**
 * Zu welcher Seite gehoert ein Ereignis? `null` fuer fremde Zuege und
 * Ereignisse ohne Zug (Heartbeat, Quellenwechsel).
 *
 * Haltestellenpfad: `quelle` ist die Tafel, aus der das Ereignis kam ('arr'
 * nur Ankuenfte, 'dep' nur Abfahrten); der Name muss trotzdem passen.
 *
 * Bahnhofspfad: nach dem Zugnamen. Heissen Ankunft und Anschluss gleich
 * (durchgebundener Zug), traegt das Ereignis keine Sollzeit - nur `alt`:
 * - Verspaetung: die Seite, deren aktuelle Zeit (oder Sollzeit) `alt` am
 *   naechsten liegt;
 * - Gleiswechsel: die Seite, deren Gleis `alt` ist, sonst der Anschluss;
 * - sonst der Anschluss.
 */
export function seiteVon(z: WachZustand, e: LiveEreignis, quelle?: 'arr' | 'dep'): Seite | null {
  if (!e.zug) return null;
  const passt = (s: ZugStand | undefined): boolean => s?.zug.name === e.zug;
  if (quelle) {
    const seite: Seite = quelle === 'arr' ? 'an' : 'ab';
    return passt(z[seite]) ? seite : null;
  }
  const an = passt(z.an);
  const ab = passt(z.ab);
  if (!an || !ab) return an ? 'an' : ab ? 'ab' : null;

  if (e.typ === 'verspaetung' && e.alt) {
    const abstand = (s: ZugStand): number => {
      const altMs = berlinZeitpunktNahe(e.alt!, new Date(s.aktuellMs)).getTime();
      return Math.min(Math.abs(altMs - s.aktuellMs), Math.abs(altMs - Date.parse(s.zug.soll)));
    };
    return abstand(z.an!) < abstand(z.ab) ? 'an' : 'ab';
  }
  if (e.typ === 'gleiswechsel' && e.alt === z.an!.gleis && e.alt !== z.ab.gleis) return 'an';
  return 'ab';
}

/** Ab wann die Wache die Tafel abfragt: 90 Min. vor der Ankunft (ohne Ankunftszug: vor der Abfahrt). */
export function wachAb(z: WachZustand): Date {
  return new Date((z.an ?? z.ab).aktuellMs - WACH_VORLAUF_MS);
}

/** Ende: aktuelle Abfahrt + 2 Min. Kulanz, spaetestens 8 h nach der Anmeldung. */
export function endeAm(z: WachZustand, angemeldet: Date): Date {
  return new Date(Math.min(z.ab.aktuellMs + KULANZ_NACH_ABFAHRT_MS, angemeldet.getTime() + HOECHSTDAUER_MS));
}
