# „Etwas melden“ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Textknopf „Etwas melden“ unter „Einstellungen“ öffnet einen Dialog mit Freitext und optionaler E-Mail-Adresse; das Backend schickt die Meldung per SMTP über web.de an `mail.umstieg@web.de`.

**Architecture:** Backend: reine Prüf- und Mailaufbau-Logik (`core/meldung.ts`), ein austauschbarer Versand (`clients/mailversand.ts`, nodemailer) und die Route `POST /api/meldung`, eingehängt wie `/api/zaehle`. Frontend: dieselben Regeln (`meldung/regeln.ts`), ein Aufruf (`api/meldung.ts`), der Dialog (`components/Meldung.tsx`) im Muster von `ReiseImport.tsx`, der Einstieg in `Eingabe.tsx` (nur im Browser, nicht in der App) und der Datenschutzabschnitt.

**Tech Stack:** Fastify 5, TypeScript, vitest, nodemailer (neu); React, vitest + Testing Library, CSS-Token in `index.css`.

**Spec:** `docs/superpowers/specs/2026-11-10-etwas-melden-design.md` (freigegeben 10.11.2026)

## Global Constraints

- Arbeitszweig: `feat/textnavigation` (aktueller Stand). Commits mit Autor Julian Beerbaum, **ohne** Claude-Kennzeichnung (kein `Co-Authored-By`, kein `Claude-Session`).
- **Nie pushen oder deployen** ohne Julians ausdrücklichen Satz. Task 7 endet vor der Auslieferung.
- Frontend- und Backend-Suite **nicht gleichzeitig** laufen lassen (sonst falsche Timeouts).
- Nachricht: Mindestens **5 Zeichen ohne Leerraum** (Leerraum zählt nirgends, auch nicht in der Mitte); höchstens **2000 Zeichen** gezählt wie im Feld (`text.length`). Frontend **und** Backend prüfen gleich.
- E-Mail-Adresse optional; nie in Logs. Nachrichtentext nie in Logs, nicht gespeichert, nicht zwischengespeichert.
- SMTP: `smtp.web.de`, Port `587`, STARTTLS. Werte nur aus Umgebungsvariablen `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MELDUNG_AN` (auf Fly gestagt; lokal `E:\jbeer\.secrets\smtp-webde.env`, nur lesen, Werte nie ausgeben).
- In der iOS-App bleibt der Einstieg verborgen (`istApp()`); iOS-Datenschutzabschnitte und `PrivacyInfo.xcprivacy` unverändert.
- „Senden“ ist `.knopf-primaer` **ohne** `.knopf-textur`.
- Neue Farben nur als Token in `index.css`, in `:root` **und beiden** dunklen Blöcken identisch (`einstellungen/darstellung-css.test.ts` vergleicht sie).
- Texte wörtlich wie im Abschnitt „Aussehen und Texte“ der Spec, ergänzt um Julians Korrektur: leer → „Schreib ein paar Worte.“

## Review Focus

1. Nachricht nur aus Leerzeichen/Zeilenumbrüchen (z. B. 20 Leerzeichen) → gilt als leer, „Senden“ gesperrt, Backend antwortet 400 `zu-kurz`.
2. E-Mail mit Zeilenumbruch oder Komma (`a@b.de\nBcc: x@y.de`) → 400 `adresse`, keine Mail; Kopfzeilen-Einschleusung unmöglich.
3. SMTP nicht erreichbar oder Anmeldung abgelehnt → 502, Log-Eintrag ohne Text und Adresse; im Dialog Fehlertext, Text und Adresse bleiben stehen.
4. Doppelt tippen auf „Senden“ → genau ein Aufruf (Knopf während des Sendens gesperrt).
5. Backend ohne SMTP-Werte (lokal, Vorschau) → 503 `nicht-eingerichtet`, kein Absturz beim Start.

Jede Zeile hat ihren Test in der zuständigen Task (markiert mit „Review Focus n“).

---

### Task 1: Backend – Regeln und Mailaufbau

**Files:**
- Create: `backend/src/core/meldung.ts`
- Test: `backend/test/meldung.test.ts`

**Interfaces:**
- Produces:
  - `MIN_ZEICHEN = 5`, `MAX_ZEICHEN = 2000`
  - `type MeldungFehler = 'form' | 'zu-kurz' | 'zu-lang' | 'adresse'`
  - `interface Meldung { text: string; email?: string }`
  - `pruefeMeldung(body: unknown): { ok: true; meldung: Meldung } | { ok: false; fehler: MeldungFehler }`
  - `interface MailInhalt { betreff: string; text: string; antwortAn?: string }`
  - `baueMail(meldung: Meldung, jetzt: Date): MailInhalt`

- [ ] **Step 1: Write the failing tests** in `backend/test/meldung.test.ts`

```ts
describe('pruefeMeldung', () => {
  it('nimmt 5 Zeichen ohne Leerraum an', () => expect(pruefeMeldung({ text: 'a b c d e' }).ok).toBe(true))
  it('zaehlt Leerraum nirgends mit', () => expect(pruefeMeldung({ text: ' a b c d ' })).toEqual({ ok: false, fehler: 'zu-kurz' }))
  it('weist reinen Leerraum ab (Review Focus 1)', () => expect(pruefeMeldung({ text: ' '.repeat(20) + '\n\n' })).toEqual({ ok: false, fehler: 'zu-kurz' }))
  it('erlaubt genau 2000 Zeichen', () => expect(pruefeMeldung({ text: 'x'.repeat(2000) }).ok).toBe(true))
  it('weist 2001 Zeichen ab', () => expect(pruefeMeldung({ text: 'x'.repeat(2001) })).toEqual({ ok: false, fehler: 'zu-lang' }))
  it.each([null, 'text', { text: 5 }, { text: 'hallo welt', email: 7 }])('weist falsche Form ab: %j', (b) =>
    expect(pruefeMeldung(b)).toEqual({ ok: false, fehler: 'form' }))
  it('behandelt leere Adresse wie keine', () => expect(pruefeMeldung({ text: 'hallo welt', email: '  ' })).toEqual({ ok: true, meldung: { text: 'hallo welt' } }))
  it('schneidet Leerraum um die Adresse ab', () => expect(pruefeMeldung({ text: 'hallo welt', email: ' anna@beispiel.de ' })).toEqual({ ok: true, meldung: { text: 'hallo welt', email: 'anna@beispiel.de' } }))
  it.each(['anna', 'anna@', 'anna@beispiel', 'a b@beispiel.de', 'a@b.de\nBcc: x@y.de', 'a@b.de,c@d.de'])(
    'weist unbrauchbare Adresse ab: %j (Review Focus 2)', (email) =>
      expect(pruefeMeldung({ text: 'hallo welt', email })).toEqual({ ok: false, fehler: 'adresse' }))
})

describe('baueMail', () => {
  const jetzt = new Date('2026-11-10T20:58:00Z') // 21:58 in Berlin
  it('setzt Betreff mit Berliner Zeit', () =>
    expect(baueMail({ text: 'Gleis 6 fehlt.' }, jetzt).betreff).toBe('Meldung aus Umstieg. – 10.11.2026, 21:58'))
  it('ohne Adresse: kein Reply-To, Hinweis am Ende', () =>
    expect(baueMail({ text: 'Gleis 6 fehlt.' }, jetzt)).toEqual({
      betreff: 'Meldung aus Umstieg. – 10.11.2026, 21:58',
      text: 'Gleis 6 fehlt.\n\n—\nKeine Antwortadresse angegeben.',
    }))
  it('mit Adresse: Reply-To und Angabe am Ende', () =>
    expect(baueMail({ text: 'Gleis 6 fehlt.', email: 'anna@beispiel.de' }, jetzt)).toEqual({
      betreff: 'Meldung aus Umstieg. – 10.11.2026, 21:58',
      text: 'Gleis 6 fehlt.\n\n—\nAntwort an: anna@beispiel.de',
      antwortAn: 'anna@beispiel.de',
    }))
})
```

- [ ] **Step 2: Run** `cd backend && npx vitest run test/meldung.test.ts` — Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implement `backend/src/core/meldung.ts`.** Leerraum-Zählung: `text.replace(/\s/g, '').length`. Adressprüfung: getrimmt, `^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$`, höchstens 254 Zeichen. Text wird unverändert übernommen (nicht getrimmt). Zeit: `Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })`, Ergebnis auf die Form `TT.MM.JJJJ, HH:MM` bringen. Kopfkommentar: warum nichts gespeichert/protokolliert wird (Spec, Anti-Ziele).

- [ ] **Step 4: Run** dieselbe Datei — Expected: PASS.

- [ ] **Step 5: Commit** `feat(backend): Regeln und Mailaufbau fuer „Etwas melden"`

---

### Task 2: Backend – Versand, Route, Ratenbegrenzung

**Files:**
- Create: `backend/src/clients/mailversand.ts`
- Create: `backend/src/routes/meldung.ts`
- Modify: `backend/src/app.ts` (`AppClients`, `GRENZEN`, CORS-Kommentar bei `methods: ['GET', 'POST']`, Registrierung neben `registriereZaehlerRoute`)
- Modify: `backend/package.json` (`nodemailer`, `@types/nodemailer`)
- Test: `backend/test/meldung-route.test.ts`, `backend/test/datenschutz.test.ts` (ein neuer Fall)

**Interfaces:**
- Consumes: `pruefeMeldung`, `baueMail`, `MailInhalt` (Task 1)
- Produces:
  - `type Mailversand = (inhalt: MailInhalt) => Promise<void>`
  - `erzeugeMailversand(env: NodeJS.ProcessEnv): Mailversand | null` — `null`, wenn eine der fünf Variablen fehlt oder leer ist
  - `registriereMeldungRoute(app: FastifyInstance, versand: Mailversand | null): void`
  - `AppClients.mailversand?: Mailversand | null` — fehlt das Feld, gilt `erzeugeMailversand(process.env)`
  - HTTP: `POST /api/meldung`, JSON `{ text: string, email?: string }` →
    `204` gesendet · `400 { fehler: MeldungFehler }` · `503 { fehler: 'nicht-eingerichtet' }` · `502 { fehler: 'versand' }` · `429` (Ratenbegrenzung, vorhandene Form)

- [ ] **Step 1: Write the failing tests** in `backend/test/meldung-route.test.ts` (App über `buildApp({ mailversand }, { logger: … })`, Muster aus `test/zaehler.test.ts`):
  - `'schickt eine gueltige Meldung und antwortet 204'` — Fake-Versand sammelt Aufrufe; `expect(gesendet).toHaveLength(1)`, `gesendet[0].antwortAn` = übergebene Adresse, `gesendet[0].text` beginnt mit dem Text.
  - `'weist zu kurzen Text mit 400 zu-kurz ab und schickt nichts'`
  - `'weist eine Adresse mit Zeilenumbruch mit 400 adresse ab (Review Focus 2)'`
  - `'antwortet 503, wenn kein Versand eingerichtet ist (Review Focus 5)'` — `buildApp({ mailversand: null })`
  - `'antwortet 502, wenn der Versand scheitert (Review Focus 3)'` — Fake wirft `Object.assign(new Error('x'), { code: 'EAUTH' })`
  - `'begrenzt auf 2 Meldungen je Minute und Aufrufer'` — dritter Aufruf `429`
  - `'erzeugeMailversand liefert null ohne vollstaendige SMTP-Werte'` — je eine der fünf Variablen weggelassen
  
  In `backend/test/datenschutz.test.ts` neu: `'schreibt weder Text noch Adresse einer Meldung ins Protokoll'` — scheiternder Fake-Versand, Text `'MARKE-7f3a Gleis fehlt'`, Adresse `'marke@beispiel.de'`; über `sammelLogger` gesammelte Rohzeilen enthalten weder `MARKE-7f3a` noch `marke@beispiel.de`, aber einen Eintrag mit `ereignis: 'meldung-versand'`.

- [ ] **Step 2: Run** `cd backend && npx vitest run test/meldung-route.test.ts test/datenschutz.test.ts` — Expected: FAIL.

- [ ] **Step 3: Install** `cd backend && npm install nodemailer && npm install -D @types/nodemailer`.

- [ ] **Step 4: Implement.**
  - `mailversand.ts`: `nodemailer.createTransport({ host, port, secure: false, requireTLS: true, auth: { user, pass }, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 })`; `from` und `to` = `SMTP_USER` bzw. `MELDUNG_AN`; `replyTo` nur bei `antwortAn`; reiner Text, kein HTML.
  - `routes/meldung.ts`: `bodyLimit: 16_384`; Ablauf prüfen → (503 bei `versand === null`) → `baueMail(meldung, new Date())` → senden. Im `catch` nur `app.log.warn({ ereignis: 'meldung-versand', code: (fehler as { code?: string }).code }, 'Meldung konnte nicht verschickt werden')` — **kein** Fehlerobjekt, keine Nachricht des Fehlers (kann die Adresse enthalten).
  - `app.ts`: `GRENZEN['/api/meldung'] = 2` mit Kommentar (Spam-Schutz für Julians Postfach; gemeinsame Obergrenze laut Spec für später); CORS-Kommentar auf „POST für `/api/zaehle` und `/api/meldung`“ ändern; Route im selben `app.register`-Block wie die Zählerroute anmelden.

- [ ] **Step 5: Run** die beiden Testdateien, dann `cd backend && npm test` und `npm run lint` — Expected: alles PASS, Lint ohne Fehler.

- [ ] **Step 6: Commit** `feat(backend): POST /api/meldung verschickt Meldungen per web.de`

---

### Task 3: Frontend – Regeln und Aufruf

**Files:**
- Create: `frontend/src/meldung/regeln.ts`, `frontend/src/api/meldung.ts`
- Test: `frontend/src/meldung/regeln.test.ts`, `frontend/src/api/meldung.test.ts`

**Interfaces:**
- Produces:
  - `MIN_ZEICHEN = 5`, `MAX_ZEICHEN = 2000`
  - `nachrichtStatus(text: string): 'leer' | 'zu-kurz' | 'ok'` (Leerraum zählt nicht)
  - `adresseStatus(adresse: string): 'leer' | 'ungueltig' | 'ok'` (dieselbe Regel wie `pruefeMeldung` in Task 1)
  - `sendeMeldung(text: string, email: string): Promise<boolean>` — `true` nur bei Status 204; Netzfehler → `false`; leere/nur-Leerraum-Adresse wird nicht mitgeschickt

- [ ] **Step 1: Write the failing tests.**
  - `regeln.test.ts`: `nachrichtStatus('')` → `'leer'`; `('   \n ')` → `'leer'`; `('a b c d')` → `'zu-kurz'`; `('abcde')` → `'ok'`; `adresseStatus('')` → `'leer'`; `('anna@beispiel')` → `'ungueltig'`; `(' anna@beispiel.de ')` → `'ok'`.
  - `meldung.test.ts` (`global.fetch` per `vi.fn`): sendet `POST` an `apiUrl('/api/meldung')` mit `content-type: application/json` und Body `{ text: 'Gleis 6 fehlt.', email: 'anna@beispiel.de' }`; ohne Adresse Body ohne `email`; `204` → `true`; `502` → `false`; `fetch` wirft → `false`.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/meldung src/api/meldung.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement** beide Dateien. `sendeMeldung` nutzt `fetch(apiUrl(…))` direkt, nicht `holeApi` (das kennt nur GET und den Vorführ-Vorschalter).

- [ ] **Step 4: Run** dieselben Tests — Expected: PASS.

- [ ] **Step 5: Commit** `feat(frontend): Regeln und Aufruf fuer „Etwas melden"`

---

### Task 4: Frontend – Dialog „Etwas melden“

**Files:**
- Create: `frontend/src/components/Meldung.tsx`
- Modify: `frontend/src/App.css` (neuer Block nach den `.dialog`-Regeln), `frontend/src/index.css` (Token)
- Test: `frontend/src/components/Meldung.test.tsx`, `frontend/src/meldung/meldung-css.test.ts`

**Interfaces:**
- Consumes: `nachrichtStatus`, `adresseStatus`, `MAX_ZEICHEN`, `sendeMeldung` (Task 3)
- Produces: `Meldung({ onSchliessen }: { onSchliessen: () => void })`

Aufbau im Muster von `ReiseImport.tsx`: `.dialog-grund` (Klick schließt) → `.dialog` mit `role="dialog"`, `aria-modal`, `aria-labelledby="meldung-titel"`; Escape schließt. Felder:

| Element | Wert |
|---|---|
| Titel `h2#meldung-titel` | „Etwas melden“ |
| `textarea#meldung-text`, Klasse `feldhuelle` | Label „Deine Nachricht“, Platzhalter „z. B. In Fulda führt der Weg von Gleis 4 zu Gleis 6 über eine Treppe, die gesperrt ist.“, `maxLength={MAX_ZEICHEN}`, `rows={5}` |
| Zähler `.feld-zaehler` | `` `${text.length} / 2000` `` |
| Statuszeile (per `aria-describedby` am Feld) | leer: `.feld-hinweis` „Schreib ein paar Worte.“ · zu kurz: `.feld-fehler` „Dein Text ist zu kurz.“ + Feld mit `aria-invalid` |
| `input#meldung-email` `type="email"` `autoComplete="email"`, Klasse `feldhuelle` | Label „E-Mail-Adresse“ + `<span>(optional)</span>`, Platzhalter „name@beispiel.de“, Hilfe `.feld-hilfe` „Gib deine E-Mail-Adresse an, um eine Antwort zu erhalten.“; nach Verlassen des Felds und nur bei `'ungueltig'`: `.feld-fehler` „Diese E-Mail-Adresse sieht unvollständig aus.“ |
| Knöpfe (Knopfzeile wie in `ReiseImport.tsx`) | `.knopf-sekundaer` „Abbrechen“ · `.knopf-primaer` „Senden“, gesperrt solange Nachricht ≠ `'ok'`, Adresse = `'ungueltig'` oder gesendet wird; beim Senden Beschriftung „Wird gesendet …“ |
| `.meldung-klein` | „Deine Nachricht geht per E-Mail an Umstieg. Mehr dazu im “ + Link „Datenschutz“ (`href={RECHTSPFAD.datenschutz}`, Klick wie `inDerApp('datenschutz')` in `Fusszeile.tsx`: `oeffneRechtsseite` aus `navigation/rechtsseiten`, vorher `onSchliessen()`) + „.“ |
| Fehlschlag | `.fehler-box` „Das hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.“ — Text und Adresse bleiben |
| Danke (ersetzt den Inhalt) | `.meldung-haken` (grüner Haken, SVG `aria-hidden`), `h2` „Danke!“, „Deine Meldung ist angekommen.“, `.knopf-primaer` „Schließen“ |

CSS (Spec „Feldaufbau“, ohne Halo): `.feldhuelle { background: var(--feldhuelle-grund); border: 1px solid var(--feldhuelle-rand); border-radius: 14px; box-shadow: var(--feldhuelle-glanz); }`; Fokus: Rand `var(--color-accent)` + `0 0 0 3px color-mix(in srgb, var(--color-accent) 22%, transparent)`; `[aria-invalid='true']`: Rand `var(--color-accent)`. `.feld-hinweis`/`.feld-hilfe`/`.feld-zaehler` in `var(--color-neutral-700)` (gedämpfte Schrift, hat eine Nachtfassung), Schriftgröße `var(--schrift-label)` (15 px, Untergrenze); `.feld-fehler` in `var(--color-accent-700)`, Gewicht 600. Haken in `var(--color-gruen)`.
Token in `index.css` — hell: `--feldhuelle-grund: color-mix(in srgb, #eae9e9 70%, #ffffff); --feldhuelle-rand: color-mix(in srgb, #201e1d 12%, transparent); --feldhuelle-glanz: inset 0 1px 0 rgb(255 255 255 / 0.9);` · beide dunklen Blöcke: `--feldhuelle-grund: color-mix(in srgb, #222120 80%, #171615); --feldhuelle-rand: color-mix(in srgb, #f3f2f2 14%, transparent); --feldhuelle-glanz: inset 0 1px 0 rgb(255 255 255 / 0.05);`

- [ ] **Step 1: Write the failing tests** in `Meldung.test.tsx` (`vi.mock('../api/meldung')`):
  - `'sperrt Senden bei leerem Text und sagt „Schreib ein paar Worte."'`
  - `'zaehlt Leerzeichen nicht: „a b c d" bleibt zu kurz'` — Text „Dein Text ist zu kurz.“ sichtbar, Senden gesperrt
  - `'gibt Senden ab 5 Zeichen frei und zeigt den Zaehler'` — `5 / 2000`
  - `'zeigt die Adresswarnung erst nach Verlassen des Felds und sperrt Senden'`
  - `'sendet genau einmal, auch bei Doppelklick (Review Focus 4)'` — `sendeMeldung` als hängendes Promise; zwei Klicks → ein Aufruf
  - `'zeigt nach Erfolg „Danke!" und „Deine Meldung ist angekommen."'` und keinen Satz mit „Antwort“
  - `'behaelt Text und Adresse nach einem Fehlschlag (Review Focus 3)'` — Fehlertext sichtbar, Feldwerte unverändert
  - `'schliesst mit Escape und mit Abbrechen'`
  
  In `meldung-css.test.ts` (Hilfen aus `testhilfen/css`): `.feldhuelle` setzt `border-radius: 14px` und nutzt die drei Token; `--feldhuelle-grund: color-mix(in srgb, #222120 80%, #171615)` kommt in `index.css` genau zweimal vor.

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/Meldung.test.tsx src/meldung` — Expected: FAIL.

- [ ] **Step 3: Implement** Komponente, CSS, Token.

- [ ] **Step 4: Run** dieselben Tests plus `src/einstellungen` — Expected: PASS (dunkle Blöcke weiter gleich).

- [ ] **Step 5: Commit** `feat(frontend): Dialog „Etwas melden"`

---

### Task 5: Frontend – Einstieg unter „Einstellungen“

**Files:**
- Modify: `frontend/src/components/Eingabe.tsx` (direkt nach `</details>` von `.einstellungen`; Dialog neben dem `ReiseImport`-Dialog rendern), `frontend/src/App.css`
- Test: `frontend/src/components/Eingabe.test.tsx`

**Interfaces:**
- Consumes: `Meldung` (Task 4), `istApp()` aus `plattform/istApp`

Einstieg: `<div className="meldung-einstieg"><button type="button" className="textknopf">Etwas melden</button></div>`, nur wenn `!istApp()`. `.meldung-einstieg { display: flex; justify-content: flex-start; }` — **linksbündig** (Julian: „links unter Einstellungen“); nicht `.feld-rand`, das rechtsbündig ist.

- [ ] **Step 1: Write the failing tests** in `Eingabe.test.tsx`:
  - `'zeigt „Etwas melden" direkt nach den Einstellungen'` — Knopf existiert, und in der DOM-Reihenfolge folgt er dem `summary` „Einstellungen“ (`compareDocumentPosition`)
  - `'oeffnet den Meldedialog'` — Klick → `getByRole('dialog', { name: 'Etwas melden' })`
  - `'zeigt den Knopf in der App nicht'` — `vi.mock('../plattform/istApp', …)` mit `istApp: () => true` in einem eigenen `describe` bzw. eigener Datei `Eingabe.app-meldung.test.tsx`

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/Eingabe` — Expected: FAIL.

- [ ] **Step 3: Implement** Zustand `meldungOffen`, Knopf, Dialog.

- [ ] **Step 4: Run** dieselben Tests — Expected: PASS.

- [ ] **Step 5: Commit** `feat(frontend): „Etwas melden" unter den Einstellungen`

---

### Task 6: Datenschutzseite

**Files:**
- Modify: `frontend/src/components/Datenschutz.tsx` (Kopfkommentar, Kurzfassung, neuer Abschnitt nach „Server-Protokolle“, Fly-Eintrag, „Deine Rechte“)
- Test: `frontend/src/components/Datenschutz.test.tsx`

Texte **wörtlich** aus der Spec, Abschnitt „Entwurf der Datenschutztexte“, Punkte 1–5 (von Julian freigegeben). `{BETREIBER.email}` aus `rechtliches/betreiber.ts`. Die Seite wird über `statisch/rechtsseiten.tsx` mit vorgerendert — nichts weiter zu tun, nur im Build prüfen.

- [ ] **Step 1: Write the failing tests:**
  - `'hat einen Abschnitt „Etwas melden"'` — `getByRole('heading', { name: 'Etwas melden' })`
  - `'nennt WEB.DE, lit. f und hoechstens 12 Monate'`
  - `'sagt, dass der Server Meldungen nicht speichert'`
  - `'behauptet nicht mehr, keine personenbezogenen Daten zu speichern'` — der alte Satz „Da wir keine personenbezogenen Daten speichern“ kommt nicht mehr vor
  - `'nennt Fly.io auch fuer das Weiterreichen von Meldungen'`

- [ ] **Step 2: Run** `cd frontend && npx vitest run src/components/Datenschutz.test.tsx src/statisch` — Expected: FAIL.

- [ ] **Step 3: Implement** die Textänderungen und den Kopfkommentar-Eintrag (Komponente, Route, `backend/test/datenschutz.test.ts`).

- [ ] **Step 4: Run** dieselben Tests — Expected: PASS.

- [ ] **Step 5: Commit** `docs(datenschutz): Abschnitt „Etwas melden"`

---

### Task 7: Abnahme vor der Auslieferung

**Files:** keine neuen; README-Abschnitt zum Backend um `POST /api/meldung` und die fünf SMTP-Variablen ergänzen, falls dort die Routen bzw. Variablen aufgeführt sind.

- [ ] **Step 1:** `cd backend && npm test && npm run lint` — Expected: alles grün.
- [ ] **Step 2:** danach (nicht gleichzeitig) `cd frontend && npx vitest run && npm run lint && npm run build` — Expected: alles grün, Build meldet die statischen Seiten.
- [ ] **Step 3: Ende-zu-Ende lokal mit echtem Versand (Julian erlaubt):** Backend aus `backend/` mit `npx tsx --env-file="E:/jbeer/.secrets/umstieg.env" --env-file="E:/jbeer/.secrets/smtp-webde.env" src/server.ts` im Hintergrund, Frontend `npx vite --port 5173 --strictPort`. Im Browser `/eingabe`: Knopf unter „Einstellungen“ linksbündig, Dialog in Hell und Dunkel, auf 360 px Breite; eine Meldung mit Adresse senden → Danke-Ansicht. Julian bestätigt den Eingang (Reply-To = angegebene Adresse). Danach beide Prozesse beenden (Ports 3001/5173 prüfen – TaskStop beendet Node nicht).
- [ ] **Step 4:** Commit der README-Änderung, falls vorhanden. **Hier endet der Plan.** Auslieferung nur auf Julians Auftrag, in dieser Reihenfolge (Spec „Auslieferung“): `flyctl deploy backend --ha=false` aus dem Repo-Wurzelordner (bei Sperre der Rechteprüfung Julian den `!`-Befehl geben) → `flyctl secrets list --app umstieg-backend` zeigt die fünf Werte als „Deployed“ → eine Testmeldung gegen `https://umstieg-backend.fly.dev/api/meldung` → erst dann Fast-Forward-Push auf `main`.
