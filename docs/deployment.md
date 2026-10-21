# Deployment

Zwei Ziele, bewusst getrennt.

## Warum getrennt?

Das Frontend ist ein statischer Vite-Build – ideal für ein CDN. Das Backend
ist es ausdrücklich **nicht**: Drei Eigenschaften brauchen einen Prozess, der
zwischen Anfragen weiterläuft und sich erinnert.

| Eigenschaft | Warum kein Serverless |
|---|---|
| Poller je EVA (`core/ueberwachung.ts`) | Bündelt Abfragen: **ein** Abruf je Bahnhof, egal wie viele Clients zusehen (Konzeptkorrektur 1). Getrennte Function-Instanzen teilen diesen Zustand nicht – bei 50 Zuschauern würden 50 Abfragen laufen und die DB-API-Ratenlimits reißen. |
| SSE (`routes/live.ts`) | Die Verbindung bleibt offen, damit der Server Gleiswechsel von sich aus schiebt. Serverless-Funktionen werden nach ihrem Zeitlimit zwangsbeendet. |
| Graph-Cache (`cache/lru.ts`) | Ein Overpass-Abruf dauert Sekunden, und Overpass ist ein Gemeinschaftsdienst mit Fair-Use-Grenzen. Ohne 24-h-Cache wartet jeder Nutzer neu und wir belasten fremde Infrastruktur unnötig. |

Deshalb: **Frontend auf Vercel, Backend als dauerhaft laufender Container.**

## Wie die beiden sich finden

Das Frontend ruft die API über `VITE_API_BASE` auf (`frontend/src/api/basis.ts`):

- **Entwicklung:** Variable leer/ungesetzt → die Aufrufe bleiben relativ
  (`/api/...`) und der Vite-Proxy leitet sie an `localhost:3001`. Nichts am
  gewohnten Ablauf ändert sich.
- **Produktion:** Variable zeigt auf die Backend-Domain, z. B.
  `https://umstieg-backend.fly.dev`.

**Kein `vercel.json`-Rewrite für `/api/*`.** Naheliegend wäre es, aber der
SSE-Strom liefe dann durch Vercels Proxy und würde dort gepuffert oder nach
dessen Zeitlimit getrennt – genau die Eigenschaft, die Task 16 herstellt.

Weil Frontend und Backend damit verschiedene Herkünfte haben, braucht das
Backend eine CORS-Allowlist: `CORS_ORIGIN` (kommagetrennt). Ist sie leer,
sendet das Backend **keine** CORS-Header – die sichere Voreinstellung für die
Entwicklung, wo ohnehin same-origin über den Proxy gearbeitet wird.

## Zugangsdaten

Die DB-Schluessel liegen **nicht im Repo**, sondern in einem Tresor ausserhalb
jedes Projektordners:

```
E:\jbeer\.secrets\umstieg.env      # Quelle der Wahrheit (seit 02.10.2026, vorher C:\Users\jbeer\.secrets)
E:\jbeer\.secrets\README.md        # Konvention, eine Datei je Projekt
```

Skripte lesen den Tresor über `backend/scripts/secrets.ts`; der Pfad steht nur
dort.

Rechte: Auf C: war die Vererbung entfernt, nur der Benutzer hatte Zugriff. Auf
E: erbt der Ordner (Stand 02.10.2026: SYSTEM, Administratoren, Benutzer). So
wird er wieder so eng wie zuvor:

```powershell
icacls "E:\jbeer\.secrets" /inheritance:r /grant:r "${env:USERDOMAIN}\${env:USERNAME}:(OI)(CI)F"
```

Lokal starten (Git Bash, aus `backend/`):

```bash
npx tsx watch --env-file="E:/jbeer/.secrets/umstieg.env" src/server.ts
```

Produktion liest keine Datei – Fly gibt die Werte direkt als
Umgebungsvariablen in den Container. Der Tresor ist die Quelle, Fly die Kopie.

`backend/.env.example` ist reine Vorlage und bleibt leer. `.gitignore` sperrt
`.env` und `.env.*` (mit Ausnahme von `.env.example`) – auch gegen den Fall,
dass Notepad beim Speichern `.env.txt` daraus macht.

### Alle APIs auf EINE Anwendung abonnieren

Das Backend nutzt ein einziges Schluesselpaar fuer alle DB-Aufrufe
(`dbAuthHeader()` in `clients/stations.ts`). Verteilt man die APIs auf mehrere
Marketplace-Anwendungen, funktioniert genau eine und der Rest liefert 401
`Cannot find valid subscription for the incoming API request`.

Benoetigt: **RIS::Stations**, **Timetables**, **FaSta**.

### Zwei Fallstricke, die je einen Abend gekostet haben

1. **RIS::Stations verlangt einen Vendor-Media-Type.** Mit
   `Accept: application/json` antwortet das Gateway **415**
   `No acceptable representation`. Richtig ist
   `Accept: application/vnd.de.db.ris+json` (siehe `clients/stations.ts`).
   Die anderen APIs sind mit `application/json` zufrieden.
2. **Die Basis-URL ist fuer alle APIs gleich aufgebaut:**
   `https://apis.deutschebahn.com/db-api-marketplace/apis/<produkt>/<version>`.
   RIS::Stations stand hier zunaechst faelschlich unter `/db/apis/...` und
   lieferte deshalb dauerhaft 401.

Beim Eintragen ausserdem auf **LF-Zeilenenden und keine Leerzeichen** achten –
Notepad haengt beim Einfuegen gern eines an, das Zeichen wird Teil des
Schluessels, und das Ergebnis ist ein stiller 401.

## Backend deployen (Fly.io)

Einmalig:

```bash
cd backend
flyctl apps create umstieg-backend          # NICHT `flyctl launch`
flyctl secrets set DB_CLIENT_ID=... DB_CLIENT_SECRET=...
flyctl secrets set CORS_ORIGIN=https://<deine-vercel-domain>.vercel.app
```

Bewusst `flyctl apps create` statt `flyctl launch`: `launch` will die fertige
`fly.toml` neu schreiben. Der App-Name ist bei Fly weltweit eindeutig; ist er
vergeben, anderen Namen waehlen und `app = "..."` in `fly.toml` anpassen.
Docker wird lokal nicht gebraucht, Fly baut remote.

Danach jedes Mal:

```powershell
flyctl deploy <pfad>\backend --ha=false
flyctl machines list                                # es darf genau eine geben
curl https://umstieg-backend.fly.dev/api/health     # {"status":"ok"}
```

Der Pfad davor ist das **Arbeitsverzeichnis**: flyctl liest dort die `fly.toml`,
nimmt daraus `app = "umstieg-backend"` und findet zugleich das `Dockerfile`.
Ohne ihn muss man im Ordner `backend/` stehen - aus dem Wurzelverzeichnis
heraus scheitert der Befehl damit, dass der App-Name fehlt.

### Warum `--ha=false` nicht optional ist

`fly.toml` setzt `min_machines_running = 1` und `auto_stop_machines = "off"`.
Das ist Absicht: Eine schlafende Maschine verliert Poller, SSE-Verbindungen
und Cache.

`min_machines_running` ist aber eine **Unter-, keine Obergrenze**. Ohne
`--ha=false` legt Fly beim Deploy zusaetzlich eine zweite Maschine fuer
Hochverfuegbarkeit an – beim ersten Deploy am 28.08.2026 genau so passiert.
Zwei Maschinen sind hier kein Gewinn, sondern der Fehler, den die Tabelle
oben vermeiden will:

| Zustand | Wirkung bei zwei Maschinen |
|---|---|
| Poller je EVA | **Zwei** Abrufe je Bahnhof statt einem – Konzeptkorrektur 1 ausgehebelt. |
| Graph-Cache | Jede Maschine haelt einen eigenen. Doppelte Overpass-Last, halbierte Trefferquote – bei einem Gemeinschaftsdienst mit Fair-Use-Grenzen relevant. |
| SSE | Unkritisch. Eine Verbindung bleibt auf ihrer Maschine, deren Poller speist sie. |

Ein Korrektheitsfehler entsteht daraus nicht – `/api/route` ist je Anfrage
zustandslos, ein SSE-Strom in sich konsistent. Es ist eine Verdopplung der
Last auf zwei fremde Dienste.

Der Preis der einen Maschine, bewusst akzeptiert: beim Deploy einige Sekunden
Ausfall, und kein Failover, wenn die Maschine stirbt. Sollte das eines Tages
stoeren, ist der Ausweg nicht eine zweite Maschine, sondern gemeinsamer
Zustand (Redis o. ae.) fuer Poller und Cache.

Nachtraeglich pruefen und aufraeumen:

```bash
flyctl machines list                 # es darf genau eine geben
flyctl machines destroy <id> --force # zweite entfernen
```

## OSM-Bestand und Volume (seit 12.10.2026)

Das Backend holt OSM-Daten nicht mehr bei jedem ersten Aufruf von Overpass:

1. Graph-Cache im Arbeitsspeicher (24 h)
2. Volume `/data/osm` – was das Backend selbst geholt oder erneuert hat
3. Startbestand `/app/osm-bestand` – Preisklassen 1–3, im Image
4. Overpass – Ergebnis landet auf dem Volume

Daten älter als 30 Tage oder aus einer älteren Abfrageversion werden sofort
benutzt und im Hintergrund erneuert (10 s Pause, höchstens 50 je Stunde, ein
Versuch je Bahnhof und Tag).

**Einmalig: Volume anlegen**

    flyctl volumes create osm_daten --size 1 --region fra -a umstieg-backend

**Startbestand erneuern** (nötig, wenn sich die Overpass-Abfrage ändert –
der Test `osm-startbestand.test.ts` schlägt dann an):

    cd backend
    npx tsx scripts/bestand-fuellen.ts
    # tote Spiegel: OVERPASS_URL_FALLBACK=https://maps.mail.ru/osm/tools/overpass/api/interpreter voranstellen

Danach `backend/osm-bestand/` committen und deployen.

**Danach jedes Mal auch die Bahnhofsseiten neu rechnen** (seit 21.10.2026,
Konzept Nutzergewinnung AP 5a). Die vorgerenderten Seiten `/bahnhof/<name>`
lesen ihre Gehzeiten aus eingecheckten JSON-Dateien, weil Vercel nur
`frontend/` baut:

    cd backend
    npm run bahnhofsseiten

Offline, ohne Schlüssel, rund 2,5 Minuten. Schreibt
`frontend/src/bahnhofsseiten/daten/<slug>.json` neu (alte Dateien werden
gelöscht) und protokolliert Bahnhöfe je Stufe, die übersprungenen der
Stufe 3, Gleise, die einem größeren Bahnhof überlassen werden, und die
Gesamtgröße. Über 5 MB: vor dem Einchecken nachfragen. Danach den Ordner
committen und das Frontend ausliefern.

**Overpass von Fly aus (seit 14.10.2026):** Ersatzserver ist `maps.mail.ru`
(`overpass.kumi.systems` antwortet nicht mehr). Wer mit 429, 406 oder
abgewiesener Verbindung antwortet, bekommt 60 s / 24 h / 30 min keine Anfrage –
im Log als `overpass-versuch` mit `fehler: "pausiert bis …"` und `dauerMs: 0`.
Scheitert ein Bahnhof, holt die Erneuerung ihn nach einer Stunde nach.
Fly schickt ausgehenden Verkehr über geteilte Adressen; sperrt Overpass eine
davon, hilft nur Warten oder eine eigene Adresse
(`fly ips allocate-egress -a umstieg-backend -r fra`, 3,60 $ im Monat).

**Prüfen:** In den Fly-Logs steht jeder Overpass-Versuch einzeln
(`ereignis: overpass-versuch`), Probleme mit dem Bestand als
`degradation: osm-volume-fehlt | osm-bestand-kaputt | osm-volume-schreibfehler | osm-erneuerung-gescheitert`.

## Haltestellenpfad (Umstieg 2.0)

| Variable | Wo | Zweck |
|---|---|---|
| `MOTIS_BASIS_URL` | `fly.toml` `[env]` | Basis der MOTIS-API, heute `https://api.transitous.org`. Leer = Haltestellen „nicht eingerichtet“, Bahnhöfe laufen weiter. Eigener MOTIS-Server später: nur diese Zeile (Spec Abschnitt 10). |
| `MOTIS_KONTAKT` | `fly secrets set MOTIS_KONTAKT=…` | Kontakt im User-Agent (F7). Nie ins Repository. |

**Last:** Das Backend schreibt stündlich `ereignis: motis-anfragen` mit Summen
je Endpunkt ins Protokoll (`fly logs | grep motis-anfragen`), beim Herunterfahren
auch die angebrochene Stunde. Grundlage für die Absprache im
Transitous-Matrix-Kanal (K7). Das Herunterfahren hängt an SIGINT (Flys
Standard-`kill_signal`) und SIGTERM (`src/herunterfahren.ts`): offene
Live-Ströme werden beendet – die Browser verbinden sich selbst neu –, dann
läuft `app.close()` mit dem Zähler; nach 4 s endet der Prozess in jedem Fall,
vor Flys `kill_timeout` von 5 s. Bis zum 18.10.2026 gab es diesen Handler
nicht, die angebrochene Stunde ging bei jedem Deploy verloren.

**Ausfalltest (K5):** lokal
`MOTIS_BASIS_URL=https://127.0.0.1:9 npx tsx src/server.ts`, auf Fly die Zeile in
`fly.toml` auf diese Adresse setzen und deployen. Bahnhöfe bleiben voll
nutzbar, Haltestellen melden „Haltestellendaten gerade nicht verfügbar“.
Danach die Zeile zurücksetzen.

**Prüfskript** (manuell, ruft die echte MOTIS-API, nacheinander mit 1,2 s
Pause – nicht in CI):

    cd backend
    MOTIS_BASIS_URL=https://api.transitous.org npx tsx scripts/haltestellen-pruefung.ts

Es prüft K1 (50 Haltestellen aus 10 Ländern), K2 (Tafeln) und K4 (20
Steigpaare) und legt das Ergebnis als JSON unter `.superpowers/` ab (gitignored).

## Frontend deployen (Vercel)

Einmalig:

```bash
vercel link
vercel env add VITE_API_BASE production     # https://umstieg-backend.fly.dev
vercel env add VITE_API_BASE preview        # dieselbe URL
```

Danach:

```bash
vercel deploy --prod
```

`vercel.json` im Wurzelverzeichnis baut aus `frontend/`, liefert `frontend/dist`
aus und setzt Sicherheits-Header. Beachte darin:
`Permissions-Policy: geolocation=(self)` – ohne diese Erlaubnis wäre die
gesamte Standortfunktion (P1) im Browser blockiert.

### Vorgerenderte Seiten (seit 21.10.2026, Konzept Nutzergewinnung)

`npm run build` laeuft dreistufig: `tsc -b`, `vite build`, dann
`tsx scripts/statische-seiten.tsx`. Der letzte Schritt schreibt nach
`frontend/dist/`:

| Pfad | Quelle |
|---|---|
| `/impressum/`, `/datenschutz/` | dieselben Komponenten wie in der App, auf Grundlage der gebauten `index.html` (mit JavaScript startet darauf die App) |
| `/bahnhof/<slug>/` (379), `/bahnhoefe/` | `frontend/src/bahnhofsseiten/daten/*.json` (aus `npm run bahnhofsseiten` im Backend) |
| `/sitemap.xml` | alle oeffentlichen Seiten |
| `/assets/bahnhofsseiten-<hash>.css`, `/assets/messung-<hash>.js` | CSS und Reichweitenmessung der Bahnhofsseiten - als Dateien, weil die CSP nichts Inline erlaubt |

`robots.txt` liegt in `frontend/public/`. `vercel.json` setzt
`"trailingSlash": false`; vorhandene Dateien gehen vor der Umschreibung
`/(.*) → /index.html`, unbekannte `/bahnhof/...` landen in der App.

**Vor der ersten Auslieferung in der Vorschau pruefen:** Liefert Vercel
`/bahnhof/hannover-hbf` (ohne Schraegstrich) die Datei
`bahnhof/hannover-hbf/index.html` - Titel „Umsteigen in Hannover Hbf …" -
oder die App? `vite preview` tut es nur mit Schraegstrich, die Doku von
Vercel sagt dazu nichts Ausdrueckliches. Faellt es auf die App: in
`scripts/statische-seiten.tsx` die Seiten als `bahnhof/<slug>.html`
schreiben und in `vercel.json` `"cleanUrls": true` setzen (Rewrite-Ziel
dann `/index`, laut Vercel-Doku ohne `.html`). Ebenso fuer `/bahnhoefe`,
`/impressum`, `/datenschutz`.

Pruefen ohne JavaScript (Vercel beantwortet `curl` nach einigen Abfragen mit
„Security Checkpoint" - einzeln und mit Abstand abfragen, sonst im Browser):

```bash
curl -s https://www.umstieg.online/ | grep -c "von Gleis zu Gleis"          # >= 2
curl -s https://www.umstieg.online/bahnhof/hannover-hbf | grep -c "Gleis"    # Treffer
curl -s -o /dev/null -w "%{http_code}\n" https://www.umstieg.online/robots.txt
curl -s https://www.umstieg.online/sitemap.xml | grep -c "<url>"             # 383
```

Im Browser: Konsole ohne CSP-Verstoesse (auch nicht beim JSON-LD-Block),
mobil und im Dunkelmodus; Lighthouse-SEO >= 90 fuer drei Bahnhofsseiten
(gross, mittel, klein, etwa Hannover Hbf, Gütersloh Hbf, Berlin-Neukölln).

## Suchmaschinen anmelden (Konzept Nutzergewinnung AP 6)

Braucht Julians Konten und die DNS-Einstellungen von `umstieg.online` -
deshalb nicht von Claude Code ausgefuehrt. Erst nach der Auslieferung der
vorgerenderten Seiten (die Sitemap muss live sein).

1. **Google Search Console:** <https://search.google.com/search-console> →
   „Property hinzufügen" → Typ **Domain** → `umstieg.online`. Den angezeigten
   TXT-Eintrag beim Domain-Anbieter im DNS hinterlegen, „Bestätigen" (kann
   einige Minuten bis Stunden dauern).
2. **Sitemap einreichen:** links „Sitemaps" →
   `https://www.umstieg.online/sitemap.xml` → „Senden". Erwartet: Status
   „Erfolgreich", 383 gefundene URLs.
3. **Bing Webmaster Tools:** <https://www.bing.com/webmasters> → „Aus der
   Google Search Console importieren" (ein Klick, keine zweite Bestätigung).
   Bing speist auch Copilot und DuckDuckGo.
4. **Indexierung anstoßen:** in der Search Console „URL-Prüfung" für
   `https://www.umstieg.online/` und zwei Bahnhofsseiten (etwa
   `/bahnhof/hannover-hbf`, `/bahnhof/koeln-hbf`) → „Indexierung beantragen".
5. **Nach zwei Wochen:** Indexierungsbericht („Seiten") und „Leistung" →
   Suchanfragen als Export an Claude Code geben; daraus wird ausgewertet,
   welche Bahnhofsseiten gefunden werden und mit welchen Suchwoertern.

Abnahme: Sitemap-Status „Erfolgreich", erste Bahnhofsseiten unter
„Indexiert".

## Reihenfolge beim ersten Mal

1. Backend deployen und die Domain notieren.
2. `VITE_API_BASE` in Vercel auf diese Domain setzen.
3. Frontend deployen und dessen Domain notieren.
4. `CORS_ORIGIN` im Backend auf die Vercel-Domain setzen (`flyctl secrets set`,
   startet die Maschine neu).
5. Prüfen: Route berechnen (HTTP), dann Zug auswählen (SSE muss stehen).

Schritt 4 kommt zwingend nach 3 – vorher ist die Frontend-Domain nicht bekannt.

## CORS_ORIGIN: was drinsteht (Stand 03.09.2026)

Sechs Herkünfte, kommagetrennt:

| Herkunft | Erreichbarkeit |
|---|---|
| `https://umstieg.vercel.app` | öffentlich |
| `https://umstieg.online` | öffentlich (leitet auf `www.` um) |
| `https://www.umstieg.online` | öffentlich |
| `https://umstieg-jbeerbaum827-8346s-projects.vercel.app` | **hinter Vercel-SSO** |
| `https://umstieg-git-main-jbeerbaum827-8346s-projects.vercel.app` | **hinter Vercel-SSO** |
| `https://umstieg-git-feat-mvp-jbeerbaum827-8346s-projects.vercel.app` | **hinter Vercel-SSO** |

Die drei projektbezogenen Vercel-Aliase antworten mit `302` auf
`vercel.com/sso-api`. Sie sind also nur für den eingeloggten Eigentümer
erreichbar – ihre Aufnahme in die Allowlist vergrössert die öffentliche
Angriffsfläche nicht, sondern macht Vorschautests möglich.

### Zwei Fallen beim Ändern

1. **`flyctl secrets set` ERSETZT den Wert, es hängt nichts an.** Wer nur die
   neue Domain setzt, kappt alle bisherigen – und merkt es erst, wenn die
   Produktionsseite keine Daten mehr bekommt. Immer die **volle** Liste
   setzen.
2. **Der Wert ist nicht zurücklesbar.** `flyctl secrets list` zeigt nur einen
   Digest; `flyctl ssh console -C "printenv CORS_ORIGIN"` ist der einzige
   direkte Weg. Steht der nicht zur Verfügung, lässt sich der Bestand nur
   **erfragen**: je Kandidat eine Anfrage mit `Origin:`-Kopf und schauen, ob
   eine Freigabe zurückkommt. Genau deshalb steht die Liste oben in diesem
   Dokument – sonst ist sie beim nächsten Mal wieder zu rekonstruieren.

```bash
# Bestand erfragen, wenn die Liste fehlt:
for D in <kandidat> ...; do
  printf "%-60s " "$D"
  curl -s -m 15 -D - -o /dev/null -H "Origin: https://$D"     https://umstieg-backend.fly.dev/api/health | grep -ci access-control-allow-origin
done
```

## Vercel-Vorschau-Deployments

Der **Zweig-Alias** (`umstieg-git-<zweig>-...vercel.app`) ist stabil und steht
für `main` und `feat/mvp` in `CORS_ORIGIN`. Ein **neuer Zweig** braucht einen
eigenen Eintrag.

Die URL des einzelnen Deployments (`umstieg-<hash>-...`) wechselt dagegen bei
jedem Build und lässt sich nicht dauerhaft eintragen – für einen Test mit
dieser konkreten URL vorübergehend aufnehmen. Eine Wildcard kommt nicht in
Frage: Sie liesse jede fremde Vercel-App an die API.

## Was hier bewusst NICHT steht

- **`docker-compose.yml`** – gehört zu MVP-Task 17 und ist durch diese
  Aufteilung kleiner geworden: der geplante Multi-Stage-Container, der auch
  `frontend/dist` ausliefert, entfällt. Vercel übernimmt das.
- **`Caddyfile` / mkcert** (P1 Task 11) – Fly.io liefert HTTPS automatisch,
  Vercel ebenso. Der Task ist damit gegenstandslos, ausser für rein lokale
  Handy-Tests im WLAN.
