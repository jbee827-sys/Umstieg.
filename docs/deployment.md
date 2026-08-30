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
C:\Users\jbeer\.secrets\umstieg.env      # Quelle der Wahrheit
C:\Users\jbeer\.secrets\README.md        # Konvention, eine Datei je Projekt
```

Rechte sind eng gesetzt (nur der Benutzer, Vererbung entfernt):

```powershell
icacls "C:\Users\jbeer\.secrets" /inheritance:r /grant:r "MATEBOOK-JULIAN\jbeer:(OI)(CI)F"
```

Lokal starten (Git Bash, aus `backend/`):

```bash
npx tsx watch --env-file="$HOME/.secrets/umstieg.env" src/server.ts
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

```bash
cd backend && flyctl deploy --ha=false
curl https://umstieg-backend.fly.dev/api/health     # {"status":"ok"}
```

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

## Reihenfolge beim ersten Mal

1. Backend deployen und die Domain notieren.
2. `VITE_API_BASE` in Vercel auf diese Domain setzen.
3. Frontend deployen und dessen Domain notieren.
4. `CORS_ORIGIN` im Backend auf die Vercel-Domain setzen (`flyctl secrets set`,
   startet die Maschine neu).
5. Prüfen: Route berechnen (HTTP), dann Zug auswählen (SSE muss stehen).

Schritt 4 kommt zwingend nach 3 – vorher ist die Frontend-Domain nicht bekannt.

## Vercel-Vorschau-Deployments

Jeder Zweig bekommt eine eigene URL mit wechselndem Namen. Diese URLs stehen
nicht in `CORS_ORIGIN` und können die API deshalb nicht erreichen. Für einen
Vorschautest die konkrete URL vorübergehend in `CORS_ORIGIN` aufnehmen.
Absicht: eine Wildcard würde jede fremde Vercel-App an die API lassen.

## Was hier bewusst NICHT steht

- **`docker-compose.yml`** – gehört zu MVP-Task 17 und ist durch diese
  Aufteilung kleiner geworden: der geplante Multi-Stage-Container, der auch
  `frontend/dist` ausliefert, entfällt. Vercel übernimmt das.
- **`Caddyfile` / mkcert** (P1 Task 11) – Fly.io liefert HTTPS automatisch,
  Vercel ebenso. Der Task ist damit gegenstandslos, ausser für rein lokale
  Handy-Tests im WLAN.
