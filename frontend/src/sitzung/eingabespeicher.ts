import type { BahnhofTreffer, Gehprofil, HaltestellenTafelEintrag, Ort, TafelEintrag } from '../api/typen';
import { ortAusBahnhof } from '../ort/ortmodell';

/**
 * Die Eingabe eines Umstiegs, so wie sie im Formular steht.
 *
 * Bewusst NICHT `EingabeWerte`: Das ist der Absende-Datensatz, und aus ihm
 * liesse sich das Formular nicht verlustfrei zurueckbauen. Der gewaehlte
 * Bahnhof ist dort auf Name und EVA eingedampft, die beiden Tafel-Eintraege
 * auf Zugname und Zeit. Wer damit die Maske fuellte, verloere bei jedem
 * Neuladen die getroffene Zugauswahl.
 *
 * Fluechtiges steht hier nicht: Vorschlagsliste, Netz- und Zugangsfehler
 * gehoeren zum Abruf, nicht zur Eingabe. Sie stellen sich von selbst wieder
 * her.
 */
export interface EingabeEntwurf {
  suchtext: string;
  /** Ankunftsort: Bahnhof oder Haltestelle (Fassung 1: nur Bahnhof). */
  gewaehlt: Ort | null;
  /** Zweites Ortsfeld (E3): wohin der Anschluss fährt ab. Leer = derselbe Ort. */
  anschlussText: string;
  anschlussOrt: Ort | null;
  evaManuell: string;
  gleisAn: string;
  gleisAb: string;
  /** Wagen im ANKUNFTSzug - bestimmt den Startpunkt auf dem Bahnsteig. */
  wagenAn: string;
  /** Wagen im ANSCHLUSSzug - fuer die Wagenreihung am Zielgleis. */
  wagenAb: string;
  profil: Gehprofil;
  zugAnkunft: TafelEintrag | null;
  zugAbfahrt: TafelEintrag | null;
  /** Haltestellenpfad: die gewählten Fahrten aus den Haltestellentafeln. */
  fahrtAnkunft: HaltestellenTafelEintrag | null;
  fahrtAbfahrt: HaltestellenTafelEintrag | null;
}

export const SCHLUESSEL = 'umstieg.eingabe';

/**
 * Hochzaehlen, sobald sich die Felder von `EingabeEntwurf` aendern.
 *
 * Ein Eintrag aus einer aelteren Fassung ist nicht halb brauchbar, sondern
 * unbrauchbar: Er traegt Felder, die es nicht mehr gibt, und ihm fehlen
 * welche, die die Maske erwartet. Ausnahme ist, was `lies()` ausdruecklich
 * umwandelt: Fassung 1 (nur Bahnhoefe) wird zu einem Bahnhofsentwurf der
 * Fassung 2 (Umstieg 2.0).
 */
const FASSUNG = 2;

interface Ablage {
  fassung: number;
  entwurf: EingabeEntwurf;
}

/**
 * `sessionStorage` ist nicht garantiert.
 *
 * In Safaris privatem Modus und bei blockierten Site-Daten wirft schon der
 * Zugriff auf die Eigenschaft - nicht erst `setItem`. Deshalb liegt der
 * Zugriff selbst im try, nicht nur die Operation darauf. Fehlt der Speicher,
 * heisst das "kein Gedaechtnis"; die App laeuft ohne weiter.
 */
function speicher(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function istZeichenkette(wert: unknown): wert is string {
  return typeof wert === 'string';
}

/**
 * Prueft die Form, nicht den Inhalt.
 *
 * Was im Speicher steht, hat die App nicht in der Hand - ein fremder Eintrag
 * unter demselben Schluessel, halb geschriebenes JSON, ein Rest aus einer
 * frueheren Fassung. Ungeprueft uebernommen landete `undefined` in einem
 * Feld, das die Maske als `value` weiterreicht: React macht daraus ein
 * unkontrolliertes Eingabefeld und meldet sich erst viel spaeter, an einer
 * Stelle, die mit der Ursache nichts zu tun hat.
 */
function istEntwurf(wert: unknown): wert is EingabeEntwurf {
  if (!istEntwurfFassung1(wert)) return false;
  const e = wert as Record<string, unknown>;
  return (
    istZeichenkette(e.anschlussText) &&
    istObjektOderNull(e.gewaehlt) &&
    istObjektOderNull(e.anschlussOrt) &&
    istObjektOderNull(e.fahrtAnkunft) &&
    istObjektOderNull(e.fahrtAbfahrt)
  );
}

function istObjektOderNull(wert: unknown): boolean {
  return wert === null || typeof wert === 'object';
}

/** Fassung 1 (bis 16.10.2026): nur Bahnhöfe, `gewaehlt` als BahnhofTreffer. */
type EntwurfFassung1 = Omit<EingabeEntwurf, 'gewaehlt' | 'anschlussText' | 'anschlussOrt' | 'fahrtAnkunft' | 'fahrtAbfahrt'> & {
  gewaehlt: BahnhofTreffer | null;
};

function istEntwurfFassung1(wert: unknown): wert is EntwurfFassung1 {
  if (typeof wert !== 'object' || wert === null) return false;
  const e = wert as Record<string, unknown>;
  return (
    istZeichenkette(e.suchtext) &&
    istZeichenkette(e.evaManuell) &&
    istZeichenkette(e.gleisAn) &&
    istZeichenkette(e.gleisAb) &&
    istZeichenkette(e.wagenAn) &&
    istZeichenkette(e.wagenAb) &&
    (e.profil === 'zuegig' || e.profil === 'normal' || e.profil === 'langsam') &&
    (e.gewaehlt === null || typeof e.gewaehlt === 'object') &&
    (e.zugAnkunft === null || typeof e.zugAnkunft === 'object') &&
    (e.zugAbfahrt === null || typeof e.zugAbfahrt === 'object')
  );
}

/** Der zuletzt abgesendete Entwurf, oder `null`, wenn keiner brauchbar ist. */
export function lies(): EingabeEntwurf | null {
  const s = speicher();
  if (!s) return null;
  try {
    const roh = s.getItem(SCHLUESSEL);
    if (!roh) return null;
    const abgelegt = JSON.parse(roh) as unknown;
    if (typeof abgelegt !== 'object' || abgelegt === null) return null;
    const { fassung, entwurf } = abgelegt as { fassung?: unknown; entwurf?: unknown };
    // Fassung 1 war ein reiner Bahnhofsentwurf - er bleibt einer.
    if (fassung === 1) return istEntwurfFassung1(entwurf) ? wandle1(entwurf) : null;
    if (fassung !== FASSUNG || !istEntwurf(entwurf)) return null;
    return entwurf;
  } catch {
    // Beschaedigter Eintrag: verwerfen und weitermachen. Ein leeres Formular
    // ist unangenehm, ein Absturz beim Start waere schlimmer.
    return null;
  }
}

function wandle1(alt: EntwurfFassung1): EingabeEntwurf {
  return {
    ...alt,
    gewaehlt: alt.gewaehlt ? ortAusBahnhof(alt.gewaehlt) : null,
    anschlussText: '',
    anschlussOrt: null,
    fahrtAnkunft: null,
    fahrtAbfahrt: null,
  };
}

export function schreibe(entwurf: EingabeEntwurf): void {
  const s = speicher();
  if (!s) return;
  try {
    s.setItem(SCHLUESSEL, JSON.stringify({ fassung: FASSUNG, entwurf } satisfies Ablage));
  } catch {
    // Voller oder gesperrter Speicher. Die Eingabe geht dadurch nicht
    // verloren - sie ueberlebt nur kein Neuladen.
  }
}

export function leere(): void {
  const s = speicher();
  if (!s) return;
  try {
    s.removeItem(SCHLUESSEL);
  } catch {
    // nichts zu tun
  }
}
