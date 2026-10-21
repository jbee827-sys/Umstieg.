import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { setzeKopf, setzeWurzel } from './kopf'

/** Dieselbe Vorlage, aus der der Build die Seiten erzeugt. */
const vorlage = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../index.html'), 'utf8')
const lies = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const meta = (doc: Document, sel: string) => doc.querySelector(sel)?.getAttribute('content') ?? null

describe('setzeKopf', () => {
  const doc = lies(
    setzeKopf(vorlage, {
      titel: 'Umsteigen in Hannover Hbf: Gehzeit von Gleis zu Gleis',
      beschreibung: 'Wie lange dauert der Umstieg in Hannover Hbf?',
      pfad: '/bahnhof/hannover-hbf',
    }),
  )

  it('setzt Titel, Beschreibung und die eigene kanonische Adresse', () => {
    expect(doc.title).toBe('Umsteigen in Hannover Hbf: Gehzeit von Gleis zu Gleis')
    expect(meta(doc, 'meta[name="description"]')).toBe('Wie lange dauert der Umstieg in Hannover Hbf?')
    expect(doc.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://www.umstieg.online/bahnhof/hannover-hbf',
    )
  })

  it('gibt geteilten Links dieselben Angaben', () => {
    expect(meta(doc, 'meta[property="og:url"]')).toBe('https://www.umstieg.online/bahnhof/hannover-hbf')
    expect(meta(doc, 'meta[property="og:title"]')).toBe(doc.title)
    expect(meta(doc, 'meta[name="twitter:title"]')).toBe(doc.title)
    expect(meta(doc, 'meta[property="og:description"]')).toBe('Wie lange dauert der Umstieg in Hannover Hbf?')
    expect(meta(doc, 'meta[name="twitter:description"]')).toBe('Wie lange dauert der Umstieg in Hannover Hbf?')
  })

  // Der Block beschreibt die App unter `/` - auf einer Unterseite waere er
  // eine zweite, falsche Aussage ueber dieselbe Adresse.
  it('nimmt den JSON-LD-Block der Startseite heraus', () => {
    expect(doc.querySelector('script[type="application/ld+json"]')).toBeNull()
  })

  it('laesst die Beschreibung weg, wenn die Seite keine eigene hat', () => {
    const ohne = lies(setzeKopf(vorlage, { titel: 'Impressum | Umstieg.', pfad: '/impressum' }))
    expect(ohne.querySelector('meta[name="description"]')).toBeNull()
    expect(ohne.querySelector('meta[property="og:description"]')).toBeNull()
    expect(ohne.querySelector('meta[name="twitter:description"]')).toBeNull()
  })

  it('maskiert Sonderzeichen', () => {
    const html = setzeKopf(vorlage, { titel: 'A & B <C>', beschreibung: 'Sag "ja"', pfad: '/x' })
    expect(html).toContain('<title>A &amp; B &lt;C&gt;</title>')
    expect(lies(html).title).toBe('A & B <C>')
    expect(meta(lies(html), 'meta[name="description"]')).toBe('Sag "ja"')
  })

  // Aendert jemand index.html so, dass ein Tag nicht mehr gefunden wird, soll
  // der Build scheitern - nicht still eine Seite mit falschem Titel ausliefern.
  it('scheitert laut, wenn die Vorlage nicht passt', () => {
    expect(() => setzeKopf('<html><head></head></html>', { titel: 'X', pfad: '/x' })).toThrow()
  })
})

describe('setzeWurzel', () => {
  it('ersetzt den Vortext durch den vorgerenderten Inhalt', () => {
    const doc = lies(setzeWurzel(vorlage, '<main class="app"><h1>Impressum</h1></main>'))
    const wurzel = doc.getElementById('root')!
    expect(wurzel.querySelector('h1')?.textContent).toBe('Impressum')
    expect(wurzel.querySelector('.vortext')).toBeNull()
  })

  it('laesst das Skript der App stehen', () => {
    const html = setzeWurzel(vorlage, '<p>x</p>')
    expect(html).toContain('<script type="module"')
  })
})
