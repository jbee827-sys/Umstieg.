import { verteileGehzeit } from './gehzeit.js';
import {
  segmentiere,
  richtungsWort,
  rund10,
  textStilAusUmgebung,
  winkelDelta,
  type TextOptionen,
} from './segmente.js';
import type { KantenTyp, RoutenPfad, Schritt } from './typen.js';
import { bezugText, type WegText } from './wegtext.js';

export { peilungGrad, type TextOptionen, type TextStil } from './segmente.js';
export { bahnsteigEndenAusSchema, type WegText } from './wegtext.js';

// Ebene −1 heißt durchgehend „Unterführung (-1)" (konsistente Benennung statt
// gemischter Plan-Beispiele), alle anderen Ebenen „Ebene n".
function ebenenName(level: number): string {
  return level === -1 ? 'Unterführung (-1)' : `Ebene ${level}`;
}

const TYP_NAME: Partial<Record<KantenTyp, string>> = {
  treppe: 'Treppe',
  rolltreppe: 'Rolltreppe',
  rampe: 'Rampe',
};

/** Der Text bis zum 06.11.2026: Meter und Winkel (`TEXT_STIL=klassisch`). */
export function generiereSchritteKlassisch(pfad: RoutenPfad, optionen: TextOptionen = {}): Schritt[] {
  const { segmente, vorStopp } = segmentiere(pfad, optionen);
  const zeiten = optionen.profil ? verteileGehzeit(segmente, optionen.profil) : null;
  const schritte: Schritt[] = [];
  const distanzPraefix = optionen.ungefaehr ? 'ca. ' : '';
  let referenzPeilung: number | null = null;

  // Der Stopp steht nach dem Schritt, der am POI endet (oder ganz vorn, wenn der
  // Weg dort beginnt). Er haengt an keinem Nachbarn, traegt die Ebene des POI
  // und beginnt damit keinen neuen Ebenenlauf (`besuchJeSchritt`).
  const fuegeStoppEin = (): void => {
    const stopp = pfad.stopp!;
    const poi = pfad.knoten[stopp.knotenIndex];
    schritte.push({
      text: `5 min Stopp: ${stopp.art === 'wc' ? 'WC' : 'Kiosk'}`,
      typ: 'stopp',
      sekunden: stopp.sekunden,
      level: poi.level,
      knotenVon: stopp.knotenIndex,
      knotenBis: stopp.knotenIndex,
    });
  };

  for (const [nr, segment] of segmente.entries()) {
    if (pfad.stopp && nr === vorStopp) fuegeStoppEin();
    let text: string;
    let distanzM: number | undefined;

    // Eine geneigte Linie auf EINER Ebene ist ein Weg, kein Ebenenwechsel. In OSM
    // traegt sie `incline`, und ohne diese Abzweigung hiess jede „hinunter zur
    // Ebene“, auf der sie schon lag: 340 m Steg in Stuttgart ohne Streckenangabe.
    const flacheRampe = segment.typ === 'rampe' && segment.deltaLevel === 0;
    if (segment.typ === 'eben' || flacheRampe) {
      const delta =
        referenzPeilung === null || segment.peilungStart === null
          ? 0
          : winkelDelta(referenzPeilung, segment.peilungStart);
      const richtung = richtungsWort(delta);
      const vorsatz = flacheRampe ? 'Rampe ' : '';
      if (segment.laengeM < 10) {
        text = `${vorsatz}wenige Meter ${richtung}`;
      } else {
        distanzM = rund10(segment.laengeM);
        text = `${vorsatz}${distanzPraefix}${distanzM} m ${richtung}`;
      }
    } else if (segment.typ === 'aufzug') {
      text = `Aufzug zur ${ebenenName(segment.zielLevel)}`;
    } else {
      const hochRunter = segment.deltaLevel > 0 ? 'hoch' : 'hinunter';
      text = `${TYP_NAME[segment.typ]} ${hochRunter} zur ${ebenenName(segment.zielLevel)}`;
      if (segment.typ === 'rampe' && segment.laengeM >= 10) {
        distanzM = rund10(segment.laengeM);
      }
    }

    referenzPeilung = segment.peilungEnde ?? referenzPeilung;
    schritte.push({
      text,
      typ: segment.typ,
      ...(distanzM !== undefined ? { distanzM } : {}),
      ...(zeiten ? { sekunden: zeiten[nr] } : {}),
      level: segment.zielLevel,
      knotenVon: segment.knotenVon,
      knotenBis: segment.knotenBis,
    });
  }

  if (pfad.stopp && vorStopp >= segmente.length) fuegeStoppEin();

  // Der Stopp ist kein Wegschritt: „Nach Ausstieg“ und das Ziel gehoeren an den
  // ersten und letzten Schritt des Wegs.
  const wege = schritte.filter((x) => x.typ !== 'stopp');
  if (wege.length > 0) {
    wege[0].text = `Nach Ausstieg ${wege[0].text}`;
    for (const x of wege.slice(1)) x.text = x.text.charAt(0).toUpperCase() + x.text.slice(1);
    const zielGleis = pfad.knoten[pfad.knoten.length - 1]?.gleis;
    const letzter = wege[wege.length - 1];
    if (optionen.zielZusatz) {
      letzter.text += ` ${optionen.zielZusatz}`;
    } else if (zielGleis) {
      letzter.text += ` zu Gleis ${zielGleis}`;
    }
  }
  return schritte;
}

// ---------------------------------------------------------------------------
// Einstieg: Textstil `bezug` (Konzept 09) oder `klassisch`
// ---------------------------------------------------------------------------

/**
 * Schritte und Kurzfassung eines Wegs. Der Stil kommt aus den Optionen, sonst
 * aus `TEXT_STIL` (Vorgabe `bezug`); `klassisch` liefert den Text bis zum
 * 06.11.2026, ohne Kurzfassung. Haelt der neue Text die Invariante des Schemas
 * nicht, gilt ebenfalls der klassische.
 */
export function generiereText(pfad: RoutenPfad, optionen: TextOptionen = {}): WegText {
  const stil = optionen.stil ?? textStilAusUmgebung();
  if (stil === 'klassisch' || pfad.kanten.length === 0) return { schritte: generiereSchritteKlassisch(pfad, optionen) };
  return bezugText(pfad, optionen) ?? { schritte: generiereSchritteKlassisch(pfad, optionen) };
}

/** Nur die Schritte - fuer Aufrufer, die keine Kurzfassung brauchen. */
export function generiereSchritte(pfad: RoutenPfad, optionen: TextOptionen = {}): Schritt[] {
  return generiereText(pfad, optionen).schritte;
}
