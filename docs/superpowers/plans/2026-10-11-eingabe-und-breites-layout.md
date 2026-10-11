# Eingabe neu und breites Layout – Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Eingabe trägt nur noch Bahnhof und zwei Gleiskacheln (Züge/Wagen eingeklappt), und ab 700 px Breite stehen Ankunfts- und Abfahrtstafel offen daneben und klappen auf eine Bahnhofswahl hin nach rechts auf.

**Architecture:** Alles im Frontend. `Zugauswahl` bekommt einen Modus `immerOffen`, `tafelauswahl.ts` ein langes Zeitfenster, ein Hook `useBreitesLayout` sagt `Eingabe`, ob der breite Aufbau gilt. Das Raster (Formular · Ankunft · Abfahrt · Knopf) legt CSS über `grid-template-areas` je Breakpoint fest; die Animation ist ein CSS-Übergang mit `@starting-style`.

**Tech Stack:** React 19, TypeScript strict, Vite, Vitest + jsdom + Testing Library, oxlint, CSS ohne Framework (`frontend/src/App.css`, Token in `frontend/src/index.css`).

**Spec:** `docs/superpowers/specs/2026-10-11-eingabe-und-breites-layout-design.md`

## Global Constraints

- Alle Befehle im Ordner `frontend/`: `npm test`, `npm run lint` (oxlint + `tsc -b --noEmit`), `npm run build`.
- Schriftgrößen nur aus der Staffel: `--schrift-gleis` (56 px), `--schrift-titel` (28), `--schrift-anweisung` (22), `--schrift-text` (18), `--schrift-label` (15).
- Rundung nur `--radius-klein` (14), `--radius-mittel` (20), `--radius-gross` (28), `--radius-pille`.
- Übergänge nur mit `--dauer-schnell|normal|ruhig` und `--verlauf-ein|aus` (prüft `src/bewegung-css.test.ts`); `:hover` nur in `@media (hover: hover)`.
- Schrift nie in `--color-neutral-500/600` (prüft `src/schriftfarben.test.ts`); Nebentext in `--color-neutral-700`.
- Klassen deutsch, keine neue Komponente (DESIGN.md §8). Zugängliche Feldnamen bleiben „Umstiegsbahnhof", „Ankunft: Gleis", „Anschluss: Gleis", „Ankunft: Wagen (optional)", „Anschluss: Wagen (optional)".
- Breakpoints: `BREIT_AB_PX = 700` (breiter Aufbau, Tafeln offen), 900 px (drei Spalten).
- Kein Backend, kein Stitch.
- Kommentare im Code deutsch, ohne Umlaute wie im Bestand (`ae`, `oe`, `ue`, `ss`); sichtbare Texte mit Umlauten.
- Commits enden mit `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Bahnhof wechselt, während eine Tafel lädt** → die späte Antwort des alten Bahnhofs darf die neue Tafel nicht überschreiben (Test in Task 2).
- **Ohne DB-Zugang im breiten Layout** → keine Tafel, Platzhalter nennt den Grund, Gleise bleiben tippbar (Test in Task 5).
- **Standorterkennung setzt den Bahnhof verzögert** → Tafeln stehen ohne Bewegung (Test in Task 6).
- **Zugeklappte Tafel** → nicht bedienbar und für Vorleser verborgen (`inert`), Platzhalter wieder sichtbar (Test in Task 6).
- **Reduzierte Bewegung** → auch die 120-ms-Verzögerung der Abfahrtstafel fällt weg (CSS-Test in Task 6).

---

### Task 1: Tafelfenster bis Ende der nächsten Stunde

**Files:**
- Modify: `frontend/src/api/tafelauswahl.ts`
- Test: `frontend/src/api/tafelauswahl.test.ts`

**Interfaces:**
- Produces: `endeNaechsteStunde(jetzt: Date): Date`; `gruppiereTafel(eintraege: TafelEintrag[], jetzt: Date, bis?: Date): Kategorieblock[]` (ohne `bis` wie bisher −5/+45).

- [ ] **Step 1: Failing tests** – an `tafelauswahl.test.ts` anhängen, Import um `endeNaechsteStunde` erweitern:

```ts
describe('endeNaechsteStunde', () => {
  it('reicht bis zum Ende der naechsten vollen Stunde', () => {
    expect(endeNaechsteStunde(um('14:20'))).toEqual(um('16:00'))
    expect(endeNaechsteStunde(um('14:00'))).toEqual(um('16:00'))
  })

  it('geht ueber Mitternacht in den Folgetag', () => {
    expect(endeNaechsteStunde(new Date('2026-09-01T23:40:00'))).toEqual(
      new Date('2026-09-02T01:00:00'),
    )
  })
})

/**
 * Im breiten Layout plant man im Zug vorab (Spec 2026-10-11). Wer eine Stunde
 * vor der Ankunft sucht, fand seinen Zug im Fenster -5/+45 nicht.
 */
describe('gruppiereTafel: langes Fenster', () => {
  it('nimmt mit Fensterende auch Zuege nach 45 Minuten mit', () => {
    const jetzt = um('14:20')
    const eintraege = [zug('RE 1', '15:50'), zug('RE 2', '16:01')]
    const namen = (bis?: Date) =>
      gruppiereTafel(eintraege, jetzt, bis).flatMap((b) => b.eintraege.map((e) => e.zug))
    expect(namen()).toEqual([])
    expect(namen(endeNaechsteStunde(jetzt))).toEqual(['RE 1'])
  })
})
```

- [ ] **Step 2:** `npx vitest run src/api/tafelauswahl.test.ts` → FAIL („endeNaechsteStunde is not a function").
- [ ] **Step 3: Implementation** in `tafelauswahl.ts`: unter `FENSTER_NACH_MIN` einfügen:

```ts
/**
 * Ende der NAECHSTEN vollen Stunde: 14:20 -> 16:00.
 *
 * So weit reicht, was das Backend ohnehin holt - die laufende und die
 * naechste Stunde (`backend/src/clients/timetables.ts`). Im breiten Layout
 * plant man im Zug vorab; dort reicht das kurze Fenster nicht.
 */
export function endeNaechsteStunde(jetzt: Date): Date {
  const ende = new Date(jetzt)
  ende.setHours(jetzt.getHours() + 2, 0, 0, 0)
  return ende
}
```

und `gruppiereTafel` ändern:

```ts
export function gruppiereTafel(
  eintraege: TafelEintrag[],
  jetzt: Date,
  /** Fensterende; ohne Angabe die 45 Minuten des Handys. */
  bis?: Date,
): Kategorieblock[] {
  const jetztMinuten = jetzt.getHours() * 60 + jetzt.getMinutes()
  const nachMin = bis ? Math.round((bis.getTime() - jetzt.getTime()) / 60_000) : FENSTER_NACH_MIN
```

und in der Schleife `abstand > FENSTER_NACH_MIN` durch `abstand > nachMin` ersetzen.

- [ ] **Step 4:** `npx vitest run src/api/tafelauswahl.test.ts` → PASS.
- [ ] **Step 5: Commit** `feat(frontend): Tafelfenster bis Ende der naechsten Stunde`

---

### Task 2: `Zugauswahl` im Modus `immerOffen`

**Files:**
- Modify: `frontend/src/components/Zugauswahl.tsx`
- Modify: `frontend/src/App.css` (Klassen `zugauswahl offen`, `tafel-spalte-kopf`, `tafel-spalte-titel`, `tafel-stand`, `tafel-skelett`, markierte Zeile)
- Test: `frontend/src/components/Zugauswahl.test.tsx`

**Interfaces:**
- Consumes: `endeNaechsteStunde`, `gruppiereTafel(…, bis)` aus Task 1.
- Produces: Prop `immerOffen?: boolean` an `Zugauswahl`; im Modus ist `label` der Spaltentitel (z. B. „Ankunft · Berlin Hbf"). Markierte Zeile: `<button aria-pressed="true">`. Laden: `role="status"` mit Namen „Tafel wird geladen".

- [ ] **Step 1: Failing tests** – an `Zugauswahl.test.tsx` anhängen:

```tsx
describe('Zugauswahl: immer offen (breites Layout)', () => {
  beforeEach(() => {
    holeTafelMock.mockReset()
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [ICE] })
  })

  function zeigeOffen(auswahl: TafelEintrag | null = null, onAuswahl = vi.fn()) {
    const r = render(
      <Zugauswahl
        eva="8011160"
        typ="dep"
        label="Abfahrt · Berlin Hbf"
        auswahl={auswahl}
        onAuswahl={onAuswahl}
        immerOffen
      />,
    )
    return { ...r, onAuswahl }
  }

  it('laedt ohne Klick und hat keinen Knopf zum Aufklappen', async () => {
    zeigeOffen()
    expect(document.querySelector('[aria-expanded]')).toBeNull()
    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'dep')
    expect(await screen.findByText(/ICE 1006/)).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Abfahrt · Berlin Hbf' })).toBeDefined()
  })

  it('zeigt beim Laden Skelettzeilen statt eines Satzes', () => {
    holeTafelMock.mockReturnValue(new Promise(() => {}))
    zeigeOffen()
    expect(screen.getByRole('status', { name: 'Tafel wird geladen' })).toBeDefined()
    expect(screen.queryByText(/Tafel wird geladen …/)).toBeNull()
  })

  it('reicht weiter als 45 Minuten', async () => {
    // 55 Minuten: ausserhalb des kurzen Fensters, aber immer vor dem Ende
    // der naechsten Stunde (das liegt mindestens 60 Minuten voraus).
    holeTafelMock.mockResolvedValue({ ok: true, eintraege: [zug('RE 9', 55)] })
    zeigeOffen()
    expect(await screen.findByText(/RE 9/)).toBeDefined()
  })

  it('markiert den gewaehlten Zug und laesst die Tafel stehen', async () => {
    zeigeOffen(ICE)
    const zeile = await screen.findByRole('button', { name: /ICE 1006/ })
    expect(zeile.getAttribute('aria-pressed')).toBe('true')
    expect(screen.queryByRole('button', { name: 'Ändern' })).toBeNull()
  })

  it('hebt die Wahl mit einem zweiten Tipp auf', async () => {
    const { onAuswahl } = zeigeOffen(ICE)
    await userEvent.click(await screen.findByRole('button', { name: /ICE 1006/ }))
    expect(onAuswahl).toHaveBeenCalledWith(null)
  })

  it('laedt neu, wenn der Bahnhof wechselt, und verwirft die alte Antwort', async () => {
    let loese!: (wert: Awaited<ReturnType<typeof holeTafel>>) => void
    holeTafelMock.mockReturnValueOnce(new Promise((r) => (loese = r)))
    holeTafelMock.mockResolvedValueOnce({ ok: true, eintraege: [zug('RE 7', 10)] })
    const { rerender } = zeigeOffen()
    rerender(
      <Zugauswahl
        eva="8000105"
        typ="dep"
        label="Abfahrt · Frankfurt"
        auswahl={null}
        onAuswahl={vi.fn()}
        immerOffen
      />,
    )
    expect(await screen.findByText(/RE 7/)).toBeDefined()
    loese({ ok: true, eintraege: [ICE] })
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/ICE 1006/)).toBeNull()
  })
})
```

- [ ] **Step 2:** `npx vitest run src/components/Zugauswahl.test.tsx` → die neuen 6 FAIL.
- [ ] **Step 3: Implementation** in `Zugauswahl.tsx`:
  1. Import ergänzen: `import { useEffect, useState } from 'react'` und `import { FENSTER_NACH_MIN, endeNaechsteStunde, gruppiereTafel, type Kategorieblock } from '../api/tafelauswahl'`.
  2. Prop `immerOffen?: boolean` in `ZugauswahlProps` mit Kommentar „Breites Layout (Spec 2026-10-11): kein Knopf, laedt sofort, reicht bis Ende der naechsten Stunde, bleibt nach der Wahl stehen".
  3. Fehlertext als Funktion herausziehen und in `klappeUm` verwenden:

```ts
function fehlertext(fehler: string): string {
  return fehler === 'db-zugang-fehlt'
    ? 'Live-Tafel nicht verfügbar (kein DB-Zugang) – Gleis bitte manuell eingeben.'
    : 'Live-Tafel derzeit nicht erreichbar.'
}

/** "14:05" aus einem Zeitpunkt. */
function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Dieselbe Fahrt: Zugname und Sollzeit - so findet auch ein importierter Zug seine Zeile. */
function istAuswahl(eintrag: TafelEintrag, auswahl: TafelEintrag | null): boolean {
  return auswahl !== null && auswahl.zug === eintrag.zug && auswahl.zeitSoll === eintrag.zeitSoll
}
```

  4. Die Bloecke-Darstellung (das bisherige `<div className="tafel-bloecke">…</div>`) in eine dateilokale Funktion `TafelBloecke({ bloecke, typ, auswahl, markiere, onTipp })` verschieben; im Zeilen-`<button>` zusätzlich `aria-pressed={markiere ? istAuswahl(eintrag, auswahl) : undefined}` und `onClick={() => onTipp(eintrag)}`. Der bisherige Modus ruft sie mit `markiere={false}` und `onTipp={onAuswahl}`.
  5. Zustand und Effekt für den offenen Modus (Zustand nur im Rückruf, nie synchron im Effekt):

```ts
interface OffenerStand {
  eva: string
  geholtUm: Date
  eintraege: TafelEintrag[] | null
  fehler: string | null
}
// in der Komponente:
const [stand, setStand] = useState<OffenerStand | null>(null)
useEffect(() => {
  if (!immerOffen) return
  // Eine spaete Antwort fuer einen inzwischen verlassenen Bahnhof wird
  // verworfen - sonst stuenden fremde Zuege unter dem neuen Titel.
  let gueltig = true
  const geholtUm = new Date()
  holeTafel(eva, typ)
    .then((ergebnis) => {
      if (!gueltig) return
      setStand(
        ergebnis.ok
          ? { eva, geholtUm, eintraege: ergebnis.eintraege, fehler: null }
          : { eva, geholtUm, eintraege: null, fehler: fehlertext(ergebnis.fehler) },
      )
    })
    .catch(() => {
      if (gueltig) setStand({ eva, geholtUm, eintraege: null, fehler: fehlertext('') })
    })
  return () => {
    gueltig = false
  }
}, [immerOffen, eva, typ])
```

  6. Vor dem bisherigen `if (auswahl)` den offenen Modus rendern:

```tsx
if (immerOffen) {
  // Abgeleitet: Ein Stand fuer eine andere EVA ist keiner.
  const aktuell = stand?.eva === eva ? stand : null
  const bis = aktuell ? endeNaechsteStunde(aktuell.geholtUm) : null
  const offeneBloecke =
    aktuell?.eintraege && bis ? gruppiereTafel(aktuell.eintraege, aktuell.geholtUm, bis) : []
  return (
    <div className="zugauswahl offen">
      <div className="tafel-spalte-kopf">
        <h3 className="tafel-spalte-titel">{label}</h3>
        {aktuell && <span className="tafel-stand">Stand {hhmm(aktuell.geholtUm)}</span>}
      </div>
      {!aktuell && (
        // Skelett statt Satz (DESIGN.md 4) - ohne Bewegung.
        <div className="tafel-skelett" role="status" aria-label="Tafel wird geladen">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} />
          ))}
        </div>
      )}
      {aktuell?.fehler && <div className="hinweis-box">{aktuell.fehler}</div>}
      {aktuell?.eintraege && bis && offeneBloecke.length === 0 && (
        <div className="hinweis-box">Keine Züge bis {hhmm(bis)}.</div>
      )}
      {offeneBloecke.length > 0 && (
        <TafelBloecke
          bloecke={offeneBloecke}
          typ={typ}
          auswahl={auswahl}
          markiere
          onTipp={(e) => onAuswahl(istAuswahl(e, auswahl) ? null : e)}
        />
      )}
    </div>
  )
}
```

  7. `App.css`, hinter dem Block `.tafel button` einfügen:

```css
/*
 * Die offene Tafel im breiten Layout (Spec 2026-10-11): Kopf mit Titel und
 * Stand, darunter die Kategorien, die als Ganzes rollen. Die Kappung je
 * Kategorie (216 px) bleibt dem Handy - in einer bildschirmhohen Spalte
 * schnitte sie nur ab.
 */
.zugauswahl.offen {
  height: 100%;
  min-height: 0;
  gap: 0;
}
.zugauswahl.offen > .tafel-bloecke {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 0;
  border-radius: 0;
}
.zugauswahl.offen .tafel {
  max-height: none;
  overflow: visible;
}
.zugauswahl.offen > .hinweis-box {
  margin: 0 14px 14px;
}
.tafel-spalte-kopf {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 14px 8px;
}
.tafel-spalte-titel {
  margin: 0;
  font-size: var(--schrift-text);
  font-weight: 700;
}
.tafel-stand {
  font-size: var(--schrift-label);
  color: var(--color-neutral-700);
  white-space: nowrap;
}
/* Skelett in Zeilenhoehe, ohne Schimmern (DESIGN.md 6). */
.tafel-skelett {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 14px 14px;
}
.tafel-skelett span {
  display: block;
  height: 44px;
  border-radius: var(--radius-klein);
  background: var(--color-neutral-300);
}
/* Die gewaehlte Zeile: Rotschleier und ein Saum links - nicht allein Farbe. */
.tafel button[aria-pressed='true'] {
  background: var(--color-accent-100);
  box-shadow: inset 4px 0 0 var(--color-accent);
}
```

- [ ] **Step 4:** `npx vitest run src/components/Zugauswahl.test.tsx` → PASS (alle, auch die alten).
- [ ] **Step 5: Commit** `feat(frontend): Zugauswahl immer offen fuer das breite Layout`

---

### Task 3: Hook `useBreitesLayout`

**Files:**
- Create: `frontend/src/aufbau/breite.ts`
- Create: `frontend/src/aufbau/testbreite.ts` (nur für Tests)
- Test: `frontend/src/aufbau/breite.test.tsx`

**Interfaces:**
- Produces: `BREIT_AB_PX = 700`; `useBreitesLayout(): boolean`; Testhilfe `stelleBreite(breit: boolean): { drehe(neu: boolean): void }` und `raeumeBreiteAuf(): void`.

- [ ] **Step 1: Testhilfe und failing test.** `testbreite.ts`:

```ts
import { vi } from 'vitest'

/**
 * jsdom kennt `matchMedia` nicht. Fuer Tests des breiten Aufbaus wird es
 * hier nachgestellt - samt `change`, damit sich das Drehen pruefen laesst.
 */
export function stelleBreite(breit: boolean): { drehe(neu: boolean): void } {
  const hoerer = new Set<() => void>()
  const abfrage = {
    matches: breit,
    addEventListener: (_typ: string, f: () => void) => hoerer.add(f),
    removeEventListener: (_typ: string, f: () => void) => hoerer.delete(f),
  }
  window.matchMedia = vi.fn().mockReturnValue(abfrage) as unknown as typeof window.matchMedia
  return {
    drehe(neu: boolean) {
      abfrage.matches = neu
      hoerer.forEach((f) => f())
    },
  }
}

export function raeumeBreiteAuf(): void {
  Reflect.deleteProperty(window, 'matchMedia')
}
```

`breite.test.tsx`:

```tsx
import { afterEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { BREIT_AB_PX, useBreitesLayout } from './breite'
import { raeumeBreiteAuf, stelleBreite } from './testbreite'

afterEach(raeumeBreiteAuf)

describe('useBreitesLayout', () => {
  it('ist ohne matchMedia schmal', () => {
    expect(renderHook(useBreitesLayout).result.current).toBe(false)
  })

  it('fragt ab 700 px', () => {
    stelleBreite(true)
    expect(renderHook(useBreitesLayout).result.current).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith(`(min-width: ${BREIT_AB_PX}px)`)
    expect(BREIT_AB_PX).toBe(700)
  })

  it('folgt dem Drehen des Geraets', () => {
    const geraet = stelleBreite(false)
    const { result } = renderHook(useBreitesLayout)
    act(() => geraet.drehe(true))
    expect(result.current).toBe(true)
  })
})
```

- [ ] **Step 2:** `npx vitest run src/aufbau` → FAIL (Modul fehlt).
- [ ] **Step 3: Implementation** `breite.ts`:

```ts
import { useSyncExternalStore } from 'react'

/** Ab hier hat die Eingabe ihren breiten Aufbau: iPad und Desktop (Spec 2026-10-11). */
export const BREIT_AB_PX = 700
const ABFRAGE = `(min-width: ${BREIT_AB_PX}px)`

function hatMedienabfrage(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
}

function abonniere(melde: () => void): () => void {
  if (!hatMedienabfrage()) return () => {}
  const abfrage = window.matchMedia(ABFRAGE)
  abfrage.addEventListener('change', melde)
  return () => abfrage.removeEventListener('change', melde)
}

function istBreit(): boolean {
  return hatMedienabfrage() && window.matchMedia(ABFRAGE).matches
}

/**
 * Ob der breite Aufbau gilt - auch wenn sich das unterwegs aendert (iPad
 * gedreht, Fenster gezogen). CSS allein reicht nicht: Im breiten Aufbau laden
 * die Tafeln von selbst, auf dem Handy erst auf Knopfdruck.
 */
export function useBreitesLayout(): boolean {
  return useSyncExternalStore(abonniere, istBreit, () => false)
}
```

- [ ] **Step 4:** `npx vitest run src/aufbau` → PASS.
- [ ] **Step 5: Commit** `feat(frontend): useBreitesLayout ab 700 px`

---

### Task 4: Die neue Handy-Eingabe

**Files:**
- Modify: `frontend/src/components/Eingabe.tsx`
- Modify: `frontend/src/App.tsx` (Eingabe-Zweig ab `return (` am Dateiende)
- Modify: `frontend/src/App.css` (am Ende anhängen)
- Create: `frontend/src/testhilfen/css.ts`
- Test: `frontend/src/components/Eingabe.test.tsx`, `frontend/src/App.test.tsx`, Create `frontend/src/eingabe-css.test.ts`

**Interfaces:**
- Produces: `Eingabe`-Props `kopf?: ReactNode`, `fuss?: ReactNode`. Klassen `app-eingabe`, `eingabe-flaeche` (das `<form>`), `eingabe-rollbereich`, `eingabe-titel`, `gleiskacheln`, `gleiskachel` (+ `ziel`), `gleiskachel-label`, `gleiskachel-feld` (+ `lang`), `gleiskachel-zug`, `zuege-wagen`, `feld-rand`, `textknopf`, `nur-vorlesen`. CSS-Testhilfe `cssVon(datei: string): string`, `deklarationenVon(css: string, selektor: string): string[]`, `bloeckeAb(css: string, kopf: string): string[]`.

- [ ] **Step 1: Failing tests.**

In `Eingabe.test.tsx` die Mock-Zeile auf `vi.mock('../api/client', () => ({ sucheStationen: vi.fn(), holeTafel: vi.fn() }))` ändern, in allen Tests `{ name: 'Reise importieren' }` durch `{ name: 'Verbindung einfügen' }` ersetzen, den Testnamen „bietet den Knopf unter der Wagennummer an" in „bietet „Verbindung einfügen" am Bahnhofsfeld an" ändern. `zeige` um Kopf/Fuß erweitern:

```tsx
function zeige(
  erkannt?: BahnhofTreffer[],
  entwurf?: EingabeEntwurf | null,
  extra: { kopf?: React.ReactNode; fuss?: React.ReactNode } = {},
) {
  const onBerechnen = vi.fn()
  render(
    <Eingabe
      laden={false}
      fehler={null}
      erkannt={erkannt}
      entwurf={entwurf}
      onBerechnen={onBerechnen}
      {...extra}
    />,
  )
  return onBerechnen
}
```

Neuer Block am Ende:

```tsx
/** Spec 2026-10-11, Abschnitt 4: die neue Handy-Eingabe. */
describe('Eingabe: der neue Aufbau', () => {
  beforeEach(() => {
    sucheMock.mockReset()
    sucheMock.mockResolvedValue({ ok: true, treffer: [BERLIN] })
  })

  const kachel = (feldname: string) =>
    (screen.getByLabelText(feldname) as HTMLElement).closest('.gleiskachel') as HTMLElement

  it('fragt „Wo steigst du um?"', () => {
    zeige()
    expect(screen.getByRole('heading', { level: 2, name: 'Wo steigst du um?' })).toBeDefined()
  })

  it('traegt die Gleise in zwei Kacheln mit den Woertern der Uebersicht', () => {
    zeige()
    expect(within(kachel('Ankunft: Gleis')).getByText('Du kommst an')).toBeDefined()
    expect(within(kachel('Anschluss: Gleis')).getByText('Dein Anschluss')).toBeDefined()
    expect(kachel('Anschluss: Gleis').classList.contains('ziel')).toBe(true)
  })

  it('schaltet die Gleisnummer ab vier Zeichen auf die kleinere Stufe', async () => {
    zeige()
    const an = screen.getByLabelText('Ankunft: Gleis')
    await userEvent.type(an, '14')
    expect(an.classList.contains('lang')).toBe(false)
    await userEvent.clear(an)
    await userEvent.type(an, '7A-D')
    expect(an.classList.contains('lang')).toBe(true)
  })

  it('nennt den gewaehlten Zug in der Kachel', () => {
    zeige(undefined, {
      suchtext: 'Berlin Hbf', gewaehlt: BERLIN, evaManuell: '', gleisAn: '6', gleisAb: '14',
      wagenAn: '', wagenAb: '', profil: 'normal',
      zugAnkunft: { zug: 'RE 3', zeitSoll: '14:22', gleisSoll: '6', ziel: 'Stralsund' },
      zugAbfahrt: null,
    })
    expect(within(kachel('Ankunft: Gleis')).getByText(/RE 3 · an 14:22/)).toBeDefined()
  })

  it('klappt Zuege und Wagennummer auf dem Handy ein', () => {
    zeige()
    const aufklapper = screen.getByLabelText('Ankunft: Wagen (optional)').closest('details')
    expect(aufklapper).not.toBeNull()
    expect(aufklapper!.open).toBe(false)
    expect(within(aufklapper!).getByText(/Züge und Wagennummer/)).toBeDefined()
  })

  it('stellt den Hauptknopf fest unter den Rollbereich, ohne Pfeil', () => {
    zeige(undefined, null, { kopf: <p>KOPF</p>, fuss: <p>FUSS</p> })
    const knopf = screen.getByRole('button', { name: /Umstieg starten/ })
    expect(knopf.closest('.eingabe-rollbereich')).toBeNull()
    expect(knopf.querySelector('svg')).toBeNull()
    const bereich = document.querySelector('.eingabe-rollbereich') as HTMLElement
    expect(within(bereich).getByText('KOPF')).toBeDefined()
    expect(within(bereich).getByText('FUSS')).toBeDefined()
  })
})
```

In `App.test.tsx` im Block „App: die Uebersicht" ergänzen:

```tsx
  it('stellt die Eingabe in die Spalte, die nur innen rollt', () => {
    render(<App />)
    expect(document.querySelector('main.app-eingabe')).not.toBeNull()
  })
```

`src/testhilfen/css.ts`:

```ts
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** CSS einer Datei unter `src/`, ohne Kommentare. */
export function cssVon(datei: string): string {
  const pfad = resolve(dirname(fileURLToPath(import.meta.url)), '..', datei)
  return readFileSync(pfad, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
}

/** Der Inhalt jedes Blocks, der mit `kopf` beginnt – Klammern mitgezaehlt. */
export function bloeckeAb(css: string, kopf: string): string[] {
  const bloecke: string[] = []
  let ab = css.indexOf(kopf)
  while (ab >= 0) {
    const auf = css.indexOf('{', ab)
    let tiefe = 0
    let i = auf
    for (; i < css.length; i++) {
      if (css[i] === '{') tiefe++
      if (css[i] === '}' && --tiefe === 0) break
    }
    bloecke.push(css.slice(auf + 1, i))
    ab = css.indexOf(kopf, i)
  }
  return bloecke
}

/** Alle Deklarationen der Regeln mit GENAU diesem Selektor. */
export function deklarationenVon(css: string, selektor: string): string[] {
  const ergebnis: string[] = []
  for (const t of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (t[1].trim() !== selektor) continue
    for (const d of t[2].split(';')) {
      const z = d.replace(/\s+/g, ' ').trim()
      if (z) ergebnis.push(z)
    }
  }
  return ergebnis
}
```

`src/eingabe-css.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { cssVon, deklarationenVon } from './testhilfen/css'

/**
 * Die Eingabe hat seit dem 11.10.2026 den Aufbau der Uebersicht: Spalte auf
 * Sichtfeldhoehe, der Inhalt rollt, „Umstieg starten" steht fest darunter.
 * jsdom rechnet kein Layout - ohne diese Regeln laege der Knopf wieder unter
 * dem Falz, und alle Komponententests blieben gruen.
 */
const css = cssVon('App.css')

describe('App.css: die Eingabe', () => {
  it('haelt die Spalte auf Sichtfeldhoehe', () => {
    const spalte = deklarationenVon(css, '.app-eingabe')
    expect(spalte).toContain('height: 100dvh')
    expect(spalte).toContain('overflow: hidden')
  })

  it('laesst den Rollbereich rollen und schrumpfen', () => {
    const bereich = deklarationenVon(css, '.eingabe-rollbereich')
    expect(bereich).toContain('flex: 1')
    expect(bereich).toContain('min-height: 0')
    expect(bereich).toContain('overflow-y: auto')
  })

  it('setzt die Gleisnummer in die Staffel: 56 px, ab vier Zeichen 28 px', () => {
    expect(deklarationenVon(css, '.gleiskachel-feld')).toContain('font-size: var(--schrift-gleis)')
    expect(deklarationenVon(css, '.gleiskachel-feld.lang')).toContain(
      'font-size: var(--schrift-titel)',
    )
  })
})
```

- [ ] **Step 2:** `npx vitest run src/components/Eingabe.test.tsx src/App.test.tsx src/eingabe-css.test.ts` → die neuen FAIL, die umbenannten Import-Tests FAIL („Verbindung einfügen" fehlt).
- [ ] **Step 3: Implementation `Eingabe.tsx`.**
  1. Import `type ReactNode` aus `react`; Props `kopf?: ReactNode` und `fuss?: ReactNode` mit Kommentar „wie `zusatz` am `Schrittsheet`: Lockup/Standorthinweise und Fusszeile gehoeren in den Rollbereich, kommen aber aus `App`".
  2. Hilfsfunktion über der Komponente:

```ts
/** „RE 3 · an 14:22" – bei einem Gleiswechsel mit Zusatz. */
function zugzeile(e: TafelEintrag, richtung: 'an' | 'ab'): ReactNode {
  return (
    <>
      {e.zug} · {richtung} {e.zeitIst ?? e.zeitSoll}
      {e.gleisIst && <strong className="gleiswechsel"> · Gleis {e.gleisIst} (geändert!)</strong>}
    </>
  )
}
```

  3. Rückrufe für beide Tafeln (ersetzen die Inline-Funktionen):

```ts
const waehleAnkunft = (e: TafelEintrag | null) => {
  setZugAnkunft(e)
  if (e) setGleisAn(e.gleisIst ?? e.gleisSoll)
}
const waehleAbfahrt = (e: TafelEintrag | null) => {
  setZugAbfahrt(e)
  if (e) setGleisAb(e.gleisIst ?? e.gleisSoll)
}
```

  4. Das `return` neu aufbauen (Bahnhofsfeld-Inhalt, `ReiseImport` und Einstellungen unverändert übernehmen):

```tsx
const wagenAnFeld = (
  <div className="feld">
    <label htmlFor="wagenAn">Ankunft: Wagen (optional)</label>
    <input id="wagenAn" className="eingabefeld" type="text" inputMode="numeric"
      placeholder="z. B. 26 – genauer Startpunkt" value={wagenAn}
      onChange={(e) => setWagenAn(e.target.value)} />
  </div>
)
const wagenAbFeld = (
  <div className="feld">
    <label htmlFor="wagenAb">Anschluss: Wagen (optional)</label>
    <input id="wagenAb" className="eingabefeld" type="text" inputMode="numeric"
      placeholder="z. B. 7 – wo du einsteigst" value={wagenAb}
      onChange={(e) => setWagenAb(e.target.value)} />
  </div>
)

return (
  <form className="eingabe-flaeche" onSubmit={(e) => { e.preventDefault(); absenden() }}>
    <div className="eingabe-rollbereich">
      {kopf}
      <h2 className="eingabe-titel">Wo steigst du um?</h2>
      <div className="feld">
        {/* Bahnhofsfeld, Vorschlaege, „Bahnhoefe in deiner Naehe", Abzeichen,
            Netz- und DB-Hinweise: unveraendert aus dem bisherigen Code */}
        <div className="feld-rand">
          {/* Abkuerzung am Rand (BRIEF.md 4), nicht der Einstieg. */}
          <button type="button" className="textknopf" onClick={() => setImportOffen(true)}>
            Verbindung einfügen
          </button>
        </div>
      </div>

      <div className="gleiskacheln">
        <div className="gleiskachel">
          <div className="kicker">Du kommst an</div>
          <label htmlFor="gleisAn" className="gleiskachel-label">
            <span className="nur-vorlesen">Ankunft: </span>Gleis
          </label>
          <input id="gleisAn" type="text" required value={gleisAn}
            className={`eingabefeld gleiskachel-feld${gleisAn.length > 3 ? ' lang' : ''}`}
            onChange={(e) => setGleisAn(e.target.value)} />
          {zugAnkunft && <p className="gleiskachel-zug">{zugzeile(zugAnkunft, 'an')}</p>}
        </div>
        <div className="gleiskachel ziel">
          <div className="kicker">Dein Anschluss</div>
          <label htmlFor="gleisAb" className="gleiskachel-label">
            <span className="nur-vorlesen">Anschluss: </span>Gleis
          </label>
          <input id="gleisAb" type="text" required value={gleisAb}
            className={`eingabefeld gleiskachel-feld${gleisAb.length > 3 ? ' lang' : ''}`}
            onChange={(e) => setGleisAb(e.target.value)} />
          {zugAbfahrt && <p className="gleiskachel-zug">{zugzeile(zugAbfahrt, 'ab')}</p>}
        </div>
      </div>

      <details className="zuege-wagen">
        <summary>
          Züge und Wagennummer <span className="zuege-wagen-optional">· optional</span>
        </summary>
        <fieldset className="reiseblock">
          <legend>Ankunft</legend>
          {eva !== '' && (
            <Zugauswahl eva={eva} typ="arr" label="Ankunftszug wählen"
              auswahl={zugAnkunft} onAuswahl={waehleAnkunft} />
          )}
          {wagenAnFeld}
        </fieldset>
        <fieldset className="reiseblock">
          <legend>Abfahrt</legend>
          {eva !== '' && (
            <Zugauswahl eva={eva} typ="dep" label="Anschlusszug wählen"
              auswahl={zugAbfahrt} onAuswahl={waehleAbfahrt} />
          )}
          {wagenAbFeld}
        </fieldset>
      </details>

      {importOffen && (
        <ReiseImport onSchliessen={() => setImportOffen(false)} onUebernehmen={uebernimmUmstieg} />
      )}

      {/* <details className="einstellungen"> … unveraendert … </details> */}

      {fehler && <div className="fehler-box">{fehler}</div>}
      {fuss}
    </div>

    {/* Fest unter dem Rollbereich, wie auf der Uebersicht. Ohne Pfeil:
        DESIGN.md 4, „Kein Pfeil → hinter dem Text". */}
    <button className="knopf-primaer" type="submit" disabled={!bereit}>
      <span>{laden ? 'Wird berechnet …' : 'Umstieg starten'}</span>
      {laden && <span className="lade-kreisel" aria-hidden="true" />}
    </button>
  </form>
)
```

  5. **`App.tsx`**, Eingabe-Zweig (letztes `return`): `<main className="app app-eingabe">`, `{meldung}` bleibt erstes Kind; `<header className="kopf">…</header>`, die drei Standorthinweise und `<hr className="trennlinie" />` wandern unverändert in ein Fragment, das als `kopf` übergeben wird; `<Fusszeile />` geht als `fuss={<Fusszeile />}`; die Leiste bleibt das letzte Kind von `main`.
  6. **`App.css`** am Dateiende anhängen:

```css
/* — Eingabe (Spec 2026-10-11) — */

/*
 * Dieselbe Spalte wie Uebersicht und Wegseite: so hoch wie das Sichtfeld,
 * der Inhalt rollt in `.eingabe-rollbereich`, „Umstieg starten" steht fest
 * darunter. Vorher lag der Knopf unter Bahnhof, zwei Bloecken, Import und
 * Einstellungen.
 */
.app-eingabe {
  height: 100vh;
  height: 100dvh;
  overflow: hidden;
}
.eingabe-flaeche {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.eingabe-rollbereich {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 18px;
  margin: 0 -20px;
  padding: 0 20px 4px;
}
.eingabe-titel {
  margin: 0;
  font-size: var(--schrift-titel);
  font-weight: 700;
  line-height: 1.2;
}
/* Fuer Vorleser da, im Bild nicht: „Ankunft: " vor „Gleis". */
.nur-vorlesen {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
.feld-rand {
  display: flex;
  justify-content: flex-end;
  margin-top: 4px;
}
/* Abkuerzung am Rand: Text statt Flaeche, aber 44 px Tippziel. */
.textknopf {
  min-height: 44px;
  padding: 0 4px;
  border: 0;
  background: none;
  font: inherit;
  font-size: var(--schrift-label);
  font-weight: 700;
  color: var(--color-accent-700);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.gleiskacheln {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
/* Dieselben Karten wie auf der Uebersicht - die Kachel WIRD dort zur Karte. */
.gleiskachel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  padding: 14px;
  border: 2px solid var(--color-divider);
  border-radius: var(--radius-mittel);
}
.gleiskachel.ziel {
  border-color: var(--color-accent);
  background: var(--color-accent-100);
}
.gleiskachel-label {
  font-size: var(--schrift-label);
  color: var(--color-neutral-700);
}
.gleiskachel-feld {
  min-height: 0;
  padding: 2px 12px;
  font-size: var(--schrift-gleis);
  font-weight: 800;
  line-height: 1.15;
  letter-spacing: -0.03em;
  border-radius: var(--radius-klein);
}
/* Teilgleise wie „7A-D" passen auf 320 px nur eine Stufe kleiner. */
.gleiskachel-feld.lang {
  font-size: var(--schrift-titel);
}
.gleiskachel.ziel .gleiskachel-feld {
  color: var(--color-accent-700);
  background: var(--color-bg);
}
.gleiskachel-zug {
  margin: 0;
  font-size: var(--schrift-label);
  color: var(--color-neutral-700);
}
.zuege-wagen > summary {
  cursor: pointer;
  min-height: 44px;
  padding: 12px 0;
  font-size: var(--schrift-label);
  font-weight: 700;
}
.zuege-wagen-optional {
  font-weight: 500;
  color: var(--color-neutral-700);
}
.zuege-wagen > .reiseblock + .reiseblock {
  margin-top: 12px;
}
```

- [ ] **Step 4:** `npx vitest run src/components/Eingabe.test.tsx src/App.test.tsx src/eingabe-css.test.ts src/Kopf.test.tsx` → PASS; danach `npm test` und `npm run lint` → alles grün.
- [ ] **Step 5: Commit** `feat(frontend): neue Handy-Eingabe - Gleiskacheln, Zuege eingeklappt, fester Knopf`

---

### Task 5: Das breite Layout

**Files:**
- Modify: `frontend/src/components/Eingabe.tsx`
- Modify: `frontend/src/App.css`
- Test: `frontend/src/components/Eingabe.test.tsx`, `frontend/src/eingabe-css.test.ts`

**Interfaces:**
- Consumes: `useBreitesLayout` (Task 3), `Zugauswahl immerOffen` (Task 2), `waehleAnkunft`/`waehleAbfahrt`, `wagenAnFeld`/`wagenAbFeld` (Task 4).
- Produces: `<section className="tafel-spalte ankunft|abfahrt" aria-label="Ankunft|Abfahrt">` mit `.tafel-spalte-inhalt` bzw. `.tafel-platzhalter`.

- [ ] **Step 1: Failing tests** in `Eingabe.test.tsx` (Imports: `holeTafel` aus `../api/client`, `stelleBreite`, `raeumeBreiteAuf` aus `../aufbau/testbreite`, `afterEach` aus vitest, `TafelEintrag` aus `../api/typen`):

```tsx
const holeTafelMock = vi.mocked(holeTafel)

/** Uhrzeit in `minuten` Minuten, als "HH:MM" - die Tafel kennt kein Datum. */
function inMinuten(minuten: number): string {
  const d = new Date(Date.now() + minuten * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Spec 2026-10-11, Abschnitt 5: iPad und Desktop. */
describe('Eingabe: breites Layout', () => {
  const RE3: TafelEintrag = { zug: 'RE 3', zeitSoll: inMinuten(12), gleisSoll: '6', ziel: 'Stralsund' }

  beforeEach(() => {
    stelleBreite(true)
    sucheMock.mockReset()
    sucheMock.mockResolvedValue({ ok: true, treffer: [BERLIN] })
    holeTafelMock.mockReset()
    holeTafelMock.mockImplementation(async (_eva, typ) => ({
      ok: true,
      eintraege: typ === 'arr' ? [RE3] : [],
    }))
  })
  afterEach(raeumeBreiteAuf)

  async function waehleBerlin() {
    await userEvent.type(feld(), 'Ber')
    await userEvent.click(await screen.findByRole('button', { name: 'Berlin Hbf' }))
  }

  it('zeigt ohne Bahnhof zwei Platzhalter und laedt nichts', () => {
    zeige()
    expect(screen.getAllByText(/Wähle einen Bahnhof/)).toHaveLength(2)
    expect(holeTafelMock).not.toHaveBeenCalled()
  })

  it('oeffnet beide Tafeln, sobald ein Bahnhof gewaehlt ist', async () => {
    zeige()
    await waehleBerlin()
    expect(await screen.findByRole('heading', { name: 'Ankunft · Berlin Hbf' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Abfahrt · Berlin Hbf' })).toBeDefined()
    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'arr')
    expect(holeTafelMock).toHaveBeenCalledWith('8011160', 'dep')
  })

  it('traegt einen angetippten Zug in die Kachel ein', async () => {
    zeige()
    await waehleBerlin()
    await userEvent.click(await screen.findByRole('button', { name: /RE 3/ }))
    expect((screen.getByLabelText('Ankunft: Gleis') as HTMLInputElement).value).toBe('6')
  })

  it('stellt die Wagenfelder offen hin, ohne Aufklapper', () => {
    zeige()
    expect(screen.getByLabelText('Ankunft: Wagen (optional)').closest('details')).toBeNull()
  })

  it('sagt ohne DB-Zugang, warum keine Tafel kommt', async () => {
    sucheMock.mockResolvedValue({ ok: false, fehler: 'db-zugang-fehlt' })
    zeige()
    await userEvent.type(feld(), 'Ber')
    expect(await screen.findAllByText(/Ohne DB-Zugang keine Live-Tafel/)).toHaveLength(2)
    expect(holeTafelMock).not.toHaveBeenCalled()
  })
})
```

In `eingabe-css.test.ts` ergänzen (Import `bloeckeAb`):

```ts
describe('App.css: breites Layout der Eingabe', () => {
  const ab700 = bloeckeAb(css, '@media (min-width: 700px)').join('\n')
  const ab900 = bloeckeAb(css, '@media (min-width: 900px)').join('\n')

  it('wird ab 700 px breiter als die Telefonspalte', () => {
    expect(deklarationenVon(ab700, '.app-eingabe')).toContain('max-width: 1280px')
  })

  it('stellt ab 900 px Formular, Ankunft und Abfahrt nebeneinander', () => {
    expect(deklarationenVon(ab900, '.eingabe-flaeche')).toContain(
      'grid-template-columns: minmax(340px, 400px) 1fr 1fr',
    )
  })
})
```

- [ ] **Step 2:** `npx vitest run src/components/Eingabe.test.tsx src/eingabe-css.test.ts` → die neuen FAIL.
- [ ] **Step 3: Implementation.**
  1. `Eingabe.tsx`: `import { useBreitesLayout } from '../aufbau/breite'`; in der Komponente `const breit = useBreitesLayout()`.
  2. Statt `<details className="zuege-wagen">…</details>` rendern: `{breit ? <div className="gleis-zeile">{wagenAnFeld}{wagenAbFeld}</div> : (<details …>…</details>)}`.
  3. Vor dem Hauptknopf (als Kinder des `<form>`):

```tsx
{breit && (
  <>
    {tafelSpalte('ankunft', 'Ankunft', 'arr', zugAnkunft, waehleAnkunft)}
    {tafelSpalte('abfahrt', 'Abfahrt', 'dep', zugAbfahrt, waehleAbfahrt)}
  </>
)}
```

mit, innerhalb der Komponente:

```tsx
const platzhaltertext = dbFehlt
  ? 'Ohne DB-Zugang keine Live-Tafel – Gleise bitte von Hand eingeben.'
  : 'Wähle einen Bahnhof – dann stehen hier die Züge bis zum Ende der nächsten Stunde.'

function tafelSpalte(
  art: 'ankunft' | 'abfahrt',
  titel: string,
  typ: 'arr' | 'dep',
  auswahl: TafelEintrag | null,
  onAuswahl: (e: TafelEintrag | null) => void,
) {
  return (
    <section className={`tafel-spalte ${art}`} aria-label={titel}>
      {gewaehlt ? (
        <div className="tafel-spalte-inhalt">
          <Zugauswahl eva={gewaehlt.eva} typ={typ} label={`${titel} · ${gewaehlt.name}`}
            auswahl={auswahl} onAuswahl={onAuswahl} immerOffen />
        </div>
      ) : (
        <div className="tafel-platzhalter">
          <h3 className="tafel-spalte-titel">{titel}</h3>
          <p>{platzhaltertext}</p>
        </div>
      )}
    </section>
  )
}
```

  4. `App.css` am Dateiende anhängen:

```css
/*
 * Breites Layout (Spec 2026-10-11): iPad und Desktop. Das Formular ist das
 * Raster; seine Kinder - Rollbereich, zwei Tafelspalten, Hauptknopf - legen
 * sich je Breite anders hinein. Unter 700 px bleibt es die Telefonspalte.
 */
.tafel-spalte {
  display: grid;
  min-width: 0;
  min-height: 0;
}
/* Platzhalter und Tafel liegen in derselben Zelle uebereinander. */
.tafel-spalte > * {
  grid-area: 1 / 1;
  min-height: 0;
}
.tafel-spalte-inhalt {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-mittel);
  background: var(--color-neutral-100);
}
.tafel-platzhalter {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 14px;
  border: 2px dashed var(--color-divider);
  border-radius: var(--radius-mittel);
  font-size: var(--schrift-label);
  color: var(--color-neutral-700);
}
.tafel-platzhalter p {
  margin: 0;
}

@media (min-width: 700px) {
  .app-eingabe {
    max-width: 1280px;
  }
  .eingabe-flaeche {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: minmax(0, 1fr) 420px auto;
    grid-template-areas:
      'formular formular'
      'ankunft abfahrt'
      'knopf knopf';
  }
  .eingabe-rollbereich {
    grid-area: formular;
  }
  .tafel-spalte.ankunft {
    grid-area: ankunft;
  }
  .tafel-spalte.abfahrt {
    grid-area: abfahrt;
  }
  .eingabe-flaeche > .knopf-primaer {
    grid-area: knopf;
  }
  /* Vier Knoepfe ueber 1400 px waeren keine Leiste mehr. */
  .app-eingabe .navileiste {
    padding-inline: max(8px, calc((100% - 560px) / 2));
  }
}

@media (min-width: 900px) {
  .eingabe-flaeche {
    grid-template-columns: minmax(340px, 400px) 1fr 1fr;
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas:
      'formular ankunft abfahrt'
      'knopf ankunft abfahrt';
  }
}
```

- [ ] **Step 4:** `npx vitest run src/components src/eingabe-css.test.ts` → PASS; `npm test`, `npm run lint` → grün.
- [ ] **Step 5: Commit** `feat(frontend): breites Layout der Eingabe - Tafeln offen neben dem Formular`

---

### Task 6: Die Animation – Tafeln klappen nach rechts auf

**Files:**
- Modify: `frontend/src/components/Eingabe.tsx`
- Modify: `frontend/src/App.css`
- Test: `frontend/src/components/Eingabe.test.tsx`, `frontend/src/eingabe-css.test.ts`, `frontend/src/bewegung-css.test.ts`

**Interfaces:**
- Consumes: `tafelSpalte` aus Task 5.
- Produces: `<form className="eingabe-flaeche mit-bewegung">` nach einer Nutzerwahl; `data-offen="ja|nein"` an `.tafel-spalte`; `inert` an der zugeklappten `.tafel-spalte-inhalt`.

- [ ] **Step 1: Failing tests.** In `Eingabe.test.tsx` innerhalb „Eingabe: breites Layout":

```tsx
  const spalte = (name: string) => screen.getByRole('region', { name }) as HTMLElement
  const formular = () => document.querySelector('form.eingabe-flaeche') as HTMLElement

  it('klappt die Tafeln mit Bewegung auf, wenn der Nutzer waehlt', async () => {
    zeige()
    await waehleBerlin()
    expect(spalte('Ankunft').dataset.offen).toBe('ja')
    expect(spalte('Abfahrt').dataset.offen).toBe('ja')
    expect(formular().classList.contains('mit-bewegung')).toBe(true)
  })

  it('zeigt die Tafeln ohne Bewegung, wenn die Erkennung den Bahnhof setzt', () => {
    // DESIGN.md 6: Bewegung, die von selbst Aufmerksamkeit fordert, ist verboten.
    zeige([BERLIN])
    expect(spalte('Ankunft').dataset.offen).toBe('ja')
    expect(formular().classList.contains('mit-bewegung')).toBe(false)
  })

  it('klappt beim Aufheben der Wahl zu und sperrt die Tafel', async () => {
    zeige()
    await waehleBerlin()
    await userEvent.type(feld(), 'x')
    expect(spalte('Ankunft').dataset.offen).toBe('nein')
    const inhalt = spalte('Ankunft').querySelector('.tafel-spalte-inhalt') as HTMLElement
    expect(inhalt.hasAttribute('inert')).toBe(true)
    expect(within(spalte('Ankunft')).getByText(/Wähle einen Bahnhof/)).toBeDefined()
  })
```

In `eingabe-css.test.ts`:

```ts
describe('App.css: die Tafeln klappen nach rechts auf', () => {
  it('laeuft als Uebergang ueber die Token', () => {
    const regel = deklarationenVon(css, '.mit-bewegung .tafel-spalte-inhalt').join('; ')
    expect(regel).toMatch(/clip-path var\(--dauer-normal\) var\(--verlauf-ein\)/)
  })

  it('ist zugeklappt von rechts her verdeckt', () => {
    expect(deklarationenVon(css, ".tafel-spalte[data-offen='nein'] .tafel-spalte-inhalt")).toContain(
      'clip-path: inset(0 100% 0 0)',
    )
  })

  it('klappt auch beim ersten Erscheinen auf', () => {
    expect(bloeckeAb(css, '@starting-style').join('\n')).toMatch(/clip-path: inset\(0 100% 0 0\)/)
  })

  it('laesst die Abfahrt um --dauer-schnell nachfolgen', () => {
    expect(
      deklarationenVon(css, ".mit-bewegung .tafel-spalte.abfahrt[data-offen='ja'] .tafel-spalte-inhalt"),
    ).toContain('transition-delay: var(--dauer-schnell)')
  })
})
```

In `bewegung-css.test.ts` den Test „setzt jeden Übergang auf sofort" ersetzen durch:

```ts
  it('setzt jeden Übergang auf sofort, auch seine Verzögerung', () => {
    const block = bloeckeAb('@media (prefers-reduced-motion: reduce)').join('\n')
    expect(block.replace(/\s+/g, ' ')).toMatch(
      /\*, ::before, ::after \{ transition-duration: 0\.01ms !important; transition-delay: 0s !important; \}/,
    )
  })
```

- [ ] **Step 2:** `npx vitest run src/components/Eingabe.test.tsx src/eingabe-css.test.ts src/bewegung-css.test.ts` → die neuen FAIL.
- [ ] **Step 3: Implementation.**
  1. `Eingabe.tsx`, Zustand:

```ts
/*
 * Die Tafeln zeigen den zuletzt gewaehlten Bahnhof - auch noch, waehrend sie
 * zuklappen. Sonst verschwaende ihr Inhalt, bevor die Bewegung ihn zeigt.
 */
const [tafelBahnhof, setTafelBahnhof] = useState<BahnhofTreffer | null>(gewaehlt)
if (gewaehlt && gewaehlt.eva !== tafelBahnhof?.eva) setTafelBahnhof(gewaehlt)
const tafelnOffen = gewaehlt !== null
/*
 * Bewegung nur auf eine Handlung hin (DESIGN.md 6): eine Wahl oder ihr
 * Aufheben durch den Nutzer. Setzt die Standorterkennung oder der Entwurf den
 * Bahnhof, stehen die Tafeln ohne Uebergang da.
 */
const [bewegung, setBewegung] = useState(false)
```

  `setBewegung(true)` aufrufen: im `onChange` des Bahnhofsfelds, in beiden `onClick` der Vorschlagslisten und am Anfang von `uebernimmUmstieg`.
  2. `<form className={`eingabe-flaeche${bewegung ? ' mit-bewegung' : ''}`} …>`.
  3. `tafelSpalte` ersetzen:

```tsx
function tafelSpalte(
  art: 'ankunft' | 'abfahrt',
  titel: string,
  typ: 'arr' | 'dep',
  auswahl: TafelEintrag | null,
  onAuswahl: (e: TafelEintrag | null) => void,
) {
  return (
    <section className={`tafel-spalte ${art}`} aria-label={titel}
      data-offen={tafelnOffen ? 'ja' : 'nein'}>
      <div className="tafel-platzhalter" aria-hidden={tafelnOffen || undefined}>
        <h3 className="tafel-spalte-titel">{titel}</h3>
        <p>{platzhaltertext}</p>
      </div>
      {tafelBahnhof && (
        // Zugeklappt nicht bedienbar und fuer Vorleser weg - verdeckt ist
        // sie nur fuers Auge.
        <div className="tafel-spalte-inhalt" inert={!tafelnOffen}>
          <Zugauswahl eva={tafelBahnhof.eva} typ={typ} label={`${titel} · ${tafelBahnhof.name}`}
            auswahl={auswahl} onAuswahl={onAuswahl} immerOffen />
        </div>
      )}
    </section>
  )
}
```

  4. `App.css`: hinter `.tafel-platzhalter p` einfügen:

```css
/*
 * Die Tafeln klappen nach rechts auf (Spec 2026-10-11, Abschnitt 6): von der
 * linken Kante her, wie ein Leporello - erst die Ankunft, die Abfahrt
 * --dauer-schnell spaeter; zu in umgekehrter Folge. Die Spalten sind
 * reserviert, nichts verschiebt sich. Nur mit `.mit-bewegung`, also nur auf
 * eine Handlung hin.
 */
.tafel-spalte-inhalt {
  clip-path: inset(0 0 0 0);
  transform: none;
  opacity: 1;
}
.tafel-spalte[data-offen='nein'] .tafel-spalte-inhalt {
  clip-path: inset(0 100% 0 0);
  transform: translateX(-16px);
  opacity: 0;
}
.mit-bewegung .tafel-spalte-inhalt {
  transition:
    clip-path var(--dauer-normal) var(--verlauf-ein),
    transform var(--dauer-normal) var(--verlauf-ein),
    opacity var(--dauer-normal) var(--verlauf-ein);
}
.mit-bewegung .tafel-spalte[data-offen='nein'] .tafel-spalte-inhalt {
  transition-timing-function: var(--verlauf-aus);
}
.mit-bewegung .tafel-spalte.abfahrt[data-offen='ja'] .tafel-spalte-inhalt {
  transition-delay: var(--dauer-schnell);
}
.mit-bewegung .tafel-spalte.ankunft[data-offen='nein'] .tafel-spalte-inhalt {
  transition-delay: var(--dauer-schnell);
}
/* Beim ersten Erscheinen gibt es keinen Vorzustand - hier steht er. */
@starting-style {
  .mit-bewegung .tafel-spalte[data-offen='ja'] .tafel-spalte-inhalt {
    clip-path: inset(0 100% 0 0);
    transform: translateX(-16px);
    opacity: 0;
  }
}
```

  5. `App.css`, Block `@media (prefers-reduced-motion: reduce)`: die Regel für `*, ::before, ::after` um `transition-delay: 0s !important;` ergänzen und im Kommentar darüber einen Satz: „Auch die Verzoegerung: Sonst kaeme die Abfahrtstafel ruckartig 120 ms nach der Ankunft."
- [ ] **Step 4:** `npx vitest run src/components src/eingabe-css.test.ts src/bewegung-css.test.ts` → PASS; `npm test`, `npm run lint`, `npm run build` → grün.
- [ ] **Step 5: Commit** `feat(frontend): Tafeln klappen nach rechts auf`

---

### Task 7: Sichtprüfung, Doku, Abschluss

**Files:**
- Modify: `README.md` (Abschnitt „Hier weitermachen"), `design/DESIGN.md` §8 (Punkte 1 und 5), `BRIEF.md` §11 (neue Zeile)

- [ ] **Step 1: Browser.** Lokaler Server läuft (`npm run dev` in `frontend/`, Backend auf 3001). In Chrome einen Rahmen gleicher Herkunft nutzen (`<iframe src="/">` per `document.write` auf `http://localhost:5173/`), je Größe hell und dunkel (`data-darstellung` am `html` des Rahmens):
  - 360 × 740 und 320 × 740: kein waagerechtes Rollen, Knopf über der Leiste, Kacheln nebeneinander, „7A-D" passt.
  - 820 × 1180: Formular oben, zwei Tafeln darunter, Knopf fest.
  - 1180 × 820 und 1440 × 900: drei Spalten, Spaltenbreiten vor und nach der Animation gleich, Animation beim Antippen eines Vorschlags, keine bei Erkennung.
  - Kontrast der neuen Schrift ≥ 4,5:1 in beiden Paletten (wie am 07.10. per JS gemessen).
- [ ] **Step 2: Doku.** README „Hier weitermachen": Absatz „Eingabe neu und breites Layout (11.10.2026)" mit Ergebnis, Messwerten, „nicht geprüft". DESIGN.md §8: Punkt 1 als gebaut markieren (Verweis auf die Spec), Punkt 5 als „für die Eingabe gebaut, übrige Bildschirme offen". BRIEF.md §11: Zeile „Eingabe neu + breites Layout | fertig 11.10.2026 | …".
- [ ] **Step 3:** `npm test && npm run lint && npm run build` in `frontend/` → grün.
- [ ] **Step 4: Commit** `docs: Eingabe neu und breites Layout im README, DESIGN.md und BRIEF.md`
