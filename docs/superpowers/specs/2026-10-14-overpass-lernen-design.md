# Overpass von Fly aus: höflich lernen ohne Zusatzkosten – Designdokument

Stand: 14.10.2026 · Im Brainstorming freigegeben (Ansatz „auf Fly lernen,
kostenlos, dafür langsamer, solange die Sperre besteht") · Zieldokument für den
Umsetzungsplan · Baut auf `2026-10-12-osm-bestand-design.md` auf

---

## 1. Ziel und Abgrenzung

**Ziel:** Ein Bahnhof außerhalb des Bestands wird wieder gelernt: Fragt ihn
jemand an, holt das Backend seine OSM-Daten von Overpass und speichert sie auf
dem Volume (Spec 2026-10-12, Abschnitt 4, Schritt 4). Gelingt das nicht sofort,
holt das Backend es später selbst nach. Dabei fragt es Overpass so selten wie
möglich und nie einen Server, der es gerade abweist.

**Erfolg heißt:**

- Ein unbekannter Bahnhof liegt nach einer Anfrage spätestens dann auf dem
  Volume, wenn ein Overpass-Server einmal antwortet – auch ohne zweite Anfrage
  eines Nutzers.
- Ein Server, der mit 429, 406 oder abgewiesener Verbindung antwortet, bekommt
  für eine feste Zeit **keine** Anfrage mehr von uns.
- Keine zusätzlichen Fly-Kosten (heute etwa 3,50 $ im Monat: eine Maschine,
  1 GB Volume).

**Ausdrücklich nicht das Ziel:**

- Eine eigene Ausgangsadresse bei Fly (`fly ips allocate-egress`, 3,60 $ im
  Monat). Sie wäre die zuverlässige Lösung und lässt sich später ohne
  Codeänderung dazuschalten.
- Bahnhöfe von Hand oder per lokalem Lauf nachfüllen – der Nutzer will das
  nicht.
- Overpass-Abfragen aus dem Browser der Nutzer, eigene OSM-Aufbereitung.
- Änderungen am Frontend.

## 2. Ausgangslage (gemessen am 14.10.2026)

| Befund | Beleg |
|---|---|
| `overpass-api.de` weist die Fly-Maschine ab | `ECONNREFUSED` auf allen vier Adressen (IPv4/IPv6, Port 443 und 80) nach 6–23 ms; von zu Hause antwortet derselbe Server |
| Die Fly-Maschine hat keine eigene Ausgangsadresse | geteilte Adressen von Zenlayer (AS21859): `98.98.156.30`, `2a0b:21c0:100a:49::2`; schon die erste Anfrage der neuen Maschine wurde abgewiesen |
| Der Ersatzserver ist tot | `overpass.kumi.systems` = `overpass.private.coffee` (193.219.97.30): nimmt Verbindungen an, antwortet nicht – auch nicht von zu Hause |
| `maps.mail.ru` liefert, aber wackelig | von Fly 1 von 3 echten Abfragen mit Daten (15 s), sonst 504 nach unter 1 s; von zu Hause 200 in 9,8 s |
| Unser Client missachtet 429 | `instanzReihenfolge()` fragt denselben Server nach 2 s erneut; gefordert sind mindestens 30 s |
| Ein Fehlschlag wird nicht nachgeholt | `osm/quelle.ts` wirft weiter; der Notbehelf steht 10 min im Graph-Cache, gelernt wird nur, wenn jemand später erneut fragt |

Laut OSM-Forum (26.08.–02.09.2026, gleiches Bild bei DigitalOcean) sperrt
`overpass-api.de` Adressen **automatisch**, die zu viele oder fehlerhafte
Anfragen schicken oder 429 missachten; die Sperre läuft von selbst aus. Sperren
nach User-Agent kommen als HTTP 406 und werden von Hand aufgehoben.

## 3. Festgelegte Entscheidungen

| Entscheidung | Festlegung | Begründung |
|---|---|---|
| Wer fragt Overpass | weiterhin das Backend auf Fly | Nutzerwunsch: kein Nachfüllen von Hand |
| Ersatzserver | `maps.mail.ru` statt `overpass.kumi.systems` | der einzige zweite Server, der von Fly aus überhaupt Daten liefert |
| Sperrpause | je Server, im Arbeitsspeicher | ein abweisender Server bekommt keine Anfragen; nach einem Neustart wird einmal neu gefragt |
| Nachholen | eine Stunde nach dem Fehlschlag über die vorhandene Erneuerung | nutzt deren Grenzen (50 je Stunde, 10 s Pause, ein Versuch je Bahnhof und Tag) statt neuer |
| Kosten | keine | Nutzervorgabe |

## 4. Sperrpause je Server

Neues Modul `clients/overpass-pausen.ts`: ein Zustand `OverpassPausen`, den
`app.ts` **einmal** erzeugt und Vordergrund wie Erneuerung teilen;
`overpassQuery` nimmt ihn als zusätzlichen, optionalen Parameter.

| Antwort des Servers | Pause für diesen Server | Zweiter Versuch am selben Server in dieser Abfrage |
|---|---|---|
| HTTP 429 („zu viele Anfragen") | 60 s | nein |
| Verbindung abgewiesen (`ECONNREFUSED`, auch in einem `AggregateError`) | 30 min | nein |
| HTTP 406 (Sperre nach User-Agent) | 24 h | nein |
| 504, Zeitüberschreitung, sonstige Fehler | keine | ja, wie heute (2 s Pause) |

- Ein pausierter Server wird übersprungen, ohne Netzverkehr. Das
  Versuchsprotokoll vermerkt den Sprung (`ok: false`, `fehler: 'pausiert bis …'`,
  `dauerMs: 0`).
- Sind alle Server pausiert, wirft `overpassQuery` sofort („alle Overpass-Server
  pausiert") – der Aufrufer fällt wie heute aufs Standardmodell.
- Ohne übergebenen Zustand verhält sich `overpassQuery` wie bisher; das Skript
  `bestand-fuellen.ts` bekommt einen eigenen Zustand.
- Höchstlast je Nutzeranfrage bleibt bei vier Versuchen; ein abweisender Server
  bekommt null.

## 5. Nachholen im Hintergrund

`osm/quelle.ts`: Scheitert Overpass für einen Bahnhof, der nicht im Bestand
liegt, ruft `hole()` `erneuerung.spaeter(auftrag)` und wirft dann wie bisher.

`osm/erneuerung.ts`, neu `spaeter(auftrag)`:

- merkt den Bahnhof vor und stößt ihn nach `NACHHOL_WARTEZEIT_MS` = 1 h über
  `stosseAn()` an – damit gelten dessen Grenzen unverändert;
- ein Bahnhof steht höchstens einmal in der Vormerkung;
- Zeitgeber mit `unref()`, Vormerkung nur im Arbeitsspeicher (nach einem
  Neustart stößt die nächste Nutzeranfrage sie neu an);
- ohne Volume gibt es keine Erneuerung und damit kein Nachholen (wie heute).

Gelingt der Abruf, schreibt die Erneuerung aufs Volume und meldet es über
`beiErneuert`; `api.ts` wirft den Notbehelf aus dem Graph-Cache. Die nächste
Anfrage baut aus dem Volume – Stufe 1 oder 2 statt Standardmodell.

**Last im schlechtesten Fall:** je unbekanntem Bahnhof höchstens alle 10 min ein
Vordergrund-Durchgang (Frist des Notbehelfs), solange Nutzer fragen, plus
höchstens ein Hintergrundversuch am Tag; insgesamt höchstens 50
Hintergrundabrufe je Stunde.

## 6. Fehlerbehandlung

Die App bricht nie wegen Overpass ab (unverändert). Neu:

| Fall | Verhalten |
|---|---|
| alle Server pausiert | sofort Standardmodell, Nachholen vorgemerkt |
| Nachholen scheitert | alte Lage bleibt; nächster Versuch frühestens nach einem Tag, wenn wieder jemand fragt |
| Abonnent wirft nach dem Nachholen | wie heute: Warnung `osm-erneuerung-abonnent-fehler` |

## 7. Testbarkeit

Vitest, TDD wie bisher; simulierte Zeit statt echter Wartezeiten.

- **Sperrpause:** 429 → kein zweiter Versuch am selben Server, nächste Abfrage
  innerhalb von 60 s überspringt ihn, danach fragt sie wieder; `ECONNREFUSED`
  (auch als `AggregateError`) → 30 min; 406 → 24 h; 504 → zweiter Versuch wie
  heute; alle pausiert → sofortiger Fehler ohne `fetch`; Versuchsprotokoll
  vermerkt den Sprung.
- **Ersatzserver:** Vorgabe ist `maps.mail.ru`; `OVERPASS_URL_FALLBACK` gilt
  weiter. Tests setzen die Umgebung fest (`vi.stubEnv`), damit eine Variable aus
  der Shell sie nicht mehr kippt (bekannte Lücke vom 14.10.).
- **Nachholen:** Fehlschlag außerhalb des Bestands → vorgemerkt, nach 1 h
  angestoßen; Treffer im Bestand oder Erfolg → nichts vorgemerkt; doppelte
  Vormerkung → einmal; nach gelungenem Nachholen baut `/api/route` neu.

## 8. Prüfung nach dem Deploy

1. Fly-Logs: `overpass-versuch` zeigt für `overpass-api.de` einmal „abgewiesen",
   danach 30 min „pausiert" statt neuer Verbindungsversuche.
2. Ein Bahnhof außerhalb des Bestands (z. B. Wiesenburg (Mark), 8010376):
   entweder sofort über mail.ru gelernt, oder Notbehelf und nach etwa einer
   Stunde `ls /data/osm` mit seiner Datei.
3. Danach dieselbe Route: Stufe 1 oder 2, schnell.

## 9. Was sich NICHT ändert

- Antwortformat von `/api/route`, Frontend, Bestand und Startbestand,
  Erneuerungsgrenzen, Graphbau.
- Overpass-Abfrage selbst und damit `ABFRAGE_VERSION` – der Startbestand bleibt
  gültig.
- Fly-Konfiguration (`fly.toml`), Volume, Kosten.
