// Die Planmappe: das Ebenenschema, gezeichnet von den ECHTEN Komponenten mit
// ECHTEN Routen - für die Durchsicht des Entwurfs, nicht für die Auslieferung.
//
// Aufruf: npx tsx --tsconfig tsconfig.app.json scripts/design-mappe.tsx <ziel.html> <routen-verzeichnis>
// Die Routen zieht `backend/scripts/routenabzug.ts` aus der OSM-Ablage.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Navigation } from '../src/screens/Navigation';
import { besuchJeSchritt, ebenenLabel, wegLaengeM } from '../src/schema/bandmodell';
import type { RouteErgebnis } from '../src/api/typen';

const [ziel, routen] = process.argv.slice(2);
if (!ziel || !routen) {
  console.error('Aufruf: npx tsx --tsconfig tsconfig.app.json scripts/design-mappe.tsx <ziel.html> <routen-verzeichnis>');
  process.exit(2);
}

interface Blatt {
  datei: string;
  bahnhof: string;
  an: string;
  ab: string;
  standort: 'Anfang' | 'Mitte' | 'Ende';
  /** Welcher Ebenenbesuch aktiv ist - 0 = Ankunft. */
  besuch: number;
  notiz: string;
}

const GRUPPEN: { titel: string; text: string; blaetter: Blatt[] }[] = [
  {
    titel: 'Leipzig Hbf, Gleis 6 → 16',
    text:
      'Derselbe Umstieg, drei Standorte am Ankunftsgleis. Der Kopfbahnhof bietet zwei Wege: die U-Form über den Querbahnsteig und die Unterführung am anderen Ende. Das Band mit dem Ankunftsgleis zeigt seit dem 14.09. abends keinen Weg mehr: den Punkt, an dem man steht, die Treppe als rote Scheibe am Zugang – und die übrigen Anlagen als Symbole.',
    blaetter: [
      { datei: 'lz-schnellste-anfang.json', bahnhof: 'Leipzig Hbf', an: '6', ab: '16', standort: 'Anfang', besuch: 0, notiz: 'Die Treppe hinunter liegt 32 m vom Anfang; die Scheibe sitzt im Balken, beschriftet mit Richtung und Meter.' },
      { datei: 'lz-schnellste-mitte.json', bahnhof: 'Leipzig Hbf', an: '6', ab: '16', standort: 'Mitte', besuch: 0, notiz: 'Seit der Kettenkorrektur gewinnt auch ab der Mitte die Unterführung: 323 s statt 354 s über den Kopf.' },
      { datei: 'lz-schnellste-ende.json', bahnhof: 'Leipzig Hbf', an: '6', ab: '16', standort: 'Ende', besuch: 0, notiz: 'Eine Ebene, keine Treppe: im Bild nur Start und Ziel. Die U-Form um den Kopf steht in den drei Schritten.' },
    ],
  },
  {
    titel: 'Unterwegs und in der Tiefe',
    text:
      'Das aktive Band ist der Besuch, auf dem der Reisende gerade steht; die übrigen schrumpfen auf eine Zeile. Übergangsebenen behalten den Weg als Linie – dort gibt es keinen Bahnsteig, an dem sich ein Punkt festhalten ließe – und zeigen die Anlagen, die der Weg nicht nimmt, grau auf hellem Schild.',
    blaetter: [
      { datei: 'lz-schnellste-mitte.json', bahnhof: 'Leipzig Hbf', an: '6', ab: '16', standort: 'Mitte', besuch: 1, notiz: 'Zweites Band: die Unterführung. Angekommen über die Treppe hinunter (Ring), weiter über die Treppe hinauf (Scheibe).' },
      { datei: 'bl-schnellste-mitte.json', bahnhof: 'Berlin Hbf', an: '14', ab: '6', standort: 'Mitte', besuch: 2, notiz: 'Ebene 0: Der Weg läuft hinaus und kommt fast an derselben Stelle zurück – die Rolltreppen liegen hintereinander.' },
      { datei: 'bl-schnellste-mitte.json', bahnhof: 'Berlin Hbf', an: '14', ab: '6', standort: 'Mitte', besuch: 4, notiz: 'Ebene −2 kreuzt die Ankunftsebene um 81°; im Bild waagerecht. Gleis 5/6 trägt seine Zugänge als Symbole, das Ziel als Scheibe.' },
      { datei: 'ffm-1-104-mitte.json', bahnhof: 'Frankfurt (Main) Hbf', an: '1', ab: '104', standort: 'Mitte', besuch: 0, notiz: 'Vom Kopfbahnsteig in den S-Bahn-Tunnel: 423 s Spanne zwischen Anfang und Ende.' },
    ],
  },
  {
    titel: 'München Hbf, Gleis 5 → 82',
    text:
      'Das Beispiel, an dem der Zickzack auffiel. Die Linie über 17 gestauchte Bahnsteige gibt es nicht mehr; der Weg über den Kopf des Holzkirchner Flügelbahnhofs steht im Text – geglättet, 11 statt 23 Schritte. Das Routing war dabei nie falsch: Keine erzwungene Alternative ist schneller.',
    blaetter: [
      { datei: 'muc-5-82-anfang.json', bahnhof: 'München Hbf', an: '5', ab: '82', standort: 'Anfang', besuch: 0, notiz: 'Der Punkt am Anfang von 5/6, die Rolltreppe am Querbahnsteig als Scheibe. 625 s – der Anfang gewinnt gegen 944 s vom Ende.' },
      { datei: 'muc-5-82-anfang.json', bahnhof: 'München Hbf', an: '5', ab: '82', standort: 'Anfang', besuch: 1, notiz: 'Die Unterführung −1: Rolltreppen und Treppen, die sich überdecken würden, stehen als EIN Schild.' },
      { datei: 'muc-5-82-anfang.json', bahnhof: 'München Hbf', an: '5', ab: '82', standort: 'Anfang', besuch: 2, notiz: '22 Anlagen an fünf Stellen, als Symbole; das Ziel bei 117 m trägt die Rolltreppe, über die man ankommt.' },
    ],
  },
];

function css(datei: string): string {
  return readFileSync(fileURLToPath(new URL(`../src/${datei}`, import.meta.url)), 'utf8')
    // Die App liefert Archivo lokal aus; im Abzug gibt es die Dateien nicht.
    .replace(/@font-face\s*\{[^}]*\}/g, '');
}

function schuetze(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ebenenfolge(route: RouteErgebnis): string {
  return (route.schema?.ebenen ?? []).map((e) => ebenenLabel(e.level).replace('EBENE ', '')).join(' → ');
}

let nummer = 0;
const gesamt = GRUPPEN.reduce((s, g) => s + g.blaetter.length, 0);

function blatt(b: Blatt): string {
  nummer++;
  const route = JSON.parse(readFileSync(join(routen, b.datei), 'utf8')) as RouteErgebnis;
  delete route.karte;
  const zuordnung = besuchJeSchritt(route.schritte);
  const position = Math.max(0, zuordnung.indexOf(b.besuch));
  const meter = (route.schema?.ebenen ?? []).reduce((s, e) => s + wegLaengeM(e.weg), 0);
  const app = renderToStaticMarkup(
    createElement(
      'main',
      { className: 'app' },
      createElement(Navigation, {
        route,
        gleisAn: b.an,
        gleisAb: b.ab,
        bahnhofName: b.bahnhof,
        position,
        standort: null,
        onZurueck: () => undefined,
        onWeiter: () => undefined,
        onAngekommen: () => undefined,
      }),
    ),
  );
  const feld = (name: string, wert: string, breit = false) =>
    `<div class="sf-feld${breit ? ' breit' : ''}"><dt>${name}</dt><dd>${schuetze(wert)}</dd></div>`;
  return `
    <figure class="mp-blatt">
      <div class="mp-geraet" role="img" aria-label="Navigationsansicht ${schuetze(b.bahnhof)}, Gleis ${b.an} nach ${b.ab}, Standort ${b.standort}">${app}</div>
      <figcaption class="mp-schriftfeld">
        <dl>
          ${feld('Bahnhof', b.bahnhof, true)}
          ${feld('Gleis', `${b.an} → ${b.ab}`)}
          ${feld('Standort', b.standort)}
          ${feld('Gehzeit', `${route.gehzeitSek} s`)}
          ${feld('Weg', `${meter} m`)}
          ${feld('Ebenenfolge', ebenenfolge(route), true)}
          ${feld('Schritt', `${position + 1} / ${route.schritte.length}`)}
          ${feld('Blatt', `${nummer} / ${gesamt}`)}
        </dl>
        <p class="sf-notiz">${schuetze(b.notiz)}</p>
      </figcaption>
    </figure>`;
}

const gruppen = GRUPPEN.map(
  (g) => `
  <section class="mp-gruppe">
    <header class="mp-gruppenkopf">
      <h2>${schuetze(g.titel)}</h2>
      <p>${schuetze(g.text)}</p>
    </header>
    <div class="mp-blaetter">${g.blaetter.map(blatt).join('')}</div>
  </section>`,
).join('');

const BEFUND: [string, string, string][] = [
  ['Lauf 4 über die ganze Ablage', '—', '2082 Routen · 111 Bahnhöfe (19 groß · 60 mittel · 32 klein)'],
  ['Befunde im Routing (Schema, Markierung, Schritte)', '—', '1 Route (Düsseldorf, Wegzerlegung +5 m)'],
  ['Alternativen schneller als die gewählte', '0 von 1086', '0 von 1176'],
  ['Bildstufe: Befunde', '344 Routen · 67 Bahnhöfe (erster Symbolsatz)', '0'],
  ['Symbolschilder, die sich überdecken', '846 Paare', '0'],
  ['Schritte je Route (Median, 951 Routen)', '11', '6'],
  ['„wenige Meter" gesamt', '5468', '813'],
  ['Bekannte Werte nachgerechnet', '—', '22 von 23 exakt oder schneller'],
];

const OFFEN: [string, string][] = [
  ['Stumme Treppen', '195 Routen an 19 Bahnhöfen nehmen eine Treppe oder Rampe, ohne dass der Graph einen Ebenenwechsel kennt. Im Bild erscheinen sie nicht als Scheibe; im Text schon.'],
  ['Umwege, andere Ursache', '6 Bahnhöfe mit Umwegen zu einem Zugang: Bielefeld, Bonn, Gütersloh, Schwerin, Wittenberge, Berlin-Spandau (Treppe an Gleis 3 unerreichbar).'],
  ['Düsseldorf Hbf 1 → 20', 'Die Wegzerlegung des Schemas misst 236 statt 231 m – 5 m über der Toleranz. Nicht aus dem Symbolumbau; ungeklärt.'],
  ['Braunschweig barrierefrei', '192 s offline gegen 191 s, am 07.09. gegen die Produktion gemessen (mit FaSta). Nicht dieselbe Messung – ohne Treppe ist die Route in beiden.'],
  ['Was „Anfang" heißt', 'Anfang und Ende folgen der Zeichenrichtung in OSM. Das Bild legt den Anfang immer links, die Knöpfe sagen aber nicht, welches Ende das im Bahnhof ist.'],
  ['Nicht deployt', 'Committet auf feat/mvp, nicht gepusht; die Produktion zeigt den Stand vom 07.09.'],
];

const html = `<title>Planmappe Ebenenschema</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800&family=Barlow+Semi+Condensed:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* ——— 1. Die App, unverändert aus dem Quelltext ——— */
${css('index.css')}
${css('App.css')}

/* ——— 2. Die Mappe. Gehört NICHT zur App. ———
   Ein Planblatt: grünstichiges Papier, Graphit, Schriftfelder wie auf einer
   technischen Zeichnung. Rot nur, wo die App es für die Route benutzt. */
:root {
  --mp-papier: #eceeeb;
  --mp-blatt: #f6f7f5;
  --mp-tinte: #1c2124;
  --mp-graphit: #5d6468;
  --mp-linie: #c9cec9;
  --mp-rot: #c42a10;
  --mp-schatten: rgb(28 33 36 / .10);
  --mp-titel: 'Barlow Semi Condensed', 'Arial Narrow', system-ui, sans-serif;
  --mp-text: 'Barlow', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --mp-mono: 'IBM Plex Mono', ui-monospace, Consolas, monospace;
  --font-body: 'Archivo', system-ui, -apple-system, 'Segoe UI', sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --mp-papier: #151a1c;
    --mp-blatt: #1c2225;
    --mp-tinte: #e3e7e5;
    --mp-graphit: #9aa3a6;
    --mp-linie: #2f373a;
    --mp-rot: #ff6a4d;
    --mp-schatten: rgb(0 0 0 / .45);
  }
}
:root[data-theme="dark"] {
  --mp-papier: #151a1c;
  --mp-blatt: #1c2225;
  --mp-tinte: #e3e7e5;
  --mp-graphit: #9aa3a6;
  --mp-linie: #2f373a;
  --mp-rot: #ff6a4d;
  --mp-schatten: rgb(0 0 0 / .45);
}

html, body { margin: 0; background: var(--mp-papier); }
body { color: var(--mp-tinte); font-family: var(--mp-text); font-size: 16px; line-height: 1.55; -webkit-font-smoothing: antialiased; }

.mp { max-width: 1260px; margin: 0 auto; padding-inline: 20px; padding-block: 48px 72px; display: grid; gap: 56px; }

.mp-kopf { display: grid; gap: 14px; border-bottom: 2px solid var(--mp-tinte); padding-bottom: 28px; }
.mp-marke { margin: 0; font-family: var(--mp-mono); font-size: 12px; color: var(--mp-graphit); letter-spacing: .02em; }
.mp-kopf h1 { margin: 0; font-family: var(--mp-titel); font-weight: 700; font-size: clamp(38px, 6vw, 64px); line-height: .98; letter-spacing: -.01em; text-wrap: balance; }
.mp-these { margin: 0; max-width: 64ch; font-size: 17px; color: var(--mp-tinte); }
.mp-these em { font-style: normal; color: var(--mp-rot); font-weight: 600; }

.mp-gruppe { display: grid; gap: 22px; }
.mp-gruppenkopf { display: grid; gap: 6px; max-width: 70ch; }
.mp-gruppenkopf h2, .mp-abschnitt h2 { margin: 0; font-family: var(--mp-titel); font-weight: 600; font-size: 26px; line-height: 1.1; letter-spacing: .005em; text-wrap: balance; }
.mp-gruppenkopf p { margin: 0; color: var(--mp-graphit); }

.mp-blaetter { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 384px), 1fr)); gap: 36px 28px; align-items: start; }
.mp-blatt { margin: 0; display: grid; gap: 0; justify-items: center; }
.mp-geraet {
  width: min(100%, 384px); box-sizing: border-box;
  background: var(--color-bg); color: var(--color-text);
  border: 1px solid var(--mp-linie); border-bottom: none; border-radius: 22px 22px 0 0;
  box-shadow: 0 14px 34px var(--mp-schatten);
  padding: 10px 12px 14px; overflow: hidden;
}
.mp-geraet .app { font-family: var(--font-body); color: var(--color-text); padding: 0; margin: 0; min-height: 0; max-width: none; }

/* Das Schriftfeld: Rahmen und Felder wie auf einer Zeichnung. */
.mp-schriftfeld { width: min(100%, 384px); box-sizing: border-box; background: var(--mp-blatt); border: 1.5px solid var(--mp-tinte); }
.mp-schriftfeld dl { margin: 0; display: grid; grid-template-columns: repeat(4, 1fr); }
.sf-feld { margin: 0; padding: 5px 8px 6px; border-right: 1px solid var(--mp-tinte); border-bottom: 1px solid var(--mp-tinte); min-width: 0; }
.sf-feld:nth-child(4n) { border-right: none; }
.sf-feld.breit { grid-column: span 2; }
.sf-feld dt { font-family: var(--mp-titel); font-weight: 600; font-size: 10px; letter-spacing: .09em; text-transform: uppercase; color: var(--mp-graphit); }
.sf-feld dd { margin: 1px 0 0; font-family: var(--mp-mono); font-size: 13px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.sf-notiz { margin: 0; padding: 8px 10px 10px; font-size: 13.5px; line-height: 1.45; color: var(--mp-tinte); }

.mp-abschnitt { display: grid; gap: 16px; }
.mp-tabelle { overflow-x: auto; }
.mp-tabelle table { border-collapse: collapse; min-width: 560px; width: 100%; max-width: 900px; }
.mp-tabelle th, .mp-tabelle td { text-align: left; padding: 8px 14px 8px 0; border-bottom: 1px solid var(--mp-linie); vertical-align: top; }
.mp-tabelle thead th { font-family: var(--mp-titel); font-weight: 600; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: var(--mp-graphit); border-bottom: 1.5px solid var(--mp-tinte); }
.mp-tabelle td:not(:first-child) { font-family: var(--mp-mono); font-size: 13.5px; font-variant-numeric: tabular-nums; }
.mp-tabelle td.jetzt { color: var(--mp-tinte); font-weight: 500; }
.mp-tabelle td.vorher { color: var(--mp-graphit); }

.mp-offen { margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 1fr)); gap: 0 32px; }
.mp-offen li { display: grid; gap: 4px; padding: 12px 0 14px; border-top: 1px solid var(--mp-linie); }
.mp-offen b { font-family: var(--mp-titel); font-weight: 600; font-size: 17px; }
.mp-offen span { color: var(--mp-graphit); font-size: 14.5px; max-width: 60ch; }

.mp-fuss { margin: 0; font-size: 13px; color: var(--mp-graphit); max-width: 72ch; border-top: 1px solid var(--mp-linie); padding-top: 16px; }
.mp-fuss code { font-family: var(--mp-mono); font-size: .9em; }
</style>

<div class="mp">
  <header class="mp-kopf">
    <p class="mp-marke">Umstieg. · Navigation, Screen 3 · Stand 14.09.2026, abends · Zweig feat/mvp, nicht deployt</p>
    <h1>Planmappe Ebenenschema</h1>
    <p class="mp-these">
      Ein Band je Ebenen<em>besuch</em>, in der Reihenfolge des Wegs. Auf dem Band mit Ankunfts- und Abfahrtsgleis
      steht kein Weg mehr – nur der Standort, die Stelle, an der es die Ebene wechselt, und das Ziel. Rolltreppe,
      Treppe und Aufzug stehen als Symbole im Bahnsteig, im Grundriss und neben den Schritten. Alle Geräte unten sind
      die echten Komponenten dieses Zweigs mit echten Routen aus der OSM-Ablage.
    </p>
  </header>

  ${gruppen}

  <section class="mp-abschnitt">
    <h2>Was die Simulation zeigt</h2>
    <div class="mp-tabelle">
      <table>
        <thead><tr><th scope="col">Prüfung</th><th scope="col">Vorher</th><th scope="col">Jetzt</th></tr></thead>
        <tbody>
          ${BEFUND.map(([a, v, j]) => `<tr><td>${schuetze(a)}</td><td class="vorher">${schuetze(v)}</td><td class="jetzt">${schuetze(j)}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  </section>

  <section class="mp-abschnitt">
    <h2>Offen</h2>
    <ul class="mp-offen">
      ${OFFEN.map(([t, x]) => `<li><b>${schuetze(t)}</b><span>${schuetze(x)}</span></li>`).join('')}
    </ul>
  </section>

  <p class="mp-fuss">
    Statisches HTML: Die Knöpfe im Schrittblatt sind sichtbar, aber ohne Wirkung. Archivo kommt hier von Google
    Fonts, damit der Abzug aussieht wie die App; die App selbst liefert die Schrift lokal aus. Erzeugt mit
    <code>frontend/scripts/design-mappe.tsx</code>.
  </p>
</div>
`;

writeFileSync(ziel, html, 'utf8');
console.error(`${gesamt} Blätter → ${ziel} (${Math.round(html.length / 1024)} kB)`);
