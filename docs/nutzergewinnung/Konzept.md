# Konzept Nutzergewinnung – Umsetzungsprogramm

Stand: 21.10.2026 · Grundlage: Analyse vom 16.10.2026 (Projektablage `analysen/nutzergewinnung-umstieg.md`), Code-Stand `2552618`
Zieldokument für die Umsetzung mit Claude Code. Jedes Arbeitspaket ist für sich abnehmbar und wird als eigener Commit (oder kleine Commit-Folge) auf `feat/mvp` ausgeliefert.

---

## 1. Ausgangslage und Problem

### 1.1 Die Seite wird kaum gefunden

Vercel Web Analytics weist für den 28.08. bis 20.09.2026 78 Besucher und 114 Aufrufe aus, davon nur 9 Verweise über google.com (`BRIEF.md`, Abschnitt 3). Der plausible echte Kern aus der Zielgruppe liegt bei 21 Besuchern. Ohne Maßnahmen ist kein nennenswertes Wachstum zu erwarten, da Suchmaschinen kaum Inhalte vorfinden und der Bedarf an Umstiegshilfe erst im Bahnhof entsteht, wo niemand nach einer neuen Web-App sucht.

### 1.2 Auffindbarkeit durch JavaScript

Umstieg. ist eine reine React-Einseiten-App. Das ausgelieferte HTML (`frontend/index.html`) enthält außer `<title>Umstieg.</title>`, der Beschreibung und den Open-Graph-Angaben nur ein leeres `<div id="root">`. Der gesamte sichtbare Inhalt entsteht erst im Browser per JavaScript. Daraus folgen drei Probleme:

1. **Google** rendert JavaScript zwar, stellt die Seite dafür aber in eine eigene Warteschlange und indexiert nur, was nach dem Rendern als wertvoll erscheint. Eine Eingabemaske ohne Text gilt nicht als wertvoll.
2. **KI-Suchen** (GPTBot, ClaudeBot, PerplexityBot) führen laut Vercel/MERJ („The rise of the AI crawler", 17.12.2024) überhaupt kein JavaScript aus. Für ChatGPT, Claude und Perplexity ist Umstieg. derzeit eine leere Seite.
3. **Es gibt keine Inhalte je Bahnhof.** Suchanfragen wie „Umsteigen Hannover Hbf" oder „Köln Hbf Gleis 1 nach Gleis 11" können auf keine Seite von Umstieg. treffen. bahnhof.de beantwortet sie mit pauschalen Umsteigezeiten (z. B. „mit Gepäck von Gleis 3 zu Gleis 12 mindestens 15 Minuten"), aber ohne Gehzeit je Gleispaar und ohne Ebenenwechsel. Genau diese Lücke kann Umstieg. aus dem eigenen Routing füllen.

### 1.3 Weitere technische Lücken

| Punkt | Befund im Code |
|---|---|
| `robots.txt`, `sitemap.xml` | fehlen in `frontend/public/` |
| Kanonische Adresse | fest auf `https://www.umstieg.online/` in `index.html` – jede künftige Unterseite würde sich damit selbst als Kopie der Startseite ausweisen |
| Bildschirm-Adressen | seit 11.10.2026 echte Pfade (`frontend/src/navigation/adressen.ts`: `/eingabe`, `/uebersicht`, `/weg`, `/meldungen`, `/angekommen`) |
| Rechtsseiten | laufen weiter über `#impressum` und `#datenschutz` (`frontend/src/components/Fusszeile.tsx`, `App.tsx:342-350`) – für Google keine eigenen Seiten, für die Messung unsichtbar |
| Messpunkte | keine eigenen Ereignisse; `@vercel/analytics` sieht nur Seitenaufrufe, eigene Ereignisse sind im Gratistarif nicht abrufbar (HTTP 402) |
| Suchergebnis-Text | Titel „Umstieg." sagt nichts über den Nutzen; die Beschreibung ist sachlich richtig, aber kurz und ohne Handlungsaufforderung |

---

## 2. Ziele und Abnahme

| Ziel | Messbar an |
|---|---|
| Google und KI-Crawler finden Text ohne JavaScript | `curl -s https://www.umstieg.online/ \| grep` findet den Nutzentext; ebenso für jede Bahnhofsseite |
| Suchergebnis beschreibt den Nutzen | Titel und Beschreibung nach Abschnitt 4 live; Vorschau in der Search Console geprüft |
| Alle öffentlichen Seiten haben eigene Adressen | `/impressum`, `/datenschutz`, `/bahnhoefe`, `/bahnhof/<name>` liefern HTTP 200 mit eigenem `<title>` und eigener kanonischer Adresse |
| Suchmaschinen kennen alle Seiten | `sitemap.xml` live, in der Search Console eingereicht, Indexierungsbericht zeigt die Bahnhofsseiten |
| Der Nutzerweg ist messbar | Die vier Messpunkte aus `BRIEF.md` (Eingabe abgeschlossen, Navigation gestartet, Schritt 1 erreicht, Ziel erreicht) sind im Vercel-Dashboard ablesbar |

---

## 3. Grundsätze für die Umsetzung

- **Keine Zusatzkosten.** Kein Server-Rendering-Dienst, kein Wechsel zu Next.js. Alle neuen Seiten entstehen beim Build als statisches HTML und werden von Vercel als Dateien ausgeliefert.
- **Nichts an der App brechen.** Die App unter `/` und den fünf Bildschirm-Pfaden bleibt unverändert; die neuen Seiten liegen daneben.
- **CSP beachten.** `vercel.json` erlaubt `script-src 'self'` und `style-src 'self'`. Statische Seiten verwenden daher keine Inline-Stile und kein Inline-Skript, sondern eine gemeinsame CSS-Datei aus `/assets/`. JSON-LD (`<script type="application/ld+json">`) ist ein Datenblock und wird von der CSP nicht blockiert, dennoch vor Auslieferung im Browser prüfen.
- **Datenschutz.** Neue Messpunkte senden keine Bahnhofsnamen, Gleise oder Koordinaten, sondern nur den Ereignisnamen. `Datenschutz.tsx` und `Datenschutz.test.tsx` werden im selben Commit angepasst.
- **Lizenz.** Die Gehzeiten beruhen auf OpenStreetMap-Daten (ODbL). Jede Bahnhofsseite trägt den Hinweis „Kartendaten © OpenStreetMap-Mitwirkende" mit Link auf `https://www.openstreetmap.org/copyright`.
- **Prüfen vor jedem Push.** In `backend/` und `frontend/` jeweils `npm test && npm run lint`, im Frontend zusätzlich `npm run build`. In der Cloud-Sitzung scheitern zwei Tests in `backend/test/listen.test.ts` umgebungsbedingt (kein IPv6); das ist kein Fehler des Codes.
- **Design.** Neue Seiten folgen `design/DESIGN.md` (Farben, Schrift Archivo, hoher Kontrast, Dunkelmodus über `prefers-color-scheme`).

---

## 4. Text im Suchergebnis

Google zeigt unter dem Link meist den Inhalt von `<meta name="description">` und als Überschrift den `<title>`. Beide werden neu gefasst. Richtwerte: Titel bis etwa 60 Zeichen, Beschreibung bis etwa 155 Zeichen, sonst kürzt Google.

### 4.1 Startseite

```html
<title>Umstieg. – Der Weg von Gleis zu Gleis beim Umsteigen</title>
<meta name="description" content="Ankunftsgleis und Abfahrtsgleis eingeben: Umstieg. zeigt den Weg durch den Bahnhof mit Treppen, Aufzügen und Gehzeit und sagt, ob der Anschluss klappt." />
```

Titel 52 Zeichen, Beschreibung 151 Zeichen. `og:title`, `og:description` und `twitter:*` erhalten denselben Text.

### 4.2 Bahnhofsseiten (Vorlage)

```html
<title>Umsteigen in {Name}: Gehzeit von Gleis zu Gleis</title>
<meta name="description" content="Wie lange dauert der Umstieg in {Name}? Gehzeiten für alle Gleispaare, mit Treppen, Aufzügen und Ebenen. Kostenlos und ohne Anmeldung." />
```

Für „Hannover Hbf" ergibt das 53 bzw. 140 Zeichen. Bei langen Namen (über 25 Zeichen) wird der Zusatz nach dem Doppelpunkt auf „Gehzeit je Gleis" gekürzt; ein Test hält die Titellänge unter 65 Zeichen.

### 4.3 Übersichtsseite und Rechtsseiten

- `/bahnhoefe`: „Umsteigezeiten für 382 Bahnhöfe in Deutschland | Umstieg." · Beschreibung: „Gehzeiten von Gleis zu Gleis für große und mittlere Bahnhöfe in Deutschland, mit Treppen, Aufzügen und stufenfreien Wegen."
- `/impressum`, `/datenschutz`: „Impressum | Umstieg." bzw. „Datenschutz | Umstieg.", ohne eigene Beschreibung.

Die Anzahl 382 wird beim Build aus dem tatsächlich erzeugten Bestand eingesetzt, nicht fest geschrieben.

---

## 5. Arbeitspakete

Reihenfolge nach Aufwand und Wirkung. AP 1 bis AP 4 sind klein und schaffen die Voraussetzungen; AP 5 ist der eigentliche Hebel.

### AP 1 – Suchergebnis-Text und Vortext ohne JavaScript

**Ziel:** Die Startseite trägt den Text aus 4.1 und einen kurzen, auch ohne JavaScript lesbaren Vortext.

1. `frontend/index.html`: Titel, Beschreibung, `og:*` und `twitter:*` nach 4.1 setzen.
2. In `<div id="root">` einen statischen Vortext einfügen: eine Überschrift (`<h1>Der Weg von Gleis zu Gleis beim Umsteigen</h1>`), zwei bis drei Sätze zum Nutzen (Wagenposition, Treppe/Aufzug/Unterführung, Restzeit) und einen Link auf `/bahnhoefe`. `createRoot().render()` ersetzt diesen Inhalt beim Start; Nutzer sehen ihn nur ohne JavaScript oder für einen Augenblick beim Laden. Gestaltung so, dass kein sichtbares Springen entsteht (gleiche Hintergrundfarbe, Text dezent).
3. JSON-LD `WebApplication` mit `name`, `url`, `description`, `applicationCategory: "TravelApplication"`, `operatingSystem: "Web"`, `offers.price: 0`, `inLanguage: "de"`.
4. Test (Vitest, liest `index.html` als Text): Titel ≤ 60 Zeichen, Beschreibung ≤ 155 Zeichen, `og:description` = `description`, Vortext enthält das Wort „Gleis".

**Abnahme:** `curl -s https://www.umstieg.online/ | grep -c "von Gleis zu Gleis"` ≥ 2.

### AP 2 – `robots.txt`, `sitemap.xml`, kanonische Adressen

1. `frontend/public/robots.txt`:
   ```
   User-agent: *
   Allow: /
   Disallow: /uebersicht
   Disallow: /weg
   Disallow: /meldungen
   Disallow: /angekommen

   Sitemap: https://www.umstieg.online/sitemap.xml
   ```
   Die vier gesperrten Pfade zeigen ohne gespeicherte Reise nur die Eingabe und wären doppelte Inhalte. KI-Crawler werden ausdrücklich nicht ausgesperrt.
2. `sitemap.xml` wird beim Build erzeugt (Skript aus AP 5, Abschnitt 5c), nicht von Hand gepflegt. Inhalt: `/`, `/bahnhoefe`, alle `/bahnhof/<name>`, `/impressum`, `/datenschutz`, jeweils mit `lastmod` (bei Bahnhofsseiten das `geholtAm` des OSM-Eintrags).
3. Kanonische Adresse: Die feste Angabe in `index.html` bleibt für `/`. Jede statische Seite setzt ihre eigene. Für die App-Pfade `/eingabe` usw. zeigt die kanonische Adresse weiterhin auf `/`.
4. `vercel.json` prüfen: Vercel liefert vorhandene Dateien vor der Umschreibung `/(.*) → /index.html` aus. Sicherstellen, dass `/bahnhof/hannover-hbf` die Datei `bahnhof/hannover-hbf/index.html` trifft (ggf. `"trailingSlash": false` setzen) und unbekannte `/bahnhof/...` weiter auf die App fallen. Test über `vercel dev` oder die Vorschau-Adresse.

**Abnahme:** `/robots.txt` und `/sitemap.xml` liefern HTTP 200 mit den erwarteten Einträgen; die Sitemap besteht die Prüfung in der Search Console (AP 6).

### AP 3 – Echte Adressen für die Rechtsseiten

Die Bildschirme haben seit 11.10.2026 echte Pfade. Offen sind Impressum und Datenschutz.

1. `PFAD` in `frontend/src/navigation/adressen.ts` bzw. eine eigene Tabelle um `/impressum` und `/datenschutz` ergänzen; `App.tsx` liest die Rechtsseite aus dem Pfad statt aus `location.hash` und navigiert per `pushState`. Zurück führt auf den vorherigen Bildschirm.
2. `Fusszeile.tsx`: Links auf `/impressum` und `/datenschutz`. Klick wird abgefangen und per `pushState` behandelt, damit die App nicht neu lädt.
3. Alte Raute-Links weiterleiten: Beim Start `#impressum` → `/impressum`, `#datenschutz` → `/datenschutz` (`replaceState`), damit geteilte alte Links funktionieren.
4. Zusätzlich werden beide Seiten beim Build als statisches HTML erzeugt (gleiches Verfahren wie AP 5), damit sie ohne JavaScript lesbar sind. Der Text kommt aus denselben Komponenten (`Impressum.tsx`, `Datenschutz.tsx`) per `renderToStaticMarkup`, damit es nur eine Quelle gibt.
5. Tests anpassen bzw. ergänzen (`Navileiste.test.tsx`, `Datenschutz.test.tsx`, `adressen.test.ts`): Pfad → Rechtsseite, Raute-Weiterleitung, Zurück.

**Abnahme:** `/impressum` und `/datenschutz` liefern HTTP 200 mit eigenem Titel; im Vercel-Dashboard erscheinen beide Pfade.

### AP 4 – Die vier Messpunkte

Die Bildschirm-Pfade decken drei der vier Punkte bereits als Seitenaufrufe ab. Diese Zuordnung wird festgeschrieben und der vierte Punkt ergänzt:

| Messpunkt (`BRIEF.md`) | Erfassung |
|---|---|
| 1. Eingabe abgeschlossen | Seitenaufruf `/uebersicht` |
| 2. Navigation gestartet | Seitenaufruf `/weg` |
| 3. Schritt 1 erreicht | Ereignis `schritt-1` über `track()` aus `@vercel/analytics`, ausgelöst beim ersten Wechsel von Schritt 0 auf Schritt 1 in der Schrittnavigation |
| 4. Ziel erreicht | Seitenaufruf `/angekommen` |

1. Vorher prüfen, dass `pushState` beim Wechsel der Bildschirme tatsächlich einen Seitenaufruf auslöst (`App.tsx:146-148`; `replaceState` zählt bei `@vercel/analytics` nicht). Falls ein Übergang nur `replaceState` nutzt, auf `pushState` umstellen oder den Aufruf gezielt melden.
2. Zusätzlich alle vier Punkte als Ereignisse senden (`eingabe-fertig`, `navigation-start`, `schritt-1`, `ziel`), gebündelt in `frontend/src/analytik/ereignis.ts` (eine Funktion `melde(name)`, keine weiteren Eigenschaften). Damit sind die Zahlen sofort verfügbar, falls der Tarif später wechselt.
3. Datenschutzerklärung um die Ereignisse ergänzen (nur Ereignisname, keine Reisedaten); `Datenschutz.test.tsx` darauf festhalten.
4. Test: `melde` wird an den vier Stellen genau einmal je Reise aufgerufen (Vitest mit gemocktem `track`).

**Hinweis zum Tarif:** Eigene Ereignisse sind im Gratistarif von Vercel nicht abrufbar. Messpunkt 3 ist daher bis zu einer Entscheidung (siehe Abschnitt 7) nur über den Umweg „Aufrufe `/weg` minus Abbrüche" schätzbar. Die Punkte 1, 2 und 4 sind ab Auslieferung ablesbar.

### AP 5 – Vorgerenderte Bahnhofsseiten mit Gehzeiten je Gleispaar

**Ziel:** Für jeden Bahnhof im Startbestand (`backend/osm-bestand/`, derzeit 382 Dateien) entsteht beim Build eine statische Seite `/bahnhof/<name>` mit einer Tabelle der Gehzeiten zwischen allen Gleisen. Dazu eine Übersichtsseite `/bahnhoefe`.

Da Vercel nur `frontend/` installiert und baut (`vercel.json`: `npm ci --prefix frontend`), werden die Gehzeiten im Backend vorberechnet und als JSON eingecheckt; das Frontend rendert daraus beim Build HTML.

#### 5a – Gehzeiten vorberechnen (Backend)

Neues Skript `backend/scripts/bahnhofsseiten-daten.ts`, Vorbild `backend/scripts/routenabzug.ts` (rechnet bereits eine vollständige Route offline aus der Ablage).

1. Für jeden Eintrag im Startbestand: `entpackeEintrag` → `baueGraph(eintrag.osm)` → `klassifiziere`.
2. Bahnhöfe der Stufe 3 (Standardmodell, keine echte Geometrie) werden übersprungen und im Protokoll aufgeführt; für sie entsteht keine Seite, da die Werte nur geschätzt wären.
3. Gleisliste aus dem Graphen; für jedes geordnete Gleispaar (A, B) mit A ≠ B:
   - `findeStartknoten(graph, A, 'mitte')`, `findeStartknoten(graph, B)`,
   - `berechneRoute(..., 'schnellste', 'normal')` und `berechneRoute(..., 'barrierefrei', 'normal')`,
   - daraus: Gehzeit in Sekunden (`gehzeitSekunden`), Anzahl Ebenenwechsel, genutzte Anlagen (Treppe, Rolltreppe, Aufzug), ob ein stufenfreier Weg existiert und dessen Gehzeit,
   - `istGleicherBahnsteig(A, B)` als eigenes Merkmal („gleicher Bahnsteig").
4. Ausgabe je Bahnhof: `frontend/src/bahnhofsseiten/daten/<name>.json` mit `name`, `eva`, `slug`, `lat`, `lon`, `stufe`, `geholtAm`, `gleise[]`, `paare[]`. Gerundet wird erst im Frontend, die Daten tragen Sekunden.
5. Kurzname (`slug`): Kleinbuchstaben, ä→ae, ö→oe, ü→ue, ß→ss, alles außer a–z und 0–9 zu `-`, doppelte Bindestriche zusammenfassen (z. B. „Wiesenburg (Mark)" → `wiesenburg-mark`, „Frankfurt (Main) Hbf" → `frankfurt-main-hbf`). Kollisionen brechen das Skript mit Fehler ab.
6. Laufzeit und Umfang protokollieren (Anzahl Bahnhöfe je Stufe, größte Gleisanzahl, Gesamtgröße der JSON-Dateien). Bei über 5 MB Gesamtgröße Rückfrage an Julian, bevor eingecheckt wird.
7. Tests (`backend/test/bahnhofsseiten-daten.test.ts`) mit einer vorhandenen Fixture: Paaranzahl = n·(n−1), Gehzeit > 0, stufenfreie Zeit ≥ schnellste Zeit, Slug-Regeln.
8. Aufruf als `npm run bahnhofsseiten` in `backend/package.json`; in `README.md` und `docs/deployment.md` vermerken, dass das Skript nach jeder Erneuerung des Startbestands erneut läuft.

#### 5b – Seiten rendern (Frontend-Build)

Neues Skript `frontend/scripts/bahnhofsseiten.tsx`, ausgeführt nach `vite build` (`"build": "tsc -b && vite build && tsx scripts/bahnhofsseiten.tsx"`; `tsx` als devDependency).

1. Liest alle JSON-Dateien aus 5a und schreibt `dist/bahnhof/<slug>/index.html` sowie `dist/bahnhoefe/index.html`.
2. HTML über React-Komponenten und `renderToStaticMarkup` (keine Hydratation, kein Skript auf der Seite außer dem Analytics-Skript, falls es ohne Inline-Code eingebunden werden kann).
3. Gemeinsame CSS-Datei `bahnhofsseiten.css`, beim Build mit Hash nach `dist/assets/` kopiert (CSP: kein Inline-Stil).
4. Aufbau einer Bahnhofsseite:
   - `<h1>Umsteigen in {Name}</h1>` und ein Satz: „Gehzeiten zwischen allen {n} Gleisen, berechnet aus dem Bahnhofsplan, bei normalem Gehtempo ab Bahnsteigmitte."
   - Schaltfläche „Weg für meinen Umstieg anzeigen" → `/eingabe` mit vorbelegtem Bahnhof (siehe 5c).
   - Je Ankunftsgleis ein `<details>`-Block (aufklappbar ohne JavaScript) mit einer Tabelle: Abfahrtsgleis · Gehzeit (gerundet auf ganze Minuten, aufgerundet) · Weg (z. B. „Treppe, Unterführung") · stufenfrei (Zeit oder „nicht möglich"). „Gleicher Bahnsteig" steht als Text statt einer Minutenzahl unter einer Minute.
   - Ein kurzer Absatz mit den drei längsten Umstiegen des Bahnhofs als Fließtext (eigenständiger, lesbarer Inhalt für Suche und KI).
   - Hinweis: „Richtwerte. Mit Gepäck oder wenig Ortskenntnis mehr Zeit einplanen. Live-Lage, Gleiswechsel und Aufzugsstörungen zeigt die App."
   - Stand: „Bahnhofsplan vom {geholtAm}", OSM-Hinweis nach Abschnitt 3.
   - Fußzeile mit Impressum und Datenschutz (Pflicht nach § 5 DDG, siehe `Fusszeile.tsx`).
   - `<head>`: Titel und Beschreibung nach 4.2, kanonische Adresse, `og:*`, JSON-LD `TrainStation` mit `name`, `geo`, `url`.
5. Übersichtsseite `/bahnhoefe`: alphabetische Liste aller Bahnhofsseiten, gruppiert nach Anfangsbuchstaben, mit Gleisanzahl. Sie ist die zentrale interne Verlinkung, über die Suchmaschinen alle Seiten finden.
6. Tests (Vitest): eine Fixture-JSON → HTML enthält `<h1>`, Titel ≤ 65 Zeichen, eigene kanonische Adresse, keine `style=`-Attribute, OSM-Hinweis vorhanden, Minuten korrekt aufgerundet.

#### 5c – Einbindung in App, Sitemap und Verlinkung

1. **Vorbelegter Bahnhof:** Die Eingabe übernimmt einen Bahnhof aus `/eingabe?bahnhof=<eva>`. Die Abfragezeichenkette wird von `ohneAbfrage` (`analytik/ereignis.ts`) bereits vor der Messung entfernt; das bleibt so und wird durch einen Test belegt.
2. **Sitemap:** Das Skript aus 5b schreibt zusätzlich `dist/sitemap.xml` (Inhalt nach AP 2).
3. **Verlinkung:** Fußzeile der App und Vortext der Startseite (AP 1) verlinken `/bahnhoefe`. Jede Bahnhofsseite verlinkt die Übersicht.
4. **Fehlerfall:** `/bahnhof/<unbekannt>` fällt auf die App zurück und zeigt die Eingabe; kein leerer Bildschirm.

**Abnahme AP 5:** `curl -s https://www.umstieg.online/bahnhof/hannover-hbf | grep -c "Gleis"` liefert Treffer, Seite ohne JavaScript vollständig lesbar, Lighthouse-SEO-Wert ≥ 90 für eine Stichprobe von drei Bahnhofsseiten (groß, mittel, klein), keine CSP-Verstöße in der Browserkonsole.

### AP 6 – Google Search Console und Bing Webmaster Tools

Dieser Schritt erfordert Julians Konto und Zugriff auf die DNS-Einstellungen der Domain; Claude Code bereitet ihn vor, führt ihn aber nicht selbst aus.

1. **Julian:** Search Console unter `https://search.google.com/search-console` öffnen, Eigenschaft vom Typ „Domain" für `umstieg.online` anlegen, den angezeigten TXT-Eintrag beim Domain-Anbieter hinterlegen, Bestätigung abwarten.
2. **Julian:** Unter „Sitemaps" `https://www.umstieg.online/sitemap.xml` einreichen.
3. **Julian:** In Bing Webmaster Tools die Eigenschaft aus der Search Console importieren (ein Klick, keine zweite Bestätigung nötig). Bing speist auch Copilot und DuckDuckGo.
4. **Julian:** Für die Startseite und zwei Bahnhofsseiten „URL-Prüfung" → „Indexierung beantragen".
5. **Claude Code:** Kurzanleitung mit diesen Schritten in `docs/deployment.md` aufnehmen; nach zwei Wochen Indexierungsbericht und Suchanfragen auswerten (Julian liefert einen Export).

**Abnahme:** Sitemap-Status „Erfolgreich", erste Bahnhofsseiten im Bericht „Indexiert".

### AP 7 – Ausliefern und dokumentieren

1. Nach AP 1–5: Frontend auf Vercel ausliefern (Ablauf `docs/deployment.md`), Backend ist nicht betroffen.
2. Live prüfen: alle Abnahmen aus AP 1–5, ohne JavaScript (`curl`) und im Browser (mobil, Dunkelmodus).
3. `README.md`, Abschnitt „Hier weitermachen", auf den neuen Stand bringen: was ausgeliefert ist, Messwerte, offene Punkte.

---

## 6. Reihenfolge und Abhängigkeiten

| Schritt | Paket | Hängt ab von | Aufwand (Schätzung) |
|---|---|---|---|
| 1 | AP 1 Suchergebnis-Text, Vortext | – | gering |
| 2 | AP 3 Rechtsseiten mit echten Adressen | – | gering |
| 3 | AP 4 Messpunkte | – | gering |
| 4 | AP 5a Gehzeiten vorberechnen | – | mittel |
| 5 | AP 5b/5c Seiten rendern, Sitemap, Verlinkung | AP 5a | mittel bis hoch |
| 6 | AP 2 `robots.txt`, kanonische Adressen, `vercel.json` | AP 5b (Sitemap) | gering |
| 7 | AP 7 Ausliefern | AP 1–5 | gering |
| 8 | AP 6 Search Console (Julian) | AP 7 | gering |

AP 1, AP 3 und AP 4 können vorab einzeln ausgeliefert werden.

---

## 7. Offene Entscheidungen für Julian

- **Vercel-Tarif für Messpunkt 3:** Gratistarif beibehalten (Messpunkt 3 nur geschätzt) oder Pro-Tarif (eigene Ereignisse ablesbar, laufende Kosten). Vorgabe bis zur Entscheidung: Gratistarif, Ereignisse werden trotzdem gesendet.
- **Stufe-3-Bahnhöfe:** Vorgabe ist, für sie keine Seite zu erzeugen. Alternative: Seite ohne Tabelle, nur mit Verweis auf die App.
- **Gesamtgröße der Daten:** Bei über 5 MB eingecheckter JSON-Dateien wird vor dem Commit nachgefragt (siehe 5a, Punkt 6).

---

## Quellen

- Vercel/MERJ, „The rise of the AI crawler", 17.12.2024: https://vercel.com/blog/the-rise-of-the-ai-crawler
- JavaScript-SEO und Googles Render-Warteschlange: https://dev.to/garvit_sharda/javascript-seo-in-2026-the-two-waves-of-indexing-myth-and-what-googlebot-actually-keeps-20lm
- bahnhof.de, Umsteigen in Hannover Hbf: https://www.bahnhof.de/hannover-hbf/umsteigen-hannover-hbf
- Messwerte: `BRIEF.md`, Abschnitt 3
