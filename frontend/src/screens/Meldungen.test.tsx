import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Meldungen } from './Meldungen'
import {
  ergaenze, markiereUebernommen, setzeVorschlag, type Meldung, type Vorschlag,
} from '../meldungen/modell'
import type { EingabeWerte } from '../components/Eingabe'
import type { LiveEreignis, RouteErgebnis } from '../api/typen'

const alteWerte: EingabeWerte = {
  eva: '8011160', bahnhofName: 'Berlin Hbf', gleisAn: '6', gleisAb: '14',
  wagenAn: '',
  wagenAb: '', profil: 'normal', variante: 'schnellste', abschnitt: 'mitte', abfahrtZeit: '14:36',
}
const alteRoute: RouteErgebnis = { stufe: 1, schritte: [], gehzeitSek: 300, hinweise: [] }

const STAND = '2026-09-02T12:20:00.000Z'
const uhr = (iso: string) =>
  new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })

const gleiswechsel: LiveEreignis = {
  typ: 'gleiswechsel', zug: 'ICE 1006', alt: '14', neu: '12',
  zeitstempel: '2026-09-02T12:32:10.000Z',
}
const vorschlag: Vorschlag = {
  route: { stufe: 1, schritte: [], gehzeitSek: 480, hinweise: [] },
  werte: { ...alteWerte, gleisAb: '12', abfahrtZeit: '14:32' },
  anlass: gleiswechsel,
}

/** Eine Meldung mit fertig nachgetragener Route – der Normalfall. */
function mitVorschlag(ereignis: LiveEreignis, v: Vorschlag, liste: Meldung[] = []): Meldung[] {
  const ergaenzt = ergaenze(liste, ereignis)
  return setzeVorschlag(ergaenzt, ergaenzt[0].nr, v)
}

function zeige(meldungen: Meldung[], stand: string | null = STAND, restSek: number | undefined = 240) {
  const onUebernehmen = vi.fn()
  render(
    <Meldungen
      meldungen={meldungen}
      alteRoute={alteRoute}
      alteWerte={alteWerte}
      stand={stand}
      restSek={restSek}
      onUebernehmen={onUebernehmen}
    />,
  )
  return { onUebernehmen }
}

describe('Meldungen: leerer Zustand', () => {
  it('sagt, dass es nichts gibt', () => {
    zeige([])
    expect(screen.getByText(/Aktuell keine Meldungen/)).toBeDefined()
  })

  // Grundprinzip 3 des Konzepts auf den leeren Fall angewandt: Der Zeitstempel
  // belegt, dass noch hingehoert wird, statt nur nichts zu sagen.
  it('belegt mit dem letzten Live-Kontakt, dass noch hingehoert wird', () => {
    zeige([])
    expect(screen.getByText(new RegExp(`Stand: ${uhr(STAND)} Uhr`))).toBeDefined()
  })

  it('taeuscht ohne Live-Kontakt keine Aktualitaet vor', () => {
    zeige([], null)
    expect(screen.queryByText(/Stand: /)).toBeNull()
    expect(screen.getByText(/Live-Verbindung/)).toBeDefined()
  })
})

describe('Meldungen: die neueste Aenderung', () => {
  it('stellt altes und neues Gleis gegenueber', () => {
    zeige(mitVorschlag(gleiswechsel, vorschlag))
    expect(screen.getByText(/Gl\. 14/)).toBeDefined()
    expect(screen.getByText(/Gl\. 12/)).toBeDefined()
  })

  it('streicht den alten Wert durch', () => {
    const { container } = render(
      <Meldungen
        meldungen={mitVorschlag(gleiswechsel, vorschlag)}
        alteRoute={alteRoute}
        alteWerte={alteWerte}
        stand={STAND}
        restSek={240}
        onUebernehmen={vi.fn()}
      />,
    )
    const durchgestrichen = container.querySelector('s')
    expect(durchgestrichen?.textContent).toContain('14')
  })

  it('nennt die neue Gehzeit', () => {
    zeige(mitVorschlag(gleiswechsel, vorschlag))
    expect(screen.getByText(/8 Minuten/)).toBeDefined()
  })

  it('sagt die Ampelaussage im Klartext', () => {
    // 240 s Rest gegen 480 s Gehzeit -> weniger als die Gehzeit -> Rot.
    zeige(mitVorschlag(gleiswechsel, vorschlag))
    expect(screen.getByText(/Rot/)).toBeDefined()
  })

  it('nennt die neue Abfahrt und um wie viel sie sich verschiebt', () => {
    zeige(mitVorschlag(gleiswechsel, vorschlag))
    expect(screen.getByText(/14:32/)).toBeDefined()
    expect(screen.getByText(/4 min früher/)).toBeDefined()
  })

  it('uebernimmt NUR auf Knopfdruck', async () => {
    const { onUebernehmen } = zeige(mitVorschlag(gleiswechsel, vorschlag))
    expect(onUebernehmen).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: /Route übernehmen/ }))
    expect(onUebernehmen).toHaveBeenCalledWith(
      expect.objectContaining({ nr: 1, vorschlag, uebernommen: false }),
    )
  })

  // Der Knopf verschwindet, die Entscheidung nicht: Wer nicht uebernehmen
  // will, verlaesst die Seite - das ist dann das Behalten.
  it('bietet keinen Behalten-Knopf mehr an', () => {
    zeige(mitVorschlag(gleiswechsel, vorschlag))
    expect(screen.queryByRole('button', { name: /behalten/i })).toBeNull()
  })

  // Ohne nachgerechnete Route bleibt die Meldung eine Meldung. Sie zu
  // uebernehmen gaebe es nichts - und ein Knopf, der nichts tut, waere
  // schlimmer als keiner.
  it('zeigt eine Aenderung auch ohne nachgerechnete Route, dann aber ohne Knopf', () => {
    zeige(ergaenze([], gleiswechsel))
    expect(screen.getByText(/Gleiswechsel/)).toBeDefined()
    expect(screen.queryByRole('button', { name: /Route übernehmen/ })).toBeNull()
    expect(screen.getByText(/lässt sich gerade nicht/)).toBeDefined()
  })

  // Nach dem Uebernehmen ist die Route dieser Meldung die aktive. Der Knopf
  // taete dann nichts mehr.
  it('ersetzt den Knopf nach dem Uebernehmen durch die Feststellung', () => {
    const liste = mitVorschlag(gleiswechsel, vorschlag)
    zeige(markiereUebernommen(liste, liste[0].nr))
    expect(screen.queryByRole('button', { name: /Route übernehmen/ })).toBeNull()
    expect(screen.getByText(/übernommen/i)).toBeDefined()
  })

  it('nennt eine Zeitaenderung beim Namen statt sie Gleiswechsel zu heissen', () => {
    const verspaetung: LiveEreignis = {
      typ: 'verspaetung', zug: 'ICE 1006', alt: '14:36', neu: '14:44',
      zeitstempel: '2026-09-02T12:35:00.000Z',
    }
    zeige(mitVorschlag(verspaetung, {
      route: alteRoute,
      werte: { ...alteWerte, abfahrtZeit: '14:44' },
      anlass: verspaetung,
    }))
    expect(screen.getByText('Neue Abfahrtszeit')).toBeDefined()
  })
})

describe('Meldungen: der Verlauf', () => {
  const zweite: LiveEreignis = {
    typ: 'gleiswechsel', zug: 'ICE 599', alt: '12', neu: '9',
    zeitstempel: '2026-09-02T12:40:00.000Z',
  }

  function zwei(): Meldung[] {
    return mitVorschlag(zweite, { ...vorschlag, werte: { ...alteWerte, gleisAb: '9' } },
      mitVorschlag(gleiswechsel, vorschlag))
  }

  it('fuehrt aeltere Meldungen als Zeile mit Uhrzeit, Zug und alt zu neu', () => {
    zeige(zwei())
    const zeile = screen.getByRole('listitem')
    expect(zeile.textContent).toContain(uhr(gleiswechsel.zeitstempel))
    expect(zeile.textContent).toContain('ICE 1006')
    expect(zeile.textContent).toContain('14')
    expect(zeile.textContent).toContain('12')
  })

  // Eine aeltere Meldung zu uebernehmen hiesse, auf ueberholte Daten
  // zurueckzugehen.
  it('laesst nur die neueste uebernehmen', () => {
    zeige(zwei())
    expect(screen.getAllByRole('button', { name: /Route übernehmen/ })).toHaveLength(1)
  })

  it('zeigt ohne aeltere Meldungen keinen Verlauf', () => {
    zeige(mitVorschlag(gleiswechsel, vorschlag))
    expect(screen.queryByRole('listitem')).toBeNull()
  })
})

describe('Meldungen: Haltestellenpfad (Umstieg 2.0)', () => {
  const ausfall: LiveEreignis = { typ: 'ausfall', zug: 'trip-7f3a', anzeige: 'Bus 245', zeitstempel: '2026-10-18T12:32:10.000Z' }
  it('ein Ausfall stellt nichts gegenueber und verspricht keine neue Route', () => {
    zeige(ergaenze([], ausfall))
    expect(screen.getByText('Fahrt fällt aus')).toBeDefined()
    expect(screen.queryByText('Gehzeit offen')).toBeNull()
    expect(screen.queryByText(/lässt sich gerade nicht berechnen/)).toBeNull()
  })
  it('der Verlauf nennt die Linie, nicht die Fahrt-ID', () => {
    const liste = ergaenze(ergaenze([], { ...ausfall, typ: 'verspaetung', alt: '10:20', neu: '10:24' }), ausfall)
    zeige(liste)
    expect(screen.getByText('Bus 245', { selector: '.meldungen-zug' })).toBeDefined()
    expect(screen.queryByText('trip-7f3a')).toBeNull()
  })
})

describe('Meldungen: Ankunft und Halt (Review Paket 3)', () => {
  it('eine verspaetete Ankunft verschiebt die Ankunft, nicht die Abfahrt', () => {
    const ereignis: LiveEreignis = { typ: 'verspaetung', zug: 'RE 3', seite: 'an', alt: '14:30', neu: '14:38', zeitstempel: STAND }
    render(
      <Meldungen
        meldungen={mitVorschlag(ereignis, { route: alteRoute, werte: { ...alteWerte, ankunftZeit: '14:38' }, anlass: ereignis })}
        alteRoute={alteRoute}
        alteWerte={{ ...alteWerte, ankunftZeit: '14:30' }}
        stand={STAND}
        restSek={240}
        onUebernehmen={vi.fn()}
      />,
    )
    expect(screen.getByText('14:38 · 8 min später')).toBeDefined()
    expect(screen.getByText('14:36', { selector: 'dd' })).toBeDefined()
    expect(screen.getByText('Ankunft')).toBeDefined()
  })
  it('ein S-Bahn-Gleis an einer Haltestelle heisst Gl., nicht Steig', () => {
    const ereignis: LiveEreignis = { typ: 'gleiswechsel', zug: 't', anzeige: 'S5', haltWort: 'Gleis', alt: '2', neu: '3', zeitstempel: STAND }
    zeige(ergaenze([], ereignis))
    expect(screen.getByText('Gl. 3')).toBeDefined()
  })
})
