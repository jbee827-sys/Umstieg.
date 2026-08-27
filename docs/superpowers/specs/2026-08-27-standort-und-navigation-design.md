# Standort & Live-Navigation (P1) – Design

Stand: 27.08.2026 · Validiert im Brainstorming · Zieldokument für die Umsetzung

Ergänzt das MVP-Konzept (`2026-08-24-umstiegs-navigator-design.md`) um die Gerätestandort-Abfrage.
Setzt Task 16 als abgeschlossen voraus.

---

## 1. Ziel

Die App kennt bisher nur, was der Nutzer eintippt. Der Gerätestandort schließt drei Lücken:

1. **Bahnhofserkennung** – die Eingabe startet vorbelegt statt leer.
2. **Live-Position auf der Karte** – der Nutzer sieht, wo er relativ zur Route steht.
3. **Ankunftserkennung** – löst den Screen „Angekommen" aus, der im Design existiert, aber bisher keinen Auslöser hat.

## 2. Leitentscheidung: Genauigkeit bestimmt den Funktionsumfang

GPS liefert auf dem Bahnsteig 5–15 m, in Halle und Unterführung 20–50 m, und **die Ebene nie**. Die App routet aber ebenenscharf. Daraus folgt bindend für dieses Design:

- **Kein automatisches Weiterschalten der Schritte.** Turn-by-turn bräuchte ~10 m Genauigkeit *und* das Stockwerk. Beides ist indoor nicht verfügbar; eine Führung, die in Unterführungen systematisch falsch schaltet, ist schlechter als eine statische Liste.
- **Der Positionspunkt zeigt nie eine Ebene an.** Er erscheint auf jeder Kartenebene, sichtbar markiert als „Ebene unbekannt", statt einer geratenen Ebene zugeordnet zu werden.
- **Ab 100 m Ungenauigkeit verschwindet der Punkt.** Ein Punkt, der 200 m danebenliegt, ist in einem 400-m-Bahnhof aktiv schädlich; an seine Stelle tritt ein Texthinweis.
- **Ankunft wird vorgeschlagen, nie erzwungen.** Die Erkennung vergleicht horizontale Distanz – wer in der Unterführung unter dem Zielbahnsteig hindurchgeht, ist horizontal 5 m entfernt und eine Etage zu tief. Deshalb Verweildauer-Bedingung plus Bestätigung durch den Nutzer.

## 3. Nicht im Umfang

Turn-by-turn-Navigation · Hintergrund-Tracking · Ebenenbestimmung über Barometer oder WLAN · Karten-Offlinefähigkeit · die Rechtsseiten aus P2 · die Betriebshärtung aus P3.

## 4. Datenfluss und Datenschutz

Von den drei Bausteinen braucht **nur die Bahnhofserkennung** einen Serverkontakt. Kartenpunkt und Ankunftserkennung arbeiten vollständig im Browser – die Zielkoordinaten liegen dort ohnehin im GeoJSON aus `/api/route`.

```
Browser: navigator.geolocation
   ├─ roher Standort  → bleibt lokal (Kartenpunkt, Ankunftsprüfung)
   └─ auf 3 Nachkommastellen gerundet (~110 m)
          → GET /api/stations?lat=&lon=
          → Backend → RIS::Stations Umkreissuche
```

**Verbindliche Regeln** (Vorarbeit für die Datenschutzerklärung in P2):

- Rohkoordinaten verlassen den Browser nie. Gerundet wird **vor** dem Absenden, nicht serverseitig.
- Der Standort wird nicht persistiert – kein `localStorage`, keine Cookies, kein Zustand über den Tab hinaus.
- Kein Logging der Koordinaten. `logger: false` in `app.ts` bleibt bewusst bestehen.
- Die Rundung auf ~110 m reicht zur Bahnhofszuordnung, taugt aber nicht zum Bewegungsprofil.

**Nicht kontrollierbarer Abfluss, offenzulegen:** Genutzt wird ausschließlich die Browser-eigene Geolocation API (`navigator.geolocation`), kein Fremddienst und keine IP-Ortung. Wie das Gerät die Position *ermittelt*, liegt jedoch außerhalb unserer Reichweite – Android-Chrome fragt dafür in der Regel Googles Standortdienst an, iOS den von Apple. Dieser Abfluss an den Plattformanbieter geschieht, bevor unser Code etwas sieht; wir lösen ihn weder aus noch können wir ihn verhindern, müssen ihn in der Datenschutzerklärung (P2) aber benennen.

## 5. Architektur Frontend

Neues Verzeichnis `frontend/src/standort/`. Die Browser-API steckt ausschließlich im Hook; alle Entscheidungslogik liegt in reinen Funktionen und ist ohne Browser-Mocks testbar.

| Datei | Aufgabe | Browser-API? |
|---|---|---|
| `useStandort.ts` | Permissions-API, `watchPosition`, Lebenszyklus, Degradation | ja |
| `ankunft.ts` | Verweildauer-Zustandsmaschine | nein |
| `distanz.ts` | Haversine (Spiegel von `backend/src/core/graph.ts:16`) | nein |
| `bahnhofErkennung.ts` | Rundung + Aufruf `/api/stations` | nein (fetch injizierbar) |
| `schwellen.ts` | benannte Konstanten | nein |

### 5.1 Typen

```ts
export type StandortStatus =
  | 'unbekannt' | 'frage-laeuft' | 'erteilt'
  | 'verweigert' | 'nicht-verfuegbar' | 'fehler';

export interface Standort {
  lat: number;
  lon: number;
  genauigkeitM: number;
  zeitstempel: number; // ms – jede Live-Anzeige trägt Zeitstempel (Konzept 3)
}
```

### 5.2 Schwellenwerte

```ts
export const GENAUIGKEIT_MAX_M = 100;     // schlechter → Punkt ausblenden
export const ANKUNFT_RADIUS_M = 40;       // Zielnähe
export const ANKUNFT_VERWEIL_MS = 15_000; // Verweildauer vor Vorschlag
export const ERKENNUNG_RADIUS_M = 1000;   // Bahnhofsumkreis
export const KOORD_RUNDUNG = 3;           // Nachkommastellen ≈ 110 m
export const ABGEFAHREN_KULANZ_MS = 60_000;
```

### 5.3 `useStandort()`

Beim Mounten wird die Freigabe angefragt (Produktentscheidung: beim App-Start, nicht erst auf Tipp):

- `navigator.permissions.query({ name: 'geolocation' })` zuerst – ist die Freigabe bereits erteilt, sieht ein Wiederkehrer **keinen** Dialog. Fehlt die Permissions-API (ältere Safari-Versionen), wird direkt abgefragt.
- Status `granted` → sofort `getCurrentPosition`. Status `prompt` → `getCurrentPosition` löst den Browserdialog aus. Status `denied` → Status `verweigert`, keine weiteren Versuche.
- `navigator.geolocation` fehlt (unsicherer Kontext) → Status `nicht-verfuegbar` mit Hinweis auf HTTPS.

Rückgabe: `{ status, standort, fehler, starteVerfolgung, stoppeVerfolgung }`.

Die Verfolgung nutzt `watchPosition` mit `{ enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }`, wird beim Betreten der Routenansicht gestartet, beim Verlassen und beim Unmount über `clearWatch` beendet. Kein Tracking außerhalb der Routenansicht.

Weil der Dialog beim Start erscheint, muss der manuelle Weg **gleichwertig erreichbar** bleiben: Chrome unterdrückt den Dialog bei Nutzern, die Berechtigungen gewohnheitsmäßig wegklicken, und eine verweigerte Freigabe ist auf Mobilgeräten mühsam zurückzuholen.

### 5.4 `ankunft.ts` – reine Zustandsmaschine

```ts
export interface AnkunftZustand { seit: number | null; bestaetigt: boolean }

export function pruefeAnkunft(
  zustand: AnkunftZustand,
  standort: Standort,
  ziel: { lat: number; lon: number },
  jetztMs: number,
): { zustand: AnkunftZustand; vorschlagen: boolean };
```

Regeln, in dieser Reihenfolge:

1. `genauigkeitM > GENAUIGKEIT_MAX_M` → Zustand unverändert, kein Vorschlag. Ein unbrauchbarer Fix darf den Zähler weder starten noch zurücksetzen.
2. Distanz > `ANKUNFT_RADIUS_M` → `seit = null`.
3. Distanz ≤ Radius und `seit === null` → `seit = jetztMs`.
4. Distanz ≤ Radius und `jetztMs - seit >= ANKUNFT_VERWEIL_MS` → `vorschlagen: true`.
5. `bestaetigt === true` → nie wieder vorschlagen.

Die Zeit kommt als Parameter herein, nicht aus `Date.now()` – dadurch ist die Maschine ohne Fake-Timer testbar.

### 5.5 Karte

`Karte.tsx` erhält die optionale Prop `standort?: Standort | null` und eine zweite GeoJSON-Quelle `position` mit zwei Ebenen:

- **Genauigkeitskreis** als berechnetes 32-Eck aus Haversine-Versätzen um die Position. Bewusst ein Polygon und kein `circle-radius`: Nur so entspricht der Radius echten Metern und bleibt beim Zoomen korrekt.
- **Positionspunkt** in neutraler Farbe, klar unterscheidbar von Start- (`#201e1d`) und Zielmarker (`#ec3013`), beschriftet „Standort · Ebene unbekannt".

Beide sind vom Ebenen-Umschalter unabhängig und auf jeder Ebene sichtbar. Bei `genauigkeitM > GENAUIGKEIT_MAX_M` entfallen sie und über der Karte steht „Standort zu ungenau (± N m)".

### 5.6 Neue und geänderte Komponenten

| Komponente | Änderung |
|---|---|
| `components/StandortStreifen.tsx` | **neu** – Ankunftsvorschlag „Bist du an Gleis 14 angekommen?" mit Bestätigungsknopf |
| `components/Angekommen.tsx` | **neu** – der bisher fehlende Screen, mit Knopf „Neue Eingabe" |
| `components/Eingabe.tsx` | erkannter Bahnhof wird vorbelegt und als „automatisch erkannt" markiert, bleibt änderbar; mehrere Treffer → Auswahlliste. **Vorbelegt wird nur ein leeres Feld** – hat der Nutzer bereits getippt, überschreibt die verzögert eintreffende Erkennung seine Eingabe nicht |
| `components/Karte.tsx` | Positionsquelle wie in 5.5 |
| `App.tsx` | Hook einbinden, Verfolgung an die Routenansicht koppeln, Ansicht `'angekommen'`, Zustand „abgefahren" |

### 5.7 Endzustände

Die Ansicht `ansicht` wächst von `'eingabe' | 'route'` auf `'eingabe' | 'route' | 'angekommen'`.

**Abgefahren:** Überschreitet `Date.now()` die Abfahrtszeit um mehr als `ABGEFAHREN_KULANZ_MS`, ersetzt ein eigener Zustand „Zug ist abgefahren" die dauerhaft rote Ampel (schließt Lücke 18). Angeboten wird „Neue Eingabe"; Alternativverbindungen bleiben laut Konzept 2 außerhalb des MVP.

## 6. Architektur Backend

`/api/stations` nimmt `lat`+`lon` **alternativ** zu `q` entgegen – gleiche Route, gleicher Fehlercode-Satz, gleiches Degradationsverhalten.

| Ort | Änderung |
|---|---|
| `routes/api.ts` | `lat`/`lon` als Alternative zu `q`; Umkreis-Cache |
| `clients/stations.ts` | `sucheBahnhoefeNahebei(lat, lon, radiusM, fetchFn?): Promise<BahnhofTreffer[]>` |
| `clients/db-endpunkte.ts` | `epStopPlacesByPosition(lat, lon, radiusM)` |
| `test/fixtures/db/stations-by-position.json` | **neu**, handgebaut, mit Verifikationshinweis im Kopf wie die übrigen |
| `server.ts` | FIXTURE_EVA-Modus liefert den Berlin-Treffer auch für `lat`/`lon` |

**Parameterprüfung:** weder `q` noch `lat`/`lon` → 400 `parameter-fehlt`. Beides gleichzeitig, nur eine der beiden Koordinaten, unparsbare Zahlen, `lat` außerhalb −90…90 oder `lon` außerhalb −180…180 → 400 `parameter-ungueltig`. Ohne DB-Zugang → 503 `db-zugang-fehlt` wie bei `q`.

**Cache:** Der Cacheschlüssel besteht aus den bereits gerundeten Koordinaten. Das 110-m-Raster macht die Umkreissuche von Natur aus cachefreundlich – alle Nutzer desselben Bahnhofs teilen sich einen Eintrag, was zugleich die Last auf RIS::Stations begrenzt.

Der Endpunktpfad ist wie alle anderen in `db-endpunkte.ts` **vor Live-Betrieb gegen die Marketplace-Doku zu verifizieren**; der TODO im Dateikopf gilt unverändert.

## 7. Betrieb: HTTPS

Geolocation ist an den Secure Context gebunden – ohne HTTPS liefert `navigator.geolocation` außerhalb von `localhost` nichts.

- **Produktion:** Caddy als zweiter Dienst im `docker-compose.yml`, Zertifikate über Let's Encrypt automatisch. Caddy setzt zugleich die Security-Header (Lücke 16 aus der Analyse) und terminiert TLS vor dem Fastify-Container.
- **Entwicklung:** Vite mit selbstsigniertem Zertifikat (`mkcert`), sonst ist das Feature auf einem echten Mobilgerät nicht testbar – und genau dort muss es geprüft werden.

## 8. Degradation

Fortsetzung der Tabelle aus Konzept 8. Keine Zeile führt in eine Sackgasse; überall bleibt die manuelle Eingabe erreichbar.

| Ausfall | Verhalten |
|---|---|
| Freigabe verweigert | Manuelle Eingabe wie bisher, Hinweis wie sie zurückzuholen ist |
| `navigator.geolocation` fehlt (kein HTTPS) | Hinweis „Standort braucht eine sichere Verbindung", manuell weiter |
| Positionsfehler oder Timeout | Letzte bekannte Position mit Zeitstempel; fehlt sie, Punkt aus |
| Genauigkeit > 100 m | Punkt aus, Texthinweis, Ankunftszähler pausiert |
| Umkreissuche ohne Treffer | Suchfeld bleibt leer, kein Fehler – kein Bahnhof in der Nähe ist ein normaler Fall |
| `/api/stations` liefert 503 | Manuelle EVA-Eingabe wie heute |
| **Route ist Stufe 3** | **Keine Ankunftserkennung.** Die Koordinaten des Synthesemodells sind konstruiert (`synthmodell.ts`, Versätze ab `BASIS_LAT`/`BASIS_LON`) – eine Prüfung dagegen wäre sinnlos. Stattdessen manueller Knopf „Ich bin da" |
| Zielmarker fehlt im GeoJSON | wie Stufe 3: manueller Knopf |

## 9. Tests

**Backend** (bestehende Dateien erweitern)

- `test/stations.test.ts` – Umkreissuche parst das Fixture; ohne Schlüssel `FehlendeZugangsdatenError`; Radius wird durchgereicht.
- `test/api.test.ts` – `?lat=&lon=` liefert Treffer · `?q=` und `?lat=` gleichzeitig → 400 · `?lat=` allein → 400 · `?lat=200` → 400 · ohne Zugang → 503 · zweiter Aufruf im selben Raster trifft den Cache.

**Frontend** – bisher existiert keine Testinfrastruktur; Vitest kommt hinzu (bei bestehendem Vite eine kleine Ergänzung, gleicher Runner wie im Backend).

- `standort/distanz.test.ts` – bekannte Referenzstrecke, Nullstrecke, Vorzeichen über den Nullmeridian.
- `standort/ankunft.test.ts` – Zähler startet im Radius · setzt beim Verlassen zurück · löst nach 15 s aus · schlechter Fix pausiert, ohne zurückzusetzen · nach Bestätigung kein erneuter Vorschlag.
- `standort/bahnhofErkennung.test.ts` – Rundung auf 3 Stellen inklusive negativer Längengrade · Aufrufform der URL · 503 wird als Degradation gemeldet, nicht geworfen.

Die Browser-API in `useStandort.ts` wird nicht unit-getestet; sie enthält bewusst keine Entscheidungslogik. Ihre Prüfung erfolgt in der manuellen Mobilabnahme.

## 10. Manuelle Abnahme

Auf einem echten Mobilgerät über HTTPS, da weder Genauigkeit noch Berechtigungsdialog im Desktop-Emulator realistisch sind:

1. Erster Aufruf → Dialog erscheint, Ablehnung führt sauber zur manuellen Eingabe.
2. Zweiter Aufruf mit erteilter Freigabe → kein Dialog mehr.
3. Am Bahnhof: Vorbelegung stimmt; Punkt und Genauigkeitskreis liegen plausibel.
4. In der Unterführung: Punkt verschwindet bei schlechtem Fix, Ankunft wird **nicht** vorgeschlagen.
5. Am Zielgleis: Vorschlag nach etwa 15 s, Bestätigung führt zu „Angekommen".

## 11. Abhängigkeiten und Reihenfolge

1. **Task 16 abschließen und committen** – der Arbeitsbaum enthält unfertige Arbeit mit 2 roten Tests (`wendeFastaAn` fehlt). P1 darf sich damit nicht vermischen, sonst ist die Projektregel „Commit nur bei grüner Suite" nicht einhaltbar.
2. Backend-Umkreissuche (unabhängig testbar gegen Fixture).
3. Frontend-Standortmodul mit reinen Funktionen und Tests.
4. Einbindung in `App.tsx`, Karte, neue Screens.
5. Caddy und HTTPS-Entwicklungssetup.
6. Manuelle Mobilabnahme.

## 12. Anschluss an P2 und P3

Dieses Design erzeugt Zuarbeit für die beiden Folgespecs, ersetzt sie aber nicht:

- **P2 (Recht):** Abschnitt 4 liefert den Standort-Teil der Datenschutzerklärung wörtlich. Offen bleiben dort Impressum, AGB mit Haftungsausschluss, gezielte Einwilligung für die externen Kartenkacheln, der Wechsel weg von `tile.openstreetmap.org`, Router samt eigener 404-Seite und die BFSG-Bewertung.
- **P3 (Härtung):** Caddy bringt die Security-Header mit; Rate-Limiting, Reload-Festigkeit und Logging-Entscheidung bleiben dort offen.
