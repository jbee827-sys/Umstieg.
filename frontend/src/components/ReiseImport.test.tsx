import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReiseImport } from './ReiseImport'
import type { Umstieg } from '../reise/reisetext'

const MIT_VIER_UMSTIEGEN = `Waldstraße/Friedhof, Hockenheim → Eberswalde Hbf
15.08.2026

Bus 731
Nach Hockenheim, Bahnhof
Ab 9:46 Waldstraße/Friedhof, Hockenheim
An 9:57 Bahnhof, Hockenheim

S6
Nach Worms Hbf
Ab 10:17 Hockenheim, Gleis 1
An 10:40 Mannheim Hbf, Gleis 12

ICE 74
Nach Hamburg Hbf
Ab 11:03 Mannheim Hbf, Gleis 2
An 11:40 Frankfurt(Main)Hbf, Gleis 8

ICE 1134
Nach Berlin Hbf
Ab 12:02 Frankfurt(Main)Hbf, Gleis 7
An 16:01 Berlin Hbf, Gleis 3

RE3 (3352)
Nach Schwedt(Oder)
Ab 16:23 Berlin Hbf, Gleis 6
An 17:02 Eberswalde Hbf, Gleis 3`

const MIT_EINEM_UMSTIEG = `Mannheim Hbf → Berlin Hbf
15.08.2026

ICE 74
Nach Hamburg Hbf
Ab 11:03 Mannheim Hbf, Gleis 2
An 11:40 Frankfurt(Main)Hbf, Gleis 8

ICE 1134
Nach Berlin Hbf
Ab 12:02 Frankfurt(Main)Hbf, Gleis 7
An 16:01 Berlin Hbf, Gleis 3`

function zeige(überschreibungen: Partial<Parameters<typeof ReiseImport>[0]> = {}) {
  const onSchliessen = vi.fn()
  const onUebernehmen = vi.fn<(u: Umstieg, datum: string) => void>()
  render(
    <ReiseImport onSchliessen={onSchliessen} onUebernehmen={onUebernehmen} {...überschreibungen} />,
  )
  return { onSchliessen, onUebernehmen }
}

const feld = () => screen.getByRole('textbox', { name: /text/i })

describe('ReiseImport', () => {
  it('zeigt die Anleitung in der Reihenfolge der Bedienschritte', () => {
    zeige()
    const text = document.body.textContent ?? ''
    expect(text).toMatch(/Verbindung teilen/)
    expect(text).toMatch(/Text kopieren/)
    expect(text).toMatch(/einfügen/i)
  })

  it('ist ein Dialog, kein Seitenwechsel', () => {
    zeige()
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  /**
   * NICHTS wird von selbst uebernommen - auch nicht bei genau einem Umstieg.
   *
   * Anfangs schloss das Fenster hier sofort und fuellte die Felder. Das war
   * falsch: Gelesen werden fremde, undokumentierte Formate, und ein falsch
   * erkanntes Gleis, das ungefragt im Formular landet, faellt niemandem auf -
   * bis man am falschen Ende des Bahnsteigs steht.
   */
  it('uebernimmt nichts ungefragt - auch nicht bei genau einem Umstieg', async () => {
    const { onSchliessen, onUebernehmen } = zeige()
    await userEvent.click(feld())
    await userEvent.paste(MIT_EINEM_UMSTIEG)

    expect(onUebernehmen).not.toHaveBeenCalled()
    expect(onSchliessen).not.toHaveBeenCalled()
    // Stattdessen liegt das Erkannte zur Bestaetigung vor.
    expect(document.body.textContent).toMatch(/Stimmt das\?/)
  })

  it('übernimmt den einen Umstieg nach Bestaetigung', async () => {
    const { onSchliessen, onUebernehmen } = zeige()
    await userEvent.click(feld())
    await userEvent.paste(MIT_EINEM_UMSTIEG)
    await userEvent.click(screen.getByRole('button', { name: /Frankfurt\(Main\)Hbf/ }))

    // Auswahl allein uebernimmt noch nichts - erst der zweite Knopf.
    expect(onUebernehmen).not.toHaveBeenCalled()
    expect(document.body.textContent).toMatch(/Das wird übernommen/)
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    expect(onUebernehmen).toHaveBeenCalledOnce()
    const [umstieg, datum] = onUebernehmen.mock.calls[0]
    expect(umstieg).toMatchObject({
      bahnhof: 'Frankfurt(Main)Hbf',
      anGleis: '8',
      abGleis: '7',
    })
    expect(datum).toBe('15.08.2026')
    expect(onSchliessen).toHaveBeenCalledOnce()
  })

  it('legt bei mehreren Umstiegen erst die Auswahl vor', async () => {
    const { onUebernehmen, onSchliessen } = zeige()
    await userEvent.click(feld())
    await userEvent.paste(MIT_VIER_UMSTIEGEN)

    expect(onUebernehmen).not.toHaveBeenCalled()
    expect(onSchliessen).not.toHaveBeenCalled()
    expect(screen.getByText(/Mannheim Hbf/)).toBeTruthy()
    expect(screen.getByText(/Frankfurt\(Main\)Hbf/)).toBeTruthy()
    expect(screen.getByText(/Berlin Hbf/)).toBeTruthy()
  })

  it('übernimmt den angetippten Umstieg und schliesst', async () => {
    const { onUebernehmen, onSchliessen } = zeige()
    await userEvent.click(feld())
    await userEvent.paste(MIT_VIER_UMSTIEGEN)
    await userEvent.click(screen.getByRole('button', { name: /Frankfurt\(Main\)Hbf/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen' }))

    expect(onUebernehmen).toHaveBeenCalledOnce()
    expect(onUebernehmen.mock.calls[0][0]).toMatchObject({
      bahnhof: 'Frankfurt(Main)Hbf',
      anZug: 'ICE 74',
      abZug: 'ICE 1134',
    })
    expect(onSchliessen).toHaveBeenCalledOnce()
  })

  // Ein Umstieg ohne Ankunftsgleis (Bushaltestelle) darf erscheinen, muss
  // aber als unvollstaendig kenntlich sein - sonst laeuft jemand zu einem
  // Gleis, das die App gar nicht kennt.
  it('kennzeichnet einen Umstieg ohne bekanntes Gleis', async () => {
    zeige()
    await userEvent.click(feld())
    await userEvent.paste(MIT_VIER_UMSTIEGEN)
    expect(document.body.textContent).toMatch(/Gleis unbekannt/i)
  })

  // Nicht die App wird benannt, sondern was gefunden wurde. Fehlt irgendwo
  // ein Gleis, steht es hier - dann lohnt ein Blick, bevor man losläuft.
  it('nennt, was erkannt wurde - samt fehlender Gleise', async () => {
    zeige()
    await userEvent.click(feld())
    await userEvent.paste(MIT_VIER_UMSTIEGEN)
    expect(document.body.textContent).toMatch(/5 Abschnitte erkannt/)
    expect(document.body.textContent).toMatch(/nicht überall ein Gleis/)
  })

  it('meldet vollständige Gleise, wenn alle dastehen', async () => {
    zeige()
    await userEvent.click(feld())
    await userEvent.paste(
      [
        'RE1',
        'ab 10:15 Berlin Hbf (Gleis 12)',
        'an 10:25 Berlin Ostbahnhof (Gleis 3)',
        '',
        'S7',
        'ab 10:31 Berlin Ostbahnhof (Gleis 8)',
        'an 10:40 Berlin Alexanderplatz (Gleis 1)',
        '',
        'U2',
        'ab 10:45 Berlin Alexanderplatz (Gleis 2)',
        'an 10:52 Senefelderplatz (Gleis 1)',
      ].join('\n'),
    )
    expect(document.body.textContent).toMatch(/3 Abschnitte erkannt/)
    expect(document.body.textContent).toMatch(/Gleise vollständig/)
    expect(screen.getByRole('button', { name: /Berlin Ostbahnhof/ })).toBeTruthy()
  })

  /**
   * Echter VBB-Text vom 03.09.2026 - eine Direktverbindung ohne Umstieg.
   *
   * Das ist kein Fehlschlag und darf nicht so aussehen. Wer hier nur „nichts
   * zu berechnen" liest, haelt die Erkennung fuer kaputt und probiert es
   * dreimal. Also steht da, WAS gelesen wurde.
   */
  it('sagt bei einer Direktverbindung, was erkannt wurde', async () => {
    const { onUebernehmen } = zeige()
    await userEvent.click(feld())
    await userEvent.paste(
      [
        'Ich habe diese Verbindung in VBB gefunden:',
        '',
        '22:34 - Fußweg nach Eberswalde, Hauptbahnhof, Dauer 19 Min.',
        '',
        '22:53 - Abfahrt Eberswalde, Hauptbahnhof, Gleis 4',
        '      mit RE3 Richtung Jüterbog, Bahnhof',
        '23:33 - Ankunft S+U Berlin Hauptbahnhof [Gleis 1-8], Gleis 4',
        '',
        '-----',
        'Gesamtdauer: 59 Min.',
      ].join('\n'),
    )

    const text = document.body.textContent ?? ''
    expect(text).toMatch(/Erkannt: RE3/)
    expect(text).toMatch(/Eberswalde, Hauptbahnhof/)
    expect(text).not.toMatch(/nicht erkannt/i)
    expect(onUebernehmen).not.toHaveBeenCalled()
  })

  it('sagt es, wenn der Text nicht erkannt wird - und übernimmt nichts', async () => {
    const { onUebernehmen, onSchliessen } = zeige()
    await userEvent.click(feld())
    await userEvent.paste('Hallo, das ist keine Reiseverbindung.')

    expect(document.body.textContent).toMatch(/nicht erkannt|nicht lesen/i)
    expect(onUebernehmen).not.toHaveBeenCalled()
    expect(onSchliessen).not.toHaveBeenCalled()
  })

  it('bleibt still, solange nichts eingefügt wurde', () => {
    zeige()
    expect(document.body.textContent).not.toMatch(/nicht erkannt/i)
  })

  it('schliesst auf Escape', async () => {
    const { onSchliessen } = zeige()
    await userEvent.keyboard('{Escape}')
    expect(onSchliessen).toHaveBeenCalledOnce()
  })

  it('schliesst ueber den Abbrechen-Knopf', async () => {
    const { onSchliessen } = zeige()
    await userEvent.click(screen.getByRole('button', { name: /abbrechen|schliessen|schließen/i }))
    expect(onSchliessen).toHaveBeenCalledOnce()
  })

  /**
   * Gemessen am 03.09.2026 gegen die echte Timetables-API: `/plan` kennt nur
   * ein rollierendes Fenster von unter 24 Stunden (15 h voraus: 200 mit
   * Daten; 23 h voraus: 404). Eine Reise in drei Wochen laesst sich also
   * eintragen, aber nicht verfolgen - und das muss dastehen, statt einen
   * leeren Live-Strom zu zeigen.
   */
  it('weist darauf hin, wenn die Reise noch nicht live verfolgbar ist', async () => {
    zeige({ jetzt: new Date('2026-08-01T10:00:00') })
    await userEvent.click(feld())
    await userEvent.paste(MIT_VIER_UMSTIEGEN)
    expect(document.body.textContent).toMatch(/Reisetag/i)
  })

  it('weist nicht darauf hin, wenn die Reise heute stattfindet', async () => {
    zeige({ jetzt: new Date('2026-08-15T08:00:00') })
    await userEvent.click(feld())
    await userEvent.paste(MIT_VIER_UMSTIEGEN)
    expect(document.body.textContent).not.toMatch(/Reisetag/i)
  })
})
