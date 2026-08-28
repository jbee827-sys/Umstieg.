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

## Backend deployen (Fly.io)

Einmalig:

```bash
cd backend
fly launch --no-deploy --name umstieg-backend --region fra   # liest fly.toml
fly secrets set DB_CLIENT_ID=... DB_CLIENT_SECRET=...
fly secrets set CORS_ORIGIN=https://<deine-vercel-domain>.vercel.app
```

Danach jedes Mal:

```bash
cd backend && fly deploy
curl https://umstieg-backend.fly.dev/api/health     # {"status":"ok"}
```

`fly.toml` setzt `min_machines_running = 1` und `auto_stop_machines = "off"`.
Das ist Absicht: Eine schlafende Maschine verliert Poller, SSE-Verbindungen
und Cache.

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
4. `CORS_ORIGIN` im Backend auf die Vercel-Domain setzen (`fly secrets set`,
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
