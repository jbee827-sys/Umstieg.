# App Store: Datenquellen absichern (Paket 9)

Stand 24.10.2026. Was die App zur Laufzeit abruft und ob das in einer App im
App Store erlaubt ist.

## 1. Kartenkacheln – Entscheidung nötig

Heute: Rasterkacheln von `tile.openstreetmap.org` (Web und App,
`components/Karte.tsx`, CSP in `vercel.json`).

Problem für die App: Die Tile Usage Policy der OSM Foundation verlangt, dass
eine Anwendung sich erkennbar ausweist (gültiger `User-Agent` bzw. `Referer`)
und behält sich vor, Apps ohne Absprache zu sperren. Aus der WebView einer
Capacitor-App kommt die Anfrage mit dem `User-Agent` von Safari und ohne
brauchbaren `Referer` (`capacitor://localhost`). Das ist genau der Fall, den
die Policy ausschließt.

Kandidat **OpenFreeMap** (openfreemap.org): kostenlos, ohne Schlüssel, Code
unter MIT, Daten aus OpenStreetMap; als Namensnennung genügt bei MapLibre die
automatisch eingeblendete Zeile „OpenFreeMap © OpenMapTiles Data from
OpenStreetMap“. Eine Begrenzung der Abrufe nennt die Seite nicht; eine
Zusicherung, dass der Dienst dauerhaft frei bleibt, gibt es ebenfalls nicht.

Folgen des Wechsels – **das ist die Richtungsfrage an Julian**:

- OpenFreeMap liefert **Vektorkacheln** mit eigenem Stil, keine
  Rasterkacheln. MapLibre kann das, aber die Karte sieht anders aus
  (Schrift, Farben, Detailtiefe). Der Stil lässt sich an die Palette der App
  anpassen (eigene `style.json` im Projekt, Hell und Dunkel).
- CSP: `tiles.openfreemap.org` für Kacheln, Schriften (Glyphen) und Sprites
  statt `tile.openstreetmap.org`. Gilt für Web und App.
- Datenschutzerklärung „Kartendaten“: anderer Anbieter – Betreiber und
  Serverstandort vorher erfragen bzw. nachlesen, dann Text anpassen.
- `NOTICE`: OpenMapTiles-Namensnennung ergänzen.

Alternativen: ein kommerzieller Anbieter mit freiem Kontingent (MapTiler,
Stadia; Schlüssel nötig, Schlüssel läge im App-Paket) oder eigene Kacheln
(Protomaps-Datei auf eigenem Speicher; aufwendiger, dauerhaft unabhängig).

**Vorschlag:** OpenFreeMap mit eigenem, an die App angepasstem Stil.

## 2. DB API Marketplace

Genutzt über das Backend (nie aus der App direkt): Timetables, RIS::Stations,
FaSta, Wagenreihung, StaDa. Die App spricht nur mit unserem Server; an den
Bedingungen ändert die App nichts, solange der Server der Abnehmer bleibt.

Zu prüfen (Julian, im Konto auf developers.deutschebahn.com, je abonnierter
Schnittstelle unter „Nutzungsbedingungen“ bzw. „Lizenz“):

- [ ] Lizenz der Daten: laut `NOTICE` überwiegend CC BY 4.0 – erlaubt die
      Weitergabe in einer App mit Namensnennung, auch kommerziell.
- [ ] Ob die Bedingungen des **Zugangs** (Tarif „Free“, Kontingent je
      Minute) eine Nutzung „für Endnutzer in einer veröffentlichten App“
      ausschließen oder eine Anmeldung verlangen.
- [ ] Ob „DB“ im Store-Text genannt werden darf. Vorlage
      (`app-store-eintrag.md`) nennt die Bahn nur als Datenquelle, nicht im
      Namen und nicht in den Schlüsselwörtern (Richtlinie 2.3.7, 5.2.1).

Ergebnis danach in `NOTICE` unter „Deutsche Bahn“ festhalten.

## 3. Transitous – Anfrage

Transitous wird im Matrix-Kanal abgestimmt (siehe
`docs/2026-10-16-transitous-erkundung.md`). Entwurf, englisch, für Matrix
oder E-Mail; Julian schickt ab:

> Hi all,
>
> I run Umstieg. (https://www.umstieg.online, source:
> https://github.com/jbee827-sys/Umstieg.), a small open-source web app that
> guides rail passengers in Germany through a station when changing trains.
> Since October we use the Transitous API for stops near a station,
> departures and footpaths between stops. All requests go through our own
> server, are cached (search and footpaths 24 h, departure boards 30 s) and
> carry a contact in the User-Agent. Current volume is well below 200 requests
> a day.
>
> We would now like to publish the same app in Apple's App Store – free of
> charge, no ads, no accounts, no revenue. Nothing changes on the API side:
> the iOS app talks only to our server, never to Transitous directly, and the
> attribution (link to transitous.org/sources) is shown in the app as on the
> website.
>
> Is that compatible with your usage policy? If you'd rather we didn't, or if
> the volume grows, we plan to run our own MOTIS instance before the app ever
> earns money – and we'd be happy to coordinate on that.
>
> Thanks for Transitous!
> Julian

Sobald eine Antwort da ist: hier mit Datum festhalten. Lehnt Transitous ab,
blendet die App die Haltestellenfunktion zunächst aus (Plan, Abschnitt 7).
