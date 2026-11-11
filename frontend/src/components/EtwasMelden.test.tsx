import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EtwasMelden } from './EtwasMelden'
import { sendeMeldung } from '../api/meldung'

vi.mock('../api/meldung', () => ({ sendeMeldung: vi.fn() }))
const sendeMock = vi.mocked(sendeMeldung)

beforeEach(() => sendeMock.mockReset())

const nachricht = () => screen.getByLabelText('Deine Nachricht') as HTMLTextAreaElement
const adresse = () => screen.getByLabelText(/E-Mail-Adresse/) as HTMLInputElement
const senden = () => screen.getByRole('button', { name: /Senden|Wird gesendet/ }) as HTMLButtonElement

describe('EtwasMelden', () => {
  it('sperrt Senden bei leerem Text und sagt „Schreib ein paar Worte."', () => {
    render(<EtwasMelden onSchliessen={() => {}} />)
    screen.getByRole('dialog', { name: 'Etwas melden' })
    screen.getByText('Schreib ein paar Worte.')
    expect(senden().disabled).toBe(true)
  })

  it('zaehlt Leerzeichen nicht: „a b c d" bleibt zu kurz', async () => {
    render(<EtwasMelden onSchliessen={() => {}} />)
    await userEvent.type(nachricht(), 'a b c d')
    screen.getByText('Dein Text ist zu kurz.')
    expect(nachricht().getAttribute('aria-invalid')).toBe('true')
    expect(senden().disabled).toBe(true)
  })

  it('gibt Senden ab 5 Zeichen frei und zeigt den Zaehler', async () => {
    render(<EtwasMelden onSchliessen={() => {}} />)
    await userEvent.type(nachricht(), 'abcde')
    expect(senden().disabled).toBe(false)
    screen.getByText('5 / 2000')
    expect(screen.queryByText('Dein Text ist zu kurz.')).toBeNull()
    expect(nachricht().getAttribute('maxLength')).toBe('2000')
  })

  it('zeigt die Adresswarnung erst nach Verlassen des Felds und sperrt Senden', async () => {
    render(<EtwasMelden onSchliessen={() => {}} />)
    await userEvent.type(nachricht(), 'Gleis 6 fehlt.')
    await userEvent.type(adresse(), 'anna@beispiel')
    expect(screen.queryByText('Diese E-Mail-Adresse sieht unvollständig aus.')).toBeNull()
    await userEvent.tab()
    screen.getByText('Diese E-Mail-Adresse sieht unvollständig aus.')
    expect(senden().disabled).toBe(true)
  })

  it('sendet genau einmal, auch bei Doppelklick (Review Focus 4)', async () => {
    let fertig: (ok: boolean) => void = () => {}
    sendeMock.mockReturnValue(new Promise<boolean>((r) => (fertig = r)))
    render(<EtwasMelden onSchliessen={() => {}} />)
    await userEvent.type(nachricht(), 'Gleis 6 fehlt.')
    await userEvent.dblClick(senden())
    expect(sendeMock).toHaveBeenCalledTimes(1)
    expect(sendeMock).toHaveBeenCalledWith('Gleis 6 fehlt.', '')
    expect(senden().textContent).toBe('Wird gesendet …')
    fertig(true)
    await screen.findByRole('heading', { name: 'Danke!' })
  })

  it('zeigt nach Erfolg „Danke!" und „Deine Meldung ist angekommen."', async () => {
    sendeMock.mockResolvedValue(true)
    render(<EtwasMelden onSchliessen={() => {}} />)
    await userEvent.type(nachricht(), 'Gleis 6 fehlt.')
    await userEvent.type(adresse(), 'anna@beispiel.de')
    await userEvent.click(senden())
    await screen.findByRole('heading', { name: 'Danke!' })
    screen.getByText('Deine Meldung ist angekommen.')
    expect(screen.queryByText(/Antwort/)).toBeNull()
    screen.getByRole('button', { name: 'Schließen' })
  })

  it('behaelt Text und Adresse nach einem Fehlschlag (Review Focus 3)', async () => {
    sendeMock.mockResolvedValue(false)
    render(<EtwasMelden onSchliessen={() => {}} />)
    await userEvent.type(nachricht(), 'Gleis 6 fehlt.')
    await userEvent.type(adresse(), 'anna@beispiel.de')
    await userEvent.click(senden())
    await screen.findByText('Das hat nicht geklappt. Prüf deine Verbindung und versuch es noch einmal.')
    expect(nachricht().value).toBe('Gleis 6 fehlt.')
    expect(adresse().value).toBe('anna@beispiel.de')
    expect(senden().disabled).toBe(false)
  })

  it('schliesst mit Escape und mit Abbrechen', async () => {
    const zu = vi.fn()
    render(<EtwasMelden onSchliessen={zu} />)
    await userEvent.keyboard('{Escape}')
    await userEvent.click(screen.getByRole('button', { name: 'Abbrechen' }))
    expect(zu).toHaveBeenCalledTimes(2)
  })

  it('verlinkt den Datenschutz', () => {
    render(<EtwasMelden onSchliessen={() => {}} />)
    expect(screen.getByRole('link', { name: 'Datenschutz' }).getAttribute('href')).toBe('/datenschutz')
  })
})
