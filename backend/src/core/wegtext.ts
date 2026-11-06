import {
  abbiegenAnGrenze,
  abbiegungen,
  ausgangAmWeg,
  ladenAmWeg,
  richtungAmBahnsteig,
  seiteNachWechsel,
  zaehleAufgaenge,
} from './bezugspunkte.js';
import { baueEtappen, type Etappe } from './etappen.js';
import { verteileGehzeit } from './gehzeit.js';
import {
  anlageName,
  BAUSTEINE,
  fuelle,
  grobeMeter,
  grossAnfang,
  ordnungswort,
  wegNachLage,
  wegNachName,
  wohinNachLage,
  zurAnlage,
} from './satzbausteine.js';
import { rund10, segmentiere, type Segment, type TextOptionen } from './segmente.js';
import type { BahnhofSchema, KantenTyp, RoutenPfad, Schritt } from './typen.js';

/**
 * Textstil `bezug` (Konzept 09): Der Weg wird beschrieben, wie ein
 * Ortskundiger ihn erklaert - an Treppen, Unterfuehrungen, Aufgaengen und
 * Gangnamen statt an Metern und Winkeln.
 *
 * Aufbau: Segmente (`segmente.ts`) → Etappen (`etappen.ts`) → Schritte, je
 * Schritt ein Satz aus den Bausteinen (`satzbausteine.ts`) mit den
 * Bezugspunkten aus `bezugspunkte.ts`; dazu die Kurzfassung.
 *
 * Unveraendert bleiben (Konzept 09, 3): `typ`, `level`, `knotenVon`,
 * `knotenBis`, `sekunden`, `distanzM` je Schritt; jede besuchte Ebene behaelt
 * einen Schritt, der auf ihr endet; die Summe der Sekunden ist die Gehzeit;
 * der Stopp bleibt ein eigener Schritt.
 */

export interface WegText {
  schritte: Schritt[];
  /** Der ganze Weg in einem Satz - nur im Stil `bezug`. */
  kurzfassung?: string;
}

/**
 * Wie die Enden der Bahnsteige heissen - dieselben Woerter, die Schema und
 * Standortknoepfe zeigen (`standortNamen` im Frontend): am Ankunftsbahnsteig
 * nach der Zugspitze („Zuganfang“/„Zugende“), sonst nach der Himmelsrichtung
 * („Nordende“). Ohne gemessene Achse kein Eintrag.
 */
export function bahnsteigEndenAusSchema(
  schema: BahnhofSchema | undefined,
): Map<string, { anfang: string; ende: string }> {
  const namen = new Map<string, { anfang: string; ende: string }>();
  const richtung = { N: 'Nordende', O: 'Ostende', S: 'Südende', W: 'Westende' } as const;
  for (const ebene of schema?.ebenen ?? []) {
    for (const b of ebene.bahnsteige) {
      if (namen.has(b.bahnsteigId)) continue;
      if (b.zugspitze) {
        namen.set(b.bahnsteigId, {
          anfang: b.zugspitze === 'anfang' ? 'Zuganfang' : 'Zugende',
          ende: b.zugspitze === 'ende' ? 'Zuganfang' : 'Zugende',
        });
      } else if (b.himmelsrichtung) {
        namen.set(b.bahnsteigId, { anfang: richtung[b.himmelsrichtung.von], ende: richtung[b.himmelsrichtung.bis] });
      }
    }
  }
  return namen;
}

/** Ein Schritt im Stil `bezug`: eine oder mehrere Etappen. */
interface Gruppe {
  etappen: number[];
}

/** Ab dieser Laenge bleibt das letzte Stueck am Zielbahnsteig ein eigener Schritt. */
const ZIELSTUECK_EIGEN_M = 50;
/** Bahnsteigstuecke nennt die Kurzfassung erst ab dieser Laenge (Konzept 09, 6.3). */
const KURZ_BAHNSTEIG_M = 100;
/** Hoechstens so viele Woerter hat die Kurzfassung (Konzept 09, 6.3). */
export const KURZ_WOERTER_MAX = 20;
/** Ab dieser Laenge nennt der erste Schritt ohne Richtung am Bahnsteig grobe Meter. */
const MIT_METER_M = 30;
/** Unter dieser Laenge braucht ein Gang vor dem Aufgang keinen eigenen Satzteil. */
const WEG_OHNE_SATZ_M = 30;

/** Ebenenlaeufe einer Folge von Ebenen - so ordnet das Frontend die Schritte den Baendern zu. */
function laeufe(ebenen: number[]): number[] {
  const ergebnis: number[] = [];
  for (const e of ebenen) if (ergebnis[ergebnis.length - 1] !== e) ergebnis.push(e);
  return ergebnis;
}

function gleicheLaeufe(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** „Rolltreppe hoch in die Halle“ → „Rolltreppe hoch“: Anlage und Richtung. */
function kernVon(text: string): string {
  return text.split(' ').slice(0, 2).join(' ');
}

/**
 * Eine geratene Naht: Der Graph verbindet zwei Ebenen am selben OSM-Punkt
 * (`zieheNaehte`, `zieheTreppenenden`) mit einer Rampe ohne Laenge. Dort steht
 * keine Rampe - der Weg geht nur weiter, eine Ebene hoeher oder tiefer.
 */
function istNaht(e: Etappe): boolean {
  return e.typ === 'rampe' && e.laengeM < 2;
}

/** „die Treppe“, „den Aufzug“ - fuer den ersten Schritt. */
function artikelVon(typ: KantenTyp): string {
  return typ === 'aufzug' ? 'mit dem' : 'die';
}

function kleinAnfang(text: string): string {
  return text.charAt(0).toLocaleLowerCase('de') + text.slice(1);
}

/**
 * Etappen zu Schritten (Konzept 09, 3 und 6.4).
 *
 * - Der erste Schritt bleibt allein: Er traegt die Ankunftsebene.
 * - Ein Weg und der Aufgang an seinem Ende sind ein Schritt („Zweiter Aufgang
 *   rechts, Treppe hoch zu Gleis 3“) - die Ebene des Wegs hat der Schritt
 *   davor schon besucht.
 * - Ein kurzes letztes Stueck nach dem Aufgang gehoert zum Aufgang.
 * - Nie ueber den Stopp hinweg.
 */
function gruppiere(etappen: Etappe[], stoppVor: number | undefined, zusammenfassen: boolean): Gruppe[] {
  const gruppen: Gruppe[] = [];
  for (let i = 0; i < etappen.length; i++) {
    const e = etappen[i];
    const letzte = gruppen[gruppen.length - 1];
    const ueberStopp = stoppVor !== undefined && i === stoppVor;
    if (zusammenfassen && letzte && !ueberStopp) {
      const davor = etappen[letzte.etappen[letzte.etappen.length - 1]];
      // Weg + Aufgang
      if (
        e.art === 'wechsel' &&
        gruppen.length >= 2 &&
        letzte.etappen.length === 1 &&
        davor.typ === 'eben' &&
        davor.level === e.vonLevel
      ) {
        letzte.etappen.push(i);
        continue;
      }
      // Aufgang + kurzes Stueck bis zum Ziel
      if (
        e.typ === 'eben' &&
        i === etappen.length - 1 &&
        davor.art === 'wechsel' &&
        davor.level === e.level &&
        e.laengeM < ZIELSTUECK_EIGEN_M
      ) {
        letzte.etappen.push(i);
        continue;
      }
    }
    gruppen.push({ etappen: [i] });
  }
  return gruppen;
}

/**
 * Schritte und Kurzfassung im Stil `bezug`, oder `null`, wenn die Invariante
 * des Schemas nicht zu halten ist - dann nimmt der Aufrufer den klassischen
 * Text.
 */
export function bezugText(pfad: RoutenPfad, optionen: TextOptionen): WegText | null {
  const { segmente, vorStopp } = segmentiere(pfad, optionen);
  if (segmente.length === 0) return null;
  const zeiten = optionen.profil ? verteileGehzeit(segmente, optionen.profil) : null;
  const etappen = baueEtappen(pfad, segmente, pfad.stopp ? [vorStopp] : []);
  let stoppIndex: number | undefined;
  if (pfad.stopp) {
    const i = etappen.findIndex((e) => e.segmente[0] >= vorStopp);
    stoppIndex = i === -1 ? etappen.length : i;
  }

  // Die Invariante des Schemas: dieselben Ebenenlaeufe wie die Segmente.
  // Geht das Zusammenfassen schief, bleibt je Etappe ein Schritt - und geht
  // auch das schief, der klassische Text.
  const sollLaeufe = laeufe(segmente.map((s) => s.zielLevel));
  const istLaeufe = (g: Gruppe[]) => laeufe(g.map((x) => etappen[x.etappen[x.etappen.length - 1]].level));
  let gruppen = gruppiere(etappen, stoppIndex, true);
  if (!gleicheLaeufe(istLaeufe(gruppen), sollLaeufe)) gruppen = gruppiere(etappen, stoppIndex, false);
  if (!gleicheLaeufe(istLaeufe(gruppen), sollLaeufe)) return null;

  const kontext = new Satzkontext(pfad, optionen, segmente, etappen, gruppen);
  const schritte: Schritt[] = [];
  const kurzTeile: KurzTeil[] = [];

  const fuegeStoppEin = (): void => {
    const stopp = pfad.stopp!;
    const poi = pfad.knoten[stopp.knotenIndex];
    const was = stopp.art === 'wc' ? 'WC' : 'Kiosk';
    schritte.push({
      text: fuelle(BAUSTEINE.stopp.text, { was }),
      typ: 'stopp',
      sekunden: stopp.sekunden,
      level: poi.level,
      knotenVon: stopp.knotenIndex,
      knotenBis: stopp.knotenIndex,
    });
    kurzTeile.push({ text: fuelle(BAUSTEINE.stopp.kurz, { was }), wichtig: true });
  };

  for (const [gi, gruppe] of gruppen.entries()) {
    if (stoppIndex === gruppe.etappen[0]) fuegeStoppEin();
    const satz = kontext.satz(gi);
    const teile = gruppe.etappen.map((i) => etappen[i]);
    const erste = teile[0];
    const letzte = teile[teile.length - 1];
    const segIdx = teile.flatMap((e) => e.segmente);
    const laengeM = teile.reduce((summe, e) => summe + e.laengeM, 0);
    const ebenM = teile.filter((e) => e.typ === 'eben').reduce((summe, e) => summe + e.laengeM, 0);
    const wechsel = teile.find((e) => e.art === 'wechsel');
    const typ: KantenTyp = wechsel ? wechsel.typ : 'eben';
    const mitMeter = ebenM >= 10 || (typ === 'rampe' && laengeM >= 10);
    schritte.push({
      text: satz.text,
      typ,
      ...(mitMeter ? { distanzM: rund10(laengeM) } : {}),
      ...(zeiten ? { sekunden: segIdx.reduce((summe, i) => summe + zeiten[i], 0) } : {}),
      level: letzte.level,
      knotenVon: erste.knotenVon,
      knotenBis: letzte.knotenBis,
    });
    kurzTeile.push(...satz.kurz);
  }
  if (stoppIndex !== undefined && stoppIndex >= etappen.length) fuegeStoppEin();

  const kurzfassung = kontext.kurzfassung(kurzTeile);
  return { schritte, ...(kurzfassung ? { kurzfassung } : {}) };
}

interface KurzTeil {
  text: string;
  /** Ebenenwechsel, Stopp und Ziel - die bleiben, wenn die Kurzfassung zu lang wird. */
  wichtig: boolean;
  /** Ein Wechsel direkt nach einem Wechsel, ohne Weg dazwischen - dieselbe Fahrt geht weiter. */
  fortsetzung?: boolean;
}

interface Satz {
  text: string;
  kurz: KurzTeil[];
}

/** Baut die Saetze eines Wegs - alles, was ein Satz ueber seine Nachbarn wissen muss. */
class Satzkontext {
  private readonly ziel: string | undefined;
  private readonly zielKurz: string | undefined;
  private readonly ungefaehr: boolean;

  constructor(
    private readonly pfad: RoutenPfad,
    private readonly optionen: TextOptionen,
    private readonly segmente: Segment[],
    private readonly etappen: Etappe[],
    private readonly gruppen: Gruppe[],
  ) {
    const letzter = pfad.knoten[pfad.knoten.length - 1];
    this.ziel = optionen.zielZusatz ?? (letzter?.gleis ? `zu Gleis ${letzter.gleis}` : undefined);
    this.zielKurz = letzter?.gleis && !optionen.zielZusatz ? `Gleis ${letzter.gleis}` : this.ziel;
    this.ungefaehr = optionen.ungefaehr ?? false;
  }

  private get graph() {
    return this.optionen.graph;
  }

  private istLetzteGruppe(gi: number): boolean {
    return gi === this.gruppen.length - 1;
  }

  /** Die Etappe vor der Gruppe `gi`. */
  private etappeVor(gi: number): Etappe | undefined {
    return this.etappen[this.gruppen[gi].etappen[0] - 1];
  }

  /** Die Etappe nach der Gruppe `gi`, ueber den Stopp hinweg. */
  private etappeNach(gi: number): Etappe | undefined {
    const g = this.gruppen[gi];
    return this.etappen[g.etappen[g.etappen.length - 1] + 1];
  }

  /** Der ganze Weg in einem Satz (Konzept 09, 6.3). */
  kurzfassung(teile: KurzTeil[]): string | undefined {
    const start = this.pfad.knoten[0];
    const ende = this.pfad.knoten[this.pfad.knoten.length - 1];
    const ohneWechsel = this.etappen.every((e) => e.art !== 'wechsel');
    if (
      ohneWechsel &&
      !this.ungefaehr &&
      start?.bahnsteigId !== undefined &&
      start.bahnsteigId === ende?.bahnsteigId &&
      this.zielKurz &&
      !this.pfad.stopp
    ) {
      return `${fuelle(BAUSTEINE.kurz.gegenueber, { ziel: this.zielKurz })}.`;
    }
    let liste: KurzTeil[] = [];
    for (const t of teile) {
      if (t.text.length === 0) continue;
      // „Rolltreppe hoch, Rolltreppe hoch“ ist in der Kurzfassung eine Fahrt.
      const vorher = liste[liste.length - 1];
      if (vorher && t.fortsetzung && vorher.text === kernVon(vorher.text) && kernVon(vorher.text) === kernVon(t.text)) {
        liste[liste.length - 1] = { text: t.text, wichtig: vorher.wichtig || t.wichtig };
        continue;
      }
      liste.push({ ...t });
    }
    // Das Ziel steht immer am Ende. Fehlt es, haengt es am letzten Ebenenwechsel
    // („Treppe hoch zu Gleis 4“) - das Stueck am Bahnsteig danach nennt die
    // Kurzfassung nicht.
    if (this.ziel && !liste.some((t) => t.text.includes(this.ziel!))) {
      const letzter = liste[liste.length - 1];
      if (letzter?.wichtig && !letzter.text.startsWith('Stopp')) {
        letzter.text = `${letzter.text.replace(/ auf den Bahnsteig$/, '')} ${this.ziel}`;
      } else liste.push({ text: this.ziel, wichtig: true });
    }
    // „Treppe hoch auf den Bahnsteig, dann zu Gleis 6“ → „Treppe hoch zu Gleis 6“
    const letzter = liste[liste.length - 1];
    const davor = liste[liste.length - 2];
    if (
      letzter &&
      davor &&
      letzter.text === this.ziel &&
      !davor.text.startsWith('Stopp') &&
      !davor.text.startsWith('am Bahnsteig')
    ) {
      davor.text = `${davor.text.replace(/ auf den Bahnsteig$/, '')} ${this.ziel}`;
      liste.pop();
    }
    if (liste.length === 0) return undefined;
    const woerter = (l: KurzTeil[]) =>
      l.reduce((n, t) => n + t.text.split(/\s+/).length, 0) + (l.length > 1 ? 1 : 0);
    if (woerter(liste) > KURZ_WOERTER_MAX) liste = liste.filter((t) => t.wichtig);
    if (woerter(liste) > KURZ_WOERTER_MAX && liste.length > 2) liste = [liste[0], liste[liste.length - 1]];
    // „…, …, dann …“ - das „dann“ vor dem letzten Glied.
    const text = liste.map((t, i) => (i > 0 && i === liste.length - 1 ? `dann ${t.text}` : t.text)).join(', ');
    return `${grossAnfang(text)}.`;
  }

  /** Der Satz fuer Gruppe `gi`. */
  satz(gi: number): Satz {
    const teile = this.gruppen[gi].etappen.map((i) => this.etappen[i]);
    const letzte = this.istLetzteGruppe(gi);
    if (gi === 0 && teile[0].typ === 'eben') return this.startSatz(gi, teile[0]);
    // Ein Aufgang allein, oder mit dem kurzen Stueck bis zum Ziel
    if (teile[0].art === 'wechsel') {
      const rest = teile[1];
      // Im Standardmodell ist auch dieses Stueck geschaetzt - es bekommt sein „ca.“.
      if (rest && this.ungefaehr && rest.laengeM >= 10) {
        const teil = this.wechselTeil(gi, teile[0], false);
        const meter = `ca. ${grobeMeter(rest.laengeM)} m`;
        return {
          text: fuelle(BAUSTEINE.aufgang.dannMeter, { wechsel: grossAnfang(teil.text), meter, ziel: this.ziel }),
          kurz: [{ text: teil.kurz, wichtig: true }],
        };
      }
      return this.wechselSatz(gi, teile[0], letzte);
    }
    const weg = teile[0];
    const auf = teile.find((e) => e.art === 'wechsel');
    if (!auf) return this.wegSatz(gi, weg, letzte);
    return this.aufgangSatz(gi, weg, auf, letzte);
  }

  /** „Treppe runter in die Unterführung, unten links“ */
  private wechselTeil(gi: number, w: Etappe, amZiel: boolean): { text: string; kurz: string } {
    const hochRunter = w.level > w.vonLevel ? 'hoch' : w.level < w.vonLevel ? 'runter' : '';
    const nach = this.etappeNach(gi);
    // „Unterführung“ nur, wenn die Lage es belegt und man auch hinabsteigt
    // (Konzept 09, 6.2). Sonst sagt „runter“ allein, wohin es geht.
    const wohin = amZiel
      ? this.ziel
      : nach && nach.ebeneBelegt && (nach.lage !== 'unterfuehrung' || w.level < w.vonLevel)
        ? wohinNachLage(nach.lage)
        : undefined;
    const seite = amZiel ? undefined : seiteNachWechsel(this.pfad, this.graph, this.segmente, w, nach);
    const danach = seite ? `, ${w.level < w.vonLevel ? 'unten' : 'oben'} ${seite}` : '';
    const vorlage = istNaht(w)
      ? BAUSTEINE.wechsel.naht
      : hochRunter === '' && w.typ === 'aufzug'
        ? BAUSTEINE.wechsel.aufzugOhneWechsel
        : BAUSTEINE.wechsel.standard;
    const obenUnten = w.level > w.vonLevel ? 'oben' : 'unten';
    const werte = { anlage: anlageName(w.typ), hochRunter, obenUnten, wohin: wohin ? ` ${wohin}` : '' };
    return {
      text: fuelle(vorlage, { ...werte, danach }),
      kurz: fuelle(vorlage, { ...werte, danach: '' }),
    };
  }

  private wechselSatz(gi: number, w: Etappe, amZiel: boolean): Satz {
    const teil = this.wechselTeil(gi, w, amZiel);
    const fortsetzung = this.etappeVor(gi)?.art === 'wechsel';
    const kurz = istNaht(w) ? [] : [{ text: teil.kurz, wichtig: true, fortsetzung }];
    // Beginnt der Weg gleich mit der Anlage: „Vom Zug aus die Treppe runter“.
    if (gi === 0) {
      const vorsatz = this.optionen.startVorsatz ?? 'Vom Zug aus';
      const artikel = istNaht(w) ? '' : `${artikelVon(w.typ)} `;
      return { text: `${vorsatz} ${artikel}${teil.text}`, kurz };
    }
    return { text: grossAnfang(teil.text), kurz };
  }

  /**
   * Der Weg durch einen Gang, in der Rangfolge aus Konzept 09, 5.2: Name,
   * dann Lage (mit Ausgang oder Laden, wenn die Lage selbst schwach ist), dann
   * Ausgang, Laden, zuletzt grobe Meter.
   */
  private wegPhrase(e: Etappe): { text: string; bezug: boolean; kurz?: string } {
    const name = e.name ? wegNachName(e.name) : undefined;
    if (name) return { text: name, bezug: true, kurz: kleinAnfang(name) };
    const bahnanlage = e.lage === 'unterfuehrung' || e.lage === 'ueberfuehrung';
    const starkeLage = bahnanlage && e.ebeneBelegt;
    const lage = starkeLage || (e.lage && !bahnanlage) ? wegNachLage(e.lage) : undefined;
    const ausgang = ausgangAmWeg(this.pfad, this.graph, e);
    const laden = ausgang ? undefined : ladenAmWeg(this.pfad, this.graph, e);
    const zusatz = ausgang ? `am Ausgang ${ausgang} vorbei` : laden ? `an ${laden} vorbei` : undefined;
    if (lage) {
      if (!starkeLage && zusatz) return { text: `${lage}, ${zusatz}`, bezug: true, kurz: zusatz };
      return { text: lage, bezug: true };
    }
    if (zusatz) return { text: grossAnfang(zusatz), bezug: true, kurz: zusatz };
    if (e.laengeM < 10) return { text: BAUSTEINE.durchgang.wenige, bezug: false };
    return {
      text: fuelle(BAUSTEINE.durchgang.meter, {
        ungefaehr: this.ungefaehr ? 'Ca.' : 'Etwa',
        meter: String(grobeMeter(e.laengeM)),
      }),
      bezug: false,
    };
  }

  /** Abbiegen an Abzweigen: „, links, dann rechts“ */
  private abbiegen(e: Etappe): string {
    const woerter = abbiegungen(this.pfad, this.graph, this.segmente, e);
    return woerter.length > 0 ? `, ${woerter.join(', dann ')}` : '';
  }

  /** Der erste Schritt: „Vom Zug aus Richtung Zugende bis zur Treppe“. */
  private startSatz(gi: number, e: Etappe): Satz {
    const vorsatz = this.optionen.startVorsatz ?? 'Vom Zug aus';
    const v = (vorlage: string) => vorlage.replace('Vom Zug aus', vorsatz);
    const nach = this.etappeNach(gi);
    const amBahnsteig = richtungAmBahnsteig(this.pfad, this.graph, e, this.optionen.bahnsteigEnden);
    const richtung = amBahnsteig?.wort;
    const kurz: KurzTeil[] =
      richtung && e.laengeM > KURZ_BAHNSTEIG_M ? [{ text: `am Bahnsteig ${richtung}`, wichtig: false }] : [];
    const zielText = this.ziel ? ` ${this.ziel}` : '';

    if (this.istLetzteGruppe(gi)) {
      const start = this.pfad.knoten[0];
      const ende = this.pfad.knoten[this.pfad.knoten.length - 1];
      // Im Standardmodell ist die Zuordnung zum Bahnsteig geraten (zwei Gleise
      // auf denselben Koordinaten) - dort nie „gegenüber“ (München Hbf 5 → 2).
      const gleicherBahnsteig =
        !this.ungefaehr && start?.bahnsteigId !== undefined && start.bahnsteigId === ende?.bahnsteigId;
      if (gleicherBahnsteig && !richtung) {
        return { text: fuelle(v(BAUSTEINE.start.gegenueber), { ziel: this.ziel }), kurz: [] };
      }
      if (richtung) {
        const abbiegen = this.abbiegen(e);
        // Kopfbahnhof: bis zum Ende dieses Bahnsteigs, dann auf einen anderen.
        const anderer = start?.bahnsteigId !== ende?.bahnsteigId;
        if (amBahnsteig?.amEnde && anderer) {
          const weiter = abbiegen || ', dann';
          return {
            text: `${fuelle(v(BAUSTEINE.start.richtungBisEnde), { richtung })}${weiter}${zielText}`,
            kurz: [{ text: `am Bahnsteig ${richtung} bis zum Ende${weiter}${zielText}`, wichtig: true }],
          };
        }
        return {
          text: `${fuelle(v(BAUSTEINE.start.richtungZiel), { richtung, ziel: '' })}${abbiegen}${zielText}`,
          kurz: [{ text: `am Bahnsteig ${richtung}${zielText}`, wichtig: true }],
        };
      }
      const weg = this.wegPhrase(e);
      const abbiegen = this.abbiegen(e);
      if (weg.bezug) {
        const satz = `${kleinAnfang(weg.text)}${abbiegen}${zielText}`;
        return { text: fuelle(v(BAUSTEINE.start.weg), { weg: satz }), kurz: [{ text: satz, wichtig: true }] };
      }
      // Ohne Bezugspunkt: grobe Meter (Konzept 09, 2: „Grob im Satz nur ohne Bezugspunkt“).
      const satz = `${kleinAnfang(weg.text)}${abbiegen}${zielText}`;
      return { text: `${vorsatz} ${satz}`, kurz: [{ text: satz, wichtig: true }] };
    }

    if (nach?.art === 'wechsel' && !istNaht(nach)) {
      const anlage = zurAnlage(nach.typ);
      if (richtung) return { text: fuelle(v(BAUSTEINE.start.richtungBis), { richtung, zurAnlage: anlage }), kurz };
      // Ohne Richtung am Bahnsteig grobe Meter (Konzept 09, 5.2, Stufe 6) - im
      // Standardmodell mit „ca.“, weil die Lage dort geschaetzt ist.
      if ((this.ungefaehr && e.laengeM >= 10) || e.laengeM >= MIT_METER_M) {
        const meter = `${this.ungefaehr ? 'ca.' : 'etwa'} ${grobeMeter(e.laengeM)} m`;
        return { text: `${fuelle(v(BAUSTEINE.start.meterBis), { meter, zurAnlage: anlage })}${this.abbiegen(e)}`, kurz };
      }
      return { text: `${fuelle(v(BAUSTEINE.start.bis), { zurAnlage: anlage })}${this.abbiegen(e)}`, kurz };
    }
    // Weiter auf derselben Ebene, aber ab hier kein Bahnsteig mehr.
    if (richtung) {
      return {
        text: amBahnsteig?.amEnde ? fuelle(v(BAUSTEINE.start.richtungBisEnde), { richtung }) : `${vorsatz} ${richtung}`,
        kurz,
      };
    }
    const weg = this.wegPhrase(e);
    return {
      text: `${vorsatz} ${kleinAnfang(weg.text)}${this.abbiegen(e)}`,
      kurz: weg.kurz ? [{ text: weg.kurz, wichtig: false }] : kurz,
    };
  }

  /** Ein ebener Schritt, der kein Startschritt ist und nicht vor einem Aufgang endet. */
  private wegSatz(gi: number, e: Etappe, letzte: boolean): Satz {
    const ziel = letzte && this.ziel ? ` ${this.ziel}` : '';
    if (e.art === 'bahnsteig') {
      const richtung = richtungAmBahnsteig(this.pfad, this.graph, e, this.optionen.bahnsteigEnden)?.wort;
      const vorher = this.etappeVor(gi);
      const seite = vorher ? abbiegenAnGrenze(this.pfad, this.graph, this.segmente, vorher, e) : undefined;
      const text = seite
        ? richtung
          ? fuelle(BAUSTEINE.bahnsteig.abbiegenRichtung, { Seite: grossAnfang(seite), richtung, ziel })
          : fuelle(BAUSTEINE.bahnsteig.abbiegen, { Seite: grossAnfang(seite), ziel })
        : richtung
          ? fuelle(BAUSTEINE.bahnsteig.richtung, { richtung, ziel })
          : fuelle(BAUSTEINE.bahnsteig.ohne, { ziel });
      const kurzZiel = seite ? `${seite} auf den Bahnsteig${ziel}` : this.ziel;
      return { text, kurz: letzte && kurzZiel ? [{ text: kurzZiel, wichtig: true }] : [] };
    }
    const weg = this.wegPhrase(e);
    const nach = this.etappeNach(gi);
    const bis = !letzte && nach?.art === 'wechsel' && !istNaht(nach) ? ` bis ${zurAnlage(nach.typ)}` : '';
    const text = `${weg.text}${this.abbiegen(e)}${bis}${ziel}`;
    const kurz: KurzTeil[] = [];
    if (weg.kurz) kurz.push({ text: `${weg.kurz}${ziel}`, wichtig: letzte });
    else if (letzte && this.ziel) {
      // Das letzte Stueck ist kein Bahnsteig: Die Kurzfassung nennt es, sonst
      // hiesse es „Treppe runter zu Steig A“ - und 300 m fehlten.
      const stueck = weg.bezug
        ? kleinAnfang(weg.text)
        : e.laengeM >= 10
          ? `${this.ungefaehr ? 'ca.' : 'etwa'} ${grobeMeter(e.laengeM)} m`
          : '';
      kurz.push({ text: `${stueck}${ziel}`.trim(), wichtig: true });
    }
    return { text, kurz };
  }

  /** Weg und Aufgang in einem Schritt: „Zweiter Aufgang rechts, Treppe hoch zu Gleis 3“. */
  private aufgangSatz(gi: number, weg: Etappe, auf: Etappe, amZiel: boolean): Satz {
    const wechsel = this.wechselTeil(gi, auf, amZiel);
    const abbiegen = this.abbiegen(weg);
    // Wer abbiegen muss, zaehlt nicht: Die Seite haengt dann am Abzweig.
    const zaehlung = abbiegen === '' ? zaehleAufgaenge(this.pfad, this.graph, weg, auf) : undefined;
    const ordnung = zaehlung?.ordnung !== undefined ? ordnungswort(zaehlung.ordnung) : undefined;
    if (zaehlung && ordnung && zaehlung.mitVorgaengern) {
      const hochRunter = auf.level > auf.vonLevel ? 'hoch' : 'runter';
      // „Treppe hoch zu Gleis 3“ → „hoch zu Gleis 3“ fuer die Kurzfassung
      const rest = wechsel.kurz.split(' ').slice(2).join(' ');
      return {
        text: fuelle(BAUSTEINE.aufgang.gezaehlt, { ordnung, seite: zaehlung.seite, wechsel: wechsel.text }),
        kurz: [{ text: `${ordnung.toLocaleLowerCase('de')} Aufgang ${zaehlung.seite} ${hochRunter} ${rest}`.trim(), wichtig: true }],
      };
    }
    const phrase = this.wegPhrase(weg);
    const kurz: KurzTeil[] = [];
    if (phrase.kurz) kurz.push({ text: phrase.kurz, wichtig: false });
    // Kam man ueber eine Naht in diesen Gang, hat noch kein Satz ihn genannt.
    else if (phrase.bezug && istNaht(this.etappeVor(gi) ?? weg)) kurz.push({ text: kleinAnfang(phrase.text), wichtig: false });
    if (!istNaht(auf)) kurz.push({ text: wechsel.kurz, wichtig: true });
    else if (amZiel && this.ziel) kurz.push({ text: this.ziel, wichtig: true });
    // „Rechts Treppe hoch“ nur, wenn der Weg dorthin kurz ist - sonst
    // verschluckte der Satz die Strecke davor.
    if (zaehlung && !zaehlung.mitVorgaengern && !phrase.bezug && weg.laengeM < 2 * WEG_OHNE_SATZ_M) {
      // Erster (oder einziger) Aufgang auf dieser Seite: „Rechts Treppe hoch zu Gleis 3“
      return { text: fuelle(BAUSTEINE.aufgang.seite, { Seite: grossAnfang(zaehlung.seite), wechsel: wechsel.text }), kurz };
    }
    if (!phrase.bezug && abbiegen === '' && weg.laengeM < WEG_OHNE_SATZ_M && !(this.ungefaehr && weg.laengeM >= 10)) {
      return { text: grossAnfang(wechsel.text), kurz };
    }
    return { text: fuelle(BAUSTEINE.aufgang.mitWeg, { weg: `${phrase.text}${abbiegen}`, wechsel: wechsel.text }), kurz };
  }
}
