# Seitenübergänge, Adressen und gesicherte Reise – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jeder Bildschirm bekommt eine Adresse, die Zurück-Taste und ein Neuladen funktionieren, und Seitenwechsel bewegen sich gerichtet entlang des Ablaufs.

**Architecture:** Drei reine Module (`navigation/adressen.ts`, `navigation/uebergang.ts`, `sitzung/reisespeicher.ts`) und ihre Verdrahtung in `App.tsx`: Startzustand aus Adresse und gesicherter Reise, Adress-Abgleich per Effekt (`replaceState` beim ersten Mal, sonst `pushState`), `popstate`-Lauscher, `setBildschirm` mit Übergang. Die Bewegung selbst steht in `App.css` über `::view-transition-*`.

**Tech Stack:** React 19 (`flushSync` aus `react-dom`), TypeScript 6 (`document.startViewTransition` im DOM-Typ), Vitest + jsdom + Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-11-seitenuebergaenge-design.md`

## Global Constraints

- Befehle in `frontend/`: `npm test`, `npm run lint`, `npm run build`.
- Adressen: `/eingabe`, `/uebersicht`, `/weg`, `/meldungen`, `/angekommen`.
- Sicherung: Schlüssel `umstieg.reise`, Fassung 1, höchstens 6 Stunden alt; geschrieben nur auf `dashboard`, `navigation`, `meldungen`; gelöscht beim Bestätigen von „Angekommen".
- Bewegung nur über Token (`--dauer-*`, `--verlauf-*`); keine Bewegung ohne `startViewTransition`, bei `prefers-reduced-motion: reduce` und bei `hasUAVisualTransition`.
- Rechtsseiten bleiben Hash (`#impressum`, `#datenschutz`).
- Kommentare deutsch ohne Umlaute, sichtbare Texte mit Umlauten; Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Hash-Wechsel (Rechtsseiten) lösen `popstate` aus** → der Bildschirm darf sich dabei nicht ändern (Test in Task 4).
- **Neuladen auf einer Reise-Adresse ohne gesicherte Reise** → Eingabe und berichtigte Adresse, kein leerer Bildschirm (Test in Task 4).
- **Nach „Angekommen" schreibt der Effekt die Reise nicht zurück** (Test in Task 4).
- **Zurück auf eine Reise-Adresse, nachdem die Reise im Speicher fehlt** → Eintrag wird ersetzt, Eingabe (Test in Task 4).
- **Übergang bei verdecktem Tab oder abgelehntem Versprechen** → `data-uebergang` wird trotzdem entfernt (Test in Task 2).

---

### Task 1: `navigation/adressen.ts`

**Files:** Create `frontend/src/navigation/adressen.ts`, Test `frontend/src/navigation/adressen.test.ts`

**Interfaces – Produces:** `PFAD: Record<Bildschirm, string>`; `bildschirmAusPfad(pfad: string): Bildschirm | null`; `brauchtReise(b: Bildschirm): boolean`; `startBildschirm(pfad: string, hatReise: boolean): Bildschirm`.

- [ ] **Step 1: Test**

```ts
import { describe, expect, it } from 'vitest'
import { PFAD, bildschirmAusPfad, brauchtReise, startBildschirm } from './adressen'

describe('Adressen der Bildschirme', () => {
  it('heissen wie die Leiste', () => {
    expect(PFAD).toEqual({
      eingabe: '/eingabe',
      dashboard: '/uebersicht',
      navigation: '/weg',
      meldungen: '/meldungen',
      angekommen: '/angekommen',
    })
  })

  it('lesen sich in beide Richtungen', () => {
    for (const [b, p] of Object.entries(PFAD)) expect(bildschirmAusPfad(p)).toBe(b)
  })

  it('vertragen einen Schraegstrich am Ende', () => {
    expect(bildschirmAusPfad('/weg/')).toBe('navigation')
  })

  it('kennen / und Unbekanntes nicht', () => {
    expect(bildschirmAusPfad('/')).toBeNull()
    expect(bildschirmAusPfad('/dashboard')).toBeNull()
  })

  it('wissen, welche Bildschirme eine Reise brauchen', () => {
    expect(brauchtReise('eingabe')).toBe(false)
    for (const b of ['dashboard', 'navigation', 'meldungen', 'angekommen'] as const) {
      expect(brauchtReise(b)).toBe(true)
    }
  })

  it('starten auf der Adresse, wenn es die Reise dazu gibt, sonst auf der Eingabe', () => {
    expect(startBildschirm('/weg', true)).toBe('navigation')
    expect(startBildschirm('/weg', false)).toBe('eingabe')
    expect(startBildschirm('/', true)).toBe('eingabe')
    expect(startBildschirm('/irgendwas', true)).toBe('eingabe')
  })
})
```

- [ ] **Step 2:** `npx vitest run src/navigation/adressen.test.ts` → FAIL (Modul fehlt).
- [ ] **Step 3: Code**

```ts
import type { Bildschirm } from './bildschirme'

/**
 * Die Adresse jedes Bildschirms (Spec 2026-10-11 Seitenuebergaenge, §3).
 *
 * Wie die Leiste, nicht wie die Schluessel: Adressen sieht man, Schluessel
 * nicht. `dashboard` heisst in der Leiste „Übersicht", also `/uebersicht`.
 */
export const PFAD: Record<Bildschirm, string> = {
  eingabe: '/eingabe',
  dashboard: '/uebersicht',
  navigation: '/weg',
  meldungen: '/meldungen',
  angekommen: '/angekommen',
}

const NACH_PFAD = new Map<string, Bildschirm>(
  Object.entries(PFAD).map(([b, p]) => [p, b as Bildschirm]),
)

/** Der Bildschirm einer Adresse, oder `null` fuer `/` und Unbekanntes. */
export function bildschirmAusPfad(pfad: string): Bildschirm | null {
  const ohneSchraegstrich = pfad.length > 1 ? pfad.replace(/\/+$/, '') : pfad
  return NACH_PFAD.get(ohneSchraegstrich) ?? null
}

/** Alles ausser der Eingabe zeigt eine Reise - ohne sie gibt es nichts zu zeigen. */
export function brauchtReise(b: Bildschirm): boolean {
  return b !== 'eingabe'
}

/** Womit die App startet: die Adresse, wenn es die Reise dazu gibt, sonst die Eingabe. */
export function startBildschirm(pfad: string, hatReise: boolean): Bildschirm {
  const b = bildschirmAusPfad(pfad)
  if (!b) return 'eingabe'
  return brauchtReise(b) && !hatReise ? 'eingabe' : b
}
```

- [ ] **Step 4:** Test → PASS. **Step 5: Commit** `feat(frontend): Adressen der Bildschirme`

---

### Task 2: `navigation/uebergang.ts`

**Files:** Create `frontend/src/navigation/uebergang.ts`, Test `frontend/src/navigation/uebergang.test.ts`

**Interfaces – Produces:** `type Ausloeser = 'ablauf' | 'leiste' | 'verlauf'`; `type Uebergangsart = 'vor' | 'zurueck' | 'quer'`; `uebergangsart(von: Bildschirm, nach: Bildschirm, ausloeser: Ausloeser): Uebergangsart`; `mitUebergang(art: Uebergangsart, aendere: () => void, optionen?: { browserAnimiert?: boolean }): void`.

- [ ] **Step 1: Test**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mitUebergang, uebergangsart } from './uebergang'

describe('uebergangsart', () => {
  it('geht im Ablauf vorwaerts und rueckwaerts', () => {
    expect(uebergangsart('eingabe', 'dashboard', 'ablauf')).toBe('vor')
    expect(uebergangsart('dashboard', 'navigation', 'ablauf')).toBe('vor')
    expect(uebergangsart('navigation', 'angekommen', 'ablauf')).toBe('vor')
    expect(uebergangsart('angekommen', 'eingabe', 'ablauf')).toBe('zurueck')
    expect(uebergangsart('navigation', 'dashboard', 'verlauf')).toBe('zurueck')
    expect(uebergangsart('eingabe', 'navigation', 'verlauf')).toBe('vor')
  })

  it('blendet quer ueber die Leiste und bei den Meldungen', () => {
    expect(uebergangsart('dashboard', 'navigation', 'leiste')).toBe('quer')
    expect(uebergangsart('meldungen', 'dashboard', 'ablauf')).toBe('quer')
    expect(uebergangsart('dashboard', 'meldungen', 'verlauf')).toBe('quer')
  })
})

describe('mitUebergang', () => {
  const wurzel = document.documentElement
  afterEach(() => {
    Reflect.deleteProperty(document, 'startViewTransition')
    Reflect.deleteProperty(window, 'matchMedia')
    delete wurzel.dataset.uebergang
  })

  function stelleUebergangBereit(finished: Promise<unknown> = Promise.resolve()) {
    const arten: (string | undefined)[] = []
    const start = vi.fn((cb: () => void) => {
      arten.push(wurzel.dataset.uebergang)
      cb()
      return { finished, ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition() {} }
    })
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true })
    return { start, arten }
  }

  it('aendert sofort, wenn der Browser keine View Transitions kennt', () => {
    const aendere = vi.fn()
    mitUebergang('vor', aendere)
    expect(aendere).toHaveBeenCalledOnce()
    expect(wurzel.dataset.uebergang).toBeUndefined()
  })

  it('setzt die Art fuer das CSS und raeumt danach auf', async () => {
    const { start, arten } = stelleUebergangBereit()
    const aendere = vi.fn()
    mitUebergang('zurueck', aendere)
    expect(start).toHaveBeenCalledOnce()
    expect(arten).toEqual(['zurueck'])
    expect(aendere).toHaveBeenCalledOnce()
    await Promise.resolve()
    await Promise.resolve()
    expect(wurzel.dataset.uebergang).toBeUndefined()
  })

  it('raeumt auch auf, wenn der Uebergang abgelehnt wird', async () => {
    stelleUebergangBereit(Promise.reject(new Error('verdeckt')))
    mitUebergang('vor', vi.fn())
    await new Promise((r) => setTimeout(r, 0))
    expect(wurzel.dataset.uebergang).toBeUndefined()
  })

  it('bewegt nichts bei reduzierter Bewegung', () => {
    const { start } = stelleUebergangBereit()
    window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as unknown as typeof window.matchMedia
    const aendere = vi.fn()
    mitUebergang('vor', aendere)
    expect(start).not.toHaveBeenCalled()
    expect(aendere).toHaveBeenCalledOnce()
  })

  it('bewegt nichts, wenn der Browser schon selbst animiert', () => {
    const { start } = stelleUebergangBereit()
    const aendere = vi.fn()
    mitUebergang('zurueck', aendere, { browserAnimiert: true })
    expect(start).not.toHaveBeenCalled()
    expect(aendere).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2:** Test → FAIL (Modul fehlt).
- [ ] **Step 3: Code**

```ts
import { flushSync } from 'react-dom'
import type { Bildschirm } from './bildschirme'

/** Wer den Wechsel ausloest: ein Knopf im Ablauf, die Leiste, Zurueck/Vor. */
export type Ausloeser = 'ablauf' | 'leiste' | 'verlauf'
export type Uebergangsart = 'vor' | 'zurueck' | 'quer'

/** Die Reihenfolge des Ablaufs (DESIGN.md 6). `meldungen` liegt ausserhalb. */
const ABLAUF: Bildschirm[] = ['eingabe', 'dashboard', 'navigation', 'angekommen']

/**
 * Die Richtung sagt, wo man im Ablauf steht: weiter vorn oder zurueck. Ein
 * Sprung ueber die Leiste hat keine Reihenfolge, die Meldungen liegen
 * daneben - beides ist eine reine Querblende.
 */
export function uebergangsart(von: Bildschirm, nach: Bildschirm, ausloeser: Ausloeser): Uebergangsart {
  if (ausloeser === 'leiste') return 'quer'
  const a = ABLAUF.indexOf(von)
  const b = ABLAUF.indexOf(nach)
  if (a < 0 || b < 0) return 'quer'
  return b > a ? 'vor' : 'zurueck'
}

function ruhigGewuenscht(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Fuehrt den Wechsel aus - mit View Transition, wo es sie gibt und wo sie
 * erwuenscht ist, sonst sofort. Die Bewegung selbst steht in App.css und
 * liest die Art aus `data-uebergang` an <html>.
 */
export function mitUebergang(
  art: Uebergangsart,
  aendere: () => void,
  { browserAnimiert = false }: { browserAnimiert?: boolean } = {},
): void {
  if (typeof document.startViewTransition !== 'function' || ruhigGewuenscht() || browserAnimiert) {
    aendere()
    return
  }
  const wurzel = document.documentElement
  wurzel.dataset.uebergang = art
  const raeumeAuf = () => {
    delete wurzel.dataset.uebergang
  }
  try {
    // flushSync: Der neue Zustand muss im Rueckruf im DOM stehen, sonst
    // fotografiert der Browser zweimal dieselbe Seite.
    document.startViewTransition(() => flushSync(aendere)).finished.then(raeumeAuf, raeumeAuf)
  } catch {
    raeumeAuf()
    aendere()
  }
}
```

- [ ] **Step 4:** Test → PASS; `npm run lint` sauber. **Step 5: Commit** `feat(frontend): Richtung und View Transition der Seitenwechsel`

---

### Task 3: `sitzung/reisespeicher.ts`

**Files:** Create `frontend/src/sitzung/reisespeicher.ts`, Test `frontend/src/sitzung/reisespeicher.test.ts`

**Interfaces – Produces:** `interface Reise { werte: EingabeWerte; route: RouteErgebnis; variante: RoutenVariante; standort: Bahnsteigabschnitt; gehzeiten: Record<string, number>; meldungen: Meldung[]; versatz: number }`; `REISE_SCHLUESSEL = 'umstieg.reise'`; `REISE_HOECHSTALTER_MS = 6 * 3600 * 1000`; `liesReise(jetzt?: number): Reise | null`; `schreibeReise(reise: Reise, jetzt?: number): void`; `leereReise(): void`.

- [ ] **Step 1: Test**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { REISE_HOECHSTALTER_MS, REISE_SCHLUESSEL, leereReise, liesReise, schreibeReise, type Reise } from './reisespeicher'

const REISE: Reise = {
  werte: {
    eva: '8010205', bahnhofName: 'Leipzig Hbf', gleisAn: '6', gleisAb: '16', wagenAn: '', wagenAb: '',
    profil: 'normal', variante: 'schnellste', abschnitt: 'mitte',
  },
  route: { stufe: 1, schritte: [{ text: 'Über den Bahnhofskopf', typ: 'eben' }], gehzeitSek: 354, hinweise: [] },
  variante: 'schnellste',
  standort: 'mitte',
  gehzeiten: { 'schnellste|mitte': 354 },
  meldungen: [],
  versatz: 0,
}

describe('reisespeicher', () => {
  beforeEach(() => window.sessionStorage.clear())

  it('liest zurueck, was geschrieben wurde', () => {
    schreibeReise(REISE, 1000)
    expect(liesReise(2000)).toEqual(REISE)
  })

  it('verwirft eine Reise, die aelter als sechs Stunden ist', () => {
    schreibeReise(REISE, 0)
    expect(liesReise(REISE_HOECHSTALTER_MS)).toEqual(REISE)
    expect(liesReise(REISE_HOECHSTALTER_MS + 1)).toBeNull()
  })

  it('verwirft Kaputtes und fremde Fassungen', () => {
    window.sessionStorage.setItem(REISE_SCHLUESSEL, '{kaputt')
    expect(liesReise()).toBeNull()
    window.sessionStorage.setItem(REISE_SCHLUESSEL, JSON.stringify({ fassung: 99, gespeichertUm: Date.now(), reise: REISE }))
    expect(liesReise()).toBeNull()
    window.sessionStorage.setItem(REISE_SCHLUESSEL, JSON.stringify({ fassung: 1, gespeichertUm: Date.now(), reise: { werte: {} } }))
    expect(liesReise()).toBeNull()
  })

  it('loescht auf Wunsch', () => {
    schreibeReise(REISE)
    leereReise()
    expect(liesReise()).toBeNull()
  })

  it('faellt nicht um, wenn es keinen Sitzungsspeicher gibt', () => {
    const spion = vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
      throw new Error('gesperrt')
    })
    expect(() => schreibeReise(REISE)).not.toThrow()
    expect(liesReise()).toBeNull()
    spion.mockRestore()
  })

  it('fasst localStorage nicht an', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    schreibeReise(REISE)
    expect(setItem.mock.contexts.every((c) => c === window.sessionStorage)).toBe(true)
    setItem.mockRestore()
  })
})
```

- [ ] **Step 2:** Test → FAIL. **Step 3: Code** – gebaut wie `eingabespeicher.ts`:

```ts
import type { Bahnsteigabschnitt, RouteErgebnis, RoutenVariante } from '../api/typen'
import type { EingabeWerte } from '../components/Eingabe'
import type { Meldung } from '../meldungen/modell'

/**
 * Die laufende Reise, gesichert im Sitzungsspeicher dieses Tabs (Spec
 * 2026-10-11 Seitenuebergaenge, §4). Ein Neuladen - versehentlich, im Bahnhof
 * ohne Netz - verlor bisher die Route; neu rechnen ginge dort nicht.
 */
export interface Reise {
  werte: EingabeWerte
  route: RouteErgebnis
  variante: RoutenVariante
  standort: Bahnsteigabschnitt
  gehzeiten: Record<string, number>
  meldungen: Meldung[]
  /** Schritt auf der Wegseite. */
  versatz: number
}

export const REISE_SCHLUESSEL = 'umstieg.reise'
const FASSUNG = 1
/** Aelter verworfen: sonst landete man am naechsten Morgen auf der gestrigen Route. */
export const REISE_HOECHSTALTER_MS = 6 * 3600 * 1000

interface Ablage {
  fassung: number
  gespeichertUm: number
  reise: Reise
}

// Wie im Eingabespeicher: Schon der Zugriff kann werfen (Safari privat,
// gesperrte Site-Daten).
function speicher(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

const VARIANTEN = new Set(['schnellste', 'einfachste', 'barrierefrei', 'mit-stopp'])
const STANDORTE = new Set(['anfang', 'mitte', 'ende'])

/** Prueft die Form, nicht den Inhalt - wie `istEntwurf` im Eingabespeicher. */
function istReise(wert: unknown): wert is Reise {
  if (typeof wert !== 'object' || wert === null) return false
  const r = wert as Record<string, unknown>
  const werte = r.werte as Record<string, unknown> | null
  const route = r.route as Record<string, unknown> | null
  return (
    typeof werte === 'object' && werte !== null &&
    typeof werte.eva === 'string' && typeof werte.gleisAn === 'string' && typeof werte.gleisAb === 'string' &&
    typeof route === 'object' && route !== null &&
    Array.isArray(route.schritte) && typeof route.gehzeitSek === 'number' &&
    VARIANTEN.has(r.variante as string) && STANDORTE.has(r.standort as string) &&
    typeof r.gehzeiten === 'object' && r.gehzeiten !== null &&
    Array.isArray(r.meldungen) && typeof r.versatz === 'number'
  )
}

export function liesReise(jetzt: number = Date.now()): Reise | null {
  const s = speicher()
  if (!s) return null
  try {
    const roh = s.getItem(REISE_SCHLUESSEL)
    if (!roh) return null
    const abgelegt = JSON.parse(roh) as Partial<Ablage> | null
    if (!abgelegt || abgelegt.fassung !== FASSUNG || typeof abgelegt.gespeichertUm !== 'number') return null
    if (jetzt - abgelegt.gespeichertUm > REISE_HOECHSTALTER_MS) return null
    return istReise(abgelegt.reise) ? abgelegt.reise : null
  } catch {
    return null
  }
}

export function schreibeReise(reise: Reise, jetzt: number = Date.now()): void {
  const s = speicher()
  if (!s) return
  try {
    s.setItem(REISE_SCHLUESSEL, JSON.stringify({ fassung: FASSUNG, gespeichertUm: jetzt, reise } satisfies Ablage))
  } catch {
    // Voll oder gesperrt: Die Reise laeuft weiter, sie ueberlebt nur kein Neuladen.
  }
}

export function leereReise(): void {
  try {
    speicher()?.removeItem(REISE_SCHLUESSEL)
  } catch {
    // Nichts zu tun - ohne Speicher gibt es auch nichts zu loeschen.
  }
}
```

- [ ] **Step 4:** Test → PASS. **Step 5: Commit** `feat(frontend): Reise im Sitzungsspeicher sichern`

---

### Task 4: `App.tsx` – Adressen, Verlauf, Reise

**Files:** Modify `frontend/src/App.tsx`, Test `frontend/src/App.test.tsx`

**Interfaces – Consumes:** Task 1 (`PFAD`, `bildschirmAusPfad`, `brauchtReise`, `startBildschirm`), Task 3 (`liesReise`, `schreibeReise`, `leereReise`, `Reise`).

- [ ] **Step 1: Tests** – in `App.test.tsx`: im `beforeEach` zusätzlich `window.history.replaceState(null, '', '/')`; Import `schreibeReise`, `REISE_SCHLUESSEL` aus `./sitzung/reisespeicher`. Neuer Block:

```tsx
/** Spec 2026-10-11 Seitenuebergaenge, §3/§4. */
describe('App: Adressen, Zurueck-Taste und Neuladen', () => {
  it('beginnt auf /eingabe und berichtigt /', () => {
    render(<App />)
    expect(window.location.pathname).toBe('/eingabe')
  })

  it('traegt nach „Umstieg starten" /uebersicht in den Verlauf ein', async () => {
    await bisZumDashboard()
    expect(window.location.pathname).toBe('/uebersicht')
  })

  it('geht mit der Zurueck-Taste zur Eingabe', async () => {
    await bisZumDashboard()
    act(() => window.history.back())
    expect(await screen.findByLabelText('Umstiegsbahnhof')).toBeDefined()
    expect(window.location.pathname).toBe('/eingabe')
  })

  it('laesst den Bildschirm stehen, wenn nur der Hash wechselt', async () => {
    await bisZumDashboard()
    act(() => {
      window.history.pushState(null, '', '/uebersicht#impressum')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(window.location.pathname).toBe('/uebersicht')
  })

  it('stellt nach dem Neuladen auf /weg den Weg wieder her', () => {
    const fall = antwort({ eva: '8010205', gleisAn: '6', gleisAb: '16', profil: 'normal', variante: 'schnellste', abschnitt: 'mitte' })
    schreibeReise({
      werte: { eva: '8010205', bahnhofName: 'Leipzig Hbf', gleisAn: '6', gleisAb: '16', wagenAn: '', wagenAb: '', profil: 'normal', variante: 'schnellste', abschnitt: 'mitte' },
      route: fall, variante: 'schnellste', standort: 'mitte', gehzeiten: { 'schnellste|mitte': fall.gehzeitSek }, meldungen: [], versatz: 0,
    })
    window.history.replaceState(null, '', '/weg')
    render(<App />)
    expect(screen.getAllByText('Über den Bahnhofskopf').length).toBeGreaterThan(0)
    expect(window.location.pathname).toBe('/weg')
  })

  it('zeigt ohne gesicherte Reise auf /weg die Eingabe und berichtigt die Adresse', () => {
    window.history.replaceState(null, '', '/weg')
    render(<App />)
    expect(screen.getByLabelText('Umstiegsbahnhof')).toBeDefined()
    expect(window.location.pathname).toBe('/eingabe')
  })

  it('sichert die Reise auf der Uebersicht und loescht sie mit „Angekommen"', async () => {
    await bisZumDashboard()
    expect(window.sessionStorage.getItem(REISE_SCHLUESSEL)).not.toBeNull()
    await userEvent.click(screen.getByRole('button', { name: /Navigation starten/ }))
    await userEvent.click(await screen.findByRole('button', { name: /Angekommen/ }))
    expect(await screen.findByText(/Du bist da/)).toBeDefined()
    expect(window.sessionStorage.getItem(REISE_SCHLUESSEL)).toBeNull()
  })
})
```

(`antwort(p)` ist die vorhandene Testhilfe; `RouteParameter` erlaubt die gezeigten Felder.)

- [ ] **Step 2:** `npx vitest run src/App.test.tsx` → die neuen FAIL.
- [ ] **Step 3: Code** in `App.tsx`:
  1. Imports: `PFAD, bildschirmAusPfad, brauchtReise, startBildschirm` aus `./navigation/adressen`; `leereReise, liesReise, schreibeReise` aus `./sitzung/reisespeicher`.
  2. Am Anfang von `App()`:

```ts
  // Startzustand EINMAL aus Adresse und gesicherter Reise (Spec 2026-10-11
  // Seitenuebergaenge, §3/§4): Ein Neuladen auf /weg zeigt wieder den Weg.
  const [start] = useState(() => {
    const reise = liesReise()
    return { reise, bildschirm: startBildschirm(window.location.pathname, reise !== null) }
  })
```

  und die Anfangswerte: `bildschirm` ← `start.bildschirm`; `meldungen` ← `start.reise?.meldungen ?? []`; `route` ← `start.reise?.route ?? null`; `gehzeiten` und `gehzeitenRef` ← `start.reise?.gehzeiten ?? {}`; `gewaehlteVariante` ← `start.reise?.variante ?? 'schnellste'`; `gewaehlterStandort` ← `start.reise?.standort ?? STANDORT_VOREINSTELLUNG`; `werte` ← `start.reise?.werte ?? null`; `versatz` ← `start.reise?.versatz ?? 0`.
  3. Adressabgleich (nach `setBildschirm`):

```ts
  // Die Adresse folgt dem Bildschirm: beim ersten Mal ersetzt (aus / wird
  // /eingabe), danach ein neuer Eintrag je Wechsel. Kam der Wechsel von der
  // Zurueck-Taste, stimmt die Adresse schon - dann geschieht nichts.
  const ersteAdresse = useRef(true)
  useEffect(() => {
    const soll = PFAD[bildschirm]
    if (window.location.pathname !== soll) {
      if (ersteAdresse.current) {
        window.history.replaceState({ bildschirm }, '', soll + window.location.hash)
      } else {
        window.history.pushState({ bildschirm }, '', soll)
      }
    }
    ersteAdresse.current = false
  }, [bildschirm])
```

  4. `popstate` (nach der Deklaration von `routeRef`):

```ts
  // Zurueck/Vor: Der Bildschirm kommt aus der Adresse. Ein reiner Hash-Wechsel
  // (Rechtsseiten) bringt denselben Bildschirm - dann aendert sich nichts.
  useEffect(() => {
    const beiZurueck = () => {
      const ziel = bildschirmAusPfad(window.location.pathname) ?? 'eingabe'
      if (brauchtReise(ziel) && !routeRef.current) {
        window.history.replaceState({ bildschirm: 'eingabe' }, '', PFAD.eingabe + window.location.hash)
        setBildschirm('eingabe')
        return
      }
      setBildschirm(ziel)
    }
    window.addEventListener('popstate', beiZurueck)
    return () => window.removeEventListener('popstate', beiZurueck)
  }, [setBildschirm])
```

  `routeRef` muss mit `start.reise?.route ?? null` beginnen.
  5. Reise sichern (nach den Zuständen):

```ts
  // Gesichert wird nur auf den Reise-Bildschirmen - nach „Angekommen" schriebe
  // schon das Leeren der Meldungen die eben geloeschte Reise zurueck.
  useEffect(() => {
    if (!AUF_REISE.includes(bildschirm) || !route || !werte) return
    schreibeReise({ werte, route, variante: gewaehlteVariante, standort: gewaehlterStandort, gehzeiten, meldungen, versatz })
  }, [bildschirm, route, werte, gewaehlteVariante, gewaehlterStandort, gehzeiten, meldungen, versatz])
```

  6. In `bestaetigeAnkunft()` direkt nach `leereEntwurf()`: `leereReise()` mit Kommentar „Dieselbe Zusage wie beim Entwurf (Datenschutzerklaerung)".
- [ ] **Step 4:** `npx vitest run src/App.test.tsx src/Kopf.test.tsx` → PASS; `npm test`, `npm run lint` → grün.
- [ ] **Step 5: Commit** `feat(frontend): Adressen, Zurueck-Taste und gesicherte Reise`

---

### Task 5: Übergänge anschließen

**Files:** Modify `frontend/src/App.tsx`, `frontend/src/App.css`; Test `frontend/src/App.test.tsx`, Create `frontend/src/seitenwechsel-css.test.ts`

**Interfaces – Consumes:** Task 2 (`mitUebergang`, `uebergangsart`, `Ausloeser`).

- [ ] **Step 1: Tests** – `App.test.tsx`, neuer Block:

```tsx
/** Spec 2026-10-11 Seitenuebergaenge, §5. */
describe('App: Seitenwechsel bewegen sich gerichtet', () => {
  let arten: (string | undefined)[]
  beforeEach(() => {
    arten = []
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: (cb: () => void) => {
        arten.push(document.documentElement.dataset.uebergang)
        cb()
        return { finished: Promise.resolve(), ready: Promise.resolve(), updateCallbackDone: Promise.resolve(), skipTransition() {} }
      },
    })
  })
  afterEach(() => Reflect.deleteProperty(document, 'startViewTransition'))

  it('geht mit „Navigation starten" vorwaerts', async () => {
    await bisZumDashboard()
    arten.length = 0
    await userEvent.click(screen.getByRole('button', { name: /Navigation starten/ }))
    expect(arten).toEqual(['vor'])
  })

  it('blendet ueber die Leiste quer', async () => {
    await bisZumDashboard()
    arten.length = 0
    await userEvent.click(screen.getByRole('button', { name: 'Weg' }))
    expect(arten).toEqual(['quer'])
  })
})
```

(`afterEach` zum vitest-Import hinzufügen.)

`seitenwechsel-css.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bloeckeAb, cssVon, deklarationenVon } from './testhilfen/css'

/** Spec 2026-10-11 Seitenuebergaenge, §5 - die Bewegung steht im CSS. */
const css = cssVon('App.css')

describe('App.css: Seitenwechsel', () => {
  it('schiebt vorwaerts von rechts herein, ueber die Token', () => {
    expect(deklarationenVon(css, "html[data-uebergang='vor']::view-transition-new(root)")).toContain(
      'animation: seite-herein-rechts var(--dauer-ruhig) var(--verlauf-ein) both',
    )
    expect(bloeckeAb(css, '@keyframes seite-herein-rechts').join(' ')).toMatch(/translateX\(24px\)/)
  })

  it('spiegelt rueckwaerts', () => {
    expect(deklarationenVon(css, "html[data-uebergang='zurueck']::view-transition-new(root)")).toContain(
      'animation: seite-herein-links var(--dauer-ruhig) var(--verlauf-ein) both',
    )
    expect(bloeckeAb(css, '@keyframes seite-herein-links').join(' ')).toMatch(/translateX\(-24px\)/)
  })

  it('blendet sonst quer in --dauer-normal', () => {
    expect(deklarationenVon(css, '::view-transition-old(root), ::view-transition-new(root)').length).toBe(0)
    expect(deklarationenVon(css, '::view-transition-new(root)')).toContain('animation-duration: var(--dauer-normal)')
  })

  it('haelt die Leiste still', () => {
    expect(deklarationenVon(css, '.navileiste')).toContain('view-transition-name: navileiste')
  })

  it('schaltet bei reduzierter Bewegung ab', () => {
    const block = bloeckeAb(css, '@media (prefers-reduced-motion: reduce)').join(' ').replace(/\s+/g, ' ')
    expect(block).toMatch(/::view-transition-group\(\*\), ::view-transition-old\(\*\), ::view-transition-new\(\*\) \{ animation: none !important; \}/)
  })
})
```

- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3: Code**
  1. `App.tsx`: Import `mitUebergang, uebergangsart, type Ausloeser` aus `./navigation/uebergang`. `setBildschirm` wird:

```ts
  // Der Bildschirm, von dem aus gewechselt wird - fuer die Richtung. Als Ref,
  // damit `setBildschirm` stabil bleibt (Abhaengigkeit vieler Rueckrufe).
  const bildschirmRef = useRef<Bildschirm>(start.bildschirm)
  const setBildschirm = useCallback(
    (naechster: Bildschirm, ausloeser: Ausloeser = 'ablauf', browserAnimiert = false) => {
      const von = bildschirmRef.current
      bildschirmRef.current = naechster
      const wechsle = () => {
        setJetzt(Date.now())
        if (naechster === 'meldungen') setMeldungen(alleGelesen)
        setzeBildschirmRoh(naechster)
      }
      if (von === naechster) {
        wechsle()
        return
      }
      mitUebergang(uebergangsart(von, naechster, ausloeser), wechsle, { browserAnimiert })
    },
    [],
  )
```

  2. Im `popstate`-Lauscher: `(e: PopStateEvent)`; `const browserAnimiert = (e as PopStateEvent & { hasUAVisualTransition?: boolean }).hasUAVisualTransition === true`; beide Aufrufe `setBildschirm(..., 'verlauf', browserAnimiert)`.
  3. Alle fünf `<Navileiste … onWechsel={setBildschirm} />` → `onWechsel={(b) => setBildschirm(b, 'leiste')}`.
  4. `App.css` am Ende:

```css
/*
 * Seitenwechsel (Spec 2026-10-11 Seitenuebergaenge, DESIGN.md 6): vorwaerts
 * im Ablauf kommt die neue Seite von rechts, rueckwaerts gespiegelt, sonst
 * eine Querblende. Die Art setzt `navigation/uebergang.ts` als
 * `data-uebergang` an <html>. Leiste, Stoermeldung und Echtzeit-Banner haben
 * eigene Namen und stehen deshalb still - nur die Seite bewegt sich.
 */
.navileiste {
  view-transition-name: navileiste;
}
.stoermeldung {
  view-transition-name: stoermeldung;
}
.quelle-weg {
  view-transition-name: quelle-weg;
}
::view-transition-old(root) {
  animation-duration: var(--dauer-normal);
}
::view-transition-new(root) {
  animation-duration: var(--dauer-normal);
}
html[data-uebergang='vor']::view-transition-new(root) {
  animation: seite-herein-rechts var(--dauer-ruhig) var(--verlauf-ein) both;
}
html[data-uebergang='vor']::view-transition-old(root) {
  animation: seite-hinaus-links var(--dauer-ruhig) var(--verlauf-aus) both;
}
html[data-uebergang='zurueck']::view-transition-new(root) {
  animation: seite-herein-links var(--dauer-ruhig) var(--verlauf-ein) both;
}
html[data-uebergang='zurueck']::view-transition-old(root) {
  animation: seite-hinaus-rechts var(--dauer-ruhig) var(--verlauf-aus) both;
}
@keyframes seite-herein-rechts {
  from {
    transform: translateX(24px);
    opacity: 0;
  }
}
@keyframes seite-hinaus-links {
  to {
    transform: translateX(-12px);
    opacity: 0;
  }
}
@keyframes seite-herein-links {
  from {
    transform: translateX(-24px);
    opacity: 0;
  }
}
@keyframes seite-hinaus-rechts {
  to {
    transform: translateX(12px);
    opacity: 0;
  }
}
```

  und im Block `@media (prefers-reduced-motion: reduce)`:

```css
  /* Seitenwechsel: keine Bewegung, auch wenn ein Browser den Uebergang doch
     startet (navigation/uebergang.ts ueberspringt ihn schon). */
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
```

- [ ] **Step 4:** Tests → PASS; `npm test`, `npm run lint`, `npm run build` → grün.
- [ ] **Step 5: Commit** `feat(frontend): Seitenwechsel bewegen sich gerichtet`

---

### Task 6: Datenschutzerklärung

**Files:** Modify `frontend/src/components/Datenschutz.tsx`, Test `frontend/src/components/Datenschutz.test.tsx`

- [ ] **Step 1: Tests** – im bestehenden `describe` ergänzen:

```tsx
  it('nennt Route und Meldungen der Reise im Sitzungsspeicher', () => {
    zeige()
    expect(screen.getByText(/berechnete Route und die Meldungen dieser Reise/)).toBeDefined()
  })

  it('sagt, dass die gemessene Adresse nur den Bildschirm nennt', () => {
    zeige()
    expect(screen.getByText(/nennt nur den Bildschirm/)).toBeDefined()
  })
```

(`zeige` ist die vorhandene Hilfe der Datei; heißt sie anders, die vorhandene nehmen.)

- [ ] **Step 2:** FAIL. **Step 3:** Im Absatz „Deine Eingabe im Browser" nach dem ersten Satz: „Ebenso die berechnete Route und die Meldungen dieser Reise – damit ein Neuladen, etwa im Bahnhof ohne Netz, den Weg nicht verliert." Im Absatz „Was übermittelt wird" nach „die aufgerufene Adresse": „– sie nennt nur den Bildschirm (etwa `/weg`), nie einen Bahnhof oder ein Gleis –". Kommentar oben um `sitzung/reisespeicher.ts` ergänzen.
- [ ] **Step 4:** PASS. **Step 5: Commit** `docs(frontend): Datenschutzerklaerung nennt gesicherte Reise und Bildschirmadressen`

---

### Task 7: Sichtprüfung, Doku

- [ ] **Step 1: Browser** (lokaler Server; Rahmen gleicher Herkunft und ein echter Tab): Ablauf Eingabe → Übersicht → Weg → Angekommen; Adresse je Schritt; Zurück-Taste zweimal; Neuladen auf `/weg` (Weg steht wieder); Leiste; `data-uebergang` während eines Wechsels per `document.startViewTransition`-Hülle protokolliert; Desktop und 360 px; hell und dunkel.
- [ ] **Step 2: Doku:** README „Hier weitermachen" (Ergebnis, Messungen, nicht Geprüftes), `BRIEF.md` §11 (Zeile Seitenübergänge), `DESIGN.md` §6 (Hinweis: umgesetzt).
- [ ] **Step 3:** `npm test && npm run lint && npm run build` → grün.
- [ ] **Step 4: Commit** `docs: Seitenuebergaenge im README, BRIEF.md und DESIGN.md`
