import { mittlereAchse, peilungGrad } from './richtung.js';

/**
 * Die Mittellinie eines Bahnsteigs und die Querlage der Bahnsteige einer Ebene.
 *
 * Warum nicht die Sehne von Ende zu Ende, wie bis zum 03.11.2026: Saarbrücken
 * Hbf hat gebogene Bahnsteige verschiedener Länge. Gleis 12 läuft 560 m im
 * Bogen, seine Sehne liegt in der Mitte 37 m neben ihm. Die Mitte jedes
 * Bahnsteigs auf eine gemeinsame Querachse projiziert ergab 11, 16, 14, 8, 12,
 * 6, 2, 5, 3, 1 – am OSM-Umriss nachgemessen liegen sie Süd→Nord
 * 1 | 2/3 | 5/6 | 8, 11 | 12 | 14/16 (8 im Osten und 11 im Westen je 3 m
 * südlich von 12, nebeneinander nirgends). Ein kurzer Bahnsteig am Rand des Bogens
 * hat seine Mitte eben woanders als ein langer im Scheitel, auch wenn beide
 * nebeneinanderliegen.
 *
 * Die Linie folgt dem Bahnsteig; der Abstand zweier Linien dort, wo beide
 * verlaufen, ist das, was man vor Ort sieht.
 */

export interface Punkt {
  lat: number;
  lon: number;
}

/** Breite eines Fachs entlang der Achse. Kürzer als jeder Bahnsteig, länger als jede Umrisszacke. */
const FACH_M = 10;

/** So viele Fächer müssen zwei Bahnsteige gemeinsam haben, damit ihr Abstand zählt. */
const MIN_GEMEINSAME_FAECHER = 3;

const GAUSS_SEIDEL_DURCHLAEUFE = 50;

const BOGEN = Math.PI / 180;
const M_LAT = 111_320;

interface XY {
  x: number;
  y: number;
}

/** Ebene Meterkoordinaten um einen Bezugspunkt – auf Bahnhofsgröße genau genug. */
function ebene(bezug: Punkt): { zuXY: (p: Punkt) => XY; zuPunkt: (q: XY) => Punkt } {
  const mLon = M_LAT * Math.cos(bezug.lat * BOGEN);
  return {
    zuXY: (p) => ({ x: (p.lon - bezug.lon) * mLon, y: (p.lat - bezug.lat) * M_LAT }),
    zuPunkt: (q) => ({ lat: bezug.lat + q.y / M_LAT, lon: bezug.lon + q.x / mLon }),
  };
}

function istTeilliste(umriss: Punkt[] | Punkt[][]): umriss is Punkt[][] {
  return umriss.length > 0 && Array.isArray(umriss[0]);
}

function istGeschlossen(umriss: Punkt[]): boolean {
  if (umriss.length < 4) return false;
  const a = umriss[0];
  const b = umriss[umriss.length - 1];
  return a.lat === b.lat && a.lon === b.lon;
}

/**
 * Die Mittellinie eines Bahnsteigs.
 *
 * Eine Fläche wird auf ihre Hauptachse (größte Ausdehnung) projiziert und in
 * Fächer zu 10 m geteilt; je Fach liegt die Linie in der Mitte zwischen dem
 * kleinsten und dem größten Querwert. Gemessen wird am UMRISS, nicht an seinen
 * Ecken: Ein gerader Bahnsteig hat oft auf 200 m Länge keinen einzigen Punkt,
 * und ein Fach ohne Punkt auf der Gegenseite legte die Linie auf den Rand.
 *
 * Eine Linie (`railway=platform` als Linie gezeichnet, `platform_edge`) ist
 * schon die Lage des Bahnsteigs – sie bleibt, wie sie ist.
 *
 * Ein einzelner Weg ist eine Fläche, wenn er geschlossen ist. Mehrere Wege
 * sind die äußeren Glieder einer Relation und immer eine Fläche. Sie werden
 * NICHT aneinandergehängt: In 287 von 680 solchen Relationen der Ablage
 * (03.11.2026) liegen die Glieder verdreht oder in anderer Reihenfolge, und
 * die Naht zwischen zwei Gliedern wäre eine erfundene Kante quer über den
 * Bahnsteig. Jedes Glied trägt nur seine eigenen Kanten bei.
 */
export function mittellinie(umriss: Punkt[] | Punkt[][]): Punkt[] {
  const teile = istTeilliste(umriss) ? umriss.filter((t) => t.length > 0) : [umriss];
  const alle = teile.flat();
  const flaeche = teile.length > 1 || istGeschlossen(teile[0] ?? []);
  if (!flaeche || alle.length < 3) return alle.map((p) => ({ lat: p.lat, lon: p.lon }));

  const { zuXY, zuPunkt } = ebene(alle[0]);
  const xy = alle.map(zuXY);

  // Hauptachse: das am weitesten auseinanderliegende Punktpaar, wie die
  // Bahnsteigenden in `baueGraph`.
  let a = xy[0];
  let b = xy[1];
  let max = -1;
  for (let i = 0; i < xy.length; i++) {
    for (let j = i + 1; j < xy.length; j++) {
      const d = Math.hypot(xy[i].x - xy[j].x, xy[i].y - xy[j].y);
      if (d > max) {
        max = d;
        a = xy[i];
        b = xy[j];
      }
    }
  }
  if (max <= 0) return [zuPunkt(a)];
  const ux = (b.x - a.x) / max;
  const uy = (b.y - a.y) / max;
  const laengs = (p: XY): number => (p.x - a.x) * ux + (p.y - a.y) * uy;
  const quer = (p: XY): number => -(p.x - a.x) * uy + (p.y - a.y) * ux;

  const kanten: [XY, XY][] = [];
  for (const teil of teile) {
    const t = teil.map(zuXY);
    for (let i = 0; i < t.length - 1; i++) kanten.push([t[i], t[i + 1]]);
  }
  const lq = kanten.map(([p, q]) => ({ l0: laengs(p), q0: quer(p), l1: laengs(q), q1: quer(q) }));

  const faecher = Math.max(1, Math.ceil(max / FACH_M));
  const breite = max / faecher;
  const linie: Punkt[] = [];
  for (let k = 0; k < faecher; k++) {
    const von = k * breite;
    const bis = von + breite;
    let qMin = Number.POSITIVE_INFINITY;
    let qMax = Number.NEGATIVE_INFINITY;
    for (const { l0, q0, l1, q1 } of lq) {
      const lo = Math.max(von, Math.min(l0, l1));
      const hi = Math.min(bis, Math.max(l0, l1));
      if (lo > hi) continue;
      // Die Kante im Fach: ihre Querwerte an den Rändern des Ausschnitts.
      const qBei = (l: number): number => (l1 === l0 ? q0 : q0 + ((q1 - q0) * (l - l0)) / (l1 - l0));
      for (const q of l1 === l0 ? [q0, q1] : [qBei(lo), qBei(hi)]) {
        if (q < qMin) qMin = q;
        if (q > qMax) qMax = q;
      }
    }
    if (qMin > qMax) continue;
    const l = (von + bis) / 2;
    const q = (qMin + qMax) / 2;
    linie.push(zuPunkt({ x: a.x + l * ux - q * uy, y: a.y + l * uy + q * ux }));
  }
  return linie;
}

/**
 * Wo ein Punkt an einer Linie liegt: Meter entlang (ab ihrem ersten Punkt),
 * Meter quer.
 *
 * Über die Enden hinaus wird die erste bzw. letzte Strecke verlängert: Die
 * Mittellinie einer Fläche endet in der Mitte des letzten Fachs, bis zu 5 m vor
 * der Spitze – eine Treppe dort liegt trotzdem am Bahnsteig, und ihr
 * Bahnsteigende ist nicht dasselbe wie das der Linie.
 */
export function lageZurLinie(linie: Punkt[], p: Punkt): { laengsM: number; querM: number } {
  const { zuXY } = ebene(linie[0]);
  const q = zuXY(p);
  if (linie.length === 1) return { laengsM: 0, querM: Math.hypot(q.x, q.y) };
  const xy = linie.map(zuXY);
  let beste = { laengsM: 0, querM: Number.POSITIVE_INFINITY };
  let bisher = 0;
  for (let i = 0; i < xy.length - 1; i++) {
    const a = xy[i];
    const b = xy[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy);
    if (l === 0) continue;
    let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / (l * l);
    if (i > 0) t = Math.max(0, t);
    if (i < xy.length - 2) t = Math.min(1, t);
    const d = Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
    if (d < beste.querM) beste = { laengsM: bisher + t * l, querM: d };
    bisher += l;
  }
  return beste;
}

/** Nächster Punkt einer Linie (ohne Verlängerung über die Enden). */
function naechsterPunkt(linie: XY[], p: XY): XY {
  if (linie.length === 1) return linie[0];
  let beste = linie[0];
  let besteD = Number.POSITIVE_INFINITY;
  for (let i = 0; i < linie.length - 1; i++) {
    const a = linie[i];
    const b = linie[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const f = { x: a.x + t * dx, y: a.y + t * dy };
    const d = Math.hypot(p.x - f.x, p.y - f.y);
    if (d < besteD) {
      besteD = d;
      beste = f;
    }
  }
  return beste;
}

/** Die Mitte einer Linie, nach ihrer Länge. */
function mitteDerLinie(linie: XY[]): XY {
  const stuecke = linie.slice(1).map((b, i) => Math.hypot(b.x - linie[i].x, b.y - linie[i].y));
  let rest = stuecke.reduce((s, l) => s + l, 0) / 2;
  for (let i = 0; i < stuecke.length; i++) {
    if (rest <= stuecke[i] && stuecke[i] > 0) {
      const t = rest / stuecke[i];
      return { x: linie[i].x + t * (linie[i + 1].x - linie[i].x), y: linie[i].y + t * (linie[i + 1].y - linie[i].y) };
    }
    rest -= stuecke[i];
  }
  return linie[linie.length - 1];
}

function median(werte: number[]): number {
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Die Querlage jedes Bahnsteigs einer Ebene, in Metern links der gemeinsamen
 * Hauptrichtung.
 *
 * Gemessen wird, wo Bahnsteige der Länge nach nebeneinanderliegen: an jedem
 * 10-m-Fach entlang der gemeinsamen Richtung der Abstand jedes Bahnsteigs zu
 * seinem Nachbarn im Fach, links positiv. Der Median dieser Abstände ist der
 * Abstand des Paares – ab drei Fächern; zwei Bahnsteige, die sich nur an den
 * Spitzen berühren, sagen über ihren Abstand nichts. Aus allen Paarabständen
 * werden die Lagen ausgeglichen (gewichtete kleinste Quadrate, Gauß-Seidel ab
 * der Projektion der Mitte). Wer mit keinem anderen überlappt, behält diese
 * Projektion.
 *
 * Die Projektion bleibt der Anker: Jede zusammenhängende Gruppe wird nach dem
 * Ausgleich so verschoben, dass ihr Mittel dem Mittel ihrer Projektionen
 * gleicht. Sonst hinge ihre Lage zu den übrigen Bahnsteigen davon ab, in
 * welcher Reihenfolge Gauß-Seidel sie besucht.
 *
 * `richtungGrad` und `mitten` erlauben dem Aufrufer, dieselbe Richtung und
 * dieselben Mitten zu verwenden wie bisher - ohne Paar ändert sich dann nichts.
 */
export function querLagen(
  linien: Map<string, Punkt[]>,
  optionen: { richtungGrad?: number; mitten?: Map<string, Punkt> } = {},
): Map<string, number> {
  const ids = [...linien.keys()].filter((id) => linien.get(id)!.length > 0);
  const lagen = new Map<string, number>();
  if (ids.length === 0) return lagen;

  const { zuXY } = ebene(linien.get(ids[0])![0]);
  const richtung =
    optionen.richtungGrad ??
    mittlereAchse(
      ids
        .map((id) => linien.get(id)!)
        .filter((l) => l.length >= 2)
        .map((l) => peilungGrad(l[0], l[l.length - 1])),
    );
  // Peilung: 0° = Nord, im Uhrzeigersinn. Richtung u in (Ost, Nord), links n.
  const ux = Math.sin(richtung * BOGEN);
  const uy = Math.cos(richtung * BOGEN);
  const nx = -uy;
  const ny = ux;
  const laengs = (p: XY): number => p.x * ux + p.y * uy;
  const quer = (p: XY): number => p.x * nx + p.y * ny;

  const xy = new Map(ids.map((id) => [id, linien.get(id)!.map(zuXY)]));
  const start = new Map<string, number>();
  for (const id of ids) {
    const mitte = optionen.mitten?.get(id);
    start.set(id, quer(mitte ? zuXY(mitte) : mitteDerLinie(xy.get(id)!)));
  }

  // Jede Linie an den Fachmitten der gemeinsamen Richtung abgetastet.
  const abtastung = new Map<string, Map<number, XY>>();
  for (const id of ids) {
    const punkte = xy.get(id)!;
    const proFach = new Map<number, XY>();
    for (let i = 0; i < punkte.length - 1; i++) {
      const a = punkte[i];
      const b = punkte[i + 1];
      const la = laengs(a);
      const lb = laengs(b);
      if (la === lb) continue;
      const kVon = Math.ceil(Math.min(la, lb) / FACH_M - 0.5);
      const kBis = Math.floor(Math.max(la, lb) / FACH_M - 0.5);
      for (let k = kVon; k <= kBis; k++) {
        if (proFach.has(k)) continue;
        const t = ((k + 0.5) * FACH_M - la) / (lb - la);
        proFach.set(k, { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y) });
      }
    }
    abtastung.set(id, proFach);
  }

  // Je Fach die Bahnsteige, die es erreichen, quer der Reihe nach; gemessen
  // wird nur zwischen Nachbarn. Der Abstand zu einem fernen Bahnsteig sagt
  // nichts, wenn die Bahnsteige fächerförmig auseinanderlaufen: Saarbrücken 5
  // und 12 liegen im Westen 7 m auseinander, im Osten 18 m - dort stehen 6 und
  // 8 dazwischen. Mit allen Paaren gemessen (5-12: 7 m, 5-8: 18 m, 8-12: 3 m)
  // landete Gleis 8 nördlich von 12.
  const messungen = new Map<string, { a: string; b: string; d: number[] }>();
  const faecher = new Map<number, { id: string; p: XY }[]>();
  for (const [id, proFach] of abtastung) {
    for (const [k, p] of proFach) {
      if (!faecher.has(k)) faecher.set(k, []);
      faecher.get(k)!.push({ id, p });
    }
  }
  for (const imFach of faecher.values()) {
    imFach.sort((u, v) => quer(u.p) - quer(v.p));
    for (let i = 0; i < imFach.length - 1; i++) {
      const { id: idA } = imFach[i];
      const { id: idB, p: pB } = imFach[i + 1];
      const f = naechsterPunkt(xy.get(idA)!, pB);
      const vx = pB.x - f.x;
      const vy = pB.y - f.y;
      const d = Math.hypot(vx, vy) * (vx * nx + vy * ny < 0 ? -1 : 1);
      const schluessel = `${idA}|${idB}`;
      const umgekehrt = messungen.get(`${idB}|${idA}`);
      if (umgekehrt) {
        umgekehrt.d.push(-d);
        continue;
      }
      if (!messungen.has(schluessel)) messungen.set(schluessel, { a: idA, b: idB, d: [] });
      messungen.get(schluessel)!.d.push(d);
    }
  }

  /**
   * x[anderer] + versatz ≈ x[id].
   *
   * Gewichtet mit der Zahl der Fächer - ein Paar, das 300 m nebeneinanderliegt,
   * weiß mehr als eines, das sich auf 30 m trifft - und mit dem Kehrwert des
   * quadrierten Abstands: Ein Abstand ist auf ein Verhältnis genau, nicht auf
   * Meter. Laufen Bahnsteige fächerförmig auseinander, verschiebt das den
   * großen Abstand um viele Meter, den kleinen kaum. Gleich gewichtet musste in
   * Saarbrücken der 3-m-Abstand 8-12 den Widerspruch zwischen 5-12 im Westen
   * (6 m) und 5-6-8-12 im Osten (21 m) mittragen, und Gleis 8 rutschte auf die
   * falsche Seite.
   */
  const paare = new Map<string, { anderer: string; versatz: number; gewicht: number }[]>(
    ids.map((id) => [id, []]),
  );
  for (const { a, b, d } of messungen.values()) {
    if (d.length < MIN_GEMEINSAME_FAECHER) continue;
    const m = median(d);
    const gewicht = d.length / Math.max(1, m * m);
    paare.get(b)!.push({ anderer: a, versatz: m, gewicht });
    paare.get(a)!.push({ anderer: b, versatz: -m, gewicht });
  }

  const x = new Map(start);
  for (let durchlauf = 0; durchlauf < GAUSS_SEIDEL_DURCHLAEUFE; durchlauf++) {
    for (const id of ids) {
      const nachbarn = paare.get(id)!;
      if (nachbarn.length === 0) continue;
      let summe = 0;
      let gewichte = 0;
      for (const n of nachbarn) {
        summe += n.gewicht * (x.get(n.anderer)! + n.versatz);
        gewichte += n.gewicht;
      }
      x.set(id, summe / gewichte);
    }
  }

  // Jede zusammenhängende Gruppe auf das Mittel ihrer Projektionen setzen.
  const gesehen = new Set<string>();
  for (const id of ids) {
    if (gesehen.has(id)) continue;
    const gruppe: string[] = [];
    const offen = [id];
    gesehen.add(id);
    while (offen.length > 0) {
      const aktuell = offen.pop()!;
      gruppe.push(aktuell);
      for (const n of paare.get(aktuell)!) {
        if (gesehen.has(n.anderer)) continue;
        gesehen.add(n.anderer);
        offen.push(n.anderer);
      }
    }
    const verschiebung =
      gruppe.reduce((s, g) => s + start.get(g)! - x.get(g)!, 0) / gruppe.length;
    for (const g of gruppe) lagen.set(g, x.get(g)! + verschiebung);
  }
  return lagen;
}
