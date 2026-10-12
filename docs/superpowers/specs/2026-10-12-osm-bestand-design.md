# OSM-Bestand: Bahnhöfe ohne Warten auf Overpass – Designdokument

Stand: 12.10.2026 · Im Brainstorming freigegeben (Abschnitte 1–4, Bauweise A) ·
Zieldokument für den Umsetzungsplan

---

## 1. Ziel und Abgrenzung

**Ziel:** Der erste Aufruf eines Bahnhofs wartet nicht mehr auf Overpass. Für
die großen Bahnhöfe liegen die OSM-Daten schon beim Backend; jeder weitere
Bahnhof, den jemand abfragt, wird dauerhaft gespeichert. Overpass wird nur noch
für unbekannte Bahnhöfe im Vordergrund gefragt, sonst nur im Hintergrund.

**Erfolg heißt:**

- Ein Bahnhof aus dem Bestand antwortet beim ersten Aufruf nach einem Deploy in
  **unter 1 s** – auch wenn Overpass gerade ausfällt.
- Ein einmal geholter Bahnhof bleibt über Neustarts und Deploys schnell.
- Jeder Overpass-Versuch steht einzeln im Log (Server, Ergebnis, Dauer).

**Ausdrücklich nicht das Ziel:**

- Den toten Ersatzserver `overpass.kumi.systems` tauschen oder die Wartezeit
  je Versuch kürzen („Lösung 1"). Für Bahnhöfe außerhalb des Bestands bleibt
  der erste Aufruf im schlechten Fall langsam.
- Eigene Aufbereitung der Deutschland-Daten aus einem OSM-Auszug, ganz ohne
  Overpass – späteres Vorhaben, auf das dieser Bestand aufbauen kann.
- Änderungen am Frontend.

## 2. Ausgangslage (gemessen am 12.10.2026)

| Anfrage an `/api/route` (Produktion) | Zeit |
|---|---|
| Berlin Hbf, im Arbeitsspeicher | 0,14 s |
| Hamburg Hbf, erster Aufruf / zweiter | **35,9 s** / 0,17 s |
| Frankfurt Hbf, erster Aufruf / zweiter | **4,6 s** / 0,11 s |

- `overpass-api.de` antwortet abwechselnd mit Daten (2,6–4,2 s) und mit 504:
  „Dispatcher_Client::request_read_and_idx::timeout. The server is probably
  too busy to handle your request." Wir sind nicht gesperrt (Status: „Rate
  limit: 4, 2 slots available").
- `overpass.kumi.systems` antwortet gar nicht (40 s ohne Antwort);
  `maps.mail.ru` liefert in 20 s, zwei weitere Spiegel nicht.
- Der Client versucht 2× Haupt-, 2× Ersatzserver, je bis 30 s, 2 s Pause –
  schlimmstenfalls rund zwei Minuten, dann Standardmodell. So geschehen
  17:48 UTC für Berlin Ostkreuz; im Log steht nur der Fehler des **letzten**
  Versuchs.
- Der Graph-Cache (100 Bahnhöfe, 24 h) liegt im Arbeitsspeicher und ist nach
  jedem Deploy leer.
- `backend/osm-ablage/osm-cache` (Simulationen, gitignored) hält 126 rohe
  Overpass-Antworten vom 13./14.09. – mit der Abfrage **vor** dem 02.10., also
  ohne `platform_edge`. Für den Bestand unbrauchbar, ohne neu zu holen.

## 3. Festgelegte Entscheidungen

| Entscheidung | Festlegung | Begründung |
|---|---|---|
| Abdeckung | DB-Preisklassen 1–3 als Startbestand, dazu lernend | Umstiege passieren an großen Bahnhöfen; alles andere wird einmal geholt und bleibt |
| Bauweise | Startbestand gepackt im Repo und im Image, Gelerntes auf einem Fly-Volume | Sofort schnell nach jedem Deploy, unabhängig von Overpass; schont den öffentlichen Dienst am meisten |
| Aktualität | Sofort liefern, ab 30 Tagen im Hintergrund erneuern | Niemand wartet; scheitert die Erneuerung, bleiben die alten Daten |
| Abfrageversion | automatisch aus der Abfrage abgeleitet | Eine geänderte Abfrage macht alte Daten „veraltet", ohne dass jemand eine Nummer hochzählen muss |
| Schlüssel | kleinste EVA der Verkehrsstellengruppe | Derselbe Bahnhof wie im Graph-Cache: Berlin Hbf über 8011160 und 8098160 ist eine Datei |

## 4. Nachschlagereihenfolge

Pro `/api/route`, wenn kein fertiges Wegenetz im Arbeitsspeicher liegt:

| Schritt | Wo | Wenn gefunden |
|---|---|---|
| 1 | Graph-Cache im Arbeitsspeicher (wie heute) | sofort antworten |
| 2 | Volume-Bestand `/data/osm/` | Wegenetz bauen, antworten; veraltet → Erneuerung anstoßen |
| 3 | Startbestand im Image `osm-bestand/` | ebenso; die Erneuerung schreibt aufs Volume |
| 4 | Overpass (wie heute, mit Versuchsprotokoll) | Erfolg aufs Volume schreiben, antworten; Scheitern → Standardmodell wie heute, nichts speichern |

**Veraltet** heißt: `geholtAm` älter als 30 Tage **oder** `abfrageVersion`
ungleich der aktuellen. Veraltete Daten werden trotzdem benutzt.

Die Stationsauskunft (`holeStationsInfo`) bleibt vor dem Nachschlagen: Sie
liefert Gruppe, Koordinaten und die DB-Gleisliste, die der Graphbau braucht.

## 5. Bausteine

| Baustein | Aufgabe | Hängt ab von |
|---|---|---|
| `osm/bestand.ts` – **OSM-Bestand** | `lies(schluessel)` → `{ antwort, geholtAm, abfrageVersion, herkunft: 'volume' \| 'start' } \| null`; `schreibe(schluessel, eintrag)` (nur Volume); `istVeraltet(eintrag, jetzt)` | zwei Ordnerpfade, Dateisystem |
| `osm/erneuerung.ts` – **Hintergrund-Erneuerung** | `stosseAn(schluessel, info)`; arbeitet eine Warteschlange ab, ruft Overpass, schreibt in den Bestand, meldet Erfolg zurück | Overpass-Funktion, Bestand, Uhr (für Tests ersetzbar) |
| `osm/version.ts` | `ABFRAGE_VERSION`: die ersten 12 Hexzeichen des SHA-256 von `baueOverpassQL(0, 0, 400)` | `clients/overpass.ts` |
| `clients/overpass.ts` | wie heute; zusätzlich je Versuch ein Logeintrag `{ instanz, versuch, status \| fehler, dauerMs }` | Logger (optional übergeben) |
| `routes/api.ts` | `baueGraphEintrag` fragt erst den Bestand, dann Overpass; nach einer gelungenen Erneuerung fallen die Graph-Cache-Einträge des Bahnhofs (jede EVA der Gruppe und der Gruppenschlüssel) heraus | Bestand, Erneuerung |
| `scripts/bestand-fuellen.ts` | erzeugt den Startbestand lokal | Bahnhofsliste, Overpass, Stationsauskunft |

Jeder Baustein ist ohne die anderen prüfbar; `api.ts` bekommt Bestand und
Erneuerung wie die übrigen Clients hereingereicht.

## 6. Datenformat

Eine Datei je Bahnhof: `<Schlüssel>.json.gz`, gzip-gepacktes JSON:

```json
{
  "schluessel": "8002549",
  "name": "Hamburg Hbf",
  "lat": 53.553, "lon": 10.0069,
  "geholtAm": "2026-10-12T18:30:00Z",
  "abfrageVersion": "3f9c0a1b2c4d",
  "osm": { "version": 0.6, "osm3s": { }, "elements": [ ] }
}
```

`osm` ist die Overpass-Antwort unverändert. Start- und Volume-Bestand nutzen
dasselbe Format.

## 7. Startbestand

- **Inhalt:** alle Bahnhöfe der DB-Preisklassen 1–3 (geschätzt 300–400).
  Die Quelle der Liste – DB-Stationsdaten-Schnittstelle oder das offene
  DB-Stationsverzeichnis mit Preisklasse – legt der Plan nach einem kurzen
  Test mit dem vorhandenen Zugang fest.
- **Ort:** `backend/osm-bestand/`, im Repo, vom Docker-Build ins Image kopiert.
- **Größe:** erwartet 5–8 MB gepackt (126 Bahnhöfe ergaben ungepackt 17 MB).
  Ein Test schlägt bei über 15 MB an.
- **Erzeugung:** `scripts/bestand-fuellen.ts` nach dem Vorbild von
  `osm-ablage-fuellen.ts`: nacheinander, 8 s Pause, nach einem Fehler länger
  (45 s × Versuch), höchstens 3 Versuche je Bahnhof; überspringt, was in der
  aktuellen Version schon liegt, und setzt nach einem Abbruch dort fort. Läuft
  lokal (rund eine Stunde), danach wird committet. Neu nur bei geänderter
  Abfrage oder erweiterter Liste.
- **Lizenz:** OSM-Daten, ODbL. `NOTICE` und das Impressum nennen
  „© OpenStreetMap-Mitwirkende" und die ODbL bereits.

## 8. Volume und Betrieb

- Volume `osm_daten`, 1 GB, Region `fra`, eingehängt unter `/data`
  (`[mounts]` in `fly.toml`). Etwa 0,15 $ im Monat; Fly sichert täglich.
- Das Backend läuft auf einer Maschine (`--ha=false`) – passend, denn ein
  Volume gehört zu genau einer Maschine.
- Einstellung `OSM_VOLUME_PFAD=/data/osm` in `fly.toml` (`[env]`). Lokal und in
  Tests leer: kein Volume-Bestand, sonst unverändert.
- **Schreibrecht:** Fly hängt das Volume als `root` ein, der Server läuft als
  `node`. Ein Startskript legt `/data/osm` an, übergibt es an `node` und startet
  den Server per `su-exec` als `node`. Der Server läuft nicht als root.

## 9. Hintergrund-Erneuerung

- Warteschlange im Prozess; ein Bahnhof steht nie doppelt darin.
- Einzeln nacheinander, 10 s Pause zwischen zwei Abrufen.
- Höchstens 50 Bahnhöfe je Stunde nimmt sie auf – nach einem Deploy mit vielen
  veralteten Daten keine Welle an Overpass.
- Je Bahnhof höchstens ein Versuch pro Tag; scheitert er, bleiben die alten
  Daten.
- Erfolg: aufs Volume schreiben, Graph-Cache-Einträge des Bahnhofs entfernen.
- Ohne Volume stößt sie nichts an: Ohne Ablage gäbe es nichts zu erneuern,
  der Graph-Cache hält den Bahnhof ohnehin nur 24 h.

## 10. Fehlerbehandlung

Die App bricht wegen des Bestands nie ab.

| Fall | Verhalten |
|---|---|
| Volume fehlt / nicht beschreibbar | einmal warnen (`degradation: 'osm-volume-fehlt'`), ohne Volume weiter |
| Datei kaputt / nicht lesbar | warnen, als „nicht vorhanden" behandeln; der nächste Erfolg überschreibt sie |
| Volume voll / Schreiben scheitert | warnen, nicht schreiben, weiter |
| Overpass scheitert im Vordergrund | Standardmodell wie heute, nichts speichern |
| Overpass scheitert in der Erneuerung | alte Daten bleiben, nächster Versuch frühestens nach einem Tag |

Gespeichert wird jede **erfolgreiche** Overpass-Antwort – auch wenn die
Klassifikation daraus nur Stufe 3 macht. So wird ein Bahnhof mit dünnen
OSM-Daten nicht ständig neu abgefragt.

## 11. Testbarkeit

Vitest, TDD wie bisher; Testordner liegen im Projekt (gitignored), nie im
Temp-Scratchpad.

- **Bestand:** Reihenfolge Volume vor Start; „veraltet" an 30 Tagen und an
  fremder Abfrageversion; kaputte Datei = nicht vorhanden; fehlender oder
  schreibgeschützter Ordner = Warnung, kein Fehler.
- **`/api/route`:** Bahnhof im Bestand → Overpass wird **nicht** gerufen;
  fehlt er → Overpass gerufen und geschrieben; veraltet → sofortige Antwort,
  Erneuerung angestoßen; nach gelungener Erneuerung baut die nächste Anfrage
  neu.
- **Erneuerung:** keine Doppelten, 10 s Pause, 50 je Stunde, ein Versuch pro
  Tag – mit simulierter Zeit.
- **Overpass-Client:** ein Logeintrag je Versuch mit Instanz, Ergebnis, Dauer.
- **Startbestand im Repo:** jede Datei in der aktuellen Abfrageversion; unter
  15 MB; Berlin Hbf, Hamburg Hbf, Frankfurt(Main)Hbf, München Hbf, Köln Hbf
  enthalten.
- **Dockerfile / `fly.toml`:** `osm-bestand` wird kopiert, `[mounts]` und
  `OSM_VOLUME_PFAD` gesetzt, Startskript ist der Einstiegspunkt.

## 12. Prüfung nach dem Deploy

Fly-Deploy mit `--ha=false`, vorher Volume anlegen.

1. Hamburg Hbf und Frankfurt Hbf direkt danach zum ersten Mal: **unter 1 s**
   (vorher 35,9 s / 4,6 s).
2. Ein kleiner Bahnhof außerhalb des Bestands: über Overpass geholt, danach
   liegt seine Datei auf dem Volume.
3. Maschine neu starten, derselbe kleine Bahnhof: schnell, vom Volume.
4. Fly-Logs zeigen die Overpass-Versuche einzeln.

## 13. Was sich NICHT ändert

- Antwortformat von `/api/route`, Frontend, Rate-Limits, SSE, FaSta-Pfad im
  Stufe-3-Fall, Graphbau und Klassifikation.
- Overpass-Abfrage selbst, Instanzreihenfolge und Wartezeiten.
- Die Simulationsablage `osm-ablage/` bleibt, wie sie ist.
