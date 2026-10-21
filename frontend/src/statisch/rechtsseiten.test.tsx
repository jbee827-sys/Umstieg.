import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { rechtsseiteHtml } from './rechtsseiten'

const vorlage = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8')
const lies = (html: string) => new DOMParser().parseFromString(html, 'text/html')

/**
 * Impressum und Datenschutz als fertiges HTML (Konzept Nutzergewinnung,
 * AP 3.4): lesbar ohne JavaScript, mit eigenem Titel und eigener
 * kanonischer Adresse. Der Text kommt aus denselben Komponenten wie in der
 * App - es gibt nur eine Quelle.
 */
describe('rechtsseiteHtml', () => {
  it('traegt das Impressum mit eigenem Titel und eigener Adresse', () => {
    const doc = lies(rechtsseiteHtml(vorlage, 'impressum'))
    expect(doc.title).toBe('Impressum | Umstieg.')
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://www.umstieg.online/impressum')
    expect(doc.querySelector('#root h1')?.textContent).toBe('Impressum')
    expect(doc.getElementById('root')?.textContent).toMatch(/Angaben gemäß § 5 DDG/)
  })

  it('traegt die Datenschutzerklaerung ebenso', () => {
    const doc = lies(rechtsseiteHtml(vorlage, 'datenschutz'))
    expect(doc.title).toBe('Datenschutz | Umstieg.')
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://www.umstieg.online/datenschutz')
    expect(doc.getElementById('root')?.textContent).toMatch(/Reichweitenmessung/)
  })

  // Ohne JavaScript kann ein Knopf nichts tun - die Seite fuehrt per Link zurueck.
  it('fuehrt ohne JavaScript per Link zur Startseite', () => {
    const doc = lies(rechtsseiteHtml(vorlage, 'impressum'))
    expect(doc.querySelector('#root a[href="/"]')).not.toBeNull()
    expect(doc.querySelector('#root button')).toBeNull()
  })

  // CSP: style-src 'self'.
  it('kommt ohne Inline-Stile aus', () => {
    expect(rechtsseiteHtml(vorlage, 'datenschutz')).not.toMatch(/\sstyle=/)
  })
})

/**
 * Die Annahme, auf der Vortext und vorgerenderte Seiten ruhen: Beim Start
 * ersetzt `createRoot().render()` den Inhalt des Wurzelelements vollstaendig.
 * Bliebe etwas stehen, saehe man den Vortext unter der App.
 */
describe('createRoot ersetzt den vorgerenderten Inhalt', () => {
  it('raeumt Vortext und Markierungen ab', () => {
    const doc = lies(vorlage)
    const wurzel = document.createElement('div')
    wurzel.innerHTML = doc.getElementById('root')!.innerHTML
    expect(wurzel.textContent).toMatch(/Gleis/)
    const root = createRoot(wurzel)
    act(() => root.render(<p>App</p>))
    expect(wurzel.innerHTML).toBe('<p>App</p>')
    act(() => root.unmount())
  })
})
