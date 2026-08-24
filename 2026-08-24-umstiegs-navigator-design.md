# Umstiegs-Navigator – Umsetzungskonzept (MVP)

Stand: 24.08.2026 · Validiert im Brainstorming · Zieldokument für die Umsetzung mit Claude Code

---

## 1. Ziel und Zielgruppe

Web-App, die für einen Umstiegsbahnhof den konkreten Weg vom Ankunftsgleis zum Abfahrtsgleis liefert – als Karte und als textuelle Schritt-für-Schritt-Anweisung – und live bewertet, ob der Anschluss erreichbar ist.

**Zielgruppe:** Urlaubsreisende, Reisende mit knapper Umstiegszeit, ältere Personen. Daraus folgt: mobil zuerst, große Schrift, Text vor Karte, keine Gesten-Abhängigkeit.

**Alleinstellung gegenüber Bestand (DB Navigator, SBB Mobile, Citymapper, Bahn-Vorhersage):** Kein Anbieter verknüpft Wagenposition bei Ankunft → Weg über Treppe/Aufzug/Unterführung → Gehprofil → Restzeit bis Abfahrt. Genau diese Kette ist der Produktkern.

## 2. Festgelegte Umfangsentscheidungen

| Entscheidung | Festlegung |
|---|---|
| Bahnhofsumfang | Deutschlandweit, automatisch aus OSM (Overpass), keine Handkuration im MVP |
| Datenhaltung | Keine. Zustandsloses Backend, alle Daten zur Laufzeit aus Online-Quellen, nur RAM-Cache |
| Live-Daten | Volles Live-MVP: Zugauswahl aus Live-Tafeln, Gleiswechsel-Übernahme, Wagenreihung |
| Wagenposition | Manuelle Eingabe der Wagennummer im MVP; Ticket-Import (PDF/Barcode) erst Stufe 2 |
| Plattform | Responsive Web-App (Browser, mobil zuerst) |
| Alternativverbindungen bei verpasstem Anschluss | Nicht im MVP; Stufe 2: Absprung zu bahn.de mit vorbefüllter Suche |

## 3. Architektur

Drei Komponenten, keine Datenbank, keine Offline-Pipeline:

```
Browser (React/Vite, MapLibre GL)
   │  REST + Server-Sent Events
   ▼
Backend (Node.js, Fastify, TypeScript) – reiner Orchestrator
   ├─ clients/   Zugriff auf externe APIs, Schlüssel aus Umgebungsvariablen
   ├─ core/      Graphbau · Klassifikation · Routing · Textgenerierung · Synthesemodell
   └─ RAM-Cache  (LRU): Bahnhofsgraphen ~24 h · Live-Antworten 30–60 s
   │
   ▼ zur Laufzeit
Externe Quellen:
   · Overpass API (OSM)            → Indoor-Geometrie
   · DB RIS::Stations / Stationsdaten → Bahnhofssuche, EVA-Nummer, Bahnsteigkoordinaten
   · DB Timetables API             → Ankunfts-/Abfahrtstafeln, Soll- und Änderungsdaten
   · DB Wagenreihungs-API          → wagenscharfe Position am Gleisabschnitt
   · DB FaSta API                  → Aufzüge/Rolltreppen mit Koordinaten + Echtzeitstatus
```

**Datenfluss:** Eingabe → EVA-Auflösung → parallel: Graph laden (Overpass, Cache) + Live-Daten abrufen → Startpunkt aus Wagenposition bestimmen → Route und Text berechnen → Anzeige → SSE-Überwachung bis zur Abfahrt.

**Grundprinzipien:**
1. Die App funktioniert vollständig ohne Zugauswahl und ohne Live-Daten; Live-Daten verfeinern nur.
2. Degradieren statt ausfallen (siehe Abschnitt 8).
3. Jede Live-Anzeige trägt einen Zeitstempel („Stand: 14:32 Uhr“) – keine vorgetäuschte Aktualität.

## 4. Datenquellen im Detail

### 4.1 Overpass API (OSM)
- Abfrage des Bahnhofsareals um die Stationskoordinate (Radius ~400 m, bei großen Bahnhöfen Bounding-Box aus den Bahnsteigkoordinaten ableiten).
- Relevante Elemente: `railway=platform` (+ `ref`-Gleisnummern), `highway=footway/steps`, `conveying=*` (Rolltreppen inkl. Richtung), `highway=elevator`, `level=*`, `indoor=*`, `wheelchair=*`, `tunnel=yes` (Unterführungen), `bridge=yes` (Überführungen), `railway:platform_section` bzw. Abschnittsmarker A–F, sofern vorhanden.
- Skizze der Abfrage (Details bei Umsetzung verfeinern):
```
[out:json][timeout:25];
(
  way["railway"="platform"](around:400,{lat},{lon});
  way["highway"~"footway|steps|corridor"](around:400,{lat},{lon});
  node["highway"="elevator"](around:400,{lat},{lon});
  way["conveying"](around:400,{lat},{lon});
);
(._;>;);
out body;
```
- Zwei Overpass-Instanzen konfigurieren (Haupt + Ausweich), Fairness-Regeln beachten (User-Agent setzen, Wiederholversuche mit Wartezeit).

### 4.2 DB API Marketplace
Registrierung erforderlich; Client-ID/-Secret als Umgebungsvariablen. **Wichtig für die Umsetzung: exakte Endpunktpfade und Antwortformate vor Implementierung in der aktuellen Marketplace-Dokumentation prüfen – nicht aus dem Gedächtnis kodieren.** Benötigte Produkte:
- **RIS::Stations / Stationsdaten:** Suche nach Name → EVA-Nummer, Koordinaten, Bahnsteig-/Gleisliste.
- **Timetables:** Solltafel je Stunde sowie Änderungsdaten (voll/rezent) je EVA – Quelle für Zugauswahl, Verspätungen, Gleiswechsel.
- **Wagenreihung (Fahrzeugreihenfolge):** Zugnummer + Datum → Wagen mit Gleisabschnitt. Nur am Reisetag und primär Fernverkehr verfügbar; Fehlen ist ein normaler Fall.
- **FaSta (Station Facility Status):** Aufzüge/Rolltreppen je Bahnhof mit Geokoordinaten und Status `ACTIVE/INACTIVE`.

### 4.3 Zuordnung OSM ↔ DB
Verknüpfung über `uic_ref`/`railway:ref` am OSM-Bahnhofsobjekt mit der EVA-Nummer; fehlt das Tag, Zuordnung über geringste Distanz der Koordinaten. Gleisnummern aus OSM (`ref` an Bahnsteigen) gegen die DB-Gleisliste abgleichen; bei Konflikt gewinnt die DB-Liste.

## 5. Qualitätsstufen und Synthesemodell

Jeder Bahnhof wird beim Graphaufbau automatisch klassifiziert:

- **Stufe 1 – vollständiges Indoor-Mapping:** Ebenen, Treppen/Rolltreppen/Aufzüge und Fußwege vorhanden → Karte + metergenaue Textanweisungen.
- **Stufe 2 – Teildaten:** Bahnsteige und Fußwege ohne saubere Ebenen → vereinfachte Karte + gröbere Textanweisung (ohne verlässliche Meterangaben zwischen Ebenen).
- **Stufe 3 – keine verwertbaren OSM-Indoor-Daten:** **Synthetisches Standardmodell** aus DB-Daten. Begründung: Deutsche Bahnhöfe folgen fast immer demselben Muster – Bahnsteige, verbunden über genau eine Unter- oder Überführung. Aufbau: Bahnsteiglage/-länge und Gleiszuordnung aus den Stationsdaten, Lage von Aufzügen/Rolltreppen am Bahnsteig aus FaSta-Koordinaten, Verbindung über eine angenommene Querung. Beispieltext: „Abgang am Abschnitt B hinunter zur Unterführung, ca. 40 m, dann Aufgang zu Gleis 7.“

**Sonderfall gleicher Bahnsteig:** Liegt das Abfahrtsgleis am selben Bahnsteig gegenüber, entfällt die Route – Ausgabe „Gleis 6 gegenüber, kein Ebenenwechsel“, Gehzeit ~0.

**Klassifikationsheuristik (Startwerte, testbar):** Stufe 1, wenn ≥ 1 Ebenenwechsel-Element mit `level`-Tags und zusammenhängender Fußweg-Graph zwischen ≥ 80 % der Bahnsteige existiert; Stufe 2, wenn Bahnsteige + irgendein Fußweg vorhanden; sonst Stufe 3.

## 6. Routing-Kern

### 6.1 Graph
- Knoten: Wegpunkte, Bahnsteigpunkte (Abschnitte A–F, sonst Anfang/Mitte/Ende), Ebenenwechsel-Endpunkte.
- Kanten mit vier Attributen: Länge (aus Koordinaten, Haversine), Ebenenwechsel (Δlevel), Typ (`eben | treppe | rolltreppe | aufzug | rampe`), barrierefrei (bool aus `wheelchair`/Typ).
- **Startknoten:** Wagenreihung liefert Gleisabschnitt der eingegebenen Wagennummer → nächstgelegener Bahnsteigpunkt. Ohne Wagennummer oder ohne API-Antwort: Bahnsteigmitte, mit transparentem Hinweis.
- **Zielknoten:** Bahnsteigmitte des Abfahrtsgleises (Stufe 2: bei bekanntem Abfahrts-Wagen analog verfeinerbar – nicht im MVP).

### 6.2 Drei Routenvarianten (Dijkstra mit variantenspezifischen Kantengewichten)
- **Schnellste:** Gewicht = Gehzeit; Rolltreppen mit Zeitbonus, Aufzüge mit Wartezeit-Malus 60 s.
- **Einfachste:** zusätzlicher Malus je Abbiegung und je Ebenenwechsel → minimiert Entscheidungspunkte (Zielgruppe: Ortsunkundige, ältere Reisende).
- **Barrierefrei:** Kanten vom Typ `treppe`/`rolltreppe` gesperrt; nur Aufzüge und Rampen. FaSta-Status live prüfen: `INACTIVE` sperrt die Kante → Ausweichroute oder ehrliche Warnung, falls keine existiert.

### 6.3 Textgenerierung
- Pfad zu Segmenten zusammenfassen: gleiche Richtung = ein Schritt.
- Distanzen auf 10 m runden.
- **Richtungsskala (45°-Sektoren): links – halblinks – geradeaus – halbrechts – rechts.**
- Ebenenwechsel explizit benennen: „Rolltreppe hoch zur Ebene 0“, „Aufzug zur Unterführung (−1)“.
- Beispielausgabe: „Nach Ausstieg 50 m halblinks · Rolltreppe hoch · 20 m geradeaus · 10 m halbrechts · Rolltreppe rechte Seite hinunter zu Gleis 7.“
- Stufe 3: Sätze aus dem Synthesemodell (siehe 5).

### 6.4 Gehzeit und Restzeit-Ampel
- Profile: zügig 1,4 m/s · normal 1,0 m/s · langsam/Gepäck 0,6 m/s.
- Zuschläge je Ebenenwechsel: Treppe +20 s, Rolltreppe +10 s, Aufzug +60 s (Startwerte, konfigurierbar).
- Puffer = (Abfahrt lt. Live-Daten − Ankunft lt. Live-Daten) − geschätzte Gehzeit.
- Ampel: **grün** ≥ 2 min Puffer · **gelb** 0 bis 2 min · **rot** < 0.

## 7. Live-Logik

- **Zugauswahl:** Nach Bahnhofseingabe Ankunfts-/Abfahrtstafel laden; Antippen übernimmt Zug, Gleis, Zeit inkl. bekannter Änderungen. Alternativ: manuelle Auswahl aus Solltafel oder reine Gleiseingabe.
- **Überwachung:** Bei aktiver Route pollt das Backend die Änderungsdaten alle 30 s und pusht per **Server-Sent Events**. Drei Ereignistypen:
  1. **Gleiswechsel** → Route sofort neu berechnen; auffälliger Warnbanner + Browser-Benachrichtigung mit Vibration.
  2. **Abfahrtsverspätung** → Puffer wächst, Ampel entspannt sich.
  3. **Ankunftsverspätung** → Startzeit verschiebt sich, Ampel verschärft sich.
- **Wagenreihung:** Abruf am Reisetag; keine Antwort = normaler Fall → Bahnsteigmitte + Hinweis.

## 8. Fehlerfälle – degradieren statt ausfallen

| Ausfall | Verhalten |
|---|---|
| Overpass (beide Instanzen) | automatisch Stufe-3-Synthesemodell aus DB-Daten |
| Timetables | Routing läuft mit manuellen Eingaben weiter; Banner „Echtzeitdaten derzeit nicht verfügbar“ |
| FaSta | Barrierefrei-Route wird berechnet, Warnung „Aufzugstatus unbekannt“ |
| Gleis nicht im OSM-Graphen | Rückfall auf Synthesemodell nur für dieses Gleis |
| Wagenreihung leer | Bahnsteigmitte als Start, transparenter Hinweis |
| SSE-Verbindung bricht ab | Frontend verbindet neu; solange Zeitstempel der letzten Daten anzeigen |

## 9. Oberfläche

Zwei Ansichten, mobil zuerst:

**Eingabe:**
- Bahnhofssuche mit Vervollständigung (RIS::Stations).
- Block „Ankunft“: Gleis (Pflicht) · Zug (optional: Live-Tafel oder Fahrplan) · Wagennummer (optional).
- Block „Abfahrt“: gleiches Schema.
- Gehprofil (zügig/normal/langsam) · Routenart (schnellste/einfachste/barrierefrei).

**Routenansicht:**
- Oben fixiert: Restzeit-Ampel mit Puffer in Minuten und Zeitstempel.
- Hauptelement: nummerierte Schrittliste in großer Schrift (Text vor Karte – entspricht dem Fallback-Prinzip und ist unterwegs schneller erfassbar).
- Karte darunter einklappbar: MapLibre GL, OSM-Basiskarte + GeoJSON-Ebenen je Stockwerk mit Ebenen-Umschalter, Route als Linie, Start-/Zielmarker, Positionsanzeige des Startpunkts (Wagenposition am Gleisabschnitt).
- LiveBanner für Gleiswechsel/Verspätungen.
- Gestaltung: großzügige Schaltflächen, hoher Kontrast, keine Gesten-Abhängigkeit, deutschsprachig.

## 10. Technologie-Stack

- **Backend:** Node.js ≥ 20, Fastify, TypeScript. In-Memory-LRU-Cache (z. B. `lru-cache`), SSE nativ über Fastify. Keine Datenbank. API-Schlüssel ausschließlich über Umgebungsvariablen (`DB_CLIENT_ID`, `DB_CLIENT_SECRET`, `OVERPASS_URL_PRIMARY`, `OVERPASS_URL_FALLBACK`).
- **Frontend:** React + Vite, TypeScript, MapLibre GL JS.
- **Betrieb:** ein Docker-Container (Backend liefert das gebaute Frontend statisch aus), lauffähig auf jedem Node-Host.

## 11. Projektstruktur

```
/backend
  /src
    /clients      overpass.ts · timetables.ts · wagenreihung.ts · fasta.ts · stations.ts
    /core         graph.ts · klassifikation.ts · routing.ts · textgen.ts · synthmodell.ts · gehzeit.ts
    /routes       api.ts (REST) · live.ts (SSE)
    /cache        lru.ts
    server.ts
  /test
    /fixtures     gespeicherte Overpass-/API-Antworten (3 Bahnhöfe, je 1 pro Stufe)
/frontend
  /src
    /components   Eingabe · Zugauswahl · Schrittliste · Ampel · Karte · LiveBanner
    /api          Backend-Client + SSE-Anbindung
/docs/plans       dieses Dokument
Dockerfile · docker-compose.yml · .env.example · README.md
```

### REST-Schnittstelle (Backend → Frontend)
```
GET  /api/stations?q=…                     Bahnhofssuche
GET  /api/board/:eva?type=arr|dep          Live-Tafel
GET  /api/route                            Parameter: eva, gleisAn, gleisAb,
                                           zugAn?, zugAb?, wagen?, profil, variante
     → { stufe, schritte[], gehzeitSek, karte(GeoJSON je Ebene)?, hinweise[] }
GET  /api/live/:routeId                    SSE-Strom: gleiswechsel | verspaetung | heartbeat
```

## 12. Teststrategie

1. **Routing-Kern:** gegen gespeicherte Overpass-Antworten von drei realen Bahnhöfen – je einer pro Qualitätsstufe (Vorschlag: ein großer Knoten mit gutem Indoor-Mapping, ein mittlerer Bahnhof mit Teildaten, ein kleiner Halt ohne Indoor-Daten). Prüfen: Graphaufbau, Klassifikation, alle drei Routenvarianten, Sonderfall gleicher Bahnsteig.
2. **Textgenerierung:** Erwartungssätze je Testroute (feste Eingabe → exakter Ausgabetext), inkl. aller fünf Richtungen und Rundung auf 10 m.
3. **Live-Logik:** simulierte Gleiswechsel-/Verspätungsereignisse gegen den SSE-Endpunkt; Prüfen der Neuberechnung und der Ampellogik.
4. **Fehlerfälle:** jede Zeile der Degradationstabelle (Abschnitt 8) als eigener Test mit abgeschalteter Quelle.

## 13. Umsetzungsreihenfolge (Arbeitspakete)

1. **AP1 Gerüst:** Projektstruktur, Fastify-Server, Vite-Frontend, Docker, `.env.example`.
2. **AP2 Stationsdaten:** stations-Client, Bahnhofssuche Ende-zu-Ende (Eingabemaske → EVA).
3. **AP3 Graph & Routing:** overpass-Client, Graphbau, Klassifikation, Dijkstra mit drei Varianten – zunächst gegen Fixtures entwickeln (testgetrieben).
4. **AP4 Textgenerierung + Gehzeit/Ampel.**
5. **AP5 Synthesemodell** (Stufe 3) inkl. Sonderfall gleicher Bahnsteig.
6. **AP6 Karte:** MapLibre-Einbindung, GeoJSON-Ebenen, Ebenen-Umschalter.
7. **AP7 Live:** Tafeln/Zugauswahl, Wagenreihung, SSE, Gleiswechsel-Neuberechnung, FaSta in Barrierefrei-Variante.
8. **AP8 Härtung:** Degradationstabelle, Zeitstempel, Cache-Feinschliff, mobile Optimierung.

Jedes Arbeitspaket endet lauffähig und getestet; AP3–AP5 sind ohne API-Schlüssel entwickelbar (nur Fixtures), AP2/AP7 benötigen die Marketplace-Registrierung.

## 14. Stufe 2 (nach dem MVP, nicht jetzt bauen)

- Ticket-Import (PDF-Parsing/Barcode) statt manueller Wagennummer.
- Absprung zu bahn.de mit vorbefüllter Suche bei verpasstem Anschluss.
- Kurationsschicht für Top-Knoten (Hybrid-Ansatz): manuelle Korrekturen über dem OSM-Graphen.
- Verfeinerter Zielpunkt über Abfahrts-Wagenposition.
- Mehrsprachigkeit (Englisch für Urlaubsreisende).

## 15. Risiken und offene Punkte

- **DB API Marketplace:** Registrierung, Ratenlimits und Nutzungsbedingungen vor AP2 klären; Endpunkte gegen aktuelle Dokumentation verifizieren.
- **Overpass-Fairness:** öffentliche Instanzen sind gutwillig geteilt – Cache 24 h ist Pflicht, keine Abfragen im Frontend.
- **OSM-Datenqualität:** Klassifikationsheuristik (Abschnitt 5) anhand realer Bahnhöfe nachjustieren.
- **Zeitfenster:** DB plant für Dezember 2026 die App „DB Info“ mit schnelleren Gleiswechselanzeigen – ohne Indoor-Routing. Der Produktkern bleibt frei, aber zügige Umsetzung erhöht den Vorsprung.
- **Rechtliches vor Veröffentlichung:** OSM-Attribution (ODbL), DB-Datenlizenzen (CC BY bei Open Data, Marketplace-Bedingungen bei APIs), Impressum/Datenschutz.
