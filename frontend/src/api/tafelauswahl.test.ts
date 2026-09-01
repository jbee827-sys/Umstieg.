import { describe, it, expect } from 'vitest'
import { gruppiereTafel, kategorieVon, FENSTER_NACH_MIN, FENSTER_VOR_MIN } from './tafelauswahl'
import type { TafelEintrag } from './typen'

function zug(name: string, zeit: string, zeitIst?: string): TafelEintrag {
  return { zug: name, zeitSoll: zeit, zeitIst, gleisSoll: '1', ziel: 'Irgendwo' }
}

const um = (hhmm: string) => new Date(`2026-09-01T${hhmm}:00`)

describe('kategorieVon', () => {
  it('erkennt den Fernverkehr an seinen Gattungen', () => {
    for (const g of ['ICE', 'IC', 'EC', 'ECE', 'IR', 'RJ', 'RJX', 'NJ', 'EN', 'TGV', 'FLX']) {
      expect(kategorieVon(`${g} 123`)).toBe('fern')
    }
  })

  it('trennt S-Bahn und U-Bahn von der Eisenbahn', () => {
    expect(kategorieVon('S 5105')).toBe('sbahn')
    expect(kategorieVon('U 5')).toBe('ubahn')
    // "S" ist nur die Gattung, nicht der Anfangsbuchstabe: STB waere keine S-Bahn.
    expect(kategorieVon('STB 12')).not.toBe('sbahn')
  })

  it('nimmt Regionalverkehr als Restklasse', () => {
    expect(kategorieVon('RE 3156')).toBe('regional')
    expect(kategorieVon('RB 22')).toBe('regional')
    // OE, NEB, ODEG ... - die Liste der Regionalbetreiber ist offen. Eine
    // Whitelist waere immer lueckenhaft; alles Uebrige ist Regionalverkehr.
    expect(kategorieVon('OE 62027')).toBe('regional')
    expect(kategorieVon('NEB 27')).toBe('regional')
  })
})

describe('gruppiereTafel: Zeitfenster', () => {
  const jetzt = um('12:00')

  it('nimmt Zuege bis fuenf Minuten vor jetzt mit', () => {
    const eintraege = [zug('RE 1', '11:54'), zug('RE 2', '11:55'), zug('RE 3', '12:00')]
    const zuege = gruppiereTafel(eintraege, jetzt).flatMap((b) => b.eintraege.map((e) => e.zug))
    expect(zuege).toEqual(['RE 2', 'RE 3'])
  })

  it('reicht 45 Minuten nach vorn, keine Minute weiter', () => {
    const eintraege = [zug('RE 1', '12:45'), zug('RE 2', '12:46')]
    const zuege = gruppiereTafel(eintraege, jetzt).flatMap((b) => b.eintraege.map((e) => e.zug))
    expect(zuege).toEqual(['RE 1'])
  })

  it('misst an der wirklichen Zeit, nicht an der geplanten', () => {
    // Ein Zug, dessen Sollzeit laengst durch ist, faehrt verspaetet noch:
    // ihn wegzulassen waere der schlimmere Fehler.
    const verspaetet = zug('ICE 554', '11:30', '12:10')
    const abgefahren = zug('ICE 555', '12:10', '11:30')
    const zuege = gruppiereTafel([verspaetet, abgefahren], jetzt).flatMap((b) =>
      b.eintraege.map((e) => e.zug),
    )
    expect(zuege).toEqual(['ICE 554'])
  })

  it('stolpert nicht ueber Mitternacht', () => {
    const kurzVorZwoelf = new Date('2026-09-01T23:50:00')
    const eintraege = [zug('RE 1', '00:20'), zug('RE 2', '23:47'), zug('RE 3', '12:00')]
    const zuege = gruppiereTafel(eintraege, kurzVorZwoelf).flatMap((b) =>
      b.eintraege.map((e) => e.zug),
    )
    // 00:20 ist 30 min voraus, 23:47 drei Minuten zurueck, 12:00 zwoelf
    // Stunden entfernt - egal in welche Richtung gerechnet.
    expect(zuege).toEqual(['RE 2', 'RE 1'])
  })

  it('haelt das Fenster als Zahlen fest, nicht als verstreute Literale', () => {
    expect(FENSTER_VOR_MIN).toBe(5)
    expect(FENSTER_NACH_MIN).toBe(45)
  })
})

describe('gruppiereTafel: Kategorien', () => {
  const jetzt = um('12:00')

  it('ordnet die Bloecke fest und sortiert in jedem nach Zeit', () => {
    const eintraege = [
      zug('S 3', '12:30'),
      zug('ICE 2', '12:20'),
      zug('RE 1', '12:25'),
      zug('S 1', '12:05'),
      zug('U 5', '12:15'),
      zug('ICE 1', '12:10'),
    ]
    const bloecke = gruppiereTafel(eintraege, jetzt)
    expect(bloecke.map((b) => b.kategorie)).toEqual(['regional', 'fern', 'sbahn', 'ubahn'])
    expect(bloecke.map((b) => b.titel)).toEqual([
      'Regionalverkehr',
      'Fernverkehr',
      'S-Bahn',
      'U-Bahn',
    ])
    expect(bloecke[1].eintraege.map((e) => e.zug)).toEqual(['ICE 1', 'ICE 2'])
    expect(bloecke[2].eintraege.map((e) => e.zug)).toEqual(['S 1', 'S 3'])
  })

  it('laesst leere Kategorien ganz weg', () => {
    const bloecke = gruppiereTafel([zug('RE 1', '12:10')], jetzt)
    expect(bloecke.map((b) => b.kategorie)).toEqual(['regional'])
  })

  it('liefert bei leerer Tafel keine Bloecke', () => {
    expect(gruppiereTafel([], jetzt)).toEqual([])
  })
})
