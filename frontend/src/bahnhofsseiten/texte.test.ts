import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { Bahnhofsdaten, Gleispaar } from './typen'
import {
  beschreibungFuer,
  gehzeitText,
  gruppiereNachBuchstabe,
  laengsteUmstiege,
  minuten,
  standText,
  stufenfreiText,
  titelFuer,
  wegText,
  ohneLuecken,
} from './texte'

const paar = (p: Partial<Gleispaar>): Gleispaar => ({
  von: '1',
  nach: '2',
  gleicherBahnsteig: false,
  sek: 120,
  wechsel: 2,
  anlagen: ['treppe'],
  lage: 'unterfuehrung',
  stufenfreiSek: 200,
  ...p,
})

describe('minuten: aufgerundet auf ganze Minuten', () => {
  it.each([
    [1, 1],
    [59, 1],
    [60, 1],
    [61, 2],
    [119, 2],
    [120, 2],
    [121, 3],
    [951, 16],
  ])('%i s → %i min', (sek, min) => {
    expect(minuten(sek)).toBe(min)
  })
})

describe('gehzeitText', () => {
  it('nennt Minuten', () => {
    expect(gehzeitText(paar({ sek: 130 }))).toBe('3 min')
  })

  // Konzept 5b.4: „Gleicher Bahnsteig" steht als Text statt einer Minutenzahl.
  it('nennt den gleichen Bahnsteig als Text', () => {
    expect(gehzeitText(paar({ gleicherBahnsteig: true, sek: 15 }))).toBe('Gleicher Bahnsteig')
  })

  it('sagt ehrlich, wenn der Plan keinen Weg kennt', () => {
    expect(gehzeitText(paar({ sek: null }))).toBe('kein Weg im Plan')
  })
})

describe('wegText', () => {
  it('nennt Anlagen und Lage', () => {
    expect(wegText(paar({ anlagen: ['treppe'], lage: 'unterfuehrung' }))).toBe('Treppe, Unterführung')
    expect(wegText(paar({ anlagen: ['rolltreppe', 'aufzug'], lage: 'ueberfuehrung' }))).toBe(
      'Rolltreppe, Aufzug, Überführung',
    )
    expect(wegText(paar({ anlagen: ['aufzug'], lage: 'nach-oben' }))).toBe('Aufzug, nach oben')
  })

  it('ohne Anlagen und Hoehenwechsel: ebenerdig', () => {
    expect(wegText(paar({ anlagen: [], lage: 'ebenerdig', wechsel: 0 }))).toBe('ebenerdig')
  })

  it('verschweigt „ebenerdig", wenn eine Anlage genannt ist', () => {
    expect(wegText(paar({ anlagen: ['rampe'], lage: 'ebenerdig' }))).toBe('Rampe')
  })

  it('am gleichen Bahnsteig: ueber den Bahnsteig', () => {
    expect(wegText(paar({ gleicherBahnsteig: true }))).toBe('über den Bahnsteig')
  })

  it('ohne Weg: nichts', () => {
    expect(wegText(paar({ sek: null }))).toBe('–')
  })
})

describe('stufenfreiText', () => {
  it('nennt Minuten oder „nicht möglich"', () => {
    expect(stufenfreiText(paar({ stufenfreiSek: 245 }))).toBe('5 min')
    expect(stufenfreiText(paar({ stufenfreiSek: null }))).toBe('nicht möglich')
  })

  it('am gleichen Bahnsteig: ja', () => {
    expect(stufenfreiText(paar({ gleicherBahnsteig: true, stufenfreiSek: 15 }))).toBe('ja')
  })
})

describe('titelFuer und beschreibungFuer (Konzept 4.2)', () => {
  it('Hannover Hbf: 53 Zeichen Titel', () => {
    expect(titelFuer('Hannover Hbf')).toBe('Umsteigen in Hannover Hbf: Gehzeit von Gleis zu Gleis')
    expect(titelFuer('Hannover Hbf')).toHaveLength(53)
  })

  it('kuerzt den Zusatz bei Namen ueber 25 Zeichen', () => {
    expect(titelFuer('Frankfurt(M) Flughafen Fernbf')).toBe(
      'Umsteigen in Frankfurt(M) Flughafen Fernbf: Gehzeit je Gleis',
    )
  })

  it('Beschreibung nach Vorlage', () => {
    expect(beschreibungFuer('Hannover Hbf')).toBe(
      'Wie lange dauert der Umstieg in Hannover Hbf? Gehzeiten für alle Gleispaare, mit Treppen, Aufzügen und Ebenen. Kostenlos und ohne Anmeldung.',
    )
  })

  // Ueber den ganzen eingecheckten Bestand, nicht nur ueber Beispiele.
  it('haelt jeden Titel des Bestands unter 65 Zeichen', () => {
    const ordner = join(resolve(dirname(fileURLToPath(import.meta.url))), 'daten')
    const namen = readdirSync(ordner).map(
      (d) => (JSON.parse(readFileSync(join(ordner, d), 'utf8')) as Bahnhofsdaten).name,
    )
    expect(namen.length).toBeGreaterThan(300)
    for (const name of namen) expect(titelFuer(name).length, name).toBeLessThan(65)
  })
})

describe('standText', () => {
  it('nennt das Datum des Bahnhofsplans deutsch', () => {
    expect(standText('2026-10-13T18:19:12.496Z')).toBe('13.10.2026')
  })
})

describe('laengsteUmstiege', () => {
  it('nimmt die drei laengsten Paare mit Weg, laengstes zuerst', () => {
    const paare = [
      paar({ von: '1', nach: '2', sek: 100 }),
      paar({ von: '2', nach: '1', sek: 400 }),
      paar({ von: '1', nach: '3', sek: null }),
      paar({ von: '3', nach: '1', sek: 300 }),
      paar({ von: '2', nach: '3', sek: 200 }),
    ]
    expect(laengsteUmstiege(paare, 3).map((p) => `${p.von}>${p.nach}`)).toEqual(['2>1', '3>1', '2>3'])
  })

  // München Hackerbrücke hat zwei Gleise an einem Bahnsteig - „am längsten
  // dauert der Umstieg über den Bahnsteig" waere Unsinn.
  it('laesst Umstiege am gleichen Bahnsteig weg', () => {
    const paare = [paar({ von: '1', nach: '2', sek: 15, gleicherBahnsteig: true })]
    expect(laengsteUmstiege(paare, 3)).toEqual([])
  })
})

describe('gruppiereNachBuchstabe', () => {
  it('sortiert deutsch und legt Umlaute zum Grundbuchstaben', () => {
    const gruppen = gruppiereNachBuchstabe(['Öhringen', 'Aachen Hbf', 'Offenburg', 'Ulm Hbf', 'Überlingen', 'Augsburg Hbf'])
    expect(gruppen).toEqual([
      ['A', ['Aachen Hbf', 'Augsburg Hbf']],
      ['O', ['Offenburg', 'Öhringen']],
      ['U', ['Überlingen', 'Ulm Hbf']],
    ])
  })
})

/*
 * 822 von 19 894 Gleispaaren hatten keinen Weg im Bahnhofsplan (Luecken in
 * OSM, Scheingleise wie Kaiserslautern „120“). Julian, 21.10.2026: weglassen.
 */
describe('ohneLuecken', () => {
  const luecke = (von: string, nach: string, sek: number | null): Gleispaar => ({
    von, nach, gleicherBahnsteig: false, sek, wechsel: 1, anlagen: [], lage: 'unterfuehrung', stufenfreiSek: null,
  })
  const ort = { name: 'X', eva: '1', slug: 'x', lat: 0, lon: 0, stufe: 2 as const, geholtAm: '2026-10-13T00:00:00Z' }

  it('laesst Paare ohne Weg weg und Gleise, die dann nirgends mehr vorkommen', () => {
    const d = ohneLuecken({
      ...ort,
      gleise: ['1', '2', '120'],
      paare: [luecke('1', '2', 60), luecke('2', '1', 60), luecke('1', '120', null), luecke('120', '1', null), luecke('2', '120', null), luecke('120', '2', null)],
    })
    expect(d?.gleise).toEqual(['1', '2'])
    expect(d?.paare.map((p) => `${p.von}-${p.nach}`)).toEqual(['1-2', '2-1'])
  })

  it('ohne zwei verbundene Gleise keine Seite', () => {
    expect(ohneLuecken({ ...ort, gleise: ['1', '2'], paare: [luecke('1', '2', null), luecke('2', '1', null)] })).toBeNull()
  })
})
