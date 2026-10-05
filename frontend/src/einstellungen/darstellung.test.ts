import { afterEach, describe, expect, it, vi } from 'vitest'
import { ladeDarstellung, waehleDarstellung, wendeDarstellungAn } from './darstellung'

const SCHLUESSEL = 'umstieg.darstellung'

afterEach(() => {
  // Zuerst die Attrappe weg - sonst wirft schon das Aufraeumen.
  vi.restoreAllMocks()
  localStorage.clear()
  delete document.documentElement.dataset.darstellung
})

describe('Darstellung: System, Hell oder Dunkel', () => {
  it('folgt ohne eigene Wahl dem System', () => {
    expect(ladeDarstellung()).toBe('system')
  })

  it('merkt sich Hell und Dunkel im Geraet', () => {
    waehleDarstellung('dunkel')
    expect(localStorage.getItem(SCHLUESSEL)).toBe('dunkel')
    expect(ladeDarstellung()).toBe('dunkel')
    waehleDarstellung('hell')
    expect(ladeDarstellung()).toBe('hell')
  })

  // Die Datenschutzerklaerung sagt: Gespeichert wird nur, wer ausdruecklich
  // Hell oder Dunkel waehlt. Zurueck auf System heisst: nichts mehr im Geraet.
  it('loescht den Eintrag, wenn wieder System gewaehlt wird', () => {
    waehleDarstellung('dunkel')
    waehleDarstellung('system')
    expect(localStorage.getItem(SCHLUESSEL)).toBeNull()
  })

  it('schreibt nichts, solange niemand waehlt', () => {
    const setzen = vi.spyOn(Storage.prototype, 'setItem')
    ladeDarstellung()
    wendeDarstellungAn(ladeDarstellung())
    expect(setzen).not.toHaveBeenCalled()
  })

  it('setzt das Attribut an der Wurzel - und nimmt es fuer System wieder weg', () => {
    wendeDarstellungAn('dunkel')
    expect(document.documentElement.dataset.darstellung).toBe('dunkel')
    wendeDarstellungAn('system')
    expect(document.documentElement.dataset.darstellung).toBeUndefined()
  })

  it('ignoriert einen fremden Wert im Speicher', () => {
    localStorage.setItem(SCHLUESSEL, 'lila')
    expect(ladeDarstellung()).toBe('system')
  })

  // Safari im privaten Modus und blockierte Site-Daten: Schon der Zugriff
  // wirft. Dann gibt es eben kein Gedaechtnis - die Wahl gilt trotzdem.
  it('laeuft ohne Speicher weiter', () => {
    vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(ladeDarstellung()).toBe('system')
    expect(() => waehleDarstellung('dunkel')).not.toThrow()
    expect(document.documentElement.dataset.darstellung).toBe('dunkel')
  })
})
