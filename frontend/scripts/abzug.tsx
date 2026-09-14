// Zieht die Navigationsansicht als eigenstaendige HTML-Datei ab.
//
// Gezeichnet werden die ECHTEN Komponenten dieses Builds mit ECHTEN
// Routendaten (siehe `backend/scripts/routenabzug.ts`) - kein Nachbau. Ein
// Nachbau zeigt genau die Faelle nicht, an denen das Bild scheitert.
//
// Aufruf: npx tsx --tsconfig tsconfig.app.json scripts/abzug.tsx \
//           <ziel.html> "<Titel|Untertitel|Bahnhof|an|ab|pos>=<route.json>" ...
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Navigation } from '../src/screens/Navigation';
import type { BahnhofSchema, RouteErgebnis } from '../src/api/typen';

interface Fall {
  titel: string;
  untertitel: string;
  route: RouteErgebnis;
  gleisAn: string;
  gleisAb: string;
  bahnhofName: string;
  position: number;
}

function css(datei: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${datei}`, import.meta.url)), 'utf8');
}

function schuetze(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Was im Feld `schema` steckt - die Zahlen, die das Bild heute nicht nutzt. */
function ungenutzt(schema: BahnhofSchema | undefined): { wert: string; was: string }[] {
  if (!schema) return [];
  const bahnsteige = schema.ebenen.flatMap((e) => e.bahnsteige);
  const zugaenge = bahnsteige.reduce((s, b) => s + (b.zugaenge?.length ?? 0), 0);
  const anlagen = schema.ebenen.reduce((s, e) => s + (e.elemente?.length ?? 0), 0);
  const netz = schema.ebenen.reduce((s, e) => s + (e.netz?.length ?? 0), 0);
  const wegpunkte = schema.ebenen.reduce((s, e) => s + (e.weg?.length ?? 0), 0);
  const mitLaenge = bahnsteige.filter((b) => b.laengeM !== undefined);
  return [
    { wert: String(schema.ebenen.length), was: 'Ebenenbesuche' },
    { wert: String(bahnsteige.length), was: 'Bahnsteige' },
    {
      wert: mitLaenge.length > 0 ? `${Math.round(Math.max(...mitLaenge.map((b) => b.laengeM!)))} m` : '–',
      was: 'längster Bahnsteig',
    },
    { wert: String(zugaenge), was: 'Zugänge' },
    { wert: String(anlagen), was: 'Anlagen mit Grundriss' },
    { wert: String(netz), was: 'Netzstücke' },
    { wert: String(wegpunkte), was: 'Wegpunkte' },
    {
      wert: schema.kreuzungswinkelGrad !== undefined ? `${schema.kreuzungswinkelGrad}°` : '–',
      was: 'Kreuzungswinkel',
    },
  ];
}

/** Die Ebenenfolge des Wegs - das, was das heutige Bild nach Höhe sortiert. */
function folge(schema: BahnhofSchema | undefined): string {
  if (!schema) return '–';
  return schema.ebenen.map((e) => (e.level > 0 ? `+${e.level}` : String(e.level))).join(' → ');
}

const [ziel, ...faelleRoh] = process.argv.slice(2);
if (!ziel || faelleRoh.length === 0) {
  console.error('Aufruf: npx tsx --tsconfig tsconfig.app.json scripts/abzug.tsx <ziel.html> "<Titel|Untertitel|Bahnhof|an|ab|pos>=<datei.json>" ...');
  process.exit(2);
}

const faelle: Fall[] = faelleRoh.map((roh) => {
  const trenner = roh.lastIndexOf('=');
  const [titel, untertitel, bahnhofName, gleisAn, gleisAb, pos] = roh.slice(0, trenner).split('|');
  return {
    titel,
    untertitel,
    bahnhofName,
    gleisAn,
    gleisAb,
    position: Number(pos),
    route: JSON.parse(readFileSync(roh.slice(trenner + 1), 'utf8')) as RouteErgebnis,
  };
});

const karten = faelle
  .map((f) => {
    const inhalt = renderToStaticMarkup(
      createElement(
        'main',
        { className: 'app' },
        createElement(Navigation, {
          route: f.route,
          gleisAn: f.gleisAn,
          gleisAb: f.gleisAb,
          bahnhofName: f.bahnhofName,
          position: f.position,
          standort: null,
          onZurueck: () => undefined,
          onWeiter: () => undefined,
          onAngekommen: () => undefined,
        }),
      ),
    );
    const schritt = f.route.schritte[f.position];
    const zahlen = ungenutzt(f.route.schema)
      .map(
        (z) =>
          `<div class="zahl"><dt>${schuetze(z.was)}</dt><dd>${schuetze(z.wert)}</dd></div>`,
      )
      .join('');
    return `
      <article class="fall">
        <header class="fall-kopf">
          <h2>${schuetze(f.titel)}</h2>
          <p class="fall-unter">${schuetze(f.untertitel)}</p>
          <p class="daten">
            <span>Stufe ${f.route.stufe}</span>
            <span>${f.route.schritte.length} Schritte</span>
            <span>${Math.ceil(f.route.gehzeitSek / 60)} min</span>
            <span>Weg ${schuetze(folge(f.route.schema))}</span>
          </p>
        </header>

        <div class="geraet" role="img" aria-label="Navigationsansicht ${schuetze(f.bahnhofName)}">
          <div class="geraet-innen">${inhalt}</div>
        </div>

        <p class="schrittzeile">
          Schritt ${f.position + 1} von ${f.route.schritte.length}:
          <em>„${schuetze(schritt?.text ?? '')}"</em>
        </p>

        <section class="vorrat">
          <h3>Im Feld <code>schema</code> geliefert, im Bild nicht benutzt</h3>
          <dl>${zahlen}</dl>
        </section>
      </article>`;
  })
  .join('\n');

const html = `<title>Umstieg. Navigationsabzug</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* ============================================================
   1. Die App selbst - unveraendert aus dem Build uebernommen.
   ============================================================ */
${css('index.css')}
${css('App.css')}

/* ============================================================
   2. Die Mappe drumherum. Gehoert NICHT zur App.

   Bewusst eine einzige, dunkle Welt: Die Geraete sollen als Geraete
   lesbar sein, und dafuer braucht es einen Grund, der nicht selbst
   nach Bildschirm aussieht. Der Grund ist nicht neutralgrau, sondern
   zum Zinnober der App hin gewaermt.

   Die Schrift der Mappe ist Archivo - dieselbe wie in der App, weil
   die Identitaet der App gehoert. Die Messwerte tragen IBM Plex Mono:
   Zahlen, die untereinander stehen und verglichen werden, gehoeren in
   eine Instrumentenschrift.
   ============================================================ */
:root {
  --grund: #17130f;
  --grund-hoch: #211b16;
  --linie: #3b332b;
  --linie-leise: #2a2420;
  --tinte: #f1ece6;
  --tinte-leise: #a89d90;
  --tinte-still: #766c62;
  --zinnober: #ec3013;
  --mappe-serif: 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mappe-mono: 'IBM Plex Mono', ui-monospace, 'Cascadia Mono', Consolas, monospace;
}

body {
  margin: 0;
  background: var(--grund);
  color: var(--tinte);
  font-family: var(--mappe-serif);
  font-size: 16px;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

.mappe { max-width: 1180px; margin: 0 auto; padding: 0 24px 80px; }

/* — Kopf — */
.kopf {
  padding: 56px 0 28px;
  border-bottom: 1px solid var(--linie);
  display: grid;
  gap: 18px;
}
.eyebrow {
  font-family: var(--mappe-mono);
  font-size: 11px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--tinte-still);
  margin: 0;
}
.kopf h1 {
  font-size: clamp(30px, 4.4vw, 46px);
  font-weight: 800;
  letter-spacing: -.025em;
  line-height: 1.04;
  margin: 0;
  max-width: 18ch;
  text-wrap: balance;
}
.kopf h1 .zinn { color: var(--zinnober); }
.vorrede { display: grid; gap: 12px; max-width: 68ch; }
.vorrede p { margin: 0; color: var(--tinte-leise); }
.vorrede strong { color: var(--tinte); font-weight: 600; }
code {
  font-family: var(--mappe-mono);
  font-size: .86em;
  background: var(--linie-leise);
  border: 1px solid var(--linie);
  padding: .08em .38em;
  border-radius: 4px;
  color: var(--tinte);
}

/* — Der Befund: was das heutige Bild nicht kann. Keine Karten, eine
     Liste - es ist eine Aufzaehlung, kein Satz gleichrangiger Objekte. — */
.befund { padding: 34px 0 8px; display: grid; gap: 16px; }
.befund h2 {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--tinte-still);
  margin: 0;
}
.befund ol {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 0;
  max-width: 78ch;
  border-top: 1px solid var(--linie-leise);
}
.befund li {
  display: grid;
  grid-template-columns: 2.6rem 1fr;
  gap: 14px;
  padding: 14px 0;
  border-bottom: 1px solid var(--linie-leise);
  color: var(--tinte-leise);
}
.befund li b {
  font-family: var(--mappe-mono);
  font-size: 12px;
  font-weight: 500;
  color: var(--zinnober);
  padding-top: .2em;
  font-variant-numeric: tabular-nums;
}
.befund li span strong { color: var(--tinte); font-weight: 600; }

/* — Die Abzuege — */
.blatt {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(330px, 1fr));
  gap: 44px 34px;
  padding-top: 44px;
}
.fall { display: grid; gap: 14px; align-content: start; }
.fall-kopf { display: grid; gap: 4px; }
.fall-kopf h2 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -.015em;
}
.fall-unter { margin: 0; color: var(--tinte-leise); font-size: 14px; }
.daten {
  margin: 6px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-family: var(--mappe-mono);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.daten span {
  border: 1px solid var(--linie);
  border-radius: 999px;
  padding: 2px 9px;
  color: var(--tinte-leise);
}

/* Das Geraet. Der Rahmen ist ein Rahmen, kein Kaertchen: eine Kante,
   ein Radius, kein Schatten obendrauf - er soll die App halten, nicht
   mit ihr um Aufmerksamkeit ringen. */
.geraet {
  width: 100%;
  max-width: 360px;
  aspect-ratio: 360 / 740;
  border: 1px solid var(--linie);
  border-radius: 22px;
  background: var(--color-bg);
  overflow: hidden;
  box-shadow: 0 18px 44px rgb(0 0 0 / .38);
}
.geraet-innen { width: 100%; height: 100%; overflow: auto; }
/* Die App bringt ihre eigene Schrift und ihre eigenen Farben mit -
   die Mappe faerbt sie nicht um. */
.geraet-innen .app {
  font-family: var(--font-body);
  color: var(--color-text);
  min-height: 100%;
}

.schrittzeile {
  margin: 0;
  font-size: 13px;
  color: var(--tinte-leise);
  max-width: 44ch;
}
.schrittzeile em { color: var(--tinte); font-style: normal; }

/* Der Vorrat: was der Endpunkt liefert und das Bild wegwirft. Zahlen
   untereinander, Instrumentenschrift, keine Kacheln - es ist ein
   Messprotokoll. */
.vorrat { display: grid; gap: 8px; }
.vorrat h3 {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: .08em;
  text-transform: uppercase;
  color: var(--tinte-still);
}
.vorrat dl {
  margin: 0;
  display: grid;
  gap: 0;
  border-top: 1px solid var(--linie-leise);
}
.zahl {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 5px 0;
  border-bottom: 1px solid var(--linie-leise);
}
.zahl dt { margin: 0; font-size: 12.5px; color: var(--tinte-leise); }
.zahl dd {
  margin: 0;
  font-family: var(--mappe-mono);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  color: var(--tinte);
}

.fuss {
  margin-top: 52px;
  padding-top: 20px;
  border-top: 1px solid var(--linie);
  color: var(--tinte-still);
  font-size: 13px;
  max-width: 72ch;
  display: grid;
  gap: 8px;
}

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .001ms !important; transition-duration: .001ms !important; }
}
</style>

<div class="mappe">
  <header class="kopf">
    <p class="eyebrow">Umstieg. · Abzug vom 13.09.2026 · Zweig feat/mvp</p>
    <h1>Was die Navigation <span class="zinn">heute</span> zeichnet</h1>
    <div class="vorrede">
      <p>
        Drei Ansichten, gezeichnet mit den <strong>echten Komponenten dieses Builds</strong>
        (<code>Navigation</code>, <code>Ebenenschema</code>, <code>Schrittsheet</code>) und
        <strong>echten Routendaten</strong> aus der OSM-Ablage. Kein Nachbau, keine erfundenen
        Zahlen — jede Ziffer unten stammt aus einer gerechneten Route.
      </p>
      <p>
        Das Ebenenschema leitet sein Bild aus den <strong>Schritttexten</strong> ab
        (<code>schema/ableitung.ts</code>). Das Feld <code>schema</code>, das
        <code>/api/route</code> seit heute Vormittag mitliefert — Bahnsteige mit Länge und
        Querlage, Zugänge, begehbares Netz, Anlagen mit Grundriss —, kennt es nicht.
        Unter jedem Abzug steht, was dabei liegen bleibt.
      </p>
    </div>
  </header>

  <section class="befund">
    <h2>Was das heutige Bild nicht sagen kann</h2>
    <ol>
      <li><b>01</b><span>Die Bänder sind <strong>nach Höhe sortiert, nicht nach dem Weg</strong>. Wer hinunter in die Unterführung geht und wieder herauf, sieht zwei Bänder statt drei Besuchen — die Reihenfolge, der er folgt, fehlt.</span></li>
      <li><b>02</b><span>Ein Band ist <strong>ein Rechteck ohne Maß</strong>. Berlins 430-m-Bahnsteige und ein 80-m-Bahnsteig sehen gleich aus, und wo auf dem Bahnsteig jemand steht, ist nicht darstellbar.</span></li>
      <li><b>03</b><span><strong>Nur Ankunfts- und Abfahrtsgleis stehen im Bild.</strong> Die Nachbargleise fehlen, also auch die Antwort auf „an welchem Bahnsteig komme ich vorbei?".</span></li>
      <li><b>04</b><span><strong>Treppen und Rolltreppen sind ein Wort an einer Linie</strong>, kein Ort. Welche der vier Rolltreppen am Bahnsteig gemeint ist, sagt das Bild nicht.</span></li>
      <li><b>05</b><span><strong>Der Weg selbst wird nicht gezeichnet.</strong> Die gestrichelte Linie in der Mitte ist Dekoration, keine Geometrie.</span></li>
    </ol>
  </section>

  <div class="blatt">
${karten}
  </div>

  <footer class="fuss">
    <p>
      Die Abzüge sind statisches HTML: Die Knöpfe im Schrittblatt sind zu sehen, aber
      ohne Wirkung. Die Karte („Echte Karte anzeigen") bleibt zugeklappt — MapLibre
      wird in der App erst bei Bedarf geladen.
    </p>
    <p>
      Die Schrift <em>Archivo</em> kommt hier von Google Fonts, damit der Abzug so
      aussieht wie die App. <strong>Die App selbst liefert sie weiterhin lokal aus</strong>
      (<code>src/assets/fonts/</code>) — aus Datenschutzgründen, siehe Kommentar in
      <code>index.css</code>.
    </p>
  </footer>
</div>
`;

writeFileSync(ziel, html, 'utf8');
console.error(`${faelle.length} Abzüge → ${ziel} (${Math.round(html.length / 1024)} kB)`);
