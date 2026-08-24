# Umstiegs-Navigator

Web-App, die für einen Umstiegsbahnhof den konkreten Weg vom Ankunftsgleis zum Abfahrtsgleis liefert – als Schritt-für-Schritt-Anweisung und Karte – und live bewertet, ob der Anschluss erreichbar ist.

**Konzept:** [`2026-08-24-umstiegs-navigator-design.md`](./2026-08-24-umstiegs-navigator-design.md)
**Implementierungsplan:** [`docs/plans/2026-08-24-umsetzungsplan-mvp.md`](./docs/plans/2026-08-24-umsetzungsplan-mvp.md)

## Architektur

- **Backend:** Node.js ≥ 20, Fastify 5, TypeScript. Zustandslos, keine Datenbank, RAM-LRU-Cache. Holt zur Laufzeit OSM-Geometrie (Overpass) und DB-Live-Daten (Marketplace-APIs).
- **Frontend:** React + Vite + TypeScript, MapLibre GL. Mobil zuerst, große Schrift, Text vor Karte.
- **Betrieb:** ein Docker-Container (Backend liefert Frontend statisch aus).

## Projektstand

| Arbeitspaket | Status |
|---|---|
| Task 1 – Repo + Backend-Gerüst (Fastify, /api/health) | 🔄 in Arbeit |
| Task 2 – Frontend-Gerüst (Vite React TS) | ⬜ offen |
| Task 3–5 – Overpass-Client, Graphbau, Klassifikation | ⬜ offen |
| Task 6 – **Datenrealitäts-Spike** (Entscheidungstor) | ⬜ offen |
| Task 7–10 – Routing, Gehzeit/Ampel, Textgen, Synthesemodell | ⬜ offen |
| Task 11–12 – DB-Stations-Client, REST-API | ⬜ offen |
| Task 13–14 – Frontend-Ansichten, Karte | ⬜ offen |
| Task 15–16 – Live-Daten, SSE-Überwachung | ⬜ offen |
| Task 17 – Härtung, Docker | ⬜ offen |

## Entwicklung starten

```bash
cd backend && npm install && npm run dev   # Backend auf :3001
cd frontend && npm install && npm run dev  # Frontend auf :5173 (Proxy → :3001)
```

Tests: `cd backend && npm test`

## Offene Punkte / Blocker

- **DB API Marketplace:** Registrierung ausstehend → `DB_CLIENT_ID`/`DB_CLIENT_SECRET` in `.env` eintragen (Vorlage: `.env.example`). Bis dahin: Entwicklung gegen Fixtures, Live-Pfade degradieren transparent.
- **GitHub-Remote:** `gh` CLI nicht installiert – Repo ist nur lokal versioniert.
- **Vercel:** bewusst nicht verwendet (bestehendes VITA-Projekt bleibt unberührt); Deployment-Ziel ist Docker.
