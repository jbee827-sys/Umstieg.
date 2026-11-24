# Mitteilungen über Firebase – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die iOS-App bekommt Mitteilungen zur laufenden Reise vom Server über Firebase Cloud Messaging – auch angehalten, weggewischt, bei gesperrtem Handy.

**Architecture:** Eine „Reisewache“ im Backend (RAM, je Gerätetoken) hängt sich an die vorhandene `Ueberwachung`, entscheidet rein und testbar, wann eine Mitteilung fällig ist, und schickt sie über FCM HTTP v1. Die App meldet die Reise an und ab, trägt zugestellte Mitteilungen als Meldungen nach und zeigt aufgeklappt eine eigene Ansicht (Notification Content Extension).

**Tech Stack:** Fastify 5 / TypeScript / Vitest (Backend), React + Capacitor 8 + `@capacitor-firebase/messaging` (App), Swift (Content Extension), GitHub Actions (Cloud-Bau, kein Mac).

**Spec:** `E:\Claude-code\Umstieg_Konzepte\11-konzept-mitteilungen-firebase.md` (freigegeben 23.11.2026; Texte in Abschnitt 4a, Gestaltung in `11-mitteilungen-entwuerfe.html` daneben)

## Global Constraints

- Gemeldet werden: Gleis-/Steigwechsel, neue Ankunfts-/Abfahrtszeit, Ausfall (beide Züge), Ampel springt auf Rot (Anschluss), Erinnerung 5 Min. vor Ankunft.
- Verspätung nur, wenn ≥ 2 Min. Unterschied zur zuletzt **geschickten** Zeit **oder** Ampelwechsel; Gleiswechsel, Ausfall, Rot, Erinnerung nie gedrosselt.
- Rot nur durch Ereignisse, nie durch die Uhr; nach einem Gleiswechsel kein Rot mehr bis zur nächsten Anmeldung.
- Wache: Abfrage ab 90 Min. vor Ankunft; Ende = Abfahrt Anschluss (aktuell) + 2 Min., `DELETE` oder 8 h nach Anmeldung.
- Platz: Reservierung beim `PUT`; ohne Platz 503. Höchstens 300 Wachen, 10 je Aufrufer-Adresse, 20 Anmeldungen je Minute und Adresse.
- Texte nur im Server (Abschnitt 4a): Zug mit Doppelpunkt, kein „Noch“, kein „Bitte“, kein Satzpunkt im Text; Linie (`anzeige`) vor Zugname.
- Nur RAM; im Protokoll nie Token, Zugname oder Bahnhof je Gerät.
- Kein Firebase Analytics, kein Crashlytics; Auto-Init aus; alles App-Seitige hinter `istApp()`, nie in der Einführungstour (`vorfuehrungLaeuft()`).
- Keine neue Backend-Abhängigkeit (FCM-Zugang per `node:crypto` + `fetch`).
- Arbeitszweig `feat/mitteilungen` von `main`; Commits mit Autor Julian Beerbaum, ohne Claude-Kennzeichnung; nichts pushen ohne Julians ausdrückliche Anweisung.
- Frontend- und Backend-Suite nie gleichzeitig laufen lassen.

## Stand (23.11.2026, abends)

Tasks 1–6 erledigt (Backend komplett, 1233 Tests grün). Abweichungen vom Plan:
- Drosselung **ab** 2 Min. (Julian): 3 → 4 → 5 → 8 ergibt drei Mitteilungen.
- Neu: **Abgleich beim Aufwachen** (`abgleich` in `reisewache.ts`, `Ueberwachung.stand`): Was sich zwischen Anmeldung und erstem Abruf geändert hat, kam sonst nie als Ereignis an.
- `fcm.ts`: `INVALID_ARGUMENT` beendet die Wache nur, wenn FCM das Registrierungstoken meint – sonst würde ein Fehler in unserer Nachricht alle Wachen beenden. `FIREBASE_SERVICE_ACCOUNT` roh oder Base64.
- Testmitteilung trägt `daten.test = '1'` (App trägt sie nicht als Meldung nach).

Task 7 lokal erledigt (24.11.2026, `040cf33`), Abweichungen in der README unter „Hier weitermachen“. Offen: Cloud-Bau (Push nur auf Julians Anweisung). Weiter mit Task 8.

## Review Focus

1. **Reise über Mitternacht** (Ankunft 23:52, Anschluss 00:10): HH:MM aus dem Live-Strom muss auf den richtigen Tag fallen – sonst Rot und Erinnerung zur falschen Zeit. → Test in Task 2 und Task 3.
2. **Derselbe Zug ist Ankunft und Anschluss** (durchgebundener Zug, `zugAn === zugAb`): Das Ereignis gehört der Seite, deren Sollzeit es trägt. → Test in Task 3.
3. **Zweite Anmeldung mit demselben Token** (neue Reise) oder neues Token: alte Wache weg, Reservierung frei, keine Doppel-Abos. → Test in Task 4.
4. **App weggewischt, nie abgemeldet**: Ende nach Abfahrt + 2 Min. bzw. 8 h gibt Abo und Reservierung frei. → Test in Task 4.
5. **Firebase nicht eingerichtet** (kein `FIREBASE_SERVICE_ACCOUNT`): Backend startet, `PUT` antwortet 503 `nicht-eingerichtet`, die App bleibt bei lokalen Mitteilungen. → Test in Task 6 und Task 8.

---

## Dateien

| Datei | Aufgabe |
|---|---|
| `backend/src/core/ueberwachung.ts` (ändern) | Platzreservierung |
| `backend/src/core/zeit.ts` (ändern) | `berlinZeitpunktNahe` |
| `backend/src/core/mitteilungstexte.ts` | Titel, Text, Daten je Art (Abschnitt 4a) |
| `backend/src/core/reisewache.ts` | reine Entscheidung: Zustand + Ereignis → Mitteilungen |
| `backend/src/core/reisewachen.ts` | Lebenszyklus: Abos, Zeitgeber, Grenzen, Versand |
| `backend/src/clients/fcm.ts` | FCM HTTP v1: Zugangstoken, Nachricht, Fehlerart |
| `backend/src/routes/mitteilungen.ts` | `PUT`/`DELETE /api/mitteilungen/reise`, `POST /api/mitteilungen/test` |
| `backend/src/app.ts` (ändern) | Verdrahtung, CORS-Methoden, Ratengrenzen |
| `frontend/src/api/mitteilungen.ts` | Aufrufe an die drei Routen |
| `frontend/src/plattform/reiseanmeldung.ts` | `EingabeWerte` + Route → Anmeldung |
| `frontend/src/plattform/push.ts` | Plugin: Erlaubnis, Token, an/ab, zugestellte, Antippen |
| `frontend/src/plattform/mitteilungen.ts` (ändern) | lokale Mitteilungen aus, solange Push aktiv |
| `frontend/src/App.tsx` (ändern) | Anmelden, Abmelden, Nachtragen |
| `frontend/ios/App/Mitteilung/*` | Content Extension (Swift) |
| `frontend/ios/App/App/AppDelegate.swift`, `App.entitlements`, `Info.plist`, `project.pbxproj` (ändern) | Firebase, Push, Kategorie, neues Ziel |
| `.github/workflows/ios.yml` (ändern) | `GoogleService-Info.plist` aus Secret, Prüfung `Mitteilung.appex` |
| Datenschutz, `NOTICE`, `PrivacyInfo.xcprivacy`, `docs/app-ios.md`, `docs/app-store-eintrag.md`, `README.md` | Task 11 |

---

### Task 1: Platzreservierung in der Überwachung

**Files:**
- Modify: `backend/src/core/ueberwachung.ts` (Klasse `Ueberwachung`, `hatKapazitaetFuer`, `hatKapazitaetFuerAlle`)
- Test: `backend/test/ueberwachung-reservierung.test.ts`

**Interfaces:**
- Produces: `Ueberwachung.reserviere(schluessel: string[]): () => void` – zählt die Schlüssel bis zur Freigabe als belegt; mehrfach reserviert = ein Platz; ein Schlüssel, der reserviert UND abonniert ist, belegt einen Platz. `hatKapazitaetFuer`/`hatKapazitaetFuerAlle` zählen `jeEva ∪ reserviert`. Die Freigabefunktion ist idempotent.

- [x] **Step 1: Write the failing test**

```ts
it('zaehlt reservierte Schluessel als belegt', () => {
  const u = new Ueberwachung(async () => [], 30_000, undefined, 2);
  const frei = u.reserviere(['8011160']);
  expect(u.hatKapazitaetFuerAlle(['8000105', '8000261'])).toBe(false);
  expect(u.hatKapazitaetFuer('8000105')).toBe(true);
  frei();
  expect(u.hatKapazitaetFuerAlle(['8000105', '8000261'])).toBe(true);
});
it('belegt mit Reservierung und Abo fuer denselben Schluessel nur einen Platz', () => {
  const u = new Ueberwachung(async () => [], 30_000, undefined, 2);
  u.reserviere(['8011160']);
  const ab = u.abonniere('8011160', [], () => {});
  expect(u.hatKapazitaetFuer('8000105')).toBe(true);
  ab();
});
it('gibt eine doppelt reservierte Stelle erst nach beiden Freigaben frei', () => {
  const u = new Ueberwachung(async () => [], 30_000, undefined, 1);
  const a = u.reserviere(['8011160']);
  const b = u.reserviere(['8011160']);
  a(); a();
  expect(u.hatKapazitaetFuer('8000105')).toBe(false);
  b();
  expect(u.hatKapazitaetFuer('8000105')).toBe(true);
});
```

- [x] **Step 2: Run it** – `cd backend && npx vitest run test/ueberwachung-reservierung.test.ts` → FAIL (`reserviere is not a function`)
- [x] **Step 3: Implement** `reserviere` mit einem Zähler je Schlüssel (`Map<string, number>`); Kapazität über die Vereinigung beider Mengen.
- [x] **Step 4: Run it and the live tests** – `npx vitest run test/ueberwachung-reservierung.test.ts test/live*.test.ts` → PASS
- [x] **Step 5: Commit** – `feat(backend): Ueberwachung reserviert Plaetze fuer Reisewachen`

---

### Task 2: Uhrzeit nahe einem Bezug und die Texte

**Files:**
- Modify: `backend/src/core/zeit.ts`
- Create: `backend/src/core/mitteilungstexte.ts`
- Test: `backend/test/mitteilungstexte.test.ts`

**Interfaces:**
- Produces: `berlinZeitpunktNahe(hhmm: string, bezug: Date): Date` – der Zeitpunkt mit dieser Berliner Uhrzeit, der `bezug` am nächsten liegt (±12 h).
- Produces (alle in `mitteilungstexte.ts`):

```ts
export type MitteilungsArt =
  | 'rot' | 'erinnerung' | 'zeit-an' | 'zeit-ab' | 'gleis-an' | 'gleis-ab' | 'ausfall-an' | 'ausfall-ab';
export type Status = 'erreichbar' | 'knapp' | 'faellt-aus';
export interface Mitteilung {
  art: MitteilungsArt;
  titel: string;
  text: string;
  /** Bündel für apns-collapse-id / android collapse_key: `${art}|${zug}` */
  buendel: string;
  /** FCM `data`, nur Strings – Schlüssel siehe `mitteilungsDaten` */
  daten: Record<string, string>;
}
export interface TextZug { anzeige: string; uhr: string; gleis: string; richtung: string }
export function textRot(ab: TextZug, minuten: number): { titel: string; text: string };
export function textErinnerung(bahnhofName: string, ab: TextZug): { titel: string; text: string };
export function textZeitAn(an: TextZug, alt: string, neu: string, umstiegMin: number): { titel: string; text: string };
export function textZeitAb(ab: TextZug, alt: string, neu: string): { titel: string; text: string };
export function textGleis(zug: TextZug, seite: 'an' | 'ab', haltWort: 'Gleis' | 'Steig', alt: string, neu: string): { titel: string; text: string };
export function textAusfall(zug: TextZug): { titel: string; text: string };
export function mitteilungsDaten(d: {
  art: MitteilungsArt; zug: string; anzeige: string; seite: 'an' | 'ab'; alt?: string; neu?: string;
  restMin: number; gehMin: number; status: Status; stand: string; gleisAlt?: string; gleisNeu?: string;
  aktion: 'weg' | 'verbindung'; aktionGleis?: string;
}): Record<string, string>;
```

- [x] **Step 1: Write the failing tests** – Texte wörtlich aus Abschnitt 4a:

```ts
const RE3: TextZug = { anzeige: 'RE 3', uhr: '16:23', gleis: '6', richtung: 'Schwedt (Oder)' };
const ICE: TextZug = { anzeige: 'ICE 1134', uhr: '16:01', gleis: '8', richtung: 'Frankfurt(Main)Hbf' };
expect(textRot(RE3, 6)).toEqual({ titel: 'Anschluss knapp', text: 'RE 3 in 6 Min. ab Gleis 6' });
expect(textErinnerung('Berlin Hbf', RE3)).toEqual({ titel: 'Gleich in Berlin Hbf', text: 'RE 3: 16:23 ab Gleis 6' });
expect(textZeitAn(ICE, '16:01', '16:09', 14)).toEqual({ titel: 'ICE 1134: 16:09 statt 16:01', text: '14 Min. zum Umsteigen' });
expect(textZeitAb(RE3, '16:23', '16:31')).toEqual({ titel: 'RE 3: 16:31 statt 16:23', text: 'Anschluss erreichbar' });
expect(textGleis(RE3, 'ab', 'Gleis', '6', '5')).toEqual({ titel: 'Gleis 5 statt 6', text: 'RE 3 nach Schwedt (Oder), ab 16:23' });
expect(textGleis(ICE, 'an', 'Gleis', '8', '9')).toEqual({ titel: 'Gleis 9 statt 8', text: 'ICE 1134 aus Frankfurt(Main)Hbf, an 16:01' });
expect(textAusfall({ ...RE3, anzeige: 'Bus 245' })).toEqual({ titel: 'Bus 245 fällt aus', text: 'Andere Verbindung wählen' });
// kein Satzpunkt, kein „Noch“, kein „Bitte“ in irgendeinem Text
for (const t of alleBeispieltexte) expect(t.text).not.toMatch(/\.$|^Noch|Bitte/);
// mitteilungsDaten: nur Strings, Zahlen als Dezimalstring
expect(mitteilungsDaten({ art: 'gleis-ab', zug: 'RE 3352', anzeige: 'RE 3', seite: 'ab', alt: '6', neu: '5',
  restMin: 9, gehMin: 4, status: 'erreichbar', stand: '15:56', gleisAlt: '6', gleisNeu: '5', aktion: 'weg', aktionGleis: '5' }))
  .toEqual({ art: 'gleis-ab', zug: 'RE 3352', anzeige: 'RE 3', seite: 'ab', alt: '6', neu: '5', restMin: '9', gehMin: '4',
    status: 'erreichbar', stand: '15:56', gleisAlt: '6', gleisNeu: '5', aktion: 'weg', aktionGleis: '5' });
// berlinZeitpunktNahe – Review Focus 1
const bezug = new Date('2026-11-23T22:52:00Z'); // 23:52 Berlin
expect(berlinZeitpunktNahe('00:10', bezug).toISOString()).toBe('2026-11-23T23:10:00.000Z');
expect(berlinZeitpunktNahe('23:40', bezug).toISOString()).toBe('2026-11-23T22:40:00.000Z');
```

- [x] **Step 2: Run it** – `npx vitest run test/mitteilungstexte.test.ts` → FAIL
- [x] **Step 3: Implement** beide Dateien; `berlinZeitpunktNahe` über `berlinTeile` (Kandidaten gestern/heute/morgen, der nächste gewinnt).
- [x] **Step 4: Run it** → PASS
- [x] **Step 5: Commit** – `feat(backend): Mitteilungstexte nach Konzept 4a und Berliner Uhrzeit nahe einem Bezug`

---

### Task 3: Reisewache – die Entscheidung

**Files:**
- Create: `backend/src/core/reisewache.ts`
- Test: `backend/test/reisewache.test.ts`

**Interfaces:**
- Consumes: `LiveEreignis` (`core/ueberwachung.ts`), `ampel` (`core/gehzeit.ts`), Task 2.
- Produces:

```ts
export type Plattform = 'ios' | 'android';
export interface ZugDerReise {
  /** Tafelschlüssel: DB `zug` („RE 3352“) bzw. Haltestellenpfad `fahrtId` */
  name: string;
  /** Linie („RE 3“, „Bus 245“); fehlt beim Fernverkehr */
  anzeige?: string;
  soll: string;      // ISO
  ist?: string;      // ISO, wenn bei der Anmeldung schon abweichend
  gleis: string;
  richtung: string;  // Ziel (Anschluss) bzw. Herkunft (Ankunft)
}
export type WachOrt =
  | { pfad: 'bahnhof'; eva: string }
  | { pfad: 'haltestelle'; an: { id: string; lat: number; lon: number }; ab: { id: string; lat: number; lon: number } };
export interface ReiseAnmeldung {
  ort: WachOrt;
  bahnhofName: string;
  haltWort: 'Gleis' | 'Steig';
  an?: ZugDerReise;
  ab: ZugDerReise;
  gehzeitSek: number;
}
export interface WachZustand { /* frei, aber unveränderlich behandelt */ }
export function neuerZustand(reise: ReiseAnmeldung): WachZustand;
export function beurteile(z: WachZustand, e: LiveEreignis, seite: 'an' | 'ab', jetzt: Date): { zustand: WachZustand; mitteilungen: Mitteilung[] };
export function erinnerung(z: WachZustand, jetzt: Date): { am: Date; mitteilung: Mitteilung } | null;
export function seiteVon(z: WachZustand, e: LiveEreignis, quelle?: 'arr' | 'dep'): 'an' | 'ab' | null;
export function wachAb(z: WachZustand): Date;     // (Ankunft ?? Abfahrt) − 90 Min.
export function endeAm(z: WachZustand, angemeldet: Date): Date; // min(Abfahrt aktuell + 2 Min., angemeldet + 8 h)
```

Regeln, die die Tests festhalten (aus der Spec):
- `verspaetung`: geschickt nur bei |neu − zuletzt geschickt| ≥ 2 Min. oder Farbwechsel; Kippt die Verspätung die Ampel auf Rot, geht **nur** die Rot-Mitteilung hinaus (eine statt zwei).
- `gleiswechsel`: immer; danach `gehzeitVeraltet` → kein Rot mehr.
- `ausfall`: immer, einmal je Seite.
- Rot: nur bei Übergang grün/gelb → rot; Restminuten = Abfahrt − max(jetzt, Ankunft), aufgerundet auf ganze Minuten.
- Erinnerung: Ankunft (aktuell) − 5 Min.; `null`, wenn schon vorbei (< jetzt + 30 s) oder keine Ankunft.
- `daten` füllt Task 2 `mitteilungsDaten`: `status` aus der Ampel (`rot` → `knapp`, sonst `erreichbar`; Ausfall → `faellt-aus`), `aktion` = `verbindung` bei Ausfall, sonst `weg` mit dem aktuellen Anschlussgleis.

- [x] **Step 1: Write the failing tests** (Beispielreise: ICE 1134 an 16:01 Gleis 8, RE 3352/„RE 3“ ab 16:23 Gleis 6, Gehzeit 240 s, Berlin Hbf)

```ts
it('drosselt Verspaetungen ab 2 Min.: 3 → 4 → 5 → 8 Min. ergeben drei Mitteilungen', ...)   // Ereignisse 16:26, 16:27, 16:28, 16:31 → geschickt 16:26, 16:28 und 16:31 (Julian 23.11.: „ab 2 Minuten“)
it('schickt eine Verspaetung unter 2 Min., wenn die Ampel die Farbe wechselt', ...)
it('meldet Rot nur beim Wechsel von gruen/gelb auf rot, nicht wenn es rot bleibt', ...)
it('schickt bei einer Verspaetung, die Rot ausloest, nur die Rot-Mitteilung', ...)
it('meldet nach einem Gleiswechsel kein Rot mehr (Gehzeit veraltet)', ...)
it('meldet jeden Gleiswechsel und jeden Ausfall, ungedrosselt', ...)
it('verschiebt die Erinnerung mit der Ankunft und laesst eine vergangene weg', ...)
it('ordnet ein Ereignis ueber die Sollzeit zu, wenn Ankunft und Anschluss derselbe Zug sind', ...) // Review Focus 2
it('rechnet ueber Mitternacht: Ankunft 23:52, Anschluss 00:10', ...)                       // Review Focus 1
it('endet 2 Min. nach der aktuellen Abfahrt, spaetestens 8 h nach der Anmeldung', ...)
it('wacht 90 Min. vor der Ankunft auf', ...)
```

Jeder Test prüft `mitteilungen.map(m => [m.art, m.titel, m.text])` mit den Werten aus Task 2.

- [x] **Step 2: Run it** – `npx vitest run test/reisewache.test.ts` → FAIL
- [x] **Step 3: Implement** `reisewache.ts` – rein, ohne Zeitgeber und ohne Fastify.
- [x] **Step 4: Run it** → PASS
- [x] **Step 5: Commit** – `feat(backend): Reisewache entscheidet, wann eine Mitteilung faellig ist`

---

### Task 4: Reisewachen – Lebenszyklus

**Files:**
- Create: `backend/src/core/reisewachen.ts`
- Test: `backend/test/reisewachen.test.ts` (Vitest-Fake-Timer, falsche Überwachung, falscher Versand)

**Interfaces:**
- Consumes: Task 1 `reserviere`, Task 3, `Ueberwachung.abonniere`, `HaltestellenLive` + `haltestellenLiveSchluessel` (`routes/live.ts`), `Protokoll`.
- Produces:

```ts
export type Versandergebnis = 'ok' | 'token-ungueltig' | 'fehler';
export type Versand = (token: string, plattform: Plattform, m: Mitteilung) => Promise<Versandergebnis>;
export class Reisewachen {
  constructor(
    quellen: { bahnhof: Ueberwachung; haltestellen: HaltestellenLive | null },
    versand: Versand,
    o?: { max?: number; jeAufrufer?: number; log?: Protokoll; jetzt?: () => Date },
  );
  /** Legt an oder ersetzt (gleicher Token). 'voll' = kein Platz/über 300, 'zu-viele' = über 10 je Aufrufer. */
  melde(token: string, plattform: Plattform, reise: ReiseAnmeldung, aufrufer: string): 'ok' | 'voll' | 'zu-viele' | 'haltestellen-fehlen';
  vergiss(token: string): void;
  anzahl(): number;
  beende(): void;
}
```

Verhalten: reserviert beim `melde` (Bahnhof: `[eva]`; Haltestelle: beide `haltestellenLiveSchluessel(...)`), ruht bis `wachAb`, abonniert dann (Bahnhof: Züge `[an.name, ab.name]`; Haltestelle: `merkeOrt` + je Schlüssel die Fahrt), stellt den Erinnerungs-Zeitgeber nach jeder Ankunftsänderung neu, endet bei `endeAm`. `token-ungueltig` beendet die Wache sofort; `fehler` nur protokollieren (`degradation: 'mitteilung-fehlgeschlagen'`, ohne Token). Protokoll nur als Summen (`ereignis: 'mitteilungen'`, je Stunde: angelegt, geschickt je Art, Fehler) – Muster `core/anfragezaehler.ts`.

- [x] **Step 1: Write the failing tests**

```ts
it('reserviert beim Anmelden und abonniert erst 90 Min. vor der Ankunft', ...)
it('ersetzt die Wache bei erneuter Anmeldung mit demselben Token und gibt den alten Platz frei', ...) // Review Focus 3
it('beendet die Wache 2 Min. nach der Abfahrt und gibt Abo und Reservierung frei', ...)              // Review Focus 4
it('beendet die Wache spaetestens 8 h nach der Anmeldung', ...)
it('antwortet voll, wenn die Ueberwachung keinen Platz hat oder 300 Wachen laufen', ...)
it('antwortet zu-viele ab der 11. Wache derselben Adresse', ...)
it('beendet die Wache, wenn FCM das Token ablehnt', ...)
it('schickt die Erinnerung zur verschobenen Zeit', ...)
it('schreibt nie Token, Zug oder Bahnhof ins Protokoll', ...) // Protokoll-Spy, JSON.stringify(alle Aufrufe) enthält keins davon
```

- [x] **Step 2: Run it** → FAIL
- [x] **Step 3: Implement** `reisewachen.ts` (`setTimeout` mit `unref`, alle Zeitgeber je Wache in `beende`/`vergiss` geräumt).
- [x] **Step 4: Run it** → PASS
- [x] **Step 5: Commit** – `feat(backend): Reisewachen mit Platz, Zeitgebern und Ende`

---

### Task 5: FCM-Versand

**Files:**
- Create: `backend/src/clients/fcm.ts`
- Test: `backend/test/fcm.test.ts`

**Interfaces:**
- Consumes: Task 2 `Mitteilung`, Task 4 `Versand`.
- Produces:

```ts
export function erzeugeFcmVersand(env: NodeJS.ProcessEnv, fetchFn?: typeof fetch, jetzt?: () => number): Versand | null;
export function fcmNachricht(token: string, plattform: Plattform, m: Mitteilung): object; // Body für messages:send
```

`FIREBASE_SERVICE_ACCOUNT` = Dienstkonto-JSON (`project_id`, `client_email`, `private_key`); fehlt oder unlesbar → `null`. Zugangstoken: JWT RS256 mit `node:crypto` (`scope https://www.googleapis.com/auth/firebase.messaging`, `aud https://oauth2.googleapis.com/token`), getauscht bei `https://oauth2.googleapis.com/token`, zwischengespeichert bis 60 s vor Ablauf. Senden: `POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`. HTTP 404 oder Fehler `UNREGISTERED`/`INVALID_ARGUMENT` (Token) → `token-ungueltig`; alles andere ≠ 2xx oder Netzfehler → `fehler`. Kein Wiederholen.

`fcmNachricht` setzt: `message.token`, `notification { title, body }`, `data` = `m.daten`, `apns.headers['apns-collapse-id']` = `m.buendel` (gekürzt auf 64 Byte), `apns.payload.aps { sound: 'default', category: 'reise' }`, `android.collapse_key` = `m.buendel`.

- [x] **Step 1: Write the failing tests** – gefälschter `fetchFn`, Testschlüssel per `crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })`:

```ts
it('liefert null ohne Dienstkonto', () => expect(erzeugeFcmVersand({})).toBeNull());
it('holt ein Zugangstoken und nutzt es bis kurz vor Ablauf wieder', ...)   // zwei Sendungen → ein Token-Abruf
it('baut die Nachricht mit Kategorie reise, collapse-id und data', ...)   // toMatchObject auf fcmNachricht(...)
it('meldet token-ungueltig bei UNREGISTERED', ...)
it('meldet fehler bei 500 und bei Netzfehler, ohne zu werfen', ...)
```

- [x] **Step 2: Run it** → FAIL
- [x] **Step 3: Implement** `fcm.ts`.
- [x] **Step 4: Run it** → PASS
- [x] **Step 5: Commit** – `feat(backend): FCM HTTP v1 ohne neue Abhaengigkeit`

---

### Task 6: Routen und Verdrahtung

**Files:**
- Create: `backend/src/routes/mitteilungen.ts`
- Modify: `backend/src/app.ts` (CORS-Methoden Zeile ~204, Ratengrenzen-Tabelle ~114, Registrierung nach `registriereLiveRouten`, `AppOptionen.clients`: `reisewachen?`, `fcmVersand?`)
- Test: `backend/test/mitteilungen-route.test.ts`

**Interfaces:**
- Consumes: Task 4, Task 5.
- Produces:
  - `export function pruefeAnmeldung(body: unknown): { ok: true; token: string; plattform: Plattform; reise: ReiseAnmeldung } | { ok: false; fehler: string }` – Token 1–4096 Zeichen; `plattform` ∈ `ios|android`; EVA per `istGueltigeEva`; ISO-Zeiten gültig; `gehzeitSek` 1–7200; Strings ≤ 200 Zeichen.
  - `export function registriereMitteilungsRouten(app: FastifyInstance, wachen: Reisewachen | null, versand: Versand | null): void`
  - `PUT /api/mitteilungen/reise` → 204 · 400 `{ fehler }` · 429 `{ fehler: 'zu-viele' }` · 503 `{ fehler: 'voll' | 'nicht-eingerichtet' }` (`haltestellen-fehlen` aus Task 4 – Haltestellenpfad ohne Transitous – ebenfalls 503 `nicht-eingerichtet`)
  - `DELETE /api/mitteilungen/reise` (Body `{ token }`) → 204 immer bei gültigem Body
  - `POST /api/mitteilungen/test` (Body `{ token, plattform }`, **vorübergehend** für TestFlight) → schickt eine Mitteilung `art: 'gleis-ab'` mit den Beispieltexten aus 4a; 204 · 502 bei `fehler`/`token-ungueltig` · 503 ohne Versand
- CORS: `methods: ['GET', 'POST', 'PUT', 'DELETE']`. Ratengrenzen: `'/api/mitteilungen/reise': 20`, `'/api/mitteilungen/test': 2`.

- [x] **Step 1: Write the failing tests** (mit `buildApp(..., { clients: { reisewachen, fcmVersand } })` und `app.inject`)

```ts
it('nimmt eine gueltige Anmeldung mit 204 an', ...)
it('lehnt kaputte Anmeldungen mit 400 ab (EVA, Zeit, Plattform, Token)', ...)
it('antwortet 503 nicht-eingerichtet ohne FCM-Zugang, und der Server startet trotzdem', ...) // Review Focus 5
it('antwortet 503 voll und 429 zu-viele aus den Reisewachen', ...)
it('beantwortet den CORS-Preflight fuer PUT und DELETE von capacitor://localhost', ...)
it('nimmt nie einen Text vom Aufrufer an', ...) // Body mit titel/text → wird ignoriert, Mitteilungstext stammt aus Task 2
```

- [x] **Step 2: Run it** → FAIL
- [x] **Step 3: Implement** Route und Verdrahtung (`new Reisewachen({ bahnhof: ueberwachung, haltestellen: haltestellenLive }, versand, { log })`, nur wenn `versand` nicht `null`; `onClose` → `beende()`).
- [x] **Step 4: Run the whole backend suite and lint** – `npm test && npm run lint` → alles grün
- [x] **Step 5: Commit** – `feat(backend): Routen fuer Reisewachen und Testmitteilung`

---

### Task 7: Firebase in der iOS-App einrichten

**Files:**
- Modify: `frontend/package.json` (`@capacitor-firebase/messaging`, passende `firebase`-Version laut Plugin-README), `frontend/capacitor.config.ts`, `frontend/ios/App/CapApp-SPM/Package.swift` (von `npx cap sync ios`), `frontend/ios/App/App/AppDelegate.swift`, `App.entitlements`, `Info.plist`, `.github/workflows/ios.yml`

**Interfaces:**
- Produces: Plugin `FirebaseMessaging` im JS verfügbar; Kategorie `reise` mit den Aktionen `weg` und `oeffnen` (beide `.foreground`) im `AppDelegate` registriert.

Vorgaben:
- Vor dem Einbau die API in `node_modules/@capacitor-firebase/messaging/dist/esm/definitions.d.ts` lesen und die Namen in Task 8 daran prüfen (`requestPermissions`, `getToken`, `addListener('tokenReceived' | 'notificationActionPerformed')`, `getDeliveredNotifications`, `removeDeliveredNotifications`).
- `capacitor.config.ts`: `plugins.FirebaseMessaging.presentationOptions = []` (kein Banner bei offener App) und die SPM-`packageOptions` laut Capawesome-Anleitung.
- `AppDelegate`: `FirebaseApp.configure()` **nur**, wenn `GoogleService-Info.plist` im Bundle liegt (sonst läuft der Simulator-Bau ohne Secret weiter); APNs-Token und Registrierungsfehler an das Plugin weiterreichen wie im Plugin-README; Kategorie `reise` registrieren.
- `App.entitlements`: `aps-environment` = `production`. `Info.plist`: `FirebaseMessagingAutoInitEnabled` = `NO`.
- Workflow: Schritt vor „Archiv“ (und vor dem Simulator-Bau) schreibt `GoogleService-Info.plist` aus dem Secret `GOOGLE_SERVICE_INFO_PLIST` (Base64) nach `frontend/ios/App/App/`, wenn das Secret gesetzt ist; der Simulator-Job läuft auch ohne. `GoogleService-Info.plist` in `.gitignore`.

- [x] **Step 1: Install and sync** – `cd frontend && npm install @capacitor-firebase/messaging firebase && npm run build:app && npx cap sync ios` → `Package.swift` enthält das Plugin
- [x] **Step 2: Apply the iOS and workflow changes above**
- [x] **Step 3: Verify web side unchanged** – `npm test && npm run lint && npm run build` → grün
- [x] **Step 4: Commit** – `feat(app): Firebase Messaging einrichten (ohne Analytics, Auto-Init aus)`
- [ ] **Step 5: Cloud-Bau prüfen** – erst nach Julians Freigabe pushen; Simulator-Job muss grün sein (Status über `api.github.com/repos/jbee827-sys/Umstieg./actions/runs`).

---

### Task 8: Anmelden, Abmelden, lokale Mitteilungen als Rückfall

**Files:**
- Create: `frontend/src/api/mitteilungen.ts`, `frontend/src/plattform/reiseanmeldung.ts`, `frontend/src/plattform/push.ts`
- Modify: `frontend/src/plattform/mitteilungen.ts`, `frontend/src/App.tsx` (Effekte bei `bereiteMitteilungenVor`/`planeErinnerung` ~Z. 370–395, Reiseende bei `vergissErinnerung` ~Z. 996), Einstellungen in `frontend/src/components/Eingabe.tsx` (neben der Teilen-Diagnose ~Z. 1239)
- Test: `frontend/src/api/mitteilungen.test.ts`, `frontend/src/plattform/reiseanmeldung.test.ts`, `frontend/src/plattform/push.test.ts`, `frontend/src/plattform/mitteilungen.test.ts` (ergänzen)

**Interfaces:**
- Consumes: Routen aus Task 6 (Body-Form = `ReiseAnmeldung` aus Task 3, als TS-Typ im Frontend gespiegelt in `api/mitteilungen.ts`), Plugin aus Task 7.
- Produces:

```ts
// api/mitteilungen.ts
export type Anmeldeergebnis = 'ok' | 'abgelehnt';   // 'abgelehnt' = 4xx/5xx/Netz
export function meldeReiseAn(token: string, plattform: 'ios', reise: ReiseAnmeldung): Promise<Anmeldeergebnis>;
export function meldeReiseAb(token: string): Promise<void>;
export function schickeTestmitteilung(token: string): Promise<boolean>;
// plattform/reiseanmeldung.ts
export function reiseFuerWache(werte: EingabeWerte, route: RouteErgebnis, jetzt: Date): ReiseAnmeldung | null;
// plattform/push.ts
export function pushAktiv(): boolean;                         // true nach 'ok', false nach Abmelden/Ablehnung
export function meldeAnWennNoetig(reise: ReiseAnmeldung | null): void; // gedrosselt 10 s, gleiche Reise = kein Aufruf
export function meldeAbUndVergiss(): Promise<void>;
export function testmitteilung(): Promise<boolean>;
```

Regeln: `reiseFuerWache` → `null` ohne Anschlusszug, bei `zugAbAusText`/`zugAnAusText` (der betroffene Zug fehlt dann; ohne Anschluss → `null`), ohne Gehzeit. Zeiten als ISO über dieselbe Tagesregel wie `heuteUm`/`abfahrtUm`. Haltestellenpfad aus `werte.haltestellen`. `push.ts`: nur `istApp()` und nicht `vorfuehrungLaeuft()`; Erlaubnis über das Plugin erst bei laufender Reise; Token-Wechsel → neu anmelden; `visibilitychange` → sichtbar → neu anmelden (gleiche Reise, Drossel umgehen). `mitteilungen.ts`: `teileMit` und `planeErinnerung` tun nichts, solange `pushAktiv()`; wird Push aktiv, `vergissErinnerung()`. Einstellungen: vorübergehender Knopf „Testmitteilung senden“ (nur `istApp()`), mit Kommentar „vor der Einreichung entfernen“ wie die Teilen-Diagnose.

- [ ] **Step 1: Write the failing tests**

```ts
it('baut die Anmeldung fuer den Bahnhofspfad mit Tafelnamen, Linie, ISO-Zeiten und Gehzeit', ...)
it('meldet einen Zug aus dem Reisetext erst an, wenn er gefunden ist', ...)   // zugAbAusText → null
it('schickt PUT mit JSON und wertet 204 als ok, 503 als abgelehnt', ...)
it('meldet dieselbe Reise innerhalb von 10 s nur einmal an', ...)
it('meldet beim Zurueckkommen in den Vordergrund erneut an', ...)
it('schaltet lokale Mitteilungen und die lokale Erinnerung ab, solange Push aktiv ist', ...)
it('bleibt bei lokalen Mitteilungen, wenn die Anmeldung abgelehnt wird', ...)       // Review Focus 5
it('tut im Browser und in der Einfuehrungstour nichts', ...)
it('meldet bei Reiseende ab', ...)
```

- [ ] **Step 2: Run them** – `cd frontend && npx vitest run src/api/mitteilungen.test.ts src/plattform` → FAIL
- [ ] **Step 3: Implement** die drei Dateien und die Änderungen in `mitteilungen.ts`, `App.tsx`, `Eingabe.tsx`.
- [ ] **Step 4: Run the whole frontend suite, lint, build** – `npm test && npm run lint && npm run build` → grün
- [ ] **Step 5: Commit** – `feat(app): Reise beim Server an- und abmelden, lokale Mitteilungen als Rueckfall`

---

### Task 9: Nachtragen und Antippen (Entscheidung A)

**Files:**
- Modify: `frontend/src/App.tsx` (Behandlung der Live-Ereignisse ~Z. 742–952), `frontend/src/plattform/push.ts`
- Test: `frontend/src/plattform/push.test.ts` (ergänzen), `frontend/src/App.nachtragen.test.tsx`

**Interfaces:**
- Consumes: `daten` aus Task 2 (`art, zug, anzeige, seite, alt, neu, gleisNeu, aktion, aktionGleis`), Plugin aus Task 7.
- Produces:

```ts
// plattform/push.ts
export interface ZugestellteMeldung { ereignis: LiveEreignis; art: string; aktion?: 'weg' | 'oeffnen' }
export function ereignisAusDaten(daten: Record<string, string>): LiveEreignis | null; // rot/erinnerung → null (kein Ereignis)
export function hoereAufAntippen(f: (m: ZugestellteMeldung) => void): () => void;
export function holeZugestellte(): Promise<ZugestellteMeldung[]>;           // liest und räumt das Mitteilungszentrum
// App.tsx
// Die bisherige onEreignis-Logik beider Pfade wird eine Funktion
// `verarbeiteEreignis(roh: LiveEreignis)` im Live-Effekt, über `ereignisRef` auch außerhalb erreichbar.
```

Regeln: `verspaetung`/`gleiswechsel`/`ausfall` aus `daten.art` (`zeit-*`, `gleis-*`, `ausfall-*`), `seite` aus `daten.seite`, `zeitstempel` = jetzt. Doppelte verwerfen über `zug + typ + neu` gegen die vorhandenen Meldungen (der Live-Strom kann dieselbe schon geliefert haben). Antippen: Gleiswechsel → Bildschirm `meldungen`, sonst `dashboard`; Aktion `weg` → den Vorschlag der eingetragenen Meldung übernehmen und `navigation` öffnen. Beim Öffnen und bei `visibilitychange` → sichtbar: `holeZugestellte()` nachtragen. Fehlt `getDeliveredNotifications` im Plugin (Task 7, Step 1), entfällt nur dieser Teil; im Commit vermerken.

- [ ] **Step 1: Write the failing tests**

```ts
it('macht aus den Daten einer Gleis-Mitteilung ein Gleiswechsel-Ereignis der richtigen Seite', ...)
it('traegt eine angetippte Gleis-Mitteilung als Meldung mit Wegvorschlag ein und oeffnet die Meldungen', ...)
it('traegt zugestellte Mitteilungen beim Oeffnen nach', ...)
it('traegt eine Meldung nicht doppelt ein, die der Live-Strom schon brachte', ...)
it('oeffnet bei der Aktion weg den Weg zum neuen Gleis', ...)
```

- [ ] **Step 2: Run them** → FAIL
- [ ] **Step 3: Implement** – erst die Live-Behandlung in `verarbeiteEreignis` herausziehen (bestehende App-Tests müssen unverändert grün bleiben), dann das Nachtragen.
- [ ] **Step 4: Run the whole frontend suite, lint, build** → grün
- [ ] **Step 5: Commit** – `feat(app): Server-Mitteilungen als Meldungen nachtragen, Antippen oeffnet die Reise`

---

### Task 10: Aufgeklappte Ansicht (Notification Content Extension)

**Files:**
- Create: `frontend/ios/App/Mitteilung/MitteilungViewController.swift`, `frontend/ios/App/Mitteilung/Info.plist`, `frontend/ios/App/Mitteilung/Archivo.ttf`, `frontend/ios/App/Mitteilung/OFL.txt`
- Modify: `frontend/ios/App/App.xcodeproj/project.pbxproj` (neues Ziel `Mitteilung`, eingebettet in `App` – nach dem Muster des Ziels `Teilen`, Commit `74464aa`), `.github/workflows/ios.yml` (Prüfung wie bei `Teilen.appex`)

**Interfaces:**
- Consumes: `daten` aus Task 2; Kategorie `reise` und Aktionen `weg`/`oeffnen` aus Task 7.
- Produces: `Mitteilung.appex` (Bundle-ID `online.umstieg.app.mitteilung`), `NSExtensionPointIdentifier` = `com.apple.usernotifications.content-extension`, `UNNotificationExtensionCategory` = `reise`, `UNNotificationExtensionDefaultContentHidden` = `YES`, `NSExtensionPrincipalClass` = `$(PRODUCT_MODULE_NAME).MitteilungViewController`, `UIAppFonts` = `Archivo.ttf`.

Gestaltung (Spec 4a, Entwurf `11-mitteilungen-entwuerfe.html`, Farben aus `design/DESIGN.md`, hell/dunkel nach System):
- Meldung (Titel) Archivo 26 pt / 700, darunter Text 18 pt / 400.
- Gleiswechsel (`gleisAlt`/`gleisNeu`): altes Gleis 32 pt / 700 durchgestrichen in Nebengrau, „→“, neues Gleis 56 pt / 800.
- Zwei Werte mit senkrechter Trennlinie: „`restMin` Min.“ / „bis zur Abfahrt“ | „`gehMin` Min.“ / „Weg“ (24 pt / 700 und 15 pt / 500). Bei `faellt-aus` keine Werte.
- Statuszeile: Punkt + „Erreichbar“ (Bahngrün `#0f7a4f` / nachts `#3cc98a`), „Knapp“ (Punkt halb Signalrot, halb Warngelb `#ffd400`, dazu 6 pt rot-gelber 45°-Streifen oben an der Ansicht), „Fällt aus“ (roter Ring); rechts „Stand `stand`“ in Nebengrau.
- Aktionen dynamisch über `extensionContext?.notificationActions`: `weg` → „Weg zu Gleis `aktionGleis`“ bzw. bei `aktion = verbindung` „Andere Verbindung wählen“; `oeffnen` → „Reise öffnen“.
- `Archivo.ttf` aus `frontend/src/assets/fonts/archivo-latin.woff2` umwandeln (fonttools mit brotli in einer venv unter `.superpowers/`, nicht im Repo); `OFL.txt` mitliefern.

- [ ] **Step 1: Add the target and files above**
- [ ] **Step 2: Extend the workflow check** – `test -f "$APP/PlugIns/Mitteilung.appex/Info.plist"` und `plutil -extract NSExtension.NSExtensionPointIdentifier raw … | grep -qx com.apple.usernotifications.content-extension`
- [ ] **Step 3: Commit** – `feat(app): aufgeklappte Mitteilung mit Live-Stand (Content Extension)`
- [ ] **Step 4: Cloud-Bau** – nach Julians Freigabe pushen; Simulator-Job grün inkl. Prüfung `Mitteilung.appex`. Julian legt vorher die App-ID `online.umstieg.app.mitteilung` an, falls die Cloud-Signatur sie nicht selbst anlegt (wie bei `Teilen`).

---

### Task 11: Datenschutz, Hinweise, Anleitung

**Files:**
- Modify: `frontend/src/components/Datenschutz.tsx` (+ Test), `frontend/ios/App/App/PrivacyInfo.xcprivacy`, `NOTICE`, `docs/app-store-eintrag.md` (App-Datenschutz), `docs/app-ios.md` (neuer Abschnitt „Mitteilungen (Firebase)“), `README.md`

Inhalt (Spec 7 und 8):
- Datenschutz, Abschnitt „App“ → „Mitteilungen“: FCM-Token und Text jeder Mitteilung an Google (Auftragsverarbeiter, USA, Data Privacy Framework), Installations-ID des Firebase-SDK, kein Analytics/Crashlytics; beim eigenen Server nur im Arbeitsspeicher bis kurz nach Abfahrt, höchstens 8 h; Rechtsgrundlage Art. 6 Abs. 1 lit. b DSGVO; ohne Erlaubnis kein Token.
- `PrivacyInfo.xcprivacy`: prüfen, ob die Firebase-Manifeste die App-Angaben ergänzen müssen; „Device ID – App Functionality, nicht verknüpft, kein Tracking“.
- `NOTICE`: Firebase iOS SDK und `@capacitor-firebase/messaging` (Apache 2.0), Archivo in der Erweiterung (OFL).
- `docs/app-ios.md`: Julians Einrichtung 1–6 aus Spec 8 als Schrittfolge, dazu Secret `GOOGLE_SERVICE_INFO_PLIST` (Base64) und Fly-Secret `FIREBASE_SERVICE_ACCOUNT`; Testmitteilung und ihr Entfernen vor der Einreichung.
- `README.md`: Stand und nächste Schritte.

- [ ] **Step 1: Write the failing test** – `Datenschutz.test.tsx`: Abschnitt „Mitteilungen“ nennt „Firebase“, „Google“, „8 Stunden“.
- [ ] **Step 2: Run it** → FAIL
- [ ] **Step 3: Update all files above**
- [ ] **Step 4: Run frontend suite, lint, build** → grün
- [ ] **Step 5: Commit** – `docs: Mitteilungen ueber Firebase - Datenschutz, Hinweise, Einrichtung`

---

### Task 12: Auslieferung und Test am iPhone (mit Julian)

Nur auf Julians ausdrückliche Anweisung; Reihenfolge wie bisher: Backend vor App.

- [ ] Julian: Einrichtung nach `docs/app-ios.md` (Firebase-Projekt, APNs-Schlüssel, Push an der App-ID, Dienstkonto als Fly-Secret, Plist als GitHub-Secret).
- [ ] Backend: `flyctl deploy backend --ha=false`; prüfen: eine Maschine, `/api/health`, `PUT /api/mitteilungen/reise` mit Testkörper → 204, Protokoll ohne Token.
- [ ] `main` per Fast-Forward nachziehen; Julian startet den iOS-Bau; Lauf über die öffentliche API verfolgen.
- [ ] Julian am iPhone: „Testmitteilung senden“ → Banner bei gesperrtem Handy; lange drücken → aufgeklappte Ansicht; Antippen → Meldung in der App.
- [ ] Echte Fahrt mit gesperrtem Handy; Befunde in der README.
