import type { GraphKnoten, KantenTyp, RoutenPfad, Schritt } from './typen.js';

/** Peilung a→b in Grad (0 = Nord, 90 = Ost), äquirektangulare Näherung – Bahnhofsmaßstab. */
export function peilungGrad(a: GraphKnoten, b: GraphKnoten): number {
  const mittelLatRad = ((a.lat + b.lat) / 2) * (Math.PI / 180);
  const dx = (b.lon - a.lon) * Math.cos(mittelLatRad);
  const dy = b.lat - a.lat;
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

const MERGE_SCHWELLE_GRAD = 22.5;

/** Winkeländerung vorher→nachher, normalisiert auf −180…180 (positiv = Linksdrehung). */
function winkelDelta(vorher: number, nachher: number): number {
  let delta = (vorher - nachher) % 360;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

/** Richtungsskala in 45°-Sektoren (Plan Task 9). */
function richtungsWort(delta: number): string {
  if (delta > 67.5) return 'links';
  if (delta > 22.5) return 'halblinks';
  if (delta >= -22.5) return 'geradeaus';
  if (delta >= -67.5) return 'halbrechts';
  return 'rechts';
}

// Ebene −1 heißt durchgehend „Unterführung (-1)" (konsistente Benennung statt
// gemischter Plan-Beispiele), alle anderen Ebenen „Ebene n".
function ebenenName(level: number): string {
  return level === -1 ? 'Unterführung (-1)' : `Ebene ${level}`;
}

function rund10(m: number): number {
  return Math.round(m / 10) * 10;
}

interface Segment {
  typ: KantenTyp;
  laengeM: number;
  peilungStart: number | null; // null = senkrecht (Aufzug ohne Ortsversatz)
  peilungEnde: number | null;
  deltaLevel: number;
  zielLevel: number;
}

/** Kanten zu Segmenten: benachbarte eben-Kanten gleicher Richtung (±22,5°) verschmelzen. */
function baueSegmente(pfad: RoutenPfad): Segment[] {
  const segmente: Segment[] = [];
  for (let i = 0; i < pfad.kanten.length; i++) {
    const kante = pfad.kanten[i];
    const von = pfad.knoten[i];
    const nach = pfad.knoten[i + 1];
    const degeneriert = von.lat === nach.lat && von.lon === nach.lon;
    const peilung = degeneriert ? null : peilungGrad(von, nach);

    const letztes = segmente[segmente.length - 1];
    if (
      kante.typ === 'eben' &&
      letztes?.typ === 'eben' &&
      letztes.peilungEnde !== null &&
      peilung !== null &&
      Math.abs(winkelDelta(letztes.peilungEnde, peilung)) <= MERGE_SCHWELLE_GRAD
    ) {
      letztes.laengeM += kante.laengeM;
      letztes.peilungEnde = peilung;
      letztes.zielLevel = nach.level;
      continue;
    }
    segmente.push({
      typ: kante.typ,
      laengeM: kante.laengeM,
      peilungStart: peilung,
      peilungEnde: peilung,
      deltaLevel: kante.deltaLevel,
      zielLevel: nach.level,
    });
  }
  return segmente;
}

const TYP_NAME: Partial<Record<KantenTyp, string>> = {
  treppe: 'Treppe',
  rolltreppe: 'Rolltreppe',
  rampe: 'Rampe',
};

export function generiereSchritte(pfad: RoutenPfad): Schritt[] {
  const segmente = baueSegmente(pfad);
  const schritte: Schritt[] = [];
  let referenzPeilung: number | null = null;

  for (const segment of segmente) {
    let text: string;
    let distanzM: number | undefined;

    if (segment.typ === 'eben') {
      const delta =
        referenzPeilung === null || segment.peilungStart === null
          ? 0
          : winkelDelta(referenzPeilung, segment.peilungStart);
      const richtung = richtungsWort(delta);
      if (segment.laengeM < 10) {
        text = `wenige Meter ${richtung}`;
      } else {
        distanzM = rund10(segment.laengeM);
        text = `${distanzM} m ${richtung}`;
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
    schritte.push({ text, typ: segment.typ, ...(distanzM !== undefined ? { distanzM } : {}) });
  }

  if (schritte.length > 0) {
    schritte[0].text = `Nach Ausstieg ${schritte[0].text}`;
    for (let i = 1; i < schritte.length; i++) {
      const t = schritte[i].text;
      schritte[i].text = t.charAt(0).toUpperCase() + t.slice(1);
    }
    const zielGleis = pfad.knoten[pfad.knoten.length - 1]?.gleis;
    if (zielGleis) {
      schritte[schritte.length - 1].text += ` zu Gleis ${zielGleis}`;
    }
  }
  return schritte;
}
