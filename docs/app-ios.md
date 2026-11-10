# Umstieg. als iOS-App

Plan: `Umstieg_Konzepte/05-umsetzungsplan-app-store.md` (außerhalb des Repos).
Seit PR #1 (01.11.2026) liegt die App in `main`; `feat/app-ios` ist veraltet.
TestFlight-Bauten von Hand aus `main` starten. Web und App teilen sich einen Code; was nur in der App
gilt, fragt `istApp()` (`frontend/src/plattform/istApp.ts`).

## Aufbau

| Was | Wo |
|---|---|
| Capacitor-Konfiguration | `frontend/capacitor.config.ts` (Bundle-ID `online.umstieg.app`) |
| iOS-Projekt | `frontend/ios/App/App.xcodeproj`, Swift-Pakete über SPM (`ios/App/CapApp-SPM`, von Capacitor verwaltet) |
| App-Bau | `npm run build:app` → `frontend/dist-app` (nicht eingecheckt) |
| index.html der App | `frontend/src/plattform/appHtml.ts`: CSP als `<meta>` aus `vercel.json`, `viewport-fit=cover`, ohne Vortext |
| Cloud-Bau | `.github/workflows/ios.yml` (macOS 26, Xcode 26) |
| Bildschirmfotos | `.github/scripts/ios-bildschirmfotos.sh`; Artefakt `ios-bildschirmfotos` am Actions-Lauf |
| Export für App Store Connect | `frontend/ios/ExportOptions.plist` |
| Teilen-Erweiterung (Paket 7) | `frontend/ios/App/Teilen/`, App Group `group.online.umstieg.app` (`UebergabeSpeicher.swift`), Plugin `UebergabePlugin.swift`, Web-Seite `src/plattform/uebergabe.ts` |

Unterschiede zur Web-Fassung:

- Das Backend ist fest `https://umstieg-backend.fly.dev` (`vite.config.ts`).
  Fly muss die Herkunft `capacitor://localhost` in `CORS_ORIGIN` haben –
  Befehl in `docs/deployment.md`, Abschnitt „CORS_ORIGIN“.
- Keine Vercel-Messung in der App (bis Paket 4 die Einwilligung bringt).
- Ränder unter Statusleiste und Home-Balken über `env(safe-area-inset-*)`;
  `ist-app` an `<html>` schaltet App-Regeln in `index.css` ein.
- `/vorfuehrung/eingabe|uebersicht|weg` zeigt die Beispielreise der
  Einführungstour ohne Tour und ohne Netz – nur in der App und mit `npm run
  dev`. Daraus entstehen die Bildschirmfotos.

## Ohne Mac arbeiten

Lokal (Windows) geht alles bis auf Xcode:

```bash
cd frontend
npm run build:app      # dist-app
npx cap sync ios       # kopiert dist-app ins iOS-Projekt, schreibt Package.swift
```

Gebaut, gestartet und fotografiert wird in GitHub Actions. Jeder Push auf
`feat/app-ios`, der `frontend/` berührt, startet den Job `simulator`. Die
Fotos liegen danach im Lauf unter *Artifacts → ios-bildschirmfotos*.

Ein neues Capacitor-Plugin: `npm install @capacitor/<name>` und danach
`npx cap sync ios` – das schreibt `ios/App/CapApp-SPM/Package.swift` neu; die
Datei mit einchecken.

## Paket 3 – TestFlight einrichten (Julian)

Voraussetzung: Mitgliedschaft im Apple Developer Program ist freigeschaltet.

1. **App anlegen.** [App Store Connect](https://appstoreconnect.apple.com) →
   *Apps* → **+** → *Neue App*: Plattform iOS, Name **Umstieg.**, Sprache
   Deutsch, Bundle-ID **online.umstieg.app**, SKU `umstieg-ios` (frei
   wählbar, nur intern sichtbar), Zugriff „Vollständig“.
   - Fehlt die Bundle-ID in der Liste, vorher anlegen: developer.apple.com →
     *Certificates, Identifiers & Profiles* → *Identifiers* → **+** → *App
     IDs* → *App* → *Explicit* `online.umstieg.app`, unter *Capabilities*
     **App Groups** anhaken.
   - **Bundle-ID nicht verwechseln:** Im App-Eintrag steht `online.umstieg.app`,
     nie `group.online.umstieg.app`. Bis zum ersten hochgeladenen Bau lässt
     sie sich unter *App-Informationen* noch ändern, danach nicht mehr.
   - Die Teilen-Erweiterung braucht eine zweite ID und eine App Group. Die
     beiden App-IDs (`online.umstieg.app`, `online.umstieg.app.teilen`, im
     Portal „XC …“) legt der Actions-Lauf mit dem Admin-Schlüssel selbst an,
     **die App Group aber nicht** – auch nicht ihre Zuordnung. Von Hand:
     *Identifiers* → **+** → Typ **App Groups** (nicht *App IDs*!) →
     `group.online.umstieg.app`; dann bei beiden App-IDs unter *App Groups* →
     *Configure* die Gruppe anhaken → *Save*. Danach steht dort „Enabled App
     Groups (1)“. Fehlt das, scheitert das Archiv mit „Provisioning profile …
     doesn't match the entitlements file's value for the
     com.apple.security.application-groups entitlement“.
   - **Mindestens ein Gerät registrieren** (*Devices* → **+**, UDID des
     iPhones aus der Windows-App „Apple-Geräte“). Die automatische Signatur
     archiviert mit einem Entwicklungsprofil und signiert erst beim Export
     für den App Store um; ohne Gerät gibt es kein Entwicklungsprofil („Your
     team has no devices“).
2. **API-Schlüssel.** *Benutzer und Zugriff* → *Integrationen* → *App Store
   Connect API* → *Teamschlüssel* → **+**. Name `GitHub Actions`, Rolle
   **Admin**.
   - Abweichung vom Plan („App Manager“): Die automatische Signatur in der
     Cloud legt das Verteilungszertifikat selbst an („cloud-managed
     distribution certificate“). Mit einem App-Manager-Schlüssel bricht
     `xcodebuild -exportArchive` dabei mit *Cloud signing permission error*
     ab; berichtet funktioniert es nur mit Admin.
   - Die `.p8`-Datei lässt sich **nur einmal** herunterladen. Nicht ins
     Repository, nicht in den Chat – direkt in GitHub eintragen (Schritt 3)
     und danach an einem sicheren Ort aufbewahren oder löschen.
   - Auf der Seite stehen auch **Key ID** (zehn Zeichen, in der Tabelle) und
     **Issuer ID** (über der Tabelle).
3. **Team-ID.** developer.apple.com → *Account* → *Membership details* →
   *Team ID* (zehn Zeichen).
4. **Geheimnisse in GitHub.** Repository → *Settings* → *Secrets and
   variables* → *Actions* → *New repository secret*, vier Stück:

   | Name | Inhalt |
   |---|---|
   | `ASC_KEY_ID` | Key ID aus Schritt 2 |
   | `ASC_ISSUER_ID` | Issuer ID aus Schritt 2 |
   | `ASC_KEY_P8` | der **ganze Inhalt** der `.p8`-Datei, mit den Zeilen `-----BEGIN PRIVATE KEY-----` und `-----END PRIVATE KEY-----` (Datei im Editor öffnen, alles kopieren) |
   | `APPLE_TEAM_ID` | Team-ID aus Schritt 3 |

5. **Ersten Bau starten.** GitHub → *Actions* → *iOS* → *Run workflow* →
   Zweig `main`. Nach etwa 40 Minuten (erst Simulator-Job, dann TestFlight)
   steht der Bau in App Store Connect unter *TestFlight* (Apple verarbeitet
   ihn noch einige Minuten). Scheitert nur der TestFlight-Job: im Lauf
   *Re-run jobs* → **Re-run failed jobs**, das spart den Simulator-Job.
   „exit code 65“ ist nur die Sammelmeldung von xcodebuild – die Ursache
   steht weiter oben im Log (*View raw logs*, nach `error:` suchen).
   - Das Repository ist privat: macOS-Minuten zählen bei GitHub zehnfach.
   - Erster erfolgreicher Bau: 10.11.2026 (1.0). Apple warnte mit
     ITMS-90683 (fehlender Text `NSLocationAlwaysAndWhenInUseUsageDescription`,
     weil das Standort-Plugin die „Immer“-Abfrage im Code enthält); der Text
     steht seitdem in `Info.plist`, die App fragt weiterhin nur „Beim
     Verwenden“.
   Spätere Fassungen: Tag setzen, etwa `git tag app-v1.0.0 && git push
   origin app-v1.0.0` – die Version kommt dann aus dem Tag.
6. **Selbst testen.** *TestFlight* → *Interne Tests* → Gruppe anlegen → dich
   als Tester hinzufügen. Auf dem iPhone die App **TestFlight** öffnen und
   Umstieg installieren.
   - Beim ersten Bau fragt App Store Connect nach der
     **Exportkonformität**. Die App setzt `ITSAppUsesNonExemptEncryption =
     NO` (nur HTTPS des Systems); die Frage sollte deshalb gar nicht
     erscheinen.

Die Buildnummer ist die Laufnummer des Actions-Ablaufs und steigt damit von
selbst.
