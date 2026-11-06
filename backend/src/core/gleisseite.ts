/**
 * An welcher Kante des Bahnsteigs liegt ein Gleis?
 *
 * Gebraucht fuer „rechts/links“ beim Aussteigen (Julian, 06.11.2026): Wer
 * aussteigt, hat den Zug im Ruecken. Welche Bahnsteigrichtung dann rechts
 * liegt, haengt davon ab, an welcher Seite der Bahnsteigachse das Gleis
 * verlaeuft. Himmelsrichtungen kennt dabei niemand - rechts und links schon.
 *
 * Zwei Quellen, in dieser Reihenfolge:
 *
 * 1. `kante`: OSM zeichnet die Bahnsteigkante (`railway=platform_edge`) mit
 *    Gleisnummer. Ihre Lage zur Achse ist die Seite - belegt.
 * 2. `nachbarn`: aus den Nachbarbahnsteigen derselben Ebene geschlossen.
 *    - Ein Seitenbahnsteig (ein Gleis) hat sein Gleis zu den anderen
 *      Bahnsteigen hin; liegen auf beiden Seiten welche, bleibt es offen.
 *    - Am Inselbahnsteig (zwei Gleise) liegt jedes Gleis zu der Seite, deren
 *      Nachbarn die naeheren Gleisnummern tragen ([1] | [2,3] | [4,5]: 2 zur
 *      1, 3 zur 4). Gleichstand bleibt offen.
 *    Mehr als zwei Gleise, nicht-numerische Namen: offen.
 *
 * Offen heisst: Der Text sagt nicht rechts oder links. Ein falsches „rechts“
 * schickt jemanden mit Koffer 200 m in die falsche Richtung.
 */

export type Seite = 'links' | 'rechts';

export interface Punkt {
  lat: number;
  lon: number;
}

export interface BahnsteigLage {
  id: string;
  ebene: number;
  gleise: string[];
  /** Achse vom Anfang zum Ende, wie die Punkte `gleisN:anfang|ende`. */
  anfang: Punkt;
  ende: Punkt;
  /** Bahnsteigkanten mit Gleisnummer: Gleis → Punkte der Kante. */
  kanten?: Map<string, Punkt[]>;
  /**
   * Mittellinie des Bahnsteigs. Gemessen wird gegen sie, nicht gegen die
   * Sehne: Koelns Bahnsteige sind gebogen, und gegen die Sehne lagen beide
   * Kanten eines Inselbahnsteigs auf derselben Seite.
   */
  linie?: Punkt[];
}

export interface GleisSeite {
  /** Seite der Achse (Blick vom Anfang zum Ende), an der das Gleis liegt. */
  seite: Seite;
  quelle: 'kante' | 'nachbarn';
  /** Was die Nachbarregel sagt, auch wo die Kante entscheidet - zum Nachmessen. */
  nachbarn?: Seite;
}

/** Schluessel der Ergebnis-Karte. */
export function gleisSchluessel(bahnsteigId: string, gleis: string): string {
  return `${bahnsteigId}|${gleis}`;
}

/**
 * Querlage eines Punkts zur Mittellinie: positiv = links, Blick in Richtung
 * Anfang → Ende. Ohne Linie gegen die Sehne.
 */
function querZurLinie(b: BahnsteigLage, p: Punkt): number {
  const linie = ausgerichteteLinie(b);
  if (!linie || linie.length < 2) return quer(b, p).querM;
  const mLat = 111_320;
  const mLon = mLat * Math.cos((p.lat * Math.PI) / 180);
  let bester = Infinity;
  let querM = 0;
  for (let i = 0; i < linie.length - 1; i++) {
    const ax = (linie[i + 1].lon - linie[i].lon) * mLon;
    const ay = (linie[i + 1].lat - linie[i].lat) * mLat;
    const px = (p.lon - linie[i].lon) * mLon;
    const py = (p.lat - linie[i].lat) * mLat;
    const l2 = ax * ax + ay * ay;
    if (l2 === 0) continue;
    const t = Math.max(0, Math.min(1, (ax * px + ay * py) / l2));
    const d = Math.hypot(px - t * ax, py - t * ay);
    if (d < bester) {
      bester = d;
      querM = (ax * py - ay * px) / Math.sqrt(l2);
    }
  }
  return querM;
}

/** Die Mittellinie in Richtung Anfang → Ende. */
function ausgerichteteLinie(b: BahnsteigLage): Punkt[] | undefined {
  const linie = b.linie;
  if (!linie || linie.length < 2) return undefined;
  const d = (x: Punkt, y: Punkt) => Math.hypot(x.lat - y.lat, (x.lon - y.lon) * Math.cos((x.lat * Math.PI) / 180));
  return d(linie[0], b.anfang) <= d(linie[linie.length - 1], b.anfang) ? linie : [...linie].reverse();
}

/** Querlage eines Punkts zur Sehne in Metern: positiv = links (Blick vom Anfang zum Ende). */
function quer(b: BahnsteigLage, p: Punkt): { querM: number; laengsM: number; laengeM: number } {
  const mLat = 111_320;
  const mLon = mLat * Math.cos((b.anfang.lat * Math.PI) / 180);
  const ax = (b.ende.lon - b.anfang.lon) * mLon;
  const ay = (b.ende.lat - b.anfang.lat) * mLat;
  const px = (p.lon - b.anfang.lon) * mLon;
  const py = (p.lat - b.anfang.lat) * mLat;
  const laengeM = Math.hypot(ax, ay) || 1;
  return { querM: (ax * py - ay * px) / laengeM, laengsM: (ax * px + ay * py) / laengeM, laengeM };
}

function richtungGrad(b: BahnsteigLage): number {
  const mLon = Math.cos((b.anfang.lat * Math.PI) / 180);
  return (Math.atan2((b.ende.lat - b.anfang.lat), (b.ende.lon - b.anfang.lon) * mLon) * 180) / Math.PI;
}

function nummer(gleis: string): number | undefined {
  const m = gleis.match(/^\d+/);
  return m ? Number(m[0]) : undefined;
}

/** Nachbarbahnsteige links und rechts der Achse: derselben Ebene, ungefaehr parallel, nebeneinander. */
function nachbarnVon(b: BahnsteigLage, alle: BahnsteigLage[]): { links?: BahnsteigLage; rechts?: BahnsteigLage } {
  let links: { b: BahnsteigLage; d: number } | undefined;
  let rechts: { b: BahnsteigLage; d: number } | undefined;
  const eigene = richtungGrad(b);
  for (const n of alle) {
    if (n.id === b.id || n.ebene !== b.ebene) continue;
    let winkel = Math.abs(richtungGrad(n) - eigene) % 180;
    if (winkel > 90) winkel = 180 - winkel;
    if (winkel > 30) continue;
    const mitte = { lat: (n.anfang.lat + n.ende.lat) / 2, lon: (n.anfang.lon + n.ende.lon) / 2 };
    const { laengsM, laengeM } = quer(b, mitte);
    const querM = querZurLinie(b, mitte);
    if (laengsM < -30 || laengsM > laengeM + 30) continue;
    const d = Math.abs(querM);
    if (d < 2 || d > 80) continue;
    if (querM > 0 && (!links || d < links.d)) links = { b: n, d };
    if (querM < 0 && (!rechts || d < rechts.d)) rechts = { b: n, d };
  }
  return { links: links?.b, rechts: rechts?.b };
}

/** Abstand einer Gleisnummer zu den Nummern eines Bahnsteigs; ohne Nummern unendlich. */
function abstandZu(n: number, b: BahnsteigLage | undefined): number {
  if (!b) return Infinity;
  const nummern = b.gleise.map(nummer).filter((x): x is number => x !== undefined);
  return nummern.length === 0 ? Infinity : Math.min(...nummern.map((x) => Math.abs(x - n)));
}

/** Die Nachbarregel fuer einen Bahnsteig: Gleis → Seite, nur wo sie eindeutig ist. */
function nachbarRegel(b: BahnsteigLage, alle: BahnsteigLage[]): Map<string, Seite> {
  const ergebnis = new Map<string, Seite>();
  const { links, rechts } = nachbarnVon(b, alle);
  if (b.gleise.length === 1) {
    if (links && !rechts) ergebnis.set(b.gleise[0], 'links');
    if (rechts && !links) ergebnis.set(b.gleise[0], 'rechts');
    return ergebnis;
  }
  if (b.gleise.length !== 2) return ergebnis;
  const [a, z] = b.gleise;
  const na = nummer(a);
  const nz = nummer(z);
  if (na === undefined || nz === undefined || na === nz) return ergebnis;
  // Summe der Abstaende fuer beide Zuordnungen; die kleinere gewinnt.
  const summe = (x: number, y: number) => (Number.isFinite(x) ? x : 0) + (Number.isFinite(y) ? y : 0);
  const aLinks = summe(abstandZu(na, links), abstandZu(nz, rechts));
  const aRechts = summe(abstandZu(na, rechts), abstandZu(nz, links));
  const beideOhne = !Number.isFinite(abstandZu(na, links)) && !Number.isFinite(abstandZu(na, rechts));
  if (beideOhne || aLinks === aRechts) return ergebnis;
  const aSeite: Seite = aLinks < aRechts ? 'links' : 'rechts';
  ergebnis.set(a, aSeite);
  ergebnis.set(z, aSeite === 'links' ? 'rechts' : 'links');
  return ergebnis;
}

/** Gleisseite je Bahnsteig und Gleis (`gleisSchluessel`). */
export function gleisSeiten(bahnsteige: BahnsteigLage[]): Map<string, GleisSeite> {
  const ergebnis = new Map<string, GleisSeite>();
  for (const b of bahnsteige) {
    const regel = nachbarRegel(b, bahnsteige);
    for (const gleis of b.gleise) {
      const nachbarn = regel.get(gleis);
      const punkte = b.kanten?.get(gleis);
      if (punkte && punkte.length > 0) {
        const mittel = punkte.reduce((s, p) => s + querZurLinie(b, p), 0) / punkte.length;
        if (Math.abs(mittel) >= 0.5) {
          ergebnis.set(gleisSchluessel(b.id, gleis), {
            seite: mittel > 0 ? 'links' : 'rechts',
            quelle: 'kante',
            ...(nachbarn ? { nachbarn } : {}),
          });
          continue;
        }
      }
      if (nachbarn) ergebnis.set(gleisSchluessel(b.id, gleis), { seite: nachbarn, quelle: 'nachbarn', nachbarn });
    }
    // Zwei Gleise an derselben Kante gibt es nicht: Sagen die Kanten das, ist
    // eine davon falsch gezeichnet - dann gilt keine von beiden.
    if (b.gleise.length === 2) {
      const [x, y] = b.gleise.map((g) => ergebnis.get(gleisSchluessel(b.id, g)));
      if (x && y && x.seite === y.seite) {
        for (const g of b.gleise) {
          const schluessel = gleisSchluessel(b.id, g);
          const n = regel.get(g);
          if (n) ergebnis.set(schluessel, { seite: n, quelle: 'nachbarn', nachbarn: n });
          else ergebnis.delete(schluessel);
        }
      }
    }
  }
  return ergebnis;
}

/**
 * Wer mit dem Zug im Ruecken aussteigt: Liegt der Weg zum Bahnsteigende
 * (`zumEnde`) rechts oder links?
 *
 * Liegt das Gleis links der Achse (Blick Anfang → Ende), schaut man nach dem
 * Aussteigen nach rechts von der Achse - und das Ende liegt dann links.
 */
export function aussteigeSeite(gleis: Seite, zumEnde: boolean): Seite {
  const endeLinks = gleis === 'links';
  return zumEnde === endeLinks ? 'links' : 'rechts';
}
