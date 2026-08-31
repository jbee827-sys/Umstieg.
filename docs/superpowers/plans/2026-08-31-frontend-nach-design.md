# Frontend nach dem Designkonzept – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das Frontend so umbauen, dass es dem Design-Prototyp entspricht – fünf Bildschirme mit Navigationsleiste, Schema statt Landkarte, ein Schritt statt einer Liste, Gleiswechsel als Entscheidung.

**Architecture:** `App.tsx` behält nur Zustand, Datenfluss und Bildschirmwahl; jeder Bildschirm wird eine eigene Komponente unter `src/screens/`. Die Ableitung des Ebenenschemas aus der Routengeometrie entsteht als reine Funktion unter `src/schema/`, damit der fehleranfälligste Teil ohne DOM prüfbar bleibt.

**Tech Stack:** React 19, Vite 8, TypeScript, vitest 3, neu: jsdom + @testing-library/react.

**Spec:** [`docs/superpowers/specs/2026-08-31-frontend-nach-design-design.md`](../specs/2026-08-31-frontend-nach-design-design.md)

## Global Constraints

- **Kein Backend.** Keine Datei unter `backend/` wird angefasst. Die API-Schnittstelle bleibt unverändert.
- **Sprache:** Alle Bezeichner, Kommentare und Texte auf Deutsch, wie im ganzen Projekt.
- **Design-Tokens:** Nur vorhandene Tokens aus `src/index.css` verwenden – Akzent `#ec3013`, Hintergrund `#f3f2f2`, Text `#201e1d`, Grün `#0f7a4f`, Gelb `#e08a00`, Schrift „Archivo". Keine neuen Farben erfinden.
- **Keine Media-Queries.** `App.css` hat bewusst null; das Layout bleibt rein fluid mit `max-width: 430px`.
- **Keine erfundenen Daten.** Fehlende Werte werden weggelassen, nicht mit Beispielwerten des Prototyps gefüllt.
- **Ampelformel unverändert:** Grün ≥ 2× Gehzeit, Gelb 1–2×, Rot < 1×.
- **Nach jeder Task:** `npm test`, `npm run build` und `npm run lint` müssen grün sein (Lint: keine *neuen* Warnungen über die bestehenden 4 hinaus).

---

### Task 1: Testinfrastruktur für Komponenten

**Files:**
- Modify: `frontend/package.json` (devDependencies)
- Modify: `frontend/vitest.config.ts`
- Create: `frontend/src/test-setup.ts`
- Test: `frontend/src/components/Ampel.test.tsx`

**Interfaces:**
- Produces: Komponenten sind mit `render()` und `screen` aus `@testing-library/react` prüfbar; `*.test.tsx` wird von vitest gefunden.

- [ ] **Step 1: Abhängigkeiten installieren**

```bash
cd frontend && npm install -D jsdom @testing-library/react @testing-library/dom @testing-library/user-event
```

- [ ] **Step 2: vitest-Konfiguration erweitern**

`frontend/vitest.config.ts` vollständig ersetzen:

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // .tsx muss mit hinein, sonst findet vitest keine Komponententests.
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
})
```

- [ ] **Step 3: Aufräum-Datei anlegen**

`frontend/src/test-setup.ts`:

```ts
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// Ohne das teilen sich aufeinanderfolgende Tests denselben DOM und
// finden Elemente des Vorgängers.
afterEach(() => cleanup())
```

- [ ] **Step 4: Ersten Komponententest schreiben**

`frontend/src/components/Ampel.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Ampel } from './Ampel'

describe('Ampel', () => {
  it('nennt ohne Abfahrtszeit den Grund, warum sie schweigt', () => {
    render(<Ampel farbe={null} gehzeitSek={300} />)
    expect(screen.getByText(/Zugauswahl für die Ampel nötig/)).toBeDefined()
  })

  it('zeigt mit Abfahrtszeit Restzeit und Gehzeit', () => {
    render(<Ampel farbe="gruen" gehzeitSek={300} restSek={900} />)
    expect(screen.getByText(/15:00 bis Abfahrt/)).toBeDefined()
    expect(screen.getByText(/Entspannt erreichbar/)).toBeDefined()
  })
})
```

- [ ] **Step 5: Test laufen lassen**

Run: `cd frontend && npx vitest run src/components/Ampel.test.tsx`
Expected: PASS, 2 Tests. Schlägt es mit „document is not defined" fehl, greift `environment: 'jsdom'` nicht – Schritt 2 prüfen.

- [ ] **Step 6: Gesamtsuite und Build**

Run: `cd frontend && npm test && npm run build`
Expected: 39 Tests grün (37 bestehende + 2 neue), Build grün.

- [ ] **Step 7: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/test-setup.ts frontend/src/components/Ampel.test.tsx
git commit -m "test: jsdom und Testing Library - Komponenten sind pruefbar"
```

---

### Task 2: Bildschirm-Zustand und Navigationsleiste

**Files:**
- Create: `frontend/src/navigation/bildschirme.ts`
- Create: `frontend/src/components/Navileiste.tsx`
- Test: `frontend/src/navigation/bildschirme.test.ts`, `frontend/src/components/Navileiste.test.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/App.css`

**Interfaces:**
- Produces:
  - `type Bildschirm = 'eingabe' | 'dashboard' | 'navigation' | 'stoerung' | 'angekommen'`
  - `interface LeistenEintrag { id: Bildschirm; label: string; aktiv: boolean }`
  - `function leisteneintraege(hatRoute: boolean): LeistenEintrag[]` – liefert die vier sichtbaren Einträge (`stoerung` ist nie dabei)
  - `<Navileiste aktuell={Bildschirm} hatRoute={boolean} hinweis={boolean} onWechsel={(b: Bildschirm) => void} />`

- [ ] **Step 1: Failing test für die Eintragsregeln**

`frontend/src/navigation/bildschirme.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { leisteneintraege } from './bildschirme'

describe('leisteneintraege', () => {
  it('zeigt ohne Route nur die Eingabe als aktiv', () => {
    const e = leisteneintraege(false)
    expect(e.map((x) => x.id)).toEqual(['eingabe', 'dashboard', 'navigation', 'angekommen'])
    expect(e.filter((x) => x.aktiv).map((x) => x.id)).toEqual(['eingabe'])
  })

  it('gibt mit Route alle Eintraege frei', () => {
    expect(leisteneintraege(true).every((x) => x.aktiv)).toBe(true)
  })

  it('fuehrt die Stoerung nie als Eintrag', () => {
    // Sie ist ein Kennzeichen am Dashboard, kein Dauerknopf.
    expect(leisteneintraege(true).some((x) => x.id === 'stoerung')).toBe(false)
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/navigation/bildschirme.test.ts`
Expected: FAIL – „Failed to resolve import ./bildschirme".

- [ ] **Step 3: Modul anlegen**

`frontend/src/navigation/bildschirme.ts`:

```ts
export type Bildschirm = 'eingabe' | 'dashboard' | 'navigation' | 'stoerung' | 'angekommen'

export interface LeistenEintrag {
  id: Bildschirm
  label: string
  aktiv: boolean
}

// 'stoerung' fehlt bewusst: Der Bildschirm ist nur bei einem Gleiswechsel
// erreichbar und waere sonst ein Knopf, der meistens ins Leere fuehrt.
export function leisteneintraege(hatRoute: boolean): LeistenEintrag[] {
  return [
    { id: 'eingabe', label: 'Eingabe', aktiv: true },
    { id: 'dashboard', label: 'Dashboard', aktiv: hatRoute },
    { id: 'navigation', label: 'Weg', aktiv: hatRoute },
    { id: 'angekommen', label: 'Angekommen', aktiv: hatRoute },
  ]
}
```

- [ ] **Step 4: Test laufen lassen**

Run: `cd frontend && npx vitest run src/navigation/bildschirme.test.ts`
Expected: PASS, 3 Tests.

- [ ] **Step 5: Failing test für die Leiste**

`frontend/src/components/Navileiste.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Navileiste } from './Navileiste'

describe('Navileiste', () => {
  it('sperrt Eintraege ohne Route', async () => {
    const onWechsel = vi.fn()
    render(<Navileiste aktuell="eingabe" hatRoute={false} hinweis={false} onWechsel={onWechsel} />)
    const dash = screen.getByRole('button', { name: /Dashboard/ })
    expect(dash.getAttribute('aria-disabled')).toBe('true')
    await userEvent.click(dash)
    expect(onWechsel).not.toHaveBeenCalled()
  })

  it('meldet den Wechsel bei freigegebenem Eintrag', async () => {
    const onWechsel = vi.fn()
    render(<Navileiste aktuell="eingabe" hatRoute hinweis={false} onWechsel={onWechsel} />)
    await userEvent.click(screen.getByRole('button', { name: /Dashboard/ }))
    expect(onWechsel).toHaveBeenCalledWith('dashboard')
  })

  it('zeigt das Stoerungs-Kennzeichen am Dashboard', () => {
    render(<Navileiste aktuell="dashboard" hatRoute hinweis onWechsel={() => {}} />)
    expect(screen.getByLabelText(/Gleiswechsel liegt vor/)).toBeDefined()
  })
})
```

- [ ] **Step 6: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/components/Navileiste.test.tsx`
Expected: FAIL – Modul fehlt.

- [ ] **Step 7: Leiste implementieren**

`frontend/src/components/Navileiste.tsx`:

```tsx
import { leisteneintraege, type Bildschirm } from '../navigation/bildschirme'

interface NavileisteProps {
  aktuell: Bildschirm
  hatRoute: boolean
  /** Ein Gleiswechsel-Vorschlag liegt vor → Kennzeichen am Dashboard. */
  hinweis: boolean
  onWechsel: (ziel: Bildschirm) => void
}

// Untere Leiste. Gesperrte Eintraege bleiben sichtbar, damit der Aufbau der
// App erkennbar ist - sie sind nur nicht antippbar.
export function Navileiste({ aktuell, hatRoute, hinweis, onWechsel }: NavileisteProps) {
  return (
    <nav className="navileiste" aria-label="Bereiche">
      {leisteneintraege(hatRoute).map((e) => (
        <button
          key={e.id}
          type="button"
          className={`navileiste-knopf${aktuell === e.id ? ' aktuell' : ''}`}
          aria-disabled={!e.aktiv}
          aria-current={aktuell === e.id ? 'page' : undefined}
          onClick={() => e.aktiv && onWechsel(e.id)}
        >
          {e.label}
          {e.id === 'dashboard' && hinweis && (
            <span className="navileiste-punkt" aria-label="Gleiswechsel liegt vor" role="img" />
          )}
        </button>
      ))}
    </nav>
  )
}
```

- [ ] **Step 8: Stile ergänzen**

An `frontend/src/App.css` anhängen:

```css
.navileiste {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 4px;
  padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
  background: var(--color-bg);
  border-top: 2px solid var(--color-divider);
}
.navileiste-knopf {
  flex: 1;
  min-height: 52px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  color: var(--color-text);
  cursor: pointer;
  position: relative;
}
.navileiste-knopf.aktuell { background: var(--color-text); color: var(--color-bg); }
.navileiste-knopf[aria-disabled='true'] { opacity: 0.35; cursor: default; }
.navileiste-punkt {
  position: absolute;
  top: 8px;
  right: 10px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-accent);
}
```

- [ ] **Step 9: In App.tsx einhängen**

In `frontend/src/App.tsx`: `useState<'eingabe' | 'route' | 'angekommen'>` ersetzen durch `useState<Bildschirm>('eingabe')`. Jedes `setAnsicht('route')` wird zu `setBildschirm('dashboard')`. Am Ende jeder Bildschirmausgabe `<Navileiste aktuell={bildschirm} hatRoute={route !== null} hinweis={false} onWechsel={setBildschirm} />` einsetzen. `hinweis` bleibt bis Task 7 fest `false`.

- [ ] **Step 10: Alles grün**

Run: `cd frontend && npm test && npm run build && npm run lint`
Expected: 45 Tests grün, Build grün, keine neuen Lint-Warnungen.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/navigation/bildschirme.ts frontend/src/navigation/bildschirme.test.ts frontend/src/components/Navileiste.tsx frontend/src/components/Navileiste.test.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: Bildschirm-Zustand und untere Navigationsleiste"
```

---

### Task 3: Dashboard-Bildschirm

**Files:**
- Create: `frontend/src/screens/Dashboard.tsx`
- Test: `frontend/src/screens/Dashboard.test.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/App.css`

**Interfaces:**
- Consumes: `Ampel`, `EingabeWerte`, `RouteErgebnis`, `Bildschirm` aus Task 2.
- Produces: `<Dashboard werte={EingabeWerte} route={RouteErgebnis} restSek={number|undefined} abgefahren={boolean} varianten={VariantenStand} hinweis={boolean} onVariante={(v: RoutenVariante) => void} onNavigation={() => void} onStoerung={() => void} />`
  mit `interface VariantenStand { schnellste?: number; barrierefrei?: number; gewaehlt: RoutenVariante }` (Werte = Gehzeit in Sekunden, `undefined` = nicht berechenbar).

- [ ] **Step 1: Failing test**

`frontend/src/screens/Dashboard.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dashboard } from './Dashboard'
import type { EingabeWerte } from '../components/Eingabe'
import type { RouteErgebnis } from '../api/typen'

const werte: EingabeWerte = {
  eva: '8011160', bahnhofName: 'Berlin Hbf', gleisAn: '6', gleisAb: '14',
  wagen: '', profil: 'normal', variante: 'schnellste',
}
const route: RouteErgebnis = { stufe: 1, schritte: [], gehzeitSek: 300, hinweise: [] }

describe('Dashboard', () => {
  it('zeigt die Gehzeit auch ohne Abfahrtszeit', () => {
    render(
      <Dashboard werte={werte} route={route} restSek={undefined} abgefahren={false}
        varianten={{ schnellste: 300, gewaehlt: 'schnellste' }} hinweis={false}
        onVariante={() => {}} onNavigation={() => {}} onStoerung={() => {}} />,
    )
    expect(screen.getByText(/5 Minuten Gehzeit/)).toBeDefined()
  })

  it('bietet nur Schnellste und Barrierefrei an', () => {
    render(
      <Dashboard werte={werte} route={route} restSek={900} abgefahren={false}
        varianten={{ schnellste: 300, barrierefrei: 540, gewaehlt: 'schnellste' }} hinweis={false}
        onVariante={() => {}} onNavigation={() => {}} onStoerung={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Schnellste/ })).toBeDefined()
    expect(screen.getByRole('button', { name: /Barrierefrei/ })).toBeDefined()
    expect(screen.queryByRole('button', { name: /Einfachste/ })).toBeNull()
  })

  it('nennt die Minuten am Knopf, wenn sie bekannt sind', () => {
    render(
      <Dashboard werte={werte} route={route} restSek={900} abgefahren={false}
        varianten={{ schnellste: 300, barrierefrei: 540, gewaehlt: 'schnellste' }} hinweis={false}
        onVariante={() => {}} onNavigation={() => {}} onStoerung={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Barrierefrei.*9 min/ })).toBeDefined()
  })

  it('laesst die Minuten weg, wenn die Berechnung fehlschlug', () => {
    render(
      <Dashboard werte={werte} route={route} restSek={900} abgefahren={false}
        varianten={{ schnellste: 300, gewaehlt: 'schnellste' }} hinweis={false}
        onVariante={() => {}} onNavigation={() => {}} onStoerung={() => {}} />,
    )
    const bf = screen.getByRole('button', { name: /Barrierefrei/ })
    expect(bf.textContent).not.toMatch(/min/)
  })

  it('zeigt den Stoerungsknopf nur bei Hinweis', async () => {
    const onStoerung = vi.fn()
    const { rerender } = render(
      <Dashboard werte={werte} route={route} restSek={900} abgefahren={false}
        varianten={{ schnellste: 300, gewaehlt: 'schnellste' }} hinweis={false}
        onVariante={() => {}} onNavigation={() => {}} onStoerung={onStoerung} />,
    )
    expect(screen.queryByRole('button', { name: /Störung/ })).toBeNull()
    rerender(
      <Dashboard werte={werte} route={route} restSek={900} abgefahren={false}
        varianten={{ schnellste: 300, gewaehlt: 'schnellste' }} hinweis
        onVariante={() => {}} onNavigation={() => {}} onStoerung={onStoerung} />,
    )
    await userEvent.click(screen.getByRole('button', { name: /Störung/ }))
    expect(onStoerung).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/screens/Dashboard.test.tsx`
Expected: FAIL – Modul fehlt.

- [ ] **Step 3: Dashboard implementieren**

`frontend/src/screens/Dashboard.tsx` – Aufbau nach Spec 5.2: Kopf (Bahnhofsname), `<Ampel>`, die Blöcke „Du kommst an" / „Dein Anschluss" (Zug, Gleis, Zeit – fehlende Werte weglassen), die zwei Routenknöpfe mit `aria-pressed`, der bedingte Störungsknopf, „Navigation starten". Minutenformel: `Math.ceil(sek / 60)`. Fehlt der Wert, wird kein `min`-Text gerendert.

- [ ] **Step 4: Test laufen lassen**

Run: `cd frontend && npx vitest run src/screens/Dashboard.test.tsx`
Expected: PASS, 5 Tests.

- [ ] **Step 5: In App.tsx einhängen**

`berechne()` rechnet beide Varianten parallel:

```ts
const [schnell, barrierefrei] = await Promise.allSettled([
  holeRoute({ ...w, variante: 'schnellste' }),
  holeRoute({ ...w, variante: 'barrierefrei' }),
])
```

Die gewählte Variante bestimmt `route`; die Gehzeiten beider füllen `varianten`. Schlagen beide fehl, gilt die bestehende Fehlerbehandlung. Nach Erfolg `setBildschirm('dashboard')`.

- [ ] **Step 6: Alles grün, Commit**

```bash
cd frontend && npm test && npm run build && npm run lint
git add frontend/src/screens/Dashboard.tsx frontend/src/screens/Dashboard.test.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: Dashboard mit Ampel ab Gleiseingabe und zwei Routenknoepfen"
```

---

### Task 4: Schema-Ableitung als reine Funktion

**Files:**
- Create: `frontend/src/schema/ableitung.ts`
- Test: `frontend/src/schema/ableitung.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SchemaBand { level: number; label: string; gleise: string[]; aktiv: boolean }
  export interface SchemaModell { baender: SchemaBand[]; wechsel: { vonLevel: number; nachLevel: number; typ: KantenTyp }[] }
  export function leiteSchemaAb(schritte: Schritt[], aktiv: number, gleisAn: string, gleisAb: string): SchemaModell
  ```

- [ ] **Step 1: Failing test**

`frontend/src/schema/ableitung.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { leiteSchemaAb } from './ableitung'
import type { Schritt } from '../api/typen'

const schritte: Schritt[] = [
  { text: 'Start', typ: 'start', level: -2 },
  { text: 'Treppe hoch', typ: 'treppe', level: 0 },
  { text: 'Halle queren', typ: 'eben', level: 0 },
  { text: 'Rolltreppe hoch', typ: 'rolltreppe', level: 1 },
  { text: 'Ziel', typ: 'ziel', level: 1 },
]

describe('leiteSchemaAb', () => {
  it('bildet ein Band je Ebene, von oben nach unten', () => {
    const m = leiteSchemaAb(schritte, 0, '6', '14')
    expect(m.baender.map((b) => b.level)).toEqual([1, 0, -2])
  })

  it('haengt Ankunfts- und Zielgleis an ihre Ebenen', () => {
    const m = leiteSchemaAb(schritte, 0, '6', '14')
    expect(m.baender.find((b) => b.level === -2)?.gleise).toContain('6')
    expect(m.baender.find((b) => b.level === 1)?.gleise).toContain('14')
  })

  it('markiert das Band des aktiven Schritts', () => {
    const m = leiteSchemaAb(schritte, 2, '6', '14')
    expect(m.baender.find((b) => b.aktiv)?.level).toBe(0)
  })

  it('nennt die Ebenenwechsel mit ihrem Typ', () => {
    const m = leiteSchemaAb(schritte, 0, '6', '14')
    expect(m.wechsel).toEqual([
      { vonLevel: -2, nachLevel: 0, typ: 'treppe' },
      { vonLevel: 0, nachLevel: 1, typ: 'rolltreppe' },
    ])
  })

  it('kommt mit fehlenden Ebenenangaben zurecht', () => {
    // Stufe 3 und aeltere Antworten tragen kein level – dann ein Band.
    const ohne: Schritt[] = [{ text: 'a', typ: 'start' }, { text: 'b', typ: 'ziel' }]
    const m = leiteSchemaAb(ohne, 0, '1', '2')
    expect(m.baender).toHaveLength(1)
    expect(m.wechsel).toEqual([])
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/schema/ableitung.test.ts`
Expected: FAIL – Modul fehlt.

- [ ] **Step 3: Implementieren**

`frontend/src/schema/ableitung.ts`. Regeln: Ebenen aus `schritt.level` sammeln, absteigend sortieren; `label` = `EBENE +1` / `EBENE 0` / `EBENE −2` (echtes Minuszeichen U+2212 wie im Entwurf); `gleisAn` an die Ebene des ersten Schritts, `gleisAb` an die des letzten; `aktiv` = Band des Schritts mit Index `aktiv`; `wechsel` aus jedem Schritt, dessen `typ` in `{treppe, rolltreppe, aufzug, rampe}` liegt und dessen `level` sich vom vorherigen unterscheidet. Fehlen alle `level`, ein einziges Band mit `level: 0` und beiden Gleisen.

- [ ] **Step 4: Test laufen lassen**

Run: `cd frontend && npx vitest run src/schema/ableitung.test.ts`
Expected: PASS, 5 Tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/schema/ableitung.ts frontend/src/schema/ableitung.test.ts
git commit -m "feat: Ebenenschema aus der Routengeometrie ableiten"
```

---

### Task 5: Navigations-Bildschirm mit Schema und Schritt-Sheet

**Files:**
- Create: `frontend/src/screens/Navigation.tsx`, `frontend/src/components/Ebenenschema.tsx`, `frontend/src/components/Schrittsheet.tsx`
- Test: `frontend/src/components/Schrittsheet.test.tsx`, `frontend/src/screens/Navigation.test.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/App.css`

**Interfaces:**
- Consumes: `leiteSchemaAb`, `SchemaModell` aus Task 4; `aktiverSchritt` aus `navigation/fortschritt.ts`.
- Produces:
  - `<Ebenenschema modell={SchemaModell} bahnhofName={string} />`
  - `<Schrittsheet schritte={Schritt[]} position={number} onZurueck={() => void} onWeiter={() => void} />`
  - `<Navigation ... />`

- [ ] **Step 1: Failing test für das Sheet**

`frontend/src/components/Schrittsheet.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Schrittsheet } from './Schrittsheet'
import type { Schritt } from '../api/typen'

const schritte: Schritt[] = [
  { text: 'Nach Ausstieg 30 m geradeaus', typ: 'start' },
  { text: 'Treppe hoch zur Halle', typ: 'treppe' },
  { text: 'Rechts zu Gleis 14', typ: 'ziel' },
]

describe('Schrittsheet', () => {
  it('zeigt genau einen Schritt', () => {
    render(<Schrittsheet schritte={schritte} position={1} onZurueck={() => {}} onWeiter={() => {}} />)
    expect(screen.getByText(/Treppe hoch zur Halle/)).toBeDefined()
    expect(screen.queryByText(/Nach Ausstieg 30 m/)).toBeNull()
  })

  it('nennt Position und Gesamtzahl', () => {
    render(<Schrittsheet schritte={schritte} position={1} onZurueck={() => {}} onWeiter={() => {}} />)
    expect(screen.getByText(/Schritt 2 von 3/)).toBeDefined()
  })

  it('meldet Weiter und Zurueck', async () => {
    const onWeiter = vi.fn()
    const onZurueck = vi.fn()
    render(<Schrittsheet schritte={schritte} position={1} onZurueck={onZurueck} onWeiter={onWeiter} />)
    await userEvent.click(screen.getByRole('button', { name: /Weiter/ }))
    await userEvent.click(screen.getByRole('button', { name: /Zurück/ }))
    expect(onWeiter).toHaveBeenCalled()
    expect(onZurueck).toHaveBeenCalled()
  })

  it('sperrt Zurueck am Anfang und Weiter am Ende', () => {
    const { rerender } = render(
      <Schrittsheet schritte={schritte} position={0} onZurueck={() => {}} onWeiter={() => {}} />,
    )
    expect(screen.getByRole('button', { name: /Zurück/ }).hasAttribute('disabled')).toBe(true)
    rerender(<Schrittsheet schritte={schritte} position={2} onZurueck={() => {}} onWeiter={() => {}} />)
    expect(screen.getByRole('button', { name: /Weiter/ }).hasAttribute('disabled')).toBe(true)
  })

  it('macht die volle Liste aufklappbar erreichbar', async () => {
    render(<Schrittsheet schritte={schritte} position={0} onZurueck={() => {}} onWeiter={() => {}} />)
    await userEvent.click(screen.getByText(/Alle Schritte/))
    expect(screen.getByText(/Rechts zu Gleis 14/)).toBeDefined()
  })
})
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/components/Schrittsheet.test.tsx`
Expected: FAIL – Modul fehlt.

- [ ] **Step 3: Schrittsheet implementieren**

Unteres Sheet: Zeile „Schritt n von m", der Text des aktiven Schritts groß, darunter `distanzM`/`sekunden` als Detail, Knöpfe „Zurück"/„Weiter" (`disabled` an den Rändern), darunter ein `<details><summary>Alle Schritte</summary>` mit der bestehenden `Schrittliste`.

- [ ] **Step 4: Ebenenschema implementieren**

`frontend/src/components/Ebenenschema.tsx` – SVG mit einem Band je `SchemaBand` (Höhe 64, Abstand 12), Ebenenbeschriftung links (`EBENE +1`), Gleisnummern als Kacheln, aktives Band in `var(--color-accent)`, Verbindungen zwischen Bändern gemäß `modell.wechsel` mit dem Typ als Beschriftung. Der Hinweis „Schema, keine Karte" bleibt.

- [ ] **Step 5: Navigations-Bildschirm zusammensetzen**

`frontend/src/screens/Navigation.tsx`: oben `<Ebenenschema>`, darunter `<details><summary>Echte Karte anzeigen</summary>` mit der bestehenden lazy geladenen `<Karte>`, unten `<Schrittsheet>`. Bei `stufe === 3` entfällt der Kartenblock ganz (unveränderte Regel).

- [ ] **Step 6: Test für den Bildschirm**

`frontend/src/screens/Navigation.test.tsx`: prüft, dass bei Stufe 3 kein Kartenknopf gerendert wird und bei Stufe 1 einer.

- [ ] **Step 7: In App.tsx einhängen, alles grün, Commit**

```bash
cd frontend && npm test && npm run build && npm run lint
git add frontend/src/screens/Navigation.tsx frontend/src/screens/Navigation.test.tsx frontend/src/components/Ebenenschema.tsx frontend/src/components/Schrittsheet.tsx frontend/src/components/Schrittsheet.test.tsx frontend/src/App.tsx frontend/src/App.css
git commit -m "feat: Navigation mit Ebenenschema und Schritt-Sheet, Karte hinter Mehr"
```

---

### Task 6: Angekommen groß in Grün

**Files:**
- Modify: `frontend/src/components/Angekommen.tsx` → verschieben nach `frontend/src/screens/Angekommen.tsx`
- Test: `frontend/src/screens/Angekommen.test.tsx`
- Modify: `frontend/src/App.tsx`, `frontend/src/App.css`

**Interfaces:**
- Produces: `<Angekommen gleis={string} abschnitt={string|undefined} abfahrt={string|undefined} wagen={string|undefined} restSek={number|undefined} onNeu={() => void} />`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Angekommen } from './Angekommen'

describe('Angekommen', () => {
  it('zeigt die grosse Bestaetigung', () => {
    render(<Angekommen gleis="14" onNeu={() => {}} />)
    expect(screen.getByText('Du bist da.')).toBeDefined()
  })

  it('laesst unbekannte Werte weg statt sie zu erfinden', () => {
    render(<Angekommen gleis="14" onNeu={() => {}} />)
    expect(screen.queryByText(/Wagen/)).toBeNull()
    expect(screen.queryByText(/Platz/)).toBeNull()
  })

  it('nennt Wagen und Abfahrt, wenn bekannt', () => {
    render(<Angekommen gleis="14" wagen="26" abfahrt="14:32" onNeu={() => {}} />)
    expect(screen.getByText(/Wagen 26/)).toBeDefined()
    expect(screen.getByText(/14:32/)).toBeDefined()
  })
})
```

- [ ] **Step 2: Fehlschlag bestätigen, implementieren, Test grün**

Run: `cd frontend && npx vitest run src/screens/Angekommen.test.tsx` – erst FAIL, nach der Umsetzung PASS.
Umsetzung: `<main className="app angekommen-gruen">`, Überschrift „Du bist da.", darunter „Gleis 14" und die bekannten Werte als Kacheln. Stil:

```css
.angekommen-gruen { background: var(--color-gruen); color: var(--color-bg); min-height: 100dvh; }
.angekommen-gruen h1 { font-size: 34px; letter-spacing: -0.03em; }
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/screens/Angekommen.tsx frontend/src/screens/Angekommen.test.tsx frontend/src/App.tsx frontend/src/App.css
git rm frontend/src/components/Angekommen.tsx
git commit -m "feat: Angekommen gross auf gruenem Grund mit den bekannten Reisedaten"
```

---

### Task 7: Gleiswechsel als Vorschlag statt Automatik

**Files:**
- Create: `frontend/src/screens/Stoerung.tsx`
- Test: `frontend/src/screens/Stoerung.test.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces:
  - `interface Vorschlag { route: RouteErgebnis; werte: EingabeWerte; anlass: LiveEreignis }`
  - `<Stoerung vorschlag={Vorschlag} alteRoute={RouteErgebnis} alteWerte={EingabeWerte} restSek={number|undefined} onUebernehmen={() => void} onBehalten={() => void} />`

- [ ] **Step 1: Failing test**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Stoerung } from './Stoerung'
import type { EingabeWerte } from '../components/Eingabe'
import type { RouteErgebnis, LiveEreignis } from '../api/typen'

const alteWerte: EingabeWerte = {
  eva: '8011160', bahnhofName: 'Berlin Hbf', gleisAn: '6', gleisAb: '14',
  wagen: '', profil: 'normal', variante: 'schnellste', abfahrtZeit: '14:36',
}
const alteRoute: RouteErgebnis = { stufe: 1, schritte: [], gehzeitSek: 300, hinweise: [] }
const anlass: LiveEreignis = {
  typ: 'gleiswechsel', zug: 'ICE 1006', alt: '14', neu: '12',
  zeitstempel: '2026-08-31T12:32:10.000Z',
}
const vorschlag = {
  route: { stufe: 1, schritte: [], gehzeitSek: 480, hinweise: [] } as RouteErgebnis,
  werte: { ...alteWerte, gleisAb: '12', abfahrtZeit: '14:32' },
  anlass,
}

function zeige(onUebernehmen = vi.fn(), onBehalten = vi.fn()) {
  render(
    <Stoerung
      vorschlag={vorschlag}
      alteRoute={alteRoute}
      alteWerte={alteWerte}
      restSek={240}
      onUebernehmen={onUebernehmen}
      onBehalten={onBehalten}
    />,
  )
  return { onUebernehmen, onBehalten }
}

describe('Stoerung', () => {
  it('stellt altes und neues Gleis gegenueber', () => {
    zeige()
    expect(screen.getByText(/Gl\. 14/)).toBeDefined()
    expect(screen.getByText(/Gl\. 12/)).toBeDefined()
  })

  it('nennt die neue Gehzeit', () => {
    zeige()
    expect(screen.getByText(/8 Minuten/)).toBeDefined()
  })

  it('sagt die Ampelaussage im Klartext', () => {
    // 240 s Rest gegen 480 s Gehzeit -> weniger als die Gehzeit -> Rot.
    zeige()
    expect(screen.getByText(/Rot/)).toBeDefined()
  })

  it('uebernimmt nur auf Knopfdruck', async () => {
    const { onUebernehmen } = zeige()
    expect(onUebernehmen).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Route übernehmen/ }))
    expect(onUebernehmen).toHaveBeenCalled()
  })

  it('verwirft den Vorschlag mit Behalten', async () => {
    const onBehalten = vi.fn()
    zeige(vi.fn(), onBehalten)
    await userEvent.click(screen.getByRole('button', { name: /Behalten/ }))
    expect(onBehalten).toHaveBeenCalled()
  })
})
```


- [ ] **Step 2: Fehlschlag bestätigen**

Run: `cd frontend && npx vitest run src/screens/Stoerung.test.tsx`
Expected: FAIL – Modul fehlt.

- [ ] **Step 3: Bildschirm implementieren**

Nach Spec 5.4: Alt/Neu-Gleis gegenübergestellt, neue Gehzeit, neue Abfahrt mit „x min früher/später", Restzeit danach, Ampelaussage im Klartext, Knöpfe „Route übernehmen" und „Behalten".

- [ ] **Step 4: App.tsx umstellen**

Im SSE-Behandler die automatische Übernahme entfernen. Statt `berechne({...})` direkt anzuwenden: neue Route berechnen, in `vorschlag` legen, `hinweis` der Navileiste auf `true`. `onUebernehmen` setzt `route`/`werte` aus dem Vorschlag und leert ihn; `onBehalten` leert ihn nur. Schlägt die Neuberechnung fehl, bleibt es beim Banner ohne Vorschlag.

- [ ] **Step 5: Alles grün, Commit**

```bash
cd frontend && npm test && npm run build && npm run lint
git add frontend/src/screens/Stoerung.tsx frontend/src/screens/Stoerung.test.tsx frontend/src/App.tsx
git commit -m "feat: Gleiswechsel als Vorschlag - der Nutzer entscheidet"
```

---

### Task 8: Aufräumen und Dokumentation

**Files:**
- Modify: `frontend/src/App.tsx` (Reste), `frontend/src/components/Eingabe.tsx`, `README.md`

- [ ] **Step 1: Gehprofil hinter „Mehr einstellen"**

In `Eingabe.tsx` die Profilgruppe in `<details><summary>Mehr einstellen</summary>` verschieben. Die Variantengruppe **entfernen** – sie lebt jetzt im Dashboard.

- [ ] **Step 2: Tests und Build**

Run: `cd frontend && npm test && npm run build && npm run lint`
Expected: alles grün.

- [ ] **Step 3: README nachziehen**

Abschnitte „UI-Design" und „Projektstand" aktualisieren: fünf Bildschirme gebaut, Navigationsleiste, Schema als Regelanzeige, Gleiswechsel als Vorschlag. ToDo 9 auf die verbleibenden Punkte kürzen (Ticket-Import, Wagenreihung, „Mit Stopp") mit Verweis auf Abschnitt 8 der Spec. ToDo 14 (Frontend-Komponententests) als erledigt streichen. Testzahlen aktualisieren.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/Eingabe.tsx frontend/src/App.tsx README.md
git commit -m "docs: Frontend-Umbau im README nachziehen"
```

---

## Selbstprüfung des Plans

**Spec-Abdeckung:** 5.1 → Task 8 · 5.2 → Task 3 · 5.3 → Tasks 4, 5 · 5.4 → Task 7 · 5.5 → Task 6 · 4 (Leiste) → Task 2 · 9 (Tests) → Task 1 · 8 (nur spezifiziert) → kein Task, absichtlich.

**Nicht im Plan, weil nicht gebaut:** Ticket-Import (8.1), Wagenreihung (8.2), Variante „Mit Stopp" (8.3).
