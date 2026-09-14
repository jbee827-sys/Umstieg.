// Baut aus `dist-abzug/` EINE HTML-Datei, in der die App laeuft.
//
// Warum ueberhaupt: Ein Artefakt kann keine zweite Datei nachladen und keine
// fremde Adresse abrufen - weder das Backend noch Kartenkacheln. Der Abzug
// traegt deshalb alles bei sich: Bundle, Stilblatt, Schriften, und an der
// Stelle des Netzes ein AUFGEZEICHNETES Backend.
//
// Aufgezeichnet heisst aufgezeichnet: Die Routen kommen aus denselben
// Bausteinen wie `/api/route` (siehe `backend/scripts/routenabzug.ts`), die
// Zugtafeln sind echte Antworten des laufenden Backends. Nichts davon ist
// erfunden - ein erfundener Datensatz zeigt genau die Faelle nicht, an denen
// eine Ansicht scheitert.
//
// Aufruf: npx tsx scripts/app-abzug.ts <ziel.html> <routen-verzeichnis>
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const [ziel, routenDir] = process.argv.slice(2);
if (!ziel || !routenDir) {
  console.error('Aufruf: npx tsx scripts/app-abzug.ts <ziel.html> <routen-verzeichnis>');
  process.exit(2);
}

const dist = fileURLToPath(new URL('../dist-abzug/', import.meta.url));
const js = readFileSync(join(dist, 'app.js'), 'utf8');
const css = readFileSync(join(dist, 'app.css'), 'utf8');

/** Die Bahnhoefe, fuer die Routen aufgezeichnet sind. */
const BAHNHOEFE = [
  { name: 'Leipzig Hbf', eva: '8010205', lat: 51.3453, lon: 12.3814 },
  { name: 'Berlin Hbf', eva: '8011160', lat: 52.5251, lon: 13.3694 },
];

/** Dateiname → Schlüssel `eva|gleisAn|gleisAb|variante|abschnitt`. */
const PRAEFIX: Record<string, { eva: string; an: string; ab: string }> = {
  lz: { eva: '8010205', an: '6', ab: '16' },
  bl: { eva: '8011160', an: '14', ab: '6' },
};

const routen: Record<string, unknown> = {};
const tafeln: Record<string, unknown> = {};
for (const datei of readdirSync(routenDir)) {
  if (!datei.endsWith('.json')) continue;
  const inhalt = JSON.parse(readFileSync(join(routenDir, datei), 'utf8')) as unknown;
  const tafel = /^board-(\d+)-(arr|dep)\.json$/.exec(datei);
  if (tafel) {
    tafeln[`${tafel[1]}|${tafel[2]}`] = inhalt;
    continue;
  }
  const route = /^(lz|bl)-(schnellste|barrierefrei|mit-stopp)-(anfang|mitte|ende)\.json$/.exec(datei);
  if (!route) continue;
  const b = PRAEFIX[route[1]];
  routen[`${b.eva}|${b.an}|${b.ab}|${route[2]}|${route[3]}`] = inhalt;
}

const anzahlRouten = Object.keys(routen).length;
if (anzahlRouten === 0) {
  console.error(`Keine Routen in ${routenDir} gefunden.`);
  process.exit(1);
}

/**
 * Das aufgezeichnete Backend.
 *
 * Es setzt sich VOR `window.fetch`, statt die App umzubauen: So laeuft im
 * Abzug derselbe Code wie in der Auslieferung - dieselbe Fehlerbehandlung,
 * dieselben Ladezustaende, dieselben Statuscodes. Eine App, die fuer den
 * Abzug umgebaut wird, zeigt den Abzug, nicht die App.
 */
const stub = `
(function () {
  var ROUTEN = ${JSON.stringify(routen)};
  var TAFELN = ${JSON.stringify(tafeln)};
  var BAHNHOEFE = ${JSON.stringify(BAHNHOEFE)};

  function antwort(körper, status) {
    return Promise.resolve(new Response(JSON.stringify(körper), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  var echt = window.fetch.bind(window);
  window.fetch = function (eingabe, optionen) {
    var url = typeof eingabe === 'string' ? eingabe : (eingabe && eingabe.url) || '';
    if (url.indexOf('/api/') === -1) return echt(eingabe, optionen);
    var u = new URL(url, location.origin);
    var p = u.pathname;
    var q = u.searchParams;

    if (p === '/api/health') return antwort({ status: 'ok' });

    if (p === '/api/stations') {
      var suche = (q.get('q') || '').trim().toLowerCase();
      if (!suche) return antwort(BAHNHOEFE);
      return antwort(BAHNHOEFE.filter(function (b) {
        return b.name.toLowerCase().indexOf(suche) !== -1 || b.eva.indexOf(suche) === 0;
      }));
    }

    if (p.indexOf('/api/board/') === 0) {
      var eva = decodeURIComponent(p.slice('/api/board/'.length));
      return antwort(TAFELN[eva + '|' + (q.get('type') || 'dep')] || []);
    }

    if (p === '/api/route') {
      var schlüssel = [
        q.get('eva'), q.get('gleisAn'), q.get('gleisAb'),
        q.get('variante') || 'schnellste', q.get('abschnitt') || 'mitte',
      ].join('|');
      var treffer = ROUTEN[schlüssel];
      if (treffer) return antwort(treffer);
      return antwort({
        fehler: 'keine-route',
        detail: 'Für diese Kombination ist im Abzug keine Route aufgezeichnet. '
          + 'Aufgezeichnet sind Leipzig Hbf 6 → 16 und Berlin Hbf 14 → 6.',
      }, 404);
    }

    return antwort({ fehler: 'nicht-aufgezeichnet' }, 404);
  };

  // Der Live-Strom haengt an EventSource, nicht an fetch. Im Abzug gibt es
  // ihn nicht - er darf nur nicht werfen. Ein stiller Strom ist ausserdem
  // der ehrliche Zustand: Es kommen keine Meldungen, weil keine da sind.
  window.EventSource = function () {
    this.close = function () {};
    this.addEventListener = function () {};
    this.removeEventListener = function () {};
  };
})();
`;

const html = `<title>Umstieg. Abzug der App</title>
<style>
${css}

/* — Nur der Rahmen um den Abzug. Gehoert nicht zur App. — */
html, body { height: 100%; }
body { margin: 0; background: #17130f; }
.abzug-rahmen {
  min-height: 100%;
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 18px;
  padding: 22px 16px 26px;
  box-sizing: border-box;
  font-family: 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif;
  color: #a89d90;
}
.abzug-kopf { max-width: 900px; margin: 0 auto; width: 100%; display: grid; gap: 8px; }
.abzug-kopf h1 {
  margin: 0; color: #f1ece6; font-size: 19px; font-weight: 800; letter-spacing: -.02em;
}
.abzug-kopf p { margin: 0; font-size: 13px; line-height: 1.5; max-width: 72ch; }
.abzug-kopf strong { color: #f1ece6; font-weight: 600; }
.abzug-kopf code {
  font-family: ui-monospace, Consolas, monospace; font-size: .86em;
  background: #2a2420; border: 1px solid #3b332b; padding: .08em .38em; border-radius: 4px;
}
.abzug-marken { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; }
.abzug-marken span {
  border: 1px solid #3b332b; border-radius: 999px; padding: 2px 9px;
  font-variant-numeric: tabular-nums;
}
.abzug-buehne { display: grid; place-items: start center; }
/* Das Geraet ist ein Rahmen, kein Kaertchen: eine Kante, ein Radius. */
#root {
  width: min(100%, 402px);
  height: min(calc(100vh - 190px), 874px);
  min-height: 560px;
  overflow: auto;
  background: var(--color-bg);
  color: var(--color-text);
  border: 1px solid #3b332b;
  border-radius: 24px;
  box-shadow: 0 20px 50px rgb(0 0 0 / .42);
}
</style>

<div class="abzug-rahmen">
  <header class="abzug-kopf">
    <h1>Umstieg. — die App, wie sie heute gebaut ist</h1>
    <p>
      Der <strong>echte Bundle</strong> dieses Zweigs (<code>feat/mvp</code>), in eine Datei
      gelegt. Bedienbar: Bahnhof suchen, Gleise eintragen, Zug wählen, Route rechnen,
      Standort am Ankunftsgleis wechseln, durch die Schritte tippen.
    </p>
    <p>
      An der Stelle des Backends stehen <strong>aufgezeichnete echte Antworten</strong> —
      ${anzahlRouten} Routen aus denselben Bausteinen wie <code>/api/route</code>, dazu echte
      Zugtafeln. Aufgezeichnet sind <strong>Leipzig Hbf 6 → 16</strong> (der Kopfbahnhof) und
      <strong>Berlin Hbf 14 → 6</strong> (fünf Ebenen). Andere Gleispaare antworten mit 404 —
      das ist der Abzug, nicht die App.
    </p>
    <p>
      Kein Live-Strom, kein GPS, keine Kartenkacheln: Ein Artefakt darf keine fremde Adresse
      abrufen. <strong>Der Stand in Produktion ist ein anderer</strong> — <code>main</code>
      steht 11 Commits zurück.
    </p>
    <div class="abzug-marken">
      <span>Zweig feat/mvp</span>
      <span>13.09.2026</span>
      <span>${anzahlRouten} Routen</span>
      <span>${Math.round((js.length + css.length) / 1024)} kB Bundle</span>
    </div>
  </header>
  <div class="abzug-buehne"><div id="root"></div></div>
</div>

<script>${stub}</script>
<script type="module">${js}</script>
`;

writeFileSync(ziel, html, 'utf8');
console.error(
  `Abzug → ${ziel} (${Math.round(html.length / 1024)} kB · ${anzahlRouten} Routen · ${
    Object.keys(tafeln).length
  } Tafeln)`,
);
